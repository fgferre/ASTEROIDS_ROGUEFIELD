import { GAME_HEIGHT, GAME_WIDTH } from '../../../core/GameConstants.js';
import { BOSS_KINDS, wardenComponents } from '../../../data/enemies/boss.js';
import { driftToCentre } from '../boss/drift.js';
import { SHIP_REACH } from '../boss/playerTarget.js';
import { BossEnemy } from './BossEnemy.js';

const KILN = BOSS_KINDS['kiln-engine'];
const TAU = Math.PI * 2;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Sentinel Kiln Engine (src/content/bosses/kiln-engine.js), one loop:
//   drift   — fins shut, it steers toward mid-field;
//   sectors — it stops; the wedges warn, burn, step one wedge over and burn
//             again (`cycle.sectorSteps` steps), then clear;
//   slag    — it lobs `cycle.slagShots` shots; their landing circles warn
//             while they fly, then each burns as a pool for `cycle.poolBurn`;
//   vent    — fins open, full damage, for `cycle.vent` s;
//   then the drift again. Pools keep their own clock (they burn on through
//   the vent). Hot wedges and pools hurt only the ship, a tick every
//   `burnTick` s while its centre is inside one.
// What the view reads:
//   ventOpen — 0..1, the fins open (1) or shut (0);
//   sectors  — null or { type: 'sectors', x, y, angle (wedge 0 starts here),
//              count, offset (wedge i is hot when (i + offset) is even),
//              solid 0..1, phase 'warn'|'burn', timer, duration, length };
//   pools    — [{ x, y, radius, timer, duration, phase 'warn'|'burn' }]
//              ('warn': the shot still flying to its marked circle).
export class SentinelKilnEngine extends BossEnemy {
  initialize(config = {}) {
    super.initialize({
      ...config,
      displayName: KILN.displayName,
      healthFactor: KILN.healthFactor,
      radius: KILN.radius,
      rewards: KILN.rewards,
      phaseThresholds: KILN.phaseThresholds,
      phaseCount: KILN.phaseCount,
      invulnerabilityDuration: KILN.invulnerabilityDuration,
      components: config.components ?? wardenComponents('kiln-engine'),
    });
    this.bossKind = 'kiln-engine';
    this.tier = KILN.tier;
    this.subtitle = KILN.subtitle;
    this.movementStrategy = 'linear';
    this.kilnTimer = this.cycle().drift;
    return this;
  }

  resetForPool() {
    super.resetForPool();
    this.kilnState = 'drift';
    this.kilnTimer = 0;
    this.ventOpen = 0;
    this.sectors = null;
    this.sectorSteps = 0;
    this.pools = [];
    this.burnTimer = 0;
  }

  cycle() {
    return KILN.cycle[Math.min(this.currentPhase, KILN.cycle.length - 1)];
  }

  get venting() {
    return this.kilnState === 'vent';
  }

  // Shut, the shell soaks most of a hit and rings dull (the Bulwark's
  // clang); venting, all of it lands.
  takeDamage(amount, source = null) {
    if (this.venting) return super.takeDamage(amount, source);
    if (amount > 0 && !this.invulnerable && !this.intangible) {
      const at = source?.hitPosition ?? { x: this.x, y: this.y };
      this.getEventBus()?.emit?.('bulwark-plate-hit', {
        enemy: this,
        enemyId: this.id,
        position: { x: at.x, y: at.y },
      });
    }
    return super.takeDamage(amount * KILN.shellDamageFactor, source);
  }

  // The phase step restores the phase movement; it always steers itself.
  advancePhase() {
    super.advancePhase();
    this.movementStrategy = 'linear';
  }

  // On the entrance its fins are its pieces: flung open, shut on arrival.
  poseArrival(open) {
    this.ventOpen = open;
  }

  handlePhaseIntro(deltaTime, target) {
    this.updateKiln(deltaTime, target);
  }

