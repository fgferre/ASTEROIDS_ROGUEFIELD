import AudioPool from '../AudioPool.js';
import AudioCache from '../AudioCache.js';
import AudioBatcher from '../AudioBatcher.js';
import ThrusterLoopManager from '../ThrusterLoopManager.js';
import { createSfxSynthPort } from './SfxSynthPort.js';
import { dbToGain } from './MusicThemes.js';
import RandomService from '../../core/RandomService.js';
import {
  AUDIO_DISTANCE_MIX,
  AUDIO_REVERB,
  AUDIO_STEREO_PAN_MAX,
} from '../../data/audio/mix.js';
import {
  EXPLOSION_DEFAULT_SIZE,
  EXPLOSION_SIZE_BY_ENEMY_TYPE,
} from '../../data/audio/explosions.js';
import { GAME_WIDTH } from '../../core/GameConstants.js';
import { getContent } from '../../content/registry.js';
import { createBatchedCues } from './sfx/batched.js';
import { createExplosionCues } from './sfx/explosions.js';
import { createMachineCues } from './sfx/machines.js';
import { createStingerCues } from './sfx/stingers.js';
import { createProgressionCues } from './sfx/progression.js';
import { createPlayerCues } from './sfx/player.js';
import { createShieldCues } from './sfx/shields.js';
import { createInterfaceCues } from './sfx/interface.js';
import { createThrusterCues } from './sfx/thrusters.js';

const EXPLOSION_SIZE_ORDER = Object.freeze(['small', 'medium', 'large']);
const ASTEROID_SIZES = new Set(EXPLOSION_SIZE_ORDER);

/**
 * Explosion size for an enemy-destroyed payload: asteroids by their `size`,
 * enemy items by their file's `explosion`, other enemies by
 * EXPLOSION_SIZE_BY_ENEMY_TYPE (unknown → default), `elite` bumps one size
 * up. Returns null when the enemy has its own death cue (the mine).
 *
 * @param {object} payload
 * @returns {'small'|'medium'|'large'|null}
 */
export function resolveExplosionSize(payload = {}) {
  const enemy = payload?.enemy || {};
  const type = String(
    payload?.enemyType || enemy.type || (payload?.size ? 'asteroid' : '')
  ).toLowerCase();

  const item = getContent('enemies', type);
  let size;
  if (type === 'asteroid') {
    const asteroidSize = payload?.size ?? enemy.size;
    size = ASTEROID_SIZES.has(asteroidSize)
      ? asteroidSize
      : EXPLOSION_DEFAULT_SIZE;
  } else if (item) {
    size =
      item.explosion === undefined ? EXPLOSION_DEFAULT_SIZE : item.explosion;
  } else if (
    Object.prototype.hasOwnProperty.call(EXPLOSION_SIZE_BY_ENEMY_TYPE, type)
  ) {
    size = EXPLOSION_SIZE_BY_ENEMY_TYPE[type];
  } else {
    size = EXPLOSION_DEFAULT_SIZE;
  }

  if (!size) return null;
  if (payload?.elite || enemy.elite) {
    const index = EXPLOSION_SIZE_ORDER.indexOf(size);
    size =
      EXPLOSION_SIZE_ORDER[
        Math.min(EXPLOSION_SIZE_ORDER.length - 1, index + 1)
      ];
  }
  return size;
}

/**
 * Stereo pan for a source at `sourceX` heard from `listenerX` (the player):
 * half a screen away reaches the ±AUDIO_STEREO_PAN_MAX edge. Centred when the
 * source position is unknown.
 */
export function resolveStereoPan(sourceX, listenerX = GAME_WIDTH / 2) {
  if (!Number.isFinite(sourceX)) return 0;
  const reference = Number.isFinite(listenerX) ? listenerX : GAME_WIDTH / 2;
  const offset = (sourceX - reference) / (GAME_WIDTH / 2);
  return Math.max(-1, Math.min(1, offset)) * AUDIO_STEREO_PAN_MAX;
}

/**
 * Distance mix for a source at (dx, dy) from the player: gain 1 → farGain and
 * lowpass cutoff nearCutoffHz → farCutoffHz between nearPx and farPx
 * (AUDIO_DISTANCE_MIX), clamped outside. Unknown offsets count as near.
 *
 * @returns {{gain: number, cutoff: number}}
 */
