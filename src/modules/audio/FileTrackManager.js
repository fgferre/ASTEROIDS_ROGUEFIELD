/**
 * FileTrackManager — streamed MP3 file tracks (INFRA-02).
 *
 * Owns the menu/game-over MP3 catalog and its media-element graph
 * (`new Audio()` → createMediaElementSource → trackGain → the music duck-stage
 * input). Relocated from the AudioSystem monolith with clear ownership.
 *
 * Plain manager class (ThrusterLoopManager / MusicMixer analog). The AudioSystem
 * facade owns the EventBus + the centralized `ensureRunning()` resume gate and
 * DELEGATES track flows here; the manager never reaches back into the facade.
 *
 * Two-phase lifecycle (construction-timing safety):
 *   - constructor(config): stores config ONLY. No AudioContext work.
 *   - init(context, targetNode, ensureRunning): builds per-track gains lazily.
 *   - dispose(): stops/disconnects every track, clears the retry queue;
 *     both init() and dispose() are idempotent.
 *
 * Gain topology (single writer per AudioParam — cross-plan contract):
 *   trackGain[id]  (writer: FileTrackManager fades ONLY)
 *     → targetNode == musicDuckGain (02.06 splices this; until then musicGain).
 *   The manager writes ONLY its own trackGains — never the duck node, the slider
 *   stage, or any node it merely connects INTO.
 *
 * Review-driven hardening (02-REVIEWS.md §02.06):
 *   - play() REJECTION: media.play() returns a promise; a rejection (autoplay /
 *     NotAllowedError) is caught, logged once, and the track is queued for retry
 *     on the next `ensureRunning()` resume flush. Never an unhandled rejection.
 *   - RESUME-RACE: every start path goes through the facade's centralized
 *     `ensureRunning(thunk)` gate (single resume path, deterministic FIFO flush).
 *   - DUPLICATE SOURCES: createMediaElementSource throws on reuse, so a per-id
 *     MediaElementSource instance is created exactly once and reused.
 */

const FILE_TRACK_PRELOAD_POLICY = Object.freeze({
  EAGER: 'eager',
  DEFERRED: 'deferred',
});

const FILE_TRACK_IDS = Object.freeze({
  MENU_OPENING: 'menu-opening',
});

const MENU_OPENING_TRACK_URL = new URL(
  '../../../assets/Music/Alone Among Orbits.mp3',
  import.meta.url
).href;

const FILE_TRACK_CATALOG = Object.freeze({
  [FILE_TRACK_IDS.MENU_OPENING]: Object.freeze({
    src: MENU_OPENING_TRACK_URL,
    loop: true,
    fadeInMs: 1500,
    fadeOutMs: 800,
    preloadPolicy: FILE_TRACK_PRELOAD_POLICY.EAGER,
  }),
});

class FileTrackManager {
  /**
   * @param {object} [config]
   * @param {object} [config.catalog] - Optional catalog override (defaults to
   *   FILE_TRACK_CATALOG). Frozen, local static paths only (T-02-10 accept).
   */
  constructor(config = {}) {
    // --- config only (NO AudioContext work) ---
    this.catalog = { ...(config.catalog || FILE_TRACK_CATALOG) };

    // --- runtime state ---
    this.context = null;
    this.targetNode = null;
    // ensureRunning(thunk): the facade's single resume gate. The manager routes
    // EVERY playback start through it so suspended-context starts flush FIFO.
    this._ensureRunning = null;

    this.activeTrackId = null;
    this.currentScreen = null;
    this.tracks = Object.fromEntries(
      Object.keys(this.catalog).map((trackId) => [
        trackId,
        this._createInitialTrackState(),
      ])
    );

    this.initialized = false;
  }

  /** @private */
  _createInitialTrackState() {
    return {
      audioElement: null,
      sourceNode: null,
      trackGain: null,
      isPlaying: false,
      currentScreen: null,
      stopTimerId: null,
      warmupRequested: false,
      playbackToken: 0,
      detachReadyListeners: null,
      // Set when a play() rejection queues the track for retry on next resume.
      retryPending: false,
      // Latch: a single bounded retry is outstanding (prevents busy-loop).
      _retryQueued: false,
    };
  }

