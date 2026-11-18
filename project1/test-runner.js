/**
 * CLI Test Runner for RouteEvolve
 * Runs the exact test suite from tests.html via Node.js ES modules.
 */

import { haversineDistance, euclideanDistance, computeDistanceMatrix, computeRouteDistance } from './js/geo.js';
import { solveNearestNeighbour, polish2Opt } from './js/baseline.js';
import {
  orderCrossover,
  partiallyMappedCrossover,
  swapMutation,
  inversionMutation,
  scrambleMutation,
  isValidPermutation,
  generateRandomChromosome,
  createRNG,
  tournamentSelection,
  rouletteWheelSelection,
  rankSelection,
  createIndividual,
  evolveOneGeneration,
  computePopulationStats,
  initializePopulation
} from './js/ga.js';
import { getLudhianaDemo12, getLudhianaLarge25 } from './js/presets.js';

let passed = 0;
let failed = 0;

function assert(condition, name, details = '') {
  if (condition) {
    passed++;
    console.log(`[PASS] ${name} ${details ? '(' + details + ')' : ''}`);
  } else {
    failed++;
    console.error(`[FAIL] ${name} ${details ? '(' + details + ')' : ''}`);
  }
}

console.log('====================================================');
console.log(' RouteEvolve: Executing Operator Verification Suite ');
console.log('====================================================\n');

// 1. Haversine distance
const d = haversineDistance(30.9126, 75.8541, 30.9012, 75.8365);
assert(Math.abs(d - 2.11) <= 0.15, '1. Haversine Distance', `Expected ~2.11 km, got ${d.toFixed(3)} km`);

// 2. Euclidean distance
const ed = euclideanDistance(0, 0, 30, 40, 1.0);
assert(Math.abs(ed - 50) < 1e-6, '2. Euclidean Distance Metric', `Expected 50.0, got ${ed}`);

// 3. OX 1000 trials
let oxValid = true;
const rngOX = createRNG(12345);
for (let t = 0; t < 1000; t++) {
  const n = 5 + Math.floor(rngOX() * 35);
  const p1 = generateRandomChromosome(n, 0, rngOX);
  const p2 = generateRandomChromosome(n, 0, rngOX);
  const { child1, child2 } = orderCrossover(p1, p2, rngOX);
  if (!isValidPermutation(child1, n, 0) || !isValidPermutation(child2, n, 0)) {
    oxValid = false;
    break;
  }
}
assert(oxValid, '3. Order Crossover (OX) — 1,000 Randomized Trials', 'All permutations strictly valid');

// 4. PMX 1000 trials
let pmxValid = true;
const rngPMX = createRNG(67890);
for (let t = 0; t < 1000; t++) {
  const n = 5 + Math.floor(rngPMX() * 35);
  const p1 = generateRandomChromosome(n, 0, rngPMX);
  const p2 = generateRandomChromosome(n, 0, rngPMX);
  const { child1, child2 } = partiallyMappedCrossover(p1, p2, rngPMX);
  if (!isValidPermutation(child1, n, 0) || !isValidPermutation(child2, n, 0)) {
    pmxValid = false;
    break;
  }
}
assert(pmxValid, '4. Partially Mapped Crossover (PMX) — 1,000 Randomized Trials', 'All permutations strictly valid');

// 5. Swap mutation 500 trials
let swapValid = true;
const rngSwap = createRNG(42);
for (let t = 0; t < 500; t++) {
  const n = 6 + Math.floor(rngSwap() * 25);
  const orig = generateRandomChromosome(n, 0, rngSwap);
  const { genes: mut } = swapMutation(orig, rngSwap);
  if (!isValidPermutation(mut, n, 0)) {
    swapValid = false;
    break;
  }
}
assert(swapValid, '5. Swap Mutation — 500 Trials', 'All permutations valid');

// 6. Inversion mutation 500 trials
let invValid = true;
const rngInv = createRNG(99);
for (let t = 0; t < 500; t++) {
  const n = 6 + Math.floor(rngInv() * 25);
  const orig = generateRandomChromosome(n, 0, rngInv);
  const { genes: mut } = inversionMutation(orig, rngInv);
  if (!isValidPermutation(mut, n, 0)) {
    invValid = false;
    break;
  }
}
assert(invValid, '6. Inversion Mutation — 500 Trials', 'All permutations valid');

