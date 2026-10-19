// The five heavy machines' parts (machines.js builds and moves the views),
// designed on every side for a camera that tilts: the Husk's carapace of
// Ring rock over a dark belly, the Weaver's hub and its rotor of swept arms,
// the Bulwark's tracked body behind its plate, the Caster's mortar turret
// and the Leech's segmented pod. Solids of revolution and swept sections in
// the merged bodies' two tones (hull, dark); +X is the nose, +Y up.

import { rimLoop } from '../rimBatch.js';

const TAU = Math.PI * 2;
const signedPow = (v, p) => Math.sign(v) * Math.abs(v) ** p;
const catmull = (a, b, c, d, t) =>
  0.5 *
  (2 * b +
    (c - a) * t +
    (2 * a - 5 * b + 4 * c - d) * t * t +
    (3 * b - a - 3 * c + d) * t * t * t);

// Rows of numbers smoothed by a Catmull-Rom spline, `steps` rows per span.
function refine(rows, steps) {
  const out = [];
  const last = rows.length - 1;
  for (let i = 0; i < last; i += 1) {
    const [a, b, c, d] = [i - 1, i, i + 1, i + 2].map(
      (k) => rows[Math.max(0, Math.min(last, k))]
    );
    for (let s = 0; s < steps; s += 1) {
      out.push(b.map((_, n) => catmull(a[n], b[n], c[n], d[n], s / steps)));
    }
  }
  out.push(rows[last]);
  return out;
}

