// src/modules/ui/AAAHudLayout.js

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
      coordX: query('#ui-coord-x'),
      coordY: query('#ui-coord-y'),
      vel: query('#ui-velocity'),
      nextWaveBox: query('#el-wave-alert'),
      nextWaveTimer: query('#ui-next-wave-timer'),
    };
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
    if (combo !== undefined) this.els.combo.innerText = 'x' + combo;
  }

  /** Atualiza telemetria de navega‡Æo */
  updateTelemetry(x, y, speed) {
    if (!this.els) {
      return;
    }

    const safeX = Number.isFinite(x) ? x : 0;
    const safeY = Number.isFinite(y) ? y : 0;
    const safeSpeed = Number.isFinite(speed) ? speed : 0;

    this.els.coordX.innerText = safeX.toFixed(2);
    this.els.coordY.innerText = safeY.toFixed(2);
    this.els.vel.innerText = Math.floor(safeSpeed);
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
      this.els.hullText.style.color = 'var(--danger-red)';
      this.els.hullText.classList.add('glitch-text');
    } else {
      this.els.hullText.style.color = 'var(--health-green)';
      this.els.hullText.classList.remove('glitch-text');
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
        phaseColors[Math.min(phase, phaseColors.length - 1)] || '#ff003c';
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
    if (!hex || typeof hex !== 'string') return '#880020';
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return '#880020';
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

    this.els.radarContainer.innerHTML = '<div class="blip player"></div>';
    (Array.isArray(blips) ? blips : []).forEach((b) => {
      const el = document.createElement('div');
      el.className = 'blip ' + (b.type || 'enemy');
      const left = (b.x + 1) * 50;
      const top = (b.y + 1) * 50;
      el.style.left = left + '%';
      el.style.top = top + '%';
      this.els.radarContainer.appendChild(el);
    });
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
                <div class="combo-box">
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
                        <circle cx="110" cy="110" r="108" fill="none" stroke="var(--secondary-blue)" stroke-width="2" stroke-opacity="0.6" />
                        <circle cx="110" cy="110" r="100" fill="none" stroke="var(--primary-cyan)" stroke-width="1" stroke-dasharray="4 6" opacity="0.3" />
                        <polygon points="110,15 166,33 200,81 200,139 166,187 110,205 54,187 20,139 20,81 54,33" fill="none" stroke="var(--primary-cyan)" stroke-width="1.5" opacity="0.8" />
                        <line x1="110" y1="15" x2="110" y2="205" stroke="var(--secondary-blue)" stroke-width="1" opacity="0.1" />
                        <line x1="20" y1="139" x2="200" y2="81" stroke="var(--secondary-blue)" stroke-width="1" opacity="0.1" />
                        <line x1="20" y1="81" x2="200" y2="139" stroke="var(--secondary-blue)" stroke-width="1" opacity="0.1" />
                        <line x1="166" y1="33" x2="54" y2="187" stroke="var(--secondary-blue)" stroke-width="1" opacity="0.1" />
                        <line x1="54" y1="33" x2="166" y2="187" stroke="var(--secondary-blue)" stroke-width="1" opacity="0.1" />
                        <polygon points="110,53 144,64 164,93 164,127 144,156 110,167 76,156 56,127 56,93 76,64" fill="none" stroke="var(--secondary-blue)" stroke-width="1" opacity="0.2" />
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
                <div class="next-wave-label">INCOMING WAVE</div>
                <div class="next-wave-timer" id="ui-next-wave-timer">10</div>
            </div>

            <!-- VITALS (Bottom Left) -->
            <div class="status-area hud-panel">
                <div class="locked-msg" id="ui-weapon-msg">
                    <div style="color: var(--secondary-blue);"><i data-lucide="lock" size="24"></i></div>
                    <div>
                        <div style="font-size:0.6rem; color:#88ccff; letter-spacing: 1px;">WEAPON SYSTEM</div>
                        <div style="font-weight: bold; color: #fff;">LOCKED // LVL 5 REQ</div>
                    </div>
                </div>
                <div class="bars-container">
                    <div class="system-label" style="color: var(--secondary-blue)">❖ SHIELDS</div>
                    <div class="bar-wrapper" style="margin-bottom: 2px;">
                        <div class="health-bar-row shield" id="ui-shield-row"></div>
                        <div class="numeric-text" id="ui-shield-text" style="color: var(--secondary-blue)">100%</div>
                    </div>
                    <div class="bar-wrapper">
                        <div class="health-bar-row" id="ui-hull-row"></div>
                        <div class="numeric-text" id="ui-hull-text" style="color: var(--health-green)">100%</div>
                    </div>
                    <div class="system-label" style="color: var(--health-green)">♥ HULL INTEGRITY</div>
                </div>
            </div>

            <!-- PROGRESS (Bottom Center) -->
            <div class="bottom-center hud-panel">
                <div class="wave-indicator">
                    <div class="wave-content">
                        <div class="wave-label">WAVE</div>
                        <div class="wave-num" id="ui-wave-num">1</div>
                    </div>
                </div>
                <div class="xp-bar-container">
                    <div class="xp-label"><i data-lucide="zap" size="12" fill="#ddaaff"></i> XP</div>
                    <div class="xp-fill" id="ui-xp-fill"></div>
                </div>
                <div class="xp-details">
                    <div class="xp-values" id="ui-xp-text">0 / 1000</div>
                    <div class="lvl-indicator" id="ui-lvl-text">Lvl 1</div>
                </div>
            </div>

            <!-- NAV (Bottom Right) -->
            <div class="systems-area hud-panel">
                <div class="nav-block">
                    <div class="nav-label">NAV SYSTEMS <i data-lucide="compass" size="14"></i></div>
                    <div class="micro-data">
                        COORD: <span class="data-val" id="ui-coord-x">000.00</span> / <span class="data-val" id="ui-coord-y">000.00</span><br>
                        VELOCITY: <span class="data-val" id="ui-velocity">0</span> km/h
                    </div>
                </div>
            </div>
            
            <div class="cockpit-frame"></div>
        `;
  }
  _getCSS() {
    return `
            @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@500;700&display=swap');
            
            :root { 
                --primary-cyan: #00f0ff; 
                --secondary-blue: #00aaff; 
                --danger-red: #ff003c; 
                --health-green: #00ff66; 
                --xp-purple: #aa00ff; 
                --hud-bg: rgba(12, 20, 31, 0.65); 
            }
            
            #hud-layer { 
                position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 20; 
                padding: 20px; /* Safe Area Global */
                display: grid; 
                grid-template-columns: 320px 1fr 320px; 
                grid-template-rows: 150px 1fr 180px; 
                pointer-events: none; 
                text-shadow: 0 0 5px rgba(0, 240, 255, 0.5); 
                font-family: 'Rajdhani', sans-serif; 
                color: white; 
            }
            .hud-panel { pointer-events: auto; transition: opacity 0.3s; }
            
            .cockpit-frame { 
                position: absolute; width: 100%; height: 100%; z-index: 11; pointer-events: none; 
                background: linear-gradient(135deg, rgba(5,5,5,0.5) 2%, transparent 10%), 
                            linear-gradient(-135deg, rgba(5,5,5,0.5) 2%, transparent 10%), 
                            linear-gradient(45deg, rgba(5,5,5,0.5) 2%, transparent 10%), 
                            linear-gradient(-45deg, rgba(5,5,5,0.5) 2%, transparent 10%); 
            }
            
            /* STATS */
            .stats-area { display: flex; flex-direction: column; gap: 15px; padding-top: 20px; padding-left: 20px; }
            .stats-grid { display: flex; flex-direction: column; gap: 15px; }
            .stat-block { display: flex; flex-direction: column; background: linear-gradient(90deg, rgba(0, 20, 40, 0.6) 0%, transparent 100%); padding: 5px 10px 5px 15px; border-left: 3px solid var(--secondary-blue); position: relative; width: fit-content; min-width: 180px; }
            .stat-block::before { content: ''; position: absolute; top: 0; left: 0; width: 10px; height: 1px; background: var(--secondary-blue); }
            .stat-label { font-size: 0.7rem; color: var(--secondary-blue); letter-spacing: 1px; margin-bottom: 2px; display: flex; align-items: center; gap: 6px; font-weight: 700; }
            .stat-value { font-family: 'Orbitron'; font-size: 1.6rem; color: #fff; line-height: 1.1; }
            .combo-box { margin-top: 10px; opacity: 0.8; animation: pulse-text 2s infinite; }
            .combo-label { font-size: 0.9rem; color: var(--primary-cyan); letter-spacing: 2px; font-weight: 700; }
            .combo-val { font-size: 2.5rem; line-height: 0.8; font-family: 'Orbitron'; background: linear-gradient(to bottom, #fff, #ffae00); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 900; margin-left: -2px; }
            
            /* BOSS */
            .boss-area { grid-column: 2; display: flex; flex-direction: column; align-items: center; padding-top: 20px; opacity: 0; transition: opacity 0.5s; }
            .boss-area.active { opacity: 1; }
            .warning-strip { display: flex; gap: 50px; margin-bottom: 5px; opacity: 0.9; }
            .warning-light { color: var(--danger-red); font-weight: bold; font-size: 1.1rem; animation: blink 0.5s infinite alternate; letter-spacing: 3px; }
            .boss-bar-container { position: relative; width: 70%; height: 35px; background: rgba(20, 0, 0, 0.6); border: 1px solid #662222; transform: perspective(500px) rotateX(15deg); display: flex; align-items: center; margin-top: 10px; }
            .boss-skull { width: 45px; height: 45px; background: #1a0505; border: 2px solid var(--danger-red); position: absolute; left: -22px; display: flex; justify-content: center; align-items: center; clip-path: polygon(25% 0%, 75% 0%, 100% 25%, 100% 75%, 75% 100%, 25% 100%, 0% 75%, 0% 25%); box-shadow: 0 0 15px var(--danger-red); color: var(--danger-red); z-index: 5; animation: pulse-border 2s infinite; }
            .boss-fill { height: 100%; width: 100%; background: repeating-linear-gradient(45deg, var(--danger-red), var(--danger-red) 10px, #880020 10px, #880020 20px); box-shadow: 0 0 20px var(--danger-red); transition: width 0.3s ease-out; position: relative; }
            .boss-name { position: absolute; top: -22px; width: 100%; text-align: center; font-size: 1rem; letter-spacing: 4px; color: #ffcccc; font-weight: 700; }
            .boss-phase-markers { position: absolute; inset: 0; z-index: 6; pointer-events: none; }
            .boss-phase-marker { position: absolute; top: -2px; width: 2px; height: calc(100% + 4px); background: rgba(255, 255, 255, 0.18); box-shadow: 0 0 6px rgba(255, 255, 255, 0.3); transform: translateX(-50%); }
            .boss-phase-marker.passed { background: rgba(255, 0, 60, 0.7); box-shadow: 0 0 10px rgba(255, 0, 60, 0.8); }
            .boss-phase-marker.next { background: rgba(255, 255, 255, 0.6); box-shadow: 0 0 10px rgba(255, 255, 255, 0.8); }
            .boss-area.is-hit .boss-fill { animation: boss-hit 0.25s ease-out; }
            .boss-area.is-critical .boss-fill { animation: boss-critical 0.3s ease-out; }
            .boss-area.is-invulnerable .boss-fill { filter: grayscale(0.35) brightness(0.75); opacity: 0.65; }
            .boss-area.is-invulnerable .boss-bar-container { border-color: rgba(255, 255, 255, 0.35); box-shadow: 0 0 12px rgba(255, 255, 255, 0.2); }
            .boss-area.is-invulnerable .boss-skull { border-color: rgba(255, 255, 255, 0.7); box-shadow: 0 0 12px rgba(255, 255, 255, 0.5); color: rgba(255, 255, 255, 0.9); }
            
            /* RADAR - Decagon + Analog Ring */
            .radar-area { grid-column: 3; grid-row: 1; justify-self: end; align-self: start; padding-top: 0; }
            .radar-structure { width: 220px; height: 220px; position: relative; }
            .radar-svg-layer { position: absolute; inset: 0; z-index: 5; filter: drop-shadow(0 0 5px rgba(0, 240, 255, 0.3)); pointer-events: none; }
            .radar-mask {
                position: absolute; inset: 0; z-index: 2; background: rgba(0, 10, 20, 0.5);
                clip-path: polygon(50% 7%, 75.5% 15%, 91% 37%, 91% 63%, 75.5% 85%, 50% 93%, 24.5% 85%, 9% 63%, 9% 37%, 24.5% 15%);
            }
            .radar-sweep { position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: conic-gradient(from 0deg, transparent 0%, transparent 60%, rgba(0, 240, 255, 0.05) 80%, rgba(0, 240, 255, 0.4) 100%); animation: radar-sweep-anim 4s linear infinite; border-radius: 50%; mix-blend-mode: screen; pointer-events: none; }
            .blip-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 10; }
            .blip { position: absolute; border-radius: 50%; transform: translate(-50%, -50%); transition: top 0.1s, left 0.1s; box-shadow: 0 0 8px 2px currentColor; }
            .blip.enemy { width: 6px; height: 6px; background: var(--danger-red); color: var(--danger-red); }
            .blip.boss { width: 10px; height: 10px; background: #fff; color: #fff; box-shadow: 0 0 14px 4px rgba(255, 255, 255, 0.9), 0 0 30px rgba(255, 0, 60, 0.8); animation: boss-blip 1.2s ease-in-out infinite; }
            .blip.player { top: 50%; left: 50%; width: 8px; height: 8px; background: #fff; border: 1px solid var(--primary-cyan); color: #fff; z-index: 15; box-shadow: 0 0 12px 4px rgba(255, 255, 255, 0.8); }

            /* NEXT WAVE */
            .next-wave-box { position: absolute; top: 50%; left: 0; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; transform: translateY(-50%); font-family: 'Orbitron'; opacity: 0; transition: opacity 0.3s; pointer-events: none; z-index: 100; }
            .next-wave-box.visible { opacity: 1; }
            .next-wave-label { font-size: 1.4rem; color: var(--danger-red); letter-spacing: 6px; font-weight: 900; margin: 0; text-transform: uppercase; text-shadow: 0 0 15px rgba(0, 0, 0, 0.9), 0 0 5px var(--danger-red); line-height: 1.2; }
            .next-wave-timer { font-size: 4rem; line-height: 1; color: #fff; font-weight: 900; text-shadow: 0 0 20px var(--danger-red), 2px 2px 0 #000; margin-top: 10px; }
            .next-wave-box.visible .next-wave-timer { animation: alert-pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
            
            /* VITALS */
            .status-area { grid-row: 3; display: flex; flex-direction: column; justify-content: flex-end; padding-bottom: 20px; padding-left: 20px; }
            .locked-msg { border-left: 3px solid var(--secondary-blue); background: linear-gradient(90deg, rgba(0,170,255,0.15), transparent); padding: 8px 15px; margin-bottom: 25px; width: 220px; font-size: 0.9rem; display: flex; align-items: center; gap: 15px; }
            .bars-container { transform: skewX(-15deg); }
            .bar-wrapper { display: flex; align-items: center; margin-bottom: 2px; }
            .health-bar-row { display: flex; height: 20px; gap: 4px; flex-grow: 1; min-width: 180px; }
            .health-bar-row.shield { height: 15px; opacity: 0.9; }
            .bar-segment { flex: 1; background: rgba(0, 255, 102, 0.1); border: 1px solid rgba(0, 255, 102, 0.3); transition: all 0.2s; }
            .bar-segment.filled { background: var(--health-green); box-shadow: 0 0 8px var(--health-green); border-color: #fff; }
            .shield .bar-segment.filled { background: var(--secondary-blue); box-shadow: 0 0 8px var(--secondary-blue); border-color: #aaf; }
            .system-label { font-size: 0.75rem; font-weight: 700; letter-spacing: 1px; margin-bottom: 2px; margin-top: 2px; }
            .numeric-text { font-family: 'Orbitron'; font-size: 1.2rem; font-weight: bold; transform: skewX(15deg); margin-left: 12px; min-width: 50px; text-shadow: 0 0 5px currentColor; transition: color 0.3s; }
            
            /* PROGRESS */
            .bottom-center { grid-row: 3; grid-column: 2; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; padding-bottom: 20px; }
            .wave-indicator { width: 70px; height: 70px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.1); border-top: 2px solid var(--primary-cyan); border-bottom: 2px solid var(--primary-cyan); display: flex; flex-direction: column; justify-content: center; align-items: center; background: radial-gradient(circle, rgba(0,240,255,0.1), rgba(0,0,0,0.8)); box-shadow: 0 0 20px rgba(0, 240, 255, 0.1); margin-bottom: 10px; animation: rotate-border 4s infinite linear reverse; }
            .wave-content { animation: rotate-border 4s infinite linear; text-align: center; }
            .wave-num { font-size: 1.8rem; color: #fff; font-family: 'Orbitron'; line-height: 1; }
            .wave-label { font-size: 0.6rem; color: var(--secondary-blue); letter-spacing: 1px; }
            .xp-bar-container { width: 100%; max-width: 300px; height: 6px; background: #0a0a0a; border: 1px solid #333; border-radius: 4px; position: relative; display: flex; align-items: center; margin-bottom: 2px; }
            .xp-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #5500aa, var(--xp-purple)); box-shadow: 0 0 10px var(--xp-purple); border-radius: 2px; transition: width 0.5s ease-out; }
            .xp-label { position: absolute; left: 0; top: -18px; font-size: 0.7rem; color: #ddaaff; font-weight: bold; z-index: 2; display: flex; align-items: center; gap: 5px; }
            .xp-details { display: flex; justify-content: space-between; width: 100%; max-width: 300px; margin-top: 2px; }
            .xp-values { font-family: 'Consolas', monospace; font-size: 0.8rem; color: #ccc; text-shadow: 0 0 5px var(--xp-purple); letter-spacing: 1px; }
            .lvl-indicator { font-family: 'Orbitron'; font-size: 0.9rem; font-weight: 700; color: #fff; text-shadow: 0 0 10px var(--primary-cyan); letter-spacing: 1px; }
            
            /* NAV */
            .systems-area { grid-row: 3; grid-column: 3; display: flex; flex-direction: column; justify-content: flex-end; align-items: flex-end; padding-bottom: 20px; padding-right: 20px; }
            .nav-block { display: flex; flex-direction: column; align-items: flex-end; background: linear-gradient(to left, rgba(0, 20, 40, 0.8), transparent); padding: 10px 15px 10px 30px; border-right: 3px solid var(--primary-cyan); position: relative; transform: skewX(15deg); }
            .nav-block::before { content: ''; position: absolute; top: 0; right: 0; width: 30%; height: 2px; background: var(--primary-cyan); }
            .nav-label { font-size: 0.8rem; color: var(--primary-cyan); font-weight: 700; letter-spacing: 2px; margin-bottom: 5px; transform: skewX(-15deg); display: flex; align-items: center; gap: 8px; }
            .micro-data { font-family: 'Consolas', monospace; font-size: 0.85rem; color: rgba(200, 240, 255, 0.9); text-align: right; transform: skewX(-15deg); line-height: 1.4; }
            .data-val { color: #fff; font-weight: bold; text-shadow: 0 0 5px var(--primary-cyan); }
            
            /* ANIMATIONS */
            @keyframes pulse-text { 0%, 100% { transform: scale(1); filter: brightness(1); } 50% { transform: scale(1.02); filter: brightness(1.2); } }
            @keyframes pulse-border { 0%, 100% { border-color: var(--danger-red); box-shadow: 0 0 15px var(--danger-red); } 50% { border-color: #ff5555; box-shadow: 0 0 25px #ff5555; } }
            @keyframes blink { 0% { opacity: 0.3; } 100% { opacity: 1; } }
            @keyframes rotate-border { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            @keyframes radar-sweep-anim { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            @keyframes alert-pulse { 0% { transform: scale(1); text-shadow: 0 0 20px var(--danger-red); } 50% { transform: scale(1.1); text-shadow: 0 0 30px var(--danger-red), 0 0 10px #fff; } 100% { transform: scale(1); text-shadow: 0 0 20px var(--danger-red); } }
            @keyframes boss-hit { 0% { filter: brightness(1.6); box-shadow: 0 0 35px #fff; } 100% { filter: brightness(1); box-shadow: 0 0 20px var(--danger-red); } }
            @keyframes boss-critical { 0% { filter: brightness(2); box-shadow: 0 0 45px #fff, 0 0 25px var(--danger-red); } 100% { filter: brightness(1); box-shadow: 0 0 20px var(--danger-red); } }
            @keyframes boss-blip { 0%, 100% { transform: translate(-50%, -50%) scale(1); } 50% { transform: translate(-50%, -50%) scale(1.2); } }
            @keyframes glitch { 0%, 92%, 95%, 100% { transform: translate(0, 0); opacity: 1; } 93% { transform: translate(-2px, 2px); opacity: 0.8; } 94% { transform: translate(2px, -2px); opacity: 0.8; } 96% { transform: translate(1px, 2px); opacity: 0.9; } 97% { transform: translate(-1px, -1px); opacity: 0.9; } }
            .glitch-text { animation: glitch 3s infinite; }
            
            @media (max-width: 900px) { #hud-layer { grid-template-columns: 1fr; grid-template-rows: auto 1fr auto; } .stats-area { position: absolute; top: 10px; left: 10px; } .radar-area { position: absolute; top: 10px; right: 10px; } .boss-area { margin-top: 60px; transform: scale(0.8); } .status-area { position: absolute; bottom: 20px; left: 10px; transform: scale(0.9); transform-origin: bottom left; } .systems-area { position: absolute; bottom: 20px; right: 10px; transform: scale(0.9); transform-origin: bottom right; } .bottom-center { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); width: 300px; } }
        `;
  }
}
