# Guia Completo de Refatoração Modular - Prompts Passo a Passo

**IMPORTANTE:** Este documento contém TODOS os prompts necessários para transformar seu jogo monolítico em uma arquitetura modular profissional. Execute na ordem exata apresentada.

***

## 📋 **FASE 0: PREPARAÇÃO INICIAL**

### **Prompt 0.1: Backup Seguro**

```
CONTEXTO: Tenho um jogo Asteroids funcionando perfeitamente em JavaScript vanilla com 1500+ linhas no app.js.
OBJETIVO: Criar backup seguro e estrutura de projeto para refatoração modular.

AÇÕES OBRIGATÓRIAS:
1. Copie app.js para src/legacy/app-original.js (criar pasta se não existir)
2. Crie estrutura de pastas:
```

projeto/
├── src/
│   ├── core/
│   ├── modules/
│   ├── utils/
│   └── legacy/
├── docs/
│   ├── prompts/
│   └── validation/
└── assets/

```

3. Crie arquivo docs/validation/test-checklist.md:
```


# Checklist de Testes do Jogo

## Funcionalidades Básicas

- [ ] Jogo carrega sem erros no console
- [ ] Player move com WASD
- [ ] Player rotaciona com A/D
- [ ] Tiro automático funciona
- [ ] Asteroides aparecem na tela
- [ ] Colisões funcionam (bullets vs asteroids)
- [ ] XP orbs aparecem quando asteroide morre
- [ ] Level up funciona
- [ ] Upgrades funcionam
- [ ] Audio funciona
- [ ] Ondas progridem corretamente
- [ ] Game over funciona


## Performance

- [ ] 60 FPS estável
- [ ] Sem memory leaks
- [ ] Partículas não acumulam infinitamente

```

4. Crie arquivo docs/prompts/completed-prompts.md para tracking

VALIDAÇÃO CRÍTICA:
- Backup criado com sucesso
- Estrutura de pastas criada
- Jogo original ainda funciona 100%
- Console limpo sem erros

Me confirme que TUDO foi criado e o jogo ainda funciona perfeitamente.
```


### **Prompt 0.2: Criar EventBus**

```
CONTEXTO: Preciso de sistema de eventos para desacoplar módulos.
OBJETIVO: Criar src/core/EventBus.js funcional e robusto.

CÓDIGO EXATO A CRIAR (copie exatamente):

// src/core/EventBus.js
class EventBus {
    constructor() {
        this.events = new Map();
        this.debug = true; // Para debug durante desenvolvimento
        console.log('[EventBus] Initialized');
    }
    
    // Registrar listener para evento
    on(eventName, callback, context = null) {
        if (typeof eventName !== 'string') {
            console.error('[EventBus] Event name must be string:', eventName);
            return;
        }
        
        if (typeof callback !== 'function') {
            console.error('[EventBus] Callback must be function:', callback);
            return;
        }
        
        if (!this.events.has(eventName)) {
            this.events.set(eventName, []);
        }
        
        this.events.get(eventName).push({ callback, context });
        
        if (this.debug) {
            console.log(`[EventBus] Registered listener for: ${eventName}`);
        }
    }
    
    // Disparar evento
    emit(eventName, data = null) {
        if (this.debug) {
            console.log(`[EventBus] Emitting: ${eventName}`, data);
        }
        
        if (this.events.has(eventName)) {
            const listeners = this.events.get(eventName);
            listeners.forEach(({ callback, context }) => {
                try {
                    if (context) {
                        callback.call(context, data);
                    } else {
                        callback(data);
                    }
                } catch (error) {
                    console.error(`[EventBus] Error in listener for ${eventName}:`, error);
                }
            });
        }
    }
    
    // Remover listener específico
    off(eventName, callback) {
        if (this.events.has(eventName)) {
            const listeners = this.events.get(eventName);
            const index = listeners.findIndex(listener => listener.callback === callback);
            if (index > -1) {
                listeners.splice(index, 1);
                if (this.debug) {
                    console.log(`[EventBus] Removed listener for: ${eventName}`);
                }
            }
        }
    }
    
    // Remover todos os listeners de um evento
    clear(eventName) {
        if (this.events.has(eventName)) {
            this.events.delete(eventName);
            if (this.debug) {
                console.log(`[EventBus] Cleared all listeners for: ${eventName}`);
            }
        }
    }
    
    // Debug: listar todos os eventos
    listEvents() {
        const eventNames = Array.from(this.events.keys());
        console.log('[EventBus] Registered events:', eventNames);
        eventNames.forEach(name => {
            console.log(`  ${name}: ${this.events.get(name).length} listeners`);
        });
    }
    
    // Limpar tudo
    destroy() {
        this.events.clear();
        console.log('[EventBus] Destroyed');
    }
}

// Singleton global
const gameEvents = new EventBus();

// Para compatibilidade de módulos ES6 e CommonJS
if (typeof module !== 'undefined' && module.exports) {
    module.exports = gameEvents;
}

// Para ES6 modules
if (typeof window !== 'undefined') {
    window.gameEvents = gameEvents;
}

VALIDAÇÃO OBRIGATÓRIA:
1. Arquivo criado em src/core/EventBus.js
2. Código colado exatamente como especificado  
3. Abrir index.html no navegador
4. Console deve mostrar: "[EventBus] Initialized"
5. No Developer Tools, digite: gameEvents.listEvents()
6. Deve funcionar sem erro

Se algo der erro, me informe IMEDIATAMENTE o erro exato.
```


### **Prompt 0.3: Criar ServiceLocator**

```
CONTEXTO: Preciso gerenciar dependências entre módulos.
OBJETIVO: Criar src/core/ServiceLocator.js para registro de serviços.

CÓDIGO EXATO A CRIAR:

// src/core/ServiceLocator.js
class ServiceLocator {
    constructor() {
        this.services = new Map();
        this.debug = true;
        console.log('[ServiceLocator] Initialized');
    }
    
    // Registrar serviço
    register(name, service) {
        if (typeof name !== 'string') {
            console.error('[ServiceLocator] Service name must be string:', name);
            return false;
        }
        
        if (!service) {
            console.error('[ServiceLocator] Service cannot be null/undefined');
            return false;
        }
        
        if (this.services.has(name)) {
            console.warn(`[ServiceLocator] Service '${name}' already exists. Overwriting.`);
        }
        
        this.services.set(name, service);
        
        if (this.debug) {
            console.log(`[ServiceLocator] Registered service: ${name}`);
        }
        
        return true;
    }
    
    // Obter serviço
    get(name) {
        const service = this.services.get(name);
        if (!service) {
            console.error(`[ServiceLocator] Service not found: ${name}`);
            console.log('Available services:', Array.from(this.services.keys()));
            return null;
        }
        return service;
    }
    
    // Verificar se serviço existe
    has(name) {
        return this.services.has(name);
    }
    
    // Remover serviço
    unregister(name) {
        const existed = this.services.delete(name);
        if (existed && this.debug) {
            console.log(`[ServiceLocator] Unregistered service: ${name}`);
        }
        return existed;
    }
    
    // Debug: listar serviços
    listServices() {
        const serviceNames = Array.from(this.services.keys());
        console.log('[ServiceLocator] Registered services:', serviceNames);
        return serviceNames;
    }
    
    // Limpar todos os serviços
    clear() {
        this.services.clear();
        if (this.debug) {
            console.log('[ServiceLocator] Cleared all services');
        }
    }
}

// Singleton global
const gameServices = new ServiceLocator();

// Compatibilidade
if (typeof module !== 'undefined' && module.exports) {
    module.exports = gameServices;
}

if (typeof window !== 'undefined') {
    window.gameServices = gameServices;
}

VALIDAÇÃO OBRIGATÓRIA:
1. Arquivo criado em src/core/ServiceLocator.js
2. Recarregar página
3. Console deve mostrar: "[ServiceLocator] Initialized"
4. No Developer Tools, testar: gameServices.listServices()
5. Deve retornar array vazio [] sem erros

Confirme que funciona antes de continuar.
```


### **Prompt 0.4: Arquivo de Constantes**

```
CONTEXTO: Preciso centralizar todas as constantes do jogo.
OBJETIVO: Mover constantes do app.js para arquivo separado.

AÇÕES:
1. Criar arquivo src/core/GameConstants.js
2. MOVER (não copiar) todas as constantes do início do app.js para este arquivo
3. Estruturar em categorias organizadas

CÓDIGO DO ARQUIVO src/core/GameConstants.js:

// src/core/GameConstants.js

// === DIMENSÕES DO JOGO ===
export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 600;
export const SHIP_SIZE = 15;

// === TAMANHOS DE OBJETOS ===
export const ASTEROID_SIZES = {
    large: 35,
    medium: 22,
    small: 12
};

export const BULLET_SIZE = 3;
export const XP_ORB_SIZE = 8;
export const TRAIL_LENGTH = 6;

// === FÍSICA DA NAVE ===
export const SHIP_ACCELERATION = 280;
export const SHIP_MAX_SPEED = 220;
export const SHIP_LINEAR_DAMPING = 3.9; // s^-1
export const SHIP_ROTATION_SPEED = 8; // rad/s
export const SHIP_ANGULAR_DAMPING = 8.0; // s^-1
export const SHIP_MASS = 60;

// === VELOCIDADES ===
export const ASTEROID_SPEEDS = {
    large: 25,
    medium: 45,
    small: 70
};

export const BULLET_SPEED = 450;
export const COLLISION_BOUNCE = 0.6;

// === MAGNETISMO ===
export const MAGNETISM_RADIUS = 70;
export const MAGNETISM_FORCE = 120;

// === SISTEMA DE ONDAS ===
export const TARGET_UPDATE_INTERVAL = 0.15;
export const ASTEROIDS_PER_WAVE_BASE = 4;
export const ASTEROIDS_PER_WAVE_MULTIPLIER = 1.3;
export const WAVE_DURATION = 60; // segundos
export const WAVE_BREAK_TIME = 10; // segundos  
export const MAX_ASTEROIDS_ON_SCREEN = 20;

// === UPGRADES ===
export const SPACE_UPGRADES = [
    { id: 'plasma', name: 'Arma de Plasma', description: '+25% dano', icon: '⚡', color: '#FFD700' },
    { id: 'propulsors', name: 'Propulsores Melhorados', description: '+20% velocidade máxima', icon: '🚀', color: '#00BFFF' },
    { id: 'shield', name: 'Escudo Energético', description: '+50 HP máximo', icon: '🛡️', color: '#32CD32' },
    { id: 'armor', name: 'Blindagem Reativa', description: '+25% resistência', icon: '🔰', color: '#FF6B6B' },
    { id: 'multishot', name: 'Tiro Múltiplo', description: '+1 projétil', icon: '💥', color: '#9932CC' },
    { id: 'magfield', name: 'Campo Magnético', description: '+50% alcance magnético', icon: '🧲', color: '#FF69B4' }
];

console.log('[GameConstants] Loaded');

2. MODIFICAR o app.js:
   - REMOVER todas as linhas de const no início (do GAME_WIDTH até SPACE_UPGRADES)
   - ADICIONAR no topo do app.js (primeira linha):

// Importar constantes
import * as CONSTANTS from './src/core/GameConstants.js';

// Destructuring das constantes mais usadas para compatibilidade
const {
    GAME_WIDTH, GAME_HEIGHT, SHIP_SIZE, ASTEROID_SIZES, BULLET_SIZE, XP_ORB_SIZE,
    TRAIL_LENGTH, SHIP_ACCELERATION, SHIP_MAX_SPEED, SHIP_LINEAR_DAMPING,
    SHIP_ROTATION_SPEED, SHIP_ANGULAR_DAMPING, SHIP_MASS, ASTEROID_SPEEDS,
    BULLET_SPEED, COLLISION_BOUNCE, MAGNETISM_RADIUS, MAGNETISM_FORCE,
    TARGET_UPDATE_INTERVAL, ASTEROIDS_PER_WAVE_BASE, ASTEROIDS_PER_WAVE_MULTIPLIER,
    WAVE_DURATION, WAVE_BREAK_TIME, MAX_ASTEROIDS_ON_SCREEN, SPACE_UPGRADES
} = CONSTANTS;

VALIDAÇÃO:
1. Arquivo GameConstants.js criado com todas as constantes
2. Constantes removidas do app.js
3. Import adicionado no topo do app.js
4. Jogo carrega normalmente
5. Console mostra "[GameConstants] Loaded"
6. Todas as funcionalidades funcionam igual

TESTE ESPECÍFICO:
- Iniciar jogo
- Verificar se asteroides aparecem
- Verificar se upgrades funcionam
- Verificar se constantes são acessíveis

Confirme que TUDO funciona antes de continuar.
```


