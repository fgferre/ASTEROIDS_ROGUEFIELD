# Plano da Fase 2 – Sistema de Boss Multi-Fases

## Objetivo

Introduzir um inimigo chefe (`BossEnemy`) com comportamento multi-fase, integrando seu ciclo de vida ao `WaveManager`, `EnemySystem`, efeitos, áudio e HUD. A cada 5 ondas, o jogo deve alternar para uma experiência de boss com suporte a inimigos auxiliares.

## Componentes Principais

- **BossEnemy (`src/modules/enemies/types/BossEnemy.js`)** com três fases distintas.
- **Configurações** em `GameConstants.BOSS_CONFIG` e `GameConstants.WAVE_BOSS_INTERVAL`.
- **Pools** dedicados ao boss em `GamePools`.
- **WaveManager** com detecção de ondas de boss e geração de suporte.
- **EnemySystem** com handlers específicos (`boss-spawned`, `boss-phase-changed`, `boss-defeated`).
- **PhysicsSystem**, **RenderingSystem**, **EffectsSystem**, **AudioSystem** e **UISystem** atualizados para lidar com bosses.

## Passos Detalhados

1. **Criar `BossEnemy.js`:**

   - Estender `BaseEnemy` e definir propriedades: `currentPhase`, `phaseThresholds`, `attackPatterns`, `attackTimer`, `invulnerableTimer`.
   - Implementar `initialize(config)` para aplicar escala de vida/velocidade baseada na onda atual.
   - `onUpdate(deltaTime)`: verificar transições de fase, aplicar invulnerabilidade temporária e executar padrões de ataque:
     - **Fase 1:** dispersão lenta de projéteis.
     - **Fase 2:** projéteis rápidos + spawn de minions (reutilizar pools de Drone/Hunter).
     - **Fase 3:** rajadas rápidas + investidas (alterar velocidade momentaneamente).
   - Sobrescrever `takeDamage(amount, source)` para bloquear dano durante `invulnerableTimer` e emitir `boss-phase-changed` quando cruzar thresholds.
   - `onDestroyed()`: emitir `boss-defeated` com dados de recompensa.
   - Visual: nave imponente com variação de cor por fase em `onDraw(ctx)`.

2. **Atualizar `GameConstants.js`:**

   - Adicionar `BOSS_CONFIG` com propriedades: `health: 1500`, `healthScaling: 1.2`, `speed: 60`, `radius: 60`, `phaseCount: 3`, `phaseThresholds: [0.66, 0.33]`, `invulnerabilityDuration: 2.0`, `spawnInterval: 5`.
   - Incluir presets de partículas (cores para transição de fase, explosão final) e shakes específicos (`bossSpawn`, `bossPhaseChange`, `bossDefeated`).
   - Declarar frequências de áudio (`boss-roar`, `boss-phase-change`, `boss-defeated`).

3. **Ampliar `GamePools.js`:**

   - Criar `bosses` pool com capacidades inicial/max (1/3).
   - Método `initializeBossPool()` configurando factory e reset apropriados.
   - Incluir o novo pool em todos os utilitários (`releaseAll`, `autoManageAll`, `getPoolStats`, etc.).

4. **Integrar `EnemySystem`:**

   - Registrar tipo `boss` apontando para `BossEnemy` e `GamePools.bosses`.
   - Adicionar listeners: `gameEvents.on('boss-spawned'| 'boss-phase-changed'| 'boss-defeated', ...)` direcionando para efeitos/áudio/UI.
   - Criar `handleBossPhaseChange(data)` para encaminhar efeitos e atualizar HUD.
   - Garantir que `handleEnemyProjectile` suporte padrões do boss (dano variável, spreads, charges).

5. **Evoluir `WaveManager`:**

   - Função `isBossWave(waveNumber)` baseada em `GameConstants.WAVE_BOSS_INTERVAL` (5).
   - `generateBossWave(waveNumber)` criando configuração com 1 boss + 2-3 suportes (drones/hunters conforme progresso).
   - `startNextWave()` deve emitir `boss-wave-started` e disparar spawn especial quando aplicável.
   - Aplicar lógica de posicionamento inicial do boss (centro ou animação de entrada fora da tela).

6. **PhysicsSystem:**

   - Ajustar colisões para considerar raio ampliado do boss.
   - Adicionar hooks para ataques específicos (ex.: carga do boss usa detecção customizada).
   - Garantir que `getNearbyEnemies()` inclua bosses para efeitos e áudio.

7. **RenderingSystem:**

   - Implementar `drawEnemyProjectile` (compartilhada com Fase 1) para renderizar projéteis do boss com cores distintas.
   - Criar `drawBossHealthBar(ctx, boss)` e integrar ao fluxo principal quando um boss estiver ativo.
   - Adicionar efeitos visuais durante transições (glow, mudança de cor na borda da tela).

8. **EffectsSystem:**

   - Eventos novos: `boss-spawned`, `boss-phase-changed`, `boss-defeated`.
   - Métodos:
     - `createBossEntranceEffect(position)` com screen shake `bossSpawn`.
     - `createBossPhaseTransition(boss, phase)` (freeze frame de 0.3s, partículas coloridas, shake `bossPhaseChange`).
     - `createBossDefeatedExplosion(position)` (explosão multiestágio, freeze frame 0.5s, shake `bossDefeated`).
   - Garantir que `update()` trate efeitos de câmera lenta ativados nesses eventos.

9. **AudioSystem:**

   - Handlers: `playBossRoar()`, `playBossPhaseChange()`, `playBossDefeated()`.
   - Integrar com sistema de camadas musicais (ver Fase 4) ajustando intensidade para níveis máximos durante a luta e reduzindo após a derrota.

10. **UISystem:**
    - Exibir barra de vida do boss (`showBossHealthBar`, `updateBossHealthBar`).
    - Atualizar indicador de fase com cores (fase 1 azul, fase 2 roxa, fase 3 vermelha).
    - Reagir a `boss-wave-started` e `boss-defeated` (mostrar banners ou mensagens temporárias).

## Critérios de Conclusão

- Toda 5ª onda gera um boss com suporte adequado sem quebrar o fluxo de waves comuns.
- Boss alterna fases corretamente e emite eventos correspondentes.
- HUD, efeitos e áudio refletem mudanças de fase e derrota.
- Pools e estatísticas reconhecem o boss e liberam recursos ao final da luta.

## Dependências e Próximos Passos

- Requer Fase 1 concluída (minions, projéteis inimigos, APIs genéricas de inimigos).
- Fases 3 e 4 utilizarão os eventos de boss para adicionar VFX e áudio mais elaborados; este plano já define os hooks que serão enriquecidos nas próximas etapas.
