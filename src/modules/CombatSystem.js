// src/modules/CombatSystem.js
import * as CONSTANTS from '../core/GameConstants.js';

class CombatSystem {
    constructor() {
        // === ESTADO DO SISTEMA DE COMBATE ===
        this.bullets = [];
        this.currentTarget = null;
        this.targetUpdateTimer = 0;
        this.lastShotTime = 0;
        this.shootCooldown = 0.3;

        // === CONFIGURAÇÕES ===
        this.targetingRange = 400;
        this.targetUpdateInterval = CONSTANTS.TARGET_UPDATE_INTERVAL;
        this.bulletSpeed = CONSTANTS.BULLET_SPEED;
        this.bulletLifetime = 1.8;
        this.trailLength = CONSTANTS.TRAIL_LENGTH;

        // Registrar no ServiceLocator
        if (typeof gameServices !== 'undefined') {
            gameServices.register('combat', this);
        }

        console.log('[CombatSystem] Initialized');
    }

    // === UPDATE PRINCIPAL ===
    update(deltaTime) {
        this.updateTargeting(deltaTime);

        const player = gameServices.get('player');
        const playerStats = player ? player.getStats() : null;

        if (playerStats) {
            this.handleShooting(deltaTime, playerStats);
        }

        this.updateBullets(deltaTime);

        const enemies = gameServices.get('enemies');
        if (enemies) {
            this.checkBulletCollisions(enemies.getAsteroids());
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
        if (this.currentTarget && (this.currentTarget.destroyed || !this.isValidTarget(this.currentTarget))) {
            this.currentTarget = null;
        }
    }

    findBestTarget() {
        const player = gameServices.get('player');
        if (!player) return;

        const playerPos = player.getPosition();
        let bestTarget = null;
        let closestDistance = Infinity;

        const enemies = gameServices.get('enemies');
        if (!enemies) return;
        enemies.getAsteroids().forEach(enemy => {
            if (enemy.destroyed) return;
            const dx = enemy.x - playerPos.x;
            const dy = enemy.y - playerPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < this.targetingRange && distance < closestDistance) {
                closestDistance = distance;
                bestTarget = enemy;
            }
        });

        this.currentTarget = bestTarget;
    }

    isValidTarget(target) {
        if (!target || target.destroyed) return false;

        const player = gameServices.get('player');
        if (!player) return false;

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

        const player = gameServices.get('player');
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
                    finalTargetPos = this.applyMultishotSpread(playerPos, targetPos, i, playerStats.multishot);
                }
                this.createBullet(playerPos, finalTargetPos, playerStats.damage);
            }

            this.lastShotTime = 0;

            // Emitir evento para audio e efeitos
            if (typeof gameEvents !== 'undefined') {
                gameEvents.emit('weapon-fired', {
                    position: playerPos,
                    target: targetPos,
                    weaponType: 'basic'
                });
            }
        }
    }

    canShoot() {
        return this.lastShotTime >= this.shootCooldown &&
               this.currentTarget &&
               !this.currentTarget.destroyed;
    }

    getPredictedTargetPosition() {
        if (!this.currentTarget) return null;

        // Predição simples de movimento
        const predictTime = 0.5;
        return {
            x: this.currentTarget.x + (this.currentTarget.vx || 0) * predictTime,
            y: this.currentTarget.y + (this.currentTarget.vy || 0) * predictTime
        };
    }

    applyMultishotSpread(playerPos, targetPos, shotIndex, totalShots) {
        const spreadAngle = (shotIndex - (totalShots - 1) / 2) * 0.3;

        const dx = targetPos.x - playerPos.x;
        const dy = targetPos.y - playerPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance === 0) return targetPos;

        const baseAngle = Math.atan2(dy, dx);
        const finalAngle = baseAngle + spreadAngle;

        return {
            x: playerPos.x + Math.cos(finalAngle) * distance,
            y: playerPos.y + Math.sin(finalAngle) * distance
        };
    }

    // === SISTEMA DE PROJÉTEIS ===
    createBullet(fromPos, toPos, damage) {
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance === 0) return;

        const bullet = {
            id: Date.now() + Math.random(),
            x: fromPos.x,
            y: fromPos.y,
            vx: (dx / distance) * this.bulletSpeed,
            vy: (dy / distance) * this.bulletSpeed,
            damage: damage,
            life: this.bulletLifetime,
            trail: [],
            hit: false
        };

        this.bullets.push(bullet);

        // Emitir evento para efeitos
        if (typeof gameEvents !== 'undefined') {
            gameEvents.emit('bullet-created', {
                bullet: bullet,
                from: fromPos,
                to: toPos
            });
        }
    }

    updateBullets(deltaTime) {
        this.bullets.forEach(bullet => {
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

            // Screen wrapping
            if (bullet.x < 0) bullet.x = CONSTANTS.GAME_WIDTH;
            if (bullet.x > CONSTANTS.GAME_WIDTH) bullet.x = 0;
            if (bullet.y < 0) bullet.y = CONSTANTS.GAME_HEIGHT;
            if (bullet.y > CONSTANTS.GAME_HEIGHT) bullet.y = 0;
        });

        // Remover bullets expirados
        this.bullets = this.bullets.filter(bullet => bullet.life > 0 && !bullet.hit);
    }

    // === DETECÇÃO DE COLISÃO ===
    checkBulletCollisions(enemies) {
        this.bullets.forEach(bullet => {
            if (bullet.hit) return;

            enemies.forEach(enemy => {
                if (enemy.destroyed) return;

                const dx = bullet.x - enemy.x;
                const dy = bullet.y - enemy.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < (CONSTANTS.BULLET_SIZE + enemy.radius)) {
                    // Colisão detectada
                    bullet.hit = true;

                    // Aplicar dano
                    const killed = enemy.takeDamage(bullet.damage);

                    // Emitir eventos
                    if (typeof gameEvents !== 'undefined') {
                        gameEvents.emit('bullet-hit', {
                            bullet: bullet,
                            enemy: enemy,
                            position: { x: bullet.x, y: bullet.y },
                            damage: bullet.damage,
                            killed: killed
                        });
                    }
                }
            });
        });
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

        this.bullets.forEach(bullet => {
            if (bullet.hit) return;

            if (bullet.trail.length > 1) {
                ctx.save();
                ctx.strokeStyle = '#FFFF00';
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                ctx.globalAlpha = 0.6;

                ctx.beginPath();
                ctx.moveTo(bullet.trail[0].x, bullet.trail[0].y);
                for (let i = 1; i < bullet.trail.length; i++) {
                    ctx.lineTo(bullet.trail[i].x, bullet.trail[i].y);
                }
                ctx.stroke();
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

            const player = gameServices.get('player');
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
        this.bullets = [];
        this.currentTarget = null;
        this.lastShotTime = 0;
        console.log('[CombatSystem] Reset');
    }

    destroy() {
        this.bullets = [];
        this.currentTarget = null;
        console.log('[CombatSystem] Destroyed');
    }
}

export default CombatSystem;