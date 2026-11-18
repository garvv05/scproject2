/**
 * baseline.js - Heuristic Benchmarks for TSP
 * 
 * Provides:
 * 1. Nearest Neighbour (Greedy) baseline algorithm
 * 2. 2-Opt Local Search polish algorithm
 * 3. Comparative metrics against Genetic Algorithm
 */

import { computeRouteDistance } from './geo.js';

/**
 * Solve TSP using the Nearest Neighbour greedy heuristic.
 * Complexity: O(N^2)
 * 
 * Starts at the designated depot (usually index 0), repeatedly steps
 * to the nearest unvisited city, and finally returns to the depot.
 * 
 * @param {number} numCities Total number of cities
 * @param {Array<Float64Array|number[]>} distanceMatrix Precomputed N x N distance matrix
 * @param {number} startCity Depot city index (default: 0)
 * @returns {{route: number[], distance: number, executionTimeMs: number}}
 */
export function solveNearestNeighbour(numCities, distanceMatrix, startCity = 0) {
  const startTime = performance.now();

  if (numCities <= 1) {
    return {
      route: [startCity],
      distance: 0,
      executionTimeMs: performance.now() - startTime
    };
  }

  const visited = new Uint8Array(numCities);
  const route = new Array(numCities);

  route[0] = startCity;
  visited[startCity] = 1;

  let current = startCity;

  for (let step = 1; step < numCities; step++) {
    let nearestCity = -1;
    let shortestDist = Infinity;

    for (let candidate = 0; candidate < numCities; candidate++) {
      if (!visited[candidate]) {
        const d = distanceMatrix[current][candidate];
        if (d < shortestDist) {
          shortestDist = d;
          nearestCity = candidate;
        }
      }
    }

    if (nearestCity !== -1) {
      visited[nearestCity] = 1;
      route[step] = nearestCity;
      current = nearestCity;
    }
  }

  const distance = computeRouteDistance(route, distanceMatrix);
  const executionTimeMs = performance.now() - startTime;

  return {
    route,
    distance,
    executionTimeMs
  };
}

/**
 * Perform 2-Opt local search improvement on an existing route.
 * Reverses sub-segments of the tour whenever doing so reduces the total length.
 * 
 * Note: Keeps depot (index 0) fixed at the start.
 * 
 * @param {number[]} initialRoute Array of city indices starting with depot
 * @param {Array<Float64Array|number[]>} distanceMatrix Precomputed N x N distance matrix
 * @param {number} maxIterations Limit to prevent long stalls on large instances
 * @returns {{route: number[], distance: number, iterations: number, executionTimeMs: number}}
 */
export function polish2Opt(initialRoute, distanceMatrix, maxIterations = 500) {
  const startTime = performance.now();
  const n = initialRoute.length;

  if (n <= 3) {
    return {
      route: [...initialRoute],
      distance: computeRouteDistance(initialRoute, distanceMatrix),
      iterations: 0,
      executionTimeMs: performance.now() - startTime
    };
  }

  let route = [...initialRoute];
  let bestDistance = computeRouteDistance(route, distanceMatrix);
  let improved = true;
  let iter = 0;

  while (improved && iter < maxIterations) {
    improved = false;
    iter++;

    // Try all pairs (i, k) with 1 <= i < k < n
    // Index 0 is the depot and remains at position 0
    for (let i = 1; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        // Delta calculation for 2-opt edge swap:
        // Current edges: (i-1 -> i) and (k -> (k+1)%n)
        // New edges: (i-1 -> k) and (i -> (k+1)%n)
        const cityA = route[i - 1];
        const cityB = route[i];
        const cityC = route[k];
        const cityD = route[(k + 1) % n];

        const currentEdgeDist = distanceMatrix[cityA][cityB] + distanceMatrix[cityC][cityD];
        const newEdgeDist = distanceMatrix[cityA][cityC] + distanceMatrix[cityB][cityD];

        if (newEdgeDist < currentEdgeDist - 1e-9) {
          // Reverse segment from i to k
          reverseSegment(route, i, k);
          bestDistance = bestDistance - currentEdgeDist + newEdgeDist;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  // Recalculate accurately to avoid floating-point drift
  const finalDist = computeRouteDistance(route, distanceMatrix);
  const executionTimeMs = performance.now() - startTime;

  return {
    route,
    distance: finalDist,
    iterations: iter,
    executionTimeMs
  };
}

/**
 * In-place segment reversal helper
 */
function reverseSegment(arr, i, k) {
  while (i < k) {
    const temp = arr[i];
    arr[i] = arr[k];
    arr[k] = temp;
    i++;
    k--;
  }
}
