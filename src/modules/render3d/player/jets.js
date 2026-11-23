// The player ship's small jets (playerMirror.js): the turn-jet needles at the
// RCS ports, snapping on and off with the turn and shaped by the RCS System
// level, and the retro flames blowing forward from the nose with the
// emergency brake's flare fan, shaped by the Braking System level.

import { getHullThrusterPort } from '../../player/hullShape.js';
import { HALF_H, HALF_W } from '../batches.js';
import { NOZZLE_HEIGHT, VISUAL_SCALE } from '../hullModel.js';
import { glow } from './engines.js';

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
export const TURN_KEYS = ['turnL', 'turnR'];

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

// The needle geometry, the jets' and retros' materials and the flare fan.
export function createJets(mirror, THREE, scene) {
  // The turn jets and retro flames: one needle geometry, white materials
  // tinted by its vertex colours; one per turn side so a fading needle and
  // a fresh one on the other flank keep their own strength.
  mirror.needle = needleGeometry(THREE);
  const tinted = () => {
    const material = glow(THREE);
    material.vertexColors = true;
    return material;
  };
  mirror.rcsJets = {
    turnL: { amount: 0, hold: 0, snap: 0, material: tinted() },
    turnR: { amount: 0, hold: 0, snap: 0, material: tinted() },
  };
  TURN_KEYS.forEach((k) =>
    mirror.rcsJets[k].material.color.setScalar(RCS_GLOW)
  );
  mirror.snapMaterial = tinted();
  mirror.retroMaterial = tinted();
  mirror.flareMaterial = tinted();
  mirror.retros = [];
  // the emergency brake's fan, in field space along the motion it stops
  // (the nose may have swung away by then); rays from the middle out
  mirror.flareFan = new THREE.Group();
  [0, -1, 1, -2, 2].forEach((ray) => {
    const mesh = new THREE.Mesh(mirror.needle, mirror.flareMaterial);
    mesh.rotation.y = Math.PI + ray * 0.42;
    mesh.userData.ray = Math.abs(ray);
    mirror.flareFan.add(mesh);
  });
  mirror.flareFan.visible = false;
  scene.add(mirror.flareFan);
  mirror.flareReady = false;
  mirror.flareDirX = 1;
  mirror.flareDirY = 0;
  mirror.flare = 0;
  mirror.braking = false;
  mirror.flareMaterial.color.setScalar(1.5);
}

// The needles painted in the hull's accent, set on its RCS ports, and the
// retros on its nose ports.
export function addJets(mirror, geometry, hull, built, levels) {
  // The turn couple (thrusters.js), blowing outboard: a wingtip needle at
  // each aft RCS port, lit when the nose swings away from its flank, and a
  // smaller one at each nose port (the hull's 2D spark port), lit when the
  // nose swings toward the other flank.
  paintNeedle(mirror.needle, mirror.accent);
  // the wingtip on the port flank and the starboard nose jet turn the nose
  // to port
  geometry.rcsPorts.forEach((port, i) =>
    addNeedles(mirror, built.tips[i], port.y < 0, 1, port.y < 0, levels.rcs)
  );
  ['noseLeft', 'noseRight'].forEach((kind) => {
    const { x, y } = getHullThrusterPort(kind, hull);
    addNeedles(
      mirror,
      [x / VISUAL_SCALE, NOZZLE_HEIGHT, y / VISUAL_SCALE],
      y < 0,
      NOSE_PUFF,
      y >= 0,
      levels.rcs
    );
  });
  addRetros(mirror, hull, levels.braking);
}

// One RCS port's needles, blowing outboard: the jet, a shorter twin
// inboard of it from level 3 and the ignition snap at level 5.
function addNeedles(mirror, position, port, size, turnL, level) {
  const { THREE } = mirror;
  const jet = mirror.rcsJets[turnL ? 'turnL' : 'turnR'];
  const make = (material, dx) => {
    const mesh = new THREE.Mesh(mirror.needle, material);
    mesh.position.fromArray(position);
    mesh.position.x += dx;
    mesh.rotation.y = port ? -Math.PI / 2 : Math.PI / 2;
    mesh.visible = false;
    mirror.ship.add(mesh);
    return mesh;
  };
  const inboard = position[0] > 0 ? -1 : 1;
  mirror.puffs.push({
    puff: make(jet.material, 0),
    size,
    turnL,
    length: Math.max(RCS_MIN_LENGTH, 4.5 + 2.2 * level) * size,
    radius: (0.7 - 0.06 * level) * size,
    twin: level >= 3 ? make(jet.material, 1.8 * inboard * size) : null,
    snap: level >= 5 ? make(mirror.snapMaterial, 0) : null,
  });
}

