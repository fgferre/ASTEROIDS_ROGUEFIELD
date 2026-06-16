import { BaseSystem } from '../core/BaseSystem.js';
import SFXBus from './audio/SFXBus.js';
import MusicMixer from './audio/MusicMixer.js';
import FileTrackManager, {
  FILE_TRACK_IDS as FILE_TRACK_MANAGER_IDS,
} from './audio/FileTrackManager.js';
import DuckingController from './audio/DuckingController.js';
import RandomService from '../core/RandomService.js';
import { resolveService } from '../core/serviceUtils.js';
import {
  GameDebugLogger,
  isDevEnvironment,
} from '../utils/dev/GameDebugLogger.js';
import {
  BOSS_AUDIO_FREQUENCY_PRESETS,
  MUSIC_LAYER_CONFIG,
} from '../core/GameConstants.js';
import { WAVE_BOSS_INTERVAL } from '../data/constants/gameplay.js';

const DEV_MODE = isDevEnvironment();

class AudioSystem extends BaseSystem {
  constructor(dependencies = {}) {
    super(dependencies, {
      systemName: 'AudioSystem',
      serviceName: 'audio',
    });
    this.context = null;
    this.masterGain = null;
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
      ...this._createRandomScopes(this.random),
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
    // buses + instances once the context + effects stages exist. The facade keeps
    // EventBus listeners + thin delegations; the relocated private bodies are GONE.
    this.sfxBus = new SFXBus();
    // Wire the bus's facade seams up-front (before init) so its play* delegations
    // route through the centralized ensureRunning gate (which early-returns when
    // the facade is not yet initialized) and always read the live context/scopes.
    this._wireSfxBusSeams();

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

    // UI sound debouncing
    this.lastUIHoverTime = 0;

    const initialIntensityLevel =
      typeof MUSIC_LAYER_CONFIG?.initialIntensity === 'number'
        ? MUSIC_LAYER_CONFIG.initialIntensity
        : 0;

    this.musicController = {
      initialized: false,
      layers: {},
      intensityLevel: initialIntensityLevel,
      targetLevel: initialIntensityLevel,
      bossActive: false,
      relaxTimeout: null,
      lastNonBossIntensity: initialIntensityLevel,
      pendingNonBossIntensity: null,
      relaxedIntensity:
        typeof MUSIC_LAYER_CONFIG?.relaxedIntensity === 'number'
          ? MUSIC_LAYER_CONFIG.relaxedIntensity
          : initialIntensityLevel,
      bossIntensity:
        typeof MUSIC_LAYER_CONFIG?.bossIntensity === 'number'
          ? MUSIC_LAYER_CONFIG.bossIntensity
          : initialIntensityLevel,
      rampDurations: {
        rise: MUSIC_LAYER_CONFIG?.rampDurations?.rise ?? 1.2,
        fall: MUSIC_LAYER_CONFIG?.rampDurations?.fall ?? 2.0,
        bossRise: MUSIC_LAYER_CONFIG?.rampDurations?.bossRise ?? 0.6,
        bossFall: MUSIC_LAYER_CONFIG?.rampDurations?.bossFall ?? 2.8,
      },
    };

    this.bossAudioState = {
      lastPhase: null,
    };

    // MusicMixer (INFRA-02 / AUDIO-01) — composed inside the stable `audio`
    // service (RESEARCH A3). Construction does NO AudioContext work; init() is
    // called from AudioSystem.init() once the context + buses exist. The facade
    // keeps the EventBus listeners and DELEGATES the boss arc + pause to it.
    this.musicMixer = new MusicMixer({
      randomScope: this.randomScopes?.families?.music || this.random,
    });

    // FileTrackManager (INFRA-02) — owns the MP3 streaming catalog + media graph
    // + rejection-safe, resume-race-hardened, ordered playback starts. Composed
    // inside the stable `audio` service. Construction does NO AudioContext work;
    // init() is called from AudioSystem.init() once the context + buses exist.
    // The facade keeps the EventBus + screen orchestration and DELEGATES track
    // play/stop to the manager. `currentScreen` stays on the facade because it is
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

    // Thruster sound system — the ThrusterLoopManager instance now lives inside
    // SFXBus; the facade keeps the event-driven state machine + inactivity timer
    // and delegates the actual loop/burst synthesis into SFXBus.
    this.thrusterState = {
      lastIntensity: { main: 0, retro: 0, side: 0 },
      lastEventTime: { main: 0, retro: 0, side: 0 }, // Timestamp of last event per type
      startThreshold: 0.1, // Intensity threshold to start thruster sound
      stopThreshold: 0.05, // Hysteresis: lower threshold to stop (prevents flapping)
      inactivityTimeout: 150, // ms: stop loop if no event received for this duration
    };
    this.thrusterInactivityCheckInterval = null;

    this.captureRandomScopes();
    this.bootstrapSettings();
    this._exposeRandomDebugControls();
    this._setupEarlyInit();
    this._warmupEagerFileTracks();
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

  /** @deprecated Compatibility accessor — the instance lives on SFXBus. */
  get thrusterLoopManager() {
    return this.sfxBus?.thrusterLoops ?? null;
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

      this.musicGain = this.context.createGain();
      this.effectsGain = this.context.createGain();

      this.musicGain.connect(this.masterGain);
      this.effectsGain.connect(this.masterGain);

      this.applyVolumeToNodes();
      // AUDIO-01: the adaptive 4-layer music now lives in MusicMixer. It builds
      // its graph here (after the context + buses exist) and connects its
      // pauseFadeGain straight to musicGain (the slider stage). 02.06 re-splices
      // the duck node between pauseFadeGain and musicGain. The legacy
      // initializeMusicController() wave-number heuristic is bypassed — ONLY the
      // boss arc drives music (D-04).
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
   * Registers listeners for gameplay events that trigger audio feedback.
   *
   * Enemy modules should emit `enemy-fired`/`mine-exploded` so that all audio
   * synthesis stays centralized here instead of touching the AudioSystem
   * directly. This keeps new enemy types decoupled from the sound pipeline
   * while still allowing bespoke effects per archetype.
   */
  setupEventListeners() {
    this.registerEventListener('settings-audio-changed', (payload = {}) => {
      if (payload?.values) {
        this.updateVolumeState(payload.values);
      }
    });

    this.registerEventListener('weapon-fired', (data) => {
      this.playLaserShot(data || {});
    });

    this.registerEventListener('combat-target-lock', (data) => {
      if (data?.lost) {
        return;
      }
      this.playTargetLock(data || {});
    });

    this.registerEventListener('enemy-destroyed', (data) => {
      if (!data) return;

      // Epic sound when Gold asteroid is destroyed
      if (data.variant === 'gold') {
        this.playGoldJackpot();
      }

      this.playAsteroidBreak(data.size);
      if (data.size === 'large') {
        this.playBigExplosion();
      }
    });

    this.registerEventListener('asteroid-volatile-exploded', () => {
      this.playBigExplosion();
    });

    this.registerEventListener('player-leveled-up', () => {
      this.playLevelUp();
    });

    this.registerEventListener('xp-collected', () => {
      // All orbs play same sound (all are tier 1 blue)
      this.playXPCollect();
    });

    this.registerEventListener('xp-orb-fused', (data) => {
      // Play fusion sound based on tier
      this.playOrbFusion(data?.toClass);
    });

    this.registerEventListener('enemy-spawned', (data) => {
      // Special sound for Gold spawn
      if (data?.enemy?.variant === 'gold') {
        this.playGoldSpawn();
      }
    });

    // Enemy modules fire projectiles/explosions exclusively through events so
    // the audio layer can orchestrate batching and pooling.
    this.registerEventListener('enemy-fired', (data = {}) => {
      const enemyType = (
        data?.enemyType ||
        data?.enemy?.type ||
        ''
      ).toLowerCase();

      if (enemyType === 'drone') {
        this.playDroneFire(data);
        return;
      }

      if (enemyType === 'hunter') {
        this.playHunterBurst(data);
        return;
      }
    });

    // wave-started no longer drives music (D-04: ONLY the boss arc does). The
    // pre-boss tension now comes from the `boss-warning` event (02.03) above.
    // The listener stays registered (audio may use wave context later) but the
    // legacy wave-number intensity heuristic is intentionally bypassed.
    this.registerEventListener('wave-started', () => {});

    this.registerEventListener('mine-exploded', (data = {}) => {
      this.playMineExplosion(data);
    });

    // Boss arc → MusicMixer (D-04): the ONLY driver of music intensity. The
    // roar/phase/defeat SFX stay on the facade (BossAudio lands in a later plan).
    this.registerEventListener('boss-warning', (data = {}) => {
      this.musicMixer.setIntensityFromBossEvent('boss-warning', data);
    });

    this.registerEventListener('boss-spawned', (data = {}) => {
      this.playBossRoar(data);
      this.musicMixer.setIntensityFromBossEvent('boss-spawned', data);
    });

    this.registerEventListener('boss-phase-changed', (data = {}) => {
      this.playBossPhaseChange(data);
      this.musicMixer.setIntensityFromBossEvent('boss-phase-changed', data);
    });

    this.registerEventListener('boss-defeated', (data = {}) => {
      this.playBossDefeated(data);
      this.musicMixer.setIntensityFromBossEvent('boss-defeated', data);
    });

    this.registerEventListener('bullet-hit', (data) => {
      const effectiveDamage = Number.isFinite(data?.effectiveDamage)
        ? data.effectiveDamage
        : Number.isFinite(data?.damage)
          ? data.damage
          : 0;

      if (data?.blocked && data?.invulnerable) {
        this.playBossShieldDeflect();
      } else if (effectiveDamage > 0 || data?.killed) {
        this.playBulletHit(data?.killed || false);
      }
    });

    this.registerEventListener('player-took-damage', () => {
      this.playShipHit();
    });

    this.registerEventListener('shield-activated', () => {
      this.playShieldActivate();
    });

    this.registerEventListener('shield-hit', () => {
      this.playShieldImpact();
    });

    this.registerEventListener('shield-broken', () => {
      this.playShieldBreak();
    });

    this.registerEventListener('shield-recharged', () => {
      this.playShieldRecharged();
    });

    this.registerEventListener('shield-activation-failed', () => {
      this.playShieldFail();
    });

    this.registerEventListener('shield-shockwave', () => {
      this.playShieldShockwave();
    });

    // UI Sound Effects
    this.registerEventListener('upgrade-applied', (data) => {
      this.playUpgradeSelect(data?.rarity || 'common');
    });

    this.registerEventListener('pause-state-changed', (data) => {
      // D-10: pause the adaptive music (underwater lowpass + 50% + gain/grid
      // freeze, SC1 no drift). The pause/resume SFX stay on the facade.
      this.musicMixer.pause(!!data?.isPaused);
      if (data?.isPaused) {
        this.playPauseOpen();
      } else {
        this.playPauseClose();
      }
    });

    this.registerEventListener('screen-changed', (payload = {}) => {
      this._handleScreenChanged(payload);
    });

    this.registerEventListener(
      'ui-overlay-visibility-changed',
      (payload = {}) => {
        this._handleOverlayVisibilityChanged(payload);
      }
    );

    this.registerEventListener('input-confirmed', () => {
      this.playUISelect();
    });

    // UI hover (debounced to prevent accumulation)
    this.registerEventListener('ui-hover', () => {
      const now = performance.now();
      // Simple debouncing: only play if 80ms have passed since last hover sound
      if (now - this.lastUIHoverTime > 80) {
        this.lastUIHoverTime = now;
        this.playUIHover();
      }
    });

    // Game started
    this.registerEventListener('game-started', () => {
      this.playUIStartGame();
    });

    // Low health warning + low-HP duck (AUDIO-03 / SC3, D-11). Both fire on the
    // CROSSING into ≤25% HP only (edge detection — review fix): repeated health
    // events while already below 25% must NOT machine-gun retrigger the duck.
    this.registerEventListener('player-health-changed', (data) => {
      const healthPercent = data?.health / data?.maxHealth;
      const belowThreshold = healthPercent <= 0.25 && healthPercent > 0;

      if (belowThreshold) {
        // Only play / duck if we just CROSSED into the low-health state.
        if (!this.lowHealthWarning) {
          this.playLowHealthWarning();
          this.lowHealthWarning = true;
        }
        if (!this.lowHealthDuckArmed) {
          // Crossing edge → one duck on the music bus; re-armed on recovery.
          this.duckingController?.duck({ bus: 'music' });
          this.lowHealthDuckArmed = true;
        }
      } else {
        // Above the threshold (or dead) → re-arm both edges for the next dip.
        this.lowHealthWarning = false;
        this.lowHealthDuckArmed = false;
      }
    });

    // Thruster sounds (continuous loops)
    this.registerEventListener('thruster-effect', (data) => {
      this.handleThrusterEffect(data || {});
    });
  }

  updateWaveMusicIntensity(waveEvent = {}) {
    const intensities = MUSIC_LAYER_CONFIG?.intensities || [];
    if (!intensities.length) {
      return;
    }

    const waveNumber = Number(waveEvent?.wave);
    if (!Number.isFinite(waveNumber) || waveNumber <= 0) {
      return;
    }

    const isBossWave = this._isBossWaveEvent(waveEvent, waveNumber);
    const targetLevel = this._calculateWaveIntensityLevel(waveNumber);

    if (isBossWave) {
      this.musicController.pendingNonBossIntensity = null;
      return;
    }

    this.musicController.lastNonBossIntensity = targetLevel;

    if (this.musicController.bossActive) {
      this.musicController.pendingNonBossIntensity = targetLevel;
      return;
    }

    if (
      targetLevel === this.musicController.targetLevel &&
      targetLevel === this.musicController.intensityLevel
    ) {
      this.musicController.pendingNonBossIntensity = null;
      return;
    }

    this.musicController.pendingNonBossIntensity = null;

    const gentleRamp =
      this.musicController?.rampDurations?.rise ??
      this.musicController?.rampDurations?.fall ??
      1.2;

    this.setMusicIntensity(targetLevel, {
      rampDuration: gentleRamp,
    });
  }

  _isBossWaveEvent(waveEvent = {}, waveNumber = null) {
    if (typeof waveEvent?.isBossWave === 'boolean') {
      return waveEvent.isBossWave;
    }

    const configFlag = waveEvent?.config?.isBossWave;
    if (typeof configFlag === 'boolean') {
      return configFlag;
    }

    const resolvedWaveNumber = Number.isFinite(waveNumber)
      ? waveNumber
      : Number(waveEvent?.wave);
    if (!Number.isFinite(resolvedWaveNumber) || resolvedWaveNumber <= 0) {
      return false;
    }

    const rawInterval = Number(WAVE_BOSS_INTERVAL);
    if (!Number.isFinite(rawInterval) || rawInterval <= 0) {
      return false;
    }

    const normalizedInterval = Math.max(1, Math.floor(rawInterval));
    if (normalizedInterval <= 0) {
      return false;
    }

    return resolvedWaveNumber % normalizedInterval === 0;
  }

  _calculateWaveIntensityLevel(waveNumber) {
    const intensities = MUSIC_LAYER_CONFIG?.intensities || [];
    const stepCount = intensities.length - 1;

    if (stepCount <= 0) {
      return 0;
    }

    const normalizedWave = Math.max(1, Math.floor(Number(waveNumber) || 0));

    const configuredStep = Number(MUSIC_LAYER_CONFIG?.wavesPerIntensityStep);
    const progressionWindow = Number(
      MUSIC_LAYER_CONFIG?.intensityProgressionWindow
    );

    let wavesPerStep = Number.isFinite(configuredStep) ? configuredStep : null;

    if (!wavesPerStep || wavesPerStep <= 0) {
      const fallbackWindow =
        Number.isFinite(progressionWindow) && progressionWindow > 0
          ? progressionWindow
          : stepCount * 3;
      wavesPerStep = Math.max(1, Math.round(fallbackWindow / stepCount));
    }

    const level = Math.floor((normalizedWave - 1) / wavesPerStep);
    return Math.min(stepCount, Math.max(0, level));
  }

  _randomBetween(min, max) {
    const candidates = [
      this.randomScopes?.families?.music,
      this.randomScopes?.base,
      this.random,
    ];

    for (const rng of candidates) {
      if (rng && typeof rng.range === 'function') {
        return rng.range(min, max);
      }
    }

    const [low, high] = max >= min ? [min, max] : [max, min];
    return low + (high - low) * Math.random();
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

    const { master, music, effects, muteAll } = this.volumeState;
    const masterValue = muteAll ? 0 : master;

    this.masterGain.gain.value = masterValue;

    if (this.musicGain) {
      this.musicGain.gain.value = muteAll ? 0 : master * music;
    }

    if (this.effectsGain) {
      this.effectsGain.gain.value = muteAll ? 0 : master * effects;
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

  connectMusicNode(node) {
    // Music content (file tracks via the manager target; legacy menu path) joins
    // at the music DUCK node so it ducks with the music; falls back to the slider
    // stage before the duck node is spliced.
    const destination =
      this.duckingController?.musicDuckGain ||
      this.musicGain ||
      this.masterGain;
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

    this.playMenuTransition();
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

  evictFileTrack(trackId) {
    this.fileTrackManager?.evictTrack(trackId);
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

  _destroyMenuTrackResources() {
    const manager = this.fileTrackManager;
    if (!manager) {
      return;
    }
    manager.evictTrack(FILE_TRACK_MANAGER_IDS.MENU_OPENING);
    if (manager.activeTrackId === FILE_TRACK_MANAGER_IDS.MENU_OPENING) {
      manager.activeTrackId = null;
    }
    if (manager.currentScreen === 'menu') {
      manager.currentScreen = null;
    }
  }

  initializeMusicController() {
    if (!this.context || this.musicController.initialized) {
      return;
    }

    const layersConfig = MUSIC_LAYER_CONFIG?.layers || {};
    const now = this.context.currentTime;

    const createdLayers = {};

    Object.entries(layersConfig).forEach(([key, layerConfig = {}]) => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      const baseFrequency = Number(layerConfig.frequency) || 110;

      osc.type = layerConfig.type || 'sine';
      osc.frequency.setValueAtTime(Math.max(10, baseFrequency), now);

      if (typeof layerConfig.detuneCents === 'number') {
        osc.detune.setValueAtTime(layerConfig.detuneCents, now);
      }

      const randomDetuneSpan = Number(layerConfig.randomDetuneCents);
      if (Number.isFinite(randomDetuneSpan) && randomDetuneSpan > 0) {
        const offset = this._randomBetween(
          -Math.abs(randomDetuneSpan),
          Math.abs(randomDetuneSpan)
        );
        osc.detune.setValueAtTime(
          (Number(layerConfig.detuneCents) || 0) + offset,
          now
        );
      }

      gain.gain.setValueAtTime(0, now);

      osc.connect(gain);

      let outputNode = gain;
      const filterConfig = layerConfig.filter;
      let filterNode = null;

      if (
        filterConfig &&
        typeof this.context.createBiquadFilter === 'function'
      ) {
        filterNode = this.context.createBiquadFilter();
        filterNode.type = filterConfig.type || 'lowpass';

        if (typeof filterConfig.frequency === 'number') {
          filterNode.frequency.setValueAtTime(
            Math.max(10, filterConfig.frequency),
            now
          );
        }

        if (typeof filterConfig.Q === 'number') {
          filterNode.Q.setValueAtTime(Math.max(0.0001, filterConfig.Q), now);
        }

        if (
          typeof filterConfig.gain === 'number' &&
          ['lowshelf', 'highshelf', 'peaking'].includes(filterNode.type)
        ) {
          filterNode.gain.setValueAtTime(filterConfig.gain, now);
        }

        gain.connect(filterNode);
        outputNode = filterNode;
      }

      let modulator = null;
      const depthMultiplier =
        typeof layerConfig.modulationDepth === 'number'
          ? Math.max(0, Math.min(0.95, layerConfig.modulationDepth))
          : 0;

      if (
        depthMultiplier > 0 &&
        typeof this.context.createOscillator === 'function'
      ) {
        const lfo = this.context.createOscillator();
        const depthGain = this.context.createGain();
        const rate =
          typeof layerConfig.modulationRate === 'number'
            ? Math.max(0.01, layerConfig.modulationRate)
            : 0.12;

        lfo.type = layerConfig.modulationType || 'sine';
        lfo.frequency.setValueAtTime(rate, now);
        depthGain.gain.setValueAtTime(0, now);

        lfo.connect(depthGain);
        depthGain.connect(gain.gain);

        let phaseOffset = 0;
        if (layerConfig.randomizeModulationPhase !== false && rate > 0) {
          const cycleDuration = 1 / rate;
          const offsetWindow = Math.min(cycleDuration, 2.5);
          phaseOffset = this._randomBetween(0, offsetWindow);
        }

        lfo.start(now + Math.max(0, phaseOffset));

        modulator = {
          lfo,
          depthGain,
          depthMultiplier,
        };
      }

      this.connectMusicNode(outputNode);
      osc.start(now);

      createdLayers[key] = {
        osc,
        gain,
        config: layerConfig,
        filter: filterNode,
        modulator,
      };
    });

    this.musicController.layers = createdLayers;
    this.musicController.initialized = true;

    this.setMusicIntensity(this.musicController.intensityLevel, {
      immediate: true,
    });
  }

  setMusicIntensity(level, options = {}) {
    const intensities = MUSIC_LAYER_CONFIG?.intensities || [];

    if (!intensities.length) {
      this.musicController.intensityLevel = level;
      this.musicController.targetLevel = level;
      return;
    }

    const maxLevel = intensities.length - 1;
    const targetLevel = Math.min(Math.max(0, Math.floor(level)), maxLevel);
    const { immediate = false, rampDuration, reason } = options;

    this.musicController.targetLevel = targetLevel;

    if (!this.musicController.initialized || !this.context) {
      this.musicController.intensityLevel = targetLevel;
      return;
    }

    let duration = typeof rampDuration === 'number' ? rampDuration : null;
    if (duration === null) {
      const isIncrease = targetLevel > this.musicController.intensityLevel;
      if (reason === 'boss') {
        duration = this.musicController.rampDurations.bossRise;
      } else if (reason === 'bossVictory') {
        duration = this.musicController.rampDurations.bossFall;
      } else {
        duration = isIncrease
          ? this.musicController.rampDurations.rise
          : this.musicController.rampDurations.fall;
      }
    }

    this._applyMusicIntensity(targetLevel, {
      immediate,
      duration,
    });

    this.musicController.intensityLevel = targetLevel;
  }

  _applyMusicIntensity(level, options = {}) {
    if (!this.musicController.initialized || !this.context) {
      return;
    }

    const profile = (MUSIC_LAYER_CONFIG?.intensities || [])[level];
    if (!profile) {
      return;
    }

    const { immediate = false, duration = 1.2 } = options;
    const rampDuration = Math.max(0.05, duration || 0.05);
    const now = this.context.currentTime;

    Object.entries(this.musicController.layers).forEach(([key, layer]) => {
      const gainNode = layer?.gain;
      if (!gainNode || !gainNode.gain) {
        return;
      }

      const targetGain = profile[key] ?? 0;

      try {
        gainNode.gain.cancelScheduledValues(now);
      } catch (error) {
        // Some browsers throw if there are no scheduled values
      }

      if (immediate) {
        gainNode.gain.setValueAtTime(targetGain, now);
      } else {
        const currentValue =
          typeof gainNode.gain.value === 'number'
            ? gainNode.gain.value
            : targetGain;

        gainNode.gain.setValueAtTime(currentValue, now);
        gainNode.gain.linearRampToValueAtTime(targetGain, now + rampDuration);
      }

      const modulator = layer?.modulator;
      const depthParam = modulator?.depthGain?.gain;
      if (!depthParam) {
        return;
      }

      const depthValue = Math.max(0, targetGain * modulator.depthMultiplier);

      try {
        depthParam.cancelScheduledValues(now);
      } catch (error) {
        // Ignore browsers that throw when clearing empty schedules
      }

      if (immediate) {
        depthParam.setValueAtTime(depthValue, now);
        return;
      }

      const currentDepth =
        typeof depthParam.value === 'number' ? depthParam.value : depthValue;

      depthParam.setValueAtTime(currentDepth, now);
      depthParam.linearRampToValueAtTime(depthValue, now + rampDuration);
    });
  }

  _scheduleMusicRelaxation(delay = 0) {
    if (this.musicController.relaxTimeout) {
      clearTimeout(this.musicController.relaxTimeout);
      this.musicController.relaxTimeout = null;
    }

    if (!Number.isFinite(delay) || delay <= 0) {
      return;
    }

    this.musicController.relaxTimeout = setTimeout(() => {
      this.musicController.relaxTimeout = null;

      const hasPendingLevel =
        this.musicController.pendingNonBossIntensity !== null &&
        this.musicController.pendingNonBossIntensity !== undefined;

      if (!hasPendingLevel) {
        return;
      }

      const fallbackLevel = this.musicController.pendingNonBossIntensity;

      this.musicController.pendingNonBossIntensity = null;

      if (!Number.isFinite(fallbackLevel)) {
        return;
      }

      this.setMusicIntensity(fallbackLevel, {
        reason: 'bossVictory',
        rampDuration: this.musicController.rampDurations.fall,
      });

      this.musicController.lastNonBossIntensity = fallbackLevel;
    }, delay);
  }

  _onBossFightStarted(payload = {}) {
    this.musicController.bossActive = true;
    if (this.musicController.relaxTimeout) {
      clearTimeout(this.musicController.relaxTimeout);
      this.musicController.relaxTimeout = null;
    }

    this.setMusicIntensity(this.musicController.bossIntensity, {
      reason: 'boss',
      rampDuration: this.musicController.rampDurations.bossRise,
    });

    if (payload?.phase != null) {
      this.bossAudioState.lastPhase = payload.phase;
    }
  }

  _onBossPhaseChanged(payload = {}) {
    if (!this.musicController.bossActive) {
      this._onBossFightStarted(payload);
    } else {
      const quickRamp = Math.max(
        0.3,
        this.musicController.rampDurations.bossRise * 0.75
      );
      this.setMusicIntensity(this.musicController.bossIntensity, {
        reason: 'boss',
        rampDuration: quickRamp,
      });
    }

    const nextPhase =
      payload?.phase ?? payload?.nextPhase ?? payload?.newPhase ?? null;
    if (nextPhase != null) {
      this.bossAudioState.lastPhase = nextPhase;
    }
  }

  _onBossDefeated(payload = {}) {
    this.musicController.bossActive = false;
    this.bossAudioState.lastPhase = null;

    this.setMusicIntensity(this.musicController.relaxedIntensity, {
      reason: 'bossVictory',
      rampDuration: this.musicController.rampDurations.bossFall,
    });

    this._scheduleMusicRelaxation(4000);
  }

  handleBossEvent(eventName, payload = {}) {
    switch (eventName) {
      case 'boss-spawned':
        this.playBossRoar(payload);
        this._onBossFightStarted(payload);
        break;
      case 'boss-phase-changed':
        this.playBossPhaseChange(payload);
        this._onBossPhaseChanged(payload);
        break;
      case 'boss-defeated':
        this.playBossDefeated(payload);
        this._onBossDefeated(payload);
        break;
      default:
        break;
    }
  }

  playBossEvent(eventName, payload = {}) {
    this.handleBossEvent(eventName, payload);
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

  // ===========================================================================
  // SFX synthesis delegations (INFRA-02 — bodies relocated to SFXBus).
  //
  // The public play* methods stay on the facade as thin delegations so every
  // existing call site / EventBus listener keeps working (API parity). The
  // relocated synthesis bodies (normalizers, priority resolver, _play*Direct,
  // _executeBatchedSound) are GONE from this facade — SFXBus is the sole owner
  // (review: no duplicate ownership). The private _play*Direct delegators below
  // exist only because the determinism + port regression suites call them
  // directly and the SfxSynthPort forwards through them.
  // ===========================================================================

  normalizeLaserShotOptions(options = {}) {
    return this.sfxBus.normalizeLaserShotOptions(options);
  }

  playLaserShot(options = {}) {
    this.sfxBus.playLaserShot(options);
  }

  playDroneFire(data = {}) {
    this.sfxBus.playDroneFire(data);
  }

  playHunterBurst(data = {}) {
    this.sfxBus.playHunterBurst(data);
  }

  playMineExplosion(data = {}) {
    this.sfxBus.playMineExplosion(data);
  }

  playTargetLock(data = {}) {
    this.sfxBus.playTargetLock(data);
  }

  playAsteroidBreak(size) {
    this.sfxBus.playAsteroidBreak(size);
  }

  playBigExplosion() {
    this.sfxBus.playBigExplosion();
  }

  playXPCollect() {
    this.sfxBus.playXPCollect();
  }

  _playLaserShotDirect(params = {}) {
    this.sfxBus._playLaserShotDirect(params);
  }

  _playDroneFireDirect(params = {}) {
    this.sfxBus._playDroneFireDirect(params);
  }

  _playHunterBurstDirect(params = {}) {
    this.sfxBus._playHunterBurstDirect(params);
  }

  _playMineExplosionDirect(params = {}) {
    this.sfxBus._playMineExplosionDirect(params);
  }

  _playTargetLockDirect(params = {}) {
    this.sfxBus._playTargetLockDirect(params);
  }

  _playAsteroidBreakDirect(size) {
    this.sfxBus._playAsteroidBreakDirect(size);
  }

  _playXPCollectDirect() {
    this.sfxBus._playXPCollectDirect();
  }

  _executeBatchedSound(soundType, params = []) {
    this.sfxBus._executeBatchedSound(soundType, params);
  }

  playLevelUp() {
    this.sfxBus.playLevelUp();
  }

  playOrbFusion(toClass) {
    this.sfxBus.playOrbFusion(toClass);
  }

  playGoldSpawn() {
    this.sfxBus.playGoldSpawn();
  }

  playGoldJackpot() {
    this.sfxBus.playGoldJackpot();
  }

  playBossRoar(payload = {}) {
    this._trackPerformance('playBossRoar');

    this.safePlay(() => {
      const config = BOSS_AUDIO_FREQUENCY_PRESETS?.roar;
      if (!config) {
        return;
      }

      const now = this.context.currentTime;
      const duration = config.duration ?? 1.2;
      const sweepStart = config.sweep?.start ?? 90;
      const sweepEnd = config.sweep?.end ?? 150;
      const sweepDuration = config.sweep?.duration ?? duration * 0.6;

      const baseOsc = this.context.createOscillator();
      const baseGain = this.context.createGain();
      const filter = this.context.createBiquadFilter();

      baseOsc.type = 'sawtooth';
      baseOsc.frequency.setValueAtTime(sweepStart, now);
      baseOsc.frequency.linearRampToValueAtTime(sweepEnd, now + sweepDuration);

      filter.type = config.filter?.type || 'lowpass';
      filter.frequency.setValueAtTime(config.filter?.frequency ?? 420, now);

      baseGain.gain.setValueAtTime(0, now);
      baseGain.gain.linearRampToValueAtTime(
        config.attackGain ?? 0.25,
        now + 0.12
      );
      const sustainTime =
        now + Math.max(0.2, duration - (config.releaseDuration ?? 0.5));
      baseGain.gain.linearRampToValueAtTime(
        config.sustainGain ?? 0.18,
        sustainTime
      );
      baseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      baseOsc.connect(filter);
      filter.connect(baseGain);
      this.connectGainNode(baseGain);

      baseOsc.start(now);
      baseOsc.stop(now + duration);

      if (config.vibrato) {
        const vibratoOsc = this.context.createOscillator();
        const vibratoGain = this.context.createGain();
        vibratoOsc.type = 'sine';
        vibratoOsc.frequency.setValueAtTime(config.vibrato.speed ?? 5, now);
        vibratoGain.gain.setValueAtTime(config.vibrato.depth ?? 6, now);
        vibratoOsc.connect(vibratoGain);
        vibratoGain.connect(baseOsc.frequency);
        vibratoOsc.start(now);
        vibratoOsc.stop(now + duration);
      }

      if (Array.isArray(config.harmonics)) {
        config.harmonics.forEach((frequency, index) => {
          const osc = this.context.createOscillator();
          const gain = this.context.createGain();
          const startTime = now + index * 0.05;

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(frequency, startTime);

          gain.gain.setValueAtTime(0, startTime);
          const harmonicGain = (config.sustainGain ?? 0.18) * 0.4;
          gain.gain.linearRampToValueAtTime(harmonicGain, startTime + 0.1);
          gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

          osc.connect(gain);
          this.connectGainNode(gain);

          osc.start(startTime);
          osc.stop(now + duration);
        });
      }

      if (config.tail?.frequency) {
        const tailOsc = this.context.createOscillator();
        const tailGain = this.context.createGain();
        const tailStart = now + (config.sweep?.duration ?? duration * 0.6);
        const tailDuration = config.tail.duration ?? 0.5;

        tailOsc.type = 'sine';
        tailOsc.frequency.setValueAtTime(config.tail.frequency, tailStart);

        tailGain.gain.setValueAtTime(0, tailStart);
        tailGain.gain.linearRampToValueAtTime(
          config.tail.gain ?? 0.12,
          tailStart + 0.05
        );
        tailGain.gain.exponentialRampToValueAtTime(
          0.001,
          tailStart + tailDuration
        );

        tailOsc.connect(tailGain);
        this.connectGainNode(tailGain);

        tailOsc.start(tailStart);
        tailOsc.stop(tailStart + tailDuration);
      }
    });
  }

  playBossPhaseChange(payload = {}) {
    this._trackPerformance('playBossPhaseChange');

    this.safePlay(() => {
      const config = BOSS_AUDIO_FREQUENCY_PRESETS?.phaseChange;
      if (!config) {
        return;
      }

      const now = this.context.currentTime;
      const duration = config.duration ?? 0.6;
      const sweepOsc = this.context.createOscillator();
      const sweepGain = this.context.createGain();

      const startFreq = config.sweep?.start ?? 220;
      const endFreq = config.sweep?.end ?? 820;

      sweepOsc.type = 'triangle';
      sweepOsc.frequency.setValueAtTime(startFreq, now);
      sweepOsc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

      sweepGain.gain.setValueAtTime(0, now);
      sweepGain.gain.linearRampToValueAtTime(0.16, now + 0.08);
      sweepGain.gain.exponentialRampToValueAtTime(0.001, now + duration + 0.25);

      sweepOsc.connect(sweepGain);
      this.connectGainNode(sweepGain);

      sweepOsc.start(now);
      sweepOsc.stop(now + duration + 0.25);

      const shimmerConfig = config.shimmer || {};
      if (Array.isArray(shimmerConfig.frequencies)) {
        const spacing = shimmerConfig.spacing ?? 0.08;
        const shimmerDuration = shimmerConfig.duration ?? 0.45;
        const shimmerGainBase = shimmerConfig.gain ?? 0.1;
        const phaseIndex =
          (payload?.phase ?? payload?.nextPhase ?? payload?.newPhase ?? 1) - 1;
        const intensityScale = 1 + Math.max(0, phaseIndex) * 0.12;

        shimmerConfig.frequencies.forEach((frequency, index) => {
          const osc = this.context.createOscillator();
          const gain = this.context.createGain();
          const startTime = now + 0.1 + index * spacing;

          osc.type = 'sine';
          osc.frequency.setValueAtTime(frequency, startTime);

          gain.gain.setValueAtTime(0, startTime);
          gain.gain.linearRampToValueAtTime(
            shimmerGainBase * intensityScale,
            startTime + 0.04
          );
          gain.gain.exponentialRampToValueAtTime(
            0.001,
            startTime + shimmerDuration
          );

          osc.connect(gain);
          this.connectGainNode(gain);

          osc.start(startTime);
          osc.stop(startTime + shimmerDuration);
        });
      }

      if (config.swell?.frequency) {
        const swellOsc = this.context.createOscillator();
        const swellGain = this.context.createGain();
        const swellDuration = config.swell.duration ?? 0.8;

        swellOsc.type = 'sine';
        swellOsc.frequency.setValueAtTime(config.swell.frequency, now);
        swellOsc.frequency.linearRampToValueAtTime(
          config.swell.frequency * 0.75,
          now + swellDuration
        );

        swellGain.gain.setValueAtTime(0, now);
        swellGain.gain.linearRampToValueAtTime(
          config.swell.gain ?? 0.12,
          now + 0.1
        );
        swellGain.gain.exponentialRampToValueAtTime(0.001, now + swellDuration);

        swellOsc.connect(swellGain);
        this.connectGainNode(swellGain);

        swellOsc.start(now);
        swellOsc.stop(now + swellDuration);
      }
    });
  }

  playBossDefeated(payload = {}) {
    this._trackPerformance('playBossDefeated');

    this.safePlay(() => {
      const config = BOSS_AUDIO_FREQUENCY_PRESETS?.defeated;
      if (!config) {
        return;
      }

      const now = this.context.currentTime;

      const fanfare = config.fanfare;
      if (fanfare?.notes?.length) {
        fanfare.notes.forEach((note, index) => {
          const osc = this.context.createOscillator();
          const gain = this.context.createGain();
          const noteDelay = Number.isFinite(note.delay)
            ? note.delay
            : index * 0.18;
          const startTime = now + Math.max(0, noteDelay);
          const noteDuration = note.duration ?? 0.6;

          osc.type = 'sine';
          osc.frequency.setValueAtTime(note.frequency ?? 440, startTime);

          gain.gain.setValueAtTime(0, startTime);
          gain.gain.linearRampToValueAtTime(
            note.gain ?? 0.18,
            startTime + 0.05
          );
          gain.gain.exponentialRampToValueAtTime(
            0.001,
            startTime + Math.max(0.3, noteDuration)
          );

          osc.connect(gain);
          this.connectGainNode(gain);

          osc.start(startTime);
          osc.stop(startTime + Math.max(0.4, noteDuration));
        });

        if (Array.isArray(fanfare.harmony?.frequencies)) {
          const harmonyGain = this.context.createGain();
          const harmonyStart = now + (fanfare.notes[0]?.delay ?? 0);
          const harmonyDuration = fanfare.harmony.duration ?? 1.6;

          harmonyGain.gain.setValueAtTime(0, harmonyStart);
          harmonyGain.gain.linearRampToValueAtTime(
            fanfare.harmony.gain ?? 0.12,
            harmonyStart + 0.2
          );
          harmonyGain.gain.exponentialRampToValueAtTime(
            0.001,
            harmonyStart + harmonyDuration
          );

          this.connectGainNode(harmonyGain);

          fanfare.harmony.frequencies.forEach((frequency) => {
            const osc = this.context.createOscillator();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(frequency, harmonyStart);
            osc.connect(harmonyGain);
            osc.start(harmonyStart);
            osc.stop(harmonyStart + harmonyDuration);
          });
        }
      }

      if (config.choir?.frequency) {
        const choirOsc = this.context.createOscillator();
        const choirGain = this.context.createGain();
        const choirStart = now + 0.2;
        const choirDuration = config.choir.duration ?? 1.8;

        choirOsc.type = 'sawtooth';
        choirOsc.frequency.setValueAtTime(config.choir.frequency, choirStart);
        choirOsc.frequency.linearRampToValueAtTime(
          config.choir.frequency * 0.75,
          choirStart + choirDuration
        );

        choirGain.gain.setValueAtTime(0, choirStart);
        choirGain.gain.linearRampToValueAtTime(
          config.choir.gain ?? 0.08,
          choirStart + 0.25
        );
        choirGain.gain.exponentialRampToValueAtTime(
          0.001,
          choirStart + choirDuration
        );

        choirOsc.connect(choirGain);
        this.connectGainNode(choirGain);

        choirOsc.start(choirStart);
        choirOsc.stop(choirStart + choirDuration);
      }

      if (Array.isArray(config.sparkle?.frequencies)) {
        const spacing = config.sparkle.spacing ?? 0.12;
        const sparkleDuration = config.sparkle.duration ?? 0.5;
        const sparkleGain = config.sparkle.gain ?? 0.08;

        config.sparkle.frequencies.forEach((frequency, index) => {
          const osc = this.context.createOscillator();
          const gain = this.context.createGain();
          const startTime = now + 0.4 + index * spacing;

          osc.type = 'sine';
          osc.frequency.setValueAtTime(frequency, startTime);

          gain.gain.setValueAtTime(0, startTime);
          gain.gain.linearRampToValueAtTime(sparkleGain, startTime + 0.03);
          gain.gain.exponentialRampToValueAtTime(
            0.001,
            startTime + sparkleDuration
          );

          osc.connect(gain);
          this.connectGainNode(gain);

          osc.start(startTime);
          osc.stop(startTime + sparkleDuration);
        });
      }
    });
  }

  playBulletHit(killed = false) {
    this.sfxBus.playBulletHit(killed);
  }

  playShipHit() {
    this.sfxBus.playShipHit();
  }

  playShieldActivate() {
    this.sfxBus.playShieldActivate();
  }

  playShieldImpact() {
    this.sfxBus.playShieldImpact();
  }

  playBossShieldDeflect() {
    this.sfxBus.playBossShieldDeflect();
  }

  playShieldBreak() {
    this.sfxBus.playShieldBreak();
  }

  playShieldRecharged() {
    this.sfxBus.playShieldRecharged();
  }

  playShieldFail() {
    this.sfxBus.playShieldFail();
  }

  playShieldShockwave() {
    this.sfxBus.playShieldShockwave();
  }

  _createRandomScopes(baseRandom) {
    const canFork = baseRandom && typeof baseRandom.fork === 'function';
    if (!canFork) {
      return {
        base: baseRandom,
        cache: null,
        families: {},
        bufferFamilies: {},
        batcher: null,
      };
    }

    const supportsSnapshot =
      typeof baseRandom?.debugSnapshot === 'function' &&
      typeof baseRandom?.restore === 'function';
    const snapshot = supportsSnapshot ? baseRandom.debugSnapshot() : null;

    let families = {};
    let cacheRandom = null;
    let bufferFamilies = {};
    let batcherRandom = null;

    try {
      families = {
        laser: baseRandom.fork('audio:family:laser'),
        explosion: baseRandom.fork('audio:family:explosion'),
        shield: baseRandom.fork('audio:family:shield'),
        asteroid: baseRandom.fork('audio:family:asteroid'),
        xp: baseRandom.fork('audio:family:xp'),
        impact: baseRandom.fork('audio:family:impact'),
        music: baseRandom.fork('audio:family:music'),
        ui: baseRandom.fork('audio:family:ui'),
        uiHover: baseRandom.fork('audio:family:ui:hover'),
        uiSelect: baseRandom.fork('audio:family:ui:select'),
        uiStartGame: baseRandom.fork('audio:family:ui:startgame'),
        thruster: baseRandom.fork('audio:family:thruster'),
        thrusterMain: baseRandom.fork('audio:family:thruster:main'),
        thrusterRetro: baseRandom.fork('audio:family:thruster:retro'),
        thrusterSide: baseRandom.fork('audio:family:thruster:side'),
      };

      cacheRandom = baseRandom.fork('audio:cache');
      batcherRandom = baseRandom.fork('audio:batcher');

      bufferFamilies = Object.fromEntries(
        Object.entries({
          ...families,
          generic: cacheRandom,
        }).map(([name, rng]) => [
          name,
          rng && typeof rng.fork === 'function'
            ? rng.fork(`audio:buffer:${name}`)
            : null,
        ])
      );
    } finally {
      if (snapshot) {
        try {
          baseRandom.restore(snapshot);
        } catch (error) {
          console.warn(
            '[Audio] Failed to restore base RNG state after creating audio scopes:',
            error
          );
        }
      }
    }

    return {
      base: baseRandom,
      cache: cacheRandom,
      families,
      bufferFamilies,
      batcher: batcherRandom,
    };
  }

  captureRandomScopes({ refreshForks = false } = {}) {
    if (!this.random) {
      return null;
    }

    if (!this.randomScopes || refreshForks) {
      const refreshed = this._createRandomScopes(this.random);
      this.randomScopes = {
        ...refreshed,
        seeds: this.randomScopes?.seeds ?? null,
        cacheSnapshot: this.randomScopes?.cacheSnapshot ?? null,
        batcherSnapshot: this.randomScopes?.batcherSnapshot ?? null,
      };
    }

    if (refreshForks) {
      if (this.cache) {
        this.cache.random = this.randomScopes.cache;
        if (typeof this.cache.clearCache === 'function') {
          this.cache.clearCache('all');
        }
        if (typeof this.cache.resetStats === 'function') {
          this.cache.resetStats();
        }
      }

      if (this.batcher) {
        this.batcher.random = this.randomScopes.batcher;
        if (typeof this.batcher._initializeRandomForks === 'function') {
          this.batcher.randomForks = this.batcher._initializeRandomForks(
            this.randomScopes.batcher
          );
        }
        if (typeof this.batcher.resetStats === 'function') {
          this.batcher.resetStats();
        }
      }
    }

    const seeds = {
      base:
        typeof this.random.seed === 'number' ? this.random.seed >>> 0 : null,
      cache:
        this.randomScopes?.cache &&
        typeof this.randomScopes.cache.seed === 'number'
          ? this.randomScopes.cache.seed >>> 0
          : null,
      batcher:
        this.randomScopes?.batcher &&
        typeof this.randomScopes.batcher.seed === 'number'
          ? this.randomScopes.batcher.seed >>> 0
          : null,
      families: {},
      bufferFamilies: {},
    };

    Object.entries(this.randomScopes?.families || {}).forEach(([name, rng]) => {
      seeds.families[name] =
        rng && typeof rng.seed === 'number' ? rng.seed >>> 0 : null;
    });

    Object.entries(this.randomScopes?.bufferFamilies || {}).forEach(
      ([name, rng]) => {
        seeds.bufferFamilies[name] =
          rng && typeof rng.seed === 'number' ? rng.seed >>> 0 : null;
      }
    );

    this.randomScopes.seeds = seeds;

    if (this.cache && typeof this.cache.captureNoiseSeeds === 'function') {
      this.randomScopes.cacheSnapshot = this.cache.captureNoiseSeeds();
    }

    if (
      this.batcher &&
      typeof this.batcher.captureRandomForkSeeds === 'function'
    ) {
      this.randomScopes.batcherSnapshot = this.batcher.captureRandomForkSeeds();
    }

    this._exposeRandomDebugControls();
    return { ...seeds };
  }

  reseedRandomScopes({ refreshForks = false } = {}) {
    if (!this.random) {
      return null;
    }

    if (!this.randomScopes || refreshForks) {
      this.captureRandomScopes({ refreshForks: true });
    }

    if (!this.randomScopes?.seeds) {
      this.captureRandomScopes();
    }

    const seeds = this.randomScopes?.seeds;
    if (!seeds) {
      return null;
    }

    const applySeed = (rng, seed) => {
      if (rng && typeof rng.reset === 'function' && typeof seed === 'number') {
        rng.reset(seed);
      }
    };

    const canPreserveBaseState =
      typeof this.random?.debugSnapshot === 'function' &&
      typeof this.random?.restore === 'function';
    const baseSnapshot = canPreserveBaseState
      ? this.random.debugSnapshot()
      : null;

    try {
      applySeed(this.randomScopes?.cache, seeds.cache);
      applySeed(this.randomScopes?.batcher, seeds.batcher);

      Object.entries(this.randomScopes?.families || {}).forEach(
        ([name, rng]) => {
          applySeed(rng, seeds.families?.[name]);
        }
      );

      Object.entries(this.randomScopes?.bufferFamilies || {}).forEach(
        ([name, rng]) => {
          applySeed(rng, seeds.bufferFamilies?.[name]);
        }
      );

      if (this.cache) {
        this.cache.random = this.randomScopes?.cache || this.cache.random;
        if (typeof this.cache.reseedNoiseGenerators === 'function') {
          this.cache.reseedNoiseGenerators(this.randomScopes?.cacheSnapshot);
        }
      }

      if (this.batcher) {
        this.batcher.random = this.randomScopes?.batcher || this.batcher.random;
        if (
          refreshForks &&
          typeof this.batcher._initializeRandomForks === 'function'
        ) {
          this.batcher.randomForks = this.batcher._initializeRandomForks(
            this.batcher.random
          );
        }
        if (typeof this.batcher.reseedRandomForks === 'function') {
          this.batcher.reseedRandomForks();
        }
      }
    } finally {
      if (baseSnapshot) {
        try {
          this.random.restore(baseSnapshot);
        } catch (error) {
          console.warn(
            '[Audio] Failed to restore base RNG state after reseeding audio scopes:',
            error
          );
        }
      }
    }

    this.captureRandomScopes();
    return { ...seeds };
  }

  // INFRA-03: the window.__AUDIO_RANDOM_DEBUG__ global exposes internal RNG state
  // (Information Disclosure) and must NOT cross into production builds. Defense in
  // depth: (1) the build-time `__AUDIO_DEBUG_BUILD__` define (false in prod) lets
  // Vite dead-code-eliminate this whole body — the assignment STRING is removed,
  // not just unreachable; (2) the runtime `!DEV_MODE` gate below is a second layer.
  // The gate is the RUNTIME-reachability CI test (tests/process/no-dev-globals.test.js),
  // NOT a dist string grep — the minified string survives behind a dead gate, so a
  // grep is a false positive (see 02-RESEARCH Pitfall 3). The `typeof` guard keeps
  // non-Vite execution (e.g. vitest module eval) from a ReferenceError on the define.
  _exposeRandomDebugControls() {
    // Build-time gate (layer 1): in prod the define folds to `if (false) { ... }`
    // and Vite drops the entire block, removing the window.__AUDIO_RANDOM_DEBUG__
    // assignment STRING from the bundle. The `typeof` guard means a non-Vite eval
    // (no define) treats it as truthy and falls through to the runtime gate.
    if (typeof __AUDIO_DEBUG_BUILD__ === 'undefined' || __AUDIO_DEBUG_BUILD__) {
      // Runtime gate (layer 2): even in dev/test the global is only exposed in a
      // real dev environment with a window present.
      if (typeof window === 'undefined' || !DEV_MODE) {
        return;
      }

      const debugData = {
        seed: this.random?.seed ?? null,
        debugSnapshot: () => this.random?.debugSnapshot(),
        forks: {},
        seeds: this.randomScopes?.seeds || null,
      };

      Object.entries(this.randomScopes?.families || {}).forEach(
        ([name, rng]) => {
          debugData.forks[name] = {
            seed: rng?.seed ?? null,
            debugSnapshot: () => rng?.debugSnapshot(),
          };
        }
      );

      if (!debugData.forks.cache && this.randomScopes?.cache) {
        debugData.forks.cache = {
          seed: this.randomScopes.cache.seed ?? null,
          debugSnapshot: () => this.randomScopes.cache.debugSnapshot(),
        };
      }

      window.__AUDIO_RANDOM_DEBUG__ = debugData;
    }
  }

  _clearRandomDebugControls() {
    if (typeof window === 'undefined') {
      return;
    }

    delete window.__AUDIO_RANDOM_DEBUG__;
  }

  // === UI Sound Effects (INFRA-02 — synthesis relocated to SFXBus) ===

  playUpgradeSelect(rarity = 'common') {
    this.sfxBus.playUpgradeSelect(rarity);
  }

  /**
   * Play button click sound.
   * @deprecated Use playUISelect() instead
   */
  playButtonClick() {
    this.playUISelect(); // Redirect to the new high-quality handler
  }

  playPauseOpen() {
    this.sfxBus.playPauseOpen();
  }

  playPauseClose() {
    this.sfxBus.playPauseClose();
  }

  playMenuTransition() {
    this.sfxBus.playMenuTransition();
  }

  playLowHealthWarning() {
    this.sfxBus.playLowHealthWarning();
  }

  playUIHover() {
    this.sfxBus.playUIHover();
  }

  playUISelect() {
    this.sfxBus.playUISelect();
  }

  playUIStartGame() {
    this.sfxBus.playUIStartGame();
  }

  // === THRUSTER SOUNDS ===

  /**
   * Handles thruster-effect events from PlayerSystem
   * Manages start→loop→stop lifecycle based on intensity changes
   * Uses timestamp-based inactivity detection to stop loops
   * Distinguishes between manual and automatic thrusters
   */
  handleThrusterEffect(data) {
    if (!this.initialized || !this.context) return;

    const { type, intensity, isAutomatic } = data;
    if (!type || typeof intensity !== 'number') return;

    // Map PlayerSystem event types to internal thruster keys
    // PlayerSystem emits: 'main', 'aux' (braking), 'side'
    let thrusterKey = type;
    if (type === 'aux') {
      thrusterKey = 'retro'; // Aux thruster = retro/braking thruster
    }

    const currentIntensity = intensity;
    const lastIntensity = this.thrusterState.lastIntensity[thrusterKey] || 0;
    const isActive = this.sfxBus.isThrusterActive(thrusterKey);
    const now = performance.now();

    // Update last event time
    this.thrusterState.lastEventTime[thrusterKey] = now;

    // State machine: determine action based on intensity thresholds
    if (currentIntensity > this.thrusterState.startThreshold && !isActive) {
      // START: intensity crossed start threshold and loop not active
      this._startThrusterSound(
        thrusterKey,
        currentIntensity,
        isAutomatic || false
      );
    } else if (
      currentIntensity > this.thrusterState.stopThreshold &&
      isActive
    ) {
      // UPDATE: intensity changed but still above stop threshold
      this._updateThrusterSound(thrusterKey, currentIntensity);
    } else if (
      currentIntensity <= this.thrusterState.stopThreshold &&
      isActive
    ) {
      // STOP: intensity dropped below stop threshold (hysteresis)
      this._stopThrusterSound(thrusterKey);
    }

    // Update last intensity
    this.thrusterState.lastIntensity[thrusterKey] = currentIntensity;
  }

  /**
   * Starts thruster sound (plays start burst + begins loop)
   * @param {string} type - Thruster type
   * @param {number} intensity - Intensity 0-1
   * @param {boolean} isAutomatic - If true, skip burst (auto-damping thrusters)
   */
  /**
   * Starts thruster sound (plays start burst + begins loop). The actual synthesis
   * + loop ownership lives in SFXBus; the facade keeps the event-driven state
   * machine and delegates.
   * @param {string} type - Thruster type
   * @param {number} intensity - Intensity 0-1
   * @param {boolean} isAutomatic - If true, skip burst (auto-damping thrusters)
   */
  _startThrusterSound(type, intensity, isAutomatic = false) {
    if (!this.initialized || !this.context) return;
    this.sfxBus.startThrusterLoop(type, intensity, isAutomatic || false);
  }

  /**
   * Updates thruster loop intensity (delegates to SFXBus).
   */
  _updateThrusterSound(type, intensity) {
    this.sfxBus.updateThrusterLoop(type, intensity);
  }

  /**
   * Stops thruster sound (ends loop + plays release for manual thrusters).
   * @param {string} type - Thruster type
   * @param {boolean} skipRelease - If true, skip release sound (automatic thrusters)
   */
  _stopThrusterSound(type, skipRelease = false) {
    this.sfxBus.stopThrusterLoop(type, skipRelease);
  }

  /**
   * Starts interval to check for thruster inactivity
   * Stops loops that haven't received events within timeout period
   */
  _startThrusterInactivityChecker() {
    if (this.thrusterInactivityCheckInterval) {
      clearInterval(this.thrusterInactivityCheckInterval);
    }

    // Check every 50ms
    this.thrusterInactivityCheckInterval = setInterval(() => {
      this._checkThrusterInactivity();
    }, 50);
  }

  /**
   * Checks if any active thruster loops have timed out due to inactivity
   * Stops loops that haven't received events in the last 150ms
   */
  _checkThrusterInactivity() {
    if (!this.initialized || !this.sfxBus) return;

    const now = performance.now();
    const timeout = this.thrusterState.inactivityTimeout;

    // Check each thruster type
    ['main', 'retro', 'side'].forEach((type) => {
      const isActive = this.sfxBus.isThrusterActive(type);
      if (!isActive) return;

      const lastEventTime = this.thrusterState.lastEventTime[type] || 0;
      const timeSinceLastEvent = now - lastEventTime;

      // If no event received within timeout period, stop the loop
      // Skip release sound since this is typically automatic damping
      if (timeSinceLastEvent > timeout) {
        this._stopThrusterSound(type, true); // skipRelease = true
      }
    });
  }

  reset() {
    this._clearRandomDebugControls();
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
      this.thrusterState.lastIntensity = { main: 0, retro: 0, side: 0 };
      this.thrusterState.lastEventTime = { main: 0, retro: 0, side: 0 };
    }

    // Reset performance monitoring
    this._resetPerformanceMonitoring();

    // Clear pending playback queue
    this.pendingSoundQueue.length = 0;
    this.resumePromise = null;

    if (this.musicController.relaxTimeout) {
      clearTimeout(this.musicController.relaxTimeout);
      this.musicController.relaxTimeout = null;
    }

    this.musicController.bossActive = false;
    this.bossAudioState.lastPhase = null;

    const initialIntensityLevel =
      typeof MUSIC_LAYER_CONFIG?.initialIntensity === 'number'
        ? MUSIC_LAYER_CONFIG.initialIntensity
        : 0;

    this.setMusicIntensity(initialIntensityLevel, { immediate: true });

    // AUDIO-01: the adaptive music now lives in MusicMixer — reset it back to
    // base intensity (D-04 maps boss-defeated → base) on a fresh run/replay.
    if (this.musicMixer) {
      this.musicMixer.setIntensityFromBossEvent('boss-defeated');
    }

    // Re-arm the low-HP edges so the first dip below 25% in the new run ducks.
    this.lowHealthWarning = false;
    this.lowHealthDuckArmed = false;

    this.reseedRandomScopes();
  }

  onDestroy() {
    this._evictAllFileTracks({ resetCurrentScreen: true });
    this._clearRandomDebugControls();
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
  _trackPerformance(methodName) {
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

  // === Public API for Performance ===

  /**
   * Obtém estatísticas completas do sistema de áudio
   */
  getPerformanceStats() {
    return {
      performance: { ...this.performanceMonitor },
      pool: this.pool ? this.pool.getStats() : null,
      cache: this.cache ? this.cache.getStats() : null,
      batcher: this.batcher ? this.batcher.getStats() : null,
      optimizationsEnabled: {
        pooling: !!this.pool,
        caching: !!this.cache,
        batching: !!this.batcher,
      },
    };
  }

  /**
   * Enable/disable performance monitoring
   */
  setPerformanceMonitoring(enabled) {
    this.performanceMonitor.enabled = enabled;
    if (!enabled) {
      this._resetPerformanceMonitoring();
    }
  }

  /**
   * Força flush de todos os batches pendentes
   */
  flushAudioBatches() {
    if (this.batcher) {
      this.batcher.flushPendingBatches();
    }
  }
}

export default AudioSystem;
