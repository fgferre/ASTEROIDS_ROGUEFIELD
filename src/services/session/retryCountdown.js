// src/services/session/retryCountdown.js
//
// Retry after death: the retry count and button on the game over screen, the
// 3-2-1 countdown (its DOM node and 'session-retry-countdown' events), and the
// respawn from the death snapshot at the safest spot on the field.

import {
  DEFAULT_SAFE_SPAWN_DISTANCE,
  GAME_HEIGHT,
  GAME_WIDTH,
  PLAYER_SAFE_SPAWN_DISTANCE,
} from '../../core/GameConstants.js';

export class RetryCountdown {
  /**
   * `eventBus`: emits 'session-retry-countdown'.
   * `gameState`: the raw game state (its canvas, before the session's).
   * `canvas()`: the session's canvas, once initialized.
   * `resolveServiceInstance(name)`: a session service by name, or null.
   * `hasDeathSnapshot()` / `getDeathSnapshot()`: what the retry restores.
   * `restoreFromSnapshot({ snapshot })`: restores it; false on failure.
   * `prepareRandomForScope(scope, options)`: resets or restores the RNG.
   * `clearPendingGameOverTransition()`: drops a game over screen not yet open.
   * `setScreen(screen)` / `emitScreenChanged(screen, meta)`: the screen.
   * `setSessionState(state, meta)`: the session state.
   */
  constructor({
    eventBus,
    gameState,
    canvas,
    resolveServiceInstance,
    hasDeathSnapshot,
    getDeathSnapshot,
    restoreFromSnapshot,
    prepareRandomForScope,
    clearPendingGameOverTransition,
    setScreen,
    emitScreenChanged,
    setSessionState,
  }) {
    this.eventBus = eventBus;
    this.gameState = gameState;
    this.canvas = canvas;
    this.resolveServiceInstance = resolveServiceInstance;
    this.hasDeathSnapshot = hasDeathSnapshot;
    this.getDeathSnapshot = getDeathSnapshot;
    this.restoreFromSnapshot = restoreFromSnapshot;
    this.prepareRandomForScope = prepareRandomForScope;
    this.clearPendingGameOverTransition = clearPendingGameOverTransition;
    this.setScreen = setScreen;
    this.emitScreenChanged = emitScreenChanged;
    this.setSessionState = setSessionState;
    this.isRetryCountdownActive = false;

    this.retryCountdownElement = this.lookupDomElement('retry-countdown');
    this.retryButtonElement = this.lookupDomElement('retry-game-btn');
    this.retryCountElement = this.lookupDomElement('retry-count');
    this.retryCountdownHideTimeout = null;
    this.retryCountdownFollowupTimeout = null;
  }

  lookupDomElement(id) {
    if (typeof document === 'undefined' || !id) {
      return null;
    }

    try {
      const element = document.getElementById(id);
      return element || null;
    } catch (error) {
      console.warn(
        `[GameSessionService] Failed to lookup DOM element "${id}":`,
        error
      );
      return null;
    }
  }

  emitSessionRetryCountdown(payload = {}) {
    if (!this.eventBus || typeof this.eventBus.emit !== 'function') {
      return;
    }

    this.eventBus.emit('session-retry-countdown', { ...payload });
  }

  requestRetry({ source = 'unknown' } = {}) {
    if (this.isRetryCountdownActive) {
      console.warn(
        '[Retry] Countdown already active - ignoring duplicate request.'
      );
      return false;
    }

    const started = this.beginRetryCountdown({ source });
    if (!started) {
      this.emitSessionRetryCountdown({
        phase: 'aborted',
        reason: 'validation-failed',
        source,
      });
    }

    return started;
  }

