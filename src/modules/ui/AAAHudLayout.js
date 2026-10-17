// src/modules/ui/AAAHudLayout.js

const COMBO_VISIBLE_MIN = 2;
const RADAR_SIZE = 220;
const RADAR_POOL_SIZE = 80;
const BOSS_FALLBACK_COLOR = '#ff003c';
const BOSS_FALLBACK_DARK = '#880020';

export class AAAHudLayout {
  constructor() {
    this._mounted = false;
    this._styleElement = null;
    this._root = null;
    this.els = null;
    this._lastBossHealthPercent = null;
    this._bossHitTimeout = null;
    this._bossCriticalTimeout = null;
    this._bossPhaseMarkers = [];
    this._lastBossPhaseMarkerCount = null;
    this._lastCombo = null;
    this._blipPool = [];
  }

  mount(container) {
    if (this._mounted) {
      return;
    }

    if (!(container instanceof HTMLElement)) {
      throw new Error(
        '[AAAHudLayout] mount(container) requires an HTMLElement.'
      );
    }

    this._styleElement = document.createElement('style');
    this._styleElement.dataset.hudLayout = 'aaa_tactical';
    this._styleElement.textContent = this._getCSS();
    document.head.appendChild(this._styleElement);

    this._root = document.createElement('div');
    this._root.dataset.hudLayoutRoot = 'aaa_tactical';
    container.appendChild(this._root);

    const hudLayer = document.createElement('div');
    hudLayer.id = 'hud-layer';
    hudLayer.innerHTML = this._getHTML();
    const cockpitFrame = hudLayer.querySelector('.cockpit-frame');
    if (cockpitFrame) {
      cockpitFrame.remove();
    }

    this._root.appendChild(hudLayer);
    if (cockpitFrame) {
      this._root.appendChild(cockpitFrame);
    }

    this._cacheElements();
    this._initializeBars();
    this._createBlipPool();

    if (
      typeof globalThis !== 'undefined' &&
      globalThis.lucide &&
      typeof globalThis.lucide.createIcons === 'function'
    ) {
      globalThis.lucide.createIcons();
    }

    this._mounted = true;
  }

  unmount() {
    if (this._root && this._root.parentNode) {
      this._root.parentNode.removeChild(this._root);
    }

    if (this._styleElement && this._styleElement.parentNode) {
      this._styleElement.parentNode.removeChild(this._styleElement);
    }

    this._mounted = false;
    this._styleElement = null;
    this._root = null;
    this.els = null;
    if (this._bossHitTimeout) {
      window.clearTimeout(this._bossHitTimeout);
      this._bossHitTimeout = null;
    }
    if (this._bossCriticalTimeout) {
      window.clearTimeout(this._bossCriticalTimeout);
      this._bossCriticalTimeout = null;
    }
    this._lastBossHealthPercent = null;
    this._bossPhaseMarkers = [];
    this._lastBossPhaseMarkerCount = null;
    this._lastCombo = null;
    this._blipPool = [];
  }

  _cacheElements() {
    const root = this._root;
    if (!root) {
      this.els = null;
      return;
    }

    const query = (selector) => root.querySelector(selector);

    this.els = {
      timer: query('#ui-timer'),
      kills: query('#ui-kills'),
      combo: query('#ui-combo'),
      comboBox: query('#ui-combo-box'),
      bossPanel: query('#ui-boss-panel'),
      bossName: query('#ui-boss-name'),
      bossFill: query('#ui-boss-fill'),
      bossMarkers: query('#ui-boss-markers'),
      radarContainer: query('#ui-radar-blips'),
      shieldRow: query('#ui-shield-row'),
      shieldText: query('#ui-shield-text'),
      hullRow: query('#ui-hull-row'),
      hullText: query('#ui-hull-text'),
      wave: query('#ui-wave-num'),
      xpFill: query('#ui-xp-fill'),
      xpText: query('#ui-xp-text'),
      lvlText: query('#ui-lvl-text'),
      nextWaveBox: query('#el-wave-alert'),
      nextWaveTimer: query('#ui-next-wave-timer'),
      // Plan 01.07 Task 5/6 — combat mode indicators.
      spreadModeIndicator: query('#ui-spread-mode'),
      aimModeIndicator: query('#ui-aim-mode'),
    };
  }

