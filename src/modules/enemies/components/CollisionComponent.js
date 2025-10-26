import { COLLISION_BOUNCE } from '../../../data/constants/gameplay.js';

const sqr = (value) => value * value;

const circleDistanceSq = (ax, ay, bx, by) => sqr(ax - bx) + sqr(ay - by);

export class CollisionComponent {
  constructor(config = {}) {
    this.config = { ...config };
    this.shape = config.shape || 'circle';
    this.response = config.response || 'damage';
    this.responses = new Map([
      ['bounce', this.handleBounce.bind(this)],
      ['damage', this.handleDamage.bind(this)],
      ['destroy', this.handleDestroy.bind(this)],
      ['trigger', this.handleTrigger.bind(this)],
    ]);
  }

  registerResponse(name, handler) {
    if (!name || typeof handler !== 'function') {
      return;
    }
    this.responses.set(name, handler);
  }

  checkCircleCollision(enemy, x, y, radius) {
    const enemyRadius = this.resolveRadius(enemy);
    const distSq = circleDistanceSq(enemy.x, enemy.y, x, y);
    const combined = enemyRadius + radius;
    return distSq <= combined * combined;
  }

  checkPointCollision(enemy, x, y) {
    const enemyRadius = this.resolveRadius(enemy);
    const distSq = circleDistanceSq(enemy.x, enemy.y, x, y);
    return distSq <= enemyRadius * enemyRadius;
  }

  getEntitiesInRadius(enemy, entities, radius) {
    if (!Array.isArray(entities)) {
      return [];
    }
    return entities.filter((entity) =>
      this.checkCircleCollision(enemy, entity.x ?? 0, entity.y ?? 0, radius),
    );
  }

  handleCollision(context) {
    const { enemy, other } = context;
    const handler = this.responses.get(enemy.collisionResponse || this.response);
    handler?.(context);
  }

  resolveCollision(enemy, other) {
    const radiusA = this.resolveRadius(enemy);
    const radiusB = this.resolveRadius(other);
    const dx = other.x - enemy.x;
    const dy = other.y - enemy.y;
    const distance = Math.max(Math.hypot(dx, dy), 1e-6);
    const overlap = radiusA + radiusB - distance;

    if (overlap > 0) {
      const nx = dx / distance;
      const ny = dy / distance;
      const massA = Math.max(enemy.mass ?? radiusA * radiusA, 1);
      const massB = Math.max(other.mass ?? radiusB * radiusB, 1);

      const totalMass = massA + massB;
      const correctionA = (overlap * (massB / totalMass)) / 2;
      const correctionB = (overlap * (massA / totalMass)) / 2;

      enemy.x -= nx * correctionA;
      enemy.y -= ny * correctionA;
      other.x += nx * correctionB;
      other.y += ny * correctionB;

      const relVx = (enemy.vx ?? 0) - (other.vx ?? 0);
      const relVy = (enemy.vy ?? 0) - (other.vy ?? 0);
      const velAlongNormal = relVx * nx + relVy * ny;

      if (velAlongNormal > 0) {
        return;
      }

      const restitution = Math.min(enemy.bounce ?? COLLISION_BOUNCE, other.bounce ?? COLLISION_BOUNCE);
      const impulseScalar = (-(1 + restitution) * velAlongNormal) / (1 / massA + 1 / massB);

      const impulseX = impulseScalar * nx;
      const impulseY = impulseScalar * ny;

      enemy.vx = (enemy.vx ?? 0) + impulseX / massA;
      enemy.vy = (enemy.vy ?? 0) + impulseY / massA;
      other.vx = (other.vx ?? 0) - impulseX / massB;
      other.vy = (other.vy ?? 0) - impulseY / massB;
    }
  }

  applyKnockback(enemy, dx, dy, force) {
    if (!enemy) {
      return;
    }
    const magnitude = Math.hypot(dx, dy) || 1;
    const nx = dx / magnitude;
    const ny = dy / magnitude;
    enemy.vx = (enemy.vx ?? 0) + nx * force;
    enemy.vy = (enemy.vy ?? 0) + ny * force;
  }

  resolveRadius(enemy) {
    if (!enemy) {
      return this.config.radius ?? 0;
    }
    if (Number.isFinite(enemy.collisionRadius)) {
      return enemy.collisionRadius;
    }
    if (Number.isFinite(enemy.radius)) {
      return enemy.radius;
    }
    if (Number.isFinite(this.config.radius)) {
      return this.config.radius;
    }
    return 16;
  }

  handleBounce({ enemy, other }) {
    if (!enemy || !other) {
      return;
    }
    this.resolveCollision(enemy, other);
  }

  handleDamage({ enemy, other, damage = this.config.contactDamage ?? enemy.contactDamage ?? 10, source }) {
    if (!enemy || !other) {
      return;
    }

    if (typeof other.takeDamage === 'function') {
      other.takeDamage(damage, enemy);
    }

    if (typeof enemy.takeDamage === 'function' && this.config.reflectDamage) {
      enemy.takeDamage(this.config.reflectDamage, source ?? other);
    }
  }

  handleDestroy({ enemy, other, source }) {
    if (!enemy || !other) {
      return;
    }

    if (typeof other.destroy === 'function') {
      other.destroy(source ?? enemy);
    } else if (typeof other.takeDamage === 'function') {
      other.takeDamage(other.health ?? Infinity, enemy);
    }

    if (typeof enemy.destroy === 'function') {
      enemy.destroy(source ?? other);
    }
  }

  handleTrigger({ enemy, system, payload = {} }) {
    if (!enemy) {
      return;
    }

    if (typeof enemy.triggerDetonation === 'function') {
      enemy.triggerDetonation(payload);
    }

    if (system?.gameEvents?.emit) {
      system.gameEvents.emit('enemy-triggered', {
        enemyId: enemy.id,
        enemyType: enemy.type,
        position: { x: enemy.x, y: enemy.y },
        payload,
      });
    } else if (typeof gameEvents !== 'undefined' && gameEvents?.emit) {
      gameEvents.emit('enemy-triggered', {
        enemyId: enemy.id,
        enemyType: enemy.type,
        position: { x: enemy.x, y: enemy.y },
        payload,
      });
    }
  }
}