// Each side's needles at the pilot's turn (the raw step state, not
// the eased one): on at once, held RCS_HOLD_S, then out in RCS_FADE_S.
// The auto-brake's push across the hull lights a whole flank (thrusters.js).
export function lightNeedles(mirror, state, dt) {
  let snap = 0;
  for (let i = 0; i < TURN_KEYS.length; i += 1) {
    const jet = mirror.rcsJets[TURN_KEYS[i]];
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
  mirror.snapMaterial.opacity = snap / RCS_SNAP_S;
  const flank = [state.brakePort || 0, state.brakeStarboard || 0];
  for (let i = 0; i < mirror.puffs.length; i += 1) {
    const {
      puff,
      size,
      turnL,
      length,
      radius,
      twin,
      snap: flash,
    } = mirror.puffs[i];
    const jet = turnL ? mirror.rcsJets.turnL : mirror.rcsJets.turnR;
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
    const jet = mirror.rcsJets[TURN_KEYS[i]];
    jet.snap = Math.max(0, jet.snap - dt);
  }
}

// The retro pair at the nose ports, splayed outboard and blowing
// forward, longer, wider and splayed more per Braking System level (a
// second, outer pair from 2); at 3 the emergency brake's fan is armed.
function addRetros(mirror, hull, level) {
  const { THREE } = mirror;
  const add = (x, z, angle, length, radius) => {
    const mesh = new THREE.Mesh(mirror.needle, mirror.retroMaterial);
    mesh.position.set(x, NOZZLE_HEIGHT, z);
    mesh.rotation.y = Math.PI + angle;
    mesh.visible = false;
    mirror.ship.add(mesh);
    mirror.retros.push({ mesh, length, radius });
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
  mirror.flareReady = level >= 3;
}

// The retros at the eased retro `aux`, so the coast brake fades with
// speed. The emergency brake's start (Braking System 3) fires the fan for
// RETRO_FLARE_S: rays thrown ahead of the motion it stops, the middle one
// longest, snapping out and fading.
export function lightRetros(mirror, player, geometry, aux, dt) {
  const { brakeTimer, brakeFrom } = player.maneuvers;
  const braking = brakeTimer > 0;
  if (braking && !mirror.braking && mirror.flareReady) {
    mirror.flare = RETRO_FLARE_S;
    mirror.flareFan.rotation.y = -Math.atan2(brakeFrom.vy, brakeFrom.vx);
    mirror.flareDirX = Math.cos(-mirror.flareFan.rotation.y);
    mirror.flareDirY = Math.sin(-mirror.flareFan.rotation.y);
  }
  mirror.braking = braking;
  for (let i = 0; i < mirror.retros.length; i += 1) {
    const { mesh, length, radius } = mirror.retros[i];
    mesh.visible = aux > 0.02;
    mesh.scale.set(length * (0.6 + 0.4 * aux), radius, radius);
  }
  // Full from the Modern retro's whole share (0.7): a full key burns full.
  mirror.retroMaterial.opacity = Math.min(1, aux / 0.7);
  const f = mirror.flare / RETRO_FLARE_S;
  mirror.flare = Math.max(0, mirror.flare - dt);
  mirror.flareFan.visible = f > 0;
  if (f <= 0) return;
  const { x, y } = player.position;
  const ahead = geometry.extent * 0.4;
  mirror.flareFan.position.set(
    x + mirror.flareDirX * ahead - HALF_W,
    NOZZLE_HEIGHT * VISUAL_SCALE,
    y + mirror.flareDirY * ahead - HALF_H
  );
  const out = 1 - (1 - Math.min(1, (1 - f) * 4)) ** 2;
  const rays = mirror.flareFan.children;
  for (let i = 0; i < rays.length; i += 1) {
    const reach = FLARE_RAYS[rays[i].userData.ray];
    const width = 1.65 - 0.33 * rays[i].userData.ray;
    rays[i].scale.set(reach * (0.35 + 0.65 * out), width, width);
  }
  mirror.flareMaterial.opacity = f ** 0.8;
}