  /**
   * Plan 01.07 Task 5/6 — update spread + aim mode indicators.
   * @param {string} spreadMode - 'concentrated' or 'fan'.
   * @param {string} aimMode - 'auto' or 'manual'.
   */
  updateModeIndicators(spreadMode, aimMode) {
    if (!this.els) {
      return;
    }
    if (this.els.spreadModeIndicator) {
      const label = spreadMode === 'fan' ? 'FAN' : 'CONC';
      this.els.spreadModeIndicator.innerText = label;
    }
    if (this.els.aimModeIndicator) {
      const label = aimMode === 'manual' ? 'MANUAL' : 'AUTO';
      this.els.aimModeIndicator.innerText = label;
    }
  }

  _initializeBars() {
    if (!this.els) {
      return;
    }

    this.createSegments(this.els.shieldRow, 20);
    this.createSegments(this.els.hullRow, 20);
    this.updateVitals(100, 100, 100, 100);
  }

  /** Cria as divs de segmentos para as barras de vida/escudo */
  createSegments(container, count) {
    if (!container) {
      return;
    }

    container.innerHTML = '';
    for (let index = 0; index < count; index += 1) {
      const div = document.createElement('div');
      div.className = 'bar-segment filled';
      container.appendChild(div);
    }
  }

  /** Atualiza tempo, abates e combo */
  updateStats(timeStr, kills, combo) {
    if (!this.els) {
      return;
    }

    if (timeStr) this.els.timer.innerText = timeStr;
    if (kills !== undefined) this.els.kills.innerText = kills;
    if (combo !== undefined && combo !== this._lastCombo) {
      this._lastCombo = combo;
      const visible = combo >= COMBO_VISIBLE_MIN;
      this.els.comboBox.classList.toggle('is-hidden', !visible);
      if (visible) {
        this.els.combo.innerText = 'x' + combo;
        this.els.comboBox.classList.remove('pulse');
        void this.els.comboBox.offsetWidth;
        this.els.comboBox.classList.add('pulse');
      }
    }
  }

  /** Atualiza barras de vida e escudo */
  updateVitals(shield, maxShield, hull, maxHull) {
    if (!this.els) {
      return;
    }

    const safeMaxShield =
      Number.isFinite(maxShield) && maxShield > 0 ? maxShield : 1;
    const safeMaxHull = Number.isFinite(maxHull) && maxHull > 0 ? maxHull : 1;
    const safeShield = Number.isFinite(shield) ? Math.max(0, shield) : 0;
    const safeHull = Number.isFinite(hull) ? Math.max(0, hull) : 0;

    this._updateBar(this.els.shieldRow, safeShield, safeMaxShield);
    this._updateBar(this.els.hullRow, safeHull, safeMaxHull);

    const shieldPercent = Math.floor((safeShield / safeMaxShield) * 100);
    this.els.shieldText.innerText = shieldPercent + '%';

    const hpPercent = Math.floor((safeHull / safeMaxHull) * 100);
    this.els.hullText.innerText = hpPercent + '%';

    // Feedback visual de dano cr¡tico
    if (hpPercent < 30) {
      this.els.hullText.classList.add('is-critical', 'glitch-text');
    } else {
      this.els.hullText.classList.remove('is-critical', 'glitch-text');
    }
  }

  /** Helper interno para preencher segmentos */
  _updateBar(container, value, max) {
    if (!container) {
      return;
    }

    const segments = container.children;
    const total = segments.length;
    if (!total) {
      return;
    }

    const safeMax = Number.isFinite(max) && max > 0 ? max : 1;
    const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;

    const filledCount = Math.ceil((safeValue / safeMax) * total);
    for (let index = 0; index < total; index += 1) {
      if (index < filledCount) segments[index].classList.add('filled');
      else segments[index].classList.remove('filled');
    }
  }

