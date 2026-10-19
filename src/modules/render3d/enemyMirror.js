// Mirrors EnemySystem entities into Three objects (docs/NORTE.md §3): Ring
// fragments as procedural rock meshes whose cracks light up amber with
// damage (drawn instanced, rockInstances.js), and the Wardens' machines (Mote, Seeker, Tether, Husk, Ram, Weaver,
// Bulwark, Caster, Shade, Leech), the three Wardens (Prime, Choir, Null; one view kind each,
// picked by `bossKind`) and the three Heralds (Dust, Heat, Silence, picked by
// `heraldKind`). Views are pooled per kind and keyed by entity id; a
// view not seen in a frame is hidden and returned to its pool, unless its
// enemy was killed (`markDead`): then it burns away first (dissolve.js).
//
// The looks live in visual families under ./enemies/ (rocks, machines,
// heralds, wardens, affixes; the telegraph and the rock shader are parts two
// families share). Each family is a factory over the toolkit (createKit),
// never the mirror, and returns the create/update functions the mirror
// dispatches to; the mirror keeps pooling, the per-frame loop, binding and
// the toolkit.

import { IS_DEV } from '../../core/env.js';
import { PALETTE } from '../../data/constants/palette.js';
import { BULWARK_SHIELD_HALF_ARC } from '../../content/enemies/bulwark.js';
import { HERALD_KINDS } from '../../data/enemies/herald.js';
import { HALF_H, HALF_W, colorOf } from './batches.js';
import { DISSOLVE_SECONDS, DissolvePool } from './dissolve.js';
import { createAffixViews } from './enemies/affixes.js';
import { createHeraldViews } from './enemies/heralds.js';
import { createMachineViews } from './enemies/machines.js';
import { VARIANT_LOOKS, createRockViews } from './enemies/rocks.js';
import { createTelegraphs } from './enemies/telegraph.js';
import { createWardenViews } from './enemies/wardens.js';
import { GlowBatch } from './glowBatch.js';
import { mergeStatic } from './mergeStatic.js';
import { RimBatch, rimLoop } from './rimBatch.js';
import { addRimLight } from './rimLight.js';

// proposta 18/10: chunks a death throws (machines by radius; final Warden).
const BURST_MIN = 6;
const BURST_MAX = 12;
const WARDEN_BURST = 24;
// One seed for every baked map set (bakedMaps.js): the rocks' and the
// Wardens' plates.
const MAP_SEED = 4242.7;
export const KNOWN_KINDS = new Set([
  'asteroid',
  'drone',
  'hunter',
  'mine',
  'husk',
  'ram',
  'weaver',
  'bulwark',
  'caster',
  'shade',
  'leech',
  'boss',
]);
// Every view kind create() builds: a Warden's `bossKind` splits 'boss' in
// three; a Herald's `heraldKind` names its view.
export const HERALD_VIEW_KINDS = Object.keys(HERALD_KINDS).map(
  (kind) => `herald-${kind}`
);
export const VIEW_KINDS = [
  ...KNOWN_KINDS,
  'boss-choir',
  'boss-null',
  ...HERALD_VIEW_KINDS,
];
// The rock variants' looks (enemies/rocks.js).
export { VARIANT_LOOKS };
// proposta 18/10: shadow-pass budget. Machines (alive or burning) cast only
// within SHADOW_RADIUS world units (= logical px) of the camera target,
// nearest first, up to SHADOW_CASTERS meshes; the rest still receive. Each
// rock mesh casts all its instances in one draw.
export const SHADOW_RADIUS = 520;
export const SHADOW_CASTERS = 24;
// Dense Fog's strength and reach (enemies/rockShader.js).
export {
  FOG_DIM,
  FOG_FADE_SECONDS,
  FOG_FAR,
  FOG_NEAR,
} from './enemies/rockShader.js';

function hashId(id) {
  const text = String(id);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// A batched part's anchor and its parents up to the view's root are shown.
function shown(anchor) {
  for (let node = anchor; node && !node.isScene; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
}

/**
 * Lit, opaque meshes under `root` cast and receive the key light's shadow
 * (Renderer3D); glows, lenses and anything see-through stay out of it.
 * Parts under `minRadius` world units still receive but don't cast: each
 * caster is one more draw call in the shadow pass.
 */
export function markShadowCasters(root, minRadius = 0) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    const material = object.material;
    const lit = material?.isMeshStandardMaterial && !material.transparent;
    object.receiveShadow = lit;
    if (!lit || !minRadius) {
      object.castShadow = lit;
      return;
    }
    const { geometry } = object;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    object.castShadow =
      geometry.boundingSphere.radius * object.matrixWorld.getMaxScaleOnAxis() >=
      minRadius;
  });
}

