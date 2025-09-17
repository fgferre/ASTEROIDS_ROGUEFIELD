// src/modules/UISystem.js

class UISystem {
  constructor() {
    if (typeof gameServices !== 'undefined') {
      gameServices.register('ui', this);
    }

    this.setupEventListeners();
    console.log('[UISystem] Initialized');
  }

  setupEventListeners() {
    if (typeof gameEvents !== 'undefined') {
      gameEvents.on('experience-changed', (data) => {
        this.updateXPBar(data);
      });

      gameEvents.on('player-leveled-up', (data) => {
        this.showLevelUpScreen(data);
      });

      gameEvents.on('player-died', (data) => {
        this.showGameOverScreen(data);
      });
    }
  }

  showScreen(screenName) {
    try {
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

      if (typeof gameEvents !== 'undefined') {
        gameEvents.emit('screen-changed', { screen: screenName });
      }
    } catch (error) {
      console.error('[UISystem] Failed to show screen:', error);
    }
  }

  showGameUI() {
    this.showScreen('playing');
  }

  update() {
    this.updateHUD();
  }

  updateHUD() {
    try {
      const player = gameServices.get('player');
      const progression = gameServices.get('progression');
      const enemies = gameServices.get('enemies');

      const stats = enemies
        ? enemies.getSessionStats()
        : { totalKills: 0, timeElapsed: 0 };
      const wave = enemies ? enemies.getWaveState() : null;

      const elements = [
        {
          id: 'health-display',
          value: player
            ? `${Math.max(0, Math.floor(player.health))}/${player.maxHealth}`
            : '0/0',
        },
        {
          id: 'level-display',
          value: progression ? `Level ${progression.getLevel()}` : 'Level 1',
        },
        {
          id: 'kills-display',
          value: `${stats.totalKills} asteroides`,
        },
        { id: 'time-display', value: `${Math.floor(stats.timeElapsed)}s` },
      ];

      elements.forEach(({ id, value }) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
      });

      const waveTitle = document.getElementById('wave-title');
      const waveTimerDisplay = document.getElementById('wave-timer-display');
      const waveProgressBar = document.getElementById('wave-progress-bar');
      const waveEnemies = document.getElementById('wave-enemies');
      const waveCountdown = document.getElementById('wave-countdown');

      if (waveTitle) {
        const waveNumber = wave ? wave.current : 1;
        waveTitle.textContent = `Setor ${waveNumber}`;
      }

      if (wave && wave.isActive) {
        const timeLeft = Math.max(0, Math.ceil(wave.timeRemaining));
        if (waveTimerDisplay) waveTimerDisplay.textContent = `${timeLeft}s`;

        const progress = Math.min(
          (wave.asteroidsKilled / Math.max(1, wave.totalAsteroids)) * 100,
          100
        );

        if (waveProgressBar) waveProgressBar.style.width = progress + '%';
        if (waveEnemies)
          waveEnemies.textContent = `${wave.asteroidsKilled} asteroides eliminados`;
        if (waveCountdown) waveCountdown.classList.add('hidden');
      } else {
        if (waveTimerDisplay) waveTimerDisplay.textContent = wave ? '0s' : '--';
        if (waveProgressBar) waveProgressBar.style.width = wave ? '100%' : '0%';
        if (waveEnemies) waveEnemies.textContent = wave ? 'Setor Limpo!' : '--';

        const countdown = wave ? Math.ceil(wave.breakTimer) : 0;
        const countdownTimer = document.getElementById('countdown-timer');
        if (countdownTimer) countdownTimer.textContent = countdown;
        if (waveCountdown)
          waveCountdown.classList.toggle('hidden', !wave || countdown <= 0);
      }
    } catch (error) {
      console.error('[UISystem] Failed to update HUD:', error);
    }
  }

  updateXPBar(data) {
    const xpProgress = document.getElementById('xp-progress');
    const xpText = document.getElementById('xp-text');

    if (xpProgress) xpProgress.style.width = data.percentage * 100 + '%';
    if (xpText) xpText.textContent = `XP: ${data.current} / ${data.needed}`;
  }

  showLevelUpScreen(data) {
    this.showScreen('levelup');

    const levelText = document.getElementById('levelup-text');
    if (levelText) {
      levelText.textContent = `Level ${data.newLevel} - Escolha sua tecnologia:`;
    }

    const container = document.getElementById('upgrades-container');
    if (container) {
      container.innerHTML = '';

      data.availableUpgrades.forEach((upgrade) => {
        const button = document.createElement('button');
        button.className = 'upgrade-option';
        button.onclick = () => this.selectUpgrade(upgrade.id);

        button.innerHTML = `
        <div class="upgrade-icon" style="color: ${upgrade.color};">
          ${upgrade.icon}
        </div>
        <div class="upgrade-info">
          <h3>${upgrade.name}</h3>
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

    const elements = [
      { id: 'final-level', value: data.player.level },
      { id: 'final-kills', value: stats.totalKills },
      { id: 'final-waves', value: wave.completedWaves },
      { id: 'final-time', value: Math.floor(stats.timeElapsed) + 's' },
    ];

    elements.forEach(({ id, value }) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    });
  }
}

export default UISystem;
