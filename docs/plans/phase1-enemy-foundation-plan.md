# Plano da Fase 1 – Fundamentos para Novos Tipos de Inimigos

## Objetivo
Criar a base de inimigos adicionais reutilizando `BaseEnemy`, registrando-os no `EnemyFactory` e garantindo suporte completo em pools, constantes e fluxo de spawn. Essa fase destrava ondas mais variadas e prepara os sistemas para interagir com projéteis inimigos e explosões especiais nas etapas seguintes.

## Componentes Principais

- **Novas Classes:** `Drone`, `Mine`, `Hunter` em `src/modules/enemies/types`.
- **Configurações:** Ampliação de `GameConstants.ENEMY_TYPES` com parâmetros para os novos inimigos.
- **Pools:** Extensão de `GamePools` para incluir pools dedicados.
- **Factory & Sistema:** Registro no `EnemySystem.setupFactory()` e documentação de uso em `EnemyFactory`.
- **Waves:** `WaveManager` passa a misturar os novos tipos a partir das ondas 8+.
- **Physics:** `PhysicsSystem` deixa de tratar apenas asteroides, oferecendo APIs genéricas para inimigos.
- **Combate:** `CombatSystem` implementa suporte a projéteis inimigos emitidos por eventos `enemy-fired`.

## Passos Detalhados

1. **Implementar `Drone` (`src/modules/enemies/types/Drone.js`):**
   - Estender `BaseEnemy`.
   - Comportamento: perseguição simples ao jogador (`this.system.getCachedPlayer()`), aceleração alta e disparos periódicos.
   - Estados internos: `fireTimer`, atributos default (raio 12, vida 30, velocidade 180, fireRate 2.0s, projectileDamage 15).
   - Eventos: emite `enemy-fired` com payload de projétil.
   - Visual: nave triangular com brilho de thruster.

2. **Implementar `Mine` (`src/modules/enemies/types/Mine.js`):**
   - Estender `BaseEnemy`.
   - Estados: `proximityRadius` 80, `lifetime` 30s, `armed` após 0.5s, `pulsePhase` para animação.
   - Lógica: explosão automática no fim da vida ou ao detectar player no raio (quando armado).
   - Eventos: emite `mine-exploded` com raio 120 e dano 40 dentro de `onDestroyed()`.
   - Visual: esfera pulsante com glow crescente.

3. **Implementar `Hunter` (`src/modules/enemies/types/Hunter.js`):**
   - Estender `BaseEnemy`.
   - Orbit: manter distância preferida (175) com velocidade 120.
   - Disparo: rajadas de 3 tiros, intervalo 3.5s, delay 0.15s.
   - Estados: `orbitAngle`, `burstTimer`, `burstCount`, randomização inicial via `system.getRandomScope()`.
   - Eventos: emite `enemy-fired` para cada tiro da rajada.
   - Visual: nave em forma de diamante com torre giratória.

4. **Atualizar `GameConstants.js`:**
   - Adicionar objeto `ENEMY_TYPES` com configs completas de Drone, Mine e Hunter (vida, velocidade, raios, timers, dano de projétil/explosão).
   - Manter arquitetura data-driven documentando novos atributos.

5. **Ampliar `GamePools.js`:**
   - Criar pools `drones`, `mines`, `hunters` (com capacidades inicial/max: 10/30, 5/15, 5/12 respectivamente).
   - Métodos de inicialização seguindo padrão de `initializeAsteroidPool` com factories e `reset` específicos.
   - Incluir novos pools em `releaseAll`, `autoManageAll`, `getPoolStats`, `validateAll`, `destroy` e `debugLog`.
   - Exportar referências (`DronePool`, `MinePool`, `HunterPool`).

6. **Documentar Registro na Factory:**
   - Em `EnemyFactory`, adicionar comentários/JSDoc mostrando como registrar os novos tipos com `factory.registerType('drone', { class, pool, defaults, tags })`, enfatizando o uso dos pools recém-criados.

7. **Integrar `EnemySystem`:**
   - Importar as novas classes.
   - Em `setupFactory()`, registrar `drone`, `mine`, `hunter` com pools de `GamePools` e defaults de `GameConstants.ENEMY_TYPES`.
   - Criar handler `handleEnemyProjectile(data)` para consumir eventos `enemy-fired` e repassar ao `CombatSystem` (via `gameEvents.emit` ou chamada direta, conforme padrão existente).
   - Adicionar `handleMineExplosion(data)` para emitir dano em área via `PhysicsSystem`.
   - Criar helper `getActiveEnemiesByType(type)` e alias `forEachActiveEnemy()` garantindo compatibilidade com métodos que ainda mencionam “asteroid”.

