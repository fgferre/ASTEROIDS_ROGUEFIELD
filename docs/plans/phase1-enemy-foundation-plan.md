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
5. Contadores de `waveState` – ciclo de vida completo monitorado
6. Determinismo – sequência idêntica com seed fixa

**Próximos passos:**
- Executar `npm run test:baseline` antes de iniciar a integração do WaveManager
- Após cada alteração no WaveManager, reexecutar para confirmar paridade
- Documentar qualquer desvio intencional nas métricas baseline

**Critério de sucesso para migração:**
Todos os testes em `asteroid-baseline-metrics.test.js` devem passar com o WaveManager ativado, garantindo preservação do comportamento legado.
