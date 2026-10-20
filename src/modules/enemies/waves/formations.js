/**
 * Formations
 *
 * Where a formation's units come in (src/data/layerParts.js FORMATIONS):
 * each unit's point, the velocity it flies in at and how many seconds it
 * holds that course (BaseEnemy `course`) before its own movement takes
 * over. Pure: the ship, the field and a seeded stream in, the points out.
 */

import { clamp } from '../../../utils/mathHelpers.js';

const TAU = Math.PI * 2;
// Units start this far inside the field (px). A ring's unit never starts
// closer to the ship than RING_MIN of its radius (against a wall the ring
// opens there instead), its angles picked from RING_SAMPLES round the ship.
// A swarm's pack centre lands within SWARM_DRIFT of the edge's length of the
// ship's lane. Proposta 20/10.
export const FORMATION_INSET = 40;
export const RING_MIN = 0.6;
const RING_SAMPLES = 72;
const SWARM_DRIFT = 0.2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// The field's four edges: `along` runs the edge's length, `depth` in from
// it; `inward` points into the field.
const EDGES = {
  top: { along: 'x', inward: [0, 1] },
  bottom: { along: 'x', inward: [0, -1] },
  left: { along: 'y', inward: [1, 0] },
  right: { along: 'y', inward: [-1, 0] },
};

/** The edge farthest from the ship, as a surge picks it. */
export function farEdge(ship, width, height) {
  const distances = {
    top: ship.y,
    bottom: height - ship.y,
    left: ship.x,
    right: width - ship.x,
  };
  return Object.keys(distances).reduce((best, side) =>
    distances[side] > distances[best] ? side : best
  );
}

// An edge's geometry on this field: its length, the distance across to the
// opposite edge, the ship's place along it, and a point `along`/`depth` in.
function edgeOf(side, ship, width, height) {
  const { along, inward } = EDGES[side];
  const length = along === 'x' ? width : height;
  return {
    side,
    length,
    span: along === 'x' ? height : width,
    lane: along === 'x' ? ship.x : ship.y,
    inward,
    at(a, depth) {
      if (side === 'top') return { x: a, y: depth };
      if (side === 'bottom') return { x: a, y: height - depth };
      if (side === 'left') return { x: depth, y: a };
      return { x: width - depth, y: a };
    },
  };
}

// The edge's units at `alongs`, flying straight in across the whole field.
function crossing(edge, alongs, speed) {
  const [nx, ny] = edge.inward;
  const hold = (edge.span - 2 * FORMATION_INSET) / speed;
  return alongs.map((a) => ({
    ...edge.at(a, FORMATION_INSET),
    vx: nx * speed,
    vy: ny * speed,
    hold,
  }));
}

function ring({ radius, speed, hold }, count, { ship, width, height, random }) {
  // px from the ship to the inset field's border, along `angle`
  const reach = (angle) => {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const toX =
      dx > 0
        ? (width - FORMATION_INSET - ship.x) / dx
        : dx < 0
          ? (FORMATION_INSET - ship.x) / dx
          : Infinity;
    const toY =
      dy > 0
        ? (height - FORMATION_INSET - ship.y) / dy
        : dy < 0
          ? (FORMATION_INSET - ship.y) / dy
          : Infinity;
    return Math.max(0, Math.min(toX, toY));
  };
  const offset = random.range(0, TAU);
  const angles = Array.from(
    { length: RING_SAMPLES },
    (_, i) => offset + (i * TAU) / RING_SAMPLES
  );
  const open = angles.filter((angle) => reach(angle) >= radius * RING_MIN);
  const usable = open.length ? open : angles;
  const points = Array.from({ length: count }, (_, i) => {
    const angle = usable[Math.floor(((i + 0.5) * usable.length) / count)];
    const r = Math.min(radius, reach(angle));
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    return {
      x: ship.x + dx * r,
      y: ship.y + dy * r,
      vx: -dx * speed,
      vy: -dy * speed,
      hold,
    };
  });
  return { edge: null, points };
}

function sweep({ spacing, speed }, count, { ship, width, height }) {
  const edge = edgeOf(farEdge(ship, width, height), ship, width, height);
  const room = edge.length - 2 * FORMATION_INSET;
  const step = count > 1 ? Math.min(spacing, room / (count - 1)) : 0;
  const line = step * (count - 1);
  const start =
    clamp(
      edge.lane,
      FORMATION_INSET + line / 2,
      edge.length - FORMATION_INSET - line / 2
    ) -
    line / 2;
  const alongs = Array.from({ length: count }, (_, i) => start + i * step);
  return { edge: edge.side, points: crossing(edge, alongs, speed) };
}

function swarm(
  { spread, speed, hold },
  count,
  { ship, width, height, random }
) {
  const edge = edgeOf(farEdge(ship, width, height), ship, width, height);
  const drift = random.range(-SWARM_DRIFT, SWARM_DRIFT) * edge.length;
  const centre = edge.at(
    clamp(
      edge.lane + drift,
      FORMATION_INSET + spread,
      edge.length - FORMATION_INSET - spread
    ),
    FORMATION_INSET + spread
  );
  const dx = ship.x - centre.x;
  const dy = ship.y - centre.y;
  const distance = Math.hypot(dx, dy) || 1;
  const turn = random.range(0, TAU);
  // a sunflower: even density out to `spread`
  const points = Array.from({ length: count }, (_, i) => {
    const r = spread * Math.sqrt((i + 0.5) / count);
    const angle = turn + i * GOLDEN_ANGLE;
    return {
      x: centre.x + Math.cos(angle) * r,
      y: centre.y + Math.sin(angle) * r,
      vx: (dx / distance) * speed,
      vy: (dy / distance) * speed,
      hold,
    };
  });
  return { edge: edge.side, points };
}

function wall({ gap, speed }, count, { ship, width, height, random }) {
  const edge = edgeOf(farEdge(ship, width, height), ship, width, height);
  const room = edge.length - 2 * FORMATION_INSET;
  const step = count > 1 ? (room - gap) / (count - 1) : 0;
  // the gap falls between two units, never at an end
  const before = count > 1 ? random.int(1, count - 1) : 0;
  const alongs = Array.from(
    { length: count },
    (_, i) => FORMATION_INSET + i * step + (i >= before ? gap : 0)
  );
  return { edge: edge.side, points: crossing(edge, alongs, speed) };
}

const SHAPES = { ring, sweep, swarm, wall };

/**
 * A formation's `count` points on a field `width` × `height` around `ship`
 * (clamped onto the field), drawing from `random`: { edge, points }, `edge`
 * the side it comes in from (null for a ring), each point
 * { x, y, vx, vy, hold }.
 */
export function formationPoints(
  formation,
  count,
  { ship, width, height, random }
) {
  const shape = SHAPES[formation.kind];
  if (!shape) throw new Error(`[formations] no formation '${formation.kind}'`);
  const at = {
    x: clamp(ship?.x ?? width / 2, 0, width),
    y: clamp(ship?.y ?? height / 2, 0, height),
  };
  return shape(formation, count, { ship: at, width, height, random });
}