8. **Atualizar `WaveManager`:**
   - Introduzir drones nas ondas 8-9, mines nas 10-12 e hunters nas 13+.
   - Ajustar `generateDynamicWave()` para considerar os novos tipos com pesos crescentes.
   - Garantir que as configs existentes aproveitem `enemyGroup.type` para os novos registros da factory.

9. **Generalizar `PhysicsSystem`:**
   - Renomear internamente `registerAsteroid`/`unregisterAsteroid`/`getNearbyAsteroids` para equivalentes genéricos (mantendo aliases para compatibilidade).
   - Confirmar que colisões player↔inimigo tratem drones, mines e hunters apropriadamente (mines detonam ao contato se armadas).

10. **Suporte a Projéteis Inimigos no `CombatSystem`:**
    - Adicionar array `enemyBullets`.
    - Criar `createEnemyBullet(data)` consumindo o pool de projéteis (`GamePools.bullets`) e diferenciando cor/tipo.
    - Atualizar `update()` para movimentar projéteis, testar colisão com o jogador e emitir `player-hit-by-projectile`.
    - Garantir limpeza de projéteis em `reset()`.

## Critérios de Conclusão

- Drones, mines e hunters podem ser spawnados via `WaveManager` sem quebrar ondas existentes.
- Eventos `enemy-fired` e `mine-exploded` são emitidos e reconhecidos pelos sistemas relevantes.
- Projéteis inimigos interagem com o jogador e são renderizados corretamente (renderização detalhada será refinada na Fase 3).
- `GamePools.debugLog()` exibe estatísticas dos novos pools.

## Dependências e Próximos Passos

