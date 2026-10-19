// src/modules/player/shield.js
//
// The deflector shield: its level, hit points and cooldown, raised by the
// shield key, worn down by hits and recharged after it breaks, each change
// announced on the event bus. PlayerSystem owns one; the HUD, the 3D mirror
// and the enemies' damage read its fields through the player.

import {
  SHIELD_COOLDOWN_DURATION,
  SHIELD_IMPACT_DAMAGE_BASE,
  SHIELD_IMPACT_DAMAGE_PER_LEVEL,
} from '../../data/constants/gameplay.js';

const SHIELD_LEVEL_CONFIG = {
  1: {
    maxHP: 50,
    cooldown: SHIELD_COOLDOWN_DURATION,
  },
  2: {
    maxHP: 75,
    cooldown: SHIELD_COOLDOWN_DURATION,
  },
  3: {
    maxHP: 75,
    cooldown: Math.max(5, SHIELD_COOLDOWN_DURATION - 5),
  },
  4: {
    maxHP: 100,
    cooldown: Math.max(5, SHIELD_COOLDOWN_DURATION - 5),
  },
  5: {
    maxHP: 125,
    cooldown: Math.max(4, SHIELD_COOLDOWN_DURATION - 7),
  },
};

export class PlayerShield {
  /**
   * `getEventBus()`: the player's event bus, read live; every shield event goes out on it.
   * `getPosition()`: a copy of the ship's position; the level 5 break blasts from there.
   */
  constructor({ getEventBus, getPosition }) {
    this.getEventBus = getEventBus;
    this.getPosition = getPosition;
    this.resetShieldState();
  }

  // The recharge countdown after a break, once per step.
  updateCooldown(deltaTime) {
    if (this.shieldCooldownTimer > 0) {
      this.shieldCooldownTimer -= deltaTime;
      if (this.shieldCooldownTimer <= 0) {
        this.shieldCooldownTimer = 0;
        if (this.shieldWasInCooldown) {
          this.shieldWasInCooldown = false;
          this.shieldHP = this.shieldMaxHP;
          this.getEventBus()?.emit?.('shield-recharged', {
            level: this.shieldUpgradeLevel,
          });
          this.emitShieldStats();
        } else {
          this.emitShieldStats(); // Emit stats during cooldown for UI progress bar
        }
      }
    }
  }

  applyShieldLevel(level) {
    const config = SHIELD_LEVEL_CONFIG[level];
    if (!config) {
      return;
    }

    this.shieldUpgradeLevel = level;
    this.shieldMaxHP = config.maxHP;
    this.shieldMaxCooldown = config.cooldown;

    if (this.isShieldActive) {
      this.shieldHP = this.shieldMaxHP;
    } else if (this.shieldCooldownTimer <= 0) {
      this.shieldHP = this.shieldMaxHP;
    } else {
      this.shieldHP = Math.min(this.shieldHP, this.shieldMaxHP);
    }

    if (level === 1) {
      this.shieldCooldownTimer = 0;
      this.shieldWasInCooldown = false;
    } else {
      this.shieldCooldownTimer = Math.min(
        this.shieldCooldownTimer,
        this.shieldMaxCooldown
      );
    }

    this.emitShieldStats();
  }

  emitShieldStats() {
    this.getEventBus()?.emit?.('shield-stats-changed', {
      level: this.shieldUpgradeLevel,
      maxHP: this.shieldMaxHP,
      currentHP:
        this.isShieldActive || this.shieldCooldownTimer > 0
          ? this.shieldHP
          : this.shieldMaxHP,
      isActive: this.isShieldActive,
      cooldownTimer: this.shieldCooldownTimer,
      cooldownDuration: this.shieldMaxCooldown,
    });
  }

  emitShieldActivationFailed(reason) {
    this.getEventBus()?.emit?.('shield-activation-failed', {
      reason,
      level: this.shieldUpgradeLevel,
    });
  }

  activateShield() {
    if (this.shieldUpgradeLevel <= 0) {
      this.emitShieldActivationFailed('locked');
      return false;
    }

    if (this.isShieldActive) {
      this.emitShieldActivationFailed('active');
      return false;
    }

    if (this.shieldCooldownTimer > 0) {
      this.emitShieldActivationFailed('cooldown');
      return false;
    }

    if (this.shieldMaxHP <= 0) {
      this.emitShieldActivationFailed('unavailable');
      return false;
    }

    this.isShieldActive = true;
    this.shieldHP = this.shieldMaxHP;
    this.shieldWasInCooldown = false;

    this.getEventBus()?.emit?.('shield-activated', {
      level: this.shieldUpgradeLevel,
      maxHP: this.shieldMaxHP,
    });

    this.emitShieldStats();
    return true;
  }

  shieldTookDamage(damageAmount) {
    const incomingDamage = Math.max(0, damageAmount);

    if (!this.isShieldActive || this.shieldMaxHP <= 0) {
      return incomingDamage;
    }

    const previousHP = Number.isFinite(this.shieldHP) ? this.shieldHP : 0;
    const absorbed = Math.min(previousHP, incomingDamage);
    const overflow = Math.max(0, incomingDamage - absorbed);

    this.shieldHP = Math.max(0, previousHP - absorbed);

    this.getEventBus()?.emit?.('shield-hit', {
      level: this.shieldUpgradeLevel,
      remainingHP: this.shieldHP,
      maxHP: this.shieldMaxHP,
      damage: absorbed,
    });

    if (this.shieldHP <= 0) {
      this.breakShield();
    } else {
      this.emitShieldStats();
    }

    return overflow;
  }

  breakShield() {
    if (!this.isShieldActive) {
      return;
    }

    this.isShieldActive = false;
    this.shieldHP = 0;

    this.getEventBus()?.emit?.('shield-broken', {
      level: this.shieldUpgradeLevel,
    });

    // Level 5: Deflective explosion on shield break
    if (this.shieldUpgradeLevel >= 5) {
      const position = this.getPosition();
      this.getEventBus()?.emit?.('shield-deflective-explosion', {
        position,
        level: this.shieldUpgradeLevel,
      });
    }

    if (this.shieldMaxCooldown > 0) {
      this.shieldCooldownTimer = this.shieldMaxCooldown;
      this.shieldWasInCooldown = true;
    } else {
      this.shieldCooldownTimer = 0;
      this.shieldWasInCooldown = false;
      this.getEventBus()?.emit?.('shield-recharged', {
        level: this.shieldUpgradeLevel,
      });
      this.shieldHP = this.shieldMaxHP;
    }

    this.emitShieldStats();
  }

  resetShieldState() {
    this.shieldUpgradeLevel = 0;
    this.shieldMaxHP = 0;
    this.shieldHP = 0;
    this.shieldCooldownTimer = 0;
    this.shieldMaxCooldown = 0;
    this.shieldWasInCooldown = false;
    this.isShieldActive = false;
  }

  getShieldState() {
    return {
      isActive: this.isShieldActive,
      maxHits: this.shieldMaxHP,
      currentHits: this.shieldHP,
      isCooldown: this.shieldCooldownTimer > 0,
    };
  }

  getShieldImpactProfile() {
    if (this.shieldUpgradeLevel <= 0) {
      return { damage: 0, forceMultiplier: 1, level: 0 };
    }

    const level = this.shieldUpgradeLevel;
    const damage =
      SHIELD_IMPACT_DAMAGE_BASE +
      SHIELD_IMPACT_DAMAGE_PER_LEVEL * Math.max(0, level - 1);
    const forceMultiplier = 1 + Math.max(0, level - 1) * 0.22;

    return { damage, forceMultiplier, level };
  }
}
