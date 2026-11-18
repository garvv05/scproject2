/**
 * chart.js - High-Performance Canvas Convergence Chart for RouteEvolve
 * 
 * Features:
 * - 100% Native HTML5 Canvas API (zero external runtime dependencies).
 * - High-DPI retina display support (crisp rendering at devicePixelRatio >= 2).
 * - Dual-line visualization: Best Distance (Vermilion) & Average Distance (Ink Navy).
 * - Dashed horizontal Nearest Neighbour reference baseline.
 * - Multi-series overlay for "Compare Crossovers" (OX vs PMX).
 * - Interactive hover tooltip with generation, distance, and delta tracking.
 * - Direct PNG snapshot export.
 */

export class ConvergenceChart {
  /**
   * @param {HTMLCanvasElement} canvas 
   * @param {Object} options 
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.isDark = options.isDark || false;

    // Chart margins
    this.padding = { top: 25, right: 25, bottom: 35, left: 55 };

    // Data series
    this.history = []; // Array of { gen: number, best: number, avg: number }
    this.nnBaseline = null; // Nearest Neighbour distance in km
    this.comparisonData = null; // { ox: [], pmx: [] }

    // Hover tooltip state
    this.hoverPoint = null;
    this.mouseX = -1;
    this.mouseY = -1;

    // Palette: Cartographer's Dispatch Desk
    this.updatePalette();

    // Event listeners
    this.bindEvents();
    this.resize();
  }

  updatePalette() {
    if (this.isDark) {
      this.colors = {
        bg: '#141c24',
        grid: 'rgba(255, 255, 255, 0.08)',
        axes: '#485868',
        text: '#94a3b8',
        bestLine: '#ff6b4a',
        bestGlow: 'rgba(255, 107, 74, 0.2)',
        avgLine: '#5eead4',
        nnLine: '#fbbf24',
        tooltipBg: '#1e293b',
        tooltipBorder: '#334155',
        tooltipText: '#f8fafc',
        oxLine: '#ff6b4a',
        pmxLine: '#38bdf8'
      };
    } else {
      this.colors = {
        bg: '#fcfbf8',
        grid: 'rgba(30, 42, 56, 0.08)',
        axes: '#a8a29e',
        text: '#57534e',
        bestLine: '#c73e1d', // Vermilion
        bestGlow: 'rgba(199, 62, 29, 0.12)',
        avgLine: '#2b5f6e', // Muted Deep Teal
        nnLine: '#b45309', // Amber / Rust
        tooltipBg: '#1e293b',
        tooltipBorder: '#475569',
        tooltipText: '#f8fafc',
        oxLine: '#c73e1d',
        pmxLine: '#0284c7'
      };
    }
  }

  setTheme(isDark) {
    this.isDark = isDark;
    this.updatePalette();
    this.render();
  }

  bindEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
      this.findHoverPoint();
      this.render();
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoverPoint = null;
      this.mouseX = -1;
      this.mouseY = -1;
      this.render();
    });

    window.addEventListener('resize', () => {
      this.resize();
      this.render();
    });
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const width = Math.floor(rect.width) || 400;
    const height = Math.floor(rect.height) || 220;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.ctx.resetTransform?.();
    this.ctx.scale(dpr, dpr);
    this.cssWidth = width;
    this.cssHeight = height;
  }

  reset() {
    this.history = [];
    this.nnBaseline = null;
    this.comparisonData = null;
    this.hoverPoint = null;
    this.render();
  }

  setNNBaseline(distance) {
    this.nnBaseline = distance;
    this.render();
  }

  addPoint(gen, bestDist, avgDist) {
    this.history.push({
      gen,
      best: bestDist,
      avg: avgDist
    });
    this.comparisonData = null;
    this.render();
  }

  setComparisonData(oxHistory, pmxHistory, nnDist) {
    this.comparisonData = { ox: oxHistory, pmx: pmxHistory };
    if (nnDist) this.nnBaseline = nnDist;
    this.render();
  }

  findHoverPoint() {
    const series = this.comparisonData ? this.comparisonData.ox : this.history;
    if (!series || series.length === 0) {
      this.hoverPoint = null;
      return;
    }

    const { left, right } = this.padding;
    const chartW = this.cssWidth - left - right;

    if (this.mouseX < left || this.mouseX > this.cssWidth - right) {
      this.hoverPoint = null;
      return;
    }

    const totalGens = Math.max(1, series[series.length - 1].gen);
    const approxGen = Math.round(((this.mouseX - left) / chartW) * totalGens);

    // Find closest data entry
    let closest = series[0];
    let minDiff = Math.abs(series[0].gen - approxGen);

    for (let i = 1; i < series.length; i++) {
      const diff = Math.abs(series[i].gen - approxGen);
      if (diff < minDiff) {
        minDiff = diff;
        closest = series[i];
      }
    }

    this.hoverPoint = closest;
  }

  render() {
    const ctx = this.ctx;
    const w = this.cssWidth;
    const h = this.cssHeight;

    if (!w || !h) return;

    ctx.clearRect(0, 0, w, h);

    // Background fill
    ctx.fillStyle = this.colors.bg;
    ctx.fillRect(0, 0, w, h);

    const { top, right, bottom, left } = this.padding;
    const chartW = w - left - right;
    const chartH = h - top - bottom;

    const hasNormal = this.history.length > 0;
    const hasCompare = !!this.comparisonData;

    if (!hasNormal && !hasCompare) {
      this.drawEmptyState(ctx, w, h);
      return;
    }

    // Determine domain and range
    let maxGen = 1;
    let minY = Infinity;
    let maxY = -Infinity;

    if (hasCompare) {
      const allPoints = [...this.comparisonData.ox, ...this.comparisonData.pmx];
      for (const p of allPoints) {
        if (p.gen > maxGen) maxGen = p.gen;
        if (p.best < minY) minY = p.best;
        if (p.best > maxY) maxY = p.best;
      }
    } else {
      for (const p of this.history) {
        if (p.gen > maxGen) maxGen = p.gen;
        if (p.best < minY) minY = p.best;
        if (p.best > maxY) maxY = p.best;
        if (p.avg < minY) minY = p.avg;
        if (p.avg > maxY) maxY = p.avg;
      }
    }

    if (this.nnBaseline) {
      if (this.nnBaseline < minY) minY = this.nnBaseline;
      if (this.nnBaseline > maxY) maxY = this.nnBaseline;
    }

    // Add padding to Y bounds
    if (minY === Infinity || maxY === -Infinity || minY === maxY) {
      minY = Math.max(0, minY - 10);
      maxY = maxY + 10;
    } else {
      const range = maxY - minY;
      minY = Math.max(0, minY - range * 0.08);
      maxY = maxY + range * 0.08;
    }

    const scaleX = (gen) => left + (gen / maxGen) * chartW;
    const scaleY = (val) => top + chartH - ((val - minY) / (maxY - minY)) * chartH;

    // Draw grid lines and Y-axis labels
    this.drawGridAndAxes(ctx, left, top, chartW, chartH, maxGen, minY, maxY, scaleX, scaleY);

    // Draw NN Baseline
    if (this.nnBaseline !== null && this.nnBaseline >= minY && this.nnBaseline <= maxY) {
      const y = scaleY(this.nnBaseline);
      ctx.save();
      ctx.strokeStyle = this.colors.nnLine;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + chartW, y);
      ctx.stroke();

      // Baseline label
      ctx.fillStyle = this.colors.nnLine;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`NN: ${this.nnBaseline.toFixed(1)} km`, left + chartW - 4, y - 4);
      ctx.restore();
    }

    // Draw curves
    if (hasCompare) {
      // Compare Crossovers: OX vs PMX
      this.drawLine(ctx, this.comparisonData.ox, 'best', scaleX, scaleY, this.colors.oxLine, 2);
      this.drawLine(ctx, this.comparisonData.pmx, 'best', scaleX, scaleY, this.colors.pmxLine, 2);
      this.drawCompareLegend(ctx, left, top);
    } else {
      // Normal GA: Average distance & Best distance
      this.drawLine(ctx, this.history, 'avg', scaleX, scaleY, this.colors.avgLine, 1.5);
      this.drawLine(ctx, this.history, 'best', scaleX, scaleY, this.colors.bestLine, 2.2, true);
      this.drawNormalLegend(ctx, left, top);
    }

    // Draw Tooltip if hovering
    if (this.hoverPoint) {
      this.drawTooltip(ctx, this.hoverPoint, scaleX, scaleY, hasCompare);
    }
  }

  drawGridAndAxes(ctx, left, top, chartW, chartH, maxGen, minY, maxY, scaleX, scaleY) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = this.colors.grid;
    ctx.fillStyle = this.colors.text;
    ctx.font = '10px "JetBrains Mono", monospace';

    // Horizontal grid lines (5 steps)
    const ySteps = 4;
    for (let i = 0; i <= ySteps; i++) {
      const val = minY + (i / ySteps) * (maxY - minY);
      const y = scaleY(val);

      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + chartW, y);
      ctx.stroke();

      ctx.textAlign = 'right';
      ctx.fillText(`${val.toFixed(0)} km`, left - 6, y + 3);
    }

    // Vertical grid lines (4 steps)
    const xSteps = 4;
    for (let i = 0; i <= xSteps; i++) {
      const gen = Math.round((i / xSteps) * maxGen);
      const x = scaleX(gen);

      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + chartH);
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillText(`g${gen}`, x, top + chartH + 15);
    }

    // Outer chart frame
    ctx.strokeStyle = this.colors.axes;
    ctx.strokeRect(left, top, chartW, chartH);
    ctx.restore();
  }

  drawLine(ctx, data, field, scaleX, scaleY, strokeColor, lineWidth, hasAreaGlow = false) {
    if (!data || data.length === 0) return;

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(scaleX(data[0].gen), scaleY(data[0][field]));

    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(scaleX(data[i].gen), scaleY(data[i][field]));
    }
    ctx.stroke();

    // Subtle area glow underneath best curve
    if (hasAreaGlow) {
      const lastX = scaleX(data[data.length - 1].gen);
      const firstX = scaleX(data[0].gen);
      const bottomY = this.padding.top + (this.cssHeight - this.padding.top - this.padding.bottom);

      ctx.lineTo(lastX, bottomY);
      ctx.lineTo(firstX, bottomY);
      ctx.closePath();
      ctx.fillStyle = this.colors.bestGlow;
      ctx.fill();
    }

    ctx.restore();
  }

  drawNormalLegend(ctx, left, top) {
    ctx.save();
    ctx.font = '10px "JetBrains Mono", monospace';

    // Best Route
    ctx.fillStyle = this.colors.bestLine;
    ctx.fillRect(left + 10, top + 8, 12, 3);
    ctx.fillStyle = this.colors.text;
    ctx.textAlign = 'left';
    ctx.fillText('Best', left + 26, top + 12);

    // Avg Route
    ctx.fillStyle = this.colors.avgLine;
    ctx.fillRect(left + 70, top + 8, 12, 3);
    ctx.fillStyle = this.colors.text;
    ctx.fillText('Average', left + 86, top + 12);
    ctx.restore();
  }

  drawCompareLegend(ctx, left, top) {
    ctx.save();
    ctx.font = '10px "JetBrains Mono", monospace';

    // OX
    ctx.fillStyle = this.colors.oxLine;
    ctx.fillRect(left + 10, top + 8, 12, 3);
    ctx.fillStyle = this.colors.text;
    ctx.textAlign = 'left';
    ctx.fillText('Order Crossover (OX)', left + 26, top + 12);

    // PMX
    ctx.fillStyle = this.colors.pmxLine;
    ctx.fillRect(left + 170, top + 8, 12, 3);
    ctx.fillStyle = this.colors.text;
    ctx.fillText('Partially Mapped (PMX)', left + 186, top + 12);
    ctx.restore();
  }

  drawTooltip(ctx, point, scaleX, scaleY, hasCompare) {
    const x = scaleX(point.gen);
    const y = scaleY(point.best);

    ctx.save();
    // Vertical cursor line
    ctx.strokeStyle = this.colors.axes;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(x, this.padding.top);
    ctx.lineTo(x, this.padding.top + (this.cssHeight - this.padding.top - this.padding.bottom));
    ctx.stroke();

    // Dot at current best
    ctx.fillStyle = this.colors.bestLine;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Tooltip Box
    const textLines = [
      `Gen: ${point.gen}`,
      `Best: ${point.best.toFixed(2)} km`
    ];
    if (point.avg !== undefined) {
      textLines.push(`Avg:  ${point.avg.toFixed(2)} km`);
    }

    const boxW = 120;
    const boxH = textLines.length * 15 + 10;
    let boxX = x + 12;
    let boxY = y - 10;

    // Flip if near right edge
    if (boxX + boxW > this.cssWidth - 10) {
      boxX = x - boxW - 12;
    }
    // Clamp Y
    if (boxY < 10) boxY = 10;
    if (boxY + boxH > this.cssHeight - 10) boxY = this.cssHeight - boxH - 10;

    ctx.setLineDash([]);
    ctx.fillStyle = this.colors.tooltipBg;
    ctx.strokeStyle = this.colors.tooltipBorder;
    ctx.lineWidth = 1;
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    ctx.fillStyle = this.colors.tooltipText;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';

    textLines.forEach((line, idx) => {
      ctx.fillText(line, boxX + 8, boxY + 16 + idx * 14);
    });

    ctx.restore();
  }

  drawEmptyState(ctx, w, h) {
    ctx.save();
    ctx.fillStyle = this.colors.text;
    ctx.font = '12px "Source Serif 4", serif';
    ctx.textAlign = 'center';
    ctx.fillText('Convergence data will appear here when the GA runs', w / 2, h / 2);
    ctx.restore();
  }

  exportPNG() {
    return this.canvas.toDataURL('image/png');
  }
}
