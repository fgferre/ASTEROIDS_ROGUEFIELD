// The journey's camera (travelScene.js), cut like a film: from a wide shot
// of the place being left with the ship small over it, to a tight insert
// on the engines as they light, then shots of scale and angle that change
// with each cut — a chase, a camera low ahead that the ship rushes over, a
// long lens running beside it along the Ring's deck, a camera down among
// the place it goes to looking up as it comes in, the place's signature
// shape beyond it — and over its back into the rise to the intro's pose. A
// jump trades the deck for the surge (out through Prime's gate where it
// leaves by it), the leap hidden in the white, and a fly-by as it drops
// out. A short journey drops the shots it has no room for. The places'
// marks (marks.js) are where the cameras stand and look. Fixed cameras are
// placed when the journey starts; all a function of t, nothing allocated
// per frame.

// proposta 13/11: no shot under `shot` seconds, an insert under `insert`;
// a soft cut (one not on an action) moves up to `snap` (t) into a pause
// between two lines. The opening wide holds `open` to `hold`; a stretch of
// the journey holds a shot for every `room` seconds of it (an insert for
// every `insert`). The last shot runs on into the rise.
const CUTS = {
  shot: 1.2,
  open: 1.1,
  hold: 1.7,
  room: 1.3,
  insert: 0.75,
  snap: 0.04,
};
const INSERTS = new Set(['engines', 'gate', 'flyover']);
// proposta 13/11: the shots (world units, seconds, degrees of view). Each
// frames the ship `lift` of the view's height above its middle, clear of
// the banner below, unless it composes its own frame.
// `establish`: a camera held `back` beyond the ship at rest on the line
//   from the place's near structure through it, `under` × that under the
//   line and `side` beside it: the ship over the structure, then away from
//   the camera; aimed `mix` of the way from the structure to the ship.
// `engines`: `back` behind the tail, `side` beside and `up` over it,
//   looking at the point `aim` behind its middle; for `seconds`.
// `chase` / `surge` / `gate`: `back` behind, plus `pull` seconds of its
//   speed, at most `most` more; heading `lag` seconds behind its own, rolled
//   `roll` × its bank. The gate's rides close on its tail down through the
//   hole, the lit frame sweeping past round it.
// `flyover`: `down` under and `side` beside it, from `from` ahead of it to
//   `to` (behind): it rushes at the camera and over it.
// `track`: a long lens `side` beside it, away from the Ring's middle, and
//   `up` over it, running with it; it drifts from `drift` behind to
//   `drift` ahead of it over the shot.
// `orbit`: `reach` from the ship and `up` over it, swinging `swing`
//   radians round it until the place's near structure (its shape, past
//   `near`) stands beyond it; aimed `past` × `reach` past the ship toward
//   that mark.
// `dropout`: from `from` ahead of it to `to` (behind), `side` beside and
//   `up` over it: it comes out of the white at the camera and pulls away.
// `reveal`: `back` behind the ship on the line from the place's signature
//   shape through it, `under` × that under the line: the ship over the shape.
//   A place seen past the deck's edge (its `view`, marks.js) is looked out
//   to over the ship instead: `view.back` behind it on the level line from
//   that point, `view.up` over it and `view.side` to its left, aimed `mix`
//   of the angle from the ship to that point (the ship low to one side,
//   clear of the banner).
// `arrive`: `back` behind, `side` beside and `up` over it, aiming `ahead`
//   past it and `down` under it (onto the place).
const SHOT = {
  lift: 0.2,
  fov: 38,
  establish: { back: 300, under: 0.2, side: 160, mix: 0.8, fov: 42 },
  engines: { back: -10, side: 75, up: 14, aim: 14, fov: 32, seconds: 0.75 },
  chase: {
    back: 95,
    up: 22,
    side: 14,
    pull: 0.04,
    most: 70,
    lag: 0.25,
    roll: 0.55,
  },
  surge: {
    back: 70,
    up: 14,
    side: 0,
    pull: 0.07,
    most: 260,
    lag: 0.12,
    roll: 0.4,
  },
  flyover: { from: 150, to: -90, down: 30, side: 22, fov: 46 },
  track: { side: 560, up: 60, drift: 120, fov: 17 },
  orbit: { reach: 110, up: 14, swing: 1.3, past: 0.12, near: 1800, fov: 40 },
  gate: {
    back: 55,
    up: 12,
    side: 10,
    pull: 0.01,
    most: 25,
    lag: 0.15,
    roll: 0.4,
    fov: 44,
  },
  dropout: { from: 150, to: -150, side: 44, up: 16, fov: 42 },
  reveal: {
    back: 110,
    under: 0.16,
    side: 40,
    mix: 0.3,
    fov: 40,
    view: { back: 145, up: 230, side: 160, mix: 0.4, fov: 54 },
  },
  arrive: { back: 120, side: 30, up: 55, ahead: 120, down: 55 },
};
const MAX = 10;

