// Debris Wake (docs/ROTEIRO.md "Os lugares" 1): far outside the Ring, in the
// tail of its wreckage. The whole Ring small and broken in the distance, a
// cold small star off in a corner, and what the Ring let go of — torn
// panels, trusses, a module — drifting between them and the field. One piece
// in three carries the count's mark, a band across it, dark until the count
// passes: the Quarry Maw tallying the wreck piece by piece, left to right;
// when the Maw goes offline they give a last flash and go out, the nearest
// first (the stone goes uncounted).

import { gradientDisc } from './kit.js';
import { ringBand, under } from './pieces.js';

// proposta 12/11: the Ring's radius and its gap (radians), and the wreck's
// three depths (depth, follow, pieces, spread [x, z]).
const RING = { radius: 520, gap: [1.15, 2.05] };
const WRECK = [
  { depth: 900, follow: 0.18, count: 7, spread: [2600, 1900] },
  { depth: 1500, follow: 0.32, count: 16, spread: [2800, 2000] },
  { depth: 2300, follow: 0.55, count: 20, spread: [3400, 2400] },
];
// The count's marks (his pick on cenario-1, 20/11): one every `every`
// pieces; the count crosses the wreck `rate` times a second, from `margin`
// short of its left side to `margin` past its right, in `groups` steps
// across; a mark comes up over `rise` of the crossing as the count reaches
// it, at `peak`, and fades over `fade` behind it. proposta 12/11: the wake
// at which each depth's marks give a last `flash` and fade out over `fade`
// (`out` + `step` per depth).
const MARKS = {
  every: 3,
  groups: 6,
  rate: 0.16,
  margin: 0.25,
  rise: 0.08,
  fade: 0.3,
  peak: 1.25,
};
const DARK = { out: 0.1, step: 0.2, fade: 0.25, flash: 2.6 };

// One wreck piece in its own frame, `size` across: a torn panel (plate, a
// lighter rim along one edge, ribs under it), a truss (two rails, braces) or
// a module (a drum with an end plate). `mark` (parts, or null) takes the
// count's mark in the same frame, in `glow`: a band across the panel near
// its rim, a sleeve on a rail, a ring round the drum — thicker than what it
// is on, so it shows from either side.
function piece(kit, shades, kind, size, mark, glow) {
  const { random } = kit;
  const [body, dark, rim] = shades;
  const out = kit.parts();
  if (kind === 'truss') {
    const L = size * 1.6;
    [-1, 1].forEach((s) =>
      kit.box(out, rim, [0, 0, s * size * 0.12], [L, size * 0.04, size * 0.04])
    );
    for (let x = -L / 2; x <= L / 2; x += size * 0.22) {
      kit.box(out, body, [x, 0, 0], [size * 0.03, size * 0.03, size * 0.26]);
      kit.box(
        out,
        dark,
        [x + size * 0.11, 0, 0],
        [size * 0.03, size * 0.03, size * 0.34],
        [0, 0.9, 0]
      );
    }
    if (mark) {
      kit.box(
        mark,
        glow,
        [size * 0.3, 0, size * 0.12],
        [size * 0.3, size * 0.075, size * 0.075]
      );
    }
  } else if (kind === 'module') {
    kit.put(
      out,
      kit.unit.drum(8),
      body,
      [0, 0, 0],
      [size * 0.3, size, size * 0.3],
      [0, 0, Math.PI / 2]
    );
    kit.box(
      out,
      rim,
      [size * 0.52, 0, 0],
      [size * 0.06, size * 0.7, size * 0.7]
    );
    kit.box(
      out,
      dark,
      [-size * 0.3, size * 0.3, 0],
      [size * 0.5, size * 0.06, size * 0.9]
    );
    if (mark) {
      kit.put(
        mark,
        kit.unit.drum(8),
        glow,
        [size * 0.18, 0, 0],
        [size * 0.32, size * 0.13, size * 0.32],
        [0, 0, Math.PI / 2]
      );
    }
  } else {
    const d = size * (0.4 + random() * 0.4);
    kit.box(out, body, [0, 0, 0], [size, size * 0.05, d]);
    kit.box(
      out,
      rim,
      [0, size * 0.03, d / 2],
      [size * 0.96, size * 0.05, size * 0.05]
    );
    for (let x = -size * 0.4; x < size * 0.45; x += size * 0.27) {
      kit.box(
        out,
        dark,
        [x, -size * 0.05, 0],
        [size * 0.05, size * 0.07, d * 0.95]
      );
    }
    if (mark) {
      kit.box(
        mark,
        glow,
        [0, 0, d / 2 - size * 0.14],
        [size * 0.92, size * 0.075, size * 0.11]
      );
    }
  }
  return out;
}

