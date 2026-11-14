// Assembly Graveyard (docs/ROTEIRO.md "Os lugares" 7): the shipyards, where
// the same chassis is built again and again and never finished. A line of
// slips recedes into the haze, each holding the SAME hull in the same gantry
// cradle, each one step further on — a bare keel, then ribs, then stringers,
// then plating — and past the most nearly finished one the line starts again
// at a bare keel. The crane on each slip stands at its work front, the work
// lights still on and the welding under it flickering. When the Foundry
// Mother stops, the line is still: the welding dies and the work lights go
// out down the yard.

import { lightPoint, under } from './pieces.js';

// proposta 12/11: the chassis (length, beam), its frames, and the slips'
// progress, nearest first: how far along the length (from the stern) the
// ribs, the stringers and the plating have got.
const LENGTH = 540;
const BEAM = 125;
const FRAMES = 16;
const HOOP = 6;
const SLIPS = [
  { ribs: 0.14, stringers: 0, plating: 0 },
  { ribs: 0.62, stringers: 0, plating: 0 },
  { ribs: 1, stringers: 0.55, plating: 0 },
  { ribs: 1, stringers: 1, plating: 0.45 },
  { ribs: 1, stringers: 1, plating: 0.86 },
  { ribs: 0.14, stringers: 0, plating: 0 },
];
// proposta 12/11: one slip to the next, in a chassis' own frame (x toward
// the bow, y up, z across to its right): side by side, each a step deeper.
const STEP = [80, -230, 330];
const MID = (SLIPS.length - 1) / 2;
// proposta 12/11: the welding's flicker (two rates per second, its `low`
// share), gone by `weldOut` of the wake; the work lights left at `dead`
// once out, going out from `workFrom` to `workOut` of the wake.
const STILL = {
  rates: [17, 6.3],
  low: 0.35,
  weldOut: 0.3,
  dead: 0.06,
  workFrom: 0.15,
  workOut: 0.75,
};

// One chassis on its slip, bow at +x, the deck edges at y = 0, built as far
// as `progress` says, in its gantry cradle with the crane at the work front.
function slip(kit, frame, lights, welds, { ribs, stringers, plating }) {
  const { tone } = kit;
  const L = LENGTH;
  const B = BEAM;
  const steel = tone('#62665a');
  const edge = tone('#73776a');
  const keelTone = tone('#4c5048');
  const plate = tone('#5c3a2c');
  const cradle = tone('#373a35');
  const work = tone('#ff8a3a', 1.3);
  const weld = tone('#ffcf9a', 2);
  // The plan: a blunt stern, a full body, a long taper to a pointed bow.
  const half = (s) =>
    (B / 2) * Math.min(1, s < 0.6 ? 0.78 + s * 0.6 : (1 - s) / 0.4) ** 0.8;
  const depth = (s) => B * 0.5 * (0.6 + 0.4 * Math.min(1, (1 - s) * 3));
  const xOf = (s) => (s - 0.5) * L;
  // The keel, end to end, with its stem rising at the bow and the sternpost.
  kit.box(frame, keelTone, [0, -B * 0.5, 0], [L * 0.98, B * 0.1, B * 0.14]);
  kit.box(
    frame,
    keelTone,
    [L * 0.48, -B * 0.25, 0],
    [B * 0.06, B * 0.55, B * 0.06],
    [0, 0, 0.5]
  );
  kit.box(
    frame,
    keelTone,
    [-L * 0.49, -B * 0.27, 0],
    [B * 0.06, B * 0.5, B * 0.08]
  );
  const bay = L / FRAMES;
  for (let f = 0; f < FRAMES; f += 1) {
    const s = (f + 0.5) / FRAMES;
    const x = xOf(s);
    const w = half(s);
    const h = depth(s);
    for (let k = 0; k < HOOP; k += 1) {
      const p0 = Math.PI * (1 + k / HOOP);
      const p1 = Math.PI * (1 + (k + 1) / HOOP);
      const z0 = Math.cos(p0) * w;
      const y0 = Math.sin(p0) * h;
      const z1 = Math.cos(p1) * w;
      const y1 = Math.sin(p1) * h;
      const len = Math.hypot(z1 - z0, y1 - y0);
      const tilt = Math.atan2(-(y1 - y0), z1 - z0);
      const mid = [x, (y0 + y1) / 2, (z0 + z1) / 2];
      // A U-frame from one deck edge round under the keel to the other.
      if (s < ribs) {
        kit.box(
          frame,
          steel,
          mid,
          [B * 0.05, B * 0.06, len * 1.05],
          [tilt, 0, 0]
        );
      }
      // The shell plating, laid outside the frames bay by bay from the stern.
      if (s < plating && f < FRAMES - 1) {
        const out = 1.06;
        kit.box(
          frame,
          plate,
          [x + bay / 2, mid[1] * out, mid[2] * out],
          [bay * 1.01, B * 0.02, len * 1.02],
          [tilt, 0, 0]
        );
      }
    }
  }
  // Stringers along the deck edges and the bilges, frame to frame.
  [
    [1, 0, edge],
    [-1, 0, edge],
    [1, -0.8, steel],
    [-1, -0.8, steel],
  ].forEach(([side, k, color]) => {
    for (let f = 0; f < FRAMES - 1; f += 1) {
      const sa = (f + 0.5) / FRAMES;
      const sb = (f + 1.5) / FRAMES;
      if (sb > stringers + 1e-6) break;
      const za = side * half(sa) * (k ? 0.62 : 1);
      const zb = side * half(sb) * (k ? 0.62 : 1);
      const ya = k * depth(sa);
      const yb = k * depth(sb);
      const dx = xOf(sb) - xOf(sa);
      kit.box(
        frame,
        color,
        [(xOf(sa) + xOf(sb)) / 2, (ya + yb) / 2, (za + zb) / 2],
        [Math.hypot(dx, zb - za), B * 0.045, B * 0.045],
        [0, Math.atan2(-(zb - za), dx), 0]
      );
    }
  });
  // The cradle: a crane rail either side on towers, the same on every slip,
  // a work light on each tower top.
  const reach = B * 0.82;
  const top = B * 0.32;
  [-1, 1].forEach((side) => {
    kit.box(
      frame,
      cradle,
      [0, top, side * reach],
      [L * 1.12, B * 0.05, B * 0.06]
    );
    [-0.52, 0.52].forEach((t) => {
      kit.box(
        frame,
        cradle,
        [t * L, top - B * 0.4, side * reach],
        [B * 0.08, B * 0.8, B * 0.08]
      );
    });
    [-0.52, 0, 0.52].forEach((t) =>
      lightPoint(kit, lights, work, [t * L, top + B * 0.06, side * reach], 6)
    );
  });
  // The travelling crane, parked over the work front, its lights on and the
  // welding under it.
  const front = plating || stringers || ribs;
  const at = xOf(Math.min(front, 0.97));
  kit.box(
    frame,
    cradle,
    [at, top + B * 0.06, 0],
    [B * 0.12, B * 0.07, reach * 2.1]
  );
  lightPoint(kit, lights, work, [at, top + B * 0.12, 0], 7);
  [-0.6, 0.15, 0.5].forEach((z, i) =>
    lightPoint(
      kit,
      welds,
      weld,
      [at - bay * 0.4, -B * (0.15 + 0.12 * i), z * half(Math.min(front, 0.97))],
      4
    )
  );
}

