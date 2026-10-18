// Enemy-machine cues (Husk, Ram, Weaver, Bulwark, Caster, Shade, Heralds, flak, Leech) and the enemy telegraph.
// World sounds on the ambient bus (ducks), panned and distance-mixed, each throttled by its own minInterval.
// The bodies came from SFXBus.js unchanged.
import { deepFreeze } from '../../../utils/deepFreeze.js';

// Machines (Husk, Ram, Weaver, Bulwark, Caster, Shade): world cues on the
// ambient bus, panned and distance-mixed by the machine's position; each one
// is never retriggered within its minInterval s (many machines, one voice per
// cue).
// proposta 18/10: the Ram's windup is a mechanical spin-up — a sawtooth, FM'd
// by a sub-octave sine, rising fromHz → toHz over `seconds` (its lane
// telegraph lasts RAM_WINDUP_SECONDS) and swelling to `peak` until `release`
// s before the end, under a ratchet of `clicks.count` metallic clicks that
// speed up and grow from `firstGain` toward the charge.
const RAM_SPINUP_SFX = Object.freeze({
  seconds: 0.6,
  release: 0.05,
  peak: 0.07,
  fromHz: 70,
  toHz: 300,
  fmRatio: 0.5,
  fmDepth: 0.6,
  lowpassHz: 1600,
  clicks: Object.freeze({
    count: 9,
    clickSeconds: 0.004,
    firstGain: 0.4,
    bandHz: 3400,
    q: 4,
    peak: 0.4,
  }),
  minInterval: 0.3,
});
// proposta 18/10: the Ram's charge is a low whoosh (noise, its band sweeping
// down) over a soft sub.
const RAM_CHARGE_SFX = Object.freeze({
  seconds: 0.45,
  attack: 0.04,
  peak: 0.3,
  fromHz: 700,
  toHz: 140,
  q: 0.8,
  sub: Object.freeze({ fromHz: 90, toHz: 40, peak: 0.08, seconds: 0.3 }),
  minInterval: 0.2,
});
// proposta 18/10: a dying Husk hisses open and three pops follow, one per
// released drone, `pops.at` s in (0.4 s in all).
const HUSK_RELEASE_SFX = Object.freeze({
  hiss: Object.freeze({
    seconds: 0.4,
    attack: 0.01,
    peak: 0.1,
    fromHz: 6500,
    toHz: 3000,
    q: 0.7,
  }),
  pops: Object.freeze({
    at: Object.freeze([0.1, 0.19, 0.28]),
    fromHz: Object.freeze([1100, 950, 800]),
    drop: 0.35,
    peak: 0.13,
    seconds: 0.06,
  }),
  minInterval: 0.12,
});
// proposta 18/10: a Weaver laying a Tether is a quiet metallic click-drop —
// two short pings, the second `gap` s later and lower. A partial is
// [frequency ratio, weight].
const WEAVER_TETHER_SFX = Object.freeze({
  hz: Object.freeze([2400, 1700]),
  gap: 0.07,
  strike: Object.freeze({
    type: 'sine',
    partials: Object.freeze([
      Object.freeze([1, 1]),
      Object.freeze([2.76, 0.45]),
    ]),
    peak: 0.06,
    seconds: 0.05,
  }),
  minInterval: 0.15,
});
// proposta 18/10: a hit on the Bulwark's plate is a dull armoured clang — an
// inharmonic body at 250–590 Hz decaying fast, over a short low knock (the
// hull keeps the shared hit cue).
const BULWARK_PLATE_HIT_SFX = Object.freeze({
  body: Object.freeze({
    type: 'triangle',
    hz: 250,
    partials: Object.freeze([
      Object.freeze([1, 1]),
      Object.freeze([1.52, 0.6]),
      Object.freeze([2.37, 0.35]),
    ]),
    peak: 0.08,
    seconds: 0.16,
  }),
  knock: Object.freeze({
    seconds: 0.05,
    attack: 0.003,
    peak: 0.12,
    fromHz: 900,
    toHz: 300,
    q: 1,
  }),
  minInterval: 0.07,
});
// proposta 18/10: the plate breaking is a crack (a sharp noise burst sweeping
// down) on a lower clang, then a rattle of loose fragments at `rattle.times`.
const BULWARK_PLATE_BREAK_SFX = Object.freeze({
  crack: Object.freeze({
    seconds: 0.14,
    attack: 0.002,
    peak: 0.35,
    fromHz: 3200,
    toHz: 700,
    q: 1.2,
  }),
  body: Object.freeze({
    ...BULWARK_PLATE_HIT_SFX.body,
    hz: 190,
    seconds: 0.22,
  }),
  rattle: Object.freeze({
    seconds: 0.4,
    times: Object.freeze([0.07, 0.12, 0.18, 0.23, 0.3, 0.36]),
    gains: Object.freeze([1, 0.8, 0.9, 0.6, 0.5, 0.35]),
    clickSeconds: 0.006,
    bandHz: 2600,
    q: 3,
    peak: 0.4,
  }),
  minInterval: 0.1,
});
// proposta 18/10: the Caster's 0.5 s telegraph is a quiet, hollow charge — a
// square (odd harmonics only) rising fromHz → toHz, heard through a band on
// its `bandHarmonic`-th harmonic, swelling to `peak` until `release` s
// before the end.
const CASTER_CHARGE_SFX = Object.freeze({
  seconds: 0.45,
  release: 0.04,
  peak: 0.09,
  fromHz: 150,
  toHz: 420,
  bandHarmonic: 3,
  q: 4,
  minInterval: 0.15,
});
// proposta 18/10: the Caster lobbing its shell is a short low "thoomp" (a
// sine drop over a muffled puff), then a soft whistle (a narrow noise band
// gliding down) `whistle.delay` s in; the whole cue pans from the Caster
// toward the landing over `whistle.delay + whistle.seconds`.
const CASTER_LAUNCH_SFX = Object.freeze({
  thoomp: Object.freeze({ fromHz: 160, toHz: 55, peak: 0.22, seconds: 0.16 }),
  puff: Object.freeze({
    seconds: 0.09,
    attack: 0.004,
    peak: 0.16,
    fromHz: 600,
    toHz: 180,
    q: 0.8,
  }),
  whistle: Object.freeze({
    delay: 0.05,
    seconds: 0.5,
    attack: 0.15,
    peak: 0.3,
    fromHz: 2600,
    toHz: 1500,
    q: 9,
  }),
  minInterval: 0.15,
});
// proposta 18/10: a Caster shell landing is a compact thud (a sine drop under
// a short rumble) with a bright amber crack on top: medium level, under a
// medium explosion (sub 0.7) and with no music duck.
const CASTER_IMPACT_SFX = Object.freeze({
  thud: Object.freeze({ fromHz: 120, toHz: 40, peak: 0.4, seconds: 0.24 }),
  rumble: Object.freeze({
    seconds: 0.3,
    attack: 0.006,
    peak: 0.28,
    fromHz: 1100,
    toHz: 200,
    q: 0.8,
  }),
  crack: Object.freeze({
    seconds: 0.07,
    attack: 0.002,
    peak: 0.3,
    fromHz: 4500,
    toHz: 1800,
    q: 1.3,
  }),
  minInterval: 0.12,
});
// proposta 18/10: a Shade dissolving is a quiet shimmer — a narrow noise band
// sweeping between lowHz and highHz (down phasing out, up phasing in) under
// a `flutterHz` tremolo of `flutterDepth`.
const SHADE_PHASE_SFX = Object.freeze({
  seconds: 0.3,
  attack: 0.08,
  peak: 0.3,
  highHz: 6000,
  lowHz: 2800,
  q: 6,
  flutterHz: 22,
  flutterDepth: 0.5,
  minInterval: 0.12,
});
// A layered cue (see _layeredCue): swept noise bands, sine drops/rises,
// struck pings and click trains, each `at` s into the cue.
// Dust's grit: `count` clicks over `seconds`, scattered by the golden ratio
// (deterministic, no RNG), swelling in and out.
const GOLDEN_RATIO_FRACTION = 0.6180339887;
function grainScatter(count, seconds) {
  const times = [];
  const gains = [];
  for (let k = 0; k < count; k += 1) {
    const jitter = ((k + 1) * GOLDEN_RATIO_FRACTION) % 1;
    times.push((seconds * (k + jitter)) / count);
    gains.push((0.4 + 0.6 * jitter) * Math.sin((Math.PI * (k + 0.5)) / count));
  }
  return { times, gains };
}

