import { GAME_HEIGHT, GAME_WIDTH } from '../../../core/GameConstants.js';
import {
  HERALD_FIELD_MARGIN,
  HERALD_KINDS,
  HERALD_SPAWN_INVULNERABILITY,
} from '../../../data/enemies/herald.js';
import { BaseEnemy } from '../base/BaseEnemy.js';

const TAU = Math.PI * 2;

const clampToField = (value, size) =>
  Math.min(size - HERALD_FIELD_MARGIN, Math.max(HERALD_FIELD_MARGIN, value));

/**
 * A Herald (src/data/enemies/herald.js): one class, the kind picks the
 * mechanic. Each one charges a single cycle (`cycleTimer`), lit by
 * `telegraphRatio` (0..1) over the windup before it acts:
 *   dust    — drifts in, then raises a wall of small rocks toward the ship;
 *   heat    — circles the ship, ignites the nearest rocks and fires a spread;
 *   silence — blinks (a ring marks where), jams the radar while alive and
 *             fires a slow homing shard on its own clock.
 * Invulnerable for HERALD_SPAWN_INVULNERABILITY s after it appears.
 * Emits 'herald-spawned' {kind, x, y} and 'herald-defeated' {kind, x, y}.
 */
export class Herald extends BaseEnemy {
  constructor(system, config = {}) {
    super(system, config);
    this.type = 'herald';
    this.heraldKind = 'dust';
    this.destroyed = false;
    this.movementStrategy = 'linear';
    this.resetHeraldState();

    if (Object.keys(config).length > 0) {
      this.initialize(config);
    }
  }

  initialize(config = {}) {
    this.resetForPool();
    super.initialize(config);

    const kind = HERALD_KINDS[config.heraldKind] ? config.heraldKind : 'dust';
    const data = HERALD_KINDS[kind];
    this.heraldKind = kind;
    this.data = data;
    this.displayName = data.displayName;
    this.subtitle = data.subtitle;
    this.radius = data.radius;
    this.collisionRadius = data.radius;
    this.maxHealth = data.health;
    this.health = data.health;
    this.healthInitialized = true;
    this.contactDamage = data.contactDamage;
    this.invulnerable = true;
    this.invulnerabilityTimer = HERALD_SPAWN_INVULNERABILITY;
    this.invulnerabilityDuration = HERALD_SPAWN_INVULNERABILITY;
    this.cycleTimer = this.cycleInterval();
    this.shardTimer = data.shardInterval ?? 0;
    this.random = this.resolveRandom({ ...config, id: this.id });
    this.destroyed = false;

    this.getEventBus()?.emit?.('herald-spawned', {
      kind,
      x: this.x,
      y: this.y,
    });
    return this;
  }

  resetHeraldState() {
    this.data = HERALD_KINDS.dust;
    this.cycleTimer = 0;
    this.shardTimer = 0;
    this.orbitAngle = null;
    this.blinkTarget = null;
    this.shards = [];
    this.invulnerable = false;
    this.invulnerabilityTimer = 0;
  }

  resetForPool() {
    super.resetForPool();
    this.resetHeraldState();
    this.destroyed = false;
  }

  cycleInterval() {
    const { data } = this;
    return data.wallInterval ?? data.igniteInterval ?? data.blinkInterval;
  }

  cycleWindup() {
    const { data } = this;
    return data.wallWindup ?? data.igniteWindup ?? data.blinkWindup;
  }

  /** 0..1 over the windup before the Herald acts (slits, seam, ring). */
  get telegraphRatio() {
    const windup = this.cycleWindup();
    if (!(windup > 0) || this.cycleTimer > windup) return 0;
    return Math.min(1, 1 - this.cycleTimer / windup);
  }

  takeDamage(amount, source = null) {
    if (this.invulnerable) return false;
    return super.takeDamage(amount, source);
  }