***

## 📋 **FASE 1: MÓDULOS FUNDAMENTAIS**

### **Prompt 1.1: Criar InputSystem**

```
CONTEXTO: Preciso extrair toda lógica de input do gameState para módulo separado.
OBJETIVO: Criar src/modules/InputSystem.js que gerencie todo input do jogo.

ANÁLISE DO CÓDIGO ATUAL:
No app.js você tem:
- gameState.input = {}
- Event listeners de keydown/keyup
- Lógica de input misturada com movimento

CÓDIGO EXATO A CRIAR src/modules/InputSystem.js:

// src/modules/InputSystem.js

class InputSystem {
    constructor() {
        this.keys = {}; // Estado atual das teclas
        this.mousePos = { x: 0, y: 0 };
        this.mouseButtons = {};
        this.gamepadConnected = false;
        this.gamepad = null;
        
        this.setupEventListeners();
        
        // Registrar no ServiceLocator
        if (typeof gameServices !== 'undefined') {
            gameServices.register('input', this);
        }
        
        console.log('[InputSystem] Initialized');
    }
    
    setupEventListeners() {
        // Keyboard events
        document.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            const wasPressed = this.keys[key];
            this.keys[key] = true;
            
            // Emit event apenas na primeira pressão
            if (!wasPressed && typeof gameEvents !== 'undefined') {
                gameEvents.emit('key-pressed', { key, type: 'down', event: e });
            }
        });
        
        document.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            this.keys[key] = false;
            
            if (typeof gameEvents !== 'undefined') {
                gameEvents.emit('key-pressed', { key, type: 'up', event: e });
            }
        });
        
        // Mouse events
        document.addEventListener('mousemove', (e) => {
            this.mousePos.x = e.clientX;
            this.mousePos.y = e.clientY;
        });
        
        document.addEventListener('mousedown', (e) => {
            this.mouseButtons[e.button] = true;
            if (typeof gameEvents !== 'undefined') {
                gameEvents.emit('mouse-pressed', { button: e.button, type: 'down', pos: {...this.mousePos} });
            }
        });
        
        document.addEventListener('mouseup', (e) => {
            this.mouseButtons[e.button] = false;
            if (typeof gameEvents !== 'undefined') {
                gameEvents.emit('mouse-pressed', { button: e.button, type: 'up', pos: {...this.mousePos} });
            }
        });
        
        // Gamepad support (futuro)
        window.addEventListener('gamepadconnected', (e) => {
            this.gamepadConnected = true;
            console.log('[InputSystem] Gamepad connected:', e.gamepad);
        });
        
        window.addEventListener('gamepaddisconnected', (e) => {
            this.gamepadConnected = false;
            console.log('[InputSystem] Gamepad disconnected');
        });
    }
    
    // === MÉTODOS PÚBLICOS ===
    
    // Verificar se tecla está pressionada
    isKeyDown(key) {
        return !!this.keys[key.toLowerCase()];
    }
    
    // Verificar múltiplas teclas (OR logic)
    areAnyKeysDown(keys) {
        return keys.some(key => this.isKeyDown(key));
    }
    
    // Verificar todas as teclas (AND logic)
    areAllKeysDown(keys) {
        return keys.every(key => this.isKeyDown(key));
    }
    
    // Obter input de movimento (compatível com código atual)
    getMovementInput() {
        return {
            up: this.isKeyDown('w') || this.isKeyDown('arrowup'),
            down: this.isKeyDown('s') || this.isKeyDown('arrowdown'),
            left: this.isKeyDown('a') || this.isKeyDown('arrowleft'),
            right: this.isKeyDown('d') || this.isKeyDown('arrowright')
        };
    }
    
    // Posição do mouse
    getMousePosition() {
        return { ...this.mousePos };
    }
    
    // Estado do mouse
    isMouseButtonDown(button = 0) {
        return !!this.mouseButtons[button];
    }
    
    // Debug: listar teclas pressionadas
    getActiveKeys() {
        return Object.keys(this.keys).filter(key => this.keys[key]);
    }
    
    // Update (chamado pelo game loop)
    update(deltaTime) {
        // Input system é baseado em eventos, não precisa update por frame
        // Mas mantemos interface consistente para futuras expansões
        
        // Futuro: gamepad polling aqui
        if (this.gamepadConnected) {
            this.updateGamepad();
        }
    }
    
    updateGamepad() {
        const gamepads = navigator.getGamepads();
        this.gamepad = gamepads[^0]; // Primeiro gamepad
        
        // Implementar lógica de gamepad no futuro
    }
    
    // Cleanup
    destroy() {
        // Remove event listeners se necessário
        console.log('[InputSystem] Destroyed');
    }
}

// Compatibilidade
if (typeof module !== 'undefined' && module.exports) {
    module.exports = InputSystem;
}

if (typeof window !== 'undefined') {
    window.InputSystem = InputSystem;
}

VALIDAÇÃO OBRIGATÓRIA:
1. Arquivo criado em src/modules/InputSystem.js
2. Recarregar página
3. Console deve mostrar "[InputSystem] Initialized"  
4. No Developer Tools: gameServices.get('input')
5. Deve retornar objeto InputSystem
6. Testar: gameServices.get('input').getMovementInput()
7. Pressionar WASD e verificar se retorna true/false corretamente

ATENÇÃO: Este módulo apenas MONITORA input, não afeta o jogo ainda.
O jogo deve continuar funcionando exatamente igual.

Confirme que tudo funciona antes de continuar.
```


### **Prompt 1.2: Integrar InputSystem no App.js**

```
CONTEXTO: InputSystem criado, agora integrar no jogo principal.
OBJETIVO: Modificar app.js para usar InputSystem mantendo funcionamento idêntico.

MODIFICAÇÕES NO app.js:

1. ADICIONAR imports no topo (depois das constantes):

// Imports dos módulos
import InputSystem from './src/modules/InputSystem.js';

2. MODIFICAR função init():
   Encontre a função init() e ADICIONE depois de audio.init():

// Inicializar sistemas modulares
const inputSystem = new InputSystem();

3. MANTER TEMPORARIAMENTE o sistema antigo:
   - NÃO remover gameState.input ainda
   - NÃO remover event listeners antigos ainda
   - Queremos os dois funcionando em paralelo

4. ADICIONAR teste na função updateGame():
   Adicione no início da função updateGame(), logo após a primeira linha:

// Teste InputSystem (temporário)
const input = gameServices.get('input');
if (input) {
    const movement = input.getMovementInput();
    // Log apenas se houver input (evitar spam)
    if (movement.up || movement.down || movement.left || movement.right) {
        console.log('[DEBUG] InputSystem movement:', movement);
    }
}

VALIDAÇÃO OBRIGATÓRIA:
1. Jogo carrega normalmente
2. Movimento do player funciona igual
3. Console mostra "[InputSystem] Initialized"
4. Quando pressionar WASD, deve aparecer logs de movement
5. Todas as outras funcionalidades intactas

TESTE ESPECÍFICO:
- Mover com WASD → deve funcionar E mostrar logs
- Atirar → deve funcionar
- Menu/UI → deve funcionar
- Level up → deve funcionar

Confirme que TUDO funciona e você vê os logs de movement.
```


### **Prompt 1.3: Criar PlayerSystem**

```
CONTEXTO: Preciso extrair lógica do player do gameState para módulo separado.
OBJETIVO: Criar src/modules/PlayerSystem.js APENAS com movimento e posição.

ANÁLISE: No gameState.player você tem misturado:
- Posição/movimento (EXTRAIR)
- Health/XP/Level (DEIXAR para depois)
- Combat stats (DEIXAR para depois)

CÓDIGO EXATO A CRIAR src/modules/PlayerSystem.js:

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

VALIDAÇÃO OBRIGATÓRIA:
1. Arquivo criado sem erros
2. Recarregar página
3. Console mostra "[PlayerSystem] Initialized at {x: 400, y: 300}"
4. No Developer Tools: gameServices.get('player')
5. Deve retornar objeto PlayerSystem
6. Testar: gameServices.get('player').getPosition()
7. Deve retornar posição atual

ATENÇÃO: PlayerSystem criado mas ainda não integrado ao jogo.
Jogo deve funcionar exatamente igual ainda.

Confirme que funciona.
```


### **Prompt 1.4: Integrar PlayerSystem no App.js**

