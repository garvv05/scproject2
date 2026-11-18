/**
 * presets.js - Real-world Ludhiana Locations & Presets for RouteEvolve
 * 
 * Contains verified geographical landmarks in Ludhiana, Punjab (approx 30.90°N, 75.85°E)
 * calibrated for delivery route optimization.
 */

export const LUDHIANA_CENTER = {
  lat: 30.9010,
  lng: 75.8573,
  zoom: 13
};

export const LUDHIANA_LOCATIONS = [
  { id: 0, name: 'Clock Tower (Ghanta Ghar)', lat: 30.9126, lng: 75.8541, type: 'depot' },
  { id: 1, name: 'Bharat Nagar Chowk', lat: 30.9012, lng: 75.8365, type: 'commercial' },
  { id: 2, name: 'Ludhiana Railway Station', lat: 30.9085, lng: 75.8615, type: 'transit' },
  { id: 3, name: 'PAU Gate 1 (Ferozepur Rd)', lat: 30.9019, lng: 75.8080, type: 'institutional' },
  { id: 4, name: 'Model Town Gol Market', lat: 30.8875, lng: 75.8350, type: 'residential' },
  { id: 5, name: 'Sarabha Nagar Market (Kipps)', lat: 30.8870, lng: 75.8115, type: 'commercial' },
  { id: 6, name: 'Civil Lines (Club Road)', lat: 30.9090, lng: 75.8380, type: 'institutional' },
  { id: 7, name: 'Fountain Chowk', lat: 30.9065, lng: 75.8440, type: 'commercial' },
  { id: 8, name: 'Aarti Chowk', lat: 30.8990, lng: 75.8230, type: 'transit' },
  { id: 9, name: 'Chaura Bazar (Ferozepur Rd)', lat: 30.9160, lng: 75.8560, type: 'commercial' },
  { id: 10, name: 'Mall Road', lat: 30.9040, lng: 75.8390, type: 'commercial' },
  { id: 11, name: 'Dugri Phase 1', lat: 30.8670, lng: 75.8450, type: 'residential' },
  { id: 12, name: 'BRS Nagar Main Market', lat: 30.8820, lng: 75.7950, type: 'residential' },
  { id: 13, name: 'Pakhowal Road (Daad)', lat: 30.8710, lng: 75.8200, type: 'commercial' },
  { id: 14, name: 'Samrala Chowk', lat: 30.9180, lng: 75.8850, type: 'transit' },
  { id: 15, name: 'Jamalpur Chowk', lat: 30.8980, lng: 75.9080, type: 'transit' },
  { id: 16, name: 'Focal Point Phase 5', lat: 30.8750, lng: 75.9150, type: 'industrial' },
  { id: 17, name: 'Gill Road (GNE College)', lat: 30.8600, lng: 75.8590, type: 'institutional' },
  { id: 18, name: 'Haibowal Kalan', lat: 30.9250, lng: 75.8250, type: 'residential' },
  { id: 19, name: 'Rishi Nagar', lat: 30.9150, lng: 75.8080, type: 'residential' },
  { id: 20, name: 'Salem Tabri', lat: 30.9380, lng: 75.8520, type: 'residential' },
  { id: 21, name: 'Ayali Chowk', lat: 30.8920, lng: 75.7650, type: 'transit' },
  { id: 22, name: 'Chandigarh Road (Vardhman)', lat: 30.9050, lng: 75.9250, type: 'industrial' },
  { id: 23, name: 'Giaspura Industrial Hub', lat: 30.8520, lng: 75.8890, type: 'industrial' },
  { id: 24, name: 'Tajpur Road', lat: 30.9320, lng: 75.9010, type: 'industrial' },
  { id: 25, name: 'Dhandari Kalan', lat: 30.8650, lng: 75.9320, type: 'transit' },
  { id: 26, name: 'South City (Barewal Rd)', lat: 30.9210, lng: 75.7720, type: 'residential' },
  { id: 27, name: 'Aggar Nagar', lat: 30.8910, lng: 75.7990, type: 'residential' }
];

/**
 * Returns preset for "Ludhiana Demo (12 stops)"
 * Centered around core trade hubs with Clock Tower depot.
 */
export function getLudhianaDemo12() {
  const selectedIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  return selectedIndices.map((origIdx, newIdx) => {
    const loc = LUDHIANA_LOCATIONS[origIdx];
    return {
      id: newIdx,
      name: loc.name,
      lat: loc.lat,
      lng: loc.lng,
      x: (loc.lng - 75.75) * 4000,
      y: (30.95 - loc.lat) * 4000,
      isDepot: newIdx === 0
    };
  });
}

/**
 * Returns preset for "Ludhiana Large (25 stops)"
 * Comprehensive coverage spanning the entire district.
 */
export function getLudhianaLarge25() {
  return LUDHIANA_LOCATIONS.slice(0, 25).map((loc, idx) => ({
    id: idx,
    name: loc.name,
    lat: loc.lat,
    lng: loc.lng,
    x: (loc.lng - 75.75) * 4000,
    y: (30.95 - loc.lat) * 4000,
    isDepot: idx === 0
  }));
}

/**
 * Generates N randomly scattered shops within Ludhiana geographical bounds
 * or offline plane bounds.
 * 
 * @param {number} count Total points to generate (5 to 60)
 * @param {boolean} isOffline 
 * @param {Object} bounds Optional bounding box
 * @returns {Array<{id: number, name: string, lat: number, lng: number, x: number, y: number, isDepot: boolean}>}
 */
export function generateRandomPoints(count = 15, isOffline = false, bounds = null) {
  const minLat = bounds?.minLat || 30.8550;
  const maxLat = bounds?.maxLat || 30.9350;
  const minLng = bounds?.minLng || 75.7800;
  const maxLng = bounds?.maxLng || 75.9200;

  const points = [];

  for (let i = 0; i < count; i++) {
    const lat = minLat + Math.random() * (maxLat - minLat);
    const lng = minLng + Math.random() * (maxLng - minLng);
    const x = isOffline ? 50 + Math.random() * 700 : (lng - 75.75) * 4000;
    const y = isOffline ? 50 + Math.random() * 500 : (30.95 - lat) * 4000;

    points.push({
      id: i,
      name: i === 0 ? 'Main Dispatch Depot' : `Delivery Stop #${i}`,
      lat: parseFloat(lat.toFixed(6)),
      lng: parseFloat(lng.toFixed(6)),
      x: Math.round(x),
      y: Math.round(y),
      isDepot: i === 0
    });
  }

  return points;
}