// Heralds: their own world cues on the ambient bus, panned and distance-mixed
// by the Herald's position, one voice per cue within minInterval. Heat and
// Silence also mark their attacks (Heat's ignite spread, Silence's homing
// shard); Dust's wall raises no event.
// proposta 18/10: Heat arrives as a low furnace roar — two dark noise bands
// swelling up over a slow attack, under a sparse crackle of embers. Dust
// arrives as a dry granular hiss — grit clicks over a thin band sweeping
// slowly up. Silence arrives as a sub drop and a short vacuum: noise with a
// wide band-stop (notch) sweeping down, swelling in and cut short.
const HERALD_SPAWN_SFX = deepFreeze({
  heat: {
    noise: [
      { seconds: 1.2, attack: 0.5, peak: 0.6, fromHz: 70, toHz: 160, q: 0.9 },
      { seconds: 1.1, attack: 0.55, peak: 0.4, fromHz: 160, toHz: 480, q: 0.8 },
    ],
    clicks: [
      {
        seconds: 1.2,
        times: [0.2, 0.33, 0.47, 0.6, 0.76, 0.9, 1.04],
        gains: [0.5, 0.8, 0.6, 1, 0.7, 0.5, 0.35],
        clickSeconds: 0.003,
        bandHz: 2200,
        q: 2,
        peak: 0.3,
      },
    ],
    minInterval: 0.5,
  },
  dust: {
    noise: [
      { seconds: 1.4, attack: 0.5, peak: 0.14, fromHz: 1300, toHz: 4000, q: 2 },
    ],
    clicks: [
      {
        seconds: 1.4,
        ...grainScatter(36, 1.4),
        clickSeconds: 0.002,
        bandHz: 3400,
        q: 1.2,
        peak: 0.35,
      },
    ],
    minInterval: 0.5,
  },
  silence: {
    tones: [{ fromHz: 95, toHz: 28, peak: 0.22, seconds: 0.9 }],
    noise: [
      {
        type: 'notch',
        seconds: 0.45,
        attack: 0.3,
        peak: 0.12,
        fromHz: 5000,
        toHz: 350,
        q: 0.5,
      },
    ],
    minInterval: 0.5,
  },
});
// proposta 18/10: Heat igniting the rocks is a short furnace flare (a noise
// band whooshing up under a crackle); Silence's shard leaves with a smaller
// vacuum over a soft low drop.
const HERALD_ATTACK_SFX = deepFreeze({
  heat: {
    noise: [
      {
        seconds: 0.4,
        attack: 0.06,
        peak: 0.24,
        fromHz: 240,
        toHz: 1200,
        q: 0.8,
      },
    ],
    clicks: [
      {
        seconds: 0.35,
        times: [0.04, 0.09, 0.13, 0.2, 0.27],
        gains: [1, 0.7, 0.85, 0.5, 0.3],
        clickSeconds: 0.003,
        bandHz: 3000,
        q: 2,
        peak: 0.3,
      },
    ],
    minInterval: 0.3,
  },
  silence: {
    tones: [{ fromHz: 70, toHz: 40, peak: 0.06, seconds: 0.15 }],
    noise: [
      {
        type: 'notch',
        seconds: 0.22,
        attack: 0.14,
        peak: 0.06,
        fromHz: 4000,
        toHz: 700,
        q: 0.6,
      },
    ],
    minInterval: 0.3,
  },
});
// proposta 18/10: a Scatter Coil bolt bursting is a compact amber pop — a
// quick sine drop and a mid noise puff under a short crackle; quiet, at most
// one every minInterval s (bolts burst in volleys).
const FLAK_BURST_SFX = deepFreeze({
  tones: [{ fromHz: 520, toHz: 170, peak: 0.07, seconds: 0.06 }],
  noise: [
    { seconds: 0.07, attack: 0.003, peak: 0.06, fromHz: 1800, toHz: 700, q: 1 },
  ],
  clicks: [
    {
      seconds: 0.1,
      times: [0, 0.018, 0.034, 0.055, 0.075],
      gains: [1, 0.6, 0.8, 0.45, 0.3],
      clickSeconds: 0.002,
      bandHz: 2800,
      q: 1.8,
      peak: 0.2,
    },
  ],
  minInterval: 0.06,
});
// proposta 18/10: a Leech eating is a wet, very quiet gulp — a sine dropping
// then a little bloop back up, over a narrow wet band.
const LEECH_ATE_SFX = deepFreeze({
  tones: [
    { fromHz: 300, toHz: 130, peak: 0.04, seconds: 0.07 },
    { at: 0.06, fromHz: 140, toHz: 220, peak: 0.025, seconds: 0.05 },
  ],
  noise: [
    { seconds: 0.08, attack: 0.01, peak: 0.03, fromHz: 700, toHz: 350, q: 4 },
  ],
  minInterval: 0.08,
});
// proposta 18/10: a Leech bursting is a bubbling release — rising sine
// bubbles over a wet noise gush — then a bright sprinkle of pings as the
// orbs scatter.
const LEECH_BURST_SFX = deepFreeze({
  tones: [
    [0, 320],
    [0.035, 410],
    [0.07, 280],
    [0.11, 480],
    [0.15, 360],
    [0.2, 520],
  ].map(([at, fromHz]) => ({
    at,
    fromHz,
    toHz: fromHz * 1.9,
    peak: 0.06,
    seconds: 0.05,
  })),
  noise: [
    { seconds: 0.25, attack: 0.01, peak: 0.08, fromHz: 900, toHz: 300, q: 1.5 },
  ],
  strikes: [
    [0.08, 2900],
    [0.13, 3600],
    [0.19, 3200],
    [0.26, 4300],
  ].map(([at, hz]) => ({
    at,
    type: 'sine',
    hz,
    partials: [
      [1, 1],
      [2.76, 0.3],
    ],
    peak: 0.035,
    seconds: 0.12,
  })),
  minInterval: 0.15,
});