```
CONTEXTO: PlayerSystem criado, agora integrar com o jogo mantendo funcionamento.
OBJETIVO: Modificar app.js para usar PlayerSystem JUNTO com código antigo.

MODIFICAÇÕES NO app.js:

1. ADICIONAR import:
   Adicione após outros imports:

import PlayerSystem from './src/modules/PlayerSystem.js';

2. MODIFICAR função init():
   Adicione DEPOIS da criação do inputSystem:

// Inicializar PlayerSystem
const playerSystem = new PlayerSystem();

3. MODIFICAR função updateGame():
   ADICIONAR no início da função updateGame(), ANTES de updatePlayerMovement():

// Atualizar sistemas modulares
const player = gameServices.get('player');
if (player) {
    player.update(deltaTime);
    
    // SINCRONIZAR com gameState antigo (temporário)
    gameState.player.x = player.position.x;
    gameState.player.y = player.position.y;
    gameState.player.vx = player.velocity.vx;
    gameState.player.vy = player.velocity.vy;
    gameState.player.angle = player.angle;
}

4. MANTER função updatePlayerMovement() temporariamente:
   - NÃO remover ainda
   - Os dois sistemas funcionam em paralelo
   - PlayerSystem sobrescreve posição depois

VALIDAÇÃO OBRIGATÓRIA:
1. Jogo carrega normalmente
2. Console mostra "[PlayerSystem] Initialized at {x: 400, y: 300}"
3. Player move com WASD normalmente
4. Player rotaciona com A/D normalmente
5. Efeitos de thruster ainda funcionam
6. Screen wrapping funciona
7. Todas outras funcionalidades intactas

TESTE ESPECÍFICO:
- Mover em todas as direções
- Rotacionar
- Verificar se auto-brake funciona (soltar teclas)
- Verificar se colisões ainda funcionam
- Verificar se tiro automático ainda funciona

Se algo quebrar, me informe o erro EXATO.

Confirme que movimento funciona perfeitamente.
```


***

## 📋 **FASE 2: MÓDULOS DE COMBATE**

### **Prompt 2.1: Criar CombatSystem**

```
CONTEXTO: Preciso extrair toda lógica de combate do app.js.
OBJETIVO: Criar src/modules/CombatSystem.js para targeting, tiro e projéteis.

ANÁLISE DO CÓDIGO ATUAL:
- updateTargeting()
- handleShooting()
- createBullet()
- updateBullets()
- gameState.world.bullets, currentTarget, etc.

CÓDIGO EXATO A CRIAR src/modules/CombatSystem.js:

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
        this.handleShooting(deltaTime);
        this.updateBullets(deltaTime);
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
        
        // Obter lista de asteroides do EnemySystem (quando existir)
        // Por enquanto, usar gameState temporariamente
        const enemies = gameState.world.asteroids || [];
        
        enemies.forEach(enemy => {
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
    handleShooting(deltaTime) {
        this.lastShotTime += deltaTime;
        
        if (!this.canShoot()) return;
        
        const player = gameServices.get('player');
        if (!player) return;
        
        const playerPos = player.getPosition();
        const targetPos = this.getPredictedTargetPosition();
        
        if (targetPos) {
            // Obter configurações do player (damage, multishot, etc.)
            const playerStats = this.getPlayerCombatStats();
            
            // Disparar múltiplos projéteis se multishot > 1
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
    
    getPlayerCombatStats() {
        // Por enquanto usar gameState, depois virá de PlayerStats module
        return {
            damage: gameState.player.damage || 25,
            multishot: gameState.player.multishot || 1
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
        const bulletCountBefore = this.bullets.length;
        this.bullets = this.bullets.filter(bullet => bullet.life > 0 && !bullet.hit);
        
        if (this.bullets.length !== bulletCountBefore) {
            // Debug
            // console.log(`[CombatSystem] Bullets: ${bulletCountBefore} -> ${this.bullets.length}`);
        }
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

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CombatSystem;
}

if (typeof window !== 'undefined') {
    window.CombatSystem = CombatSystem;
}

VALIDAÇÃO OBRIGATÓRIA:
1. Arquivo criado sem erros de sintaxe
2. Recarregar página
3. Console mostra "[CombatSystem] Initialized"
4. No Developer Tools: gameServices.get('combat')
5. Deve retornar objeto CombatSystem
6. Testar: gameServices.get('combat').getBulletCount()
7. Deve retornar 0 inicialmente

ATENÇÃO: CombatSystem criado mas ainda não integrado.
Jogo deve funcionar exatamente igual ainda.

Confirme que funciona.
```


### **Prompt 2.2: Integrar CombatSystem no App.js**

```
CONTEXTO: CombatSystem criado, agora integrar mantendo funcionamento idêntico.
OBJETIVO: Usar CombatSystem JUNTO com código antigo para comparação.

MODIFICAÇÕES NO app.js:

1. ADICIONAR import:

import CombatSystem from './src/modules/CombatSystem.js';

2. MODIFICAR função init():
   Adicione DEPOIS da criação do playerSystem:

// Inicializar CombatSystem  
const combatSystem = new CombatSystem();

3. MODIFICAR função updateGame():
   ADICIONAR DEPOIS da atualização do playerSystem:

// Atualizar CombatSystem
const combat = gameServices.get('combat');
if (combat) {
    combat.update(deltaTime);
    
    // SINCRONIZAR bullets com gameState antigo (temporário)
    gameState.world.bullets = combat.getBullets();
    gameState.world.currentTarget = combat.getCurrentTarget();
}

4. MODIFICAR função checkCollisions():
   ADICIONAR no início da função checkCollisions():

// Usar collision detection do CombatSystem
const combat = gameServices.get('combat');
if (combat) {
    combat.checkBulletCollisions(gameState.world.asteroids);
}

5. MANTER funções antigas temporariamente:
   - NÃO remover updateTargeting()
   - NÃO remover handleShooting()
   - NÃO remover updateBullets()
   - Os dois sistemas rodam em paralelo

VALIDAÇÃO OBRIGATÓRIA:
1. Jogo carrega normalmente
2. Console mostra "[CombatSystem] Initialized"
3. Tiro automático funciona IGUAL
4. Targeting funciona (nave mira em asteroide mais próximo)
5. Bullets voam e acertam asteroides
6. Asteroides tomam dano e fragmentam
7. Multishot funciona (se tiver upgrade)
8. Performance não piorou

TESTE ESPECÍFICO:
- Iniciar jogo
- Verificar se bullets aparecem automaticamente
- Verificar se bullets acertam asteroides
- Verificar se asteroides morrem/fragmentam
- Verificar se XP orbs aparecem após kill
- Testar multishot upgrade

DEBUG OPCIONAL:
No console, verificar:
- gameServices.get('combat').getBulletCount() - deve mostrar números
- gameServices.get('combat').getCurrentTarget() - deve mostrar asteroide ou null

Se algo quebrar, me informe o erro EXATO.
```


### **Prompt 2.3: Criar EnemySystem**

```
CONTEXTO: Preciso extrair lógica de asteroides/inimigos do app.js.
OBJETIVO: Criar src/modules/EnemySystem.js para gerenciar asteroides e spawning.

ANÁLISE DO CÓDIGO ATUAL:
- class Asteroid
- updateAsteroids()
- spawnAsteroid()
- updateWaveSystem()
- gameState.world.asteroids

CÓDIGO EXATO A CRIAR src/modules/EnemySystem.js:

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
    update(deltaTime) {
        this.updateAsteroids(deltaTime);
        this.handleSpawning(deltaTime);
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
    handleSpawning(deltaTime) {
        // Controle de spawn baseado no WaveSystem
        // Por enquanto, spawn simples para manter jogo funcionando
        
        this.spawnTimer -= deltaTime;
        
        if (this.shouldSpawn() && this.spawnTimer <= 0) {
            this.spawnAsteroid();
            this.spawnTimer = this.spawnDelay * (0.5 + Math.random() * 0.5);
        }
    }
    
    shouldSpawn() {
        // Verificar se deve spawnar (baseado em wave system)
        const currentWave = gameState.wave; // Temporário
        
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

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EnemySystem, Asteroid };
}

if (typeof window !== 'undefined') {
    window.EnemySystem = EnemySystem;
    window.Asteroid = Asteroid;
}

VALIDAÇÃO OBRIGATÓRIA:
1. Arquivo criado sem erros de sintaxe
2. Recarregar página
3. Console mostra "[EnemySystem] Initialized"
4. No Developer Tools: gameServices.get('enemies')
5. Deve retornar objeto EnemySystem
6. Testar: gameServices.get('enemies').getAsteroidCount()
7. Deve retornar 0 inicialmente

ATENÇÃO: EnemySystem criado mas ainda não integrado.
Jogo deve funcionar exatamente igual ainda.

Confirme que funciona.
```


### **Prompt 2.4: Integrar EnemySystem no App.js**

```
CONTEXTO: EnemySystem criado com classe Asteroid, agora integrar mantendo funcionamento.
OBJETIVO: Usar EnemySystem JUNTO com código antigo para transição suave.

MODIFICAÇÕES NO app.js:

1. ADICIONAR import:

import { EnemySystem } from './src/modules/EnemySystem.js';

2. MODIFICAR função init():
   Adicione DEPOIS da criação do combatSystem:

// Inicializar EnemySystem
const enemySystem = new EnemySystem();

3. MODIFICAR função updateGame():
   ADICIONAR DEPOIS da atualização do combatSystem:

// Atualizar EnemySystem
const enemies = gameServices.get('enemies');
if (enemies) {
    enemies.update(deltaTime);
    
    // SINCRONIZAR asteroids com gameState antigo (temporário)
    gameState.world.asteroids = enemies.getAllAsteroids();
}

4. MODIFICAR função spawnInitialAsteroids():
   SUBSTITUIR o conteúdo da função por:

function spawnInitialAsteroids() {
    const enemies = gameServices.get('enemies');
    if (enemies) {
        enemies.spawnInitialAsteroids(4);
        gameState.wave.asteroidsSpawned += 4;
    }
    gameState.wave.initialSpawnDone = true;
}

5. MODIFICAR função spawnAsteroid():
   SUBSTITUIR o conteúdo da função por:

function spawnAsteroid() {
    const enemies = gameServices.get('enemies');
    if (enemies) {
        const asteroid = enemies.spawnAsteroid();
        return asteroid;
    }
    return null;
}

6. MODIFICAR função resetWorld():
   ADICIONAR após gameState.world = {...}:

// Reset EnemySystem
const enemies = gameServices.get('enemies');
if (enemies) {
    enemies.reset();
}

7. ADICIONAR listener para enemy-destroyed:
   ADICIONAR na função init(), DEPOIS da criação dos sistemas:

// Listener para quando inimigos morrem
if (typeof gameEvents !== 'undefined') {
    gameEvents.on('enemy-destroyed', (data) => {
        // Criar XP orb
        createXPOrb(data.position.x, data.position.y, 10);
        
        // Incrementar kills
        gameState.wave.asteroidsKilled++;
        gameState.stats.totalKills++;
        
        // Tocar som de destruição
        if (typeof audio !== 'undefined') {
            audio.playAsteroidBreak(data.size);
        }
    });
}

VALIDAÇÃO OBRIGATÓRIA:
1. Jogo carrega normalmente
2. Console mostra "[EnemySystem] Initialized"
3. Asteroides aparecem no início do jogo (4 asteroides)
4. Asteroides se movem e rotacionam normalmente
5. Collision entre asteroides funciona (eles "ricocheteiam")
6. Bullets destroem asteroides
7. Asteroides fragmentam em pedaços menores
8. XP orbs aparecem quando asteroide morre
9. Som de destruição toca
10. Wave system continua funcionando

TESTE ESPECÍFICO:
- Iniciar jogo → 4 asteroides devem aparecer
- Atirar nos asteroides → devem morrer e fragmentar
- Verificar XP orbs → devem aparecer na posição da morte
- Verificar sons → deve tocar som de destruição
- Verificar wave progress → deve avançar quando asteroides morrem

DEBUG OPCIONAL:
No console:
- gameServices.get('enemies').getAsteroidCount() - deve mostrar número de asteroides vivos
- gameState.wave.asteroidsKilled - deve incrementar quando asteroides morrem

Se algo quebrar, me informe o erro EXATO.
```