/**
 * The toolkit every visual family (./enemies/*.js) closes over instead of the
 * mirror, built once per mirror and frozen:
 * - THREE, scene, seeded: the injected Three namespace, the scene, the seeded
 *   Math.random wrapper (Three names what is built in it with Math.random);
 * - dissolve: the mirror's DissolvePool (the Shade phases through its twins);
 * - mapSeed: the baked maps' seed; quality: the preset the mirror flips
 *   ({ surfaceMaps });
 * - plateMaterial, darkMaterial, machineMaterial: the shared matte materials;
 *   tones: the hull/dark vertex tones of merged bodies; rimColors: threat,
 *   Elite and boss outlines; threatColor, bossColor: the accents;
 * - circleRim, sphere, smallSphere, warnRing, bulwarkPlate, bulwarkEdge,
 *   ghostDisc, fuseRing: the geometries two or more families draw;
 * - view, emissive, setGain, tone, rim, glow, merged, body: the view helpers
 *   (a view record, accent tones, batched outline/glow anchors, one merged
 *   matte body per kind); accentOf: a view's accent colour;
 * - createTelegraph, updateTelegraph: field-plane telegraphs
 *   (enemies/telegraph.js), for the Ram and the Wardens.
 */
function createKit(THREE, scene, seeded, dissolve) {
  // Matte mass (docs/NORTE.md §2): the eye/core is the only light; a
  // faint key-coloured rim (rimLight.js) keeps machine silhouettes apart
  // from the field. Rocks get none.
  const plateMaterial = addRimLight(
    new THREE.MeshStandardMaterial({
      color: colorOf(THREE, PALETTE.hullLit),
      metalness: 0.2,
      roughness: 0.85,
      flatShading: true,
    })
  );
  const darkMaterial = addRimLight(
    new THREE.MeshStandardMaterial({
      color: colorOf(THREE, PALETTE.hull),
      metalness: 0.3,
      roughness: 0.8,
    })
  );
  // The static matte parts of a machine, merged per kind (mergeStatic):
  // their hull/dark/plate tones ride in vertex colours, one draw each.
  const machineMaterial = addRimLight(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.2,
      roughness: 0.85,
    })
  );
  const tones = {
    hull: colorOf(THREE, PALETTE.hullLit),
    dark: colorOf(THREE, PALETTE.hull),
  };
  const mergedGeometries = new Map();
  // Herald and Warden rims glow violet: officials of the Ring.
  const rimColors = {
    threat: colorOf(THREE, PALETTE.threat).multiplyScalar(1.1),
    elite: colorOf(THREE, PALETTE.xp).multiplyScalar(1.1),
    boss: colorOf(THREE, PALETTE.boss).multiplyScalar(1.2),
  };

  const circle = [];
  for (let i = 0; i < 48; i += 1) {
    const a = (i / 48) * Math.PI * 2;
    circle.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  const circleRim = rimLoop(circle);
  const sphere = new THREE.SphereGeometry(1, 20, 12);
  const smallSphere = new THREE.SphereGeometry(1, 10, 8);
  const warnRing = new THREE.RingGeometry(0.94, 1, 64);
  warnRing.rotateX(-Math.PI / 2);

  // Accent energy: threat red (gold on an Elite: affixes.js), boss violet.
  const threatColor = colorOf(THREE, PALETTE.threat);
  const bossColor = colorOf(THREE, PALETTE.boss);

  // Bulwark: wide frontal plate (±BULWARK_SHIELD_HALF_ARC) and its rim
  // (the Shielded affix wears them too).
  const half = BULWARK_SHIELD_HALF_ARC;
  const plate = new THREE.Shape();
  plate.absarc(0, 0, 1.02, -half, half, false);
  plate.absarc(0, 0, 0.8, half, -half, true);
  const bulwarkPlate = new THREE.ExtrudeGeometry(plate, {
    depth: 0.42,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 1,
    curveSegments: 16,
  });
  bulwarkPlate.rotateX(-Math.PI / 2);
  bulwarkPlate.translate(0, -0.12, 0);
  const bulwarkEdge = new THREE.RingGeometry(
    0.99,
    1.08,
    16,
    1,
    -half,
    half * 2
  );
  bulwarkEdge.rotateX(-Math.PI / 2);
  bulwarkEdge.translate(0, 0.37, 0);

  // Swift ghosts and the Caster's fill; Volatile fuse and Caster rings.
  const ghostDisc = new THREE.CircleGeometry(1, 24);
  ghostDisc.rotateX(-Math.PI / 2);
  const fuseRing = new THREE.RingGeometry(0.975, 1, 96);
  fuseRing.rotateX(-Math.PI / 2);

  // Machine views: `accents` are the materials (and glow tones) whose base
  // color is the threat/elite accent, `rims` the outlines (in `rimColor`
  // unless a rim has its own colour), `glows` the eyes/lenses/nodes.
  function view(kind, object, parts) {
    return {
      kind,
      object,
      id: null,
      elite: false,
      eliteRing: null,
      affix: null,
      accents: [],
      rims: [],
      rimColor: rimColors.threat,
      glows: [],
      ...parts,
    };
  }

  function emissive(hex, gain) {
    const material = new THREE.MeshBasicMaterial({ toneMapped: false });
    material.userData.base = colorOf(THREE, hex);
    setGain(material, gain);
    return material;
  }

  function setGain(material, gain) {
    material.userData.gain = gain;
    material.color.copy(material.userData.base).multiplyScalar(gain);
  }

  // A glow's colour (base × gain, through setGain), drawn by the glow batch.
  function tone(hex, gain) {
    const tone = {
      color: new THREE.Color(),
      userData: { base: colorOf(THREE, hex) },
    };
    setGain(tone, gain);
    return tone;
  }

  // Batched parts: an anchor posed in the view's graph (scale, position,
  // visible), drawn by packBatches. A rim's `color` overrides the view's.
  function rim(parent, points, scale = 1, color = null) {
    const anchor = new THREE.Object3D();
    anchor.scale.setScalar(scale);
    parent.add(anchor);
    return { anchor, points, color };
  }

  function glow(parent, tone, scale = 1, position = null) {
    const anchor = new THREE.Object3D();
    anchor.scale.setScalar(scale);
    if (position) anchor.position.copy(position);
    parent.add(anchor);
    return { anchor, tone };
  }

  // One merged geometry per name, shared by every view of the kind.
  function merged(name, parts) {
    let geometry = mergedGeometries.get(name);
    if (!geometry) {
      geometry = mergeStatic(THREE, parts());
      mergedGeometries.set(name, geometry);
    }
    return geometry;
  }

  // The static matte body of a machine: one mesh, machineMaterial.
  function body(name, parts) {
    return new THREE.Mesh(merged(name, parts), machineMaterial);
  }

  function accentOf(view) {
    if (view.kind.startsWith('boss') || view.kind === 'herald-silence') {
      return bossColor;
    }
    if (view.accents?.length) return view.accents[0].userData.base;
    if (view.rock) return view.rock.vein;
    if (view.material) return view.material.userData.rockUniforms.uVein.value;
    return threatColor;
  }

  const kit = {
    THREE,
    scene,
    seeded,
    dissolve,
    mapSeed: MAP_SEED,
    // quality preset: every material that samples baked maps follows it
    quality: { surfaceMaps: true },
    plateMaterial,
    darkMaterial,
    machineMaterial,
    tones,
    rimColors,
    threatColor,
    bossColor,
    circleRim,
    sphere,
    smallSphere,
    warnRing,
    bulwarkPlate,
    bulwarkEdge,
    ghostDisc,
    fuseRing,
    view,
    emissive,
    setGain,
    tone,
    rim,
    glow,
    merged,
    body,
    accentOf,
  };
  Object.assign(kit, createTelegraphs(kit));
  return Object.freeze(kit);
}