  /** Mostra/Esconde e atualiza Boss Bar */
  updateBoss(active, name, healthPercent, phaseInfo) {
    if (!this.els) {
      return;
    }

    if (!active) {
      this.els.bossPanel.classList.remove('active');
      this.els.bossPanel.classList.remove('is-hit', 'is-invulnerable');
      this.els.bossPanel.classList.remove('is-critical');
      if (this._bossHitTimeout) {
        window.clearTimeout(this._bossHitTimeout);
        this._bossHitTimeout = null;
      }
      if (this._bossCriticalTimeout) {
        window.clearTimeout(this._bossCriticalTimeout);
        this._bossCriticalTimeout = null;
      }
      this._lastBossHealthPercent = null;
      this._updateBossPhaseMarkers(0, 0);
      this._resetBossColors();
      return;
    }

    this.els.bossPanel.classList.add('active');
    this.els.bossPanel.classList.toggle(
      'is-invulnerable',
      Boolean(phaseInfo?.invulnerable)
    );

    // Phase text: "BOSS NAME • PHASE 2/3"
    const phase = phaseInfo?.phase;
    const phaseCount = phaseInfo?.phaseCount;
    const hasPhases = typeof phase === 'number' && phaseCount > 1;
    const displayName = hasPhases
      ? `${name || 'BOSS'} • PHASE ${phase + 1}/${phaseCount}`
      : name || 'BOSS';
    this.els.bossName.innerText = displayName;

    // Phase color: change bar color based on current phase
    const phaseColors = phaseInfo?.phaseColors;
    if (
      Array.isArray(phaseColors) &&
      phaseColors.length > 0 &&
      typeof phase === 'number'
    ) {
      const color =
        phaseColors[Math.min(phase, phaseColors.length - 1)] ||
        BOSS_FALLBACK_COLOR;
      const darkColor = this._darkenColor(color, 0.4);
      this.els.bossFill.style.background = `repeating-linear-gradient(45deg, ${color}, ${color} 10px, ${darkColor} 10px, ${darkColor} 20px)`;
      this.els.bossFill.style.boxShadow = `0 0 20px ${color}`;
    }

    if (healthPercent !== undefined) {
      this.els.bossFill.style.width = healthPercent + '%';
    }

    if (Number.isFinite(healthPercent)) {
      const delta =
        this._lastBossHealthPercent !== null
          ? this._lastBossHealthPercent - healthPercent
          : 0;
      if (
        this._lastBossHealthPercent !== null &&
        healthPercent < this._lastBossHealthPercent
      ) {
        this._triggerBossHit();
        if (delta >= 8) {
          this._triggerBossCritical();
        }
      }
      this._lastBossHealthPercent = healthPercent;
    }

    this._updateBossPhaseMarkers(phaseCount, phase);
  }

  /** Reset boss bar colors to default */
  _resetBossColors() {
    if (!this.els?.bossFill) return;
    this.els.bossFill.style.background = '';
    this.els.bossFill.style.boxShadow = '';
  }

  _triggerBossHit() {
    if (!this.els?.bossPanel) {
      return;
    }
    this.els.bossPanel.classList.add('is-hit');
    if (this._bossHitTimeout) {
      window.clearTimeout(this._bossHitTimeout);
    }
    this._bossHitTimeout = window.setTimeout(() => {
      this.els?.bossPanel?.classList.remove('is-hit');
      this._bossHitTimeout = null;
    }, 180);
  }

  _triggerBossCritical() {
    if (!this.els?.bossPanel) {
      return;
    }
    this.els.bossPanel.classList.add('is-critical');
    if (this._bossCriticalTimeout) {
      window.clearTimeout(this._bossCriticalTimeout);
    }
    this._bossCriticalTimeout = window.setTimeout(() => {
      this.els?.bossPanel?.classList.remove('is-critical');
      this._bossCriticalTimeout = null;
    }, 280);
  }

  _updateBossPhaseMarkers(phaseCount, phaseIndex) {
    if (!this.els?.bossMarkers) {
      return;
    }

    const total = Number.isFinite(phaseCount) ? Math.floor(phaseCount) : 0;
    const markerCount = total > 1 ? total - 1 : 0;

    if (markerCount !== this._lastBossPhaseMarkerCount) {
      this.els.bossMarkers.innerHTML = '';
      this._bossPhaseMarkers = [];
      for (let i = 0; i < markerCount; i += 1) {
        const marker = document.createElement('div');
        marker.className = 'boss-phase-marker';
        marker.style.left = `${((i + 1) / total) * 100}%`;
        this.els.bossMarkers.appendChild(marker);
        this._bossPhaseMarkers.push(marker);
      }
      this._lastBossPhaseMarkerCount = markerCount;
    }

    if (!markerCount) {
      return;
    }

    const currentPhase = Number.isFinite(phaseIndex) ? phaseIndex : 0;
    this._bossPhaseMarkers.forEach((marker, index) => {
      marker.classList.toggle('passed', currentPhase > index);
      marker.classList.toggle(
        'next',
        currentPhase <= index && currentPhase === index
      );
    });
  }

