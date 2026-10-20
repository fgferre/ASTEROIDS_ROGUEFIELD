// The player hull in 3D (docs/NORTE.md §3): the ship hullModel.js builds
// from the hull's art data (lofted fuselage, airfoil wings that grow with
// the RCS upgrade, tail fins, nacelles, intakes, pods, canopy, edge lines,
// turret), under one matte vertex-coloured material with baked panel maps
// and a cyan fresnel rim, cached per hull and upgrade levels. The only
// strong light is the thrusters (hull accent: cyan Interceptor, amber Solar
// Slicer): glowing throats, cones with a white core that stretch with
// thrust, side puffs on strafe at the wingtip ports, a point light and a
// ribbon trail. Dash afterimages, the invulnerability blink and the shield
// impact flash mirror the 2D PlayerSystem render. In the modern scheme the
// dorsal turret turns on its own to the simulation's turret heading; its
// barrel tips sit on the sim's muzzle point.

import {
  DASH_GHOST_COUNT,
  DASH_GHOST_LIFE,
} from '../../data/constants/gameplay.js';
import { PALETTE } from '../../data/constants/palette.js';
import {
  SHIP_MAX_SPEED,
  SHIP_ROTATION_SPEED,
  TURRET_PIVOT_X,
} from '../../data/constants/physics.js';
import { ALL_HULLS } from '../../data/shipModels.js';
import { bakeHullMaps } from './bakedMaps.js';
import {
  NOZZLE_HEIGHT,
  VISUAL_SCALE,
  buildHullModel,
  buildTurret,
  edgeLines,
  hullTones,
  seatTurret,
  throatGeometry,
} from './hullModel.js';
import { addRimLight } from './rimLight.js';
import { HALF_H, HALF_W, colorOf, rgbOf } from './batches.js';

const TRAIL_MIN = 12;
const TRAIL_LENGTH = 22;
// Banking (PLAN.md R5.9, proposta 18/10): roll into the strafe input and the
// yaw rate, eased with a time constant so it saturates and relaxes smoothly.
// Both come from the simulation (input, angular velocity), never from the
// interpolated pose.
const BANK_STRAFE = (22 * Math.PI) / 180;
const BANK_YAW = (8 * Math.PI) / 180;
const BANK_SMOOTH_S = 0.18;
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
// Baked panel maps (bakedMaps.js): one texture tile per HULL_TILE hull units
// (the hull's UVs are planar, in hull units). proposta 18/10: strengths.
const HULL_TILE = 16;
const HULL_NORMAL_SCALE = 0.5;
const HULL_AO = 0.8;
const HULL_MAP_SEED = 3131.9;
const HULL_ROUGHNESS = 0.8;

