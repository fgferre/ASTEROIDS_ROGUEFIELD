// src/modules/combat/CardEffects.js
//
// The weapon cards in play and what they leave on the Field: Chain Lance
// arcs, Thermal burns and the Solar Flare's spread, Field slows and
// Singularity pulls, the Cinder, Ion and Afterburn trails, Static Shell,
// Gravity Brake and the emergency brake's shove, plus the fire-rate, shot and
// lock-range tuning and the Targeting Suite. CombatSystem owns it, writes the
// cards' payloads into `cardEffects` from the upgrade events and ticks it
// after the hits land.

import { SHIP_SIZE } from '../../core/GameConstants.js';
import {
  COMBAT_TARGETING_RANGE,
  BULLET_SPEED,
  COMBAT_BULLET_LIFETIME,
  COMBAT_AIMING_UPGRADE_CONFIG,
} from '../../data/constants/gameplay.js';
import { WEAPON_APEX, WEAPON_EVOLUTIONS } from '../../data/weapons.js';

const AIMING_CONFIG = COMBAT_AIMING_UPGRADE_CONFIG || {};
// Afterburn (Maneuver synergy) — proposta 18/10: a point every this many px
// of dash travel, at most this many alive; a jump wider than the gap (the
// screen wrap) starts a new, unjoined line.
const AFTERBURN_POINT_SPACING = 8;
const AFTERBURN_MAX_POINTS = 40;
const AFTERBURN_JOIN_GAP = 80;
const ARC_SEGMENTS = 6;
const ARC_JITTER = 7; // px, perpendicular

// Deterministic −1..1 from an integer (arc jaggedness, card rolls and the 2D
// sparkle; no game RNG used).
export const hashUnit = (n) => {
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return (v - Math.floor(v)) * 2 - 1;
};

export class CardEffects {
  /**
   * `player()`: the player service (position, muzzle point, dash timer).
   * `enemies()`: the enemy service the chain, burn and trail hits land on.
   * `targeting()`: the Targeting instance (the Targeting Suite's settings, the lock range).
   * `weapons()`: the Weapons instance (shot speed, lifetime and cooldown, Apexes, the beams and flak bursts to age, forEachSolidEnemy).
   * `hits()`: the HitResolution instance (processBulletHit, applyDamageToEnemy, pushEnemy).
   */
  constructor({ player, enemies, targeting, weapons, hits }) {
    this.player = player;
    this.enemies = enemies;
    this.targeting = targeting;
    this.weapons = weapons;
    this.hits = hits;

    this.resetWeaponTuning();
    this.resetCardState();
  }

  // Fire rate, projectile speed/lifetime and lock range from upgrades. Keyed
  // by upgrade rank so re-applying a rank (Retry) does not compound it.
  applyWeaponTuning(data = {}) {
    this.weaponTuningSources.set(`${data.upgradeId}:${data.level}`, data);
    const product = (field) => {
      let value = 1;
      this.weaponTuningSources.forEach((entry) => {
        const factor = Number(entry[field]);
        if (factor > 0) {
          value *= factor;
        }
      });
      return value;
    };
    this.cooldownTuning = product('cooldownMultiplier');
    this.lanceDamageTuning = product('lanceDamageMultiplier');
    this.pierceBonus = 0;
    this.weaponTuningSources.forEach((entry) => {
      this.pierceBonus += Number(entry.pierceBonus) || 0;
    });
    const weapons = this.weapons();
    weapons.bulletSpeed = BULLET_SPEED * product('bulletSpeedMultiplier');
    weapons.bulletLifetime =
      COMBAT_BULLET_LIFETIME * product('bulletLifetimeMultiplier');
    this.targeting().setTargetingRange(
      COMBAT_TARGETING_RANGE * product('targetingRangeMultiplier')
    );
    weapons.refreshShootCooldown();
  }

  // The weapon half of the aiming branch reset (Targeting resets its own half).
  resetWeaponTuning() {
    const weapons = this.weapons();
    weapons.shootCooldown = weapons.baseShootCooldown;
    this.aimCooldownMultiplier = 1;
    this.cooldownTuning = 1;
    this.lanceDamageTuning = 1;
    this.pierceBonus = 0;
    this.weaponTuningSources = new Map();
    weapons.bulletSpeed = BULLET_SPEED;
    weapons.bulletLifetime = COMBAT_BULLET_LIFETIME;
  }

