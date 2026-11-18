/**
 * worker.js - Dedicated Web Worker for RouteEvolve GA Engine
 * 
 * Runs the Genetic Algorithm off the main UI thread so that Leaflet maps,
 * animations, and user interactions remain at a rock-solid 60 FPS even with
 * 60 cities and 500 individuals.
 */

import { computeDistanceMatrix } from './geo.js';
import { solveNearestNeighbour, polish2Opt } from './baseline.js';
import {
  createRNG,
  initializePopulation,
  evolveOneGeneration,
  computePopulationStats
} from './ga.js';

let state = {
  cities: [],
  isOffline: false,
  depot: 0,
  distanceMatrix: null,
  options: {},
  population: [],
  generation: 0,
  bestEver: null,
  bestEverGen: 0,
  gen0BestDist: 0,
  nnResult: null,
  rng: Math.random,
  isRunning: false,
  isPaused: false,
  timerId: null,
  speedDelayMs: 20, // delay between iterations
  gensPerBatch: 1,  // for turbo speeds
  stagnationCounter: 0,
  startTime: 0,
  totalElapsedMs: 0
};

self.onmessage = function (e) {
  const { type, payload } = e.data;

  switch (type) {
    case 'INIT':
      handleInit(payload);
      break;
    case 'START':
      handleStart();
      break;
    case 'PAUSE':
      handlePause();
      break;
    case 'RESUME':
      handleResume();
      break;
    case 'STEP':
      handleStep();
      break;
    case 'RESET':
      handleReset();
      break;
    case 'SET_SPEED':
      handleSetSpeed(payload);
      break;
    case 'EXPLAIN_STEP':
      handleExplainStep();
      break;
    case 'COMPARE_CROSSOVERS':
      handleCompareCrossovers(payload);
      break;
    case 'RUN_10_TIMES':
      handleRun10Times(payload);
      break;
    case 'POLISH_2OPT':
      handlePolish2Opt();
      break;
    default:
      console.warn('[GA Worker] Unknown message type:', type);
  }
};

function handleInit(payload) {
  stopLoop();

  const { cities, isOffline = false, depot = 0, options = {} } = payload;
  state.cities = cities;
  state.isOffline = isOffline;
  state.depot = depot;
  state.options = {
    popSize: options.popSize || 100,
    elitismCount: options.elitismCount !== undefined ? options.elitismCount : 2,
    crossoverRate: options.crossoverRate !== undefined ? options.crossoverRate : 0.85,
    mutationRate: options.mutationRate !== undefined ? options.mutationRate : 0.15,
    selectionMethod: options.selectionMethod || 'tournament',
    crossoverMethod: options.crossoverMethod || 'ox',
    mutationMethod: options.mutationMethod || 'swap',
    tournamentSize: options.tournamentSize || 5,
    maxGenerations: options.maxGenerations || 500,
    stagnationLimit: options.stagnationLimit || 150,
    seedWithNN: !!options.seedWithNN,
    seed: options.seed
  };

  // Setup PRNG
  state.rng = createRNG(state.options.seed);

  // Precompute Distance Matrix
  state.distanceMatrix = computeDistanceMatrix(cities, isOffline);

  // Solve Nearest Neighbour Baseline
  state.nnResult = solveNearestNeighbour(cities.length, state.distanceMatrix, depot);

  // Initialize GA Population
  state.population = initializePopulation(
    state.options.popSize,
    cities.length,
    state.distanceMatrix,
    depot,
    state.options.seedWithNN,
    state.rng
  );

  state.generation = 0;
  state.stagnationCounter = 0;
  state.totalElapsedMs = 0;

  const initStats = computePopulationStats(state.population);
  state.bestEver = { ...initStats.best, genes: [...initStats.best.genes] };
  state.bestEverGen = 0;
  state.gen0BestDist = state.bestEver.distance;

  // Extract top 5 unique routes for population preview
  const topRoutes = extractTopRoutes(state.population, 5);

  self.postMessage({
    type: 'INITIALIZED',
    payload: {
      generation: 0,
      bestDistance: state.bestEver.distance,
      bestRoute: state.bestEver.genes,
      avgDistance: initStats.avgDistance,
      diversityRatio: initStats.diversityRatio,
      gen0BestDist: state.gen0BestDist,
      nnDistance: state.nnResult.distance,
      nnRoute: state.nnResult.route,
      nnExecutionTimeMs: state.nnResult.executionTimeMs,
      topRoutes
    }
  });
}

