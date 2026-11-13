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
    expect(emit.mock.calls.slice(2)).toEqual([
      ['transmission-finished', { key: line.key }],
    ]);
  });
});
