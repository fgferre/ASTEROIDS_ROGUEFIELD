import { describe, expect, it, vi } from 'vitest';
import { HangarScreen } from '../../../src/modules/ui/HangarScreen.js';
import { hangarTransmission } from '../../../src/modules/ui/transmissions.js';

describe('Hangar screen', () => {
  it('a purchase line speaks through the transmission events; leaving the Hangar ends it', () => {
    const emit = vi.fn();
    const hullLock = { textContent: '', hidden: true, scrollIntoView: vi.fn() };
    const screen = new HangarScreen({
      refs: { hullLock, overlay: { setAttribute: vi.fn() } },
      emit,
      showScreen: vi.fn(),
      announceVisibility: vi.fn(),
      refreshShipSelector: vi.fn(),
    });
    const line = hangarTransmission('bastion-hull');

    screen.showPurchaseLine(line);
    expect(hullLock.textContent).toBe(`${line.speaker}: ${line.text}`);
    expect(emit.mock.calls).toEqual([
      ['transmission-queued', line],
      ['transmission-shown', line],
    ]);

    screen.hangarState.isOpen = true;
    screen.closeHangar();
    screen.closeHangar();
    expect(emit.mock.calls.slice(2)).toEqual([['transmission-finished', line]]);
  });

  it('shows what the hovered or focused hull does, else the selected one', () => {
    const listeners = {};
    const hulls = {
      addEventListener: (type, fn) => (listeners[type] = fn),
    };
    const hullInfo = { innerHTML: '' };
    const screen = new HangarScreen({
      refs: {
        overlay: { addEventListener: vi.fn() },
        hulls,
        hullInfo,
        hullLock: { hidden: true, textContent: '' },
      },
      emit: vi.fn(),
      selectedHullId: () => 'default-hull',
    });
    vi.stubGlobal('document', { addEventListener: vi.fn() });
    screen.bindHangarControls();
    vi.unstubAllGlobals();
    const button = { dataset: { hangarHull: 'bastion' }, disabled: true };
    button.closest = () => button;

    listeners.pointerover({ target: button });
    expect(hullInfo.innerHTML).toContain('Tough, slow');
    listeners.focusin({
      target: {
        ...button,
        dataset: { hangarHull: 'solar-slicer' },
        closest() {
          return this;
        },
      },
    });
    expect(hullInfo.innerHTML).toContain('Fast, fragile');
    listeners.pointerleave();
    expect(hullInfo.innerHTML).toContain('Balanced');
  });
});
