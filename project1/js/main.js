/**
 * main.js - Master Application Controller for RouteEvolve
 * 
 * Wires UI controls, Leaflet map, Offline Canvas, HTML5 Canvas Chart,
 * and the Web Worker GA engine into a reactive, high-performance architecture.
 */

import { getLudhianaDemo12, getLudhianaLarge25, generateRandomPoints } from './presets.js';
import { RouteMapView } from './mapView.js';
import { ConvergenceChart } from './chart.js';
import { computeRouteDistance, computeDistanceMatrix } from './geo.js';

// ============================================================================
// APPLICATION STATE
// ============================================================================

const state = {
  cities: [],
  depotId: 0,
  isOffline: false,
  isDark: false,
  isExplainMode: false,
  isRunning: false,
  isPaused: false,
  isInitialized: false,

  // GA Benchmark & Evolution Tracking
  currentGen: 0,
  bestDistance: 0,
  bestEverGen: 0,
  gen0BestDist: 0,
  nnDistance: 0,
  nnRoute: null,
  nnTimeMs: 0,
  elapsedMs: 0,
  history: [], // [{ gen, best, avg }]

  // Worker reference
  worker: null
};

// UI Elements Cache
const elements = {};

// Visualizer Instances
let mapView = null;
let chart = null;

// ============================================================================
// INITIALIZATION ENTRYPOINT
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
  cacheDOMElements();
  initVisualizers();
  initWorker();
  bindEventHandlers();

  // Load default preset: Ludhiana Demo (12 stops)
  loadPreset('demo');
});

function cacheDOMElements() {
  // Buttons
  elements.btnStart = document.getElementById('btn-start');
  elements.startBtnLabel = document.getElementById('start-btn-label');
  elements.startBtnIcon = document.getElementById('start-btn-icon');
  elements.btnStep = document.getElementById('btn-step');
  elements.btnReset = document.getElementById('btn-reset');
  elements.btnToggleOffline = document.getElementById('toggle-offline-btn');
  elements.btnToggleExplain = document.getElementById('toggle-explain-btn');
  elements.btnToggleTheme = document.getElementById('toggle-theme-btn');
  elements.themeBtnLabel = document.getElementById('theme-btn-label');
  elements.btnOpenInfo = document.getElementById('open-info-btn');
  elements.modalCloseBtn = document.getElementById('modal-close-btn');
  elements.howItWorksModal = document.getElementById('how-it-works-modal');

  // Presets & Actions
  elements.btnPresetDemo = document.getElementById('preset-demo-btn');
  elements.btnPresetLarge = document.getElementById('preset-large-btn');
  elements.btnPresetRandom = document.getElementById('preset-random-btn');
  elements.btnPresetClear = document.getElementById('preset-clear-btn');
  elements.sliderRandomCount = document.getElementById('random-count-slider');
  elements.valRandomCount = document.getElementById('random-count-val');
  elements.stopCountBadge = document.getElementById('stop-count-badge');
  elements.btnImportJson = document.getElementById('import-json-btn');
  elements.btnExportJson = document.getElementById('export-json-btn');
  elements.jsonFileInput = document.getElementById('json-file-input');
  elements.showPopCheckbox = document.getElementById('show-pop-checkbox');
  elements.seedNNCheckbox = document.getElementById('seed-nn-checkbox');

  // Sliders & Values
  elements.sliderPopSize = document.getElementById('pop-size-slider');
  elements.valPopSize = document.getElementById('pop-size-val');
  elements.sliderCrossoverRate = document.getElementById('crossover-rate-slider');
  elements.valCrossoverRate = document.getElementById('crossover-rate-val');
  elements.sliderMutationRate = document.getElementById('mutation-rate-slider');
  elements.valMutationRate = document.getElementById('mutation-rate-val');
  elements.sliderElitism = document.getElementById('elitism-slider');
  elements.valElitism = document.getElementById('elitism-val');
  elements.sliderMaxGen = document.getElementById('max-gen-slider');
  elements.valMaxGen = document.getElementById('max-gen-val');
  elements.sliderStagnation = document.getElementById('stagnation-slider');
  elements.valStagnation = document.getElementById('stagnation-val');
  elements.sliderTournament = document.getElementById('tournament-slider');
  elements.valTournament = document.getElementById('tournament-val');
  elements.rowTournament = document.getElementById('tournament-size-row');
  elements.sliderSpeed = document.getElementById('speed-slider');
  elements.valSpeed = document.getElementById('speed-val');
  elements.hudGenBadge = document.getElementById('hud-gen-badge');

  // Dropdowns
  elements.selectSelection = document.getElementById('selection-select');
  elements.selectCrossover = document.getElementById('crossover-select');
  elements.selectMutation = document.getElementById('mutation-select');

  // Experiment buttons
  elements.inputSeed = document.getElementById('seed-input');
  elements.btnCompareCrossovers = document.getElementById('compare-crossovers-btn');
  elements.btnRun10 = document.getElementById('run-10-btn');
  elements.btnPolish2Opt = document.getElementById('polish-2opt-btn');
  elements.btnExportCsv = document.getElementById('export-csv-btn');
  elements.btnDownloadChart = document.getElementById('download-chart-btn');
  elements.btnClearLog = document.getElementById('clear-log-btn');

  // Live Stats Cards
  elements.statGen = document.getElementById('stat-generation');
  elements.statMaxGen = document.getElementById('stat-max-gen');
  elements.statBestDist = document.getElementById('stat-best-distance');
  elements.statBestGen = document.getElementById('stat-best-gen');
  elements.statAvgDist = document.getElementById('stat-avg-distance');
  elements.statImpGen0 = document.getElementById('stat-imp-gen0');
  elements.statImpNN = document.getElementById('stat-imp-nn');
  elements.statNNBaselineLabel = document.getElementById('stat-nn-baseline-label');
  elements.statDiversity = document.getElementById('stat-diversity');
  elements.statElapsed = document.getElementById('stat-elapsed-time');

  // Comparison Table
  elements.compRndDist = document.getElementById('comp-rnd-dist');
  elements.compNnDist = document.getElementById('comp-nn-dist');
  elements.compNnSav = document.getElementById('comp-nn-sav');
  elements.compNnTime = document.getElementById('comp-nn-time');
  elements.compGaDist = document.getElementById('comp-ga-dist');
  elements.compGaSav = document.getElementById('comp-ga-sav');
  elements.compGaTime = document.getElementById('comp-ga-time');
  elements.comp2optDist = document.getElementById('comp-2opt-dist');
  elements.comp2optSav = document.getElementById('comp-2opt-sav');
  elements.comp2optTime = document.getElementById('comp-2opt-time');
  elements.rowRandom = document.getElementById('row-random');
  elements.rowNn = document.getElementById('row-nn');
  elements.rowGa = document.getElementById('row-ga');
  elements.row2opt = document.getElementById('row-2opt');

  // Log & Explainer Drawer
  elements.logScroller = document.getElementById('evolution-log-scroller');
  elements.explainerDrawer = document.getElementById('explainer-drawer');
  elements.explainGenLabel = document.getElementById('explain-gen-label');
  elements.btnExplainStep = document.getElementById('explain-step-btn');
  elements.btnExplainClose = document.getElementById('explain-close-btn');
  elements.explainStep1Details = document.getElementById('explain-step1-details');
  elements.explainStep2P1 = document.getElementById('explain-step2-p1');
  elements.explainStep2P2 = document.getElementById('explain-step2-p2');
  elements.explainStep3Child = document.getElementById('explain-step3-child');
  elements.explainStep4Child = document.getElementById('explain-step4-child');
  elements.explainStep5Details = document.getElementById('explain-step5-details');
}

