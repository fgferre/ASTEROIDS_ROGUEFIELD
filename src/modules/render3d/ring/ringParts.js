// The broken Ring (docs/NORTE.md §1–2) as parts for mergeStatic: boxes placed
// `s` along the arc from the break, `r` out from its centre line, `y` up from
// the deck, sized [across, up, along]; colour = (tone, idle light, wake
// light). Built at a level of detail (0 far, 1 mid, 2 near) over a range of
// its modules, so a chunk can be rebuilt finer when a camera comes close.
//
// Level 0 is the Ring the gameplay camera sees far below the field, its parts
// drawn in the same order from the same random stream as before levels
// existed, plus a keel under the hull that the deck hides from above (the
// silhouette from the side and from below). Levels 1 and 2 add what only a
// close camera sees (ringDetail.js), each from its own stream per module, so
// a module is the same at every level and in every range.

import { createSeededRandom } from '../asteroidMesh.js';
import { moduleDetail } from './ringDetail.js';
import {
  MODULE_COUNT,
  RING,
  RING_LOOK,
  moduleStart,
  ringPoint,
} from './ringShape.js';

// A box whose bottom face is `k` × as wide across as its top: a keel's
// cross-section, still a closed solid (its slanted faces take face normals).
function taperedBox(THREE, k) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    if (position.getY(i) < 0) position.setX(i, position.getX(i) * k);
  }
  geometry.userData.flat = true;
  return geometry;
}

// The tools every builder places parts with, for modules [from, to) at
// `lod`. Parts outside the range (or muted) are skipped without changing
// what the random streams draw.
function createKit(THREE, lod, from, to) {
  const parts = [];
  const state = { module: 0, muted: false };
  const tapers = new Map();
  const kit = {
    THREE,
    lod,
    parts,
    state,
    box: new THREE.BoxGeometry(1, 1, 1),
    // Unit cylinders along `up` and along the arc.
    upright: new THREE.CylinderGeometry(1, 1, 1, 6),
    lengthwise: new THREE.CylinderGeometry(1, 1, 1, 6).rotateX(Math.PI / 2),
    emitting: () => !state.muted && state.module >= from && state.module < to,
    taper: (k) => {
      if (!tapers.has(k)) tapers.set(k, taperedBox(THREE, k));
      return tapers.get(k);
    },
    put(geometry, s, r, y, size, tone, idle = 0, wake = 0) {
      if (!kit.emitting()) return;
      parts.push({
        geometry,
        color: new THREE.Color(tone, idle, wake),
        position: ringPoint(s, r, y),
        rotationY: s / RING.radius - RING.stump,
        scale: size,
        flat: geometry.userData.flat === true,
        module: state.module,
      });
    },
    // A piece turned its own way (radians about across, up, along), its size
    // in its own geometry.
    tilted(s, r, y, size, turn, tone, idle = 0, wake = 0) {
      if (!kit.emitting()) return;
      const geometry = new THREE.BoxGeometry(...size)
        .rotateZ(turn[2])
        .rotateY(turn[1])
        .rotateX(turn[0]);
      kit.put(geometry, s, r, y, 1, tone, idle, wake);
    },
    // A bar `thick` square from a to b, each [s, r, y]: a strut, a cable
    // link. The part's frame: x across, y up, z back along the arc.
    bar(a, b, thick, tone, idle = 0, wake = 0) {
      if (!kit.emitting()) return;
      const d = new THREE.Vector3(b[1] - a[1], b[2] - a[2], a[0] - b[0]);
      const length = d.length();
      if (length < 0.01) return;
      const geometry = new THREE.BoxGeometry(thick, thick, length).applyMatrix4(
        new THREE.Matrix4().makeRotationFromQuaternion(
          new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 0, 1),
            d.divideScalar(length)
          )
        )
      );
      kit.put(
        geometry,
        (a[0] + b[0]) / 2,
        (a[1] + b[1]) / 2,
        (a[2] + b[2]) / 2,
        1,
        tone,
        idle,
        wake
      );
    },
    // Builds without placing anything unless `when` (the streams still draw).
    only(when, build) {
      const was = state.muted;
      state.muted = was || !when;
      build();
      state.muted = was;
    },
  };
  return kit;
}

