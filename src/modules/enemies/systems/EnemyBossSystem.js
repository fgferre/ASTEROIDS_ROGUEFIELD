// src/modules/enemies/systems/EnemyBossSystem.js
// The Wardens on the field: who is tracked, the boss HUD state and its
// updates, the boss events (spawn, phase, damage, invulnerability, defeat),
// and which kinds a boss may summon.
import { GameDebugLogger } from '../../../utils/dev/GameDebugLogger.js';
import { PALETTE, withAlpha } from '../../../data/constants/palette.js';
import { BOSS_CONFIG } from '../../../data/constants/visual.js';
import { getContent } from '../../../content/registry.js';

export class EnemyBossSystem {
  /**
   * @param {object} kit What the boss handlers need from EnemySystem:
   *   rewards (its rewards module), value getters (getFactory, getWaveState,
   *   getAsteroids, getPhysics, getSessionStats) and calls
   *   (getCachedUI, getCachedEffects, getCachedAudio, registerActiveEnemy,
   *   warnIfWaveManagerRegistrationFailed, registerEnemyWithPhysics,
   *   unregisterEnemyFromPhysics, removeActiveEnemy, releaseAsteroid).
   */
  constructor(kit) {
    this.kit = kit;
    this.rewards = kit.rewards;
    this.activeBosses = new Map();
    this.bossHudState = this.createInitialBossHudState();
    this.availableBossMinionTypes = [];
    this._lastBossHudDamageUpdate = 0;
  }

  /**
   * The boss events EnemySystem listens to, through its `on`; a boss wave
   * start and a spawn refresh its services first.
   */
  registerEventListeners(on, refreshServiceState) {
    on('enemy-damaged', (data) => {
      this.handleEnemyDamaged(data);
    });

    on('boss-wave-started', (data) => {
      refreshServiceState();
      this.handleBossWaveStarted(data);
    });

    on('boss-spawned', (data) => {
      refreshServiceState();
      this.handleBossSpawned(data);
    });

    on('boss-phase-changed', (data) => {
      this.handleBossPhaseChange(data);
    });

    on('boss-defeated', (data) => {
      this.handleBossDefeated(data);
    });

    on('boss-invulnerability-changed', (data) => {
      this.handleBossInvulnerabilityChanged(data);
    });
  }

  // EnemySystem's state and calls, under the names the handlers use.
  get factory() {
    return this.kit.getFactory();
  }

  get waveState() {
    return this.kit.getWaveState();
  }

  get asteroids() {
    return this.kit.getAsteroids();
  }

  get physics() {
    return this.kit.getPhysics();
  }

  get sessionStats() {
    return this.kit.getSessionStats();
  }

  getCachedUI() {
    return this.kit.getCachedUI();
  }

  getCachedEffects() {
    return this.kit.getCachedEffects();
  }

  getCachedAudio() {
    return this.kit.getCachedAudio();
  }

  registerActiveEnemy(...args) {
    return this.kit.registerActiveEnemy(...args);
  }

  warnIfWaveManagerRegistrationFailed(...args) {
    return this.kit.warnIfWaveManagerRegistrationFailed(...args);
  }

  registerEnemyWithPhysics(enemy) {
    return this.kit.registerEnemyWithPhysics(enemy);
  }

  unregisterEnemyFromPhysics(enemy) {
    return this.kit.unregisterEnemyFromPhysics(enemy);
  }

  removeActiveEnemy(enemy) {
    return this.kit.removeActiveEnemy(enemy);
  }

  releaseAsteroid(asteroid) {
    return this.kit.releaseAsteroid(asteroid);
  }

  isBossEnemy(enemy) {
    if (!enemy) {
      return false;
    }

    if (enemy.type === 'boss') {
      return true;
    }

    if (typeof enemy.hasTag === 'function') {
      return enemy.hasTag('boss');
    }

    if (enemy.tags && typeof enemy.tags.has === 'function') {
      return enemy.tags.has('boss');
    }

    return false;
  }

  trackBossEnemy(enemy) {
    if (!enemy) {
      return;
    }

    if (!this.activeBosses) {
      this.activeBosses = new Map();
    }

    const bossId = enemy.id ?? enemy.bossId ?? null;
    if (bossId != null) {
      this.activeBosses.set(bossId, enemy);
    }
  }

  untrackBossEnemy(enemy) {
    if (!enemy || !this.activeBosses) {
      return;
    }

    const bossId = enemy.id ?? enemy.bossId ?? null;
    if (bossId != null) {
      this.activeBosses.delete(bossId);
    }
  }

