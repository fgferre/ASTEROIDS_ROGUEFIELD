// The player ship's guns (playerMirror.js): the dorsal turret turned to the
// sim's turret heading, or the cannon set into the nose; the multi-lock
// layers stacked on the turret's axis, one per lock past the primary; the
// recoil of the hull, the barrels and each layer; where a lock line leaves.

import { TURRET_PIVOT_X } from '../../../data/constants/physics.js';
import {
  buildTurret,
  buildTurretLayer,
  seatNoseGun,
  seatTurret,
} from '../hullModel.js';

// Each shot pushes the hull back along the nose for the muzzle frames.
const RECOIL_DIP = 2;
// Recoil of the barrels along the turret axis per shot (field units).
const TURRET_RECOIL = 1.2;
export const MUZZLE_LIGHT_FRAMES = 2;
// A turret layer's recoil after its shot: as long as the turret's own (two
// flash frames, then the light frames).
const LAYER_RECOIL_FRAMES = MUZZLE_LIGHT_FRAMES + 1;

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
}

// The hull's recoil dip, the turret turned to its heading and seated again
// when the aim moves, the barrels' recoil and the layers.
export function aimGuns(mirror, player, angle) {
  mirror.ship.position.x = mirror.muzzleFrames > 0 ? -RECOIL_DIP : 0;
  mirror.turret.position.x = TURRET_PIVOT_X + mirror.ship.position.x;
  mirror.turret.rotation.y = -(player.turretAngle - angle);
  if (player.noseAim !== mirror.noseGun) {
    seatGun(mirror, player.noseAim, player.currentHull);
  }
  mirror.barrels.position.x =
    mirror.barrelsX + (mirror.muzzleFrames > 0 ? -TURRET_RECOIL : 0);
  updateLayers(mirror, player.turretLayers, angle);
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
function updateLayers(mirror, headings, angle) {
  while (mirror.layers.length < headings.length) {
    const layer = buildTurretLayer(
      mirror.THREE,
      mirror.turretMaterials,
      mirror.tones,
      mirror.layers.length + 1
    );
    layer.frames = 0;
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
    layer.barrel.position.x = layer.frames > 0 ? -TURRET_RECOIL : 0;
    if (layer.frames > 0) layer.frames -= 1;
  }
}

/**
 * A shot flew off along (vx, vy): the turret layer turned closest to it
 * recoils (the turret's own barrels recoil on every shot already).
 */
export function recoilToward(mirror, player, vx, vy) {
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
  if (mirror.layers[best]) mirror.layers[best].frames = LAYER_RECOIL_FRAMES;
}

/**
 * Where lock `index`'s line leaves, in world units (a reused vector): the
 * turret's axis at the height of the barrel aimed at that lock, its
 * layer's past the primary; it tilts with the ship's bank.
 */
export function lockLineOrigin(mirror, index) {
  const layer = index > 0 ? mirror.layers[index - 1] : null;
  const [part, height] = layer?.group.visible
    ? [layer.group, layer.barrelY]
    : [mirror.turret, mirror.turretParts.barrelY + mirror.barrels.position.y];
  part.updateWorldMatrix(true, false);
  return part.localToWorld(mirror.lineOrigin.set(0, height, 0));
}
