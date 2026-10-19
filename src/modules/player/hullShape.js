// src/modules/player/hullShape.js
//
// A hull's shape as the game reads it: its outline and collision radius,
// the shield's padding and the thruster ports the flames leave from.
// PlayerSystem keeps the current hull's metrics; HullArt draws the panels.

import { SHIP_SIZE } from '../../core/GameConstants.js';

const DEFAULT_THRUSTER_PORTS = Object.freeze({
  main: Object.freeze({ x: -SHIP_SIZE * 0.95, y: 0 }),
  aux: Object.freeze({ x: SHIP_SIZE * 0.95, y: 0 }),
  left: Object.freeze({ x: 0, y: -SHIP_SIZE * 0.95 }),
  right: Object.freeze({ x: 0, y: SHIP_SIZE * 0.95 }),
});

export const buildClosedPath = (vertices) => {
  if (
    typeof Path2D !== 'function' ||
    !Array.isArray(vertices) ||
    vertices.length < 3
  ) {
    return null;
  }

  const path = new Path2D();
  let hasMoved = false;

  vertices.forEach((vertex) => {
    if (!vertex) return;
    if (!hasMoved) {
      path.moveTo(vertex.x, vertex.y);
      hasMoved = true;
      return;
    }

    path.lineTo(vertex.x, vertex.y);
  });

  if (!hasMoved) {
    return null;
  }

  path.closePath();
  return path;
};

export function computeHullMetrics(hullDefinition) {
  if (!hullDefinition) {
    return {
      outline: [],
      boundingRadius: SHIP_SIZE,
      shieldPadding: 0,
    };
  }

  const outline = Array.isArray(hullDefinition.outline)
    ? hullDefinition.outline.map((vertex) => ({
        x: Number.isFinite(vertex?.x) ? vertex.x : 0,
        y: Number.isFinite(vertex?.y) ? vertex.y : 0,
      }))
    : [];

  let boundingRadius = 0;
  outline.forEach((vertex) => {
    const radius = Math.hypot(vertex.x, vertex.y);
    if (radius > boundingRadius) {
      boundingRadius = radius;
    }
  });

  if (boundingRadius <= 0) {
    boundingRadius = SHIP_SIZE;
  }

  const shieldPadding =
    typeof hullDefinition.shieldPadding === 'number' &&
    Number.isFinite(hullDefinition.shieldPadding)
      ? hullDefinition.shieldPadding
      : 0;

  return {
    outline,
    boundingRadius,
    shieldPadding,
    outlinePath: buildClosedPath(outline),
  };
}

export function getHullThrusterPort(kind, hullDefinition) {
  const hullPorts =
    hullDefinition?.thrusterPorts &&
    typeof hullDefinition.thrusterPorts === 'object'
      ? hullDefinition.thrusterPorts
      : null;
  const preferredPort =
    hullPorts && hullPorts[kind] && Number.isFinite(hullPorts[kind].x)
      ? hullPorts[kind]
      : DEFAULT_THRUSTER_PORTS[kind] || DEFAULT_THRUSTER_PORTS.main;

  return {
    x: Number.isFinite(preferredPort?.x) ? preferredPort.x : 0,
    y: Number.isFinite(preferredPort?.y) ? preferredPort.y : 0,
  };
}
