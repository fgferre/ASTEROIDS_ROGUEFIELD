// The player hull in 3D (docs/NORTE.md §3): the panels of shipModels.js built
// as layered matte plates — a dark base plate under every panel, a lighter
// raised spine over the prow and body, bevelled fin plates — with dark seams,
// a dim canopy, a thin cyan edge on the prow and the fins' trailing edges and
// a cyan fresnel rim. The only strong light is the thrusters (hull accent:
// cyan Interceptor, amber Solar Slicer): glowing nozzles, cones with a white
// core that stretch with thrust, side puffs on strafe, a point light and a
// ribbon trail. Dash afterimages, the invulnerability blink and the shield
// impact flash mirror the 2D PlayerSystem render. In the modern scheme a
// dorsal turret (base, twin barrels, amber lens) turns on its own to the
// simulation's turret heading; its barrel tips sit on the sim's muzzle point.

import {
  DASH_GHOST_COUNT,
  DASH_GHOST_LIFE,
} from '../../data/constants/gameplay.js';
import { PALETTE } from '../../data/constants/palette.js';
import {
  SHIP_MAX_SPEED,
  SHIP_ROTATION_SPEED,
  TURRET_BARREL_LENGTH,
  TURRET_PIVOT_X,
} from '../../data/constants/physics.js';
import { ALL_HULLS } from '../../data/shipModels.js';
import { bakeHullMaps } from './bakedMaps.js';
import { HALF_H, HALF_W, colorOf, rgbOf } from './batches.js';

// Plate heights in hull units: base plate, raised spine (peak at y = 0) and
// fin plate, each on top of the base.
const BASE_DEPTH = 2.4;
const SPINE_DEPTH = 4.2;
const FIN_DEPTH = 1.1;
const BEVEL = 0.5;
const BASE_TOP = BASE_DEPTH + BEVEL;
// Raised plates are their panel shrunk toward its centroid: the base shows
// around them as a panel border and a seam down the spine.
const INSET = 0.8;
const NOZZLE_HEIGHT = 2.6;
// Visual only: collision keeps the 2D outline, and effects anchored on the
// nose (muzzle flash, lances) take their position from the simulation.
const VISUAL_SCALE = 1.35;
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
// Dash i-frames: brighter cyan rim and a thin ring (proposta 18/10).
const DASH_RIM_BOOST = 3;
const DASH_RING_OPACITY = 0.55;
const BLINK_HZ = 8;
const SHIELD_FLASH_S = 0.08;
const GHOST_ALPHA = 0.5;
// proposta 17/10: each shot bumps the ship light for a couple of frames.
const MUZZLE_LIGHT = 1.6;
// Turret, in field units (unscaled, so the barrel tips meet the sim muzzle):
// the base sits on the scaled spine top, the barrels clear the canopy.
const TURRET_BASE_Y = (BASE_TOP + SPINE_DEPTH) * VISUAL_SCALE;
const TURRET_BASE_R = 4;
const TURRET_BASE_H = 2;
const TURRET_BARREL_Y = TURRET_BASE_Y + TURRET_BASE_H + 0.9;
const TURRET_BARREL_R = 0.7;
const TURRET_BARREL_Z = 1.3;
const TURRET_RECOIL = 1.2;
const MUZZLE_LIGHT_FRAMES = 2;
// Baked panel maps (bakedMaps.js): one texture tile per HULL_TILE hull units
// (the extruded plates' UVs are in hull units). proposta 18/10: strengths.
const HULL_TILE = 16;
const HULL_NORMAL_SCALE = 0.5;
const HULL_AO = 0.8;
const HULL_MAP_SEED = 3131.9;

