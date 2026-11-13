// How the ship flies a journey (travelScene.js), in the scene's frame: from
// the place it leaves (at rest, nosed as it stood there) to the place it goes
// to (at rest on its spawn, nosed up the field). A hop inside a chapter is
// flown on engines: it turns off its place, drops to skim the Ring's deck
// along its arc, and climbs off to the next place, braking in. A jump lines
// up on the place it goes to, surges and leaps; it drops out on the far side
// short of the place, still fast, and brakes in. Its nose follows its
// velocity; it banks into its turns as hard as they pull; its engines burn
// as it speeds up, settle as it cruises and fall back as it brakes. All a
// function of t; built when a journey starts.

import { RING } from '../ring/ringShape.js';
import { Course, Timing, restingKnots } from './course.js';
import { LAID_RADIUS, WORLD } from './world.js';

// proposta 13/11: a hop. The ship turns off its place by `turnAt` (t),
// `turn` units on, slowly, toward the Ring; it skims the Ring at `skim`
// [side, height] (world units, inward of its centre line and over its
// deck) from `along[0]` to `along[1]` of the way between the two places'
// angles (a place outside the Ring's wall is reached over it, at skim
// height); it comes in on the place's line `approach` units out at
// `landAt`, its nose coming round as it brakes to rest at t = 1. Its turns
// swing `pull` wide (course.js); a stretch it speeds up or slows down on
// takes `ease` × the time its length would at a steady speed.
export const HOP = {
  turnAt: 0.16,
  turn: 260,
  skim: [-60, 60],
  along: [0.25, 0.8],
  approach: 450,
  landAt: 0.8,
  pull: 0.5,
  ease: 1.4,
};
// proposta 13/11: a jump. The ship turns off its place onto the line to
// where it goes by `lineUp` (t), `turn` units on and `climb` up (clear of
// the Ring's walls; 13/11: its turn swung `pull` wide, so it levels out of
// the climb without a snap), surges `surge` units more, reaching `surgeSpeed` × its
// mean speed at the leap (`at`, travelScene.js JUMP.at); it drops out `drop`
// units short of its place, at `dropSpeed` × the mean speed it needs to
// stop there by t = 1, along its arrival heading bent `bend` toward the line
// it jumped on, coming in on the place's line as a hop does. The opening's
// ship waits in deep space nosed `deepTurn` radians off that line.
export const WARP = {
  lineUp: 0.17,
  turn: 700,
  climb: 300,
  pull: 1.2,
  surge: 2600,
  surgeSpeed: 2.8,
  drop: 4200,
  dropSpeed: 2.6,
  bend: 0.35,
  deepTurn: 1.1,
};
// proposta 13/11: a jump out by a hole (marks.js `through`: Prime's gate):
// the dive pitched `pitch` (radians) down, entered `over` before the hole
// and pulled out of `out` past it, levelling to `level` down; its turns
// swing `pull` wide; it reaches the dive at `fall` × the mean speed of its
// nose-over.
export const GATE = {
  pitch: 1.0,
  over: 650,
  out: 520,
  level: 0.12,
  pull: 0.45,
  fall: 1.6,
};
// proposta 13/11: the bank: atan(sideways pull / `g`), at most `max`
// radians (world units per second²), averaged over `blur` seconds either
// side (weights 1-2-3-4-3-2-1) so it never snaps where a turn meets a
// straight.
const BANK = { g: 1400, max: 1.0, blur: 0.32 };
// proposta 13/11: the engines: `cruise` at a steady speed, ± `gain` per unit
// of acceleration (in cruise speeds per t), within `range`; a jump's surge
// adds up to `surge`.
const ENGINE = { cruise: 0.42, gain: 0.12, range: [0.1, 1], surge: 0.6 };

const WALL = -(RING.width / 2) * WORLD.scale;

