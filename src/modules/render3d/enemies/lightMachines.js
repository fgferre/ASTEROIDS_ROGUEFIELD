// Two light machines' hulls (machines.js draws them): the Ram and
// Shade, shaped to be seen from any angle the camera takes —
// a top, sides, a back with dark nozzles and a designed underside — out of
// smooth lofted and turned parts (shapes.js) in the hull/dark tones, merged
// into each machine's one body (kit.body). Each model also says where its
// eye or lens sits (in a dark socket) and where its outline runs (its
// waist).

import {
  blade,
  bladeTop,
  loft,
  mirrorZ,
  nozzle,
  outline,
  pairs,
  seam,
  socket,
  spline,
  toned,
} from './shapes.js';

/**
 * Ram: a heavy arrowhead in layered armour — a thick dark slab, a raised
 * hull plate with a crest, a battering head over the nose, two barbs out to
 * the arrow's points, hull belly plates and a keel under it, twin dark
 * nozzles at its back — the lens hooded on the crest.
 */
export function ramModel(kit) {
  const { THREE } = kit;
  const lens = new THREE.Vector3(0.52, 0.39, 0);
  const look = new THREE.Vector3(1, 0.75, 0).normalize();
  // the white-hot core shows ahead of the lens even at full charge
  const core = lens.clone().addScaledVector(look, 0.17);
  const y = 0.1;
  const baseW = spline([
    -0.45, 0.58, -0.2, 0.56, 0.2, 0.45, 0.6, 0.31, 0.9, 0.18, 1.1, 0.07, 1.2,
    0.015,
  ]);
  const baseTop = spline([-0.45, 0.13, 0.6, 0.13, 1, 0.09, 1.2, 0.03]);
  const baseBottom = spline([-0.45, 0.1, 0.6, 0.1, 1, 0.07, 1.2, 0.025]);
  const headW = spline([0.7, 0.2, 1, 0.18, 1.2, 0.11, 1.32, 0.02]);
  const headTop = spline([0.7, 0.26, 1, 0.22, 1.2, 0.14, 1.32, 0.04]);
  const headBottom = spline([0.7, 0.15, 1, 0.14, 1.2, 0.1, 1.32, 0.03]);
  const parts = () => {
    const { hull, dark } = toned(kit.tones);
    const v = (x, yy, z) => new THREE.Vector3(x, yy, z);
    const along = (from, to, count, n, shape, caps) =>
      loft(THREE, count, n, (s) => shape(from + (to - from) * s), caps);
    const slab = along(
      -0.45,
      1.2,
      14,
      20,
      (x) => ({
        at: [x, y, 0],
        w: baseW(x),
        top: baseTop(x),
        bottom: baseBottom(x),
        e: 2.8,
      }),
      { start: 'flat', end: 'smooth' }
    );
    const plateAt = (x) => ({
      at: [x, y + baseTop(x) * 0.5, 0],
      w: baseW(x) * 0.88 - 0.015,
      top: baseTop(x) + 0.07,
      bottom: 0.02,
      e: 2.6,
      ridge: 0.05,
    });
    const plate = along(-0.4, 1.08, 12, 18, plateAt, {
      start: 'flat',
      end: 'smooth',
    });
    // a seam splitting the plate, from beside the head back to its corner:
    // laid on the plate's face (its section's superellipse)
    const seamLine = Array.from({ length: 8 }, (_, i) => {
      const x = 0.62 - (0.98 * i) / 7;
      const z = 0.07 + (0.27 * i) / 7;
      const { at, w, top, e, ridge } = plateAt(x);
      const a = Math.min(1, z / w);
      const up =
        top * (1 - a ** e) ** (1 / e) + ridge * (1 - a ** (e / 2)) ** 2;
      return v(x, at[1] + up, z);
    });
    const plateSeam = seam(THREE, seamLine, 0.02, 0.012);
    const head = along(
      0.7,
      1.32,
      9,
      16,
      (x) => ({
        at: [x, 0.14, 0],
        w: headW(x),
        top: headTop(x),
        bottom: headBottom(x),
        e: 3,
        ridge: 0.03,
      }),
      { start: 'flat', end: 'smooth' }
    );
    const belly = along(
      -0.35,
      0.95,
      10,
      14,
      (x) => ({
        at: [x, y - baseBottom(x) * 0.55, 0],
        w: baseW(x) * 0.72,
        top: 0.01,
        bottom: baseBottom(x) * 0.45 + 0.03,
        e: 2.6,
      }),
      { start: 'smooth', end: 'smooth' }
    );
    const keel = along(
      -0.25,
      1,
      8,
      8,
      (x) => {
        const k = Math.sin((Math.PI * (x + 0.25)) / 1.25) ** 0.5;
        return {
          at: [x, y - baseBottom(x) - 0.02, 0],
          w: 0.06 * k + 0.01,
          top: 0.03,
          bottom: 0.035 * k + 0.005,
          e: 2.6,
        };
      },
      { start: 'smooth', end: 'smooth' }
    );
    // a barb: its rounded edge out and forward, the sharp one in, from
    // inside the slab's back corner to the arrow's point
    const barb = blade(
      THREE,
      [
        [-0.12, 0.57, -0.42, 0.36, 0.2],
        [-0.4, 0.69, -0.6, 0.55, 0.15],
        [-0.66, 0.8, -0.78, 0.7, 0.1],
        [-0.92, 0.89, -0.95, 0.86, 0.03],
      ].map(([lx, lz, tx, tz, thick], i) => {
        const h = 0.12 - 0.007 * i;
        return { le: v(lx, h, lz), te: v(tx, h, tz), thick, up: v(0, 1, 0) };
      }),
      14,
      0.7
    );
    return [
      dark(slab),
      hull(plate),
      dark(plateSeam),
      dark(mirrorZ(plateSeam)),
      dark(head),
      hull(belly),
      dark(keel),
      hull(barb),
      hull(mirrorZ(barb)),
      dark(socket(THREE, lens, look, 0.12, 14)),
      dark(nozzle(THREE, v(-0.47, 0.12, 0.2), v(-1, 0, 0), 0.1, 12)),
      dark(nozzle(THREE, v(-0.47, 0.12, -0.2), v(-1, 0, 0), 0.1, 12)),
    ];
  };
  // its outline at the waist: battering head, the slab's edge, out along a
  // barb to its point and back in past the nozzles
  const rim = outline(
    THREE,
    [
      1.37, 0, 1.2, 0.13, 0.95, 0.22, 0.6, 0.36, 0.2, 0.5, -0.2, 0.63, -0.55,
      0.79, -0.98, 0.92, -0.8, 0.66, -0.52, 0.5, -0.5, 0.33, -0.58, 0.3, -0.58,
      0.1, -0.5, 0,
    ],
    0.1
  );
  return { parts, lens, core, rim };
}