  handlePhaseAssault(deltaTime, target) {
    this.updateKiln(deltaTime, target);
  }

  handlePhaseFinale(deltaTime, target) {
    this.updateKiln(deltaTime, target);
  }

  updateKiln(deltaTime, target) {
    const position = target?.position ?? null;
    const cycle = this.cycle();
    this.kilnTimer -= deltaTime;
    switch (this.kilnState) {
      case 'sectors':
        this.holdStill(deltaTime);
        if (!this.sectors) this.lobSlag(cycle, target);
        break;
      case 'slag':
        this.holdStill(deltaTime);
        if (this.kilnTimer <= 0) {
          this.kilnState = 'vent';
          this.kilnTimer = cycle.vent;
        }
        break;
      case 'vent':
        this.holdStill(deltaTime);
        if (this.kilnTimer <= 0) {
          this.kilnState = 'drift';
          this.kilnTimer = cycle.drift;
        }
        break;
      default:
        driftToCentre(this, deltaTime, KILN.drift);
        if (this.kilnTimer <= 0 && position) this.beginSectors(cycle, position);
        break;
    }
    this.moveFins(this.venting ? 1 : 0, deltaTime);
    this.updateSectors(deltaTime, cycle);
    this.updatePools(deltaTime);
    this.burn(deltaTime, target);
  }

  holdStill(deltaTime) {
    this.movementStrategy = 'linear';
    const keep = Math.max(0, 1 - 4 * deltaTime);
    this.vx *= keep;
    this.vy *= keep;
  }

  moveFins(goal, deltaTime) {
    const step = KILN.finSpeed * deltaTime;
    this.ventOpen += Math.max(-step, Math.min(step, goal - this.ventOpen));
  }

  // HEAT SECTORS: wedge 0 is centred on the ship and burns first, so the
  // ship has to move from where it stands.
  beginSectors(cycle, position) {
    this.kilnState = 'sectors';
    const { count } = KILN.sectors;
    const width = TAU / count;
    const corners = [
      [0, 0],
      [GAME_WIDTH, 0],
      [0, GAME_HEIGHT],
      [GAME_WIDTH, GAME_HEIGHT],
    ];
    this.sectorSteps = cycle.sectorSteps;
    this.sectors = {
      type: 'sectors',
      x: this.x,
      y: this.y,
      angle: Math.atan2(position.y - this.y, position.x - this.x) - width / 2,
      count,
      offset: 0,
      solid: 0,
      phase: 'warn',
      timer: cycle.sectorWarn,
      duration: cycle.sectorWarn,
      length: Math.max(
        ...corners.map(([x, y]) => Math.hypot(x - this.x, y - this.y))
      ),
    };
  }

  // The wedges' own clock: warn → burn → (step: warn again, shorter) → gone.
  updateSectors(deltaTime, cycle) {
    const s = this.sectors;
    if (!s) return;
    s.timer -= deltaTime;
    if (s.timer > 0) return;
    if (s.phase === 'warn') {
      s.phase = 'burn';
      s.solid = 1;
      s.timer = s.duration = cycle.sectorBurn;
      // The hot wedges ignite: their sound (eventCues `boss-attack-started`).
      this.getEventBus()?.emit?.('boss-attack-started', {
        enemy: this,
        enemyId: this.id,
        position: { x: this.x, y: this.y },
      });
    } else if (this.sectorSteps > 0) {
      this.sectorSteps -= 1;
      s.offset += 1;
      s.phase = 'warn';
      s.solid = 0;
      s.timer = s.duration = cycle.sectorStepWarn;
    } else {
      this.sectors = null;
    }
  }

  /** The wedge `point` is in (0..count-1). */
  sectorAt(point) {
    const s = this.sectors;
    const angle = Math.atan2(point.y - s.y, point.x - s.x) - s.angle;
    const turn = ((angle % TAU) + TAU) % TAU;
    return Math.floor(turn / (TAU / s.count)) % s.count;
  }