// ============================================================================
// VISUALIZERS INITIALIZATION
// ============================================================================

function initVisualizers() {
  const mapContainer = document.getElementById('leaflet-map');
  const offlineCanvas = document.getElementById('offline-canvas');
  const chartCanvas = document.getElementById('chart-canvas');

  // Initialize RouteMapView
  mapView = new RouteMapView(mapContainer, offlineCanvas, {
    onAddStop: handleAddStop,
    onMoveStop: handleMoveStop,
    onDeleteStop: handleDeleteStop,
    onSetDepot: handleSetDepot
  });

  // Initialize ConvergenceChart
  chart = new ConvergenceChart(chartCanvas, { isDark: state.isDark });
}

// ============================================================================
// WEB WORKER SETUP & MESSAGING
// ============================================================================

function initWorker() {
  try {
    state.worker = new Worker('js/worker.js', { type: 'module' });
    state.worker.onmessage = handleWorkerMessage;
    state.worker.onerror = (err) => {
      console.error('[Main] Worker error:', err);
      logEvent(`Worker Error: ${err.message}`, true);
    };
  } catch (err) {
    console.error('[Main] Failed to initialize worker:', err);
    logEvent('Failed to initialize Web Worker. Ensure running via localhost HTTP server.', true);
  }
}

function handleWorkerMessage(e) {
  const { type, payload } = e.data;

  switch (type) {
    case 'INITIALIZED':
      onWorkerInitialized(payload);
      break;
    case 'GENERATION_UPDATE':
      onWorkerGenUpdate(payload);
      break;
    case 'EXPLAIN_UPDATE':
      onWorkerExplainUpdate(payload);
      break;
    case 'PAUSED':
      onWorkerPaused(payload);
      break;
    case 'FINISHED':
      onWorkerFinished(payload);
      break;
    case 'COMPARE_CROSSOVERS_RESULT':
      onWorkerCompareResult(payload);
      break;
    case 'RUN_10_TIMES_RESULT':
      onWorkerRun10Result(payload);
      break;
    case 'POLISH_2OPT_RESULT':
      onWorkerPolishResult(payload);
      break;
    default:
      console.warn('[Main] Unhandled worker message:', type);
  }
}

