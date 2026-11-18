/**
 * ga.js - Pure Genetic Algorithm Engine for the Travelling Salesman Problem (TSP)
 * 
 * DESIGN PRINCIPLES:
 * 1. Zero DOM code - 100% pure functional algorithm logic.
 * 2. Deterministic & Reproducible - Built-in Mulberry32 PRNG with seed support.
 * 3. Permutation-safe operators - OX and PMX guaranteed never to drop or duplicate stops.
 * 4. Heavily documented - Clear explanations for academic evaluation and lab viva.
 */

import { computeRouteDistance } from './geo.js';
import { solveNearestNeighbour } from './baseline.js';

// ============================================================================
// 1. REPRODUCIBLE PSEUDO-RANDOM NUMBER GENERATOR (Mulberry32)
// ============================================================================

/**
 * Creates a deterministic 32-bit PRNG from an integer seed.
 * Ensures experiment reproducibility across runs and browsers.
 * @param {number} seed 
 * @returns {() => number} Returns float in [0, 1)
 */
export function createRNG(seed) {
  if (seed === undefined || seed === null || isNaN(seed)) {
    return Math.random;
  }
  let s = Math.floor(seed) >>> 0;
  return function mulberry32() {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================================
// 2. CHROMOSOME REPRESENTATION & VALIDATION
// ============================================================================

/**
 * Chromosome Structure:
 * Array of integers of length N representing the visit order.
 * - genes[0] is strictly fixed to the Depot (default: 0).
 * - genes[1 ... N-1] is a permutation of the remaining N-1 cities.
 * - The route implicitly closes by returning from genes[N-1] back to genes[0].
 * 
 * Example for 5 cities: [0, 3, 1, 4, 2]
 * Visit order: Depot(0) -> 3 -> 1 -> 4 -> 2 -> Depot(0).
 */

/**
 * Validates whether a chromosome is a mathematically valid TSP permutation.
 * Checks:
 * 1. Correct length N
 * 2. Starts with specified depot
 * 3. Contains all integers 0 to N-1 exactly once (no duplicates, no omissions)
 * 
 * @param {number[]} genes 
 * @param {number} numCities 
 * @param {number} depot 
 * @returns {boolean}
 */
export function isValidPermutation(genes, numCities, depot = 0) {
  if (!Array.isArray(genes) || genes.length !== numCities) {
    console.warn(`[GA Validity Error] Length mismatch: expected ${numCities}, got ${genes?.length}`);
    return false;
  }
  if (genes[0] !== depot) {
    console.warn(`[GA Validity Error] Depot mismatch: expected ${depot}, got ${genes[0]}`);
    return false;
  }

  const seen = new Uint8Array(numCities);
  for (let i = 0; i < numCities; i++) {
    const val = genes[i];
    if (val < 0 || val >= numCities) {
      console.warn(`[GA Validity Error] Out-of-bounds city index: ${val}`);
      return false;
    }
    if (seen[val]) {
      console.warn(`[GA Validity Error] Duplicate city index detected: ${val}`);
      return false;
    }
    seen[val] = 1;
  }
  return true;
}

/**
 * Creates an individual object with computed distance and fitness.
 * Fitness definition: 1 / total_distance
 * Shorter distance yields strictly higher fitness.
 * 
 * @param {number[]} genes 
 * @param {Array<Float64Array|number[]>} distanceMatrix 
 * @returns {{genes: number[], distance: number, fitness: number}}
 */
export function createIndividual(genes, distanceMatrix) {
  const distance = computeRouteDistance(genes, distanceMatrix);
  // Avoid division by zero with small epsilon
  const fitness = distance > 0 ? 1 / distance : 1e9;
  return {
    genes: [...genes],
    distance,
    fitness
  };
}

/**
 * Generates a random valid chromosome with depot fixed at index 0.
 * Fisher-Yates shuffle applied to cities [1 ... N-1].
 * 
 * @param {number} numCities 
 * @param {number} depot 
 * @param {() => number} rng 
 * @returns {number[]}
 */
export function generateRandomChromosome(numCities, depot = 0, rng = Math.random) {
  const genes = new Array(numCities);
  genes[0] = depot;

  // Gather non-depot cities
  const nonDepot = [];
  for (let i = 0; i < numCities; i++) {
    if (i !== depot) nonDepot.push(i);
  }

  // Fisher-Yates Shuffle on non-depot cities
  for (let i = nonDepot.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = nonDepot[i];
    nonDepot[i] = nonDepot[j];
    nonDepot[j] = temp;
  }

  for (let i = 0; i < nonDepot.length; i++) {
    genes[i + 1] = nonDepot[i];
  }

  return genes;
}

/**
 * Initializes a population of individuals.
 * 
 * @param {number} popSize Total individuals (e.g. 100)
 * @param {number} numCities 
 * @param {Array<Float64Array|number[]>} distanceMatrix 
 * @param {number} depot Depot city index (default 0)
 * @param {boolean} seedWithNN Whether to seed individual 0 with Nearest Neighbour
 * @param {() => number} rng 
 * @returns {Array<{genes: number[], distance: number, fitness: number}>}
 */
export function initializePopulation(popSize, numCities, distanceMatrix, depot = 0, seedWithNN = false, rng = Math.random) {
  const population = [];

  // Optional: Seed the very first individual with greedy Nearest Neighbour
  let startIdx = 0;
  if (seedWithNN) {
    const nnResult = solveNearestNeighbour(numCities, distanceMatrix, depot);
    population.push(createIndividual(nnResult.route, distanceMatrix));
    startIdx = 1;
  }

  for (let i = startIdx; i < popSize; i++) {
    const chrom = generateRandomChromosome(numCities, depot, rng);
    population.push(createIndividual(chrom, distanceMatrix));
  }

  return population;
}

// ============================================================================
// 3. SELECTION OPERATORS
// ============================================================================

/**
 * Tournament Selection:
 * Randomly samples k individuals from the population and returns the one
 * with highest fitness. Balances selection pressure via tournament size.
 * 
 * @param {Array<Object>} population 
 * @param {number} tournamentSize 
 * @param {() => number} rng 
 * @returns {Object} Selected parent individual
 */
export function tournamentSelection(population, tournamentSize = 5, rng = Math.random) {
  let best = null;
  const popLen = population.length;
  const k = Math.min(tournamentSize, popLen);

  for (let i = 0; i < k; i++) {
    const randIdx = Math.floor(rng() * popLen);
    const candidate = population[randIdx];
    if (best === null || candidate.fitness > best.fitness) {
      best = candidate;
    }
  }

  return best;
}

/**
 * Roulette Wheel Selection (Fitness-Proportionate Selection):
 * Each individual has a probability of selection proportional to its fitness.
 * P(i) = fitness(i) / sum(fitness)
 * 
 * @param {Array<Object>} population 
 * @param {() => number} rng 
 * @returns {Object} Selected parent individual
 */
export function rouletteWheelSelection(population, rng = Math.random) {
  let totalFitness = 0;
  for (let i = 0; i < population.length; i++) {
    totalFitness += population[i].fitness;
  }

  const pick = rng() * totalFitness;
  let runningSum = 0;

  for (let i = 0; i < population.length; i++) {
    runningSum += population[i].fitness;
    if (runningSum >= pick) {
      return population[i];
    }
  }

  return population[population.length - 1];
}

/**
 * Rank Selection:
 * Sorts population by fitness and assigns selection probability based on rank
 * rather than raw fitness. This eliminates premature convergence caused by
 * an early super-fit individual, and maintains steady selection pressure.
 * 
 * @param {Array<Object>} sortedPopulation Sorted ascending by fitness (index 0 = worst)
 * @param {() => number} rng 
 * @returns {Object} Selected parent individual
 */
export function rankSelection(sortedPopulation, rng = Math.random) {
  const n = sortedPopulation.length;
  // Sum of ranks: n * (n + 1) / 2
  const totalRankSum = (n * (n + 1)) / 2;
  const pick = rng() * totalRankSum;

  let currentSum = 0;
  for (let rank = 1; rank <= n; rank++) {
    currentSum += rank;
    if (currentSum >= pick) {
      return sortedPopulation[rank - 1];
    }
  }

  return sortedPopulation[n - 1];
}

/**
 * Master selection dispatch function.
 */
export function selectParent(population, method, tournamentSize = 5, sortedPop = null, rng = Math.random) {
  switch (method) {
    case 'roulette':
      return rouletteWheelSelection(population, rng);
    case 'rank':
      return rankSelection(sortedPop || [...population].sort((a, b) => a.fitness - b.fitness), rng);
    case 'tournament':
    default:
      return tournamentSelection(population, tournamentSize, rng);
  }
}

// ============================================================================
// 4. CROSSOVER OPERATORS (Permutation Preserving)
// ============================================================================

/**
 * Order Crossover (OX1):
 * Standard crossover operator for order-based chromosomes (Davis, 1985).
 * 
 * Mechanics:
 * 1. Two cut points cp1 and cp2 are selected in the permutable region [1 ... N-1].
 * 2. The segment between cp1 and cp2 from Parent 1 is copied directly into Child 1.
 * 3. Starting immediately after cp2 in Parent 2, elements are read with cyclic wraparound.
 * 4. Any element not already present in Child 1's copied segment is placed into
 *    the next available slot in Child 1 (also wrapping cyclically after N-1).
 * 
 * Property: Guarantees every city appears exactly once without duplicates.
 * 
 * @param {number[]} p1 Parent 1 genes
 * @param {number[]} p2 Parent 2 genes
 * @param {() => number} rng 
 * @returns {{child1: number[], child2: number[], cut1: number, cut2: number}}
 */
export function orderCrossover(p1, p2, rng = Math.random) {
  const n = p1.length;
  // If fewer than 4 cities, crossover is trivial
  if (n <= 3) {
    return {
      child1: [...p1],
      child2: [...p2],
      cut1: 1,
      cut2: 1
    };
  }

  // Choose 2 cut points within range [1, n - 1]
  // Note: index 0 is depot and never crossed
  let cut1 = 1 + Math.floor(rng() * (n - 1));
  let cut2 = 1 + Math.floor(rng() * (n - 1));
  if (cut1 > cut2) {
    const temp = cut1;
    cut1 = cut2;
    cut2 = temp;
  }

  const child1 = oxHelper(p1, p2, cut1, cut2);
  const child2 = oxHelper(p2, p1, cut1, cut2);

  return { child1, child2, cut1, cut2 };
}

function oxHelper(p1, p2, cut1, cut2) {
  const n = p1.length;
  const child = new Array(n).fill(-1);
  child[0] = p1[0]; // Depot preserved

  const inChild = new Uint8Array(n);
  inChild[p1[0]] = 1;

  // Copy segment [cut1, cut2] from p1
  for (let i = cut1; i <= cut2; i++) {
    child[i] = p1[i];
    inChild[p1[i]] = 1;
  }

  // Fill remainder from p2 cyclically starting at cut2 + 1
  let p2Pos = (cut2 + 1);
  if (p2Pos >= n) p2Pos = 1;

  let childPos = (cut2 + 1);
  if (childPos >= n) childPos = 1;

  let filledCount = cut2 - cut1 + 1;
  const needed = n - 1; // total non-depot cities

  while (filledCount < needed) {
    const candidate = p2[p2Pos];
    if (!inChild[candidate]) {
      child[childPos] = candidate;
      inChild[candidate] = 1;
      filledCount++;

      childPos++;
      if (childPos >= n) childPos = 1;
    }

    p2Pos++;
    if (p2Pos >= n) p2Pos = 1;
  }

  return child;
}

/**
 * Partially Mapped Crossover (PMX):
 * Classic permutation crossover operator (Goldberg & Lingle, 1985).
 * 
 * Mechanics:
 * 1. Two cut points cut1 and cut2 define a mapping section between parents.
 * 2. Segment [cut1, cut2] of Parent 1 is copied into Child 1.
 * 3. For each element in Parent 2's matching segment:
 *    If not already in Child 1, find its mapped position outside [cut1, cut2]
 *    by tracing the chain of mappings until an open slot is found.
 * 4. Fill remaining unoccupied positions with corresponding elements of Parent 2.
 * 
 * @param {number[]} p1 
 * @param {number[]} p2 
 * @param {() => number} rng 
 * @returns {{child1: number[], child2: number[], cut1: number, cut2: number}}
 */
export function partiallyMappedCrossover(p1, p2, rng = Math.random) {
  const n = p1.length;
  if (n <= 3) {
    return {
      child1: [...p1],
      child2: [...p2],
      cut1: 1,
      cut2: 1
    };
  }

  let cut1 = 1 + Math.floor(rng() * (n - 1));
  let cut2 = 1 + Math.floor(rng() * (n - 1));
  if (cut1 > cut2) {
    const temp = cut1;
    cut1 = cut2;
    cut2 = temp;
  }

  const child1 = pmxHelper(p1, p2, cut1, cut2);
  const child2 = pmxHelper(p2, p1, cut1, cut2);

  return { child1, child2, cut1, cut2 };
}

function pmxHelper(p1, p2, cut1, cut2) {
  const n = p1.length;
  const child = new Array(n).fill(-1);
  child[0] = p1[0]; // Depot

  // Map from city value -> index in p1 & p2 for fast O(1) lookup
  const p1Pos = new Int32Array(n);
  const p2Pos = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    p1Pos[p1[i]] = i;
    p2Pos[p2[i]] = i;
  }

  // 1. Copy matching substring from p1
  for (let i = cut1; i <= cut2; i++) {
    child[i] = p1[i];
  }

  // 2. Map elements from p2's segment that aren't already placed
  for (let i = cut1; i <= cut2; i++) {
    const candidate = p2[i];
    // If candidate is already in the copied segment, skip
    let alreadyInChild = false;
    for (let k = cut1; k <= cut2; k++) {
      if (child[k] === candidate) {
        alreadyInChild = true;
        break;
      }
    }

    if (!alreadyInChild) {
      // Trace mapping chain
      let targetPos = i;
      while (targetPos >= cut1 && targetPos <= cut2) {
        const valInP1 = p1[targetPos];
        targetPos = p2Pos[valInP1];
      }
      child[targetPos] = candidate;
    }
  }

  // 3. Fill remaining positions directly from p2
  for (let i = 1; i < n; i++) {
    if (child[i] === -1) {
      child[i] = p2[i];
    }
  }

  return child;
}

// ============================================================================
// 5. MUTATION OPERATORS
// ============================================================================

/**
 * Swap Mutation:
 * Selects two random distinct non-depot cities and exchanges their visit order.
 * 
 * @param {number[]} genes 
 * @param {() => number} rng 
 * @returns {{genes: number[], idx1: number, idx2: number}}
 */
export function swapMutation(genes, rng = Math.random) {
  const mutated = [...genes];
  const n = genes.length;
  if (n <= 2) return { genes: mutated, idx1: 0, idx2: 0 };

  const idx1 = 1 + Math.floor(rng() * (n - 1));
  let idx2 = 1 + Math.floor(rng() * (n - 1));
  while (idx2 === idx1 && n > 3) {
    idx2 = 1 + Math.floor(rng() * (n - 1));
  }

  const temp = mutated[idx1];
  mutated[idx1] = mutated[idx2];
  mutated[idx2] = temp;

  return { genes: mutated, idx1, idx2 };
}

/**
 * Inversion Mutation (2-Opt Style Reversal):
 * Selects two cut points in the route and reverses the sequence of cities between them.
 * Highly effective for TSP as it untangles crossing paths.
 * 
 * @param {number[]} genes 
 * @param {() => number} rng 
 * @returns {{genes: number[], cut1: number, cut2: number}}
 */
export function inversionMutation(genes, rng = Math.random) {
  const mutated = [...genes];
  const n = genes.length;
  if (n <= 3) return { genes: mutated, cut1: 1, cut2: 1 };

  let cut1 = 1 + Math.floor(rng() * (n - 1));
  let cut2 = 1 + Math.floor(rng() * (n - 1));
  if (cut1 > cut2) {
    const temp = cut1;
    cut1 = cut2;
    cut2 = temp;
  }

  let i = cut1;
  let j = cut2;
  while (i < j) {
    const temp = mutated[i];
    mutated[i] = mutated[j];
    mutated[j] = temp;
    i++;
    j--;
  }

  return { genes: mutated, cut1, cut2 };
}

/**
 * Scramble Mutation:
 * Selects a subsegment of cities and randomly permutes (scrambles) their order.
 * 
 * @param {number[]} genes 
 * @param {() => number} rng 
 * @returns {{genes: number[], cut1: number, cut2: number}}
 */
export function scrambleMutation(genes, rng = Math.random) {
  const mutated = [...genes];
  const n = genes.length;
  if (n <= 3) return { genes: mutated, cut1: 1, cut2: 1 };

  let cut1 = 1 + Math.floor(rng() * (n - 1));
  let cut2 = 1 + Math.floor(rng() * (n - 1));
  if (cut1 > cut2) {
    const temp = cut1;
    cut1 = cut2;
    cut2 = temp;
  }

  // Extract and shuffle subsegment
  const sub = mutated.slice(cut1, cut2 + 1);
  for (let i = sub.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = sub[i];
    sub[i] = sub[j];
    sub[j] = temp;
  }

  for (let i = 0; i < sub.length; i++) {
    mutated[cut1 + i] = sub[i];
  }

  return { genes: mutated, cut1, cut2 };
}

/**
 * Master mutation dispatch function.
 */
export function applyMutation(genes, method, rng = Math.random) {
  switch (method) {
    case 'inversion':
      return inversionMutation(genes, rng);
    case 'scramble':
      return scrambleMutation(genes, rng);
    case 'swap':
    default:
      return swapMutation(genes, rng);
  }
}

// ============================================================================
// 6. POPULATION METRICS & DIVERSITY
// ============================================================================

/**
 * Calculates population statistics:
 * - Best distance & individual
 * - Average distance
 * - Diversity metric (percentage of distinct route lengths in population)
 * 
 * @param {Array<Object>} population 
 * @returns {{best: Object, avgDistance: number, diversityRatio: number}}
 */
export function computePopulationStats(population) {
  let minDistance = Infinity;
  let bestIndividual = population[0];
  let totalDistance = 0;

  const uniqueDistances = new Set();

  for (let i = 0; i < population.length; i++) {
    const ind = population[i];
    const dist = ind.distance;
    totalDistance += dist;

    // Round distance slightly to bucket floating-point variations
    uniqueDistances.add(Math.round(dist * 100));

    if (dist < minDistance) {
      minDistance = dist;
      bestIndividual = ind;
    }
  }

  const avgDistance = totalDistance / population.length;
  const diversityRatio = uniqueDistances.size / population.length;

  return {
    best: bestIndividual,
    avgDistance,
    diversityRatio
  };
}

// ============================================================================
// 7. GENERATION STEP ENGINE
// ============================================================================

/**
 * Advances the population by one generation.
 * 
 * Lifecycle:
 * 1. Sort population descending by fitness (lowest distance first).
 * 2. Preserve top E elite individuals untouched.
 * 3. Produce offspring using Selection -> Crossover (at rate Pc) -> Mutation (at rate Pm).
 * 4. Perform validity assert on every offspring.
 * 5. Return new population + generation statistics + step log (if explain mode).
 * 
 * @param {Array<Object>} population 
 * @param {Object} options Configuration parameters
 * @param {Array<Float64Array|number[]>} distanceMatrix 
 * @param {number} numCities 
 * @param {number} depot 
 * @param {() => number} rng 
 * @param {boolean} recordExplain Whether to capture detailed step trace for Explain Mode
 * @returns {{population: Array<Object>, stats: Object, explainData?: Object}}
 */
export function evolveOneGeneration(population, options, distanceMatrix, numCities, depot = 0, rng = Math.random, recordExplain = false) {
  const {
    elitismCount = 2,
    crossoverRate = 0.85,
    mutationRate = 0.15,
    selectionMethod = 'tournament',
    crossoverMethod = 'ox',
    mutationMethod = 'swap',
    tournamentSize = 5
  } = options;

  const popSize = population.length;

  // 1. Sort population by fitness descending (best/shortest first)
  const sorted = [...population].sort((a, b) => b.fitness - a.fitness);

  const nextPopulation = [];
  const safeElitism = Math.min(Math.max(0, elitismCount), popSize);

  // 2. Elitism: Directly copy the top E best routes unchanged
  for (let i = 0; i < safeElitism; i++) {
    nextPopulation.push({
      genes: [...sorted[i].genes],
      distance: sorted[i].distance,
      fitness: sorted[i].fitness
    });
  }

  // Prepare Explain Mode capture data if requested
  let explainData = null;
  if (recordExplain) {
    explainData = {
      step: 'explain_trace',
      elitesCount: safeElitism,
      topEliteDistance: sorted[0].distance,
      selectionMethod,
      crossoverMethod,
      mutationMethod,
      tracePair: null
    };
  }

  // 3. Breed offspring until population is filled
  while (nextPopulation.length < popSize) {
    // Selection
    const parent1 = selectParent(population, selectionMethod, tournamentSize, sorted, rng);
    const parent2 = selectParent(population, selectionMethod, tournamentSize, sorted, rng);

    let child1Genes = [...parent1.genes];
    let child2Genes = [...parent2.genes];
    let crossoverApplied = false;
    let crossDetails = null;

    // Crossover
    if (rng() < crossoverRate) {
      crossoverApplied = true;
      if (crossoverMethod === 'pmx') {
        const res = partiallyMappedCrossover(parent1.genes, parent2.genes, rng);
        child1Genes = res.child1;
        child2Genes = res.child2;
        crossDetails = { cut1: res.cut1, cut2: res.cut2 };
      } else {
        const res = orderCrossover(parent1.genes, parent2.genes, rng);
        child1Genes = res.child1;
        child2Genes = res.child2;
        crossDetails = { cut1: res.cut1, cut2: res.cut2 };
      }
    }

    // Mutation for Child 1
    let mut1Applied = false;
    let mut1Details = null;
    if (rng() < mutationRate) {
      mut1Applied = true;
      const res = applyMutation(child1Genes, mutationMethod, rng);
      child1Genes = res.genes;
      mut1Details = res;
    }

    // Mutation for Child 2
    let mut2Applied = false;
    let mut2Details = null;
    if (rng() < mutationRate) {
      mut2Applied = true;
      const res = applyMutation(child2Genes, mutationMethod, rng);
      child2Genes = res.genes;
      mut2Details = res;
    }

    // Strict Validity Assertion (Project Requirement)
    if (!isValidPermutation(child1Genes, numCities, depot)) {
      console.warn('[GA Critical] child1 produced invalid permutation! Auto-repairing.');
      child1Genes = generateRandomChromosome(numCities, depot, rng);
    }
    if (!isValidPermutation(child2Genes, numCities, depot)) {
      console.warn('[GA Critical] child2 produced invalid permutation! Auto-repairing.');
      child2Genes = generateRandomChromosome(numCities, depot, rng);
    }

    const c1 = createIndividual(child1Genes, distanceMatrix);
    nextPopulation.push(c1);

    // Capture first breeding event for Explainer Mode
    if (recordExplain && !explainData.tracePair) {
      explainData.tracePair = {
        parent1: { genes: [...parent1.genes], distance: parent1.distance, fitness: parent1.fitness },
        parent2: { genes: [...parent2.genes], distance: parent2.distance, fitness: parent2.fitness },
        crossoverApplied,
        crossoverDetails: crossDetails,
        childBeforeMutation: crossoverApplied ? (crossoverMethod === 'pmx' ? partiallyMappedCrossover(parent1.genes, parent2.genes, rng).child1 : orderCrossover(parent1.genes, parent2.genes, rng).child1) : [...parent1.genes],
        mut1Applied,
        mut1Details,
        finalChild: { genes: [...c1.genes], distance: c1.distance, fitness: c1.fitness }
      };
    }

    // Add child 2 if room remains
    if (nextPopulation.length < popSize) {
      const c2 = createIndividual(child2Genes, distanceMatrix);
      nextPopulation.push(c2);
    }
  }

  const stats = computePopulationStats(nextPopulation);

  return {
    population: nextPopulation,
    stats,
    explainData
  };
}
