const getGameEvents = (context) => {
  if (context?.system?.gameEvents?.emit) {
    return context.system.gameEvents;
  }

  if (typeof globalThis !== 'undefined') {
    if (globalThis.gameEvents?.emit) {
      return globalThis.gameEvents;
    }
  }

  if (typeof gameEvents !== 'undefined' && gameEvents?.emit) {
    return gameEvents;
  }

  return null;
};

const computeLeadSolution = ({
  origin,
  target,
  targetVelocity,
  projectileSpeed,
}) => {
  const toTargetX = target.x - origin.x;
  const toTargetY = target.y - origin.y;

  const targetSpeedSq = targetVelocity.vx * targetVelocity.vx + targetVelocity.vy * targetVelocity.vy;
  const projectileSpeedSq = projectileSpeed * projectileSpeed;

  const a = targetSpeedSq - projectileSpeedSq;
  const b = 2 * (toTargetX * targetVelocity.vx + toTargetY * targetVelocity.vy);
  const c = toTargetX * toTargetX + toTargetY * toTargetY;

  if (Math.abs(a) < 1e-6) {
    const time = Math.abs(projectileSpeed) > 1e-6 ? -c / b : 0;
    if (time > 0) {
      return {
        x: target.x + targetVelocity.vx * time,
        y: target.y + targetVelocity.vy * time,
      };
    }
    return { x: target.x, y: target.y };
  }

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return { x: target.x, y: target.y };
  }

  const sqrt = Math.sqrt(Math.max(discriminant, 0));
  const time1 = (-b - sqrt) / (2 * a);
  const time2 = (-b + sqrt) / (2 * a);

  const time = Math.min(time1, time2) > 0 ? Math.min(time1, time2) : Math.max(time1, time2);
  if (time <= 0) {
    return { x: target.x, y: target.y };
  }

  return {
    x: target.x + targetVelocity.vx * time,
    y: target.y + targetVelocity.vy * time,
  };
};

const resolvePlayerVelocity = (player) => {
  if (!player) {
    return { vx: 0, vy: 0 };
  }

  const entity = player.entity ?? player;

  if (typeof entity.getVelocity === 'function') {
    const velocity = entity.getVelocity();
    if (velocity && Number.isFinite(velocity.vx) && Number.isFinite(velocity.vy)) {
      return { vx: velocity.vx, vy: velocity.vy };
    }
  }

  if (entity.velocity && Number.isFinite(entity.velocity.x) && Number.isFinite(entity.velocity.y)) {
    return { vx: entity.velocity.x, vy: entity.velocity.y };
  }

  return { vx: 0, vy: 0 };
};

const applySpread = (angle, spread, random) => {
  if (!spread) {
    return angle;
  }
  const variance = (random?.float?.() ?? random?.() ?? Math.random()) - 0.5;
  return angle + variance * spread;
};

const ensureWeaponState = (enemy) => {
  if (!enemy.weaponState) {
    enemy.weaponState = {};
  }
  return enemy.weaponState;
};

const resolvePattern = (component, enemy) => {
  if (enemy?.weaponPattern) {
    return enemy.weaponPattern;
  }
  if (Array.isArray(component.config.patterns) && component.config.patterns.length > 0) {
    const state = ensureWeaponState(enemy);
    if (!Number.isInteger(state.patternIndex)) {
      state.patternIndex = 0;
    }
    return component.config.patterns[state.patternIndex % component.config.patterns.length];
  }
  return component.config.pattern || 'single';
};

const rotatePattern = (component, enemy) => {
  if (!Array.isArray(component.config.patterns) || component.config.patterns.length <= 1) {
    return;
  }
  const state = ensureWeaponState(enemy);
  state.patternIndex = ((state.patternIndex ?? 0) + 1) % component.config.patterns.length;
};