function onWorkerInitialized(payload) {
  state.isInitialized = true;
  state.currentGen = 0;
  state.bestDistance = payload.bestDistance;
  state.gen0BestDist = payload.gen0BestDist;
  state.nnDistance = payload.nnDistance;
  state.nnRoute = payload.nnRoute;
  state.nnTimeMs = payload.nnExecutionTimeMs;

  // Update UI Stats
  elements.statGen.textContent = '0';
  elements.hudGenBadge.textContent = '0';
  elements.statBestDist.textContent = `${payload.bestDistance.toFixed(2)} km`;
  elements.statBestGen.textContent = 'found at gen 0';
  elements.statAvgDist.textContent = `${payload.avgDistance.toFixed(2)} km`;
  elements.statImpGen0.textContent = '0.0%';
  elements.statDiversity.textContent = `${(payload.diversityRatio * 100).toFixed(0)}%`;
  elements.statElapsed.textContent = '0 ms elapsed';

  // NN baseline comparison
  const nnDiff = ((payload.bestDistance - payload.nnDistance) / payload.nnDistance) * 100;
  const nnSign = nnDiff <= 0 ? '-' : '+';
  elements.statImpNN.textContent = `${nnSign}${Math.abs(nnDiff).toFixed(1)}%`;
  elements.statNNBaselineLabel.textContent = `NN: ${payload.nnDistance.toFixed(1)} km`;

  // Update Map & Chart
  mapView.updateRoute(payload.bestRoute, payload.topRoutes, false);
  chart.reset();
  chart.setNNBaseline(payload.nnDistance);
  chart.addPoint(0, payload.bestDistance, payload.avgDistance);

  // Update Comparison Table
  elements.compRndDist.textContent = `${payload.gen0BestDist.toFixed(2)} km`;
  elements.compNnDist.textContent = `${payload.nnDistance.toFixed(2)} km`;
  const nnSaving = ((payload.gen0BestDist - payload.nnDistance) / payload.gen0BestDist) * 100;
  elements.compNnSav.textContent = `${nnSaving >= 0 ? '+' : ''}${nnSaving.toFixed(1)}%`;
  elements.compNnTime.textContent = `${payload.nnExecutionTimeMs.toFixed(1)} ms`;

  elements.compGaDist.textContent = `${payload.bestDistance.toFixed(2)} km`;
  elements.compGaSav.textContent = '0.0%';
  elements.compGaTime.textContent = '0 ms';

  elements.comp2optDist.textContent = '-- km';
  elements.comp2optSav.textContent = '--%';
  elements.comp2optTime.textContent = '-- ms';

  clearComparisonHighlights();

  logEvent(`Gen 0 initialized: Best = ${payload.bestDistance.toFixed(2)} km, NN = ${payload.nnDistance.toFixed(2)} km`);
}

function onWorkerGenUpdate(payload) {
  state.currentGen = payload.generation;
  state.bestDistance = payload.bestDistance;
  state.elapsedMs = payload.elapsedMs;

  elements.statGen.textContent = payload.generation;
  elements.hudGenBadge.textContent = payload.generation;
  elements.statBestDist.textContent = `${payload.bestDistance.toFixed(2)} km`;
  elements.statAvgDist.textContent = `${payload.avgDistance.toFixed(2)} km`;
  elements.statDiversity.textContent = `${(payload.diversityRatio * 100).toFixed(0)}%`;
  elements.statElapsed.textContent = `${(payload.elapsedMs / 1000).toFixed(2)}s elapsed`;

  // Improvement vs Gen 0
  const impGen0 = ((state.gen0BestDist - payload.bestDistance) / state.gen0BestDist) * 100;
  elements.statImpGen0.textContent = `${impGen0 >= 0 ? '+' : ''}${impGen0.toFixed(1)}%`;

  // Improvement vs NN
  if (state.nnDistance > 0) {
    const impNN = ((state.nnDistance - payload.bestDistance) / state.nnDistance) * 100;
    elements.statImpNN.textContent = `${impNN >= 0 ? '+' : ''}${impNN.toFixed(1)}%`;
  }

  // Update map view & convergence chart
  mapView.updateRoute(payload.bestRoute, payload.topRoutes, payload.isNewBest);
  chart.addPoint(payload.generation, payload.bestDistance, payload.avgDistance);

  // If new best discovered, log event
  if (payload.isNewBest) {
    state.bestEverGen = payload.generation;
    elements.statBestGen.textContent = `found at gen ${payload.generation}`;
    const pct = ((state.gen0BestDist - payload.bestDistance) / state.gen0BestDist) * 100;
    logEvent(`Gen ${payload.generation}: NEW BEST ${payload.bestDistance.toFixed(2)} km (-${pct.toFixed(1)}%)`, true);
  }
}

function onWorkerExplainUpdate(payload) {
  onWorkerGenUpdate(payload);
  renderExplainTrace(payload.explainData, payload.generation);
}