export class EnemyMirror {
  /** `bursts`: DeathBursts (dissolve.js) for the chunks a death throws. */
  constructor(THREE, scene, seeded, bursts) {
    this.THREE = THREE;
    this.scene = scene;
    this.seeded = seeded;
    this.bursts = bursts;
    this.views = new Map();
    this.pools = new Map();
    this.frame = 0;
    // ids killed since the last frame; their views dissolve instead of
    // vanishing, and stay out of `views` (a reused id gets a fresh view)
    this.dead = new Set();
    this.dissolve = new DissolvePool(THREE, seeded, (view) => this.pool(view));
    this.pruneDead = (key) => {
      if (!this.views.has(key)) this.dead.delete(key);
    };

    this.kit = createKit(THREE, scene, seeded, this.dissolve);
    this.rockViews = createRockViews(this.kit);
    // Outlines and eyes/lenses/nodes draw batched (rimBatch.js,
    // glowBatch.js, packBatches): a view holds their anchors and colours.
    this.rimBatch = new RimBatch(THREE, scene);
    this.glows = new GlowBatch(THREE, scene);
    this.packView = (view) => this.packLive(view);
    this.machineViews = createMachineViews(this.kit);
    this.heraldViews = createHeraldViews(this.kit);
    this.wardenViews = createWardenViews(this.kit);
    this.affixViews = createAffixViews(this.kit);

    // A kind with no look yet: visible, obviously unfinished.
    this.unknownShape = new THREE.OctahedronGeometry(1, 0);
    this.unknownWarned = new Set();

    // The instanced rocks (begun and ended per frame) and the shared
    // materials the tests and the warm-up check read.
    this.rocks = this.rockViews.rocks;
    this.rockFamilies = this.rockViews.rockFamilies;
    this.machineMaterial = this.kit.machineMaterial;
    this.rimColors = this.kit.rimColors;
  }

