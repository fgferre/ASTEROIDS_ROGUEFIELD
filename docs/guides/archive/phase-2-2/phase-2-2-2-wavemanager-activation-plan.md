# Fase 2.2.2: Plano de Ativação do WaveManager

> **Estado:** Arquivado. A situação atual do WaveManager está descrita em
> [`docs/guides/phase-2-2-actual-state.md`](../../phase-2-2-actual-state.md).

**Data:** 2025-10-01
**Branch:** `feature/phase-2-2-2-activate-wavemanager` (a criar)
**Objetivo:** Ativar o componente WaveManager de forma segura, sem quebras

---

## 📋 Análise Minuciosa do Código Atual

### 🔍 PROBLEMA CRÍTICO IDENTIFICADO

O WaveManager atual tem uma **arquitetura COMPLETAMENTE DIFERENTE** do sistema legado:

| Aspecto | EnemySystem (Legado) | WaveManager (Não usado) |
|---------|----------------------|-------------------------|
| **Spawning** | Gradual ao longo da wave | Todo de uma vez no início |
| **Wave configs** | Dinâmico (CONSTANTS) | Pré-definido (loadWaveConfigurations) |
| **Time limit** | ✅ Tem (WAVE_DURATION) | ❌ Não tem |
| **Enemy tracking** | asteroidsSpawned, asteroidsKilled | enemiesSpawnedThisWave, enemiesKilledThisWave |
| **Wave completion** | Por tempo OU all killed | Apenas all killed |
| **Spawn delay** | Variável e gradual | Instantâneo + countdown |

### ⚠️ DECISÃO IMPORTANTE

**NÃO podemos simplesmente ativar o WaveManager sem modificações!**

Ele foi projetado para um sistema diferente (preparado para futuros enemy types) mas não é compatível com o gameplay atual.

### 💡 DUAS OPÇÕES

#### Opção A: Adaptar WaveManager para comportamento legado ✅ RECOMENDADO
- Modificar WaveManager para manter gameplay atual
- Gradual spawning
- Time limit por wave
- Compatibilidade total

**Prós:**
- ✅ Gameplay não muda
- ✅ Jogadores não percebem diferença
- ✅ Arquitetura melhor para futuro

**Contras:**
- ⚠️ Precisa modificar WaveManager
- ⚠️ Mais trabalho

#### Opção B: Remover WaveManager ❌ NÃO RECOMENDADO
- Aceitar que wave logic fica no EnemySystem
- Focar em outros componentes

**Prós:**
- ✅ Menos trabalho

**Contras:**
- ❌ Desperdiça código bem estruturado
- ❌ EnemySystem continua grande
- ❌ Dificulta futuros enemy types

---

## 🎯 DECISÃO FINAL: Opção A - Adaptar WaveManager

Vamos **refatorar o WaveManager** para manter o comportamento atual do jogo.

---

## 📊 Análise Detalhada das Diferenças

### 1. Sistema de Spawning

**LEGADO (EnemySystem):**
```javascript
// Spawning gradual durante a wave
handleSpawning(deltaTime) {
  this.spawnTimer -= deltaTime;

  if (this.shouldSpawn() && this.spawnTimer <= 0) {
    this.spawnAsteroid();  // Spawna UM asteroid de cada vez
    this.spawnTimer = wave.spawnDelay * (0.5 + Math.random() * 0.5);
  }
}
```

**WAVEMANAGER (Não usado):**
```javascript
// Spawning tudo de uma vez
spawnWave(waveConfig) {
  for (const enemyGroup of waveConfig.enemies) {
    for (let i = 0; i < enemyGroup.count; i++) {
      // Spawna TODOS os asteroids imediatamente
      const enemy = this.enemySystem.acquireAsteroid(config);
    }
  }
}
```

**PROBLEMA:** WaveManager spawna tudo instantaneamente, jogabilidade fica diferente!

---

### 2. Wave Completion

**LEGADO:**
```javascript
// Completa por TEMPO ou ALL KILLED
if (wave.timeRemaining <= 0 || allAsteroidsKilled) {
  this.completeCurrentWave();
}
```

**WAVEMANAGER:**
```javascript
// Completa apenas quando ALL KILLED
if (this.enemiesKilledThisWave >= this.totalEnemiesThisWave) {
  this.completeWave();
}
```

**PROBLEMA:** WaveManager não tem limite de tempo!

---

### 3. Wave Configuration

**LEGADO:**
```javascript
// Dinâmico baseado em CONSTANTS
wave.totalAsteroids = Math.floor(
  CONSTANTS.ASTEROIDS_PER_WAVE_BASE *
  Math.pow(CONSTANTS.ASTEROIDS_PER_WAVE_MULTIPLIER, wave.current - 1)
);
wave.totalAsteroids = Math.min(wave.totalAsteroids, 25);
```

**WAVEMANAGER:**
```javascript
// Pré-definido em loadWaveConfigurations()
configs.set(1, {
  enemies: [
    { type: 'asteroid', count: 4, size: 'small', variant: 'common' }
  ]
});
// ... waves 2-10 hardcoded
// waves 11+ usa generateDynamicWave()
```

