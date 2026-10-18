import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../src/core/EventBus.js';
import { QUALITY_PRESETS } from '../../../src/core/qualityPresets.js';
import RandomService from '../../../src/core/RandomService.js';
import EffectsSystem from '../../../src/modules/EffectsSystem.js';
import Renderer3D, {
  setBloomMips,
} from '../../../src/modules/render3d/Renderer3D.js';

describe('Renderer3D camera clamp', () => {
  it('keeps the dollied-out follow point inside the field', () => {
    const renderer = new Renderer3D();
    renderer.camera.snapTo(20, 20);
    const near = { ...renderer.clampToField(700, 4 / 3) };
    const far = renderer.clampToField(900, 4 / 3);
    expect(near.x).toBeGreaterThan(20);
    expect(near.y).toBeGreaterThan(20);
    // further out shows more, so the follow point sits further from the edge
    expect(far.x).toBeGreaterThan(near.x);
    expect(far.y).toBeGreaterThan(near.y);
  });
});

describe('Renderer3D dash and brake camera', () => {
  const zoomAfter = (event, reducedMotion = false) => {
    const eventBus = new EventBus();
    const renderer = new Renderer3D({ eventBus });
    renderer.reducedMotion = reducedMotion;
    eventBus.emit(event, { position: { x: 400, y: 300 } });
    renderer.camera.update(400, 300, 0.08);
    return renderer.camera.zoom;
  };

  it('the dash pulls the shot out, the brake leans in, neither with reduced motion', () => {
    const base = zoomAfter('nothing');
    expect(zoomAfter('player-dashed')).toBeLessThan(base);
    expect(zoomAfter('player-braked')).toBeGreaterThan(base);
    expect(zoomAfter('player-dashed', true)).toBe(base);
    expect(zoomAfter('player-braked', true)).toBe(base);
  });
});

describe('Renderer3D brake ring', () => {
  it('draws the emergency brake ring as a 3D shockwave at the ship', () => {
    const eventBus = new EventBus();
    const effects = new EffectsSystem({
      eventBus,
      random: new RandomService('brake-ring'),
      audio: {},
      settings: { getCategoryValues: () => null },
    });
    eventBus.emit('player-braked', {
      position: { x: 300, y: 200 },
      radius: 110,
      knockback: 160,
    });
    effects.update(0.1);

    class Color {
      r = 1;
      g = 1;
      b = 1;
      setStyle() {}
      set() {}
      convertSRGBToLinear() {}
    }
    const uniform = () => ({ value: 0 });
    const ring = {
      visible: false,
      position: { set: vi.fn() },
      scale: { set: vi.fn() },
      material: {
        uniforms: {
          uRadius: uniform(),
          uWidth: uniform(),
          uExtent: uniform(),
          uColor: { value: { setRGB: vi.fn() } },
        },
      },
    };
    const renderer = Object.create(Renderer3D.prototype);
    renderer.three = {
      THREE: { Color },
      shockwaves: [ring],
      flashes: { observe: () => false },
      flashAlpha: 0,
    };
    renderer.mirrorEffects({ shockwaves: effects.shockwaves });

    expect(ring.visible).toBe(true);
    expect(ring.position.set).toHaveBeenCalledWith(-100, 1.5, -100);
    const radius = ring.material.uniforms.uRadius.value;
    expect(radius).toBeGreaterThan(0);
    expect(radius).toBeLessThan(110);
  });
});

describe('Renderer3D shadows', () => {
  it('builds a resized shadow map inside a seeded frame', () => {
    // three r128: shadowMap.render reads the per-frame light state, which
    // only exists while renderer.render() runs.
    let inFrame = false;
    let seeded = false;
    const shadowMap = {
      enabled: false,
      render: vi.fn(() => {
        if (!inFrame) throw new TypeError("reading 'state' of null");
      }),
    };
    const fake = {
      shadowMap,
      render: vi.fn(() => {
        expect(seeded).toBe(true);
        inFrame = true;
        shadowMap.render();
        inFrame = false;
      }),
    };
    const renderer = new Renderer3D();
    renderer.seeded = (fn) => {
      seeded = true;
      const out = fn();
      seeded = false;
      return out;
    };
    const mapSize = { x: 2048, set: vi.fn((x) => (mapSize.x = x)) };
    const key = { castShadow: false, shadow: { mapSize, map: null } };
    renderer.three = { renderer: fake, key, scene: {}, camera: {} };

    expect(() => renderer.applyShadows(1024)).not.toThrow();
    expect(fake.render).toHaveBeenCalledTimes(1);
    expect(mapSize.x).toBe(1024);
    expect(key.castShadow).toBe(true);
  });
});

describe('Renderer3D lock line', () => {
  it('draws the lock line from the turret muzzle to the target', () => {
    const renderer = Object.create(Renderer3D.prototype);
    const segment = vi.fn();
    renderer.three = { ribbons: { circle: vi.fn(), segment }, accentRgb: 0 };
    renderer.cachedCombat = {
      aimMode: 'auto',
      targetingUpgradeLevel: 1,
      currentLockAssignments: [],
      currentTarget: { x: 300, y: 100, radius: 16 },
      targetIndicatorPulse: 0,
      targetPulseDuration: 1,
      usingDynamicPrediction: () => false,
    };
    renderer.mirrorLocks({
      position: { x: 100, y: 100 },
      getMuzzlePoint: () => ({ x: 122, y: 98 }),
    });
    expect(segment.mock.calls[0].slice(0, 4)).toEqual([122, 98, 300, 100]);
  });
});

