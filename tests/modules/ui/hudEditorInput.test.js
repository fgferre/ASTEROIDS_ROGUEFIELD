import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  editorKey,
  editorPad,
} from '../../../src/modules/ui/hud/editor/editorInput.js';
import { HudEditor } from '../../../src/modules/ui/hud/editor/HudEditor.js';
import { inspectorItem } from '../../../src/modules/ui/hud/editor/editorView.js';

afterEach(() => vi.unstubAllGlobals());

describe('HUD editor close input', () => {
  it('consumes Escape and requests close after editor selection is clear', () => {
    vi.stubGlobal('HTMLTextAreaElement', class {});
    vi.stubGlobal('HTMLInputElement', class {});
    vi.stubGlobal('HTMLSelectElement', class {});
    const requestClose = vi.fn();
    const editor = {
      state: { menu: false, grab: false, selected: null },
      dialogs: { isOpen: false },
      chrome: { contains: () => false },
      requestClose,
    };
    const event = {
      key: 'Escape',
      target: null,
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    };

    editorKey(editor, event);

    expect(event.stopImmediatePropagation).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(requestClose).toHaveBeenCalledOnce();
  });

  it('closes from the pad back action and the mouse Done action', () => {
    const padRequestClose = vi.fn();
    const padEditor = {
      state: { padPanel: false, grab: false, selected: null },
      dialogs: { isOpen: false },
      requestClose: padRequestClose,
    };
    editorPad(padEditor, 'back');

    const mouseRequestClose = vi.fn();
    const editor = Object.create(HudEditor.prototype);
    editor.state = { menu: false };
    editor.dialogs = { isOpen: false, run: vi.fn() };
    editor.requestClose = mouseRequestClose;
    editor.closeMenu = vi.fn();
    const done = { dataset: { action: 'done' } };
    const event = {
      target: {
        closest: (selector) => (selector === '[data-action]' ? done : null),
      },
    };

    editor.onClick(event);

    expect(padRequestClose).toHaveBeenCalledOnce();
    expect(mouseRequestClose).toHaveBeenCalledOnce();
  });

  it('shows touch nudge arrows only for movable instruments and nudges 2 units a tap', () => {
    const item = {
      slot: 'vitals',
      anchor: 'bottom-left',
      x: 32,
      y: 24,
      scale: 1,
      opacity: 1,
      visible: true,
      model: 'm',
    };
    const pad = inspectorItem(item, []);
    expect(pad).toContain('class="hed-group hed-move" data-device="touch"');
    expect(pad.match(/data-nudge=/g)).toHaveLength(4);
    expect(inspectorItem({ ...item, anchor: 'screen' }, [])).not.toContain(
      'data-nudge'
    );

    const editor = Object.create(HudEditor.prototype);
    editor.state = { menu: false };
    editor.dialogs = { isOpen: false };
    editor.closeMenu = vi.fn();
    editor.nudge = vi.fn();
    const arrow = { dataset: { nudge: '0,-2' } };
    editor.onClick({
      target: {
        closest: (selector) => (selector === '[data-nudge]' ? arrow : null),
      },
    });

    expect(editor.nudge).toHaveBeenCalledWith(0, -2);
  });
});
