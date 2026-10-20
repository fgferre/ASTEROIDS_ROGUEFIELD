import { BaseSystem } from '../core/BaseSystem.js';
import SFXBus from './audio/SFXBus.js';
import MusicMixer from './audio/MusicMixer.js';
import FileTrackManager, {
  FILE_TRACK_IDS as FILE_TRACK_MANAGER_IDS,
} from './audio/FileTrackManager.js';
import DuckingController from './audio/DuckingController.js';
import { registerAudioEventCues } from './audio/eventDispatch.js';
import { interceptSampleCues } from './audio/samplePlayer.js';
import * as bossVoice from './audio/bossVoice.js';
import {
  createThrusterState,
  followThrusterEffect,
  stopIdleThrusters,
} from './audio/thrusterEvents.js';
import {
  captureRandomScopes,
  clearRandomDebugControls,
  createRandomScopes,
  exposeRandomDebugControls,
  reseedRandomScopes,
} from './audio/randomScopes.js';
import RandomService from '../core/RandomService.js';
import { resolveService } from '../core/serviceUtils.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../core/GameConstants.js';
import {
  AUDIO_BIG_MOMENT_DUCK,
  AUDIO_MASTER_LIMITER,
} from '../data/audio/mix.js';

class AudioSystem extends BaseSystem {
  constructor(dependencies = {}) {
    super(dependencies, {
      systemName: 'AudioSystem',
      serviceName: 'audio',
    });
    this.context = null;
    this.masterGain = null;
    this.masterLimiter = null;
    this.musicGain = null;
    this.effectsGain = null;
    this.initialized = false;
    this.sounds = new Map();
    this.settings = resolveService('settings', this.dependencies);
    this.random =
      resolveService('random', this.dependencies) ||
      (this.dependencies && this.dependencies.random) ||
      new RandomService('audio-system:fallback');
    this.randomScopes = {
      ...createRandomScopes(this.random),
      seeds: null,
      cacheSnapshot: null,
      batcherSnapshot: null,
    };
    this._fallbackRandom = null;
    this.volumeState = {
      master: 0.25,
      music: 0.6,
      effects: 1,
      muteAll: false,
    };

    // SFXBus (INFRA-02) — owns ALL SFX synthesis + the AudioPool/AudioCache/
    // AudioBatcher/ThrusterLoopManager INSTANCES (the four helper FILES stay at
    // src/modules/; only the method bodies + ownership relocated here — AGENTS.md:7).
    // Composed inside the stable `audio` service (RESEARCH A3, no new manifest dep).
    // Construction does NO AudioContext work; init() builds its ambient/protected
    // buses + instances once the context + effects stages exist. Game events
    // reach it through the event → sound table (src/data/audio/eventCues.js).
    this.sfxBus = new SFXBus();
    // Wire the bus's facade seams up-front (before init) so its play* delegations
    // route through the centralized ensureRunning gate (which early-returns when
    // the facade is not yet initialized) and always read the live context/scopes.
    this._wireSfxBusSeams();
    // The boss roar, the facade's own cue, goes through the sample layer too.
    interceptSampleCues(this, this.sfxBus.samples, { facade: true });

    // Performance tracking
    this.performanceMonitor = {
      enabled: true,
      frameCount: 0,
      audioCallsPerFrame: 0,
      averageCallsPerFrame: 0,
      peakCallsPerFrame: 0,
      lastFrameTime: performance.now(),
      totalAudioCalls: 0,
    };

    // AudioContext resume coordination
    this.resumePromise = null;
    this.pendingSoundQueue = [];

    // Low health warning state
    this.lowHealthWarning = false;

    // Run-following music inputs: the player's position (pan + distance
    // reference for enemy-side cues) and the wave's enemies alive or still to spawn (density proxy:
    // wave-started totalEnemies + enemy-spawned + fragments − enemy-destroyed).
    this.listenerX = GAME_WIDTH / 2;
    this.listenerY = GAME_HEIGHT / 2;
    this.runEnemyCount = 0;

    // MusicMixer (INFRA-02 / AUDIO-01) — composed inside the stable `audio`
    // service (RESEARCH A3). Construction does NO AudioContext work; init() is
    // called from AudioSystem.init() once the context + buses exist. The event
    // table's music steps (./audio/eventHandlers.js) drive it.
    this.musicMixer = new MusicMixer({
      randomScope: this.randomScopes?.families?.music || this.random,
    });

    // FileTrackManager (INFRA-02) — owns the MP3 streaming catalog + media graph
    // + rejection-safe, resume-race-hardened, ordered playback starts. Composed
    // inside the stable `audio` service. Construction does NO AudioContext work;
    // init() is called from AudioSystem.init() once the context + buses exist.
    // The facade keeps the screen orchestration and DELEGATES track play/stop
    // to the manager. `currentScreen` stays on the facade because it is
    // driven by screen/overlay events, not by the media graph.
    this.fileTrackManager = new FileTrackManager();
    this.currentScreen = null;

    // DuckingController (INFRA-02 / AUDIO-03) — owns DEDICATED duck nodes
    // (musicDuckGain/effectsDuckGain) that REST at 1.0 and splice into both
    // chains; multiplicative by topology (D-11), never touches the slider stages.
    // Construction does NO AudioContext work; init() splices the duck nodes from
    // AudioSystem.init() after the buses + MusicMixer exist.
    this.duckingController = new DuckingController();

    // Low-HP duck edge-detection latch (review fix): the duck fires only on the
    // CROSSING into ≤25% HP, re-armed when HP recovers above the threshold.
    this.lowHealthDuckArmed = false;

    // Thruster sound system — the ThrusterLoopManager instance lives inside
    // SFXBus; the event-driven state machine is ./audio/thrusterEvents.js, its
    // state and inactivity timer stay here.
    this.thrusterState = createThrusterState();
    this.thrusterInactivityCheckInterval = null;

    this.captureRandomScopes();
    this.bootstrapSettings();
    this._exposeRandomDebugControls();
    this._setupEarlyInit();
    this._warmupEagerFileTracks();
    // The SFX samples load with the boot (a page only: node tests have none).
    if (typeof document !== 'undefined') this.sfxBus.samples.load();
  }

