// The player hull's 3D shape: the hull data (form stations, wing and flap
// panels with their upgrades applied, nozzles, cockpit) built as a continuous
// rounded fuselage, a dark keel, and layered panels along the wings and spine;
// a fence and a weapon rail at the tip; canards and canted tail fins; a banded
// nacelle with an intake and a bell round every nozzle; and an opaque remote
// sensor below a smoked glass cover. Each part has a finish: satin paint, glossier accent
// panels (shoulder and wing armour, tail fins, flaps) or polished steel
// (nozzle bells and bands, intake rims, the weapon rail's barrel, trim
// strips, the antenna and the chin sensor). hullModel.js calls it and merges
// what it returns, so the game and the menu draw it like any other hull.
// Points are [x, height, y] in hull units, as in hullModel.js.

import { SHIP_SIZE } from '../../data/constants/physics.js';

const S = SHIP_SIZE;
// Tones, as hullTones (STEEL: the polished metal's own).
const [DEEP, BASE, FIN, SPINE, STEEL, ACCENT] = [0, 1, 2, 3, 4, 5];
/** The finishes: the material each part draws in (hullModel.js HULL_FINISHES). */
export const FINISH = Object.freeze({ paint: 0, gloss: 1, metal: 2 });
const { gloss: GLOSS, metal: METAL } = FINISH;
// Heights (hull units) of the layers at the hull's tallest station; they
// shrink toward the nose with the deck (form.body).
const KEEL = [1.1, 2.3];
const FUSELAGE = [2.0, 3.9];
const SHOULDER = [3.7, 4.5];
const SPINE_TOP = 5.1;
const WING = [2.15, 3.0];
const WING_PLATE_TOP = 3.3;
// Mirrors NOZZLE_HEIGHT in hullModel.js (which imports this file).
const NOZZLE_HEIGHT = 2.6;

/**
 * `geometry`: the hull's geometry (hullArt.js). `colors`: the hull tones
 * (hullTones or the hull's livery). Returns { plates, raised, canopy, edges,
 * tips, deckY }: `plates` (fuselage and wings: what a dash ghost draws) and
 * `raised` (the rest) as mergeStatic parts, the sensor window, the edge
 * segments, the wingtip points in the panels' order and the deck height at
 * `pivotX`.
 */