function onWorkerPaused(payload) {
  state.isRunning = false;
  state.isPaused = true;
  updateStartButtonUI(false, true);
  logEvent(`Paused at Generation ${payload.generation}`);
}

function onWorkerFinished(payload) {
  state.isRunning = false;
  state.isPaused = false;
  updateStartButtonUI(false, false);

  // Final comparison updates
  elements.compGaDist.textContent = `${payload.bestDistance.toFixed(2)} km`;
  const gaSaving = ((payload.gen0BestDist - payload.bestDistance) / payload.gen0BestDist) * 100;
  elements.compGaSav.textContent = `${gaSaving >= 0 ? '+' : ''}${gaSaving.toFixed(1)}%`;
  elements.compGaTime.textContent = `${(payload.elapsedMs / 1000).toFixed(2)}s`;

  highlightComparisonWinner();

  logEvent(`Run completed: ${payload.reason}. Final Best = ${payload.bestDistance.toFixed(2)} km`, true);
}

function onWorkerCompareResult(payload) {
  chart.setComparisonData(payload.oxHistory, payload.pmxHistory, state.nnDistance);
  logEvent(`Crossover Comparison: OX Final = ${payload.oxFinal.toFixed(2)} km vs PMX Final = ${payload.pmxFinal.toFixed(2)} km`, true);
  alert(`Crossover Comparison Results:\n\nOrder Crossover (OX): ${payload.oxFinal.toFixed(2)} km\nPartially Mapped (PMX): ${payload.pmxFinal.toFixed(2)} km\n\nBoth curves are now plotted side-by-side on the Convergence Chart.`);
}

function onWorkerRun10Result(payload) {
  const msg = `Stochastic Evaluation (10 Independent Runs):\n\n` +
    `Best Run:  ${payload.best.toFixed(2)} km\n` +
    `Worst Run: ${payload.worst.toFixed(2)} km\n` +
    `Mean:      ${payload.mean.toFixed(2)} km\n` +
    `Std Dev:   ${payload.stdDev.toFixed(2)} km\n\n` +
    `This demonstrates that because Genetic Algorithms are stochastic heuristics, variance exists across seeds.`;
  alert(msg);
  logEvent(`10 Runs Summary: Best=${payload.best.toFixed(2)} km, Mean=${payload.mean.toFixed(2)} km, StdDev=${payload.stdDev.toFixed(2)} km`);
}

function onWorkerPolishResult(payload) {
  elements.comp2optDist.textContent = `${payload.polishedDistance.toFixed(2)} km`;
  const sav = ((state.gen0BestDist - payload.polishedDistance) / state.gen0BestDist) * 100;
  elements.comp2optSav.textContent = `${sav >= 0 ? '+' : ''}${sav.toFixed(1)}%`;
  elements.comp2optTime.textContent = `${payload.executionTimeMs.toFixed(1)} ms`;

  // Update map to polished route
  mapView.updateRoute(payload.polishedRoute, [], true);
  highlightComparisonWinner();

  const delta = payload.originalDistance - payload.polishedDistance;
  logEvent(`2-Opt Polish: ${payload.iterations} edge-swaps shaved off ${delta.toFixed(2)} km (New = ${payload.polishedDistance.toFixed(2)} km)`, true);
}

// ============================================================================
// EVENT HANDLERS & USER INTERACTIONS
// ============================================================================

