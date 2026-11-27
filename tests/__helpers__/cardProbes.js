// The matrix's probes: for each card, the one number its text promises, read
// in a scene (cardScene.js), and what the text says that number should be
// at each rank. A probe:
//   { card, metric, unit, axes, measure(scene, ctx) -> { value, trigger, extra },
//     expect(rank, below, ctx) -> the promised value at `rank` given the
//     measured value `below` at the rank below (null: no number promised),
//     setup?: extra cards both scenes hold, tol?: absolute slack (frames) }
// `axes`: 'weapons' (all seven), 'flights' (classic + modern), or neither
// (the default weapon, classic flight). `condition`: a probe of the same card
// measuring the other side of its condition (it promises no change).

import { SHIP, STEP_SECONDS } from './cardScene.js';
import {
  hold,
  field,
  dps,
  shots,
  byCast,
  mult,
  add,
  abs,
  MULTISHOT,
  weaponCount,
  coilMeasure,
  COIL,
  hullHit,
  speedAfter,
  turnRate,
  spinStopTime,
  stopTime,
  retroPull,
  dashOnce,
  dashInterval,
  dashesInBurst,
  orbXp,
  magnetReach,
  towTime,
  comboCap,
  pickupsFromRocks,
  driftSpeed,
  shotSpeed,
  brakeShove,
  brakeCooldown,
  sparkChain,
  lattice,
  doubleHits,
  levelUpRepair,
  heartsDropped,
  weaponCard,
  FOCUS_WEAPONS,
  dangerShare,
  crossingHits,
  RECOIL,
  recoilMeasure,
  perHit,
  lockReach,
} from './cardMeasures.js';

// Fire-rate cards on the weapons whose damage does not follow the shot clock
// one for one (the cards' weaponText): the beam's own 0.25 s wait does not
// shrink (Harmonic), and a Halo blade cuts only while it touches. Cumulative
// damage over rank 0, as measured 26/11 over 30 s.
const FIRE_RATE_DAMAGE = {
  heat_sink: {
    harmonic: [1, 1.08, 1.17, 1.26],
    'shard-halo': [1, 1.04, 1.08, 1.13],
  },
  overclocked_core: { harmonic: [1, 1.25], 'shard-halo': [1, 1.13] },
};
const fireRateDamage =
  (id, cum) =>
  (rank, below, { weapon }) => {
    const own = FIRE_RATE_DAMAGE[id][weapon];
    return own
      ? (below * own[rank]) / own[rank - 1]
      : (below * cum[rank]) / cum[rank - 1];
  };