  // ---------------------------------------------------------------------------
  // File-track facade API (INFRA-02 — ownership relocated to FileTrackManager).
  //
  // These thin delegators + compatibility accessors preserve the public facade
  // surface (review requirement: facade API compatibility) while the manager is
  // the single owner of the catalog + media graph + fades + lifecycle.
  // ---------------------------------------------------------------------------

  /** @deprecated Compatibility accessor — the catalog lives on the manager. */
  get fileTrackCatalog() {
    return this.fileTrackManager?.catalog;
  }

  /** Compatibility accessor exposing the manager's track state container. */
  get fileTrackState() {
    const manager = this.fileTrackManager;
    if (!manager) {
      return { activeTrackId: null, currentScreen: null, tracks: {} };
    }
    return {
      get activeTrackId() {
        return manager.activeTrackId;
      },
      set activeTrackId(value) {
        manager.activeTrackId = value;
      },
      get currentScreen() {
        return manager.currentScreen;
      },
      set currentScreen(value) {
        manager.currentScreen = value;
      },
      tracks: manager.tracks,
    };
  }

  /** Compatibility accessor: the menu track's config from the manager catalog. */
  get menuTrackConfig() {
    return (
      this.fileTrackManager?.catalog?.[FILE_TRACK_MANAGER_IDS.MENU_OPENING] ||
      null
    );
  }

  /** Compatibility accessor: the menu track's runtime state on the manager. */
  get menuTrackState() {
    return (
      this.fileTrackManager?.tracks?.[FILE_TRACK_MANAGER_IDS.MENU_OPENING] ||
      null
    );
  }

