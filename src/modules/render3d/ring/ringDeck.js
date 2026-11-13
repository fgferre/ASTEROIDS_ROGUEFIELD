// The deck of an intact module as a camera skimming it sees it (ringParts.js
// levels 1 and 2; the gameplay camera only ever sees level 0's plates): a
// city's worth of structure, in strips along the arc either side of the
// conduit — a canal the length of the Ring with running lights on its kerbs,
// a pipe rack, and blocks of buildings on podiums between streets, some gone
// to dark pits; windows on the rim walls' faces, towers standing off them.
// Level 2 adds roof clutter and debris in the streets. Each level draws from
// its own stream per module, so level 2 keeps every part of level 1.

import { createSeededRandom } from '../asteroidMesh.js';
import { RING, RING_LOOK } from './ringShape.js';

// proposta 13/11: the deck across one lane (|r| from the centre line, Ring
// units): a pipe rack in `rack`, a canal in `canal` (its kerbs `kerb`
// [wide, tall], a lamp every `lampEvery` along them, `lampLit` of them
// alight), then strips of blocks in `strips`. Blocks run `block` long with
// `street` between; `pit` of them are gone to a dark pit. On each block's
// podium (`podium` tall) one to three buildings, `height` tall (most low:
// the share is squared) — in the strip by the rim one in `highrise` is
// `highHeight` tall; one in `lean` is a ruin leaning over — with a band of
// dark windows over `bandOver`, a window in it lit in `windowLit` of them. A
// tower stands off a rim wall in `tower` of the modules, `towerHeight` over
// it, a lamp on its top. The rim walls' faces over the deck: a pilaster
// every `pilasterEvery`, between them dark windows on `floors`.
const DECK = {
  rack: [5.5, 8.5],
  canal: [9, 17],
  kerb: [0.8, 1.4],
  lampEvery: 5,
  lampLit: 0.3,
  strips: [
    [17.8, 27.6, false],
    [29, 39.6, true],
  ],
  block: [5, 12],
  street: 1.6,
  pit: 0.1,
  podium: [0.3, 0.9],
  height: [0.8, 5.5],
  highrise: 0.15,
  highHeight: [6, 11],
  lean: 0.06,
  bandOver: 2.2,
  windowLit: 0.06,
  tower: 0.6,
  pilasterEvery: 6,
  floors: [2.6, 5.2, 7.6],
  towerHeight: [8, 24],
};

const { width: W, rim: h, wall } = RING;
const RIM = (W - wall) / 2;
const INSIDE = W / 2 - wall;

function stream(i, level) {
  const random = createSeededRandom(5300.1 + i * 97.3 + level * 11.1);
  random();
  const between = (a, b) => a + (b - a) * random();
  return { random, between };
}

// The canal and the pipe rack along one lane (k ±1), s0 to s1.
function canal(kit, k, s0, s1, tone, mid) {
  const { put, box } = kit;
  const s = (s0 + s1) / 2;
  const len = s1 - s0;
  const [c0, c1] = DECK.canal;
  const [kerbWide, kerbTall] = DECK.kerb;
  // The canal's bed, across the seam to the next module, dark.
  put(
    box,
    s + RING.seam / 2,
    (k * (c0 + c1)) / 2,
    0.08,
    [c1 - c0, 0.16, len + RING.seam],
    tone * 0.32
  );
  [c0, c1].forEach((edge, e) => {
    const r = k * (edge + (e ? kerbWide / 2 : -kerbWide / 2));
    put(box, s, r, kerbTall / 2, [kerbWide, kerbTall, len], tone * 1.15);
    for (let at = s0 + 2; at < s1 - 1; at += DECK.lampEvery) {
      const lit = mid.random() < DECK.lampLit;
      put(
        box,
        at,
        r,
        kerbTall + 0.15,
        [0.5, 0.3, 0.9],
        lit ? 1 : 0.4,
        lit ? RING_LOOK.idle * 0.7 : 0,
        1.4
      );
    }
  });
  // The rack: two pipes on trestles.
  const [a, b] = DECK.rack;
  const r = (k * (a + b)) / 2;
  [-1, 1].forEach((p) =>
    put(
      kit.lengthwise,
      s + RING.seam / 2,
      r + p * 0.9,
      1.5,
      [0.7, 0.7, len + RING.seam],
      tone * 0.9
    )
  );
  for (let at = s0 + 3; at < s1; at += 9) {
    put(box, at, r, 0.6, [b - a, 1.2, 0.7], tone * 0.8);
  }
}