export function resolveDistanceMix(dx, dy) {
  const { nearPx, farPx, farGain, nearCutoffHz, farCutoffHz } =
    AUDIO_DISTANCE_MIX;
  const distance = Math.hypot(dx, dy);
  const t = Number.isFinite(distance)
    ? Math.min(1, Math.max(0, (distance - nearPx) / (farPx - nearPx)))
    : 0;
  return {
    gain: 1 / (1 + (1 / farGain - 1) * t),
    cutoff: nearCutoffHz * (farCutoffHz / nearCutoffHz) ** t,
  };
}

// A struck partial reaches its peak this fast (s); a click is cut after this
// many of its decay times (e^-5 < 1%).
const STRIKE_ATTACK = 0.002;
const CLICK_TAIL_DECAYS = 5;

/**
 * SFXBus — owns ALL per-event SFX synthesis (INFRA-02).
 *
 * The synthesis bodies live in sound-family modules under ./sfx/ (batched
 * shots, explosions, machines, stingers, progression, player, shields,
 * interface, thrusters). Each family is a factory that receives the bus
 * TOOLKIT (_createKit: live handles, routing, shared synth primitives) and
 * returns its cues; the bus keeps the infrastructure (context, buses, reverb,
 * batcher + port, lifecycle) and one-line delegates, so the public API and the
 * facade seams stay where they were. The helper FILES (AudioPool / AudioCache /
 * AudioBatcher / ThrusterLoopManager) stay at src/modules/.
 *
 * GAIN TOPOLOGY (cross-plan contract — this plan creates the split):
 *   AMBIENT SFX (enemy/world synth) → ambientBus
 *       → effectsDuckGain (02.06 DuckingController) → effectsGain (slider) → master
 *   PROTECTED SFX (player shot, player-landed hits, player damage) → protectedBus
 *       → effectsGain (slider) DIRECTLY  [bypasses effectsDuckGain — player
 *         feedback never ducks; 02.08 routes boss roars here and splices reverb
 *         at the merge before effectsGain]
 * SFXBus writes ONLY ambientBus / protectedBus and its per-voice nodes — never
 * the duck/slider stages.
 *
 * Resource/lifecycle contract (matches MusicMixer/FileTrack/Ducking managers):
 *   - constructor(config): stores config ONLY. No AudioContext work.
 *   - init(context, deps): builds the buses + owns pool/cache/batcher/thruster.
 *   - dispose(): stops thruster loops, cleans batcher/pool/cache, disconnects
 *       the buses; idempotent.
 *
 * Facade seams (injected — the bus never reaches back into the facade god-class):
 *   - getContext(): the live AudioContext (mutable; tests reassign facade.context)
 *   - getRandomScopes(): the facade-owned seeded scopes (determinism + INFRA-03
 *       debug global stay on the facade; SFXBus only READS the scopes)
 *   - safePlay(fn): the centralized ensureRunning resume gate (INFRA-02 / 02.06)
 *   - trackPerformance(name): the facade's perf counter
 *   - getEffectsFallbackDestination(): pre-init fallback so SFX is never dropped
 *       when the buses are not yet spliced (e.g. tests setting fields directly).
 */
class SFXBus {
  /**
   * @param {object} [config] - Reserved for future calibration overrides.
   */
  constructor(config = {}) {
    // --- config only (NO AudioContext work) ---
    this.config = config || {};

    // --- owned instances (constructed in init) ---
    this.pool = null;
    this.cache = null;
    this.batcher = null;
    this.thrusterLoops = new ThrusterLoopManager();

    // --- owned output buses (created in init) ---
    this.ambientBus = null; // → effectsDuckGain (ducks with the world)
    this.protectedBus = null; // → effectsGain directly (player feedback never ducks)
    this.reverbSend = null; // per-cue sends → convolver → reverbReturn → effectsGain
    this.reverbConvolver = null;
    this.reverbReturn = null;

    // --- injected facade seams (assigned in init) ---
    this._getContext = () => null;
    this._getRandomScopes = () => null;
    this._safePlay = (fn) => {
      if (typeof fn === 'function') fn();
    };
    this._trackPerformance = () => {};
    this._getEffectsFallbackDestination = () => null;

    this._fallbackRandom = null;
    this.initialized = false;

    // --- sound families (./sfx/*.js): each closes over the toolkit, never the bus ---
    this._kit = this._createKit();
    this._batched = createBatchedCues(this._kit);
    this._explosions = createExplosionCues(this._kit);
    this._machines = createMachineCues(this._kit);
    this._stingers = createStingerCues(this._kit);
    this._progression = createProgressionCues(this._kit);
    this._player = createPlayerCues(this._kit);
    this._shields = createShieldCues(this._kit);
    this._interface = createInterfaceCues(this._kit);
    this._thrusters = createThrusterCues(this._kit);
  }

