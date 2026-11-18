// src/modules/render3d/travel/wake.js
//
// The Wake: the old freighter the pilot's people live on (data/story.js),
// seen in the story scene before the first journey. The owner's concept
// sheet (17/11): a faceted block of a bow in worn light grey with orange
// bands and the WAKE mark; a long open neck of coloured containers held in
// yellow gantries under a crane; a tall stern with the glazed bridge, masts
// and antennas; three big round engines with a blue core; small amber and
// blue lights all over the hull.
// Built in authoring units (about 100 long: +x the bow, y up, z across) from
// wakeParts.js parts, painted by wakeSurface.js, and scaled to WAKE_LENGTH.
// Three draws of painted hull (plating, containers) and the lights apart,
// so the scene can dim, flicker or kill each kind (setWakeLight).

import { buildCargoDeck } from './wakeCargo.js';
import { fittings } from './wakeDetail.js';
import {
  STEEL,
  WAKE_COLORS,
  facet,
  octagon,
  shrunk,
  wakeMark,
} from './wakeHull.js';
import { createKit } from './wakeParts.js';
import { buildStern } from './wakeStern.js';
import {
  bakeWakeCargo,
  bakeWakeGlow,
  bakeWakeHull,
  wakePaint,
} from './wakeSurface.js';

export const WAKE_LENGTH = 3200;
const SEED = 0x3a4e;
// The plating tile's size in authoring units.
const TILE = 8;

// The bow block: a long flat-sided run, then the nose drawn in and up.
const BOW_BASE = {
  x: 20,
  hw: 8.2,
  tw: 5.2,
  kw: 4.4,
  yt: 6.2,
  yh: 3.2,
  yl: -2.8,
  yb: -6.4,
};
const BOW = [
  BOW_BASE,
  { ...BOW_BASE, x: 38 },
  shrunk(BOW_BASE, 45.5, 0.8, 0.25),
  shrunk(BOW_BASE, 50.5, 0.5, 0.6),
];

