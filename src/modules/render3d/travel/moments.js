// The journey's sound moments (travelScene.js): when each of its sounds
// plays, read off the planned flight (motion.js) and its shots (shots.js),
// so they stay on the picture when the film is re-cut. Ids (the audio's
// eventCues `travel-moment`): `ignite` as the film cuts to the engines (into
// the gate's dive on a jump out by it), `burn` as the ship burns off its
// place (the loop), `charge` so it ends on the `leap` (a jump), `dropout` as
// the white clears on the far side, `flyby` as the camera passes the ship
// (at most MAX_PASSES, one after the other, none over a jump's leap and
// drop-out: those carry it), `brake` as the ship brakes in
// or the camera rises, whichever first (the loop fades out). The scene adds
// `end` when the journey stops.

// The samples' own timing (audio/sfx/travel-*), seconds: the warp charge
// plays its whole length into the leap; a fly-by is loudest `flyby` in, put
// on the pass, and lasts `pass`; the drop-out keeps `clear` to itself.
const LEAD = { charge: 2.2, flyby: 0.5, pass: 1.3, clear: 0.6 };
const MAX_PASSES = 2;

/**
 * The moments ([{ id, t }] in order of t) of `motion` and `shots`, both
 * planned, over `durationMs`; `rise`: the t the camera starts its rise;
 * `clearAt`: the t a jump's white starts to clear.
 */
export function travelMoments(motion, shots, durationMs, rise, clearAt) {
  const sec = (s) => (s * 1000) / durationMs;
  const list = [];
  const add = (id, t) => list.push({ id, t: Math.max(0, t) });
  add('ignite', shots.cuts[0]);
  add('burn', motion.jumps ? motion.lineUp : motion.turnAt);
  if (motion.jumps) {
    add('charge', motion.jumpAt - sec(LEAD.charge));
    add('leap', motion.jumpAt);
    add('dropout', clearAt);
  }
  let free = -Infinity;
  let passes = 0;
  shots.kinds.forEach((kind, i) => {
    const pass = shots.passAt(i);
    if (pass === null || passes >= MAX_PASSES) return;
    const at = pass - sec(LEAD.flyby);
    if (at < free) return;
    if (
      motion.jumps &&
      at > motion.jumpAt - sec(LEAD.pass) &&
      at < clearAt + sec(LEAD.clear)
    )
      return;
    add('flyby', at);
    free = at + sec(LEAD.pass);
    passes += 1;
  });
  add('brake', Math.min(motion.landAt, rise));
  return list.sort((a, b) => a.t - b.t);
}

// A moment a late frame finds more than this behind it is dropped (the
// loop's stop never is), seconds.
const STALE = 0.25;

/**
 * Emits a journey's moments (`emit(id)`) as its t passes them, once each,
 * and `end` when it stops.
 */
export class MomentClock {
  constructor(emit) {
    this.emit = emit;
    this.moments = [];
    this.next = 0;
    this.live = false;
  }

  start(moments) {
    this.moments = moments;
    this.next = 0;
    this.live = true;
  }

  /** At t of a journey `durationMs` long. */
  tick(t, durationMs) {
    if (!this.live) return;
    const stale = (STALE * 1000) / durationMs;
    while (this.next < this.moments.length && this.moments[this.next].t <= t) {
      const { id, t: at } = this.moments[this.next];
      this.next += 1;
      if (id === 'brake' || t - at <= stale) this.emit(id);
    }
  }

  stop() {
    if (!this.live) return;
    this.live = false;
    this.emit('end');
  }
}