  _getFileTrackState(trackId) {
    return this.fileTrackManager?._getState(trackId) || null;
  }

  _warmupEagerFileTracks() {
    Object.entries(this.fileTrackManager?.catalog || {}).forEach(
      ([trackId, config = {}]) => {
        if (config.preloadPolicy === 'eager') {
          this.warmupFileTrack(trackId);
        }
      }
    );
  }

  // ---------------------------------------------------------------------------
  // SFX optimization instances (INFRA-02 — ownership relocated to SFXBus).
  //
  // The pool/cache/batcher/thrusterLoopManager INSTANCES live on SFXBus now;
  // these compatibility accessors preserve the facade surface (the determinism +
  // port regression suites and reset/destroy still read/assign `audio.pool`,
  // `audio.cache`, `audio.batcher`). The four helper FILES were never moved.
  // ---------------------------------------------------------------------------

  get pool() {
    return this.sfxBus?.pool ?? null;
  }
  set pool(value) {
    if (this.sfxBus) this.sfxBus.pool = value;
  }

  get cache() {
    return this.sfxBus?.cache ?? null;
  }
  set cache(value) {
    if (this.sfxBus) this.sfxBus.cache = value;
  }

  get batcher() {
    return this.sfxBus?.batcher ?? null;
  }
  set batcher(value) {
    if (this.sfxBus) this.sfxBus.batcher = value;
  }

  /**
   * Sets up early audio initialization on first user interaction
   * This ensures audio works immediately, even before game starts
   */
  _setupEarlyInit() {
    if (typeof document === 'undefined') return;

    const initOnInteraction = async () => {
      if (!this.initialized) {
        try {
          await this.init();
        } catch (e) {
          console.warn('[AudioSystem] Early init failed:', e);
        }
      }
      // Remove listeners after first interaction
      document.removeEventListener('pointerdown', initOnInteraction, true);
      document.removeEventListener('keydown', initOnInteraction, true);
      document.removeEventListener('touchstart', initOnInteraction, true);
    };

    // Use capture phase to catch events early
    document.addEventListener('pointerdown', initOnInteraction, true);
    document.addEventListener('keydown', initOnInteraction, true);
    document.addEventListener('touchstart', initOnInteraction, true);
  }