  getTrackedBoss(bossId) {
    if (!this.activeBosses || bossId == null) {
      return null;
    }

    return this.activeBosses.get(bossId) || null;
  }

  resolveBossReference(payload = {}) {
    if (payload && payload.enemy) {
      return payload.enemy;
    }

    const candidateId =
      payload?.enemyId ??
      payload?.id ??
      payload?.source?.id ??
      payload?.bossId ??
      null;

    if (candidateId != null) {
      return this.getTrackedBoss(candidateId);
    }

    return null;
  }

  createInitialBossHudState() {
    return {
      active: false,
      upcoming: false,
      defeated: false,
      bossId: null,
      name: null,
      phase: 0,
      phaseCount: 0,
      health: 0,
      maxHealth: 0,
      wave: null,
      color: null,
      phaseColors: [],
      lastUpdate: null,
      invulnerable: false,
      invulnerabilityTimer: null,
      invulnerabilitySource: null,
    };
  }

  getAvailableBossMinionTypes(preferredTypes = null) {
    const rawCandidates =
      Array.isArray(preferredTypes) && preferredTypes.length
        ? [...preferredTypes]
        : Array.isArray(this.availableBossMinionTypes) &&
            this.availableBossMinionTypes.length
          ? [...this.availableBossMinionTypes]
          : Array.isArray(BOSS_CONFIG?.minionTypes)
            ? [...BOSS_CONFIG.minionTypes]
            : [];

    const factory = this.factory;
    const hasFactoryCheck = factory && typeof factory.hasType === 'function';
    const enabledTypes =
      factory && typeof factory.getEnabledTypes === 'function'
        ? new Set(factory.getEnabledTypes())
        : null;

    const normalized = [];
    const seen = new Set();

    const isTypeAvailable = (value) => {
      if (!value) {
        return false;
      }

      const trimmed = String(value).trim();
      if (!trimmed) {
        return false;
      }

      const candidate = trimmed.toLowerCase();
      if (candidate === 'boss' || seen.has(candidate)) {
        return false;
      }

      if (hasFactoryCheck && !factory.hasType(candidate)) {
        return false;
      }

      if (enabledTypes && !enabledTypes.has(candidate)) {
        return false;
      }

      if (!getContent('enemies', candidate) && candidate !== 'asteroid') {
        return false;
      }

      return true;
    };

    for (let i = 0; i < rawCandidates.length; i += 1) {
      const candidate = rawCandidates[i];
      if (!isTypeAvailable(candidate)) {
        continue;
      }

      const key = String(candidate).trim().toLowerCase();
      seen.add(key);
      normalized.push(key);
    }

    // None available: the first of the base Warden's minion kinds, then of
    // every registered kind, that is.
    if (!normalized.length) {
      const fallback = [
        ...(BOSS_CONFIG?.minionTypes ?? []),
        ...(hasFactoryCheck ? factory.getRegisteredTypes?.() || [] : []),
      ].find(isTypeAvailable);
      if (fallback) {
        normalized.push(String(fallback).trim().toLowerCase());
      }
    }

    this.availableBossMinionTypes = normalized;
    return [...normalized];
  }

  emitBossHudUpdate(patch = null) {
    const timestamp =
      typeof performance !== 'undefined' &&
      typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    if (!this.bossHudState) {
      this.bossHudState = this.createInitialBossHudState();
    }

    if (patch && typeof patch === 'object') {
      const next = { ...this.bossHudState, ...patch };
      if (patch.phaseColors && Array.isArray(patch.phaseColors)) {
        next.phaseColors = [...patch.phaseColors];
      }
      this.bossHudState = next;
    }

    if (!Array.isArray(this.bossHudState.phaseColors)) {
      this.bossHudState.phaseColors = [];
    }

    this.bossHudState.lastUpdate = timestamp;
    this.bossHudState.invulnerable = Boolean(this.bossHudState.invulnerable);
    if (Number.isFinite(this.bossHudState.invulnerabilityTimer)) {
      this.bossHudState.invulnerabilityTimer = Math.max(
        0,
        Number(this.bossHudState.invulnerabilityTimer)
      );
    } else {
      this.bossHudState.invulnerabilityTimer = null;
    }

    this.getCachedUI()?.handleBossEvent('boss-hud-update', {
      ...this.bossHudState,
    });

    return this.bossHudState;
  }

  forwardBossEvent() {
    // Raw boss events (boss-spawned, boss-phase-changed, boss-defeated) are
    // already emitted by BossEnemy / EnemySpawnSystem and consumed directly
    // by EffectsSystem, AudioSystem and UISystem via their own listeners.
    // This method previously duplicated that processing via direct calls
    // AND secondary event emissions (effects-boss-*, audio-boss-*, ui-boss-*).
    // Kept as a no-op hook for any future per-event bookkeeping in EnemySystem.
  }

