
// src/modules/EnemySystem.js
import * as CONSTANTS from '../core/GameConstants.js';

// === CLASSE ASTEROID (MOVIDA DO APP.JS) ===
class Asteroid {
    constructor(x, y, size, vx = 0, vy = 0) {
        this.id = Date.now() + Math.random();
        this.x = x;
        this.y = y;
        this.size = size;
        this.radius = CONSTANTS.ASTEROID_SIZES[size];
        this.mass = this.radius * this.radius * 0.05;
        this.health = size === 'large' ? 3 : size === 'medium' ? 2 : 1;
        this.maxHealth = this.health;

        // Velocidade baseada no tamanho
        if (vx === 0 && vy === 0) {
            const speed = CONSTANTS.ASTEROID_SPEEDS[size] * (0.8 + Math.random() * 0.4);
            const angle = Math.random() * Math.PI * 2;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
        } else {
            this.vx = vx;
            this.vy = vy;
        }

        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 1.5;
        this.lastDamageTime = 0;
        this.vertices = this.generateVertices();
        this.destroyed = false;
    }

    generateVertices() {
        const vertices = [];
        const numVertices = 6 + Math.floor(Math.random() * 3);

        for (let i = 0; i < numVertices; i++) {
            const angle = (i / numVertices) * Math.PI * 2;
            const radiusVariation = 0.8 + Math.random() * 0.4;
            const radius = this.radius * radiusVariation;
            vertices.push({
                x: Math.cos(angle) * radius,
                y: Math.sin(angle) * radius
            });
        }
        return vertices;
    }

    update(deltaTime) {
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
        this.rotation += this.rotationSpeed * deltaTime;

        // Screen wrapping
        const margin = this.radius;
        if (this.x < -margin) this.x = CONSTANTS.GAME_WIDTH + margin;
        if (this.x > CONSTANTS.GAME_WIDTH + margin) this.x = -margin;
        if (this.y < -margin) this.y = CONSTANTS.GAME_HEIGHT + margin;
        if (this.y > CONSTANTS.GAME_HEIGHT + margin) this.y = -margin;

        if (this.lastDamageTime > 0) {
            this.lastDamageTime -= deltaTime;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        // Efeito de dano
        if (this.lastDamageTime > 0) {
            ctx.fillStyle = '#FFFFFF';
            ctx.strokeStyle = '#FFFFFF';
        } else {
            const colors = { large: '#8B4513', medium: '#A0522D', small: '#CD853F' };
            ctx.fillStyle = colors[this.size];
            ctx.strokeStyle = '#654321';
        }

        ctx.lineWidth = 2;
        ctx.beginPath();

        for (let i = 0; i < this.vertices.length; i++) {
            const vertex = this.vertices[i];
            if (i === 0) {
                ctx.moveTo(vertex.x, vertex.y);
            } else {
                ctx.lineTo(vertex.x, vertex.y);
            }
        }

        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Detalhes internos
        ctx.strokeStyle = 'rgba(101, 67, 33, 0.4)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 2; i++) {
            const startVertex = this.vertices[Math.floor(Math.random() * this.vertices.length)];
            const endVertex = this.vertices[Math.floor(Math.random() * this.vertices.length)];
            ctx.beginPath();
            ctx.moveTo(startVertex.x * 0.4, startVertex.y * 0.4);
            ctx.lineTo(endVertex.x * 0.4, endVertex.y * 0.4);
            ctx.stroke();
        }

        ctx.restore();
    }

    takeDamage(damage) {
        this.health -= damage;
        this.lastDamageTime = 0.12;
        return this.health <= 0;
    }

    fragment() {
        if (this.size === 'small') return [];

        const newSize = this.size === 'large' ? 'medium' : 'small';
        const fragments = [];
        const fragmentCount = 2 + Math.floor(Math.random() * 2);

        for (let i = 0; i < fragmentCount; i++) {
            const angle = (i / fragmentCount) * Math.PI * 2 + Math.random() * 0.4;
            const speed = CONSTANTS.ASTEROID_SPEEDS[newSize] * (0.8 + Math.random() * 0.4);

            const fragment = new Asteroid(
                this.x + Math.cos(angle) * 10,
                this.y + Math.sin(angle) * 10,
                newSize,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed
            );

            fragments.push(fragment);
        }

        return fragments;
    }
}

// === SISTEMA DE INIMIGOS ===
class EnemySystem {
    constructor() {
        this.asteroids = [];
        this.spawnTimer = 0;
        this.spawnDelay = 1.0;

        // Registrar no ServiceLocator
        if (typeof gameServices !== 'undefined') {
            gameServices.register('enemies', this);
        }

        console.log('[EnemySystem] Initialized');
    }

    // === UPDATE PRINCIPAL ===
    update(deltaTime, waveState) { // waveState é recebido aqui
        this.updateAsteroids(deltaTime);
        this.handleSpawning(deltaTime, waveState); // E passado para a função de spawn
        this.cleanupDestroyed();
    }

    // === GERENCIAMENTO DE ASTEROIDES ===
    updateAsteroids(deltaTime) {
        this.asteroids.forEach(asteroid => {
            if (!asteroid.destroyed) {
                asteroid.update(deltaTime);
            }
        });

        // Física de colisão entre asteroides
        this.handleAsteroidCollisions();
    }

    handleAsteroidCollisions() {
        for (let i = 0; i < this.asteroids.length - 1; i++) {
            const a1 = this.asteroids[i];
            if (a1.destroyed) continue;

            for (let j = i + 1; j < this.asteroids.length; j++) {
                const a2 = this.asteroids[j];
                if (a2.destroyed) continue;

                this.checkAsteroidCollision(a1, a2);
            }
        }
    }