function handleStart() {
  if (state.isRunning) return;
  state.isRunning = true;
  state.isPaused = false;
  state.startTime = performance.now();
  runLoop();
}

function handlePause() {
  if (!state.isRunning) return;
  state.isPaused = true;
  state.isRunning = false;
  stopLoop();
  self.postMessage({ type: 'PAUSED', payload: { generation: state.generation } });
}

function handleResume() {
  if (state.isRunning) return;
  state.isRunning = true;
  state.isPaused = false;
  state.startTime = performance.now();
  runLoop();
}

function handleReset() {
  stopLoop();
  state.isRunning = false;
  state.isPaused = false;
  state.generation = 0;
  state.stagnationCounter = 0;
  state.population = [];
  state.bestEver = null;
}

function handleSetSpeed(payload) {
  // payload: speed (1 to 100)
  const speed = Math.max(1, Math.min(100, payload.speed || 50));
  if (speed <= 20) {
    // Slower: larger delay
    state.speedDelayMs = Math.round(250 - speed * 10);
    state.gensPerBatch = 1;
  } else if (speed <= 70) {
    // Moderate: 10 - 50ms delay
    state.speedDelayMs = Math.max(5, Math.round(50 - (speed - 20) * 0.8));
    state.gensPerBatch = 1;
  } else {
    // Turbo: 0ms delay, multiple generations per tick
    state.speedDelayMs = 0;
    state.gensPerBatch = Math.round(1 + (speed - 70) / 3);
  }
}

function runLoop() {
  if (!state.isRunning || state.isPaused) return;

  const tickStartTime = performance.now();

  for (let b = 0; b < state.gensPerBatch; b++) {
    state.generation++;
    const prevBestDist = state.bestEver.distance;

    const evoResult = evolveOneGeneration(
      state.population,
      state.options,
      state.distanceMatrix,
      state.cities.length,
      state.depot,
      state.rng,
      false
    );

    state.population = evoResult.population;
    const currentBest = evoResult.stats.best;
    let isNewBest = false;

    if (currentBest.distance < state.bestEver.distance - 1e-7) {
      state.bestEver = { ...currentBest, genes: [...currentBest.genes] };
      state.bestEverGen = state.generation;
      state.stagnationCounter = 0;
      isNewBest = true;
    } else {
      state.stagnationCounter++;
    }

    state.totalElapsedMs += (performance.now() - tickStartTime);

    // Check termination
    const reachedMax = state.generation >= state.options.maxGenerations;
    const reachedStagnation = state.stagnationCounter >= state.options.stagnationLimit;

    if (reachedMax || reachedStagnation || b === state.gensPerBatch - 1 || isNewBest) {
      const topRoutes = extractTopRoutes(state.population, 5);
      self.postMessage({
        type: 'GENERATION_UPDATE',
        payload: {
          generation: state.generation,
          bestDistance: state.bestEver.distance,
          bestRoute: state.bestEver.genes,
          avgDistance: evoResult.stats.avgDistance,
          diversityRatio: evoResult.stats.diversityRatio,
          isNewBest,
          topRoutes,
          elapsedMs: state.totalElapsedMs
        }
      });
    }

    if (reachedMax || reachedStagnation) {
      state.isRunning = false;
      stopLoop();
      self.postMessage({
        type: 'FINISHED',
        payload: {
          reason: reachedMax ? 'Max generations reached' : `Stagnation limit reached (${state.options.stagnationLimit} gens without improvement)`,
          finalGeneration: state.generation,
          bestDistance: state.bestEver.distance,
          bestRoute: state.bestEver.genes,
          bestEverGen: state.bestEverGen,
          gen0BestDist: state.gen0BestDist,
          nnDistance: state.nnResult.distance,
          nnRoute: state.nnResult.route,
          nnExecutionTimeMs: state.nnResult.executionTimeMs,
          elapsedMs: state.totalElapsedMs
        }
      });
      return;
    }
  }

  state.timerId = setTimeout(runLoop, state.speedDelayMs);
}

