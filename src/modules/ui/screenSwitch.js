// src/modules/ui/screenSwitch.js
//
// Which screen shows (UISystem.showScreen): one screen at a time, or an
// overlay over the run's HUD (the pause, the cards, a chest, the flight
// briefing, the run's end); the session's screen changes followed; back to
// play once the cards, a chest and a briefing waiting have shown; and a
// cinematic's hold on the run.

import { resolveService } from '../../core/serviceUtils.js';
import { loadHudEditorAtIdleMenu } from './hudEditorDoor.js';

// The overlays that pause a run over its HUD: cards, chest, flight briefing.
const CARD_OVERLAYS = ['levelup', 'chest', 'flight'];

/** The session's 'screen-changed': its screen shown, the run's end its way. */
export function handleScreenChanged(ui, payload = {}) {
  const screenName = payload?.screen;
  if (typeof screenName !== 'string' || !screenName.length) {
    return;
  }

  if (screenName === 'pause') {
    ui.showScreen('pause', { overlay: true, show: true, emitEvent: false });
    return;
  }

  if (CARD_OVERLAYS.includes(screenName)) {
    ui.showScreen(screenName, {
      overlay: true,
      show: true,
      emitEvent: false,
    });
    return;
  }

  if (screenName === 'gameover') {
    ui.runEndScreens.showGameOverScreen(payload);
    return;
  }

  if (screenName === 'victory') {
    const show = () => ui.runEndScreens.showVictoryScreen(payload);
    if (!ui.cinematics.deferUntilEpilogueEnds(show)) {
      show();
    }
    return;
  }

  ui.showScreen(screenName, { emitEvent: false });
}

export function showScreen(ui, screenName, options = {}) {
  const { overlay = false, show = true, emitEvent = true } = options;
  try {
    if (overlay) {
      const target = document.getElementById(`${screenName}-screen`);
      if (target) {
        target.classList.toggle('hidden', !show);
      }

      // Keep game-ui visible for pause, card and run end overlays
      if (
        show &&
        ['pause', ...CARD_OVERLAYS, 'gameover', 'victory'].includes(screenName)
      ) {
        const gameUI = document.getElementById('game-ui');
        if (gameUI) gameUI.classList.remove('hidden');
      }

      // The session service pauses the game on any non-'playing' screen.
      if (CARD_OVERLAYS.includes(screenName) && show && emitEvent) {
        ui.eventBus?.emit?.('screen-changed', { screen: screenName });
      }
      return;
    }

    // An open Settings stays over the change (a card picked under it would
    // leave it open and unseen); its own close hides it.
    const settings =
      ui.settingsPanel.settingsState.isOpen && ui.domRefs.settings.overlay;
    document.querySelectorAll('.screen').forEach((screen) => {
      if (screen !== settings) screen.classList.add('hidden');
    });

    const gameUI = document.getElementById('game-ui');
    if (gameUI) gameUI.classList.add('hidden');

    if (ui.settingsPanel.isOpenFrom('menu') && screenName !== 'menu') {
      ui.settingsPanel.closeSettingsPanel();
    }

    if (screenName === 'playing' || screenName === 'game') {
      if (gameUI) gameUI.classList.remove('hidden');
    } else {
      const screen = document.getElementById(`${screenName}-screen`);
      if (screen) screen.classList.remove('hidden');
    }

    const pauseOverlay = document.getElementById('pause-screen');
    if (pauseOverlay) pauseOverlay.classList.add('hidden');

    ['credits', 'changelog'].forEach((name) => {
      const overlay = document.getElementById(`${name}-screen`);
      if (overlay) {
        overlay.classList.add('hidden');
        overlay.setAttribute('aria-hidden', 'true');
      }
      document.body?.classList.remove(`is-${name}-open`);
    });

    ui.creditsOverlay.markClosed();
    ui.changelogOverlay.markClosed();

    ui.codexScreen.closeCodex();
    ui.hangarScreen.closeHangar();
    ui.runEndScreens.markClosed();

    if (screenName === 'menu') {
      ui.mainMenu.requestMenuShipSelectorRefresh();
      ui.mainMenu.refreshMenuStatus();
      ui.mainMenu.refreshBossRushLock();
      ui.campaignMap.menuShown();
      ui.refreshMenuTips();
      loadHudEditorAtIdleMenu(ui);
    }

    if (emitEvent) {
      ui.eventBus?.emit?.('screen-changed', { screen: screenName });
    }

    // Back in play under Settings (the cards closed, a Retry's countdown
    // ended, any way): the run waits paused for it.
    if (screenName === 'playing') ui.settingsPanel.holdRun();
  } catch (error) {
    console.error('[UISystem] Failed to show screen:', error);
  }
}

/**
 * Back to play; several level-ups at once deal their card choices first,
 * then a chest waiting shows its cards.
 */
export function showGameUI(ui, options = {}) {
  ui.levelUpScreen.resetLevelUpState();
  if (!ui.runWon && !ui.pilotDown) {
    if (resolveService('progression', ui.dependencies).openNextLevelUpOffer())
      return;

    // A level-up overlay stays visible while another overlay is opened.
    if (ui.chestCeremony.queue?.length) {
      ui.showScreen('levelup', {
        overlay: true,
        show: false,
        emitEvent: false,
      });
    }
    if (ui.chestCeremony.openNext()) return;
    if (ui.flightBriefing.openNext()) return;
  }
  ui.showScreen('playing', options);
  ui.tacticalHud.refreshHudFromServices(true);
}

/** A cinematic holds the run or lets it go: the session's pause flag alone
 * (no pause screen, no fixed steps); let go under Settings, the run waits
 * paused for it. */
export function holdSim(ui, held) {
  resolveService('game-state', ui.dependencies)?.setPaused(held);
  if (!held) ui.settingsPanel.holdRun();
}
