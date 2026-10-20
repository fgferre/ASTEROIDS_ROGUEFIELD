// What only a close camera sees of the broken Ring (ringParts.js levels 1
// and 2), one module at a time. Level 1 (mid): the faces of the rim walls
// (buttresses, windows, armour, hangar doors), plating, pipes, pods and fins
// under the keel, a mast under each rib, the bare skeleton where the hull is
// gone and, at a torn end, the decks and bulkheads the break cut open.
// Level 2 (near) adds cables, broken teeth on the torn walls, hatches and
// vents on the deck plates, rails and brackets. Each level draws from its own
// stream per module, so level 2 keeps every part of level 1.

import { createSeededRandom } from '../asteroidMesh.js';
import { RING, RING_LOOK } from './ringShape.js';

const { width: W, hull: H, rim: h, wall, keel: K } = RING;
const FLOOR = W - 2 * wall;
// The keel's slanted faces, from under the rims' foot (KEEL_TOP across, at
// −H) to its bottom (KEEL_BOTTOM across, at −H − K).
const KEEL_TOP = (FLOOR - 4) / 2;
const KEEL_BOTTOM = KEEL_TOP * RING.keelTaper;
const SLANT = Math.atan2(K, KEEL_TOP - KEEL_BOTTOM);
const SLANT_LENGTH = Math.hypot(K, KEEL_TOP - KEEL_BOTTOM);
const BOTTOM = -H - K;
// Tone under the hull (ringShape.js RING_LOOK.under).
const UNDER = RING_LOOK.under;

function stream(i, level) {
  const random = createSeededRandom(7100.3 + i * 131.7 + level * 17.9);
  random();
  const between = (a, b) => a + (b - a) * random();
  return { random, between };
}

// A cable hanging from `a` ([s, r, y]) down `drop`, curling `swing` along
// and `lean` across: four links.
function hangingCable(kit, a, drop, swing, lean, thick) {
  let p = a;
  for (let k = 1; k <= 4; k += 1) {
    const t = k / 4;
    const q = [a[0] + swing * t * t, a[1] + lean * t * t, a[2] - drop * t];
    kit.bar(p, q, thick, 0.7);
    p = q;
  }
}

// A cable slung from `a` to `b`, sagging `sag` at its middle: five links.
function slungCable(kit, a, b, sag, thick) {
  let p = a;
  for (let k = 1; k <= 5; k += 1) {
    const t = k / 5;
    const q = a.map((v, n) => v + (b[n] - v) * t);
    q[2] -= sag * 4 * t * (1 - t);
    kit.bar(p, q, thick, 0.7);
    p = q;
  }
}

