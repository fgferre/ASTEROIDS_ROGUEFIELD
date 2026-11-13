// The journey's camera (travelScene.js), cut like a film: a few shots, each
// held long enough to read, the cuts moved into the pauses between the
// lines where they can be. A hop: the ship turning off the place it leaves,
// seen from beside it; a chase, the camera lagging as it burns; a camera
// running along the Ring's deck that the ship overtakes; over its back as
// it brakes into the place it goes to. A jump: the turn off the place; a
// tight chase as the engines surge into the leap; out of the white-out, a
// camera ahead that it rushes toward as it drops out; over its back into
// the place. The last shot runs on into the rise to the intro's pose
// (travelScene.js). Fixed cameras are placed when the journey starts; all
// a function of t, nothing allocated per frame.

// proposta 13/11: no shot shorter than `minSeconds`; a cut moves up to
// `snap` (t) into a pause between two lines.
const CUTS = { minSeconds: 1.2, snap: 0.06 };
// proposta 13/11: where the cuts fall (t). Off the place for
// `departSeconds`; on a hop the chase until `deck` before the ship reaches
// the Ring's deck, the overtake
// while it skims it (ending by `arrive` at the latest), the arrival; a
// jump the surge to the leap, the drop-out until `emerge`, the arrival.
const HOP_CUTS = { departSeconds: 1.5, deck: 0.1, arrive: 0.64 };
const JUMP_EMERGE = 0.56;
// proposta 13/11: the shots (world units; seconds where said). Each frames
// the ship `lift` of the view's height above its middle, clear of the
// banner below. `depart`: `back` behind and `side` beside (the way its
// course heads at the cut) the point it reaches `from` of the shot, `up`
// over it, looking `down` under it (onto the place).
// `chase`: `back` behind it, plus `pull` seconds
// of its speed, at most `most` more (it pulls away as it speeds up), the camera's heading
// `lag` seconds behind its own, rolled `roll` × its bank. `overtake`:
// running `side` beside and `up` over its line at `pace` × its speed, it
// passes the camera `pass` of the way through. `surge`: a tighter chase.
// `emerge`: `side` beside and `up` over the point it reaches `ahead` of the
// shot's end. `arrive`: `back` behind, `side` beside and `up` over it,
// aiming `ahead` past it and `down` under it (onto the place).
const SHOT = {
  lift: 0.2,
  depart: { from: 0.4, back: 30, side: 90, up: 30, down: 8 },
  chase: {
    back: 95,
    up: 22,
    side: 14,
    pull: 0.04,
    most: 70,
    lag: 0.25,
    roll: 0.55,
  },
  overtake: { side: 80, up: 22, pace: 0.75, pass: 0.6 },
  surge: {
    back: 70,
    up: 14,
    side: 0,
    pull: 0.07,
    most: 260,
    lag: 0.12,
    roll: 0.4,
  },
  emerge: { side: 50, up: 18, ahead: -0.04 },
  arrive: { back: 120, side: 30, up: 55, ahead: 120, down: 55 },
};

export class ShotPlan {
  constructor(THREE) {
    this.cuts = [];
    this.kinds = [];
    this.anchors = [0, 1, 2, 3].map(() => new THREE.Vector3());
    this.dirs = [0, 1, 2, 3].map(() => new THREE.Vector3());
    this.speeds = [0, 0, 0, 0];
    this.p = new THREE.Vector3();
    this.f = new THREE.Vector3();
    this.side = new THREE.Vector3();
    this.Y = new THREE.Vector3(0, 1, 0);
    this.index = 0;
    this.roll = 0;
    this.durationMs = 1;
  }

