// Debris Wake (docs/ROTEIRO.md "Os lugares" 1): far outside the Ring, in the
// tail of its wreckage. The whole Ring small and broken in the distance, a
// cold small star off in a corner, and what the Ring let go of — torn
// panels, trusses, a module — drifting between them and the field. The
// pieces carry the count's tags: small lights ticking through the wreck,
// depth after depth, as the Quarry Maw tallies it; when the Maw goes
// offline they go out, the nearest first (the stone goes uncounted).

import { gradientDisc } from './kit.js';
import { lightPoint, ringBand, under } from './pieces.js';

// proposta 12/11: the Ring's radius and its gap (radians), and the wreck's
// three depths (depth, follow, pieces, spread [x, z]).
const RING = { radius: 520, gap: [1.15, 2.05] };
const WRECK = [
  { depth: 900, follow: 0.18, count: 7, spread: [2600, 1900] },
  { depth: 1500, follow: 0.32, count: 16, spread: [2800, 2000] },
  { depth: 2300, follow: 0.55, count: 20, spread: [3400, 2400] },
];
// proposta 12/11: the tags — one every `every` pieces, `size` (+ `grow` per
// depth); their tick (per second, a depth's `low` light flaring by `blip`
// for `flare` of each tick, the depths a third of a tick apart); and the
// wake at which each depth's tags give a last `flash` and fade out over
// `fade` (`out` + `step` per depth).
const TAGS = { every: 3, size: 9, grow: 4 };
const TICK = { rate: 0.7, low: 0.6, blip: 0.9, flare: 0.25 };
const DARK = { out: 0.1, step: 0.2, fade: 0.25, flash: 2.6 };

// One wreck piece in its own frame, `size` across: a torn panel (plate, a
// lighter rim along one edge, ribs under it), a truss (two rails, braces) or
// a module (a drum with an end plate).
function piece(kit, shades, kind, size) {
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
  // shapes read, a few dead lights, cold mostly.
  const shades = [tone('#2a2f37'), tone('#1c1f25'), tone('#4b5361')];
  const dead = [tone('#8fbcff', 0.55), tone('#ff8a50', 0.45)];
  const kinds = ['panel', 'panel', 'truss', 'panel', 'module'];
  const layers = WRECK.map(({ depth, follow, count, spread }, n) => {
    const wreck = kit.parts();
    const glints = kit.parts();
    for (let i = 0; i < count; i += 1) {
      const size = (70 + random() ** 2 * 120) * (1 - n * 0.15);
      const at = [
        (random() - 0.5) * spread[0],
        (random() - 0.5) * 300,
        (random() - 0.5) * spread[1],
      ];
      const turn = [random() * 6, random() * 6, random() * 6];
      const out = piece(kit, shades, kinds[(i + n) % kinds.length], size);
      wreck.push(...kit.moved(out, at, turn));
      if (i % TAGS.every === 1) {
        lightPoint(
          kit,
          glints,
          dead[i % (TAGS.every * 3) === 1 ? 1 : 0],
          [at[0], at[1] + size * 0.1, at[2]],
          TAGS.size + n * TAGS.grow
        );
      }
    }
    const object = new THREE.Group();
    object.add(kit.mesh(wreck), kit.mesh(glints, 'glow', `tags-${n}`));
    return { object, anchor: under(depth), follow };
  });
  const tags = WRECK.map((_, n) => kit.materials.get(`tags-${n}`));

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
      for (let n = 0; n < tags.length; n += 1) {
        const phase = (time * TICK.rate + n / 3) % 1;
        const blip = Math.max(0, 1 - phase / TICK.flare);
        const out = (wake - DARK.out - n * DARK.step) / DARK.fade;
        tags[n].color.setScalar(
          out <= 0
            ? TICK.low + TICK.blip * blip
            : DARK.flash * Math.max(0, 1 - out) ** 2
        );
      }
    },
  };
}