// One rim wall's outer face (k 1: away from the Ring's centre; −1: toward
// it), s0 to s1, at full height.
function face(kit, { s0, s1, k }, tone, mid, near) {
  const { put, box } = kit;
  const surface = W / 2;
  const len = s1 - s0;
  if (len < 8) return;
  [s0 + 2, s1 - 2].forEach((s) =>
    put(box, s, k * (surface + 1.2), -H + 15.5, [2.4, 31, 3], tone * 1.1)
  );
  // Windows: dark glass, a few still lit, every one lit in the wake.
  const row = (y) => {
    for (let s = s0 + 6; s < s1 - 5; s += 4.6) {
      put(
        box,
        s,
        k * (surface + 0.3),
        y,
        [0.6, 1.8, 2.8],
        0.25,
        mid.random() < 0.05 ? RING_LOOK.idle * 0.9 : 0,
        1.1
      );
    }
  };
  row(-2.5);
  // A ledge under the rim's top, between the buttresses.
  put(
    box,
    (s0 + s1) / 2,
    k * (surface + 0.6),
    h - 3.5,
    [1.2, 1.4, len - 6],
    tone * 1.15
  );
  if (k > 0) {
    // Armour plates below the belt.
    const plate = (len - 10) / 3;
    for (let p = 0; p < 3; p += 1) {
      put(
        box,
        s0 + 5 + plate * (p + 0.5),
        k * (surface + 0.4),
        -18,
        [0.8, 9.5, plate - 1.2],
        tone * mid.between(0.85, 1.15)
      );
    }
  } else if (len > 34 && mid.random() < 0.4) {
    // A hangar door: a dark panel in a frame, a light over it.
    const s = mid.between(s0 + 14, s1 - 14);
    put(box, s, k * (surface + 0.25), -18.3, [0.5, 8.6, 15], tone * 0.45);
    [-1, 1].forEach((e) =>
      put(box, s + e * 8, k * (surface + 0.7), -18.3, [1.4, 10, 1.4], tone)
    );
    put(box, s, k * (surface + 0.7), -13.5, [1.4, 1.2, 17.4], tone * 1.1);
    put(
      box,
      s,
      k * (surface + 1.2),
      -15,
      [1.2, 0.8, 1.6],
      1,
      mid.random() < 0.5 ? RING_LOOK.idle : 0,
      1.4
    );
  } else row(-17.5);

  kit.only(kit.lod >= 2, () => {
    // Seams between the wall's panels, a rail along the rim top's inner
    // edge, vents high on the face.
    for (let s = s0 + 8.3; s < s1 - 6; s += 9.2) {
      put(box, s, k * (surface + 0.15), 1.6, [0.3, 5.2, 0.5], tone * 0.55);
    }
    put(
      box,
      (s0 + s1) / 2,
      k * (surface - wall + 0.4),
      h + 0.8,
      [0.8, 1.6, len],
      tone
    );
    const vents = Math.floor(near.between(1, 4));
    for (let v = 0; v < vents; v += 1) {
      put(
        box,
        near.between(s0 + 5, s1 - 5),
        k * (surface + 0.4),
        near.between(3, 6),
        [0.8, 1.4, near.between(2, 4)],
        tone * 0.7
      );
    }
  });
}

// Under the keel, s0 to s1: plating on its slanted faces and its bottom,
// pipes and brackets under the rims' foot, lights, now and then a pod or a
// bank of radiator fins.
function underside(kit, { s0, s1, bridge }, tone, mid, near) {
  const { put, box, tilted } = kit;
  const len = s1 - s0;
  const panels = Math.max(1, Math.round(len / 20));
  const panel = len / panels;
  [-1, 1].forEach((k) => {
    const out = [Math.sin(SLANT), -Math.cos(SLANT)];
    const r = (KEEL_TOP + KEEL_BOTTOM) / 2 + out[0] * 0.4;
    const y = -H - K / 2 + out[1] * 0.4;
    for (let p = 0; p < panels; p += 1) {
      if (mid.random() < 0.08) continue;
      const s = s0 + panel * (p + 0.5);
      tilted(
        s,
        k * r,
        y,
        [SLANT_LENGTH - 2, 0.8, panel - 1.2],
        [0, 0, k * SLANT],
        tone * UNDER * mid.between(0.75, 1.1)
      );
      if (mid.random() < 0.08) continue;
      put(
        box,
        s,
        k * 12.5,
        BOTTOM - 0.4,
        [16, 0.8, panel - 1.2],
        tone * UNDER * mid.between(0.75, 1.1)
      );
    }
    // A pipe under each rim's foot, across the seam to the next.
    put(
      kit.lengthwise,
      (s0 + s1 + bridge) / 2,
      k * 43,
      -H - 2.4,
      [1.8, 1.8, len + bridge],
      tone * UNDER * 0.9
    );
    for (let b = 0; b < 3; b += 1) {
      put(
        box,
        s0 + (len * (b + 0.5)) / 3,
        k * 43,
        -H - 1,
        [4.5, 2.4, 1.5],
        tone * UNDER
      );
    }
    put(
      box,
      (s0 + s1) / 2,
      k * (KEEL_BOTTOM - 1.5),
      BOTTOM - 0.6,
      [2, 1, 2],
      1,
      mid.random() < 0.3 ? RING_LOOK.idle * 0.7 : 0,
      1.4
    );
  });

  const kind = mid.random();
  if (kind < 0.16 && len > 30) {
    // A pod hung under the keel on a neck, a light at its bottom.
    const s = mid.between(s0 + 14, s1 - 14);
    const deep = mid.between(7, 11);
    put(box, s, 0, BOTTOM - 1.8, [8, 3, 10], tone * UNDER * 0.9);
    put(
      box,
      s,
      0,
      BOTTOM - 3 - deep / 2,
      [mid.between(12, 18), deep, mid.between(18, 26)],
      tone * UNDER * 1.05
    );
    put(
      box,
      s,
      0,
      BOTTOM - 3.6 - deep,
      [2.5, 1.2, 2.5],
      1,
      mid.random() < 0.5 ? RING_LOOK.idle : 0,
      1.4
    );
  } else if (kind < 0.34 && len > 30) {
    // A bank of radiator fins on a spine.
    const s = mid.between(s0 + 10, s1 - 10);
    const tall = mid.between(10, 16);
    put(box, s, 0, BOTTOM - 0.9, [28, 1.6, 2.4], tone * UNDER);
    for (let f = -2; f <= 2; f += 1) {
      put(
        box,
        s,
        f * 6,
        BOTTOM - 1.6 - tall / 2,
        [0.8, tall, mid.between(9, 14)],
        tone * UNDER * 0.85
      );
    }
  }

  kit.only(kit.lod >= 2, () => {
    // Small hatches between the bottom plates.
    const hatches = Math.floor(near.between(1, 4));
    for (let k = 0; k < hatches; k += 1) {
      put(
        box,
        near.between(s0 + 4, s1 - 4),
        near.between(-18, 18),
        BOTTOM - 1,
        [near.between(2, 4), 0.6, near.between(2, 5)],
        tone * UNDER * 0.7
      );
    }
  });
}

