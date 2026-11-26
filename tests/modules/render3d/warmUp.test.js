import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AFFIX_IDS } from '../../../src/data/enemies/affixes.js';
import { ALL_HULLS } from '../../../src/data/shipModels.js';
import PlayerSystem from '../../../src/modules/PlayerSystem.js';
import Renderer3D from '../../../src/modules/render3d/Renderer3D.js';
import {
  CapsuleBatch,
  PointBatch,
  RibbonBatch,
} from '../../../src/modules/render3d/batches.js';
import {
  EnemyMirror,
  KNOWN_KINDS,
  VARIANT_LOOKS,
} from '../../../src/modules/render3d/enemyMirror.js';
import { PlayerMirror } from '../../../src/modules/render3d/playerMirror.js';
import { createEventBusMock } from '../../__helpers__/mocks.js';
import { createCanvasDocumentStub } from '../../__helpers__/stubs.js';
import {
  cleanupGlobalState,
  setupGlobalMocks,
} from '../../__helpers__/setup.js';
import THREE from '../../../src/modules/render3d/three.js';

const seeded = (fn) => fn();

// Renderer3D with its WebGL side swapped for a recorder: every material a
// compile sees is remembered.
function warmable() {
  const player = new PlayerSystem({
    eventBus: createEventBusMock(),
    input: { takeStepFrame: () => ({}) },
  });
  const renderer = new Renderer3D({
    player,
    'menu-background': { withSeededMathRandom: seeded },
  });
  const scene = new THREE.Scene();
  const compiled = new Set();
  const batches = [
    new RibbonBatch(THREE, 16).object,
    new CapsuleBatch(THREE, 16).mesh,
    new PointBatch(THREE, 16).object,
  ];
  scene.add(...batches);
  const pass = () => ({ enabled: false });
  const variants = [];
  const shadowMap = { enabled: true };
  renderer.three = {
    scene,
    overlay: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    key: { castShadow: true },
    renderer: {
      shadowMap,
      setRenderTarget: vi.fn(),
      compile: (root) => {
        variants.push(
          `${shadowMap.enabled}/${renderer.three.player.surfaceMaps}`
        );
        root.traverse(
          (object) => object.material && compiled.add(object.material)
        );
      },
      render: vi.fn(),
    },
    composer: { readBuffer: {}, render: vi.fn() },
    bloomPass: pass(),
    smaaPass: pass(),
    impactPass: pass(),
    bloomUrl: true,
    enemies: new EnemyMirror(THREE, scene, seeded, null),
    player: new PlayerMirror(THREE, scene, seeded),
  };
  return { renderer, compiled, batches, variants };
}

