# Plano da Fase 5 – HUD Tático e Feedback de Progressão

## Objetivo

Estender a HUD com componentes táticos (minimapa, indicadores de ameaça, combo meter e barra de vida do boss), sincronizando-os com os eventos e dados introduzidos nas fases anteriores.

## Componentes Principais

- `hudLayout.js` mantendo o contrato de layout único e expondo os pontos de montagem do HUD tático.
- `AAAHudLayout` e `UISystem` responsáveis por renderizar e atualizar os componentes.
- `style.css` com estilos dedicados.
- `ProgressionSystem` gerenciando combo e multiplicadores.

## Passos Detalhados

1. **Atualizar `hudLayout.js` e `AAAHudLayout`:**

   - Adicionar pontos de montagem e metadados ao layout tático único:
     - `minimap` (canvas 120x120 no canto superior direito, range 300, `rootId: 'hud-minimap'`).
     - `threatIndicators` (overlay central com `rootId: 'threat-indicators-container'`).
     - `comboMeter` (grupo `tactical-vitals`, ícone 🔥, `rootId: 'hud-combo'`, `valueId: 'combo-display'`).
   - Incluir metadados necessários (descrições, acessibilidade via `ariaLive`, referências de classes CSS).

2. **Evoluir `UISystem`:**

   - Listeners: `enemy-destroyed`, `combo-updated`, `combo-broken`, `boss-spawned`, `boss-phase-changed`, `boss-defeated`.
   - Implementar métodos:
     - `updateComboMeter(comboCount, multiplier)` – atualiza valor exibido, aplica classe `combo-high` para combos ≥5, animação pulsante.
     - `renderMinimap(ctx)` – converte posições do player e inimigos (`PhysicsSystem.getNearbyEnemies`) para o canvas, usando cores distintas por tipo (asteroids cinza, drones azul, mines laranja, hunters roxo, boss vermelho).
     - `updateThreatIndicators()` – cria/posiciona elementos DOM apontando direção de inimigos fora da tela com animação `threat-pulse`.
     - `showBossHealthBar(boss)` / `updateBossHealthBar(health, maxHealth, phase)` – exibe barra com cores por fase e indicador textual.
   - Integrar atualizações a `refreshHUD()` garantindo que minimapa e indicadores sejam recalculados a cada frame.
   - Manter limpeza dos elementos ao reset ou fim da luta (`boss-defeated`).

3. **Adicionar Combo ao `ProgressionSystem`:**

   - Propriedades: `currentCombo`, `comboTimer`, `comboTimeout` (3s), `comboMultiplier`.
   - Eventos: escutar `enemy-destroyed` para incrementar combo e resetar timer; emitir `combo-updated` com { comboCount, multiplier }.
   - `update(deltaTime)`: decrementar `comboTimer`, emitir `combo-broken` e resetar quando tempo expirar.
   - `collectXP(amount)`: aplicar multiplicador antes de registrar XP.
   - `resetCombo()` em caminhos de morte/reset.

4. **Estender `style.css`:**
   - Classes: `.hud-minimap`, `.minimap-canvas`, `.threat-indicators-container`, `.threat-indicator`, `.hud-combo`, `.combo-multiplier`, `.combo-high`, `.boss-health-bar-container`, `.boss-health-bar-fill`, `.boss-name`, `.boss-phase-indicator`.
   - Variáveis CSS: `--boss-phase-1-color`, `--boss-phase-2-color`, `--boss-phase-3-color`.
   - Animações: `@keyframes combo-pulse`, `@keyframes threat-pulse`, `@keyframes boss-health-pulse`.
   - Regras responsivas para telas menores (reduzir tamanho do minimapa, adaptar posicionamento do combo).

## Critérios de Conclusão

- HUD exibe minimapa, indicadores de ameaça e combo operacionais durante gameplay.
- Barra de vida do boss aparece apenas em ondas de boss e reflete mudanças de fase.
- Combo influencia XP coletada e possui feedback visual/auditivo consistente.
- Estilos respeitam tokens existentes e não interferem na montagem atual do HUD tático.

## Dependências

- Requer fases 1 e 2 (dados de inimigos, eventos de boss) e a fase 4 (para reforçar feedback auditivo quando o combo aumenta ou boss altera fase).
- Fecha o ciclo de feedback ao combinar dados de progressão com VFX/Áudio estabelecidos anteriormente.
