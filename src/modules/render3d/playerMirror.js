// The Interceptor in 3D (docs/NORTE.md §3): the hull panels of shipModels.js
// extruded into a faceted gunmetal wedge (ridge along the spine), dark panel
// seams, a thin cyan rim (line + fresnel), and the only light on it — the
// thrusters (emissive cones, a cyan point light and a ribbon trail). Dash
// afterimages, the invulnerability blink and the shield impact flash mirror
// the 2D PlayerSystem render.

import {
  DASH_GHOST_COUNT,
  DASH_GHOST_LIFE,
} from '../../data/constants/gameplay.js';
import { PALETTE } from '../../data/constants/palette.js';
import { SHIP_MAX_SPEED } from '../../data/constants/physics.js';
import { HALF_H, HALF_W, colorOf, rgbOf } from './batches.js';

const HULL_DEPTH = 6;
// Visual only: collision keeps the 2D outline.
const SHIP_SCALE = 1.25;
const TRAIL_MIN = 12;
const TRAIL_LENGTH = 22;
const MAX_BANK = 0.45;
const BLINK_HZ = 8;
const SHIELD_FLASH_S = 0.08;
const GHOST_ALPHA = 0.5;
// proposta 17/10: each shot bumps the ship light for a couple of frames.
const MUZZLE_LIGHT = 1.6;
const MUZZLE_LIGHT_FRAMES = 2;