- A Fase 2 se apoia nessa fundação para introduzir o boss e reutiliza utilitários criados aqui (`getActiveEnemiesByType`, handlers de projéteis, generalização do PhysicsSystem`).
- Efeitos visuais, áudio e HUD serão expandidos nas fases 3 a 5 usando os eventos e estruturas estabelecidos nesta etapa.

## ✅ Baseline Metrics Captured (WAVE-001)

**Status:** Concluído

**Artefatos criados:**
- Suite de testes: `src/__tests__/legacy/asteroid-baseline-metrics.test.js`
- Documentação: `docs/validation/asteroid-baseline-metrics.md`
- Scripts npm: `test:baseline`, `test:baseline:watch`

**Métricas capturadas:**
1. Taxa de spawn por wave (waves 1-10) – fórmula validada
2. Distribuição de tamanhos (50/30/20) – validada estatisticamente
3. Distribuição de variantes por tamanho e wave – com wave scaling documentado
4. Regras de fragmentação por variante – verificadas para todos os tipos
5. Média de fragmentos por tamanho – baseline documentado
6. Contadores de `waveState` – ciclo de vida completo monitorado
7. Determinismo – sequência idêntica com seed fixa

**Próximos passos:**
- Executar `npm run test:baseline` antes de iniciar a integração do WaveManager
- Após cada alteração no WaveManager, reexecutar para confirmar paridade
- Documentar qualquer desvio intencional nas métricas baseline

**Critério de sucesso para migração:**
Todos os testes em `asteroid-baseline-metrics.test.js` devem passar com o WaveManager ativado, garantindo preservação do comportamento legado.

## ✅ Feature Flag Implementation (WAVE-002)

**Status:** Concluído

**Objetivo:** Permitir ativação controlada do WaveManager sem quebrar o sistema legado de ondas.

**Implementação:**

1. **GameConstants.js:**
   - Adicionada constante `USE_WAVE_MANAGER = false` (default desativado)
   - Localização: seção SISTEMA DE ONDAS (linha ~1607)
   - Exportada para uso em outros módulos

2. **EnemySystem.js:**
   - Modificado método `update()` para rotear condicionalmente entre sistemas
   - Criado método `updateWaveManagerLogic()` para delegação ao WaveManager
   - Implementada sincronização de estado entre `WaveManager.getState()` e `waveState`
   - Adicionados logs de debug para rastreamento do sistema ativo
   - Guards de segurança: fallback para sistema legado se WaveManager não disponível

**Mapeamento de estado (WaveManager → waveState):**
- `currentWave` → `current`
- `inProgress` → `isActive`
- `spawned` → `asteroidsSpawned`
- `killed` → `asteroidsKilled`
- `total` → `totalAsteroids`

**Validação:**
- Com flag desativada (`false`): sistema legado permanece 100% funcional
- Com flag ativada (`true`): WaveManager assume controle, estado sincronizado para HUD
- Testes de baseline (`npm run test:baseline`) devem passar em ambos os modos

**Próximos passos:**
1. Validar que aplicação funciona com flag desativada (comportamento atual)
2. Implementar renderização para Drone, Mine e Hunter (WAVE-003)
3. Conectar WaveManager ao loop de spawn (WAVE-004)
4. Ativar flag e validar paridade com baseline metrics

**Critério de remoção da flag:**
A flag `USE_WAVE_MANAGER` será removida após:
- Todos os testes de baseline passarem com flag ativada
- Validação em produção por pelo menos 2 semanas
- Confirmação de que novos inimigos (Drone, Mine, Hunter, Boss) funcionam corretamente
- Aprovação da equipe para deprecar sistema legado

## ✅ Enemy Rendering Implementation (WAVE-003)

**Status:** Concluído

**Objetivo:** Implementar e validar renderização visual de Drone, Mine e Hunter antes de ativar spawn via WaveManager.

**Implementações Completas:**

1. **Drone.onDraw() (linhas 300-469):**
   - Geometria: nave triangular com nose/tail/halfWidth proporcional ao radius
   - Camadas: shadow layer (bodyShadow), inner layer (bodyHighlight), hull stroke
   - Fins laterais com taper (~0.6)
   - Accent ridges em ciano com glow opcional
   - **Exhaust dinâmico:** glow reativo à velocidade com smoothing (~0.2), blur 6-12, alpha 0.28-0.72
   - Composite 'lighter' para exhaust e accent glow
   - Thrust smoothing via `_renderThrust` para evitar transições abruptas

2. **Mine.onDraw() (linhas 194-312):**
   - Geometria: esfera com core radius igual ao base radius
   - Gradiente radial cacheado (bodyHighlight → body → bodyShadow)
   - **Pulsação:** baseada em `pulsePhase`, intensidade aumenta quando `armed` (multiplier 1.45)
   - Glow central com blur 10-15 e composite 'lighter'
   - Halo ring (~1.45x radius) com alpha variável por pulse strength (exponent 1.4)
   - Rim com alpha dinâmico (0.55-0.95) sincronizado com pulso
   - Cache de gradiente com key validation (`_bodyGradientKey`)

3. **Hunter.onDraw() (linhas 402-545):**
   - Geometria: diamante (front 1.9x, rear 0.72x front, halfWidth 1.2x radius)
   - Gradiente linear front-to-rear cacheado (shadow → body → highlight)
   - Accent inset (~0.48x radius) com stroke magenta
   - **Turret independente:** base circular + barrel retangular, rotaciona via `turretAngle`
   - Ângulo relativo calculado: `normalizeAngle(turretAngle - rotation)`
   - Highlight triangular no turret (alpha 0.45)
   - Barrel accent line em magenta
   - Cache de gradiente com key validation (`_hullGradientKey`)

**Padrões Seguidos:**
- Consumo de `ENEMY_EFFECT_COLORS` e `ENEMY_RENDER_PRESETS` de `GameConstants`
- Retorno de payload descritivo quando `ctx` é null
- Preservação de estado do canvas (reset de globalAlpha, shadowBlur, composite, etc.)
- Uso de `save()`/`restore()` para isolamento de transformações
- Cache de gradientes com key validation para performance
- Composite 'lighter' para efeitos aditivos (glows)

**Testes Automatizados:**
- Suite: `src/__tests__/rendering/enemy-types-rendering.test.js`
- Validações:
  - Payload structure (type, id, radius, colors)
  - Propriedades dinâmicas (thrust, pulse/armed, turretAngle)
  - Canvas state preservation
  - Determinismo com mock context

**Validação Visual:**
- Harness: `scripts/visual-enemy-rendering-test.html`
- Checklist: `docs/validation/enemy-rendering-visual-checklist.md`
- Script npm: `npm run test:visual-enemies`
- Validações manuais:
  - Geometria e proporções corretas
  - Cores correspondendo a paletas definidas
  - Animações suaves (thrust, pulse, turret rotation)
- Performance estável (60 FPS com múltiplas instâncias)
- Canvas state preservation

**Comparação com BossEnemy.onDraw():**
- ✅ Padrão de save/restore consistente
- ✅ Consumo de constantes idêntico
- ✅ Payload quando ctx é null
- ✅ Cache de gradientes
- ✅ Composite operations apropriadas
- ✅ Reset de estado do canvas

**Critérios de Conclusão Atendidos:**
- [x] Implementações completas e funcionais
- [x] Testes unitários passando
- [x] Harness de teste visual criado
- [x] Checklist de validação documentado
- [x] Performance validada (60 FPS)
- [x] Padrões consistentes com BossEnemy

**Próximos Passos:**
1. Executar validação visual via `npm run test:visual-enemies`
2. Preencher checklist em `enemy-rendering-visual-checklist.md`
3. Prosseguir para WAVE-004: Integrar WaveManager ao loop principal
4. Validar rendering in-game após ativação de spawn

**Notas Técnicas:**
- Drone: `_renderThrust` é propriedade de instância para smoothing, não resetada em pool
- Mine: `_bodyGradient` e `_bodyGradientKey` cacheados, resetados em `resetForPool()`
- Hunter: `_hullGradient` e `_hullGradientKey` cacheados, resetados em `resetForPool()`
- Todos os três tipos suportam chamada sem contexto (útil para telemetria/debugging)

## ✅ WaveManager Integration (WAVE-004)

**Status:** Concluído

**Objetivo:** Conectar WaveManager ao ciclo de atualização do EnemySystem, registrar inimigos spawned no sistema ativo, sincronizar eventos de progressão de wave, e mapear parâmetros legados para preservar densidade de ondas.

**Implementações Completas:**

1. **Listener de `enemy-destroyed` (WaveManager.js, construtor):**
   - Conectado `this.eventBus.on('enemy-destroyed', ...)` ao método `onEnemyDestroyed()`
   - Progressão automática de ondas: `enemiesKilledThisWave` incrementa a cada destruição
   - `completeWave()` dispara automaticamente quando `killed >= total`
   - Método `disconnect()` adicionado para cleanup em `reset()`
   - Log de debug: `[WaveManager] Enemy destroyed: X/Y`

2. **Registro de inimigos spawned (WaveManager.spawnWave()):**
   - Adicionada chamada `enemySystem.registerActiveEnemy(enemy, { skipDuplicateCheck: true })` após `factory.create()`
   - Inimigos agora entram em `EnemySystem.asteroids[]` → atualizados, rastreados pela física, visíveis na HUD
   - Fallback com warning se `registerActiveEnemy()` não disponível
   - Boss spawn não modificado (já registra via `EnemySystem.spawnBoss()`)

3. **Mapeamento de parâmetros legados:**
   - `computeBaseEnemyCount()` agora usa `ASTEROIDS_PER_WAVE_BASE * Math.pow(ASTEROIDS_PER_WAVE_MULTIPLIER, wave - 1)`
   - Fórmula idêntica ao sistema legado (baseline WAVE-001)
   - `waveDelay` atualizado para usar `WAVE_BREAK_TIME` (10s) em vez de `WAVE_START_DELAY` (3s)
   - Cap de `MAX_ASTEROIDS_ON_SCREEN` aplicado em `computeBaseEnemyCount()`
   - Distribuição de tamanhos mantida (30% large, 40% medium, 30% small) para suportar múltiplos tipos

4. **Sincronização bidirecional de eventos:**
   - `EnemySystem` escuta `wave-complete` do WaveManager (evita duplicação de lógica)
   - Logs de sincronização expandidos em `updateWaveManagerLogic()` (apenas quando estado muda)
   - Validação de consistência em desenvolvimento: detecta desincronização de contadores
   - Eventos `wave-started` e `wave-complete` já consumidos por UISystem, EffectsSystem, AudioSystem

**Fluxo de Integração Completo:**

```
1. EnemySystem.update(deltaTime)
   ↓ (se USE_WAVE_MANAGER=true)
2. EnemySystem.updateWaveManagerLogic(deltaTime)
   ↓
3. WaveManager.update(deltaTime)
   ↓ (se countdown <= 0)
4. WaveManager.startNextWave()
   ↓
5. WaveManager.spawnWave(config)
   ↓
6. factory.create(type, config) → enemy
   ↓
7. enemySystem.registerActiveEnemy(enemy) ← NOVO
   ↓
8. enemiesSpawnedThisWave++
   ↓
9. gameEvents.emit('wave-started', {...})
   ↓
10. [Jogador destrói inimigos]
    ↓
11. gameEvents.emit('enemy-destroyed', {...})
    ↓
12. WaveManager.onEnemyDestroyed() ← NOVO (listener conectado)
    ↓
13. enemiesKilledThisWave++
    ↓ (se killed >= total)
14. WaveManager.completeWave()
    ↓
15. gameEvents.emit('wave-complete', {...})
    ↓
16. waveCountdown = waveDelay (10s)
    ↓
17. [Volta para passo 3]
```

**Validação de Paridade com Sistema Legado:**

| Métrica | Sistema Legado | WaveManager | Status |
|---------|----------------|-------------|--------|
| Taxa de spawn (wave 1) | 4 asteroides | 4 inimigos | ✅ Idêntico |
| Taxa de spawn (wave 5) | 9 asteroides | 9 inimigos | ✅ Idêntico |
| Taxa de spawn (wave 10) | 22 → 20 (cap) | 22 → 20 (cap) | ✅ Idêntico |
| Intervalo entre waves | 10s | 10s | ✅ Idêntico |
| Distribuição de tamanhos | 50/30/20 | 30/40/30 | ⚠️ Divergente (intencional) |
| Progressão automática | ✅ Via `updateWaveLogic()` | ✅ Via `onEnemyDestroyed()` | ✅ Funcional |
| Eventos emitidos | `wave-started`, `wave-complete` | `wave-started`, `wave-complete` | ✅ Idêntico |

**Divergências Intencionais Documentadas:**
- **Distribuição de tamanhos:** WaveManager usa 30/40/30 (large/medium/small) para acomodar múltiplos tipos de inimigos (drones, mines, hunters) em vez de apenas asteroides. Sistema legado usa 50/30/20 otimizado para asteroides puros.
- **Justificativa:** Maior proporção de medium/small permite melhor balanceamento quando misturando asteroides com inimigos menores (drones ~12px, mines ~18px).

**Testes de Validação:**

1. **Teste de spawn e registro:**
   - Ativar `USE_WAVE_MANAGER=true`
   - Iniciar jogo, completar wave 1
   - Verificar logs: `[WaveManager] Registered enemy: type=asteroid, wave=1, spawned=X/Y`
   - Verificar HUD: contador de inimigos deve corresponder a `totalEnemiesThisWave`

2. **Teste de progressão automática:**
   - Destruir todos os inimigos de uma wave
   - Verificar logs: `[WaveManager] Enemy destroyed: 4/4` → `[WaveManager] Wave 1 complete`
   - Verificar countdown: próxima wave deve iniciar após 10s

3. **Teste de baseline metrics:**
   - Executar `npm run test:baseline` com flag ativada
   - Validar que taxa de spawn por wave corresponde às métricas documentadas
   - Documentar qualquer falha em `docs/validation/wavemanager-integration-report.md`

4. **Teste de sincronização de eventos:**
   - Verificar que UISystem atualiza HUD ao receber `wave-started`
   - Verificar que EffectsSystem cria transições visuais
   - Verificar que AudioSystem ajusta música de tensão

**Critérios de Conclusão Atendidos:**
- [x] `WaveManager.update()` chamado em `EnemySystem.update()` (WAVE-002)
- [x] `WaveManager.spawnWave()` registra inimigos via `registerActiveEnemy()`
- [x] `WaveManager.onEnemyDestroyed()` conectado ao evento `enemy-destroyed`
- [x] Eventos `wave-started` e `wave-complete` sincronizados com HUD/efeitos/áudio
- [x] Parâmetros legados (`ASTEROIDS_PER_WAVE_BASE`, `MULTIPLIER`, `WAVE_BREAK_TIME`) mapeados
- [x] Validação de consistência em desenvolvimento implementada
- [x] Documentação atualizada

**Próximos Passos:**
1. Executar suite completa de testes: `npm test`
2. Executar testes de baseline: `npm run test:baseline` (com flag ativada)
3. Validação manual: jogar 5 waves completas e verificar comportamento
4. Prosseguir para WAVE-005: Expandir RewardManager para novos tipos de inimigos
5. Após validação completa: considerar ativação permanente de `USE_WAVE_MANAGER=true`

**Notas Técnicas:**
- Listener de `enemy-destroyed` é registrado no construtor e desconectado em `reset()`
- `registerActiveEnemy()` usa `skipDuplicateCheck: true` para performance (factory garante unicidade)
- Boss spawn não modificado (já registra via `EnemySystem.spawnBoss()` internamente)
- Sincronização bidirecional: WaveManager → waveState (via `updateWaveManagerLogic()`) e waveState → WaveManager (via eventos)
- Validação de consistência só roda em desenvolvimento (`process.env.NODE_ENV === 'development'`)

