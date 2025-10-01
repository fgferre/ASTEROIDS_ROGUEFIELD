# Fase 2.2.1: Plano de Ativação do AsteroidMovement

**Data:** 2025-10-01
**Objetivo:** Ativar o componente AsteroidMovement de forma segura, sem quebras

---

## 📋 Análise Minuciosa do Código Atual

### Código que será MIGRADO (Asteroid.update())

**Localização:** `src/modules/enemies/types/Asteroid.js` linhas 1036-1068

```javascript
update(deltaTime) {
  if (this.destroyed) {
    return;
  }

  // 1. Visual state (NÃO migrar - específico do asteroid)
  this.updateVisualState(deltaTime);

  // 2. Behavior PARASITE (MIGRAR para AsteroidMovement)
  if (this.behavior?.type === 'parasite') {
    this.updateParasiteBehavior(deltaTime);
  }

  // 3. Behavior VOLATILE (NÃO migrar - não é movimento, é timer)
  if (this.behavior?.type === 'volatile') {
    this.updateVolatileBehavior(deltaTime);
  }

  // 4. MOVIMENTO LINEAR (MIGRAR para AsteroidMovement)
  this.x += this.vx * deltaTime;
  this.y += this.vy * deltaTime;
  this.rotation += this.rotationSpeed * deltaTime;

  // 5. SCREEN WRAPPING (MIGRAR para AsteroidMovement)
  const margin = this.radius;
  if (this.x < -margin) this.x = CONSTANTS.GAME_WIDTH + margin;
  if (this.x > CONSTANTS.GAME_WIDTH + margin) this.x = -margin;
  if (this.y < -margin) this.y = CONSTANTS.GAME_HEIGHT + margin;
  if (this.y > CONSTANTS.GAME_HEIGHT + margin) this.y = -margin;

  // 6. Timers (NÃO migrar - específico do asteroid)
  if (this.lastDamageTime > 0) {
    this.lastDamageTime = Math.max(0, this.lastDamageTime - deltaTime);
  }
  if (this.shieldHitCooldown > 0) {
    this.shieldHitCooldown = Math.max(0, this.shieldHitCooldown - deltaTime);
  }
}
```

### Código que ficará NO ASTEROID

**O que NÃO deve migrar:**
1. ✅ `updateVisualState()` - Específico de rendering do asteroid
2. ✅ `updateVolatileBehavior()` - Timer de explosão, não é movimento
3. ✅ `lastDamageTime` - Estado de dano
4. ✅ `shieldHitCooldown` - Estado de colisão com shield

**O que DEVE migrar:**
1. ❌ Movimento linear (x, y, rotation)
2. ❌ Screen wrapping
3. ❌ `updateParasiteBehavior()` - É movimento de tracking

---

## 🔍 Análise do Comportamento PARASITE

### Código Atual (Asteroid.updateParasiteBehavior)

**Linhas 1187-1257:**

```javascript
updateParasiteBehavior(deltaTime) {
  const behavior = this.behavior;
  if (!behavior) return;

  // 1. Busca player via system.getCachedPlayer()
  const player = this.system?.getCachedPlayer();
  if (!player?.position) return;

  // 2. Calcula direção para o player
  const dx = player.position.x - this.x;
  const dy = player.position.y - this.y;
  const distance = Math.hypot(dx, dy) || 0.0001;
  const dirX = dx / distance;
  const dirY = dy / distance;

  // 3. Aplica aceleração em direção ao player
  const acceleration = behavior.acceleration ?? 0;
  this.vx += dirX * acceleration * deltaTime;
  this.vy += dirY * acceleration * deltaTime;

  // 4. Limita velocidade máxima
  const maxSpeed = behavior.maxSpeed ?? Infinity;
  const currentSpeed = Math.hypot(this.vx, this.vy);
  if (currentSpeed > maxSpeed) {
    const scale = maxSpeed / currentSpeed;
    this.vx *= scale;
    this.vy *= scale;
  }

  // 5. Repulsão quando muito perto
  const minDistance = behavior.minDistance ?? 0;
  if (distance < minDistance) {
    const repelStrength = (minDistance - distance) / Math.max(minDistance, 1);
    this.vx -= dirX * acceleration * repelStrength * deltaTime * 1.2;
    this.vy -= dirY * acceleration * repelStrength * deltaTime * 1.2;
  }

  // 6. ATAQUE DE CONTATO (NÃO é movimento!)
  // ... código de ataque (linhas 1225-1257)
}
```