/**
 * Machine cues: enemy-machine world sounds and the enemy telegraph, on the ambient bus.
 * @param {import('../SFXBus.js').SfxKit} sfx - the bus toolkit (live handles,
 *   routing and the shared synth primitives); never the bus itself.
 */
export function createMachineCues(sfx) {
  const lastMachineCueTime = {
    ramSpinUp: -Infinity,
    ramCharge: -Infinity,
    huskRelease: -Infinity,
    weaverTether: -Infinity,
    plateHit: -Infinity,
    plateBreak: -Infinity,
    casterCharge: -Infinity,
    casterLaunch: -Infinity,
    casterImpact: -Infinity,
    shadePhase: -Infinity,
    heraldSpawn: -Infinity,
    heraldAttack: -Infinity,
    flakBurst: -Infinity,
    leechAte: -Infinity,
    leechBurst: -Infinity,
  };

  /**
   * Enemy telegraph: short rising tone (an attack is coming), panned and
   * distance-mixed.
   * @param {{pan?: number, distance?: {gain: number, cutoff: number}}} [options]
   */
  function playEnemyTelegraph({ pan = 0, distance = null } = {}) {
    sfx.trackPerformance('playEnemyTelegraph');

    sfx.safePlay(() => {
      const destination = sfx.ambientInput(pan, distance);
      if (!destination) return;

      const now = sfx.context.currentTime;
      const osc = sfx.context.createOscillator();
      const gain = sfx.context.createGain();
      osc.connect(gain);
      gain.connect(destination);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(1040, now + 0.16);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.09, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.start(now);
      osc.stop(now + 0.19);
    });
  }

  // ===========================================================================
  // Support machines (world cues → ambient bus, panned + distance-mixed).
  // ===========================================================================

  /**
   * Claims the machine cue `key` at `now` unless it played within
   * `minInterval` s.
   * @private
   */
  function claimMachineCue(key, minInterval, now) {
    if (now - lastMachineCueTime[key] < minInterval) return false;
    lastMachineCueTime[key] = now;
    return true;
  }

  /**
   * Ram windup (RAM_SPINUP_SFX): an FM'd saw spinning up over a ratchet whose
   * clicks speed up and grow toward the charge.
   * @param {{pan?: number, distance?: {gain: number, cutoff: number}}} [options]
   */
  function playRamSpinUp({ pan = 0, distance = null } = {}) {
    sfx.trackPerformance('playRamSpinUp');

    sfx.safePlay(() => {
      const now = sfx.context.currentTime;
      const spin = RAM_SPINUP_SFX;
      if (!claimMachineCue('ramSpinUp', spin.minInterval, now)) return;
      const destination = sfx.ambientInput(pan, distance);
      if (!destination) return;

      const end = now + spin.seconds;
      const carrier = sfx.context.createOscillator();
      const modulator = sfx.context.createOscillator();
      const depth = sfx.context.createGain();
      const lowpass = sfx.context.createBiquadFilter();
      const gain = sfx.context.createGain();
      carrier.type = 'sawtooth';
      carrier.frequency.setValueAtTime(spin.fromHz, now);
      carrier.frequency.exponentialRampToValueAtTime(spin.toHz, end);
      modulator.type = 'sine';
      modulator.frequency.setValueAtTime(spin.fromHz * spin.fmRatio, now);
      modulator.frequency.exponentialRampToValueAtTime(
        spin.toHz * spin.fmRatio,
        end
      );
      depth.gain.setValueAtTime(spin.fromHz * spin.fmDepth, now);
      depth.gain.exponentialRampToValueAtTime(spin.toHz * spin.fmDepth, end);
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(spin.lowpassHz, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(spin.peak, end - spin.release);
      gain.gain.exponentialRampToValueAtTime(0.001, end);
      modulator.connect(depth);
      depth.connect(carrier.frequency);
      carrier.connect(lowpass);
      lowpass.connect(gain);
      gain.connect(destination);
      carrier.start(now);
      modulator.start(now);
      carrier.stop(end + 0.02);
      modulator.stop(end + 0.02);

      const { clicks } = spin;
      const times = [];
      const gains = [];
      for (let k = 0; k < clicks.count; k += 1) {
        times.push(spin.seconds * Math.sqrt(k / clicks.count));
        gains.push(
          clicks.firstGain + ((1 - clicks.firstGain) * k) / (clicks.count - 1)
        );
      }
      sfx.clickTrain(destination, now, {
        ...clicks,
        seconds: spin.seconds,
        times,
        gains,
      });
    });
  }

  /** Ram charge (RAM_CHARGE_SFX): a low whoosh over a soft sub. */
  function playRamCharge({ pan = 0, distance = null } = {}) {
    sfx.trackPerformance('playRamCharge');

    sfx.safePlay(() => {
      const now = sfx.context.currentTime;
      if (!claimMachineCue('ramCharge', RAM_CHARGE_SFX.minInterval, now))
        return;
      const destination = sfx.ambientInput(pan, distance);
      if (!destination) return;

      sfx.maneuverNoise(destination, now, RAM_CHARGE_SFX);
      sfx.maneuverTone(destination, now, RAM_CHARGE_SFX.sub);
    });
  }

  /** Husk death (HUSK_RELEASE_SFX): a hiss, then one pop per released drone. */
  function playHuskRelease({ pan = 0, distance = null } = {}) {
    sfx.trackPerformance('playHuskRelease');

    sfx.safePlay(() => {
      const now = sfx.context.currentTime;
      const { hiss, pops, minInterval } = HUSK_RELEASE_SFX;
      if (!claimMachineCue('huskRelease', minInterval, now)) return;
      const destination = sfx.ambientInput(pan, distance);
      if (!destination) return;

      sfx.maneuverNoise(destination, now, hiss);
      pops.at.forEach((at, i) => {
        sfx.maneuverTone(destination, now + at, {
          fromHz: pops.fromHz[i],
          toHz: pops.fromHz[i] * pops.drop,
          peak: pops.peak,
          seconds: pops.seconds,
        });
      });
    });
  }

  /** Weaver lays a Tether (WEAVER_TETHER_SFX): two pings, the second lower. */
  function playWeaverTether({ pan = 0, distance = null } = {}) {
    sfx.trackPerformance('playWeaverTether');

    sfx.safePlay(() => {
      const now = sfx.context.currentTime;
      const { hz, gap, strike, minInterval } = WEAVER_TETHER_SFX;
      if (!claimMachineCue('weaverTether', minInterval, now)) return;
      const destination = sfx.ambientInput(pan, distance);
      if (!destination) return;

      hz.forEach((frequency, i) => {
        sfx.strike(destination, now + i * gap, { ...strike, hz: frequency });
      });
    });
  }

  /** Hit on the Bulwark's plate (BULWARK_PLATE_HIT_SFX): a dull clang. */
  function playBulwarkPlateHit({ pan = 0, distance = null } = {}) {
    sfx.trackPerformance('playBulwarkPlateHit');

    sfx.safePlay(() => {
      const now = sfx.context.currentTime;
      const { body, knock, minInterval } = BULWARK_PLATE_HIT_SFX;
      if (!claimMachineCue('plateHit', minInterval, now)) return;
      const destination = sfx.ambientInput(pan, distance);
      if (!destination) return;

      sfx.strike(destination, now, body);
      sfx.maneuverNoise(destination, now, knock);
    });
  }

  /** The Bulwark's plate breaks (BULWARK_PLATE_BREAK_SFX): crack + rattle. */
  function playBulwarkPlateBreak({ pan = 0, distance = null } = {}) {
    sfx.trackPerformance('playBulwarkPlateBreak');

    sfx.safePlay(() => {
      const now = sfx.context.currentTime;
      const { crack, body, rattle, minInterval } = BULWARK_PLATE_BREAK_SFX;
      if (!claimMachineCue('plateBreak', minInterval, now)) return;
      const destination = sfx.ambientInput(pan, distance);
      if (!destination) return;

      sfx.maneuverNoise(destination, now, crack);
      sfx.strike(destination, now, body);
      sfx.clickTrain(destination, now, rattle);
    });
  }

  /**
   * The Caster's telegraph (CASTER_CHARGE_SFX): a hollow square rising
   * through a band on its third harmonic.
   */
  function playCasterCharge({ pan = 0, distance = null } = {}) {
    sfx.trackPerformance('playCasterCharge');

    sfx.safePlay(() => {
      const now = sfx.context.currentTime;
      const charge = CASTER_CHARGE_SFX;
      if (!claimMachineCue('casterCharge', charge.minInterval, now)) return;
      const destination = sfx.ambientInput(pan, distance);
      if (!destination) return;

      const end = now + charge.seconds;
      const osc = sfx.context.createOscillator();
      const band = sfx.context.createBiquadFilter();
      const gain = sfx.context.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(charge.fromHz, now);
      osc.frequency.exponentialRampToValueAtTime(charge.toHz, end);
      band.type = 'bandpass';
      band.frequency.setValueAtTime(charge.fromHz * charge.bandHarmonic, now);
      band.frequency.exponentialRampToValueAtTime(
        charge.toHz * charge.bandHarmonic,
        end
      );
      band.Q.setValueAtTime(charge.q, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(charge.peak, end - charge.release);
      gain.gain.exponentialRampToValueAtTime(0.001, end);
      osc.connect(band);
      band.connect(gain);
      gain.connect(destination);
      osc.start(now);
      osc.stop(end + 0.02);
    });
  }

  /**
   * The Caster lobs a shell (CASTER_LAUNCH_SFX): a thoomp, then a whistle,
   * panning from `pan` (the Caster) to `toPan` (the landing).
   * @param {{pan?: number, toPan?: number, distance?: {gain: number, cutoff: number}}} [options]
   */
  function playCasterLaunch({ pan = 0, toPan = pan, distance = null } = {}) {
    sfx.trackPerformance('playCasterLaunch');

    sfx.safePlay(() => {
      const now = sfx.context.currentTime;
      const { thoomp, puff, whistle, minInterval } = CASTER_LAUNCH_SFX;
      if (!claimMachineCue('casterLaunch', minInterval, now)) return;
      const destination = sfx.ambientInput(0, distance);
      if (!destination) return;

      const panner = sfx.context.createStereoPanner();
      panner.pan.value = pan;
      panner.pan.setValueAtTime(pan, now);
      panner.pan.linearRampToValueAtTime(
        toPan,
        now + whistle.delay + whistle.seconds
      );
      panner.connect(destination);
      sfx.maneuverTone(panner, now, thoomp);
      sfx.maneuverNoise(panner, now, puff);
      sfx.maneuverNoise(panner, now + whistle.delay, whistle);
    });
  }

  /**
   * A Caster shell lands (CASTER_IMPACT_SFX): a thud under a rumble and an
   * amber crack.
   */
  function playCasterImpact({ pan = 0, distance = null } = {}) {
    sfx.trackPerformance('playCasterImpact');

    sfx.safePlay(() => {
      const now = sfx.context.currentTime;
      const { thud, rumble, crack, minInterval } = CASTER_IMPACT_SFX;
      if (!claimMachineCue('casterImpact', minInterval, now)) return;
      const destination = sfx.ambientInput(pan, distance);
      if (!destination) return;

      sfx.maneuverTone(destination, now, thud);
      sfx.maneuverNoise(destination, now, rumble);
      sfx.maneuverNoise(destination, now, crack);
    });
  }

  /**
   * A Shade dissolves (SHADE_PHASE_SFX): a fluttering high shimmer sweeping
   * down when it phases `out`, up when it phases back in.
   * @param {{out?: boolean, pan?: number, distance?: {gain: number, cutoff: number}}} [options]
   */
  function playShadePhase({ out = true, pan = 0, distance = null } = {}) {
    sfx.trackPerformance('playShadePhase');

    sfx.safePlay(() => {
      const now = sfx.context.currentTime;
      const phase = SHADE_PHASE_SFX;
      if (!claimMachineCue('shadePhase', phase.minInterval, now)) return;
      const destination = sfx.ambientInput(pan, distance);
      if (!destination) return;

      const flutter = sfx.context.createGain();
      flutter.gain.value = 1 - phase.flutterDepth;
      const lfo = sfx.context.createOscillator();
      const depth = sfx.context.createGain();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(phase.flutterHz, now);
      depth.gain.value = phase.flutterDepth;
      lfo.connect(depth);
      depth.connect(flutter.gain);
      flutter.connect(destination);
      lfo.start(now);
      lfo.stop(now + phase.seconds + 0.02);
      sfx.maneuverNoise(flutter, now, {
        ...phase,
        fromHz: out ? phase.highHz : phase.lowHz,
        toHz: out ? phase.lowHz : phase.highHz,
      });
    });
  }

  /**
   * A Herald arrives (HERALD_SPAWN_SFX): Heat roars low like a furnace, Dust
   * hisses dry grains through a slow sweep, Silence drops a sub under a short
   * vacuum.
   * @param {{kind?: string, pan?: number, distance?: {gain: number, cutoff: number}}} [options]
   */
  function playHeraldSpawn({ kind = 'dust', pan = 0, distance = null } = {}) {
    sfx.trackPerformance('playHeraldSpawn');
    playLayeredCue(
      'heraldSpawn',
      HERALD_SPAWN_SFX[kind] ?? HERALD_SPAWN_SFX.dust,
      pan,
      distance
    );
  }

  /**
   * A Herald attacks (HERALD_ATTACK_SFX): Heat's ignite flares, Silence's
   * shard leaves with a vacuum. Dust has none.
   * @param {{kind?: string, pan?: number, distance?: {gain: number, cutoff: number}}} [options]
   */
  function playHeraldAttack({ kind = 'dust', pan = 0, distance = null } = {}) {
    sfx.trackPerformance('playHeraldAttack');
    const cue = HERALD_ATTACK_SFX[kind];
    if (cue) playLayeredCue('heraldAttack', cue, pan, distance);
  }

  /** A Scatter Coil bolt bursts (FLAK_BURST_SFX): a compact amber pop. */
  function playFlakBurst({ pan = 0, distance = null } = {}) {
    sfx.trackPerformance('playFlakBurst');
    playLayeredCue('flakBurst', FLAK_BURST_SFX, pan, distance);
  }

  /** A Leech eats an orb (LEECH_ATE_SFX): a wet, very quiet gulp. */
  function playLeechAte({ pan = 0, distance = null } = {}) {
    sfx.trackPerformance('playLeechAte');
    playLayeredCue('leechAte', LEECH_ATE_SFX, pan, distance);
  }

  /** A Leech bursts (LEECH_BURST_SFX): bubbles, then a bright sprinkle. */
  function playLeechBurst({ pan = 0, distance = null } = {}) {
    sfx.trackPerformance('playLeechBurst');
    playLayeredCue('leechBurst', LEECH_BURST_SFX, pan, distance);
  }

  /**
   * Claim the machine cue `key` and play `cue`'s layers, each `at` s in:
   * swept noise bands, sine drops/rises, struck pings and click trains, into
   * the ambient bus (panned, distance-mixed).
   * @private
   */
  function playLayeredCue(key, cue, pan, distance) {
    sfx.safePlay(() => {
      const now = sfx.context.currentTime;
      if (!claimMachineCue(key, cue.minInterval, now)) return;
      const destination = sfx.ambientInput(pan, distance);
      if (!destination) return;

      const { noise = [], tones = [], strikes = [], clicks = [] } = cue;
      noise.forEach(({ at = 0, ...layer }) =>
        sfx.maneuverNoise(destination, now + at, layer)
      );
      tones.forEach(({ at = 0, ...layer }) =>
        sfx.maneuverTone(destination, now + at, layer)
      );
      strikes.forEach(({ at = 0, ...layer }) =>
        sfx.strike(destination, now + at, layer)
      );
      clicks.forEach((layer) => sfx.clickTrain(destination, now, layer));
    });
  }

  return {
    playEnemyTelegraph,
    playRamSpinUp,
    playRamCharge,
    playHuskRelease,
    playWeaverTether,
    playBulwarkPlateHit,
    playBulwarkPlateBreak,
    playCasterCharge,
    playCasterLaunch,
    playCasterImpact,
    playShadePhase,
    playHeraldSpawn,
    playHeraldAttack,
    playFlakBurst,
    playLeechAte,
    playLeechBurst,
  };
}