// Cyan fresnel rim on the hull (silhouette against the dark field) plus the
// white invulnerability pulse, both as emissive; the pulse is weighted to the
// rim so the panels stay readable while it blinks.
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
      totalEmissiveRadiance += uRim * pow(rim, 3.0) + vec3(uBlink * (0.25 + rim));`
    );
}

// All hull panels in one non-indexed position buffer (one draw per ghost).
function mergePositions(THREE, geometries) {
  const parts = geometries.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((n, g) => n + g.getAttribute('position').count, 0);
  const positions = new Float32Array(total * 3);
  let offset = 0;
  parts.forEach((g, i) => {
    const array = g.getAttribute('position').array;
    positions.set(array, offset);
    offset += array.length;
    if (g !== geometries[i]) g.dispose();
  });
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return merged;
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

    // Three matte tones (base plate, fins, spine) sharing the rim and blink
    // uniforms, so the key light models each panel without a sheen.
    const rim = { value: colorOf(THREE, PALETTE.player).multiplyScalar(0.45) };
    const blink = { value: 0 };
    const maps = bakeHullMaps(THREE, HULL_MAP_SEED);
    Object.values(maps).forEach((map) =>
      map.repeat.set(1 / HULL_TILE, 1 / HULL_TILE)
    );
    const hullTone = (from, to, t, roughness) => {
      const material = new THREE.MeshStandardMaterial({
        color: colorOf(THREE, from).lerp(colorOf(THREE, to), t),
        metalness: 0.2,
        roughness,
        flatShading: true,
        ...maps,
        normalScale: new THREE.Vector2(HULL_NORMAL_SCALE, HULL_NORMAL_SCALE),
        aoMapIntensity: HULL_AO,
      });
      material.userData.uRim = rim;
      material.userData.uBlink = blink;
      material.onBeforeCompile = patchHull;
      return material;
    };
    this.baseMaterial = hullTone(PALETTE.hull, PALETTE.hullLit, 0.2, 0.85);
    this.finMaterial = hullTone(PALETTE.hullLit, PALETTE.neutral, 0.15, 0.8);
    this.spineMaterial = hullTone(PALETTE.hullLit, PALETTE.neutral, 0.6, 0.72);
    this.hullMaps = maps;
    this.surfaceMaps = true;
    this.blink = blink;
    this.canopyMaterial = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, PALETTE.rockShadow),
      emissive: colorOf(THREE, PALETTE.player).multiplyScalar(0.25),
      metalness: 0.1,
      roughness: 0.3,
      flatShading: true,
    });
    this.seamMaterial = new THREE.LineBasicMaterial({
      color: colorOf(THREE, PALETTE.rockShadow),
    });
    this.edgeMaterial = new THREE.LineBasicMaterial({
      color: colorOf(THREE, PALETTE.player).multiplyScalar(0.7),
      toneMapped: false,
    });
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

    this.shield = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: colorOf(THREE, PALETTE.player).multiplyScalar(1.4),
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      })
    );
    this.group.add(this.shield);
    this.shieldRgb = colorOf(THREE, PALETTE.player).multiplyScalar(1.4);
    this.shieldFlashRgb = new THREE.Color(1.6, 1.6, 1.6);
    this.shieldHitAt = -Infinity;
    this.muzzleFrames = 0;
    this.bank = 0;
    this.bankTime = null;

    this.rim = rim.value;
    this.rimRgb = rim.value.clone();
    this.dashRimRgb = rim.value.clone().multiplyScalar(DASH_RIM_BOOST);
    this.dashRing = new THREE.Mesh(
      new THREE.RingGeometry(0.94, 1, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: colorOf(THREE, PALETTE.player).multiplyScalar(1.6),
        transparent: true,
        opacity: DASH_RING_OPACITY,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
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
    this.buildTurret();
  }

  buildTurret() {
    const { THREE } = this;
    const lit = (geometry) => {
      geometry.setAttribute('uv2', geometry.getAttribute('uv'));
      return geometry;
    };
    this.turret = new THREE.Group();
    const base = new THREE.Mesh(
      lit(
        new THREE.CylinderGeometry(
          TURRET_BASE_R * 0.85,
          TURRET_BASE_R,
          TURRET_BASE_H,
          10
        ).translate(0, TURRET_BASE_Y + TURRET_BASE_H / 2, 0)
      ),
      this.spineMaterial
    );
    // Barrels and their block recoil together along the turret's axis.
    this.barrels = new THREE.Group();
    const block = new THREE.Mesh(
      lit(new THREE.BoxGeometry(4.6, 2, 4).translate(0.3, TURRET_BARREL_Y, 0)),
      this.baseMaterial
    );
    const length = TURRET_BARREL_LENGTH - 1.5;
    const barrel = (z) =>
      new THREE.Mesh(
        lit(
          new THREE.CylinderGeometry(
            TURRET_BARREL_R,
            TURRET_BARREL_R,
            length,
            6
          )
            .rotateZ(Math.PI / 2)
            .translate(1.5 + length / 2, TURRET_BARREL_Y, z)
        ),
        this.finMaterial
      );
    const lens = new THREE.Mesh(
      new THREE.SphereGeometry(1, 8, 6).translate(
        2.2,
        TURRET_BARREL_Y + 0.9,
        0
      ),
      new THREE.MeshBasicMaterial({
        color: colorOf(THREE, PALETTE.shot).multiplyScalar(2),
        toneMapped: false,
      })
    );
    this.barrels.add(
      block,
      barrel(-TURRET_BARREL_Z),
      barrel(TURRET_BARREL_Z),
      lens
    );
    this.turret.add(base, this.barrels);
    this.group.add(this.turret);
  }

  // Rebuilds the meshes when the hull or its visual-upgrade levels change.
  build(player, levels) {
    const hull = player.currentHull;
    const key = `${hull.id}|${levels.thruster}|${levels.rcs}|${levels.braking}`;
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
      if (child.geometry !== this.cone) child.geometry.dispose();
    });
    this.flames = [];
    this.puffs = [];

    // Thrusters take the hull's accent (amber Solar Slicer); the rim and
    // edges stay player cyan.
    this.accent = colorOf(THREE, geometry.accent);
    this.thrustRgb = rgbOf(THREE, geometry.accent);
    this.flameMaterial.color.copy(this.accent).multiplyScalar(1.8);
    this.puffMaterial.color.copy(this.accent).multiplyScalar(1.4);

    const maxY = geometry.maxY || 1;
    const bases = [];
    geometry.panels.forEach((panel) => {
      const base = this.addPlate(
        panel.points,
        BASE_DEPTH,
        0,
        0,
        this.baseMaterial
      );
      bases.push(base);
      // Dark seams on the base plate only: the raised plates read by tone.
      this.ship.add(
        new THREE.LineSegments(
          new THREE.EdgesGeometry(base, 40),
          this.seamMaterial
        )
      );
      const spine = panel.points.some((p) => p.y === 0);
      if (!spine && !panel.rcsPort) return;
      const cx =
        panel.points.reduce((n, p) => n + p.x, 0) / panel.points.length;
      const cy =
        panel.points.reduce((n, p) => n + p.y, 0) / panel.points.length;
      const inset = panel.points.map((p) => ({
        x: cx + (p.x - cx) * INSET,
        y: cy + (p.y - cy) * INSET,
      }));
      if (spine) {
        this.addPlate(inset, SPINE_DEPTH, BASE_TOP, maxY, this.spineMaterial);
      } else {
        this.addPlate(inset, FIN_DEPTH, BASE_TOP, 0, this.finMaterial);
      }
      this.addEdges(panel, spine, geometry.maxX);
    });

    const { cockpit } = geometry;
    if (cockpit) {
      const length = cockpit.to.x - cockpit.from.x;
      const canopy = new THREE.Mesh(
        new THREE.OctahedronGeometry(1, 0).scale(
          length / 2,
          1.6,
          cockpit.width * 1.3
        ),
        this.canopyMaterial
      );
      canopy.position.set(
        cockpit.from.x + length / 2,
        BASE_TOP + SPINE_DEPTH + BEVEL,
        0
      );
      this.ship.add(canopy);
    }

    geometry.nozzles.forEach((nozzle) => {
      const housing = new THREE.Mesh(
        new THREE.CylinderGeometry(
          nozzle.r,
          nozzle.r * 1.25,
          geometry.nozzleLength,
          8
        )
          .rotateZ(Math.PI / 2)
          .translate(
            nozzle.x - geometry.nozzleLength / 2,
            NOZZLE_HEIGHT,
            nozzle.y
          ),
        this.baseMaterial
      );
      housing.geometry.setAttribute('uv2', housing.geometry.getAttribute('uv'));
      // Hot throat: a glowing bead at the exit, lit even at idle.
      const throat = new THREE.Mesh(
        new THREE.SphereGeometry(nozzle.r * 0.8, 8, 6).translate(
          nozzle.exitX,
          NOZZLE_HEIGHT,
          nozzle.y
        ),
        this.nozzleMaterial
      );
      const flame = new THREE.Mesh(this.cone, this.flameMaterial);
      const core = new THREE.Mesh(this.cone, this.coreMaterial);
      flame.position.set(nozzle.exitX, NOZZLE_HEIGHT, nozzle.y);
      core.position.copy(flame.position);
      this.ship.add(housing, throat, flame, core);
      this.flames.push({ flame, core, r: nozzle.r });
    });

    // Strafe puffs at the fins' RCS ports, pointing outboard (as in 2D).
    geometry.rcsPorts.forEach((port) => {
      const puff = new THREE.Mesh(this.cone, this.puffMaterial);
      puff.position.set(port.x, BASE_TOP, port.y);
      puff.rotation.y = port.y < 0 ? -Math.PI / 2 : Math.PI / 2;
      puff.visible = false;
      this.ship.add(puff);
      this.puffs.push({ puff, left: port.y < 0 });
    });

    const ghostGeometry = mergePositions(THREE, bases);
    this.ghosts[0].geometry.dispose();
    this.ghosts.forEach((ghost) => {
      ghost.geometry = ghostGeometry;
    });

    this.ship.scale.setScalar(VISUAL_SCALE);
    this.light.position.set(
      (geometry.minNozzleX - 6) * VISUAL_SCALE,
      (NOZZLE_HEIGHT + 4) * VISUAL_SCALE,
      0
    );
    this.shield.scale.setScalar(geometry.extent * 1.7);
    this.dashRing.scale.setScalar(geometry.extent * 1.3);
    return geometry;
  }

  // One matte plate: `points` (ship-local, y → world z) extruded `depth` up
  // from `lift`; with `ridge` > 0 its top slopes down away from the spine.
  addPlate(points, depth, lift, ridge, material) {
    const { THREE } = this;
    // Shape in (x, −y) so rotateX(−π/2) puts height up and keeps y → z.
    const shape = new THREE.Shape();
    points.forEach((p, i) =>
      i ? shape.lineTo(p.x, -p.y) : shape.moveTo(p.x, -p.y)
    );
    shape.closePath();
    const solid = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: BEVEL,
      bevelSize: BEVEL,
      bevelSegments: 1,
    });
    const position = solid.getAttribute('position');
    for (let i = 0; i < position.count; i += 1) {
      const z = Math.max(0, position.getZ(i));
      const slope = ridge
        ? 1 - 0.7 * Math.min(1, Math.abs(position.getY(i)) / ridge)
        : 1;
      position.setZ(i, lift + z * slope);
    }
    solid.rotateX(-Math.PI / 2);
    solid.computeVertexNormals();
    solid.setAttribute('uv2', solid.getAttribute('uv'));
    this.ship.add(new THREE.Mesh(solid, material));
    return solid;
  }

  // Thin cyan line on the prow's outer edge and on the fins' trailing edges
  // (edges whose outward normal points aft), just above the base plate.
  addEdges(panel, spine, noseX) {
    const { THREE } = this;
    const { points } = panel;
    const prow = spine && points.some((p) => p.x === noseX);
    if (spine && !prow) return;
    const cx = points.reduce((n, p) => n + p.x, 0) / points.length;
    const cy = points.reduce((n, p) => n + p.y, 0) / points.length;
    const segments = [];
    points.forEach((a, i) => {
      const b = points[(i + 1) % points.length];
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      let nx = (b.y - a.y) / length;
      let ny = -(b.x - a.x) / length;
      if (nx * ((a.x + b.x) / 2 - cx) + ny * ((a.y + b.y) / 2 - cy) < 0) {
        nx = -nx;
        ny = -ny;
      }
      if (prow ? nx > 0.1 && Math.abs(ny) > 0.1 : nx < -0.6) {
        segments.push(
          new THREE.Vector3(a.x, BASE_TOP + 0.05, a.y),
          new THREE.Vector3(b.x, BASE_TOP + 0.05, b.y)
        );
      }
    });
    if (!segments.length) return;
    this.ship.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(segments),
        this.edgeMaterial
      )
    );
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
    this.turret.visible = player.controlScheme === 'modern';
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

    this.shield.visible = Boolean(player.isShieldActive);
    if (this.shield.visible) {
      const impact = time - this.shieldHitAt < SHIELD_FLASH_S;
      this.shield.material.color.copy(
        impact ? this.shieldFlashRgb : this.shieldRgb
      );
      this.shield.material.opacity = impact
        ? 0.9
        : 0.25 + 0.12 * Math.sin(time * 4);
    }

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
    this.dashRing.visible = dashShield;

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

  /** `time` in seconds, same clock as update(). */
  flashShield(time) {
    this.shieldHitAt = time;
  }

  /** A shot left the nose: bump the ship light for a few frames. */
  flashMuzzle() {
    this.muzzleFrames = MUZZLE_LIGHT_FRAMES;
  }

  /** Quality preset: the baked hull maps on or off (one recompile). */
  setSurfaceMaps(enabled) {
    if (enabled === this.surfaceMaps) return;
    this.surfaceMaps = enabled;
    [this.baseMaterial, this.finMaterial, this.spineMaterial].forEach(
      (material) => {
        Object.keys(this.hullMaps).forEach((name) => {
          material[name] = enabled ? this.hullMaps[name] : null;
        });
        material.needsUpdate = true;
      }
    );
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