  applyAimingUpgrade(data = {}) {
    const targeting = this.targeting();
    const levelValue = Number(data?.level);
    if (Number.isFinite(levelValue)) {
      targeting.setUpgradeLevel(
        Math.max(targeting.targetingUpgradeLevel, Math.floor(levelValue))
      );
    }

    if (data?.resetWeights) {
      targeting.resetDangerWeights();
    }

    if (data?.dangerWeights) {
      targeting.mergeDangerWeights(data.dangerWeights);
    }

    if (Number.isFinite(data?.linearLeadTime)) {
      targeting.setLinearPredictionTime(
        Math.max(0, Number(data.linearLeadTime))
      );
    }

    if (data?.dynamicPrediction) {
      targeting.updateDynamicPredictionSettings(data.dynamicPrediction);
    }

    if (targeting.targetingUpgradeLevel >= 1) {
      targeting.setDangerScoreEnabled(true);
    }

    if (targeting.targetingUpgradeLevel >= 2) {
      targeting.setDynamicPredictionEnabled(true);
    }

    if (targeting.targetingUpgradeLevel >= 3) {
      const targetCount = Number(data?.multiLockTargets);
      if (Number.isFinite(targetCount) && targetCount > 0) {
        targeting.setMultiLockTargets(Math.max(1, Math.floor(targetCount)));
      }

      const cooldownMultiplier = Number(data?.cooldownMultiplier);
      if (Number.isFinite(cooldownMultiplier) && cooldownMultiplier > 0) {
        this.aimCooldownMultiplier = cooldownMultiplier;
        this.weapons().refreshShootCooldown();
      } else if (Number.isFinite(AIMING_CONFIG.multiLock?.cooldownMultiplier)) {
        this.aimCooldownMultiplier = AIMING_CONFIG.multiLock.cooldownMultiplier;
        this.weapons().refreshShootCooldown();
      }
    }

    // Fix-pass-2 (C3): if an upgrade lands while aimMode === 'manual', the
    // behavioral-flag snapshot captured at manual-on is now stale. Reconcile:
    //   - Update the snapshot so it reflects the upgrade's new flag state
    //     (what the player should see on switchback).
    //   - Force live flags back to false because manual still pauses them
    //     (the unconditional assignments above set them true regardless of
    //     aim mode — we have to re-zero them to honor manual's pause).
    if (targeting.aimMode === 'manual') {
      targeting.setAimModeFlagSnapshot({
        dangerScoreEnabled: targeting.targetingUpgradeLevel >= 1,
        dynamicPredictionEnabled: targeting.targetingUpgradeLevel >= 2,
      });
      targeting.setDangerScoreEnabled(false);
      targeting.setDynamicPredictionEnabled(false);
    }

    targeting.setTargetUpdateInterval(
      Number.isFinite(data?.targetUpdateInterval)
        ? Math.max(0.05, Number(data.targetUpdateInterval))
        : targeting.resolveTargetUpdateInterval()
    );
  }

  // A new run: no card in play and nothing left on the Field.
  resetCardState() {
    this.arcs = [];
    this.wells = [];
    this.arcSeed = 0;
    this.burns = new Map();
    this.slows = new Map();
    this.pulls = new Map();
    this.cardEffects = {};
    this.cardRolls = 0;
    this.cinders = [];
    this.cinderTimer = 0;
    this.ions = [];
    this.ionTimer = 0;
    this.afterburnTrail = [];
    this.afterburnTimer = 0;
    this.afterburnDashing = false;
    this.staticShellPending = false;
  }

  // Singularity: the target (if alive) and every non-boss whose rim is
  // within reach of the hit point are pulled toward it; the collapsing ring
  // is a `well`.
  pullToward(target, targetAlive, x, y) {
    const { radius, duration } = WEAPON_APEX.field.pull;
    this.weapons().forEachSolidEnemy((enemy) => {
      if (enemy.type === 'boss') return;
      const inReach =
        enemy === target
          ? targetAlive
          : Math.hypot(enemy.x - x, enemy.y - y) - (enemy.radius || 0) <=
            radius;
      if (!inReach) return;
      this.pulls.set(enemy, { id: enemy.id, timer: duration, x, y });
    });
    this.wells.push({ x, y, life: duration, maxLife: duration });
  }