  dropBossRewards(boss, rewards = {}) {
    return this.rewards.dropBossRewards(boss, rewards);
  }

  getBossHudState() {
    if (!this.bossHudState) {
      this.bossHudState = this.createInitialBossHudState();
    }

    return {
      ...this.bossHudState,
      phaseColors: Array.isArray(this.bossHudState.phaseColors)
        ? [...this.bossHudState.phaseColors]
        : [],
      invulnerable: Boolean(this.bossHudState.invulnerable),
      invulnerabilityTimer: Number.isFinite(
        this.bossHudState.invulnerabilityTimer
      )
        ? Math.max(0, Number(this.bossHudState.invulnerabilityTimer))
        : null,
      invulnerabilitySource: this.bossHudState.invulnerabilitySource || null,
    };
  }

  handleBossWaveStarted(data = {}) {
    const waveNumber = Number.isFinite(data.wave)
      ? data.wave
      : this.waveState?.current ?? null;

    const phaseColors = Array.isArray(data.phaseColors)
      ? [...data.phaseColors]
      : Array.isArray(this.bossHudState?.phaseColors)
        ? [...this.bossHudState.phaseColors]
        : [];

    this.bossHudState = {
      ...this.createInitialBossHudState(),
      upcoming: true,
      active: false,
      defeated: false,
      wave: waveNumber,
      name: data.name || this.bossHudState?.name || null,
      phaseColors,
      invulnerable: false,
      invulnerabilityTimer: null,
      invulnerabilitySource: null,
    };

    this.emitBossHudUpdate();

    // boss-wave-started has no raw listeners in EffectsSystem/AudioSystem
    // (unlike boss-spawned/phase-changed/defeated), so apply feedback here.
    this.getCachedEffects()?.addScreenFlash(
      withAlpha(PALETTE.boss, 0.25),
      0.35,
      0.2
    );
    this.getCachedAudio()?.sfxBus.playShieldShockwave();
  }

  handleBossSpawned(data = {}) {
    const boss = this.resolveBossReference(data);

    if (!boss) {
      console.warn('[EnemySystem] boss-spawned event missing enemy reference');
      this.forwardBossEvent('boss-spawned', data);
      return;
    }

    if (!this.asteroids.includes(boss)) {
      const registrationResult = this.registerActiveEnemy(boss, {
        skipDuplicateCheck: true,
      });
      this.warnIfWaveManagerRegistrationFailed(
        registrationResult,
        'boss-event-spawn',
        boss
      );
    } else {
      this.trackBossEnemy(boss);
      this.registerEnemyWithPhysics(boss);
    }

    boss.destroyed = false;

    const waveNumber = Number.isFinite(data.wave)
      ? data.wave
      : boss.wave ?? this.waveState?.current ?? null;

    const phase = data.phase ?? boss.currentPhase ?? 0;
    const maxHealth = data.maxHealth ?? boss.maxHealth ?? boss.health ?? 0;
    const health = data.health ?? boss.health ?? maxHealth;
    const invulnerable = Boolean(
      data.invulnerable ?? boss.invulnerable ?? this.bossHudState?.invulnerable
    );
    const invulnerabilityTimer = Number.isFinite(data.invulnerabilityTimer)
      ? Math.max(0, Number(data.invulnerabilityTimer))
      : Number.isFinite(boss.invulnerabilityTimer)
        ? Math.max(0, Number(boss.invulnerabilityTimer))
        : null;
    const invulnerabilitySource = data.invulnerabilitySource ?? null;
    const phaseColorsSource = Array.isArray(boss.phaseColors)
      ? boss.phaseColors
      : Array.isArray(data.phaseColors)
        ? data.phaseColors
        : this.bossHudState?.phaseColors;
    const phaseColors = Array.isArray(phaseColorsSource)
      ? [...phaseColorsSource]
      : [];
    const color = phaseColors.length
      ? phaseColors[Math.min(phase, phaseColors.length - 1)]
      : this.bossHudState?.color ?? null;

    this.bossHudState = {
      ...this.bossHudState,
      active: true,
      upcoming: false,
      defeated: false,
      bossId: boss.id ?? this.bossHudState?.bossId ?? null,
      name: boss.displayName || boss.name || this.bossHudState?.name || 'Boss',
      phase,
      phaseCount: boss.phaseCount ?? this.bossHudState?.phaseCount ?? 0,
      health,
      maxHealth,
      wave: waveNumber,
      color,
      phaseColors,
      invulnerable,
      invulnerabilityTimer,
      invulnerabilitySource,
    };

    this.emitBossHudUpdate();
    this.forwardBossEvent('boss-spawned', {
      ...data,
      enemy: boss,
      wave: waveNumber,
      phase,
      health,
      maxHealth,
      color,
      phaseColors,
      invulnerable,
      invulnerabilityTimer,
    });
  }