  /**
   * Build the ambient/protected buses and construct the owned instances.
   *
   * @param {AudioContext} context
   * @param {object} deps
   * @param {AudioNode} [deps.effectsDuckGain] - the duck node ambient SFX routes
   *   through (02.06). ambientBus → effectsDuckGain.
   * @param {AudioNode} [deps.effectsGain] - the effects slider stage. protectedBus
   *   → effectsGain DIRECTLY (bypasses the duck).
   * @param {() => AudioContext} [deps.getContext] - live-context getter.
   * @param {() => object} [deps.getRandomScopes] - facade-owned scopes getter.
   * @param {(fn: () => void) => void} [deps.safePlay] - resume gate.
   * @param {(name: string) => void} [deps.trackPerformance]
   * @param {() => AudioNode|null} [deps.getEffectsFallbackDestination]
   * @param {object} [deps.randomScopes] - scopes snapshot for pool/cache/batcher.
   */
  init(context, deps = {}) {
    if (this.initialized) return;
    if (!context) return;

    const {
      effectsDuckGain = null,
      effectsGain = null,
      getContext,
      getRandomScopes,
      safePlay,
      trackPerformance,
      getEffectsFallbackDestination,
      randomScopes,
    } = deps;

    if (typeof getContext === 'function') this._getContext = getContext;
    else this._getContext = () => context;
    if (typeof getRandomScopes === 'function')
      this._getRandomScopes = getRandomScopes;
    if (typeof safePlay === 'function') this._safePlay = safePlay;
    if (typeof trackPerformance === 'function')
      this._trackPerformance = trackPerformance;
    if (typeof getEffectsFallbackDestination === 'function')
      this._getEffectsFallbackDestination = getEffectsFallbackDestination;

    const scopes = randomScopes || this._getRandomScopes() || {};

    // --- ambientBus: world/enemy SFX → effectsDuckGain (ducks) ---
    this.ambientBus = context.createGain();
    if (effectsDuckGain) {
      this.ambientBus.connect(effectsDuckGain);
    } else if (effectsGain) {
      this.ambientBus.connect(effectsGain);
    }

    // --- protectedBus: player feedback → effectsGain DIRECTLY (bypasses duck) ---
    this.protectedBus = context.createGain();
    if (effectsGain) {
      this.protectedBus.connect(effectsGain);
    }

    // --- reverb send bus: shared convolver with a procedural IR; the return
    // joins effectsGain (slider applies; the send never ducks twice) ---
    if (effectsGain) {
      this.reverbSend = context.createGain();
      this.reverbConvolver = context.createConvolver();
      this.reverbConvolver.buffer = this._createReverbImpulse(context);
      this.reverbReturn = context.createGain();
      this.reverbReturn.gain.value = AUDIO_REVERB.returnGain;
      this.reverbSend.connect(this.reverbConvolver);
      this.reverbConvolver.connect(this.reverbReturn);
      this.reverbReturn.connect(effectsGain);
    }

    // --- owned optimization instances (relocated ownership; files unmoved) ---
    this.pool = new AudioPool(context, 50);
    this.cache = new AudioCache(context, 20, {
      random: scopes?.cache,
    });
    // The batcher consumes the port built from THIS bus's OWN direct methods —
    // the cycle (02.04) closes locally, no facade back-reference.
    this.batcher = new AudioBatcher(this.createSfxSynthPort(), 0, {
      random: scopes?.batcher,
    });

    this.initialized = true;
  }