  // Chain Lance: `jumps` hops, each to the nearest enemy within range not
  // yet in this chain. Storm Lance: the first hop goes to the `fork`
  // nearest, and each branch keeps jumping.
  chainFrom(source, damage, jumps = 1, visited = [source], fork = 1) {
    const weapons = this.weapons();
    const { range } = WEAPON_EVOLUTIONS.arc.chain;
    const rangeSq = range * range + 1e-6;
    const near = [];
    weapons.forEachSolidEnemy((candidate) => {
      if (visited.includes(candidate)) return;
      const sq = (candidate.x - source.x) ** 2 + (candidate.y - source.y) ** 2;
      if (sq < rangeSq) near.push({ candidate, sq });
    });
    if (!near.length) return;
    near.sort((a, b) => a.sq - b.sq);
    const targets = near.slice(0, fork).map((entry) => entry.candidate);
    visited.push(...targets);

    const storm = weapons.apexes.includes('arc');
    targets.forEach((best) => {
      const dx = best.x - source.x;
      const dy = best.y - source.y;
      const distance = Math.hypot(dx, dy) || 1;
      this.addArc(source, best, storm ? { heavy: true } : null);
      this.hits().processBulletHit(
        {
          kind: 'chain',
          x: best.x - (dx / distance) * (best.radius || 0),
          y: best.y - (dy / distance) * (best.radius || 0),
          vx: (dx / distance) * weapons.bulletSpeed,
          vy: (dy / distance) * weapons.bulletSpeed,
          damage,
          hit: false,
        },
        best,
        this.enemies()
      );
    });
    if (jumps > 1) {
      targets.forEach((best) =>
        this.chainFrom(best, damage, jumps - 1, visited)
      );
    }
  }

  // A jagged arc between two circles (Chain Lance, Static Shell, Solar Flare
  // spread). `style`: { color } overrides the lance's arc colour, { heavy }
  // draws the Storm Lance's thicker bolt.
  addArc(source, target, style = null) {
    const { duration } = WEAPON_EVOLUTIONS.arc.chain;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.hypot(dx, dy) || 1;
    // Rim to rim, so the arc shows in the gap instead of under the rocks.
    const startGap = Math.min(source.radius || 0, distance * 0.45);
    const endGap = Math.min(target.radius || 0, distance * 0.45);
    const span = distance - startGap - endGap;
    const ux = dx / distance;
    const uy = dy / distance;
    const points = [];
    const seed = (this.arcSeed += 1);
    for (let i = 0; i <= ARC_SEGMENTS; i += 1) {
      const along = startGap + (span * i) / ARC_SEGMENTS;
      const jitter =
        i === 0 || i === ARC_SEGMENTS
          ? 0
          : hashUnit(seed * 31 + i) * ARC_JITTER;
      points.push({
        x: source.x + ux * along - uy * jitter,
        y: source.y + uy * along + ux * jitter,
      });
    }
    this.arcs.push({
      points,
      life: duration,
      maxLife: duration,
      color: style?.color ?? null,
      heavy: Boolean(style?.heavy),
    });
  }

  // Deterministic card roll (no game RNG here, like the arc jitter).
  rollCardChance(chance) {
    this.cardRolls += 1;
    return (hashUnit(this.cardRolls * 7 + 3) + 1) / 2 < chance;
  }

  // Cinder Trail / Ion Trail: a point every few px along the main thruster.
  dropTrailPoint(list, { life, radius }, { position }) {
    const last = list[list.length - 1];
    if (last && Math.hypot(last.x - position.x, last.y - position.y) < radius) {
      return;
    }
    list.push({ x: position.x, y: position.y, life, maxLife: life });
  }

  // Afterburn: while the ship dashes, a point every AFTERBURN_POINT_SPACING
  // px of its travel; `joined` links a point to the one before it.
  dropAfterburnPoints({ life }) {
    const player = this.player();
    if (player.isDead || !(player.dashTimer > 0)) {
      this.afterburnDashing = false;
      return;
    }
    const list = this.afterburnTrail;
    const { x, y } = player.getPosition();
    const last = this.afterburnDashing ? list[list.length - 1] : null;
    const dx = last ? x - last.x : 0;
    const dy = last ? y - last.y : 0;
    const distance = Math.hypot(dx, dy);
    if (!last || distance > AFTERBURN_JOIN_GAP) {
      list.push({ x, y, life, maxLife: life, joined: false });
    } else {
      const steps = Math.floor(distance / AFTERBURN_POINT_SPACING);
      for (let i = 1; i <= steps; i += 1) {
        const t = (i * AFTERBURN_POINT_SPACING) / distance;
        list.push({
          x: last.x + dx * t,
          y: last.y + dy * t,
          life,
          maxLife: life,
          joined: true,
        });
      }
    }
    this.afterburnDashing = true;
    if (list.length > AFTERBURN_MAX_POINTS) {
      list.splice(0, list.length - AFTERBURN_MAX_POINTS);
    }
  }