  onUpdate(deltaTime) {
    if (!(deltaTime > 0) || !this.alive) return;

    if (this.invulnerabilityTimer > 0) {
      this.invulnerabilityTimer = Math.max(
        0,
        this.invulnerabilityTimer - deltaTime
      );
      if (this.invulnerabilityTimer === 0) this.invulnerable = false;
    }

    const target = this.system?.getCachedPlayer?.()?.position ?? null;
    if (this.heraldKind === 'heat') this.steerOrbit(target, deltaTime);
    else this.steerToward(target);

    const windup = this.cycleWindup();
    const before = this.cycleTimer;
    this.cycleTimer -= deltaTime;
    if (
      this.heraldKind === 'silence' &&
      before > windup &&
      this.cycleTimer <= windup
    ) {
      this.blinkTarget = this.pickBlinkTarget();
    }
    if (this.cycleTimer <= 0) {
      this.cycleTimer += this.cycleInterval();
      this.act(target);
    }

    if (this.heraldKind === 'silence') {
      this.shardTimer -= deltaTime;
      if (this.shardTimer <= 0) {
        this.shardTimer += this.data.shardInterval;
        this.fireShard(target);
      }
      this.steerShards(target, deltaTime);
    }
  }

  act(target) {
    if (this.heraldKind === 'dust') this.raiseWall(target);
    else if (this.heraldKind === 'heat') this.ignite(target);
    else this.blink();
  }

  // Dust and Silence close in slowly and hold at `holdDistance`.
  steerToward(target) {
    const { speed, holdDistance } = this.data;
    if (!target) {
      this.vx = 0;
      this.vy = 0;
      return;
    }
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distance = Math.hypot(dx, dy) || 1;
    this.rotation = Math.atan2(dy, dx);
    const pace = distance > holdDistance ? speed : 0;
    this.vx = (dx / distance) * pace;
    this.vy = (dy / distance) * pace;
  }

  // Heat circles the ship at `orbitDistance`, chasing a point that turns.
  steerOrbit(target, deltaTime) {
    if (!target) {
      this.vx = 0;
      this.vy = 0;
      return;
    }
    const { orbitDistance, orbitSpeed, speed } = this.data;
    if (this.orbitAngle === null) {
      this.orbitAngle = Math.atan2(this.y - target.y, this.x - target.x);
    }
    this.orbitAngle = (this.orbitAngle + orbitSpeed * deltaTime) % TAU;
    const px = clampToField(
      target.x + Math.cos(this.orbitAngle) * orbitDistance,
      GAME_WIDTH
    );
    const py = clampToField(
      target.y + Math.sin(this.orbitAngle) * orbitDistance,
      GAME_HEIGHT
    );
    const dx = px - this.x;
    const dy = py - this.y;
    const distance = Math.hypot(dx, dy);
    const pace = Math.min(speed, distance / Math.max(deltaTime, 1e-3));
    this.vx = distance > 0 ? (dx / distance) * pace : 0;
    this.vy = distance > 0 ? (dy / distance) * pace : 0;
    this.rotation = Math.atan2(target.y - this.y, target.x - this.x);
  }

  // A line of small rocks across the way to the ship, halfway there,
  // creeping toward it.
  raiseWall(target) {
    if (!target) return;
    const { wallRocks, wallSpacing, wallDrift, radius } = this.data;
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distance = Math.hypot(dx, dy) || 1;
    const ux = dx / distance;
    const uy = dy / distance;
    const reach = Math.max(radius + 40, distance / 2);
    const cx = this.x + ux * reach;
    const cy = this.y + uy * reach;
    for (let i = 0; i < wallRocks; i += 1) {
      const offset = (i - (wallRocks - 1) / 2) * wallSpacing;
      this.spawnChild('asteroid', {
        size: 'small',
        variant: 'common',
        x: cx - uy * offset,
        y: cy + ux * offset,
        vx: ux * wallDrift,
        vy: uy * wallDrift,
      });
    }
  }