  // --- pooling ---------------------------------------------------------------

  acquire(kind) {
    const pool = this.pools.get(kind);
    const view =
      pool && pool.length ? pool.pop() : this.seeded(() => this.create(kind));
    view.object.visible = true;
    markShadowCasters(view.object);
    if (kind !== 'asteroid') {
      view.casters ??= [];
      view.casters.length = 0;
      view.object.traverse((object) => {
        if (object.castShadow) view.casters.push(object);
      });
    }
    return view;
  }

  create(kind) {
    switch (kind) {
      case 'asteroid':
        return this.rockViews.createRock();
      case 'asteroid-burn':
        return this.rockViews.createBurnRock();
      case 'drone':
        return this.machineViews.createMote();
      case 'hunter':
        return this.machineViews.createSeeker();
      case 'mine':
        return this.machineViews.createTether();
      case 'husk':
        return this.machineViews.createHusk();
      case 'ram':
        return this.machineViews.createRam();
      case 'weaver':
        return this.machineViews.createWeaver();
      case 'bulwark':
        return this.machineViews.createBulwark();
      case 'caster':
        return this.machineViews.createCaster();
      case 'shade':
        return this.machineViews.createShade();
      case 'leech':
        return this.machineViews.createLeech();
      case 'boss':
      case 'boss-choir':
      case 'boss-null':
        return this.wardenViews.createWarden(kind);
      case 'herald-dust':
        return this.heraldViews.createDust();
      case 'herald-heat':
        return this.heraldViews.createHeat();
      case 'herald-silence':
        return this.heraldViews.createSilence();
      default:
        return this.createUnknown();
    }
  }

  /**
   * Loading-screen warm-up (Renderer3D.warmUp): views of `kind` in every look
   * a run gives it (each rock variant, machines plain and Elite); `compile`
   * runs over them as drawn, then burning (dissolve twins in), and the burn's
   * end pools them, ready for the first spawns.
   */
  warm(kind, compile) {
    const looks =
      kind === 'asteroid'
        ? Object.keys(VARIANT_LOOKS)
        : kind.startsWith('boss') || kind.startsWith('herald')
          ? [false]
          : [false, true];
    const views = looks.map((look, i) => {
      const view = this.acquire(kind);
      view.seed = i;
      this.bind(view, { variant: look });
      if (look === true) this.affixViews.showAll(view);
      return view;
    });
    compile();
    views.forEach((view) => {
      if (view.affix) view.affix.group.visible = false;
    });
    views.forEach((view) =>
      this.dissolve.start(
        this.burnOf(view),
        this.kit.accentOf(view),
        view.radius || 12
      )
    );
    compile();
    this.dissolve.clear();
    return views;
  }

  kindOf(type, bossKind, heraldKind) {
    if (type === 'boss' && (bossKind === 'choir' || bossKind === 'null')) {
      return `boss-${bossKind}`;
    }
    if (type === 'herald') {
      return `herald-${HERALD_KINDS[heraldKind] ? heraldKind : 'dust'}`;
    }
    if (KNOWN_KINDS.has(type)) return type;
    if (IS_DEV && !this.unknownWarned.has(type)) {
      this.unknownWarned.add(type);
      console.warn(
        `[EnemyMirror] No 3D look for enemy type "${type}"; drawing a placeholder.`
      );
    }
    return 'unknown';
  }

