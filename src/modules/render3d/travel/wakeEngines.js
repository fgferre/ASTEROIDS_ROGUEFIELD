// src/modules/render3d/travel/wakeEngines.js
//
// The Wake's engines (wakeStern.js): three round engines abreast on the
// engine block's after face, the middle one bigger — a cowl, a ribbed bell
// with gussets, and the fire inside (each engine its own light set, so the
// scene can make one fail).

import { ENGINE_TAIL as TAIL, WAKE_COLORS as C } from './wakeHull.js';

const ENGINES = [
  { z: -6.75, r: 3.05 },
  { z: 0, r: 3.4 },
  { z: 6.75, r: 3.05 },
];
const ENGINE_Y = -0.6;

export function buildEngines(kit) {
  const { V, add, box, lathe, plate, lamp, pool, paint } = kit;
  const face = TAIL.x;
  const aft = V(-1, 0, 0);
  ENGINES.forEach(({ z, r }, i) => {
    const at = V(face + 0.2, ENGINE_Y, z);
    const along = (d) => V(at.x - d, at.y, at.z);
    // An eight-sided cowl, then the ribbed bell.
    add(
      'hull',
      lathe(
        [
          [r * 1.17, 0],
          [r * 1.17, 1.1],
          [r * 1.06, 1.6],
        ],
        8,
        at,
        aft
      ),
      paint(i === 1 ? C.grey : C.orange)
    );
    add(
      'hull',
      lathe(
        [
          [0.72, 0],
          [0.86, 0.7],
          [0.92, 0.7],
          [0.92, 1.2],
          [0.86, 1.2],
          [0.9, 1.8],
          [0.97, 1.8],
          [0.97, 2.4],
          [0.9, 2.4],
          [0.95, 3.2],
          [1.0, 3.2],
          [1.0, 4.1],
          [0.94, 4.3],
        ].map(([k, d]) => [k * r, d]),
        24,
        at,
        aft
      ),
      paint(C.mid),
      { shine: { roughness: 0.5, metalness: 0.55 } }
    );
    // Gussets from the cowl down the bell.
    for (let n = 0; n < 8; n += 1) {
      const a = ((n + 0.5) / 8) * Math.PI * 2;
      const out = (d, k) =>
        V(at.x - d, at.y + Math.cos(a) * k * r, at.z + Math.sin(a) * k * r);
      add(
        'hull',
        plate(
          [out(1.1, 1.16), out(3.0, 1.03), out(3.0, 0.9), out(1.1, 0.88)],
          -0.06,
          0.12
        ),
        paint(n % 2 ? C.grey : C.dark)
      );
    }
    // The fire inside: the bell's wall glowing hotter toward the throat,
    // dark rings standing in it, a white core.
    const set = `engine${i}`;
    const steps = 24;
    for (let n = 0; n < steps; n += 1) {
      const [t0, t1] = [n / steps, (n + 1) / steps];
      const k = (t) => 0.93 - 0.63 * t;
      const d = (t) => 4.2 - 3.3 * t;
      add(
        set,
        lathe(
          [
            [k(t0) * r, d(t0)],
            [k(t1) * r, d(t1)],
          ],
          24,
          at,
          aft
        ),
        paint('#2f8fff', 0.045 * 60 ** ((n + 0.5) / steps)),
        { uv: false, smooth: true }
      );
    }
    [
      [0.8, 3.45],
      [0.63, 2.55],
      [0.46, 1.65],
    ].forEach(([k, d]) =>
      add(
        set,
        lathe(
          [
            [(k - 0.03) * r, d + 0.02],
            [(k + 0.03) * r, d],
          ],
          24,
          at,
          aft
        ),
        paint('#020a12'),
        { uv: false, smooth: true }
      )
    );
    // Vanes down the throat, dark against the fire.
    for (let n = 0; n < 12; n += 1) {
      const a = (n / 12) * Math.PI * 2;
      const out = (d, k) =>
        V(at.x - d, at.y + Math.cos(a) * k * r, at.z + Math.sin(a) * k * r);
      add(
        set,
        plate(
          [out(4.0, 0.9), out(4.0, 0.74), out(2.0, 0.42), out(2.0, 0.52)],
          -0.03,
          0.06
        ),
        paint('#020a12'),
        { uv: false }
      );
    }
    add(
      `${set}Pools`,
      pool(along(0.95), aft, r * 0.46),
      paint('#dcefff', 2.4),
      {
        uv: false,
      }
    );
    add(`${set}Pools`, pool(along(2.6), aft, r * 0.9), paint(C.engine, 0.45), {
      uv: false,
    });
    add(`${set}Pools`, pool(along(4.5), aft, r * 1.7), paint(C.engine, 0.22), {
      uv: false,
    });
  });
  // Fins between the engines, a brow over them and a lip under.
  [3.55, -3.55].forEach((z) => {
    add(
      'hull',
      box(face - 2.2, face, -3.6, 2.6, z - 0.12, z + 0.12),
      paint(C.grey)
    );
    lamp('lamps', V(face - 2.2, ENGINE_Y, z), aft, C.amber, {
      size: 0.14,
      spill: 0,
    });
  });
  [3.55, -3.55].forEach((z) => {
    add(
      'hull',
      box(face - 0.3, face, 1.5, 3.2, z - 1.3, z + 1.3),
      paint(C.light)
    );
    add(
      'hull',
      box(face - 0.4, face, 2.0, 2.7, z - 0.9, z + 0.9),
      paint(C.dark)
    );
    add(
      'hull',
      box(face - 0.3, face, -4.2, -3.0, z - 1.3, z + 1.3),
      paint(C.light)
    );
  });
  add('hull', box(face - 0.3, face, -4.2, 3.2, 9.75, 10.2), paint(C.orange), {
    mirror: true,
  });
  add('hull', box(face - 0.9, face, 3.2, 3.7, -9.6, 9.6), paint(C.grey));
  [-6.6, -2.2, 2.2, 6.6].forEach((z, n) => {
    add(
      'hull',
      box(face - 0.14, face, 3.85, 5.25, z - 2.05, z + 2.05),
      paint(n % 3 ? C.light : C.grey)
    );
    add(
      'hull',
      box(face - 0.14, face, -6.4, -4.75, z - 2.05, z + 2.05),
      paint(n % 2 ? C.grey : C.mid)
    );
    add(
      'hull',
      box(face - 0.24, face, 4.2, 4.9, z - 1.2, z + 1.2),
      paint(C.dark)
    );
  });
  add('hull', box(face - 0.5, face, -4.6, -4.2, -9.2, 9.2), paint(C.grey));
  [1, -1].forEach((s) => {
    lamp('lamps', V(face - 0.9, 3.45, 8.8 * s), aft, C.amber, {
      size: 0.16,
      spill: 0,
    });
    lamp('lamps', V(face - 0.9, 3.45, 2.6 * s), aft, C.amber, {
      size: 0.12,
      spill: 0,
    });
  });
  return ENGINES.map(({ z }) => [face - 4.2, ENGINE_Y, z]);
}