export function buildSlabHull(THREE, geometry, colors, pivotX) {
  const { form, cockpit } = geometry;
  const rows = form.body.map((row) => row.map((v) => v * S));
  // The station at x, linearly between the form's rows (nose first).
  const rowAt = (x) => {
    const found = rows.findIndex((row) => row[0] <= x);
    const i = found < 0 ? rows.length - 1 : Math.max(1, found);
    const [a, b] = [rows[i - 1], rows[i]];
    const t = Math.max(0, Math.min(1, (a[0] - x) / (a[0] - b[0] || 1)));
    return a.map((v, k) => v + (b[k] - v) * t);
  };
  const deckOf = (row) => row[2] + row[3];
  const deckMax = Math.max(...rows.map(deckOf));
  // 1 at the tallest station, less toward the nose.
  const tall = (x) => Math.max(0.16, deckOf(rowAt(x)) / deckMax);
  const mid = (KEEL[1] + FUSELAGE[0]) / 2;
  const taper = (v) => {
    v.y = mid + (v.y - mid) * tall(v.x);
  };

  // Trim each corner back along both edges, then round it in the plane.
  function roundedOutline(outline, radius) {
    const toward = ([x, z], [tx, tz]) => {
      const dx = tx - x;
      const dz = tz - z;
      const fraction = Math.min(0.36, radius / Math.hypot(dx, dz));
      return [x + dx * fraction, z + dz * fraction];
    };
    const path = new THREE.Shape();
    const last = outline.length - 1;
    path.moveTo(...toward(outline[last], outline[0]));
    outline.forEach((point, i) => {
      path.lineTo(...toward(point, outline[(i + last) % outline.length]));
      path.quadraticCurveTo(
        ...point,
        ...toward(point, outline[(i + 1) % outline.length])
      );
    });
    return path;
  }

  // A beveled plate with optional rounded corners in its top outline.
  function slab(outline, y0, y1, bevel, shape = null, radius = 0) {
    const path = radius
      ? roundedOutline(outline, radius)
      : new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z)));
    const solid = new THREE.ExtrudeGeometry(path, {
      depth: y1 - y0 - 2 * bevel,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelOffset: -bevel,
      bevelSegments: radius && bevel >= 0.3 ? 2 : 1,
      curveSegments: radius ? 2 : 1,
    });
    solid.rotateX(Math.PI / 2);
    solid.translate(0, y1 - bevel, 0);
    if (shape) {
      const position = solid.getAttribute('position');
      const v = new THREE.Vector3();
      for (let i = 0; i < position.count; i += 1) {
        shape(v.fromBufferAttribute(position, i));
        position.setXYZ(i, v.x, v.y, v.z);
      }
    }
    solid.setAttribute('uv2', solid.getAttribute('uv'));
    return solid;
  }
  function box(sx, sy, sz, at) {
    const solid = new THREE.BoxGeometry(sx, sy, sz).translate(...at);
    solid.setAttribute('uv2', solid.getAttribute('uv'));
    return solid;
  }
  // A drum along x from x0 back to x1, radius r0 to r1, centred on [h, z].
  function drum(x0, x1, r0, r1, h, z, sides = 10) {
    const solid = new THREE.CylinderGeometry(r0, r1, x0 - x1, sides)
      .rotateZ(-Math.PI / 2)
      .translate((x0 + x1) / 2, h, z);
    solid.setAttribute('uv2', solid.getAttribute('uv'));
    return solid;
  }
  const part = (solid, tone, finish = FINISH.paint, flat = true) => ({
    geometry: solid,
    color: colors[tone],
    flat,
    finish,
  });
  const betweenStations = (fore, aft) => [
    fore,
    ...rows.map(([x]) => x).filter((x) => x < fore && x > aft),
    aft,
  ];
  const centroid = (points) =>
    points
      .reduce(([cx, cy], p) => [cx + p.x, cy + p.y], [0, 0])
      .map((v) => v / points.length);
  const inset = (points, k) => {
    const [cx, cy] = centroid(points);
    return points.map((p) => [cx + (p.x - cx) * k, cy + (p.y - cy) * k]);
  };
  const between = ([ax, az], [bx, bz], t) => [
    ax + (bx - ax) * t,
    az + (bz - az) * t,
  ];

  const [nose, tail] = [rows[0][0], rows[rows.length - 1][0]];
  // Loft curved cross sections into one surface, with continuous normals.
  function curvedSkin(sections, sides, power) {
    const profile = (n) => Math.sign(n) * Math.abs(n) ** power;
    const stations = Array.from({ length: sides }, (_, side) => {
      const angle = (side / sides) * Math.PI * 2;
      return [profile(Math.cos(angle)), profile(Math.sin(angle))];
    });
    const points = [];
    const uv = [];
    const index = [];
    const push = (x, y, z) => {
      points.push(x, y, z);
      uv.push(x, z);
    };
    sections.forEach(([x, width, bottom, top], row) => {
      const center = (bottom + top) / 2;
      const height = (top - bottom) / 2;
      stations.forEach(([h, z], side) => {
        push(x, mid + (center + height * h - mid) * tall(x), width * z);
        if (row === sections.length - 1) return;
        const a = row * sides + side;
        const next = row * sides + ((side + 1) % sides);
        index.push(a, a + sides, next, a + sides, next + sides, next);
      });
    });
    for (const row of [0, sections.length - 1]) {
      const [x, , bottom, top] = sections[row];
      const cap = points.length / 3;
      push(x, mid + ((bottom + top) / 2 - mid) * tall(x), 0);
      for (let side = 0; side < sides; side += 1) {
        const a = row * sides + side;
        const b = row * sides + ((side + 1) % sides);
        index.push(cap, row === 0 ? a : b, row === 0 ? b : a);
      }
    }
    const solid = new THREE.BufferGeometry();
    solid.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    solid.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    solid.setAttribute('uv2', solid.getAttribute('uv'));
    solid.setIndex(index);
    solid.computeVertexNormals();
    // The dash uses the same vertex range as the base plates of the hull.
    return solid.toNonIndexed();
  }
  // The middle stations carry the shoulders in the fuselage's own skin.
  const bodySections = rows.map(([x, width]) => {
    const shoulder = 1 - THREE.MathUtils.smoothstep(x, nose * 0.1, nose * 0.57);
    const top = FUSELAGE[1] + (SHOULDER[1] - FUSELAGE[1]) * shoulder;
    return [x, Math.max(0.12, width), FUSELAGE[0], top];
  });
  const spineFront = nose * 0.34;
  const spineWidth = geometry.blades ? 0.62 : 0.72;
  const spineSections = betweenStations(spineFront, tail * 0.98).map((x) => {
    const drop = THREE.MathUtils.smoothstep(x, pivotX, spineFront);
    return [
      x,
      rowAt(x)[1] * spineWidth * (1 - 0.38 * drop),
      SHOULDER[1] - 0.68,
      SPINE_TOP - 0.95 * drop,
    ];
  });
  const keel = betweenStations(nose * 0.82, tail).map((x) => [
    x,
    Math.max(0.12, rowAt(x)[1] * 0.62),
  ]);
  const plates = [
    part(
      slab(
        [...keel, ...keel.map(([x, z]) => [x, -z]).reverse()],
        ...KEEL,
        0.4,
        taper
      ),
      DEEP
    ),
    part(
      curvedSkin(
        bodySections,
        16,
        geometry.blades ? 0.89 : form.canards ? 0.78 : 0.61
      ),
      geometry.blades ? BASE : FIN,
      FINISH.paint,
      false
    ),
  ];
  const raised = [
    part(
      curvedSkin(spineSections, 12, 0.48),
      geometry.blades ? DEEP : FIN,
      FINISH.paint,
      false
    ),
    // vents across the spine astern, an antenna behind them
    ...[0.72, 0.56, 0.4].map((position) => {
      const x = tail * position;
      const top = mid + (SPINE_TOP - mid) * tall(x);
      return part(box(0.52, 0.12, 1.6, [x, top, 0]), DEEP);
    }),
    part(box(0.12, 1.5, 0.12, [tail * 0.86, SPINE_TOP + 0.4, 0]), STEEL, METAL),
    // a chin sensor under the prow
    part(
      drum(nose * 0.86, nose * 0.7, 0.3, 0.55, KEEL[0] + 0.5, 0, 8),
      STEEL,
      METAL
    ),
  ];
  const edges = { edge: [], bladeEdge: [] };
  const tips = [];
  const line = (name, a, b) =>
    edges[name].push(new THREE.Vector3(...a), new THREE.Vector3(...b));

  geometry.panels.forEach((panel) => {
    const points = panel.points.map((p) => [p.x, p.y]);
    const [cx, cy] = centroid(panel.points);
    const sign = Math.sign(cy) || 1;
    if (panel.rcsPort) {
      // the blade, thinner toward the tip, and the armour plate on it
      const thin = (v) => {
        const out = Math.min(1, Math.abs(v.z) / 12);
        v.y = WING[0] + (v.y - WING[0]) * (1 - 0.35 * out);
      };
      plates.push(
        part(
          slab(points, ...WING, 0.23, thin, geometry.blades ? 0 : 0.42),
          BASE
        )
      );
      const upper = inset(panel.points, geometry.blades ? 0.81 : 0.8);
      raised.push(
        part(
          slab(
            upper,
            WING[1] - 0.4,
            WING_PLATE_TOP,
            0.22,
            null,
            geometry.blades ? 0 : 0.32
          ),
          geometry.blades ? SPINE : BASE
        )
      );
      // Interceptor's short wing markings and Solar Slicer's long blade inlays.
      if (geometry.blades || form.canards) {
        const blade = geometry.blades;
        const [a, b] = inset(panel.points, 0.78);
        const [c, d] = inset(panel.points, blade ? 0.56 : 0.38);
        const start = blade ? 0.04 : 0.1;
        const end = blade ? 0.96 : 0.54;
        const front = between(a, b, start);
        const tip = between(a, b, end);
        raised.push(
          part(
            slab(
              [front, tip, between(c, d, end), between(c, d, start)],
              WING_PLATE_TOP - 0.1,
              WING_PLATE_TOP + 0.04,
              0.02
            ),
            ACCENT,
            GLOSS
          )
        );
        line(
          blade ? 'bladeEdge' : 'edge',
          [front[0], WING_PLATE_TOP + 0.05, front[1]],
          [tip[0], WING_PLATE_TOP + 0.05, tip[1]]
        );
      }
      const { x, y } = panel.rcsPort;
      tips.push([x, NOZZLE_HEIGHT, y]);
      raised.push(
        part(box(3.6, 0.7, 0.2, [cx - 0.4, WING_PLATE_TOP, cy]), STEEL, METAL)
      );
      // the weapon rail along the tip
      if (form.pods) {
        const rail = [
          [x - 1.05, y - 0.4],
          [x + 7.45, y - 0.4],
          [x + 7.45, y + 0.4],
          [x - 1.05, y + 0.4],
        ];
        const cap = [
          [x - 0.65, y - 0.36],
          [x + 6.94, y - 0.36],
          [x + 7.28, y - 0.2],
          [x + 7.28, y + 0.2],
          [x + 6.94, y + 0.36],
          [x - 0.65, y + 0.36],
        ];
        raised.push(
          part(
            slab(rail, WING[0] - 0.18, WING[0] + 0.58, 0.21, null, 0.38),
            DEEP
          ),
          part(
            slab(cap, WING[0] + 0.48, WING[0] + 0.66, 0.07, null, 0.16),
            STEEL,
            METAL
          ),
          part(
            drum(x + 9.6, x + 7.4, 0.26, 0.26, WING[0] + 0.2, y, 6),
            STEEL,
            METAL
          )
        );
      }
      // canards off the prow
      if (form.canards) {
        const at = (fx) => [fx * nose, rowAt(fx * nose)[1]];
        const [ax, aw] = at(0.74);
        const [bx, bw] = at(0.52);
        raised.push(
          part(
            slab(
              [
                [ax, sign * aw * 0.8],
                [bx + 1.2, sign * (bw + 2.6)],
                [bx - 0.4, sign * (bw + 2.6)],
                [bx, sign * bw * 0.8],
              ],
              FUSELAGE[0] + 0.2,
              FUSELAGE[0] + 0.65,
              0.1,
              null,
              0.28
            ),
            BASE
          )
        );
      }
      // a canted tail fin each side of the spine
      const finAt = tail * 0.72;
      const fin = slab(
        [
          [2.6, 0],
          [-0.4, 3.6],
          [-2.4, 3.6],
          [-3.0, 0],
        ],
        -0.16,
        0.16,
        0.08,
        null,
        0.32
      )
        .rotateX(-Math.PI / 2)
        .rotateX(sign * 0.5)
        .translate(
          finAt,
          SHOULDER[1] * tall(finAt) - 0.3,
          sign * rowAt(finAt)[1] * 0.75
        );
      raised.push(part(fin, SPINE, GLOSS));
    } else if (panel.flap) {
      raised.push(
        part(
          slab(points, WING[1], WING[1] + 0.55, 0.12, null, 0.24),
          FIN,
          GLOSS
        )
      );
    } else if (panel.armor) {
      // Stepped shoulder armour with a transverse amber marking.
      const lower = inset(panel.points, 0.8);
      const top = WING_PLATE_TOP + 1.5;
      const upper = inset(panel.points, 0.62);
      const [a, b, c, d] = inset(panel.points, 0.48);
      const frontIn = between(a, d, 0.35);
      const frontOut = between(b, c, 0.35);
      raised.push(
        part(slab(lower, WING[1] - 0.3, top, 0.38, null, 0.48), DEEP),
        part(slab(upper, top - 0.2, top + 0.8, 0.4, null, 0.42), SPINE, GLOSS),
        part(
          slab(
            [frontIn, frontOut, between(b, c, 0.54), between(a, d, 0.54)],
            top + 0.76,
            top + 0.84,
            0.02
          ),
          ACCENT,
          GLOSS
        )
      );
      line(
        'bladeEdge',
        [frontIn[0], top + 0.85, frontIn[1]],
        [frontOut[0], top + 0.85, frontOut[1]]
      );
    }
  });

  // Nacelles: an intake rim, a casing with two steel bands, the steel bell
  // to the exit lip and a dark throat inside it.
  geometry.nozzles.forEach(({ x, y, r, exitX }) => {
    const fore = x + (form.nacelle ?? 0.3) * S;
    const at = [NOZZLE_HEIGHT, y];
    raised.push(
      part(drum(fore, x, r * 1.25, r * 1.4, ...at), BASE),
      part(
        drum(fore + 0.2, fore - 0.35, r * 1.06, r * 1.23, ...at),
        STEEL,
        METAL
      ),
      part(drum(fore + 0.24, fore + 0.18, r * 0.77, r * 0.78, ...at), DEEP),
      part(
        drum(fore - 0.9, fore - 1.6, r * 1.48, r * 1.48, ...at),
        STEEL,
        METAL
      ),
      part(drum(x + 0.9, x + 0.2, r * 1.5, r * 1.5, ...at), STEEL, METAL),
      part(drum(x, exitX, r * 1.5, r * 1.12, ...at), STEEL, METAL),
      part(drum(exitX + 0.5, exitX - 0.1, r * 0.92, r * 0.86, ...at), DEEP)
    );
  });

  // The remote sensor uses the former canopy seat and stays below the turret.
  const length = cockpit.to.x - cockpit.from.x;
  const [front, back] = [cockpit.to.x + length * 0.25, cockpit.from.x - length];
  const half = cockpit.width * 1.5;
  const canopyOutline = (k) => {
    const side = [
      [front, 0.2 * k],
      [front - (front - back) * 0.35, half * k],
      [front - (front - back) * 0.8, half * k],
      [back, half * 0.5 * k],
    ];
    return [...side, ...side.map(([x, z]) => [x, -z]).reverse()];
  };
  const seat = SHOULDER[1] * tall((front + back) / 2);
  const lift = (form.canopy ?? 0.1) * S * 0.7;
  const apertureX = front - (front - back) * 0.45;
  raised.push(
    part(slab(canopyOutline(1.12), seat - 0.5, seat + 0.33, 0.13), DEEP),
    part(
      box(length * 0.7, 0.25, half * 0.72, [apertureX, seat + 0.36, 0]),
      BASE
    ),
    part(
      box(0.24, 0.16, half * 0.49, [apertureX + length * 0.35, seat + 0.38, 0]),
      ACCENT
    )
  );

  // An arched optical cover gives the glass a moving reflection across its
  // surface. Its rim meets the opaque sensor mount at the original seat.
  const sections = canopyOutline(1).slice(0, 4);
  const rise = [0.22, 1, 0.83, 0.3];
  const arc = [-1, -0.65, 0, 0.65, 1];
  const positions = sections.flatMap(([x, width], row) =>
    arc.flatMap((s) => [
      x,
      seat + 0.29 + (lift - 0.29) * rise[row] * (1 - s * s),
      width * s,
    ])
  );
  const indices = [];
  for (let row = 0; row < sections.length - 1; row += 1) {
    for (let column = 0; column < arc.length - 1; column += 1) {
      const a = row * arc.length + column;
      const b = a + arc.length;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const canopy = new THREE.BufferGeometry();
  canopy.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  canopy.setIndex(indices);
  canopy.computeVertexNormals();
  canopy.computeBoundingSphere();

  return {
    plates,
    raised,
    canopy,
    edges,
    tips,
    deckY: SPINE_TOP * tall(pivotX),
  };
}