### Código no AsteroidMovement Component

**Linhas 86-151:**

```javascript
parasiteMovement(asteroid, deltaTime, context) {
  const { player } = context;
  const behavior = asteroid.behavior;

  if (!behavior || !player || !player.position) {
    this.linearMovement(asteroid, deltaTime, context);
    return;
  }

  // Tracking state (diferente do Asteroid!)
  if (!asteroid.variantState?.trackingStartTime) {
    asteroid.variantState.trackingStartTime = Date.now();
    asteroid.variantState.hasAccelerated = false;
  }

  const trackingDuration = (Date.now() - asteroid.variantState.trackingStartTime) / 1000;
  const trackingDelay = behavior.tracking?.delay ?? 1.5;
  const accelerationDelay = behavior.tracking?.accelerationDelay ?? 3.0;

  // Delay antes de começar tracking
  if (trackingDuration < trackingDelay) {
    this.linearMovement(asteroid, deltaTime, context);
    return;
  }

  // ... resto da lógica (DIFERENTE do Asteroid!)
}
```

### 🚨 PROBLEMA IDENTIFICADO: LÓGICAS DIFERENTES!

| Aspecto | Asteroid.updateParasiteBehavior | AsteroidMovement.parasiteMovement |
|---------|----------------------------------|-----------------------------------|
| Tracking delay | ❌ Não tem | ✅ Tem (1.5s default) |
| Acceleration delay | ❌ Não tem | ✅ Tem (3.0s default) |
| Steering | ✅ Aceleração contínua | ✅ Steering gradual + burst |
| Min distance repulsion | ✅ Tem | ❌ Não tem |
| Attack logic | ✅ Tem (dentro do método) | ❌ Não tem |

**DECISÃO:** Precisamos escolher qual implementação usar ou mesclar as duas.

---

## 🎯 Estratégia de Migração

### Opção A: Usar implementação do Asteroid (RECOMENDADO)

**Prós:**
- ✅ Já está funcionando no jogo atual
- ✅ Comportamento testado e aprovado
- ✅ Inclui ataque de contato
- ✅ Sem delays (mais agressivo)

**Contras:**
- ❌ Component precisa ser atualizado para matching

### Opção B: Usar implementação do Component

**Prós:**
- ✅ Mais estratégico (delays de tracking)
- ✅ Comportamento mais complexo

**Contras:**
- ❌ Nunca foi testado
- ❌ Falta lógica de ataque
- ❌ Pode mudar gameplay

### ✅ DECISÃO: Opção A - Portar lógica do Asteroid para Component

---

## 📝 Plano de Execução Detalhado

### Passo 1: Atualizar AsteroidMovement Component

**Arquivo:** `src/modules/enemies/components/AsteroidMovement.js`

#### 1.1 Substituir `parasiteMovement()` pela implementação do Asteroid