  async init() {
    if (this.initialized) return;

    try {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      await this.context.resume();

      this.masterGain = this.context.createGain();
      this.masterGain.connect(this.context.destination);

      // Soft limiter on the summed buses: music + effects → limiter → master.
      this.masterLimiter = this.context.createDynamicsCompressor();
      this.masterLimiter.threshold.value = AUDIO_MASTER_LIMITER.thresholdDb;
      this.masterLimiter.knee.value = AUDIO_MASTER_LIMITER.kneeDb;
      this.masterLimiter.ratio.value = AUDIO_MASTER_LIMITER.ratio;
      this.masterLimiter.attack.value = AUDIO_MASTER_LIMITER.attackSeconds;
      this.masterLimiter.release.value = AUDIO_MASTER_LIMITER.releaseSeconds;
      this.masterLimiter.connect(this.masterGain);

      this.musicGain = this.context.createGain();
      this.effectsGain = this.context.createGain();

      this.musicGain.connect(this.masterLimiter);
      this.effectsGain.connect(this.masterLimiter);

      this.applyVolumeToNodes();
      // AUDIO-01: the adaptive 4-layer music now lives in MusicMixer. It builds
      // its graph here (after the context + buses exist) and connects its
      // pauseFadeGain straight to musicGain (the slider stage). 02.06 re-splices
      // the duck node between pauseFadeGain and musicGain. The run (wave,
      // density, HP) drives its intensity; the boss arc overrides upwards.
      this.musicMixer.init(this.context, this.musicGain);

      // AUDIO-03 (D-11): splice the DEDICATED duck nodes. The controller creates
      // musicDuckGain (rests 1.0) between musicPauseFadeGain and musicGain, and
      // effectsDuckGain (rests 1.0) before effectsGain — each with explicit
      // disconnect-before-reconnect. Multiplicative by topology; the controller
      // never writes the slider stages. Music content (mixer + file tracks) now
      // routes into musicDuckGain; SFX content routes into effectsDuckGain.
      this.duckingController.init(this.context, {
        musicSpliceFrom: this.musicMixer.musicPauseFadeGain,
        musicSpliceTo: this.musicGain,
        effectsSpliceTo: this.effectsGain,
      });

      // SFXBus (INFRA-02): build the ambient/protected output buses + the owned
      // pool/cache/batcher/thruster instances now that the context + effects
      // stages exist. ambientBus → effectsDuckGain (world/enemy SFX duck with the
      // music); protectedBus → effectsGain DIRECTLY (player feedback bypasses the
      // duck — D-14 foundation). The batcher port closes locally inside SFXBus.
      this.sfxBus.init(this.context, {
        effectsDuckGain: this.duckingController.effectsDuckGain,
        effectsGain: this.effectsGain,
        getContext: () => this.context,
        getRandomScopes: () => this.randomScopes,
        safePlay: (fn) => this.safePlay(fn),
        trackPerformance: (name) => this._trackPerformance(name),
        getEffectsFallbackDestination: () => this.getEffectsDestination(),
        randomScopes: this.randomScopes,
      });

      // Re-capture scopes now that the batcher/cache instances exist (the seed
      // snapshot lifecycle reads them via the compatibility accessors).
      this.captureRandomScopes();

      this.initialized = true;

      // FileTrackManager (INFRA-02): build its graph now that the context + buses
      // exist. Its trackGains route into the music DUCK node (not musicGain) so
      // file tracks duck with the music — they join at the duck input, after the
      // mixer's pause/fade stage. Every start goes through the ensureRunning gate.
      this.fileTrackManager.init(
        this.context,
        this.duckingController.musicDuckGain || this.musicGain,
        (thunk) => this.ensureRunning(thunk)
      );

      this._syncMenuTrackForCurrentScreen();

      // Start performance monitoring
      this._startPerformanceMonitoring();

      // Start thruster inactivity checker
      this._startThrusterInactivityChecker();
    } catch (error) {
      console.warn('Áudio não disponível:', error);
      this.initialized = false;
    }
  }

  /**
   * Registers the gameplay listeners that trigger audio feedback: the event →
   * sound table (src/data/audio/eventCues.js), read by eventDispatch.js.
   *
   * Enemy modules emit events (`enemy-fired`, `mine-exploded`, …) instead of
   * touching the AudioSystem, so new enemy types stay decoupled from the sound
   * pipeline: a new cue is a row in the table.
   */
  setupEventListeners() {
    registerAudioEventCues(this);
  }

  updateWaveMusicIntensity(waveEvent = {}) {
    const wave = Number(waveEvent?.wave);
    if (!Number.isFinite(wave) || wave <= 0) {
      return;
    }
    const total = Number(waveEvent?.totalEnemies);
    this.runEnemyCount = Number.isFinite(total) ? Math.max(0, total) : 0;
    this.musicMixer.setRunState({ wave, enemyCount: this.runEnemyCount });
  }

  /** Short music duck on big moments (level-up, large explosions). */
  _duckBigMoment() {
    this.duckingController?.duck({ bus: 'music', ...AUDIO_BIG_MOMENT_DUCK });
  }

  bootstrapSettings() {
    if (
      this.settings &&
      typeof this.settings.getCategoryValues === 'function'
    ) {
      const values = this.settings.getCategoryValues('audio');
      if (values) {
        this.updateVolumeState(values);
        return;
      }
    }

    this.applyVolumeToNodes();
  }

  sanitizeVolume(value, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return Math.min(1, Math.max(0, numeric));
  }