/**
 * Every part of the broken Ring's modules [from, to) at `lod`. Each part
 * keeps its `module` index.
 */
export function ringParts(
  THREE,
  { lod = 0, from = 0, to = MODULE_COUNT } = {}
) {
  const kit = createKit(THREE, lod, from, to);
  const { put, tilted, box, state } = kit;
  const random = createSeededRandom(2200.7);
  const between = (a, b) => a + (b - a) * random();
  const { width: W, hull: H, rim: h, wall, module: L, seam } = RING;
  const side = (W - wall) / 2;
  const floorWidth = W - 2 * wall;
  // A plate turned 45° about its length: the bevel along a rim's outer top
  // edge, facing up and out (k: the rim's side).
  const bevels = [-1, 1].map((k) =>
    new THREE.BoxGeometry(7, 1.5, 1).rotateZ((-k * Math.PI) / 4)
  );
  const keel = kit.taper(RING.keelTaper);
  // What a module's detail needs to know about it (ringDetail.js).
  let shape = null;

  // One rim wall, its bevel and belt, from s0 to s1; `k` −1 inner, 1 outer.
  const rimWall = (s0, s1, k, tone, height = H + h) => {
    const s = (s0 + s1) / 2;
    const len = s1 - s0;
    // A torn wall keeps its foot: its top drops.
    put(box, s, k * side, height - H - height / 2, [wall, height, len], tone);
    if (height === H + h) {
      put(
        bevels[(k + 1) / 2],
        s,
        k * (W / 2 - 1),
        h - 1,
        [1, 1, len],
        RING_LOOK.edge
      );
      shape.walls.push({ s0, s1, k });
    } else shape.stubs.push({ s0, s1, k, height });
    put(box, s, k * (W / 2 + 1), -H * 0.45, [3, 3, len], tone * 1.15);
  };
  const runningLights = (s, idle) => {
    put(box, s, -side, h + 1, [3, 2, 3], 1, idle, 1.4);
    put(box, s, side, h + 1, [3, 2, 3], 1, idle, 1.4);
  };
  // The keel under the hull, s0 to s1, and the conduit along its bottom
  // (`bridge` longer, across the seams to the next keel).
  const belly = (s0, s1, tone, bridge) => {
    const s = (s0 + s1) / 2;
    put(
      keel,
      s,
      0,
      -H - RING.keel / 2,
      [floorWidth - 4, RING.keel, s1 - s0],
      tone * 0.85 * RING_LOOK.under
    );
    put(
      box,
      s + bridge / 2,
      0,
      -H - RING.keel - 0.5,
      [5, 1.2, s1 - s0 + bridge],
      0.6,
      0,
      1.6
    );
    shape.belly = { s0, s1, bridge };
  };

  const intact = (s0, s1, tone) => {
    const s = (s0 + s1) / 2;
    const len = s1 - s0;
    rimWall(s0, s1, -1, tone);
    rimWall(s0, s1, 1, tone);
    put(box, s, 0, -H / 2, [floorWidth, H, len], tone * 0.8);
    // Two lanes of deck plates, a few gone, either side of the conduit;
    // now and then a block of machinery on them.
    const lane = (floorWidth - 8) / 2;
    [-1, 1].forEach((k) => {
      let at = s0 + 1;
      while (at < s1 - 4) {
        const long = Math.min(s1 - 1 - at, between(9, 22));
        if (random() > 0.12) {
          const tall = between(1, 2.6);
          put(
            box,
            at + long / 2,
            k * (4 + lane / 2),
            0.5,
            [lane - 1.5, tall, long - 1.5],
            tone * between(0.6, 1.5)
          );
          shape.plates.push({
            s: at + long / 2,
            r: k * (4 + lane / 2),
            top: 0.5 + tall / 2,
            across: lane - 1.5,
            along: long - 1.5,
          });
        }
        at += long;
      }
    });
    if (random() < 0.5) {
      const size = between(5, 10);
      put(
        box,
        between(s0 + 8, s1 - 8),
        (random() < 0.5 ? -1 : 1) * between(10, lane),
        between(2, 4),
        [size, between(3, 7), size * between(0.8, 2)],
        tone * between(0.9, 1.4)
      );
    }
    // Now and then a hall rising off one lane, a dead light on its roof.
    if (random() < 0.14) {
      const tall = between(7, 14);
      const r = (random() < 0.5 ? -1 : 1) * (4 + lane / 2);
      put(
        box,
        s,
        r,
        tall / 2,
        [lane * between(0.7, 1), tall, len * between(0.45, 0.8)],
        tone * 1.2
      );
      put(box, s, r, tall + 1, [3, 2, 3], 1, 0, 1.4);
    }
    put(box, s, 0, 1.2, [6, 2.5, len + seam], 0.6, 0, 1.6);
    runningLights(s, random() < 0.75 ? RING_LOOK.idle * 0.6 : 0);
    belly(s0 + 0.5, s1 - 0.5, tone, seam + 1);
  };

  // The frame where the plates are gone: the keel under the floor, cross
  // beams and diagonals, a plate or two left.
  const frame = (s0, s1, tone) => {
    const s = (s0 + s1) / 2;
    const len = s1 - s0;
    put(box, s, 0, -H + 3, [floorWidth * 0.3, 6, len], tone * 0.7);
    const beams = Math.max(1, Math.round(len / 18));
    for (let b = 0; b <= beams; b += 1) {
      put(box, s0 + (len * b) / beams, 0, -3, [floorWidth, 3, 3], tone);
    }
    const diagonal = Math.atan2(floorWidth, len / beams);
    for (let b = 0; b < beams; b += 1) {
      tilted(
        s0 + (len * (b + 0.5)) / beams,
        0,
        -4,
        [2.2, 2.2, Math.hypot(floorWidth, len / beams)],
        [0, b % 2 ? diagonal : -diagonal, 0],
        tone
      );
    }
    if (random() < 0.6) {
      put(
        box,
        between(s0 + 8, s1 - 8),
        between(-20, 20),
        -1,
        [floorWidth * between(0.3, 0.5), 2.5, len * between(0.25, 0.45)],
        tone * 0.9
      );
    }
    shape.frames.push({ s0, s1 });
  };

  // A torn end at `at`, the module running from it toward `into` (±1): the
  // rims stop short at different lengths, the deck shorter still, the keel
  // and a bent girder sticking out over the break.
  const torn = (at, into, tone) => {
    const from = (d) => at + into * d;
    const span = (a, b) => [
      Math.min(from(a), from(b)),
      Math.max(from(a), from(b)),
    ];
    const inner = between(4, 22);
    const outer = between(10, 34);
    rimWall(...span(inner, L), -1, tone);
    rimWall(...span(outer, L), 1, tone);
    rimWall(...span(0, inner), -1, tone * 0.9, (H + h) * between(0.4, 0.7));
    rimWall(
      ...span(between(0, 8), outer),
      1,
      tone * 0.9,
      (H + h) * between(0.3, 0.6)
    );
    // The deck ends ragged, four strips torn at different lengths, the
    // frame showing past them; plates peeled up off the edge catch the light.
    // Close up each strip's torn end opens into decks (ringDetail.js).
    const deck = between(30, 40);
    const strip = floorWidth / 4;
    shape.torn = { at, into, deck, strips: [] };
    for (let k = 0; k < 4; k += 1) {
      const end = deck - between(0, 22);
      const shade = tone * between(0.7, 0.9);
      const r = -floorWidth / 2 + strip * (k + 0.5);
      kit.only(kit.lod === 0, () =>
        put(box, from((end + L) / 2), r, -H / 2, [strip, H, L - end], shade)
      );
      shape.torn.strips.push({ r, end, width: strip, tone: shade });
    }
    frame(...span(-6, deck), tone);
    for (let p = 0; p < 2; p += 1) {
      tilted(
        from(deck - between(16, 26)),
        between(-30, 10),
        4,
        [between(14, 22), 1.5, between(10, 16)],
        [-into * between(0.3, 0.6), 0, between(0.3, 0.7)],
        tone * 1.3
      );
    }
    // Rails bent out over the break: one drooping, one swung aside.
    tilted(
      from(-14),
      side * (random() < 0.5 ? -1 : 1),
      -6,
      [4, 4, 34],
      [into * 0.7, 0, 0],
      tone
    );
    tilted(
      from(-12),
      -side * 0.6,
      -H * 0.45,
      [3, 3, 30],
      [into * 0.25, into * 0.5, 0],
      tone
    );
    // The keel runs on under the deck from where it ends.
    belly(...span(deck, L - 0.5), tone, into > 0 && at > 0 ? seam + 1 : 0);
  };

  for (let i = 0; i < MODULE_COUNT; i += 1) {
    if (RING.gap.includes(i)) continue;
    state.module = i;
    shape = {
      walls: [],
      stubs: [],
      plates: [],
      frames: [],
      belly: null,
      torn: null,
    };
    const s0 = moduleStart(i);
    const s1 = s0 + L;
    const tone = between(0.82, 1.08);
    if (i === 0 || RING.gap.includes(i - 1)) torn(s0, 1, tone);
    else if (i === MODULE_COUNT - 1 || RING.gap.includes(i + 1)) {
      torn(s1, -1, tone);
    } else if (i <= 2) {
      rimWall(s0, s1, -1, tone);
      rimWall(s0, s1, 1, tone);
      frame(s0, s1, tone);
      runningLights((s0 + s1) / 2, 0);
    } else intact(s0, s1, tone);

    // The seam to the next module, recessed under the deck and the keel; a
    // rib on some, wrapped round under the keel.
    const last = i === MODULE_COUNT - 1 || RING.gap.includes(i + 1);
    const s = s1 + seam / 2;
    const rib = !last && i % RING.ribEvery === RING.ribEvery - 1;
    if (!last) {
      put(
        box,
        s,
        0,
        -3 - H * 0.35,
        [floorWidth - 4, H * 0.7, seam + 0.5],
        0.5,
        0,
        1.3
      );
      if (rib) {
        [-1, 1].forEach((k) => {
          put(
            box,
            s,
            k * side,
            (h + 14 - H) / 2,
            [wall + 4, H + h + 14, 8],
            tone
          );
          put(box, s, k * side, h + 15, [4, 2, 4], 1, RING_LOOK.idle, 1.6);
        });
        put(box, s, 0, h + 12, [W + 4, 3, 8], tone * 1.4);
      }
      if (i > 2) {
        put(
          kit.taper(0.51),
          s,
          0,
          -H - 2.5,
          [floorWidth - 10, 15, seam + 2],
          0.5 * RING_LOOK.under,
          0,
          1.3
        );
        if (rib) {
          put(
            kit.taper(0.62),
            s,
            0,
            -H - 7,
            [W - 12, 14, 8],
            tone * RING_LOOK.under
          );
        }
      }
    }
    if (kit.lod > 0) moduleDetail(kit, i, shape, { s0, s1, tone, rib, last });
  }

  // Off the stump: cables and a plate hanging past its end, pieces
  // drifting away.
  state.module = 0;
  [-3, -5, -8].forEach((s, c) =>
    tilted(
      s,
      -18 + c * 17,
      -H - 20,
      [1.2, 38 + c * 6, 1.2],
      [between(-0.2, 0.2), 0, between(-0.25, 0.25)],
      0.9
    )
  );
  tilted(-8, 20, -H - 8, [34, 2.5, 26], [0.5, 0.2, 0.6], 0.9);
  for (let d = 0; d < 5; d += 1) {
    tilted(
      -between(30, 120),
      between(-70, 70),
      -between(20, 80),
      [between(6, 16), between(4, 10), between(8, 20)],
      [random() * 6, random() * 6, random() * 6],
      between(0.7, 1)
    );
  }
  return kit.parts;
}
