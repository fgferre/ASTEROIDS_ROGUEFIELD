// Mirrors the field's chests (PickupSystem's list, kind 'chest';
// collectibles/chests.js): a matte dark casing whose seams, lock and crest
// are amber light, at a slow bob, in a soft halo and under a beam of light
// that climbs from it, so a chest reads from anywhere on the field. Touched,
// its light quickens; as the world slows the lid swings up on its back hinge
// and the inside blazes; spent, the beam and the light die out and it
// shrinks away. Units: the chest's radius (CHEST.radius); +z faces the
// camera. At most POOL drawn, each its own small group (a chest is rare).

import { PALETTE } from '../../data/constants/palette.js';
import { CHEST } from '../../data/pickups.js';
import { HALF_H, HALF_W, colorOf, rgbOf } from './batches.js';
import { mergeStatic } from './mergeStatic.js';
import { addRimLight } from './rimLight.js';

const POOL = 4;
const HOVER = 4; // world units over the field
const BOB = 1.4;
const LID_SWING = 1.95; // rad up and back, fully open
const HINGE = [0, 0.76, -0.66]; // the lid's back edge
const BEAM_HEIGHT = 9;
// proposta 20/10: light gains (× the amber) closed, touched and open; the
// beam's; the inside's at full open.
const SEAM_GAIN = { idle: 1.3, claimed: 2, open: 2.4 };
const BEAM_GAIN = { idle: 0.22, open: 0.7 };
const INSIDE_GAIN = 1.6;

// A box of footprint w × d (corners cut by `chamfer`) and height h, edges
// bevelled, standing on y = 0.
function casing(THREE, w, d, h, chamfer) {
  const bevel = Math.min(0.05, h / 4);
  const x = w / 2 - bevel;
  const z = d / 2 - bevel;
  const c = chamfer;
  const shape = new THREE.Shape();
  [
    [-x + c, -z],
    [x - c, -z],
    [x, -z + c],
    [x, z - c],
    [x - c, z],
    [-x + c, z],
    [-x, z - c],
    [-x, -z + c],
  ].forEach(([px, pz], i) => (i ? shape.lineTo(px, pz) : shape.moveTo(px, pz)));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: h - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bevel, 0);
  return geometry;
}

const box = (THREE, size, at, k) => ({
  geometry: new THREE.BoxGeometry(...size),
  position: at,
  color: new THREE.Color(k, k, k),
});

// The matte casing and the lid (the lid's frame: its hinge at the origin).
function bodyParts(THREE) {
  const hull = colorOf(THREE, PALETTE.hull);
  const lit = colorOf(THREE, PALETTE.hullLit);
  const mid = hull.clone().lerp(lit, 0.5);
  const part = (geometry, position, color) => ({ geometry, position, color });
  const lidZ = -HINGE[2];
  const ends = [-0.84, 0.84];
  return {
    casing: mergeStatic(THREE, [
      part(casing(THREE, 1.8, 1.1, 0.12, 0.12), [0, 0, 0], hull),
      part(casing(THREE, 2, 1.3, 0.68, 0.16), [0, 0.08, 0], lit),
      ...ends.map((x) =>
        part(casing(THREE, 0.24, 1.38, 0.72, 0.08), [x, 0.05, 0], mid)
      ),
    ]),
    lid: mergeStatic(THREE, [
      part(casing(THREE, 2.04, 1.34, 0.26, 0.18), [0, 0, lidZ], lit),
      part(casing(THREE, 1.46, 0.84, 0.07, 0.1), [0, 0.25, lidZ], hull),
      ...ends.map((x) =>
        part(casing(THREE, 0.26, 1.42, 0.3, 0.08), [x, -0.02, lidZ], mid)
      ),
    ]),
  };
}

// The amber light on the casing (seam under the lid, two front seams, the
// lock) and on the lid (its front seam, the panel's outline, the crest).
function lightParts(THREE) {
  const lidZ = -HINGE[2];
  const crest = new THREE.OctahedronGeometry(0.17);
  crest.scale(1, 0.45, 1);
  return {
    casing: mergeStatic(THREE, [
      box(THREE, [1.36, 0.045, 0.03], [0, 0.7, 0.66], 1),
      box(THREE, [1.36, 0.045, 0.03], [0, 0.7, -0.66], 0.8),
      box(THREE, [0.035, 0.4, 0.03], [-0.36, 0.38, 0.66], 0.8),
      box(THREE, [0.035, 0.4, 0.03], [0.36, 0.38, 0.66], 0.8),
      box(THREE, [0.22, 0.15, 0.05], [0, 0.5, 0.67], 1.5),
    ]),
    lid: mergeStatic(THREE, [
      box(THREE, [1.36, 0.04, 0.03], [0, 0.05, lidZ + 0.665], 1),
      box(THREE, [1.52, 0.03, 0.035], [0, 0.33, lidZ + 0.44], 0.85),
      box(THREE, [1.52, 0.03, 0.035], [0, 0.33, lidZ - 0.44], 0.85),
      box(THREE, [0.035, 0.03, 0.9], [-0.75, 0.33, lidZ], 0.85),
      box(THREE, [0.035, 0.03, 0.9], [0.75, 0.33, lidZ], 0.85),
      {
        geometry: crest,
        position: [0, 0.38, lidZ],
        color: new THREE.Color(1.6, 1.6, 1.6),
      },
    ]),
  };
}