// Cyan fresnel rim on the hull (silhouette against the dark field) plus the
// white invulnerability pulse, both as emissive.
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
      totalEmissiveRadiance += uRim * pow(rim, 3.0) + vec3(uBlink);`
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

    // Lighter and less metallic than the enemies' plates, so the key light
    // reads on it at gameplay zoom.
    this.hullMaterial = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, PALETTE.hullLit).lerp(
        colorOf(THREE, PALETTE.neutral),
        0.3
      ),
      metalness: 0.3,
      roughness: 0.5,
      flatShading: true,
    });
    this.hullMaterial.userData.uRim = {
      value: colorOf(THREE, PALETTE.player).multiplyScalar(0.55),
    };
    this.hullMaterial.userData.uBlink = { value: 0 };
    this.hullMaterial.onBeforeCompile = patchHull;
    this.seamMaterial = new THREE.LineBasicMaterial({
      color: colorOf(THREE, PALETTE.rockShadow),
    });
    this.rimMaterial = new THREE.LineBasicMaterial({
      color: colorOf(THREE, PALETTE.player).multiplyScalar(0.9),
      toneMapped: false,
    });
    this.flameMaterial = new THREE.MeshBasicMaterial({
      color: colorOf(THREE, PALETTE.player).multiplyScalar(1.7),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.coreMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.5, 1.6, 1.6),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });

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
      ghost.scale.setScalar(SHIP_SCALE);
      scene.add(ghost);
      this.ghosts.push(ghost);
    }
    this.ghostRgb = colorOf(THREE, PALETTE.player);
    this.dashGuard = false;

    this.hullKey = null;
    this.flames = [];
    this.trailX = new Float32Array(TRAIL_LENGTH);
    this.trailY = new Float32Array(TRAIL_LENGTH);
    this.trailCount = 0;
    this.trailHead = 0;
    this.thrustRgb = rgbOf(THREE, PALETTE.player);
  }

  // Rebuilds the meshes when the hull or its visual-upgrade levels change.
  build(player, levels) {
    const hull = player.currentHull;
    const key = `${hull.id}|${levels.thruster}|${levels.rcs}|${levels.braking}`;
    if (key === this.hullKey) return this.geometry;
    this.hullKey = key;
    return this.seeded(() => this.rebuild(player, hull, levels));
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

    const maxY = geometry.maxY || 1;
    const solids = [];
    geometry.panels.forEach((panel) => {
      // Shape in (x, −y) so rotateX(−π/2) puts height up and keeps y → z.
      const shape = new THREE.Shape();
      panel.points.forEach((p, i) =>
        i ? shape.lineTo(p.x, -p.y) : shape.moveTo(p.x, -p.y)
      );
      shape.closePath();
      const solid = new THREE.ExtrudeGeometry(shape, {
        depth: HULL_DEPTH,
        bevelEnabled: true,
        bevelThickness: 1,
        bevelSize: 0.6,
        bevelSegments: 1,
      });
      // Ridge along the spine: the top slopes down toward the panel edges.
      const position = solid.getAttribute('position');
      for (let i = 0; i < position.count; i += 1) {
        const z = position.getZ(i);
        if (z <= 0) continue;
        const ridge = 1 - 0.65 * Math.min(1, Math.abs(position.getY(i)) / maxY);
        position.setZ(i, z * ridge);
      }
      solid.rotateX(-Math.PI / 2);
      solid.computeVertexNormals();
      this.ship.add(new THREE.Mesh(solid, this.hullMaterial));
      solids.push(solid);
      this.ship.add(
        new THREE.LineSegments(
          new THREE.EdgesGeometry(solid, 30),
          this.seamMaterial
        )
      );
    });

    const outline = player.getHullOutline();
    if (outline.length > 2) {
      const rim = new THREE.BufferGeometry().setFromPoints(
        outline.map((p) => new THREE.Vector3(p.x * 1.1, 0.2, p.y * 1.1))
      );
      this.ship.add(new THREE.LineLoop(rim, this.rimMaterial));
    }

    const { cockpit } = geometry;
    if (cockpit) {
      const length = cockpit.to.x - cockpit.from.x;
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(length, 1, cockpit.width * 2),
        new THREE.MeshBasicMaterial({
          color: colorOf(THREE, PALETTE.player).multiplyScalar(0.55),
          toneMapped: false,
        })
      );
      glass.position.set(cockpit.from.x + length / 2, HULL_DEPTH + 0.6, 0);
      this.ship.add(glass);
    }

    geometry.nozzles.forEach((nozzle) => {
      const housing = new THREE.Mesh(
        new THREE.CylinderGeometry(
          nozzle.r,
          nozzle.r * 1.2,
          geometry.nozzleLength,
          8
        )
          .rotateZ(Math.PI / 2)
          .translate(
            nozzle.x - geometry.nozzleLength / 2,
            HULL_DEPTH * 0.4,
            nozzle.y
          ),
        this.hullMaterial
      );
      const flame = new THREE.Mesh(this.cone, this.flameMaterial);
      const core = new THREE.Mesh(this.cone, this.coreMaterial);
      flame.position.set(nozzle.exitX, HULL_DEPTH * 0.4, nozzle.y);
      core.position.copy(flame.position);
      this.ship.add(housing, flame, core);
      this.flames.push({ flame, core, r: nozzle.r });
    });

    const ghostGeometry = mergePositions(THREE, solids);
    this.ghosts[0].geometry.dispose();
    this.ghosts.forEach((ghost) => {
      ghost.geometry = ghostGeometry;
    });

    this.ship.scale.setScalar(SHIP_SCALE);
    this.light.position.set(
      (geometry.minNozzleX - 6) * SHIP_SCALE,
      HULL_DEPTH + 4,
      0
    );
    this.shield.scale.setScalar(geometry.extent * 1.7);
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
    const lateral = (-v.vx * sin + v.vy * cos) / SHIP_MAX_SPEED;
    const bank = lateral * 0.5 + (player.angularVelocity || 0) * 0.08;
    this.group.rotation.x = Math.max(-MAX_BANK, Math.min(MAX_BANK, bank));

    const main = thrust.main || 0;
    const length = (5 + 15 * main) * (1 + 0.1 * (levels.thruster || 0));
    for (let i = 0; i < this.flames.length; i += 1) {
      const { flame, core, r } = this.flames[i];
      const flicker = 0.9 + 0.1 * Math.sin(time * 40 + i * 1.7);
      flame.visible = main > 0.02;
      core.visible = flame.visible;
      flame.scale.set(length * flicker, r * 0.9, r * 0.9);
      core.scale.set(length * 0.45, r * 0.4, r * 0.4);
    }
    this.flameMaterial.opacity = Math.min(1, main * 1.2);
    this.coreMaterial.opacity = Math.min(1, main);
    this.light.intensity =
      2.4 * main + (this.muzzleFrames > 0 ? MUZZLE_LIGHT : 0);
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
    this.hullMaterial.userData.uBlink.value =
      invulnerable && !this.dashGuard
        ? 0.35 * (1 + Math.sin(time * Math.PI * 2 * BLINK_HZ))
        : 0;

    this.updateGhosts(player.dashGhosts);

    // trail: nozzle exit in logical space, oldest first; longer at speed
    const speed = Math.min(1, Math.hypot(v.vx, v.vy) / SHIP_MAX_SPEED);
    const trailMax = Math.round(TRAIL_MIN + (TRAIL_LENGTH - TRAIL_MIN) * speed);
    const exitX = x + geometry.minNozzleX * SHIP_SCALE * cos;
    const exitY = y + geometry.minNozzleX * SHIP_SCALE * sin;
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
      ribbons.polyline(n, HULL_DEPTH * 0.4, this.thrustRgb, 5, 1.6 * main);
    }
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

  reset() {
    this.trailCount = 0;
    this.muzzleFrames = 0;
    this.dashGuard = false;
    this.hideGhosts();
  }
}