  beginRetryCountdown({ source = 'unknown' } = {}) {
    if (this.isRetryCountdownActive) {
      return false;
    }

    const retries = this.getRetryCount();
    if (retries <= 0) {
      console.warn('[Retry] No retries remaining.');
      this.setRetryButtonEnabled(false);
      return false;
    }

    if (!this.hasDeathSnapshot()) {
      console.error('[Retry] Cannot begin countdown - missing snapshot');
      this.setRetryButtonEnabled(true);
      return false;
    }

    this.isRetryCountdownActive = true;

    this.setRetryButtonEnabled(false);
    this.setRetryCount(Math.max(0, retries - 1));

    this.emitSessionRetryCountdown({
      phase: 'start',
      total: 3,
      source,
    });

    const gameoverScreen = this.lookupDomElement('gameover-screen');
    if (gameoverScreen) {
      gameoverScreen.classList.add('hidden');
    }

    const gameUI = this.lookupDomElement('game-ui');
    if (gameUI) {
      gameUI.classList.remove('hidden');
    }

    const player = this.resolveServiceInstance('player');
    if (player) {
      player.isRetrying = true;
    }

    this.hideRetryCountdown();

    const countdownValues = [3, 2, 1];

    const advanceCountdown = (index = 0) => {
      if (index >= countdownValues.length) {
        this.emitSessionRetryCountdown({ phase: 'complete', source });
        this.completeRetryRespawn();
        return;
      }

      const value = countdownValues[index];
      this.emitSessionRetryCountdown({
        phase: 'tick',
        value,
        index,
        remaining: countdownValues.length - index - 1,
        total: countdownValues.length,
        source,
      });

      this.showRetryCountdownNumber(value, () => advanceCountdown(index + 1));
    };

    advanceCountdown(0);

    this.setSessionState('retrying', { reason: 'retry-countdown', source });

    return true;
  }

  completeRetryRespawn() {
    this.clearPendingGameOverTransition();
    this.isRetryCountdownActive = false;

    const player = this.resolveServiceInstance('player');
    const world = this.resolveServiceInstance('world');
    const snapshot = this.getDeathSnapshot();

    if (!snapshot) {
      console.error('[Retry] Cannot respawn - missing snapshot');
      if (player) {
        player.isRetrying = false;
      }
      this.setRetryButtonEnabled(true);
      return false;
    }

    try {
      if (snapshot.random) {
        this.prepareRandomForScope('retry.respawn', {
          mode: 'restore',
          snapshot: snapshot.random,
        });
      } else {
        this.prepareRandomForScope('retry.respawn', { mode: 'reset' });
      }
    } catch (error) {
      console.warn('[Retry] Failed to configure RNG for retry:', error);
    }

    if (!player || !world) {
      console.error('[Retry] Cannot respawn - missing services');
      if (player) {
        player.isRetrying = false;
      }
      this.setRetryButtonEnabled(true);
      return false;
    }

    const restored = this.restoreFromSnapshot({ snapshot });
    if (!restored) {
      console.error('[Retry] Failed to restore snapshot');
      player.isRetrying = false;
      this.setRetryButtonEnabled(true);
      return false;
    }

    const safeSpawn = this.findSafeSpawnPoint();

    if (typeof player.respawn === 'function') {
      try {
        player.respawn(safeSpawn, 3);
      } catch (error) {
        console.error('[Retry] Failed to respawn player:', error);
        player.isRetrying = false;
        this.setRetryButtonEnabled(true);
        return false;
      }
    }

    if (typeof world.reset === 'function') {
      try {
        world.reset();
      } catch (error) {
        console.warn('[Retry] Failed to reset world during respawn:', error);
      }
    }

    const gameoverScreen = this.lookupDomElement('gameover-screen');
    if (gameoverScreen) {
      gameoverScreen.classList.add('hidden');
    }

    this.hideRetryCountdown();

    const gameUI = this.lookupDomElement('game-ui');
    if (gameUI) {
      gameUI.classList.remove('hidden');
    }

    this.setScreen('playing');
    this.emitScreenChanged('playing', { source: 'retry-complete' });
    this.setSessionState('running', { reason: 'retry-complete' });

    return true;
  }