  handleBossPhaseChange(data = {}) {
    const boss = this.resolveBossReference(data);

    if (boss) {
      this.trackBossEnemy(boss);
    }

    const waveNumber = Number.isFinite(data.wave)
      ? data.wave
      : boss?.wave ?? this.waveState?.current ?? null;

    const phase =
      data.phase ?? boss?.currentPhase ?? this.bossHudState?.phase ?? 0;
    const maxHealth =
      data.maxHealth ?? boss?.maxHealth ?? this.bossHudState?.maxHealth ?? 0;
    const health =
      data.health ?? boss?.health ?? this.bossHudState?.health ?? maxHealth;
    const invulnerable = Boolean(
      data.invulnerable ?? boss?.invulnerable ?? this.bossHudState?.invulnerable
    );
    const invulnerabilityTimer = Number.isFinite(data.invulnerabilityTimer)
      ? Math.max(0, Number(data.invulnerabilityTimer))
      : Number.isFinite(boss?.invulnerabilityTimer)
        ? Math.max(0, Number(boss.invulnerabilityTimer))
        : null;
    const invulnerabilitySource = data.invulnerabilitySource ?? null;
    const phaseColorsSource =
      boss && Array.isArray(boss.phaseColors)
        ? boss.phaseColors
        : Array.isArray(data.phaseColors)
          ? data.phaseColors
          : this.bossHudState?.phaseColors;
    const phaseColors = Array.isArray(phaseColorsSource)
      ? [...phaseColorsSource]
      : [];
    const color = phaseColors.length
      ? phaseColors[Math.min(phase, phaseColors.length - 1)]
      : this.bossHudState?.color ?? null;

    this.bossHudState = {
      ...this.bossHudState,
      active: true,
      upcoming: false,
      bossId: boss?.id ?? this.bossHudState?.bossId ?? null,
      name:
        boss?.displayName || boss?.name || this.bossHudState?.name || 'Boss',
      phase,
      phaseCount: boss?.phaseCount ?? this.bossHudState?.phaseCount ?? 0,
      health,
      maxHealth,
      wave: waveNumber,
      color,
      phaseColors,
      invulnerable,
      invulnerabilityTimer,
      invulnerabilitySource,
    };

    this.emitBossHudUpdate();
    this.forwardBossEvent('boss-phase-changed', {
      ...data,
      enemy: boss,
      wave: waveNumber,
      phase,
      health,
      maxHealth,
      color,
      phaseColors,
      invulnerable,
      invulnerabilityTimer,
    });
  }

  handleBossDefeated(data = {}) {
    const boss = this.resolveBossReference(data);

    if (!boss) {
      this.forwardBossEvent('boss-defeated', data);
      return;
    }

    this.physics.clearBossPhysicsState(boss);

    const waveNumber = Number.isFinite(data.wave)
      ? data.wave
      : boss.wave ?? this.waveState?.current ?? null;

    const rewards = this.dropBossRewards(boss, data.rewards || {});
    const position = data.position || { x: boss.x ?? 0, y: boss.y ?? 0 };

    boss.destroyed = true;

    const phaseColorsSource = Array.isArray(this.bossHudState?.phaseColors)
      ? this.bossHudState.phaseColors
      : Array.isArray(boss.phaseColors)
        ? boss.phaseColors
        : null;
    const phaseColors = Array.isArray(phaseColorsSource)
      ? [...phaseColorsSource]
      : [];

    const nextHudState = {
      ...this.bossHudState,
      active: false,
      upcoming: false,
      defeated: true,
      bossId: boss.id ?? this.bossHudState?.bossId ?? null,
      name: boss.displayName || boss.name || this.bossHudState?.name || 'Boss',
      phase: boss.currentPhase ?? this.bossHudState?.phase ?? 0,
      phaseCount: boss.phaseCount ?? this.bossHudState?.phaseCount ?? 0,
      health: 0,
      maxHealth:
        rewards?.maxHealth ??
        boss.maxHealth ??
        this.bossHudState?.maxHealth ??
        0,
      wave: waveNumber,
      color: this.bossHudState?.color ?? null,
      phaseColors,
      invulnerable: false,
      invulnerabilityTimer: null,
      invulnerabilitySource: 'defeated',
    };

    this.unregisterEnemyFromPhysics(boss);
    this.untrackBossEnemy(boss);
    this.removeActiveEnemy(boss);

    this.bossHudState = nextHudState;
    this.emitBossHudUpdate();

    this.forwardBossEvent('boss-defeated', {
      ...data,
      enemy: boss,
      rewards,
      wave: waveNumber,
      position,
      color: nextHudState.color,
      phaseColors,
      invulnerable: false,
      invulnerabilityTimer: null,
    });

    this.releaseAsteroid(boss);

    this.sessionStats.totalKills += 1;
  }