// Cyan fresnel rim on the hull (a tight band on the silhouette against the
// dark field) plus the white invulnerability pulse, both as emissive; the
// pulse is weighted to the rim so the panels stay readable while it blinks.
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

    // One matte material for every hull part; the tones (dark interiors,
    // belly, deck and wings, spine) ride in the vertex colours, so the key
    // light models the curved surfaces without a sheen.
    const rim = { value: colorOf(THREE, PALETTE.player).multiplyScalar(0.45) };
    const blink = { value: 0 };
    const maps = bakeHullMaps(THREE, HULL_MAP_SEED);
    Object.values(maps).forEach((map) =>
      map.repeat.set(1 / HULL_TILE, 1 / HULL_TILE)
    );
    const hullMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.2,
      roughness: HULL_ROUGHNESS,
      ...maps,
      normalScale: new THREE.Vector2(HULL_NORMAL_SCALE, HULL_NORMAL_SCALE),
      aoMapIntensity: HULL_AO,
    });
    hullMaterial.userData.uRim = rim;
    hullMaterial.userData.uBlink = blink;
    hullMaterial.onBeforeCompile = patchHull;
    this.hullMaterial = addRimLight(hullMaterial);
    this.tones = hullTones(THREE);
    // hull key → { hull, ghost, canopy, edges, tips, deckY }, kept for the
    // session
    this.hullCache = new Map();
    this.hullMaps = maps;
    this.surfaceMaps = true;
    this.blink = blink;
    this.canopyMaterial = addRimLight(
      new THREE.MeshStandardMaterial({
        color: colorOf(THREE, PALETTE.rockShadow),
        emissive: colorOf(THREE, PALETTE.player).multiplyScalar(0.14),
        metalness: 0.1,
        roughness: 0.3,
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
    this.coreMaterial.color.setRGB(1.7, 1.7, 1.6);
    this.puffMaterial = glow();
    this.nozzleMaterial = glow();
    this.accent = new THREE.Color();
    this.warmLight = new THREE.Color(1, 0.85, 0.7);

    const cone = new THREE.ConeGeometry(1, 1, 12, 1, true);
    cone.rotateZ(Math.PI / 2);
    cone.translate(-0.5, 0, 0);
    this.cone = cone;

    this.light = new THREE.PointLight(
      colorOf(THREE, PALETTE.player),
      0,
      150,
      2
    );
    this.group.add(this.light);

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
    this.dashGuard = false;

    this.hullKey = null;
    this.flames = [];
    this.puffs = [];
    this.trailX = new Float32Array(TRAIL_LENGTH);
    this.trailY = new Float32Array(TRAIL_LENGTH);
    this.trailCount = 0;
    this.trailHead = 0;
    this.thrustRgb = rgbOf(THREE, PALETTE.player);
    // The turret, in the hull material; rebuild() seats it on each hull.
    this.turretParts = buildTurret(THREE, this.hullMaterial, this.tones);
    ({
      group: this.turret,
      housing: this.turretHousing,
      housingLow: this.turretHousingLow,
      barrels: this.barrels,
    } = this.turretParts);
    this.group.add(this.turret);
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

    // Thrusters take the hull's accent (amber Solar Slicer); the rim and
    // edges stay player cyan.
    this.accent = colorOf(THREE, geometry.accent);
    this.thrustRgb = rgbOf(THREE, geometry.accent);
    this.flameMaterial.color.copy(this.accent).multiplyScalar(1.8);
    this.puffMaterial.color.copy(this.accent).multiplyScalar(1.4);
    this.bladeEdgeMaterial.color.copy(this.accent).multiplyScalar(1.3);

    const key = hullKeyOf(hull, levels);
    if (!this.hullCache.has(key)) {
      const model = buildHullModel(THREE, geometry, this.tones);
      model.hull.userData.cached = true;
      model.canopy.userData.cached = true;
      this.hullCache.set(key, model);
    }
    const built = this.hullCache.get(key);
    seatTurret(this.turretParts, hull.visual, built);

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
      this.flames.push({ flame, core, r: nozzle.r });
    });

    // Strafe puffs at the wingtip RCS ports, pointing outboard (as in 2D).
    geometry.rcsPorts.forEach((port, i) => {
      const puff = new THREE.Mesh(this.cone, this.puffMaterial);
      puff.position.fromArray(built.tips[i]);
      puff.rotation.y = port.y < 0 ? -Math.PI / 2 : Math.PI / 2;
      puff.visible = false;
      this.ship.add(puff);
      this.puffs.push({ puff, left: port.y < 0 });
    });

    const hullMesh = new THREE.Mesh(built.hull, this.hullMaterial);
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
  update(player, ribbons, time) {
    const hidden =
      !player ||
      player.isDead ||
      player._quitExplosionHidden ||
      !player.currentHull?.visual;
    this.group.visible = !hidden;
    if (hidden) {
      this.light.intensity = 0;
      this.trailCount = 0;
      this.hideGhosts();
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
    this.barrels.position.x = this.muzzleFrames > 0 ? -TURRET_RECOIL : 0;

    const main = thrust.main || 0;
    const length = (5 + 18 * main) * (1 + 0.1 * (levels.thruster || 0));
    for (let i = 0; i < this.flames.length; i += 1) {
      const { flame, core, r } = this.flames[i];
      const flicker = 0.9 + 0.1 * Math.sin(time * 40 + i * 1.7);
      flame.visible = main > 0.02;
      core.visible = flame.visible;
      flame.scale.set(length * flicker, r * 0.95, r * 0.95);
      core.scale.set(length * 0.5 * flicker, r * 0.45, r * 0.45);
    }
    this.flameMaterial.opacity = Math.min(1, main * 1.2);
    this.coreMaterial.opacity = Math.min(1, main * 1.1);
    this.nozzleMaterial.color
      .copy(this.accent)
      .multiplyScalar(0.5 + 1.3 * main);
    for (let i = 0; i < this.puffs.length; i += 1) {
      const { puff, left } = this.puffs[i];
      const amount = (left ? thrust.sideL : thrust.sideR) || 0;
      puff.visible = amount > 0.02;
      puff.scale.set(2 + 6 * amount, 1.2, 1.2);
    }
    this.puffMaterial.opacity = Math.min(
      1,
      Math.max(thrust.sideL || 0, thrust.sideR || 0)
    );
    // Warmer and brighter under thrust; each shot bumps it briefly.
    this.light.color.copy(this.accent).lerp(this.warmLight, 0.35 * main);
    this.light.intensity =
      2.6 * main + (this.muzzleFrames > 0 ? MUZZLE_LIGHT : 0);
    if (this.muzzleFrames > 0) this.muzzleFrames -= 1;

    // Blink while invulnerable after a hit; the dash's own i-frames do not.
    const invulnerable = player.invulnerableTimer > 0;
    if (player.dashTimer > 0) this.dashGuard = true;
    else if (!invulnerable) this.dashGuard = false;
    this.blink.value =
      invulnerable && !this.dashGuard
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
   * Roll target: strafe input (modern only; classic A/D is torque) plus the
   * yaw rate, eased toward with BANK_SMOOTH_S. Returns radians.
   */
  updateBank(player, time) {
    const dt =
      this.bankTime === null
        ? 0
        : Math.min(0.1, Math.max(0, time - this.bankTime));
    this.bankTime = time;
    const thrust = player.lastThrusterState || {};
    const strafe =
      player.controlScheme === 'modern'
        ? (thrust.sideL || 0) - (thrust.sideR || 0)
        : 0;
    const yaw = Math.max(
      -1,
      Math.min(1, (player.angularVelocity || 0) / SHIP_ROTATION_SPEED)
    );
    const target = BANK_STRAFE * strafe + BANK_YAW * yaw;
    this.bank += (target - this.bank) * (1 - Math.exp(-dt / BANK_SMOOTH_S));
    return this.bank;
  }

  updateGhosts(list) {
    const ghosts = list || [];
    for (let i = 0; i < this.ghosts.length; i += 1) {
      const mesh = this.ghosts[i];
      const ghost = ghosts[i];
      if (!ghost) {
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
    const material = this.hullMaterial;
    Object.keys(this.hullMaps).forEach((name) => {
      material[name] = enabled ? this.hullMaps[name] : null;
    });
    material.needsUpdate = true;
  }

  reset() {
    this.trailCount = 0;
    this.muzzleFrames = 0;
    this.bank = 0;
    this.bankTime = null;
    this.dashGuard = false;
    this.hideGhosts();
  }
}