  // The Ion Trail spares rocks and halves on bosses (`bossFactor`).
  burnTrailTouches(list, { damage, radius, bossFactor }) {
    const ion = bossFactor !== undefined;
    const touched = [];
    this.weapons().forEachSolidEnemy((enemy) => {
      if (ion && enemy.type === 'asteroid') return;
      const reach = (enemy.radius || 0) + radius;
      const reachSq = reach * reach;
      if (
        list.some((c) => (c.x - enemy.x) ** 2 + (c.y - enemy.y) ** 2 <= reachSq)
      ) {
        touched.push(enemy);
      }
    });
    touched.forEach((enemy) => {
      if (enemy.destroyed) return;
      const scale = ion && enemy.type === 'boss' ? bossFactor : 1;
      this.hits().applyDamageToEnemy(this.enemies(), enemy, damage * scale, {
        hitPosition: { x: enemy.x, y: enemy.y },
      });
    });
  }

  // Pushes every enemy within `radius` straight away from `origin`.
  shoveFrom(origin, radius, speed) {
    if (!origin) return;
    this.weapons().forEachSolidEnemy((enemy) => {
      const dx = enemy.x - origin.x;
      const dy = enemy.y - origin.y;
      const reach = radius + (enemy.radius || 0);
      if (dx * dx + dy * dy > reach * reach) return;
      this.hits().pushEnemy(enemy, dx, dy, speed);
    });
  }

  // Static Shell: an arc to every enemy within reach of the ship.
  dischargeStaticShell({ radius, damage }) {
    const { x, y } = this.player().getPosition();
    const origin = { x, y, radius: SHIP_SIZE };
    const struck = [];
    this.weapons().forEachSolidEnemy((enemy) => {
      const reach = radius + (enemy.radius || 0);
      if ((enemy.x - x) ** 2 + (enemy.y - y) ** 2 <= reach * reach) {
        struck.push(enemy);
      }
    });
    struck.forEach((enemy) => {
      if (enemy.destroyed) return;
      this.addArc(origin, enemy);
      // A chain-kind hit: no burn, slow or chain procs off the discharge.
      this.hits().processBulletHit(
        {
          kind: 'chain',
          x: enemy.x,
          y: enemy.y,
          vx: 0,
          vy: 0,
          damage,
          hit: false,
        },
        enemy,
        this.enemies()
      );
    });
  }

  // Gravity Brake: undo part of this frame's travel near the ship.
  applyGravityBrake({ radius, slowFraction }, deltaTime) {
    const { x, y } = this.player().getPosition();
    const drag = slowFraction * deltaTime;
    this.weapons().forEachSolidEnemy((enemy) => {
      if (enemy.type === 'boss') return;
      if ((enemy.x - x) ** 2 + (enemy.y - y) ** 2 > radius * radius) return;
      enemy.x -= (enemy.vx || 0) * drag;
      enemy.y -= (enemy.vy || 0) * drag;
    });
  }