describe('Renderer3D.warmUp', () => {
  beforeEach(() => {
    setupGlobalMocks();
    // the affix badges and the hull liveries bake into canvases
    vi.stubGlobal('document', createCanvasDocumentStub());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanupGlobalState();
  });

  it('compiles every view kind, look, hull and burn, then pools the views', async () => {
    vi.useFakeTimers();
    const { renderer, compiled, batches } = warmable();
    const { enemies, player, scene, composer } = renderer.three;
    const create = vi.spyOn(enemies, 'create');
    const bind = vi.spyOn(enemies, 'bind');
    const rebuild = vi.spyOn(player, 'rebuild');
    const progress = [];
    // The story is untold here: its freighter is made too.
    renderer.story = { warm: vi.fn() };
    // The ending's last image: built on the story's Wake once it is made,
    // compiled and drawn into the composer's target.
    renderer.ending = {
      warm: vi.fn((compile, post) => {
        expect(renderer.story.warm).toHaveBeenCalledTimes(1);
        expect(post).toBe(true);
        compile();
      }),
      // its beats at home, in the story's scene, once the story is made
      warmHome: vi.fn(() => {
        expect(renderer.story.warm).toHaveBeenCalledTimes(1);
      }),
    };

    const done = renderer.warmUp((value) => progress.push(value));
    await vi.runAllTimersAsync();
    await done;
    vi.useRealTimers();
    expect(renderer.story.warm).toHaveBeenCalledTimes(1);
    expect(renderer.ending.warm).toHaveBeenCalledTimes(1);
    expect(renderer.ending.warmHome).toHaveBeenCalledTimes(1);

    const kinds = create.mock.calls.map(([kind]) => kind);
    for (const kind of [...KNOWN_KINDS, 'boss-choir', 'boss-null']) {
      expect(kinds, kind).toContain(kind);
    }
    const variants = bind.mock.calls
      .filter(([view]) => view.kind === 'asteroid')
      .map(([, enemy]) => enemy.variant);
    expect(variants.sort()).toEqual(Object.keys(VARIANT_LOOKS).sort());
    expect(rebuild.mock.calls.map(([, hull]) => hull.id)).toEqual(
      ALL_HULLS.map((hull) => hull.id)
    );

    // every material the scene holds, and every dissolve twin, was compiled
    scene.traverse((object) => {
      if (object.material) expect(compiled.has(object.material)).toBe(true);
    });
    batches.forEach((batch) => expect(compiled.has(batch.material)).toBe(true));
    // the instanced rocks' shared materials, the rim and glow batches
    // the affix badges, baked before the first Elite shows them
    expect(Object.keys(enemies.badges).sort()).toEqual([...AFFIX_IDS].sort());
    // and their sprite program, built here: the first Elite draws no new one
    const badgeSprites = [];
    scene.traverse((object) => object.isSprite && badgeSprites.push(object));
    expect(badgeSprites.length).toBeGreaterThan(0);
    badgeSprites.forEach((sprite) =>
      expect(compiled.has(sprite.material)).toBe(true)
    );
    expect(
      badgeSprites.some((sprite) =>
        Object.values(enemies.badges).includes(sprite.material)
      )
    ).toBe(true);
    Object.values(enemies.rockFamilies).forEach((material) =>
      expect(compiled.has(material)).toBe(true)
    );
    expect(compiled.has(enemies.rimBatch.object.material)).toBe(true);
    expect(compiled.has(enemies.glows.mesh.material)).toBe(true);
    // the bosses' danger looks, worn only on a first attack: a beam, a zone
    const looks = [...compiled].filter((material) => material.uniforms?.uWarn);
    expect(looks.some((material) => material.uniforms.uFront)).toBe(true);
    expect(looks.some((material) => material.uniforms.uStyle)).toBe(true);
    // the Bulwark's plate as broken, and burning broken
    expect(compiled.has(enemies.kit.darkMaterial)).toBe(true);
    const burntDark = [...enemies.pools.get('bulwark')].some((view) =>
      view.dissolve?.twins.has(enemies.kit.darkMaterial)
    );
    expect(burntDark).toBe(true);
    let twins = 0;
    enemies.pools.forEach((pool) =>
      pool.forEach((view) => {
        expect(view.object.visible).toBe(false);
        view.dissolve?.twins.forEach((twin) => {
          twins += 1;
          expect(compiled.has(twin)).toBe(true);
        });
      })
    );
    expect(twins).toBeGreaterThan(0);
    expect(enemies.views.size).toBe(0);
    expect(enemies.dissolve.count).toBe(0);
    expect(composer.render).toHaveBeenCalledTimes(1);

    expect(progress.at(-1)).toBe(1);
    progress.forEach((value, i) =>
      expect(value).toBeGreaterThan(i ? progress[i - 1] : 0)
    );
  });

  it('compiles every preset program variant, the current preset last', () => {
    const { renderer, variants } = warmable();
    renderer.compileScene();
    // scene and overlay per variant; ultra (shadows, maps) last
    expect(variants.filter((_, i) => i % 2 === 0)).toEqual([
      'false/true',
      'false/false',
      'true/true',
    ]);
    expect(renderer.three.renderer.shadowMap.enabled).toBe(true);
    expect(renderer.three.key.castShadow).toBe(true);
    expect(renderer.three.player.surfaceMaps).toBe(true);
  });
});