function buildBow(kit) {
  const { V, add, box, body, plate, armour, cuts, lamp, railing, tube, paint } =
    kit;
  const { random } = kit;
  const C = WAKE_COLORS;
  const [a, b, c, d] = BOW;
  add('hull', body(BOW.map((s) => octagon(V, s))), paint(C.dark));
  const greys = [C.light, C.light, C.grey, C.light];
  const grey = () => paint(greys[Math.floor(random() * greys.length)]);
  const thick = () => 0.14 + random() * 0.1;

  // --- The long run -----------------------------------------------------------
  // The side band: an orange band aft, then one long plate for the mark.
  const side = facet(V, a, b, 'side');
  armour('hull', side, [0, 0.022, 0.145, 0.975, 1], [0, 1], (i) => ({
    color: i === 1 ? paint(C.orange) : i === 2 ? paint(C.grey) : paint(C.mid),
    thick: i === 2 ? 0.2 : 0.16,
    cut: i === 1 ? [0, 0.3] : null,
  }));
  const onSide = fittings(kit, side);
  onSide.windows(0.78, 0.09, 4.6, 0.7);
  onSide.windows(0.3, 0.09, 2.4, 0.5);
  onSide.vent(0.24, 0.9, 1.8, 0.5);
  onSide.vent(0.62, 0.91, 2.6, 0.45);
  onSide.hatch(0.9, 0.86, 1.3, 0.8);
  onSide.strip(0.15, 0.97, 0.985, 0.14, paint(C.orange), 0.2, 0.05);
  // The shoulder: plates in rows that do not line up, a pipe trench.
  const shoulder = facet(V, a, b, 'shoulder');
  const shoulderX = cuts(6, 0.5);
  armour(
    'hull',
    shoulder,
    shoulderX,
    (i) => (i % 2 ? [0, 0.42, 0.56, 1] : [0, 0.42, 0.56, 0.8, 1]),
    (i, j) => ({
      skip: j === 1,
      color:
        i === 0 && j > 1
          ? paint(C.orange)
          : j === 0 && i === 3
            ? paint(C.mid)
            : grey(),
      thick: thick(),
      cut: i === 5 && j === 0 ? [1, 0.35] : null,
    })
  );
  const onShoulder = fittings(kit, shoulder);
  onShoulder.pipes(0.02, 0.98, 0.49, 3);
  onShoulder.scatter({
    density: 0.5,
    cell: [2.4, 1.3],
    keep: (fx, ft) => ft < 0.36 || ft > 0.62,
  });
  const bilge = facet(V, a, b, 'bilge');
  armour('hull', bilge, cuts(6, 0.5), [0, 0.5, 1], (i, j) => ({
    color: j ? paint(C.grey) : grey(),
    thick: thick(),
    skip: j === 1 && i % 3 === 1,
  }));
  fittings(kit, bilge).scatter({ density: 0.3, cell: [2.8, 1.8], lit: false });
  const deck = facet(V, a, b, 'deck');
  armour('hull', deck, cuts(6, 0.4), [0.34, 0.68, 1], (i, j) => ({
    color: j && i % 3 === 0 ? paint(C.mid) : grey(),
    thick: 0.12,
  }));
  armour('hull', facet(V, a, b, 'keel'), cuts(4, 0.4), [0, 0.7], () => ({
    color: paint(C.mid),
    thick: 0.2,
  }));

  // --- The nose -----------------------------------------------------------------
  armour('hull', facet(V, b, c, 'side'), [0, 0.5, 1], [0, 1], (i) => ({
    color: i ? paint(C.orange) : grey(),
    thick: 0.18,
    cut: i ? [2, 0.3] : null,
  }));
  armour(
    'hull',
    facet(V, b, c, 'shoulder'),
    [0, 0.45, 1],
    [0, 0.5, 1],
    (i, j) => ({
      color: i ? paint(C.dark) : j ? grey() : paint(C.grey),
      thick: 0.16,
    })
  );
  fittings(kit, facet(V, b, c, 'shoulder')).scatter({
    density: 0.5,
    cell: [2.2, 1.6],
  });
  armour('hull', facet(V, b, c, 'deck'), [0, 0.5, 1], [0.3, 1], () => ({
    color: grey(),
    thick: 0.12,
  }));
  armour('hull', facet(V, b, c, 'bilge'), [0, 0.5, 1], [0, 1], () => ({
    color: paint(C.grey),
    thick: 0.18,
  }));
  ['side', 'shoulder', 'bilge', 'deck'].forEach((name) =>
    armour(
      'hull',
      facet(V, c, d, name),
      [0, 1],
      [name === 'deck' ? 0.3 : 0, 1],
      () => ({
        color: paint(
          name === 'side' ? C.mid : name === 'deck' ? C.grey : C.dark
        ),
        thick: 0.14,
      })
    )
  );
  fittings(kit, facet(V, c, d, 'side')).windows(0.45, 0.28, 3.2, 0.85);
  // Wash lights under the belt, so the lower hull reads in the dark.
  [0.1, 0.36, 0.62, 0.88].forEach((fx) =>
    fittings(kit, bilge).light(fx, 0.12, 'floods', C.flood, {
      size: 0.12,
      gain: 2,
      spill: 2.6,
      spillGain: 0.3,
    })
  );
  // An orange brow along the nose's upper chine, and the dark face with its
  // slit of light.
  [1, -1].forEach((s) => {
    add(
      'hull',
      plate(
        [
          V(c.x + 0.2, c.yh + 0.1, c.hw * s),
          V(d.x - 0.1, d.yh + 0.1, d.hw * s),
          V(d.x - 0.1, d.yh - 0.5, d.hw * s),
          V(c.x + 0.2, c.yh - 0.6, c.hw * s),
        ],
        0.14,
        0.08
      ),
      paint(C.orange)
    );
  });
  add(
    'hull',
    box(d.x, d.x + 0.25, d.yl - 0.4, d.yh + 0.3, -d.hw + 0.3, d.hw - 0.3),
    paint(C.soot)
  );
  [-1, 0, 1].forEach((n) =>
    add(
      'hull',
      box(
        d.x + 0.25,
        d.x + 0.4,
        d.yl,
        d.yh - 0.9,
        n * 1.4 - 0.5,
        n * 1.4 + 0.5
      ),
      paint(C.dark)
    )
  );
  add(
    'windows',
    box(d.x + 0.25, d.x + 0.3, d.yh - 0.7, d.yh - 0.5, -d.hw + 0.9, d.hw - 0.9),
    paint(C.amber, 1.6),
    { uv: false }
  );
  [1, -1].forEach((s) => {
    lamp(
      'lamps',
      V(d.x + 0.25, d.yl + 0.2, (d.hw - 0.7) * s),
      V(1, 0, 0),
      C.amber
    );
    lamp(
      'lamps',
      V(d.x + 0.25, d.yh - 0.2, (d.hw - 0.7) * s),
      V(1, 0, 0),
      C.amber,
      {
        size: 0.12,
      }
    );
  });

  // --- The mark on both flanks -------------------------------------------------
  [1, -1].forEach((s) =>
    wakeMark(kit, V(s > 0 ? 23.2 : 36.9, -0.95, (a.hw + 0.2) * s), s, 2.3)
  );

  // --- Lamps along the belt -------------------------------------------------------
  [1, -1].forEach((s) => {
    for (let x = 21.5; x < 38; x += 3.1) {
      lamp('lamps', V(x, a.yl + 0.25, (a.hw + 0.17) * s), V(0, 0, s), C.amber, {
        size: 0.13,
        spill: 1.3,
      });
    }
  });

  // --- Deck: a low forward house, hatches, a mast -----------------------------
  const top = a.yt + 0.12;
  add(
    'hull',
    kit.slab(
      [
        [22.5, -3.3],
        [23.3, -4.1],
        [30.4, -4.1],
        [31.6, -2.9],
        [31.6, 2.9],
        [30.4, 4.1],
        [23.3, 4.1],
        [22.5, 3.3],
      ],
      top,
      top + 1.3,
      0.12
    ),
    paint(C.grey)
  );
  add('hull', box(24, 29.5, top + 1.3, top + 2.0, -2.6, 2.6), paint(C.mid));
  add('hull', box(24.4, 29.1, top + 2.0, top + 2.12, -2.9, 2.9), paint(C.grey));
  add(
    'hull',
    box(29.1, 29.3, top + 1.9, top + 2.12, -2.9, 2.9),
    paint(C.orange)
  );
  for (let z = -3.2; z <= 3.2; z += 0.8) {
    add(
      'windows',
      box(31.6, 31.66, top + 0.6, top + 0.84, z - 0.2, z + 0.2),
      paint(random() < 0.7 ? C.glass : C.amber, 1.2),
      { uv: false }
    );
  }
  // Cargo hatches forward of the house, vents and lockers aft of it.
  for (let x = 32.6; x < 37; x += 2.2) {
    add('hull', box(x, x + 1.8, top, top + 0.2, 1.0, 4.2), paint(C.mid), {
      mirror: true,
    });
    add(
      'hull',
      box(x + 0.2, x + 1.6, top + 0.2, top + 0.28, 1.3, 3.9),
      paint(C.light),
      {
        mirror: true,
      }
    );
    add(
      'hull',
      box(x + 0.8, x + 1.0, top + 0.28, top + 0.36, 1.1, 4.1),
      paint(C.dark),
      {
        mirror: true,
      }
    );
  }
  add('hull', box(20.6, 22, top, top + 0.9, 1.2, 4.0), paint(C.mid), {
    mirror: true,
  });
  add('hull', box(20.8, 21.8, top + 0.9, top + 1.0, 1.5, 3.7), paint(C.dark), {
    mirror: true,
  });
  add('hull', box(32.4, 37.6, top, top + 0.1, -0.8, 0.8), paint(C.dark));
  [1, -1].forEach((s) => {
    railing(
      'hull',
      [V(20.4, top, (a.tw - 0.25) * s), V(37.6, top, (a.tw - 0.25) * s)],
      paint(C.steel),
      { shine: STEEL }
    );
    add(
      'hull',
      tube(V(22, top + 0.2, 4.6 * s), V(37, top + 0.2, 4.6 * s), 0.12, 6),
      paint(C.mid),
      { smooth: true }
    );
  });
  // The forward mast and its lamp.
  add(
    'hull',
    tube(V(26.5, top + 2.1, 0), V(26.5, top + 5.4, 0), 0.09, 6),
    paint(C.steel),
    {
      shine: STEEL,
    }
  );
  add(
    'hull',
    tube(V(26.5, top + 4.2, -1), V(26.5, top + 4.2, 1), 0.05, 4),
    paint(C.steel),
    {
      shine: STEEL,
    }
  );
  add(
    'hull',
    box(27.6, 28.4, top + 2.12, top + 2.5, -0.5, 0.5),
    paint(C.white)
  );
  lamp('beacons', V(26.5, top + 5.4, 0), V(0, 1, 0), C.beacon, { spill: 0 });
}