  /**
   * Plans the shots of `motion` (planned) over `durationMs`; `pauses`:
   * [from, to] spans of t between the lines.
   */
  plan(motion, durationMs, pauses) {
    this.durationMs = durationMs;
    const min = (CUTS.minSeconds * 1000) / durationMs;
    const depart = (HOP_CUTS.departSeconds * 1000) / durationMs;
    if (motion.jumps) {
      this.kinds = ['depart', 'surge', 'emerge', 'arrive'];
      this.cuts = [
        Math.min(Math.max(depart, min), motion.jumpAt - min),
        motion.jumpAt,
        Math.max(JUMP_EMERGE, motion.jumpAt + min),
      ];
      // Only the line-up's cut may move: the leap's hides in the white.
      this.cuts[0] = this.snap(
        this.cuts[0],
        pauses,
        min,
        min,
        motion.jumpAt - min
      );
    } else {
      this.kinds = ['depart', 'chase', 'overtake', 'arrive'];
      const [onDeck, offDeck] = motion.skim;
      const cuts = [
        depart,
        onDeck - HOP_CUTS.deck,
        Math.min(offDeck, HOP_CUTS.arrive),
      ];
      for (let i = 0; i < cuts.length; i += 1) {
        const lo = (i ? cuts[i - 1] : 0) + min;
        const hi = HOP_CUTS.arrive + (i - 2) * min;
        cuts[i] = Math.min(hi, Math.max(lo, cuts[i]));
        cuts[i] = this.snap(cuts[i], pauses, min, lo, hi);
      }
      this.cuts = cuts;
    }
    this.place(motion);
  }

  // `cut` moved into the nearest pause within CUTS.snap, kept in [lo, hi].
  snap(cut, pauses, min, lo, hi) {
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

  shotAt(t) {
    let i = 0;
    while (i < this.cuts.length && t >= this.cuts[i]) i += 1;
    return i;
  }

  // The fixed cameras and the overtake's line, set from the ship's course.
  place(motion) {
    const { p, f, side, Y } = this;
    const seconds = this.durationMs / 1000;
    for (let i = 0; i < this.kinds.length; i += 1) {
      const kind = this.kinds[i];
      const from = i ? this.cuts[i - 1] : 0;
      const to = i < this.cuts.length ? this.cuts[i] : 1;
      const anchor = this.anchors[i];
      if (kind === 'depart') {
        // Behind and beside where it heads as it leaves, on the side its
        // nose first points: it turns away from the camera and burns off.
        motion.at(0, p, side);
        motion.at(to * SHOT.depart.from, anchor);
        motion.at(to, p, f);
        f.setY(0).normalize();
        const lean = side.x * -f.z + side.z * f.x;
        side.set(-f.z, 0, f.x).multiplyScalar(lean < 0 ? -1 : 1);
        const { back, up } = SHOT.depart;
        anchor
          .addScaledVector(f, -back)
          .addScaledVector(side, SHOT.depart.side)
          .addScaledVector(Y, up);
      } else if (kind === 'overtake') {
        const { pass, pace } = SHOT.overtake;
        const at = from + (to - from) * pass;
        this.speeds[i] = (motion.at(at, anchor, f) / seconds) * pace;
        this.dirs[i].copy(f);
        this.passAt = at;
        side.set(-f.z, 0, f.x).normalize();
        anchor
          .addScaledVector(side, SHOT.overtake.side)
          .addScaledVector(Y, SHOT.overtake.up);
      } else if (kind === 'emerge') {
        motion.at(Math.min(1, to + SHOT.emerge.ahead), anchor, f);
        side.set(-f.z, 0, f.x).normalize();
        anchor
          .addScaledVector(side, SHOT.emerge.side)
          .addScaledVector(Y, SHOT.emerge.up);
      }
    }
  }

  /**
   * The camera at t for `motion` (sampled at t): its eye into `eye`, the
   * point it looks at into `target`; returns its roll (radians).
   */
  pose(t, motion, eye, target) {
    const i = this.shotAt(t);
    this.index = i;
    const kind = this.kinds[i];
    const ship = motion.position;
    const fwd = motion.forward;
    const seconds = this.durationMs / 1000;
    const { p, f, side, Y } = this;
    let roll = 0;
    if (kind === 'chase' || kind === 'surge') {
      const s = SHOT[kind];
      const lagged = Math.max(i ? this.cuts[i - 1] : 0, t - s.lag / seconds);
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
    } else if (kind === 'overtake') {
      eye
        .copy(this.anchors[i])
        .addScaledVector(
          this.dirs[i],
          this.speeds[i] * (t - this.passAt) * seconds
        );
      target.copy(ship);
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
    } else if (kind === 'depart') {
      eye.copy(this.anchors[i]);
      target.copy(ship).addScaledVector(Y, -SHOT.depart.down);
    } else {
      eye.copy(this.anchors[i]);
      target.copy(ship);
    }
    if (kind !== 'arrive' && kind !== 'depart') {
      // The ship above the middle of the frame, clear of the banner.
      const reach = eye.distanceTo(ship);
      target.addScaledVector(Y, -reach * SHOT.lift * 0.344);
    }
    this.roll = roll;
    return roll;
  }
}
