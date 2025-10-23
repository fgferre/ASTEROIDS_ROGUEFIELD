import { describe, expect, it } from 'vitest';
import RandomService from '../../../src/core/RandomService.js';
import RenderingSystem from '../../../src/modules/RenderingSystem.js';

function captureStarfieldLayout(spaceSky, sampleSize = 5) {
  return spaceSky.layers.map((layer) => ({
    count: layer.stars.length,
    sample: layer.stars.slice(0, sampleSize).map((star) => ({
      x: Number(star.x.toFixed(4)),
      y: Number(star.y.toFixed(4)),
      phase: Number(star.phase.toFixed(6)),
      jitter: Number(star.jitter.toFixed(6)),
    })),
  }));
}

describe('RenderingSystem starfield determinism', () => {
  // Note: vi.restoreAllMocks() handled by global setup (tests/__helpers__/setup.js)
  // Optimization: it.concurrent (tests are independent)

  it.concurrent('restores identical star layout after reseed with the same base seed', () => {
    const baseRandom = new RandomService('rendering:test-seed');
    const renderer = new RenderingSystem({ random: baseRandom });

    renderer.spaceSky.resize(640, 480);
    const initialLayout = captureStarfieldLayout(renderer.spaceSky);

    // Advance the starfield RNG to alter the layout
    renderer.randomForks.starfield.float();
    renderer.spaceSky.reseed(renderer.randomForks.starfield);
    const mutatedLayout = captureStarfieldLayout(renderer.spaceSky);
    expect(mutatedLayout).not.toEqual(initialLayout);

    baseRandom.reset('rendering:test-seed');
    renderer.reseedRandomForks();
    const restoredLayout = captureStarfieldLayout(renderer.spaceSky);

    expect(restoredLayout).toEqual(initialLayout);
  });

  it.concurrent('uses deterministic fallback random scopes when no dependency is provided', () => {
    const firstRenderer = new RenderingSystem();
    firstRenderer.spaceSky.resize(640, 480);
    const firstLayout = captureStarfieldLayout(firstRenderer.spaceSky);

    const secondRenderer = new RenderingSystem();
    secondRenderer.spaceSky.resize(640, 480);
    const secondLayout = captureStarfieldLayout(secondRenderer.spaceSky);

    expect(secondLayout).toEqual(firstLayout);
  });
});
