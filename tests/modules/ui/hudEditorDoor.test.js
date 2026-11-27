import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountScreens } from '../../__helpers__/screenRig.js';
import { inputLayers } from '../../../src/modules/input/inputLayers.js';

// The HUD editor's file comes with the first press (ui/hudEditorDoor.js):
// here it is held until the test lets it arrive, or it fails as on a lost
// connection.
const EDITOR = '../../../src/modules/ui/hud/editor/HudEditor.js';

describe('the HUD editor, fetched on its first press', () => {
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

  it('says so when its file does not come, leaves Settings and the menu working, and the next press fetches it again', async () => {
    vi.doMock(EDITOR, () => {
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
    expect(notice().textContent).toMatch(/HUD editor couldn't load/);
    rig.wait(2600);
    expect(notice()).toBeNull();

    // Escape closes Settings back to the menu, and F10 opens it again.
    rig.tap('Escape');
    expect(rig.snapshot().settings).toBe(false);
    rig.open.settings();
    expect(rig.snapshot().settings).toBe(true);

    vi.doMock(EDITOR, (importOriginal) => importOriginal());
    await rig.ui.openHudEditor();
    expect(rig.ui.hudEditor.isOpen).toBe(true);
    expect(inputLayers.top().name).toBe('hud-editor');
  });
});