***

## 📋 **FASE 3: MÓDULOS DE PROGRESSÃO**

### **Prompt 3.1: Criar ProgressionSystem**

```
CONTEXTO: Preciso extrair lógica de XP, level up e upgrades do app.js.
OBJETIVO: Criar src/modules/ProgressionSystem.js para gerenciar progressão do player.

ANÁLISE DO CÓDIGO ATUAL:
- gameState.player.xp, level, xpToNext
- collectXP(), levelUp()
- Sistema de upgrades
- XP orbs

CÓDIGO EXATO A CRIAR src/modules/ProgressionSystem.js:

// src/modules/ProgressionSystem.js
import * as CONSTANTS from '../core/GameConstants.js';

class ProgressionSystem {
    constructor() {
        // === DADOS DE PROGRESSÃO ===
        this.level = 1;
        this.experience = 0;
        this.experienceToNext = 100;
        this.totalExperience = 0;
        
        // === XP ORBS ===
        this.xpOrbs = [];
        this.orbMagnetismRadius = CONSTANTS.MAGNETISM_RADIUS;
        this.magnetismForce = CONSTANTS.MAGNETISM_FORCE;
        
        // === UPGRADES APLICADOS ===
        this.appliedUpgrades = new Map();
        this.availableUpgrades = [...CONSTANTS.SPACE_UPGRADES];
        
        // === CONFIGURAÇÕES ===
        this.levelScaling = 1.2; // Multiplicador de XP por nível
        
        // Registrar no ServiceLocator
        if (typeof gameServices !== 'undefined') {
            gameServices.register('progression', this);
        }
        
        // Escutar eventos
        this.setupEventListeners();
        
        console.log('[ProgressionSystem] Initialized - Level', this.level);
    }
    
    setupEventListeners() {
        if (typeof gameEvents !== 'undefined') {
            // Quando inimigo morre, criar XP orb
            gameEvents.on('enemy-destroyed', (data) => {
                const xpValue = this.calculateXPReward(data.enemy, data.size);
                this.createXPOrb(data.position.x, data.position.y, xpValue);
            });
            
            // Quando bullet acerta inimigo (bonus XP futuro)
            gameEvents.on('bullet-hit', (data) => {
                // Futuro: XP por hit, não só por kill
            });
        }
    }
    
    // === UPDATE PRINCIPAL ===
    update(deltaTime) {
        this.updateXPOrbs(deltaTime);
    }
    
    // === SISTEMA DE XP ORBS ===
    createXPOrb(x, y, value) {
        const orb = {
            id: Date.now() + Math.random(),
            x: x,
            y: y,
            value: value,
            collected: false,
            lifetime: 30, // 30 segundos antes de desaparecer
            age: 0
        };
        
        this.xpOrbs.push(orb);
        
        // Emitir evento para efeitos
        if (typeof gameEvents !== 'undefined') {
            gameEvents.emit('xp-orb-created', {
                orb: orb,
                position: { x, y },
                value: value
            });
        }
        
        return orb;
    }
    
    updateXPOrbs(deltaTime) {
        const player = gameServices.get('player');
        if (!player) return;
        
        const playerPos = player.getPosition();
        
        this.xpOrbs.forEach(orb => {
            if (orb.collected) return;
            
            orb.age += deltaTime;
            
            // Remover orbs antigas
            if (orb.age > orb.lifetime) {
                orb.collected = true;
                return;
            }
            
            const dx = playerPos.x - orb.x;
            const dy = playerPos.y - orb.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Magnetismo
            if (distance < this.orbMagnetismRadius && distance > 0) {
                const force = this.magnetismForce / Math.max(distance, 1);
                const normalizedDx = dx / distance;
                const normalizedDy = dy / distance;
                
                orb.x += normalizedDx * force * deltaTime;
                orb.y += normalizedDy * force * deltaTime;
            }
            
            // Coleta
            if (distance < CONSTANTS.SHIP_SIZE + CONSTANTS.XP_ORB_SIZE) {
                orb.collected = true;
                this.collectXP(orb.value);
                
                // Efeitos
                if (typeof gameEvents !== 'undefined') {
                    gameEvents.emit('xp-collected', {
                        orb: orb,
                        position: { x: orb.x, y: orb.y },
                        value: orb.value,
                        playerLevel: this.level
                    });
                }
            }
        });
        
        // Limpeza
        this.xpOrbs = this.xpOrbs.filter(orb => !orb.collected);
    }
    
    // === SISTEMA DE EXPERIÊNCIA ===
    collectXP(amount) {
        this.experience += amount;
        this.totalExperience += amount;
        
        // Verificar level up
        if (this.experience >= this.experienceToNext) {
            this.levelUp();
        }
        
        // Emitir evento para UI
        if (typeof gameEvents !== 'undefined') {
            gameEvents.emit('experience-changed', {
                current: this.experience,
                needed: this.experienceToNext,
                level: this.level,
                percentage: this.experience / this.experienceToNext
            });
        }
    }
    
    levelUp() {
        this.level++;
        this.experience = 0;
        this.experienceToNext = Math.floor(this.experienceToNext * this.levelScaling);
        
        // Emitir evento
        if (typeof gameEvents !== 'undefined') {
            gameEvents.emit('player-leveled-up', {
                newLevel: this.level,
                availableUpgrades: this.getRandomUpgrades(3)
            });
        }
        
        console.log('[ProgressionSystem] Level up! New level:', this.level);
    }
    
    calculateXPReward(enemy, size) {
        // XP baseado no tamanho e nível atual
        const baseXP = {
            'large': 15,
            'medium': 8, 
            'small': 5
        };
        
        const xp = (baseXP[size] || 5) + Math.floor(this.level * 0.5);
        return xp;
    }
    
    // === SISTEMA DE UPGRADES ===
    getRandomUpgrades(count = 3) {
        // Misturar upgrades disponíveis
        const shuffled = [...this.availableUpgrades].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    }
    
    applyUpgrade(upgradeId) {
        const upgrade = CONSTANTS.SPACE_UPGRADES.find(u => u.id === upgradeId);
        if (!upgrade) {
            console.error('[ProgressionSystem] Upgrade not found:', upgradeId);
            return false;
        }
        
        // Aplicar efeito do upgrade
        this.applyUpgradeEffect(upgrade);
        
        // Registrar upgrade aplicado
        const currentCount = this.appliedUpgrades.get(upgradeId) || 0;
        this.appliedUpgrades.set(upgradeId, currentCount + 1);
        
        // Emitir evento
        if (typeof gameEvents !== 'undefined') {
            gameEvents.emit('upgrade-applied', {
                upgrade: upgrade,
                count: currentCount + 1,
                playerId: 'player'
            });
        }
        
        console.log('[ProgressionSystem] Applied upgrade:', upgrade.name);
        return true;
    }
    
    applyUpgradeEffect(upgrade) {
        // Por enquanto, emitir eventos para outros sistemas aplicarem
        // No futuro, PlayerStats system gerenciará isso
        
        switch(upgrade.id) {
            case 'plasma':
                gameEvents.emit('upgrade-damage-boost', { multiplier: 1.25 });
                break;
                
            case 'propulsors':
                gameEvents.emit('upgrade-speed-boost', { multiplier: 1.20 });
                break;
                
            case 'shield':
                gameEvents.emit('upgrade-health-boost', { bonus: 50 });
                break;
                
            case 'armor':
                gameEvents.emit('upgrade-armor-boost', { multiplier: 1.25 });
                break;
                
            case 'multishot':
                gameEvents.emit('upgrade-multishot', { bonus: 1 });
                break;
                
            case 'magfield':
                this.orbMagnetismRadius *= 1.5;
                gameEvents.emit('upgrade-magnetism', { multiplier: 1.5 });
                break;
        }
    }
    
    // === GETTERS PÚBLICOS ===
    getLevel() {
        return this.level;
    }
    
    getExperience() {
        return {
            current: this.experience,
            needed: this.experienceToNext,
            total: this.totalExperience,
            percentage: this.experience / this.experienceToNext
        };
    }
    
    getXPOrbs() {
        return this.xpOrbs.filter(orb => !orb.collected);
    }
    
    getUpgradeCount(upgradeId) {
        return this.appliedUpgrades.get(upgradeId) || 0;
    }
    
    getAllUpgrades() {
        return new Map(this.appliedUpgrades);
    }
    
    // === CONFIGURAÇÃO ===
    setMagnetismRadius(radius) {
        this.orbMagnetismRadius = Math.max(10, radius);
    }
    
    // === RESET E SAVE ===
    reset() {
        this.level = 1;
        this.experience = 0;
        this.experienceToNext = 100;
        this.totalExperience = 0;
        this.xpOrbs = [];
        this.appliedUpgrades.clear();
        this.orbMagnetismRadius = CONSTANTS.MAGNETISM_RADIUS;
        
        console.log('[ProgressionSystem] Reset');
    }
    
    // Para salvar progresso (futuro)
    serialize() {
        return {
            level: this.level,
            experience: this.experience,
            experienceToNext: this.experienceToNext,
            totalExperience: this.totalExperience,
            appliedUpgrades: Array.from(this.appliedUpgrades.entries()),
            orbMagnetismRadius: this.orbMagnetismRadius
        };
    }
    
    deserialize(data) {
        this.level = data.level || 1;
        this.experience = data.experience || 0;
        this.experienceToNext = data.experienceToNext || 100;
        this.totalExperience = data.totalExperience || 0;
        this.appliedUpgrades = new Map(data.appliedUpgrades || []);
        this.orbMagnetismRadius = data.orbMagnetismRadius || CONSTANTS.MAGNETISM_RADIUS;
    }
    
    destroy() {
        this.xpOrbs = [];
        this.appliedUpgrades.clear();
        console.log('[ProgressionSystem] Destroyed');
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProgressionSystem;
}

if (typeof window !== 'undefined') {
    window.ProgressionSystem = ProgressionSystem;
}

VALIDAÇÃO OBRIGATÓRIA:
1. Arquivo criado sem erros de sintaxe
2. Recarregar página
3. Console mostra "[ProgressionSystem] Initialized - Level 1"
4. No Developer Tools: gameServices.get('progression')
5. Deve retornar objeto ProgressionSystem
6. Testar: gameServices.get('progression').getLevel()
7. Deve retornar 1

ATENÇÃO: ProgressionSystem criado mas ainda não integrado.
Jogo deve funcionar exatamente igual ainda.

Confirme que funciona.
```


### **Prompt 3.2: Integrar ProgressionSystem no App.js**