  getRetryCount() {
    let element = this.retryCountElement;
    if (!element || !element.isConnected) {
      element = this.lookupDomElement('retry-count');
      this.retryCountElement = element;
    }

    if (!element) {
      return 0;
    }

    const parsed = parseInt(element.textContent || '0', 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  setRetryCount(value) {
    let element = this.retryCountElement;
    if (!element || !element.isConnected) {
      element = this.lookupDomElement('retry-count');
      this.retryCountElement = element;
    }

    if (!element) {
      return;
    }

    const numeric = Number.isFinite(value)
      ? value
      : parseInt(String(value || '0'), 10);
    const safeValue = Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
    element.textContent = String(safeValue);
  }

  setRetryButtonEnabled(enabled = true) {
    let element = this.retryButtonElement;
    if (!element || !element.isConnected) {
      element = this.lookupDomElement('retry-game-btn');
      this.retryButtonElement = element;
    }

    if (!element) {
      return;
    }

    const allow = Boolean(enabled);
    element.disabled = !allow;
    if (element.style) {
      element.style.opacity = allow ? '1' : '0.5';
    }
  }

  ensureRetryCountdownElement() {
    let element = this.retryCountdownElement;
    if (!element || !element.isConnected) {
      element = this.lookupDomElement('retry-countdown');
      if (!element && typeof document !== 'undefined') {
        element = document.createElement('div');
        element.id = 'retry-countdown';
        element.className = 'wave-countdown';
        document.body.appendChild(element);
      }
      this.retryCountdownElement = element || null;
    }

    return element || null;
  }

  clearRetryCountdownTimers() {
    if (this.retryCountdownHideTimeout) {
      clearTimeout(this.retryCountdownHideTimeout);
      this.retryCountdownHideTimeout = null;
    }

    if (this.retryCountdownFollowupTimeout) {
      clearTimeout(this.retryCountdownFollowupTimeout);
      this.retryCountdownFollowupTimeout = null;
    }
  }

  hideRetryCountdown() {
    this.clearRetryCountdownTimers();

    let element = this.retryCountdownElement;
    if (!element || !element.isConnected) {
      element = this.lookupDomElement('retry-countdown');
      this.retryCountdownElement = element;
    }

    if (element) {
      element.classList.add('hidden');
    }

    this.emitSessionRetryCountdown({ phase: 'hidden' });
  }

  showRetryCountdownNumber(number, onComplete) {
    const countdown = this.ensureRetryCountdownElement();
    if (!countdown) {
      if (typeof onComplete === 'function') {
        setTimeout(onComplete, 0);
      }
      return;
    }

    countdown.textContent = String(number);
    countdown.classList.remove('hidden');

    this.clearRetryCountdownTimers();

    this.retryCountdownHideTimeout = setTimeout(() => {
      countdown.classList.add('hidden');
      this.retryCountdownHideTimeout = null;
      this.retryCountdownFollowupTimeout = setTimeout(() => {
        this.retryCountdownFollowupTimeout = null;
        if (typeof onComplete === 'function') {
          onComplete();
        }
      }, 100);
    }, 900);
  }

  findSafeSpawnPoint() {
    const fallback = {
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2,
    };

    const enemies = this.resolveServiceInstance('enemies');
    const canvas = this.canvas() || this.gameState?.canvas || null;

    if (!enemies || !canvas) {
      return fallback;
    }

    const asteroids =
      typeof enemies.getActiveEnemies === 'function'
        ? enemies.getActiveEnemies()
        : typeof enemies.getAsteroids === 'function'
          ? enemies.getAsteroids()
          : [];

    const width = GAME_WIDTH;
    const height = GAME_HEIGHT;

    const safeDistance =
      PLAYER_SAFE_SPAWN_DISTANCE ?? DEFAULT_SAFE_SPAWN_DISTANCE ?? 300;

    const center = { x: width / 2, y: height / 2 };
    const quadrants = [
      { x: width * 0.25, y: height * 0.25 },
      { x: width * 0.75, y: height * 0.25 },
      { x: width * 0.25, y: height * 0.75 },
      { x: width * 0.75, y: height * 0.75 },
    ];
    const candidates = [center, ...quadrants];

    const scoreCandidate = (point) => {
      let minDistance = Number.POSITIVE_INFINITY;
      let safe = true;

      for (let index = 0; index < asteroids.length; index += 1) {
        const ast = asteroids[index];
        if (!ast) {
          continue;
        }

        const ax = Number.isFinite(ast.x) ? ast.x : Number(ast.position?.x);
        const ay = Number.isFinite(ast.y) ? ast.y : Number(ast.position?.y);

        if (!Number.isFinite(ax) || !Number.isFinite(ay)) {
          continue;
        }

        const dx = ax - point.x;
        const dy = ay - point.y;
        const distance = Math.hypot(dx, dy);
        minDistance = Math.min(minDistance, distance);
        if (distance <= safeDistance) {
          safe = false;
        }
      }

      return {
        point,
        safe,
        minDistance,
      };
    };

    let bestCandidate = null;

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = scoreCandidate(candidates[index]);
      if (candidate.safe) {
        return candidate.point;
      }

      if (!bestCandidate || candidate.minDistance > bestCandidate.minDistance) {
        bestCandidate = candidate;
      }
    }

    return bestCandidate?.point || fallback;
  }
}
