import { describe, expect, it } from 'vitest';
import {
  ENEMY_EFFECT_COLORS,
  ENEMY_RENDER_PRESETS,
} from '../../src/core/GameConstants.js';
import { DRONE_CONFIG } from '../../src/data/enemies/drone.js';
import { Drone } from '../../src/modules/enemies/types/Drone.js';
import { Mine } from '../../src/modules/enemies/types/Mine.js';
import { Hunter } from '../../src/modules/enemies/types/Hunter.js';

function createMockContext() {
  const stateStack = [];
  const props = {
    globalAlpha: 1,
    shadowBlur: 0,
    shadowColor: 'transparent',
    globalCompositeOperation: 'source-over',
    lineWidth: 1,
    strokeStyle: 'transparent',
    fillStyle: '#000',
  };

  const ctx = {
    _props: props,
    save() {
      stateStack.push({ ...this._props });
    },
    restore() {
      const previous = stateStack.pop();
      if (previous) {
        Object.assign(this._props, previous);
      }
    },
    translate() {},
    rotate() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    arc() {},
    ellipse() {},
    fillRect() {},
    createRadialGradient() {
      return { addColorStop() {} };
    },
    createLinearGradient() {
      return { addColorStop() {} };
    },
  };

  Object.defineProperties(ctx, {
    globalAlpha: {
      get() {
        return this._props.globalAlpha;
      },
      set(value) {
        this._props.globalAlpha = value;
      },
    },
    shadowBlur: {
      get() {
        return this._props.shadowBlur;
      },
      set(value) {
        this._props.shadowBlur = value;
      },
    },
    shadowColor: {
      get() {
        return this._props.shadowColor;
      },
      set(value) {
        this._props.shadowColor = value;
      },
    },
    globalCompositeOperation: {
      get() {
        return this._props.globalCompositeOperation;
      },
      set(value) {
        this._props.globalCompositeOperation = value;
      },
    },
    lineWidth: {
      get() {
        return this._props.lineWidth;
      },
      set(value) {
        this._props.lineWidth = value;
      },
    },
    strokeStyle: {
      get() {
        return this._props.strokeStyle;
      },
      set(value) {
        this._props.strokeStyle = value;
      },
    },
    fillStyle: {
      get() {
        return this._props.fillStyle;
      },
      set(value) {
        this._props.fillStyle = value;
      },
    },
  });

  return ctx;
}

describe('Enemy renderer payloads', () => {
  // Note: vi.restoreAllMocks() handled by global setup (tests/__helpers__/setup.js)
  // Optimization: it.concurrent (tests are independent)

  it.concurrent('produces deterministic drone payload and resets context state', () => {
    const drone = new Drone(null, {
      id: 'drone-test',
      radius: 12,
      maxSpeed: 180,
    });
    drone.vx = 90;
    drone.vy = 45;

    const targetSpeedRatio = Math.min(
      1,
      Math.hypot(drone.vx, drone.vy) /
        Math.max(1, drone.maxSpeed || DRONE_CONFIG?.speed || 1),
    );
    const smoothing = ENEMY_RENDER_PRESETS.drone?.exhaust?.smoothing ?? 0;

    const payload = drone.onDraw(null);
    expect(payload.type).toBe('drone');
    expect(payload.id).toBe('drone-test');
    expect(payload.radius).toBe(12);
    expect(payload.colors.body).toBe(ENEMY_EFFECT_COLORS.drone.body);
    expect(payload.thrust).toBeCloseTo(targetSpeedRatio * smoothing, 6);

    const ctx = createMockContext();
    const secondPayload = drone.onDraw(ctx);
    const expectedSecondThrust =
      payload.thrust + (targetSpeedRatio - payload.thrust) * smoothing;
    expect(secondPayload.thrust).toBeCloseTo(expectedSecondThrust, 6);
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.shadowBlur).toBe(0);
    expect(ctx.shadowColor).toBe('transparent');
    expect(ctx.globalCompositeOperation).toBe('source-over');
    expect(ctx.lineWidth).toBe(1);
    expect(ctx.strokeStyle).toBe('transparent');
  });

  it.concurrent('returns mine pulse data and respects armed state', () => {
    const mine = new Mine(null, {
      id: 'mine-test',
      radius: 18,
    });
    mine.pulsePhase = Math.PI / 2;
    mine.armed = true;

    const payload = mine.onDraw(null);
    expect(payload.type).toBe('mine');
    expect(payload.armed).toBe(true);
    expect(payload.pulse).toBe(1);
    expect(payload.colors.body).toBe(ENEMY_EFFECT_COLORS.mine.body);

    const ctx = createMockContext();
    mine.onDraw(ctx);
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.shadowBlur).toBe(0);
    expect(ctx.shadowColor).toBe('transparent');
    expect(ctx.globalCompositeOperation).toBe('source-over');
    expect(ctx.lineWidth).toBe(1);
    expect(ctx.strokeStyle).toBe('transparent');
  });

  it.concurrent('exposes hunter turret angle in payload and preserves canvas state', () => {
    const hunter = new Hunter(null, {
      id: 'hunter-test',
      radius: 16,
      rotation: Math.PI / 6,
    });
    hunter.turretAngle = Math.PI / 3;

    const payload = hunter.onDraw(null);
    expect(payload.type).toBe('hunter');
    expect(payload.turretAngle).toBeCloseTo(Math.PI / 3, 6);
    expect(payload.colors.body).toBe(ENEMY_EFFECT_COLORS.hunter.body);

    const ctx = createMockContext();
    hunter.onDraw(ctx);
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.shadowBlur).toBe(0);
    expect(ctx.shadowColor).toBe('transparent');
    expect(ctx.globalCompositeOperation).toBe('source-over');
    expect(ctx.lineWidth).toBe(1);
    expect(ctx.strokeStyle).toBe('transparent');
  });
});
