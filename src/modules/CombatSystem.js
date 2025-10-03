// src/modules/CombatSystem.js
import * as CONSTANTS from '../core/GameConstants.js';
import { GamePools } from '../core/GamePools.js';

class CombatSystem {
  constructor() {
    // === ESTADO DO SISTEMA DE COMBATE ===
    this.bullets = [];
    this.currentTarget = null;
    this.targetUpdateTimer = 0;
    this.lastShotTime = 0;
    this.shootCooldown =
      Number.isFinite(CONSTANTS.COMBAT_SHOOT_COOLDOWN)
        ? Math.max(0, CONSTANTS.COMBAT_SHOOT_COOLDOWN)
        : 0.3;

    // === CONFIGURAÇÕES ===
    this.targetingRange =
      Number.isFinite(CONSTANTS.COMBAT_TARGETING_RANGE)
        ? Math.max(0, CONSTANTS.COMBAT_TARGETING_RANGE)
        : 400;
    this.targetUpdateInterval = CONSTANTS.TARGET_UPDATE_INTERVAL;
    this.bulletSpeed = CONSTANTS.BULLET_SPEED;
    this.bulletLifetime =
      Number.isFinite(CONSTANTS.COMBAT_BULLET_LIFETIME)
        ? Math.max(0, CONSTANTS.COMBAT_BULLET_LIFETIME)
        : 1.8;
    this.trailLength = CONSTANTS.TRAIL_LENGTH;

    // === CACHES DE SERVIÇOS ===
    this.cachedPlayer = null;
    this.cachedEnemies = null;
    this.cachedPhysics = null;

    // Registrar no ServiceLocator
    if (typeof gameServices !== 'undefined') {
      gameServices.register('combat', this);
    }

    this.setupEventListeners();
    this.resolveCachedServices(true);

    console.log('[CombatSystem] Initialized');
  }

  setupEventListeners() {
    if (typeof gameEvents === 'undefined') {
      return;
    }

    gameEvents.on('player-reset', () => {
      this.resolveCachedServices(true);
    });

    gameEvents.on('progression-reset', () => {
      this.resolveCachedServices(true);
    });

    gameEvents.on('physics-reset', () => {
      this.resolveCachedServices(true);
    });
  }

  resolveCachedServices(force = false) {
    if (typeof gameServices === 'undefined') {
      return;
    }

    if (force || !this.cachedPlayer) {
      if (
        typeof gameServices.has === 'function' &&
        gameServices.has('player')
      ) {
        this.cachedPlayer = gameServices.get('player');
      } else {
        this.cachedPlayer = null;
      }
    }

    if (force || !this.cachedEnemies) {
      if (
        typeof gameServices.has === 'function' &&
        gameServices.has('enemies')
      ) {
        this.cachedEnemies = gameServices.get('enemies');
      } else {
        this.cachedEnemies = null;
      }
    }

    if (force || !this.cachedPhysics) {
      if (
        typeof gameServices.has === 'function' &&
        gameServices.has('physics')
      ) {
        this.cachedPhysics = gameServices.get('physics');
      } else {
        this.cachedPhysics = null;
      }
    }
  }

  getCachedPlayer() {
    if (!this.cachedPlayer) {
      this.resolveCachedServices();
    }
    return this.cachedPlayer;
  }

  // === UPDATE PRINCIPAL ===
  update(deltaTime) {
    this.resolveCachedServices();
    this.updateTargeting(deltaTime);

    const player = this.cachedPlayer;
    const playerStats =
      player && typeof player.getStats === 'function'
        ? player.getStats()
        : null;

    // Don't shoot if player is hidden (e.g., during quit explosion)
    if (playerStats && !player._quitExplosionHidden) {
      this.handleShooting(deltaTime, playerStats);
    }

    this.updateBullets(deltaTime);

    const enemies = this.cachedEnemies;
    const physics = this.cachedPhysics;

    if (
      physics &&
      enemies &&
      typeof physics.forEachBulletCollision === 'function'
    ) {
      physics.forEachBulletCollision(this.bullets, (bullet, asteroid) => {
        if (!asteroid || bullet.hit) {
          return;
        }
        this.processBulletHit(bullet, asteroid, enemies);
      });
    } else if (enemies) {
      this.checkBulletCollisions(enemies);
    }
  }