export class ShipMotion {
  constructor(THREE) {
    this.THREE = THREE;
    this.before = new Course(THREE);
    this.after = new Course(THREE);
    this.beforeTime = new Timing();
    this.afterTime = new Timing();
    this.jumpAt = 1;
    this.durationMs = 1;
    this.cruiseSpeed = 1;
    this.v = [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector3());
    this.d = [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector3());
    // A hop's time on the Ring's deck [from, to] (t).
    this.skim = [0, 0];
    // The laid Ring's centre in the scene; a jump out by a hole: the hole
    // (a scene point) and the t it is passed.
    this.centre = new THREE.Vector3();
    this.through = null;
    this.gateAt = 0;
    this.w = new THREE.Vector3();
    this.u = new THREE.Vector3();
    this.p = new THREE.Vector3();
    this.f0 = new THREE.Vector3();
    this.f1 = new THREE.Vector3();
    this.basis = new THREE.Matrix4();
    this.upAxis = new THREE.Vector3();
    this.side = new THREE.Vector3();
    this.Y = new THREE.Vector3(0, 1, 0);
    // This frame's sample (sample()).
    this.position = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, -1);
    this.speed = 0;
    this.bank = 0;
    this.thrust = 0;
  }

  // A skim point at Ring angle `angle`, `side` in, flown toward decreasing
  // (`way` −1) or increasing angle, mapped: into `point` and `dir`.
  skimPoint(map, angle, side, way, point, dir) {
    const r = LAID_RADIUS - side;
    point.set(r * Math.cos(angle), HOP.skim[1], r * Math.sin(angle));
    map.point(point, point);
    dir.set(-way * Math.sin(angle), 0, way * Math.cos(angle));
    return map.direction(dir, dir);
  }

  /**
   * Plans the flight from frame `from` to frame `to` (world.js placeFrame)
   * on `map`; `jumpAt`: the leap's t, null for a hop; `deep`: leaving deep
   * space; `gate`: a jump's hole to leave by (scene point), or null.
   */
  plan(map, from, to, durationMs, jumpAt, deep, gate = null) {
    const { v, d } = this;
    this.durationMs = durationMs;
    map.point(from.position, v[0]);
    map.direction(from.heading, d[0]);
    map.point(to.position, v[4]);
    map.direction(to.heading, d[4]);
    this.jumpAt = jumpAt ?? 1;
    this.jumps = jumpAt !== null;
    this.through = null;
    this.lineUp = WARP.lineUp;
    this.turnAt = HOP.turnAt;
    this.landAt = HOP.landAt;
    this.centre.set(0, 0, 0);
    map.point(this.centre, this.centre);
    if (this.jumps) this.planJump(deep, gate);
    else this.planHop(map, from, to);
  }

  // Points `i` (into v[i], d[i]) a turn off point `i - 1` toward point
  // `i + 1`: `reach` units on, nosed at the point after it.
  turnOff(i, reach, rise = 0) {
    const { v, d } = this;
    v[i]
      .subVectors(v[i + 1], v[i - 1])
      .setY(0)
      .normalize();
    v[i].multiplyScalar(reach).add(v[i - 1]);
    v[i].y += rise;
    d[i].subVectors(v[i + 1], v[i]).normalize();
  }

  // Point `i` (into v[i], d[i]) on the line from point `i - 1` into point
  // `i + 1`, `reach` units short of it.
  comeIn(i, reach) {
    const { v, d } = this;
    d[i].subVectors(v[i + 1], v[i - 1]).normalize();
    v[i].copy(v[i + 1]).addScaledVector(d[i], -reach);
  }

  planHop(map, from, to) {
    const { v, d } = this;
    const span = to.angle - from.angle;
    const way = Math.sign(span) || -1;
    // Off a place outside the Ring's wall, the skim starts out there.
    const sideA = sideOf(from) < WALL ? sideOf(from) : HOP.skim[0];
    const sideB = sideOf(to) < WALL ? sideOf(to) : HOP.skim[0];
    // A, its turn, the skim's two ends, the line in, the place.
    v[5].copy(v[4]);
    d[5].copy(d[4]);
    const along = HOP.along;
    this.skimPoint(map, from.angle + span * along[0], sideA, way, v[2], d[2]);
    this.skimPoint(map, from.angle + span * along[1], sideB, way, v[3], d[3]);
    this.turnOff(1, HOP.turn);
    this.comeIn(4, HOP.approach);
    const points = v.slice(0, 6);
    this.before.set(points, d.slice(0, 6), HOP.pull);
    // Each knot's time: the turn and the line in fixed, the stretches
    // between shared by length, the first and last eased.
    const s = [0];
    for (let i = 1; i < 6; i += 1) s.push(this.before.lengths[i * 48]);
    const weights = [
      HOP.ease * (s[2] - s[1]),
      s[3] - s[2],
      HOP.ease * (s[4] - s[3]),
    ];
    const sum = weights[0] + weights[1] + weights[2];
    const span2 = HOP.landAt - HOP.turnAt;
    const t2 = HOP.turnAt + (span2 * weights[0]) / sum;
    const t3 = t2 + (span2 * weights[1]) / sum;
    this.beforeTime.set(
      restingKnots([0, HOP.turnAt, t2, t3, HOP.landAt, 1], s)
    );
    this.cruiseSpeed = weights[1] > 0 ? (s[3] - s[2]) / (t3 - t2) : 1;
    this.skim[0] = t2;
    this.skim[1] = t3;
  }

  planJump(deep, gate) {
    const { v, d, u, w } = this;
    const at = this.jumpAt;
    // The line to the place, and the ship turned onto it, risen clear.
    u.subVectors(v[4], v[0]).setY(0).normalize();
    if (deep) d[0].copy(u).applyAxisAngle(this.Y, WARP.deepTurn);
    if (gate) {
      this.planGate(gate, at);
    } else {
      v[2].copy(v[4]);
      this.turnOff(1, WARP.turn, WARP.climb);
      u.copy(d[1]);
      v[2].copy(v[1]).addScaledVector(u, WARP.surge);
      d[2].copy(u);
      this.before.set([v[0], v[1], v[2]], [d[0], d[1], d[2]], WARP.pull);
      const turned = this.before.lengths[48];
      const total = this.before.length;
      const t1 = WARP.lineUp;
      const mean = (total - turned) / (at - t1);
      this.beforeTime.set(
        restingKnots([0, t1], [0, turned], 0, (1.4 * turned) / t1).concat([
          [at, total, WARP.surgeSpeed * mean],
        ])
      );
      this.surgeMean = mean;
    }
    const mean = this.surgeMean;
    // Out of the jump: short of the place, along its heading bent toward
    // the line jumped on; in on the place's line, braking.
    w.copy(u).setY(0).normalize().multiplyScalar(WARP.bend).add(d[4]);
    w.normalize();
    v[3].copy(v[4]).addScaledVector(w, -WARP.drop);
    v[3].y = v[4].y + (v[1].y - v[4].y) * 0.1;
    d[3].copy(w);
    v[5].copy(v[4]);
    d[5].copy(d[4]);
    this.comeIn(4, HOP.approach);
    this.after.set([v[3], v[4], v[5]], [d[3], d[4], d[5]], 0.5);
    const inLine = this.after.lengths[48];
    const L = this.after.length;
    const slope = inLine / (HOP.landAt - at);
    const knots = restingKnots([at, HOP.landAt, 1], [0, inLine, L]);
    knots[0][2] = WARP.dropSpeed * slope;
    this.afterTime.set(knots);
    this.cruiseSpeed = mean;
  }

  // A jump leaving by a hole in its place's set (marks.js `through`, at
  // `gate`): the ship noses over into a dive `GATE.over` above it, falls
  // through it along its dive, pulls out `GATE.out` past it onto the line
  // to the place it goes to (u) and surges on along it to the leap.
  planGate(gate, at) {
    const { v, d, u, w, Y } = this;
    const g = GATE;
    // The dive: from the place toward the gate, pitched `pitch` down.
    w.subVectors(gate, v[0]).setY(0).normalize();
    w.multiplyScalar(Math.cos(g.pitch)).addScaledVector(Y, -Math.sin(g.pitch));
    v[1].copy(gate).addScaledVector(w, -g.over);
    d[1].copy(w);
    v[2].copy(gate);
    d[2].copy(w);
    v[3].copy(gate).addScaledVector(w, g.out).addScaledVector(u, g.out);
    d[3].copy(u).addScaledVector(Y, -g.level).normalize();
    v[5].copy(v[3]).addScaledVector(u, WARP.surge);
    d[5].copy(u);
    const points = [v[0], v[1], v[2], v[3], v[5]];
    this.before.set(points, [d[0], d[1], d[2], d[3], d[5]], g.pull);
    const s = [0, 1, 2, 3, 4].map((i) => this.before.lengths[i * 48]);
    const t1 = WARP.lineUp;
    // The fall, the pull-out and the surge shared by length, the fall eased.
    const span = s[4] - s[1];
    const times = [0, t1];
    for (let i = 2; i < 5; i += 1) {
      times.push(t1 + ((at - t1) * (s[i] - s[1])) / span);
    }
    const mean = span / (at - t1);
    this.beforeTime.set(
      restingKnots(times, s, 0, WARP.surgeSpeed * mean).map((k, i) =>
        i === 1 ? [k[0], k[1], (g.fall * s[1]) / t1] : k
      )
    );
    this.surgeMean = mean;
    this.through = gate;
    this.gateAt = times[2];
  }

  /** The laid Ring's centre (scene) into `out`. */
  ringCentre(out) {
    return out.copy(this.centre);
  }

  // Position and heading at t into `out` / `dir`; its speed (units per t).
  at(t, out, dir) {
    if (!this.leapt(t)) {
      this.before.at(this.beforeTime.distance(t), out, dir);
      return this.beforeTime.speed(t);
    }
    this.after.at(this.afterTime.distance(t), out, dir);
    return this.afterTime.speed(t);
  }

  /** True once the ship is through the leap at t. */
  leapt(t) {
    return this.jumps && t >= this.jumpAt;
  }

  // The bank at t from the turn rate a moment either side (same leg).
  bankAt(t) {
    const e = 0.004;
    const speed = this.at(t, this.p, this.f0);
    const lo = this.leapt(t)
      ? Math.max(this.jumpAt, t - e)
      : Math.max(0, t - e);
    const hi = this.leapt(t) ? t + e : Math.min(this.jumpAt - 1e-4, t + e);
    this.at(lo, this.p, this.f0);
    this.at(hi, this.p, this.f1);
    const turn = this.f0.x * this.f1.z - this.f0.z * this.f1.x;
    const seconds = this.durationMs / 1000;
    const rate =
      Math.asin(Math.max(-1, Math.min(1, turn))) / ((hi - lo) * seconds);
    const pull = (rate * speed) / seconds;
    return Math.max(-BANK.max, Math.min(BANK.max, Math.atan(pull / BANK.g)));
  }

  /** This frame at t: position, forward, speed, bank, thrust. */
  sample(t) {
    const e = 0.004;
    const step = (BANK.blur * 1000) / 3 / this.durationMs;
    let bank = 0;
    for (let k = -3; k <= 3; k += 1) {
      let at = Math.min(1, Math.max(0, t + k * step));
      // Not across the leap: the ship is somewhere else on the far side.
      if (this.jumps && t < this.jumpAt) at = Math.min(at, this.jumpAt - 1e-4);
      if (this.leapt(t)) at = Math.max(at, this.jumpAt);
      bank += (4 - Math.abs(k)) * this.bankAt(at);
    }
    this.bank = bank / 16;
    const speed = this.at(t, this.position, this.forward);
    const lo = this.leapt(t)
      ? Math.max(this.jumpAt, t - e)
      : Math.max(0, t - e);
    const hi = this.leapt(t) ? t + e : Math.min(this.jumpAt - 1e-4, t + e);
    const fast = this.at(hi, this.p, this.f1);
    this.speed = speed;
    const accel = (fast - this.at(lo, this.p, this.f0)) / (hi - lo);
    const r = accel / Math.max(1, this.cruiseSpeed);
    const [low, high] = ENGINE.range;
    let thrust = Math.max(low, Math.min(high, ENGINE.cruise + ENGINE.gain * r));
    if (this.jumps && t < this.jumpAt) {
      const build = Math.max(
        0,
        (t - WARP.lineUp) / (this.jumpAt - WARP.lineUp)
      );
      thrust += ENGINE.surge * build * build;
    }
    this.thrust = thrust * Math.min(1, t / 0.05);
    return this;
  }

  /** The ship's attitude at this sample into `quaternion`. */
  pose(quaternion) {
    const { forward, upAxis, side } = this;
    upAxis.copy(this.Y).addScaledVector(forward, -forward.y).normalize();
    upAxis.applyAxisAngle(forward, this.bank);
    side.crossVectors(forward, upAxis).normalize();
    this.basis.makeBasis(forward, upAxis, side);
    return quaternion.setFromRotationMatrix(this.basis);
  }
}

// How far inward of the laid Ring's centre line a place stands.
function sideOf(frame) {
  return LAID_RADIUS - Math.hypot(frame.position.x, frame.position.z);
}
