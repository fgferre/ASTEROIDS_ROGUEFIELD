// The player hull in 3D (docs/NORTE.md §3): the ship hullModel.js builds
// from the hull's art data (lofted fuselage, airfoil wings that grow with
// the RCS upgrade, tail fins, nacelles, intakes, pods, canopy, edge lines,
// turret), in three vertex-coloured finishes (satin paint and glossier
// accent panels with baked panel maps, polished steel) under a cyan fresnel
// rim, with a dark glass canopy, cached per hull and upgrade levels. The only
// strong light is the thrusters (hull accent: cyan Interceptor, amber Solar
// Slicer): glowing throats, cones with a white core that stretch with
// thrust, turn-jet needles at the RCS ports, retro flames at the nose, a
// point light and a ribbon trail. Dash afterimages, the invulnerability
// blink and the shield impact flash mirror the 2D PlayerSystem render. In
// the modern scheme the dorsal turret turns on its own to the simulation's
// turret heading; its barrel tips sit on the sim's muzzle point. With the
// cannon on the nose (the new flight) a short cannon set into the nose tip
// stands in for it, its muzzle on the sim's too. With
// multi-lock (Targeting Matrix rank 3) thin layers stack on its axis, one per
// lock past the primary, each turned to its own sim heading.

import {
  DASH_GHOST_COUNT,
  DASH_GHOST_LIFE,
} from '../../data/constants/gameplay.js';
import { PALETTE } from '../../data/constants/palette.js';
import {
  SHIP_HEADING_TURN_RATE,
  SHIP_MAX_SPEED,
  SHIP_ROTATION_SPEED,
  TURRET_PIVOT_X,
} from '../../data/constants/physics.js';
import { ALL_HULLS } from '../../data/shipModels.js';
import { getHullThrusterPort } from '../player/hullShape.js';
import { bakeHullMaps } from './bakedMaps.js';
import { DissolvePool } from './dissolve.js';
import {
  CANOPY_GLASS,
  HULL_FINISHES,
  NOZZLE_HEIGHT,
  SPECULAR_CAP_GLSL,
  VISUAL_SCALE,
  buildHullModel,
  buildTurret,
  buildTurretLayer,
  edgeLines,
  hullTones,
  seatNoseGun,
  seatTurret,
  throatGeometry,
} from './hullModel.js';
import { addRimLight } from './rimLight.js';
import { HALF_H, HALF_W, colorOf, rgbOf } from './batches.js';

const TRAIL_MIN = 12;
const TRAIL_LENGTH = 22;
// proposta 17/11 (efeito/impacto): the ship's death breaks it into SHIP_PIECES
// of its own build, thrown as a machine of SHIP_BREAK_RADIUS would be.
const SHIP_PIECES = 14;
const SHIP_BREAK_RADIUS = 18;
// Banking (PLAN.md R5.9, proposta 18/10): roll into the modern strafe (the
// nose swinging onto the move) and the yaw rate, eased with a time constant so it saturates and relaxes smoothly.
// Both come from the simulation (input, angular velocity), never from the
// interpolated pose.
const BANK_STRAFE = (22 * Math.PI) / 180;
const BANK_YAW = (8 * Math.PI) / 180;
const BANK_SMOOTH_S = 0.18;
// The main flame (proposta 16/11, the owner's pick from mock-ups).
// Propulsors card: each level makes the flame longer and tighter, the core
// longer and hotter, steadier; from SHOCK_LEVEL pressure diamonds ride along
// it. The hue never changes.
const LEVEL_LENGTH = 0.2; // + flame length per level
const LEVEL_TIGHTEN = 0.1; // − flame width per level
const LEVEL_CORE = 0.04; // + the core's share of the flame per level
const LEVEL_THIN = 0.07; // − core opacity per level: a thinner, sharper line
const LEVEL_DIM = 0.09; // − flame-body brightness per level: more nozzles, never a blob
const LEVEL_STEADY = 0.014; // − flicker per level
const SHOCK_LEVEL = 5;
const SHOCK_AT = [0.3, 0.5, 0.68]; // along the flame, nozzle to tip
// Start burst: pilot thrust while the speed along the nose is far below
// cruise overshoots; in play the cruise flame is CRUISE_SCALE of the
// journey's (travelScene.js), which has no start.
const CRUISE_SCALE = 0.75;
const BURST_LENGTH = 1.1; // + length at full burst
const BURST_WIDTH = 0.35; // + width at full burst
const BURST_HEAT = 0.5; // + core brightness at full burst
const BURST_FROM = 0.25; // share of cruise speed: full burst below,
const BURST_TO = 0.7; // none past
// Each hull's flame proportions: `flame: { length, width }` in its visual.
// Low-hull sputter: from SPUTTER_FROM of the hull down to SPUTTER_FULL the
// flame flickers unevenly, cuts out for a frame or two and the nozzles spit
// embers, also at rest.
const SPUTTER_FROM = 0.33;
const SPUTTER_FULL = 0.15;
const SPUTTER_FLICKER = 0.45; // flicker depth at full sputter
const SPUTTER_HZ = 30; // cut-out slots per second
const SPUTTER_CUT = [0.02, 0.24]; // the engine's cut chance per slot
const SPUTTER_EMBERS = 6;
const EMBER_LIFE = 0.5; // seconds

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// Deterministic 0..1 noise for the render (never the sim's RNG).
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// The nose jets' puffs, a share of the wingtip ones (proposta 15/11).
const NOSE_PUFF = 0.8;
// The side jets (proposta 16/11, the owner's pick from mock-ups).
// The turn jets as dry needles with a white-hot root that snap on and off
// with the turn; the RCS System level shows in the shape (longer and
// thinner, a twin needle from 3, an ignition snap at 5).
const RCS_HOLD_S = 0.05; // a lit needle stays at least this long
const RCS_FADE_S = 0.03; // then drops out this fast
const RCS_SNAP_S = 0.09; // level 5: the bright snap at the port on ignition
// Without the card the needle is 2.5 times today's level-0 length and a
// little brighter (the owner's pick 16/11, glide turns lasted unseen); the
// levels never draw it shorter.
const RCS_MIN_LENGTH = 11.25;
const RCS_GLOW = 1.3;
// A brake at the front: a pair of retro flames blowing forward from the
// nose, lit by the retro (reversal, coast brake), stronger and wider per
// Braking System level; at 3 the emergency brake flares a hard forward fan.
const RETRO_FLARE_S = 0.4;
// The fan and the flames stop growing at 2 (the owner's pick 16/11: the
// level-3 brake drew too big; the fan is 0.55 of its first size).
const FLARE_RAYS = [33, 23, 14.3]; // the fan's reach, middle ray out (field units)
const TURN_KEYS = ['turnL', 'turnR'];
// Each shot pushes the hull back along the nose for the muzzle frames.
const RECOIL_DIP = 2;
// Dash i-frames: brighter cyan rim and a thin ring (proposta 18/10), its
// band from DASH_RING_INNER to 1 of its radius.
const DASH_RIM_BOOST = 3;
const DASH_RING_OPACITY = 0.55;
const DASH_RING_INNER = 0.94;
const BLINK_HZ = 8;
const GHOST_ALPHA = 0.5;
// proposta 17/10: each shot bumps the ship light for a couple of frames.
const MUZZLE_LIGHT = 1.6;
// Recoil of the barrels along the turret axis per shot (field units).
const TURRET_RECOIL = 1.2;
const MUZZLE_LIGHT_FRAMES = 2;
// A turret layer's recoil after its shot: as long as the turret's own (two
// flash frames, then the light frames).
const LAYER_RECOIL_FRAMES = MUZZLE_LIGHT_FRAMES + 1;
// Baked panel maps (bakedMaps.js): one texture tile per HULL_TILE hull units
// (the hull's UVs are planar, in hull units). proposta 18/10: strengths.
const HULL_TILE = 16;
const HULL_NORMAL_SCALE = 0.5;
const HULL_AO = 0.8;
const HULL_MAP_SEED = 3131.9;

