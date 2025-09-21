// src/modules/UISystem.js

import HUD_LAYOUT from '../data/ui/hudLayout.js';

class UISystem {
  constructor() {
    if (typeof gameServices !== 'undefined') {
      gameServices.register('ui', this);
    }

    this.damageFlashTimeout = null;
    this.currentPauseState = false;
    this.shieldFailTimeout = null;

    this.hudLayout = Array.isArray(HUD_LAYOUT) ? HUD_LAYOUT : [];
    this.hudElements = new Map();
    this.cachedValues = {
      health: { current: null, max: null },
      shield: {
        level: null,
        maxHits: null,
        currentHits: null,
        isActive: null,
        isUnlocked: null,
        isOnCooldown: null,
        cooldownDuration: null,
        cooldownTimer: null,
        cooldownRatio: null,
      },
      level: null,
      xp: { current: null, needed: null, percentage: null },
      sessionKills: null,
      sessionTimeSeconds: null,
      wave: {
        current: null,
        completedWaves: null,
        totalAsteroids: null,
        asteroidsKilled: null,
        isActive: null,
        timeRemainingSeconds: null,
        breakTimerSeconds: null,
      },
    };

    this.domRefs = this.cacheStaticNodes();
    this.setupHudLayout();
    this.setupEventListeners();
    this.bootstrapHudValues();

    console.log('[UISystem] Initialized');
  }

  cacheStaticNodes() {
    return {
      root: document.getElementById('hud-root') || null,
      hudPrimary: document.getElementById('hud-primary') || null,
      xp: {
        container: document.getElementById('hud-xp') || null,
        progress: document.getElementById('xp-progress') || null,
        text: document.getElementById('xp-text') || null,
      },
      wave: {
        container: document.getElementById('hud-wave') || null,
        title: document.getElementById('wave-title') || null,
        timerValue: document.getElementById('wave-timer-display') || null,
        progressTrack: document.getElementById('wave-progress') || null,
        progressBar: document.getElementById('wave-progress-bar') || null,
        enemies: document.getElementById('wave-enemies') || null,
        countdown: document.getElementById('wave-countdown') || null,
        countdownValue: document.getElementById('countdown-timer') || null,
      },
      levelUp: {
        container: document.getElementById('upgrades-container') || null,
        text: document.getElementById('levelup-text') || null,
      },
      gameOver: {
        level: document.getElementById('final-level') || null,
        kills: document.getElementById('final-kills') || null,
        waves: document.getElementById('final-waves') || null,
        time: document.getElementById('final-time') || null,
      },
    };
  }

  setupHudLayout() {
    const container = this.domRefs.hudPrimary;
    if (!container) {
      return;
    }

    container.innerHTML = '';

    this.hudLayout.forEach((itemConfig) => {
      const element = this.createHudItem(itemConfig);
      if (!element) {
        return;
      }

      container.appendChild(element.root);
      this.hudElements.set(itemConfig.key, element);
    });
  }

  createHudItem(config) {
    if (!config) return null;

    const root = document.createElement('div');
    root.classList.add('hud-item', `hud-item--${config.key}`);
    root.dataset.hudKey = config.key;

    if (config.rootId) {
      root.id = config.rootId;
    }

    if (config.ariaLive) {
      root.setAttribute('role', 'status');
      root.setAttribute('aria-live', config.ariaLive);
    }

    if (config.description) {
      root.setAttribute('aria-label', config.description);
    }

    const iconElement = this.createIconElement(config.icon);
    if (iconElement) {
      iconElement.classList.add('hud-item__icon');
      root.appendChild(iconElement);
    }

    if (config.type === 'shield') {
      root.classList.add('locked');

      const info = document.createElement('span');
      info.className = 'shield-info';
      info.classList.add('hud-item__content');

      const label = document.createElement('span');
      label.className = 'shield-text';
      label.textContent = config.label;

      const value = document.createElement('span');
      value.className = 'shield-hits';
      value.textContent = config.initialValue ?? '--';
      if (config.valueId) {
        value.id = config.valueId;
      }

      info.append(label, value);
      root.appendChild(info);

      const overlay = document.createElement('div');
      overlay.id = config.overlayId || 'shield-cooldown-overlay';
      overlay.classList.add('hud-item__cooldown');
      root.appendChild(overlay);

      return {
        key: config.key,
        config,
        root,
        value,
        overlay,
      };
    }

    const content = document.createElement('div');
    content.classList.add('hud-item__content');

    const label = document.createElement('span');
    label.classList.add('hud-item__label');
    label.textContent = config.label;

    const value = document.createElement('span');
    value.classList.add('hud-item__value');
    value.textContent = config.initialValue ?? '--';
    if (config.valueId) {
      value.id = config.valueId;
    }

    content.append(label, value);
    root.appendChild(content);

    return {
      key: config.key,
      config,
      root,
      value,
    };
  }