  handleBossInvulnerabilityChanged(data = {}) {
    const boss = this.resolveBossReference(data);

    if (boss) {
      this.trackBossEnemy(boss);
    }

    const waveNumber = Number.isFinite(data.wave)
      ? Number(data.wave)
      : boss?.wave ??
        this.bossHudState?.wave ??
        this.waveState?.current ??
        null;
    const invulnerable = Boolean(
      data.invulnerable ?? boss?.invulnerable ?? this.bossHudState?.invulnerable
    );
    const timerValue =
      data.remaining ??
      data.invulnerabilityTimer ??
      data.timer ??
      data.timeRemaining;
    const invulnerabilityTimer = Number.isFinite(timerValue)
      ? Math.max(0, Number(timerValue))
      : Number.isFinite(boss?.invulnerabilityTimer)
        ? Math.max(0, Number(boss.invulnerabilityTimer))
        : null;
    const source = data.reason ?? data.invulnerabilitySource ?? null;

    this.bossHudState = {
      ...(this.bossHudState || this.createInitialBossHudState()),
      invulnerable,
      invulnerabilityTimer,
      invulnerabilitySource: source,
      wave: waveNumber ?? this.bossHudState?.wave ?? null,
      active: invulnerable ? true : this.bossHudState?.active,
      upcoming: invulnerable ? false : this.bossHudState?.upcoming,
    };

    GameDebugLogger.log('STATE', 'Boss invulnerability update received', {
      invulnerable,
      timer: invulnerabilityTimer,
      wave: waveNumber,
      source,
    });

    this.emitBossHudUpdate();
    this.forwardBossEvent('boss-invulnerability-changed', {
      ...data,
      enemy: boss,
      wave: waveNumber,
      invulnerable,
      invulnerabilityTimer,
      invulnerabilitySource: source,
    });
  }

  handleEnemyDamaged(data = {}) {
    if (!data) {
      return;
    }

    const enemyType = data.enemyType || data.type || data.enemy?.type || null;
    const isBoss = enemyType === 'boss' || this.isBossEnemy(data.enemy || null);

    if (!isBoss) {
      return;
    }

    const boss = this.resolveBossReference(data) || data.enemy || null;
    if (boss) {
      this.trackBossEnemy(boss);
    }

    const now =
      typeof performance !== 'undefined' &&
      typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    if (
      this._lastBossHudDamageUpdate &&
      now - this._lastBossHudDamageUpdate < 80
    ) {
      return;
    }

    const current = this.bossHudState || this.createInitialBossHudState();
    const health = Number.isFinite(data.remaining)
      ? Number(data.remaining)
      : Number.isFinite(boss?.health)
        ? boss.health
        : current.health;
    const maxHealth = Number.isFinite(boss?.maxHealth)
      ? boss.maxHealth
      : Number.isFinite(data.maxHealth)
        ? Number(data.maxHealth)
        : current.maxHealth;
    const phase = Number.isFinite(boss?.currentPhase)
      ? boss.currentPhase
      : Number.isFinite(data.phase)
        ? Number(data.phase)
        : current.phase;

    const nextHealth = Number.isFinite(health) ? health : current.health;
    const nextMaxHealth = Number.isFinite(maxHealth)
      ? maxHealth
      : current.maxHealth;
    const nextPhase = Number.isFinite(phase) ? phase : current.phase;

    const changed =
      nextHealth !== current.health ||
      nextMaxHealth !== current.maxHealth ||
      nextPhase !== current.phase;

    if (!changed) {
      return;
    }

    const patch = {
      health: nextHealth,
      maxHealth: nextMaxHealth,
      phase: nextPhase,
    };

    if (boss?.id != null) {
      patch.bossId = boss.id;
    }

    this._lastBossHudDamageUpdate = now;
    this.emitBossHudUpdate(patch);
  }
}
