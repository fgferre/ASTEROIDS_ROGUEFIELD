import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import AudioSystem from '../../../src/modules/AudioSystem.js';
import SFXBus from '../../../src/modules/audio/SFXBus.js';
import PlayerSystem from '../../../src/modules/PlayerSystem.js';
import {
  engineTier,
  speedShare,
} from '../../../src/modules/audio/shipEngine.js';
import { EventBus } from '../../../src/core/EventBus.js';
import RandomService from '../../../src/core/RandomService.js';
import {
  createAudioContextStub,
  createGainStub,
  createSettingsStub,
} from '../../__helpers__/stubs.js';

// The ship's engine (shipEngine.js + engineModel.js): the bench picks played
// from the ship's flight events, on the protected bus; the procedural loop
// while the files are not in.

const MANIFEST = JSON.parse(
  readFileSync(
    new URL('../../../src/public/audio/engine/manifest.json', import.meta.url)
  )
);
const STEP = 1 / 60;

/** An AudioParam that jumps to every value it is set to, and records the calls. */
function param(value) {
  const p = { value };
  [
    'setTargetAtTime',
    'setValueAtTime',
    'linearRampToValueAtTime',
    'exponentialRampToValueAtTime',
  ].forEach((method) => {
    p[method] = vi.fn((next) => {
      p.value = next;
    });
  });
  p.cancelScheduledValues = vi.fn();
  return p;
}

/** Stub context nodes the engine model can drive; its sources record what they play. */
function makeContext() {
  const context = createAudioContextStub({ state: 'running' });
  const node = (fields) => ({
    connect: vi.fn((next) => next),
    disconnect: vi.fn(),
    ...fields,
  });
  const gains = [];
  const sources = [];
  context.createGain = vi.fn(() => {
    const gain = node({ gain: param(1) });
    gains.push(gain);
    return gain;
  });
  context.createBiquadFilter = vi.fn(() =>
    node({
      type: 'lowpass',
      frequency: param(350),
      Q: param(1),
      gain: param(0),
    })
  );
  context.createStereoPanner = vi.fn(() => node({ pan: param(0) }));
  context.createBufferSource = vi.fn(() => {
    const source = node({
      buffer: null,
      playbackRate: param(1),
      start: vi.fn(),
      stop: vi.fn(),
    });
    sources.push(source);
    return source;
  });
  context.decodeAudioData = vi.fn(async (file) => ({
    path: file.path,
    duration: 2.5,
  }));
  return { context, gains, sources };
}

/** A fetch for `manifest` whose files resolve to their own path. */
function fetchFor(manifest) {
  return async (path) =>
    path === 'manifest.json'
      ? { json: async () => manifest }
      : { arrayBuffer: async () => ({ path }) };
}

/** The SFX bus on `context`, its resume gate playing at once. */
function initBus(context) {
  const random = new RandomService('engine:test');
  const scopes = {
    base: random,
    families: { impact: random.fork('impact') },
  };
  const bus = new SFXBus();
  bus.init(context, {
    effectsDuckGain: createGainStub(),
    effectsGain: createGainStub(),
    getContext: () => context,
    getRandomScopes: () => scopes,
    safePlay: (fn) => fn(),
    randomScopes: scopes,
  });
  return { bus, random };
}

// The card each thruster's visual level comes from (PlayerThrusters).
const LEVEL_OF = { main: 'thruster', aux: 'braking', side: 'rcs' };