  updateVolumeState(values = {}) {
    this.volumeState = {
      master: this.sanitizeVolume(values.masterVolume, this.volumeState.master),
      music: this.sanitizeVolume(values.musicVolume, this.volumeState.music),
      effects: this.sanitizeVolume(
        values.effectsVolume,
        this.volumeState.effects
      ),
      muteAll: Boolean(values.muteAll ?? this.volumeState.muteAll),
    };

    this.applyVolumeToNodes();
  }

  applyVolumeToNodes() {
    if (!this.masterGain) {
      return;
    }

    // Master scales the summed mix once, at masterGain (after the limiter); the
    // bus sliders carry only the per-bus mix.
    const { master, music, effects, muteAll } = this.volumeState;
    const masterValue = muteAll ? 0 : master;

    this.masterGain.gain.value = masterValue;

    if (this.musicGain) {
      this.musicGain.gain.value = muteAll ? 0 : music;
    }

    if (this.effectsGain) {
      this.effectsGain.gain.value = muteAll ? 0 : effects;
    }
  }

  getEffectsDestination() {
    // SFX content routes into the effects DUCK node (rests 1.0) so all SFX duck
    // together (interim — 02.07 adds a protected branch for roars). Falls back to
    // the slider stage before the duck node is spliced, then masterGain.
    const duckInput = this.duckingController?.getEffectsInput?.();
    if (duckInput) {
      return duckInput;
    }
    if (this.effectsGain) {
      return this.effectsGain;
    }
    if (this.masterGain) {
      return this.masterGain;
    }
    return null;
  }

  connectGainNode(node) {
    const destination = this.getEffectsDestination();
    if (destination && node && typeof node.connect === 'function') {
      node.connect(destination);
    }
  }

  /**
   * Build the AudioBatcher's SfxSynthPort.
   *
   * Compatibility shim (INFRA-02): the SFX synthesis now lives in SFXBus, so the
   * port is built from SFXBus's OWN bound methods — the cycle closes locally
   * inside the bus, never through the facade. The facade ensures the bus is wired
   * to its live context/scopes/gate first so a caller that builds the port
   * directly (the determinism + port regression suites set facade.context/pool
   * then call this) gets a working port without a full init().
   *
   * @returns {Readonly<object>} The frozen SFX synth port.
   */
  _createSfxSynthPort() {
    this._wireSfxBusSeams();
    return this.sfxBus.createSfxSynthPort();
  }

  /**
   * Point SFXBus's injected seams at the facade's live fields. Idempotent and
   * cheap — called from init() implicitly (via sfxBus.init) and from
   * _createSfxSynthPort() so the bus works even when a test bypasses init() and
   * assigns facade.context/pool directly.
   * @private
   */
  _wireSfxBusSeams() {
    if (!this.sfxBus) return;
    this.sfxBus._getContext = () => this.context;
    this.sfxBus._getRandomScopes = () => this.randomScopes;
    this.sfxBus._safePlay = (fn) => this.safePlay(fn);
    this.sfxBus._trackPerformance = (name) => this._trackPerformance(name);
    this.sfxBus._getEffectsFallbackDestination = () =>
      this.getEffectsDestination();
  }

  _handleScreenChanged(payload = {}) {
    if (typeof payload?.screen === 'string' && payload.screen) {
      this.fileTrackState.currentScreen = payload.screen;
      if (this.menuTrackState) {
        this.menuTrackState.currentScreen = payload.screen;
      }
    }

    this.sfxBus.playMenuTransition();
    this._syncMenuTrackForCurrentScreen();
  }

