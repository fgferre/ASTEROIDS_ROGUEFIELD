// The player ship's guns (playerMirror.js): the dorsal turret turned to the
// sim's turret heading, or the cannon set into the nose; the multi-lock
// layers stacked on the turret's axis, one per lock past the primary; the
// recoil of the barrels, each layer and the hull; where a lock line leaves.

import { TURRET_PIVOT_X } from '../../../data/constants/physics.js';
import {
  buildTurret,
  buildTurretLayer,
  seatNoseGun,
  seatTurret,
} from '../hullModel.js';

export const MUZZLE_LIGHT_FRAMES = 2;
// The recoil (Felipe's pick, corpo-da-nave-1, 23/11: "Canos + o casco
// cede"): each shot throws the barrels back at once and they come home on
// a spring (field units, s)...
const BARREL_KICK = 1.7;
const BARREL_MAX = 2.4;
const BARREL_RETURN_S = 0.075;
// ...and pushes the hull against the shot on a critically damped spring:
// about 1.2 units at 60 ms, home in some 0.35 s. Not under reduced motion.
const HULL_OMEGA = 16; // rad/s
const HULL_KICK = 52; // units/s per shot
// A fast gun's kicks pile up: the drawn hull never strays further than this
// from the sim's (all fire-rate cards stacked fire over 8 shots a second).
const HULL_MAX = 1.5;
// Only a shot leaving the ship kicks (a Scrap Rounds shard starts at its rock).
const SHIP_REACH = 45;

// The turret and the layer stack, on the ship's group.
export function createGuns(mirror, THREE) {
  // The turret, in the hull finishes; rebuild() seats it on each hull.
  mirror.turretParts = buildTurret(THREE, mirror.turretMaterials, mirror.tones);
  ({
    group: mirror.turret,
    housing: mirror.turretHousing,
    housingLow: mirror.turretHousingLow,
    barrels: mirror.barrels,
  } = mirror.turretParts);
  mirror.group.add(mirror.turret);
  // Multi-lock layers, built on first need and kept; the stack sits on the
  // turret's seat, lowered with its barrels on the low collar.
  mirror.layerStack = new THREE.Group();
  mirror.group.add(mirror.layerStack);
  mirror.layers = [];
  mirror.lineOrigin = new THREE.Vector3();
  mirror.recoil = {};
  resetRecoil(mirror);
}

/** Every barrel home, the hull in place, no shot waiting. */
export function resetRecoil(mirror) {
  Object.assign(mirror.recoil, {
    barrel: 0,
    shot: false,
    shotX: 0,
    shotY: 0,
    hullX: 0,
    hullY: 0,
    pushX: 0,
    pushY: 0,
  });
  mirror.layers.forEach((layer) => {
    layer.recoil = 0;
    layer.kicked = false;
  });
}

// The turret turned to its heading and seated again when the aim moves;
// the shots of this frame (recoilToward) kick the barrels and the hull,
// which spring back over `dt` s; `reduced`: the hull holds still.
export function aimGuns(mirror, player, angle, dt, reduced) {
  const recoil = mirror.recoil;
  const fade = Math.exp(-dt / BARREL_RETURN_S);
  recoil.barrel *= fade;
  if (recoil.shot)
    recoil.barrel = Math.min(BARREL_MAX, recoil.barrel + BARREL_KICK);
  mirror.turret.position.x = TURRET_PIVOT_X;
  mirror.turret.rotation.y = -(player.turretAngle - angle);
  if (player.noseAim !== mirror.noseGun) {
    seatGun(mirror, player.noseAim, player.currentHull);
  }
  mirror.barrels.position.x = mirror.barrelsX - recoil.barrel;
  updateLayers(mirror, player.turretLayers, angle, fade);
  if (reduced) {
    recoil.hullX = recoil.hullY = recoil.pushX = recoil.pushY = 0;
  } else {
    if (recoil.shot) {
      const length = Math.hypot(recoil.shotX, recoil.shotY) || 1;
      recoil.pushX -= (recoil.shotX / length) * HULL_KICK;
      recoil.pushY -= (recoil.shotY / length) * HULL_KICK;
    }
    springHull(recoil, dt);
    const off = Math.hypot(recoil.hullX, recoil.hullY);
    if (off > HULL_MAX) {
      recoil.hullX *= HULL_MAX / off;
      recoil.hullY *= HULL_MAX / off;
    }
    // field (x, y) is world (x, z)
    mirror.group.position.x += recoil.hullX;
    mirror.group.position.z += recoil.hullY;
  }
  recoil.shot = false;
  recoil.shotX = recoil.shotY = 0;
}