// A hollow column of light, brightest at its foot (vertex brightness).
function beamGeometry(THREE, bottom, top, segments) {
  const geometry = new THREE.CylinderGeometry(
    top,
    bottom,
    BEAM_HEIGHT,
    segments,
    8,
    true
  );
  geometry.translate(0, BEAM_HEIGHT / 2 + 0.6, 0);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    // clamped: the top ring sits a rounding past 1, and a NaN colour
    // would spread through the bloom
    const t = Math.min(1, (position.getY(i) - 0.6) / BEAM_HEIGHT);
    colors.fill((1 - t) ** 1.8, i * 3, i * 3 + 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export class ChestMirror {
  constructor(THREE, scene) {
    this.THREE = THREE;
    const bodyMaterial = addRimLight(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.25,
        roughness: 0.72,
      })
    );
    const body = bodyParts(THREE);
    const light = lightParts(THREE);
    const inside = new THREE.PlaneGeometry(1.7, 1.02).rotateX(-Math.PI / 2);
    const beams = [beamGeometry(THREE, 0.32, 0.2, 12)];
    beams.push(beamGeometry(THREE, 0.9, 0.55, 16));
    this.views = Array.from({ length: POOL }, () => {
      const seams = new THREE.MeshBasicMaterial({
        vertexColors: true,
        toneMapped: false,
      });
      const glow = new THREE.MeshBasicMaterial({ toneMapped: false });
      const beam = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const group = new THREE.Group();
      const hinge = new THREE.Group();
      hinge.position.fromArray(HINGE);
      hinge.add(
        new THREE.Mesh(body.lid, bodyMaterial),
        new THREE.Mesh(light.lid, seams)
      );
      const insideMesh = new THREE.Mesh(inside, glow);
      insideMesh.position.y = 0.765;
      group.add(
        new THREE.Mesh(body.casing, bodyMaterial),
        new THREE.Mesh(light.casing, seams),
        insideMesh,
        hinge
      );
      // the beam stands up whatever the casing's sway
      const column = new THREE.Group();
      beams.forEach((geometry) => column.add(new THREE.Mesh(geometry, beam)));
      group.visible = false;
      column.visible = false;
      scene.add(group, column);
      return { group, hinge, column, seams, glow, beam };
    });
  }

  /** `pickups`: PickupSystem.getActivePickups(); `halo`: a glow PointBatch. */
  update(pickups, halo) {
    const amber = rgbOf(this.THREE, CHEST.color);
    let n = 0;
    for (let i = 0; i < pickups.length && n < POOL; i += 1) {
      const chest = pickups[i];
      if (chest.kind !== 'chest') continue;
      const view = this.views[n];
      n += 1;
      const r = chest.radius;
      const live = 1 - chest.fade;
      const beat = chest.claimed ? 7 : 2.2;
      const pulse = 1 + 0.18 * Math.sin(chest.age * beat + i);
      const h = HOVER + BOB * Math.sin(chest.age * 1.6 + i);
      const x = chest.x - HALF_W;
      const z = chest.y - HALF_H;

      view.group.visible = true;
      view.group.position.set(x, h, z);
      view.group.rotation.set(0, 0.25 + 0.08 * Math.sin(chest.age * 0.7), 0);
      // spent, it shrinks away in the last quarter of its fade
      view.group.scale.setScalar(r * Math.min(1, live * 4));
      view.hinge.rotation.x = -LID_SWING * easeOut(chest.open);

      const seam = chest.open
        ? SEAM_GAIN.open
        : chest.claimed
          ? SEAM_GAIN.claimed
          : SEAM_GAIN.idle;
      setColor(view.seams.color, amber, seam * pulse * live);
      setColor(view.glow.color, amber, INSIDE_GAIN * chest.open * live);

      const beam =
        BEAM_GAIN.idle + (BEAM_GAIN.open - BEAM_GAIN.idle) * chest.open;
      view.column.visible = live > 0.01;
      view.column.position.set(x, h, z);
      view.column.scale.setScalar(r);
      setColor(view.beam.color, amber, beam * pulse * live);

      halo?.push(
        chest.x,
        h,
        chest.y,
        amber,
        r * (3.2 + 2 * chest.open) * pulse,
        0.4 * live,
        1
      );
    }
    for (; n < POOL; n += 1) {
      this.views[n].group.visible = false;
      this.views[n].column.visible = false;
    }
  }
}

const easeOut = (t) => 1 - (1 - t) ** 3;

function setColor(color, rgb, gain) {
  color.setRGB(rgb[0] * gain, rgb[1] * gain, rgb[2] * gain);
}