  createIconElement(iconConfig) {
    if (!iconConfig) {
      return null;
    }

    if (iconConfig.type === 'svg') {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', iconConfig.viewBox || '0 0 24 24');
      svg.setAttribute('fill', 'currentColor');
      svg.setAttribute('aria-hidden', 'true');

      const paths = Array.isArray(iconConfig.paths) ? iconConfig.paths : [];
      paths.forEach((pathConfig) => {
        const path = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'path'
        );
        path.setAttribute('d', pathConfig.d || '');
        if (pathConfig.fill) {
          path.setAttribute('fill', pathConfig.fill);
        }
        svg.appendChild(path);
      });

      return svg;
    }

    if (iconConfig.type === 'text') {
      const span = document.createElement('span');
      span.textContent = iconConfig.value ?? '';
      span.setAttribute('aria-hidden', 'true');
      return span;
    }

    return null;
  }

  setupEventListeners() {
    if (typeof gameEvents === 'undefined') {
      return;
    }

    gameEvents.on('experience-changed', (data) => {
      this.updateXPBar(data);
    });

    gameEvents.on('player-health-changed', (data) => {
      this.handleHealthChange(data);
    });

    gameEvents.on('player-leveled-up', (data) => {
      this.updateLevelDisplay(data?.newLevel, { force: true });
      this.showLevelUpScreen(data);
    });

    gameEvents.on('player-died', (data) => {
      this.showGameOverScreen(data);
    });

    gameEvents.on('player-took-damage', () => {
      this.flashHealthDisplay();
    });

    gameEvents.on('pause-state-changed', (data) => {
      this.updatePauseScreen(Boolean(data?.isPaused));
    });

    gameEvents.on('toggle-pause', () => {
      const appState =
        typeof gameServices !== 'undefined'
          ? gameServices.get('game-state')
          : null;
      if (appState && typeof appState.isPaused === 'function') {
        this.updatePauseScreen(Boolean(appState.isPaused()));
      }
    });

    gameEvents.on('shield-activation-failed', () => {
      this.flashShieldFailure();
    });

    gameEvents.on('shield-stats-changed', (shieldState) => {
      this.updateShieldIndicator(shieldState);
    });

    gameEvents.on('wave-state-updated', (payload) => {
      this.handleWaveStateUpdated(payload);
    });
  }

  bootstrapHudValues() {
    this.refreshHudFromServices(true);
  }

  refreshHudFromServices(force = false) {
    if (typeof gameServices === 'undefined') {
      return;
    }

    const player = gameServices.get('player');
    if (player) {
      this.handleHealthChange(
        { current: player.health, max: player.maxHealth },
        { force }
      );

      if (typeof player.getShieldState === 'function') {
        this.updateShieldIndicator(player.getShieldState(), { force });
      }
    }

    const progression = gameServices.get('progression');
    if (progression) {
      if (typeof progression.getLevel === 'function') {
        this.updateLevelDisplay(progression.getLevel(), { force });
      }

      if (typeof progression.getExperience === 'function') {
        this.updateXPBar(progression.getExperience(), { force });
      }
    }

    const enemies = gameServices.get('enemies');
    if (enemies) {
      if (typeof enemies.getSessionStats === 'function') {
        this.updateSessionStatsFromData(enemies.getSessionStats(), { force });
      }

      if (typeof enemies.getWaveState === 'function') {
        this.applyWaveState(enemies.getWaveState(), { force });
      }
    }
  }

  update() {
    this.refreshHudFromServices(false);
  }

  handleHealthChange(data = {}, options = {}) {
    const entry = this.hudElements.get('health');
    if (!entry?.value) {
      return;
    }

    const current = Math.max(0, Math.round(data.current ?? 0));
    const max = Math.max(0, Math.round(data.max ?? 0));
    const force = Boolean(options.force);

    if (
      force ||
      current !== this.cachedValues.health.current ||
      max !== this.cachedValues.health.max
    ) {
      entry.value.textContent = `${current}/${max}`;
      this.cachedValues.health.current = current;
      this.cachedValues.health.max = max;
    }

    const ratio = max > 0 ? current / max : 0;
    const dangerThreshold = entry.config?.thresholds?.danger ?? 0;
    const isDanger = max > 0 && ratio <= dangerThreshold;
    entry.root.classList.toggle('is-danger', isDanger);
  }

  updateLevelDisplay(level, options = {}) {
    const entry = this.hudElements.get('level');
    if (!entry?.value) {
      return;
    }

    const normalizedLevel = Math.max(1, Math.floor(level ?? 1));
    const force = Boolean(options.force);

    if (force || normalizedLevel !== this.cachedValues.level) {
      entry.value.textContent = `Level ${normalizedLevel}`;
      this.cachedValues.level = normalizedLevel;
    }
  }

  updateXPBar(data = {}, options = {}) {
    const xpProgress = this.domRefs.xp.progress;
    const xpText = this.domRefs.xp.text;
    if (!xpProgress && !xpText) {
      return;
    }

    const current = Math.max(
      0,
      Math.round(data.current ?? data.experience ?? 0)
    );
    const needed = Math.max(
      1,
      Math.round(data.needed ?? data.experienceToNext ?? 1)
    );
    const percentageRaw = Number.isFinite(data.percentage)
      ? data.percentage
      : current / needed;
    const percentage = Math.max(0, Math.min(1, percentageRaw));
    const force = Boolean(options.force);

    if (xpProgress) {
      if (force || percentage !== this.cachedValues.xp.percentage) {
        xpProgress.style.width = `${percentage * 100}%`;
        this.cachedValues.xp.percentage = percentage;
      }
    }

    if (xpText) {
      if (
        force ||
        current !== this.cachedValues.xp.current ||
        needed !== this.cachedValues.xp.needed
      ) {
        xpText.textContent = `XP: ${current} / ${needed}`;
        this.cachedValues.xp.current = current;
        this.cachedValues.xp.needed = needed;
      }
    }
  }

  updateSessionStatsFromData(sessionData = {}, options = {}) {
    const killsEntry = this.hudElements.get('kills');
    const timeEntry = this.hudElements.get('time');
    const force = Boolean(options.force);

    const totalKills = Math.max(0, Math.floor(sessionData.totalKills ?? 0));
    if (killsEntry?.value) {
      if (force || totalKills !== this.cachedValues.sessionKills) {
        killsEntry.value.textContent = `${totalKills} asteroides`;
        this.cachedValues.sessionKills = totalKills;
      }
    }

    const timeSeconds = Math.max(0, Math.floor(sessionData.timeElapsed ?? 0));
    if (timeEntry?.value) {
      if (force || timeSeconds !== this.cachedValues.sessionTimeSeconds) {
        timeEntry.value.textContent = `${timeSeconds}s`;
        this.cachedValues.sessionTimeSeconds = timeSeconds;
      }
    }
  }

  applyWaveState(waveData, options = {}) {
    const waveRefs = this.domRefs.wave;
    if (!waveRefs?.container || !waveData) {
      return;
    }

    const force = Boolean(options.force);

    const normalized = {
      current: Math.max(1, Math.floor(waveData.current ?? 1)),
      completedWaves: Math.max(0, Math.floor(waveData.completedWaves ?? 0)),
      totalAsteroids: Math.max(0, Math.floor(waveData.totalAsteroids ?? 0)),
      asteroidsKilled: Math.max(0, Math.floor(waveData.asteroidsKilled ?? 0)),
      isActive: Boolean(waveData.isActive ?? true),
      timeRemaining: Math.max(0, Number(waveData.timeRemaining ?? 0)),
      breakTimer: Math.max(0, Number(waveData.breakTimer ?? 0)),
    };

    const timeSeconds = normalized.isActive
      ? Math.max(0, Math.ceil(normalized.timeRemaining))
      : 0;
    const breakSeconds = !normalized.isActive
      ? Math.max(0, Math.ceil(normalized.breakTimer))
      : 0;

    const lastWave = this.cachedValues.wave;

    const hasChanged =
      force ||
      lastWave.current !== normalized.current ||
      lastWave.completedWaves !== normalized.completedWaves ||
      lastWave.totalAsteroids !== normalized.totalAsteroids ||
      lastWave.asteroidsKilled !== normalized.asteroidsKilled ||
      lastWave.isActive !== normalized.isActive ||
      lastWave.timeRemainingSeconds !== timeSeconds ||
      lastWave.breakTimerSeconds !== breakSeconds;

    if (!hasChanged) {
      return;
    }

    if (waveRefs.title) {
      waveRefs.title.textContent = `Setor ${normalized.current}`;
    }

    if (waveRefs.timerValue) {
      if (normalized.isActive) {
        waveRefs.timerValue.textContent = `${timeSeconds}s`;
      } else if (normalized.totalAsteroids > 0) {
        waveRefs.timerValue.textContent = '0s';
      } else {
        waveRefs.timerValue.textContent = '--';
      }
    }

    if (waveRefs.progressBar) {
      const progress = normalized.totalAsteroids
        ? Math.min(1, normalized.asteroidsKilled / normalized.totalAsteroids)
        : normalized.isActive
          ? 0
          : 1;
      const percentage = Math.max(0, Math.min(100, progress * 100));
      waveRefs.progressBar.style.width = `${percentage.toFixed(2)}%`;
      if (waveRefs.progressTrack) {
        waveRefs.progressTrack.setAttribute(
          'aria-valuenow',
          `${Math.round(percentage)}`
        );
        const valueText = normalized.isActive
          ? `${normalized.asteroidsKilled} de ${normalized.totalAsteroids} asteroides eliminados`
          : 'Setor concluído';
        waveRefs.progressTrack.setAttribute('aria-valuetext', valueText);
      }
    }

    if (waveRefs.enemies) {
      if (normalized.isActive) {
        waveRefs.enemies.textContent = `${normalized.asteroidsKilled} asteroides eliminados`;
      } else if (normalized.totalAsteroids > 0) {
        waveRefs.enemies.textContent = 'Setor limpo!';
      } else {
        waveRefs.enemies.textContent = '--';
      }
    }

    if (waveRefs.countdown) {
      const shouldShowCountdown = !normalized.isActive && breakSeconds > 0;
      waveRefs.countdown.classList.toggle('is-visible', shouldShowCountdown);
      waveRefs.countdown.setAttribute(
        'aria-hidden',
        shouldShowCountdown ? 'false' : 'true'
      );
      if (waveRefs.countdownValue) {
        const { countdownValue } = waveRefs;
        if (shouldShowCountdown) {
          const nextValue = `${breakSeconds}`;
          if (countdownValue.textContent !== nextValue) {
            countdownValue.textContent = nextValue;
            countdownValue.classList.remove('is-ticking');
            void countdownValue.offsetWidth;
            countdownValue.classList.add('is-ticking');
          }
        } else {
          countdownValue.classList.remove('is-ticking');
        }
      }
    }

    waveRefs.container.classList.toggle(
      'is-alert',
      !normalized.isActive && breakSeconds > 0
    );

    this.cachedValues.wave = {
      current: normalized.current,
      completedWaves: normalized.completedWaves,
      totalAsteroids: normalized.totalAsteroids,
      asteroidsKilled: normalized.asteroidsKilled,
      isActive: normalized.isActive,
      timeRemainingSeconds: timeSeconds,
      breakTimerSeconds: breakSeconds,
    };
  }

  handleWaveStateUpdated(payload) {
    if (!payload) {
      return;
    }

    if (payload.session) {
      this.updateSessionStatsFromData(payload.session);
    }

    if (payload.wave) {
      this.applyWaveState(payload.wave);
    }
  }

  updateShieldIndicator(shieldState, options = {}) {
    const entry = this.hudElements.get('shield');
    if (!entry?.root || !entry.value) {
      return;
    }

    const state = shieldState || {
      level: 0,
      maxHits: 0,
      currentHits: 0,
      cooldownTimer: 0,
      cooldownDuration: 0,
      isActive: false,
      isUnlocked: false,
      isOnCooldown: false,
    };

    const force = Boolean(options.force);

    const cooldownRatio =
      state.isOnCooldown && state.cooldownDuration > 0
        ? Math.max(0, Math.min(1, state.cooldownTimer / state.cooldownDuration))
        : 0;

    const cached = this.cachedValues.shield;
    const shouldUpdate =
      force ||
      cached.level !== state.level ||
      cached.maxHits !== state.maxHits ||
      cached.currentHits !== state.currentHits ||
      cached.isActive !== state.isActive ||
      cached.isUnlocked !== state.isUnlocked ||
      cached.isOnCooldown !== state.isOnCooldown ||
      cached.cooldownRatio !== cooldownRatio;

    if (!shouldUpdate) {
      return;
    }

    entry.root.classList.remove(
      'locked',
      'ready',
      'active',
      'cooldown',
      'is-cooldown'
    );

    if (!state.isUnlocked) {
      entry.root.classList.add('locked');
      entry.value.textContent = '--';
      if (entry.overlay) {
        entry.overlay.style.transform = 'scaleY(1)';
        entry.overlay.style.opacity = '0.5';
      }
    } else {
      if (state.isActive) {
        entry.root.classList.add('active');
      } else if (state.isOnCooldown) {
        entry.root.classList.add('cooldown', 'is-cooldown');
      } else {
        entry.root.classList.add('ready');
      }

      const hits = state.isActive
        ? Math.max(0, state.currentHits)
        : state.maxHits;
      entry.value.textContent = `${hits}`;

      if (entry.overlay) {
        if (state.isOnCooldown && state.cooldownDuration > 0) {
          entry.overlay.style.transform = `scaleY(${cooldownRatio})`;
          entry.overlay.style.opacity = '1';
        } else {
          entry.overlay.style.transform = 'scaleY(0)';
          entry.overlay.style.opacity = '0';
        }
      }
    }

    this.cachedValues.shield = {
      level: state.level,
      maxHits: state.maxHits,
      currentHits: state.currentHits,
      isActive: state.isActive,
      isUnlocked: state.isUnlocked,
      isOnCooldown: state.isOnCooldown,
      cooldownDuration: state.cooldownDuration,
      cooldownTimer: state.cooldownTimer,
      cooldownRatio,
    };
  }

  flashHealthDisplay() {
    const entry = this.hudElements.get('health');
    const healthDisplay = entry?.value;
    if (!healthDisplay) {
      return;
    }

    healthDisplay.classList.remove('damage-flash');
    void healthDisplay.offsetWidth;
    healthDisplay.classList.add('damage-flash');

    if (this.damageFlashTimeout) {
      clearTimeout(this.damageFlashTimeout);
    }

    this.damageFlashTimeout = window.setTimeout(() => {
      healthDisplay.classList.remove('damage-flash');
      this.damageFlashTimeout = null;
    }, 280);
  }

  flashShieldFailure() {
    const entry = this.hudElements.get('shield');
    const element = entry?.root;
    if (!element) {
      return;
    }

    element.classList.remove('shield-fail');
    void element.offsetWidth;
    element.classList.add('shield-fail');

    if (this.shieldFailTimeout) {
      window.clearTimeout(this.shieldFailTimeout);
    }

    this.shieldFailTimeout = window.setTimeout(() => {
      element.classList.remove('shield-fail');
      this.shieldFailTimeout = null;
    }, 300);
  }

  showScreen(screenName, options = {}) {
    const { overlay = false, show = true } = options;
    try {
      if (overlay) {
        const target = document.getElementById(`${screenName}-screen`);
        if (target) {
          target.classList.toggle('hidden', !show);
        }

        if (screenName === 'pause' && show) {
          const gameUI = document.getElementById('game-ui');
          if (gameUI) gameUI.classList.remove('hidden');
        }
        return;
      }

      document.querySelectorAll('.screen').forEach((screen) => {
        screen.classList.add('hidden');
      });

      const gameUI = document.getElementById('game-ui');
      if (gameUI) gameUI.classList.add('hidden');

      if (screenName === 'playing' || screenName === 'game') {
        if (gameUI) gameUI.classList.remove('hidden');
      } else {
        const screen = document.getElementById(`${screenName}-screen`);
        if (screen) screen.classList.remove('hidden');
      }

      const pauseOverlay = document.getElementById('pause-screen');
      if (pauseOverlay) pauseOverlay.classList.add('hidden');

      if (typeof gameEvents !== 'undefined') {
        gameEvents.emit('screen-changed', { screen: screenName });
      }
    } catch (error) {
      console.error('[UISystem] Failed to show screen:', error);
    }
  }

  showGameUI() {
    this.showScreen('playing');
    this.refreshHudFromServices(true);
  }

  updatePauseScreen(isPaused) {
    const shouldPause = Boolean(isPaused);
    if (this.currentPauseState === shouldPause) return;

    this.currentPauseState = shouldPause;
    this.showScreen('pause', { overlay: true, show: shouldPause });

    document.body?.classList.toggle('is-paused', shouldPause);
  }

  showLevelUpScreen(data) {
    this.showScreen('levelup');

    if (this.domRefs.levelUp.text) {
      this.domRefs.levelUp.text.textContent = `Level ${data.newLevel} - Escolha sua tecnologia:`;
    }

    const container = this.domRefs.levelUp.container;
    if (container) {
      container.innerHTML = '';

      data.availableUpgrades.forEach((upgrade) => {
        const button = document.createElement('button');
        button.className = 'upgrade-option';
        button.onclick = () => this.selectUpgrade(upgrade.id);

        const currentLevel =
          typeof upgrade.currentLevel === 'number' && upgrade.currentLevel > 0
            ? upgrade.currentLevel
            : 0;
        const levelBadge = currentLevel
          ? `<span class="upgrade-level-tag">Nv. ${currentLevel}</span>`
          : '';

        button.innerHTML = `
        <div class="upgrade-icon" style="color: ${upgrade.color};">
          ${upgrade.icon}
        </div>
        <div class="upgrade-info">
          <h3>${upgrade.name}${levelBadge ? ` ${levelBadge}` : ''}</h3>
          <p>${upgrade.description}</p>
        </div>
      `;
        container.appendChild(button);
      });
    }
  }

  selectUpgrade(upgradeId) {
    const progression = gameServices.get('progression');
    if (progression) {
      const success = progression.applyUpgrade(upgradeId);
      if (success) {
        this.showGameUI();
      }
    }
  }

  showGameOverScreen(data) {
    this.showScreen('gameover');

    const stats = data?.stats || { totalKills: 0, timeElapsed: 0 };
    const wave = data?.wave || { completedWaves: 0 };

    if (this.domRefs.gameOver.level) {
      this.domRefs.gameOver.level.textContent = data?.player?.level ?? 0;
    }
    if (this.domRefs.gameOver.kills) {
      this.domRefs.gameOver.kills.textContent = stats.totalKills;
    }
    if (this.domRefs.gameOver.waves) {
      this.domRefs.gameOver.waves.textContent = wave.completedWaves;
    }
    if (this.domRefs.gameOver.time) {
      this.domRefs.gameOver.time.textContent = `${Math.floor(stats.timeElapsed)}s`;
    }
  }
}

export default UISystem;