// The bare skeleton where the hull is gone, s0 to s1 (the frame modules by
// the stump, the frame past a torn deck): ribs that follow the keel's
// section, chords along its corners, a torn panel or two still hanging.
// `torn` (±1) when the frame runs off a break at s0 (1) or s1 (−1).
function skeleton(kit, { s0, s1 }, tone, mid, near, torn = 0) {
  const { tilted } = kit;
  const len = s1 - s0;
  const corners = [
    [KEEL_BOTTOM, BOTTOM + 1],
    [KEEL_TOP, -H],
    [KEEL_TOP, -4],
  ];
  // Chords along the bottom corners, torn short toward a break.
  [-1, 1].forEach((k) =>
    [0, 1].forEach((c) => {
      const cut = torn ? mid.between(4, Math.max(5, len * 0.6)) : 0;
      const a = torn > 0 ? s0 + cut : s0;
      const b = torn < 0 ? s1 - cut : s1;
      kit.bar(
        [a, k * corners[c][0], corners[c][1]],
        [b, k * corners[c][0], corners[c][1]],
        2.4,
        tone * 0.9
      );
    })
  );
  const ribs = Math.max(1, Math.round(len / 12));
  for (let n = 0; n <= ribs; n += 1) {
    const s = s0 + (len * n) / ribs;
    if (mid.random() < (torn ? 0.3 : 0.12)) continue;
    const bend = torn ? mid.between(-4, 4) : 0;
    const point = (c, k) => [
      s + (c === 0 ? bend : 0),
      k * corners[c][0],
      corners[c][1],
    ];
    kit.bar(point(0, -1), point(0, 1), 2, tone);
    [-1, 1].forEach((k) => {
      kit.bar(point(0, k), point(1, k), 2, tone);
      kit.bar(point(1, k), point(2, k), 2, tone);
    });
  }
  // Skin still hanging off the slant, swung down.
  const hanging = Math.floor(mid.between(0, 2.6));
  for (let p = 0; p < hanging; p += 1) {
    const k = mid.random() < 0.5 ? -1 : 1;
    tilted(
      mid.between(s0 + 4, s1 - 4),
      k * mid.between(24, 34),
      -H - mid.between(6, 14),
      [mid.between(10, 18), 0.8, mid.between(8, 14)],
      [mid.between(-0.3, 0.3), 0, k * (SLANT + mid.between(0.3, 1))],
      tone * 0.95
    );
  }

  kit.only(kit.lod >= 2, () => {
    // Cables slung between ribs and hanging off the cross beams.
    const slung = Math.floor(near.between(1, 4));
    for (let c = 0; c < slung; c += 1) {
      const r = near.between(-KEEL_BOTTOM, KEEL_BOTTOM);
      const a = near.between(s0, s1 - 6);
      slungCable(
        kit,
        [a, r, BOTTOM + 1],
        [
          Math.min(s1, a + near.between(8, 20)),
          r + near.between(-6, 6),
          BOTTOM + 1,
        ],
        near.between(3, 9),
        near.between(0.5, 0.9)
      );
    }
    const hung = Math.floor(near.between(1, 5));
    for (let c = 0; c < hung; c += 1) {
      hangingCable(
        kit,
        [near.between(s0, s1), near.between(-30, 30), -4.5],
        near.between(14, 42),
        near.between(-6, 6),
        near.between(-5, 5),
        near.between(0.5, 1)
      );
    }
  });
}