// The hull's spring, in small steps so a long frame stays stable.
function springHull(recoil, dt) {
  const steps = Math.max(1, Math.ceil(dt / 0.004));
  const h = dt / steps;
  for (let i = 0; i < steps; i += 1) {
    recoil.pushX +=
      (-HULL_OMEGA * HULL_OMEGA * recoil.hullX -
        2 * HULL_OMEGA * recoil.pushX) *
      h;
    recoil.pushY +=
      (-HULL_OMEGA * HULL_OMEGA * recoil.hullY -
        2 * HULL_OMEGA * recoil.pushY) *
      h;
    recoil.hullX += recoil.pushX * h;
    recoil.hullY += recoil.pushY * h;
  }
}

// The turret seated on the current hull or, with the cannon on the nose
// (`nose`, the sim's noseAim), the nose cannon set into the hull's nose
// with its muzzle on the sim's; seated again whenever the aim moves.
export function seatGun(mirror, nose, hull) {
  seatTurret(mirror.turretParts, hull.visual, mirror.built);
  mirror.barrelsX = nose
    ? seatNoseGun(mirror.turretParts, mirror.built, hull.noseMuzzle)
    : 0;
  mirror.noseGun = nose;
}

// One layer per sim heading (PlayerSystem turretLayers), turned like the
// turret; the rest hide.
function updateLayers(mirror, headings, angle, fade) {
  while (mirror.layers.length < headings.length) {
    const layer = buildTurretLayer(
      mirror.THREE,
      mirror.turretMaterials,
      mirror.tones,
      mirror.layers.length + 1
    );
    layer.recoil = 0;
    layer.kicked = false;
    mirror.layerStack.add(layer.group);
    mirror.layers.push(layer);
  }
  mirror.layerStack.position.set(
    mirror.turret.position.x,
    mirror.turret.position.y + mirror.barrels.position.y,
    0
  );
  for (let i = 0; i < mirror.layers.length; i += 1) {
    const layer = mirror.layers[i];
    layer.group.visible = i < headings.length;
    if (!layer.group.visible) continue;
    layer.group.rotation.y = -(headings[i] - angle);
    layer.recoil *= fade;
    if (layer.kicked) {
      layer.recoil = Math.min(BARREL_MAX, layer.recoil + BARREL_KICK);
      layer.kicked = false;
    }
    layer.barrel.position.x = -layer.recoil;
  }
}

/**
 * A shot flew off along (vx, vy) from `from`: if it left the ship, the
 * barrels and the hull take it at the next update (several in one frame, a
 * Scatter Coil's fan, are one kick), and the turret layer turned closest to
 * it recoils too.
 */
export function recoilToward(mirror, player, vx, vy, from) {
  const at = player.position;
  if (Math.hypot(from.x - at.x, from.y - at.y) > SHIP_REACH) return;
  const speed = Math.hypot(vx, vy) || 1;
  const recoil = mirror.recoil;
  recoil.shot = true;
  recoil.shotX += vx / speed;
  recoil.shotY += vy / speed;
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
  if (mirror.layers[best]) mirror.layers[best].kicked = true;
}

/**
 * Where lock `index`'s line leaves, in world units (a reused vector): the
 * turret's axis at the height of the barrel aimed at that lock, its
 * layer's past the primary; it tilts with the hull.
 */
export function lockLineOrigin(mirror, index) {
  const layer = index > 0 ? mirror.layers[index - 1] : null;
  const [part, height] = layer?.group.visible
    ? [layer.group, layer.barrelY]
    : [mirror.turret, mirror.turretParts.barrelY + mirror.barrels.position.y];
  part.updateWorldMatrix(true, false);
  return part.localToWorld(mirror.lineOrigin.set(0, height, 0));
}