```
CONTEXTO: ProgressionSystem criado, agora integrar com sistema de XP/Level existente.
OBJETIVO: Usar ProgressionSystem JUNTO com código antigo para transição suave.

MODIFICAÇÕES NO app.js:

1. ADICIONAR import:

import ProgressionSystem from './src/modules/ProgressionSystem.js';

2. MODIFICAR função init():
   Adicione DEPOIS da criação do enemySystem:

// Inicializar ProgressionSystem
const progressionSystem = new ProgressionSystem();

3. MODIFICAR função updateGame():
   ADICIONAR DEPOIS da atualização do enemySystem:

// Atualizar ProgressionSystem
const progression = gameServices.get('progression');
if (progression) {
    progression.update(deltaTime);
    
    // SINCRONIZAR com gameState antigo (temporário)
    gameState.player.level = progression.getLevel();
    const expData = progression.getExperience();
    gameState.player.xp = expData.current;
    gameState.player.xpToNext = expData.needed;
    
    // Sincronizar XP orbs
    gameState.world.xpOrbs = progression.getXPOrbs();
}

4. MODIFICAR função collectXP():
   SUBSTITUIR o conteúdo da função por:

function collectXP(amount) {
    const progression = gameServices.get('progression');
    if (progression) {
        // ProgressionSystem já gerencia tudo via events
        // Função mantida para compatibilidade
        console.log('[collectXP] Redirecting to ProgressionSystem');
    }
}

5. MODIFICAR função createXPOrb():
   SUBSTITUIR o conteúdo da função por:

function createXPOrb(x, y, value) {
    const progression = gameServices.get('progression');
    if (progression) {
        return progression.createXPOrb(x, y, value);
    }
    return null;
}

6. MODIFICAR função resetPlayer():
   ADICIONAR após gameState.player = {...}:

// Reset ProgressionSystem
const progression = gameServices.get('progression');
if (progression) {
    progression.reset();
}

7. ADICIONAR listeners para upgrades:
   ADICIONAR na função init(), DEPOIS da criação dos sistemas:

// Listeners para sistema de progressão
if (typeof gameEvents !== 'undefined') {
    // Quando player sobe de nível
    gameEvents.on('player-leveled-up', (data) => {
        gameState.screen = 'levelup';
        showLevelUpScreen();
        
        // Efeitos
        if (typeof audio !== 'undefined') {
            audio.playLevelUp();
        }
        
        // Screen effects (se existirem)
        if (typeof addScreenShake !== 'undefined') {
            addScreenShake(6, 0.4, 'celebration');
        }
        if (typeof addFreezeFrame !== 'undefined') {
            addFreezeFrame(0.2, 0.4);
        }
        if (typeof addScreenFlash !== 'undefined') {
            addScreenFlash('#FFD700', 0.15, 0.2);
        }
    });
    
    // Quando XP é coletado
    gameEvents.on('xp-collected', (data) => {
        if (typeof audio !== 'undefined') {
            audio.playXPCollect();
        }
        
        // Criar efeito de coleta (futuro EffectsSystem)
        // createXPCollectEffect(data.position.x, data.position.y);
    });
    
    // Aplicar upgrades
    gameEvents.on('upgrade-damage-boost', (data) => {
        gameState.player.damage = Math.floor(gameState.player.damage * data.multiplier);
        console.log('[Upgrade] Damage boosted to:', gameState.player.damage);
    });
    
    gameEvents.on('upgrade-speed-boost', (data) => {
        gameState.player.maxSpeed = Math.floor(gameState.player.maxSpeed * data.multiplier);
        console.log('[Upgrade] Speed boosted to:', gameState.player.maxSpeed);
    });
    
    gameEvents.on('upgrade-health-boost', (data) => {
        gameState.player.maxHealth += data.bonus;
        gameState.player.health += data.bonus; // Heal também
        console.log('[Upgrade] Health boosted to:', gameState.player.maxHealth);
    });
    
    gameEvents.on('upgrade-multishot', (data) => {
        gameState.player.multishot += data.bonus;
        console.log('[Upgrade] Multishot boosted to:', gameState.player.multishot);
    });
    
    gameEvents.on('upgrade-magnetism', (data) => {
        gameState.player.magnetismRadius = Math.floor(gameState.player.magnetismRadius * data.multiplier);
        console.log('[Upgrade] Magnetism boosted to:', gameState.player.magnetismRadius);
    });
}

8. MODIFICAR função selectUpgrade():
   SUBSTITUIR o conteúdo da função por:

function selectUpgrade(upgradeId) {
    const progression = gameServices.get('progression');
    if (progression) {
        const success = progression.applyUpgrade(upgradeId);
        if (success) {
            gameState.screen = 'playing';
            showGameUI();
        }
    }
}

VALIDAÇÃO OBRIGATÓRIA:
1. Jogo carrega normalmente
2. Console mostra "[ProgressionSystem] Initialized - Level 1"
3. Asteroides ainda aparecem e podem ser mortos
4. XP orbs aparecem quando asteroides morrem
5. XP orbs são atraídas magneticamente para o player
6. Player ganha XP quando coleta orbs
7. Player sobe de nível quando ganha XP suficiente
8. Tela de level up aparece com 3 upgrades
9. Upgrades funcionam (damage, speed, multishot, etc.)
10. Todas as funcionalidades antigas intactas

TESTE ESPECÍFICO:
- Matar asteroides → XP orbs aparecem
- Coletar XP orbs → barra de XP aumenta  
- Subir de nível → tela de upgrade aparece
- Escolher upgrade → efeito é aplicado
- Verificar se upgrade funciona (ex: mais dano)

DEBUG OPCIONAL:
No console:
- gameServices.get('progression').getLevel() - nível atual
- gameServices.get('progression').getExperience() - XP atual
- gameServices.get('progression').getAllUpgrades() - upgrades aplicados

Se algo quebrar, me informe o erro EXATO.
```


***

## 📋 **FASE 4: MÓDULOS DE INTERFACE**

### **Prompt 4.1: Criar UISystem**