// The specular cap (hullModel.js), then the cyan fresnel rim on the hull (a
// tight band on the silhouette against the dark field) plus the white
// invulnerability pulse, both as emissive; the pulse is weighted to the rim
// so the panels stay readable while it blinks.
function patchHull(shader) {
  const { uRim, uBlink } = this.userData;
  shader.uniforms.uRim = uRim;
  shader.uniforms.uBlink = uBlink;
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      '#include <common>\nuniform vec3 uRim;\nuniform float uBlink;'
    )
    .replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>${SPECULAR_CAP_GLSL}`
    )
    .replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float rim = 1.0 - max(dot(normal, normalize(vViewPosition)), 0.0);
      totalEmissiveRadiance += uRim * pow(rim, 5.0) + vec3(uBlink * (0.25 + rim));`
    );
}

// The dash ring turns to face the camera about the ship: a ring of light
// around it from any angle, never an edge (its radius is the mesh's scale).
const DASH_RING_VERTEX = `
varying vec2 vPos;
void main() {
  vPos = position.xy;
  vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 corner = position.xy * length(modelMatrix[0].xyz);
  gl_Position = projectionMatrix * (centre + vec4(corner, 0.0, 0.0));
}`;

const DASH_RING_FRAGMENT = `
uniform vec3 uColor;
varying vec2 vPos;
void main() {
  float r = length(vPos);
  float aa = fwidth(r);
  float inner = ${DASH_RING_INNER.toFixed(2)};
  float band = smoothstep(inner - aa, inner + aa, r)
    * (1.0 - smoothstep(1.0 - aa, 1.0, r));
  gl_FragColor = vec4(uColor * band, 1.0);
}`;

// The turn jets and retro flames: a cone along -x from its base at the
// origin (like the flames' `cone`), vertex-coloured white-hot at the base,
// the hull's accent along its length and dark at the tip. Repainted per hull.
function needleGeometry(THREE) {
  const needle = new THREE.ConeGeometry(1, 1, 10, 8, true);
  needle.rotateZ(Math.PI / 2);
  needle.translate(-0.5, 0, 0);
  const count = needle.getAttribute('position').count;
  needle.setAttribute(
    'color',
    new THREE.BufferAttribute(new Float32Array(count * 3), 3)
  );
  needle.userData.cached = true;
  return needle;
}

function paintNeedle(needle, accent) {
  const position = needle.getAttribute('position');
  const color = needle.getAttribute('color');
  for (let i = 0; i < position.count; i += 1) {
    const t = Math.min(1, Math.max(0, -position.getX(i))); // 0 root, 1 tip
    const hot = Math.max(0, 1 - t / 0.28) ** 2 * 1.6;
    const body = 1.6 * (1 - t) ** 1.4;
    color.setXYZ(
      i,
      accent.r * body + hot,
      accent.g * body + hot,
      accent.b * body + hot
    );
  }
  color.needsUpdate = true;
}

// Hull and visual-upgrade levels: what the built geometry depends on.
function hullKeyOf(hull, levels) {
  return `${hull.id}|${levels.thruster}|${levels.rcs}|${levels.braking}`;
}