```javascript
parasiteMovement(asteroid, deltaTime, context) {
  const { player } = context;
  const behavior = asteroid.behavior;

  if (!behavior || !player || !player.position) {
    this.linearMovement(asteroid, deltaTime, context);
    return;
  }

  // USAR LÓGICA DO ASTEROID (linhas 1200-1223)
  const dx = player.position.x - asteroid.x;
  const dy = player.position.y - asteroid.y;
  const distance = Math.hypot(dx, dy) || 0.0001;
  const dirX = dx / distance;
  const dirY = dy / distance;

  const acceleration = behavior.acceleration ?? 0;
  asteroid.vx += dirX * acceleration * deltaTime;
  asteroid.vy += dirY * acceleration * deltaTime;

  const maxSpeed = behavior.maxSpeed ?? Infinity;
  const currentSpeed = Math.hypot(asteroid.vx, asteroid.vy);
  if (currentSpeed > maxSpeed) {
    const scale = maxSpeed / currentSpeed;
    asteroid.vx *= scale;
    asteroid.vy *= scale;
  }

  const minDistance = behavior.minDistance ?? 0;
  if (distance < minDistance) {
    const repelStrength = (minDistance - distance) / Math.max(minDistance, 1);
    asteroid.vx -= dirX * acceleration * repelStrength * deltaTime * 1.2;
    asteroid.vy -= dirY * acceleration * repelStrength * deltaTime * 1.2;
  }

  // Aplicar movimento
  asteroid.x += asteroid.vx * deltaTime;
  asteroid.y += asteroid.vy * deltaTime;
}
```

#### 1.2 Adicionar método `updateBehaviorState()`

O component precisa chamar a lógica de ataque parasite:

```javascript
/**
 * Updates behavior-specific state that's coupled with movement.
 * Called AFTER movement is applied.
 */
updateBehaviorState(asteroid, deltaTime, context) {
  if (asteroid.behavior?.type === 'parasite') {
    this.updateParasiteAttack(asteroid, deltaTime, context);
  }
}

updateParasiteAttack(asteroid, deltaTime, context) {
  const { player } = context;
  const behavior = asteroid.behavior;

  if (!player || !asteroid.system) return;

  // COPIAR LÓGICA DE ATAQUE (linhas 1225-1257 do Asteroid)
  if (!asteroid.variantState) {
    asteroid.variantState = { attackCooldown: 0 };
  }

  asteroid.variantState.attackCooldown = Math.max(
    0,
    (asteroid.variantState.attackCooldown || 0) - deltaTime
  );

  const playerRadius =
    typeof player.getHullBoundingRadius === 'function'
      ? player.getHullBoundingRadius()
      : CONSTANTS.SHIP_SIZE;
  const attackRange =
    (behavior.minDistance ?? 0) + asteroid.radius + playerRadius + 6;

  const dx = player.position.x - asteroid.x;
  const dy = player.position.y - asteroid.y;
  const distance = Math.hypot(dx, dy);

  if (
    distance <= attackRange &&
    asteroid.variantState.attackCooldown === 0 &&
    typeof asteroid.system.applyDirectDamageToPlayer === 'function'
  ) {
    const damage = behavior.contactDamage ?? 20;
    const result = asteroid.system.applyDirectDamageToPlayer(damage, {
      cause: 'parasite',
      position: { x: asteroid.x, y: asteroid.y },
    });

    if (result?.applied) {
      asteroid.variantState.attackCooldown = behavior.cooldown ?? 1.2;
    }
  }
}
```

#### 1.3 Atualizar método `update()` principal

```javascript
update(asteroid, deltaTime, context = {}) {
  if (!asteroid || asteroid.destroyed) {
    return;
  }

  // Determine movement strategy based on behavior
  const strategyType = asteroid.behavior?.type || 'linear';
  const strategy = this.strategies.get(strategyType) || this.linearMovement;

  // Execute movement strategy
  strategy.call(this, asteroid, deltaTime, context);

  // Apply rotation
  asteroid.rotation += asteroid.rotationSpeed * deltaTime;

  // Wrap around screen edges
  this.wrapScreenEdges(asteroid, context.worldBounds);

  // NEW: Update behavior-specific state
  this.updateBehaviorState(asteroid, deltaTime, context);
}
```

#### 1.4 Atualizar `wrapScreenEdges()` para usar CONSTANTS

