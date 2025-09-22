# Guia de Refatoração: HUD como Overlay Responsivo

## Estado Atual Confirmado
- O `#game-ui` usa uma grid de uma célula para empilhar `#hud-root`, `.game-field` e `.controls`, mas o padding vertical do contêiner e a margem do HUD reservam espaço acima do canvas em vez de tratá-lo como uma camada sobreposta.
- `.game-field` mantém o canvas com `width: fit-content` e o elemento `.game-field__overlay` já fornece um plano absoluto usado para o contador de ondas.
- `UISystem.updateViewportScaling` calcula um fator de escala a partir da altura/ largura do viewport *subtraindo* uma área fixa para o HUD, aplica o tamanho resultante via `style.width/height` e ainda ajusta variáveis CSS e a escala automática do HUD.
- A simulação assume dimensões internas fixas (`GAME_WIDTH = 800`, `GAME_HEIGHT = 600`) reutilizadas por `PlayerSystem`, `EnemySystem`, `RenderingSystem` e demais sistemas para física, respawns e desenho. Alterar os atributos `canvas.width`/`canvas.height` exige uma revisão global do loop de jogo.

## Objetivos da Refatoração
1. Converter o HUD em overlay real, sem reduzir o espaço útil do canvas.
2. Preservar a proporção 4:3 e a resolução lógica de 800×600, escalando apenas a apresentação.
3. Permitir posicionamento modular dos indicadores (cantos e centro inferior) sem quebrar o fluxo data-driven do `hudLayout.js`.
4. Evoluir os componentes para versões visuais (barras, ícones) com microinterações, mantendo acessibilidade e eventos existentes.

## Fase 0 — Preparação e Segurança
1. **Congelar baseline visual:** capturar screenshots ou gravar métricas de `canvas.style.width/height` em diferentes larguras de janela para comparar após a refatoração.
2. **Mapear dependências do HUD:** revisar `hudLayout.js`, `UISystem.setupHudLayout()` e os listeners de eventos (`player-took-damage`, `experience-changed`, etc.) para confirmar quais elementos são atualizados dinamicamente.
3. **Checar tooling disponível:** garantir que `npm install` já foi executado e que os comandos `npm run build` e `npm run test` rodam sem erros.

**Validações obrigatórias da fase:**
- `npm run build`
- `npm run test` (atualmente sem testes implementados, mas mantém a verificação integrada)

## Fase 1 — Layout em Overlay (sem alterar o conteúdo do HUD)
1. **Reestruturar o HTML:**
   - Mover `#hud-root` para dentro de `.game-field__overlay`, mantendo `#hud-primary`, `#hud-wave` e `#hud-xp` intactos.
   - Manter o contador de ondas existente como filho da overlay, garantindo que `id="wave-countdown"` permaneça disponível para o `UISystem`.
   - Garantir que não existam elementos duplicados com o mesmo `id`.
2. **Ajustar o CSS de base:**
   - Remover ou reduzir o `padding-top`/`padding-bottom` de `#game-ui` agora que o HUD ficará dentro da overlay.
   - Atualizar `.game-field` para ocupar 100% da largura disponível do grid (usar `width: min(100%, var(--game-canvas-width, 100%))` ou definir `max-width` pelo custom property já aplicado pelo `UISystem`).
   - Ajustar `.game-field__overlay` para `justify-content: space-between` ou criar um wrapper adicional que permita posicionar o HUD e o contador simultaneamente.
   - Garantir `pointer-events: none` na overlay e habilitar `pointer-events: auto` nos elementos que precisarem de clique (caso futuro).
3. **Manter o escalonamento atual temporariamente:** continuar chamando `updateViewportScaling` para preservar o comportamento de redimensionamento, mesmo antes de remover a área reservada.
4. **Conferir o cache de nós:** confirmar que `UISystem.cacheStaticNodes()` continua encontrando `#hud-root` e `.game-field` após a mudança.

**Validações da fase:**
- `npm run build`
- Smoke manual: verificar em 1280×720 e 1920×1080 se o HUD sobrepõe o canvas sem desalinhamentos e se o contador de ondas continua visível.

## Fase 2 — Revisão da Lógica de Escala
1. **Refatorar `updateViewportScaling`:**
   - Manter o cálculo baseado na resolução lógica (800×600), mas eliminar o `overlaySafeArea` e usar o tamanho real de `#game-ui`/`.game-field` para definir o `scale`.
   - Calcular `availableWidth`/`availableHeight` considerando apenas o padding atual do contêiner, permitindo que o canvas busque `scale = 1` sempre que possível.
   - Continuar atualizando `--game-canvas-width`, `--game-canvas-height` e `--hud-max-width`, pois o CSS depende desses valores.
   - Conservar `updateHudScale` para ajustar `--hud-scale-effective` e manter responsividade tipográfica.
