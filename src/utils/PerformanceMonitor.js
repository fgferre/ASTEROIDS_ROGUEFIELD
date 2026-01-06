/**
 * Performance Monitor
 *
 * Tracks and reports game performance metrics for balancing and optimization.
 * Provides real-time FPS, memory usage, and gameplay metrics.
 *
 * Features:
 * - FPS tracking with min/max/average
 * - Frame time analysis
 * - Memory usage monitoring
 * - Gameplay metrics (enemies, bullets, orbs)
 * - Performance warnings and alerts
 *
 * @example
 * ```javascript
 * const monitor = new PerformanceMonitor();
 * monitor.startFrame();
 * // ... game update ...
 * monitor.endFrame();
 * const report = monitor.getReport();
 * ```
 */

export class PerformanceMonitor {
  constructor() {
    // FPS tracking
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.fps = 60;
    this.fpsHistory = [];
    this.fpsHistoryLimit = 60; // Last 60 frames

    // Frame timing
    this.frameStartTime = 0;
    this.frameTimes = [];
    this.frameTimesLimit = 60;

    // Min/max tracking
    this.minFPS = Infinity;
    this.maxFPS = 0;
    this.minFrameTime = Infinity;
    this.maxFrameTime = 0;

    // Session tracking
    this.sessionStartTime = performance.now();
    this.totalFrames = 0;

    // Gameplay metrics
    this.metrics = {
      enemies: 0,
      bullets: 0,
      orbs: 0,
      particles: 0,
      wave: 0,
      score: 0,
      projectileUpdateMs: 0,
      projectileRenderMs: 0,
      projectilePlayerCount: 0,
      projectileEnemyCount: 0,
      projectilePlayerTrailPoints: 0,
      projectileEnemyTrailPoints: 0,
    };

    // Performance thresholds
    this.thresholds = {
      lowFPS: 30,
      highFrameTime: 33.33, // ms (30 FPS equivalent)
      warningFPS: 45,
    };

    // Warnings
    this.warnings = [];
    this.maxWarnings = 10;

    // Auto-logging for development
    this.autoLogEnabled = false;
    this.autoLogInterval = 10000; // Log every 10 seconds
    this.lastAutoLogTime = 0;
    this.sessionLogs = [];

    // Phase timing (granular per-system metrics)
    this.phaseTiming = {
      background: { current: 0, history: [], avg: 0 },
      entities: { current: 0, history: [], avg: 0 },
      particles: { current: 0, history: [], avg: 0 },
      ui: { current: 0, history: [], avg: 0 },
      combat: { current: 0, history: [], avg: 0 },
      effects: { current: 0, history: [], avg: 0 },
    };
    this.phaseHistoryLimit = 60;
    this.activeMeasures = new Map();

    console.log('[PerformanceMonitor] Initialized');
  }

  /**
   * Enables automatic logging to console and session storage.
   *
   * @param {number} interval - Log interval in milliseconds (default: 10000)
   */
  enableAutoLog(interval = 10000) {
    this.autoLogEnabled = true;
    this.autoLogInterval = interval;
    console.log(
      `[PerformanceMonitor] Auto-logging enabled (every ${interval}ms)`
    );
  }

  /**
   * Disables automatic logging.
   */
  disableAutoLog() {
    this.autoLogEnabled = false;
    console.log('[PerformanceMonitor] Auto-logging disabled');
  }

  /**
   * Checks if auto-log should trigger and logs if needed.
   */
  checkAutoLog() {
    if (!this.autoLogEnabled) return;

    const now = performance.now();
    const elapsed = now - this.sessionStartTime;

    if (elapsed - this.lastAutoLogTime >= this.autoLogInterval) {
      this.lastAutoLogTime = elapsed;
      const report = this.getReport();

      // Add timestamp
      const logEntry = {
        timestamp: new Date().toISOString(),
        elapsed: elapsed.toFixed(0),
        ...report,
      };

      this.sessionLogs.push(logEntry);

      // Save to localStorage for persistence
      try {
        localStorage.setItem(
          'performanceLog',
          JSON.stringify(this.sessionLogs)
        );
        console.log(
          `[PerformanceMonitor] Auto-log #${this.sessionLogs.length}:`,
          report
        );
      } catch (e) {
        console.warn('[PerformanceMonitor] Failed to save log:', e);
      }
    }
  }

