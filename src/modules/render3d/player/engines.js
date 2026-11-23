// The player ship's main engines (playerMirror.js): a glowing throat in each
// bell, flames with a white core that stretch with thrust and grow longer and
// tighter per Propulsors level (pressure diamonds from SHOCK_LEVEL), the
// start burst, the failing hull's sputter and embers, the ship light and the
// ribbon trail behind the nozzles.

import { PALETTE } from '../../../data/constants/palette.js';
import { SHIP_MAX_SPEED } from '../../../data/constants/physics.js';
import { colorOf, rgbOf } from '../batches.js';
import { NOZZLE_HEIGHT, VISUAL_SCALE, throatGeometry } from '../hullModel.js';

const TRAIL_MIN = 12;
const TRAIL_LENGTH = 22;
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
export const CRUISE_SCALE = 0.75;
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
// proposta 17/10: each shot bumps the ship light for a couple of frames.
const MUZZLE_LIGHT = 1.6;

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// Deterministic 0..1 noise for the render (never the sim's RNG).
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// The additive glow the flames, throats and jets burn in.
export const glow = (THREE) =>
  new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

// The flame, core, throat, shock and ember materials, the flame cone and
// the lozenge, and the ship light.
export function createEngines(mirror, THREE) {
  mirror.flameMaterial = glow(THREE);
  mirror.coreMaterial = glow(THREE);
  mirror.nozzleMaterial = glow(THREE);
  mirror.accent = new THREE.Color();
  mirror.warmLight = new THREE.Color(1, 0.85, 0.7);

  const cone = new THREE.ConeGeometry(1, 1, 12, 1, true);
  cone.rotateZ(Math.PI / 2);
  cone.translate(-0.5, 0, 0);
  mirror.cone = cone;
  // a lozenge for the shock diamonds and the sputter embers
  mirror.diamond = new THREE.OctahedronGeometry(1, 0);
  mirror.diamond.userData.cached = true;
  mirror.shockMaterial = glow(THREE);
  mirror.emberMaterial = glow(THREE);
  mirror.flameShape = { length: 1, width: 1 };
  mirror.embers = [];

  mirror.light = new THREE.PointLight(
    colorOf(THREE, PALETTE.player),
    0,
    150,
    2
  );
  mirror.group.add(mirror.light);
}

// The thruster trail's ring of nozzle-exit points.
export function createTrail(mirror, THREE) {
  mirror.trailX = new Float32Array(TRAIL_LENGTH);
  mirror.trailY = new Float32Array(TRAIL_LENGTH);
  mirror.trailCount = 0;
  mirror.trailHead = 0;
  mirror.thrustRgb = rgbOf(THREE, PALETTE.player);
}