export function buildDebrisWake(THREE, kit) {
  const { tone, random } = kit;

  // The whole Ring, small, leaning so it reads as a ring, its gap wide open
  // and a few of its modules drifting away from the torn ends.
  const hull = kit.parts();
  const lights = kit.parts();
  const ringTones = [tone('#56606f'), tone('#636e7e'), tone('#4b5462')];
  ringBand(kit, hull, lights, {
    radius: RING.radius,
    count: 96,
    width: 44,
    thick: 14,
    gap: RING.gap,
    tones: ringTones,
    light: tone('#a8c4ff', 0.7),
    lightEvery: 9,
  });
  const along = (RING.radius * Math.PI * 2) / 96;
  for (let i = 0; i < 7; i += 1) {
    const end = i % 2 ? RING.gap[0] : RING.gap[1];
    const a = end + (i % 2 ? 1 : -1) * (0.1 + (i >> 1) * 0.09);
    const r = RING.radius * (1.04 + random() * 0.14 + (i >> 1) * 0.05);
    kit.box(
      hull,
      ringTones[i % 3],
      [Math.cos(a) * r, (random() - 0.5) * 60, Math.sin(a) * r],
      [along * 0.9, 14, 44],
      [random() * 2, -(a + Math.PI / 2) + random(), random() * 2]
    );
  }
  const ring = new THREE.Group();
  ring.add(kit.mesh(hull), kit.mesh(lights, 'glow'));
  ring.rotation.set(0.72, 0.3, 0.12, 'YXZ');

  // The cold star: a small hard point, a tight glow, a faint short halo.
  const star = kit.parts();
  kit.put(
    star,
    gradientDisc(
      THREE,
      (r) =>
        r < 0.05 ? 1.8 : 0.5 * Math.exp(-(r - 0.05) * 30) + 0.06 * (1 - r),
      { rings: 16, sides: 40 }
    ),
    tone('#cfe0ff', 2),
    [0, 0, 0],
    360
  );

  // The wreck, at three depths: dark, quiet, edges a shade lighter so the
  // shapes read; the marks a cold pale blue, far from the orbs' gold.
  const shades = [tone('#2a2f37'), tone('#1c1f25'), tone('#4b5361')];
  const markTone = tone('#a9c6ff');
  const kinds = ['panel', 'panel', 'truss', 'panel', 'module'];
  const marks = [];
  const layers = WRECK.map(({ depth, follow, count, spread }, n) => {
    const wreck = kit.parts();
    const groups = Array.from({ length: MARKS.groups }, () => kit.parts());
    for (let i = 0; i < count; i += 1) {
      const size = (70 + random() ** 2 * 120) * (1 - n * 0.15);
      const at = [
        (random() - 0.5) * spread[0],
        (random() - 0.5) * 300,
        (random() - 0.5) * spread[1],
      ];
      const turn = [random() * 6, random() * 6, random() * 6];
      const mark = i % MARKS.every === 1 ? kit.parts() : null;
      const kind = kinds[(i + n) % kinds.length];
      const out = piece(kit, shades, kind, size, mark, markTone);
      wreck.push(...kit.moved(out, at, turn));
      if (mark) {
        const across = at[0] / spread[0] + 0.5;
        const g = Math.min(MARKS.groups - 1, Math.floor(across * MARKS.groups));
        groups[g].push(...kit.moved(mark, at, turn));
      }
    }
    const object = new THREE.Group();
    object.add(kit.mesh(wreck));
    groups.forEach((parts, g) => {
      if (!parts.length) return;
      const name = `marks-${n}-${g}`;
      object.add(kit.mesh(parts, 'glow', name));
      marks.push({ material: kit.materials.get(name), n, g });
    });
    return { object, anchor: under(depth), follow };
  });

  return {
    layers: [
      {
        object: kit.mesh(star, 'glow'),
        anchor: under(4100, -1900, -1250),
        follow: 0.96,
      },
      { object: ring, anchor: under(3400, 1250, -500), follow: 0.9 },
      ...layers,
    ],
    update(time, wake) {
      const { margin, groups, rise, fade, peak } = MARKS;
      const count = ((time * MARKS.rate) % 1) * (1 + 2 * margin) - margin;
      for (let k = 0; k < marks.length; k += 1) {
        const { material, n, g } = marks[k];
        const out = (wake - DARK.out - n * DARK.step) / DARK.fade;
        if (out > 0) {
          material.color.setScalar(DARK.flash * Math.max(0, 1 - out) ** 2);
          continue;
        }
        const since = count - (g + 0.5) / groups;
        const lit =
          since < -rise
            ? 0
            : since < 0
              ? 1 + since / rise
              : Math.max(0, 1 - since / fade);
        material.color.setScalar(peak * lit);
      }
    },
  };
}
