/**
 * Ship engine sound: flight state in, Web Audio graph out. The owner tuned it
 * on the engine bench (the git-ignored src/exported-assets/engine-bench/);
 * shipEngine.js drives it from the real ship. Same logic as the bench, plus
 * stop() for a pause.
 *
 * No DOM and no timers: the owner calls `set()` with the flight state and `update(dt)` once per frame.
 *
 *   const engine = createEngineModel({ context, destination, buffers, random });
 *   // random() returns [0, 1): pass a seeded stream, never Math.random
 *   engine.set({ thrust, lateral, speed, tier });   // any subset, any time
 *   engine.update(dt);                              // every frame
 *   engine.shot({ recoil }); engine.dash(); engine.brake(); engine.stop();
 *
 * Inputs (all clamped):
 *   thrust  0..1   main engine
 *   lateral -1..1  side thruster: sign = the side that fires (left -, right +), size = how hard
 *   speed   0..1   speed / top speed; near top speed the engine stops "pushing" and loses treble
 *   tier    0..3   engine upgrades: each tier adds a layer (sub rumble, turbine harmonic, crackle)
 *
 * buffers = {
 *   turbine, roar, sub, harmonic, crackle: { buffer, loopStart, loopEnd }   seamless loops
 *   ignition, cutoff, dash, brake, puff:   AudioBuffer[]                     one-shot variations
 * }
 */

// Every loop file is loudness-matched, so these numbers are the whole balance of the bed.
const MIX = {
  low: 0.75,
  turbine: 0.9,
  roar: 0.65,
  sub: 0.75,
  harmonic: 0.32,
  crackle: 0.3,
};
const ONESHOT = {
  ignition: 0.7,
  cutoff: 0.55,
  dash: 0.9,
  brake: 0.8,
  puff: 0.42,
};
const TIER_LAYER = { 1: 'sub', 2: 'harmonic', 3: 'crackle' };
const BASE_POWER = MIX.turbine ** 2 + MIX.roar ** 2;

const SPOOL_UP = 0.15; // s, turbine spin-up time constant (0 -> 90 % in ~0.35 s)
const SPOOL_DOWN = 0.45; // s, wind-down after release (~1 s to silence)
const TURBINE_RATE = [0.86, 1.12]; // narrow pitch range across the spool
const LOW_VOICE_RATE = 0.5; // idle voice: the same turbine an octave down, filtered (consonant while crossfading)
const DUCK = 0.708; // -3 dB per shot
const DUCK_HOLD = 0.12; // s
const FATIGUE_START = 5; // s of continuous thrust before the anti-fatigue low-pass closes
const FATIGUE_FULL = 7;
const PITCH_JITTER = 0.05; // one-shots, +-5 %
const PUFF_PAN = 0.55;
const STOP_FADE = 0.03; // s, time constant of the bed's fade on stop()
const ONESHOT_STOP = 0.03; // s, a sounding one-shot's fade on stop(), as the loops' crossfade

const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const finite = (v, fallback) => (Number.isFinite(v) ? v : fallback);