const defaultPatterns = {
  single: (component, context, state) => {
    const enemy = context.enemy;
    const config = {
      damage: component.config.damage ?? enemy.projectileDamage ?? 10,
      speed: component.config.speed ?? enemy.projectileSpeed ?? 300,
      lifetime: component.config.lifetime ?? enemy.projectileLifetime ?? 2,
      cooldown: component.config.cooldown ?? component.config.interval ?? 1.5,
      variance: component.config.variance ?? 0,
      spread: component.config.spread ?? 0,
      predictive: component.config.predictive !== false,
      fireRange: component.config.fireRange ?? component.config.targetingRange ?? 500,
    };

    state.cooldown = Math.max((state.cooldown ?? 0) - context.deltaTime, 0);

    const playerPos =
      context.player?.position || context.playerPosition || context.player;
    if (!playerPos) {
      return;
    }

    const dx = playerPos.x - enemy.x;
    const dy = playerPos.y - enemy.y;
    const distance = Math.hypot(dx, dy);
    if (distance > config.fireRange) {
      return;
    }

    if (state.cooldown > 0) {
      return;
    }

    const playerVelocity = resolvePlayerVelocity(context.player);
    const aimPoint = config.predictive
      ? computeLeadSolution({
          origin: { x: enemy.x, y: enemy.y },
          target: playerPos,
          targetVelocity: playerVelocity,
          projectileSpeed: config.speed,
        })
      : playerPos;

    const angle = Math.atan2(aimPoint.y - enemy.y, aimPoint.x - enemy.x);
    const finalAngle = applySpread(angle, config.spread, context.random);
    const vx = Math.cos(finalAngle) * config.speed;
    const vy = Math.sin(finalAngle) * config.speed;

    component.fire(context, {
      vx,
      vy,
      damage: config.damage,
      projectileSpeed: config.speed,
      lifetime: config.lifetime,
      spread: config.spread,
      pattern: 'single',
    });

    state.cooldown = config.cooldown;
  },
  burst: (component, context, state) => {
    const enemy = context.enemy;
    const config = {
      damage: component.config.damage ?? enemy.projectileDamage ?? 12,
      speed: component.config.speed ?? enemy.projectileSpeed ?? 360,
      lifetime: component.config.lifetime ?? enemy.projectileLifetime ?? 1.5,
      burstCount: component.config.burstCount ?? 3,
      burstDelay: component.config.burstDelay ?? 0.15,
      burstInterval: component.config.burstInterval ?? component.config.cooldown ?? 3,
      spread: component.config.spread ?? 0,
      predictive: component.config.predictive !== false,
      fireRange: component.config.fireRange ?? 520,
    };

    state.cooldown = Math.max((state.cooldown ?? 0) - context.deltaTime, 0);
    state.burstTimer = Math.max((state.burstTimer ?? 0) - context.deltaTime, 0);

    const playerPos =
      context.player?.position || context.playerPosition || context.player;
    if (!playerPos) {
      return;
    }

    const distance = Math.hypot(playerPos.x - enemy.x, playerPos.y - enemy.y);
    if (distance > config.fireRange) {
      return;
    }

    if ((state.burstRemaining ?? 0) <= 0) {
      if (state.cooldown > 0) {
        return;
      }
      state.burstRemaining = config.burstCount;
      state.burstTimer = 0;
      state.cooldown = config.burstInterval;
    }

    if (state.burstTimer > 0) {
      return;
    }

    const playerVelocity = resolvePlayerVelocity(context.player);
    const aimPoint = config.predictive
      ? computeLeadSolution({
          origin: { x: enemy.x, y: enemy.y },
          target: playerPos,
          targetVelocity: playerVelocity,
          projectileSpeed: config.speed,
        })
      : playerPos;

    const angle = Math.atan2(aimPoint.y - enemy.y, aimPoint.x - enemy.x);
    const finalAngle = applySpread(angle, config.spread, context.random);
    const vx = Math.cos(finalAngle) * config.speed;
    const vy = Math.sin(finalAngle) * config.speed;

    component.fire(context, {
      vx,
      vy,
      damage: config.damage,
      projectileSpeed: config.speed,
      lifetime: config.lifetime,
      spread: config.spread,
      pattern: 'burst',
    });

    state.burstRemaining = Math.max((state.burstRemaining ?? 0) - 1, 0);
    state.burstTimer = config.burstDelay;
  },
  spread: (component, context, state) => {
    const enemy = context.enemy;
    const patternConfig = component.config.spread || component.config;
    const config = {
      projectileCount: patternConfig.projectileCount ?? 5,
      speed: patternConfig.speed ?? component.config.speed ?? 260,
      lifetime: patternConfig.lifetime ?? component.config.lifetime ?? 2.2,
      interval: patternConfig.interval ?? component.config.cooldown ?? 2.4,
      variance: patternConfig.variance ?? component.config.variance ?? 0.2,
      arc: patternConfig.arc ?? Math.PI / 2,
      angleVariance: patternConfig.angleVariance ?? component.config.spread ?? 0,
      damage: component.config.damage ?? enemy.projectileDamage ?? 20,
    };

    state.cooldown = Math.max((state.cooldown ?? 0) - context.deltaTime, 0);

    if (state.cooldown > 0) {
      return;
    }

    const playerPos =
      context.player?.position || context.playerPosition || context.player;
    if (!playerPos) {
      return;
    }

    const baseAngle = Math.atan2(playerPos.y - enemy.y, playerPos.x - enemy.x);
    const offset = config.arc / Math.max(config.projectileCount - 1, 1);
    const startAngle = baseAngle - config.arc / 2;

    for (let i = 0; i < config.projectileCount; i += 1) {
      const randomOffset = ((context.random?.float?.() ?? Math.random()) - 0.5) * config.angleVariance;
      const shotAngle = startAngle + offset * i + randomOffset;
      const vx = Math.cos(shotAngle) * config.speed;
      const vy = Math.sin(shotAngle) * config.speed;

      component.fire(context, {
        vx,
        vy,
        damage: config.damage,
        projectileSpeed: config.speed,
        lifetime: config.lifetime,
        spread: config.angleVariance,
        pattern: 'spread',
      });
    }

    state.cooldown = config.interval;
    rotatePattern(component, enemy);
  },
  volley: (component, context, state) => {
    const enemy = context.enemy;
    const patternConfig = component.config.volley || component.config;
    const config = {
      burstSize: patternConfig.burstSize ?? 5,
      shotDelay: patternConfig.shotDelay ?? 0.12,
      interval: patternConfig.interval ?? component.config.cooldown ?? 1.35,
      variance: patternConfig.variance ?? 0.15,
      speed: patternConfig.speed ?? component.config.speed ?? 320,
      spread: patternConfig.spread ?? component.config.spread ?? 0.1,
      damage: component.config.damage ?? enemy.projectileDamage ?? 35,
    };

    state.cooldown = Math.max((state.cooldown ?? 0) - context.deltaTime, 0);
    state.burstTimer = Math.max((state.burstTimer ?? 0) - context.deltaTime, 0);

    if ((state.burstRemaining ?? 0) <= 0) {
      if (state.cooldown > 0) {
        return;
      }
      state.burstRemaining = config.burstSize;
      state.burstTimer = 0;
      state.cooldown = config.interval;
    }

    if (state.burstTimer > 0) {
      return;
    }

    const playerPos =
      context.player?.position || context.playerPosition || context.player;
    if (!playerPos) {
      return;
    }

    const angle = Math.atan2(playerPos.y - enemy.y, playerPos.x - enemy.x);
    const finalAngle = applySpread(angle, config.spread, context.random);
    const vx = Math.cos(finalAngle) * config.speed;
    const vy = Math.sin(finalAngle) * config.speed;

    component.fire(context, {
      vx,
      vy,
      damage: config.damage,
      projectileSpeed: config.speed,
      lifetime: component.config.lifetime ?? 2,
      spread: config.spread,
      pattern: 'volley',
    });

    state.burstRemaining = Math.max((state.burstRemaining ?? 0) - 1, 0);
    state.burstTimer = config.shotDelay;

    if (state.burstRemaining <= 0) {
      rotatePattern(component, enemy);
    }
  },
  proximity: (component, context, state) => {
    const enemy = context.enemy;
    const config = {
      damage: component.config.damage ?? enemy.contactDamage ?? 30,
      explosionRadius: component.config.explosionRadius ?? 120,
      proximityRadius: component.config.proximityRadius ?? 80,
      armTime: component.config.armTime ?? 0.5,
      triggerOnProximity: component.config.triggerOnProximity !== false,
    };

    state.armedTime = (state.armedTime ?? 0) + context.deltaTime;

    if (state.detonated) {
      return;
    }

    const playerPos = context.player?.position || context.player;
    if (!playerPos) {
      return;
    }

    if (config.triggerOnProximity && state.armedTime >= config.armTime) {
      const distance = Math.hypot(playerPos.x - enemy.x, playerPos.y - enemy.y);
      if (distance <= config.proximityRadius) {
        state.detonated = true;

        if (typeof enemy.triggerDetonation === 'function') {
          const payload = { reason: 'proximity', distance };
          try {
            enemy.triggerDetonation(payload);
          } catch (error) {
            enemy.triggerDetonation('proximity', { distance });
          }
        } else if (typeof enemy.takeDamage === 'function') {
          const lethal = Number.isFinite(enemy.health)
            ? enemy.health
            : Number.isFinite(enemy.maxHealth)
            ? enemy.maxHealth
            : Infinity;
          enemy.takeDamage(lethal, {
            cause: 'mine-detonation',
            reason: 'proximity',
            distance,
          });
        }
      }
    }
  },
};