// A torn end opened up: each deck strip runs back from where it tore into
// decks between bulkheads, pipes cut through, machinery on the mid deck.
function tornEnd(kit, { at, into, strips }, mid, near) {
  const { put, box } = kit;
  const L = RING.module;
  const from = (d) => at + into * d;
  // A box along the arc from d0 to d1 off the break.
  const run = (geometry, d0, d1, r, y, size, tone, idle = 0, wake = 0) =>
    put(
      geometry,
      from((d0 + d1) / 2),
      r,
      y,
      [size[0], size[1], Math.abs(d1 - d0)],
      tone,
      idle,
      wake
    );
  strips.forEach(({ r, end, width, tone }) => {
    const depth = mid.between(9, 16);
    const back = end + depth;
    // Solid past the bulkhead, its face dark; decks open in front of it,
    // darker inside, a light strip under each (the machine's light, dead
    // until the wake).
    run(box, back, L, r, -H / 2, [width, H], tone);
    run(box, back - 0.6, back, r, -12, [width - 1, H - 4], tone * 0.35);
    const top = end - mid.between(0, 4);
    const floor = end + mid.between(0, 5);
    run(box, top, back, r, -1, [width - 0.4, 2], tone);
    run(box, floor, back, r, -12.5, [width - 0.4, 1.5], tone * 0.7);
    run(
      box,
      end + mid.between(1, 7),
      back,
      r,
      -H + 1,
      [width - 0.4, 2],
      tone * 0.6
    );
    run(box, end + mid.between(2, 6), back, r, -12, [1, H - 4], tone * 0.55);
    run(box, top + 1, back - 0.6, r, -2.3, [1.4, 0.6], 0.3, 0, 1.2);
    run(box, floor + 1, back - 0.6, r, -13.5, [1.4, 0.6], 0.3, 0, 1.2);
    if (mid.random() < 0.6) {
      const size = [mid.between(4, 8), mid.between(3, 6)];
      run(
        box,
        back - mid.between(4, 8),
        back - 0.6,
        r + mid.between(-4, 4),
        -11.75 + size[1] / 2,
        size,
        tone * 0.8
      );
    }
    // Pipes cut through, sticking out past the deck.
    for (let p = 0; p < 2; p += 1) {
      const radius = mid.between(0.9, 1.6);
      run(
        kit.lengthwise,
        top - mid.between(1, 5),
        back,
        r + mid.between(-7, 7),
        mid.between(-9, -4) - p * 8,
        [radius, radius],
        tone * 0.9
      );
    }

    kit.only(kit.lod >= 2, () => {
      if (near.random() < 0.35) {
        run(
          box,
          back - 1.4,
          back - 0.6,
          r + near.between(-6, 6),
          -3.5,
          [1.2, 0.8],
          1,
          RING_LOOK.idle * 0.8,
          1.4
        );
      }
      const cables = Math.floor(near.between(1, 3));
      for (let c = 0; c < cables; c += 1) {
        hangingCable(
          kit,
          [from(top + near.between(0, 2)), r + near.between(-8, 8), -2],
          near.between(10, 40),
          -into * near.between(0, 8),
          near.between(-4, 4),
          near.between(0.5, 1)
        );
      }
    });
  });
}