  /**
   * `view` as it should burn: a rock gives its instance back (to the pool)
   * and a plain rock mesh takes over its pose and look; any other view
   * burns itself.
   */
  burnOf(view) {
    if (view.kind !== 'asteroid') return view;
    const burn = this.acquire('asteroid-burn');
    this.rockViews.dressBurn(burn, view);
    this.pool(view);
    return burn;
  }

  /**
   * Shadow-pass budget around the camera target (world x, z): see
   * SHADOW_RADIUS. Call after `update`.
   */
  budgetShadows(x, z) {
    const near = (this.shadowNear ??= []);
    near.length = 0;
    const consider = (view) => {
      if (!view?.casters?.length) return;
      const { position } = view.object;
      view.shadowDistance = Math.hypot(position.x - x, position.z - z);
      view.casters.forEach((mesh) => (mesh.castShadow = false));
      // a phased Shade casts none: the depth pass ignores its dissolve
      if (view.shadowDistance <= SHADOW_RADIUS && !view.phased) near.push(view);
    };
    this.views.forEach(consider);
    this.dissolve.slots.forEach((slot) => consider(slot.view));
    near.sort((a, b) => a.shadowDistance - b.shadowDistance);
    let left = SHADOW_CASTERS;
    for (let i = 0; i < near.length && left > 0; i += 1) {
      const { casters } = near[i];
      if (casters.length > left) continue;
      casters.forEach((mesh) => (mesh.castShadow = true));
      left -= casters.length;
    }
  }

  /** Quality preset: baked surface maps on or off (one recompile each). */
  setSurfaceMaps(enabled) {
    const { quality } = this.kit;
    if (enabled === quality.surfaceMaps) return;
    quality.surfaceMaps = enabled;
    this.rockViews.refreshSurfaceMaps();
    this.wardenViews.refreshSurfaceMaps();
  }

  /** Dense Fog, per frame (enemies/rocks.js updateFog); returns its fade. */
  updateFog(dt, on, x, z) {
    return this.rockViews.updateFog(dt, on, x, z);
  }

  createUnknown() {
    const mesh = new this.THREE.Mesh(this.unknownShape, this.kit.darkMaterial);
    this.scene.add(mesh);
    return this.kit.view('unknown', mesh);
  }

  // --- per frame -------------------------------------------------------------

  /** Mirrors `enemies`; returns the Warden view (for its light) or null. */
  update(enemies, time, dt = 0) {
    this.frame += 1;
    this.dissolve.update(dt);
    this.rocks.begin();
    let warden = null;
    for (let i = 0; i < enemies.length; i += 1) {
      const enemy = enemies[i];
      if (!enemy || enemy.destroyed) continue;
      const key = enemy.id || enemy;
      const kind = this.kindOf(enemy.type, enemy.bossKind, enemy.heraldKind);
      let view = this.views.get(key);
      if (view && view.kind !== kind) {
        this.release(key, view);
        view = null;
      }
      if (!view) {
        view = this.acquire(kind);
        view.id = key;
        view.seed = hashId(key);
        this.bind(view, enemy);
        this.views.set(key, view);
      }
      view.stamp = this.frame;
      view.radius = enemy.radius || 12;
      const { object } = view;
      object.position.set(enemy.x - HALF_W, 0, enemy.y - HALF_H);
      const flash = enemy.getHitFlash();
      if (kind === 'asteroid') {
        this.rockViews.updateRock(view, enemy, time, flash);
      } else if (kind.startsWith('boss')) {
        this.wardenViews.updateWarden(view, enemy, time);
        warden = view;
      } else if (kind.startsWith('herald')) {
        this.heraldViews.updateHerald(view, enemy, time, flash);
      } else this.updateMachine(view, enemy, kind, time, flash);
    }

    this.views.forEach((view, key) => {
      if (view.stamp !== this.frame) {
        if (this.dead.delete(key)) this.die(key, view);
        else this.release(key, view);
      }
    });
    if (this.dead.size) this.dead.forEach(this.pruneDead);
    this.rocks.end();
    this.packBatches();
    return warden;
  }

