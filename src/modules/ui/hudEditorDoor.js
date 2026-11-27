// src/modules/ui/hudEditorDoor.js
//
// The HUD editor's door (Settings → Edit HUD Layout, the pause screen's
// Edit HUD). The editor (hud/editor/) is the largest screen and the least
// opened, so its file comes with the first press: the press asks for it and
// the editor shows once it is here, its input layer pushed then. Nothing
// changes on screen while it travels, and a player who has moved on by then
// gets it on the next press. A file that does not arrive leaves the screen
// as it was with a short notice, and the next press asks for it again; Chrome
// keeps a failed load until the page reloads, so the notice says to reload.
// Shut, the HUD wears the HUD Layout setting's layout.

import { resolveService } from '../../core/serviceUtils.js';
import { activePreset, instrumentCatalog } from './hud/editor/layoutStore.js';

// As long as the editor's own toasts (editorDialogs.js).
const NOTICE_MS = 2600;

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
  ui.hudEditorArriving = import('./hud/editor/HudEditor.js')
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
    "The HUD editor couldn't load. Check the connection, then reload the page.";
  document.body.appendChild(notice);
  setTimeout(() => notice.remove(), NOTICE_MS);
}