```javascript
wrapScreenEdges(asteroid, bounds) {
  // Use CONSTANTS if bounds not provided
  const width = bounds?.width ?? CONSTANTS.GAME_WIDTH;
  const height = bounds?.height ?? CONSTANTS.GAME_HEIGHT;

  const margin = asteroid.radius || 30;

  if (asteroid.x < -margin) {
    asteroid.x = width + margin;
  } else if (asteroid.x > width + margin) {
    asteroid.x = -margin;
  }

  if (asteroid.y < -margin) {
    asteroid.y = height + margin;
  } else if (asteroid.y > height + margin) {
    asteroid.y = -margin;
  }
}
```

#### 1.5 Importar CONSTANTS

```javascript
import * as CONSTANTS from '../../../core/GameConstants.js';
```

---

### Passo 2: Integrar no EnemySystem

**Arquivo:** `src/modules/EnemySystem.js`

#### 2.1 Atualizar `updateAsteroids()` (linhas 507-517)

```javascript
updateAsteroids(deltaTime) {
  // NEW: Use movement component if enabled
  if (this.useComponents && this.movementComponent) {
    // Build context for movement component
    const context = {
      player: this.getCachedPlayer(),
      worldBounds: {
        width: CONSTANTS.GAME_WIDTH,
        height: CONSTANTS.GAME_HEIGHT
      }
    };

    // Update each asteroid using component
    this.asteroids.forEach((asteroid) => {
      if (!asteroid.destroyed) {
        // Component handles movement
        this.movementComponent.update(asteroid, deltaTime, context);

        // Asteroid handles its own state updates
        asteroid.updateVisualState(deltaTime);

        // Volatile behavior (timer, not movement)
        if (asteroid.behavior?.type === 'volatile') {
          asteroid.updateVolatileBehavior(deltaTime);
        }

        // Timers
        if (asteroid.lastDamageTime > 0) {
          asteroid.lastDamageTime = Math.max(0, asteroid.lastDamageTime - deltaTime);
        }
        if (asteroid.shieldHitCooldown > 0) {
          asteroid.shieldHitCooldown = Math.max(0, asteroid.shieldHitCooldown - deltaTime);
        }
      }
    });
  } else {
    // LEGACY: Asteroids handle their own update
    this.asteroids.forEach((asteroid) => {
      if (!asteroid.destroyed) {
        asteroid.update(deltaTime);
      }
    });
  }

  // Physics collision (always enabled)
  this.handleAsteroidCollisions();
}
```

---

### Passo 3: Remover código duplicado do Asteroid

**Arquivo:** `src/modules/enemies/types/Asteroid.js`

#### 3.1 Adicionar flag para controle

```javascript
update(deltaTime) {
  if (this.destroyed) {
    return;
  }

  // Check if using external movement component
  const useExternalMovement = this.system?.useComponents && this.system?.movementComponent;

  // Always update visual state
  this.updateVisualState(deltaTime);

  // Behavior updates (non-movement)
  if (this.behavior?.type === 'volatile') {
    this.updateVolatileBehavior(deltaTime);
  }

  // Movement - only if not using component
  if (!useExternalMovement) {
    // Parasite behavior
    if (this.behavior?.type === 'parasite') {
      this.updateParasiteBehavior(deltaTime);
    }

    // Linear movement
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
    this.rotation += this.rotationSpeed * deltaTime;

    // Screen wrapping
    const margin = this.radius;
    if (this.x < -margin) this.x = CONSTANTS.GAME_WIDTH + margin;
    if (this.x > CONSTANTS.GAME_WIDTH + margin) this.x = -margin;
    if (this.y < -margin) this.y = CONSTANTS.GAME_HEIGHT + margin;
    if (this.y > CONSTANTS.GAME_HEIGHT + margin) this.y = -margin;
  }

  // Timers (always update)
  if (this.lastDamageTime > 0) {
    this.lastDamageTime = Math.max(0, this.lastDamageTime - deltaTime);
  }
  if (this.shieldHitCooldown > 0) {
    this.shieldHitCooldown = Math.max(0, this.shieldHitCooldown - deltaTime);
  }
}
```