/** The game's audio on stub nodes, its event bus, and the engine loaded (or not). */
async function makeAudio({ fetchFile = fetchFor(MANIFEST) } = {}) {
  const { context, gains, sources } = makeContext();
  const errors = vi.spyOn(console, 'error');
  const { bus, random } = initBus(context);
  const eventBus = new EventBus();
  const audio = new AudioSystem({
    eventBus,
    settings: createSettingsStub(),
    random,
  });
  audio.initialized = true;
  audio.context = context;
  audio.sfxBus = bus;
  await bus.engine.load(fetchFile);
  const engine = bus.engine;

  /**
   * One simulation step as PlayerSystem sends it: the firing thrusters'
   * events, each with its card's visual level, then player-moved with all
   * three levels (`levels`: thruster, rcs, braking).
   */
  function step({
    main = 0,
    retro = 0,
    left = 0,
    right = 0,
    automatic = 0,
    levels = {},
    velocity = { vx: 0, vy: 0 },
  } = {}) {
    const visualLevels = { thruster: 0, rcs: 0, braking: 0, ...levels };
    const thruster = (type, intensity, extra) =>
      eventBus.emit('thruster-effect', {
        type,
        intensity,
        position: { x: 400, y: 300 },
        visualLevel: visualLevels[LEVEL_OF[type]],
        ...extra,
      });
    if (main) thruster('main', main, { isAutomatic: false });
    if (retro) thruster('aux', retro, { isAutomatic: false });
    if (automatic) thruster('aux', automatic, { isAutomatic: true });
    if (left) thruster('side', left, { side: 'left', isAutomatic: false });
    if (right) thruster('side', right, { side: 'right', isAutomatic: false });
    context.currentTime += STEP;
    eventBus.emit('player-moved', {
      position: { x: 400, y: 300 },
      velocity,
      angle: 0,
      visualLevels,
    });
  }
  const fly = (steps, flight) => {
    for (let i = 0; i < steps; i += 1) step(flight);
  };
  /** The one-shots started since `from`, by file. */
  const played = (from = 0) =>
    sources
      .slice(from)
      .filter((s) => s.buffer?.path && !s.loop && s.start.mock.calls.length)
      .map((s) => s.buffer.path);
  return {
    audio,
    bus,
    engine,
    errors,
    eventBus,
    context,
    gains,
    sources,
    step,
    fly,
    played,
  };
}

