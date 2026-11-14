// The player hull's 3D shape: the hull data (form stations, wing and flap
// panels with their upgrades applied, nozzles, cockpit) built as layered,
// chamfered plates: a dark keel, the fuselage, lighter shoulder armour and a
// spine with vents; wings cut from the fin panels with an armour plate on top,
// a fence and a weapon rail at the tip; canards and canted tail fins; a banded
// nacelle with an intake and a bell round every nozzle; a faceted canopy in
// a dark socket. Each part has a finish: satin paint, glossier accent
// panels (shoulder and wing armour, tail fins, flaps) or polished steel
// (nozzle bells and bands, intake rims, the weapon rail's barrel, trim
// strips, the antenna and the chin sensor). hullModel.js calls it and merges
// what it returns, so the game and the menu draw it like any other hull.
// Points are [x, height, y] in hull units, as in hullModel.js.

import { SHIP_SIZE } from '../../data/constants/physics.js';

const S = SHIP_SIZE;
// Tones, as hullTones (STEEL: the polished metal's own).
const [DEEP, BASE, FIN, SPINE, STEEL] = [0, 1, 2, 3, 4];
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
 * (hullTones) with the hull's albedo. Returns { plates, raised, canopy, edges,
 * tips, deckY }: `plates` (fuselage and wings: what a dash ghost draws) and
 * `raised` (the rest) as mergeStatic parts, the canopy's glass, the edge
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

  // A slab from a top outline ([x, y] hull units), y0 up to y1, chamfered;
  // `shape(v)` may move each vertex afterwards.
  function slab(outline, y0, y1, bevel, shape = null) {
    const path = new THREE.Shape(
      outline.map(([x, z]) => new THREE.Vector2(x, z))
    );
    const solid = new THREE.ExtrudeGeometry(path, {
      depth: y1 - y0 - 2 * bevel,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelOffset: -bevel,
      bevelSegments: 1,
      curveSegments: 1,
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
  const part = (solid, tone, finish = FINISH.paint) => ({
    geometry: solid,
    color: colors[tone],
    flat: true,
    finish,
  });
  // The fuselage's outline, `k` times as wide, between x0 (fore) and x1.
  const outline = (k, x0 = rows[0][0], x1 = rows[rows.length - 1][0]) => {
    const xs = [
      x0,
      ...rows.map((row) => row[0]).filter((x) => x < x0 && x > x1),
      x1,
    ];
    const side = xs.map((x) => [x, Math.max(0.12, rowAt(x)[1] * k)]);
    return [...side, ...side.map(([x, z]) => [x, -z]).reverse()];
  };
  const centroid = (points) =>
    points
      .reduce(([cx, cy], p) => [cx + p.x, cy + p.y], [0, 0])
      .map((v) => v / points.length);
  const inset = (points, k) => {
    const [cx, cy] = centroid(points);
    return points.map((p) => [cx + (p.x - cx) * k, cy + (p.y - cy) * k]);
  };

  const [nose, tail] = [rows[0][0], rows[rows.length - 1][0]];
  const plates = [
    part(slab(outline(0.62, nose * 0.82), ...KEEL, 0.3, taper), DEEP),
    part(slab(outline(1), ...FUSELAGE, 0.38, taper), FIN),
  ];
  const raised = [
    part(
      slab(outline(0.74, nose * 0.5, tail * 0.92), ...SHOULDER, 0.26, taper),
      SPINE,
      GLOSS
    ),
    part(
      slab(
        outline(0.34, nose * 0.16, tail * 0.98),
        SHOULDER[1] - 0.2,
        SPINE_TOP,
        0.2,
        taper
      ),
      FIN
    ),
    // vents across the spine astern, an antenna behind them
    ...[0.7, 0.5, 0.3].map((t) =>
      part(box(0.5, 0.16, 1.5, [tail * t, SPINE_TOP * tall(tail * t), 0]), DEEP)
    ),
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
      plates.push(part(slab(points, ...WING, 0.2, thin), BASE));
      raised.push(
        part(
          slab(inset(panel.points, 0.72), WING[1] - 0.2, WING_PLATE_TOP, 0.12),
          SPINE,
          GLOSS
        )
      );
      // the lit leading edge (the panel's first side); a blade's burns in
      // the accent, along its trailing edge too
      const corner = (i, dx, h) => [points[i][0] + dx, h, points[i][1]];
      const lit = geometry.blades ? 'bladeEdge' : 'edge';
      line(lit, corner(0, 0.1, WING[1]), corner(1, 0.1, WING[1] - 0.25));
      if (geometry.blades) {
        for (let i = 1; i < points.length - 1; i += 1) {
          line(
            lit,
            corner(i, -0.1, WING[1] - 0.25),
            corner(i + 1, -0.1, WING[1] - 0.1)
          );
        }
      }
      const { x, y } = panel.rcsPort;
      tips.push([x, NOZZLE_HEIGHT, y]);
      raised.push(
        part(box(3.6, 0.7, 0.2, [cx - 0.4, WING_PLATE_TOP, cy]), STEEL, METAL)
      );
      // the weapon rail along the tip
      if (form.pods) {
        raised.push(
          part(box(8.5, 0.75, 0.8, [x + 3.2, WING[0] + 0.2, y]), DEEP),
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
              0.1
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
        0.08
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
        part(slab(points, WING[1], WING[1] + 0.55, 0.12), FIN, GLOSS)
      );
    } else if (panel.armor) {
      // shoulder armour: a slab over the wing root and a smaller one on
      // it, the accent trim along the lower slab's outboard edges
      const lower = inset(panel.points, 0.8);
      const top = WING_PLATE_TOP + 1.5;
      raised.push(
        part(slab(lower, WING[1] - 0.2, top, 0.3), FIN),
        part(
          slab(inset(panel.points, 0.5), top - 0.2, top + 0.8, 0.25),
          SPINE,
          GLOSS
        )
      );
      lower.forEach((a, i) => {
        const b = lower[(i + 1) % lower.length];
        const outboard = sign * ((a[1] + b[1]) / 2 - cy);
        if (outboard > 0.5) {
          line('bladeEdge', [a[0], top + 0.05, a[1]], [b[0], top + 0.05, b[1]]);
        }
      });
    }
  });

  // Nacelles: an intake rim, a casing with two steel bands, the steel bell
  // to the exit lip and a dark throat inside it.
  geometry.nozzles.forEach(({ x, y, r, exitX }) => {
    const fore = x + (form.nacelle ?? 0.3) * S;
    const at = [NOZZLE_HEIGHT, y];
    raised.push(
      part(drum(fore, x, r * 1.25, r * 1.4, ...at), FIN),
      part(
        drum(fore + 0.2, fore - 0.25, r * 0.95, r * 0.95, ...at),
        STEEL,
        METAL
      ),
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

  // Canopy: faceted glass in a dark socket a size larger.
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
  const lift = (form.canopy ?? 0.1) * S;
  raised.push(
    part(slab(canopyOutline(1.25), seat - 0.5, seat + 0.25, 0.12), DEEP)
  );
  const canopy = slab(
    canopyOutline(1),
    seat - 0.2,
    seat + lift,
    Math.min(0.45, lift / 2.5)
  );
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