  /** True when `point` is in a hot wedge (warning or burning). */
  sectorHot(point) {
    const s = this.sectors;
    return Boolean(s) && (this.sectorAt(point) + s.offset) % 2 === 0;
  }

  // SLAG: the middle shot lands where the ship is heading, the others round
  // it, the first of them on its heading; all inside the field.
  slagTargets(count, target) {
    const ship = target?.position ?? { x: this.x, y: this.y };
    const velocity = target?.player?.velocity ?? { vx: 0, vy: 0 };
    const { lead, spread, edgeMargin } = KILN.slag;
    const cx = ship.x + (velocity.vx || 0) * lead;
    const cy = ship.y + (velocity.vy || 0) * lead;
    const moving = Math.hypot(velocity.vx || 0, velocity.vy || 0) > 1;
    const heading = moving
      ? Math.atan2(velocity.vy, velocity.vx)
      : Math.atan2(ship.y - this.y, ship.x - this.x);
    const points = [{ x: cx, y: cy }];
    for (let i = 1; i < count; i += 1) {
      const angle = heading + ((i - 1) * TAU) / (count - 1);
      points.push({
        x: cx + Math.cos(angle) * spread,
        y: cy + Math.sin(angle) * spread,
      });
    }
    return points.map(({ x, y }) => ({
      x: clamp(x, edgeMargin, GAME_WIDTH - edgeMargin),
      y: clamp(y, edgeMargin, GAME_HEIGHT - edgeMargin),
    }));
  }

  lobSlag(cycle, target) {
    this.kilnState = 'slag';
    this.kilnTimer = cycle.slagFlight;
    for (const { x, y } of this.slagTargets(cycle.slagShots, target)) {
      this.pools.push({
        x,
        y,
        radius: KILN.slag.radius,
        phase: 'warn',
        timer: cycle.slagFlight,
        duration: cycle.slagFlight,
        burn: cycle.poolBurn,
      });
    }
  }

  // Each pool: flying (warn) → burning → gone.
  updatePools(deltaTime) {
    for (const pool of this.pools) {
      pool.timer -= deltaTime;
      if (pool.phase === 'warn' && pool.timer <= 0) {
        pool.phase = 'burn';
        pool.timer = pool.duration = pool.burn;
      }
    }
    this.pools = this.pools.filter(
      (pool) => pool.phase === 'warn' || pool.timer > 0
    );
  }

  /** The burning pool `point` is in, or null. */
  poolAt(point) {
    return (
      this.pools.find(
        (pool) =>
          pool.phase === 'burn' &&
          Math.hypot(point.x - pool.x, point.y - pool.y) <= pool.radius
      ) ?? null
    );
  }

  // One tick every `burnTick` s while the ship's centre is in a burning
  // wedge or pool (the first on stepping in); the stronger of the two.
  burn(deltaTime, target) {
    const ship = target?.position;
    const hot = ship && this.sectors?.phase === 'burn' && this.sectorHot(ship);
    const pool = ship ? this.poolAt(ship) : null;
    if (!hot && !pool) {
      this.burnTimer = 0;
      return;
    }
    this.burnTimer -= deltaTime;
    if (this.burnTimer > 0) return;
    this.burnTimer += KILN.burnTick;
    const factor = Math.max(
      hot ? KILN.sectors.damageFactor : 0,
      pool ? KILN.slag.damageFactor : 0
    );
    const reach = target?.player?.getHullBoundingRadius?.() ?? SHIP_REACH;
    this.system?.applyDirectDamageToPlayer?.(
      Math.round(this.contactDamage * factor),
      {
        cause: pool && !hot ? 'boss-slag' : 'boss-heat',
        position: pool && !hot ? { x: pool.x, y: pool.y } : { ...ship },
        radius: pool && !hot ? pool.radius : reach,
        source: this,
      }
    );
  }
}

export default SentinelKilnEngine;
