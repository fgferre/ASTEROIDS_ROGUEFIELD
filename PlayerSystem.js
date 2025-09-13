// src/modules/PlayerSystem.js
import * as CONSTANTS from '../core/GameConstants.js';

class PlayerSystem {
    constructor(x = CONSTANTS.GAME_WIDTH / 2, y = CONSTANTS.GAME_HEIGHT / 2) {
        // === APENAS MOVIMENTO E POSIÇÃO ===
        this.position = { x, y };
        this.velocity = { vx: 0, vy: 0 };
        this.angle = 0;
        this.targetAngle = 0; // Para rotação suave (futuro)
        this.angularVelocity = 0;

        // === CONFIGURAÇÕES DE MOVIMENTO ===
        // Usar constantes do arquivo separado
        this.maxSpeed = CONSTANTS.SHIP_MAX_SPEED;
        this.acceleration = CONSTANTS.SHIP_ACCELERATION;
        this.rotationSpeed = CONSTANTS.SHIP_ROTATION_SPEED;
        this.linearDamping = CONSTANTS.SHIP_LINEAR_DAMPING;
        this.angularDamping = CONSTANTS.SHIP_ANGULAR_DAMPING;

        // Registrar no ServiceLocator
        if (typeof gameServices !== 'undefined') {
            gameServices.register('player', this);
        }

        console.log('[PlayerSystem] Initialized at', this.position);
    }

    // === MÉTODO PRINCIPAL UPDATE ===
    update(deltaTime) {
        const inputSystem = gameServices.get('input');
        if (!inputSystem) {
            console.warn('[PlayerSystem] InputSystem not found');
            return;
        }

        const movement = inputSystem.getMovementInput();
        this.updateMovement(deltaTime, movement);
        this.updatePosition(deltaTime);

        // Emitir evento para outros sistemas
        if (typeof gameEvents !== 'undefined') {
            gameEvents.emit('player-moved', {
                position: { ...this.position },
                velocity: { ...this.velocity },
                angle: this.angle
            });
        }
    }

    // === LÓGICA DE MOVIMENTO (COPIADA DO ORIGINAL) ===
    updateMovement(deltaTime, input) {
        // COPIAR EXATAMENTE da função updatePlayerMovement() original
        const accelStep = this.acceleration * deltaTime;
        const fwd = {
            x: Math.cos(this.angle),
            y: Math.sin(this.angle)
        };

        // Thruster intensities (lógica do original)
        let thrMain = input.up ? 1 : 0;
        let thrAux = input.down ? 1 : 0;
        let thrSideR = input.left ? 1 : 0; // CCW torque
        let thrSideL = input.right ? 1 : 0; // CW torque

        // Auto-brake quando não há input linear
        const noLinearInput = !input.up && !input.down;
        const speed = Math.hypot(this.velocity.vx, this.velocity.vy);

        if (noLinearInput && speed > 2) {
            const proj = this.velocity.vx * fwd.x + this.velocity.vy * fwd.y;
            const k = Math.max(0.35, Math.min(1, Math.abs(proj) / (this.maxSpeed * 0.8)));
            if (proj > 0) thrAux = Math.max(thrAux, k);
            else if (proj < 0) thrMain = Math.max(thrMain, k);
        }

        // Aplicar forças dos thrusters
        if (thrMain > 0) {
            this.velocity.vx += fwd.x * accelStep * thrMain;
            this.velocity.vy += fwd.y * accelStep * thrMain;
        }
        if (thrAux > 0) {
            this.velocity.vx -= fwd.x * accelStep * thrAux;
            this.velocity.vy -= fwd.y * accelStep * thrAux;
        }

        // Amortecimento ambiente
        const linearDamp = Math.exp(-this.linearDamping * deltaTime);
        this.velocity.vx *= linearDamp;
        this.velocity.vy *= linearDamp;

        // Limitar velocidade máxima
        const currentSpeed = Math.hypot(this.velocity.vx, this.velocity.vy);
        if (currentSpeed > this.maxSpeed) {
            const scale = this.maxSpeed / currentSpeed;
            this.velocity.vx *= scale;
            this.velocity.vy *= scale;
        }

        // === MOVIMENTO ANGULAR ===
        const inputTorque = (thrSideR ? -1 : 0) + (thrSideL ? 1 : 0);
        const ANGULAR_THRUST = this.rotationSpeed * 5.0; // rad/s^2
        const angAccel = inputTorque * ANGULAR_THRUST - this.angularDamping * this.angularVelocity;

        this.angularVelocity += angAccel * deltaTime;

        // Limitar velocidade angular
        const maxAng = this.rotationSpeed;
        if (this.angularVelocity > maxAng) this.angularVelocity = maxAng;
        if (this.angularVelocity < -maxAng) this.angularVelocity = -maxAng;

        this.angle = this.wrapAngle(this.angle + this.angularVelocity * deltaTime);

        // === EFEITOS DE THRUSTER ===
        // Emitir eventos para EffectsSystem
        if (thrMain > 0) {
            const thrusterPos = this.getLocalToWorld(-CONSTANTS.SHIP_SIZE * 0.8, 0);
            gameEvents.emit('thruster-effect', {
                position: thrusterPos,
                direction: { x: fwd.x, y: fwd.y },
                intensity: thrMain,
                type: 'main'
            });
        }

        if (thrAux > 0) {
            const thrusterPos = this.getLocalToWorld(CONSTANTS.SHIP_SIZE * 0.8, 0);
            gameEvents.emit('thruster-effect', {
                position: thrusterPos,
                direction: { x: -fwd.x, y: -fwd.y },
                intensity: thrAux,
                type: 'aux'
            });
        }

        // Side thrusters
        if (thrSideL > 0) {
            const thrusterPos = this.getLocalToWorld(0, -CONSTANTS.SHIP_SIZE * 0.52);
            const dir = this.getLocalDirection(0, 1);
            gameEvents.emit('thruster-effect', {
                position: thrusterPos,
                direction: dir,
                intensity: thrSideL,
                type: 'side'
            });
        }

        if (thrSideR > 0) {
            const thrusterPos = this.getLocalToWorld(0, CONSTANTS.SHIP_SIZE * 0.52);
            const dir = this.getLocalDirection(0, -1);
            gameEvents.emit('thruster-effect', {
                position: thrusterPos,
                direction: dir,
                intensity: thrSideR,
                type: 'side'
            });
        }
    }