// One block, `a` to `b` out (signed; `high`: the strip by the rim, where a
// high-rise can stand), `t0` to `t1` along.
function block(kit, [a, b, high], t0, t1, tone, mid, near) {
  const { put, box, tilted } = kit;
  const across = Math.abs(b - a);
  const r = (a + b) / 2;
  const along = t1 - t0;
  const s = (t0 + t1) / 2;
  if (mid.random() < DECK.pit) {
    // Gone: a dark pit, now and then a slab fallen into it.
    put(box, s, r, 0.05, [across, 0.1, along], tone * 0.12);
    if (mid.random() < 0.5) {
      tilted(
        s,
        r,
        0.6,
        [across * 0.6, 0.5, along * 0.5],
        [mid.between(-0.4, 0.4), mid.between(0, 3), mid.between(-0.3, 0.3)],
        tone * 0.8
      );
    }
    return;
  }
  const podium = mid.between(...DECK.podium);
  put(
    box,
    s,
    r,
    podium / 2,
    [across, podium, along],
    tone * mid.between(0.65, 0.9)
  );
  // One to three buildings, split along the block.
  const count = 1 + Math.floor(mid.random() * 3);
  const step = along / count;
  for (let n = 0; n < count; n += 1) {
    const share = mid.random();
    const tall =
      high && mid.random() < DECK.highrise
        ? mid.between(...DECK.highHeight)
        : DECK.height[0] + (DECK.height[1] - DECK.height[0]) * share * share;
    const wide = across * mid.between(0.45, 0.85);
    const long = step * mid.between(0.55, 0.85);
    const at = t0 + step * (n + 0.5);
    const off = r + mid.between(-1, 1) * (across - wide) * 0.5;
    const shade = tone * mid.between(0.75, 1.35);
    if (mid.random() < DECK.lean) {
      // A ruin, leaning on its neighbours, its windows long dead.
      tilted(
        at,
        off,
        podium + tall * 0.4,
        [wide, tall, long],
        [mid.between(-0.3, 0.3), 0, mid.between(-0.35, 0.35)],
        shade * 0.85
      );
      continue;
    }
    put(box, at, off, podium + tall / 2, [wide, tall, long], shade);
    if (tall > DECK.bandOver) {
      const y = podium + tall * mid.between(0.5, 0.8);
      put(box, at, off, y, [wide + 0.12, 0.3, long + 0.12], 0.22, 0, 1.1);
      if (mid.random() < DECK.windowLit) {
        // A window still lit in the band, on both its long faces.
        put(
          box,
          at + mid.between(-0.3, 0.3) * long,
          off,
          y,
          [wide + 0.16, 0.22, 0.5],
          1,
          RING_LOOK.idle * 0.6,
          1.1
        );
      }
    }
    kit.only(kit.lod >= 2, () => {
      // On the roof: a vent block, now and then a mast.
      if (near.random() < 0.6) {
        put(
          box,
          at + near.between(-long, long) * 0.25,
          off + near.between(-wide, wide) * 0.25,
          podium + tall + 0.3,
          [wide * near.between(0.2, 0.4), 0.6, long * near.between(0.2, 0.4)],
          tone * 0.7
        );
      }
      if (tall > 3 && near.random() < 0.3) {
        put(box, at, off, podium + tall + 1.2, [0.2, 2.4, 0.2], tone);
      }
    });
  }
}