```
CONTEXTO: Preciso extrair lógica de UI/interface do app.js para módulo separado.
OBJETIVO: Criar src/modules/UISystem.js para gerenciar toda interface do jogo.

ANÁLISE DO CÓDIGO ATUAL:
- updateUI()
- showScreen()
- showLevelUpScreen()
- Manipulação de DOM para stats

CÓDIGO EXATO A CRIAR src/modules/UISystem.js:

// src/modules/UISystem.js

class UISystem {
    constructor() {
        // === REFERÊNCIAS DOM ===
        this.elements = {
            // Stats
            healthStat: null,
            levelStat: null,
            killsStat: null,
            timeStat: null,
            
            // XP Bar
            xpBar: null,
            xpText: null,
            
            // Wave Info
            waveTitle: null,
            waveTimer: null,
            waveProgress: null,
            waveCountdown: null,
            
            // Level Up Screen
            levelUpText: null,
            upgradesContainer: null,
            
            // Game Over Screen
            gameOverStats: null
        };
        
        this.initialized = false;
        this.lastUpdateTime = 0;
        this.updateInterval = 0.1; // Update UI 10 times per second
        
        // Cache de dados para evitar updates desnecessários
        this.cache = {
            health: -1,
            level: -1,
            kills: -1,
            time: -1,
            xp: -1,
            waveNumber: -1,
            waveTime: -1
        };
        
        // Registrar no ServiceLocator
        if (typeof gameServices !== 'undefined') {
            gameServices.register('ui', this);
        }
        
        this.initializeElements();
        this.setupEventListeners();
        
        console.log('[UISystem] Initialized');
    }
    
    initializeElements() {
        try {
            // Health stat
            this.elements.healthStat = document.querySelector('.health .stat-value') || 
                                      document.getElementById('health-value');
            
            // Level stat  
            this.elements.levelStat = document.querySelector('.level .stat-value') ||
                                     document.getElementById('level-value');
            
            // Kills stat
            this.elements.killsStat = document.querySelector('.kills .stat-value') ||
                                     document.getElementById('kills-value');
            
            // Time stat
            this.elements.timeStat = document.querySelector('.time .stat-value') ||
                                    document.getElementById('time-value');
            
            // XP Bar
            this.elements.xpBar = document.querySelector('.xp-progress') ||
                                 document.getElementById('xp-progress');
            
            this.elements.xpText = document.querySelector('.xp-text') ||
                                  document.getElementById('xp-text');
            
            // Wave Info
            this.elements.waveTitle = document.querySelector('.wave-info h3') ||
                                     document.getElementById('wave-title');
            
            this.elements.waveTimer = document.querySelector('.timer-value') ||
                                     document.getElementById('wave-timer');
            
            this.elements.waveProgress = document.querySelector('.wave-progress-bar') ||
                                        document.getElementById('wave-progress');
            
            // Level Up Screen
            this.elements.levelUpText = document.getElementById('levelup-text');
            this.elements.upgradesContainer = document.getElementById('upgrades-container');
            
            // Game Over Screen  
            this.elements.gameOverStats = document.querySelector('.stats') ||
                                         document.getElementById('gameover-stats');
            
            this.initialized = true;
            console.log('[UISystem] DOM elements initialized');
            
        } catch (error) {
            console.error('[UISystem] Error initializing elements:', error);
            this.initialized = false;
        }
    }
    
    setupEventListeners() {
        if (typeof gameEvents !== 'undefined') {
            // Escutar mudanças de dados
            gameEvents.on('experience-changed', (data) => {
                this.updateXPBar(data.percentage, data.current, data.needed);
            });
            
            gameEvents.on('player-leveled-up', (data) => {
                this.showLevelUpScreen(data.newLevel, data.availableUpgrades);
            });
            
            gameEvents.on('player-died', () => {
                this.showGameOverScreen();
            });
            
            gameEvents.on('wave-changed', (data) => {
                this.updateWaveInfo(data);
            });
        }
    }
    
    // === UPDATE PRINCIPAL ===
    update(deltaTime) {
        if (!this.initialized) return;
        
        this.lastUpdateTime += deltaTime;
        
        // Throttle UI updates
        if (this.lastUpdateTime >= this.updateInterval) {
            this.updateGameUI();
            this.lastUpdateTime = 0;
        }
    }
    
    updateGameUI() {
        // Obter dados dos sistemas
        const player = gameServices.get('player');
        const progression = gameServices.get('progression');
        
        if (!player || !progression) return;
        
        // Update stats apenas se mudaram
        this.updateHealthStat();
        this.updateLevelStat(progression.getLevel());
        this.updateKillsStat();
        this.updateTimeStat();
        this.updateWaveUI();
    }
    
    // === UPDATES ESPECÍFICOS ===
    updateHealthStat() {
        const health = gameState.player.health; // Por enquanto do gameState
        const maxHealth = gameState.player.maxHealth;
        
        if (health !== this.cache.health && this.elements.healthStat) {
            this.elements.healthStat.textContent = `${health}/${maxHealth}`;
            this.cache.health = health;
        }
    }
    
    updateLevelStat(level) {
        if (level !== this.cache.level && this.elements.levelStat) {
            this.elements.levelStat.textContent = level;
            this.cache.level = level;
        }
    }
    
    updateKillsStat() {
        const kills = gameState.stats.totalKills;
        
        if (kills !== this.cache.kills && this.elements.killsStat) {
            this.elements.killsStat.textContent = kills;
            this.cache.kills = kills;
        }
    }
    
    updateTimeStat() {
        const time = Math.floor(gameState.stats.time);
        
        if (time !== this.cache.time && this.elements.timeStat) {
            this.elements.timeStat.textContent = `${time}s`;
            this.cache.time = time;
        }
    }
    
    updateXPBar(percentage, current, needed) {
        if (this.elements.xpBar) {
            this.elements.xpBar.style.width = `${Math.min(100, percentage * 100)}%`;
        }
        
        if (this.elements.xpText) {
            this.elements.xpText.textContent = `XP: ${current}/${needed}`;
        }
    }
    
    updateWaveUI() {
        const wave = gameState.wave;
        
        if (this.elements.waveTitle && wave.current !== this.cache.waveNumber) {
            this.elements.waveTitle.textContent = `Onda ${wave.current}`;
            this.cache.waveNumber = wave.current;
        }
        
        if (this.elements.waveTimer) {
            const timeRemaining = Math.max(0, Math.floor(wave.timeRemaining));
            if (timeRemaining !== this.cache.waveTime) {
                this.elements.waveTimer.textContent = timeRemaining;
                this.cache.waveTime = timeRemaining;
            }
        }
        
        if (this.elements.waveProgress && wave.totalAsteroids > 0) {
            const progress = (wave.asteroidsKilled / wave.totalAsteroids) * 100;
            this.elements.waveProgress.style.width = `${Math.min(100, progress)}%`;
        }
    }
    
    // === GERENCIAMENTO DE TELAS ===
    showScreen(screenName) {
        try {
            console.log('[UISystem] Showing screen:', screenName);
            
            // Esconder todas as telas
            document.querySelectorAll('.screen').forEach(screen => {
                screen.classList.add('hidden');
            });
            
            const gameUI = document.getElementById('game-ui');
            if (gameUI) gameUI.classList.add('hidden');
            
            // Mostrar tela específica
            if (screenName === 'playing' || screenName === 'game') {
                if (gameUI) {
                    gameUI.classList.remove('hidden');
                }
            } else {
                const screen = document.getElementById(`${screenName}-screen`);
                if (screen) {
                    screen.classList.remove('hidden');
                } else {
                    console.warn(`[UISystem] Screen not found: ${screenName}-screen`);
                }
            }
            
        } catch (error) {
            console.error('[UISystem] Error showing screen:', error);
        }
    }
    
    showGameUI() {
        this.showScreen('playing');
    }
    
    showLevelUpScreen(level, availableUpgrades) {
        this.showScreen('levelup');
        
        if (this.elements.levelUpText) {
            this.elements.levelUpText.textContent = `Level ${level} - Escolha sua tecnologia:`;
        }
        
        if (this.elements.upgradesContainer && availableUpgrades) {
            this.renderUpgradeOptions(availableUpgrades);
        }
    }
    
    renderUpgradeOptions(upgrades) {
        if (!this.elements.upgradesContainer) return;
        
        this.elements.upgradesContainer.innerHTML = '';
        
        upgrades.forEach(upgrade => {
            const button = document.createElement('button');
            button.className = 'upgrade-option';
            button.onclick = () => this.selectUpgrade(upgrade.id);
            
            button.innerHTML = `
                <div class="upgrade-icon" style="background-color: ${upgrade.color}">
                    ${upgrade.icon}
                </div>
                <div class="upgrade-info">
                    <h3>${upgrade.name}</h3>
                    <p>${upgrade.description}</p>
                </div>
            `;
            
            this.elements.upgradesContainer.appendChild(button);
        });
    }
    
    selectUpgrade(upgradeId) {
        // Emitir evento para ProgressionSystem
        if (typeof gameEvents !== 'undefined') {
            gameEvents.emit('upgrade-selected', { upgradeId: upgradeId });
        }
        
        // Voltar ao jogo
        this.showGameUI();
    }
    
    showGameOverScreen() {
        this.showScreen('gameover');
        this.updateGameOverStats();
    }
    
    updateGameOverStats() {
        if (!this.elements.gameOverStats) return;
        
        const stats = gameState.stats;
        const progression = gameServices.get('progression');
        const level = progression ? progression.getLevel() : 1;
        
        // Atualizar stats de game over
        const levelStat = this.elements.gameOverStats.querySelector('[data-stat="level"] .stat-value');
        if (levelStat) levelStat.textContent = level;
        
        const killsStat = this.elements.gameOverStats.querySelector('[data-stat="kills"] .stat-value');
        if (killsStat) killsStat.textContent = stats.totalKills;
        
        const wavesStat = this.elements.gameOverStats.querySelector('[data-stat="waves"] .stat-value');
        if (wavesStat) wavesStat.textContent = gameState.wave.completedWaves;
        
        const timeStat = this.elements.gameOverStats.querySelector('[data-stat="time"] .stat-value');
        if (timeStat) timeStat.textContent = `${Math.floor(stats.time)}s`;
    }
    
    // === UTILITÁRIOS ===
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    // === ANIMAÇÕES E EFEITOS ===
    flashElement(element, color = '#FFD700', duration = 0.3) {
        if (!element) return;
        
        element.style.transition = `background-color ${duration}s`;
        element.style.backgroundColor = color;
        
        setTimeout(() => {
            element.style.backgroundColor = '';
        }, duration * 1000);
    }
    
    pulseElement(element, duration = 0.5) {
        if (!element) return;
        
        element.style.transition = `transform ${duration}s`;
        element.style.transform = 'scale(1.1)';
        
        setTimeout(() => {
            element.style.transform = 'scale(1)';
        }, duration * 1000);
    }
    
    // === RESET E CLEANUP ===
    reset() {
        // Limpar cache
        Object.keys(this.cache).forEach(key => {
            this.cache[key] = -1;
        });
        
        console.log('[UISystem] Reset');
    }
    
    destroy() {
        this.elements = {};
        console.log('[UISystem] Destroyed');
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UISystem;
}

if (typeof window !== 'undefined') {
    window.UISystem = UISystem;
}

VALIDAÇÃO OBRIGATÓRIA:
1. Arquivo criado sem erros de sintaxe
2. Recarregar página
3. Console mostra "[UISystem] Initialized" e "[UISystem] DOM elements initialized"
4. No Developer Tools: gameServices.get('ui')
5. Deve retornar objeto UISystem
6. Interface visual não deve mudar
7. Stats devem continuar atualizando

ATENÇÃO: UISystem criado mas ainda não integrado completamente.
Interface deve funcionar exatamente igual.

Confirme que funciona.
```


### **Prompt 4.2: Integrar UISystem no App.js**

```
CONTEXTO: UISystem criado, agora integrar com sistema de UI existente.
OBJETIVO: Usar UISystem JUNTO com código antigo para transição suave.

MODIFICAÇÕES NO app.js:

1. ADICIONAR import:

import UISystem from './src/modules/UISystem.js';

2. MODIFICAR função init():
   Adicione DEPOIS da criação do progressionSystem:

// Inicializar UISystem
const uiSystem = new UISystem();

3. MODIFICAR função updateGame():
   ADICIONAR DEPOIS da atualização do progressionSystem:

// Atualizar UISystem
const ui = gameServices.get('ui');
if (ui) {
    ui.update(deltaTime);
}

4. MODIFICAR função updateUI():
   SUBSTITUIR o conteúdo da função por:

function updateUI() {
    // UISystem agora gerencia a UI via events e update()
    // Função mantida para compatibilidade
    console.log('[updateUI] Now handled by UISystem');
}

5. MODIFICAR função showScreen():
   SUBSTITUIR o conteúdo da função por:

function showScreen(screenName) {
    const ui = gameServices.get('ui');
    if (ui) {
        ui.showScreen(screenName);
    } else {
        // Fallback para código antigo
        console.warn('[showScreen] UISystem not found, using fallback');
        // Manter código antigo aqui como backup
        try {
            document.querySelectorAll('.screen').forEach(screen => {
                screen.classList.add('hidden');
            });
            
            const gameUI = document.getElementById('game-ui');
            if (gameUI) gameUI.classList.add('hidden');
            
            if (screenName === 'playing' || screenName === 'game') {
                if (gameUI) gameUI.classList.remove('hidden');
            } else {
                const screen = document.getElementById(`${screenName}-screen`);
                if (screen) screen.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Error in showScreen fallback:', error);
        }
    }
}

6. MODIFICAR função showGameUI():
   SUBSTITUIR o conteúdo da função por:

function showGameUI() {
    const ui = gameServices.get('ui');
    if (ui) {
        ui.showGameUI();
    } else {
        showScreen('playing');
    }
}

7. MODIFICAR função showLevelUpScreen():
   SUBSTITUIR o conteúdo da função por:

function showLevelUpScreen() {
    const ui = gameServices.get('ui');
    const progression = gameServices.get('progression');
    
    if (ui && progression) {
        // UISystem já escuta o evento 'player-leveled-up'
        // Esta função é chamada pelo evento, UI já está sendo mostrada
        console.log('[showLevelUpScreen] Handled by UISystem via events');
    } else {
        // Fallback para código antigo
        showScreen('levelup');
        
        // Código antigo de level up
        const levelText = document.getElementById('levelup-text');
        if (levelText) {
            levelText.textContent = `Level ${gameState.player.level} - Escolha sua tecnologia:`;
        }
        
        const shuffled = [...SPACE_UPGRADES].sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, 3);
        const container = document.getElementById('upgrades-container');
        
        if (container) {
            container.innerHTML = '';
            selected.forEach(upgrade => {
                const button = document.createElement('button');
                button.className = 'upgrade-option';
                button.onclick = () => selectUpgrade(upgrade.id);
                button.innerHTML = `
                    <div class="upgrade-icon" style="background-color: ${upgrade.color}">
                        ${upgrade.icon}
                    </div>
                    <div class="upgrade-info">
                        <h3>${upgrade.name}</h3>
                        <p>${upgrade.description}</p>
                    </div>
                `;
                container.appendChild(button);
            });
        }
    }
}

8. ADICIONAR novo listener na função init():
   ADICIONAR junto com os outros listeners de events:

// Listener para seleção de upgrade via UISystem
gameEvents.on('upgrade-selected', (data) => {
    const progression = gameServices.get('progression');
    if (progression) {
        progression.applyUpgrade(data.upgradeId);
    }
});

9. MANTER função selectUpgrade() temporariamente:
   (não modificar ainda, será removida depois)

VALIDAÇÃO OBRIGATÓRIA:
1. Jogo carrega normalmente
2. Console mostra "[UISystem] Initialized" e "[UISystem] DOM elements initialized"
3. Interface visual idêntica ao antes
4. Stats atualizando em tempo real (health, level, kills, time)
5. Barra de XP funciona normalmente
6. Wave info atualiza (onda atual, timer, progresso)
7. Level up screen aparece normalmente
8. Upgrades podem ser selecionados normalmente
9. Game over screen funciona
10. Todas as transições de tela funcionam

TESTE ESPECÍFICO:
- Verificar se stats no HUD atualizam em tempo real
- Matar asteroides → XP bar deve aumentar
- Subir de nível → tela de level up deve aparecer
- Selecionar upgrade → deve voltar ao jogo
- Morrer → game over screen deve aparecer
- Verificar se wave info atualiza (timer regressivo)

DEBUG OPCIONAL:
No console verificar se aparecem mensagens:
- "[updateUI] Now handled by UISystem"
- "[showLevelUpScreen] Handled by UISystem via events"

Se algo quebrar ou interface ficar diferente, me informe IMEDIATAMENTE.
```


