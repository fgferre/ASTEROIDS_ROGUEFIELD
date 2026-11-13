import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { listContent } from '../../../src/content/registry.js';
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
  it('builds every registered enemy in the look its content file picks', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    const roster = listContent('enemies');
    for (const { id, view, visual } of roster) {
      expect(KNOWN_KINDS.has(id), id).toBe(true);
      const built = mirror.create(id);
      expect(built.kind, id).toBe(id);
      expect(built.look, id).toBe(
        view
          ? mirror.machineViews.views[view]
          : mirror.recipeViews.lookOf(visual)
      );
    }
    // the nine machines keep the views drawn by hand for them
    expect(
      Object.fromEntries(roster.map(({ id, view }) => [id, view]))
    ).toMatchObject({
      mine: 'tether',
      husk: 'husk',
      ram: 'ram',
      weaver: 'weaver',
      bulwark: 'bulwark',
      caster: 'caster',
      shade: 'shade',
      leech: 'leech',
    });
    for (const type of ['asteroid', 'boss']) {
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

  it('draws the Quarry Maw with jaws that open and a core that heats', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    const maw = {
      id: 'maw',
      type: 'boss',
      bossKind: 'quarry-maw',
      x: 400,
      y: 300,
      radius: 66,
      facing: 0,
      jawOpen: 0,
      getHitFlash: () => 0,
    };

    expect(VIEW_KINDS).toContain('boss-quarry-maw');
    expect(mirror.update([maw], 0)).toBeTruthy();
    const view = mirror.views.get('maw');
    expect(view.kind).toBe('boss-quarry-maw');
    const [left, right] = view.jaws;
    const shutHeat = view.coreMaterial.emissiveIntensity;
    expect(left.pivot.rotation.y).toBeCloseTo(0);

    maw.jawOpen = 1;
    mirror.update([maw], 0);
    expect(left.pivot.rotation.y).toBeLessThan(0);
    expect(right.pivot.rotation.y).toBeCloseTo(-left.pivot.rotation.y);
    expect(view.coreMaterial.emissiveIntensity).toBeGreaterThan(shutHeat * 5);
  });

  it('draws the Gatekeeper with doors that swing open and its barrier', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    const gate = {
      id: 'gate',
      type: 'boss',
      bossKind: 'gatekeeper',
      x: 400,
      y: 300,
      radius: 70,
      facing: 0,
      shieldUp: 1,
      barrier: null,
      telegraph: null,
      getHitFlash: () => 0,
    };

    expect(VIEW_KINDS).toContain('boss-gatekeeper');
    mirror.update([gate], 0);
    const view = mirror.views.get('gate');
    expect(view.kind).toBe('boss-gatekeeper');
    expect(view.doors[0].pivot.rotation.y).toBeCloseTo(0);
    expect(view.telegraph.barrier.group.visible).toBe(false);

    gate.shieldUp = 0;
    gate.barrier = {
      type: 'barrier',
      x: 400,
      y: 300,
      angle: Math.PI / 2,
      gapAt: 190,
      gapWidth: 140,
      span: [-300, 300],
      solid: 1,
      phase: 'solid',
      timer: 2,
      duration: 4.5,
    };
    mirror.update([gate], 0);
    expect(view.doors[0].pivot.rotation.y).toBeLessThan(-1);
    expect(view.doors[1].pivot.rotation.y).toBeGreaterThan(1);
    expect(view.telegraph.barrier.group.visible).toBe(true);
    expect(view.telegraph.barrier.beams.every((beam) => beam.visible)).toBe(
      true
    );
  });

  it('draws the Kiln Engine with fins that tilt open, its hot wedges and pools', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    const kiln = {
      id: 'kiln',
      type: 'boss',
      bossKind: 'kiln-engine',
      x: 400,
      y: 300,
      radius: 72,
      ventOpen: 0,
      sectors: null,
      pools: [],
      telegraph: null,
      getHitFlash: () => 0,
    };

    expect(VIEW_KINDS).toContain('boss-kiln-engine');
    mirror.update([kiln], 0);
    const view = mirror.views.get('kiln');
    expect(view.kind).toBe('boss-kiln-engine');
    expect(view.fins).toHaveLength(6);
    expect(view.fins[0].rotation.z).toBeCloseTo(0);
    expect(view.telegraph.sectors.group.visible).toBe(false);

    kiln.ventOpen = 1;
    kiln.sectors = {
      type: 'sectors',
      x: 400,
      y: 300,
      angle: 0,
      count: 6,
      offset: 0,
      solid: 1,
      phase: 'burn',
      timer: 1,
      duration: 2.5,
      length: 500,
    };
    kiln.pools = [
      { x: 500, y: 300, radius: 55, phase: 'burn', timer: 2, duration: 4 },
    ];
    mirror.update([kiln], 0);
    expect(view.fins[0].rotation.z).toBeLessThan(-1);
    expect(view.telegraph.sectors.fans.every((fan) => fan.visible)).toBe(true);
    const [pool, spare] = view.telegraph.pools.fans;
    expect(pool.visible).toBe(true);
    expect(pool.position.x).toBeCloseTo(100);
    expect(spare.visible).toBe(false);
  });

  it('draws the Foundry Mother with bay doors, arms on the boss’s swing and their zones', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    const mother = {
      id: 'mother',
      type: 'boss',
      bossKind: 'foundry-mother',
      x: 400,
      y: 300,
      radius: 78,
      ventOpen: 0,
      bays: [
        { open: 0, progress: 0 },
        { open: 0, progress: 0 },
      ],
      arms: null,
      armAngle: 0,
      armReach: 0,
      telegraph: null,
      getHitFlash: () => 0,
    };

    expect(VIEW_KINDS).toContain('boss-foundry-mother');
    mirror.update([mother], 0);
    const view = mirror.views.get('mother');
    expect(view.kind).toBe('boss-foundry-mother');
    expect(view.doors).toHaveLength(2);
    expect(view.doors[0].rotation.z).toBeCloseTo(0);
    expect(view.units[0].visible).toBe(false);
    expect(view.telegraph.arms.group.visible).toBe(false);
    const cold = view.coreMaterial.emissiveIntensity;
    const folded = view.arms[0].children[0].scale.x;

    mother.bays[0] = { open: 1, progress: 0.5 };
    mother.armAngle = 1;
    mother.armReach = 1;
    mother.arms = {
      type: 'arms',
      x: 400,
      y: 300,
      segments: [
        { angle: 1, width: 1.2, inner: 78, outer: 230 },
        { angle: 1 - Math.PI, width: 1.2, inner: 78, outer: 230 },
      ],
      solid: 1,
      phase: 'sweep',
      timer: 1,
      duration: 1.6,
    };
    mirror.update([mother], 0);
    expect(view.doors[0].rotation.z).toBeGreaterThan(1);
    expect(view.doors[1].rotation.z).toBeCloseTo(0);
    expect(view.units[0].visible).toBe(true);
    expect(view.coreMaterial.emissiveIntensity).toBeGreaterThan(cold);
    expect(view.arms[0].rotation.y).toBeCloseTo(-1);
    expect(view.arms[1].rotation.y).toBeCloseTo(-1 - Math.PI);
    expect(view.arms[0].children[0].scale.x).toBeGreaterThan(folded);
    const [arm, other] = view.telegraph.arms.fans;
    expect(view.telegraph.arms.group.visible).toBe(true);
    expect(arm.visible && other.visible).toBe(true);
    expect(arm.rotation.y).toBeCloseTo(-1);
    expect(arm.scale.x).toBeCloseTo(230);
  });

  it('draws the Interdictor with its emitter on the boss’s aim, its cage and its lock', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    const boss = {
      id: 'interdictor',
      type: 'boss',
      bossKind: 'interdictor',
      x: 400,
      y: 300,
      radius: 72,
      ventOpen: 0,
      mastRise: 1,
      aimAngle: 0,
      grid: null,
      lock: null,
      telegraph: null,
      getHitFlash: () => 0,
    };

    expect(VIEW_KINDS).toContain('boss-interdictor');
    mirror.update([boss], 0);
    const view = mirror.views.get('interdictor');
    expect(view.kind).toBe('boss-interdictor');
    expect(view.telegraph.grid.group.visible).toBe(false);
    expect(view.telegraph.lock.group.visible).toBe(false);
    const cold = view.coreMaterial.emissiveIntensity;

    boss.aimAngle = 1;
    boss.grid = {
      type: 'grid',
      x: 300,
      y: 300,
      size: 360,
      open: 1,
      fences: [
        { x1: 120, y1: 120, x2: 480, y2: 120 },
        { x1: 480, y1: 480, x2: 120, y2: 480 },
        { x1: 120, y1: 480, x2: 120, y2: 120 },
      ],
      posts: [
        { x: 120, y: 120 },
        { x: 480, y: 120 },
        { x: 480, y: 480 },
        { x: 120, y: 480 },
      ],
      solid: 1,
      phase: 'solid',
      timer: 3,
      duration: 5.5,
    };
    boss.lock = {
      type: 'lock',
      x: 400,
      y: 300,
      angle: 0,
      x2: 800,
      y2: 300,
      phase: 'burn',
      timer: 0.3,
      duration: 0.6,
      width: 24,
    };
    mirror.update([boss], 0);
    expect(view.emitter.rotation.y).toBeCloseTo(-1);
    expect(view.coreMaterial.emissiveIntensity).toBeGreaterThan(cold);
    expect(view.telegraph.grid.group.visible).toBe(true);
    expect(view.telegraph.grid.beams.every((beam) => beam.visible)).toBe(true);
    const [beam] = view.telegraph.lock.beams;
    expect(beam.visible).toBe(true);
    expect(beam.scale.x).toBeCloseTo(400);
  });

  it('draws Sovereign with its plates opening by order and half, and its split', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    const boss = {
      id: 'sovereign',
      type: 'boss',
      bossKind: 'sovereign',
      x: 400,
      y: 300,
      radius: 84,
      order: 'protect',
      plateOpen: 0,
      plateTurn: 0,
      splitAngle: 0,
      barrier: null,
      telegraph: null,
      beams: null,
      split: null,
      getHitFlash: () => 0,
    };

    expect(VIEW_KINDS).toContain('boss-sovereign');
    mirror.update([boss], 0);
    const view = mirror.views.get('sovereign');
    expect(view.kind).toBe('boss-sovereign');
    expect(view.plates.every((p) => p.hinge.position.x === 0)).toBe(true);
    expect(view.telegraph.split.group.visible).toBe(false);

    Object.assign(boss, { order: 'rebuild', plateOpen: 1 });
    mirror.update([boss], 0);
    expect(view.plates.every((p) => p.hinge.position.x > 0)).toBe(true);

    // both orders: only the plates on the REBUILD half (+y) open
    Object.assign(boss, {
      order: 'both',
      split: {
        type: 'split',
        x: 400,
        y: 300,
        angle: 0,
        phase: 'turn',
        timer: 1,
        duration: 1,
      },
    });
    mirror.update([boss], 0);
    const [east, south, , north] = [0, 2, 4, 6].map((i) => view.plates[i]);
    expect(south.hinge.position.x).toBeGreaterThan(0);
    expect(north.hinge.position.x).toBe(0);
    expect(east.hinge.position.x).toBeGreaterThan(0);
    expect(view.telegraph.split.group.visible).toBe(true);
    expect(view.telegraph.split.fans.slice(0, 2).every((f) => f.visible)).toBe(
      true
    );
  });

  it('draws the Prism Crown with its mirrors where the boss puts them and its beams', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    const crown = {
      id: 'crown',
      type: 'boss',
      bossKind: 'prism-crown',
      x: 400,
      y: 300,
      radius: 70,
      crownOpen: 0,
      mirrors: [
        { x: 512, y: 300, angle: 1, orbit: 0 },
        { x: 344, y: 397, angle: 3, orbit: 2.09 },
        { x: 344, y: 203, angle: 5, orbit: 4.19 },
      ],
      beams: null,
      telegraph: null,
      getHitFlash: () => 0,
    };

    expect(VIEW_KINDS).toContain('boss-prism-crown');
    mirror.update([crown], 0);
    const view = mirror.views.get('crown');
    expect(view.kind).toBe('boss-prism-crown');
    expect(view.mirrors).toHaveLength(4);
    expect(view.mirrors[0].position.x).toBeCloseTo(112 / 70);
    // its face bisects the core's beam (orbit 0) and its own (angle 1)
    expect(view.mirrors[0].rotation.y).toBeCloseTo(-(Math.PI / 2 + 0.5));
    expect(view.mirrors[3].visible).toBe(false);
    expect(view.telegraph.beams.group.visible).toBe(false);
    const cold = view.coreMaterial.emissiveIntensity;

    crown.crownOpen = 1;
    crown.beams = {
      type: 'prism',
      x: 400,
      y: 300,
      segments: [
        { x1: 400, y1: 300, x2: 512, y2: 300 },
        { x1: 512, y1: 300, x2: 800, y2: 500 },
      ],
      solid: 1,
      phase: 'burn',
      timer: 1,
      duration: 2.2,
      width: 20,
    };
    mirror.update([crown], 0);
    expect(view.coreMaterial.emissiveIntensity).toBeGreaterThan(cold);
    const [core, reflected, spare] = view.telegraph.beams.beams;
    expect(view.telegraph.beams.group.visible).toBe(true);
    expect(core.visible).toBe(true);
    expect(core.scale.x).toBeCloseTo(112);
    expect(reflected.position.x).toBeCloseTo(112);
    expect(spare.visible).toBe(false);
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

  it('draws a gold rock as polished metal, its sheen capped', () => {
    const mirror = new EnemyMirror(THREE, new THREE.Scene(), (fn) => fn());
    mirror.update(
      [
        {
          id: 'g',
          type: 'asteroid',
          variant: 'gold',
          x: 0,
          y: 0,
          radius: 30,
          getHitFlash: () => 0,
        },
      ],
      0
    );
    const view = mirror.views.get('g');
    const mesh = mirror.rocks.meshes.stone[view.shape];
    const { aBase, aSurface } = mesh.geometry.attributes;
    expect(aBase.getX(0)).toBeGreaterThan(1);
    expect(aSurface.getY(0)).toBeCloseTo(VARIANT_LOOKS.gold.metalness);
    expect(mirror.rockFamilies.stone.defines.ROCK_SHEEN).toBe('');
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
      husk: 2,
      ram: 1,
      weaver: 2,
      bulwark: 3,
      caster: 1,
      shade: 1,
      leech: 2,
      boss: 3,
      'herald-dust': 2,
      'herald-heat': 2,
      'herald-silence': 1,
    };
    // the hard-surface looks merge on the panelled material instead
    const { panelMaterial } = mirror.recipeViews;
    const panelled = [
      'drone',
      'hunter',
      'mine',
      'weaver',
      'bulwark',
      'caster',
      'leech',
      'herald-dust',
    ];
    for (const [kind, count] of Object.entries(expected)) {
      const view = mirror.acquire(kind);
      expect(draws(view.object), kind).toBe(count);
      const shared = panelled.includes(kind)
        ? panelMaterial
        : mirror.machineMaterial;
      const merged = [];
      view.object.traverse((o) => {
        if (o.material === shared) merged.push(o);
      });
      const own = ['boss', 'herald-silence'].includes(kind);
      expect(merged.length, kind).toBe(own ? 0 : 1);
      if (!own) expect(merged[0].geometry.getAttribute('color')).toBeTruthy();
    }
    expect(panelMaterial.vertexColors).toBe(true);
    expect(mirror.machineMaterial.vertexColors).toBe(true);
    // the Bulwark's plate carries its tones too, apart (it goes dark broken)
    const { plateMesh } = mirror.acquire('bulwark');
    expect(plateMesh.material).toBe(mirror.machineMaterial);
    expect(plateMesh.geometry.getAttribute('color')).toBeTruthy();
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
    // the drone's outline twice and the hunter's own
    const outline = mirror.views.get('a').rims[0].points;
    const n = outline.length / 3;
    const hunterN = mirror.views.get('c').rims[0].points.length / 3;
    expect(batch.count).toBe(n * 2 + hunterN);
    expect(batch.object.visible).toBe(true);
    expect(batch.object.geometry.drawRange.count).toBe(batch.count * 2);
    const colorAt = (segment) =>
      Array.from(batch.colors.array.slice(segment * 6, segment * 6 + 3));
    expectColor(colorAt(0), mirror.rimColors.threat);
    expectColor(colorAt(n), mirror.rimColors.elite);
    // world space: the first point of drone a's outline, × its radius and
    // its look's scale
    const scale = mirror.views.get('a').body.scale.x;
    expect(batch.positions.getX(0)).toBeCloseTo(12 * scale * outline[0]);

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
    // the Mine's trigger and the Ram's lens (its core shows only charging)
    expect(mesh.count).toBe(2);
    expect(mesh.visible).toBe(true);
    expectColor(
      Array.from(mesh.instanceColor.array.slice(0, 3)),
      mirror.views.get('m').triggerTone.color
    );
    const size = (i) => {
      const matrix = new THREE.Matrix4();
      mesh.getMatrixAt(i, matrix);
      return new THREE.Vector3().setFromMatrixScale(matrix).x;
    };
    const lens = size(1);
    expect(lens).toBeCloseTo(14 * 0.12);

    mirror.markDead(ram);
    mirror.update([mine], 0, 0); // the burn starts
    mirror.update([mine], 0, DISSOLVE_SECONDS / 4);
    expect(mesh.count).toBe(2);
    expect(size(1)).toBeCloseTo(lens * 0.75);

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
