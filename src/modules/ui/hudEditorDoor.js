// src/modules/ui/hudEditorDoor.js
//
// The HUD editor's door (Settings → Edit HUD Layout, the pause screen's
// Edit HUD). The editor (hud/editor/) is the largest screen and the least
// opened, so its file stays out of the game's start: it comes in the
// background once the menu has stood alone for a moment (never during the
// loading or the opening), or with the first press if that comes sooner.
// The editor shows once its file is here, its input layer pushed then;
// nothing changes on screen while it travels, and a player who has moved on
// by then gets it on the next press. The file is asked for once: a failure
// stays (the browser keeps it until the page reloads), quiet in the
// background, and each press shows a short notice saying to reload.
// Shut, the HUD wears the HUD Layout setting's layout.

import { resolveService } from '../../core/serviceUtils.js';
import { inputLayers } from '../input/inputLayers.js';
import { activePreset, instrumentCatalog } from './hud/editor/layoutStore.js';

// Long enough to read its two sentences.
const NOTICE_MS = 5000;
// The menu is looked at this often; two looks in a row with nothing over it
// (the loading screen, the opening, the pilots, a scene) bring the file.
const MENU_LOOK_MS = 1500;

// The editor's file, asked for once.
function editorFile(ui) {
  ui.hudEditorFile ??= import('./hud/editor/HudEditor.js');
  return ui.hudEditorFile;
}

/** The menu shown (screenSwitch.js): the editor's file comes in the
 * background once the menu has stood alone, while it stays the screen. */
export function loadHudEditorAtIdleMenu(ui) {
  if (ui.hudEditor || ui.hudEditorFile || ui.hudEditorLook) return;
  let aloneBefore = false;
  const look = () => {
    ui.hudEditorLook = null;
    const state = resolveService('game-state', ui.dependencies);
    if (ui.hudEditorFile || state.getScreen() !== 'menu') return;
    const alone = !inputLayers.top() && !inputLayers.cinematic;
    if (alone && aloneBefore) {
      editorFile(ui).catch(() => {});
      return;
    }
    aloneBefore = alone;
    ui.hudEditorLook = setTimeout(look, MENU_LOOK_MS);
  };
  ui.hudEditorLook = setTimeout(look, MENU_LOOK_MS);
}

/** The HUD Layout setting's layout on the HUD; the editor owns it while open. */
export function followHudLayout(ui, video) {
  if (!ui.hudEditor?.isOpen) {
    ui.tacticalHud.setLayout(activePreset(video, instrumentCatalog()).items);
  }
}

/**
 * The editor over a paused run's HUD, or over the idle field from the menu.
 * The first time, the promise settles once its file has come or failed.
 */
export function openHudEditor(ui) {
  if (ui.hudEditor?.isOpen || !ui.tacticalHud.layout) return null;
  if (ui.hudEditor) {
    showHudEditor(ui);
    return null;
  }
  if (ui.hudEditorArriving) return ui.hudEditorArriving;
  const asked = askedFrom(ui);
  ui.hudEditorArriving = editorFile(ui)
    .then(
      ({ HudEditor }) => {
        ui.hudEditor = new HudEditor({
          hud: () => ui.tacticalHud.layout,
          settings: ui.settings,
          setLayout: (items) => ui.tacticalHud.setLayout(items),
          refresh: () => ui.tacticalHud.refreshHudFromServices(true),
          wardenLive: () =>
            Boolean(ui.tacticalHud.layout?.slotState('warden')?.active),
          device: () =>
            resolveService('input', ui.dependencies).getActiveDevice(),
          padPress: (root, action) => ui.padNav.press(root, action),
        });
        if (askedFrom(ui) === asked) showHudEditor(ui);
      },
      (error) => {
        console.warn('[UISystem] The HUD editor did not load:', error);
        showLoadNotice();
      }
    )
    .finally(() => {
      ui.hudEditorArriving = null;
    });
  return ui.hudEditorArriving;
}

// Where the press came from: the screen, the pause, an open Settings.
function askedFrom(ui) {
  const state = resolveService('game-state', ui.dependencies);
  const { settingsState } = ui.settingsPanel;
  const settings = settingsState.isOpen && settingsState.source;
  return [state.getScreen(), state.isPaused(), settings].join();
}

// The screens it covers hide, and come back when it closes.
function showHudEditor(ui) {
  const { settingsState } = ui.settingsPanel;
  const settingsFrom = settingsState.isOpen ? settingsState.source : null;
  const screen = resolveService('game-state', ui.dependencies).getScreen();
  const inRun = ['playing', 'levelup', 'chest'].includes(screen);
  const coveredScreen = ['levelup', 'chest'].includes(screen)
    ? document.getElementById(`${screen}-screen`)
    : null;
  const coveredScreenWasHidden =
    coveredScreen?.classList.contains('hidden') ?? true;
  const pause = document.getElementById('pause-screen');
  const menu = document.getElementById('menu-screen');
  const gameUI = document.getElementById('game-ui');
  ui.settingsPanel.closeSettingsPanel({ resumeRun: false });
  pause.classList.add('hidden');
  coveredScreen?.classList.add('hidden');
  if (!inRun) {
    menu.classList.add('hidden');
    gameUI.classList.remove('hidden');
  }
  ui.hudEditor.open({
    onClose: () => {
      if (inRun) {
        pause.classList.toggle('hidden', !ui.pauseScreen.currentPauseState);
      } else {
        gameUI.classList.add('hidden');
        menu.classList.remove('hidden');
      }
      coveredScreen?.classList.toggle('hidden', coveredScreenWasHidden);
      if (settingsFrom) ui.settingsPanel.openSettingsPanel(settingsFrom);
      else ui.domRefs.pause.editHudBtn?.focus({ preventScroll: true });
    },
  });
}

// The editor's toast, over the screen that asked (style.css).
function showLoadNotice() {
  document.querySelector('.hud-editor-notice')?.remove();
  const notice = document.createElement('p');
  notice.className = 'hud-editor-notice';
  notice.setAttribute('role', 'status');
  notice.textContent =
    "The HUD editor couldn't load. Reloading the page brings it back, but a run in progress is lost: finish or leave it first.";
  document.body.appendChild(notice);
  setTimeout(() => notice.remove(), NOTICE_MS);
}