export class ShotPlan {
  constructor(THREE) {
    this.cuts = [];
    this.kinds = [];
    this.soft = [];
    this.anchors = [];
    this.dirs = [];
    for (let i = 0; i < MAX; i += 1) {
      this.anchors.push(new THREE.Vector3());
      this.dirs.push(new THREE.Vector3());
    }
    this.fovs = new Float32Array(MAX);
    this.p = new THREE.Vector3();
    this.f = new THREE.Vector3();
    this.q = new THREE.Vector3();
    this.side = new THREE.Vector3();
    this.Y = new THREE.Vector3(0, 1, 0);
    this.sideways = new THREE.Vector3();
    this.upward = new THREE.Vector3();
    this.index = 0;
    this.roll = 0;
    this.fov = SHOT.fov;
    this.durationMs = 1;
    this.marks = null;
  }

  /**
   * Plans the shots of `motion` (planned) over `durationMs`; `pauses`:
   * [from, to] spans of t between the lines; `marks`: the places' marks in
   * the scene ({ leave, reach }: { near, sign } or null); `rise`: the t
   * the rise into the intro's pose starts.
   */
  plan(motion, durationMs, pauses, marks = {}, rise = 0.72) {
    this.durationMs = durationMs;
    this.marks = marks;
    const sec = (s) => (s * 1000) / durationMs;
    // Shots as [kind, end t, soft cut after it].
    const list = [];
    const add = (kind, to, soft = false) => list.push([kind, to, soft]);
    if (motion.jumps) {
      const at = motion.jumpAt;
      const lit = Math.max(
        Math.min(motion.lineUp - sec(0.3), sec(CUTS.hold)),
        sec(CUTS.open)
      );
      let g = lit + sec(SHOT.engines.seconds);
      add('establish', lit);
      if (motion.through) {
        // Down through the gate (its engines lit in it), leaving the
        // head-on into the tunnel its time.
        g = Math.min(motion.gateAt + sec(0.3), at - sec(CUTS.insert));
        g = Math.max(g, lit + sec(CUTS.insert));
        add('gate', g);
      } else add('engines', g);
      // Before the leap: the surge, and head-on into the tunnel.
      this.share(list, g, at, sec, [
        ['surge', g, 1],
        ['flyover', at - sec(0.4), 2],
      ]);
      // After it: out of the white past the camera, then the place.
      this.share(list, at, rise, sec, [
        ['dropout', at, 1],
        ['orbit', at + (rise - at) * 0.5, 3],
        ['reveal', rise - sec(1.6), 2],
        ['arrive', rise, 4],
      ]);
    } else {
      const [on, off] = motion.skim;
      const lit = Math.max(motion.turnAt - sec(0.25), sec(CUTS.open));
      const g = lit + sec(SHOT.engines.seconds);
      const land = motion.landAt;
      add('establish', lit);
      add('engines', g);
      // The dive off the place, the Ring's deck, the climb in.
      this.share(list, g, rise, sec, [
        ['chase', g + (on - g) * 0.3, 3],
        ['flyover', g + (on - g) * 0.85, 4],
        ['track', (on + off) / 2, 1],
        ['orbit', off + (land - off) * 0.3, 5],
        ['reveal', off + (land - off) * 0.7, 2],
        ['arrive', rise, 6],
      ]);
    }
    // The last shot runs on into the rise.
    list[list.length - 1][1] = 1;
    this.kinds = list.map((s) => s[0]);
    this.cuts = list.slice(0, -1).map((s) => s[1]);
    this.soft = list.slice(0, -1).map((s) => s[2]);
    for (let i = 0; i < this.cuts.length; i += 1) {
      if (!this.soft[i]) continue;
      const lo = (i ? this.cuts[i - 1] : 0) + sec(this.minimum(i));
      const hi = (this.cuts[i + 1] ?? 1) - sec(this.minimum(i + 1));
      this.cuts[i] = this.snap(this.cuts[i], pauses, lo, hi);
    }
    this.place(motion);
  }

