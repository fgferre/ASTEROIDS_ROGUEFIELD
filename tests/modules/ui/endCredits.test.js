import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomStubs } from '../../__helpers__/domStubs.js';
import { EndCredits } from '../../../src/modules/ui/EndCredits.js';
import { inputLayers } from '../../../src/modules/input/inputLayers.js';

describe('End credits', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => restoreDom());

  it('roll until Enter, then hand over to the final card once', () => {
    const classes = () => ({ add: vi.fn(), remove: vi.fn() });
    const refs = {
      overlay: {},
      roll: { classList: classes(), offsetWidth: 0 },
      continueBtn: { addEventListener: vi.fn(), focus: vi.fn() },
    };
    const showScreen = vi.fn();
    const announceVisibility = vi.fn();
    const credits = new EndCredits({ refs, showScreen, announceVisibility });
    credits.bindControls();
    const onDone = vi.fn();

    credits.play(onDone);
    expect(showScreen).toHaveBeenLastCalledWith('end-credits', {
      overlay: true,
      show: true,
    });
    expect(refs.roll.classList.add).toHaveBeenCalledWith('is-rolling');
    expect(onDone).not.toHaveBeenCalled();

    // Rolling, they are on top of the input layer stack until they end.
    const layer = inputLayers.top();
    expect(layer).toBe(credits.inputLayer);
    const key = { key: 'Enter', preventDefault: vi.fn() };
    layer.onKey(key);
    layer.onKey(key);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(inputLayers.top()).toBe(null);
    expect(showScreen).toHaveBeenLastCalledWith('end-credits', {
      overlay: true,
      show: false,
    });
    expect(announceVisibility).toHaveBeenLastCalledWith(false, {
      source: 'ending',
    });
  });
});