/** The heavy machines' part lists and anchors, over the mirror's toolkit. */
export function createHeavyParts(kit) {
  const { THREE } = kit;
  const { hull, dark } = kit.tones;
  const UP = new THREE.Vector3(0, 1, 0);
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

  // A solid of revolution about +Y from [radius, height] pairs traced
  // counter-clockwise (out along the bottom, up the side, in over the top);
  // traced the other way it faces in (a bore, a throat).
  const lathe = (profile, segments) =>
    new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)),
      segments
    );

  // `geometry`, built about +Y, turned so +Y runs along `direction` from `at`.
  function aim(geometry, direction, at) {
    const turn = new THREE.Quaternion().setFromUnitVectors(
      UP,
      direction.clone().normalize()
    );
    return geometry.applyMatrix4(
      new THREE.Matrix4().compose(at, turn, v3(1, 1, 1))
    );
  }

  // A section swept along `path`: `section(i, angle)` is the [side, lift]
  // offset of ring i's point at `angle` (side = across, lift = up).
  function sweep(path, section, sides, { closed = false, capped = false }) {
    const n = path.length;
    const position = [];
    const index = [];
    const tangent = new THREE.Vector3();
    const side = new THREE.Vector3();
    const lift = new THREE.Vector3();
    const point = new THREE.Vector3();
    const at = (i) =>
      path[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
    for (let i = 0; i < n; i += 1) {
      tangent.subVectors(at(i + 1), at(i - 1)).normalize();
      side.crossVectors(tangent, UP).normalize();
      lift.crossVectors(side, tangent);
      for (let j = 0; j < sides; j += 1) {
        const [s, l] = section(i, (j / sides) * TAU);
        point.copy(path[i]).addScaledVector(side, s).addScaledVector(lift, l);
        position.push(point.x, point.y, point.z);
      }
    }
    for (let i = 0; i < (closed ? n : n - 1); i += 1) {
      const a = i * sides;
      const b = ((i + 1) % n) * sides;
      for (let j = 0; j < sides; j += 1) {
        const k = (j + 1) % sides;
        index.push(a + j, b + j, a + k, a + k, b + j, b + k);
      }
    }
    // caps: a fan over each end ring, on its own vertices (a crisp edge)
    if (capped) {
      [0, n - 1].forEach((ring, end) => {
        const centre = position.length / 3;
        const ringAt = ring * sides * 3;
        const mid = new THREE.Vector3();
        for (let j = 0; j < sides; j += 1) {
          mid.add(point.fromArray(position, ringAt + j * 3));
        }
        mid.divideScalar(sides);
        position.push(mid.x, mid.y, mid.z);
        position.push(...position.slice(ringAt, ringAt + sides * 3));
        for (let j = 0; j < sides; j += 1) {
          const k = (j + 1) % sides;
          if (end) index.push(centre, centre + 1 + k, centre + 1 + j);
          else index.push(centre, centre + 1 + j, centre + 1 + k);
        }
      });
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(position, 3)
    );
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    return geometry;
  }

  // A capped body along X (at `z`) from rows [x, half width, top, bottom],
  // its sections superellipses (`exponent` 2 = oval, higher = boxier).
  function loft(rows, sides, exponent, z = 0) {
    const p = 2 / exponent;
    return sweep(
      rows.map(([x]) => v3(x, 0, z)),
      (i, a) => {
        const [, w, top, bottom] = rows[i];
        return [
          w * signedPow(Math.cos(a), p),
          (top + bottom) / 2 + ((top - bottom) / 2) * signedPow(Math.sin(a), p),
        ];
      },
      sides,
      { capped: true }
    );
  }

  // A rock lump of the Ring: the unit icosphere dented by a function of
  // position (the non-indexed polyhedron's duplicated vertices stay
  // welded), its lower half squashed by `below`; a `crest` raises a ridge
  // along its +X spine and slopes its -X end down (a carapace plate).
  function rock(detail, phase, below = 1, crest = 0) {
    const geometry = new THREE.IcosahedronGeometry(1, detail);
    const p = geometry.getAttribute('position');
    for (let i = 0; i < p.count; i += 1) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const k =
        0.94 +
        0.06 *
          Math.sin(x * 5.3 + z * 3.1 + phase) *
          Math.cos(y * 4.7 + x * 2.3) +
        0.025 * Math.sin(z * 9.1 + y * 6.7 + phase * 1.7);
      const top =
        (1 + crest * (1 - Math.min(1, Math.abs(z) * 1.3))) *
        (1 - crest * Math.max(0, -x));
      p.setXYZ(i, x * k, y * k * (y < 0 ? below : top), z * k);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  // The outline seen from above of a merged body, as a 48-point rim loop at
  // height `y` (its widest waist), `pad` outside it; one per geometry.
  const outlines = new WeakMap();
  function outline(geometry, y, pad = 1.04) {
    if (!outlines.has(geometry)) {
      const bins = 48;
      const reach = new Array(bins).fill(0);
      const p = geometry.getAttribute('position');
      for (let i = 0; i < p.count; i += 1) {
        const x = p.getX(i);
        const z = p.getZ(i);
        const bin = Math.round((Math.atan2(z, x) / TAU) * bins + bins) % bins;
        reach[bin] = Math.max(reach[bin], Math.hypot(x, z));
      }
      const around = (list, i) => list[(i + bins) % bins];
      const filled = reach.map((r, i) =>
        Math.max(r, (around(reach, i - 1) + around(reach, i + 1)) / 2)
      );
      const points = filled.map((r, i) => {
        const smooth =
          ((around(filled, i - 1) + 2 * r + around(filled, i + 1)) / 4) * pad;
        const a = (i / bins) * TAU;
        return v3(Math.cos(a) * smooth, y, Math.sin(a) * smooth);
      });
      outlines.set(geometry, rimLoop(points));
    }
    return outlines.get(geometry);
  }

  // --- Husk: three carapace plates of Ring rock (its three sleeping Motes)
  // meeting under a crown knob, overhanging a dark belly with three release
  // hatches and a keel boss underneath.
  function huskShell() {
    const lobes = [0, 1, 2].flatMap((k) => {
      const angle = TAU / 6 + (k * TAU) / 3;
      const at = (r, y) => [Math.cos(angle) * r, y, Math.sin(angle) * r];
      return [
        {
          geometry: rock(3, k * 2.1, 0.35, 0.3),
          color: hull,
          scale: [0.66, 0.36, 0.5],
          rotationY: -angle,
          position: at(0.3, 0.04),
        },
        {
          geometry: rock(1, 3 + k),
          color: hull,
          scale: [0.24, 0.07, 0.19],
          rotationY: -angle,
          position: at(0.4, -0.31),
        },
      ];
    });
    return [
      ...lobes,
      {
        geometry: rock(3, 4.4),
        color: dark,
        scale: [0.74, 0.3, 0.74],
        position: [0, -0.1, 0],
      },
      {
        geometry: rock(1, 1.3),
        color: dark,
        scale: [0.2, 0.1, 0.2],
        position: [0, 0.36, 0],
      },
      {
        geometry: rock(1, 7),
        color: hull,
        scale: [0.17, 0.07, 0.17],
        position: [0, -0.37, 0],
      },
    ];
  }

  // --- Weaver: a spinning-top hub (sensor dome on top, the Tether chute
  // and three keel fins underneath) inside a rotor ring whose three blades
  // sweep back to pods that hold the glowing tips.
  const weaverFin = new THREE.ExtrudeGeometry(
    new THREE.Shape(
      [
        [0.12, -0.08],
        [0.31, -0.05],
        [0.25, -0.13],
        [0.12, -0.25],
      ].map(([x, y]) => new THREE.Vector2(x, y))
    ),
    { depth: 0.035, bevelEnabled: false }
  ).translate(0, 0, -0.0175);
  const weaverHub = () => [
    {
      geometry: lathe(
        [
          [0, -0.24],
          [0.08, -0.232],
          [0.15, -0.195],
          [0.23, -0.125],
          [0.3, -0.045],
          [0.325, 0],
          [0.31, 0.055],
          [0.26, 0.105],
          [0.19, 0.14],
          [0.12, 0.158],
          [0, 0.162],
        ],
        24
      ),
      color: hull,
    },
    {
      geometry: lathe(
        [
          [0.31, -0.03],
          [0.338, -0.018],
          [0.344, 0],
          [0.338, 0.018],
          [0.31, 0.03],
        ],
        24
      ),
      color: dark,
    },
    {
      geometry: lathe(
        [
          [0.15, 0.148],
          [0.156, 0.172],
          [0.125, 0.203],
          [0.075, 0.224],
          [0, 0.231],
        ],
        20
      ),
      color: dark,
    },
    {
      geometry: lathe(
        [
          [0, -0.262],
          [0.07, -0.258],
          [0.105, -0.236],
          [0.11, -0.205],
        ],
        16
      ),
      color: dark,
    },
    ...[0, 1, 2].map((k) => ({
      geometry: weaverFin,
      color: dark,
      rotationY: TAU / 6 + (k * TAU) / 3,
    })),
  ];
  // each blade dips past the rotor and lifts its pod (gull-winged)
  const armAt = (angle, r, y) =>
    v3(Math.cos(angle) * r, y, Math.sin(angle) * r);
  const armCurve = new THREE.CubicBezierCurve3(
    armAt(0.08, 0.4, 0.01),
    armAt(-0.03, 0.66, -0.02),
    armAt(-0.27, 0.88, 0.03),
    armAt(-0.55, 0.96, 0.07)
  );
  const ARM_RINGS = 12;
  const armPath = armCurve.getPoints(ARM_RINGS - 1);
  const armEnd = armPath[ARM_RINGS - 1];
  const armTangent = armCurve.getTangent(1);
  // one blade (flat, tapering) and its tip pod: hull outside, dark cup
  const armWidth = (i) => 0.115 - (0.065 * i) / (ARM_RINGS - 1);
  const armHeight = (i) => 0.034 - (0.014 * i) / (ARM_RINGS - 1);
  const armParts = [
    {
      geometry: sweep(
        armPath,
        (i, a) => [Math.cos(a) * armWidth(i), Math.sin(a) * armHeight(i)],
        8,
        {}
      ),
      color: hull,
    },
    // a dark rib along the blade's back
    {
      geometry: sweep(
        armPath.map((point, i) => point.clone().setY(point.y + armHeight(i))),
        (i, a) => [Math.cos(a) * 0.2 * armWidth(i), Math.sin(a) * 0.012],
        5,
        {}
      ),
      color: dark,
    },
    {
      geometry: aim(
        lathe(
          [
            [0, -0.13],
            [0.05, -0.115],
            [0.08, -0.06],
            [0.095, 0],
            [0.097, 0.045],
            [0.088, 0.062],
          ],
          12
        ),
        armTangent,
        armEnd
      ),
      color: hull,
    },
    {
      geometry: aim(
        lathe(
          [
            [0.088, 0.062],
            [0.072, 0.052],
            [0.04, 0.012],
            [0, 0],
          ],
          12
        ),
        armTangent,
        armEnd
      ),
      color: dark,
    },
  ];
  const weaverRotor = lathe(
    [
      [0.37, -0.03],
      [0.43, -0.045],
      [0.475, -0.018],
      [0.475, 0.018],
      [0.43, 0.045],
      [0.37, 0.03],
      [0.37, -0.03],
    ],
    32
  );
  // the rotor and one blade per turn (radians about +Y)
  const weaverArms = (turns) => [
    { geometry: weaverRotor, color: dark },
    ...turns.flatMap((rotationY) =>
      armParts.map((part) => ({ ...part, rotationY }))
    ),
  ];
  // where arm 0's tip glow sits, in its pod's cup
  const weaverTip = armEnd.clone().addScaledVector(armTangent, 0.03);

  // --- Bulwark: an armoured shell over a dark tracked chassis, braced to
  // the plate in front (kit.frontalPlate, r 0.8–1.02 within ±60°: nothing
  // of the body reaches past r 0.76 there), a raised deck with a hatch and
  // a sensor brow on top, twin nozzles at the back.
  function bulwarkHull() {
    const shell = refine(
      [
        [-0.84, 0.14, 0.12, 0],
        [-0.79, 0.34, 0.21, -0.02],
        [-0.66, 0.48, 0.27, -0.03],
        [-0.46, 0.56, 0.31, -0.03],
        [-0.15, 0.6, 0.33, -0.03],
        [0.15, 0.6, 0.33, -0.03],
        [0.37, 0.55, 0.31, -0.03],
        [0.52, 0.47, 0.28, -0.03],
        [0.62, 0.35, 0.24, -0.02],
        [0.68, 0.16, 0.17, 0],
      ],
      2
    );
    // the raised deck on the shell: a second armour layer, boxier
    const deck = refine(
      [
        [-0.62, 0.16, 0.3, 0.16],
        [-0.56, 0.3, 0.38, 0.16],
        [-0.4, 0.38, 0.43, 0.16],
        [0.12, 0.4, 0.45, 0.16],
        [0.36, 0.34, 0.42, 0.16],
        [0.48, 0.2, 0.36, 0.16],
      ],
      2
    );
    const chassis = [
      [-0.74, 0.2, 0.02, -0.12],
      [-0.68, 0.4, 0.04, -0.19],
      [-0.5, 0.48, 0.04, -0.21],
      [0.3, 0.48, 0.04, -0.21],
      [0.5, 0.42, 0.04, -0.19],
      [0.6, 0.26, 0.02, -0.12],
    ];
    const track = [
      [-0.76, 0.05, -0.04, -0.14],
      [-0.71, 0.12, 0.03, -0.21],
      [-0.6, 0.15, 0.05, -0.24],
      [0.14, 0.15, 0.05, -0.24],
      [0.26, 0.12, 0.03, -0.21],
      [0.32, 0.05, -0.04, -0.14],
    ];
    // armour skirts over the tracks' upper half
    const skirt = [
      [-0.72, 0.025, 0.05, -0.03],
      [-0.66, 0.035, 0.1, -0.1],
      [0.2, 0.035, 0.1, -0.1],
      [0.28, 0.025, 0.05, -0.03],
    ];
    const brow = [
      [0.34, 0.22, 0.432, 0.34],
      [0.44, 0.2, 0.402, 0.31],
      [0.51, 0.12, 0.362, 0.3],
    ];
    const tread = new THREE.BoxGeometry(0.06, 0.2, 0.03);
    const skid = new THREE.BoxGeometry(0.07, 0.03, 0.5);
    const louvre = new THREE.BoxGeometry(0.03, 0.03, 0.2);
    const nozzle = [
      [0.06, -0.1],
      [0.095, -0.02],
      [0.105, 0.05],
      [0.098, 0.075],
    ];
    const bore = [
      [0.098, 0.075],
      [0.08, 0.07],
      [0.065, 0.02],
      [0, 0.01],
    ];
    const back = v3(-1, 0, 0);
    const sides = [1, -1];
    return [
      { geometry: loft(shell, 18, 2.8), color: hull },
      { geometry: loft(deck, 16, 4), color: hull },
      { geometry: loft(chassis, 12, 3), color: dark },
      { geometry: loft(brow, 10, 3), color: dark },
      ...sides.flatMap((s) => [
        { geometry: loft(track, 16, 3, s * 0.55), color: dark },
        { geometry: loft(skirt, 8, 4, s * 0.72), color: hull },
      ]),
      ...sides.flatMap((s) =>
        [-0.55, -0.35, -0.15, 0.05].map((x) => ({
          geometry: tread,
          color: hull,
          position: [x, -0.09, s * 0.7],
        }))
      ),
      ...[-0.3, 0.15].map((x) => ({
        geometry: skid,
        color: hull,
        position: [x, -0.215, 0],
      })),
      // engine louvres on the rear slope, behind the deck
      ...[-0.67, -0.73].map((x, i) => ({
        geometry: louvre,
        color: dark,
        position: [x, 0.27 - i * 0.04, 0],
      })),
      ...sides.map((s) => ({
        geometry: sweep(
          [
            v3(0.44, 0.15, s * 0.3),
            v3(0.64, 0.14, s * 0.36),
            v3(0.84, 0.13, s * 0.42),
          ],
          (i, a) => {
            const r = [0.06, 0.05, 0.04][i];
            return [Math.cos(a) * r, Math.sin(a) * r];
          },
          8,
          { capped: true }
        ),
        color: hull,
      })),
      ...sides.flatMap((s) => [
        {
          geometry: aim(lathe(nozzle, 10), back, v3(-0.78, 0.11, s * 0.19)),
          color: hull,
        },
        {
          geometry: aim(lathe(bore, 10), back, v3(-0.78, 0.11, s * 0.19)),
          color: dark,
        },
      ]),
      {
        geometry: lathe(
          [
            [0, -0.01],
            [0.16, -0.01],
            [0.175, 0.02],
            [0.155, 0.04],
            [0.11, 0.036],
            [0, 0.04],
          ],
          14
        ),
        color: dark,
        position: [-0.12, 0.435, 0],
      },
    ];
  }

  // --- Caster: a mortar on a turret: dark hover skirt (three pads under
  // it), an armour ring at the waist, a domed turret with the barrel in a
  // yoke and an ammo drum at the back. The barrel's muzzle is the lens's
  // housing: the charging shell glows in it.
  const casterPivot = v3(0.08, 0.42, 0);
  const casterAim = v3(Math.cos(0.62), Math.sin(0.62), 0);
  const casterMuzzle = casterPivot.clone().addScaledVector(casterAim, 0.78);
  function casterBody() {
    const { x: px, y: py } = casterPivot;
    const cheek = new THREE.Shape();
    cheek.moveTo(px - 0.17, 0.24);
    cheek.lineTo(px + 0.17, 0.24);
    cheek.lineTo(px + 0.17, py);
    cheek.absarc(px, py, 0.17, 0, Math.PI, false);
    cheek.lineTo(px - 0.17, 0.24);
    const yoke = (z) =>
      new THREE.ExtrudeGeometry(cheek, {
        depth: 0.06,
        bevelEnabled: true,
        bevelThickness: 0.015,
        bevelSize: 0.015,
        bevelSegments: 1,
        curveSegments: 6,
      }).translate(0, 0, z);
    const barrel = (profile, segments) =>
      aim(lathe(profile, segments), casterAim, casterPivot);
    const hoop = (u) =>
      barrel(
        [
          [0.138, u - 0.035],
          [0.162, u - 0.025],
          [0.162, u + 0.025],
          [0.138, u + 0.035],
        ],
        16
      );
    const pad = lathe(
      [
        [0, -0.285],
        [0.07, -0.285],
        [0.1, -0.272],
        [0.1, -0.25],
      ],
      12
    );
    return [
      {
        geometry: lathe(
          [
            [0, -0.26],
            [0.36, -0.26],
            [0.52, -0.235],
            [0.63, -0.17],
            [0.7, -0.09],
            [0.715, -0.04],
          ],
          28
        ),
        color: dark,
      },
      {
        geometry: lathe(
          [
            [0.7, -0.065],
            [0.765, -0.035],
            [0.79, 0.005],
            [0.775, 0.045],
            [0.72, 0.08],
            [0.62, 0.105],
          ],
          28
        ),
        color: hull,
      },
      {
        geometry: lathe(
          [
            [0.6, 0.085],
            [0.64, 0.1],
            [0.62, 0.13],
            [0.57, 0.14],
          ],
          28
        ),
        color: dark,
      },
      {
        geometry: lathe(
          refine(
            [
              [0.575, 0.12],
              [0.565, 0.19],
              [0.51, 0.28],
              [0.41, 0.35],
              [0.27, 0.4],
              [0.13, 0.42],
              [0, 0.425],
            ],
            2
          ),
          28
        ),
        color: hull,
      },
      {
        geometry: lathe(
          [
            [0.5, 0.275],
            [0.508, 0.292],
            [0.47, 0.322],
            [0.45, 0.332],
          ],
          28
        ),
        color: dark,
      },
      {
        geometry: barrel(
          [
            [0, -0.2],
            [0.12, -0.19],
            [0.18, -0.14],
            [0.2, -0.06],
            [0.2, 0.06],
            [0.15, 0.1],
            [0.14, 0.5],
            [0.15, 0.64],
            [0.175, 0.73],
            [0.19, 0.8],
            [0.19, 0.83],
            [0.16, 0.845],
          ],
          16
        ),
        color: hull,
      },
      {
        geometry: barrel(
          [
            [0.16, 0.845],
            [0.13, 0.825],
            [0.118, 0.62],
            [0, 0.6],
          ],
          16
        ),
        color: dark,
      },
      { geometry: hoop(0.26), color: dark },
      { geometry: hoop(0.44), color: dark },
      { geometry: yoke(0.205), color: hull },
      { geometry: yoke(-0.265), color: hull },
      {
        geometry: new THREE.CylinderGeometry(0.055, 0.055, 0.62, 10)
          .rotateX(Math.PI / 2)
          .translate(px, py, 0),
        color: dark,
      },
      {
        geometry: lathe(
          [
            [0, -0.19],
            [0.12, -0.19],
            [0.145, -0.17],
            [0.145, 0.17],
            [0.12, 0.19],
            [0, 0.19],
          ],
          14
        )
          .rotateX(Math.PI / 2)
          .translate(-0.42, 0.25, 0),
        color: dark,
      },
      ...[0, 1, 2].map((k) => {
        const a = TAU / 6 + (k * TAU) / 3;
        return {
          geometry: pad,
          color: hull,
          position: [Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3],
        };
      }),
    ];
  }

  // --- Leech: a soft pod of four segments (dark grooves between them)
  // flattened over a dark creeping sole and stubby prolegs, its maw forward
  // (a dark throat ringed with teeth), the belly window's dark socket on its
  // back.
  const LEECH_SQUASH = [1, 0.74, 1.28];
  const leechBelly = v3(0.02, 0.37, 0);
  const leechMaw = v3(0.9, 0, 0);
  const alongX = (geometry) => geometry.rotateZ(-Math.PI / 2);
  function leechBody(tone) {
    const pod = (profile, segments) => ({
      geometry: alongX(lathe(profile, segments)),
      scale: LEECH_SQUASH,
    });
    const groove = (u, r) => ({
      ...pod(
        [
          [r - 0.02, u - 0.035],
          [r + 0.022, u - 0.018],
          [r + 0.022, u + 0.018],
          [r - 0.02, u + 0.035],
        ],
        24
      ),
      color: dark,
    });
    const tooth = new THREE.ConeGeometry(0.035, 0.1, 5);
    const teeth = Array.from({ length: 6 }, (_, k) => {
      const a = ((k + 0.5) / 6) * TAU;
      const [, sy, sz] = LEECH_SQUASH;
      const base = v3(0.88, Math.cos(a) * 0.2 * sy, Math.sin(a) * 0.2 * sz);
      return {
        geometry: aim(
          tooth.clone(),
          v3(1, -Math.cos(a) * 0.6, -Math.sin(a) * 0.6),
          base
        ),
        color: dark,
      };
    });
    // stubby prolegs low on each flank, one per segment: [x, z]
    const proleg = lathe(
      [
        [0, -0.05],
        [0.045, -0.045],
        [0.06, -0.01],
        [0.05, 0.03],
        [0.025, 0.05],
        [0, 0.055],
      ],
      6
    );
    const prolegs = [
      [-0.41, 0.36],
      [0.02, 0.51],
      [0.44, 0.39],
    ].flatMap(([x, z]) =>
      [1, -1].map((s) => ({
        geometry: aim(proleg.clone(), v3(0, -0.5, s), v3(x, -0.27, s * z)),
        color: dark,
      }))
    );
    return [
      {
        ...pod(
          [
            [0, -1.02],
            [0.09, -0.99],
            [0.18, -0.92],
            [0.27, -0.82],
            [0.33, -0.71],
            [0.34, -0.63],
            [0.42, -0.53],
            [0.465, -0.41],
            [0.455, -0.29],
            [0.42, -0.22],
            [0.5, -0.12],
            [0.55, 0],
            [0.55, 0.13],
            [0.5, 0.25],
            [0.45, 0.31],
            [0.48, 0.39],
            [0.47, 0.5],
            [0.42, 0.62],
            [0.36, 0.71],
            [0.34, 0.77],
            [0.3, 0.85],
            [0.26, 0.9],
            [0.235, 0.915],
          ],
          28
        ),
        color: tone,
      },
      {
        ...pod(
          [
            [0.235, 0.915],
            [0.2, 0.89],
            [0.14, 0.83],
            [0.06, 0.78],
            [0, 0.77],
          ],
          20
        ),
        color: dark,
      },
      groove(-0.63, 0.34),
      groove(-0.22, 0.42),
      groove(0.31, 0.45),
      {
        ...pod(
          [
            [0, -1.055],
            [0.05, -1.045],
            [0.1, -1.0],
            [0.11, -0.97],
          ],
          14
        ),
        color: dark,
      },
      {
        geometry: alongX(
          lathe(
            [
              [0, -0.86],
              [0.2, -0.8],
              [0.34, -0.6],
              [0.42, -0.25],
              [0.44, 0.15],
              [0.38, 0.5],
              [0.22, 0.74],
              [0, 0.8],
            ],
            20
          )
        ),
        color: dark,
        scale: [1, 0.14, 0.98],
        position: [0, -0.33, 0],
      },
      {
        geometry: lathe(
          [
            [0.9, -0.075],
            [1.05, -0.03],
            [1.1, 0.03],
            [1.04, 0.062],
            [0.94, 0.052],
          ],
          20
        ),
        color: dark,
        scale: [0.29, 1, 0.25],
        position: leechBelly.toArray(),
      },
      ...teeth,
      ...prolegs,
    ];
  }

  return {
    outline,
    huskShell,
    weaverHub,
    weaverArms,
    weaverTip,
    bulwarkHull,
    casterBody,
    casterMuzzle,
    leechBody,
    leechBelly,
    leechMaw,
  };
}