  /**
   * Fills [from, to] with as many of `wanted` ([kind, the t it is best
   * centred on, rank]) as fit a shot of CUTS.room seconds each, the best
   * ranked first, in the order of their moments; the cuts halfway between
   * those moments, moved apart until each shot is long enough to read.
   */
  share(list, from, to, sec, wanted) {
    const room = (kind) => sec(INSERTS.has(kind) ? CUTS.insert : CUTS.room);
    let left = to - from;
    const picked = [];
    wanted
      .slice()
      .sort((a, b) => a[2] - b[2])
      .forEach((shot) => {
        if (room(shot[0]) > left + 1e-6) return;
        left -= room(shot[0]);
        picked.push(shot);
      });
    if (!picked.length) {
      list[list.length - 1][1] = to;
      return;
    }
    picked.sort((a, b) => a[1] - b[1]);
    const n = picked.length;
    const min = (i) => sec(INSERTS.has(picked[i][0]) ? CUTS.insert : CUTS.shot);
    const ends = [];
    for (let i = 0; i < n - 1; i += 1) {
      const mid = (picked[i][1] + picked[i + 1][1]) / 2;
      ends.push(Math.min(to, Math.max(from, mid)));
    }
    ends.push(to);
    for (let i = 0; i < n - 1; i += 1) {
      ends[i] = Math.max(ends[i], (i ? ends[i - 1] : from) + min(i));
    }
    for (let i = n - 2; i >= 0; i -= 1) {
      ends[i] = Math.min(ends[i], ends[i + 1] - min(i + 1));
    }
    picked.forEach(([kind], i) => list.push([kind, ends[i], i < n - 1]));
  }

  minimum(i) {
    return INSERTS.has(this.kinds[i]) ? CUTS.insert : CUTS.shot;
  }

  // `cut` moved into the nearest pause within CUTS.snap, kept in [lo, hi].
  snap(cut, pauses, lo, hi) {
    let best = cut;
    let gap = CUTS.snap;
    for (let i = 0; i < pauses.length; i += 1) {
      const [a, b] = pauses[i];
      const at = Math.min(b, Math.max(a, cut));
      if (Math.abs(at - cut) <= gap && at >= lo && at <= hi) {
        best = at;
        gap = Math.abs(at - cut);
      }
    }
    return best;
  }

  /**
   * The t the camera passes the ship in shot `i` (a fly-over or a drop-out
   * at its nearest, the long lens running beside it at its middle), else
   * null.
   */
  passAt(i) {
    const kind = this.kinds[i];
    let u = null;
    if (kind === 'track') u = 0.5;
    if (kind === 'flyover' || kind === 'dropout') {
      // Where pose() eases the camera's offset along the ship through 0.
      const e = SHOT[kind];
      const k = e.from / (e.from - e.to);
      u = 0.5 - Math.sin(Math.asin(1 - 2 * k) / 3);
    }
    if (u === null) return null;
    const from = i ? this.cuts[i - 1] : 0;
    const to = i < this.cuts.length ? this.cuts[i] : 1;
    return from + (to - from) * u;
  }