***

## 📋 **FASE 5: MÓDULOS DE EFEITOS**

### **Prompt 5.1: Criar EffectsSystem**

```
CONTEXTO: Preciso extrair lógica de efeitos visuais e partículas do app.js.
OBJETIVO: Criar src/modules/EffectsSystem.js para gerenciar efeitos, partículas e screen effects.

ANÁLISE DO CÓDIGO ATUAL:
- class SpaceParticle
- updateParticles()
- spawnThrusterVFX()
- Screen shake, freeze frame, flash
- gameState.world.particles

CÓDIGO EXATO A CRIAR src/modules/EffectsSystem.js:

// src/modules/EffectsSystem.js
import * as CONSTANTS from '../core/GameConstants.js';

// === CLASSE SPACEPARTICLE (MOVIDA DO APP.JS) ===
class SpaceParticle {
    constructor(x, y, vx, vy, color, size, life, type = 'normal') {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.size = size;
        this.life = life;
        this.maxLife = life;
        this.alpha = 1;
        this.type = type;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 4;
    }
    
    update(deltaTime) {
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
        this.life -= deltaTime;
        this.alpha = Math.max(0, this.life / this.maxLife);
        this.rotation += this.rotationSpeed * deltaTime;
        
        const friction = this.type === 'thruster' ? 0.98 : 0.96;
        this.vx *= friction;
        this.vy *= friction;
        
        return this.life > 0;
    }
    
    draw(ctx) {
        if (this.alpha <= 0) return;
        
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        if (this.type === 'spark') {
            ctx.strokeStyle = this.color;
            ctx.lineWidth = this.size * this.alpha;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(-this.size, 0);
            ctx.lineTo(this.size, 0);
            ctx.stroke();
        } else if (this.type === 'debris') {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            const s = this.size * this.alpha;
            ctx.rect(-s/2, -s/2, s, s);
            ctx.fill();
        } else {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(0, 0, this.size * this.alpha, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
}

// === SISTEMA DE EFEITOS ===
class EffectsSystem {
    constructor() {
        // === PARTÍCULAS ===
        this.particles = [];
        this.maxParticles = 150;
        this.particlePool = []; // Object pooling futuro
        
        // === SCREEN EFFECTS ===
        this.screenShake = {
            intensity: 0,
            duration: 0,
            timer: 0,
            x: 0,
            y: 0
        };
        
        this.freezeFrame = {
            timer: 0,
            duration: 0,
            fade: 0
        };
        
        this.screenFlash = {
            timer: 0,
            duration: 0,
            color: '#FFFFFF',
            intensity: 0
        };
        
        // === CONFIGURAÇÕES ===
        this.particleCleanupInterval = 1.0; // Cleanup a cada 1 segundo
        this.lastCleanup = 0;
        
        // Registrar no ServiceLocator
        if (typeof gameServices !== 'undefined') {
            gameServices.register('effects', this);
        }
        
        this.setupEventListeners();
        
        console.log('[EffectsSystem] Initialized');
    }
    
    setupEventListeners() {
        if (typeof gameEvents !== 'undefined') {
            // Thruster effects
            gameEvents.on('thruster-effect', (data) => {
                this.spawnThrusterVFX(
                    data.position.x, data.position.y,
                    data.direction.x, data.direction.y,
                    data.intensity, data.type
                );
            });
            
            // Bullet impact effects
            gameEvents.on('bullet-hit', (data) => {
                this.createImpactEffect(data.position.x, data.position.y, 'bullet');
            });
            
            // Enemy destruction effects  
            gameEvents.on('enemy-destroyed', (data) => {
                this.createExplosionEffect(data.position.x, data.position.y, data.size);
            });
            
            // XP collection effects
            gameEvents.on('xp-collected', (data) => {
                this.createXPCollectEffect(data.position.x, data.position.y);
            });
            
            // Level up effects
            gameEvents.on('player-leveled-up', (data) => {
                this.createLevelUpExplosion();
                this.addScreenShake(6, 0.4, 'celebration');
                this.addFreezeFrame(0.2, 0.4);
                this.addScreenFlash('#FFD700', 0.15, 0.2);
            });
            
            // Player damage effects
            gameEvents.on('player-damaged', (data) => {
                this.addScreenShake(0.3, 0.2, 'damage');
                this.addScreenFlash('#FF0000', 0.1, 0.15);
            });
        }
    }
    
    // === UPDATE PRINCIPAL ===
    update(deltaTime) {
        this.updateParticles(deltaTime);
        this.updateScreenEffects(deltaTime);
        this.cleanupParticles(deltaTime);
    }
    
    // === SISTEMA DE PARTÍCULAS ===
    updateParticles(deltaTime) {
        this.particles = this.particles.filter(particle => particle.update(deltaTime));
        
        // Limitar número de partículas para performance
        if (this.particles.length > this.maxParticles) {
            this.particles = this.particles.slice(-Math.floor(this.maxParticles * 0.8));
        }
    }
    
    cleanupParticles(deltaTime) {
        this.lastCleanup += deltaTime;
        
        if (this.lastCleanup >= this.particleCleanupInterval) {
            const countBefore = this.particles.length;
            this.particles = this.particles.filter(p => p.life > 0);
            this.lastCleanup = 0;
            
            // Debug se houve limpeza significativa
            if (countBefore - this.particles.length > 10) {
                console.log(`[EffectsSystem] Cleaned ${countBefore - this.particles.length} particles`);
            }
        }
    }
    
    createParticle(x, y, vx, vy, color, size, life, type = 'normal') {
        const particle = new SpaceParticle(x, y, vx, vy, color, size, life, type);
        this.particles.push(particle);
        return particle;
    }
    
    // === THRUSTER EFFECTS (COPIADO DO ORIGINAL) ===
    spawnThrusterVFX(worldX, worldY, dirX, dirY, intensity = 1, type = 'main') {
        const i = Math.max(0, Math.min(1, intensity));
        let baseCount, speedBase, sizeRange, lifeRange, colorFn;
        
        switch (type) {
            case 'main':
                baseCount = 3;
                speedBase = 120;
                sizeRange = [2.0, 3.2];
                lifeRange = [0.22, 0.28];
                colorFn = () => `hsl(${18 + Math.random()*22}, 100%, ${62 + Math.random()*18}%)`;
                break;
            case 'aux':
                baseCount = 2;
                speedBase = 105;
                sizeRange = [1.8, 2.6];
                lifeRange = [0.18, 0.26];
                colorFn = () => `hsl(${200 + Math.random()*25}, 100%, ${68 + Math.random()*18}%)`;
                break;
            default: // 'side'
                baseCount = 2;
                speedBase = 110;
                sizeRange = [1.6, 2.2];
                lifeRange = [0.16, 0.22];
                colorFn = () => `hsl(${200 + Math.random()*25}, 100%, ${70 + Math.random()*18}%)`;
        }
        
        const count = Math.max(1, Math.round(baseCount * (0.8 + i * 2.0)));
        
        for (let c = 0; c < count; c++) {
            const jitter = (Math.random() - 0.5) * 0.35;
            const spd = speedBase * (0.8 + i * 1.6) * (0.85 + Math.random() * 0.3);
            const vx = (-dirX + jitter) * spd + (Math.random() - 0.5) * 20;
            const vy = (-dirY + jitter) * spd + (Math.random() - 0.5) * 20;
            const size = sizeRange[^0] + Math.random() * (sizeRange[^1] - sizeRange[^0]);
            const life = lifeRange[^0] + Math.random() * (lifeRange[^1] - lifeRange[^0]);
            
            this.createParticle(
                worldX + (Math.random() - 0.5) * 3,
                worldY + (Math.random() - 0.5) * 3,
                vx, vy, colorFn(), size, life, 'thruster'
            );
            
            // Spark particles ocasionais
            if (Math.random() < 0.25) {
                const sparkSpd = spd * (0.9 + Math.random() * 0.3);
                this.createParticle(
                    worldX, worldY,
                    (-dirX) * sparkSpd, (-dirY) * sparkSpd,
                    '#FFFFFF', 1.2 + Math.random() * 0.8,
                    0.08 + Math.random() * 0.06, 'spark'
                );
            }
        }
    }
    
    // === EFEITOS DE IMPACTO ===
    createImpactEffect(x, y, type = 'bullet') {
        const particleCount = type === 'bullet' ? 5 : 10;
        
        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.5;
            const speed = 50 + Math.random() * 30;
            
            this.createParticle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                `hsl(${30 + Math.random() * 40}, 100%, ${60 + Math.random() * 30}%)`,
                1 + Math.random() * 2,
                0.3 + Math.random() * 0.2,
                'spark'
            );
        }
    }
    
    createExplosionEffect(x, y, size = 'medium') {
        const particleCount = size === 'large' ? 20 : size === 'medium' ? 15 : 10;
        const baseSpeed = size === 'large' ? 80 : size === 'medium' ? 60 : 40;
        
        // Debris particles
        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = baseSpeed + Math.random() * 40;
            
            this.createParticle(
                x + (Math.random() - 0.5) * 10,
                y + (Math.random() - 0.5) * 10,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                `hsl(${20 + Math.random() * 40}, 80%, ${40 + Math.random() * 40}%)`,
                2 + Math.random() * 3,
                0.5 + Math.random() * 0.5,
                'debris'
            );
        }
        
        // Spark ring
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 * i) / 8;
            const speed = baseSpeed * 1.5;
            
            this.createParticle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                '#FFFFFF',
                1.5,
                0.2,
                'spark'
            );
        }
    }
    
    createXPCollectEffect(x, y) {
        // Efeito de coleta de XP - partículas douradas
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI * 2 * i) / 6;
            const speed = 30 + Math.random() * 20;
            
            this.createParticle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                `hsl(${45 + Math.random() * 15}, 100%, ${70 + Math.random() * 20}%)`,
                2 + Math.random(),
                0.6 + Math.random() * 0.3,
                'normal'
            );
        }
    }
    
    createLevelUpExplosion() {
        const player = gameServices.get('player');
        if (!player) return;
        
        const pos = player.getPosition();
        
        // Explosão de partículas douradas
        for (let i = 0; i < 30; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 100 + Math.random() * 100;
            
            this.createParticle(
                pos.x, pos.y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                `hsl(${40 + Math.random() * 20}, 100%, ${80 + Math.random() * 20}%)`,
                3 + Math.random() * 2,
                1.0 + Math.random() * 0.5,
                'normal'
            );
        }
    }
    
    // === SCREEN EFFECTS ===
    updateScreenEffects(deltaTime) {
        // Screen shake
        if (this.screenShake.timer > 0) {
            this.screenShake.timer -= deltaTime;
            if (this.screenShake.timer < 0) this.screenShake.timer = 0;
            
            const progress = this.screenShake.timer / this.screenShake.duration;
            const currentIntensity = this.screenShake.intensity * progress;
            
            this.screenShake.x = (Math.random() - 0.5) * currentIntensity * 2;
            this.screenShake.y = (Math.random() - 0.5) * currentIntensity * 2;
        } else {
            this.screenShake.x = 0;
            this.screenShake.y = 0;
        }
        
        // Freeze frame
        if (this.freezeFrame.timer > 0) {
            this.freezeFrame.timer -= deltaTime;
            if (this.freezeFrame.timer < 0) this.freezeFrame.timer = 0;
        }
        
        // Screen flash
        if (this.screenFlash.timer > 0) {
            this.screenFlash.timer -= deltaTime;
            if (this.screenFlash.timer < 0) this.screenFlash.timer = 0;
            
            const progress = this.screenFlash.timer / this.screenFlash.duration;
            this.screenFlash.intensity = progress;
        }
    }
    
    addScreenShake(intensity, duration, type = 'normal') {
        // Permitir shake cumulativo para efeitos múltiplos
        if (this.screenShake.timer > 0) {
            this.screenShake.intensity = Math.max(this.screenShake.intensity, intensity);
            this.screenShake.duration = Math.max(this.screenShake.duration, duration);
            this.screenShake.timer = Math.max(this.screenShake.timer, duration);
        } else {
            this.screenShake.intensity = intensity;
            this.screenShake.duration = duration;
            this.screenShake.timer = duration;
        }
    }
    
    addFreezeFrame(duration, fadeAmount = 0.1) {
        this.freezeFrame.duration = duration;
        this.freezeFrame.timer = duration;
        this.freezeFrame.fade = fadeAmount;
    }
    
    addScreenFlash(color = '#FFFFFF', intensity = 0.3, duration = 0.2) {
        this.screenFlash.color = color;
        this.screenFlash.intensity = intensity;
        this.screenFlash.duration = duration;
        this.screenFlash.timer = duration;
    }
    
    // === GETTERS PÚBLICOS ===
    getParticles() {
        return [...this.particles]; // Cópia para segurança
    }
    
    getParticleCount() {
        return this.particles.length;
    }
    
    getScreenShake() {
        return { ...this.screenShake };
    }
    
    getFreezeFrame() {
        return { ...this.freezeFrame };
    }
    
    getScreenFlash() {
        return { ...this.screenFlash };
    }
    
    // === RESET E CLEANUP ===
    reset() {
        this.particles = [];
        this.screenShake = { intensity: 0, duration: 0, timer: 0, x: 0, y: 0 };
        this.freezeFrame = { timer: 0, duration: 0, fade: 0 };
        this.screenFlash = { timer: 0, duration: 0, color: '#FFFFFF', intensity: 0 };
        
        console.log('[EffectsSystem] Reset');
    }
    
    destroy() {
        this.particles = [];
        console.log('[EffectsSystem] Destroyed');
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EffectsSystem, SpaceParticle };
}

if (typeof window !== 'undefined') {
    window.EffectsSystem = EffectsSystem;
    window.SpaceParticle = SpaceParticle;
}

VALIDAÇÃO OBRIGATÓRIA:
1. Arquivo criado sem erros de sintaxe
2. Recarregar página
3. Console mostra "[EffectsSystem] Initialized"
4. No Developer Tools: gameServices.get('effects')
5. Deve retornar objeto EffectsSystem
6. Testar: gameServices.get('effects').getParticleCount()
7. Deve retornar 0 inicialmente

ATENÇÃO: EffectsSystem criado mas ainda não integrado.
Efeitos visuais devem funcionar exatamente igual.

Confirme que funciona.
```