    updatePosition(deltaTime) {
        // Integrar posição
        this.position.x += this.velocity.vx * deltaTime;
        this.position.y += this.velocity.vy * deltaTime;

        // Screen wrapping
        if (this.position.x < 0) this.position.x = CONSTANTS.GAME_WIDTH;
        if (this.position.x > CONSTANTS.GAME_WIDTH) this.position.x = 0;
        if (this.position.y < 0) this.position.y = CONSTANTS.GAME_HEIGHT;
        if (this.position.y > CONSTANTS.GAME_HEIGHT) this.position.y = 0;
    }

    // === UTILITÁRIOS ===
    wrapAngle(angle) {
        while (angle > Math.PI) angle -= Math.PI * 2;
        while (angle < -Math.PI) angle += Math.PI * 2;
        return angle;
    }

    // Transform local ship coordinates to world
    getLocalToWorld(localX, localY) {
        const cos = Math.cos(this.angle);
        const sin = Math.sin(this.angle);
        return {
            x: this.position.x + (localX * cos - localY * sin),
            y: this.position.y + (localX * sin + localY * cos)
        };
    }

    // Transform local direction to world
    getLocalDirection(dx, dy) {
        const cos = Math.cos(this.angle);
        const sin = Math.sin(this.angle);
        return {
            x: (dx * cos - dy * sin),
            y: (dx * sin + dy * cos)
        };
    }

    // === GETTERS PÚBLICOS ===
    getPosition() {
        return { ...this.position };
    }

    getAngle() {
        return this.angle;
    }

    getVelocity() {
        return { ...this.velocity };
    }

    // === SETTERS (para reset, teleport, etc.) ===
    setPosition(x, y) {
        this.position.x = x;
        this.position.y = y;
    }

    setAngle(angle) {
        this.angle = this.wrapAngle(angle);
    }

    reset() {
        this.position = { x: CONSTANTS.GAME_WIDTH / 2, y: CONSTANTS.GAME_HEIGHT / 2 };
        this.velocity = { vx: 0, vy: 0 };
        this.angle = 0;
        this.angularVelocity = 0;
    }

    destroy() {
        console.log('[PlayerSystem] Destroyed');
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlayerSystem;
}

if (typeof window !== 'undefined') {
    window.PlayerSystem = PlayerSystem;
}