  shotAt(t) {
    let i = 0;
    while (i < this.cuts.length && t >= this.cuts[i]) i += 1;
    return i;
  }

  // The fixed cameras, set from the course and the marks.
  place(motion) {
    const { p, f, q, Y } = this;
    const leave = this.marks.leave;
    for (let i = 0; i < this.kinds.length; i += 1) {
      const kind = this.kinds[i];
      const anchor = this.anchors[i];
      this.fovs[i] = SHOT[kind].fov ?? SHOT.fov;
      if (kind === 'reveal' && this.marks.reach?.view) {
        this.fovs[i] = SHOT.reveal.view.fov;
      }
      if (kind === 'establish') {
        // The ship at rest over the place's near structure (or the dark
        // under it), seen from beyond it.
        const e = SHOT.establish;
        motion.at(0, p, f);
        if (leave) q.copy(leave.near);
        else q.copy(p).addScaledVector(f, 600).addScaledVector(Y, -400);
        this.dirs[i].copy(q);
        this.over(p, q, f, e.back, e.under, e.side, anchor);
      }
    }
  }

  // Into `out`: `back` beyond `ship` on the line from `mark` through it,
  // `under` × that under the line and `side` beside it (`fwd` when the
  // line is upright): there the ship shows over the mark, both ahead.
  over(ship, mark, fwd, back, under, side, out) {
    const { f, sideways, upward, Y } = this;
    f.subVectors(ship, mark).normalize();
    sideways.crossVectors(f, Y);
    if (sideways.lengthSq() < 1e-4) sideways.set(-fwd.z, 0, fwd.x);
    sideways.normalize();
    upward.crossVectors(sideways, f).normalize();
    return out
      .copy(ship)
      .addScaledVector(f, back)
      .addScaledVector(upward, -back * under)
      .addScaledVector(sideways, side);
  }

