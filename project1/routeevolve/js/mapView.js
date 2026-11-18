/**
 * mapView.js - Dual-Mode Geographic & Offline Visualizer for RouteEvolve
 * 
 * Implements:
 * 1. Leaflet Interactive Map (with local Leaflet assets in /vendor)
 * 2. Pure Canvas Offline Plane View (zero internet / zero tile dependency)
 * 3. Best route rendering with direction indicators & new-best pulse flash
 * 4. Faint ghost line of previous best route for visual comparison
 * 5. Top 5 population route preview overlay
 * 6. Interactive point manipulation: click to add, drag to move, right-click to delete, set as depot
 */

import { LUDHIANA_CENTER } from './presets.js';

export class RouteMapView {
  /**
   * @param {HTMLElement} mapContainer 
   * @param {HTMLCanvasElement} offlineCanvas 
   * @param {Object} callbacks Event hooks for stop edits
   */
  constructor(mapContainer, offlineCanvas, callbacks = {}) {
    this.mapContainer = mapContainer;
    this.offlineCanvas = offlineCanvas;
    this.callbacks = callbacks; // onAddStop, onMoveStop, onDeleteStop, onSetDepot

    this.isOffline = false;
    this.isDark = false;
    this.showPopulation = false;

    this.cities = []; // Array of { id, name, lat, lng, x, y, isDepot }
    this.depotId = 0;
    this.bestRoute = null; // number[] of indices
    this.previousBestRoute = null; // number[]
    this.topRoutes = []; // Array of number[]

    // Leaflet specific objects
    this.leafletMap = null;
    this.markersGroup = null;
    this.bestRouteLayer = null;
    this.ghostRouteLayer = null;
    this.populationLayersGroup = null;
    this.arrowMarkersGroup = null;

    // Offline Canvas specific
    this.canvasCtx = offlineCanvas.getContext('2d');
    this.draggedPointIdx = -1;
    this.isDragging = false;

    this.initLeaflet();
    this.initOfflineCanvas();
  }

  // ==========================================================================
  // LEAFLET INITIALIZATION & RENDERING
  // ==========================================================================

  initLeaflet() {
    if (typeof L === 'undefined') {
      console.warn('[RouteMapView] Leaflet library not loaded, falling back to offline canvas.');
      this.setOfflineMode(true);
      return;
    }

    try {
      this.leafletMap = L.map(this.mapContainer, {
        center: [LUDHIANA_CENTER.lat, LUDHIANA_CENTER.lng],
        zoom: LUDHIANA_CENTER.zoom,
        zoomControl: true,
        attributionControl: false
      });

      this.updateTileLayer();

      this.populationLayersGroup = L.layerGroup().addTo(this.leafletMap);
      this.ghostRouteLayer = L.polyline([], {
        color: '#2b5f6e',
        weight: 2,
        opacity: 0.35,
        dashArray: '4, 6'
      }).addTo(this.leafletMap);

      this.bestRouteLayer = L.polyline([], {
        color: '#c73e1d',
        weight: 4.5,
        opacity: 0.95,
        lineJoin: 'round',
        lineCap: 'round',
        className: 'best-route-path'
      }).addTo(this.leafletMap);

      this.arrowMarkersGroup = L.layerGroup().addTo(this.leafletMap);
      this.markersGroup = L.layerGroup().addTo(this.leafletMap);

      // Map Click -> Add Stop
      this.leafletMap.on('click', (e) => {
        if (this.callbacks.onAddStop) {
          this.callbacks.onAddStop({
            lat: parseFloat(e.latlng.lat.toFixed(6)),
            lng: parseFloat(e.latlng.lng.toFixed(6))
          });
        }
      });
    } catch (err) {
      console.error('[RouteMapView] Error initializing Leaflet:', err);
      this.setOfflineMode(true);
    }
  }