  // === SISTEMA DE TARGETING ===
  updateTargeting(deltaTime) {
    this.targetUpdateTimer -= deltaTime;

    if (this.targetUpdateTimer <= 0) {
      this.findBestTarget();
      this.targetUpdateTimer = this.targetUpdateInterval;
    }

    // Verificar se target atual ainda é válido
    if (
      this.currentTarget &&
      (this.currentTarget.destroyed || !this.isValidTarget(this.currentTarget))
    ) {
      this.currentTarget = null;
    }
  }

  findBestTarget() {
    const player = this.getCachedPlayer();
    if (!player || typeof player.getPosition !== 'function') {
      return;
    }

    const playerPos = player.getPosition();
    if (!playerPos) {
      return;
    }
    let bestTarget = null;
    let closestDistance = Infinity;

    const enemies = this.cachedEnemies;
    if (!enemies) {
      return;
    }

    const processEnemy = (enemy) => {
      if (!enemy || enemy.destroyed) {
        return;
      }

      const dx = enemy.x - playerPos.x;
      const dy = enemy.y - playerPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < this.targetingRange && distance < closestDistance) {
        closestDistance = distance;
        bestTarget = enemy;
      }
    };

    if (typeof enemies.forEachActiveAsteroid === 'function') {
      enemies.forEachActiveAsteroid(processEnemy);
    } else if (typeof enemies.getAsteroids === 'function') {
      const asteroids = enemies.getAsteroids();
      for (let i = 0; i < asteroids.length; i += 1) {
        processEnemy(asteroids[i]);
      }
    }