  /**
   * Build/attach the manager to the live context. Idempotent: a second call is a
   * no-op. Constructor did NO context work — everything is wired here, after the
   * facade has created the context + buses.
   *
   * @param {AudioContext} context
   * @param {AudioNode} targetNode - the duck-stage input (musicDuckGain once
   *   02.06 splices it; musicGain before then). The manager routes INTO it but
   *   NEVER writes its gain param.
   * @param {(thunk: Function) => void} ensureRunning - the facade's centralized
   *   resume gate. Required for race-hardened starts; falls back to immediate
   *   invocation only when absent (defensive).
   */
  init(context, targetNode, ensureRunning) {
    if (this.initialized) return;
    if (!context) return;

    this.context = context;
    this.targetNode = targetNode || null;
    this._ensureRunning =
      typeof ensureRunning === 'function' ? ensureRunning : null;
    this.initialized = true;

    // Warm up eager tracks and pre-build their graph now that the context exists.
    Object.entries(this.catalog || {}).forEach(([trackId, config = {}]) => {
      if (config.preloadPolicy === FILE_TRACK_PRELOAD_POLICY.EAGER) {
        this.warmupTrack(trackId);
        this.ensureTrackGraph(trackId);
      }
    });
  }

  /** Update the duck-stage target (02.06 re-points trackGains after splicing). */
  setTargetNode(targetNode) {
    this.targetNode = targetNode || null;
  }

  /** @private */
  _getConfig(trackId) {
    if (!trackId) return null;
    return this.catalog?.[trackId] || null;
  }

  /** @private */
  _getState(trackId) {
    if (!trackId) return null;
    if (!this.tracks[trackId] && this._getConfig(trackId)) {
      this.tracks[trackId] = this._createInitialTrackState();
    }
    return this.tracks[trackId] || null;
  }

  /**
   * Construct the media element for a track (warmup-safe; no context needed).
   * @private
   */
  _createAudioElement(trackId) {
    const config = this._getConfig(trackId);
    if (!config?.src) return null;

    let audioElement = null;
    if (typeof Audio === 'function') {
      try {
        audioElement = new Audio(config.src);
      } catch (error) {
        console.warn(
          `[FileTrackManager] Failed to construct file track "${trackId}":`,
          error
        );
      }
    }

    if (
      !audioElement &&
      typeof document !== 'undefined' &&
      typeof document.createElement === 'function'
    ) {
      try {
        audioElement = document.createElement('audio');
        audioElement.src = config.src;
      } catch (error) {
        console.warn(
          `[FileTrackManager] Failed to create fallback file track "${trackId}":`,
          error
        );
      }
    }

    if (!audioElement) return null;

    audioElement.preload = 'auto';
    audioElement.loop = Boolean(config.loop);
    return audioElement;
  }

  /** Preload a track's media element (no graph, no context required). */
  warmupTrack(trackId) {
    const config = this._getConfig(trackId);
    const state = this._getState(trackId);
    if (!config || !state) return null;

    if (!state.audioElement) {
      state.audioElement = this._createAudioElement(trackId);
    }
    if (!state.audioElement) return null;

    state.audioElement.loop = Boolean(config.loop);

    if (!state.warmupRequested) {
      state.warmupRequested = true;
      try {
        state.audioElement.load?.();
      } catch (error) {
        console.warn(
          `[FileTrackManager] Failed to warm up file track "${trackId}":`,
          error
        );
      }
    }
    return state;
  }

  /**
   * Lazily build a track's gain + MediaElementSource graph. The source node is
   * created EXACTLY ONCE per id and reused — createMediaElementSource throws on
   * a second call for the same element (review: duplicate-source guard).
   */
  ensureTrackGraph(trackId) {
    if (!this.context) return null;

    const state = this.warmupTrack(trackId);
    const now = this.context.currentTime;
    if (!state?.audioElement) return null;

    if (!state.trackGain) {
      state.trackGain = this.context.createGain();
      state.trackGain.gain.setValueAtTime(0, now);
      if (this.targetNode && typeof state.trackGain.connect === 'function') {
        state.trackGain.connect(this.targetNode);
      }
    }

    if (!state.sourceNode) {
      if (typeof this.context.createMediaElementSource !== 'function') {
        console.warn(
          `[FileTrackManager] MediaElementAudioSourceNode is not available for "${trackId}".`
        );
        return null;
      }
      // Per-id source created ONCE — reused on every subsequent play (a second
      // createMediaElementSource for the same element throws InvalidStateError).
      state.sourceNode = this.context.createMediaElementSource(
        state.audioElement
      );
      state.sourceNode.connect(state.trackGain);
    }

    return state;
  }

  /** @private */
  _clearStopTimer(trackId) {
    const state = this._getState(trackId);
    if (!state?.stopTimerId) return;
    clearTimeout(state.stopTimerId);
    state.stopTimerId = null;
  }

  /** @private */
  _detachReadyListeners(trackId) {
    const state = this._getState(trackId);
    if (!state?.detachReadyListeners) return;
    try {
      state.detachReadyListeners();
    } catch (error) {
      // Ignore listener cleanup failures during teardown.
    }
    state.detachReadyListeners = null;
  }

  /** @private */
  _bumpPlaybackToken(trackId) {
    const state = this._getState(trackId);
    if (!state) return 0;
    state.playbackToken += 1;
    return state.playbackToken;
  }

