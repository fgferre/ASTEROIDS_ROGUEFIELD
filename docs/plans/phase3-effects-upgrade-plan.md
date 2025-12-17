# Plano da Fase 3 – Efeitos Visuais e Feedback de Tela

## Objetivo

Aprimorar `EffectsSystem` e utilitários relacionados para oferecer feedback visual diferenciado aos novos inimigos e ao boss, incluindo partículas dedicadas, presets de screen shake e suporte a efeitos de câmera lenta.

## Componentes Principais

- `EffectsSystem` com novos listeners e geradores de partículas.
- `ScreenShake` com presets adicionais para os eventos introduzidos.
- Integração com eventos emitidos nas fases 1 e 2 (`enemy-fired`, `mine-exploded`, `boss-*`).

## Passos Detalhados

1. **Estender `EffectsSystem`:**

   - Registrar listeners para: `enemy-fired`, `mine-exploded`, `boss-spawned`, `boss-phase-changed`, `boss-defeated`.
   - Implementar métodos específicos:
     - `createDroneMuzzleFlash(position, direction)` – flash azul/branco curto.
     - `createHunterBurstEffect(position, direction)` – três flashes com leve variação angular.
     - `createMineExplosion(position, radius)` – explosão grande com shockwave e debris.
     - `createBossEntranceEffect(position)` – partículas dramáticas + screen shake `bossSpawn`.
     - `createBossPhaseTransition(boss, newPhase)` – partículas coloridas (fase1 azul, fase2 roxa, fase3 vermelha), freeze frame 0.3s, shake `bossPhaseChange`.
     - `createBossDefeatedExplosion(position)` – sequência multiestágio com freeze frame 0.5s, shake `bossDefeated`, flash global.
   - Atualizar `createAsteroidExplosion()` para aceitar tipo de inimigo e variar cor/intensidade conforme Drone/Mine/Hunter/Boss.

2. **Gerenciamento de Camera Slow/Fast:**

   - Garantir que `EffectsSystem.update(deltaTime)` suporte congelamentos curtos (freeze frame) retornando `modifiedDeltaTime` quando ativo.
   - Resetar estados de freeze ao fim da duração, mantendo compatibilidade com outros efeitos existentes.

3. **Adicionar Presets em `ScreenShake.js`:**

   - Estender `ShakePresets` com: `droneDestroyed`, `mineExplosion`, `hunterDestroyed`, `bossSpawn`, `bossPhaseChange`, `bossDefeated`, `bossAttack` (valores definidos no plano original).
   - Documentar uso em comentários para orientar futuros gatilhos.

4. **Integração com Sistemas:**
   - Garantir que `EnemySystem` invoque os novos métodos quando eventos forem recebidos (ex.: `handleMineExplosion` chamar `createMineExplosion`).
   - Permitir que o `WaveManager` ou `EnemySystem` emitam `boss-spawned` imediatamente antes do efeito de entrada para sincronização com áudio.

## Critérios de Conclusão

- Eventos de drones, mines, hunters e boss disparam efeitos visuais distintos e reconhecíveis.
- Screen shake utiliza presets dedicados, alinhando intensidade com cada evento.
- Freeze frames não quebram o loop principal e respeitam durações configuradas.

## Dependências

- Requer fases 1 e 2 implementadas para que os eventos sejam emitidos.
- Fornece ganchos visuais necessários para as mudanças de áudio (Fase 4) e HUD (Fase 5) oferecerem feedback consistente.
