/**
 * geo.js - Geographic and Geometric Utilities for RouteEvolve
 * 
 * Handles:
 * 1. Haversine spherical distance calculation (km)
 * 2. Euclidean distance calculation for offline plane mode
 * 3. Precomputation of N x N distance matrix for fast O(1) edge lookups
 * 4. Total route length evaluation
 */

export const EARTH_RADIUS_KM = 6371.0088;

/**
 * Convert degrees to radians
 * @param {number} deg 
 * @returns {number} radians
 */
export function toRadians(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Compute Haversine distance between two coordinates in kilometers.
 * Formula:
 * a = sin²(Δφ/2) + cos(φ1) * cos(φ2) * sin²(Δλ/2)
 * c = 2 * atan2(√a, √(1−a))
 * d = R * c
 * 
 * @param {number} lat1 Latitude of point 1 (degrees)
 * @param {number} lon1 Longitude of point 1 (degrees)
 * @param {number} lat2 Latitude of point 2 (degrees)
 * @param {number} lon2 Longitude of point 2 (degrees)
 * @returns {number} Distance in kilometers
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaPhi = toRadians(lat2 - lat1);
  const deltaLambda = toRadians(lon2 - lon1);

  const sinDeltaPhi = Math.sin(deltaPhi / 2);
  const sinDeltaLambda = Math.sin(deltaLambda / 2);

  const a = sinDeltaPhi * sinDeltaPhi +
            Math.cos(phi1) * Math.cos(phi2) *
            sinDeltaLambda * sinDeltaLambda;

  // Clamp 'a' to [0, 1] to prevent NaN due to floating point inaccuracies
  const clampedA = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

  return EARTH_RADIUS_KM * c;
}

/**
 * Compute 2D Euclidean distance between two plane points.
 * Calibrated so 1 canvas unit corresponds approximately to 0.1 km for consistent UI scale.
 * 
 * @param {number} x1 
 * @param {number} y1 
 * @param {number} x2 
 * @param {number} y2 
 * @param {number} scaleFactor Conversion factor (default: 0.1 km per unit)
 * @returns {number} Distance in km
 */
export function euclideanDistance(x1, y1, x2, y2, scaleFactor = 0.05) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy) * scaleFactor;
}

/**
 * Precompute an N x N distance matrix for all city pairs.
 * This is crucial for GA performance: computing distance matrix once at O(N^2)
 * turns fitness evaluations from O(N * trig_calls) into fast O(N) array lookups.
 * 
 * @param {Array<{id: number, lat: number, lng: number, x?: number, y?: number}>} cities 
 * @param {boolean} isOffline If true, uses euclidean distance; otherwise Haversine
 * @returns {Array<Float64Array>} Symmetric distance matrix where M[i][j] = distance from city i to j in km
 */
export function computeDistanceMatrix(cities, isOffline = false) {
  const n = cities.length;
  const matrix = new Array(n);

  for (let i = 0; i < n; i++) {
    matrix[i] = new Float64Array(n);
  }

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 0;
      } else {
        let dist = 0;
        if (isOffline && cities[i].x !== undefined && cities[i].y !== undefined) {
          dist = euclideanDistance(cities[i].x, cities[i].y, cities[j].x, cities[j].y);
        } else {
          dist = haversineDistance(cities[i].lat, cities[i].lng, cities[j].lat, cities[j].lng);
        }
        matrix[i][j] = dist;
        matrix[j][i] = dist; // Symmetric TSP
      }
    }
  }

  return matrix;
}

/**
 * Calculate the total distance of a route (TSP tour).
 * The route must return to the starting city.
 * 
 * @param {number[]} route Array of city indices, e.g. [0, 4, 2, 1, 3]
 * @param {Array<Float64Array|number[]>} distanceMatrix Precomputed N x N distance matrix
 * @returns {number} Total closed loop distance in kilometers
 */
export function computeRouteDistance(route, distanceMatrix) {
  const len = route.length;
  if (len < 2) return 0;

  let total = 0;
  for (let i = 0; i < len - 1; i++) {
    total += distanceMatrix[route[i]][route[i + 1]];
  }
  // Return to start
  total += distanceMatrix[route[len - 1]][route[0]];

  return total;
}