2. **Introduzir observador de redimensionamento (opcional):** caso o layout passe a depender do tamanho real de `.game-field`, usar `ResizeObserver` para disparar `updateViewportScaling` quando o contêiner mudar (útil se o HUD ganhar botões com `pointer-events: auto`).
3. **Garantir que o canvas lógico permaneça 800×600:** não alterar `canvas.width`/`canvas.height`, apenas `style.width`/`style.height`.
4. **Atualizar tokens de CSS se necessário:** se `--hud-max-width` passar a depender da largura atual do canvas, ajustar os limites mínimos/máximos para evitar clipping em viewports estreitos.

**Validações da fase:**
- `npm run build`
- Medir `canvas.getBoundingClientRect()` em resoluções pequenas (por exemplo 1024×576) para garantir que a proporção 4:3 é preservada sem barras laterais inesperadas.

## Fase 3 — Distribuição Modular do HUD
1. **Estender o schema de layout:** adicionar a cada item de `hudLayout.js` um campo `position` (`'top-left'`, `'top-right'`, `'bottom-left'`, `'bottom-right'`, `'bottom-center'`). Definir um padrão `'top-left'` para manter compatibilidade.
2. **Atualizar o HTML do HUD:** dentro de `#hud-root`, criar contêineres vazios para cada posição (`div` com classes como `.hud-slot` + modificadores) e manter um fallback (`#hud-primary`) até migrar todos os itens.
3. **Refatorar `setupHudLayout`:**
   - Selecionar o slot apropriado com base em `itemConfig.position`.
   - Permitir que vários itens compartilhem o mesmo slot (por exemplo, empilhar vida e escudo no canto superior esquerdo).
   - Manter a criação dos elementos via `createHudItem` para reaproveitar lógica existente.
4. **CSS para slots:** posicionar cada slot com `position: absolute` dentro da overlay, utilizando `inset` apropriado e espaçamentos responsivos via `clamp`. Manter `gap` interno para múltiplos cards.
5. **Revisar acessibilidade:** confirmar que `aria-live`, `role` e descrições continuam intactos após a migração para novos contêineres.

**Validações da fase:**
- `npm run build`
- Checklist manual: alternar entre jogo ativo e pausa para garantir que os slots mantenham z-index correto e que o HUD não desloca o canvas.

## Fase 4 — Redesign Visual e Microinterações
1. **Vida como barra dinâmica:**
   - Atualizar `createHudItem` para o tipo `health` gerar um contêiner com barra preenchível (`<div class="hud-bar"><div class="hud-bar__fill"></div></div>`).
   - Adaptar `handleHealthChange` para controlar `width`/`data-state` da barra e disparar efeito de dano.
2. **Escudo com ícones individuais:**
   - Criar elementos repetidos (por exemplo `span` com classe `.hud-shield-pip`) e armazená-los no cache de `hudElements` para alternar estados (`ativo`, `consumido`, `cooldown`).
3. **XP/Level up:**
   - Mover a barra de XP para o slot inferior central, mantendo o elemento atual mas com estilização renovada.
4. **Feedback visual:**
   - Implementar classes CSS para animações (`.is-damaged`, `.gained-xp`, `.shield-hit`) usando `@keyframes` e remover as classes após `animationend`.
   - Integrar com os eventos já emitidos (`player-took-damage`, `experience-changed`, `shield-deflected`).
5. **Ajustes finos:**
   - Revisar contrastes usando os design tokens existentes (`--color-*`).
   - Atualizar o checklist de validação com novos cenários (barra de vida piscando, ícones de escudo reduzindo, etc.).

**Validações da fase:**
- `npm run build`
- Exercitar manualmente eventos (tomar dano, subir de nível, ativar escudo) para garantir que as microinterações disparam corretamente.

## Fase 5 — Pós-refatoração
1. **Documentação:** registrar as mudanças de layout/escala neste guia e em `agents.md` (se necessário) para alinhar novos colaboradores.
2. **Histórico de decisões:** atualizar `historico_do_projeto.txt` com um resumo da migração para overlay.
3. **Monitoramento:** criar tarefas futuras para medir performance (FPS) e avaliar se o escalonamento em monitores ultrawide exige ajustes adicionais.

---
Este plano mantém o canvas lógico em 800×600, evita alterações bruscas nos sistemas de física/renderização e estrutura a migração em incrementos auditáveis, permitindo validar cada etapa com builds e inspeções manuais antes de avançar para o redesign visual.