  /** Darken a hex color by a factor (0-1) */
  _darkenColor(hex, factor) {
    if (!hex || typeof hex !== 'string') return BOSS_FALLBACK_DARK;
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return BOSS_FALLBACK_DARK;
    const num = parseInt(clean, 16);
    const r = Math.max(0, Math.floor(((num >> 16) & 0xff) * (1 - factor)));
    const g = Math.max(0, Math.floor(((num >> 8) & 0xff) * (1 - factor)));
    const b = Math.max(0, Math.floor((num & 0xff) * (1 - factor)));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  /** Atualiza XP, N¡vel e Onda */
  updateExperience(level, currentXP, requiredXP, waveNum) {
    if (!this.els) {
      return;
    }

    if (waveNum !== undefined) this.els.wave.innerText = waveNum;

    const safeRequired =
      Number.isFinite(requiredXP) && requiredXP > 0 ? requiredXP : 1;
    const safeCurrent = Number.isFinite(currentXP) ? Math.max(0, currentXP) : 0;

    const xpPercent = Math.min(
      100,
      Math.floor((safeCurrent / safeRequired) * 100)
    );
    this.els.xpFill.style.width = xpPercent + '%';

    this.els.xpText.innerText = `${Math.floor(safeCurrent)} / ${Math.floor(
      safeRequired
    )}`;
    this.els.lvlText.innerText = `Lvl ${level}`;
  }

  updateNextWaveTimer(seconds) {
    if (!this.els) {
      return;
    }

    const nextWaveBox = this.els.nextWaveBox;
    const nextWaveTimer = this.els.nextWaveTimer;
    if (!nextWaveBox || !nextWaveTimer) {
      return;
    }

    const safeSeconds = Number.isFinite(seconds) ? Math.ceil(seconds) : 0;
    if (safeSeconds <= 0) {
      nextWaveBox.classList.remove('visible');
      return;
    }

    nextWaveBox.classList.add('visible');
    nextWaveTimer.innerText = safeSeconds;
  }

  /**
   * Atualiza Radar
   * @param {Array} blips - [{x: -1..1, y: -1..1, type: 'enemy'|'ally'}]
   */
  updateRadar(blips) {
    if (!this.els) {
      return;
    }

    const list = Array.isArray(blips) ? blips : [];
    const count = Math.min(list.length, this._blipPool.length);
    for (let i = 0; i < this._blipPool.length; i += 1) {
      const el = this._blipPool[i];
      if (i >= count) {
        if (el.style.display !== 'none') el.style.display = 'none';
        continue;
      }
      const b = list[i];
      const type = b.type || 'enemy';
      if (el.dataset.type !== type) {
        el.dataset.type = type;
        el.className = 'blip ' + type;
      }
      el.style.display = '';
      const x = ((b.x + 1) / 2) * RADAR_SIZE;
      const y = ((b.y + 1) / 2) * RADAR_SIZE;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    }
  }

  _createBlipPool() {
    this._blipPool = [];
    for (let i = 0; i < RADAR_POOL_SIZE; i += 1) {
      const el = document.createElement('div');
      el.className = 'blip enemy';
      el.dataset.type = 'enemy';
      el.style.display = 'none';
      this.els.radarContainer.appendChild(el);
      this._blipPool.push(el);
    }
  }

  _getHTML() {
    return `
            <!-- STATS (Top Left) -->
            <div class="stats-area hud-panel">
                <div class="stats-grid">
                    <div class="stat-block">
                        <div class="stat-label"><i data-lucide="clock" size="14"></i> TIME</div>
                        <div class="stat-value" id="ui-timer">00:00</div>
                    </div>
                    <div class="stat-block">
                        <div class="stat-label"><i data-lucide="crosshair" size="14"></i> KILLS</div>
                        <div class="stat-value" id="ui-kills">0</div>
                    </div>
                </div>
                <div class="combo-box is-hidden" id="ui-combo-box">
                    <div class="combo-label">COMBO</div>
                    <div class="combo-val" id="ui-combo">x0</div>
                </div>
            </div>

            <!-- BOSS (Top Center) -->
            <div class="boss-area hud-panel" id="ui-boss-panel">
                <div class="warning-strip">
                    <span class="warning-light"><i data-lucide="alert-triangle" size="16"></i> WARNING</span>
                    <span class="warning-light">WARNING <i data-lucide="alert-triangle" size="16"></i></span>
                </div>
                <div class="boss-bar-container">
                    <div class="boss-name" id="ui-boss-name">BOSS</div>
                    <div class="boss-skull"><i data-lucide="skull" size="24"></i></div>
                    <div class="boss-fill" id="ui-boss-fill"></div>
                    <div class="boss-phase-markers" id="ui-boss-markers"></div>
                </div>
            </div>

            <!-- RADAR (Top Right - Decagon + Analog Ring) -->
            <div class="radar-area hud-panel">
                <div class="radar-structure">
                    <svg class="radar-svg-layer" viewBox="0 0 220 220">
                        <circle class="radar-ring" cx="110" cy="110" r="108" />
                        <circle class="radar-ring-dash" cx="110" cy="110" r="100" />
                        <polygon class="radar-outline" points="110,15 166,33 200,81 200,139 166,187 110,205 54,187 20,139 20,81 54,33" />
                        <line class="radar-axis" x1="110" y1="15" x2="110" y2="205" />
                        <line class="radar-axis" x1="20" y1="139" x2="200" y2="81" />
                        <line class="radar-axis" x1="20" y1="81" x2="200" y2="139" />
                        <line class="radar-axis" x1="166" y1="33" x2="54" y2="187" />
                        <line class="radar-axis" x1="54" y1="33" x2="166" y2="187" />
                        <polygon class="radar-inner" points="110,53 144,64 164,93 164,127 144,156 110,167 76,156 56,127 56,93 76,64" />
                    </svg>

                    <div class="radar-mask">
                        <div class="radar-sweep"></div>
                        <div class="blip-container" id="ui-radar-blips">
                            <div class="blip player"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- NEXT WAVE (Center) -->
            <div class="next-wave-box" id="el-wave-alert">
                <div class="next-wave-label">INCOMING LAYER</div>
                <div class="next-wave-timer" id="ui-next-wave-timer">10</div>
            </div>

            <!-- VITALS (Bottom Left) -->
            <div class="status-area hud-panel">
                <div class="bars-container">
                    <div class="system-label shield-label">❖ SHIELDS</div>
                    <div class="bar-wrapper">
                        <div class="health-bar-row shield" id="ui-shield-row"></div>
                        <div class="numeric-text shield-text" id="ui-shield-text">100%</div>
                    </div>
                    <div class="bar-wrapper">
                        <div class="health-bar-row" id="ui-hull-row"></div>
                        <div class="numeric-text hull-text" id="ui-hull-text">100%</div>
                    </div>
                    <div class="system-label hull-label">♥ HULL INTEGRITY</div>
                </div>
            </div>

            <!-- PROGRESS (Bottom Center) -->
            <div class="bottom-center hud-panel">
                <div class="wave-indicator">
                    <div class="wave-content">
                        <div class="wave-label">LAYER</div>
                        <div class="wave-num" id="ui-wave-num">1</div>
                    </div>
                </div>
                <div class="xp-bar-container">
                    <div class="xp-label"><i data-lucide="zap" size="12"></i> XP</div>
                    <div class="xp-fill" id="ui-xp-fill"></div>
                </div>
                <div class="xp-details">
                    <div class="xp-values" id="ui-xp-text">0 / 1000</div>
                    <div class="lvl-indicator" id="ui-lvl-text">Lvl 1</div>
                </div>
            </div>

            <!-- MODES (Bottom Right) -->
            <div class="systems-area hud-panel">
                <div class="mode-chip">AIM <span class="data-val" id="ui-aim-mode">AUTO</span></div>
                <div class="mode-chip">SPREAD <span class="data-val" id="ui-spread-mode">CONC</span></div>
            </div>

            <div class="cockpit-frame"></div>
        `;
  }
  _getCSS() {
    return `
            #hud-layer {
                position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 20;
                box-sizing: border-box;
                padding: var(--space-4, 16px);
                display: grid;
                grid-template-columns: 220px 1fr 220px;
                grid-template-rows: auto 1fr auto;
                pointer-events: none;
                font-family: var(--font-ui, 'Rajdhani', sans-serif);
                font-size: calc(1rem * var(--hud-scale-effective, 1));
                color: var(--text, #e8f4ff);
            }
            .hud-panel { pointer-events: auto; transition: opacity var(--motion-base, 0.3s); }

            .cockpit-frame {
                position: absolute; width: 100%; height: 100%; z-index: 11; pointer-events: none;
                background: linear-gradient(135deg, rgba(5,5,5,0.5) 2%, transparent 10%),
                            linear-gradient(-135deg, rgba(5,5,5,0.5) 2%, transparent 10%),
                            linear-gradient(45deg, rgba(5,5,5,0.5) 2%, transparent 10%),
                            linear-gradient(-45deg, rgba(5,5,5,0.5) 2%, transparent 10%);
            }

            /* STATS */
            .stats-area { display: flex; flex-direction: column; gap: var(--space-3, 12px); }
            .stats-grid { display: flex; flex-direction: column; gap: var(--space-3, 12px); }
            .stat-block { display: flex; flex-direction: column; background: linear-gradient(90deg, var(--surface, rgba(12, 20, 31, 0.65)) 0%, transparent 100%); padding: var(--space-1, 4px) var(--space-2, 8px) var(--space-1, 4px) var(--space-3, 12px); border-left: 3px solid var(--neutral, #00aaff); width: fit-content; min-width: 160px; }
            .stat-label { font-size: var(--text-xs, 12px); color: var(--neutral, #00aaff); letter-spacing: 1px; margin-bottom: 2px; display: flex; align-items: center; gap: 6px; font-weight: 700; }
            .stat-value { font-family: var(--font-display, 'Orbitron', sans-serif); font-size: var(--text-xl, 28px); color: var(--text, #fff); line-height: 1.1; }
            .combo-box { margin-top: var(--space-2, 8px); }
            .combo-box.is-hidden { visibility: hidden; }
            .combo-box.pulse { animation: pulse-text var(--motion-base, 0.3s) var(--ease-out, ease-out) 1; }
            .combo-label { font-size: var(--text-sm, 14px); color: var(--accent, #00f2ff); letter-spacing: 2px; font-weight: 700; }
            .combo-val { font-size: var(--text-xl, 28px); line-height: 1; font-family: var(--font-display, 'Orbitron', sans-serif); color: var(--status, #ffae00); font-weight: 900; }

            /* BOSS */
            .boss-area { grid-column: 2; display: flex; flex-direction: column; align-items: center; padding-top: var(--space-4, 16px); opacity: 0; transition: opacity 0.5s; }
            .boss-area.active { opacity: 1; }
            .warning-strip { display: flex; gap: 50px; margin-bottom: 5px; opacity: 0.9; }
            .warning-light { color: var(--danger, #ff003c); font-weight: bold; font-size: var(--text-md, 16px); animation: blink 0.5s infinite alternate; letter-spacing: 3px; }
            .boss-bar-container { position: relative; width: 70%; height: 32px; background: var(--surface, rgba(20, 0, 0, 0.6)); border: 1px solid var(--boss, #ff003c); display: flex; align-items: center; margin-top: var(--space-4, 16px); }
            .boss-skull { width: 45px; height: 45px; background: var(--bg, #0a0a0f); border: 2px solid var(--boss, #ff003c); position: absolute; left: -22px; display: flex; justify-content: center; align-items: center; clip-path: polygon(25% 0%, 75% 0%, 100% 25%, 100% 75%, 75% 100%, 25% 100%, 0% 75%, 0% 25%); color: var(--boss, #ff003c); z-index: 5; }
            .boss-fill { height: 100%; width: 100%; background: var(--boss, #ff003c); box-shadow: 0 0 20px var(--boss, #ff003c); transition: width 0.3s ease-out; position: relative; }
            .boss-name { position: absolute; top: -24px; width: 100%; text-align: center; font-size: var(--text-md, 16px); letter-spacing: 4px; color: var(--text, #fff); font-weight: 700; }
            .boss-phase-markers { position: absolute; inset: 0; z-index: 6; pointer-events: none; }
            .boss-phase-marker { position: absolute; top: -2px; width: 2px; height: calc(100% + 4px); background: var(--line, rgba(255, 255, 255, 0.18)); transform: translateX(-50%); }
            .boss-phase-marker.passed { background: var(--boss, #ff003c); }
            .boss-phase-marker.next { background: var(--text, #fff); }
            .boss-area.is-hit .boss-fill { animation: boss-hit 0.25s ease-out; }
            .boss-area.is-critical .boss-fill { animation: boss-critical 0.3s ease-out; }
            .boss-area.is-invulnerable .boss-fill { filter: grayscale(0.35) brightness(0.75); opacity: 0.65; }
            .boss-area.is-invulnerable .boss-bar-container { border-color: var(--text-dim, rgba(255, 255, 255, 0.35)); }
            .boss-area.is-invulnerable .boss-skull { border-color: var(--text-dim, rgba(255, 255, 255, 0.7)); color: var(--text-dim, rgba(255, 255, 255, 0.9)); }

            /* RADAR - Decagon + Analog Ring */
            .radar-area { grid-column: 3; grid-row: 1; justify-self: end; align-self: start; }
            .radar-structure { width: 220px; height: 220px; position: relative; }
            .radar-svg-layer { position: absolute; inset: 0; z-index: 5; pointer-events: none; fill: none; }
            .radar-ring { stroke: var(--neutral, #00aaff); stroke-width: 2; stroke-opacity: 0.6; }
            .radar-ring-dash { stroke: var(--accent, #00f2ff); stroke-width: 1; stroke-dasharray: 4 6; opacity: 0.3; }
            .radar-outline { stroke: var(--accent, #00f2ff); stroke-width: 1.5; opacity: 0.8; }
            .radar-axis { stroke: var(--neutral, #00aaff); stroke-width: 1; opacity: 0.1; }
            .radar-inner { stroke: var(--neutral, #00aaff); stroke-width: 1; opacity: 0.2; }
            .radar-mask {
                position: absolute; inset: 0; z-index: 2; background: var(--surface, rgba(0, 10, 20, 0.5));
                clip-path: polygon(50% 7%, 75.5% 15%, 91% 37%, 91% 63%, 75.5% 85%, 50% 93%, 24.5% 85%, 9% 63%, 9% 37%, 24.5% 15%);
            }
            .radar-sweep { position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: conic-gradient(from 0deg, transparent 0%, transparent 60%, transparent 80%, var(--glow-accent, rgba(0, 242, 255, 0.35)) 100%); animation: radar-sweep-anim 4s linear infinite; border-radius: 50%; mix-blend-mode: screen; pointer-events: none; }
            .blip-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 10; }
            .blip { position: absolute; top: 0; left: 0; border-radius: 50%; box-shadow: 0 0 6px 1px currentColor; will-change: transform; }
            .blip.enemy { width: 6px; height: 6px; background: var(--danger, #ff003c); color: var(--danger, #ff003c); }
            .blip.boss { width: 10px; height: 10px; background: var(--boss, #ff003c); color: var(--boss, #ff003c); }
            .blip.ally { width: 6px; height: 6px; background: var(--status, #00ff66); color: var(--status, #00ff66); }
            .blip.player { top: 50%; left: 50%; width: 8px; height: 8px; background: var(--text, #fff); border: 1px solid var(--accent, #00f2ff); color: var(--text, #fff); z-index: 15; transform: translate(-50%, -50%); }

            /* NEXT WAVE */
            .next-wave-box { position: absolute; top: 50%; left: 0; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; transform: translateY(-50%); font-family: var(--font-display, 'Orbitron', sans-serif); opacity: 0; transition: opacity var(--motion-base, 0.3s); pointer-events: none; z-index: 100; }
            .next-wave-box.visible { opacity: 1; }
            .next-wave-label { font-size: var(--text-lg, 20px); color: var(--danger, #ff003c); letter-spacing: 6px; font-weight: 900; margin: 0; text-transform: uppercase; text-shadow: 0 0 15px rgba(0, 0, 0, 0.9); line-height: 1.2; }
            .next-wave-timer { font-size: 4rem; line-height: 1; color: var(--text, #fff); font-weight: 900; text-shadow: 0 0 20px var(--danger, #ff003c), 2px 2px 0 #000; margin-top: var(--space-2, 8px); }
            .next-wave-box.visible .next-wave-timer { animation: alert-pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite; }

            /* VITALS */
            .status-area { grid-row: 3; display: flex; flex-direction: column; justify-content: flex-end; }
            .bars-container { transform: skewX(-15deg); }
            .bar-wrapper { display: flex; align-items: center; margin-bottom: 2px; }
            .health-bar-row { display: flex; height: 16px; gap: 3px; flex-grow: 1; min-width: 120px; }
            .health-bar-row.shield { height: 12px; opacity: 0.9; }
            .bar-segment { flex: 1; background: var(--surface, rgba(12, 20, 31, 0.65)); border: 1px solid var(--line, rgba(255, 255, 255, 0.2)); transition: background var(--motion-fast, 0.15s); }
            .bar-segment.filled { background: var(--hull, #00ff66); border-color: var(--text, #fff); }
            .shield .bar-segment.filled { background: var(--accent, #00f2ff); border-color: var(--text, #fff); }
            .system-label { font-size: var(--text-xs, 12px); font-weight: 700; letter-spacing: 1px; margin: 2px 0; }
            .shield-label, .shield-text { color: var(--accent, #00f2ff); }
            .hull-label, .hull-text { color: var(--status, #00ff66); }
            .hull-text.is-critical { color: var(--danger, #ff003c); }
            .numeric-text { font-family: var(--font-display, 'Orbitron', sans-serif); font-size: var(--text-md, 16px); font-weight: bold; transform: skewX(15deg); margin-left: var(--space-2, 8px); min-width: 48px; transition: color var(--motion-base, 0.3s); }

            /* PROGRESS */
            .bottom-center { grid-row: 3; grid-column: 2; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
            .wave-indicator { width: 70px; height: 70px; border-radius: 50%; border: 2px solid var(--line, rgba(255,255,255,0.1)); border-top: 2px solid var(--accent, #00f2ff); border-bottom: 2px solid var(--accent, #00f2ff); display: flex; flex-direction: column; justify-content: center; align-items: center; background: var(--surface-strong, rgba(0,0,0,0.8)); margin-bottom: var(--space-3, 12px); animation: rotate-border 4s infinite linear reverse; }
            .wave-content { animation: rotate-border 4s infinite linear; text-align: center; }
            .wave-num { font-size: var(--text-xl, 28px); color: var(--text, #fff); font-family: var(--font-display, 'Orbitron', sans-serif); line-height: 1; }
            .wave-label { font-size: var(--text-xs, 12px); color: var(--neutral, #00aaff); letter-spacing: 1px; }
            .xp-bar-container { width: 100%; max-width: 300px; height: 6px; background: var(--surface-strong, #0a0a0a); border: 1px solid var(--line, #333); border-radius: var(--radius-sm, 4px); position: relative; display: flex; align-items: center; margin-bottom: 2px; }
            .xp-fill { height: 100%; width: 0%; background: var(--xp, #aa00ff); border-radius: 2px; transition: width 0.5s var(--ease-out, ease-out); }
            .xp-label { position: absolute; left: 0; top: -20px; font-size: var(--text-xs, 12px); color: var(--xp, #aa00ff); font-weight: bold; z-index: 2; display: flex; align-items: center; gap: 5px; }
            .xp-details { display: flex; justify-content: space-between; width: 100%; max-width: 300px; margin-top: 2px; }
            .xp-values { font-family: var(--font-mono, 'Consolas', monospace); font-size: var(--text-xs, 12px); color: var(--text-dim, #ccc); letter-spacing: 1px; }
            .lvl-indicator { font-family: var(--font-display, 'Orbitron', sans-serif); font-size: var(--text-sm, 14px); font-weight: 700; color: var(--text, #fff); letter-spacing: 1px; }

            /* MODES */
            .systems-area { grid-row: 3; grid-column: 3; display: flex; flex-direction: row; justify-content: flex-end; align-items: flex-end; gap: var(--space-2, 8px); }
            .mode-chip { font-family: var(--font-mono, 'Consolas', monospace); font-size: var(--text-xs, 12px); color: var(--text-dim, #ccc); background: var(--surface, rgba(12, 20, 31, 0.65)); border: 1px solid var(--line, rgba(255,255,255,0.2)); border-radius: var(--radius-sm, 4px); padding: var(--space-1, 4px) var(--space-2, 8px); letter-spacing: 1px; }
            .data-val { color: var(--accent, #00f2ff); font-weight: bold; }

            /* ANIMATIONS */
            @keyframes pulse-text { 0% { transform: scale(1); } 40% { transform: scale(1.15); } 100% { transform: scale(1); } }
            @keyframes blink { 0% { opacity: 0.3; } 100% { opacity: 1; } }
            @keyframes rotate-border { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            @keyframes radar-sweep-anim { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            @keyframes alert-pulse { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }
            @keyframes boss-hit { 0% { filter: brightness(1.6); } 100% { filter: brightness(1); } }
            @keyframes boss-critical { 0% { filter: brightness(2); } 100% { filter: brightness(1); } }
            @keyframes glitch { 0%, 92%, 95%, 100% { transform: translate(0, 0); opacity: 1; } 93% { transform: translate(-2px, 2px); opacity: 0.8; } 94% { transform: translate(2px, -2px); opacity: 0.8; } 96% { transform: translate(1px, 2px); opacity: 0.9; } 97% { transform: translate(-1px, -1px); opacity: 0.9; } }
            .glitch-text { animation: glitch 3s infinite; }

            @media (max-width: 900px) { #hud-layer { grid-template-columns: 1fr; grid-template-rows: auto 1fr auto; } .stats-area { position: absolute; top: 10px; left: 10px; } .radar-area { position: absolute; top: 10px; right: 10px; } .boss-area { margin-top: 60px; transform: scale(0.8); } .status-area { position: absolute; bottom: 20px; left: 10px; transform: scale(0.9); transform-origin: bottom left; } .systems-area { position: absolute; bottom: 20px; right: 10px; } .bottom-center { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); width: 300px; } }
        `;
  }
}