/**
 * Shade: a crescent blade — a slim body blended into two scythe wings that
 * droop to their points with a notch in the trailing edge, a swept dorsal
 * fin, a dark keel and two small exhausts — its eye in a socket on the
 * spine.
 */
export function shadeModel(kit) {
  const { THREE } = kit;
  const eye = new THREE.Vector3(0.54, 0.2, 0);
  const eyeSize = 0.105;
  const y = 0.1;
  const bodyW = spline([
    -0.76, 0.04, -0.5, 0.14, -0.2, 0.22, 0.15, 0.24, 0.5, 0.19, 0.85, 0.11, 1.1,
    0.05, 1.26, 0.008,
  ]);
  const bodyTop = spline([
    -0.76, 0.02, -0.5, 0.05, -0.2, 0.08, 0.15, 0.095, 0.5, 0.085, 0.85, 0.06,
    1.1, 0.03, 1.26, 0.008,
  ]);
  const le = spline([
    0.08, 0.95, 0.2, 0.68, 0.45, 0.2, 0.7, -0.3, 0.88, -0.7, 0.97, -0.95,
  ]);
  const te = spline([
    0.08, -0.62, 0.2, -0.47, 0.3, -0.45, 0.45, -0.55, 0.7, -0.76, 0.88, -0.9,
    0.97, -0.97,
  ]);
  const parts = () => {
    const { hull, dark } = toned(kit.tones);
    const v = (x, yy, z) => new THREE.Vector3(x, yy, z);
    const body = loft(
      THREE,
      16,
      16,
      (s) => {
        const x = -0.76 + 2.02 * s;
        return {
          at: [x, y, 0],
          w: bodyW(x),
          top: bodyTop(x),
          bottom: bodyTop(x) * 0.7,
          e: 2,
          ridge: 0.045,
        };
      },
      { start: 'smooth', end: 'smooth' }
    );
    const span = [0.08, 0.2, 0.32, 0.45, 0.58, 0.7, 0.8, 0.88, 0.94, 0.97];
    const wingStations = span.map((z) => {
      const t = z / 0.97;
      const h = y - 0.005 - 0.1 * t * t;
      return {
        le: v(le(z), h, z),
        te: v(te(z), h, z),
        thick: 0.12 * (1 - 0.88 * t),
        up: v(0, 1, 0),
      };
    });
    const wing = blade(THREE, wingStations, 14);
    // a dark line sweeping out along the blade, root to near the point
    const spar = seam(
      THREE,
      wingStations.slice(1, -2).map((station) => bladeTop(station, 0.3))
    );
    // a fin on the spine: rows of leading and trailing x, root to tip
    const fin = (rows, at) =>
      blade(
        THREE,
        pairs(rows).map(([front, back], i, all) => {
          const t = i / (all.length - 1);
          return {
            le: at(front, t),
            te: at(back, t),
            thick: 0.045 - 0.025 * t,
            up: v(0, 0, 1),
          };
        }),
        10,
        1
      );
    const dorsal = fin([-0.05, -0.72, -0.55, -0.84], (x, t) =>
      v(x, 0.17 + 0.17 * t, 0)
    );
    const keel = fin([0.45, -0.5, 0.15, -0.46], (x, t) =>
      v(x, y - 0.03 - 0.1 * t, 0)
    );
    const exhaust = nozzle(THREE, v(-0.5, y, 0.14), v(-1, 0, 0.1), 0.05, 10);
    return [
      hull(body),
      hull(wing),
      hull(mirrorZ(wing)),
      dark(spar),
      dark(mirrorZ(spar)),
      hull(dorsal),
      dark(keel),
      dark(exhaust),
      dark(mirrorZ(exhaust)),
      dark(socket(THREE, eye, v(1, 0.9, 0), eyeSize, 12)),
    ];
  };
  // its outline at the wings' root: nose, the leading edge out to the
  // point, back along the trailing edge's notch to the tail
  const rim = outline(
    THREE,
    [
      1.3, 0, 0.75, 0.22, 0.25, 0.44, -0.25, 0.68, -0.7, 0.88, -1.02, 1.02,
      -0.8, 0.72, -0.56, 0.46, -0.47, 0.27, -0.62, 0.1, -0.8, 0,
    ],
    0.06
  );
  return { parts, eye, eyeSize, rim };
}