  /** @private */
  _cancelParam(param, now) {
    if (!param || typeof param.cancelScheduledValues !== 'function') return;
    try {
      param.cancelScheduledValues(now);
    } catch (error) {
      // Ignore browsers that throw when clearing empty schedules.
    }
  }

  /**
   * Click-safe fade on a track's OWN gain (anchor first, then ramp). Writes only
   * this trackGain — never the duck node or slider stage.
   *
   * @param {string} trackId
   * @param {number} targetGain
   * @param {number} durationMs
   */
  fade(trackId, targetGain, durationMs = 0) {
    const state = this._getState(trackId);
    if (!state?.trackGain?.gain || !this.context) return;

    const now = this.context.currentTime;
    const durationSeconds = Math.max(0, durationMs / 1000);
    const gainParam = state.trackGain.gain;
    const currentValue =
      typeof gainParam.value === 'number' ? gainParam.value : 0;
    const safeTarget = Number.isFinite(targetGain)
      ? Math.max(0, targetGain)
      : 0;

    // Anchor before ramping (click-safe).
    this._cancelParam(gainParam, now);
    gainParam.setValueAtTime(currentValue, now);

    if (durationSeconds > 0) {
      gainParam.linearRampToValueAtTime(safeTarget, now + durationSeconds);
    } else {
      gainParam.setValueAtTime(safeTarget, now);
    }
  }

  /** @private */
  _beginFadeIn(trackId) {
    const config = this._getConfig(trackId);
    if (!config) return;
    this.fade(trackId, 1, config.fadeInMs);
  }

  /** @private */
  _finalizeStop(trackId) {
    const state = this._getState(trackId);
    if (!state?.audioElement) return;

    try {
      state.audioElement.pause?.();
    } catch (error) {
      // Ignore pause failures during cleanup.
    }
    try {
      state.audioElement.currentTime = 0;
    } catch (error) {
      // Ignore media elements that reject currentTime rewinds.
    }

    state.isPlaying = false;
    if (this.activeTrackId === trackId) {
      this.activeTrackId = null;
    }
  }

  /**
   * Start (or refresh) a streamed track. Race-hardened: the actual start is a
   * thunk routed through the facade's `ensureRunning()` gate so a suspended
   * context queues the start and flushes it FIFO on resume.
   *
   * @param {string} trackId
   */
  playTrack(trackId) {
    // A fresh user gesture re-arms the bounded retry latch so this gesture is
    // allowed exactly one play() retry if it rejects.
    const state = this._getState(trackId);
    if (state) {
      state._retryQueued = false;
    }
    const start = () => this._startTrackNow(trackId);
    if (this._ensureRunning) {
      this._ensureRunning(start);
    } else {
      start();
    }
  }

  /**
   * The actual media start — invoked synchronously when the context is running,
   * or via the resume flush. Idempotent-ish: a refresh of the active track just
   * re-fades-in. Handles play() rejection (queues a retry on next resume).
   * @private
   */
  _startTrackNow(trackId) {
    const config = this._getConfig(trackId);
    const state = this.ensureTrackGraph(trackId);
    if (!config || !state?.audioElement || !state.trackGain || !this.context) {
      return;
    }

    this._clearStopTimer(trackId);

    // Active + already playing → just (re)assert the fade-in.
    if (
      this.activeTrackId === trackId &&
      state.isPlaying &&
      !state.audioElement.paused
    ) {
      this._beginFadeIn(trackId);
      return;
    }

    const token = this._bumpPlaybackToken(trackId);
    const previousActiveTrackId = this.activeTrackId;
    const audioElement = state.audioElement;

    this._detachReadyListeners(trackId);

    let playbackStarted = false;
    const handlePlaybackReady = () => {
      if (playbackStarted || state.playbackToken !== token) return;

      playbackStarted = true;
      state.retryPending = false;
      state._retryQueued = false;
      this._detachReadyListeners(trackId);
      state.isPlaying = true;

      if (
        previousActiveTrackId &&
        previousActiveTrackId !== trackId &&
        this._getState(previousActiveTrackId)?.isPlaying
      ) {
        this.stopTrack(previousActiveTrackId);
      }

      this.activeTrackId = trackId;
      this._beginFadeIn(trackId);
    };

    if (typeof audioElement.addEventListener === 'function') {
      const readyHandler = () => handlePlaybackReady();
      audioElement.addEventListener('playing', readyHandler);
      state.detachReadyListeners = () => {
        audioElement.removeEventListener?.('playing', readyHandler);
        state.detachReadyListeners = null;
      };
    }

    if (!state.isPlaying) {
      this.fade(trackId, 0, 0);
    }

    audioElement.loop = Boolean(config.loop);

    const playResult =
      typeof audioElement.play === 'function' ? audioElement.play() : null;

    if (playResult && typeof playResult.then === 'function') {
      playResult
        .then(() => handlePlaybackReady())
        .catch((error) => {
          if (state.playbackToken !== token) return;

          this._detachReadyListeners(trackId);
          state.isPlaying = false;

          // AbortError = a newer start superseded this one (expected). Anything
          // else (NotAllowedError / autoplay) → log ONCE and queue a retry on the
          // next resume flush so the track recovers on the next user gesture.
          if (error?.name === 'AbortError') return;

          if (!state.retryPending) {
            state.retryPending = true;
            console.warn(
              `[FileTrackManager] Deferred file track "${trackId}" after a rejected play() (will retry on resume):`,
              error
            );
          }
          this._queueRetry(trackId);
        });
      return;
    }

    if (!audioElement.paused) {
      handlePlaybackReady();
    }
  }