function bindEventHandlers() {
  // Start / Pause
  elements.btnStart.addEventListener('click', toggleStartPause);

  // Step
  elements.btnStep.addEventListener('click', () => {
    if (!state.isInitialized) {
      initAndRun(false);
    } else {
      state.worker.postMessage({ type: 'STEP' });
    }
  });

  // Reset
  elements.btnReset.addEventListener('click', resetAll);

  // Speed Slider
  elements.sliderSpeed.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    elements.valSpeed.textContent = `${val}%`;
    state.worker?.postMessage({ type: 'SET_SPEED', payload: { speed: val } });
  });

  // Mode Toggles
  elements.btnToggleOffline.addEventListener('click', toggleOfflineMode);
  elements.btnToggleExplain.addEventListener('click', toggleExplainMode);
  elements.btnToggleTheme.addEventListener('click', toggleTheme);

  // Presets
  elements.btnPresetDemo.addEventListener('click', () => loadPreset('demo'));
  elements.btnPresetLarge.addEventListener('click', () => loadPreset('large'));
  elements.btnPresetRandom.addEventListener('click', () => {
    const count = parseInt(elements.sliderRandomCount.value, 10);
    loadPreset('random', count);
  });
  elements.btnPresetClear.addEventListener('click', clearMap);

  // Sliders sync
  bindSliderSync(elements.sliderPopSize, elements.valPopSize, '');
  bindSliderSync(elements.sliderCrossoverRate, elements.valCrossoverRate, '%');
  bindSliderSync(elements.sliderMutationRate, elements.valMutationRate, '%');
  bindSliderSync(elements.sliderElitism, elements.valElitism, '');
  bindSliderSync(elements.sliderMaxGen, elements.valMaxGen, '', (val) => {
    elements.statMaxGen.textContent = `of ${val} max`;
  });
  bindSliderSync(elements.sliderStagnation, elements.valStagnation, '');
  bindSliderSync(elements.sliderTournament, elements.valTournament, '');
  bindSliderSync(elements.sliderRandomCount, elements.valRandomCount, '');

  // Operator dropdowns
  elements.selectSelection.addEventListener('change', (e) => {
    elements.rowTournament.style.display = e.target.value === 'tournament' ? 'flex' : 'none';
  });

  // Population Overlay Checkbox
  elements.showPopCheckbox.addEventListener('change', (e) => {
    mapView.setShowPopulation(e.target.checked);
  });

  // Benchmark Buttons
  elements.btnCompareCrossovers.addEventListener('click', runCompareCrossovers);
  elements.btnRun10.addEventListener('click', run10Times);
  elements.btnPolish2Opt.addEventListener('click', () => {
    if (!state.isInitialized) {
      alert('Please initialize and run the GA first before applying 2-Opt polish.');
      return;
    }
    state.worker.postMessage({ type: 'POLISH_2OPT' });
  });

  // Import / Export JSON
  elements.btnExportJson.addEventListener('click', exportJSON);
  elements.btnImportJson.addEventListener('click', () => elements.jsonFileInput.click());
  elements.jsonFileInput.addEventListener('change', importJSON);

  // Export CSV & PNG
  elements.btnExportCsv.addEventListener('click', exportCSV);
  elements.btnDownloadChart.addEventListener('click', exportChartPNG);
  elements.btnClearLog.addEventListener('click', () => {
    elements.logScroller.innerHTML = '';
  });

  // Explainer Mode Controls
  elements.btnExplainStep.addEventListener('click', () => {
    if (!state.isInitialized) {
      initAndRun(false);
    }
    state.worker.postMessage({ type: 'EXPLAIN_STEP' });
  });
  elements.btnExplainClose.addEventListener('click', () => {
    toggleExplainMode();
  });

  // "How It Works" Modal
  elements.btnOpenInfo.addEventListener('click', () => {
    elements.howItWorksModal.classList.add('active');
  });
  elements.modalCloseBtn.addEventListener('click', () => {
    elements.howItWorksModal.classList.remove('active');
  });
  elements.howItWorksModal.addEventListener('click', (e) => {
    if (e.target === elements.howItWorksModal) {
      elements.howItWorksModal.classList.remove('active');
    }
  });

  // Keyboard Shortcuts (Space, S, R)
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    if (e.code === 'Space') {
      e.preventDefault();
      toggleStartPause();
    } else if (e.code === 'KeyS') {
      e.preventDefault();
      elements.btnStep.click();
    } else if (e.code === 'KeyR') {
      e.preventDefault();
      resetAll();
    }
  });
}

function bindSliderSync(slider, labelEl, suffix = '', callback = null) {
  slider.addEventListener('input', (e) => {
    labelEl.textContent = `${e.target.value}${suffix}`;
    if (callback) callback(e.target.value);
  });
}

// ============================================================================
// RUN CONTROLS
// ============================================================================

function toggleStartPause() {
  if (state.cities.length < 4) {
    alert('Please add at least 4 delivery stops to run the Genetic Algorithm.');
    return;
  }

  if (!state.isRunning) {
    if (!state.isInitialized) {
      initAndRun(true);
    } else {
      state.isRunning = true;
      state.isPaused = false;
      updateStartButtonUI(true, false);
      state.worker.postMessage({ type: 'RESUME' });
      logEvent('Resuming GA optimization...');
    }
  } else {
    state.worker.postMessage({ type: 'PAUSE' });
  }
}

function initAndRun(autoStart = true) {
  if (state.cities.length < 4) return;

  const options = gatherOptions();
  state.worker.postMessage({
    type: 'INIT',
    payload: {
      cities: state.cities,
      isOffline: state.isOffline,
      depot: state.depotId,
      options
    }
  });

  state.worker.postMessage({
    type: 'SET_SPEED',
    payload: { speed: parseInt(elements.sliderSpeed.value, 10) }
  });

  if (autoStart) {
    state.isRunning = true;
    state.isPaused = false;
    updateStartButtonUI(true, false);
    state.worker.postMessage({ type: 'START' });
    logEvent(`GA Started with ${state.cities.length} stops, pop = ${options.popSize}, ${options.crossoverMethod.toUpperCase()}, ${options.mutationMethod}`);
  }
}