/**
 * Sets a light's strength (0 dark … 1 as built; above 1 hotter): `light` is
 * one of buildWake's `lights` (a group of its lamps and their pools).
 */
export function setWakeLight(light, level) {
  light.children.forEach((mesh) => mesh.material.color.setScalar(level));
}

/**
 * The Wake: { group, lights, anchors }.
 * lights: windows, lamps, floods, beacons and engines (an array: port,
 * centre, starboard), each a group for setWakeLight.
 * anchors: empty objects in the group at the places a scene needs — the
 * `hangar` mouth under the neck, the `bridge`, each of the `engines`.
 */
export function buildWake(THREE) {
  const kit = createKit(THREE, SEED, TILE);
  buildBow(kit);
  const places = { ...buildCargoDeck(kit), ...buildStern(kit) };

  const group = new THREE.Group();
  group.name = 'wake';
  const painted = (set, maps) => {
    const mesh = new THREE.Mesh(kit.merged(set), wakePaint(THREE, maps));
    mesh.name = set;
    group.add(mesh);
  };
  painted('hull', bakeWakeHull(THREE, SEED));
  // Two wearings of the container, so no two neighbours chip alike.
  painted('cargo', bakeWakeCargo(THREE, SEED + 1));
  painted('cargoB', bakeWakeCargo(THREE, SEED + 2));

  const glow = bakeWakeGlow(THREE);
  // A light kind: its hot parts and, where it has them, its pools.
  const light = (set) => {
    const kind = new THREE.Group();
    kind.name = set;
    kind.add(
      new THREE.Mesh(
        kit.merged(set),
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          toneMapped: false,
          side: THREE.DoubleSide,
        })
      )
    );
    if (kit.sets[`${set}Pools`]) {
      const pools = new THREE.Mesh(
        kit.merged(`${set}Pools`),
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          map: glow,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        })
      );
      pools.renderOrder = 1;
      kind.add(pools);
    }
    group.add(kind);
    return kind;
  };
  const lights = {
    windows: light('windows'),
    lamps: light('lamps'),
    floods: light('floods'),
    beacons: light('beacons'),
    engines: [0, 1, 2].map((i) => light(`engine${i}`)),
  };
  const anchor = (name, [x, y, z]) => {
    const object = new THREE.Object3D();
    object.name = name;
    object.position.set(x, y, z);
    group.add(object);
    return object;
  };
  const anchors = {
    hangar: anchor('hangar', places.hangar),
    bridge: anchor('bridge', places.bridge),
    engines: places.engines.map((at, i) => anchor(`engine${i}`, at)),
  };
  group.scale.setScalar(WAKE_LENGTH / 100);
  return { group, lights, anchors };
}
