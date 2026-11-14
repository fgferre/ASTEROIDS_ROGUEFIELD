// A Sentinel (CONTENT.md "Boss"): the machine that kept the Reach
// quarantined. A low slab with an emitter mast and four fence emitters
// docked at its corners. Its loop: GRID (it stops and throws its four
// emitters out to the corners of a square round the ship; anchored, they
// project thin lines between them, then a solid fence on three sides and a
// doorway in the side that faces it; solid, the cage closes in round its
// centre unless its own body is inside, then collapses and the emitters fly
// home; a fence touched hurts once and pushes the ship back),
// LOCK (from the warning on it fires locked beams from its mast: a line
// tracks the ship, freezes, then burns along the frozen line to the field's
// edge — through the doorway, as often as not), REST (cage down, emitters
// docked, it cools: full damage), a drift toward mid-field, again. Not
// resting, its shell lets `shellDamageFactor` through. Below
// `phaseThresholds`: one more beam, a faster aim, a smaller, faster cage with
// a narrower doorway, a shorter rest. Behavior:
// src/modules/enemies/types/SentinelInterdictor.js; listed by
// src/data/enemies/boss.js (SENTINEL_KINDS). Seconds, field px. Numbers:
// proposta 12/11 and 13/11 — the owner's play decides.
export default {
  id: 'interdictor',
  order: 12,
  tier: 'sentinel',
  displayName: 'Interdictor',
  subtitle: 'The boundary was drawn on purpose',
  layer: 15, // proposta 12/11: the layer it fights on (health scales by it)
  // 60 % of Warden Null's health on the same layer: Null is Prime's base ×
  // its 1.35 (null.js), so 0.6 × 1.35.
  healthFactor: 0.81, // proposta 12/11
  radius: 72, // proposta 12/11
  // XP on top of the type-wide boss drop, like the other Sentinels: 100 + 500.
  rewards: { xp: 100 }, // proposta 12/11
  phaseThresholds: [0.5], // proposta 12/11
  phaseCount: 2,
  invulnerabilityDuration: 1, // proposta 12/11: s, at the phase change
  // Its entrance: short, the emitter mast rising as it stops. Fields
  // explained in prime.js.
  arrival: {
    start: 160,
    motion: 'heavy',
    curve: 0,
    travel: 0.6, // proposta 12/11
    close: 0.25, // proposta 12/11
    open: 1,
    spin: 0,
    world: 0.3,
    recover: 0.4,
    flare: '#ff5a6e',
    shot: { tilt: [64, 64], turn: [-18, -4], distance: [640, 560], look: 0.45 },
  },
  shellDamageFactor: 0.3, // proposta 12/11: not resting, 30 % gets through
  // The cage: a square round the ship, kept inside the field, strung
  // between four emitters the boss throws out (13/11, the owner: "como a
  // nave lança essa grade? ... tem que ter algo real e físico").
  grid: {
    // proposta 13/11: s the emitters fly to the corners, then s the thin
    // lines grow between them: the warning. At 1.0 + 0.6 the test pilot
    // flew out across the lines before they were solid every time (16 of
    // 16 won, no fence touched): the cage was a formality. 0.8 + 0.35 then
    // 0.7 + 0.3.
    deploy: 0.7,
    project: 0.3,
    // proposta 13/11: s, the cage is drawn round where the ship will be
    // this long ahead, at its speed (it flew out ahead of a cage drawn
    // round where it was)
    lead: 0.5,
    // proposta 13/11: s it holds closed before it collapses (was a fixed
    // solid hold per phase)
    hold: 0.4,
    fade: 0.4, // proposta 13/11: s, it collapses (harmless); was 0.3
    recall: 0.8, // proposta 13/11: s the emitters take to fly home
    dock: 0.84, // proposta 13/11: of its radius, where they sit docked
    thickness: 14, // proposta 12/11: px, a solid fence
    // proposta 13/11: of contactDamage, was 0.4 (like the barrier): the good
    // pilot reached it at full hull every time and won 23/24; at 0.55 (and
    // the beam at 0.45) 19/24. At 0.7 with a 36 px beam 21/24, and with a
    // 0.3 s beam freeze 22/24: harder or more hits did not lower it further.
    // 0.55 → 0.35 with the cage of emitters and its doorway: at 0.55 (and
    // the beam at 0.45) the good pilot won 7 of 24.
    damageFactor: 0.35,
    // proposta 12/11: px/s, a fence pushes the ship back to its side; a
    // ship squeezed between two (13/11: they knocked it back and forth
    // until it died, 7 s into the fight, 6 times in 24) is spat out of the
    // doorway
    push: 260,
    // proposta 13/11: s after a fence hurts during which no fence hurts
    // again (it was one hit a frame, held off only by the ship's 0.5 s)
    grace: 1.0,
    // proposta 13/11: of its side, where the solid cage closes to (was 0.2,
    // a 72 px box a ship could sit in): now no ship fits, it has to leave
    // by the doorway or be thrown through a fence
    close: 0.08,
    // proposta 13/11: the very first cage is the lesson: slower, a wider
    // doorway, one beam
    first: { closeTime: 3.4, door: 130, beams: 1 },
  },
  // A locked beam: aims (the cycle's `aim`), freezes, burns to the edge.
  // Damage over time: one tick every `burnTick` s while the ship's centre is
  // within `width / 2` of the burning line, `damageFactor` of contactDamage.
  lock: {
    freeze: 0.4, // proposta 12/11: s, the line stops following
    burn: 0.6, // proposta 12/11: s
    gap: 0.5, // proposta 12/11: s between one beam's end and the next aim
    width: 24, // proposta 12/11: px
    // proposta 12/11: was 0.15; a beam that landed took 7, less than a
    // drone's shot; proposta 13/11: 0.3 → 0.45, with the fence above, and
    // back to 0.3 once the doorway faced it (7 of 24 won at 0.45)
    damageFactor: 0.3,
  },
  burnTick: 0.4, // proposta 12/11
  ventSpeed: 3, // proposta 12/11: ventOpen (0..1) per s
  drift: {
    acceleration: 80, // proposta 12/11: px/s², toward mid-field
    maxSpeed: 60, // proposta 12/11: px/s
    arrive: 60, // proposta 12/11: px, it slows inside this of the centre
  },
  // The cycle per phase: the drift; the cage's side, the seconds it takes
  // to close and its doorway's width; beams per cage and each one's aim;
  // the rest. The first aim starts with the cage's warning.
  // rest 3 and 2.4 (were 2.5 and 2): it was open a quarter of the time and
  // the fight ran three minutes and more (12/11).
  cycle: [
    // proposta 13/11: closeTime 3 → 2.4 with a doorway (was a whole side
    // open, and the pilot left by it before the cage was solid); sizes 360
    // and 320 → 300 and 260: a bigger cage held its own body and never
    // closed (12 cages of 12 in a probe fight)
    {
      drift: 1.6,
      size: 300,
      closeTime: 2.4,
      door: 120, // proposta 13/11: 100 → 120 (good pilot 12 of 24 at 100)
      beams: 2,
      aim: 1.0,
      rest: 3,
    },
    // proposta 13/11: tighter and faster below half health
    {
      drift: 1.2,
      size: 260,
      closeTime: 2.0,
      door: 100, // proposta 13/11: 80 → 100
      beams: 3,
      aim: 0.8,
      rest: 2.4,
    },
  ], // proposta 12/11, 13/11
  // It steers itself (the drift above); the phases only name the strategy.
  movementPhases: [{ strategy: 'linear' }, { strategy: 'linear' }],
};