  // The nearest rocks turn Volatile; a spread goes out at the ship.
  ignite(target) {
    const rocks = [];
    this.system?.forEachActiveEnemy?.((enemy) => {
      if (
        enemy.type === 'asteroid' &&
        !enemy.destroyed &&
        enemy.variant !== 'volatile'
      ) {
        rocks.push(enemy);
      }
    });
    const distanceTo = (rock) => Math.hypot(rock.x - this.x, rock.y - this.y);
    rocks.sort((a, b) => distanceTo(a) - distanceTo(b));
    for (const rock of rocks.slice(0, this.data.igniteCount)) rock.ignite();

    if (!target) return;
    const { spreadShots, spreadArc, shotSpeed, shotDamage } = this.data;
    const base = Math.atan2(target.y - this.y, target.x - this.x);
    for (let i = 0; i < spreadShots; i += 1) {
      const offset =
        spreadShots > 1 ? (i / (spreadShots - 1) - 0.5) * spreadArc : 0;
      this.fire(base + offset, shotSpeed, shotDamage, 'herald-spread');
    }
  }

  // A seeded point `blinkDistance` away, kept inside the field.
  pickBlinkTarget() {
    const angle = this.random.range(0, TAU);
    const { blinkDistance } = this.data;
    return {
      x: clampToField(this.x + Math.cos(angle) * blinkDistance, GAME_WIDTH),
      y: clampToField(this.y + Math.sin(angle) * blinkDistance, GAME_HEIGHT),
    };
  }

  blink() {
    const to = this.blinkTarget ?? this.pickBlinkTarget();
    this.x = to.x;
    this.y = to.y;
    this.blinkTarget = null;
  }

  fireShard(target) {
    if (!target) return;
    const { shardSpeed, shardDamage, shardLifetime } = this.data;
    const angle = Math.atan2(target.y - this.y, target.x - this.x);
    this.fire(angle, shardSpeed, shardDamage, 'herald-shard', shardLifetime);
    // The combat system keeps the bullet; the Herald steers it.
    const bullets = this.system?.getCachedCombat?.()?.enemyBullets;
    const bullet = bullets?.[bullets.length - 1];
    if (bullet?.enemyId === this.id) this.shards.push(bullet);
  }

  steerShards(target, deltaTime) {
    if (!this.shards.length) return;
    this.shards = this.shards.filter(
      (bullet) =>
        bullet.active && !bullet.destroyed && bullet.enemyId === this.id
    );
    if (!target) return;
    const maxTurn = this.data.shardTurnRate * deltaTime;
    for (const bullet of this.shards) {
      const heading = Math.atan2(bullet.vy, bullet.vx);
      const wanted = Math.atan2(target.y - bullet.y, target.x - bullet.x);
      let turn = (wanted - heading) % TAU;
      if (turn > Math.PI) turn -= TAU;
      if (turn < -Math.PI) turn += TAU;
      const next = heading + Math.max(-maxTurn, Math.min(maxTurn, turn));
      const speed = Math.hypot(bullet.vx, bullet.vy);
      bullet.vx = Math.cos(next) * speed;
      bullet.vy = Math.sin(next) * speed;
    }
  }

  fire(angle, speed, damage, pattern, lifetime) {
    this.getEventBus()?.emit?.('enemy-fired', {
      enemy: this,
      enemyId: this.id,
      enemyType: this.type,
      wave: this.wave,
      position: { x: this.x, y: this.y },
      velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
      damage,
      projectile: { speed, angle, pattern, lifetime },
      source: { id: this.id, type: this.type, wave: this.wave },
    });
  }

  onDestroyed(source, context = {}) {
    this.destroyed = true;
    this.blinkTarget = null;
    this.shards = [];
    this.getEventBus()?.emit?.('herald-defeated', {
      kind: this.heraldKind,
      x: this.x,
      y: this.y,
    });
    super.onDestroyed(source, context);
  }
}

export default Herald;