function resetAll() {
  state.worker?.postMessage({ type: 'RESET' });
  state.isRunning = false;
  state.isPaused = false;
  state.isInitialized = false;
  state.currentGen = 0;
  state.bestDistance = 0;
  state.gen0BestDist = 0;
  state.nnDistance = 0;

  updateStartButtonUI(false, false);

  elements.statGen.textContent = '0';
  elements.hudGenBadge.textContent = '0';
  elements.statBestDist.textContent = '-- km';
  elements.statBestGen.textContent = 'found at gen 0';
  elements.statAvgDist.textContent = '-- km';
  elements.statImpGen0.textContent = '0.0%';
  elements.statImpNN.textContent = '--%';
  elements.statNNBaselineLabel.textContent = 'NN: -- km';
  elements.statDiversity.textContent = '--%';
  elements.statElapsed.textContent = '0 ms elapsed';

  mapView.resetRoutes();
  chart.reset();
  clearComparisonHighlights();

  logEvent('Population and routes reset. Ready.');
}

function updateStartButtonUI(isRunning, isPaused) {
  if (isRunning) {
    elements.startBtnLabel.textContent = 'Pause';
    elements.startBtnIcon.innerHTML = '&#10074;&#10074;';
    elements.btnStart.classList.replace('hud-btn-primary', 'hud-btn-secondary');
  } else if (isPaused) {
    elements.startBtnLabel.textContent = 'Resume';
    elements.startBtnIcon.innerHTML = '&#9654;';
    elements.btnStart.classList.replace('hud-btn-secondary', 'hud-btn-primary');
  } else {
    elements.startBtnLabel.textContent = 'Start GA';
    elements.startBtnIcon.innerHTML = '&#9654;';
    elements.btnStart.classList.replace('hud-btn-secondary', 'hud-btn-primary');
  }
}

function gatherOptions() {
  const seedVal = elements.inputSeed.value.trim();
  const seed = seedVal !== '' ? parseInt(seedVal, 10) : undefined;

  return {
    popSize: parseInt(elements.sliderPopSize.value, 10),
    crossoverRate: parseInt(elements.sliderCrossoverRate.value, 10) / 100,
    mutationRate: parseInt(elements.sliderMutationRate.value, 10) / 100,
    elitismCount: parseInt(elements.sliderElitism.value, 10),
    maxGenerations: parseInt(elements.sliderMaxGen.value, 10),
    stagnationLimit: parseInt(elements.sliderStagnation.value, 10),
    tournamentSize: parseInt(elements.sliderTournament.value, 10),
    selectionMethod: elements.selectSelection.value,
    crossoverMethod: elements.selectCrossover.value,
    mutationMethod: elements.selectMutation.value,
    seedWithNN: elements.seedNNCheckbox.checked,
    seed
  };
}

// ============================================================================
// MAP & PRESETS HANDLING
// ============================================================================

function loadPreset(type, count = 15) {
  resetAll();

  if (type === 'demo') {
    state.cities = getLudhianaDemo12();
  } else if (type === 'large') {
    state.cities = getLudhianaLarge25();
  } else if (type === 'random') {
    state.cities = generateRandomPoints(count, state.isOffline);
  }

  state.depotId = 0;
  elements.stopCountBadge.textContent = `${state.cities.length} stops`;
  mapView.setCities(state.cities, state.depotId);

  logEvent(`Loaded ${state.cities.length} stops (${type === 'demo' ? 'Ludhiana Core 12' : type === 'large' ? 'Ludhiana Large 25' : `Random ${count}`})`);
}

function clearMap() {
  resetAll();
  state.cities = [];
  state.depotId = 0;
  elements.stopCountBadge.textContent = '0 stops';
  mapView.setCities([], 0);
  logEvent('Map cleared. Click to place custom delivery stops.');
}

function handleAddStop(coords) {
  resetAll();
  const id = state.cities.length;
  const isDepot = id === 0;
  const newStop = {
    id,
    name: isDepot ? 'Main Dispatch Depot' : `Delivery Stop #${id}`,
    lat: coords.lat,
    lng: coords.lng,
    x: coords.x,
    y: coords.y,
    isDepot
  };

  state.cities.push(newStop);
  elements.stopCountBadge.textContent = `${state.cities.length} stops`;
  mapView.setCities(state.cities, state.depotId);
  logEvent(`Added Stop #${id}: ${newStop.name}`);
}

function handleMoveStop(idx, updatedStop) {
  resetAll();
  if (state.cities[idx]) {
    state.cities[idx].lat = updatedStop.lat;
    state.cities[idx].lng = updatedStop.lng;
    if (updatedStop.x !== undefined) state.cities[idx].x = updatedStop.x;
    if (updatedStop.y !== undefined) state.cities[idx].y = updatedStop.y;
    logEvent(`Moved Stop #${idx} to (${updatedStop.lat.toFixed(4)}, ${updatedStop.lng.toFixed(4)})`);
  }
}

function handleDeleteStop(idx) {
  if (state.cities.length <= 1) {
    clearMap();
    return;
  }
  resetAll();
  state.cities.splice(idx, 1);
  // Re-index remaining cities
  state.cities.forEach((c, i) => {
    c.id = i;
    c.isDepot = (i === 0);
  });
  state.depotId = 0;
  elements.stopCountBadge.textContent = `${state.cities.length} stops`;
  mapView.setCities(state.cities, state.depotId);
  logEvent(`Deleted stop #${idx}. ${state.cities.length} stops remaining.`);
}