// Each nozzle's throat, flame, core and (from SHOCK_LEVEL) shock diamonds,
// then the sputter embers.
export function addFlames(mirror, geometry, levels) {
  const { THREE } = mirror;
  geometry.nozzles.forEach((nozzle) => {
    // Hot throat: a glowing lens in the bell's mouth, lit even at idle.
    const throat = new THREE.Mesh(
      throatGeometry(THREE, nozzle),
      mirror.nozzleMaterial
    );
    const flame = new THREE.Mesh(mirror.cone, mirror.flameMaterial);
    const core = new THREE.Mesh(mirror.cone, mirror.coreMaterial);
    flame.position.set(nozzle.exitX, NOZZLE_HEIGHT, nozzle.y);
    core.position.copy(flame.position);
    mirror.ship.add(throat, flame, core);
    const shocks = [];
    if (levels.thruster >= SHOCK_LEVEL) {
      SHOCK_AT.forEach(() => {
        const shock = new THREE.Mesh(mirror.diamond, mirror.shockMaterial);
        shock.position.copy(flame.position);
        mirror.ship.add(shock);
        shocks.push(shock);
      });
    }
    mirror.flames.push({ flame, core, shocks, r: nozzle.r, x: nozzle.exitX });
  });
  for (let i = 0; i < SPUTTER_EMBERS; i += 1) {
    const ember = new THREE.Mesh(mirror.diamond, mirror.emberMaterial);
    ember.visible = false;
    mirror.ship.add(ember);
    mirror.embers.push(ember);
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
export function lightEngines(
  mirror,
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
    mirror.flameShape.length;
  const width =
    (1 - LEVEL_TIGHTEN * level) *
    (1 + BURST_WIDTH * kick) *
    mirror.flameShape.width;
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
  for (let i = 0; i < mirror.flames.length; i += 1) {
    const { flame, core, shocks, r } = mirror.flames[i];
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
  lightEmbers(mirror, danger, time);
  mirror.flameMaterial.opacity = Math.min(1, main * 1.2);
  mirror.coreMaterial.opacity =
    Math.min(1, main * 1.1) * (1 - LEVEL_THIN * level);
  mirror.flameMaterial.color
    .copy(mirror.accent)
    .multiplyScalar(1.8 * (1 - LEVEL_DIM * level));
  const heat = 1.7 * (1 + BURST_HEAT * kick);
  mirror.coreMaterial.color.setRGB(heat, heat, heat * 0.94);
  mirror.shockMaterial.opacity = Math.min(1, main * 1.1);
  mirror.nozzleMaterial.color
    .copy(mirror.accent)
    .multiplyScalar(0.5 + 1.3 * main);
  mirror.light.color.copy(mirror.accent).lerp(mirror.warmLight, 0.35 * main);
  mirror.light.intensity =
    2.6 * main + (mirror.muzzleFrames > 0 ? MUZZLE_LIGHT : 0);
  if (danger > 0) {
    mirror.light.intensity *= stall
      ? 0.2
      : 1 - 0.5 * danger * hash(slot * 0.71);
  }
}

/**
 * How hard the pilot is accelerating, 0..1: his own thrust (not the
 * coast brake, not a dash) while the speed along the nose is far below
 * cruise (acceleration over damping, ~90 px/s).
 */
export function startBurst(mirror, player, cos, sin) {
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
function lightEmbers(mirror, danger, time) {
  for (let j = 0; j < mirror.embers.length; j += 1) {
    const ember = mirror.embers[j];
    const u = time / EMBER_LIFE + j / mirror.embers.length;
    const c = Math.floor(u);
    const phase = u - c;
    ember.visible = danger > 0 && hash(c * 5.3 + j * 11.1) < 0.2 + 0.7 * danger;
    if (!ember.visible) continue;
    const { flame, r } =
      mirror.flames[Math.floor(hash(c * 2.7 + j) * mirror.flames.length)];
    ember.position.set(
      flame.position.x - 1.5 - 12 * phase,
      flame.position.y + (hash(c + j * 3.3) - 0.5) * r,
      flame.position.z + (hash(c * 1.9 + j) - 0.5) * r * (0.5 + 2 * phase)
    );
    const size = r * 0.5 * (1 - phase);
    ember.scale.set(size * 1.8, size, size);
  }
}

// trail: nozzle exit in logical space, oldest first; longer at speed
export function updateTrail(mirror, player, ribbons, geometry, main, cos, sin) {
  const v = player.velocity || { vx: 0, vy: 0 };
  const { x, y } = player.position;
  const speed = Math.min(1, Math.hypot(v.vx, v.vy) / SHIP_MAX_SPEED);
  const trailMax = Math.round(TRAIL_MIN + (TRAIL_LENGTH - TRAIL_MIN) * speed);
  const exitX = x + geometry.minNozzleX * VISUAL_SCALE * cos;
  const exitY = y + geometry.minNozzleX * VISUAL_SCALE * sin;
  mirror.trailX[mirror.trailHead] = exitX;
  mirror.trailY[mirror.trailHead] = exitY;
  mirror.trailHead = (mirror.trailHead + 1) % TRAIL_LENGTH;
  mirror.trailCount = Math.min(TRAIL_LENGTH, mirror.trailCount + 1);
  if (main > 0.02 && mirror.trailCount > 1) {
    const n = Math.min(mirror.trailCount, trailMax);
    for (let i = 0; i < n; i += 1) {
      const k = (mirror.trailHead - n + i + TRAIL_LENGTH) % TRAIL_LENGTH;
      ribbons.px[i] = mirror.trailX[k];
      ribbons.py[i] = mirror.trailY[k];
    }
    ribbons.polyline(
      n,
      NOZZLE_HEIGHT * VISUAL_SCALE,
      mirror.thrustRgb,
      5,
      1.6 * main
    );
  }
}