/**
 * The close-up detail of module `i`, from what its base parts recorded in
 * `shape` (ringParts.js).
 */
export function moduleDetail(kit, i, shape, { s0, s1, tone, rib }) {
  const mid = stream(i, 1);
  const near = stream(i, 2);
  shape.walls.forEach((w) => face(kit, w, tone, mid, near));
  if (shape.belly) underside(kit, shape.belly, tone, mid, near);
  if (shape.torn) {
    tornEnd(kit, shape.torn, mid, near);
    skeleton(kit, shape.frames[0], tone, mid, near, shape.torn.into);
  } else shape.frames.forEach((f) => skeleton(kit, f, tone, mid, near));
  if (rib) {
    // A mast hung under the rib, a light at its tip.
    const s = s1 + RING.seam / 2;
    const long = mid.between(18, 30);
    kit.put(
      kit.upright,
      s,
      0,
      BOTTOM - 2 - long / 2,
      [0.9, long, 0.9],
      tone * UNDER
    );
    kit.put(
      kit.box,
      s,
      0,
      BOTTOM - 2 - long * 0.7,
      [10, 0.8, 0.8],
      tone * UNDER
    );
    kit.put(
      kit.box,
      s,
      0,
      BOTTOM - 2.8 - long,
      [2, 1.5, 2],
      1,
      RING_LOOK.idle,
      1.6
    );
  }

  kit.only(kit.lod >= 2, () => {
    const { put, box } = kit;
    // Broken teeth on the torn walls' tops.
    shape.stubs.forEach(({ s0: a, s1: b, k, height }) => {
      const teeth = Math.floor(near.between(1, 4));
      for (let t = 0; t < teeth; t += 1) {
        const tall = near.between(2, 7);
        kit.tilted(
          near.between(a + 1, b - 1),
          k * (W / 2 - wall / 2) + near.between(-1.5, 1.5),
          height - H + tall / 2 - 1,
          [wall * near.between(0.4, 0.9), tall, near.between(2, 5)],
          [near.between(-0.3, 0.3), 0, near.between(-0.3, 0.3)],
          tone * 0.9
        );
      }
    });
    // Hatches and vents on the deck plates, brackets over the conduit.
    shape.plates.forEach((p) => {
      const count = Math.floor(near.between(0, 2.6));
      for (let g = 0; g < count; g += 1) {
        const vent = near.random() < 0.4;
        put(
          box,
          p.s + near.between(-p.along / 3, p.along / 3),
          p.r + near.between(-p.across / 3, p.across / 3),
          p.top + (vent ? 0.6 : 0.25),
          vent ? [2, 1.2, 4] : [near.between(3, 6), 0.5, near.between(3, 6)],
          tone * (vent ? 0.6 : 1.2)
        );
      }
    });
    if (shape.plates.length) {
      for (let s = s0 + 4; s < s1; s += 8)
        put(box, s, 0, 2.6, [9, 0.6, 1.2], tone);
    }
    if (i === 0) {
      // Off the stump: a bundle of cables hanging past its end.
      for (let c = 0; c < 6; c += 1) {
        hangingCable(
          kit,
          [near.between(-6, 8), near.between(-24, 24), -H + 2],
          near.between(24, 60),
          -near.between(0, 12),
          near.between(-6, 6),
          near.between(0.6, 1.2)
        );
      }
    }
  });
}
