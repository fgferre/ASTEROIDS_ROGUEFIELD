import { describe, expect, it } from 'vitest';
import { ServiceRegistry } from '../../core/ServiceRegistry.js';
import RenderingSystem from '../../modules/RenderingSystem.js';

function captureStarfieldSnapshot(renderingSystem) {
  const layers = renderingSystem.spaceSky.layers.map((layer) => ({
    count: layer.stars.length,
    sample: layer.stars.slice(0, 5).map((star) => ({
      x: Number(star.x.toFixed(4)),
      y: Number(star.y.toFixed(4)),
      phase: Number(star.phase.toFixed(6)),
      jitter: Number(star.jitter.toFixed(6)),
    })),
  }));

  return layers;
}

describe('RenderingSystem RNG determinism', () => {
  function createRenderingHarness(seed) {
    const container = ServiceRegistry.createTestContainer({ randomSeed: seed });
    const random = container.resolve('random');
    const rendering = new RenderingSystem({ random });

    rendering.spaceSky.resize(960, 540);

    return { rendering, random };
  }

  it('rebuilds the starfield identically after reseeding', () => {
    const seed = 1337;
    const { rendering, random } = createRenderingHarness(seed);

    const initialSnapshot = captureStarfieldSnapshot(rendering);
    expect(initialSnapshot.every((layer) => layer.count > 0)).toBe(true);

    // Advance RNG by triggering another rebuild with different dimensions
    rendering.spaceSky.resize(1280, 720);
    captureStarfieldSnapshot(rendering);

    // Restore the viewport to the original dimensions before reseeding
    rendering.spaceSky.resize(960, 540);

    random.reset(random.seed);
    rendering.reset({ refreshForks: true });

    const postResetSnapshot = captureStarfieldSnapshot(rendering);

    expect(postResetSnapshot).toStrictEqual(initialSnapshot);
  });
});
