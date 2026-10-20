import { WARDEN_KINDS, wardenComponents } from '../../../data/enemies/boss.js';
import { BossEnemy } from './BossEnemy.js';

const NULL = WARDEN_KINDS.null;
const TAU = Math.PI * 2;

// Warden Null (layer 15): a dark core inside a shell of plates.
//   phase 1 — the shell turns; Prime's charge, announced by a dark lane.
//   phase 2 — the shell opens: plates orbit wide and hurt on contact; every
//             `pullInterval` s a ring announces, then the XP pull inverts
//             for `pullDuration` s (sparks fly away from the ship).
//   phase 3 — the plates are shed, the core is exposed; a charge every
//             `finaleChargeCadence` s.
export class WardenNull extends BossEnemy {
  initialize(config = {}) {
    super.initialize({
      ...config,
      displayName: NULL.displayName,
      healthFactor: NULL.healthFactor,
      radius: NULL.radius,
      chargeCooldown: NULL.chargeCooldown,
      chargeWindup: NULL.chargeWindup,
      chargeProjectileCount: NULL.chargeProjectileCount,
      components: config.components ?? wardenComponents('null'),
    });
    this.bossKind = 'null';
    this.subtitle = NULL.subtitle;
    this.plates = [];
    for (let i = 0; i < NULL.plateCount; i += 1) {
      this.plates.push({ offset: (i * TAU) / NULL.plateCount, x: 0, y: 0 });
    }
    this.updatePlates(0);
    return this;
  }

  resetForPool() {
    super.resetForPool();
    this.plates = [];
    this.shellAngle = 0;
    this.shellOpen = 0;
    this.shellShed = false;
    this.pullState = 'idle';
    this.pullStateTimer = 0;
    this.pullTimer = NULL.pullInterval;
  }

  advancePhase() {
    const before = this.currentPhase;
    super.advancePhase();
    if (this.currentPhase === before) return;
    if (this.currentPhase === 1) {
      this.chargeCooldown = NULL.openChargeCooldown;
      this.pullTimer = NULL.firstPullDelay;
    } else if (this.currentPhase >= 2) {
      this.shellShed = true;
      this.chargeWindup = NULL.finaleChargeWindup;
      this.chargeDuration = NULL.finaleChargeDuration;
      this.chargeRecovery = NULL.finaleChargeRecovery;
      this.chargeCooldown = Math.max(
        0,
        NULL.finaleChargeCadence -
          NULL.finaleChargeWindup -
          NULL.finaleChargeDuration -
          NULL.finaleChargeRecovery
      );
    }
    this.chargeTimer = this.chargeCooldown;
  }

  // The charge lane is dark: the Null announces with absence, not light.
  beginCharge(target) {
    super.beginCharge(target);
    if (this.telegraph?.type === 'charge') this.telegraph.tone = 'dark';
  }

  handlePhaseIntro(deltaTime, target) {
    this.updatePlates(deltaTime);
    this.updateChargeState(deltaTime, target);
  }

  handlePhaseAssault(deltaTime, target) {
    this.shellOpen = Math.min(
      1,
      this.shellOpen + deltaTime / NULL.openDuration
    );
    this.updatePlates(deltaTime);
    this.updatePlateHazards(target);
    this.updatePull(deltaTime, true);
    this.updateChargeState(deltaTime, target);
  }

  handlePhaseFinale(deltaTime, target) {
    this.updatePull(deltaTime, false);
    this.updateChargeState(deltaTime, target);
  }

  // On the entrance the plates come spread wide, spinning, and shut at once
  // when it stops.
  poseArrival(open, spin, deltaTime) {
    this.shellOpen = open;
    this.shellAngle = (this.shellAngle + spin * deltaTime) % TAU;
    this.updatePlates(deltaTime);
  }

  updatePlates(deltaTime) {
    const spin =
      NULL.shellSpin + (NULL.openSpin - NULL.shellSpin) * this.shellOpen;
    this.shellAngle = (this.shellAngle + spin * deltaTime) % TAU;
    const eased = this.shellOpen * this.shellOpen * (3 - 2 * this.shellOpen);
    const distance = this.radius + (NULL.openOrbitRadius - this.radius) * eased;
    for (const plate of this.plates) {
      const angle = this.shellAngle + plate.offset;
      plate.x = this.x + Math.cos(angle) * distance;
      plate.y = this.y + Math.sin(angle) * distance;
    }
  }

  // Open plates are hazards; the damage system checks the hull overlap and
  // the pilot's hit invulnerability.
  updatePlateHazards(target) {
    if (this.shellOpen < 0.5 || !target?.position) return;
    const reach = NULL.plateRadius + 40;
    for (const plate of this.plates) {
      const d = Math.hypot(
        target.position.x - plate.x,
        target.position.y - plate.y
      );
      if (d > reach) continue;
      this.system?.applyDirectDamageToPlayer?.(
        Math.round(this.contactDamage * NULL.plateDamageFactor),
        {
          cause: 'boss-plate',
          position: { x: plate.x, y: plate.y },
          radius: NULL.plateRadius,
          source: this,
        }
      );
      return;
    }
  }

  // idle → windup (ring) → inverting (XP pull pushes away) → idle.
  updatePull(deltaTime, allowNew) {
    if (this.pullState === 'windup') {
      this.pullStateTimer -= deltaTime;
      if (this.pullStateTimer <= 0) {
        this.pullState = 'inverting';
        this.pullStateTimer = NULL.pullDuration;
        this.system
          ?.getCachedXPOrbs?.()
          ?.startGlobalPull(
            NULL.pullDuration,
            NULL.pullSpeed,
            NULL.pullAcceleration,
            -1
          );
      }
      return;
    }
    if (this.pullState === 'inverting') {
      this.pullStateTimer -= deltaTime;
      if (this.pullStateTimer <= 0) {
        this.pullState = 'idle';
        this.pullStateTimer = 0;
        this.pullTimer =
          NULL.pullInterval - NULL.pullDuration - NULL.pullWindup;
      }
      return;
    }
    if (!allowNew) return;
    this.pullTimer -= deltaTime;
    if (this.pullTimer <= 0) {
      this.pullState = 'windup';
      this.pullStateTimer = NULL.pullWindup;
    }
  }
}

export default WardenNull;