**PROBLEMA:** Configuração hardcoded vs dinâmica!

---

## 🛠️ Estratégia de Adaptação

### Passo 1: Refatorar WaveManager para Spawning Gradual

Adicionar sistema de spawning gradual similar ao legado:

```javascript
export class WaveManager {
  constructor(enemySystem, eventBus) {
    // ... existente

    // NEW: Gradual spawning
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.spawnDelay = 1.0;
  }

  // NEW: Método para spawning gradual
  update(deltaTime) {
    if (!this.waveInProgress) {
      if (this.waveCountdown > 0) {
        this.waveCountdown -= deltaTime;
        if (this.waveCountdown <= 0) {
          this.startNextWave();
        }
      }
      return;
    }

    // NEW: Handle time limit
    if (this.waveTimeRemaining > 0) {
      this.waveTimeRemaining -= deltaTime;
      if (this.waveTimeRemaining <= 0) {
        this.completeWave();
        return;
      }
    }

    // NEW: Gradual spawning
    this.handleGradualSpawning(deltaTime);

    // Check completion
    if (this.enemiesKilledThisWave >= this.totalEnemiesThisWave &&
        this.getActiveEnemyCount() === 0) {
      this.completeWave();
    }
  }

  handleGradualSpawning(deltaTime) {
    if (this.spawnQueue.length === 0) {
      return;
    }

    this.spawnTimer -= deltaTime;

    if (this.spawnTimer <= 0 && this.shouldSpawnNext()) {
      const enemyConfig = this.spawnQueue.shift();
      this.spawnEnemy(enemyConfig);

      // Random delay for next spawn
      this.spawnTimer = this.spawnDelay * (0.5 + Math.random() * 0.5);
    }
  }

  shouldSpawnNext() {
    const activeCount = this.enemySystem.getAsteroidCount();
    return activeCount < CONSTANTS.MAX_ASTEROIDS_ON_SCREEN;
  }
}
```

### Passo 2: Adaptar Wave Configuration para CONSTANTS

Usar configuração dinâmica do legado:

```javascript
generateWaveConfig(waveNumber) {
  const totalAsteroids = Math.floor(
    CONSTANTS.ASTEROIDS_PER_WAVE_BASE *
    Math.pow(CONSTANTS.ASTEROIDS_PER_WAVE_MULTIPLIER, waveNumber - 1)
  );
  const cappedTotal = Math.min(totalAsteroids, 25);

  // Distribuição por tamanho (similar ao original)
  const sizeDistribution = this.calculateSizeDistribution(cappedTotal);

  const enemies = [];
  for (const [size, count] of Object.entries(sizeDistribution)) {
    for (let i = 0; i < count; i++) {
      enemies.push({
        type: 'asteroid',
        size: size,
        variant: 'common', // decideVariant será chamado no spawn
        wave: waveNumber
      });
    }
  }

  return { enemies, totalCount: cappedTotal };
}

calculateSizeDistribution(total) {
  // Similar à lógica original de spawning
  const large = Math.floor(total * 0.4);
  const medium = Math.floor(total * 0.35);
  const small = total - large - medium;

  return { large, medium, small };
}
```

### Passo 3: Adicionar Time Limit

```javascript
startNextWave() {
  this.currentWave++;
  this.waveInProgress = true;
  this.waveStartTime = Date.now();
  this.waveTimeRemaining = CONSTANTS.WAVE_DURATION; // NEW
  this.enemiesSpawnedThisWave = 0;
  this.enemiesKilledThisWave = 0;

  // Generate wave config
  const config = this.generateWaveConfig(this.currentWave);
  this.totalEnemiesThisWave = config.totalCount;

  // NEW: Create spawn queue instead of spawning immediately
  this.spawnQueue = [...config.enemies];
  this.spawnTimer = 0.5; // Small initial delay

  // Emit event
  if (this.eventBus) {
    this.eventBus.emit('wave-started', {
      wave: this.currentWave,
      totalEnemies: this.totalEnemiesThisWave
    });
  }
}
```

---

## 📝 Plano de Execução Detalhado

### Mudanças no WaveManager

**Arquivo:** `src/modules/enemies/managers/WaveManager.js`

#### 1. Adicionar propriedades para spawning gradual

```javascript
constructor(enemySystem, eventBus) {
  // ... existente

  // NEW: Gradual spawning system
  this.spawnQueue = [];
  this.spawnTimer = 0;
  this.spawnDelay = 1.0;
  this.waveTimeRemaining = 0;
}
```

#### 2. Substituir `loadWaveConfigurations()` por `generateWaveConfig()`

Remover hardcoded configs, usar CONSTANTS dinâmico.

#### 3. Atualizar `startNextWave()`

Criar spawn queue em vez de spawnar tudo.

#### 4. Atualizar `update()`

Adicionar lógica de:
- Time limit
- Gradual spawning
- Completion check

