import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ENEMY_TYPES } from '../../../src/data/constants/visual.js';
import { AFFIX_IDS } from '../../../src/data/enemies/affixes.js';
import { ASTEROID_VARIANTS } from '../../../src/data/enemies/asteroid-configs.js';
import { DISSOLVE_SECONDS } from '../../../src/modules/render3d/dissolve.js';
import {
  EnemyMirror,
  FOG_DIM,
  FOG_FADE_SECONDS,
  KNOWN_KINDS,
  SHADOW_CASTERS,
  SHADOW_RADIUS,
  VARIANT_LOOKS,
  VIEW_KINDS,
} from '../../../src/modules/render3d/enemyMirror.js';

// The vendored r128 build is UMD: evaluated with an `exports` object it
// fills that object instead of a global.
const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

describe('EnemyMirror', () => {
  it('has a dedicated 3D look for every registered enemy type', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    for (const type of [...Object.keys(ENEMY_TYPES), 'asteroid', 'boss']) {
      expect(KNOWN_KINDS.has(type), type).toBe(true);
      expect(mirror.create(type).kind, type).toBe(type);
    }
  });

  it('draws each Warden kind with its own view; a broken Choir core falls away', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    const core = (alive, x) => ({ alive, x, y: 300 });
    const choir = {
      id: 'choir',
      type: 'boss',
      bossKind: 'choir',
      x: 400,
      y: 300,
      radius: 118,
      singingIndex: 1,
      cores: [core(false, 490), core(true, 310), core(true, 400)],
      getHitFlash: () => 0,
    };
    const nullBoss = { ...choir, id: 'null', bossKind: 'null', cores: null };

    expect(mirror.update([choir, nullBoss], 0)).toBeTruthy();
    expect(mirror.views.get('choir').kind).toBe('boss-choir');
    expect(mirror.views.get('null').kind).toBe('boss-null');
    const view = mirror.views.get('choir');
    expect(view.cores[0].pivot.visible).toBe(true); // breaking, still seen
    expect(view.cores[1].halo.visible).toBe(true); // the singing core
    expect(view.cores[2].halo.visible).toBe(false);

    mirror.update([choir], 2);
    expect(view.cores[0].pivot.visible).toBe(false);
    expect(view.cores[1].pivot.visible).toBe(true);
  });

  it('gives every asteroid variant its own instanced look, rebound on reuse', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    const rock = (id, variant) => ({
      id,
      type: 'asteroid',
      variant,
      x: 0,
      y: 0,
      radius: 30,
      getHitFlash: () => 0,
    });
    const colors = new Set();
    const views = new Set();
    for (const variant of Object.keys(ASTEROID_VARIANTS)) {
      expect(VARIANT_LOOKS[variant], variant).toBeDefined();
      mirror.update([rock(variant, variant)], 0);
      const view = mirror.views.get(variant);
      views.add(view);
      expect(view.family, variant).toBe(
        variant === 'crystal' ? 'crystal' : 'stone'
      );
      const mesh = mirror.rocks.meshes[view.family][view.shape];
      expect(mesh.count, variant).toBe(1);
      const { aBase, aSurface } = mesh.geometry.attributes;
      colors.add(new THREE.Color().fromArray(aBase.array).getHexString());
      expect(aSurface.getX(0), variant).toBeCloseTo(
        VARIANT_LOOKS[variant].roughness
      );
      mirror.update([], 0);
      expect(mesh.count, variant).toBe(0);
    }
    expect(colors.size).toBe(Object.keys(ASTEROID_VARIANTS).length);
    expect(views.size).toBe(1); // one pooled view, rebound each time
  });

  it('writes a rock’s crack glow and hit flash into its instance', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    const rock = {
      id: 'rock',
      type: 'asteroid',
      variant: 'common',
      x: 500,
      y: 300,
      radius: 20,
      crackStage: 2,
      getHitFlash: () => 1,
    };
    mirror.update([rock], 0);
    const view = mirror.views.get('rock');
    const mesh = mirror.rocks.meshes.stone[view.shape];
    const { aGlow } = mesh.geometry.attributes;
    expect(aGlow.getX(0)).toBeCloseTo(1.15);
    expect(aGlow.getY(0)).toBeCloseTo(0.65);
    expect(aGlow.getW(0)).toBeCloseTo(0.45);
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(0, matrix);
    expect(matrix.elements[12]).toBe(100);
  });

  // batch colours are stored as float32
  const expectColor = (rgb, color) =>
    color.toArray().forEach((c, i) => expect(rgb[i]).toBeCloseTo(c, 5));

  // drawables (meshes + outlines) of a fresh view, plain and Elite
  const draws = (object) => {
    let n = 0;
    object.traverse((o) => {
      if ((o.isMesh || o.isLine) && o.visible) n += 1;
    });
    return n;
  };

  it('draws each machine’s static matte parts as one vertex-coloured mesh', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    // was 3, 3, 9, 2, 5, 9, 5, Prime 8, Dust 15, Heat 4, Silence 3; outlines
    // and eyes/lenses/nodes now draw in the two batches
    const expected = {
      drone: 1,
      hunter: 1,
      mine: 1,
      husk: 1,
      ram: 1,
      weaver: 2,
      bulwark: 3,
      caster: 1,
      shade: 1,
      leech: 2,
      boss: 2,
      'herald-dust': 3,
      'herald-heat': 2,
      'herald-silence': 1,
    };
    for (const [kind, count] of Object.entries(expected)) {
      const view = mirror.acquire(kind);
      expect(draws(view.object), kind).toBe(count);
      const merged = [];
      view.object.traverse((o) => {
        if (o.material === mirror.machineMaterial) merged.push(o);
      });
      const own = ['husk', 'boss', 'herald-silence'].includes(kind);
      expect(merged.length, kind).toBe(own ? 0 : 1);
      if (!own) expect(merged[0].geometry.getAttribute('color')).toBeTruthy();
    }
    expect(mirror.machineMaterial.vertexColors).toBe(true);
    // the Elite ring is one mesh of dashes
    const ram = mirror.acquire('ram');
    mirror.applyElite(ram, true);
    expect(draws(ram.object)).toBe(2);
  });

  it('draws every live outline in one rim batch, in the view’s colour', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    const machine = (id, type, extra = {}) => ({
      id,
      type,
      x: 400,
      y: 300,
      radius: 12,
      getHitFlash: () => 0,
      ...extra,
    });
    mirror.update(
      [
        machine('a', 'drone'),
        machine('b', 'drone', { elite: true, affixes: [] }),
        machine('c', 'hunter'),
      ],
      0
    );
    const batch = mirror.rimBatch;
    // two 48-point circles and the Seeker's 6-point outline
    expect(batch.count).toBe(48 * 2 + 6);
    expect(batch.object.visible).toBe(true);
    expect(batch.object.geometry.drawRange.count).toBe(batch.count * 2);
    const colorAt = (segment) =>
      Array.from(batch.colors.array.slice(segment * 6, segment * 6 + 3));
    expectColor(colorAt(0), mirror.rimColors.threat);
    expectColor(colorAt(48), mirror.rimColors.elite);
    // world space: the first point of mote a's circle, radius 12 × 1.04
    expect(batch.positions.getX(0)).toBeCloseTo(12 * 1.04);

    mirror.update([], 0);
    expect(batch.count).toBe(0);
    expect(batch.object.visible).toBe(false);
  });

  it('draws every eye, lens and node in one glow batch; a burn shrinks them', () => {
    const bursts = { spawn: () => {} };
    const mirror = new EnemyMirror(
      THREE,
      new THREE.Scene(),
      (fn) => fn(),
      bursts
    );
    const mine = {
      id: 'm',
      type: 'mine',
      x: 400,
      y: 300,
      radius: 14,
      armed: false,
      getHitFlash: () => 0,
    };
    const ram = { ...mine, id: 'r', type: 'ram', telegraphRatio: 0 };
    mirror.update([mine, ram], 0);
    const { mesh } = mirror.glows;
    // three Tether nodes and the Ram's lens (its core shows only charging)
    expect(mesh.count).toBe(4);
    expect(mesh.visible).toBe(true);
    expectColor(
      Array.from(mesh.instanceColor.array.slice(0, 3)),
      mirror.views.get('m').nodeTone.color
    );
    const size = (i) => {
      const matrix = new THREE.Matrix4();
      mesh.getMatrixAt(i, matrix);
      return new THREE.Vector3().setFromMatrixScale(matrix).x;
    };
    const lens = size(3);
    expect(lens).toBeCloseTo(14 * 0.12);

    mirror.markDead(ram);
    mirror.update([mine], 0, 0); // the burn starts
    mirror.update([mine], 0, DISSOLVE_SECONDS / 4);
    expect(mesh.count).toBe(4);
    expect(size(3)).toBeCloseTo(lens * 0.75);

    mirror.update([], 0, DISSOLVE_SECONDS);
    expect(mesh.count).toBe(0);
    expect(mesh.visible).toBe(false);
  });

  it('fades Dense Fog in and out over a second on the shared rock uniform', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    const { stone, crystal } = mirror.rockFamilies;
    expect(stone.defines.ROCK_FOG).toBe('');
    expect(crystal.userData.rockFog).toBe(stone.userData.rockFog);
    const { uFogDim, uFogCenter } = stone.userData.rockFog;

    expect(mirror.updateFog(FOG_FADE_SECONDS / 2, true, 10, -20)).toBe(0.5);
    expect(uFogDim.value).toBeCloseTo(FOG_DIM / 2);
    expect(uFogCenter.value.toArray()).toEqual([10, -20]);
    mirror.updateFog(FOG_FADE_SECONDS, true, 0, 0);
    expect(uFogDim.value).toBeCloseTo(FOG_DIM);
    mirror.updateFog(FOG_FADE_SECONDS / 4, false, 0, 0);
    expect(uFogDim.value).toBeCloseTo(FOG_DIM * 0.75);
    mirror.updateFog(FOG_FADE_SECONDS, false, 0, 0);
    expect(uFogDim.value).toBe(0);
  });

  it('sheds Prime segments by its draw range', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    const boss = {
      id: 'prime',
      type: 'boss',
      x: 400,
      y: 300,
      radius: 60,
      currentPhase: 0,
      getHitFlash: () => 0,
    };
    mirror.update([boss], 0);
    const { geometry } = mirror.views.get('prime').ring;
    const all = geometry.getAttribute('position').count;
    expect(geometry.drawRange.count).toBe(all);
    boss.currentPhase = 2;
    mirror.update([boss], 0.1);
    expect(geometry.drawRange.count).toBe(all / 3);
  });

  it('lets only the nearest machines cast, up to the caster budget', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    const mote = (id, x) => ({
      id,
      type: 'drone',
      x,
      y: 300,
      radius: 12,
      getHitFlash: () => 0,
    });
    const motes = [];
    for (let i = 0; i < 30; i += 1) motes.push(mote(`m${i}`, 400 + i * 10));
    motes.push(mote('far', 400 + SHADOW_RADIUS + 50));
    mirror.update(motes, 0);
    mirror.budgetShadows(0, 0);

    const casting = (id) =>
      mirror.views.get(id).casters.filter((mesh) => mesh.castShadow).length;
    let total = 0;
    mirror.views.forEach((view) => {
      total += view.casters.filter((mesh) => mesh.castShadow).length;
    });
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(SHADOW_CASTERS);
    expect(casting('m0')).toBe(mirror.views.get('m0').casters.length);
    expect(casting('m29')).toBe(0);
    expect(casting('far')).toBe(0);
  });

  it('rebinds a rock that turns Volatile while alive (the Herald of Heat)', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    const rock = {
      id: 'rock',
      type: 'asteroid',
      variant: 'common',
      x: 0,
      y: 0,
      radius: 12,
      getHitFlash: () => 0,
    };
    mirror.update([rock], 0);
    rock.variant = 'volatile';
    mirror.update([rock], 0.1);

    expect(mirror.views.get('rock').look).toBe(VARIANT_LOOKS.volatile);
  });

  it('draws each Herald kind with its own view; Silence rings its blink point', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    const herald = (heraldKind, extra = {}) => ({
      id: heraldKind,
      type: 'herald',
      heraldKind,
      x: 400,
      y: 300,
      radius: 32,
      telegraphRatio: 0.5,
      blinkTarget: null,
      getHitFlash: () => 0,
      ...extra,
    });
    const silence = herald('silence', { blinkTarget: { x: 600, y: 300 } });

    expect(mirror.update([herald('dust'), herald('heat'), silence], 0)).toBe(
      null
    );

    for (const kind of ['dust', 'heat', 'silence']) {
      expect(VIEW_KINDS).toContain(`herald-${kind}`);
      expect(mirror.views.get(kind).kind).toBe(`herald-${kind}`);
    }
    const { telegraph } = mirror.views.get('silence');
    expect(telegraph.group.visible).toBe(true);
    expect(telegraph.target.position.x).toBe(200);
  });

  it('marks the Caster’s landing on the field and leaves nothing after it; a phased Shade wears its dissolve twin and burns from its own material', () => {
    const bursts = { spawn: () => {} };
    const mirror = new EnemyMirror(
      THREE,
      new THREE.Scene(),
      (fn) => fn(),
      bursts
    );
    const machine = (type, extra) => ({
      id: type,
      type,
      x: 400,
      y: 300,
      radius: 14,
      getHitFlash: () => 0,
      ...extra,
    });
    const shell = { fromX: 400, fromY: 300, x: 600, y: 300, age: 0 };
    const caster = machine('caster', { shell, shellProgress: 0.5 });
    const shade = machine('shade', { visibility: 0 });
    mirror.update([caster, shade], 0);

    const { telegraph } = mirror.views.get('caster');
    expect(telegraph.group.visible).toBe(true);
    expect(telegraph.blast.position.x).toBe(600);
    expect(telegraph.shell.position.y).toBeGreaterThan(0); // mid-arc
    mirror.update([{ ...caster, shell: null, shellProgress: null }, shade], 0);
    expect(telegraph.group.visible).toBe(false); // the landing leaves nothing

    const view = mirror.views.get('shade');
    expect(view.body.material).toBe(
      view.dissolve.twins.get(mirror.machineMaterial)
    );
    mirror.budgetShadows(0, 0);
    expect(view.casters.some((mesh) => mesh.castShadow)).toBe(false);

    mirror.markDead(shade);
    mirror.update([caster], 0, 0); // the burn starts from the real material
    expect(view.dissolve.sources).toEqual([mirror.machineMaterial]);
    mirror.update([caster], 0, DISSOLVE_SECONDS);
    expect(view.body.material).toBe(mirror.machineMaterial);
  });

  it('lights and swells the Leech’s belly with what it holds', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    const leech = {
      id: 'leech',
      type: 'leech',
      x: 400,
      y: 300,
      radius: 16,
      fullness: 0,
      full: false,
      getHitFlash: () => 0,
    };
    mirror.update([leech], 0);
    const view = mirror.views.get('leech');
    const emptyGain = view.bellyMaterial.userData.gain;
    const emptyScale = view.belly.scale.x;

    leech.fullness = 1;
    leech.radius = 26;
    mirror.update([leech], 0);
    expect(view.bellyMaterial.userData.gain).toBeGreaterThan(emptyGain);
    expect(view.belly.scale.x).toBeGreaterThan(emptyScale);
    expect(view.object.scale.x).toBe(26);

    leech.full = true;
    const gains = [0, 0.13, 0.26].map((time) => {
      mirror.update([leech], time);
      return view.bellyMaterial.userData.gain;
    });
    expect(new Set(gains).size).toBeGreaterThan(1); // the full pulse
  });

  it('bakes the affix badge textures in warm-up, inside the seeded wrapper', () => {
    // a canvas whose 2D context accepts every draw call
    const ctx = new Proxy(
      {},
      { get: (target, key) => target[key] ?? (() => {}) }
    );
    vi.stubGlobal('document', {
      createElement: () => ({ getContext: () => ctx }),
    });
    let depth = 0;
    const seeded = (fn) => {
      depth += 1;
      try {
        return fn();
      } finally {
        depth -= 1;
      }
    };
    const baked = [];
    const three = {
      ...THREE,
      CanvasTexture: class extends THREE.CanvasTexture {
        constructor(...args) {
          super(...args);
          baked.push(depth);
        }
      },
    };
    const mirror = new EnemyMirror(three, new three.Scene(), seeded);
    mirror.warm('drone', () => {});
    vi.unstubAllGlobals();

    expect(Object.keys(mirror.badges).sort()).toEqual([...AFFIX_IDS].sort());
    expect(baked).toHaveLength(AFFIX_IDS.length);
    baked.forEach((level) => expect(level).toBeGreaterThan(0));
    expect(mirror.badgeMaterials()).toBe(mirror.badges);
  });
});
