import { describe, expect, it } from 'vitest';
import RandomService from '../../src/core/RandomService.js';
import EffectsSystem from '../../src/modules/EffectsSystem.js';
import RenderingSystem from '../../src/modules/RenderingSystem.js';
import { createTestContainer } from '../__helpers__/setup.js';

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
    const container = createTestContainer(seed);
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

  it('keeps background and full-screen overlays anchored while world rendering still shakes', () => {
    const eventBus = {
      on() {},
      off() {},
      emit() {},
    };
    const rendering = new RenderingSystem({
      random: new RandomService('rendering-hv11'),
      eventBus,
    });
    const effects = new EffectsSystem({
      random: new RandomService('effects-hv11'),
      eventBus,
    });

    rendering.resolveCachedServices = () => {};
    rendering.stateManager.currentState.fillStyle = '#000000';
    rendering.stateManager.transitionToPhase = () => {};
    rendering.spaceSky = null;
    rendering.cachedPlayer = null;
    rendering.cachedProgression = null;
    rendering.cachedXPOrbs = null;
    rendering.cachedHealthHearts = null;
    rendering.cachedEnemies = null;
    rendering.cachedUI = null;
    rendering.cachedCombat = {
      render(ctx) {
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(10, 20, 5, 5);
      },
    };
    rendering.cachedEffects = effects;

    effects.screenShake.trauma = 1;
    effects.screenShake.offsetX = 18;
    effects.screenShake.offsetY = -11;
    effects.screenShake.angle = 0.07;
    effects.screenFlash = {
      timer: 1,
      duration: 1,
      color: '#ffffff',
      intensity: 0.6,
    };
    effects.bossTransitionEffects = [
      {
        timer: 0.4,
        duration: 1,
        fadePower: 1.5,
        pulseFrequency: 1.8,
        maxAlpha: 0.9,
        borderWidth: 12,
        overlayAlpha: 0.35,
        color: 'rgba(255, 105, 140, 0.95)',
      },
    ];

    const ctx = createTrackedContext();
    rendering.render(ctx);

    const backgroundFill = ctx.ops.find(
      (op) => op.type === 'fillRect' && op.fillStyle === '[gradient]'
    );
    const worldFill = ctx.ops.find(
      (op) => op.type === 'fillRect' && op.fillStyle === '#00ff00'
    );
    const flashFill = ctx.ops.find(
      (op) => op.type === 'fillRect' && op.fillStyle === '#ffffff'
    );
    const bossOverlayFill = ctx.ops.find(
      (op) =>
        op.type === 'fillRect' &&
        op.fillStyle === 'rgba(255, 105, 140, 0.95)'
    );

    expect(backgroundFill).toMatchObject({ tx: 0, ty: 0, angle: 0 });
    expect(worldFill).toMatchObject({ tx: 18, ty: -11, angle: 0.07 });
    expect(flashFill).toMatchObject({ tx: 0, ty: 0, angle: 0 });
    expect(bossOverlayFill).toMatchObject({ tx: 0, ty: 0, angle: 0 });
    expect(ctx.stackDepth()).toBe(0);
  });

  it('balances canvas save and restore while rendering the starfield background', () => {
    const rendering = new RenderingSystem({
      random: new RandomService('rendering-space-sky-balance'),
    });
    rendering.spaceSky.resize(800, 600);

    const ctx = createTrackedContext();
    rendering.spaceSky.render(ctx, {
      width: 800,
      height: 600,
      velocity: { x: 0, y: 0 },
    });

    expect(ctx.stackDepth()).toBe(0);
  });

  it('restores the canvas state even when rendering throws mid-frame', () => {
    const rendering = new RenderingSystem({
      random: new RandomService('rendering-restore-on-throw'),
    });

    rendering.resolveCachedServices = () => {};
    rendering.stateManager.currentState.fillStyle = '#000000';
    rendering.stateManager.transitionToPhase = () => {};
    rendering.spaceSky = null;
    rendering.cachedPlayer = null;
    rendering.cachedProgression = null;
    rendering.cachedXPOrbs = null;
    rendering.cachedHealthHearts = null;
    rendering.cachedEnemies = null;
    rendering.cachedUI = null;
    rendering.cachedEffects = null;
    rendering.cachedCombat = {
      render() {
        throw new Error('mid-frame render failure');
      },
    };

    const ctx = createTrackedContext();
    expect(() => rendering.render(ctx)).toThrow('mid-frame render failure');
    expect(ctx.stackDepth()).toBe(0);
  });
});

function createTrackedContext() {
  const stack = [];
  const state = {
    tx: 0,
    ty: 0,
    angle: 0,
    fillStyle: null,
    strokeStyle: null,
    globalAlpha: 1,
    lineWidth: 1,
    shadowColor: null,
    shadowBlur: 0,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'low',
  };
  const ops = [];

  return {
    canvas: { width: 800, height: 600 },
    ops,
    get imageSmoothingEnabled() {
      return state.imageSmoothingEnabled;
    },
    set imageSmoothingEnabled(value) {
      state.imageSmoothingEnabled = value;
    },
    get imageSmoothingQuality() {
      return state.imageSmoothingQuality;
    },
    set imageSmoothingQuality(value) {
      state.imageSmoothingQuality = value;
    },
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(value) {
      state.fillStyle = value;
    },
    get strokeStyle() {
      return state.strokeStyle;
    },
    set strokeStyle(value) {
      state.strokeStyle = value;
    },
    get globalAlpha() {
      return state.globalAlpha;
    },
    set globalAlpha(value) {
      state.globalAlpha = value;
    },
    get lineWidth() {
      return state.lineWidth;
    },
    set lineWidth(value) {
      state.lineWidth = value;
    },
    get shadowColor() {
      return state.shadowColor;
    },
    set shadowColor(value) {
      state.shadowColor = value;
    },
    get shadowBlur() {
      return state.shadowBlur;
    },
    set shadowBlur(value) {
      state.shadowBlur = value;
    },
    save() {
      stack.push({ ...state });
    },
    restore() {
      Object.assign(state, stack.pop() || {});
    },
    stackDepth() {
      return stack.length;
    },
    translate(x, y) {
      state.tx += x;
      state.ty += y;
    },
    rotate(angle) {
      state.angle += angle;
    },
    setTransform(a, b, c, d, e, f) {
      state.tx = e;
      state.ty = f;
      state.angle = 0;
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    clearRect() {},
    drawImage() {},
    get globalCompositeOperation() {
      return state.globalCompositeOperation;
    },
    set globalCompositeOperation(value) {
      state.globalCompositeOperation = value;
    },
    fillRect(x, y, width, height) {
      ops.push({
        type: 'fillRect',
        x,
        y,
        width,
        height,
        tx: state.tx,
        ty: state.ty,
        angle: state.angle,
        fillStyle:
          typeof state.fillStyle === 'string' ? state.fillStyle : '[gradient]',
      });
    },
    strokeRect(x, y, width, height) {
      ops.push({
        type: 'strokeRect',
        x,
        y,
        width,
        height,
        tx: state.tx,
        ty: state.ty,
        angle: state.angle,
      });
    },
    createRadialGradient() {
      return {
        addColorStop() {},
      };
    },
    createLinearGradient() {
      return {
        addColorStop() {},
      };
    },
  };
}