  /**
   * Build the AudioBatcher's SfxSynthPort from THIS bus's OWN bound methods.
   *
   * After extraction the _play*Direct bodies live here, so the port closes the
   * loop locally — the batcher receives this frozen port, never a system. pool/
   * context are late-bound (getPool/getContext) because pool is assigned during
   * init() and context can be reassigned (tests).
   *
   * @returns {Readonly<object>} the frozen SFX synth port.
   */
  createSfxSynthPort() {
    return createSfxSynthPort({
      playDroneFireDirect: (...args) => this._playDroneFireDirect(...args),
      playHunterBurstDirect: (...args) => this._playHunterBurstDirect(...args),
      playMineExplosionDirect: (...args) =>
        this._playMineExplosionDirect(...args),
      safePlay: (fn) => this._safePlay(fn),
      connectGainNode: (node) => this._connectAmbient(node),
      executeImmediate: (soundType, args) =>
        this._executeBatchedSound(soundType, args),
      getPool: () => this.pool,
      getContext: () => this.context,
    });
  }

  // ---------------------------------------------------------------------------
  // Live-resource accessors (read the facade's mutable fields through getters so
  // a test reassigning facade.context / facade.randomScopes is reflected here).
  // ---------------------------------------------------------------------------

  get context() {
    return this._getContext();
  }

  get randomScopes() {
    return this._getRandomScopes() || {};
  }

  // ---------------------------------------------------------------------------
  // Bus routing — ambient (ducks) vs protected (player feedback, never ducks).
  // Falls back to the facade effects destination before the buses are spliced so
  // SFX is never silently dropped (tests / pre-init).
  // ---------------------------------------------------------------------------

  /** The ambient destination (world/enemy SFX route here → effectsDuckGain). */
  getAmbientDestination() {
    return this.ambientBus || this._getEffectsFallbackDestination() || null;
  }

  /** The protected destination (player feedback → effectsGain, bypasses duck). */
  getProtectedDestination() {
    return (
      this.protectedBus ||
      this.ambientBus ||
      this._getEffectsFallbackDestination() ||
      null
    );
  }

  _connectAmbient(node) {
    const destination = this.getAmbientDestination();
    if (destination && node && typeof node.connect === 'function') {
      node.connect(destination);
    }
  }

  _connectProtected(node) {
    const destination = this.getProtectedDestination();
    if (destination && node && typeof node.connect === 'function') {
      node.connect(destination);
    }
  }