  _handleOverlayVisibilityChanged(payload = {}) {
    const overlay = payload?.overlay;
    const isOpen = Boolean(payload?.isOpen);
    const source = typeof payload?.source === 'string' ? payload.source : null;

    if (!['settings', 'credits'].includes(overlay)) {
      return;
    }

    if (isOpen) {
      if (source !== 'menu') {
        return;
      }
      this.fileTrackState.currentScreen = overlay;
      if (this.menuTrackState) {
        this.menuTrackState.currentScreen = overlay;
      }
    } else if (
      source === 'menu' ||
      this.fileTrackState.currentScreen === overlay
    ) {
      this.fileTrackState.currentScreen = 'menu';
      if (this.menuTrackState) {
        this.menuTrackState.currentScreen = 'menu';
      }
    } else {
      return;
    }

    this._syncMenuTrackForCurrentScreen();
  }

  _syncMenuTrackForCurrentScreen() {
    const currentScreen = this.fileTrackManager?.currentScreen;
    if (!currentScreen) {
      return;
    }

    if (currentScreen === 'menu') {
      // playFileTrack delegates to FileTrackManager.playTrack, which routes the
      // start through the centralized ensureRunning gate (resume-race-safe).
      this.playFileTrack(FILE_TRACK_MANAGER_IDS.MENU_OPENING);
      return;
    }

    this.stopFileTrack(FILE_TRACK_MANAGER_IDS.MENU_OPENING);
  }

  // --- File-track delegators (FileTrackManager is the owner; INFRA-02) --------

  warmupFileTrack(trackId) {
    return this.fileTrackManager?.warmupTrack(trackId) || null;
  }

  ensureFileTrackGraph(trackId) {
    return this.fileTrackManager?.ensureTrackGraph(trackId) || null;
  }

  playFileTrack(trackId) {
    this.fileTrackManager?.playTrack(trackId);
  }

  stopFileTrack(trackId, options = {}) {
    this.fileTrackManager?.stopTrack(trackId, options);
  }

  _evictAllFileTracks({ resetCurrentScreen = false } = {}) {
    const manager = this.fileTrackManager;
    if (!manager) {
      return;
    }
    Object.keys(manager.catalog || {}).forEach((trackId) => {
      manager.evictTrack(trackId);
    });
    manager.activeTrackId = null;
    if (resetCurrentScreen) {
      manager.currentScreen = null;
    }
  }

  handleBossEvent(eventName, payload = {}) {
    switch (eventName) {
      case 'boss-spawned':
        this.playBossRoar(payload);
        break;
      case 'boss-phase-changed':
        this.playBossPhaseChange(payload);
        break;
      case 'boss-defeated':
        this.playBossDefeated(payload);
        break;
      default:
        break;
    }
  }

  /**
   * Centralized AudioContext resume gate (INFRA-02 resume-race ownership, plan
   * 02.06). EVERY playback start path — SFX (safePlay) and file tracks
   * (FileTrackManager) — funnels through this ONE gate so there is a single
   * resume path and a deterministic ordered (FIFO) flush.
   *
   *   - Fast path: context already running → invoke the thunk synchronously.
   *   - Slow path: context suspended (or a resume is already in flight) → queue
   *     the thunk into the ordered pending queue and trigger one resume(); on
   *     resolve every queued thunk fires in REQUEST ORDER, exactly once.
   *
   * The seam is designed so Phase 5a INFRA-16 can make it synchronous without
   * changing callers.
   *
   * @param {Function} thunk - The playback-start work to run once running.
   */
  ensureRunning(thunk) {
    if (!this.initialized || !this.context || typeof thunk !== 'function') {
      return;
    }

    if (this.context.state !== 'running' || this.resumePromise) {
      this.pendingSoundQueue.push(thunk);
      this._ensureContextResumed();
      return;
    }

    if (this.pendingSoundQueue.length) {
      this._flushPendingSounds();
    }

    this._invokeSoundFunction(thunk);
  }

  safePlay(soundFunction) {
    // safePlay is the SFX-facing alias of the centralized resume gate. Both
    // share the single pendingSoundQueue so SFX and file-track starts flush in a
    // single deterministic order.
    this.ensureRunning(soundFunction);
  }

