import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountScreens } from '../../__helpers__/screenRig.js';
import { inputLayers } from '../../../src/modules/input/inputLayers.js';

// The HUD editor's file comes in the background from the menu left alone,
// or with the first press (ui/hudEditorDoor.js): here it is held until the
// test lets it arrive, or it fails as on a lost connection.
const EDITOR = '../../../src/modules/ui/hud/editor/HudEditor.js';

describe('the HUD editor, fetched apart from the game', () => {
  let rig;
  beforeEach(() => {
    rig = mountScreens();
    rig.ui.hudEditor = null; // its file not fetched yet
  });
  afterEach(() => {
    vi.doUnmock(EDITOR);
    expect(rig.errors()).toEqual([]);
    rig.destroy();
  });

  it('shows over the paused run once its file is here, its input layer pushed then and not before', async () => {
    let arrive;
    const arrived = new Promise((resolve) => (arrive = resolve));
    vi.doMock(EDITOR, async (importOriginal) => {
      await arrived;
      return importOriginal();
    });
    rig.open.pause();
    const pause = rig.dom.document.getElementById('pause-screen');

    const opening = rig.ui.openHudEditor();
    expect(rig.ui.openHudEditor()).toBe(opening); // a second press waits too
    await new Promise((resolve) => setImmediate(resolve));
    expect(rig.ui.hudEditor).toBeNull();
    expect(inputLayers.top().name).toBe('pause');
    expect(pause.classList.contains('hidden')).toBe(false);

    arrive();
    await opening;
    expect(rig.ui.hudEditor.isOpen).toBe(true);
    expect(inputLayers.top().name).toBe('hud-editor');
    expect(pause.classList.contains('hidden')).toBe(true);

    rig.ui.hudEditor.close();
    expect(inputLayers.top().name).toBe('pause');
    expect(pause.classList.contains('hidden')).toBe(false);
  });

  it('says so when its file does not come, leaves Settings and the menu working, and asks for it only once, as the browser keeps a failure until the page reloads', async () => {
    let asked = 0;
    vi.doMock(EDITOR, () => {
      asked += 1;
      throw new Error('Failed to fetch dynamically imported module');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    rig.open.settings();
    const before = rig.snapshot();

    await rig.ui.openHudEditor();
    expect(rig.ui.hudEditor).toBeNull();
    expect(inputLayers.top().name).toBe('settings');
    expect(rig.snapshot()).toEqual(before);
    const notice = () => rig.dom.document.querySelector('.hud-editor-notice');
    expect(notice().textContent).toMatch(/couldn't load.*reload.*run/i);
    rig.wait(5000);
    expect(notice()).toBeNull();

    // Escape closes Settings back to the menu, and F10 opens it again.
    rig.tap('Escape');
    expect(rig.snapshot().settings).toBe(false);
    rig.open.settings();
    expect(rig.snapshot().settings).toBe(true);

    // The file would come now, but the failure stands until a reload.
    vi.doMock(EDITOR, (importOriginal) => importOriginal());
    await rig.ui.openHudEditor();
    expect(rig.ui.hudEditor).toBeNull();
    expect(notice()).not.toBeNull();
    expect(asked).toBe(1);
    expect(inputLayers.top().name).toBe('settings');
  });

  it('comes in the background once the menu has stood alone, never while a screen is over it, and then opens at once', async () => {
    let asked = 0;
    vi.doMock(EDITOR, (importOriginal) => {
      asked += 1;
      return importOriginal();
    });
    rig.open.settings();
    rig.ui.showScreen('menu');
    rig.wait(6000);
    expect(asked).toBe(0);

    rig.tap('Escape');
    expect(inputLayers.top()).toBeNull();
    rig.wait(1500);
    expect(asked).toBe(0);
    rig.wait(1500);
    await rig.ui.hudEditorFile;
    expect(asked).toBe(1);

    await rig.ui.openHudEditor();
    expect(rig.ui.hudEditor.isOpen).toBe(true);
    expect(asked).toBe(1);
  });

  it('keeps a background failure quiet: the notice waits for a press', async () => {
    vi.doMock(EDITOR, () => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const notice = () => rig.dom.document.querySelector('.hud-editor-notice');
    rig.ui.showScreen('menu');
    rig.wait(3000);
    await rig.ui.hudEditorFile.catch(() => {});
    expect(notice()).toBeNull();
    expect(warn).not.toHaveBeenCalled();

    await rig.ui.openHudEditor();
    expect(notice()).not.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
