// The player hull in 3D (docs/NORTE.md §3): the ship hullModel.js builds
// from the hull's art data (lofted fuselage, airfoil wings that grow with
// the RCS upgrade, tail fins, nacelles, intakes, pods, canopy, edge lines,
// turret), in three vertex-coloured finishes (satin paint and glossier
// accent panels with baked maps and a worn livery, polished steel) under
// a cyan rim, blue glass, nav lights; cached per hull and levels. The only
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
//
// The parts live by subject under ./player/: hull.js (finishes, maps, the
// cached model, edges, canopy), engines.js (flames, embers, the ship light,
// the trail), jets.js (turn jets, retro flames and the flare fan), guns.js
// (turret, nose cannon, layers, recoil) and dash.js (dash ring, afterimages,
// blink). Each takes the mirror as its first argument; the mirror keeps the
// creation order, the frame's order, the ship's death and its tilt.

import { ALL_HULLS } from '../../data/shipModels.js';
import { DissolvePool } from './dissolve.js';
import { NOZZLE_HEIGHT, VISUAL_SCALE } from './hullModel.js';
import * as hullLivery from './hullLivery.js';
import { HALF_H, HALF_W, colorOf, rgbOf } from './batches.js';
import {
  createDash,
  hideGhosts,
  updateGhosts,
  updateGuard,
} from './player/dash.js';
import {
  CRUISE_SCALE,
  addFlames,
  createEngines,
  createTrail,
  lightEngines,
  startBurst,
  updateTrail,
} from './player/engines.js';
import {
  MUZZLE_LIGHT_FRAMES,
  aimGuns,
  createGuns,
  lockLineOrigin,
  recoilToward,
  resetRecoil,
} from './player/guns.js';
import {
  buildHull,
  createSurface,
  hullKeyOf,
  setSurfaceMaps,
} from './player/hull.js';
import {
  TURN_KEYS,
  addJets,
  createJets,
  lightNeedles,
  lightRetros,
} from './player/jets.js';