  /**
   * The camera at t for `motion` (sampled at t): its eye into `eye`, the
   * point it looks at into `target`; returns its roll (radians). Its field
   * of view (degrees) is left in `fov`.
   */
  pose(t, motion, eye, target) {
    const i = this.shotAt(t);
    this.index = i;
    const kind = this.kinds[i];
    const from = i ? this.cuts[i - 1] : 0;
    const to = i < this.cuts.length ? this.cuts[i] : 1;
    const u = (t - from) / Math.max(1e-6, to - from);
    const ship = motion.position;
    const fwd = motion.forward;
    const seconds = this.durationMs / 1000;
    const { p, f, side, Y } = this;
    let roll = 0;
    let lift = true;
    this.fov = this.fovs[i];
    if (kind === 'chase' || kind === 'surge' || kind === 'gate') {
      const s = SHOT[kind];
      const lagged = Math.max(from, t - s.lag / seconds);
      motion.at(lagged, p, f);
      const back = s.back + Math.min(s.most, (s.pull * motion.speed) / seconds);
      side.set(-f.z, 0, f.x).normalize();
      eye
        .copy(ship)
        .addScaledVector(f, -back)
        .addScaledVector(side, s.side)
        .addScaledVector(Y, s.up);
      target.copy(ship).addScaledVector(fwd, back * 0.5);
      roll = motion.bank * s.roll;
    } else if (kind === 'engines') {
      const e = SHOT.engines;
      side.set(-fwd.z, 0, fwd.x).normalize();
      eye
        .copy(ship)
        .addScaledVector(fwd, -e.back)
        .addScaledVector(side, e.side)
        .addScaledVector(Y, e.up);
      target.copy(ship).addScaledVector(fwd, -e.aim);
      roll = motion.bank * 0.5;
      lift = false;
    } else if (kind === 'track') {
      const e = SHOT.track;
      side.set(-fwd.z, 0, fwd.x).normalize();
      motion.ringCentre(p).sub(ship);
      if (side.dot(p) > 0) side.negate();
      eye
        .copy(ship)
        .addScaledVector(side, e.side)
        .addScaledVector(Y, e.up)
        .addScaledVector(fwd, e.drift * (2 * u - 1));
      target.copy(ship);
    } else if (kind === 'reveal') {
      // The ship over the place's signature shape, both ahead.
      const e = SHOT.reveal;
      const sign = this.marks.reach?.sign;
      const view = this.marks.reach?.view;
      if (view) {
        // Over the ship's shoulder, out past the deck's edge.
        const v = e.view;
        f.subVectors(view, ship).setY(0).normalize();
        side.set(-f.z, 0, f.x);
        eye
          .copy(ship)
          .addScaledVector(f, -v.back)
          .addScaledVector(Y, v.up)
          .addScaledVector(side, -v.side);
        p.subVectors(ship, eye).normalize();
        target
          .subVectors(view, eye)
          .normalize()
          .lerp(p, 1 - v.mix)
          .add(eye);
      } else if (sign) {
        this.over(ship, sign, fwd, e.back, e.under, e.side, eye);
        target.copy(sign).lerp(ship, e.mix);
      } else {
        eye.copy(ship).addScaledVector(fwd, -e.back);
        target.copy(ship).addScaledVector(fwd, 300);
      }
      lift = false;
    } else if (kind === 'arrive') {
      const a = SHOT.arrive;
      f.copy(fwd).setY(0).normalize();
      side.set(-f.z, 0, f.x);
      eye
        .copy(ship)
        .addScaledVector(f, -a.back)
        .addScaledVector(side, a.side)
        .addScaledVector(Y, a.up);
      target.copy(ship).addScaledVector(f, a.ahead).addScaledVector(Y, -a.down);
      lift = false;
    } else if (kind === 'establish') {
      eye.copy(this.anchors[i]);
      target.copy(this.dirs[i]).lerp(ship, SHOT.establish.mix);
      lift = false;
    } else if (kind === 'flyover' || kind === 'dropout') {
      // Relative to the ship: from ahead of it to behind, it passes.
      const e = SHOT[kind];
      const k = u * u * (3 - 2 * u);
      side.set(-fwd.z, 0, fwd.x).normalize();
      eye
        .copy(ship)
        .addScaledVector(fwd, e.from + (e.to - e.from) * k)
        .addScaledVector(side, e.side)
        .addScaledVector(Y, e.up ?? -e.down);
      target.copy(ship);
    } else if (kind === 'orbit') {
      // Round the ship until the place stands behind it.
      const e = SHOT.orbit;
      const reach = this.marks.reach;
      let mark = null;
      if (reach) {
        mark = reach.near.distanceTo(ship) < e.near ? reach.near : reach.sign;
      }
      if (mark) f.subVectors(ship, mark).setY(0).normalize();
      else f.copy(fwd).setY(0).normalize().negate();
      const k = u * u * (3 - 2 * u);
      f.applyAxisAngle(Y, e.swing * (1 - k));
      eye.copy(ship).addScaledVector(f, e.reach).addScaledVector(Y, e.up);
      if (mark) p.subVectors(mark, ship).normalize();
      else p.copy(fwd);
      target.copy(ship).addScaledVector(p, e.reach * e.past);
      lift = false;
    }
    if (lift) {
      // The ship above the middle of the frame, clear of the banner.
      const reach = eye.distanceTo(ship);
      const half = Math.tan((this.fov * Math.PI) / 360);
      target.addScaledVector(Y, -reach * SHOT.lift * half);
    }
    this.roll = roll;
    return roll;
  }
}