function handleStep() {
  if (state.isRunning) {
    handlePause();
  }

  state.generation++;
  const prevBestDist = state.bestEver ? state.bestEver.distance : Infinity;

  const evoResult = evolveOneGeneration(
    state.population,
    state.options,
    state.distanceMatrix,
    state.cities.length,
    state.depot,
    state.rng,
    false
  );

  state.population = evoResult.population;
  const currentBest = evoResult.stats.best;
  let isNewBest = false;

  if (currentBest.distance < state.bestEver.distance - 1e-7) {
    state.bestEver = { ...currentBest, genes: [...currentBest.genes] };
    state.bestEverGen = state.generation;
    state.stagnationCounter = 0;
    isNewBest = true;
  } else {
    state.stagnationCounter++;
  }

  const topRoutes = extractTopRoutes(state.population, 5);

  self.postMessage({
    type: 'GENERATION_UPDATE',
    payload: {
      generation: state.generation,
      bestDistance: state.bestEver.distance,
      bestRoute: state.bestEver.genes,
      avgDistance: evoResult.stats.avgDistance,
      diversityRatio: evoResult.stats.diversityRatio,
      isNewBest,
      topRoutes,
      elapsedMs: state.totalElapsedMs
    }
  });
}

function handleExplainStep() {
  if (state.isRunning) {
    handlePause();
  }

  state.generation++;
  const evoResult = evolveOneGeneration(
    state.population,
    state.options,
    state.distanceMatrix,
    state.cities.length,
    state.depot,
    state.rng,
    true // Record explain trace
  );

  state.population = evoResult.population;
  const currentBest = evoResult.stats.best;
  let isNewBest = false;

  if (currentBest.distance < state.bestEver.distance - 1e-7) {
    state.bestEver = { ...currentBest, genes: [...currentBest.genes] };
    state.bestEverGen = state.generation;
    state.stagnationCounter = 0;
    isNewBest = true;
  } else {
    state.stagnationCounter++;
  }

  const topRoutes = extractTopRoutes(state.population, 5);

  self.postMessage({
    type: 'EXPLAIN_UPDATE',
    payload: {
      generation: state.generation,
      bestDistance: state.bestEver.distance,
      bestRoute: state.bestEver.genes,
      avgDistance: evoResult.stats.avgDistance,
      diversityRatio: evoResult.stats.diversityRatio,
      isNewBest,
      topRoutes,
      explainData: evoResult.explainData
    }
  });
}