  _ensureContextResumed() {
    if (
      !this.context ||
      this.context.state === 'running' ||
      this.resumePromise
    ) {
      return;
    }

    this.resumePromise = this.context
      .resume()
      .catch((error) => {
        console.warn('Erro ao retomar contexto de áudio:', error);
      })
      .finally(() => {
        this.resumePromise = null;
        this._flushPendingSounds();
      });
  }

  _flushPendingSounds() {
    if (!this.pendingSoundQueue.length) {
      return;
    }

    if (!this.context || this.context.state !== 'running') {
      this.pendingSoundQueue.length = 0;
      return;
    }

    const queuedSounds = this.pendingSoundQueue.splice(0);
    queuedSounds.forEach((callback) => {
      this._invokeSoundFunction(callback);
    });
  }

  _invokeSoundFunction(callback) {
    try {
      callback();
    } catch (error) {
      console.warn('Erro ao reproduzir som:', error);
    }
  }

  // Sound effects play on the SFXBus (`audio.sfxBus.play*`). The boss's own
  // voice is synthesized by ./audio/bossVoice.js through this facade.

  playBossRoar() {
    bossVoice.playBossRoar(this);
  }

  playBossPhaseChange(payload = {}) {
    bossVoice.playBossPhaseChange(this, payload);
  }

  playBossDefeated() {
    bossVoice.playBossDefeated(this);
  }

  // --- Seeded RNG scopes (./audio/randomScopes.js) ---

  captureRandomScopes(options) {
    return captureRandomScopes(this, options);
  }

  reseedRandomScopes(options) {
    return reseedRandomScopes(this, options);
  }

  // INFRA-03: the dev-only window.__AUDIO_RANDOM_DEBUG__ global, gated at build
  // time and at runtime (see exposeRandomDebugControls).
  _exposeRandomDebugControls() {
    exposeRandomDebugControls(this);
  }

  // === THRUSTER SOUNDS (state machine: ./audio/thrusterEvents.js) ===

  handleThrusterEffect(data) {
    followThrusterEffect(this, data);
  }

  /** Every 50 ms, stops the loops that stopped hearing thruster events. */
  _startThrusterInactivityChecker() {
    if (this.thrusterInactivityCheckInterval) {
      clearInterval(this.thrusterInactivityCheckInterval);
    }
    this.thrusterInactivityCheckInterval = setInterval(() => {
      stopIdleThrusters(this);
    }, 50);
  }

  reset() {
    clearRandomDebugControls();
    this._evictAllFileTracks({ resetCurrentScreen: true });

    // Cleanup the SFX optimization instances + thruster loops (owned by SFXBus).
    if (this.sfxBus) {
      this.sfxBus.reset();
    }

    if (this.thrusterInactivityCheckInterval) {
      clearInterval(this.thrusterInactivityCheckInterval);
      this.thrusterInactivityCheckInterval = null;
    }
    if (this.thrusterState) {
      this.thrusterState.lastEventTime = { main: 0, retro: 0, side: 0 };
    }

    // Reset performance monitoring
    this._resetPerformanceMonitoring();

    // Clear pending playback queue
    this.pendingSoundQueue.length = 0;
    this.resumePromise = null;

    // AUDIO-01: the adaptive music now lives in MusicMixer — back to a fresh
    // run (no wave, no density, no boss floor) on a new run/replay.
    if (this.musicMixer) {
      this.musicMixer.resetRun();
    }
    this.runEnemyCount = 0;
    this.listenerX = GAME_WIDTH / 2;
    this.listenerY = GAME_HEIGHT / 2;

    // Re-arm the low-HP edges so the first dip below 25% in the new run ducks.
    this.lowHealthWarning = false;
    this.lowHealthDuckArmed = false;

    this.reseedRandomScopes();
  }