// No jet lit (still).
const STILL_JETS = Object.freeze({});
// proposta 17/11 (efeito/impacto): the ship's death breaks it into SHIP_PIECES
// of its own build, thrown as a machine of SHIP_BREAK_RADIUS would be.
const SHIP_PIECES = 14;
const SHIP_BREAK_RADIUS = 18;
// The tilt (Felipe's pick, corpo-da-nave-1, 23/11: "Média"): the hull rolls
// toward the lit turn couple or flank push, the stronger of the two, lifts
// its nose under the main engine and dips it under the retro. From the jets
// lit this sim step (lastThrusterState), never the interpolated pose, on a
// spring with a little sway; level under reduced motion.
const TILT_ROLL = (25 * Math.PI) / 180;
const TILT_PITCH = (8 * Math.PI) / 180;
// A flank's push leans the hull almost as far as the turn couple.
const TILT_FLANK = 0.8;
const TILT_OMEGA = 11; // rad/s
const TILT_DAMPING = 0.72;
// The ship's hull panels cast; its turret, nozzles and canopy (radius under
// this, world units) only receive.
export const SHIP_MIN_CASTER = 5;

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

    const rim = createSurface(this, THREE);
    createEngines(this, THREE);
    // A dark stand-in, on only while the ship is hidden (a blink, a death):
    // the lit programs are keyed on the count of lights shown, so without
    // it hiding the ship recompiles every lit material mid-play.
    this.standIn = new THREE.PointLight(0x000000, 0, 1, 2);
    this.standIn.visible = false;
    scene.add(this.standIn);

    this.muzzleFrames = 0;
    this.tilt = { roll: 0, rollRate: 0, pitch: 0, pitchRate: 0 };

    createDash(this, THREE, scene, rim);

    this.hullKey = null;
    this.flames = [];
    this.puffs = [];
    createJets(this, THREE, scene);
    this.fxTime = null;
    createTrail(this, THREE);
    createGuns(this, THREE);
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

    const built = buildHull(this, player, hull, levels, geometry);
    addFlames(this, geometry, levels);
    addJets(this, geometry, hull, built, levels);

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
   * break, dissolve.js), carried by its momentum, the sensor's glass with
   * them though it is see-through; its flames, glows and light go out at
   * once.
   */
  startBreak(player) {
    this.breaking = true;
    this.light.intensity = 0;
    this.blink.value = 0;
    this.flareFan.visible = false;
    hideGhosts(this);
    this.group.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = false;
      const material = [].concat(node.material)[0];
      const solid =
        material === this.canopyMaterial ||
        (material?.isMeshStandardMaterial && !material.transparent);
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

  /**
   * `worldDt`: the world's step in s (slow motion included), for the death's
   * break; `reducedMotion`: the hull neither gives to a shot nor tilts.
   */
  update(player, ribbons, time, worldDt = 0, reducedMotion = false) {
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
      player?.maneuvers.dashGhosts?.forEach((ghost) =>
        this.hiddenGhosts.add(ghost)
      );
      hideGhosts(this);
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

    const dt =
      this.fxTime === null ? 0 : Math.min(0.1, Math.max(0, time - this.fxTime));
    this.fxTime = time;

    this.group.position.set(x - HALF_W, 0, y - HALF_H);
    this.group.rotation.y = -angle;
    // The sim stays flat; the tilt and the recoil are only drawn.
    this.updateTilt(player, dt, reducedMotion);
    aimGuns(this, player, angle, dt, reducedMotion);
    this.strobe.visible = hullLivery.strobeOn(time);

    const main = thrust.main || 0;
    lightEngines(this, main, levels.thruster, time, {
      burst: startBurst(this, player, cos, sin),
      hull: player.maxHealth > 0 ? player.health / player.maxHealth : 1,
      cruise: CRUISE_SCALE,
    });
    lightNeedles(this, player.thrusters.lastThrusterState, dt);
    lightRetros(this, player, geometry, thrust.aux || 0, dt);
    if (this.muzzleFrames > 0) this.muzzleFrames -= 1;

    updateGuard(this, player, time);

    updateGhosts(this, player.maneuvers.dashGhosts);

    updateTrail(this, player, ribbons, geometry, main, cos, sin);
  }

  lightEngines(main, level, time, options) {
    lightEngines(this, main, level, time, options);
  }

  recoilToward(player, vx, vy, from) {
    recoilToward(this, player, vx, vy, from);
  }

  lockLineOrigin(index) {
    return lockLineOrigin(this, index);
  }

  /**
   * Rolls and pitches the hull toward the jets lit this step (TILT_*), on a
   * spring over `dt` s; level under reduced motion.
   */
  updateTilt(player, dt, reduced) {
    const jets = player.thrusters.lastThrusterState;
    const turn = jets.turnR - jets.turnL;
    const flank = TILT_FLANK * (jets.brakePort - jets.brakeStarboard);
    const lean = Math.abs(turn) >= Math.abs(flank) ? turn : flank;
    const rollGoal = reduced ? 0 : TILT_ROLL * Math.max(-1, Math.min(1, lean));
    const pitchGoal = reduced
      ? 0
      : TILT_PITCH * Math.max(-1, Math.min(1, jets.main - jets.aux));
    const tilt = this.tilt;
    const steps = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / steps;
    for (let i = 0; i < steps; i += 1) {
      tilt.rollRate +=
        (TILT_OMEGA * TILT_OMEGA * (rollGoal - tilt.roll) -
          2 * TILT_DAMPING * TILT_OMEGA * tilt.rollRate) *
        h;
      tilt.roll += tilt.rollRate * h;
      tilt.pitchRate +=
        (TILT_OMEGA * TILT_OMEGA * (pitchGoal - tilt.pitch) -
          2 * TILT_DAMPING * TILT_OMEGA * tilt.pitchRate) *
        h;
      tilt.pitch += tilt.pitchRate * h;
    }
    // x: roll (positive lowers the starboard wing); z: the nose (positive up)
    this.group.rotation.x = tilt.roll;
    this.group.rotation.z = tilt.pitch;
  }

  /**
   * A ship posed by a cinematic (the ending), after update(): level, its
   * engines idle (no flame), no side jet, retro or brake flare, no muzzle
   * flash, whatever the pilot holds; the simulation is untouched.
   */
  still(time) {
    this.group.rotation.x = 0;
    this.group.rotation.z = 0;
    this.muzzleFrames = 0;
    for (let i = 0; i < TURN_KEYS.length; i += 1) {
      const jet = this.rcsJets[TURN_KEYS[i]];
      jet.amount = 0;
      jet.hold = 0;
      jet.snap = 0;
    }
    lightNeedles(this, STILL_JETS, 0);
    for (let i = 0; i < this.retros.length; i += 1) {
      this.retros[i].mesh.visible = false;
    }
    this.flare = 0;
    this.flareFan.visible = false;
    lightEngines(this, 0, 0, time);
  }

  /** A shot left the nose: bump the ship light for a few frames. */
  flashMuzzle() {
    this.muzzleFrames = MUZZLE_LIGHT_FRAMES;
  }

  setSurfaceMaps(enabled) {
    setSurfaceMaps(this, enabled);
  }

  reset() {
    this.trailCount = 0;
    this.muzzleFrames = 0;
    resetRecoil(this);
    Object.assign(this.tilt, { roll: 0, rollRate: 0, pitch: 0, pitchRate: 0 });
    this.dashGuard = false;
    hideGhosts(this);
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