    this.currentTarget = bestTarget;
  }

  isValidTarget(target) {
    if (!target || target.destroyed) return false;

    const player = this.getCachedPlayer();
    if (!player || typeof player.getPosition !== 'function') {
      return false;
    }

    const playerPos = player.getPosition();
    const dx = target.x - playerPos.x;
    const dy = target.y - playerPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    return distance <= this.targetingRange;
  }

  // === SISTEMA DE TIRO ===
  handleShooting(deltaTime, playerStats) {
    this.lastShotTime += deltaTime;

    if (!this.canShoot()) return;

    const player = this.getCachedPlayer();
    if (!player) return;

    const playerPos = player.getPosition();
    const targetPos = this.getPredictedTargetPosition();

    if (targetPos) {
      // playerStats agora vem como parâmetro, não é mais buscado internamente
      if (!playerStats) return; // Guarda de segurança

      for (let i = 0; i < playerStats.multishot; i++) {
        let finalTargetPos = targetPos;

        // Aplicar spread se multishot > 1
        if (playerStats.multishot > 1) {
          finalTargetPos = this.applyMultishotSpread(
            playerPos,
            targetPos,
            i,
            playerStats.multishot
          );
        }
        this.createBullet(playerPos, finalTargetPos, playerStats.damage);
      }

      this.lastShotTime = 0;

      // Emitir evento para audio e efeitos
      if (typeof gameEvents !== 'undefined') {
        gameEvents.emit('weapon-fired', {
          position: playerPos,
          target: targetPos,
          weaponType: 'basic',
        });
      }
    }
  }

  canShoot() {
    return (
      this.lastShotTime >= this.shootCooldown &&
      this.currentTarget &&
      !this.currentTarget.destroyed
    );
  }

  getPredictedTargetPosition() {
    if (!this.currentTarget) return null;

    // Predição simples de movimento
    const predictTime =
      Number.isFinite(CONSTANTS.COMBAT_PREDICTION_TIME)
        ? Math.max(0, CONSTANTS.COMBAT_PREDICTION_TIME)
        : 0.5;
    return {
      x: this.currentTarget.x + (this.currentTarget.vx || 0) * predictTime,
      y: this.currentTarget.y + (this.currentTarget.vy || 0) * predictTime,
    };
  }

  applyMultishotSpread(playerPos, targetPos, shotIndex, totalShots) {
    const spreadStep = Number.isFinite(CONSTANTS.COMBAT_MULTISHOT_SPREAD_STEP)
      ? CONSTANTS.COMBAT_MULTISHOT_SPREAD_STEP
      : 0.3;
    const spreadAngle = (shotIndex - (totalShots - 1) / 2) * spreadStep;

    const dx = targetPos.x - playerPos.x;
    const dy = targetPos.y - playerPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return targetPos;

    const baseAngle = Math.atan2(dy, dx);
    const finalAngle = baseAngle + spreadAngle;

    return {
      x: playerPos.x + Math.cos(finalAngle) * distance,
      y: playerPos.y + Math.sin(finalAngle) * distance,
    };
  }

  // === SISTEMA DE PROJÉTEIS ===
  createBullet(fromPos, toPos, damage) {
    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return;

    // Use object pool instead of creating new object
    const bullet = GamePools.bullets.acquire();

    // Configure bullet properties
    bullet.x = fromPos.x;
    bullet.y = fromPos.y;
    bullet.vx = (dx / distance) * this.bulletSpeed;
    bullet.vy = (dy / distance) * this.bulletSpeed;
    bullet.damage = damage;
    bullet.life = this.bulletLifetime;
    bullet.maxLife = this.bulletLifetime;
    bullet.hit = false;
    bullet.active = true;
    bullet.type = 'player';

    // Initialize trail array
    if (!bullet.trail) {
      bullet.trail = [];
    } else {
      bullet.trail.length = 0; // Clear existing trail
    }

    this.bullets.push(bullet);

    // Emitir evento para efeitos
    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('bullet-created', {
        bullet: bullet,
        from: fromPos,
        to: toPos,
      });
    }
  }

  updateBullets(deltaTime) {
    this.bullets.forEach((bullet) => {
      if (bullet.hit) return;

      // Atualizar trail
      bullet.trail.push({ x: bullet.x, y: bullet.y });
      if (bullet.trail.length > this.trailLength) {
        bullet.trail.shift();
      }

      // Atualizar posição
      bullet.x += bullet.vx * deltaTime;
      bullet.y += bullet.vy * deltaTime;
      bullet.life -= deltaTime;

      // Remover projéteis que saem da tela para evitar "ricochete"
      const outOfBounds =
        bullet.x < 0 ||
        bullet.x > CONSTANTS.GAME_WIDTH ||
        bullet.y < 0 ||
        bullet.y > CONSTANTS.GAME_HEIGHT;

      if (outOfBounds) {
        bullet.life = 0;
        return;
      }
    });

    // Return expired bullets to pool and remove from active list
    const activeBullets = [];
    for (const bullet of this.bullets) {
      if (bullet.life > 0 && !bullet.hit) {
        activeBullets.push(bullet);
      } else {
        // Return to pool
        GamePools.bullets.release(bullet);
      }
    }
    this.bullets = activeBullets;
  }

  // === DETECÇÃO DE COLISÃO ===
  checkBulletCollisions(enemiesSystem) {
    const iterateAsteroids = (handler) => {
      if (typeof enemiesSystem.forEachActiveAsteroid === 'function') {
        enemiesSystem.forEachActiveAsteroid(handler);
      } else if (typeof enemiesSystem.getAsteroids === 'function') {
        const asteroids = enemiesSystem.getAsteroids();
        for (let i = 0; i < asteroids.length; i += 1) {
          handler(asteroids[i]);
        }
      }
    };

    for (const bullet of this.bullets) {
      if (bullet.hit) continue;

      iterateAsteroids((enemy) => {
        if (!enemy || enemy.destroyed || bullet.hit) {
          return;
        }

        const dx = bullet.x - enemy.x;
        const dy = bullet.y - enemy.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < CONSTANTS.BULLET_SIZE + enemy.radius) {
          this.processBulletHit(bullet, enemy, enemiesSystem);
        }
      });
    }
  }

  processBulletHit(bullet, enemy, enemiesSystem) {
    if (!bullet || !enemy || bullet.hit) {
      return;
    }

    bullet.hit = true;

    const damageResult = enemiesSystem
      ? this.applyDamageToEnemy(enemiesSystem, enemy, bullet.damage)
      : {
          killed: Boolean(enemy.destroyed),
          remainingHealth: Math.max(0, enemy.health ?? 0),
        };

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('bullet-hit', {
        bullet: bullet,
        enemy: enemy,
        position: { x: bullet.x, y: bullet.y },
        damage: bullet.damage,
        killed: damageResult.killed,
        remainingHealth: damageResult.remainingHealth,
      });
    }

    return damageResult;
  }

  applyDamageToEnemy(enemiesSystem, enemy, damage) {
    if (typeof enemiesSystem.applyDamage === 'function') {
      const result = enemiesSystem.applyDamage(enemy, damage);
      return {
        killed: !!result?.killed,
        remainingHealth: Math.max(
          0,
          result?.remainingHealth ?? enemy.health ?? 0
        ),
      };
    }

    const killed = enemy.takeDamage(damage);
    if (killed) {
      enemy.destroyed = true;
      return { killed: true, remainingHealth: 0 };
    }

    return { killed: false, remainingHealth: Math.max(0, enemy.health ?? 0) };
  }

  // === GETTERS PÚBLICOS ===
  getBullets() {
    return [...this.bullets]; // Cópia para segurança
  }

  getCurrentTarget() {
    return this.currentTarget;
  }

  getBulletCount() {
    return this.bullets.length;
  }

  render(ctx) {
    if (!ctx) return;

    // Don't render combat elements if player is hidden (e.g., during quit explosion)
    const player = this.getCachedPlayer();
    if (player && player._quitExplosionHidden) {
      return;
    }

    this.bullets.forEach((bullet) => {
      if (bullet.hit) return;

      if (bullet.trail.length > 1) {
        ctx.save();
        ctx.lineCap = 'round';

        // Draw glow layer (wider, softer)
        for (let i = 1; i < bullet.trail.length; i++) {
          const alpha = (i / bullet.trail.length) * 0.4; // Fade toward tail
          ctx.strokeStyle = `rgba(255, 255, 100, ${alpha})`;
          ctx.lineWidth = 4;
          ctx.globalAlpha = alpha;

          ctx.beginPath();
          ctx.moveTo(bullet.trail[i - 1].x, bullet.trail[i - 1].y);
          ctx.lineTo(bullet.trail[i].x, bullet.trail[i].y);
          ctx.stroke();
        }

        // Draw core trail (bright, thin)
        for (let i = 1; i < bullet.trail.length; i++) {
          const alpha = (i / bullet.trail.length) * 0.8; // Fade toward tail
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
          ctx.lineWidth = 2;
          ctx.globalAlpha = alpha;

          ctx.beginPath();
          ctx.moveTo(bullet.trail[i - 1].x, bullet.trail[i - 1].y);
          ctx.lineTo(bullet.trail[i].x, bullet.trail[i].y);
          ctx.stroke();
        }

        ctx.restore();
      }

      const gradient = ctx.createRadialGradient(
        bullet.x,
        bullet.y,
        0,
        bullet.x,
        bullet.y,
        CONSTANTS.BULLET_SIZE * 3
      );
      gradient.addColorStop(0, '#FFFF00');
      gradient.addColorStop(0.5, 'rgba(255, 255, 0, 0.4)');
      gradient.addColorStop(1, 'transparent');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, CONSTANTS.BULLET_SIZE * 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, CONSTANTS.BULLET_SIZE, 0, Math.PI * 2);
      ctx.fill();
    });

    if (this.currentTarget && !this.currentTarget.destroyed) {
      const target = this.currentTarget;
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.7)';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(target.x, target.y, target.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      const player = this.getCachedPlayer();
      if (player) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(player.position.x, player.position.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // === CONFIGURAÇÃO ===
  setShootCooldown(cooldown) {
    this.shootCooldown = Math.max(0.1, cooldown);
  }

  setTargetingRange(range) {
    this.targetingRange = Math.max(50, range);
  }

  // === CLEANUP ===
  reset() {
    // Return all bullets to pool before clearing array
    for (const bullet of this.bullets) {
      GamePools.bullets.release(bullet);
    }
    this.bullets = [];
    this.currentTarget = null;
    this.lastShotTime = 0;
    this.resolveCachedServices(true);
    console.log('[CombatSystem] Reset');
  }

  destroy() {
    // Return all bullets to pool before destroying
    for (const bullet of this.bullets) {
      GamePools.bullets.release(bullet);
    }
    this.bullets = [];
    this.currentTarget = null;
    console.log('[CombatSystem] Destroyed');
  }
}

export default CombatSystem;
