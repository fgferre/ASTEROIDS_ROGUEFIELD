// src/modules/physics/ImpactFeedback.js
//
// What an impact feels like: the screen shake and the boss-* events of a
// Warden's contact, charge and area blast, each held back by its cooldown so a
// long touch does not shake every frame. PhysicsSystem owns it; the player
// contact and the Warden's attacks ask it for feedback after they resolve.

import { resolveService } from '../../core/serviceUtils.js';
import {
  getBossAreaShake,
  getBossChargeShake,
  getBossCollisionCooldown,
  getBossContactShake,
} from './bossTuning.js';

export class ImpactFeedback {
  /**
   * `dependencies`: the physics service bag, where the effects service turns up late.
   * `bossCollisionState`: last impact time per Warden and type (PhysicsSystem clears it with the tracking).
   * `getSimulationTimeMs()`: the simulation clock in milliseconds.
   * `emit(name, payload)`: sends boss-screen-shake and the boss impact events.
   */
  constructor({ dependencies, bossCollisionState, getSimulationTimeMs, emit }) {
    this.dependencies = dependencies;
    this.bossCollisionState = bossCollisionState;
    this.getSimulationTimeMs = getSimulationTimeMs;
    this.emit = emit;
    this.effectsService = this.dependencies.effects || null;
  }

  reset() {
    this.effectsService = this.dependencies.effects || null;
  }

  shouldEmitBossCollision(boss, type) {
    if (!boss) {
      return false;
    }

    const now = this.getSimulationTimeMs();
    const cooldown = getBossCollisionCooldown(type);
    const state = this.bossCollisionState.get(boss) || {};
    const lastTime = state[type] ?? -Infinity;

    if (now - lastTime < cooldown) {
      return false;
    }

    state[type] = now;
    this.bossCollisionState.set(boss, state);
    return true;
  }

  clearBossPhysicsState(reference = null) {
    if (reference == null) {
      this.bossCollisionState.clear();
      return;
    }

    if (!this.bossCollisionState.size) {
      return;
    }

    if (this.bossCollisionState.delete(reference)) {
      return;
    }

    const referenceId =
      typeof reference === 'object' && reference
        ? reference.id ?? reference.bossId ?? null
        : reference;

    if (referenceId == null) {
      return;
    }

    for (const boss of this.bossCollisionState.keys()) {
      if (!boss) {
        this.bossCollisionState.delete(boss);
        continue;
      }

      if (boss.id === referenceId || boss.bossId === referenceId) {
        this.bossCollisionState.delete(boss);
      }
    }
  }

  emitBossPhysicsEvent(eventName, payload = {}) {
    this.emit(eventName, { ...payload, processedBy: 'physics' });
  }

  // Effects is built after physics in the manifest, so it is resolved on first
  // use; physics-only harnesses legitimately run without it.
  getEffectsService() {
    if (!this.effectsService) {
      this.effectsService = resolveService('effects', this.dependencies);
    }
    return this.effectsService;
  }

  triggerScreenShake(
    intensity,
    duration,
    reason = 'boss-impact',
    payload = {}
  ) {
    if (
      !Number.isFinite(intensity) ||
      intensity <= 0 ||
      !Number.isFinite(duration) ||
      duration <= 0
    ) {
      return;
    }

    this.getEffectsService()?.addScreenShake(intensity, duration);

    this.emitBossPhysicsEvent('boss-screen-shake', {
      reason,
      intensity,
      duration,
      ...payload,
    });
  }

  handleBossCollisionFeedback(type, context = {}) {
    const boss = context.boss || context.enemy || null;
    if (!this.shouldEmitBossCollision(boss, type)) {
      return;
    }

    let shakeConfig = null;

    switch (type) {
      case 'boss-charge':
        shakeConfig = getBossChargeShake(context.screenShake);
        break;
      case 'boss-area':
        shakeConfig = getBossAreaShake(context.screenShake);
        break;
      default:
        shakeConfig = getBossContactShake(context.screenShake);
        break;
    }

    if (shakeConfig) {
      this.triggerScreenShake(
        shakeConfig.intensity,
        shakeConfig.duration,
        type,
        {
          bossId: boss?.id ?? null,
          playerId: context.player?.id ?? null,
          impactPosition: context.impactPosition || null,
          overlap: context.overlap ?? null,
          relativeSpeed: context.relativeSpeed ?? null,
        }
      );
    }

    let eventName = 'boss-contact-collision';
    if (type === 'boss-charge') {
      eventName = 'boss-charge-impact';
    } else if (type === 'boss-area') {
      eventName = 'boss-area-damage';
    }

    this.emitBossPhysicsEvent(eventName, {
      type,
      boss,
      player: context.player || null,
      damage: context.damage ?? null,
      knockback: context.knockback ?? null,
      overlap: context.overlap ?? null,
      relativeSpeed: context.relativeSpeed ?? null,
      impactPosition: context.impactPosition || null,
      source: context.source || 'physics',
    });
  }
}