  updateWeaponEffects(deltaTime) {
    const fade = (list) => {
      let kept = 0;
      for (let i = 0; i < list.length; i += 1) {
        list[i].life -= deltaTime;
        if (list[i].life > 0) list[kept++] = list[i];
      }
      list.length = kept;
    };
    const weapons = this.weapons();
    fade(weapons.beams);
    fade(weapons.flakBursts);
    fade(this.arcs);
    fade(this.cinders);
    fade(this.ions);
    fade(this.afterburnTrail);
    fade(this.wells);

    const { cinderTrail, ionTrail, afterburn, staticShell, gravityBrake } =
      this.cardEffects;
    if (afterburn) this.dropAfterburnPoints(afterburn);
    // Each trail ticks on its own timer while it has points.
    const tick = (list, trail, timerKey) => {
      if (!trail || !list.length) {
        this[timerKey] = 0;
        return;
      }
      this[timerKey] += deltaTime;
      while (this[timerKey] >= trail.tickInterval) {
        this[timerKey] -= trail.tickInterval;
        this.burnTrailTouches(list, trail);
      }
    };
    tick(this.cinders, cinderTrail, 'cinderTimer');
    tick(this.ions, ionTrail, 'ionTimer');
    tick(this.afterburnTrail, afterburn, 'afterburnTimer');
    if (this.staticShellPending) {
      this.staticShellPending = false;
      this.dischargeStaticShell(staticShell);
    }
    // The beam stays on the muzzle while it shows (its damage already
    // landed); a multi-lock beam on the barrel of its turret layer, the one
    // aimed along it.
    const player = this.player();
    if (weapons.beams.length && !player.isDead) {
      const turret = player.getMuzzlePoint();
      weapons.beams.forEach((beam) => {
        const muzzle = beam.layered
          ? player.getMuzzlePoint({ x: beam.ex, y: beam.ey })
          : turret;
        beam.ex += muzzle.x - beam.x;
        beam.ey += muzzle.y - beam.y;
        beam.x = muzzle.x;
        beam.y = muzzle.y;
      });
    }

    if (gravityBrake && !player.isDead) {
      this.applyGravityBrake(gravityBrake, deltaTime);
    }

    if (this.burns.size) {
      const spreads = [];
      this.burns.forEach((entry, enemy) => {
        entry.timer += deltaTime;
        while (
          entry.timer >= entry.interval - 1e-9 &&
          entry.ticksLeft > 0 &&
          !enemy.destroyed &&
          enemy.id === entry.id
        ) {
          entry.timer -= entry.interval;
          entry.ticksLeft -= 1;
          if (entry.spreadTo) this.spreadBurn(enemy, entry, spreads);
          this.hits().applyDamageToEnemy(this.enemies(), enemy, entry.damage, {
            hitPosition: { x: enemy.x, y: enemy.y },
          });
        }
        if (entry.ticksLeft <= 0 || enemy.destroyed || enemy.id !== entry.id) {
          this.burns.delete(enemy);
        }
      });
      // Added after the pass, so a fresh spread burn does not tick this frame.
      spreads.forEach(([enemy, entry]) => this.burns.set(enemy, entry));
    }

    if (this.pulls.size) {
      const { speed } = WEAPON_APEX.field.pull;
      this.pulls.forEach((entry, enemy) => {
        if (enemy.destroyed || enemy.id !== entry.id) {
          this.pulls.delete(enemy);
          return;
        }
        const dx = entry.x - enemy.x;
        const dy = entry.y - enemy.y;
        const distance = Math.hypot(dx, dy);
        const step = Math.min(
          distance,
          speed * Math.min(deltaTime, entry.timer)
        );
        if (distance > 1e-9) {
          enemy.x += (dx / distance) * step;
          enemy.y += (dy / distance) * step;
        }
        entry.timer -= deltaTime;
        if (entry.timer <= 1e-9) this.pulls.delete(enemy);
      });
    }

    if (this.slows.size) {
      // Undo (1 − factor) of this frame's travel: the AI keeps its velocity.
      const drag = 1 - WEAPON_EVOLUTIONS.field.slow.factor;
      this.slows.forEach((entry, enemy) => {
        if (enemy.destroyed || enemy.id !== entry.id) {
          this.slows.delete(enemy);
          return;
        }
        const slowed = Math.min(deltaTime, entry.timer) * drag;
        enemy.x -= (enemy.vx || 0) * slowed;
        enemy.y -= (enemy.vy || 0) * slowed;
        entry.timer -= deltaTime;
        if (entry.timer <= 1e-9) this.slows.delete(enemy);
      });
    }
  }

  // Solar Flare: a burn tick sets every enemy whose rim is within reach of
  // the burning one's and is not burning alight, once per source, at half
  // duration; those do not spread.
  spreadBurn(source, entry, spreads) {
    const { radius, durationFraction, ticks } = WEAPON_APEX.thermal.spread;
    const { duration } = WEAPON_EVOLUTIONS.thermal.burn;
    this.weapons().forEachSolidEnemy((enemy) => {
      if (
        enemy === source ||
        this.burns.has(enemy) ||
        entry.spreadTo.includes(enemy) ||
        Math.hypot(enemy.x - source.x, enemy.y - source.y) -
          (enemy.radius || 0) -
          (source.radius || 0) >
          radius
      ) {
        return;
      }
      entry.spreadTo.push(enemy);
      this.addArc(source, enemy, { color: WEAPON_APEX.thermal.look.outer });
      spreads.push([
        enemy,
        {
          id: enemy.id,
          timer: 0,
          interval: (duration * durationFraction) / ticks,
          ticksLeft: ticks,
          damage: entry.damage,
          spreadTo: null,
        },
      ]);
    });
  }
}