// 7. Scramble mutation 500 trials
let scrValid = true;
const rngScr = createRNG(777);
for (let t = 0; t < 500; t++) {
  const n = 6 + Math.floor(rngScr() * 25);
  const orig = generateRandomChromosome(n, 0, rngScr);
  const { genes: mut } = scrambleMutation(orig, rngScr);
  if (!isValidPermutation(mut, n, 0)) {
    scrValid = false;
    break;
  }
}
assert(scrValid, '7. Scramble Mutation — 500 Trials', 'All permutations valid');

// 8. Nearest Neighbour on Ludhiana Large 25
const cities25 = getLudhianaLarge25();
const distMatrix25 = computeDistanceMatrix(cities25, false);
const nn25 = solveNearestNeighbour(cities25.length, distMatrix25, 0);
assert(
  isValidPermutation(nn25.route, cities25.length, 0) && nn25.distance > 0,
  '8. Nearest Neighbour Algorithm (25 Ludhiana Stops)',
  `Distance = ${nn25.distance.toFixed(2)} km in ${nn25.executionTimeMs.toFixed(2)} ms`
);

// 9. 2-Opt Polish Non-Increasing Distance
const citiesDemo = getLudhianaDemo12();
const distMatrixDemo = computeDistanceMatrix(citiesDemo, false);
const rndRoute = generateRandomChromosome(citiesDemo.length, 0);
const rndDist = computeRouteDistance(rndRoute, distMatrixDemo);
const pol = polish2Opt(rndRoute, distMatrixDemo);
assert(
  pol.distance <= rndDist + 1e-9 && isValidPermutation(pol.route, citiesDemo.length, 0),
  '9. 2-Opt Polish Non-Increasing Distance Property',
  `Initial ${rndDist.toFixed(2)} km -> Polished ${pol.distance.toFixed(2)} km`
);

// 10. Seeded Mulberry32 determinism
const s1 = createRNG(999);
const s2 = createRNG(999);
let seedsMatch = true;
for (let i = 0; i < 100; i++) {
  if (s1() !== s2()) {
    seedsMatch = false;
    break;
  }
}
assert(seedsMatch, '10. Seeded Mulberry32 PRNG Determinism', 'Identical sequence reproduced');

// 11. Full GA Run on Ludhiana Demo (12 stops): confirms GA visibly improves route!
console.log('\n--- Live GA Optimization Simulation (Ludhiana Demo 12 Stops) ---');
const rngGA = createRNG(42);
let pop = initializePopulation(100, citiesDemo.length, distMatrixDemo, 0, false, rngGA);
const initStats = computePopulationStats(pop);
console.log(`Generation 0: Best = ${initStats.best.distance.toFixed(2)} km, Avg = ${initStats.avgDistance.toFixed(2)} km`);

let bestEver = initStats.best.distance;
let bestGen = 0;
const options = {
  elitismCount: 2,
  crossoverRate: 0.85,
  mutationRate: 0.15,
  selectionMethod: 'tournament',
  crossoverMethod: 'ox',
  mutationMethod: 'inversion',
  tournamentSize: 5
};

for (let g = 1; g <= 100; g++) {
  const evo = evolveOneGeneration(pop, options, distMatrixDemo, citiesDemo.length, 0, rngGA, false);
  pop = evo.population;
  if (evo.stats.best.distance < bestEver - 1e-7) {
    bestEver = evo.stats.best.distance;
    bestGen = g;
    console.log(`Generation ${g}: New Best = ${bestEver.toFixed(2)} km (-${((initStats.best.distance - bestEver) / initStats.best.distance * 100).toFixed(1)}%)`);
  }
}

const finalSaving = ((initStats.best.distance - bestEver) / initStats.best.distance) * 100;
assert(
  bestEver < initStats.best.distance && finalSaving >= 15,
  '11. Live GA Optimization on Ludhiana Demo 12 Stops',
  `Initial = ${initStats.best.distance.toFixed(2)} km -> Final = ${bestEver.toFixed(2)} km (${finalSaving.toFixed(1)}% improvement)`
);

console.log('\n====================================================');
console.log(` TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
}