  /**
   * Stereo exponentially-decaying noise IR, darkened over time by a one-pole
   * lowpass, from its own seeded stream (never touches the gameplay scopes).
   * @private
   */
  _createReverbImpulse(context) {
    const rate = context.sampleRate;
    const length = Math.max(1, Math.floor(rate * AUDIO_REVERB.durationSeconds));
    const preDelay = Math.floor(rate * AUDIO_REVERB.preDelaySeconds);
    const buffer = context.createBuffer(2, length, rate);
    const rng = new RandomService(AUDIO_REVERB.seed);
    const decayPerSecond = (AUDIO_REVERB.decayDb / 20) * Math.LN10;
    const damping = AUDIO_REVERB.dampingCoefficient;

    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      let filtered = 0;
      for (let i = preDelay; i < length; i += 1) {
        const t = (i - preDelay) / rate;
        filtered += (rng.range(-1, 1) - filtered) * (1 - damping);
        data[i] = filtered * Math.exp(-decayPerSecond * t);
      }
    }
    return buffer;
  }

  /**
   * Feed `node` into the shared reverb at `sendDb` (no-op before init).
   * @private
   */
  _sendToReverb(node, sendDb) {
    if (!this.reverbSend || !node || typeof node.connect !== 'function') return;
    const send = this.context.createGain();
    send.gain.value = dbToGain(sendDb);
    node.connect(send);
    send.connect(this.reverbSend);
  }

  /**
   * Ambient destination, through a StereoPanner when `pan` is non-zero and a
   * distance lowpass + gain when `distance` ({gain, cutoff} from
   * resolveDistanceMix) is beyond the near radius.
   * @private
   */
  _ambientInput(pan = 0, distance = null) {
    let destination = this.getAmbientDestination();
    if (!destination) return destination;
    if (pan) {
      const panner = this.context.createStereoPanner();
      panner.pan.value = pan;
      panner.connect(destination);
      destination = panner;
    }
    if (distance && distance.gain < 1) {
      const gain = this.context.createGain();
      gain.gain.value = distance.gain;
      gain.connect(destination);
      const lowpass = this.context.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = distance.cutoff;
      lowpass.Q.value = AUDIO_DISTANCE_MIX.Q;
      lowpass.connect(gain);
      destination = lowpass;
    }
    return destination;
  }

  _resolveRandom(...candidates) {
    for (const candidate of candidates) {
      if (candidate && typeof candidate.float === 'function') {
        return candidate;
      }
    }

    if (!this._fallbackRandom) {
      const scopes = this.randomScopes;
      const base = scopes?.base || scopes?.families?.music || null;
      if (base && typeof base.fork === 'function') {
        this._fallbackRandom = base.fork('sfx-bus:fallback-base');
      } else {
        this._fallbackRandom = new RandomService('sfx-bus:fallback-base');
      }
    }

    return this._fallbackRandom;
  }

  _scheduleBatchedSound(soundType, params = [], options = {}) {
    if (!this.batcher) {
      return false;
    }

    return this.batcher.scheduleSound(soundType, params, options);
  }

  _executeBatchedSound(soundType, params = []) {
    switch (soundType) {
      case 'playLaserShot':
        this._playLaserShotDirect();
        break;
      case 'playTargetLock':
        this._playTargetLockDirect({ lockCount: params?.[0] });
        break;
      case 'playAsteroidBreak':
        this._playAsteroidBreakDirect(params?.[0]);
        break;
      case 'playXPCollect':
        this._playXPCollectDirect();
        break;
      case 'playDroneFire': {
        const options = Array.isArray(params) ? params[0] : params;
        this._playDroneFireDirect(options || {});
        break;
      }
      case 'playHunterBurst': {
        const options = Array.isArray(params) ? params[0] : params;
        if (options) {
          this._playHunterBurstDirect(options);
        }
        break;
      }
      case 'playMineExplosion': {
        const options = Array.isArray(params) ? params[0] : params;
        this._playMineExplosionDirect(options || {});
        break;
      }
      default:
        console.warn(
          `[SFXBus] No direct handler registered for "${soundType}"`
        );
        break;
    }
  }

  /**
   * A StereoPanner at `pan` into the protected bus.
   * @private
   */
  _protectedPanner(pan) {
    const panner = this.context.createStereoPanner();
    panner.pan.value = pan;
    this._connectProtected(panner);
    return panner;
  }

  /**
   * Noise through a band (or, with `type: 'notch'`, around one) sweeping
   * fromHz → toHz over `seconds`, rising to `peak` in `attack` s, into
   * `destination` (dash / brake, the Ram's whoosh, the Husk's hiss, the
   * Bulwark plate's knock and crack, Silence's vacuum).
   * @private
   */
  _maneuverNoise(
    destination,
    now,
    { type = 'bandpass', seconds, attack, peak, fromHz, toHz, q }
  ) {
    const end = now + seconds;
    const noise = this.context.createBufferSource();
    noise.buffer = this._noiseBuffer(seconds);
    const band = this.context.createBiquadFilter();
    band.type = type;
    band.frequency.setValueAtTime(fromHz, now);
    band.frequency.exponentialRampToValueAtTime(toHz, end);
    band.Q.setValueAtTime(q, now);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, end);
    noise.connect(band);
    band.connect(gain);
    gain.connect(destination);
    noise.start(now);
    noise.stop(end);
  }

  /**
   * A sine dropping fromHz → toHz from `start` over `seconds` (the dash's
   * thump, the brake's thud, the Ram's sub, the Husk's pops), into
   * `destination`.
   * @private
   */
  _maneuverTone(destination, start, { fromHz, toHz, peak, seconds }) {
    const end = start + seconds;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(fromHz, start);
    osc.frequency.exponentialRampToValueAtTime(toHz, end);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, end);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }

  /**
   * A fresh `seconds`-long mono white-noise buffer.
   * @private
   */
  _noiseBuffer(seconds) {
    const rate = this.context.sampleRate;
    const length = Math.max(1, Math.floor(rate * seconds));
    const buffer = this.context.createBuffer(1, length, rate);
    const output = buffer.getChannelData(0);
    const rng = this._resolveRandom(
      this.randomScopes?.bufferFamilies?.thruster,
      this.randomScopes?.families?.thruster,
      this.randomScopes?.base
    );
    for (let i = 0; i < length; i += 1) {
      output[i] = rng.float() * 2 - 1;
    }
    return buffer;
  }

  /**
   * A struck metal voice at `hz`: one `type` oscillator per [ratio, weight]
   * partial, from `peak` × weight decaying over `seconds` (upper partials
   * sooner, by √ratio), from `start` into `destination`.
   * @private
   */
  _strike(destination, start, { type, hz, partials, peak, seconds }) {
    for (const [ratio, weight] of partials) {
      const end = start + seconds / Math.sqrt(ratio);
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(hz * ratio, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(
        peak * weight,
        start + STRIKE_ATTACK
      );
      gain.gain.exponentialRampToValueAtTime(0.001, end);
      osc.connect(gain);
      gain.connect(destination);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  }

  /**
   * Metallic clicks `times` s after `now`, each a noise burst weighted by
   * `gains` and decaying over `clickSeconds`, band-passed at `bandHz` and
   * played at `peak` from one `seconds`-long buffer into `destination`.
   * @private
   */
  _clickTrain(
    destination,
    now,
    { seconds, times, gains, clickSeconds, bandHz, q, peak }
  ) {
    const buffer = this._noiseBuffer(seconds);
    const data = buffer.getChannelData(0);
    const decay = clickSeconds * this.context.sampleRate;
    const envelope = new Float32Array(data.length);
    times.forEach((at, k) => {
      const first = Math.floor(at * this.context.sampleRate);
      const last = Math.min(
        data.length,
        first + Math.ceil(decay * CLICK_TAIL_DECAYS)
      );
      for (let i = first; i < last; i += 1) {
        envelope[i] += gains[k] * Math.exp(-(i - first) / decay);
      }
    });
    for (let i = 0; i < data.length; i += 1) {
      data[i] *= envelope[i];
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const band = this.context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(bandHz, now);
    band.Q.setValueAtTime(q, now);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(peak, now);
    source.connect(band);
    band.connect(gain);
    gain.connect(destination);
    source.start(now);
    source.stop(now + seconds);
  }

  /**
   * @typedef {object} SfxKit
   * What a sound family receives instead of the bus: live handles (context,
   * pool, cache, randomScopes, thrusterLoops: getters, so a test reassigning
   * facade.context or bus.pool is honoured), the resume gate and perf counter,
   * bus routing, the reverb send, the shared synth primitives and the batch
   * scheduler. Frozen; nothing in it reaches the lifecycle or the buses.
   */

  /**
   * Build the toolkit the sound families close over.
   * @returns {Readonly<SfxKit>}
   */
  _createKit() {
    const bus = this;
    return Object.freeze({
      get context() {
        return bus.context;
      },
      get pool() {
        return bus.pool;
      },
      get cache() {
        return bus.cache;
      },
      get randomScopes() {
        return bus.randomScopes;
      },
      get thrusterLoops() {
        return bus.thrusterLoops;
      },
      safePlay: (fn) => bus._safePlay(fn),
      trackPerformance: (name) => bus._trackPerformance(name),
      resolveRandom: (...candidates) => bus._resolveRandom(...candidates),
      ambientDestination: () => bus.getAmbientDestination(),
      connectAmbient: (node) => bus._connectAmbient(node),
      connectProtected: (node) => bus._connectProtected(node),
      ambientInput: (pan, distance) => bus._ambientInput(pan, distance),
      protectedPanner: (pan) => bus._protectedPanner(pan),
      sendToReverb: (node, sendDb) => bus._sendToReverb(node, sendDb),
      maneuverNoise: (...args) => bus._maneuverNoise(...args),
      maneuverTone: (...args) => bus._maneuverTone(...args),
      strike: (...args) => bus._strike(...args),
      clickTrain: (...args) => bus._clickTrain(...args),
      scheduleBatchedSound: (soundType, params, options) =>
        bus._scheduleBatchedSound(soundType, params, options),
    });
  }

  // ===========================================================================
  // Sound families: one-line delegates. The bodies live in ./sfx/*.js; each
  // family received the toolkit (_createKit), never the bus.
  // ===========================================================================

  // --- Batched shots and impacts (sfx/batched.js) ---

  playLaserShot(options) {
    return this._batched.playLaserShot(options);
  }

  playDroneFire(data) {
    return this._batched.playDroneFire(data);
  }

  playHunterBurst(data) {
    return this._batched.playHunterBurst(data);
  }

  playMineExplosion(data) {
    return this._batched.playMineExplosion(data);
  }

  playTargetLock(data) {
    return this._batched.playTargetLock(data);
  }

  playAsteroidBreak(size) {
    return this._batched.playAsteroidBreak(size);
  }

  playXPCollect() {
    return this._batched.playXPCollect();
  }

  _playLaserShotDirect(params) {
    return this._batched.playLaserShotDirect(params);
  }

  _playDroneFireDirect(params) {
    return this._batched.playDroneFireDirect(params);
  }

  _playHunterBurstDirect(params) {
    return this._batched.playHunterBurstDirect(params);
  }

  _playMineExplosionDirect(params) {
    return this._batched.playMineExplosionDirect(params);
  }

  _playTargetLockDirect(params) {
    return this._batched.playTargetLockDirect(params);
  }

  _playAsteroidBreakDirect(size) {
    return this._batched.playAsteroidBreakDirect(size);
  }

  _playXPCollectDirect() {
    return this._batched.playXPCollectDirect();
  }

  // --- Explosions (sfx/explosions.js) ---

  playExplosion(size, options) {
    return this._explosions.playExplosion(size, options);
  }

  // --- Enemy machines and telegraphs (sfx/machines.js) ---

  playEnemyTelegraph(options) {
    return this._machines.playEnemyTelegraph(options);
  }

  playRamSpinUp(options) {
    return this._machines.playRamSpinUp(options);
  }

  playRamCharge(options) {
    return this._machines.playRamCharge(options);
  }

  playHuskRelease(options) {
    return this._machines.playHuskRelease(options);
  }

  playWeaverTether(options) {
    return this._machines.playWeaverTether(options);
  }

  playBulwarkPlateHit(options) {
    return this._machines.playBulwarkPlateHit(options);
  }

  playBulwarkPlateBreak(options) {
    return this._machines.playBulwarkPlateBreak(options);
  }

  playCasterCharge(options) {
    return this._machines.playCasterCharge(options);
  }

  playCasterLaunch(options) {
    return this._machines.playCasterLaunch(options);
  }

  playCasterImpact(options) {
    return this._machines.playCasterImpact(options);
  }

  playShadePhase(options) {
    return this._machines.playShadePhase(options);
  }

  playHeraldSpawn(options) {
    return this._machines.playHeraldSpawn(options);
  }

  playHeraldAttack(options) {
    return this._machines.playHeraldAttack(options);
  }

  playFlakBurst(options) {
    return this._machines.playFlakBurst(options);
  }

  playLeechAte(options) {
    return this._machines.playLeechAte(options);
  }

  playLeechBurst(options) {
    return this._machines.playLeechBurst(options);
  }

  // --- Stingers and transmissions (sfx/stingers.js) ---

  playEliteSpawned() {
    return this._stingers.playEliteSpawned();
  }

  playSurgeSting() {
    return this._stingers.playSurgeSting();
  }

  playDeepFieldEntry() {
    return this._stingers.playDeepFieldEntry();
  }

  playTransmission() {
    return this._stingers.playTransmission();
  }

  playTransmissionVoice(speaker) {
    return this._stingers.playTransmissionVoice(speaker);
  }

  playChapterStinger(themeId) {
    return this._stingers.playChapterStinger(themeId);
  }

  playWardenStinger() {
    return this._stingers.playWardenStinger();
  }

  // --- Progression, pickups and rewards (sfx/progression.js) ---

  playSalvageAwarded(amount) {
    return this._progression.playSalvageAwarded(amount);
  }

  playHangarPurchase() {
    return this._progression.playHangarPurchase();
  }

  playTipChime() {
    return this._progression.playTipChime();
  }

  playWeaponEvolved() {
    return this._progression.playWeaponEvolved();
  }

  playCardReroll() {
    return this._progression.playCardReroll();
  }

  playCardBanish() {
    return this._progression.playCardBanish();
  }

  playCodexDiscovered() {
    return this._progression.playCodexDiscovered();
  }

  playPickupCollected(kind) {
    return this._progression.playPickupCollected(kind);
  }

  playPickupSpawned(options) {
    return this._progression.playPickupSpawned(options);
  }

  playLevelUp() {
    return this._progression.playLevelUp();
  }

  playOrbFusion(toClass) {
    return this._progression.playOrbFusion(toClass);
  }

  playGoldSpawn() {
    return this._progression.playGoldSpawn();
  }

  playGoldJackpot() {
    return this._progression.playGoldJackpot();
  }

  playUpgradeSelect(rarity) {
    return this._progression.playUpgradeSelect(rarity);
  }

  // --- Player feedback: hits, dash, brake, beam (sfx/player.js) ---

  playBulletHit(killed) {
    return this._player.playBulletHit(killed);
  }

  playShipHit() {
    return this._player.playShipHit();
  }

  playDash(options) {
    return this._player.playDash(options);
  }

  playBrake(options) {
    return this._player.playBrake(options);
  }

  playLowHealthWarning() {
    return this._player.playLowHealthWarning();
  }

  playHarmonicBeam(options) {
    return this._player.playHarmonicBeam(options);
  }

  // --- Shields (sfx/shields.js) ---

  playShieldActivate() {
    return this._shields.playShieldActivate();
  }

  playShieldImpact() {
    return this._shields.playShieldImpact();
  }

  playBossShieldDeflect() {
    return this._shields.playBossShieldDeflect();
  }

  playShieldBreak() {
    return this._shields.playShieldBreak();
  }

  playShieldRecharged() {
    return this._shields.playShieldRecharged();
  }

  playShieldFail() {
    return this._shields.playShieldFail();
  }

  playShieldShockwave() {
    return this._shields.playShieldShockwave();
  }

  // --- Interface (sfx/interface.js) ---

  playPauseOpen() {
    return this._interface.playPauseOpen();
  }

  playPauseClose() {
    return this._interface.playPauseClose();
  }

  playMenuTransition() {
    return this._interface.playMenuTransition();
  }

  playUIHover() {
    return this._interface.playUIHover();
  }

  playUISelect() {
    return this._interface.playUISelect();
  }

  playUIStartGame() {
    return this._interface.playUIStartGame();
  }

  // --- Thruster loops (sfx/thrusters.js) ---

  startThrusterLoop(type, intensity, isAutomatic) {
    return this._thrusters.startThrusterLoop(type, intensity, isAutomatic);
  }

  updateThrusterLoop(type, intensity) {
    return this._thrusters.updateThrusterLoop(type, intensity);
  }

  stopThrusterLoop(type, skipRelease) {
    return this._thrusters.stopThrusterLoop(type, skipRelease);
  }

  isThrusterActive(type) {
    return this._thrusters.isThrusterActive(type);
  }

  // ===========================================================================
  // Lifecycle helpers consumed by the facade reset/destroy.
  // ===========================================================================

  /** Cleanup pool/cache/batcher/thruster state for a fresh run (facade reset). */
  reset() {
    if (this.pool) {
      this.pool.cleanup();
    }
    if (this.cache) {
      this.cache.clearCache();
    }
    if (this.batcher) {
      this.batcher.flushPendingBatches();
      this.batcher.resetStats();
    }
    this._thrusters.cancelPendingThrusterStarts();
    if (this.thrusterLoops) {
      this.thrusterLoops.cleanup(this.pool);
    }
  }

  /**
   * Tear down: stop thruster loops, clean batcher/pool/cache, disconnect the
   * buses. Idempotent (safe to call repeatedly).
   */
  dispose() {
    this._thrusters.cancelPendingThrusterStarts();
    if (this.thrusterLoops) {
      this.thrusterLoops.cleanup(this.pool);
    }
    if (this.batcher) {
      this.batcher.flushPendingBatches();
      this.batcher.resetStats();
    }
    if (this.cache && typeof this.cache.clearCache === 'function') {
      this.cache.clearCache();
    }
    if (this.pool && typeof this.pool.cleanup === 'function') {
      this.pool.cleanup();
    }

    this._safeDisconnect(this.ambientBus);
    this._safeDisconnect(this.protectedBus);
    this._safeDisconnect(this.reverbSend);
    this._safeDisconnect(this.reverbConvolver);
    this._safeDisconnect(this.reverbReturn);
    this.ambientBus = null;
    this.protectedBus = null;
    this.reverbSend = null;
    this.reverbConvolver = null;
    this.reverbReturn = null;
    this.batcher = null;
    this.pool = null;
    this.cache = null;
    this.initialized = false;
  }

  _safeDisconnect(node) {
    if (!node || typeof node.disconnect !== 'function') return;
    try {
      node.disconnect();
    } catch (error) {
      // Already disconnected.
    }
  }
}

export default SFXBus;