**NOTA:** Mantemos o código legado com flag para rollback fácil.

---

## 🧪 Plano de Testes

### Teste 1: Movimento Linear (Asteroids Comuns)

**Cenário:** Asteroids sem variant especial
**Comportamento esperado:**
- ✅ Movimento em linha reta
- ✅ Rotação contínua
- ✅ Screen wrapping funcionando
- ✅ Sem mudanças visuais

**Como testar:**
1. Iniciar jogo
2. Observar movimento de asteroids comuns
3. Verificar que atravessam as bordas corretamente

### Teste 2: Parasite Tracking

**Cenário:** Asteroids com variant 'parasite'
**Comportamento esperado:**
- ✅ Seguem o player
- ✅ Aceleram em direção ao player
- ✅ Causam dano de contato
- ✅ Respeitam cooldown de ataque

**Como testar:**
1. Spawnar asteroids parasite (wave 10+)
2. Observar tracking behavior
3. Verificar dano de contato
4. Confirmar cooldown entre ataques

### Teste 3: Volatile Movement

**Cenário:** Asteroids com variant 'volatile'
**Comportamento esperado:**
- ✅ Movimento linear (volatile não muda movimento)
- ✅ Timer de explosão funcionando
- ✅ Trail particles aparecem
- ✅ Explosão ocorre após timer

**Como testar:**
1. Spawnar asteroids volatile
2. Verificar movimento normal
3. Observar timer e explosão

### Teste 4: Performance

**Comportamento esperado:**
- ✅ FPS mantido em 60
- ✅ Sem stuttering
- ✅ Memória estável

**Como testar:**
1. Spawnar 20+ asteroids
2. Monitorar FPS
3. Jogar por 5 minutos

---

## 🔄 Rollback Plan

Se algo der errado:

### Opção 1: Desabilitar feature flag

```javascript
// EnemySystem.js linha 48
this.useComponents = false; // Disable component system
```

### Opção 2: Reverter commits

```bash
git log --oneline -5
git revert <commit-hash>
```

---

## 📊 Métricas de Sucesso

| Métrica | Antes | Depois | Status |
|---------|-------|--------|--------|
| Asteroid.update() linhas | ~60 | ~30 | ⏳ Pendente |
| Código duplicado | Sim | Não | ⏳ Pendente |
| AsteroidMovement usado | 0% | 100% | ⏳ Pendente |
| Testes passando | ✅ | ✅ | ⏳ Pendente |
| FPS mantido | 60 | 60 | ⏳ Pendente |

---

## 🚀 Ordem de Execução

1. ✅ **Análise completa** (DONE - este documento)
2. ⏳ **Atualizar AsteroidMovement.js** (próximo)
3. ⏳ **Atualizar EnemySystem.js**
4. ⏳ **Atualizar Asteroid.js**
5. ⏳ **Testar cada comportamento**
6. ⏳ **Build final**
7. ⏳ **Commit com mensagem descritiva**

---

## 📝 Notas Importantes

### Dependências Externas Necessárias

O component precisa receber via `context`:
- ✅ `player` - Para parasite tracking e ataque
- ✅ `worldBounds` - Para screen wrapping (com fallback para CONSTANTS)

### Código que NÃO migra

Mantém no Asteroid:
- ✅ `updateVisualState()` - Visual effects
- ✅ `updateVolatileBehavior()` - Timer de explosão
- ✅ `lastDamageTime` - Damage flash timer
- ✅ `shieldHitCooldown` - Shield collision cooldown

### Flag de Controle

`this.useComponents = true` no EnemySystem controla se usa o component ou método legado.

---

**Pronto para execução!** 🚀