function handleCompareCrossovers(payload) {
  const { cities, isOffline = false, depot = 0, options = {} } = payload;
  const distMatrix = computeDistanceMatrix(cities, isOffline);
  const seed = options.seed !== undefined ? options.seed : 42;
  const maxGens = Math.min(options.maxGenerations || 250, 300);

  // Run with OX
  const rngOX = createRNG(seed);
  let popOX = initializePopulation(options.popSize || 80, cities.length, distMatrix, depot, false, rngOX);
  const oxHistory = [];

  for (let g = 0; g <= maxGens; g++) {
    const stats = computePopulationStats(popOX);
    oxHistory.push({ gen: g, best: stats.best.distance, avg: stats.avgDistance });
    const evo = evolveOneGeneration(
      popOX,
      { ...options, crossoverMethod: 'ox' },
      distMatrix,
      cities.length,
      depot,
      rngOX
    );
    popOX = evo.population;
  }

  // Run with PMX (identical initial seed)
  const rngPMX = createRNG(seed);
  let popPMX = initializePopulation(options.popSize || 80, cities.length, distMatrix, depot, false, rngPMX);
  const pmxHistory = [];

  for (let g = 0; g <= maxGens; g++) {
    const stats = computePopulationStats(popPMX);
    pmxHistory.push({ gen: g, best: stats.best.distance, avg: stats.avgDistance });
    const evo = evolveOneGeneration(
      popPMX,
      { ...options, crossoverMethod: 'pmx' },
      distMatrix,
      cities.length,
      depot,
      rngPMX
    );
    popPMX = evo.population;
  }

  self.postMessage({
    type: 'COMPARE_CROSSOVERS_RESULT',
    payload: {
      oxHistory,
      pmxHistory,
      oxFinal: oxHistory[oxHistory.length - 1].best,
      pmxFinal: pmxHistory[pmxHistory.length - 1].best
    }
  });
}

function handleRun10Times(payload) {
  const { cities, isOffline = false, depot = 0, options = {} } = payload;
  const distMatrix = computeDistanceMatrix(cities, isOffline);
  const baseSeed = options.seed !== undefined ? options.seed : 100;
  const runsCount = 10;
  const maxGens = Math.min(options.maxGenerations || 200, 250);

  const results = [];

  for (let r = 0; r < runsCount; r++) {
    const seed = baseSeed + r * 1337;
    const rng = createRNG(seed);
    let pop = initializePopulation(options.popSize || 80, cities.length, distMatrix, depot, false, rng);

    let bestDist = Infinity;
    let bestRoute = null;

    for (let g = 0; g < maxGens; g++) {
      const stats = computePopulationStats(pop);
      if (stats.best.distance < bestDist) {
        bestDist = stats.best.distance;
        bestRoute = [...stats.best.genes];
      }
      const evo = evolveOneGeneration(pop, options, distMatrix, cities.length, depot, rng);
      pop = evo.population;
    }

    results.push({ run: r + 1, seed, bestDistance: bestDist, bestRoute });
  }

  const distances = results.map(r => r.bestDistance);
  const best = Math.min(...distances);
  const worst = Math.max(...distances);
  const sum = distances.reduce((a, b) => a + b, 0);
  const mean = sum / runsCount;

  const variance = distances.reduce((acc, d) => acc + Math.pow(d - mean, 2), 0) / runsCount;
  const stdDev = Math.sqrt(variance);

  self.postMessage({
    type: 'RUN_10_TIMES_RESULT',
    payload: {
      runs: results,
      best,
      worst,
      mean,
      stdDev
    }
  });
}

function handlePolish2Opt() {
  if (!state.bestEver || !state.distanceMatrix) return;

  const polished = polish2Opt(state.bestEver.genes, state.distanceMatrix);
  self.postMessage({
    type: 'POLISH_2OPT_RESULT',
    payload: {
      originalDistance: state.bestEver.distance,
      polishedDistance: polished.distance,
      polishedRoute: polished.route,
      iterations: polished.iterations,
      executionTimeMs: polished.executionTimeMs
    }
  });
}

function stopLoop() {
  if (state.timerId) {
    clearTimeout(state.timerId);
    state.timerId = null;
  }
}

function extractTopRoutes(population, count = 5) {
  // Sort descending by fitness (lowest distance first)
  const sorted = [...population].sort((a, b) => a.distance - b.distance);
  const uniqueRoutes = [];
  const seenKey = new Set();

  for (let i = 0; i < sorted.length; i++) {
    const key = sorted[i].genes.join('-');
    if (!seenKey.has(key)) {
      seenKey.add(key);
      uniqueRoutes.push(sorted[i].genes);
      if (uniqueRoutes.length >= count) break;
    }
  }

  return uniqueRoutes;
}