  updateTileLayer() {
    if (!this.leafletMap) return;

    if (this.tileLayer) {
      this.leafletMap.removeLayer(this.tileLayer);
    }

    // CartoDB Positron (light) and Dark Matter (dark) tile layers
    const tileUrl = this.isDark
      ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    this.tileLayer = L.tileLayer(tileUrl, {
      maxZoom: 19,
      subdomains: 'abc'
    });

    // If online tiles fail, gracefully inform the user to use Offline Canvas mode
    this.tileLayer.on('tileerror', () => {
      // Quietly log once
      console.info('[RouteMapView] Map tiles unavailable. Switch to Offline Canvas Mode for zero-internet usage.');
    });

    this.tileLayer.addTo(this.leafletMap);
  }

  // ==========================================================================
  // OFFLINE CANVAS INITIALIZATION & INTERACTIVITY
  // ==========================================================================

  initOfflineCanvas() {
    this.resizeCanvas();
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      if (this.isOffline) this.renderCanvas();
    });

    // Canvas Mouse Interactions (Add, Drag, Right-click Delete)
    this.offlineCanvas.addEventListener('mousedown', (e) => this.onCanvasMouseDown(e));
    this.offlineCanvas.addEventListener('mousemove', (e) => this.onCanvasMouseMove(e));
    this.offlineCanvas.addEventListener('mouseup', () => this.onCanvasMouseUp());
    this.offlineCanvas.addEventListener('contextmenu', (e) => this.onCanvasContextMenu(e));
  }

  resizeCanvas() {
    const rect = this.offlineCanvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.floor(rect.width) || 800;
    const height = Math.floor(rect.height) || 600;

    this.offlineCanvas.width = width * dpr;
    this.offlineCanvas.height = height * dpr;
    this.offlineCanvas.style.width = `${width}px`;
    this.offlineCanvas.style.height = `${height}px`;

    this.canvasCtx.resetTransform?.();
    this.canvasCtx.scale(dpr, dpr);
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  onCanvasMouseDown(e) {
    if (!this.isOffline) return;
    const rect = this.offlineCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicked an existing stop within 14px radius
    const hitIdx = this.findCityAtCanvasPos(x, y, 14);
    if (hitIdx !== -1) {
      if (e.button === 0) {
        // Left click: begin dragging
        this.draggedPointIdx = hitIdx;
        this.isDragging = true;
      }
    } else if (e.button === 0) {
      // Left click on empty space: Add new stop
      if (this.callbacks.onAddStop) {
        this.callbacks.onAddStop({
          x: Math.round(x),
          y: Math.round(y),
          lat: 30.95 - (y / 4000),
          lng: 75.75 + (x / 4000)
        });
      }
    }
  }

  onCanvasMouseMove(e) {
    if (!this.isOffline) return;
    const rect = this.offlineCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (this.isDragging && this.draggedPointIdx !== -1) {
      const city = this.cities[this.draggedPointIdx];
      if (city) {
        city.x = Math.round(x);
        city.y = Math.round(y);
        city.lat = 30.95 - (y / 4000);
        city.lng = 75.75 + (x / 4000);
        this.renderCanvas();

        if (this.callbacks.onMoveStop) {
          this.callbacks.onMoveStop(this.draggedPointIdx, city);
        }
      }
    } else {
      // Hover cursor feedback
      const hoverIdx = this.findCityAtCanvasPos(x, y, 14);
      this.offlineCanvas.style.cursor = hoverIdx !== -1 ? 'grab' : 'crosshair';
    }
  }

  onCanvasMouseUp() {
    if (this.isDragging) {
      this.isDragging = false;
      this.draggedPointIdx = -1;
      this.offlineCanvas.style.cursor = 'default';
    }
  }

  onCanvasContextMenu(e) {
    if (!this.isOffline) return;
    e.preventDefault();
    const rect = this.offlineCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hitIdx = this.findCityAtCanvasPos(x, y, 14);
    if (hitIdx !== -1) {
      const city = this.cities[hitIdx];
      // Simple prompt or toggle: if already depot, delete; else prompt
      if (!city.isDepot) {
        const choice = confirm(`Stop #${hitIdx}: "${city.name}"\n\nClick OK to SET AS DEPOT.\nClick Cancel to DELETE this stop.`);
        if (choice) {
          if (this.callbacks.onSetDepot) this.callbacks.onSetDepot(hitIdx);
        } else {
          if (this.callbacks.onDeleteStop) this.callbacks.onDeleteStop(hitIdx);
        }
      } else {
        alert('This is the designated start depot. To change depot, right-click another stop.');
      }
    }
  }

  findCityAtCanvasPos(x, y, radius = 14) {
    for (let i = 0; i < this.cities.length; i++) {
      const c = this.getCanvasPoint(this.cities[i]);
      const dx = c.x - x;
      const dy = c.y - y;
      if (Math.sqrt(dx * dx + dy * dy) <= radius) {
        return i;
      }
    }
    return -1;
  }

  getCanvasPoint(city) {
    if (city.x !== undefined && city.y !== undefined) {
      return { x: city.x, y: city.y };
    }
    // Project lat/lng to canvas coordinates
    const x = (city.lng - 75.75) * 4000;
    const y = (30.95 - city.lat) * 4000;
    return { x, y };
  }

  // ==========================================================================
  // MODE & THEME TOGGLES
  // ==========================================================================

  setOfflineMode(isOffline) {
    this.isOffline = isOffline;
    if (isOffline) {
      this.mapContainer.style.display = 'none';
      this.offlineCanvas.style.display = 'block';
      this.resizeCanvas();
      this.syncCanvasCoordinates();
      this.renderCanvas();
    } else {
      this.mapContainer.style.display = 'block';
      this.offlineCanvas.style.display = 'none';
      if (this.leafletMap) {
        this.leafletMap.invalidateSize();
        this.renderLeaflet();
      }
    }
  }

  setTheme(isDark) {
    this.isDark = isDark;
    this.updateTileLayer();
    if (this.isOffline) {
      this.renderCanvas();
    } else {
      this.renderLeaflet();
    }
  }

  setShowPopulation(show) {
    this.showPopulation = show;
    if (this.isOffline) {
      this.renderCanvas();
    } else {
      this.renderLeafletPopulation();
    }
  }

  // ==========================================================================
  // DATA UPDATES & RENDERING
  // ==========================================================================

  setCities(cities, depotId = 0) {
    this.cities = cities.map((c, idx) => ({
      ...c,
      id: idx,
      isDepot: idx === depotId
    }));
    this.depotId = depotId;

    if (this.isOffline) {
      this.syncCanvasCoordinates();
      this.renderCanvas();
    } else {
      this.renderLeaflet();
    }
  }

  syncCanvasCoordinates() {
    if (!this.cities.length || !this.canvasWidth) return;

    // Check if points have canvas x,y. If not, auto-scale them to fit canvas comfortably
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const c of this.cities) {
      if (c.lat < minLat) minLat = c.lat;
      if (c.lat > maxLat) maxLat = c.lat;
      if (c.lng < minLng) minLng = c.lng;
      if (c.lng > maxLng) maxLng = c.lng;
    }

    const pad = 60;
    const availW = Math.max(100, this.canvasWidth - pad * 2);
    const availH = Math.max(100, this.canvasHeight - pad * 2);
    const spanLat = maxLat - minLat || 0.01;
    const spanLng = maxLng - minLng || 0.01;

    for (const c of this.cities) {
      if (c.x === undefined || c.y === undefined) {
        c.x = Math.round(pad + ((c.lng - minLng) / spanLng) * availW);
        c.y = Math.round(pad + ((maxLat - c.lat) / spanLat) * availH);
      }
    }
  }

  updateRoute(bestRoute, topRoutes = [], isNewBest = false) {
    if (this.bestRoute && isNewBest) {
      this.previousBestRoute = [...this.bestRoute];
    }
    this.bestRoute = bestRoute;
    this.topRoutes = topRoutes;

    if (this.isOffline) {
      this.renderCanvas();
    } else {
      this.renderLeafletRoute(isNewBest);
    }
  }

  resetRoutes() {
    this.bestRoute = null;
    this.previousBestRoute = null;
    this.topRoutes = [];

    if (this.isOffline) {
      this.renderCanvas();
    } else {
      if (this.bestRouteLayer) this.bestRouteLayer.setLatLngs([]);
      if (this.ghostRouteLayer) this.ghostRouteLayer.setLatLngs([]);
      if (this.populationLayersGroup) this.populationLayersGroup.clearLayers();
      if (this.arrowMarkersGroup) this.arrowMarkersGroup.clearLayers();
    }
  }

  // ==========================================================================
  // LEAFLET RENDER IMPLEMENTATION
  // ==========================================================================

  renderLeaflet() {
    if (!this.leafletMap || !this.markersGroup) return;

    this.markersGroup.clearLayers();

    const bounds = [];

    this.cities.forEach((city, idx) => {
      const latlng = [city.lat, city.lng];
      bounds.push(latlng);

      const isDepot = idx === this.depotId;
      const markerHtml = isDepot
        ? `<div class="depot-marker-pin" title="${city.name} (Start Depot)"><span class="depot-star">★</span><span class="marker-label">DEPOT</span></div>`
        : `<div class="city-marker-pin" title="${city.name}"><span class="marker-num">${idx}</span></div>`;

      const customIcon = L.divIcon({
        className: 'custom-map-icon',
        html: markerHtml,
        iconSize: isDepot ? [36, 36] : [26, 26],
        iconAnchor: isDepot ? [18, 18] : [13, 13]
      });

      const marker = L.marker(latlng, {
        icon: customIcon,
        draggable: true
      });

      // Draggable Stop
      marker.on('dragend', (e) => {
        const newPos = e.target.getLatLng();
        city.lat = parseFloat(newPos.lat.toFixed(6));
        city.lng = parseFloat(newPos.lng.toFixed(6));
        if (this.callbacks.onMoveStop) {
          this.callbacks.onMoveStop(idx, city);
        }
      });

      // Marker Popup Menu
      const popupContent = document.createElement('div');
      popupContent.className = 'marker-popup-content';
      popupContent.innerHTML = `
        <div class="popup-title"><strong>${isDepot ? '★ ' : ''}${city.name}</strong></div>
        <div class="popup-sub">Stop #${idx} &bull; ${city.lat.toFixed(4)}, ${city.lng.toFixed(4)}</div>
        <div class="popup-actions">
          ${!isDepot ? `<button class="popup-btn depot-btn" data-action="depot">Set as Depot</button>` : ''}
          <button class="popup-btn delete-btn" data-action="delete">Delete Stop</button>
        </div>
      `;

      popupContent.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
        if (this.callbacks.onDeleteStop) this.callbacks.onDeleteStop(idx);
        this.leafletMap.closePopup();
      });

      popupContent.querySelector('[data-action="depot"]')?.addEventListener('click', () => {
        if (this.callbacks.onSetDepot) this.callbacks.onSetDepot(idx);
        this.leafletMap.closePopup();
      });

      marker.bindPopup(popupContent);
      this.markersGroup.addLayer(marker);
    });

    if (bounds.length > 1) {
      this.leafletMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }

    this.renderLeafletRoute(false);
  }

  renderLeafletRoute(isNewBest = false) {
    if (!this.leafletMap) return;

    // 1. Ghost Route (Previous best)
    if (this.previousBestRoute && this.previousBestRoute.length > 1) {
      const ghostCoords = this.previousBestRoute.map(idx => [this.cities[idx].lat, this.cities[idx].lng]);
      ghostCoords.push(ghostCoords[0]); // Return to depot
      this.ghostRouteLayer.setLatLngs(ghostCoords);
    } else {
      this.ghostRouteLayer.setLatLngs([]);
    }

    // 2. Population routes overlay
    this.renderLeafletPopulation();

    // 3. Best Route
    if (this.bestRoute && this.bestRoute.length > 1) {
      const bestCoords = this.bestRoute.map(idx => [this.cities[idx].lat, this.cities[idx].lng]);
      bestCoords.push(bestCoords[0]); // Return to depot
      this.bestRouteLayer.setLatLngs(bestCoords);

      // Flash/pulse animation on new best
      if (isNewBest) {
        const pathEl = this.bestRouteLayer.getElement();
        if (pathEl) {
          pathEl.classList.remove('route-pulse');
          // Trigger reflow
          void pathEl.offsetWidth;
          pathEl.classList.add('route-pulse');
        }
      }

      // Add directional arrow indicators along route
      this.renderLeafletArrows(bestCoords);
    } else {
      this.bestRouteLayer.setLatLngs([]);
      this.arrowMarkersGroup.clearLayers();
    }
  }

  renderLeafletArrows(coords) {
    this.arrowMarkersGroup.clearLayers();
    if (coords.length < 2) return;

    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i];
      const p2 = coords[i + 1];

      // Midpoint
      const midLat = (p1[0] + p2[0]) / 2;
      const midLng = (p1[1] + p2[1]) / 2;

      // Bearing angle in degrees
      const dLng = (p2[1] - p1[1]) * Math.PI / 180;
      const lat1Rad = p1[0] * Math.PI / 180;
      const lat2Rad = p2[0] * Math.PI / 180;
      const y = Math.sin(dLng) * Math.cos(lat2Rad);
      const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
      const angle = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;

      const arrowIcon = L.divIcon({
        className: 'route-arrow-icon',
        html: `<div style="transform: rotate(${angle}deg);"><svg width="12" height="12" viewBox="0 0 10 10"><polygon points="0,1 10,5 0,9 3,5" fill="#c73e1d"/></svg></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6]
      });

      this.arrowMarkersGroup.addLayer(L.marker([midLat, midLng], { icon: arrowIcon, interactive: false }));
    }
  }

  renderLeafletPopulation() {
    this.populationLayersGroup.clearLayers();
    if (!this.showPopulation || !this.topRoutes || !this.topRoutes.length) return;

    this.topRoutes.forEach((route) => {
      if (route.length > 1) {
        const coords = route.map(idx => [this.cities[idx].lat, this.cities[idx].lng]);
        coords.push(coords[0]);
        const poly = L.polyline(coords, {
          color: '#3b7a8c',
          weight: 1.2,
          opacity: 0.22,
          interactive: false
        });
        this.populationLayersGroup.addLayer(poly);
      }
    });
  }

  // ==========================================================================
  // OFFLINE CANVAS RENDER IMPLEMENTATION
  // ==========================================================================

  renderCanvas() {
    const ctx = this.canvasCtx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;
    if (!w || !h) return;

    ctx.clearRect(0, 0, w, h);

    // Canvas Background
    const bg = this.isDark ? '#141c24' : '#f7f4ee';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Draw Subtle Cartographer Grid
    this.drawCanvasGrid(ctx, w, h);

    // Empty State if < 2 cities
    if (this.cities.length < 2) {
      ctx.fillStyle = this.isDark ? '#94a3b8' : '#78716c';
      ctx.font = '14px "Source Serif 4", serif';
      ctx.textAlign = 'center';
      ctx.fillText('Click anywhere on this canvas to place delivery stops.', w / 2, h / 2 - 10);
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillText('Right-click any stop to delete or set as depot.', w / 2, h / 2 + 14);
      return;
    }

    // 1. Draw Population Overlay
    if (this.showPopulation && this.topRoutes.length) {
      ctx.save();
      ctx.strokeStyle = this.isDark ? 'rgba(94, 234, 212, 0.18)' : 'rgba(43, 95, 110, 0.22)';
      ctx.lineWidth = 1;
      this.topRoutes.forEach((route) => {
        if (route.length > 1) {
          ctx.beginPath();
          const start = this.getCanvasPoint(this.cities[route[0]]);
          ctx.moveTo(start.x, start.y);
          for (let i = 1; i < route.length; i++) {
            const pt = this.getCanvasPoint(this.cities[route[i]]);
            ctx.lineTo(pt.x, pt.y);
          }
          ctx.lineTo(start.x, start.y);
          ctx.stroke();
        }
      });
      ctx.restore();
    }

    // 2. Draw Previous Best Ghost Route
    if (this.previousBestRoute && this.previousBestRoute.length > 1) {
      ctx.save();
      ctx.strokeStyle = this.isDark ? 'rgba(56, 189, 248, 0.35)' : 'rgba(43, 95, 110, 0.4)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      const start = this.getCanvasPoint(this.cities[this.previousBestRoute[0]]);
      ctx.moveTo(start.x, start.y);
      for (let i = 1; i < this.previousBestRoute.length; i++) {
        const pt = this.getCanvasPoint(this.cities[this.previousBestRoute[i]]);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.lineTo(start.x, start.y);
      ctx.stroke();
      ctx.restore();
    }

    // 3. Draw Best Route with Arrows
    if (this.bestRoute && this.bestRoute.length > 1) {
      ctx.save();
      ctx.strokeStyle = this.isDark ? '#ff6b4a' : '#c73e1d';
      ctx.lineWidth = 3.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      ctx.beginPath();
      const start = this.getCanvasPoint(this.cities[this.bestRoute[0]]);
      ctx.moveTo(start.x, start.y);

      for (let i = 1; i < this.bestRoute.length; i++) {
        const pt = this.getCanvasPoint(this.cities[this.bestRoute[i]]);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.lineTo(start.x, start.y);
      ctx.stroke();

      // Arrowheads at midpoints
      for (let i = 0; i < this.bestRoute.length; i++) {
        const p1 = this.getCanvasPoint(this.cities[this.bestRoute[i]]);
        const p2 = this.getCanvasPoint(this.cities[this.bestRoute[(i + 1) % this.bestRoute.length]]);
        this.drawCanvasArrow(ctx, p1.x, p1.y, p2.x, p2.y, this.isDark ? '#ff6b4a' : '#c73e1d');
      }

      ctx.restore();
    }

    // 4. Draw City Markers
    this.cities.forEach((city, idx) => {
      const pt = this.getCanvasPoint(city);
      const isDepot = idx === this.depotId;

      ctx.save();
      if (isDepot) {
        // Depot Badge
        ctx.fillStyle = '#b45309'; // Amber Gold
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', pt.x, pt.y);

        // Depot Label
        ctx.fillStyle = this.isDark ? '#f8fafc' : '#1e293b';
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.fillText(`DEPOT (${city.name})`, pt.x, pt.y + 22);
      } else {
        // City Pin
        ctx.fillStyle = this.isDark ? '#334155' : '#1e293b';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${idx}`, pt.x, pt.y);

        // Name label
        ctx.fillStyle = this.isDark ? '#94a3b8' : '#57534e';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillText(city.name, pt.x, pt.y - 14);
      }
      ctx.restore();
    });
  }

  drawCanvasGrid(ctx, w, h) {
    ctx.save();
    ctx.strokeStyle = this.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(30, 42, 56, 0.06)';
    ctx.lineWidth = 1;
    const step = 40;

    for (let x = 0; x <= w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    for (let y = 0; y <= h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Grid coordinates watermarks
    ctx.fillStyle = this.isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(30, 42, 56, 0.15)';
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('OFFLINE PLANE COORDINATES (EUCLIDEAN TSP MODE)', 10, 16);
    ctx.restore();
  }

  drawCanvasArrow(ctx, x1, y1, x2, y2, color) {
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const arrowLen = 9;

    ctx.save();
    ctx.fillStyle = color;
    ctx.translate(midX, midY);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(arrowLen, 0);
    ctx.lineTo(-arrowLen, -arrowLen * 0.6);
    ctx.lineTo(-arrowLen * 0.4, 0);
    ctx.lineTo(-arrowLen, arrowLen * 0.6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}