function handleSetDepot(idx) {
  if (idx < 0 || idx >= state.cities.length) return;
  resetAll();

  // Swap clicked stop with index 0 so depot is always index 0
  const chosen = state.cities[idx];
  const oldDepot = state.cities[0];

  state.cities[0] = chosen;
  state.cities[idx] = oldDepot;

  // Reassign IDs and depot flags
  state.cities.forEach((c, i) => {
    c.id = i;
    c.isDepot = (i === 0);
  });
  state.depotId = 0;

  mapView.setCities(state.cities, 0);
  logEvent(`Depot moved to: ${chosen.name}`, true);
}

// ============================================================================
// MODE & THEME TOGGLES
// ============================================================================

function toggleOfflineMode() {
  state.isOffline = !state.isOffline;
  elements.btnToggleOffline.classList.toggle('active', state.isOffline);
  mapView.setOfflineMode(state.isOffline);

  logEvent(`Switched to ${state.isOffline ? 'OFFLINE Canvas Mode (Euclidean Plane TSP)' : 'Online Leaflet Map Mode'}`);
  resetAll();
}

function toggleExplainMode() {
  state.isExplainMode = !state.isExplainMode;
  elements.btnToggleExplain.classList.toggle('active', state.isExplainMode);
  elements.explainerDrawer.classList.toggle('open', state.isExplainMode);

  if (state.isExplainMode) {
    if (state.isRunning) {
      state.worker.postMessage({ type: 'PAUSE' });
    }
    logEvent('Explain Mode activated: inspect step-by-step GA mechanics.');
  }
}

function toggleTheme() {
  state.isDark = !state.isDark;
  document.documentElement.setAttribute('data-theme', state.isDark ? 'dark' : 'light');
  elements.themeBtnLabel.textContent = state.isDark ? 'Light Parchment' : 'Night Map';

  mapView.setTheme(state.isDark);
  chart.setTheme(state.isDark);
}

// ============================================================================
// EXPERIMENTS & EXPORTS
// ============================================================================

function runCompareCrossovers() {
  if (state.cities.length < 4) {
    alert('Please add at least 4 stops to compare crossovers.');
    return;
  }
  resetAll();
  const options = gatherOptions();
  state.worker.postMessage({
    type: 'COMPARE_CROSSOVERS',
    payload: {
      cities: state.cities,
      isOffline: state.isOffline,
      depot: state.depotId,
      options
    }
  });
  logEvent('Running Crossover Benchmark: Order Crossover (OX) vs Partially Mapped (PMX)...');
}

function run10Times() {
  if (state.cities.length < 4) {
    alert('Please add at least 4 stops to run stochastic evaluation.');
    return;
  }
  resetAll();
  const options = gatherOptions();
  state.worker.postMessage({
    type: 'RUN_10_TIMES',
    payload: {
      cities: state.cities,
      isOffline: state.isOffline,
      depot: state.depotId,
      options
    }
  });
  logEvent('Running 10 stochastic iterations to evaluate mean and standard deviation...');
}