#### 5. Adicionar `handleGradualSpawning()`

Lógica de spawning gradual.

#### 6. Atualizar interface de notificação

`onEnemyDestroyed()` deve ser chamado pelo EnemySystem quando inimigo morre.

---

### Mudanças no EnemySystem

**Arquivo:** `src/modules/EnemySystem.js`

#### 1. Conectar WaveManager.update() no game loop

```javascript
update(deltaTime) {
  if (!this.sessionActive) {
    return;
  }

  this.resolveCachedServices();
  this.sessionStats.timeElapsed += deltaTime;

  this.updateAsteroids(deltaTime);

  // NEW: Use WaveManager if enabled
  if (this.useManagers && this.waveManager) {
    this.waveManager.update(deltaTime);
  } else {
    // LEGACY: Internal wave logic
    this.updateWaveLogic(deltaTime);
  }

  this.cleanupDestroyed();
  this.emitWaveStateUpdate();
}
```

#### 2. Notificar WaveManager quando inimigo morre

```javascript
destroyAsteroid(asteroid, options = {}) {
  // ... código existente

  // NEW: Notify WaveManager
  if (this.useManagers && this.waveManager) {
    this.waveManager.onEnemyDestroyed(asteroid);
  }

  // LEGACY: Update internal wave state
  if (this.waveState) {
    this.waveState.asteroidsKilled += 1;
  }

  // ... resto do código
}
```

#### 3. Delegar spawning para WaveManager

WaveManager chamará `this.enemySystem.spawnAsteroid()` quando necessário.

---

## 🧪 Plano de Testes

### Teste 1: Wave Progression
- ✅ Wave 1 começa com 4-6 asteroids
- ✅ Asteroids spawnam gradualmente
- ✅ Wave completa após matar todos OU tempo acabar
- ✅ Break de 3s entre waves

### Teste 2: Gradual Spawning
- ✅ Não spawna todos de uma vez
- ✅ Delay variável entre spawns
- ✅ Respeita MAX_ASTEROIDS_ON_SCREEN

### Teste 3: Time Limit
- ✅ Wave tem timer de 60s
- ✅ Wave termina se timer chega a 0
- ✅ Pode terminar antes se matar todos

### Teste 4: Difficulty Scaling
- ✅ Wave 1: ~6 asteroids
- ✅ Wave 5: ~12 asteroids
- ✅ Wave 10: ~20 asteroids
- ✅ Cap em 25 asteroids

### Teste 5: Compatibility
- ✅ XP orbs ainda dropam
- ✅ Fragmentação funciona
- ✅ Variant system ativo
- ✅ Stats tracking correto

---

## ⚠️ Riscos e Mitigações

### Risco 1: Gameplay muda drasticamente
**Mitigação:** Usar valores de CONSTANTS, manter comportamento legado

### Risco 2: Spawning muito rápido/lento
**Mitigação:** Usar mesmos delays do legado, testar extensivamente

### Risco 3: Wave não completa
**Mitigação:** Dupla checagem (time limit E all killed)

### Risco 4: Eventos não sincronizam
**Mitigação:** Manter eventos legados ativos até confirmar WaveManager

---

## 🔄 Rollback Plan

### Opção 1: Flag de controle

```javascript
// EnemySystem.js
this.useManagers = false; // Desativa WaveManager
```

### Opção 2: Reverter branch

```bash
git checkout feature/phase-2-2-1-activate-movement
```

---

## 📊 Estimativa de Tempo

| Tarefa | Tempo Estimado |
|--------|----------------|
| Refatorar WaveManager | 2-3 horas |
| Integrar no EnemySystem | 1 hora |
| Testes básicos | 1 hora |
| Testes extensivos | 2 horas |
| **TOTAL** | **6-7 horas** |

---

## ✅ Checklist de Implementação

- [ ] Adicionar propriedades de spawning gradual no WaveManager
- [ ] Remover `loadWaveConfigurations()`
- [ ] Criar `generateWaveConfig()` baseado em CONSTANTS
- [ ] Atualizar `startNextWave()` para criar spawn queue
- [ ] Implementar `handleGradualSpawning()`
- [ ] Adicionar time limit em `update()`
- [ ] Atualizar `completeWave()` para wave rewards
- [ ] Integrar WaveManager.update() no EnemySystem
- [ ] Notificar WaveManager em `destroyAsteroid()`
- [ ] Testar wave progression
- [ ] Testar spawning gradual
- [ ] Testar time limit
- [ ] Build final

---

## 💭 Considerações Finais

Esta fase é **mais complexa** que a 2.2.1 porque:
- ❌ WaveManager não é drop-in replacement
- ❌ Precisa refatoração significativa
- ❌ Muda gameplay se não adaptado

**MAS** vale a pena porque:
- ✅ Código muito mais limpo
- ✅ Preparado para futuros enemy types
- ✅ EnemySystem reduz ~300 linhas
- ✅ Wave configs centralizadas

---

**Pronto para implementar após aprovação! 🚀**