describe('Renderer3D bloom mips', () => {
  it('blurs 5 mips on ultra, 3 on high; the composite skips the rest', () => {
    expect(QUALITY_PRESETS.ultra.bloomMips).toBe(5);
    expect(QUALITY_PRESETS.high.bloomMips).toBe(3);
    const targets = [0, 1, 2, 3, 4].map((i) => ({ texture: { i } }));
    const uniforms = Object.fromEntries(
      targets.map((target, i) => [
        `blurTexture${i + 1}`,
        { value: target.texture },
      ])
    );
    const pass = {
      nMips: 5,
      blackMip: { black: true },
      renderTargetsVertical: targets,
      compositeMaterial: { uniforms },
      setSize: vi.fn(),
    };

    setBloomMips(pass, QUALITY_PRESETS.high.bloomMips, 800, 600);
    expect(pass.nMips).toBe(3);
    expect(uniforms.blurTexture3.value).toBe(targets[2].texture);
    expect(uniforms.blurTexture4.value).toBe(pass.blackMip);
    expect(uniforms.blurTexture5.value).toBe(pass.blackMip);
    expect(pass.setSize).toHaveBeenCalledWith(800, 600);

    setBloomMips(pass, QUALITY_PRESETS.ultra.bloomMips, 800, 600);
    expect(pass.nMips).toBe(5);
    expect(uniforms.blurTexture5.value).toBe(targets[4].texture);
    expect(pass.setSize).toHaveBeenCalledTimes(2);
  });
});

describe('Renderer3D bloom intensity', () => {
  const strengthWith = (values, scene = {}) => {
    const renderer = Object.create(Renderer3D.prototype);
    renderer.graphics = {};
    renderer.quality = { settings: { bloomScale: 0.85 } };
    renderer.camera = { setMode: vi.fn() };
    renderer.qualityUrl = 'high';
    renderer.three = {
      bloomScale: 1,
      bloomSet: false,
      biomes: { targets: {}, applied: 'x' },
      bloomPass: { enabled: true },
      smaaPass: {},
      ...scene,
    };
    renderer.applyGraphicsPreferences(values);
    expect(renderer.three.biomes.applied).toBeNull();
    return renderer.three.biomes.targets.bloomBase;
  };

  it('scales the preset strength live: Low 0.6x, Normal 1x, High 1.4x', () => {
    const normal = strengthWith({ bloomIntensity: 'normal' });
    expect(normal).toBeCloseTo(0.9 * 0.85);
    expect(strengthWith({ bloomIntensity: 'low' })).toBeCloseTo(normal * 0.6);
    expect(strengthWith({ bloomIntensity: 'high' })).toBeCloseTo(normal * 1.4);
    expect(strengthWith({})).toBeCloseTo(normal);
  });

  it('lets ?bloom=<n> replace the setting', () => {
    const three = { bloomSet: true, bloomScale: 2 };
    expect(strengthWith({ bloomIntensity: 'low' }, three)).toBeCloseTo(
      0.9 * 2 * 0.85
    );
  });
});

describe('Renderer3D boss flash', () => {
  const effect = (timer) => ({
    timer,
    duration: 1.05,
    maxAlpha: 0.5,
    borderWidth: 24,
    pulseFrequency: 2.4,
    overlayAlpha: 0.12,
    fadePower: 1.6,
  });
  const washAlpha = (flashScale, effects) => {
    const renderer = Object.create(Renderer3D.prototype);
    renderer.flashScale = flashScale;
    renderer.three = {
      bossFlash: { style: {} },
      bossFlashKey: '',
      canvas: { clientWidth: 800 },
    };
    renderer.mirrorBossTransitions(effects);
    return Number(
      renderer.three.bossFlash.style.background
        .match(/[\d.]+\)$/)[0]
        .slice(0, -1)
    );
  };

  it('dims the wash to 30 % with Reduce Flashing, without the pulse', () => {
    // at timer 0.6 the pulse is in its trough
    const full = washAlpha(1, [effect(0.6)]);
    const reduced = washAlpha(0.3, [effect(0.6)]);
    const fade = 1 - Math.pow(0.6 / 1.05, 1.6);
    expect(reduced).toBeCloseTo(0.12 * fade * 0.3, 5);
    expect(reduced).toBeLessThan(full);
  });

  it('skips a boss flash starting within 0.34 s of another with Reduce Flashing', () => {
    const alone = washAlpha(0.3, [effect(0.5)]);
    expect(washAlpha(0.3, [effect(0.5), effect(0.3)])).toBe(alone);
    expect(washAlpha(1, [effect(0.5), effect(0.3)])).toBeGreaterThan(
      washAlpha(1, [effect(0.5)])
    );
  });
});