// A rim wall's face over the deck (k ±1), s0 to s1: pilasters, floors of
// dark windows between them, a few still lit.
function rimFace(kit, k, s0, s1, tone, mid) {
  const { put, box } = kit;
  const len = s1 - s0;
  DECK.floors.forEach((y) =>
    put(
      box,
      (s0 + s1) / 2,
      k * (INSIDE - 0.15),
      y,
      [0.3, 0.9, len],
      0.22,
      0,
      1.1
    )
  );
  for (let at = s0 + 1; at < s1; at += DECK.pilasterEvery) {
    put(box, at, k * (INSIDE - 0.35), h / 2, [0.7, h, 1.8], tone * 1.1);
    if (mid.random() < DECK.windowLit * 2) {
      put(
        box,
        at + DECK.pilasterEvery / 2,
        k * (INSIDE - 0.25),
        DECK.floors[Math.floor(mid.random() * DECK.floors.length)],
        [0.3, 0.6, 1.2],
        1,
        RING_LOOK.idle * 0.6,
        1.1
      );
    }
  }
}

// A tower off a rim wall (k ±1) at s: a shaft and a narrower spire on it,
// a dark band of windows, a lamp on its top.
function tower(kit, k, s, tone, mid) {
  const { put, box } = kit;
  const tall = mid.between(...DECK.towerHeight);
  const r = k * RIM;
  const foot = mid.between(4, 6);
  const shaft = tall * mid.between(0.55, 0.75);
  put(
    box,
    s,
    r,
    h + shaft / 2,
    [foot, shaft, foot * mid.between(1, 1.8)],
    tone * 1.1
  );
  put(
    box,
    s,
    r,
    h + shaft * 0.8,
    [foot + 0.15, 0.4, foot * 1.8 + 0.15],
    0.22,
    0,
    1.1
  );
  const spire = tall - shaft;
  put(box, s, r, h + shaft + spire / 2, [foot * 0.4, spire, foot * 0.4], tone);
  const lit = mid.random() < 0.6;
  put(
    box,
    s,
    r,
    h + tall + 0.3,
    [0.7, 0.6, 0.7],
    1,
    lit ? RING_LOOK.idle : 0,
    1.6
  );
}

/** The close deck of intact module `i`, s0 to s1. */
export function cityDeck(kit, i, { s0, s1 }, tone) {
  const mid = stream(i, 1);
  const near = stream(i, 2);
  [-1, 1].forEach((k) => {
    canal(kit, k, s0, s1, tone, mid);
    rimFace(kit, k, s0, s1, tone, mid);
    DECK.strips.forEach(([a, b, high]) => {
      const strip = [k * a, k * b, high];
      let at = s0 + 1;
      while (at < s1 - 4) {
        const long = Math.min(s1 - 1 - at, mid.between(...DECK.block));
        block(kit, strip, at, at + long - DECK.street, tone, mid, near);
        at += long;
      }
    });
    kit.only(kit.lod >= 2, () => {
      // Debris in the streets and on the canal's bed.
      const pieces = Math.floor(near.between(1, 4));
      for (let p = 0; p < pieces; p += 1) {
        const size = near.between(0.4, 1.4);
        kit.tilted(
          near.between(s0 + 2, s1 - 2),
          k * near.between(DECK.canal[0] + 1, DECK.canal[1] - 1),
          size * 0.4,
          [size, size * 0.6, size * near.between(1, 2)],
          [near.random() * 3, near.random() * 3, near.random() * 3],
          tone * 0.8
        );
      }
    });
  });
  if (mid.random() < DECK.tower) {
    tower(
      kit,
      mid.random() < 0.5 ? -1 : 1,
      mid.between(s0 + 8, s1 - 8),
      tone,
      mid
    );
  }
}