describe('ship engine', () => {
  it('thrust crossfades the low idle voice into the turbine, the roar only near full; the retro never roars', async () => {
    const { engine, fly, played } = await makeAudio();
    const gains = () => engine.snapshot().target.gains;

    fly(4, { main: 1 });
    expect(played()).toContain('ignition.mp3');
    const early = gains();
    expect(early.low).toBeGreaterThan(early.turbine);
    fly(90, { main: 1 });
    const full = gains();
    expect(full.turbine).toBeGreaterThan(full.low);
    expect(full.roar).toBeGreaterThan(0);

    fly(90, { retro: 1 });
    expect(engine.snapshot().input.thrust).toBeCloseTo(0.6, 9);
    expect(gains().roar).toBeCloseTo(0, 3);

    fly(1);
    expect(played()).toContain('cutoff.mp3');
    fly(120);
    expect(gains().turbine).toBeCloseTo(0, 3);
  });

  it('the propulsion cards add tiers: sub, then harmonic, then crackle, even with thrusters that never fire', async () => {
    expect([0, 1, 3, 4, 7, 8, 13].map(engineTier)).toEqual([
      0, 1, 1, 2, 2, 3, 3,
    ]);
    const { engine, fly } = await makeAudio();
    const layers = () => {
      const { sub, harmonic, crackle } = engine.snapshot().target.gains;
      return [sub, harmonic, crackle].map((g) => g > 1e-3);
    };

    fly(90, { main: 1 });
    expect(engine.snapshot().input.tier).toBe(0);
    expect(layers()).toEqual([false, false, false]);
    // Flying straight with Main Thrusters 3 + RCS System 1: four ranks,
    // though the side thrusters never fire.
    fly(90, { main: 1, levels: { thruster: 3, rcs: 1 } });
    expect(engine.snapshot().input.tier).toBe(2);
    expect(layers()).toEqual([true, true, false]);
    // + Braking System 4, the retro never firing either: eight.
    fly(90, { main: 1, levels: { thruster: 3, rcs: 1, braking: 4 } });
    expect(engine.snapshot().input.tier).toBe(3);
    expect(layers()).toEqual([true, true, true]);
  });

  it("the player's every step carries the three cards' levels to the engine", async () => {
    const { engine, eventBus } = await makeAudio();
    const input = {
      getMovementInput: () => ({
        up: true,
        down: false,
        left: false,
        right: false,
      }),
    };
    const player = new PlayerSystem({ eventBus, input, 'command-queue': null });
    eventBus.emit('upgrade-thruster-visual', { level: 3 });
    eventBus.emit('upgrade-rcs-visual', { level: 1 });

    for (let i = 0; i < 10; i += 1) player.update(STEP);
    expect(engine.snapshot().input.tier).toBe(2);
  });

  it('a side thruster puffs on its own side; the speed share is how near the push holds its top speed', async () => {
    const { engine, sources, fly, played } = await makeAudio();
    const from = sources.length;
    fly(3, { main: 1, left: 1 });
    expect(engine.snapshot().input.lateral).toBe(-1);
    const puff = sources.slice(from).find((s) => /puff/.test(s.buffer.path));
    const panner = puff.connect.mock.calls[0][0].connect.mock.calls[0][0];
    expect(panner.pan.value).toBeLessThan(0);
    expect(played(from).filter((f) => /puff/.test(f)).length).toBe(1);

    // Whatever the push, the share is the true one: from rest near none of
    // the top speed, at it all.
    [280, 560].forEach((push) => {
      const top = push / 60 / Math.expm1(3.1 / 60);
      const after = (v) => (v + push / 60) * Math.exp(-3.1 / 60);
      [0, 0.5, 0.9].forEach((part) => {
        const v = part * top;
        expect(speedShare(v, after(v))).toBeCloseTo(after(v) / top, 9);
      });
      expect(speedShare(0, after(0))).toBeLessThan(0.06);
      expect(speedShare(top, after(top))).toBeCloseTo(1, 9);
    });
    // Flying against the push: far from its top speed.
    expect(speedShare(-80, -78)).toBe(0);
  });

  it('the stabilizer answers a shot with puffs as strong as its correction, never the same variation twice', async () => {
    const { engine, eventBus, sources, step } = await makeAudio();
    const puffGains = (from) =>
      sources
        .slice(from)
        .filter((s) => /puff/.test(s.buffer?.path))
        .map((s) => ({
          path: s.buffer.path,
          gain: s.connect.mock.calls[0][0].gain.value,
        }));

    let from = sources.length;
    for (let i = 0; i < 30; i += 1) {
      eventBus.emit('weapon-fired', {});
      step({ automatic: 0.35 }); // the auto-damper at its least: full puffs
    }
    const full = puffGains(from);
    expect(full.length).toBeGreaterThanOrEqual(60);
    full.slice(1).forEach((p, i) => expect(p.path).not.toBe(full[i].path));
    full.forEach((p) => expect(p.gain).toBeCloseTo(0.42 * 0.3, 9));

    from = sources.length;
    eventBus.emit('weapon-fired', {});
    step({ automatic: 0.21 }); // drifting long: a softer correction
    puffGains(from).forEach((p) =>
      expect(p.gain).toBeCloseTo(0.42 * 0.3 * 0.6, 9)
    );

    // Under manual thrust no stabilizer fires: no puffs.
    from = sources.length;
    eventBus.emit('weapon-fired', {});
    step({ main: 1 });
    expect(puffGains(from)).toEqual([]);
    expect(engine.snapshot()).not.toBeNull();
  });

  it("the player's own shot ducks the bed 3 dB and back; an enemy's does not", async () => {
    const { gains, eventBus, step } = await makeAudio();
    const ducks = () =>
      gains.filter((g) =>
        g.gain.linearRampToValueAtTime.mock.calls.some(
          ([value]) => value === 0.708
        )
      );

    step({ main: 1 });
    eventBus.emit('enemy-fired', { position: { x: 0, y: 0 } });
    step({ main: 1 });
    expect(ducks()).toEqual([]);

    eventBus.emit('weapon-fired', {});
    step({ main: 1 });
    expect(ducks()).toHaveLength(1);
    const ramps = ducks()[0].gain.linearRampToValueAtTime.mock.calls;
    expect(ramps.at(-1)[0]).toBe(1);
    expect(ramps.at(-1)[1]).toBeGreaterThan(ramps.at(-2)[1]);
  });

  it('a pause, and a step that never comes, stop it at rest without the cut-off', async () => {
    const { engine, errors, eventBus, fly, played } = await makeAudio();
    const bed = () =>
      Object.entries(engine.snapshot().live)
        .filter(([key]) => key.startsWith('gain.'))
        .map(([, value]) => value);

    fly(60, { main: 1 });
    expect(Math.max(...bed())).toBeGreaterThan(0.1);
    const before = played().length;
    eventBus.emit('pause-state-changed', { isPaused: true });
    expect(Math.max(...bed())).toBeLessThan(1e-9);
    expect(engine.snapshot().spool).toBe(0);

    // Back in flight it spins up again from rest, with its ignition.
    fly(4, { main: 1 });
    expect(played().slice(before)).toEqual(['ignition.mp3']);
    fly(60, { main: 1 });
    engine.stopIfIdle(performance.now() + 100);
    expect(Math.max(...bed())).toBeGreaterThan(0.1);
    engine.stopIfIdle(performance.now() + 200);
    expect(Math.max(...bed())).toBeLessThan(1e-9);
    expect(played()).not.toContain('cutoff.mp3');
    expect(errors).not.toHaveBeenCalled();
  });

  it('a pause and a teardown stop its one-shots too, playing or scheduled, with a short fade', async () => {
    const { context, engine, eventBus, sources, fly, step } = await makeAudio();
    const oneshots = (from) =>
      sources.slice(from).filter((s) => !s.loop && s.start.mock.calls.length);
    const faded = (source) =>
      source.connect.mock.calls[0][0].gain.setTargetAtTime.mock.calls.some(
        ([value]) => value === 0
      );

    fly(4, { main: 1 }); // the ignition
    eventBus.emit('weapon-fired', {});
    step({ automatic: 0.35 }); // the stabilizer's puffs, scheduled ahead
    const [ended, ...ringing] = oneshots(0);
    expect(ringing.length).toBeGreaterThanOrEqual(2);
    expect(
      ringing.some((s) => s.start.mock.calls[0][0] > context.currentTime)
    ).toBe(true);
    ended.onended(); // it finished on its own: nothing left to stop

    eventBus.emit('pause-state-changed', { isPaused: true });
    ringing.forEach((s) => {
      expect(faded(s)).toBe(true);
      expect(s.stop).toHaveBeenCalledTimes(1);
      expect(s.stop.mock.calls[0][0]).toBeGreaterThan(context.currentTime);
    });
    expect(ended.stop).not.toHaveBeenCalled();

    const from = sources.length;
    eventBus.emit('player-dashed', { position: { x: 400, y: 300 } });
    const [dash] = oneshots(from);
    engine.dispose();
    expect(faded(dash)).toBe(true);
    expect(dash.stop).toHaveBeenCalledTimes(1);
  });

  it('a death in a later run still stops it: the inactivity checker outlives the reset', async () => {
    const { audio, engine, fly } = await makeAudio();
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'performance'],
    });
    const bed = () =>
      Math.max(
        ...Object.entries(engine.snapshot().live)
          .filter(([key]) => key.startsWith('gain.'))
          .map(([, value]) => value)
      );
    audio._startThrusterInactivityChecker(); // init's
    audio.reset(); // a new run

    fly(60, { main: 1 });
    expect(bed()).toBeGreaterThan(0.1);
    vi.advanceTimersByTime(300); // the ship died: no more steps
    expect(bed()).toBeLessThan(1e-9);
    audio.onDestroy();
    vi.useRealTimers();
  });

  it('the dash and the brake play the engine one-shot, one sound each', async () => {
    const { context, errors, eventBus, played } = await makeAudio();
    const oscillators = context.createOscillator.mock.calls.length;

    eventBus.emit('player-dashed', {
      position: { x: 400, y: 300 },
      direction: { x: 1, y: 0 },
    });
    eventBus.emit('player-braked', { position: { x: 400, y: 300 } });

    expect(played()).toEqual(['dash.mp3', 'brake.mp3']);
    expect(context.createOscillator.mock.calls.length).toBe(oscillators);
    expect(errors).not.toHaveBeenCalled();
  });

  it('with the context suspended, the dash and the brake ask for a resume and play once it runs', async () => {
    const { audio, context, eventBus, played } = await makeAudio();
    audio._wireSfxBusSeams(); // the game's resume gate, not the immediate one
    context.state = 'suspended';

    eventBus.emit('player-dashed', { position: { x: 400, y: 300 } });
    eventBus.emit('player-braked', { position: { x: 400, y: 300 } });
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(played()).toEqual([]);

    await audio.resumePromise;
    expect(played()).toEqual(['dash.mp3', 'brake.mp3']);
  });

  it('when the files fail it stays procedural: the thruster loop, the synthesized dash', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { bus, engine, errors, context, eventBus, step, played } =
      await makeAudio({
        fetchFile: async () => {
          throw new Error('offline');
        },
      });
    const startLoop = vi.spyOn(bus.thrusterLoops, 'startLoop');

    step({ main: 1 });
    eventBus.emit('player-dashed', { position: { x: 400, y: 300 } });

    const engineWarnings = warn.mock.calls.filter(([message]) =>
      String(message).startsWith('[Engine]')
    );
    expect(engineWarnings).toHaveLength(1);
    expect(engine.snapshot()).toBeNull();
    expect(startLoop).toHaveBeenCalledTimes(1);
    expect(startLoop.mock.calls[0][0]).toBe('main');
    expect(context.createOscillator).toHaveBeenCalled();
    expect(played()).toEqual([]);
    expect(errors).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a teardown while its files fetch or decode never builds the engine', async () => {
    const gate = () => {
      let open;
      const shut = new Promise((resolve) => {
        open = resolve;
      });
      return { shut, open };
    };
    const started = (sources) =>
      sources.filter((s) => s.start.mock.calls.length);

    // Torn down while decoding.
    const decoding = makeContext();
    const decodeGate = gate();
    const decode = decoding.context.decodeAudioData;
    decoding.context.decodeAudioData = vi.fn(async (file) => {
      await decodeGate.shut;
      return decode(file);
    });
    const late = initBus(decoding.context).bus;
    const loading = late.engine.load(fetchFor(MANIFEST));
    await vi.waitFor(() =>
      expect(decoding.context.decodeAudioData).toHaveBeenCalled()
    );
    late.engine.dispose();
    decodeGate.open();
    await loading;
    expect(late.engine.snapshot()).toBeNull();
    expect(started(decoding.sources)).toEqual([]);

    // Torn down while fetching.
    const fetching = makeContext();
    const fetchGate = gate();
    const fetchFile = fetchFor(MANIFEST);
    const early = initBus(fetching.context).bus;
    const fetchingLoad = early.engine.load(async (path) => {
      await fetchGate.shut;
      return fetchFile(path);
    });
    early.engine.dispose();
    fetchGate.open();
    await fetchingLoad;
    expect(early.engine.snapshot()).toBeNull();
    expect(fetching.context.decodeAudioData).not.toHaveBeenCalled();
    expect(started(fetching.sources)).toEqual([]);
  });
});
