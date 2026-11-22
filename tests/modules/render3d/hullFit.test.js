import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_HULLS } from '../../../src/data/shipModels.js';
import { HullArt } from '../../../src/modules/player/hullArt.js';
import {
  VISUAL_SCALE,
  buildHullModel,
  buildTurret,
  hullTones,
  seatNoseGun,
  seatTurret,
} from '../../../src/modules/render3d/hullModel.js';

// The vendored r128 build is UMD: evaluated with an `exports` object it
// fills that object instead of a global.
const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

// The guns against each hull's 3D shape at every visual upgrade level, on a
// top-view grid (field units: the hull draws at VISUAL_SCALE, the guns
// unscaled).
const CELL = 0.2;
const LEVELS = [0, 1, 2, 3, 4, 5];

// Per grid cell, the highest (`pick` Math.max) or lowest (Math.min) height
// of the triangles over it.
function heightField(geometry, matrix, pick) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = flat.getAttribute('position');
  const v = new THREE.Vector3();
  const points = Array.from({ length: position.count }, (_, i) =>
    v.fromBufferAttribute(position, i).applyMatrix4(matrix).toArray()
  );
  const field = new Map();
  for (let t = 0; t < points.length; t += 3) {
    const [[ax, ay, az], [bx, by, bz], [cx, cy, cz]] = points.slice(t, t + 3);
    const det = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (Math.abs(det) < 1e-9) continue;
    const [i0, i1] = [Math.min(ax, bx, cx), Math.max(ax, bx, cx)];
    const [k0, k1] = [Math.min(az, bz, cz), Math.max(az, bz, cz)];
    for (let i = Math.floor(i0 / CELL); i <= Math.ceil(i1 / CELL); i += 1) {
      for (let k = Math.floor(k0 / CELL); k <= Math.ceil(k1 / CELL); k += 1) {
        const [x, z] = [i * CELL, k * CELL];
        const u = ((x - ax) * (cz - az) - (cx - ax) * (z - az)) / det;
        const w = ((bx - ax) * (z - az) - (x - ax) * (bz - az)) / det;
        if (u < -1e-6 || w < -1e-6 || u + w > 1 + 1e-6) continue;
        const y = ay + u * (by - ay) + w * (cy - ay);
        const key = `${i},${k}`;
        field.set(key, field.has(key) ? pick(field.get(key), y) : y);
      }
    }
  }
  return field;
}

// The lowest gap from the gun's underside (barrels, mantlet, lens hood) down
// to `top`, over the cells whose x passes `keep`.
function gapUnder(turret, top, keep = () => true) {
  turret.group.updateMatrixWorld(true);
  let gap = Infinity;
  turret.barrels.traverse((node) => {
    if (!node.isMesh || !node.visible) return;
    heightField(node.geometry, node.matrixWorld, Math.min).forEach((y, key) => {
      const x = Number(key.split(',')[0]) * CELL;
      if (top.has(key) && keep(x)) gap = Math.min(gap, y - top.get(key));
    });
  });
  return gap;
}

function built(hull, level) {
  const levels = { thruster: level, rcs: level, braking: level };
  const geometry = new HullArt().getHullGeometry(hull, levels);
  const model = buildHullModel(THREE, geometry);
  const scale = new THREE.Matrix4().makeScale(
    VISUAL_SCALE,
    VISUAL_SCALE,
    VISUAL_SCALE
  );
  const turret = buildTurret(
    THREE,
    new THREE.MeshBasicMaterial(),
    hullTones(THREE)
  );
  seatTurret(turret, hull.visual, model);
  return {
    model,
    turret,
    hullTop: heightField(model.hull, scale, Math.max),
    glassTop: heightField(model.canopy, scale, Math.max),
  };
}

describe('player hull fit', () => {
  const cases = ALL_HULLS.flatMap((hull) =>
    LEVELS.map((level) => [hull.id, level, hull])
  );

  it.each(cases)(
    '%s level %i: the dorsal turret clears the hull and the sensor glass all round',
    (_, level, hull) => {
      const { turret, hullTop, glassTop } = built(hull, level);
      for (let degrees = 0; degrees < 360; degrees += 5) {
        turret.group.rotation.y = (degrees * Math.PI) / 180;
        expect(gapUnder(turret, hullTop)).toBeGreaterThan(0.5);
        expect(gapUnder(turret, glassTop)).toBeGreaterThan(0.5);
      }
    }
  );

  it.each(cases)(
    '%s level %i: the nose cannon ends on the sim muzzle, clear of the nose',
    (_, level, hull) => {
      const { model, turret, hullTop } = built(hull, level);
      seatNoseGun(turret, model, hull.noseMuzzle);
      turret.group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(turret.barrels);
      expect(box.max.x).toBeCloseTo(hull.noseMuzzle, 1);
      // its rear lies in the nose; the last two units stand above it
      const front = (x) => x > hull.noseMuzzle - 2;
      expect(gapUnder(turret, hullTop, front)).toBeGreaterThan(0);
    }
  );
});
