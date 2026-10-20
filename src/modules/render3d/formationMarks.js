// A formation's warning (LayerSchedule 'formation-warned'): until its units
// arrive, a dashed red ring closes on each one's point with a short dash
// the way it will fly in, and an edge formation lights the field's edge
// where it comes through (Renderer3D, fieldVeil.js flares).

import { GAME_HEIGHT, GAME_WIDTH } from '../../core/GameConstants.js';

// proposta 20/10: the ring's radius as it closes (px), its dashes, line
// width and height over the plane; the dash's length; the gain, pulsing
// `PULSES` times over the warning; at most FLARES edge flares (the veil's
// slots), FLARE_GAP px apart along the edge (a pack lights one).
const RING_FROM = 30;
const RING_TO = 13;
const DASHES = 10;
const WIDTH = 2;
const HEIGHT = 1.5;
const ARROW = 26;
const GAIN = 1.3;
const PULSES = 4;
const FLARES = 4;
const FLARE_GAP = 120;

// Where a point of a formation coming in from `edge` crosses it.
const ON_EDGE = {
  top: ({ x }) => ({ x, y: 0 }),
  bottom: ({ x }) => ({ x, y: GAME_HEIGHT }),
  left: ({ y }) => ({ x: 0, y }),
  right: ({ y }) => ({ x: GAME_WIDTH, y }),
};

export class FormationMarks {
  constructor() {
    this.marks = [];
  }

  /**
   * A warning's marks; returns the field points on its edge to light (up
   * to FLARES, at least FLARE_GAP apart; none for a ring).
   */
  add({ points, warn, edge }) {
    this.marks.push({ points, warn, left: warn });
    if (!edge || !ON_EDGE[edge]) return [];
    const along = edge === 'top' || edge === 'bottom' ? 'x' : 'y';
    const flares = [];
    for (const point of [...points].sort((a, b) => a[along] - b[along])) {
      const last = flares[flares.length - 1];
      if (flares.length === FLARES) break;
      if (!last || point[along] - last[along] >= FLARE_GAP) {
        flares.push(ON_EDGE[edge](point));
      }
    }
    return flares;
  }

  /** Ages the marks by `dt` s and draws those still up into `ribbons`. */
  update(dt, ribbons, rgb) {
    this.marks = this.marks.filter((mark) => {
      mark.left -= dt;
      return mark.left > 0;
    });
    for (const { points, warn, left } of this.marks) {
      const progress = 1 - left / warn;
      const radius = RING_FROM + (RING_TO - RING_FROM) * progress;
      const gain =
        GAIN * (0.6 + 0.4 * Math.cos(progress * Math.PI * 2 * PULSES));
      for (const { x, y, vx, vy } of points) {
        ribbons.circle(x, y, radius, HEIGHT, rgb, WIDTH, gain, DASHES);
        const speed = Math.hypot(vx, vy);
        if (speed > 0) {
          ribbons.segment(
            x,
            y,
            x + (vx / speed) * ARROW,
            y + (vy / speed) * ARROW,
            HEIGHT,
            rgb,
            WIDTH,
            gain
          );
        }
      }
    }
  }
}