  onDestroy() {
    this._evictAllFileTracks({ resetCurrentScreen: true });
    clearRandomDebugControls();
    if (this.thrusterInactivityCheckInterval) {
      clearInterval(this.thrusterInactivityCheckInterval);
      this.thrusterInactivityCheckInterval = null;
    }
    // Tear down SFXBus: stop thruster loops, clean batcher/pool/cache, detach the
    // ambient/protected buses (idempotent).
    if (this.sfxBus && typeof this.sfxBus.dispose === 'function') {
      this.sfxBus.dispose();
    }
    // Stop the MusicMixer lookahead + release its nodes (no leaked timer).
    if (this.musicMixer && typeof this.musicMixer.dispose === 'function') {
      this.musicMixer.dispose();
    }
    // Tear down the FileTrackManager (idempotent; detaches all track nodes).
    if (
      this.fileTrackManager &&
      typeof this.fileTrackManager.dispose === 'function'
    ) {
      this.fileTrackManager.dispose();
    }
    // Un-splice the duck nodes (restores the direct connections; idempotent).
    if (
      this.duckingController &&
      typeof this.duckingController.dispose === 'function'
    ) {
      this.duckingController.dispose();
    }
  }

  // === Performance Monitoring ===

  /**
   * Inicia o sistema de monitoramento de performance
   */
  _startPerformanceMonitoring() {
    if (!this.performanceMonitor.enabled) return;

    // Update performance stats every second
    setInterval(() => {
      this._updatePerformanceStats();
    }, 1000);
  }

  /**
   * Tracked de chamadas de áudio para performance
   */
  _trackPerformance() {
    if (!this.performanceMonitor.enabled) return;

    this.performanceMonitor.audioCallsPerFrame++;
    this.performanceMonitor.totalAudioCalls++;
  }

  /**
   * Atualiza estatísticas de performance
   */
  _updatePerformanceStats() {
    const now = performance.now();
    const deltaTime = now - this.performanceMonitor.lastFrameTime;

    if (deltaTime >= 1000) {
      // Update every second
      this.performanceMonitor.frameCount++;

      // Calculate average calls per frame
      const avgCalls = this.performanceMonitor.audioCallsPerFrame;
      this.performanceMonitor.averageCallsPerFrame =
        (this.performanceMonitor.averageCallsPerFrame + avgCalls) / 2;

      // Track peak calls
      if (avgCalls > this.performanceMonitor.peakCallsPerFrame) {
        this.performanceMonitor.peakCallsPerFrame = avgCalls;
      }

      // Reset frame counters
      this.performanceMonitor.audioCallsPerFrame = 0;
      this.performanceMonitor.lastFrameTime = now;

      // Log performance periodically (every 10 seconds)
      if (this.performanceMonitor.frameCount % 10 === 0) {
        this._logPerformanceStats();
      }
    }
  }

  /**
   * Log de estatísticas de performance
   */
  _logPerformanceStats() {
    if (!this.performanceMonitor.enabled) return;

    const poolStats = this.pool ? this.pool.getStats() : null;
    const cacheStats = this.cache ? this.cache.getStats() : null;
    const batcherStats = this.batcher ? this.batcher.getStats() : null;

    console.log('[AudioSystem] Performance Stats:', {
      totalAudioCalls: this.performanceMonitor.totalAudioCalls,
      averageCallsPerFrame:
        this.performanceMonitor.averageCallsPerFrame.toFixed(1),
      peakCallsPerFrame: this.performanceMonitor.peakCallsPerFrame,
      pool: poolStats,
      cache: cacheStats,
      batcher: batcherStats,
    });
  }

  /**
   * Reset de monitoramento de performance
   */
  _resetPerformanceMonitoring() {
    this.performanceMonitor = {
      enabled: true,
      frameCount: 0,
      audioCallsPerFrame: 0,
      averageCallsPerFrame: 0,
      peakCallsPerFrame: 0,
      lastFrameTime: performance.now(),
      totalAudioCalls: 0,
    };

    if (this.pool) this.pool.resetStats();
    if (this.cache) this.cache.resetStats();
    if (this.batcher) this.batcher.resetStats();
  }
}

export default AudioSystem;
