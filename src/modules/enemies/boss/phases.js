// src/modules/enemies/boss/phases.js
//
// The Warden's phases: the health marks that end each one, the movement each
// phase uses (the components' movementPhases), and the step to the next phase
// (a short invulnerability, fresh attack timers, boss-phase-changed). Every
// function acts on the boss passed first. BossEnemy keeps methods of the same
// names: EnemySnapshots and the tests call them, and WardenChoir and WardenNull
// extend advancePhase, which evaluatePhaseTransition calls through the boss.

import { GameDebugLogger } from '../../../utils/dev/GameDebugLogger.js';
import { emitInvulnerabilityState } from './invulnerability.js';

export function syncPhaseThresholds(boss, force = false) {
  const maxHealth = Number.isFinite(boss.maxHealth) ? boss.maxHealth : null;
  if (!Number.isFinite(maxHealth)) {
    boss.phaseHealthThresholds = [];
    boss._phaseThresholdMaxHealth = null;
    return;
  }

  if (
    !force &&
    boss._phaseThresholdMaxHealth === maxHealth &&
    boss.phaseHealthThresholds.length
  ) {
    return;
  }

  const thresholds = Array.isArray(boss.phaseThresholds)
    ? boss.phaseThresholds
    : [];
  boss.phaseHealthThresholds = thresholds.map((ratio) => {
    const clamped = Math.min(Math.max(ratio, 0), 1);
    return maxHealth * clamped;
  });
  boss._phaseThresholdMaxHealth = maxHealth;
  boss.nextPhaseIndex = Math.min(
    Math.max(0, boss.currentPhase || 0),
    boss.phaseHealthThresholds.length
  );
}

export function applyPhaseMovement(boss, force = false) {
  if (!Array.isArray(boss.movementPhases) || !boss.movementPhases.length) {
    if (force) {
      boss._lastMovementPhase = null;
    }
    return;
  }

  const phaseIndex = Math.min(
    Math.max(0, boss.currentPhase || 0),
    boss.movementPhases.length - 1
  );

  if (!force && boss._lastMovementPhase === phaseIndex) {
    return;
  }

  const phaseConfig = boss.movementPhases[phaseIndex] || {};
  const { strategy, ...movementOverrides } = phaseConfig;

  if (strategy) {
    boss.movementStrategy = strategy;
  }

  boss.movementConfig = { ...movementOverrides };
  boss._lastMovementPhase = phaseIndex;
}

export function evaluatePhaseTransition(boss) {
  boss.syncPhaseThresholds();
  if (!boss.phaseHealthThresholds.length) {
    return;
  }

  while (
    boss.nextPhaseIndex < boss.phaseHealthThresholds.length &&
    boss.health <= boss.phaseHealthThresholds[boss.nextPhaseIndex]
  ) {
    boss.advancePhase();
  }
}

export function advancePhase(boss) {
  if (boss.currentPhase >= boss.phaseCount - 1) {
    boss.nextPhaseIndex = boss.phaseHealthThresholds.length;
    return;
  }

  const previousPhase = boss.currentPhase;
  boss.currentPhase = Math.min(boss.phaseCount - 1, boss.currentPhase + 1);
  boss.nextPhaseIndex += 1;
  boss.applyPhaseMovement(true);

  boss.invulnerable = true;
  boss.invulnerabilityTimer = boss.invulnerabilityDuration || 0;

  emitInvulnerabilityState(boss, true, {
    reason: 'phase-transition',
    timer: boss.invulnerabilityTimer,
  });

  boss.spreadTimer = boss.computeSpreadCooldown();
  boss.volleyTimer = boss.computeVolleyCooldown();
  boss.spawnTimer = boss.computeSpawnCooldown();
  boss.chargeTimer = boss.chargeCooldown;
  boss.chargeState = 'idle';
  boss.chargeStateTimer = 0;

  const eventBus = boss.getEventBus();
  if (eventBus?.emit) {
    eventBus.emit('boss-phase-changed', {
      enemy: boss,
      phase: boss.currentPhase,
      wave: boss.wave,
      health: boss.health,
      maxHealth: boss.maxHealth,
    });
  }

  const healthPercent =
    Number.isFinite(boss.maxHealth) && boss.maxHealth > 0
      ? Number(((boss.health / boss.maxHealth) * 100).toFixed(1))
      : null;

  GameDebugLogger.log('STATE', 'Boss phase transition', {
    id: boss.id,
    oldPhase: previousPhase,
    newPhase: boss.currentPhase,
    health: boss.health,
    maxHealth: boss.maxHealth,
    healthPercent,
    invulnerable: !!boss.invulnerable,
    invulnerabilityDuration: boss.invulnerabilityTimer,
  });
}