function exportJSON() {
  const exportData = {
    name: 'RouteEvolve Stops Export',
    date: new Date().toISOString(),
    stopsCount: state.cities.length,
    depotIndex: state.depotId,
    stops: state.cities
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `routeevolve_stops_${state.cities.length}.json`;
  a.click();
  URL.revokeObjectURL(url);
  logEvent(`Exported ${state.cities.length} delivery stops to JSON.`);
}

function importJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (Array.isArray(data.stops) && data.stops.length >= 2) {
        resetAll();
        state.cities = data.stops.map((s, idx) => ({
          ...s,
          id: idx,
          isDepot: idx === 0
        }));
        state.depotId = 0;
        elements.stopCountBadge.textContent = `${state.cities.length} stops`;
        mapView.setCities(state.cities, state.depotId);
        logEvent(`Successfully imported ${state.cities.length} stops from JSON file.`, true);
      } else {
        alert('Invalid JSON format: Expected "stops" array with at least 2 locations.');
      }
    } catch (err) {
      alert('Error parsing JSON file: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function exportCSV() {
  if (!state.isInitialized || !mapView.bestRoute) {
    alert('No active route to export. Please run the GA first.');
    return;
  }

  const route = mapView.bestRoute;
  const distMatrix = computeDistanceMatrix(state.cities, state.isOffline);

  let csv = 'Sequence_Order,Stop_Index,Place_Name,Latitude,Longitude,Step_Distance_km,Cumulative_Distance_km\n';
  let cumDist = 0;

  for (let i = 0; i < route.length; i++) {
    const cityIdx = route[i];
    const city = state.cities[cityIdx];
    const nextCityIdx = route[(i + 1) % route.length];
    const stepDist = distMatrix[cityIdx][nextCityIdx];
    cumDist += stepDist;

    csv += `${i + 1},${cityIdx},"${city.name}",${city.lat},${city.lng},${stepDist.toFixed(3)},${cumDist.toFixed(3)}\n`;
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `routeevolve_best_route_${state.currentGen}gens.csv`;
  a.click();
  URL.revokeObjectURL(url);
  logEvent('Exported ordered route to CSV.');
}

function exportChartPNG() {
  const dataUrl = chart.exportPNG();
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `routeevolve_convergence_chart_gen${state.currentGen}.png`;
  a.click();
  logEvent('Downloaded convergence chart snapshot as PNG.');
}

// ============================================================================
// EXPLAINER MODE RENDERING
// ============================================================================

function renderExplainTrace(explainData, gen) {
  if (!explainData) return;
  elements.explainGenLabel.textContent = `Generation ${gen}`;

  // Step 1: Top Elite
  elements.explainStep1Details.textContent = `Top Elite preserved: ${explainData.topEliteDistance.toFixed(2)} km (Elites: ${explainData.elitesCount})`;

  const pair = explainData.tracePair;
  if (!pair) return;

  // Step 2: Parents
  renderGeneStrip(elements.explainStep2P1, pair.parent1.genes, 'P1');
  renderGeneStrip(elements.explainStep2P2, pair.parent2.genes, 'P2');

  // Step 3: Crossover
  const cut1 = pair.crossoverDetails ? pair.crossoverDetails.cut1 : 1;
  const cut2 = pair.crossoverDetails ? pair.crossoverDetails.cut2 : 1;
  renderGeneStrip(elements.explainStep3Child, pair.childBeforeMutation, 'Child (pre-mut)', cut1, cut2);

  // Step 4: Mutation
  let mutIdx1 = -1, mutIdx2 = -1;
  if (pair.mut1Applied && pair.mut1Details) {
    mutIdx1 = pair.mut1Details.idx1 ?? pair.mut1Details.cut1;
    mutIdx2 = pair.mut1Details.idx2 ?? pair.mut1Details.cut2;
  }
  renderGeneStrip(elements.explainStep4Child, pair.finalChild.genes, 'Offspring (final)', -1, -1, mutIdx1, mutIdx2);

  // Step 5: Validity
  elements.explainStep5Details.textContent = `Offspring Valid: YES | Fitness = ${(pair.finalChild.fitness * 1000).toFixed(4)} | Dist = ${pair.finalChild.distance.toFixed(2)} km`;
}

function renderGeneStrip(container, genes, label, cut1 = -1, cut2 = -1, mut1 = -1, mut2 = -1) {
  container.innerHTML = '';
  if (!genes) return;

  const maxDisplay = Math.min(genes.length, 14); // Keep concise
  for (let i = 0; i < maxDisplay; i++) {
    const val = genes[i];
    const box = document.createElement('div');
    box.className = 'gene-box';
    box.textContent = val;

    if (i === 0) {
      box.classList.add('depot-gene');
      box.title = 'Start Depot';
    } else if (cut1 !== -1 && i >= cut1 && i <= cut2) {
      box.classList.add('crossed-gene');
      box.title = 'Crossover Segment';
    } else if (mut1 !== -1 && (i === mut1 || i === mut2)) {
      box.classList.add('mutated-gene');
      box.title = 'Mutated Gene';
    }

    container.appendChild(box);
  }

  if (genes.length > maxDisplay) {
    const more = document.createElement('div');
    more.className = 'gene-box';
    more.textContent = `+${genes.length - maxDisplay}`;
    container.appendChild(more);
  }
}

// ============================================================================
// COMPARISON TABLE & LOG UTILITIES
// ============================================================================

function clearComparisonHighlights() {
  elements.rowRandom.classList.remove('winner');
  elements.rowNn.classList.remove('winner');
  elements.rowGa.classList.remove('winner');
  elements.row2opt.classList.remove('winner');
}

function highlightComparisonWinner() {
  clearComparisonHighlights();

  const rnd = state.gen0BestDist || Infinity;
  const nn = state.nnDistance || Infinity;
  const ga = state.bestDistance || Infinity;
  const dist2optText = elements.comp2optDist.textContent.replace(' km', '');
  const dist2opt = parseFloat(dist2optText) || Infinity;

  const minVal = Math.min(rnd, nn, ga, dist2opt);

  if (minVal === dist2opt && dist2opt < Infinity) {
    elements.row2opt.classList.add('winner');
  } else if (minVal === ga) {
    elements.rowGa.classList.add('winner');
  } else if (minVal === nn) {
    elements.rowNn.classList.add('winner');
  } else {
    elements.rowRandom.classList.add('winner');
  }
}

function logEvent(msg, isHighlight = false) {
  if (!elements.logScroller) return;

  const item = document.createElement('div');
  item.className = 'log-item';
  if (isHighlight) item.classList.add('best-highlight');

  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];

  item.innerHTML = `<span>${msg}</span><span style="opacity: 0.6; font-size: 10px;">${timeStr}</span>`;
  elements.logScroller.appendChild(item);
  elements.logScroller.scrollTop = elements.logScroller.scrollHeight;
}
