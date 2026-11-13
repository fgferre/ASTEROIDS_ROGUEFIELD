// The ship's motion on a journey (travelScene.js): a smooth course through
// the world — cubic Hermite pieces between waypoints, each left and reached
// along a given direction, so the nose follows the velocity and never
// slides — flown at a speed that is itself a smooth function of time
// (`Timing`: distances reached at given times and speeds). Everything is a
// function of the journey's t (0..1): any frame can be drawn on its own.
// Built when a journey starts; nothing allocated per frame.

// Arc-length samples per piece of a course.
const SAMPLES = 48;
// Waypoints a course can hold.
const MAX_POINTS = 8;

function hermite(p0, m0, p1, m1, u, out) {
  const u2 = u * u;
  const u3 = u2 * u;
  const a = 2 * u3 - 3 * u2 + 1;
  const b = u3 - 2 * u2 + u;
  const c = -2 * u3 + 3 * u2;
  const d = u3 - u2;
  return out.set(
    a * p0.x + b * m0.x + c * p1.x + d * m1.x,
    a * p0.y + b * m0.y + c * p1.y + d * m1.y,
    a * p0.z + b * m0.z + c * p1.z + d * m1.z
  );
}

function hermiteSlope(p0, m0, p1, m1, u, out) {
  const u2 = u * u;
  const a = 6 * u2 - 6 * u;
  const b = 3 * u2 - 4 * u + 1;
  const c = -6 * u2 + 6 * u;
  const d = 3 * u2 - 2 * u;
  return out.set(
    a * p0.x + b * m0.x + c * p1.x + d * m1.x,
    a * p0.y + b * m0.y + c * p1.y + d * m1.y,
    a * p0.z + b * m0.z + c * p1.z + d * m1.z
  );
}

/** A path through waypoints, each passed along its own direction. */
export class Course {
  constructor(THREE) {
    this.points = [];
    this.tangents = [];
    for (let i = 0; i < MAX_POINTS; i += 1) {
      this.points.push(new THREE.Vector3());
      this.tangents.push(new THREE.Vector3());
    }
    this.count = 0;
    this.lengths = new Float32Array((MAX_POINTS - 1) * SAMPLES + 1);
    this.length = 0;
    this.probe = new THREE.Vector3();
    this.last = new THREE.Vector3();
    this.m0 = new THREE.Vector3();
    this.m1 = new THREE.Vector3();
  }

  /**
   * Waypoints `points` (vectors, copied), each passed heading `directions`
   * (unit vectors); `pull` scales each piece's directions by its chord
   * (how wide the turns swing: 0.3 tight .. 1 wide).
   */
  set(points, directions, pull = 0.6) {
    this.count = points.length;
    for (let i = 0; i < this.count; i += 1) {
      this.points[i].copy(points[i]);
      this.tangents[i].copy(directions[i]).normalize();
    }
    this.pull = pull;
    let total = 0;
    this.lengths[0] = 0;
    for (let i = 0; i < this.count - 1; i += 1) {
      this.pieceAt(i, 0, this.last);
      for (let k = 1; k <= SAMPLES; k += 1) {
        this.pieceAt(i, k / SAMPLES, this.probe);
        total += this.probe.distanceTo(this.last);
        this.last.copy(this.probe);
        this.lengths[i * SAMPLES + k] = total;
      }
    }
    this.length = total;
    return this;
  }

  // The scale of piece i's end directions: its chord × pull.
  reach(i) {
    return this.points[i].distanceTo(this.points[i + 1]) * this.pull;
  }

  pieceAt(i, u, out) {
    const r = this.reach(i);
    this.m0.copy(this.tangents[i]).multiplyScalar(r);
    this.m1.copy(this.tangents[i + 1]).multiplyScalar(r);
    return hermite(
      this.points[i],
      this.m0,
      this.points[i + 1],
      this.m1,
      u,
      out
    );
  }

  // Piece and its parameter at distance `s` along the course.
  locate(s) {
    const n = (this.count - 1) * SAMPLES;
    const d = Math.min(this.length, Math.max(0, s));
    let lo = 0;
    let hi = n;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.lengths[mid] <= d) lo = mid;
      else hi = mid;
    }
    const span = this.lengths[hi] - this.lengths[lo];
    const f = span > 0 ? (d - this.lengths[lo]) / span : 0;
    const at = Math.min(n, lo + f);
    const piece = Math.min(this.count - 2, Math.floor(at / SAMPLES));
    this.piece = piece;
    this.u = Math.min(1, at / SAMPLES - piece);
  }

  /** The point `s` along the course into `out`, its heading into `dir`. */
  at(s, out, dir) {
    this.locate(s);
    this.pieceAt(this.piece, this.u, out);
    if (!dir) return out;
    const { piece } = this;
    hermiteSlope(
      this.points[piece],
      this.m0,
      this.points[piece + 1],
      this.m1,
      this.u,
      dir
    );
    if (dir.lengthSq() < 1e-8) dir.copy(this.tangents[this.piece]);
    dir.normalize();
    return out;
  }
}

/**
 * Distance along a course by time: through knots [t, s, v] (t 0..1, s in
 * world units, v in world units per unit of t), cubic between them, so the
 * speed changes smoothly. Knots from the start of the leg it times.
 */
export class Timing {
  constructor() {
    this.knots = [];
  }

  set(knots) {
    this.knots = knots;
    return this;
  }

  /** Distance flown at t (held at the ends). */
  distance(t) {
    const k = this.knots;
    if (t <= k[0][0]) return k[0][1];
    for (let i = 0; i < k.length - 1; i += 1) {
      const [t0, s0, v0] = k[i];
      const [t1, s1, v1] = k[i + 1];
      if (t > t1 && i < k.length - 2) continue;
      const h = t1 - t0;
      const u = Math.min(1, (t - t0) / h);
      const u2 = u * u;
      const u3 = u2 * u;
      return (
        (2 * u3 - 3 * u2 + 1) * s0 +
        (u3 - 2 * u2 + u) * h * v0 +
        (-2 * u3 + 3 * u2) * s1 +
        (u3 - u2) * h * v1
      );
    }
    return k[k.length - 1][1];
  }

  /** Speed at t, world units per unit of t. */
  speed(t) {
    const e = 1e-4;
    return (this.distance(t + e) - this.distance(t - e)) / (2 * e);
  }
}

/**
 * Knot speeds for a stretch at rest at both ends through distances `s` at
 * times `t`: each inner knot the harmonic mean of the slopes beside it
 * (Fritsch–Carlson), so the distance never runs back.
 */
export function restingKnots(times, distances, startSpeed = 0, endSpeed = 0) {
  const knots = [];
  for (let i = 0; i < times.length; i += 1) {
    let v;
    if (i === 0) v = startSpeed;
    else if (i === times.length - 1) v = endSpeed;
    else {
      const a = (distances[i] - distances[i - 1]) / (times[i] - times[i - 1]);
      const b = (distances[i + 1] - distances[i]) / (times[i + 1] - times[i]);
      v = a > 0 && b > 0 ? (2 * a * b) / (a + b) : 0;
    }
    knots.push([times[i], distances[i], v]);
  }
  return knots;
}