export const PROBES = {
  plasma: [
    {
      metric: 'damage dealt in 6 s (fixed tanky field)',
      axes: 'weapons',
      measure: (s) => dps(s),
      expect: mult([1, 1.25, 1.5, 1.725]),
    },
  ],
  multishot: [
    {
      metric: (w) => MULTISHOT[w].metric,
      axes: 'weapons',
      measure: (s, { weapon }) => weaponCount(s, weapon),
      expect: (rank, below, { weapon }) => MULTISHOT[weapon].at(rank),
    },
  ],
  targeting_suite: [
    {
      metric: (w) =>
        FOCUS_WEAPONS.includes(w)
          ? 'damage per hit on one elite drone 60 px away (threat focus)'
          : 'share of damage on a volatile rock 300 px off vs a common one 150 px off (danger matrix; scatter: 165 vs 82 px)',
      axes: 'weapons',
      ranks: [1],
      measure: (s, { weapon }) =>
        FOCUS_WEAPONS.includes(weapon)
          ? perHit(s, [[60, 0]], { type: 'drone', elite: true })
          : dangerShare(s, weapon === 'scatter' ? 0.55 : 1),
      expect: (rank, below, { weapon }) =>
        FOCUS_WEAPONS.includes(weapon) ? below * 1.1 : 'more',
    },
    {
      // The Scatter bursts too close for the lead: rank 2 gives it the threat
      // focus instead (+20%; rank 1 gave it none).
      metric: (w) =>
        FOCUS_WEAPONS.includes(w) || w === 'scatter'
          ? 'damage per hit on one elite drone 60 px away (threat focus)'
          : 'hits per shot on a rock crossing at 300 px/s, 380 px out, 20 s (lead past the base 0.6 s cap)',
      axes: 'weapons',
      ranks: [2],
      measure: (s, { weapon }) =>
        FOCUS_WEAPONS.includes(weapon) || weapon === 'scatter'
          ? perHit(s, [[60, 0]], { type: 'drone', elite: true })
          : crossingHits(s, 380),
      expect: (rank, below, { weapon }) => {
        if (FOCUS_WEAPONS.includes(weapon)) return (below * 1.2) / 1.1;
        return weapon === 'scatter' ? below * 1.2 : 'more';
      },
    },
    {
      metric: 'shots in 30 s (rank 3: fire rate +9%)',
      axes: 'weapons',
      ranks: [3],
      setup: [['multishot', 1]],
      tol: 1,
      measure: (s) => shots(s, { seconds: 30 }),
      expect: (rank, below) => below / 0.92,
    },
    {
      metric:
        'enemies hit per volley with Multishot 1 (rank 3: one lock per shot)',
      axes: 'weapons',
      ranks: [3],
      setup: [['multishot', 1]],
      measure: (s, { weapon }) => {
        const casts = byCast(s);
        const r = dps(s, { seconds: 3 });
        // Missiles land late, past the next fire: the enemies hit in 3 s instead.
        if (weapon === 'seeker-swarm')
          return {
            value: new Set(s.damage.map((d) => d.enemy)).size,
            trigger: r.trigger,
          };
        return {
          value: Math.max(0, ...casts.map((c) => c.size)),
          trigger: r.trigger,
        };
      },
      expect: (rank, below, { weapon }) =>
        ['lance', 'harmonic', 'scatter', 'seeker-swarm'].includes(weapon)
          ? 'more'
          : below,
      notMeasured: ({ weapon }) =>
        weapon === 'seeker-swarm'
          ? 'missiles land after the next salvo: this scene cannot tell which lock a hit came from'
          : null,
    },
  ],
  heat_sink: [
    {
      metric: 'shots in 30 s',
      axes: 'weapons',
      measure: (s) => shots(s, { seconds: 30 }),
      expect: mult([1, 1 / 0.9, 1 / 0.81, 1 / 0.729]),
      tol: 1,
    },
    {
      metric: 'damage dealt in 30 s',
      axes: 'weapons',
      measure: (s) => dps(s, { seconds: 30 }),
      expect: fireRateDamage('heat_sink', [1, 1 / 0.9, 1 / 0.81, 1 / 0.729]),
    },
  ],
  afterburn_lance: [
    {
      metric: (w) =>
        ['lance', 'harmonic', 'seeker-swarm'].includes(w)
          ? 'damage per hit on a rock 420 px ahead'
          : 'damage in 6 s on the fixed field (promise foretold hit by hit from each distance)',
      axes: 'weapons',
      metricOverride: undefined,
      measure: (s, { weapon, rank }) => {
        if (['lance', 'harmonic', 'seeker-swarm'].includes(weapon)) {
          const r = dps(s, { layout: [[420, 0]] });
          return {
            value: r.trigger ? r.value / r.trigger : 0,
            trigger: r.trigger,
          };
        }
        // The other weapons on the fixed field: every hit's promised factor
        // from its distance (ship → enemy; the flak's flight, capped at its
        // 180 px burst), so the rank above's total can be foretold.
        const r = dps(s);
        const per = [0, 0.1, 0.15, 0.2];
        const cap = weapon === 'scatter' ? 180 : 400;
        const f = (k, d) => 1 + (per[k] * Math.min(d, cap)) / 100;
        const next = s.damage.reduce((sum, d) => {
          const dist =
            Math.hypot(d.enemy.x - SHIP.x, d.enemy.y - SHIP.y) -
            (weapon === 'scatter' ? 16 : 0);
          return sum + (d.damage * f(rank + 1, dist)) / f(rank, dist);
        }, 0);
        return { value: r.value, trigger: r.trigger, extra: { next } };
      },
      notMeasured: ({ weapon }) =>
        weapon === 'scatter'
          ? 'the bonus is on the bolt hit, the bursts carry none, and this scene does not split them: amount not checked (the numbers are in the row)'
          : null,
      expect: (rank, below, { extraA }) => {
        if (extraA?.next) return extraA.next;
        const per = [0, 0.1, 0.15, 0.2];
        return (below * (1 + per[rank] * 4)) / (1 + per[rank - 1] * 4);
      },
    },
    {
      metric:
        "damage in 4 s to a rock 25° off the nose, between the rank below's lock-on range and this rank's (Auto Turret held)",
      axes: 'weapons',
      // Their texts no longer promise a lock-on range: the Halo and the
      // Furnace never aim, the Arc Caster and the Scatter Coil cannot reach it.
      skipWeapons: ['shard-halo', 'furnace-corona', 'arc-caster', 'scatter'],
      setup: [['auto_aim', 1]],
      measure: (s, { cellRank }) => lockReach(s, cellRank),
      expect: () => 'more',
    },
  ],
  reactor_bleed: [
    {
      metric: 'damage in 6 s, no key held',
      axes: 'weapons+flights',
      measure: (s) => dps(s),
      expect: mult([1, 1.3, 1.6, 2]),
    },
    {
      metric: 'damage in 6 s, W held (no bonus promised)',
      condition: true,
      axes: 'flights',
      measure: (s) => dps(s, { each: (sc) => (sc.input = { up: true }) }),
      expect: (r, below) => below,
    },
    {
      metric:
        'damage in 6 s, D held (classic: turning, bonus promised; modern: moving, none)',
      axes: 'flights',
      measure: (s) => dps(s, { each: (sc) => (sc.input = { right: true }) }),
      expect: (rank, below, { flight }) =>
        flight === 'classic' ? mult([1, 1.3, 1.6, 2])(rank, below) : below,
    },
    {
      metric: 'damage in 6 s, strafe held (bonus promised)',
      axes: 'flights',
      measure: (s) =>
        dps(s, { each: (sc) => (sc.input = { strafeRight: true }) }),
      expect: mult([1, 1.3, 1.6, 2]),
    },
  ],
  overcharge_coil: [
    {
      metric: (w) => COIL[w].metric,
      axes: 'weapons',
      measure: (s, { weapon }) => coilMeasure(s, weapon),
      expect: (rank, below, { weapon }) =>
        (below * COIL[weapon].cum[rank]) / COIL[weapon].cum[rank - 1],
    },
  ],
  ballast_rounds: [
    {
      metric: 'damage in 6 s on rocks below half health',
      axes: 'weapons',
      measure: (s) => dps(s),
      expect: mult([1, 1.3, 1.6, 2]),
    },
    {
      metric: 'damage in 6 s on rocks above half health (no bonus promised)',
      condition: true,
      measure: (s) =>
        dps(s, {
          config: {},
          each: (sc) =>
            sc.enemies.getActiveEnemies().forEach((e) => (e.health = 3.9e5)),
        }),
      expect: (r, below) => below,
    },
  ],
  recoil_dampers: [
    {
      metric: 'rocks one lance passes through (line ahead)',
      measure: (s) => {
        const casts = byCast(s);
        const rocks = field(s, [
          [100, 0],
          [130, 0],
          [160, 0],
          [190, 0],
          [220, 0],
        ]);
        s.run(1, (sc) => {
          sc.park();
          hold(sc, rocks);
        });
        return {
          value: Math.max(0, ...casts.map((c) => c.size)),
          trigger: casts.length,
        };
      },
      expect: (rank, below) => below + 1,
    },
    {
      metric: (w) => RECOIL[w]?.metric ?? 'rocks one lance passes through',
      axes: 'weapons',
      measure: (s, { weapon }) => recoilMeasure(s, weapon),
      expect: (rank, below, { weapon }) =>
        RECOIL[weapon] ? RECOIL[weapon].expect(below) : below + 1,
    },
  ],
  thermal_lens: [
    {
      metric: (w) =>
        w === 'harmonic' ? 'beam length (px)' : 'damage dealt in 6 s',
      axes: 'weapons',
      measure: (s, { weapon }) => {
        if (weapon !== 'harmonic') return dps(s);
        let len = 0;
        s.spawn('asteroid', { x: SHIP.x + 120, y: SHIP.y });
        s.run(3, (sc) => {
          sc.park();
          for (const b of sc.combat.weapons.beams)
            len = Math.max(len, Math.hypot(b.ex - b.x, b.ey - b.y));
        });
        return { value: len, trigger: len };
      },
      expect: (rank, below, { weapon }) =>
        below *
        (weapon === 'harmonic' ? 1.4 : weapon === 'seeker-swarm' ? 1.25 : 1.15),
    },
  ],
  glass_cannon: [
    {
      metric: 'damage dealt in 6 s',
      axes: 'weapons',
      measure: (s) => dps(s),
      expect: mult([1, 1.6]),
    },
    {
      metric: 'max hull',
      measure: (s) => ({ value: s.player.maxHealth, trigger: 1 }),
      expect: mult([1, 0.7]),
    },
  ],
  overclocked_core: [
    {
      metric: 'shots in 30 s',
      axes: 'weapons',
      measure: (s) => shots(s, { seconds: 30 }),
      expect: mult([1, 1 / 0.74]),
      tol: 1,
    },
    {
      metric: 'damage dealt in 30 s',
      axes: 'weapons',
      measure: (s) => dps(s, { seconds: 30 }),
      expect: fireRateDamage('overclocked_core', [1, 1 / 0.74]),
    },
    {
      metric: 'hull lost in 8.5 s',
      measure: (s) => {
        const h = s.player.health;
        s.run(8.5, (sc) => sc.park());
        return { value: h - s.player.health, trigger: 1 };
      },
      expect: (r, below) => below + 2,
    },
  ],
  shield: [
    {
      metric: 'max hull',
      measure: (s) => ({ value: s.player.maxHealth, trigger: 1 }),
      expect: add([0, 50, 100, 175]),
    },
  ],
  deflector_shield: [
    {
      metric: 'damage the shield absorbs before the hull takes any',
      measure: (s) => {
        s.run(0.2, (sc) => sc.park());
        s.press.add('shield');
        s.run(0.1, (sc) => sc.park());
        if (!s.player.shield.isShieldActive)
          return { value: 0, trigger: 1, extra: { shield: false } };
        let absorbed = 0;
        const h0 = s.player.health;
        while (s.player.health === h0 && absorbed < 1000) {
          s.hit(1);
          absorbed += 1;
        }
        return { value: absorbed - 1, trigger: 1 };
      },
      expect: abs([0, 50, 75, 75, 100, 125]),
    },
    {
      metric: 'shield recharge after it breaks (s)',
      measure: (s) => {
        s.run(0.2, (sc) => sc.park());
        s.press.add('shield');
        s.run(0.1, (sc) => sc.park());
        if (!s.player.shield.isShieldActive) return { value: 0, trigger: 0 };
        for (let i = 0; i < 400 && s.player.shield.isShieldActive; i += 1)
          s.hit(1);
        let t = 0;
        let ready = false;
        while (t < 60 && !ready) {
          s.press.add('shield');
          s.run(0.05, (sc) => sc.park());
          t += 0.05;
          ready = s.player.shield.isShieldActive;
        }
        return { value: ready ? t : 0, trigger: ready ? 1 : 0 };
      },
      ranks: [2, 3, 4, 5],
      expect: (rank, below) =>
        rank === 3 ? below - 5 : rank === 5 ? 'less' : below,
      tol: 0.1,
      note: 'rank 5 promises "a shorter recharge" (no number): any drop counts',
    },
    {
      metric: 'damage to a rock 60 px away when the shield breaks',
      ranks: [5],
      measure: (s) => {
        const [r] = field(s, [[60, 0]]);
        s.run(0.2, (sc) => {
          sc.park();
          hold(sc, [r]);
        });
        s.press.add('shield');
        s.run(0.1, (sc) => sc.park());
        if (!s.player.shield.isShieldActive) return { value: 0, trigger: 0 };
        const lanceBefore = s.healthLost(r.rock);
        for (let i = 0; i < 400 && s.player.shield.isShieldActive; i += 1)
          s.hit(1);
        s.run(0.1, (sc) => {
          sc.park();
          hold(sc, [r]);
        });
        // Twin scenes: the lance's hits are the same in both.
        return { value: s.healthLost(r.rock) - lanceBefore, trigger: 1 };
      },
      expect: (rank, below) => (rank === 5 ? 'more' : below),
    },
  ],
  ablative_plating: [
    {
      metric: 'hull lost to a 20-damage hit',
      measure: (s) => hullHit(s, 20),
      expect: add([0, -3, -6, -9]),
    },
  ],
  grav_anchor: [
    {
      metric: 'hull lost to a 20-damage hit, no key held',
      axes: 'flights',
      measure: (s) => hullHit(s, 20),
      expect: mult([1, 0.8, 0.65, 0.5]),
    },
    {
      metric: 'hull lost to a 20-damage hit, W held (no cut promised)',
      condition: true,
      axes: 'flights',
      measure: (s) => hullHit(s, 20, { up: true }),
      expect: (r, below) => below,
    },
    {
      metric:
        'hull lost to a 20-damage hit, D held (classic: turning, cut promised; modern: moving, none)',
      axes: 'flights',
      measure: (s) => hullHit(s, 20, { right: true }),
      expect: (rank, below, { flight }) =>
        flight === 'classic' ? mult([1, 0.8, 0.65, 0.5])(rank, below) : below,
    },
    {
      metric: 'hull lost to a 20-damage hit, strafe held (cut promised)',
      axes: 'flights',
      measure: (s) => hullHit(s, 20, { strafeRight: true }),
      expect: mult([1, 0.8, 0.65, 0.5]),
    },
  ],
  static_shell: [
    {
      metric: 'damage to a rock 80 px away from one hit on the hull',
      measure: (s) => {
        const rocks = field(s, [
          [0, 80],
          [0, -150],
        ]);
        s.run(0.3, (sc) => {
          sc.park();
          hold(sc, rocks);
        });
        const before = s.healthLost(rocks[0].rock);
        const far = s.healthLost(rocks[1].rock);
        const { applied } = s.hit(10);
        s.run(0.2, (sc) => {
          sc.park();
          hold(sc, rocks);
        });
        return {
          value: s.healthLost(rocks[0].rock) - before,
          trigger: applied ? 1 : 0,
          extra: { farRock: s.healthLost(rocks[1].rock) - far },
        };
      },
      expect: add([0, 20, 40, 60]),
    },
  ],
  gravity_brake: [
    {
      metric:
        'speed of a rock drifting 100 px from the ship (px/s, 60 unslowed)',
      measure: (s) => driftSpeed(s, 100),
      expect: mult([1, 0.8, 0.65, 0.5]),
    },
    {
      metric:
        'speed of a rock drifting 170 px from the ship (px/s; in reach only at rank 3, 180 px)',
      condition: true,
      measure: (s) => driftSpeed(s, 170),
      expect: (rank, below) => (rank === 3 ? below * 0.5 : below),
    },
    {
      metric: 'speed of an enemy shot 100 px from the ship (px/s)',
      measure: (s) => shotSpeed(s, 100),
      expect: mult([1, 0.8, 0.65, 0.5]),
    },
  ],
  propulsors: [
    {
      metric: 'speed after 0.3 s of W from rest (px/s; acceleration)',
      axes: 'flights',
      measure: (s, c) => ({
        value: speedAfter(
          s,
          c.flight === 'modern' ? { right: true } : { up: true },
          0.3
        ),
        trigger: 1,
      }),
      expect: mult([1, 1.12, 1.25, 1.45, 1.75, 2.1]),
    },
    {
      metric: 'top speed holding W 6 s (px/s)',
      axes: 'flights',
      measure: (s, c) => ({
        value: speedAfter(
          s,
          c.flight === 'modern' ? { right: true } : { up: true },
          6
        ),
        trigger: 1,
      }),
      expect: mult([1, 1.1, 1.22, 1.38, 1.6, 1.85]),
    },
    {
      metric: 'ion trail damage to a drone behind the ship in 2 s of W',
      ranks: [5],
      measure: (s) => {
        const [d] = field(s, [[-25, 0]], { type: 'drone' });
        s.input = { up: true };
        s.run(2, (sc) => {
          sc.park();
          hold(sc, [d]);
        });
        return { value: s.healthLost(d.rock), trigger: 1 };
      },
      expect: (rank, below) => (rank === 5 ? 'more' : below),
    },
  ],
  rcs_system: [
    {
      metric: 'classic turn rate holding D (deg/s)',
      measure: (s) => ({ value: turnRate(s), trigger: 1 }),
      expect: abs([74, 96, 118, 140, 163, 192]),
      tol: 2,
    },
    {
      metric: 'classic: a released spin stops in (s)',
      measure: (s) => ({ value: spinStopTime(s), trigger: 1 }),
      expect: abs([1.7, 0.5, 0.4, 0.35, 0.3, 0.25]),
      tol: 0.05,
    },
    {
      metric: 'strafe speed after 0.3 s of C from rest (px/s)',
      axes: 'flights',
      measure: (s) => ({
        value: speedAfter(s, { strafeRight: true }, 0.3),
        trigger: 1,
      }),
      expect: () => 'more',
    },
    {
      metric: 'modern: time for the nose to swing 180° onto a new heading (s)',
      flightsOnly: ['modern'],
      measure: (s) => {
        s.input = { right: true };
        s.run(1.5);
        s.input = { left: true };
        let t = 0;
        while (Math.abs(Math.abs(s.player.angle) - Math.PI) > 0.1 && t < 5) {
          s.run(STEP_SECONDS);
          t += STEP_SECONDS;
        }
        return { value: t, trigger: 1 };
      },
      expect: () => 'less',
    },
  ],
  braking_system: [
    {
      metric: 'classic: time to stop after letting go at top speed (s)',
      measure: (s) => ({ value: stopTime(s), trigger: 1 }),
      expect: abs([10, 1.5, 1.3, 1.1]),
      tol: 0.15,
      note: '10 s = did not stop within 10 s (glides on)',
    },
    {
      metric: 'classic: S pull from top speed (px/s², first 0.2 s)',
      measure: (s) => ({ value: retroPull(s), trigger: 1 }),
      expect: () => 'more',
    },
    {
      metric:
        'emergency brake: S held at speed; shove of a drone 80 px away (px, in 0.5 s)',
      ranks: [3],
      measure: (s) => brakeShove(s),
      expect: (rank, below) => (rank === 3 ? 'more' : below),
    },
  ],
  cinder_trail: [
    {
      metric: 'trail damage per tick to a rock behind the ship while W held',
      measure: (s) => {
        const [r] = field(s, [[-30, 0]]);
        s.input = { up: true };
        s.run(2, (sc) => {
          sc.park();
          hold(sc, [r]);
        });
        const hits = s.damage.filter((d) => d.enemy === r.rock);
        return {
          value: hits.length ? s.damageTo(r.rock) / hits.length : 0,
          trigger: 1,
          extra: { ticks: hits.length },
        };
      },
      expect: abs([0, 6, 12, 18]),
    },
  ],
  phase_skin: [
    {
      metric: 'invulnerability left when the dash ends (s)',
      measure: (s) => {
        s.player.setInvulnerableTimer(0);
        dashOnce(s);
        return { value: s.player.invulnerableTimer, trigger: 1 };
      },
      expect: (rank, below) => below + 0.4,
      tol: 0.05,
    },
  ],
  afterburner: [
    {
      metric: 'seconds between two dashes, dash held',
      measure: (s) => dashInterval(s),
      expect: mult([1, 0.88, 0.78, 0.7]),
      tol: 0.034,
    },
  ],
  ram_plating: [
    {
      metric:
        'damage to a rock the dash passes through (twin: lance hits equal)',
      measure: (s) => {
        const rocks = field(s, [[0, 50]]);
        s.player.angle = Math.PI / 2;
        s.run(0.1, (sc) => hold(sc, rocks));
        const before = s.healthLost(rocks[0].rock);
        s.press.add('dash');
        s.run(0.6, (sc) => hold(sc, rocks));
        return {
          value: s.healthLost(rocks[0].rock) - before,
          trigger: s.events['player-dashed'] ?? 0,
        };
      },
      expect: add([0, 20, 35, 50]),
      note: 'rock 50 px ahead of the nose; the lance hits it the same in both twins',
    },
  ],
  gyro_servos: [
    {
      metric: 'shots in the 1 s after a dash',
      measure: (s) => {
        dps(s, { seconds: 1 });
        const s0 = s.combat.weapons.shots;
        s.press.add('dash');
        s.run(1, (sc) => sc.park());
        return {
          value: s.combat.weapons.shots - s0,
          trigger: s.events['player-dashed'] ?? 0,
        };
      },
      expect: mult([1, 1.4, 1.8]),
      tol: 1,
      note: '±1 shot: a 1 s window',
    },
    {
      metric: 'damage in 12 s dashing whenever the dash is ready',
      axes: 'weapons',
      measure: (s) => {
        const r = dps(s, { seconds: 12, each: (sc) => sc.press.add('dash') });
        return {
          value: r.value,
          trigger: s.events['player-dashed'] ?? 0,
          extra: {
            shots: r.extra.shots,
            dashes: s.events['player-dashed'] ?? 0,
          },
        };
      },
      expect: () => 'more',
    },
  ],
  reactive_brake: [
    {
      metric: 'emergency brake: damage to a drone 60 px away',
      axes: 'flights',
      measure: (s) => brakeShove(s, 60),
      read: 'damage',
      expect: add([0, 30 * (1 - 60 / 110), 60 * (1 - 60 / 110)]),
      tol: 0.5,
      note: '"up to": full at the ship, fading to the 110 px edge: at 60 px, 30 × (1 − 60/110) = 13.6; modern: the Auto Turret also hits the drone, the same in both twins',
    },
    {
      metric: 'emergency brake: shove of a drone 80 px away (px, in 0.5 s)',
      axes: 'flights',
      measure: (s) => brakeShove(s),
      expect: () => 'more',
    },
    {
      metric: 'emergency brake recharge the game starts after a brake (s)',
      axes: 'flights',
      measure: (s) => brakeCooldown(s),
      expect: abs([1.2, 1.2, 0.72]),
      tol: 0.03,
      note: 'text: 0.7 s instead of 1.2 s; cooldown 1.2 × 0.6; read one step after the brake',
    },
  ],
  inertial_dampers: [
    {
      metric:
        'distance the dash itself carries the ship (px, from rest, dash + ease-off)',
      axes: 'flights',
      measure: (s) => {
        const { start } = dashOnce(s);
        while (s.player.maneuvers.dashDecayTimer > 0) s.run(STEP_SECONDS);
        return {
          value: Math.hypot(
            s.player.position.x - start.x,
            s.player.position.y - start.y
          ),
          trigger: 1,
        };
      },
      expect: mult([1, 1.25, 1.5]),
    },
  ],
  phase_dash: [
    {
      metric: 'dashes in 0.5 s, dash held',
      measure: (s) => dashesInBurst(s),
      expect: abs([1, 2]),
    },
  ],
  magfield: [
    {
      metric: 'farthest orb the magnet moves (px)',
      measure: (s) => magnetReach(s),
      expect: mult([1, 1.4, 1.75, 2]),
      tol: 5,
    },
    {
      metric: 'magnet pull force (xp-orbs)',
      measure: (s) => ({
        value: s.services['xp-orbs'].getMagnetismForce(),
        trigger: 1,
      }),
      expect: mult([1, 1.35, 1.6875, 1.940625]),
    },
  ],
  capacitor_bank: [
    {
      metric:
        'spark damage to a second rock 100 px from a rock the lance kills',
      measure: (s) => sparkChain(s, 1),
      expect: (rank) => [0, 15, 20, 25][rank],
      tol: 1,
    },
    {
      metric: 'sparks in a row along a chain of weak rocks',
      measure: (s) => sparkChain(s, 6),
      read: 'sparked',
      expect: abs([0, 1, 2, 4]),
    },
  ],
  arc_lattice: [
    {
      metric: 'lattice strikes in 6 s on rocks behind the ship (130-190 px)',
      measure: (s) => lattice(s),
      expect: (rank) => [0, 5, 12, 21][rank],
      tol: 2,
      note: 'r1 1/1.2 s × 1 target in 160 px; r2 1/1.0 s × 2 in 180; r3 1/0.8 s × 3 in 200 (rocks at 130, 150, 170, 190 px)',
    },
  ],
  core_extractor: [
    {
      metric: 'XP from a 100 XP orb',
      measure: (s) => orbXp(s, 100),
      expect: mult([1, 1.15, 1.3, 1.5]),
      tol: 1,
    },
  ],
  wide_net: [
    {
      metric: 'seconds until a far orb is hauled',
      measure: (s) => towTime(s),
      expect: abs([30, 20, 15, 10]),
      tol: 0.2,
      note: '30 = never within 30 s',
    },
  ],
  bounty_ledger: [
    {
      metric: 'XP multiplier on an orb after 40 kills in a row',
      measure: (s) => comboCap(s),
      expect: abs([2, 2.25, 2.5, 2.75]),
      tol: 0.01,
    },
  ],
  chain_capacitor: [
    {
      metric: 'share of lance hits that land twice (1000 shots)',
      measure: (s) => doubleHits(s),
      expect: abs([0, 0.1]),
      tol: 0.03,
      note: 'binomial, n ≈ 1000: ±0.03 is 3 σ',
    },
    {
      axes: 'weapons',
      measure: (s, { weapon }) =>
        weapon === 'arc-caster'
          ? weaponCount(s, weapon)
          : dps(s, { seconds: 60 }),
      expect: (rank, below, { weapon }) =>
        weapon === 'arc-caster'
          ? below + 1
          : ['harmonic', 'seeker-swarm'].includes(weapon)
            ? 'more'
            : below * 1.1,
      metricOverride: undefined,
      metric: (w) =>
        w === 'arc-caster'
          ? 'enemies struck per cast (1 + jumps)'
          : w === 'harmonic'
            ? 'damage in 60 s (1 beam in 5 twice)'
            : w === 'seeker-swarm'
              ? 'damage in 60 s (1 missile in 10 splits)'
              : 'damage in 60 s (10% of hits twice)',
    },
  ],
  scrap_compactor: [
    {
      metric: 'hull repaired by a level-up',
      measure: (s) => levelUpRepair(s),
      expect: abs([0, 8, 14, 20]),
    },
  ],
  lucky_fragment: [
    {
      metric: 'field pickups per small rock destroyed (400 rocks)',
      measure: (s) => pickupsFromRocks(s),
      expect: abs([0, 0.1]),
      tol: 0.045,
      note: 'binomial n=400: ±0.045 is 3 σ',
    },
  ],
  blood_ledger: [
    {
      metric: 'XP from a 100 XP orb',
      measure: (s) => orbXp(s, 100),
      expect: mult([1, 2]),
      tol: 1,
    },
    {
      metric: 'hearts dropped by 300 large gold rocks (the reward roll)',
      measure: (s) => heartsDropped(s),
      expect: abs([null, 0]),
      note: 'rank 0 just has to drop some',
    },
    {
      metric:
        'hull repaired by a Warden kill (boss-defeated event, from 10 HP)',
      measure: (s) => {
        s.player.health = 10;
        s.eventBus.emit('boss-defeated', { x: 200, y: 200 });
        return { value: s.player.health - 10, trigger: 1 };
      },
      expect: () => 'more',
      note: 'the Warden kill is the event the boss sends, not a real fight',
    },
  ],
  auto_aim: [
    {
      metric: 'damage to a rock 90° off the nose in 4 s',
      axes: 'weapons',
      measure: (s) => {
        const rocks = field(s, [[0, -120]]);
        s.run(4, (sc) => {
          sc.park();
          hold(sc, rocks);
        });
        return { value: s.damageTo(rocks[0].rock), trigger: 1 };
      },
      expect: (rank, below, { weapon }) =>
        ['furnace-corona', 'shard-halo'].includes(weapon) ? below : 'more',
    },
  ],
  flight_computer: [
    {
      metric: 'velocity along +x after 1 s of D (px/s; classic turns instead)',
      measure: (s) => {
        s.input = { right: true };
        s.run(1);
        return {
          value: s.player.velocity.vx,
          trigger: 1,
          extra: { scheme: s.player.controlScheme },
        };
      },
      expect: () => 'more',
      engage: true,
    },
    {
      metric:
        'time to stop after letting go at speed (s; classic: W, modern: D; 10 = still gliding)',
      measure: (s) => {
        s.input =
          s.player.controlScheme === 'modern' ? { right: true } : { up: true };
        s.run(2);
        const v0 = Math.hypot(s.player.velocity.vx, s.player.velocity.vy);
        s.input = {};
        let t = 0;
        while (
          Math.hypot(s.player.velocity.vx, s.player.velocity.vy) > 2 &&
          t < 10
        ) {
          s.run(STEP_SECONDS);
          t += STEP_SECONDS;
        }
        return {
          value: t,
          trigger: v0 > 10 ? 1 : 0,
          extra: { scheme: s.player.controlScheme, v0 },
        };
      },
      expect: () => 'less',
      engage: true,
    },
  ],
  momentum_rounds: [
    {
      metric: 'damage in 6 s flying at 95% of the top speed',
      axes: 'weapons+flights',
      measure: (s) =>
        dps(s, {
          each: (sc) => {
            sc.player.velocity.vx = sc.player.flight.maxSpeed * 0.95;
          },
        }),
      expect: mult([1, 1.15, 1.3, 1.45]),
    },
    {
      metric: 'damage in 6 s parked (no bonus promised)',
      condition: true,
      axes: 'flights',
      measure: (s) => dps(s),
      expect: (r, below) => below,
    },
  ],
  close_quarters: [
    {
      metric: 'damage in 6 s with a rock 70 px away',
      axes: 'weapons',
      measure: (s) => dps(s),
      expect: mult([1, 1.2, 1.4, 1.6]),
    },
    {
      metric: 'damage in 6 s, every rock past 200 px (no bonus promised)',
      condition: true,
      measure: (s) =>
        dps(s, {
          layout: [
            [220, 0],
            [310, 0],
            [420, 0],
          ],
        }),
      expect: (r, below) => below,
    },
  ],
  hull_patch: [
    {
      metric: 'hull repaired from half hull',
      measure: (s) => ({ value: s.player.health - s._halfHull, trigger: 1 }),
      expect: (rank, below, c) => c.maxHealth * 0.25,
      before: (s) => {
        s.player.health = s.player.maxHealth / 2;
        s._halfHull = s.player.health;
      },
      measureAfterApply: true,
    },
  ],
  salvage_cache: [
    {
      metric: 'run salvage after the pick',
      measure: (s) => ({ value: s._salvage(), trigger: 1 }),
      expect: () => 'more',
      measureAfterApply: true,
    },
  ],
  harmonic_resonator: [
    {
      metric: 'share of shots that are a beam',
      measure: (s) => weaponCard(s, 'beamShare'),
      expect: abs([null, 0.25]),
      tol: 0.04,
    },
    {
      metric: 'beam length (px)',
      measure: (s) => weaponCard(s, 'beamLength'),
      expect: abs([null, 220]),
      tol: 3,
    },
  ],
  scatter_coil: [
    {
      metric: 'flak bolts per volley',
      measure: (s) => weaponCard(s, 'perShot'),
      expect: abs([null, 5]),
    },
  ],
  arc_caster: [
    {
      metric: 'enemies struck per cast (1 + jumps)',
      measure: (s) => weaponCount(s, 'arc-caster'),
      expect: abs([null, 4]),
    },
  ],
  shard_halo: [
    {
      metric: 'blades round the ship',
      measure: (s) => weaponCount(s, 'shard-halo'),
      expect: abs([null, 3]),
    },
  ],
  furnace_corona: [
    {
      metric: 'ring radius (px)',
      measure: (s) => weaponCount(s, 'furnace-corona'),
      expect: abs([null, 78]),
    },
    {
      metric: 'pulses in 30 s (every 0.5 s: 60)',
      measure: (s) => shots(s, { seconds: 30 }),
      expect: abs([null, 60]),
      tol: 2,
    },
  ],
  seeker_swarm: [
    {
      metric: 'missiles per salvo',
      measure: (s) => weaponCard(s, 'perShot'),
      expect: abs([null, 2]),
    },
  ],
};