export class PlayerMirror {
  constructor(THREE, scene, seeded) {
    this.THREE = THREE;
    this.seeded = seeded;
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    this.ship = new THREE.Group();
    this.group.add(this.ship);
    scene.add(this.group);
    // the ship's death: its own burn (startBreak)
    this.burn = new DissolvePool(THREE, seeded, () => this.endBreak());
    this.breakView = { object: this.group, seed: 7, radius: SHIP_BREAK_RADIUS };
    this.breakHidden = [];
    this.breaking = false;
    this.wasDead = false;

    // One material per finish (HULL_FINISHES: satin paint, glossy accents,
    // polished steel); the tones ride in the vertex colours, the paint and
    // the accents carry the baked panel maps. All take the rim and blink.
    const rim = { value: colorOf(THREE, PALETTE.player).multiplyScalar(0.45) };
    const blink = { value: 0 };
    const maps = bakeHullMaps(THREE, HULL_MAP_SEED);
    Object.values(maps).forEach((map) =>
      map.repeat.set(1 / HULL_TILE, 1 / HULL_TILE)
    );
    this.hullMaterials = HULL_FINISHES.map((finish) => {
      const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        ...finish,
      });
      material.userData.uRim = rim;
      material.userData.uBlink = blink;
      material.onBeforeCompile = patchHull;
      return addRimLight(material);
    });
    // the painted finishes: the ones with the panel maps
    this.mappedMaterials = this.hullMaterials.slice(0, 2);
    this.mappedMaterials.forEach((material) =>
      Object.assign(material, maps, {
        normalScale: new THREE.Vector2(HULL_NORMAL_SCALE, HULL_NORMAL_SCALE),
        aoMapIntensity: HULL_AO,
      })
    );
    this.hullMaterial = this.hullMaterials[0];
    this.tones = hullTones(THREE);
    // hull key → { hull, ghost, canopy, edges, tips, deckY }, kept for the
    // session
    this.hullCache = new Map();
    this.hullMaps = maps;
    this.surfaceMaps = true;
    this.blink = blink;
    this.blinkHeldUntil = -Infinity;
    const { glow: canopyGlow, ...glass } = CANOPY_GLASS;
    this.canopyMaterial = addRimLight(
      new THREE.MeshStandardMaterial({
        color: colorOf(THREE, PALETTE.rockShadow),
        emissive: colorOf(THREE, PALETTE.player).multiplyScalar(canopyGlow),
        ...glass,
      })
    );
    this.edgeMaterial = new THREE.LineBasicMaterial({
      color: colorOf(THREE, PALETTE.player).multiplyScalar(0.7),
      toneMapped: false,
    });
    this.bladeEdgeMaterial = new THREE.LineBasicMaterial({ toneMapped: false });
    const glow = () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
    this.flameMaterial = glow();
    this.coreMaterial = glow();
    this.nozzleMaterial = glow();
    this.accent = new THREE.Color();
    this.warmLight = new THREE.Color(1, 0.85, 0.7);

    const cone = new THREE.ConeGeometry(1, 1, 12, 1, true);
    cone.rotateZ(Math.PI / 2);
    cone.translate(-0.5, 0, 0);
    this.cone = cone;
    // a lozenge for the shock diamonds and the sputter embers
    this.diamond = new THREE.OctahedronGeometry(1, 0);
    this.diamond.userData.cached = true;
    this.shockMaterial = glow();
    this.emberMaterial = glow();
    this.flameShape = { length: 1, width: 1 };
    this.embers = [];

    this.light = new THREE.PointLight(
      colorOf(THREE, PALETTE.player),
      0,
      150,
      2
    );
    this.group.add(this.light);
    // A dark stand-in, on only while the ship is hidden (a blink, a death):
    // the lit programs are keyed on the count of lights shown, so without
    // it hiding the ship recompiles every lit material mid-play.
    this.standIn = new THREE.PointLight(0x000000, 0, 1, 2);
    this.standIn.visible = false;
    scene.add(this.standIn);

    this.muzzleFrames = 0;
    this.bank = 0;
    this.bankTime = null;

    this.rim = rim.value;
    this.rimRgb = rim.value.clone();
    this.dashRimRgb = rim.value.clone().multiplyScalar(DASH_RIM_BOOST);
    this.dashRing = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: {
            value: colorOf(THREE, PALETTE.player).multiplyScalar(
              1.6 * DASH_RING_OPACITY
            ),
          },
        },
        vertexShader: DASH_RING_VERTEX,
        fragmentShader: DASH_RING_FRAGMENT,
        extensions: { derivatives: true },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.dashRing.visible = false;
    this.group.add(this.dashRing);

    this.ghosts = [];
    for (let i = 0; i < DASH_GHOST_COUNT; i += 1) {
      const ghost = new THREE.Mesh(
        new THREE.BufferGeometry(),
        new THREE.MeshBasicMaterial({
          color: colorOf(THREE, PALETTE.player),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        })
      );
      ghost.visible = false;
      ghost.rotation.order = 'YXZ';
      ghost.scale.setScalar(VISUAL_SCALE);
      scene.add(ghost);
      this.ghosts.push(ghost);
    }
    this.ghostRgb = colorOf(THREE, PALETTE.player);
    // afterimages dropped while the ship was hidden (Blink): never drawn, so
    // the hidden stretch of the dash leaves a gap
    this.hiddenGhosts = new WeakSet();
    this.dashGuard = false;

    this.hullKey = null;
    this.flames = [];
    this.puffs = [];
    // The turn jets and retro flames: one needle geometry, white materials
    // tinted by its vertex colours; one per turn side so a fading needle and
    // a fresh one on the other flank keep their own strength.
    this.needle = needleGeometry(THREE);
    const tinted = () => {
      const material = glow();
      material.vertexColors = true;
      return material;
    };
    this.rcsJets = {
      turnL: { amount: 0, hold: 0, snap: 0, material: tinted() },
      turnR: { amount: 0, hold: 0, snap: 0, material: tinted() },
    };
    TURN_KEYS.forEach((k) =>
      this.rcsJets[k].material.color.setScalar(RCS_GLOW)
    );
    this.snapMaterial = tinted();
    this.retroMaterial = tinted();
    this.flareMaterial = tinted();
    this.retros = [];
    // the emergency brake's fan, in field space along the motion it stops
    // (the nose may have swung away by then); rays from the middle out
    this.flareFan = new THREE.Group();
    [0, -1, 1, -2, 2].forEach((ray) => {
      const mesh = new THREE.Mesh(this.needle, this.flareMaterial);
      mesh.rotation.y = Math.PI + ray * 0.42;
      mesh.userData.ray = Math.abs(ray);
      this.flareFan.add(mesh);
    });
    this.flareFan.visible = false;
    scene.add(this.flareFan);
    this.flareReady = false;
    this.flareDirX = 1;
    this.flareDirY = 0;
    this.flare = 0;
    this.braking = false;
    this.flareMaterial.color.setScalar(1.5);
    this.fxTime = null;
    this.trailX = new Float32Array(TRAIL_LENGTH);
    this.trailY = new Float32Array(TRAIL_LENGTH);
    this.trailCount = 0;
    this.trailHead = 0;
    this.thrustRgb = rgbOf(THREE, PALETTE.player);
    // The turret, in the hull finishes; rebuild() seats it on each hull.
    this.turretParts = buildTurret(THREE, this.hullMaterials, this.tones);
    ({
      group: this.turret,
      housing: this.turretHousing,
      housingLow: this.turretHousingLow,
      barrels: this.barrels,
    } = this.turretParts);
    this.group.add(this.turret);
    // Multi-lock layers, built on first need and kept; the stack sits on the
    // turret's seat, lowered with its barrels on the low collar.
    this.layerStack = new THREE.Group();
    this.group.add(this.layerStack);
    this.layers = [];
    this.lineOrigin = new THREE.Vector3();
  }

  // Rebuilds the meshes when the hull or its visual-upgrade levels change.
  build(player, levels) {
    const hull = player.currentHull;
    const key = hullKeyOf(hull, levels);
    if (key === this.hullKey) return this.geometry;
    this.hullKey = key;
    return this.seeded(() => this.rebuild(player, hull, levels));
  }

  /**
   * Loading-screen warm-up (Renderer3D.warmUp): builds every hull once for
   * `compile`; the next update() rebuilds the live one.
   */
  warm(player, compile) {
    const levels = player.getHullVisualLevels();
    ALL_HULLS.forEach((hull) => {
      this.seeded(() => this.rebuild(player, hull, levels));
      compile();
      // and as it breaks (the death's twins)
      this.startBreak(player);
      compile();
      this.burn.clear();
      this.group.visible = true;
    });
    this.hullKey = null;
  }

  rebuild(player, hull, levels) {
    const { THREE } = this;
    const geometry = player.getHullGeometry(hull, levels);
    this.geometry = geometry;

    this.ship.children.slice().forEach((child) => {
      this.ship.remove(child);
      if (child.geometry !== this.cone && !child.geometry.userData.cached) {
        child.geometry.dispose();
      }
    });
    this.flames = [];
    this.puffs = [];
    this.embers = [];
    this.retros = [];
    this.flareReady = false;

    // Thrusters take the hull's accent (amber Solar Slicer); the rim and
    // edges stay player cyan.
    this.accent = colorOf(THREE, geometry.accent);
    this.thrustRgb = rgbOf(THREE, geometry.accent);
    this.shockMaterial.color
      .copy(this.accent)
      .lerp(this.warmLight, 0.6)
      .multiplyScalar(1.5);
    this.emberMaterial.color
      .copy(this.accent)
      .lerp(this.warmLight, 0.5)
      .multiplyScalar(1.6);
    this.flameShape = hull.visual.flame;
    this.bladeEdgeMaterial.color.copy(this.accent).multiplyScalar(1.3);

    const key = hullKeyOf(hull, levels);
    if (!this.hullCache.has(key)) {
      const model = buildHullModel(THREE, geometry, this.tones);
      model.hull.userData.cached = true;
      model.canopy.userData.cached = true;
      this.hullCache.set(key, model);
    }
    const built = this.hullCache.get(key);
    this.built = built;
    this.seatGun(player.noseAim, hull);

    const lines = {
      edge: this.edgeMaterial,
      bladeEdge: this.bladeEdgeMaterial,
    };
    edgeLines(THREE, built, lines).forEach((line) => this.ship.add(line));
    this.ship.add(new THREE.Mesh(built.canopy, this.canopyMaterial));

    geometry.nozzles.forEach((nozzle) => {
      // Hot throat: a glowing lens in the bell's mouth, lit even at idle.
      const throat = new THREE.Mesh(
        throatGeometry(THREE, nozzle),
        this.nozzleMaterial
      );
      const flame = new THREE.Mesh(this.cone, this.flameMaterial);
      const core = new THREE.Mesh(this.cone, this.coreMaterial);
      flame.position.set(nozzle.exitX, NOZZLE_HEIGHT, nozzle.y);
      core.position.copy(flame.position);
      this.ship.add(throat, flame, core);
      const shocks = [];
      if (levels.thruster >= SHOCK_LEVEL) {
        SHOCK_AT.forEach(() => {
          const shock = new THREE.Mesh(this.diamond, this.shockMaterial);
          shock.position.copy(flame.position);
          this.ship.add(shock);
          shocks.push(shock);
        });
      }
      this.flames.push({ flame, core, shocks, r: nozzle.r, x: nozzle.exitX });
    });
    for (let i = 0; i < SPUTTER_EMBERS; i += 1) {
      const ember = new THREE.Mesh(this.diamond, this.emberMaterial);
      ember.visible = false;
      this.ship.add(ember);
      this.embers.push(ember);
    }

    // The turn couple (thrusters.js), blowing outboard: a wingtip needle at
    // each aft RCS port, lit when the nose swings away from its flank, and a
    // smaller one at each nose port (the hull's 2D spark port), lit when the
    // nose swings toward the other flank.
    paintNeedle(this.needle, this.accent);
    // the wingtip on the port flank and the starboard nose jet turn the nose
    // to port
    geometry.rcsPorts.forEach((port, i) =>
      this.addNeedles(built.tips[i], port.y < 0, 1, port.y < 0, levels.rcs)
    );
    ['noseLeft', 'noseRight'].forEach((kind) => {
      const { x, y } = getHullThrusterPort(kind, hull);
      this.addNeedles(
        [x / VISUAL_SCALE, NOZZLE_HEIGHT, y / VISUAL_SCALE],
        y < 0,
        NOSE_PUFF,
        y >= 0,
        levels.rcs
      );
    });
    this.addRetros(hull, levels.braking);

    const hullMesh = new THREE.Mesh(built.hull, this.hullMaterials);
    hullMesh.name = 'hull';
    this.ship.add(hullMesh);
    this.ghosts.forEach((ghost) => {
      ghost.geometry = built.ghost;
    });

    this.ship.scale.setScalar(VISUAL_SCALE);
    this.light.position.set(
      (geometry.minNozzleX - 6) * VISUAL_SCALE,
      (NOZZLE_HEIGHT + 4) * VISUAL_SCALE,
      0
    );
    this.shieldRadius = geometry.extent * 1.7;
    this.dashRing.scale.setScalar(geometry.extent * 1.3);
    return geometry;
  }

  /** Mirrors the player; feeds its thruster trail into `ribbons`. */
  /** No hurt blink until `time` s: the shield took the hit whole. */
  holdBlink(time) {
    this.blinkHeldUntil = time;
  }

  /**
   * The ship's death (docs/NORTE.md: every hit is physical): its solid parts
   * come apart into the pieces of its own build and burn away (the machines'
   * break, dissolve.js), carried by its momentum; its flames, glows and light
   * go out at once.
   */
  startBreak(player) {
    this.breaking = true;
    this.light.intensity = 0;
    this.blink.value = 0;
    this.flareFan.visible = false;
    this.hideGhosts();
    this.group.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = false;
      const material = [].concat(node.material)[0];
      const solid = material?.isMeshStandardMaterial && !material.transparent;
      if (solid || !node.visible) return;
      node.visible = false;
      this.breakHidden.push(node);
    });
    const v = player.velocity || {};
    this.burn.start(this.breakView, this.accent, SHIP_BREAK_RADIUS, {
      count: SHIP_PIECES,
      pushX: v.vx || 0,
      pushZ: v.vy || 0,
    });
  }

  // The burn's end (or a new run during it): the glows come back for the
  // next ship.
  endBreak() {
    this.breaking = false;
    this.breakHidden.forEach((node) => (node.visible = true));
    this.breakHidden.length = 0;
  }

  /** `worldDt`: the world's step in s (slow motion included), for the death's break. */
  update(player, ribbons, time, worldDt = 0) {
    const dead = Boolean(player?.isDead);
    if (dead && !this.wasDead && this.group.visible && !this.breaking) {
      this.startBreak(player);
    }
    this.wasDead = dead;
    if (this.breaking) {
      if (dead) {
        this.burn.update(worldDt);
        return;
      }
      this.burn.clear();
    }
    const hidden =
      !player ||
      player.isDead ||
      player._quitExplosionHidden ||
      !player.currentHull?.visual;
    this.group.visible = !hidden;
    this.standIn.visible = hidden;
    if (hidden) {
      this.light.intensity = 0;
      this.trailCount = 0;
      player?.dashGhosts?.forEach((ghost) => this.hiddenGhosts.add(ghost));
      this.hideGhosts();
      this.flareFan.visible = false;
      return;
    }
    const levels = player.getHullVisualLevels();
    const geometry = this.build(player, levels);
    const thrust = player.updateThrusterVisual();
    const { x, y } = player.position;
    const angle = player.angle || 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    this.group.position.set(x - HALF_W, 0, y - HALF_H);
    this.group.rotation.y = -angle;
    // Bank into turns and strafes (the sim stays flat; this is only visual).
    const v = player.velocity || { vx: 0, vy: 0 };
    this.group.rotation.x = this.updateBank(player, time);
    this.ship.position.x = this.muzzleFrames > 0 ? -RECOIL_DIP : 0;
    this.turret.position.x = TURRET_PIVOT_X + this.ship.position.x;
    this.turret.rotation.y = -(player.turretAngle - angle);
    if (player.noseAim !== this.noseGun) {
      this.seatGun(player.noseAim, player.currentHull);
    }
    this.barrels.position.x =
      this.barrelsX + (this.muzzleFrames > 0 ? -TURRET_RECOIL : 0);
    this.updateLayers(player.turretLayers, angle);

    const main = thrust.main || 0;
    this.lightEngines(main, levels.thruster, time, {
      burst: this.startBurst(player, cos, sin),
      hull: player.maxHealth > 0 ? player.health / player.maxHealth : 1,
      cruise: CRUISE_SCALE,
    });
    const dt =
      this.fxTime === null ? 0 : Math.min(0.1, Math.max(0, time - this.fxTime));
    this.fxTime = time;
    this.lightNeedles(player.lastThrusterState, dt);
    this.lightRetros(player, geometry, thrust.aux || 0, dt);
    if (this.muzzleFrames > 0) this.muzzleFrames -= 1;

    // Blink while invulnerable after a hit; the dash's own i-frames, the
    // win's steady guard and a hit the shield took whole (holdBlink) do not.
    const invulnerable = player.invulnerableTimer > 0;
    if (player.dashTimer > 0) this.dashGuard = true;
    else if (!invulnerable) this.dashGuard = false;
    this.blink.value =
      invulnerable &&
      !this.dashGuard &&
      !player.steadyGuard &&
      time >= this.blinkHeldUntil
        ? 0.35 * (1 + Math.sin(time * Math.PI * 2 * BLINK_HZ))
        : 0;
    const dashShield = invulnerable && this.dashGuard;
    this.rim.copy(dashShield ? this.dashRimRgb : this.rimRgb);
    // the shield shell already reads as protection; the ring would sit inside it
    this.dashRing.visible = dashShield && !player.isShieldActive;

    this.updateGhosts(player.dashGhosts);

    // trail: nozzle exit in logical space, oldest first; longer at speed
    const speed = Math.min(1, Math.hypot(v.vx, v.vy) / SHIP_MAX_SPEED);
    const trailMax = Math.round(TRAIL_MIN + (TRAIL_LENGTH - TRAIL_MIN) * speed);
    const exitX = x + geometry.minNozzleX * VISUAL_SCALE * cos;
    const exitY = y + geometry.minNozzleX * VISUAL_SCALE * sin;
    this.trailX[this.trailHead] = exitX;
    this.trailY[this.trailHead] = exitY;
    this.trailHead = (this.trailHead + 1) % TRAIL_LENGTH;
    this.trailCount = Math.min(TRAIL_LENGTH, this.trailCount + 1);
    if (main > 0.02 && this.trailCount > 1) {
      const n = Math.min(this.trailCount, trailMax);
      for (let i = 0; i < n; i += 1) {
        const k = (this.trailHead - n + i + TRAIL_LENGTH) % TRAIL_LENGTH;
        ribbons.px[i] = this.trailX[k];
        ribbons.py[i] = this.trailY[k];
      }
      ribbons.polyline(
        n,
        NOZZLE_HEIGHT * VISUAL_SCALE,
        this.thrustRgb,
        5,
        1.6 * main
      );
    }
  }

  /**
   * The main engines at `main` thrust (0..1), flames longer and tighter with
   * the thruster upgrade `level`; the ship light warmer and brighter under
   * thrust, bumped briefly by each shot. In play `burst` is the start burst
   * (startBurst), `hull` the hull's share left and `cruise` the cruise
   * flame's scale; the journey (travelScene.js) lights them on a ship the
   * simulation holds still, with none of these.
   */
  lightEngines(
    main,
    level = 0,
    time = 0,
    { burst = 0, hull = 1, cruise = 1 } = {}
  ) {
    const kick = burst * main;
    const length =
      (5 + 18 * main * cruise) *
      (1 + LEVEL_LENGTH * level) *
      (1 + BURST_LENGTH * kick) *
      this.flameShape.length;
    const width =
      (1 - LEVEL_TIGHTEN * level) *
      (1 + BURST_WIDTH * kick) *
      this.flameShape.width;
    const coreLength = length * (0.5 + LEVEL_CORE * level);
    const flickerDepth = 0.1 - LEVEL_STEADY * level;
    const danger = Math.min(
      1,
      Math.max(0, (SPUTTER_FROM - hull) / (SPUTTER_FROM - SPUTTER_FULL))
    );
    const cutChance =
      danger > 0
        ? SPUTTER_CUT[0] + (SPUTTER_CUT[1] - SPUTTER_CUT[0]) * danger
        : 0;
    const slot = Math.floor(time * SPUTTER_HZ);
    // the whole engine stalls now and then, a nozzle alone a little more often
    const stall = hash(slot * 0.37 + 5) < cutChance * 0.7;
    // stopped, nothing burns: only the throats (the owner's pick)
    const burning = main > 0.02;
    for (let i = 0; i < this.flames.length; i += 1) {
      const { flame, core, shocks, r } = this.flames[i];
      // uneven flicker and a cut now and then on a failing hull
      const u = time * 13 + i * 7.3;
      const k = Math.floor(u);
      const f = u - k;
      const noise = hash(k) + (hash(k + 1) - hash(k)) * f * f * (3 - 2 * f);
      const cut = stall || hash(slot * 3.1 + i * 17.7) < cutChance * 0.5;
      const flicker =
        (1 - flickerDepth + flickerDepth * Math.sin(time * 40 + i * 1.7)) *
        (1 - SPUTTER_FLICKER * danger * noise);
      const lit = burning && !cut;
      flame.visible = lit;
      core.visible = lit;
      flame.scale.set(length * flicker, r * 0.95 * width, r * 0.95 * width);
      const coreWidth = r * width * (0.47 - 0.03 * level);
      core.scale.set(coreLength * flicker, coreWidth, coreWidth);
      for (let s = 0; s < shocks.length; s += 1) {
        const shock = shocks[s];
        shock.visible = lit;
        shock.position.x = flame.position.x - length * flicker * SHOCK_AT[s];
        const size = r * width * 0.55 * (1 - 0.22 * s);
        shock.scale.set(length * 0.06, size, size);
      }
    }
    this.lightEmbers(danger, time);
    this.flameMaterial.opacity = Math.min(1, main * 1.2);
    this.coreMaterial.opacity =
      Math.min(1, main * 1.1) * (1 - LEVEL_THIN * level);
    this.flameMaterial.color
      .copy(this.accent)
      .multiplyScalar(1.8 * (1 - LEVEL_DIM * level));
    const heat = 1.7 * (1 + BURST_HEAT * kick);
    this.coreMaterial.color.setRGB(heat, heat, heat * 0.94);
    this.shockMaterial.opacity = Math.min(1, main * 1.1);
    this.nozzleMaterial.color
      .copy(this.accent)
      .multiplyScalar(0.5 + 1.3 * main);
    this.light.color.copy(this.accent).lerp(this.warmLight, 0.35 * main);
    this.light.intensity =
      2.6 * main + (this.muzzleFrames > 0 ? MUZZLE_LIGHT : 0);
    if (danger > 0) {
      this.light.intensity *= stall
        ? 0.2
        : 1 - 0.5 * danger * hash(slot * 0.71);
    }
  }

  /**
   * How hard the pilot is accelerating, 0..1: his own thrust (not the
   * coast brake, not a dash) while the speed along the nose is far below
   * cruise (acceleration over damping, ~90 px/s).
   */
  startBurst(player, cos, sin) {
    if (player.enginesIdle || player.dashTimer > 0) return 0;
    const { velocity, flight } = player;
    const cruise = flight.acceleration / flight.baseLinearDamping;
    const along = (velocity.vx * cos + velocity.vy * sin) / cruise;
    return 1 - smoothstep(BURST_FROM, BURST_TO, along);
  }

  /**
   * Dying embers spat from the nozzles on a failing hull: each lives
   * EMBER_LIFE, drifting aft and shrinking; more of them as `danger` rises.
   */
  lightEmbers(danger, time) {
    for (let j = 0; j < this.embers.length; j += 1) {
      const ember = this.embers[j];
      const u = time / EMBER_LIFE + j / this.embers.length;
      const c = Math.floor(u);
      const phase = u - c;
      ember.visible =
        danger > 0 && hash(c * 5.3 + j * 11.1) < 0.2 + 0.7 * danger;
      if (!ember.visible) continue;
      const { flame, r } =
        this.flames[Math.floor(hash(c * 2.7 + j) * this.flames.length)];
      ember.position.set(
        flame.position.x - 1.5 - 12 * phase,
        flame.position.y + (hash(c + j * 3.3) - 0.5) * r,
        flame.position.z + (hash(c * 1.9 + j) - 0.5) * r * (0.5 + 2 * phase)
      );
      const size = r * 0.5 * (1 - phase);
      ember.scale.set(size * 1.8, size, size);
    }
  }

  // The turret seated on the current hull or, with the cannon on the nose
  // (`nose`, the sim's noseAim), the nose cannon set into the hull's nose
  // with its muzzle on the sim's; seated again whenever the aim moves.
  seatGun(nose, hull) {
    seatTurret(this.turretParts, hull.visual, this.built);
    this.barrelsX = nose
      ? seatNoseGun(this.turretParts, this.built, hull.noseMuzzle)
      : 0;
    this.noseGun = nose;
  }

  // One layer per sim heading (PlayerSystem turretLayers), turned like the
  // turret; the rest hide.
  updateLayers(headings, angle) {
    while (this.layers.length < headings.length) {
      const layer = buildTurretLayer(
        this.THREE,
        this.hullMaterials,
        this.tones,
        this.layers.length + 1
      );
      layer.frames = 0;
      this.layerStack.add(layer.group);
      this.layers.push(layer);
    }
    this.layerStack.position.set(
      this.turret.position.x,
      this.turret.position.y + this.barrels.position.y,
      0
    );
    for (let i = 0; i < this.layers.length; i += 1) {
      const layer = this.layers[i];
      layer.group.visible = i < headings.length;
      if (!layer.group.visible) continue;
      layer.group.rotation.y = -(headings[i] - angle);
      layer.barrel.position.x = layer.frames > 0 ? -TURRET_RECOIL : 0;
      if (layer.frames > 0) layer.frames -= 1;
    }
  }

  /**
   * A shot flew off along (vx, vy): the turret layer turned closest to it
   * recoils (the turret's own barrels recoil on every shot already).
   */
  recoilToward(player, vx, vy) {
    const headings = player.turretLayers;
    let best = -1;
    let most =
      vx * Math.cos(player.turretAngle) + vy * Math.sin(player.turretAngle);
    for (let i = 0; i < headings.length; i += 1) {
      const along = vx * Math.cos(headings[i]) + vy * Math.sin(headings[i]);
      if (along > most) {
        best = i;
        most = along;
      }
    }
    if (this.layers[best]) this.layers[best].frames = LAYER_RECOIL_FRAMES;
  }

  /**
   * Where lock `index`'s line leaves, in world units (a reused vector): the
   * turret's axis at the height of the barrel aimed at that lock, its
   * layer's past the primary; it tilts with the ship's bank.
   */
  lockLineOrigin(index) {
    const layer = index > 0 ? this.layers[index - 1] : null;
    const [part, height] = layer?.group.visible
      ? [layer.group, layer.barrelY]
      : [this.turret, this.turretParts.barrelY + this.barrels.position.y];
    part.updateWorldMatrix(true, false);
    return part.localToWorld(this.lineOrigin.set(0, height, 0));
  }

  /**
   * Roll target: in the modern scheme the nose's swing onto the move (the
   * strafe share, full at SHIP_HEADING_TURN_RATE), plus the yaw rate in both,
   * eased toward with BANK_SMOOTH_S. Returns radians.
   */
  updateBank(player, time) {
    const dt =
      this.bankTime === null
        ? 0
        : Math.min(0.1, Math.max(0, time - this.bankTime));
    this.bankTime = time;
    const turn = player.angularVelocity || 0;
    const strafe =
      player.controlScheme === 'modern'
        ? Math.max(-1, Math.min(1, turn / SHIP_HEADING_TURN_RATE))
        : 0;
    const yaw = Math.max(-1, Math.min(1, turn / SHIP_ROTATION_SPEED));
    const target = BANK_STRAFE * strafe + BANK_YAW * yaw;
    this.bank += (target - this.bank) * (1 - Math.exp(-dt / BANK_SMOOTH_S));
    return this.bank;
  }

  // One RCS port's needles, blowing outboard: the jet, a shorter twin
  // inboard of it from level 3 and the ignition snap at level 5.
  addNeedles(position, port, size, turnL, level) {
    const { THREE } = this;
    const jet = this.rcsJets[turnL ? 'turnL' : 'turnR'];
    const make = (material, dx) => {
      const mesh = new THREE.Mesh(this.needle, material);
      mesh.position.fromArray(position);
      mesh.position.x += dx;
      mesh.rotation.y = port ? -Math.PI / 2 : Math.PI / 2;
      mesh.visible = false;
      this.ship.add(mesh);
      return mesh;
    };
    const inboard = position[0] > 0 ? -1 : 1;
    this.puffs.push({
      puff: make(jet.material, 0),
      size,
      turnL,
      length: Math.max(RCS_MIN_LENGTH, 4.5 + 2.2 * level) * size,
      radius: (0.7 - 0.06 * level) * size,
      twin: level >= 3 ? make(jet.material, 1.8 * inboard * size) : null,
      snap: level >= 5 ? make(this.snapMaterial, 0) : null,
    });
  }

  // Each side's needles at the pilot's turn (the raw step state, not
  // the eased one): on at once, held RCS_HOLD_S, then out in RCS_FADE_S.
  // The auto-brake's push across the hull lights a whole flank (thrusters.js).
  lightNeedles(state, dt) {
    let snap = 0;
    for (let i = 0; i < TURN_KEYS.length; i += 1) {
      const jet = this.rcsJets[TURN_KEYS[i]];
      const target = state[TURN_KEYS[i]] || 0;
      if (target > 0.02) {
        if (jet.amount < 0.05) jet.snap = RCS_SNAP_S;
        // As strong as the turn asks; a full key, full (Felipe, 21/11).
        jet.amount = Math.min(1, target);
        jet.hold = RCS_HOLD_S;
      } else if (jet.hold > 0) {
        jet.hold -= dt;
      } else {
        jet.amount =
          jet.amount < 0.05 ? 0 : jet.amount * Math.exp(-dt / RCS_FADE_S);
      }
      jet.material.opacity = jet.amount;
      snap = Math.max(snap, jet.snap);
    }
    this.snapMaterial.opacity = snap / RCS_SNAP_S;
    const flank = [state.brakePort || 0, state.brakeStarboard || 0];
    for (let i = 0; i < this.puffs.length; i += 1) {
      const {
        puff,
        size,
        turnL,
        length,
        radius,
        twin,
        snap: flash,
      } = this.puffs[i];
      const jet = turnL ? this.rcsJets.turnL : this.rcsJets.turnR;
      const amount = Math.max(jet.amount, flank[+(puff.position.z > 0)]);
      jet.material.opacity = Math.max(jet.material.opacity, amount);
      const reach = length * amount;
      puff.visible = amount > 0.02;
      puff.scale.set(reach, radius, radius);
      if (twin) {
        twin.visible = puff.visible;
        twin.scale.set(reach * 0.65, radius * 0.8, radius * 0.8);
      }
      if (flash) {
        const k = jet.snap / RCS_SNAP_S;
        flash.visible = k > 0;
        flash.scale.set(
          2.4 * size,
          (1.2 + 1.8 * k) * size,
          (1.2 + 1.8 * k) * size
        );
      }
    }
    for (let i = 0; i < TURN_KEYS.length; i += 1) {
      const jet = this.rcsJets[TURN_KEYS[i]];
      jet.snap = Math.max(0, jet.snap - dt);
    }
  }

  // The retro pair at the nose ports, splayed outboard and blowing
  // forward, longer, wider and splayed more per Braking System level (a
  // second, outer pair from 2); at 3 the emergency brake's fan is armed.
  addRetros(hull, level) {
    const { THREE } = this;
    const add = (x, z, angle, length, radius) => {
      const mesh = new THREE.Mesh(this.needle, this.retroMaterial);
      mesh.position.set(x, NOZZLE_HEIGHT, z);
      mesh.rotation.y = Math.PI + angle;
      mesh.visible = false;
      this.ship.add(mesh);
      this.retros.push({ mesh, length, radius });
    };
    const length = 6 + 3 * Math.min(level, 2);
    const radius = 0.7 + 0.15 * Math.min(level, 2);
    const splay = ((10 + 5 * level) * Math.PI) / 180;
    ['noseLeft', 'noseRight'].forEach((kind) => {
      const { x, y } = getHullThrusterPort(kind, hull);
      const side = y < 0 ? 1 : -1;
      const px = x / VISUAL_SCALE;
      const pz = y / VISUAL_SCALE;
      add(px, pz, side * splay, length, radius);
      if (level >= 2) {
        add(px - 2, pz * 1.6, side * (splay + 0.4), length * 0.6, radius * 0.8);
      }
    });
    this.flareReady = level >= 3;
  }

  // The retros at the eased retro `aux`, so the coast brake fades with
  // speed. The emergency brake's start (Braking System 3) fires the fan for
  // RETRO_FLARE_S: rays thrown ahead of the motion it stops, the middle one
  // longest, snapping out and fading.
  lightRetros(player, geometry, aux, dt) {
    const { brakeTimer, brakeFrom } = player.maneuvers;
    const braking = brakeTimer > 0;
    if (braking && !this.braking && this.flareReady) {
      this.flare = RETRO_FLARE_S;
      this.flareFan.rotation.y = -Math.atan2(brakeFrom.vy, brakeFrom.vx);
      this.flareDirX = Math.cos(-this.flareFan.rotation.y);
      this.flareDirY = Math.sin(-this.flareFan.rotation.y);
    }
    this.braking = braking;
    for (let i = 0; i < this.retros.length; i += 1) {
      const { mesh, length, radius } = this.retros[i];
      mesh.visible = aux > 0.02;
      mesh.scale.set(length * (0.6 + 0.4 * aux), radius, radius);
    }
    // Full from the Modern retro's whole share (0.7): a full key burns full.
    this.retroMaterial.opacity = Math.min(1, aux / 0.7);
    const f = this.flare / RETRO_FLARE_S;
    this.flare = Math.max(0, this.flare - dt);
    this.flareFan.visible = f > 0;
    if (f <= 0) return;
    const { x, y } = player.position;
    const ahead = geometry.extent * 0.4;
    this.flareFan.position.set(
      x + this.flareDirX * ahead - HALF_W,
      NOZZLE_HEIGHT * VISUAL_SCALE,
      y + this.flareDirY * ahead - HALF_H
    );
    const out = 1 - (1 - Math.min(1, (1 - f) * 4)) ** 2;
    const rays = this.flareFan.children;
    for (let i = 0; i < rays.length; i += 1) {
      const reach = FLARE_RAYS[rays[i].userData.ray];
      const width = 1.65 - 0.33 * rays[i].userData.ray;
      rays[i].scale.set(reach * (0.35 + 0.65 * out), width, width);
    }
    this.flareMaterial.opacity = f ** 0.8;
  }

  updateGhosts(list) {
    const ghosts = list || [];
    for (let i = 0; i < this.ghosts.length; i += 1) {
      const mesh = this.ghosts[i];
      const ghost = ghosts[i];
      if (!ghost || this.hiddenGhosts.has(ghost)) {
        mesh.visible = false;
        continue;
      }
      const alpha = GHOST_ALPHA * Math.max(0, 1 - ghost.age / DASH_GHOST_LIFE);
      mesh.visible = alpha > 0.01;
      mesh.position.set(ghost.x - HALF_W, 0, ghost.y - HALF_H);
      mesh.rotation.y = -(ghost.angle || 0);
      mesh.material.color.copy(this.ghostRgb).multiplyScalar(alpha);
    }
  }

  hideGhosts() {
    for (let i = 0; i < this.ghosts.length; i += 1) {
      this.ghosts[i].visible = false;
    }
  }

  /** A shot left the nose: bump the ship light for a few frames. */
  flashMuzzle() {
    this.muzzleFrames = MUZZLE_LIGHT_FRAMES;
  }

  /** Quality preset: the baked hull maps on or off (one recompile). */
  setSurfaceMaps(enabled) {
    if (enabled === this.surfaceMaps) return;
    this.surfaceMaps = enabled;
    this.mappedMaterials.forEach((material) => {
      Object.keys(this.hullMaps).forEach((name) => {
        material[name] = enabled ? this.hullMaps[name] : null;
      });
      material.needsUpdate = true;
    });
  }

  reset() {
    this.trailCount = 0;
    this.muzzleFrames = 0;
    this.layers.forEach((layer) => {
      layer.frames = 0;
    });
    this.bank = 0;
    this.bankTime = null;
    this.dashGuard = false;
    this.hideGhosts();
    this.flare = 0;
    this.flareFan.visible = false;
    this.braking = false;
    this.fxTime = null;
    for (let i = 0; i < TURN_KEYS.length; i += 1) {
      Object.assign(this.rcsJets[TURN_KEYS[i]], {
        amount: 0,
        hold: 0,
        snap: 0,
      });
    }
  }
}