  /**
   * Re-route a rejected start through the resume gate so it retries on the next
   * `ensureRunning()` flush (next user gesture / resume). A per-track
   * `_retryQueued` latch prevents the busy-loop trap: at most ONE retry is
   * outstanding per rejected attempt, so even if `ensureRunning` runs the thunk
   * synchronously (context already running) the chain cannot recurse forever —
   * the second rejection sets retryPending again but does NOT re-queue while a
   * retry is already in flight. Never recurses unbounded.
   * @private
   */
  _queueRetry(trackId) {
    if (!this._ensureRunning) return;
    const state = this._getState(trackId);
    // Latch already consumed for this gesture → do NOT re-queue (bounded: one
    // retry per playTrack call; the latch is re-armed only by a fresh playTrack).
    if (!state || state._retryQueued) return;

    state._retryQueued = true;
    this._ensureRunning(() => {
      const current = this._getState(trackId);
      if (current?.retryPending) {
        this._startTrackNow(trackId);
      }
    });
  }

  /**
   * Stop a streamed track with a fade-out (or immediately). Writes only the
   * track's own gain.
   *
   * @param {string} trackId
   * @param {{ immediate?: boolean }} [options]
   */
  stopTrack(trackId, { immediate = false } = {}) {
    const config = this._getConfig(trackId);
    const state = this._getState(trackId);
    if (!config || !state?.audioElement) return;

    this._clearStopTimer(trackId);
    this._bumpPlaybackToken(trackId);
    this._detachReadyListeners(trackId);
    state.retryPending = false;
    state._retryQueued = false;

    const fadeOutSeconds = Math.max(
      0,
      (immediate ? 0 : config.fadeOutMs) / 1000
    );

    if (state.trackGain?.gain && this.context) {
      this.fade(trackId, 0, immediate ? 0 : config.fadeOutMs);
    }

    if (immediate || !this.context || fadeOutSeconds <= 0) {
      this._finalizeStop(trackId);
      return;
    }

    state.stopTimerId = setTimeout(
      () => {
        state.stopTimerId = null;
        this._finalizeStop(trackId);
      },
      Math.round(fadeOutSeconds * 1000)
    );
  }

  /** Tear down a single track's nodes + media element (idempotent per track). */
  evictTrack(trackId) {
    const state = this._getState(trackId);
    if (!state) return;

    this.stopTrack(trackId, { immediate: true });
    this._clearStopTimer(trackId);
    this._detachReadyListeners(trackId);

    if (state.sourceNode && typeof state.sourceNode.disconnect === 'function') {
      try {
        state.sourceNode.disconnect();
      } catch (error) {
        // Ignore disconnect failures during teardown.
      }
    }
    if (state.trackGain && typeof state.trackGain.disconnect === 'function') {
      try {
        state.trackGain.disconnect();
      } catch (error) {
        // Ignore disconnect failures during teardown.
      }
    }

    state.audioElement = null;
    state.sourceNode = null;
    state.trackGain = null;
    state.isPlaying = false;
    state.stopTimerId = null;
    state.warmupRequested = false;
    state.playbackToken = 0;
    state.detachReadyListeners = null;
    state.retryPending = false;
    state._retryQueued = false;
  }

  /**
   * Tear down ALL tracks and detach the manager. Idempotent (guarded). After
   * dispose no track node is connected and no retry is pending.
   */
  dispose() {
    if (!this.initialized) return;

    Object.keys(this.tracks || {}).forEach((trackId) => {
      this.evictTrack(trackId);
    });

    this.activeTrackId = null;
    this.currentScreen = null;
    this.context = null;
    this.targetNode = null;
    this._ensureRunning = null;
    this.initialized = false;
  }
}

export default FileTrackManager;
export { FILE_TRACK_CATALOG, FILE_TRACK_IDS, FILE_TRACK_PRELOAD_POLICY };
