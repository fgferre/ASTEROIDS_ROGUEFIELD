// Mirrors EnemySystem entities into Three objects (docs/NORTE.md §3): Ring
// fragments as procedural rock meshes whose cracks light up amber with
// damage (drawn instanced, rockInstances.js), the Wardens' machines (every
// enemy of the content registry, in the look its file picks: a hand-made
// `view`, else one built from its `visual`), the three Wardens (Prime, Choir,
// Null; one view kind each, picked by `bossKind`) and the three Heralds (Dust,
// Heat, Silence, picked by `heraldKind`). Views are pooled per kind and keyed
// by entity id; a view not seen in a frame is hidden and returned to its
// pool, unless its enemy was killed (`markDead`): then it burns away first
// (dissolve.js).
//
// The looks live in visual families under ./enemies/ (rocks, machines,
// recipes, heralds, wardens, affixes; the telegraph and the rock shader are
// parts two families share). Each family is a factory over the toolkit (createKit),
// never the mirror, and returns the create/update functions the mirror
// dispatches to; the mirror keeps pooling, the per-frame loop, binding and
// the toolkit.

import { IS_DEV } from '../../core/env.js';
import { PALETTE } from '../../data/constants/palette.js';
import { ELITE_AFFIXES } from '../../data/enemies/affixes.js';
import { getContent, listContent } from '../../content/registry.js';
import { HERALD_KINDS } from '../../data/enemies/herald.js';
import { HALF_H, HALF_W, colorOf } from './batches.js';
import { DISSOLVE_SECONDS, DissolvePool } from './dissolve.js';
import { createAffixViews } from './enemies/affixes.js';
import { createHeraldViews } from './enemies/heralds.js';
import { createMachineViews } from './enemies/machines.js';
import { createRecipeViews } from './enemies/recipes.js';
import { VARIANT_LOOKS, createRockViews } from './enemies/rocks.js';
import { createTelegraphs } from './enemies/telegraph.js';
import { aim, arcSweep, revolve, sweep } from './enemies/shapes.js';
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
// Enemy types with a look: the rocks, every enemy of the content registry
// (its id is its view kind) and the Wardens.
export const KNOWN_KINDS = new Set([
  'asteroid',
  ...listContent('enemies').map(({ id }) => id),
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
 * - circleRim, sphere, smallSphere, warnRing, ghostDisc, fuseRing: the
 *   geometries two or more families draw; frontalPlate(halfArc): a frontal
 *   plate's { plate, edge } geometries for that arc (the plate drawn in
 *   machineMaterial), bulwarkPlate and bulwarkEdge those of the Shielded
 *   affix;
 * - view, emissive, setGain, tone, rim, glow, merged, body: the view helpers
 *   (a view record, accent tones, batched outline/glow anchors, one merged
 *   matte body per look); accentOf: a view's accent colour;
 * - createTelegraph, updateTelegraph: field-plane telegraphs
 *   (enemies/telegraph.js), for the Ram, the Wardens and recipe enemies
 *   that aim.
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
  // The static matte parts of a machine, merged per look (mergeStatic):
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

  // A frontal plate (±halfArc) and its energy edge, one pair per arc: an
  // enemy with a `frontal-shield` draws the arc its recipe sets, and the
  // Shielded affix the one in ELITE_AFFIXES. Armour on every side, within r
  // 0.8–1.02: a dark core slab faced with lit panels (each with a raised
  // second layer, riveted) over a ledge, a lit crest cap, round bolsters at
  // its ends, ribs and a mounting rail on its back (the Bulwark's braces
  // land on it), a skid under it; its tones ride in vertex colours
  // (machineMaterial). The edge is the light: a tube along the crest's front
  // edge and a seam in each gap between the panels.
  const plates = new Map();
  function frontalPlate(half) {
    if (!plates.has(half)) {
      plates.set(half, {
        plate: mergeStatic(THREE, plateParts(half)),
        edge: mergeStatic(THREE, plateEdgeParts(half)),
      });
    }
    return plates.get(half);
  }
  // sections (r, y): the core's front face runs (0.975, -0.12)–(0.955,
  // 0.25), a panel's outer face (1.01, -0.095)–(0.99, 0.2)
  const PLATE_CORE = [
    0.975, -0.12, 0.955, 0.25, 0.925, 0.29, 0.84, 0.29, 0.81, 0.255, 0.8, -0.08,
    0.83, -0.145, 0.95, -0.155,
  ];
  const PLATE_PANEL = [
    0.97, -0.11, 1.0, -0.105, 1.01, -0.08, 0.99, 0.2, 0.975, 0.222, 0.945,
    0.222,
  ];
  // the second layer on each panel, and the ledge under the panels
  const PLATE_BOSS = [0.998, -0.048, 1.016, -0.036, 1.005, 0.14, 0.99, 0.158];
  const PLATE_LEDGE = [
    0.972, -0.13, 1.006, -0.124, 1.014, -0.14, 1.0, -0.165, 0.962, -0.165,
  ];
  const PLATE_CAP = [0.918, 0.28, 0.912, 0.31, 0.856, 0.31, 0.84, 0.28];
  const PLATE_RIB = [
    0.805, -0.1, 0.805, 0.24, 0.786, 0.22, 0.772, 0.15, 0.772, -0.05, 0.786,
    -0.09,
  ];
  const PLATE_SKID = [0.935, -0.15, 0.92, -0.18, 0.86, -0.18, 0.845, -0.14];
  const PLATE_GAP = 0.05; // radians between two panels
  const plateSteps = (span) => Math.max(1, Math.round(span * 16));
  // a round tube of `radius` along the arc at (r, y), its ends capped
  function plateTube(r, y, radius, from, to) {
    const steps = plateSteps(to - from);
    const path = Array.from({ length: steps + 1 }, (_, i) => {
      const a = from + ((to - from) * i) / steps;
      return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    });
    const section = (i, a) => [Math.cos(a) * radius, Math.sin(a) * radius];
    return sweep(THREE, path, section, 6, { capped: true });
  }
  // the panels' [from, to] angles over ±half
  function platePanels(half) {
    const end = half - 0.07;
    const count = Math.max(1, Math.round((2 * end) / 0.65));
    const width = (2 * end - (count - 1) * PLATE_GAP) / count;
    return Array.from({ length: count }, (_, i) => {
      const from = -end + i * (width + PLATE_GAP);
      return [from, from + width];
    });
  }

  function plateParts(half) {
    const { hull, dark } = tones;
    const along = (section, from, to, color) => ({
      geometry: arcSweep(THREE, section, plateSteps(to - from), {
        from,
        span: to - from,
      }),
      color,
    });
    const out = (a) => new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const rivet = new THREE.CylinderGeometry(0.011, 0.014, 0.02, 6);
    const rivetAt = (a, r, y, lean) =>
      aim(
        THREE,
        rivet.clone(),
        out(a).multiplyScalar(Math.cos(lean)).setY(Math.sin(lean)),
        out(a).multiplyScalar(r).setY(y)
      );
    const panels = platePanels(half);
    const parts = [
      along(PLATE_CORE, -half, half, dark),
      along(PLATE_CAP, -half + 0.05, half - 0.05, hull),
      along(PLATE_SKID, -half + 0.08, half - 0.08, dark),
      // the mounting rail across the back, at the braces' height
      {
        geometry: plateTube(0.792, 0.13, 0.02, -half + 0.08, half - 0.08),
        color: dark,
      },
      along(PLATE_LEDGE, -half + 0.05, half - 0.05, hull),
      ...panels.flatMap(([from, to]) => [
        along(PLATE_PANEL, from, to, hull),
        along(PLATE_BOSS, from + 0.1, to - 0.1, hull),
      ]),
    ];
    // the bolsters capping each end
    const bolster = revolve(
      THREE,
      [0, 0.33, 0.045, 0.326, 0.066, 0.3, 0.066, -0.13, 0.05, -0.165, 0, -0.17],
      10,
      { start: 'flat', end: 'flat' }
    );
    [-1, 1].forEach((side) => {
      const a = side * (half - 0.035);
      parts.push({
        geometry: bolster,
        color: hull,
        position: [Math.cos(a) * 0.89, 0, Math.sin(a) * 0.89],
      });
    });
    // ribs on the back between the bolsters, a rivet on the cap over each
    const ribs = Math.max(2, Math.round(half * 4));
    for (let i = 0; i <= ribs; i += 1) {
      const a = -half + 0.16 + ((2 * half - 0.32) * i) / ribs;
      parts.push(along(PLATE_RIB, a - 0.018, a + 0.018, dark), {
        geometry: rivetAt(a, 0.884, 0.31, Math.PI / 2),
        color: dark,
      });
    }
    // a rivet at each panel's corners, on its outer face (it leans back
    // 0.068 rad)
    panels.forEach(([from, to]) =>
      [from + 0.07, to - 0.07].forEach((a) =>
        parts.push(
          { geometry: rivetAt(a, 1.006, -0.05, 0.068), color: dark },
          { geometry: rivetAt(a, 0.993, 0.16, 0.068), color: dark }
        )
      )
    );
    return parts;
  }

  // the light: a tube on the crest's front edge, a seam in each panel gap
  function plateEdgeParts(half) {
    const parts = [
      { geometry: plateTube(0.944, 0.272, 0.028, -half + 0.04, half - 0.04) },
    ];
    const seam = new THREE.BoxGeometry(0.02, 0.29, 0.016);
    seam.rotateZ(0.054); // up the core's leaning face
    platePanels(half)
      .slice(1)
      .forEach(([from]) => {
        const a = from - PLATE_GAP / 2;
        parts.push({
          geometry: seam,
          position: [Math.cos(a) * 0.968, 0.06, Math.sin(a) * 0.968],
          rotationY: -a,
        });
      });
    return parts;
  }
  const { plate: bulwarkPlate, edge: bulwarkEdge } = frontalPlate(
    ELITE_AFFIXES.shielded.halfArc
  );

  // The Caster's fill; Volatile fuse and Caster rings.
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

  // One merged geometry per name, shared by every view that draws it.
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
    frontalPlate,
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
    this.recipeViews = createRecipeViews(this.kit);
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
        return this.createEnemy(kind);
    }
  }

  /**
   * An enemy of the content registry in the look its file picks: `view`
   * names a hand-made one (enemies/machines.js), else it is built from its
   * `visual` (enemies/recipes.js; the default look without one). The view
   * keeps its look, for the per-frame update and the bind.
   */
  createEnemy(kind) {
    const enemy = getContent('enemies', kind);
    if (!enemy) return this.createUnknown();
    const look = enemy.view
      ? this.machineViews.views[enemy.view]
      : this.recipeViews.lookOf(enemy.visual);
    if (!look) {
      throw new Error(
        `[EnemyMirror] ${kind}: no hand-made view '${enemy.view}'`
      );
    }
    const view = look.create(kind);
    view.look = look;
    return view;
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
      } else this.updateMachine(view, enemy, time, flash);
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
  // own look lights or moves.
  updateMachine(view, enemy, time, flash) {
    const { object } = view;
    object.scale.setScalar(enemy.radius || 12);
    object.rotation.y = -(enemy.rotation || 0);
    this.applyElite(view, enemy.elite === true);
    if (view.eliteRing) view.eliteRing.rotation.y = time * 0.5;
    if (enemy.affixes?.length || view.affix?.group.visible) {
      this.affixViews.updateAffixes(view, enemy, time);
    }
    view.look?.update?.(view, enemy, time, flash);
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
  // shape, spin and variant, a Warden's parts made whole, what a machine's
  // look takes from it (the Husk's seams).
  bind(view, enemy) {
    if (view.kind === 'asteroid') this.rockViews.bindRock(view, enemy);
    else if (view.kind.startsWith('boss')) this.wardenViews.bindWarden(view);
    else view.look?.bind?.(view);
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