    checkAsteroidCollision(a1, a2) {
        const dx = a2.x - a1.x;
        const dy = a2.y - a1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = a1.radius + a2.radius;

        if (distance < minDistance && distance > 0) {
            const nx = dx / distance;
            const ny = dy / distance;

            // Correção de penetração
            const overlap = minDistance - distance;
            const percent = 0.5;
            a1.x -= nx * overlap * percent;
            a1.y -= ny * overlap * percent;
            a2.x += nx * overlap * percent;
            a2.y += ny * overlap * percent;

            // Impulso elástico com massa
            const rvx = a2.vx - a1.vx;
            const rvy = a2.vy - a1.vy;
            const velAlongNormal = rvx * nx + rvy * ny;

            if (velAlongNormal < 0) {
                const e = CONSTANTS.COLLISION_BOUNCE;
                const invMass1 = 1 / a1.mass;
                const invMass2 = 1 / a2.mass;
                const j = -(1 + e) * velAlongNormal / (invMass1 + invMass2);

                const jx = j * nx;
                const jy = j * ny;

                a1.vx -= jx * invMass1;
                a1.vy -= jy * invMass1;
                a2.vx += jx * invMass2;
                a2.vy += jy * invMass2;
            }

            // Rotação adicional
            a1.rotationSpeed += (Math.random() - 0.5) * 1.5;
            a2.rotationSpeed += (Math.random() - 0.5) * 1.5;
        }
    }

    // === SISTEMA DE SPAWNING ===
    handleSpawning(deltaTime, waveState) {
        // Controle de spawn baseado no WaveSystem
        // Por enquanto, spawn simples para manter jogo funcionando

        this.spawnTimer -= deltaTime;

        if (this.shouldSpawn(waveState) && this.spawnTimer <= 0) {
            this.spawnAsteroid();
            if (waveState && waveState.isActive && typeof waveState.asteroidsSpawned === 'number') {
                waveState.asteroidsSpawned += 1;
            }
            this.spawnTimer = this.spawnDelay * (0.5 + Math.random() * 0.5);
        }
    }

    shouldSpawn(waveState) {
        // Verificar se deve spawnar (baseado em wave system)
        if (!waveState) return false; // Guarda de segurança para evitar erros

        const currentWave = waveState; // waveState é passado pelo update()

        return currentWave.isActive &&
               currentWave.asteroidsSpawned < currentWave.totalAsteroids &&
               this.asteroids.filter(a => !a.destroyed).length < CONSTANTS.MAX_ASTEROIDS_ON_SCREEN;
    }

    spawnAsteroid() {
        const side = Math.floor(Math.random() * 4);
        let x, y;
        const margin = 80;

        switch(side) {
            case 0: // Top
                x = Math.random() * CONSTANTS.GAME_WIDTH;
                y = -margin;
                break;
            case 1: // Right
                x = CONSTANTS.GAME_WIDTH + margin;
                y = Math.random() * CONSTANTS.GAME_HEIGHT;
                break;
            case 2: // Bottom
                x = Math.random() * CONSTANTS.GAME_WIDTH;
                y = CONSTANTS.GAME_HEIGHT + margin;
                break;
            case 3: // Left
                x = -margin;
                y = Math.random() * CONSTANTS.GAME_HEIGHT;
                break;
        }

        // Distribuição de tamanhos
        let size;
        const rand = Math.random();
        if (rand < 0.5) size = 'large';
        else if (rand < 0.8) size = 'medium';
        else size = 'small';

        const asteroid = new Asteroid(x, y, size);
        this.asteroids.push(asteroid);

        // Emitir evento
        if (typeof gameEvents !== 'undefined') {
            gameEvents.emit('enemy-spawned', {
                enemy: asteroid,
                type: 'asteroid',
                size: size,
                position: { x, y }
            });
        }

        return asteroid;
    }

    // === GERENCIAMENTO DE DESTRUIÇÃO ===
    destroyAsteroid(asteroid, createFragments = true) {
        if (asteroid.destroyed) return [];

        asteroid.destroyed = true;
        const fragments = createFragments ? asteroid.fragment() : [];

        // Adicionar fragmentos
        if (fragments.length > 0) {
            this.asteroids.push(...fragments);
        }

        // Emitir eventos
        if (typeof gameEvents !== 'undefined') {
            gameEvents.emit('enemy-destroyed', {
                enemy: asteroid,
                fragments: fragments,
                position: { x: asteroid.x, y: asteroid.y },
                size: asteroid.size
            });
        }

        return fragments;
    }

    cleanupDestroyed() {
        const countBefore = this.asteroids.length;
        this.asteroids = this.asteroids.filter(asteroid => !asteroid.destroyed);

        if (this.asteroids.length !== countBefore) {
            // Debug
            // console.log(`[EnemySystem] Cleaned up ${countBefore - this.asteroids.length} asteroids`);
        }
    }

    // === GETTERS PÚBLICOS ===
    getAsteroids() {
        return this.asteroids.filter(asteroid => !asteroid.destroyed);
    }

    getAllAsteroids() {
        return [...this.asteroids];
    }

    getAsteroidCount() {
        return this.asteroids.filter(asteroid => !asteroid.destroyed).length;
    }

    // === INTERFACE PARA OUTROS SISTEMAS ===
    spawnInitialAsteroids(count = 4) {
        for (let i = 0; i < count; i++) {
            this.spawnAsteroid();
        }
        console.log(`[EnemySystem] Spawned ${count} initial asteroids`);
    }

    // === RESET E CLEANUP ===
    reset() {
        this.asteroids = [];
        this.spawnTimer = 0;
        console.log('[EnemySystem] Reset');
    }

    destroy() {
        this.asteroids = [];
        console.log('[EnemySystem] Destroyed');
    }
}

export { EnemySystem, Asteroid };