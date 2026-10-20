// src/modules/ui/domRefs.js
//
// The static DOM nodes the screens, the HUD and the viewport work on, looked
// up once when the UI starts (a missing node stays null).

export function cacheStaticNodes() {
  return {
    gameUi: document.getElementById('game-ui') || null,
    gameField: document.querySelector('#game-ui .game-field') || null,
    canvas: document.getElementById('game-canvas') || null,
    controls: document.querySelector('#game-ui .controls') || null,
    wave: {
      container: null,
      title: null,
      timerValue: null,
      progressTrack: null,
      progressBar: null,
      enemies: null,
      totalKills: null,
    },
    levelUp: {
      container: document.getElementById('upgrades-container') || null,
      text: document.getElementById('levelup-text') || null,
      level: document.getElementById('levelup-level') || null,
      picks: document.getElementById('levelup-picks') || null,
      rerollBtn: document.getElementById('levelup-reroll-btn') || null,
      banishBtn: document.getElementById('levelup-banish-btn') || null,
      banishHint: document.getElementById('levelup-banish-hint') || null,
    },
    chest: {
      screen: document.getElementById('chest-screen') || null,
      title: document.getElementById('chest-title') || null,
      count: document.getElementById('chest-count') || null,
      cards: document.getElementById('chest-cards') || null,
      continueBtn: document.getElementById('chest-continue-btn') || null,
    },
    gameOver: {
      body: document.getElementById('gameover-body') || null,
      invite: document.getElementById('gameover-invite') || null,
      seed: document.getElementById('gameover-seed') || null,
      copySeedBtn: document.getElementById('gameover-copy-seed-btn') || null,
      retryBtn: document.getElementById('retry-game-btn') || null,
      restartBtn: document.getElementById('restart-game-btn') || null,
      quitBtn: document.getElementById('quit-game-btn') || null,
    },
    victory: {
      body: document.getElementById('victory-body') || null,
      invite: document.getElementById('victory-invite') || null,
      continueBtn: document.getElementById('victory-continue-btn') || null,
      restartBtn: document.getElementById('victory-restart-btn') || null,
      quitBtn: document.getElementById('victory-quit-btn') || null,
    },
    pause: {
      container: document.getElementById('pause-screen') || null,
      resumeBtn: document.getElementById('pause-resume-btn') || null,
      settingsBtn: document.getElementById('pause-settings-btn') || null,
      editHudBtn: document.getElementById('pause-edit-hud-btn') || null,
      exitBtn: document.getElementById('pause-exit-btn') || null,
      location: document.getElementById('pause-build-location') || null,
      build: document.getElementById('pause-build-block') || null,
      tools: document.getElementById('pause-build-tools') || null,
      seed: document.getElementById('pause-run-seed') || null,
    },
    codex: {
      overlay: document.getElementById('codex-screen') || null,
      list: document.getElementById('codex-list') || null,
      count: document.getElementById('codex-count') || null,
      openBtn: document.getElementById('menu-codex-btn') || null,
      backBtn: document.getElementById('codex-back-btn') || null,
      closeBtn: document.getElementById('codex-close-btn') || null,
      tabs: Array.from(document.querySelectorAll('[data-codex-tab]')),
    },
    hangar: {
      overlay: document.getElementById('hangar-screen') || null,
      list: document.getElementById('hangar-list') || null,
      hulls: document.getElementById('hangar-hulls') || null,
      hullLock: document.getElementById('hangar-hull-lock') || null,
      balance: document.getElementById('hangar-balance') || null,
      openBtn: document.getElementById('menu-hangar-btn') || null,
      backBtn: document.getElementById('hangar-back-btn') || null,
      closeBtn: document.getElementById('hangar-close-btn') || null,
    },
    settings: {
      overlay: document.getElementById('settings-screen') || null,
      tabs: document.getElementById('settings-tabs') || null,
      container: document.getElementById('settings-content') || null,
      resetBtn: document.getElementById('settings-reset-btn') || null,
      closeButtons: [
        document.getElementById('settings-close-btn'),
        document.getElementById('settings-close-footer-btn'),
      ].filter(Boolean),
    },
    credits: {
      overlay: document.getElementById('credits-screen') || null,
      primaryAction: document.getElementById('credits-back-btn') || null,
      closeButtons: [
        document.getElementById('credits-close-btn'),
        document.getElementById('credits-back-btn'),
      ].filter(Boolean),
    },
    minimap: {
      container: document.getElementById('hud-minimap') || null,
      canvas: document.getElementById('minimap-canvas') || null,
      range: document.getElementById('minimap-range') || null,
      context: null,
    },
    threatIndicators: {
      container: document.getElementById('threat-indicators-container') || null,
      overlay: document.getElementById('threat-indicators-overlay') || null,
    },
    combo: {
      container: document.getElementById('hud-combo') || null,
      value: document.getElementById('combo-display') || null,
      multiplier: document.getElementById('combo-multiplier') || null,
    },
    menu: {
      screen: document.getElementById('menu-screen') || null,
      shipSelector: document.getElementById('menu-ship-selector') || null,
      shipSelectorOptions:
        document.getElementById('menu-ship-selector-options') || null,
      status: document.getElementById('menu-status') || null,
      bossRushBtn: document.getElementById('boss-rush-btn') || null,
      bossRushLock: document.getElementById('boss-rush-lock') || null,
    },
  };
}
