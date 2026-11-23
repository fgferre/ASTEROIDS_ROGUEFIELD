import { afterEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import { createHeadlessGame } from '../__helpers__/headlessGame.js';
import { installDomStubs } from '../__helpers__/domStubs.js';

// A headless game must not outlive its test: its garbage collector's first
// pool pass ran on a 150 ms real timer and logged after the test had ended,
// sometimes while the worker was closing (stray errors under load, 21/11).
describe('a headless game after its test', () => {
  let restoreDom;
  afterEach(() => {
    GamePools.releaseAll();
    restoreDom?.();
  });

  it('plays a run', () => {
    restoreDom = installDomStubs();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    createHeadlessGame().session.startNewRun({ source: 'test' });
  });

  it('leaves nothing running that logs afterwards', async () => {
    const logged = vi.spyOn(console, 'debug').mockImplementation(() => {});
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(logged).not.toHaveBeenCalled();
  });
});