export function buildAssemblyGraveyard(THREE, kit) {
  const { tone } = kit;
  const frame = kit.parts();
  const lights = kit.parts();
  const welds = kit.parts();
  SLIPS.forEach((progress, i) => {
    const f = kit.parts();
    const l = kit.parts();
    const w = kit.parts();
    slip(kit, f, l, w, progress);
    const at = STEP.map((d) => d * (i - MID));
    frame.push(...kit.moved(f, at));
    lights.push(...kit.moved(l, at));
    welds.push(...kit.moved(w, at));
  });
  // The line: one transfer rail under the sterns, slip to slip and on into
  // the haze past the last, a dim light at each slip.
  const [a, b, c] = STEP;
  const run = Math.hypot(a, b, c);
  const n = SLIPS.length + 1.5;
  const stern = [-LENGTH * 0.6, -BEAM * 0.55, 0];
  kit.box(
    frame,
    tone('#30332f'),
    stern.map((v, k) => v + STEP[k] * ((n - 1.5) / 2 - MID)),
    [run * n, BEAM * 0.06, BEAM * 0.12],
    [0, Math.atan2(-c, a), Math.atan2(b, Math.hypot(a, c))]
  );
  for (let i = 0; i <= SLIPS.length; i += 1) {
    lightPoint(
      kit,
      lights,
      tone('#ff8a3a', 0.9),
      stern.map(
        (v, k) => v + STEP[k] * (i - MID) + (k === 1 ? BEAM * 0.06 : 0)
      ),
      5
    );
  }
  const yard = [frame, lights, welds].map((parts) =>
    kit.moved(parts, [0, 0, 260], [0.05, Math.PI / 2 + 0.12, 0])
  );
  const object = new THREE.Group();
  object.add(
    kit.mesh(yard[0]),
    kit.mesh(yard[1], 'glow', 'yard-work'),
    kit.mesh(yard[2], 'glow', 'yard-weld')
  );
  const work = kit.materials.get('yard-work');
  const weld = kit.materials.get('yard-weld');
  const [fast, slow] = STILL.rates;
  return {
    layers: [{ object, anchor: under(1500), follow: 0.45 }],
    update(time, wake) {
      const k = Math.min(1, wake);
      const flicker =
        STILL.low +
        (1 - STILL.low) *
          Math.abs(Math.sin(time * fast) * Math.sin(time * slow + 1.3));
      weld.color.setScalar(flicker * Math.max(0, 1 - k / STILL.weldOut));
      const out = Math.min(
        1,
        Math.max(0, (k - STILL.workFrom) / (STILL.workOut - STILL.workFrom))
      );
      work.color.setScalar(1 - (1 - STILL.dead) * out);
    },
  };
}