export class WeaponComponent {
  constructor(config = {}) {
    this.config = { ...config };
    this.patterns = new Map(Object.entries(defaultPatterns));
  }

  registerPattern(name, handler) {
    if (!name || typeof handler !== 'function') {
      return;
    }
    this.patterns.set(name, handler);
  }

  reset(enemy) {
    if (enemy?.weaponState) {
      enemy.weaponState.cooldown = 0;
      enemy.weaponState.burstTimer = 0;
      enemy.weaponState.burstRemaining = 0;
      enemy.weaponState.detonated = false;
    }
  }

  update(context) {
    const enemy = context?.enemy;
    if (!enemy) {
      return;
    }

    const state = ensureWeaponState(enemy);
    const patternName = resolvePattern(this, enemy);
    const handler = this.patterns.get(patternName);

    if (handler) {
      handler(this, context, state);
    }
  }

  fire(context, payload = {}) {
    const enemy = context?.enemy;
    if (!enemy) {
      return;
    }

    const bus = getGameEvents(context);
    if (!bus?.emit) {
      return;
    }

    const damage = payload.damage ?? this.config.damage ?? enemy.projectileDamage ?? enemy.contactDamage ?? 10;
    const vx = payload.vx ?? 0;
    const vy = payload.vy ?? 0;
    const projectileSpeed = payload.projectileSpeed ?? Math.hypot(vx, vy);

    bus.emit('enemy-fired', {
      enemy,
      enemyId: enemy.id,
      enemyType: enemy.type,
      wave: enemy.wave,
      position: { x: enemy.x, y: enemy.y },
      velocity: { x: vx, y: vy },
      damage,
      projectile: {
        speed: projectileSpeed,
        spread: Math.abs(payload.spread ?? this.config.spread ?? 0),
        lifetime: payload.lifetime ?? this.config.lifetime ?? 2,
        explosionRadius: payload.explosionRadius,
      },
      pattern: payload.pattern ?? resolvePattern(this, enemy),
      source: {
        id: enemy.id,
        type: enemy.type,
        wave: enemy.wave,
      },
    });
  }
}