  // The live views' outlines and glows, then the glows of the burning ones,
  // shrinking to nothing over the burn (their outlines go dark at once).
  packBatches() {
    this.rimBatch.begin();
    this.glows.begin();
    this.views.forEach(this.packView);
    const { slots } = this.dissolve;
    for (let i = 0; i < slots.length; i += 1) {
      const { view, age } = slots[i];
      if (view?.glows?.length) {
        this.packGlows(view, Math.max(0, 1 - age / DISSOLVE_SECONDS));
      }
    }
    this.rimBatch.end();
    this.glows.end();
  }

  packLive(view) {
    const { rims, glows } = view;
    if (!rims?.length && !glows?.length) return;
    view.object.updateMatrixWorld();
    for (let i = 0; i < rims.length; i += 1) {
      const { anchor, points, color } = rims[i];
      if (!shown(anchor)) continue;
      this.rimBatch.push(points, anchor.matrixWorld, color || view.rimColor);
    }
    if (glows) this.packGlows(view, 1);
  }

  packGlows(view, scale) {
    const { glows } = view;
    for (let i = 0; i < glows.length; i += 1) {
      const { anchor, tone } = glows[i];
      if (shown(anchor)) this.glows.push(anchor.matrixWorld, tone.color, scale);
    }
  }

  /** The simulation killed `enemy` (asteroid splits excluded). */
  markDead(enemy) {
    this.dead.add(enemy.id || enemy);
  }

  // The view burns in place; a burst of accent chunks flies out (rocks
  // already shed stone debris through EffectsSystem). The Warden's phase
  // breaks have their own pieces: only its final death bursts, bigger, lit.
  die(key, view) {
    this.views.delete(key);
    if (view.phased) this.machineViews.phaseShade(view, 0);
    if (view.telegraph) view.telegraph.group.visible = false;
    if (view.affix) view.affix.group.visible = false;
    const accent = this.kit.accentOf(view);
    this.dissolve.start(this.burnOf(view), accent, view.radius);
    if (view.kind === 'asteroid') return;
    const x = view.object.position.x + HALF_W;
    const y = view.object.position.z + HALF_H;
    if (view.kind.startsWith('boss')) {
      this.bursts.spawn(x, y, view.radius, accent, WARDEN_BURST);
      this.bursts.flash(x, y, accent);
    } else {
      const count = Math.round(view.radius / 2);
      this.bursts.spawn(
        x,
        y,
        view.radius,
        accent,
        Math.max(BURST_MIN, Math.min(BURST_MAX, count))
      );
    }
  }

  // Every machine: its pose, the Elite look and its affixes, then what its
  // own kind lights or moves (enemies/machines.js updateMachine).
  updateMachine(view, enemy, kind, time, flash) {
    const { object } = view;
    object.scale.setScalar(enemy.radius || 12);
    object.rotation.y = -(enemy.rotation || 0);
    this.applyElite(view, enemy.elite === true);
    if (view.eliteRing) view.eliteRing.rotation.y = time * 0.5;
    if (enemy.affixes?.length || view.affix?.group.visible) {
      this.affixViews.updateAffixes(view, enemy, time);
    }
    this.machineViews.updateMachine(view, enemy, kind, time, flash);
  }

  // Elite look and affix badges (enemies/affixes.js).
  applyElite(view, elite) {
    this.affixViews.applyElite(view, elite);
  }

  badgeMaterials() {
    return this.affixViews.badgeMaterials();
  }

  get badges() {
    return this.affixViews.badges;
  }

  // A fresh or pooled view takes its enemy's seed-driven looks: a rock's
  // shape, spin and variant, the Husk's seams, a Warden's parts made whole.
  bind(view, enemy) {
    if (view.kind === 'asteroid') this.rockViews.bindRock(view, enemy);
    else if (view.kind === 'husk') this.machineViews.bindHusk(view);
    else if (view.kind.startsWith('boss')) this.wardenViews.bindWarden(view);
  }

  release(key, view) {
    view.object.visible = false;
    if (view.phased) this.machineViews.phaseShade(view, 0);
    if (view.telegraph) view.telegraph.group.visible = false;
    if (view.affix) view.affix.group.visible = false;
    this.views.delete(key);
    this.pool(view);
  }

  pool(view) {
    let pool = this.pools.get(view.kind);
    if (!pool) {
      pool = [];
      this.pools.set(view.kind, pool);
    }
    pool.push(view);
  }

  clear() {
    this.views.forEach((view, key) => this.release(key, view));
    this.dissolve.clear();
    this.dead.clear();
    this.rocks.clear();
    this.rimBatch.clear();
    this.glows.clear();
  }
}