  /**
   * Gets all session logs.
   *
   * @returns {Array} Session logs
   */
  getSessionLogs() {
    return this.sessionLogs;
  }

  /**
   * Exports session logs as JSON string.
   *
   * @returns {string} JSON string
   */
  exportLogs() {
    return JSON.stringify(this.sessionLogs, null, 2);
  }

  /**
   * Downloads session logs as a JSON file.
   *
   * @param {string} filename - Filename (default: performance-log.json)
   */
  downloadLogs(filename = 'performance-log.json') {
    const json = this.exportLogs();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`[PerformanceMonitor] Downloaded ${filename}`);
  }

  /**
   * Clears session logs.
   */
  clearLogs() {
    this.sessionLogs = [];
    try {
      localStorage.removeItem('performanceLog');
    } catch (e) {
      // Silent fail
    }
    console.log('[PerformanceMonitor] Logs cleared');
  }

  /**
   * Starts a new frame measurement.
   */
  startFrame() {
    this.frameStartTime = performance.now();
  }

  /**
   * Ends frame measurement and updates metrics.
   */
  endFrame() {
    const now = performance.now();
    const frameTime = now - this.frameStartTime;
    const deltaTime = now - this.lastTime;

    // Update FPS
    if (deltaTime > 0) {
      this.fps = 1000 / deltaTime;
      this.fpsHistory.push(this.fps);

      if (this.fpsHistory.length > this.fpsHistoryLimit) {
        this.fpsHistory.shift();
      }

      // Track min/max
      this.minFPS = Math.min(this.minFPS, this.fps);
      this.maxFPS = Math.max(this.maxFPS, this.fps);
    }

    // Update frame time
    this.frameTimes.push(frameTime);
    if (this.frameTimes.length > this.frameTimesLimit) {
      this.frameTimes.shift();
    }

    this.minFrameTime = Math.min(this.minFrameTime, frameTime);
    this.maxFrameTime = Math.max(this.maxFrameTime, frameTime);

    // Check for performance issues
    this.checkPerformance(frameTime);

    // Check if we should auto-log
    this.checkAutoLog();

    this.lastTime = now;
    this.frameCount++;
    this.totalFrames++;
  }

  /**
   * Checks for performance issues and adds warnings.
   *
   * @param {number} frameTime - Current frame time in ms
   */
  checkPerformance(frameTime) {
    if (this.fps < this.thresholds.lowFPS) {
      this.addWarning(`Low FPS: ${this.fps.toFixed(1)} FPS`);
    }

    if (frameTime > this.thresholds.highFrameTime) {
      this.addWarning(`High frame time: ${frameTime.toFixed(2)}ms`);
    }
  }

  /**
   * Adds a performance warning.
   *
   * @param {string} message - Warning message
   */
  addWarning(message) {
    const timestamp = performance.now() - this.sessionStartTime;
    this.warnings.push({
      message,
      timestamp: timestamp.toFixed(0),
      frame: this.totalFrames,
    });

    if (this.warnings.length > this.maxWarnings) {
      this.warnings.shift();
    }
  }

  /**
   * Updates gameplay metrics.
   *
   * This method is optimized to be called with externally cached metrics.
   * Object.assign() is fast (~0.5ms) and doesn't need internal caching.
   * Cache implementation should be done in the caller (app.js) to control
   * collection frequency and reduce optional chaining overhead.
   *
   * @param {Object} metrics - Metrics object (can be cached externally)
   * @example
   * // Caller (app.js) implements cache to reduce collection frequency:
   * if (frameCount % 5 === 0) {
   *   metricsCache = { enemies: enemies?.asteroids?.length || 0, ... };
   * }
   * performanceMonitor.updateMetrics(metricsCache);
   */
  updateMetrics(metrics) {
    Object.assign(this.metrics, metrics);
  }

  /**
   * Gets average FPS from history.
   *
   * @returns {number} Average FPS
   */
  getAverageFPS() {
    if (this.fpsHistory.length === 0) return 0;
    const sum = this.fpsHistory.reduce((a, b) => a + b, 0);
    return sum / this.fpsHistory.length;
  }

  /**
   * Gets average frame time from history.
   *
   * @returns {number} Average frame time in ms
   */
  getAverageFrameTime() {
    if (this.frameTimes.length === 0) return 0;
    const sum = this.frameTimes.reduce((a, b) => a + b, 0);
    return sum / this.frameTimes.length;
  }

  /**
   * Gets memory usage (if available).
   *
   * @returns {Object|null} Memory info or null
   */
  getMemoryUsage() {
    if (performance.memory) {
      return {
        used: (performance.memory.usedJSHeapSize / 1048576).toFixed(2), // MB
        total: (performance.memory.totalJSHeapSize / 1048576).toFixed(2), // MB
        limit: (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2), // MB
      };
    }
    return null;
  }

  /**
   * Gets complete performance report.
   *
   * @returns {Object} Performance report
   */
  getReport() {
    const sessionTime = (performance.now() - this.sessionStartTime) / 1000;

    return {
      fps: {
        current: this.fps.toFixed(1),
        average: this.getAverageFPS().toFixed(1),
        min: this.minFPS === Infinity ? 0 : this.minFPS.toFixed(1),
        max: this.maxFPS.toFixed(1),
      },
      frameTime: {
        current: this.frameTimes[this.frameTimes.length - 1]?.toFixed(2) || 0,
        average: this.getAverageFrameTime().toFixed(2),
        min: this.minFrameTime === Infinity ? 0 : this.minFrameTime.toFixed(2),
        max: this.maxFrameTime.toFixed(2),
      },
      session: {
        duration: sessionTime.toFixed(1),
        totalFrames: this.totalFrames,
        averageFPS: (this.totalFrames / sessionTime).toFixed(1),
      },
      memory: this.getMemoryUsage(),
      metrics: { ...this.metrics },
      phases: this.getPhaseReport(),
      warnings: [...this.warnings],
    };
  }

  /**
   * Gets a compact summary string for display.
   *
   * @returns {string} Summary string
   */
  getSummary() {
    const avgFPS = this.getAverageFPS();
    const avgFrameTime = this.getAverageFrameTime();
    const memory = this.getMemoryUsage();

    let summary = `FPS: ${this.fps.toFixed(0)} (avg: ${avgFPS.toFixed(0)}) | `;
    summary += `Frame: ${avgFrameTime.toFixed(1)}ms | `;
    summary += `Enemies: ${this.metrics.enemies} | `;
    summary += `Bullets: ${this.metrics.bullets} | `;
    summary += `Orbs: ${this.metrics.orbs}`;

    if (memory) {
      summary += ` | Mem: ${memory.used}MB`;
    }

    return summary;
  }

  /**
   * Resets all tracking data.
   */
  reset() {
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.fps = 60;
    this.fpsHistory = [];
    this.frameTimes = [];
    this.minFPS = Infinity;
    this.maxFPS = 0;
    this.minFrameTime = Infinity;
    this.maxFrameTime = 0;
    this.sessionStartTime = performance.now();
    this.totalFrames = 0;
    this.warnings = [];

    // Reset phase timing
    for (const phase of Object.keys(this.phaseTiming)) {
      this.phaseTiming[phase] = { current: 0, history: [], avg: 0 };
    }
    this.activeMeasures.clear();

    console.log('[PerformanceMonitor] Reset');
  }

  /**
   * Starts timing a named phase.
   * @param {string} label - Phase name (e.g., 'background', 'particles')
   */
  startMeasure(label) {
    this.activeMeasures.set(label, performance.now());
  }

  /**
   * Ends timing a named phase and records the result.
   * @param {string} label - Phase name
   */
  endMeasure(label) {
    const startTime = this.activeMeasures.get(label);
    if (startTime === undefined) return;

    const elapsed = performance.now() - startTime;
    this.activeMeasures.delete(label);

    // Create phase entry if it doesn't exist
    if (!this.phaseTiming[label]) {
      this.phaseTiming[label] = { current: 0, history: [], avg: 0 };
    }

    const phase = this.phaseTiming[label];
    phase.current = elapsed;
    phase.history.push(elapsed);

    if (phase.history.length > this.phaseHistoryLimit) {
      phase.history.shift();
    }

    // Update rolling average
    const sum = phase.history.reduce((a, b) => a + b, 0);
    phase.avg = sum / phase.history.length;
  }

  /**
   * Gets a breakdown of phase timings.
   * @returns {Object} Object with phase names as keys and { current, avg } as values
   */
  getPhaseReport() {
    const report = {};
    for (const [label, data] of Object.entries(this.phaseTiming)) {
      if (data.history.length > 0) {
        report[label] = {
          current: Number(data.current.toFixed(2)),
          avg: Number(data.avg.toFixed(2)),
        };
      }
    }
    return report;
  }

  /**
   * Logs current performance report to console.
   */
  logReport() {
    const report = this.getReport();
    console.log('[PerformanceMonitor] Report:', report);
  }

  /**
   * Creates and shows an on-screen performance overlay.
   * Toggle visibility with F3 key.
   */
  showOverlay() {
    if (this.overlayElement) {
      this.overlayElement.style.display = 'block';
      return;
    }

    // Create overlay element
    this.overlayElement = document.createElement('div');
    this.overlayElement.id = 'perf-overlay';
    this.overlayElement.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.85);
      color: #0f0;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      padding: 10px;
      border: 1px solid #0f0;
      border-radius: 4px;
      z-index: 99999;
      pointer-events: none;
      min-width: 200px;
    `;
    document.body.appendChild(this.overlayElement);

    // Start update loop
    this.overlayInterval = setInterval(() => this.updateOverlay(), 100);

    // Add keyboard toggle (F3)
    if (!this.overlayKeyListener) {
      this.overlayKeyListener = (e) => {
        if (e.key === 'F3') {
          e.preventDefault();
          this.toggleOverlay();
        }
      };
      document.addEventListener('keydown', this.overlayKeyListener);
    }

    console.log('[PerformanceMonitor] Overlay enabled (F3 to toggle)');
  }

  /**
   * Updates the overlay content.
   */
  updateOverlay() {
    if (!this.overlayElement || this.overlayElement.style.display === 'none')
      return;

    const m = this.metrics;
    const phases = this.getPhaseReport();
    const fps = this.fps.toFixed(0);
    const frameTime = this.getAverageFrameTime().toFixed(1);

    this.overlayElement.innerHTML = `
      <div style="color:#ff0;font-weight:bold;margin-bottom:5px;">⚡ PERF MONITOR</div>
      <div>FPS: <span style="color:${this.fps < 50 ? '#f00' : '#0f0'}">${fps}</span> (${frameTime}ms)</div>
      <div style="margin-top:5px;color:#0ff;">─── BULLETS ───</div>
      <div>Player: ${m.projectilePlayerCount || 0}</div>
      <div>Enemy: ${m.projectileEnemyCount || 0}</div>
      <div>Trails: ${m.projectilePlayerTrailPoints || 0}</div>
      <div>Update: ${(m.projectileUpdateMs || 0).toFixed(1)}ms</div>
      <div>Render: ${(m.projectileRenderMs || 0).toFixed(1)}ms</div>
      <div style="margin-top:5px;color:#ff0;">─── ENTITIES ───</div>
      <div>Enemies: ${m.enemies || 0}</div>
      <div>Orbs: ${m.orbs || 0}</div>
      <div>Particles: ${m.particles || 0}</div>
      ${phases.render ? `<div style="margin-top:5px;color:#f0f;">─── RENDER ───</div><div>Total: ${phases.render.avg.toFixed(1)}ms</div>` : ''}
      <div style="margin-top:5px;color:#888;font-size:10px;">F3 to toggle</div>
    `;
  }

  /**
   * Toggles overlay visibility.
   */
  toggleOverlay() {
    if (!this.overlayElement) {
      this.showOverlay();
      return;
    }
    const isVisible = this.overlayElement.style.display !== 'none';
    this.overlayElement.style.display = isVisible ? 'none' : 'block';
  }

  /**
   * Hides the overlay.
   */
  hideOverlay() {
    if (this.overlayElement) {
      this.overlayElement.style.display = 'none';
    }
  }
}