### **Prompt 5.2: Integrar EffectsSystem no App.js**

```
CONTEXTO: EffectsSystem criado com partículas e screen effects, agora integrar.
OBJETIVO: Usar EffectsSystem JUNTO com código antigo para transição suave.

MODIFICAÇÕES NO app.js:

1. ADICIONAR import:

import { EffectsSystem } from './src/modules/EffectsSystem.js';

2. MODIFICAR função init():
   Adicione DEPOIS da criação do uiSystem:

// Inicializar EffectsSystem
const effectsSystem = new EffectsSystem();

3. MODIFICAR função updateGame():
   ADICIONAR DEPOIS da atualização do uiSystem:

// Atualizar EffectsSystem
const effects = gameServices.get('effects');
if (effects) {
    effects.update(deltaTime);
    
    // SINCRONIZAR com gameState antigo (temporário)
    gameState.world.particles = effects.getParticles();
    
    // Sincronizar screen effects
    const shake = effects.getScreenShake();
    gameState.screenShake.x = shake.x;
    gameState.screenShake.y = shake.y;
    gameState.screenShake.timer = shake.timer;
    
    const freeze = effects.getFreezeFrame();
    gameState.freezeFrame.timer = freeze.timer;
    gameState.freezeFrame.fade = freeze.fade;
    
    const flash = effects.getScreenFlash();
    gameState.screenFlash = flash;
}

4. MODIFICAR função updateParticles():
   SUBSTITUIR o conteúdo da função por:

function updateParticles(deltaTime) {
    // EffectsSystem agora gerencia as partículas
    // Função mantida para compatibilidade
    console.log('[updateParticles] Now handled by EffectsSystem');
}

5. MODIFICAR função updateScreenShake():
   SUBSTITUIR o conteúdo da função por:

function updateScreenShake(deltaTime) {
    // EffectsSystem agora gerencia screen shake
    // Função mantida para compatibilidade
    console.log('[updateScreenShake] Now handled by EffectsSystem');
}

6. MODIFICAR função updateScreenFlash():
   SUBSTITUIR o conteúdo da função por:

function updateScreenFlash(deltaTime) {
    // EffectsSystem agora gerencia screen flash
    // Função mantida para compatibilidade
    console.log('[updateScreenFlash] Now handled by EffectsSystem');
}

7. MODIFICAR função spawnThrusterVFX():
   SUBSTITUIR o conteúdo da função por:

function spawnThrusterVFX(worldX, worldY, dirX, dirY, intensity, type) {
    // EffectsSystem agora gerencia via events
    // Esta função ainda pode ser chamada por código antigo
    const effects = gameServices.get('effects');
    if (effects) {
        effects.spawnThrusterVFX(worldX, worldY, dirX, dirY, intensity, type);
    }
}

8. MODIFICAR funções de screen effects:
   SUBSTITUIR as funções addScreenShake, addFreezeFrame, addScreenFlash:

function addScreenShake(intensity, duration, type = 'normal') {
    const effects = gameServices.get('effects');
    if (effects) {
        effects.addScreenShake(intensity, duration, type);
    }
}

function addFreezeFrame(duration, fadeAmount = 0.1) {
    const effects = gameServices.get('effects');
    if (effects) {
        effects.addFreezeFrame(duration, fadeAmount);
    }
}

function addScreenFlash(color = '#FFFFFF', intensity = 0.3, duration = 0.2) {
    const effects = gameServices.get('effects');
    if (effects) {
        effects.addScreenFlash(color, intensity, duration);
    }
}

9. CRIAR função createXPCollectEffect():
   ADICIONAR função que pode estar faltando:

function createXPCollectEffect(x, y) {
    const effects = gameServices.get('effects');
    if (effects) {
        effects.createXPCollectEffect(x, y);
    }
}

function createLevelUpExplosion() {
    const effects = gameServices.get('effects');
    if (effects) {
        effects.createLevelUpExplosion();
    }
}

10. MODIFICAR função resetWorld():
    ADICIONAR após outros resets:

// Reset EffectsSystem
const effects = gameServices.get('effects');
if (effects) {
    effects.reset();
}

11. ADICIONAR listener para player damage:
    ADICIONAR junto com outros listeners na função init():

// Listener para dano do player (para efeitos visuais)
gameEvents.on('player-took-damage', (data) => {
    // Será usado quando player puder levar dano
    console.log('[Player] Took damage:', data);
});

VALIDAÇÃO OBRIGATÓRIA:
1. Jogo carrega normalmente
2. Console mostra "[EffectsSystem] Initialized"
3. Efeitos de thruster funcionam IGUAL (partículas atrás da nave)
4. Screen shake funciona quando asteroides morrem
5. Partículas aparecem quando asteroides explodem
6. Screen flash funciona no level up
7. Freeze frame funciona no level up
8. XP collect effects funcionam
9. Performance não piorou
10. Efeitos visuais idênticos ao antes

TESTE ESPECÍFICO:
- Mover com WASD → partículas de thruster devem aparecer
- Matar asteroides → explosão de partículas
- Subir de nível → screen shake + flash dourado + freeze
- Coletar XP → partículas douradas
- Verificar se partículas não acumulam infinitamente

DEBUG OPCIONAL:
No console verificar:
- gameServices.get('effects').getParticleCount() - deve flutuar, não crescer infinitamente
- Mensagens "[updateParticles] Now handled by EffectsSystem"

Se efeitos visuais ficarem diferentes ou performance piorar, me informe IMEDIATAMENTE.
```


***

## 📋 **FASE 6: LIMPEZA E FINALIZAÇÃO**

### **Prompt 6.1: Limpeza do Código Antigo - Parte 1**

```
CONTEXTO: Todos os módulos criados e funcionando. Agora remover código duplicado.
OBJETIVO: Remover funções antigas que foram substituídas por módulos, mantendo funcionamento.

AÇÕES DE LIMPEZA NO app.js:

1. REMOVER funções antigas de UPDATE (que agora fazem console.log):
   Deletar completamente estas funções:
   - updateParticles() 
   - updateScreenShake()
   - updateScreenFlash()

2. REMOVER funções antigas de INPUT que não são mais usadas:
   Deletar ou comentar a seção setupEventListeners() APENAS as partes:
   - document.addEventListener('keydown') 
   - document.addEventListener('keyup')
   (MANTER os click events para botões)

3. REMOVER da função updateGame() as chamadas:
   Remover estas linhas:
   - updateParticles(deltaTime);
   - updateScreenShake(deltaTime);
   - updateScreenFlash(deltaTime);

4. REMOVER variáveis antigas de gameState que foram substituídas:
   Na inicialização do gameState, REMOVER:
   - input: {} (InputSystem gerencia)
   - screenShake: {...} (EffectsSystem gerencia)
<span style="display:none">[^2][^3]</span>

<div style="text-align: center">⁂</div>

[^1]: app.js
[^2]: index.html
[^3]: style.css```

