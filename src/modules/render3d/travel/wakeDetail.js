// src/modules/render3d/travel/wakeDetail.js
//
// The small things on the Wake's plating (wake.js, wakeStern.js): vents,
// hatches, equipment boxes, rows of lit windows, pipe runs and trim strips,
// laid on a flat hull facet (wakeHull.js `facet`: at(fx, ft), 0..1 along
// and across) on both sides of the ship. Sizes are in authoring units.

import { WAKE_COLORS as C } from './wakeHull.js';

/** A facet's fittings: { patch, vent, hatch, unit, windows, pipes, strip, light, scatter }. */
export function fittings(kit, at) {
  const { V, add, plate, tube, lamp, paint, random } = kit;
  const origin = at(0, 0);
  const length = origin.distanceTo(at(1, 0));
  const height = origin.distanceTo(at(0, 1));
  const normal = at(1, 0).sub(origin).cross(at(0, 1).sub(origin)).normalize();
  const mid = at(0.5, 0.5);
  if (normal.dot(V(0, mid.y, mid.z)) < 0) normal.negate();

  // A rectangle of the facet about (fx, ft), w along and h across, standing
  // from `lift` to `lift + thick`.
  const patch = (fx, ft, w, h, lift, thick, color, set = 'hull') => {
    const [dx, dt] = [w / length / 2, h / height / 2];
    add(
      set,
      plate(
        [
          at(fx - dx, ft - dt),
          at(fx + dx, ft - dt),
          at(fx + dx, ft + dt),
          at(fx - dx, ft + dt),
        ],
        lift,
        thick
      ),
      color,
      { mirror: true, uv: set === 'hull' }
    );
  };
  // A louvred vent: a dark well with slats across it.
  const vent = (fx, ft, w, h) => {
    patch(fx, ft, w, h, 0.05, 0.2, paint(C.dark));
    const count = Math.max(2, Math.floor(h / 0.2));
    for (let n = 0; n < count; n += 1) {
      const t = ft + ((n + 0.5) / count - 0.5) * ((h - 0.12) / height);
      patch(fx, t, w - 0.14, (h / count) * 0.45, 0.25, 0.05, paint(C.mid));
    }
  };
  // An access hatch: a raised frame, a lid, two hinges.
  const hatch = (fx, ft, w, h) => {
    patch(fx, ft, w, h, 0.05, 0.2, paint(C.grey));
    patch(fx, ft, w - 0.26, h - 0.26, 0.25, 0.05, paint(C.light));
    [-1, 1].forEach((side) =>
      patch(
        fx + (side * (w * 0.3)) / length,
        ft - (h / 2 - 0.06) / height,
        0.22,
        0.12,
        0.25,
        0.1,
        paint(C.dark)
      )
    );
  };
  // A piece of equipment: a box with a lid, sometimes a status lamp.
  const unit = (fx, ft, w, h) => {
    const tall = 0.25 + random() * 0.45;
    const css = [C.mid, C.grey, C.dark, C.mid][Math.floor(random() * 4)];
    patch(fx, ft, w, h, 0.05, tall, paint(css));
    patch(fx, ft, w * 0.7, h * 0.6, 0.05 + tall, 0.06, paint(C.dark));
    if (random() < 0.35) {
      const p = at(fx + (w * 0.25) / length, ft);
      [1, -1].forEach((s) =>
        lamp(
          'lamps',
          V(p.x, p.y, p.z * s).addScaledVector(
            V(normal.x, normal.y, normal.z * s),
            0.11 + tall
          ),
          V(normal.x, normal.y, normal.z * s),
          C.amber,
          { size: 0.08, spill: 0.5, spillGain: 0.35 }
        )
      );
    }
  };
  // A row of small lit windows on a dark band.
  const windows = (fx, ft, w, lit = 0.6) => {
    patch(fx, ft, w, 0.42, 0.05, 0.19, paint(C.dark));
    const count = Math.max(1, Math.floor(w / 0.55));
    for (let n = 0; n < count; n += 1) {
      if (random() > lit) continue;
      const x = fx + ((n + 0.5) / count - 0.5) * ((w - 0.2) / length);
      patch(
        x,
        ft,
        0.32,
        0.18,
        0.24,
        0.03,
        paint(random() < 0.7 ? C.glass : C.amber, 0.9 + random() * 0.6),
        'windows'
      );
    }
  };
  // Pipes run along the facet at `ft` from fx0 to fx1, clamped as they go.
  const pipes = (fx0, fx1, ft, count = 2) => {
    for (let n = 0; n < count; n += 1) {
      const t = ft + ((n - (count - 1) / 2) * 0.22) / height;
      const off = normal.clone().multiplyScalar(0.1);
      add(
        'hull',
        tube(at(fx0, t).add(off), at(fx1, t).add(off), 0.07, 5, true),
        paint(n % 2 ? C.orange : C.mid),
        { mirror: true, smooth: true }
      );
    }
    for (let x = fx0 + 0.8 / length; x < fx1; x += 2.6 / length) {
      patch(x, ft, 0.2, count * 0.22 + 0.16, 0, 0.24, paint(C.dark));
    }
  };
  // A trim strip along the facet at `ft`.
  const strip = (fx0, fx1, ft, h, color, lift = 0.1, thick = 0.16) =>
    patch((fx0 + fx1) / 2, ft, (fx1 - fx0) * length, h, lift, thick, color);
  // A lamp on the facet at (fx, ft), on both sides of the ship.
  const light = (fx, ft, set, css, options) => {
    const p = at(fx, ft);
    [1, -1].forEach((s) =>
      lamp(
        set,
        V(p.x, p.y, p.z * s).addScaledVector(
          V(normal.x, normal.y, normal.z * s),
          options?.lift || 0.2
        ),
        V(normal.x, normal.y, normal.z * s),
        css,
        options
      )
    );
  };
  // Fittings scattered over a grid of cells about `cell` in size; `keep`
  // (fx, ft) → false leaves a cell bare (the mark, a trench).
  const scatter = ({ density = 0.4, cell = [2.6, 1.5], keep, lit = true }) => {
    const nx = Math.max(1, Math.round(length / cell[0]));
    const nt = Math.max(1, Math.round(height / cell[1]));
    for (let i = 0; i < nx; i += 1) {
      for (let j = 0; j < nt; j += 1) {
        const fx = (i + 0.3 + random() * 0.4) / nx;
        const ft = (j + 0.35 + random() * 0.3) / nt;
        if (random() > density || (keep && !keep(fx, ft))) continue;
        const w = Math.min(cell[0] * 0.75, 0.7 + random() * 1.3);
        const h = Math.min(cell[1] * 0.6, 0.45 + random() * 0.6);
        const roll = random();
        if (roll < 0.3) vent(fx, ft, w, h);
        else if (roll < 0.55) hatch(fx, ft, w, h);
        else if (roll < 0.85 || !lit) unit(fx, ft, w, h);
        else windows(fx, ft, Math.min(cell[0] * 0.8, w + 0.8));
      }
    }
  };
  return {
    patch,
    vent,
    hatch,
    unit,
    windows,
    pipes,
    strip,
    light,
    scatter,
    length,
    height,
  };
}