export function createEngineModel({
  context: ctx,
  destination,
  buffers = {},
  random,
}) {
  const out = ctx.createGain();
  out.connect(destination);

  // bed: loops -> tier compensation -> tone low-pass -> duck -> out
  const duck = ctx.createGain();
  duck.connect(out);
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 16000;
  tone.Q.value = 0.6;
  tone.connect(duck);
  const bed = ctx.createGain();
  bed.connect(tone);

  // one-shots skip the duck and the tone filter
  const fx = ctx.createGain();
  fx.connect(out);

  const voices = {};
  function voice(name, layer, filter) {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(bed);
    let input = gain;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type;
      f.frequency.value = filter.frequency;
      f.Q.value = filter.Q ?? 0.7;
      f.connect(gain);
      input = f;
    }
    voices[name] = {
      name,
      layer,
      gain,
      input,
      src: null,
      srcGain: null,
      rate: 1,
    };
  }
  voice('low', 'turbine', { type: 'lowpass', frequency: 1100 });
  voice('turbine', 'turbine');
  voice('roar', 'roar');
  voice('sub', 'sub', { type: 'lowpass', frequency: 220 });
  voice('harmonic', 'harmonic', { type: 'highpass', frequency: 1500 });
  voice('crackle', 'crackle', { type: 'highpass', frequency: 400 });

  function startSource(v, sound, fade) {
    const now = ctx.currentTime;
    if (v.src) {
      const { src, srcGain } = v;
      srcGain.gain.setTargetAtTime(0, now, fade / 3);
      src.stop(now + fade * 2);
      src.onended = () => {
        src.disconnect();
        srcGain.disconnect();
      };
      v.src = null;
    }
    if (!sound?.buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = sound.buffer;
    src.loop = true;
    const start = finite(sound.loopStart, 0);
    const end = finite(sound.loopEnd, sound.buffer.duration);
    src.loopStart = start;
    src.loopEnd = end;
    src.playbackRate.value = v.rate;
    const srcGain = ctx.createGain();
    srcGain.gain.value = fade ? 0 : 1;
    if (fade) srcGain.gain.setTargetAtTime(1, now, fade / 3);
    src.connect(srcGain).connect(v.input);
    // random phase so two voices on one buffer never line up
    src.start(now, start + random() * (end - start));
    v.src = src;
    v.srcGain = srcGain;
  }

  const oneshots = {};
  const lastPick = {};
  const sounding = new Set(); // { src, g } of the one-shots started or scheduled, until they end
  function setSound(layer, sound) {
    if (layer in ONESHOT) {
      oneshots[layer] = Array.isArray(sound)
        ? sound.filter(Boolean)
        : sound
          ? [sound]
          : [];
      lastPick[layer] = -1;
      return;
    }
    for (const v of Object.values(voices))
      if (v.layer === layer) startSource(v, sound, 0.08);
  }
  for (const [layer, sound] of Object.entries(buffers)) setSound(layer, sound);

  function play(kind, { gain = 1, pan = 0, when = ctx.currentTime } = {}) {
    const list = oneshots[kind];
    if (!list?.length) return;
    let i = Math.floor(random() * list.length) % list.length;
    if (list.length > 1 && i === lastPick[kind]) {
      i = (i + 1 + Math.floor(random() * (list.length - 1))) % list.length;
    }
    lastPick[kind] = i;
    const src = ctx.createBufferSource();
    src.buffer = list[i];
    src.playbackRate.value = 1 + (random() * 2 - 1) * PITCH_JITTER;
    const g = ctx.createGain();
    g.gain.value = ONESHOT[kind] * clamp(gain, 0, 2);
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    src.connect(g).connect(p).connect(fx);
    const oneshot = { src, g };
    sounding.add(oneshot);
    src.onended = () => {
      sounding.delete(oneshot);
      src.disconnect();
      g.disconnect();
      p.disconnect();
    };
    src.start(Math.max(when, ctx.currentTime));
  }

  /** Fade out and stop every one-shot still sounding; one scheduled past the fade never plays. */
  function silenceOneshots() {
    const now = ctx.currentTime;
    for (const { src, g } of sounding) {
      g.gain.setTargetAtTime(0, now, ONESHOT_STOP / 3);
      src.stop(now + ONESHOT_STOP * 2);
    }
    sounding.clear();
  }

  const input = { thrust: 0, lateral: 0, speed: 0, tier: 0 };
  const st = {
    spool: 0,
    thrustS: 0,
    push: 0,
    fatigueT: 0,
    fatigue: 0,
    gates: [0, 0, 0, 0],
    on: false,
    lastIgnition: -1,
    latSide: 0,
    puffT: 0,
    flutter: 1,
  };
  const target = { gains: {}, rates: {}, cutoff: 16000, bed: 1 };

  function set(next = {}) {
    if ('thrust' in next) input.thrust = clamp(finite(next.thrust, 0));
    if ('lateral' in next)
      input.lateral = clamp(finite(next.lateral, 0), -1, 1);
    if ('speed' in next) input.speed = clamp(finite(next.speed, 0));
    if ('tier' in next)
      input.tier = Math.round(clamp(finite(next.tier, 0), 0, 3));
  }

  const lastSet = new WeakMap();
  function setParam(param, value, tau = 0.03) {
    const last = lastSet.get(param);
    if (
      last !== undefined &&
      Math.abs(last - value) < 1e-4 * Math.max(1, Math.abs(value))
    )
      return;
    lastSet.set(param, value);
    param.setTargetAtTime(value, ctx.currentTime, tau);
  }

  function update(dt) {
    dt = clamp(finite(dt, 0), 0, 0.1);
    if (!dt) return;
    const now = ctx.currentTime;
    const k = (tau) => 1 - Math.exp(-dt / tau);
    const { thrust, lateral, speed, tier } = input;

    // ignition / cut-off on the engine's edges
    const on = thrust > 0.04;
    if (on && !st.on && st.spool < 0.35 && now - st.lastIgnition > 0.25) {
      play('ignition');
      st.lastIgnition = now;
    }
    if (!on && st.on && st.spool > 0.3)
      play('cutoff', { gain: 0.5 + 0.5 * st.spool });
    st.on = on;

    st.spool +=
      (thrust - st.spool) * k(thrust > st.spool ? SPOOL_UP : SPOOL_DOWN);
    st.thrustS += (thrust - st.thrustS) * k(thrust > st.thrustS ? 0.06 : 0.15);
    st.push += (thrust * (1 - smoothstep(0.8, 1, speed)) - st.push) * k(0.35);
    st.fatigueT =
      thrust > 0.5 ? st.fatigueT + dt : Math.max(0, st.fatigueT - dt * 3);
    st.fatigue = smoothstep(FATIGUE_START, FATIGUE_FULL, st.fatigueT);
    for (let t = 1; t <= 3; t++)
      st.gates[t] += ((tier >= t ? 1 : 0) - st.gates[t]) * k(0.25);
    st.flutter += (0.7 + 0.3 * random() - st.flutter) * k(0.04);

    // side thrusters: a puff on each press, then a train of puffs while held
    const lat = Math.abs(lateral);
    const side = lat > 0.05 ? Math.sign(lateral) : 0;
    if (side) {
      st.puffT -= dt;
      if (side !== st.latSide || st.puffT <= 0) {
        play('puff', { gain: 0.45 + 0.55 * lat, pan: side * PUFF_PAN });
        st.puffT = (0.2 - 0.08 * lat) * (0.85 + 0.3 * random());
      }
    }
    st.latSide = side;

    const { spool, thrustS, push, fatigue, gates } = st;
    const A = smoothstep(0, 0.12, spool);
    const w = clamp((spool - 0.1) / 0.55) * (Math.PI / 2);
    const level = 0.55 + 0.45 * spool;
    const turbineRate =
      TURBINE_RATE[0] + (TURBINE_RATE[1] - TURBINE_RATE[0]) * spool;
    const roarW = clamp((thrustS - 0.6) / 0.4) * (Math.PI / 2);
    const crackleW = clamp((thrustS - 0.45) / 0.55) * (Math.PI / 2);
    const g = target.gains;
    const r = target.rates;
    g.low = MIX.low * A * level * Math.cos(w);
    g.turbine = MIX.turbine * A * level * Math.sin(w);
    g.roar = MIX.roar * A * Math.sin(roarW);
    g.sub = MIX.sub * gates[1] * A * (0.5 + 0.5 * thrustS);
    g.harmonic = MIX.harmonic * gates[2] * A * spool ** 1.5;
    g.crackle = MIX.crackle * gates[3] * A * Math.sin(crackleW) * st.flutter;
    r.turbine = turbineRate;
    r.low = turbineRate * LOW_VOICE_RATE;
    r.roar = 0.96 + 0.08 * thrustS;
    r.sub = 0.92 + 0.14 * spool;
    r.harmonic = turbineRate;
    r.crackle = 0.95 + 0.1 * thrustS;

    // upgrades add layers, not volume
    let added = 0;
    for (let t = 1; t <= 3; t++) added += gates[t] * MIX[TIER_LAYER[t]] ** 2;
    target.bed =
      Math.sqrt(BASE_POWER / (BASE_POWER + added)) *
      (0.8 + 0.2 * push) *
      (1 - 0.12 * fatigue);
    target.cutoff = (2600 + 13400 * push ** 0.8) * (1 - 0.45 * fatigue);

    for (const v of Object.values(voices)) {
      setParam(v.gain.gain, g[v.name]);
      v.rate = r[v.name];
      if (v.src) setParam(v.src.playbackRate, v.rate, 0.04);
    }
    setParam(bed.gain, target.bed, 0.05);
    setParam(tone.frequency, target.cutoff, 0.06);
  }

  function shot({ recoil = 1 } = {}) {
    const now = ctx.currentTime;
    const d = duck.gain;
    d.cancelScheduledValues(now);
    d.setValueAtTime(d.value, now);
    d.linearRampToValueAtTime(DUCK, now + 0.008);
    d.setValueAtTime(DUCK, now + DUCK_HOLD);
    d.linearRampToValueAtTime(1, now + DUCK_HOLD + 0.08);
    // the auto-stabilizer answers the recoil with two or three small puffs
    if (recoil > 0) {
      const n = random() < 0.5 ? 2 : 3;
      let t = now + 0.03 + random() * 0.02;
      for (let i = 0; i < n; i++) {
        play('puff', {
          gain: 0.3 * clamp(recoil),
          pan: (random() * 2 - 1) * 0.35,
          when: t,
        });
        t += 0.045 + random() * 0.04;
      }
    }
  }

  /**
   * At rest at once (pause, death, menu): the bed and the one-shots still
   * sounding or scheduled fade out, no cut-off plays; the tier stays.
   */
  function stop() {
    input.thrust = 0;
    input.lateral = 0;
    Object.assign(st, {
      spool: 0,
      thrustS: 0,
      push: 0,
      fatigueT: 0,
      fatigue: 0,
      on: false,
      latSide: 0,
      puffT: 0,
    });
    for (const v of Object.values(voices)) setParam(v.gain.gain, 0, STOP_FADE);
    silenceOneshots();
  }

  return {
    set,
    update,
    shot,
    stop,
    dash: () => play('dash'),
    brake: () => play('brake'),
    /** Master level of the engine and its one-shots (linear). */
    setVolume: (v) => setParam(out.gain, clamp(finite(v, 1), 0, 2), 0.02),
    /** Numbers for meters and checks: smoothed state, targets and the live AudioParam values. */
    snapshot() {
      const live = {
        bed: bed.gain.value,
        cutoff: tone.frequency.value,
        duck: duck.gain.value,
        out: out.gain.value,
      };
      for (const v of Object.values(voices)) {
        live[`gain.${v.name}`] = v.gain.gain.value;
        if (v.src) live[`rate.${v.name}`] = v.src.playbackRate.value;
      }
      return {
        input: { ...input },
        spool: st.spool,
        push: st.push,
        fatigue: st.fatigue,
        gates: st.gates.slice(1),
        target: {
          gains: { ...target.gains },
          rates: { ...target.rates },
          cutoff: target.cutoff,
          bed: target.bed,
        },
        live,
      };
    },
    dispose() {
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      for (const v of Object.values(voices)) startSource(v, null, 0.05);
      silenceOneshots();
    },
  };
}
