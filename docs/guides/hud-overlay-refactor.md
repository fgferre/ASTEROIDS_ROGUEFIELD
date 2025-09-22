# Guia de Refatoração: HUD como Overlay Responsivo

## Estado Atual Confirmado
- O `#game-ui` usa uma grid de uma célula para empilhar `#hud-root`, `.game-field` e `.controls`, mas o padding vertical do contêiner e a margem do HUD reservam espaço acima do canvas em vez de tratá-lo como uma camada sobreposta.
- `.game-field` mantém o canvas com `width: fit-content` e o elemento `.game-field__overlay` já fornece um plano absoluto usado para o contador de ondas.
- `UISystem.updateViewportScaling` calcula um fator de escala a partir da altura/ largura do viewport *subtraindo* uma área fixa para o HUD, aplica o tamanho resultante via `style.width/height` e ainda ajusta variáveis CSS e a escala automática do HUD.
- A simulação assume dimensões internas fixas (`GAME_WIDTH = 800`, `GAME_HEIGHT = 600`) reutilizadas por `PlayerSystem`, `EnemySystem`, `RenderingSystem` e demais sistemas para física, respawns e desenho. Alterar os atributos `canvas.width`/`canvas.height` exige uma revisão global do loop de jogo.

### Riscos Observados
- **Sequência de inicialização**: o `UISystem` registra eventos, inicializa o scaling e publica referências no `ServiceLocator` ainda no construtor. Reordenar responsabilidades pode quebrar outros sistemas que consultam o HUD imediatamente após o boot.
- **Loop de atualização**: `refreshHudFromServices` roda a cada quadro; mudanças que recriam elementos precisam ser evitadas para não degradar FPS.
- **Pointer events**: `.game-field__overlay` usa `pointer-events: none`. Qualquer elemento clicável dentro do HUD precisará reativar eventos manualmente.
- **Responsividade existente**: breakpoints móveis (`@media (max-width: 900px)`) assumem o padding atual do `#game-ui`. Qualquer alteração estrutural deve ser validada também nesses contextos.
- **Compatibilidade com `hudElements`/`domRefs`**: os IDs atuais (`#hud-primary`, `#hud-wave`, `#hud-xp`) são utilizados pelos listeners de `gameEvents`. Reorganizações precisam preservar ou adaptar esses mapeamentos sem deixar referências órfãs.

## Objetivos da Refatoração
1. Converter o HUD em overlay real, sem reduzir o espaço útil do canvas.
2. Preservar a proporção 4:3 e a resolução lógica de 800×600, escalando apenas a apresentação.
3. Permitir posicionamento modular dos indicadores (cantos e centro inferior) sem quebrar o fluxo data-driven do `hudLayout.js`.
4. Evoluir os componentes para versões visuais (barras, ícones) com microinterações, mantendo acessibilidade e eventos existentes.

## Diretrizes Transversais
- **Mudanças atômicas**: mantenha cada entrega pequena (< 300 linhas) e validada com `npm run build`/`npm run test` antes de prosseguir.
- **Dados centralizados**: continue evoluindo `hudLayout.js` e tokens CSS ao invés de espalhar valores mágicos pela lógica.
- **Acessibilidade**: preserve `aria-live`, `role` e hierarquia semântica ao mover elementos.
- **Rastreamento**: toda fase deve atualizar este guia com descobertas relevantes e registrar decisões no `historico_do_projeto.txt`.
- **Limpeza de recursos**: novos observers/listeners precisam ser cancelados no teardown do `UISystem`.

## Fase 0 — Auditoria e Baseline
1. **Congelar baseline visual**
   - Capturar screenshots ou gravar métricas de `canvas.style.width/height` e `getBoundingClientRect()` em larguras representativas (1024×576, 1280×720, 1920×1080).
   - Registrar valores atuais de `--game-canvas-*` e `--hud-max-width` gerados pelo `UISystem` para comparar após a refatoração.
2. **Mapear dependências e sequência de inicialização**
   - Revisar `UISystem.cacheStaticNodes()`, `setupHudLayout()` e as inscrições de `gameEvents` para listar todos os IDs/classe esperados.
   - Confirmar a ordem de registro no `ServiceLocator` e os serviços que consultam `UISystem` imediatamente (ex.: `ProgressionSystem`).
3. **Checar tooling disponível**
   - Garantir que `npm install` já foi executado e que os comandos `npm run build` e `npm run test` rodam sem erros.
4. **Planejar validações manuais**
   - Definir cenários mínimos de teste (pausa, jogo ativo, HUD animado) e registrar no `docs/validation/test-checklist.md` se necessário.

**Validações obrigatórias da fase:**
- `npm run build`
- `npm run test` (atualmente sem testes implementados, mas mantém a verificação integrada)

## Fase 1 — Layout em Overlay (sem alterar o conteúdo do HUD)
1. **Preparar o contêiner overlay**
   - Garantir que `.game-field__overlay` ocupe 100% da área do canvas (`inset: 0`) e mantenha `pointer-events: none` por padrão.
   - Adicionar uma classe utilitária (ex.: `.hud-interactive-area`) com `pointer-events: auto` para uso futuro sem quebrar o overlay.
2. **Reestruturar o HTML**
   - Mover `#hud-root` para dentro de `.game-field__overlay`, mantendo `#hud-primary`, `#hud-wave` e `#hud-xp` intactos.
   - Manter o contador de ondas como filho da overlay, garantindo que `id="wave-countdown"` permaneça acessível e que `domRefs.waveCountdown` continue válido.
   - Garantir que não existam elementos duplicados com o mesmo `id` e que o HUD permaneça após o canvas na árvore para não quebrar estilos dependentes de ordem.
3. **Ajustar o CSS base**
   - Remover ou reduzir o `padding-top`/`padding-bottom` de `#game-ui` agora que o HUD ficará dentro da overlay, preservando o espaçamento lateral existente.
   - Atualizar `.game-field` para expandir até o limite definido por `--game-canvas-width`/`height`, mantendo `width: min(100%, var(--game-canvas-width, 100%))` e assegurando que controles continuam alinhados.
   - Ajustar `.game-field__overlay` para suportar múltiplos filhos (HUD + contador). Um wrapper flex interno pode facilitar espaçamentos temporários.
4. **Conferir caches e listeners**
   - Validar que `UISystem.cacheStaticNodes()` encontra `#hud-root` após a migração e que `hudElements.wave`/`hudElements.xp` continuam sendo populados.
   - Confirmar que `gameEvents.on('wave-state-updated', ...)` e demais handlers não quebram por alterações na hierarquia.
5. **Manter o escalonamento atual temporariamente**
   - Continuar invocando `updateViewportScaling` para preservar o comportamento de redimensionamento até que o `overlaySafeArea` seja removido (Fase 2).

**Validações da fase:**
- `npm run build`
- Smoke manual: verificar em 1280×720 e 1920×1080 se o HUD sobrepõe o canvas sem desalinhamentos, se o contador de ondas continua visível e se o menu de pausa permanece acessível.

## Fase 2 — Revisão da Lógica de Escala
1. **Refatorar `updateViewportScaling`**
   - Manter o cálculo baseado na resolução lógica (800×600), mas eliminar o `overlaySafeArea`, usando o tamanho real de `#game-ui`/`.game-field` para definir o `scale`.
   - Calcular `availableWidth`/`availableHeight` considerando apenas o padding atual do contêiner e preservar `scale = 1` sempre que o viewport permitir.
   - Continuar atualizando `--game-canvas-width`, `--game-canvas-height` e `--hud-max-width`; valide se o novo cálculo mantém coerência com o CSS existente.
   - Conservar `updateHudScale` para ajustar `--hud-scale-effective` e manter responsividade tipográfica.
2. **Garantir estabilidade do loop**
   - Atualizar apenas propriedades necessárias (`style.width`/`height`, variáveis CSS) sem recriar nós ou forçar layouts caros dentro de `refreshHudFromServices`.
   - Validar que `initializeViewportScaling` e `handleResize` continuam usando `requestAnimationFrame` para debouncing.
3. **Introduzir observador de redimensionamento (opcional)**
   - Caso use `ResizeObserver`, encapsular a inscrição para permitir `disconnect()` no teardown do `UISystem`.
   - Avaliar se o observer deve acompanhar o container do HUD para detectar crescimento por futuros componentes interativos.
4. **Preservar o canvas lógico**
   - Não alterar `canvas.width`/`canvas.height`, apenas `style.width`/`style.height`, garantindo compatibilidade com sistemas de gameplay.
5. **Atualizar tokens CSS conforme necessário**
   - Se `--hud-max-width` passar a depender da largura atual do canvas, ajustar limites mínimos/máximos para evitar clipping em viewports estreitos e registrar alterações nos design tokens.

**Validações da fase:**
- `npm run build`
- Medir `canvas.getBoundingClientRect()` em resoluções pequenas (por exemplo 1024×576) para garantir que a proporção 4:3 é preservada sem barras laterais inesperadas.
- Monitorar o console por warnings/erros durante redimensionamentos consecutivos para confirmar que o debounce e os observers estão funcionando.

## Fase 3 — Distribuição Modular do HUD
1. **Estender o schema de layout**
   - Adicionar a cada item de `hudLayout.js` um campo `position` (`'top-left'`, `'top-right'`, `'bottom-left'`, `'bottom-right'`, `'bottom-center'`) com default `'top-left'` para manter compatibilidade.
   - Registrar no arquivo um comentário curto sobre cada posição esperada para orientar futuros colaboradores.
2. **Atualizar o HTML do HUD**
   - Dentro de `#hud-root`, criar contêineres vazios (`div.hud-slot`) para cada posição.
   - Incluir `data-slot` ou classes utilitárias para facilitar a seleção programática.
   - Manter temporariamente um wrapper (`#hud-primary`) até que todo o layout esteja distribuído, evitando regressões durante migração incremental.
3. **Refatorar `setupHudLayout`**
   - Selecionar o slot apropriado com base em `itemConfig.position`; se não existir, registrar um warning e cair para o slot padrão.
   - Permitir empilhamento de múltiplos itens no mesmo slot sem reordenar DOM a cada atualização.
   - Continuar usando `createHudItem`, mas atualizar `hudElements` para guardar referências adicionais (por exemplo `slot` ou `elements.pips`).
4. **Manter caches e handlers**
   - Validar que `hudElements` ainda fornece `root`/`value` para cada item usado pelos listeners (`handleHealthChange`, `updateXPBar`, etc.).
   - Atualizar testes manuais/automação para garantir que eventos continuam disparando após a reorganização.
5. **CSS para slots**
   - Posicionar cada slot com `position: absolute` dentro da overlay, utilizando `inset` apropriado e espaçamentos responsivos via `clamp`.
   - Avaliar `gap`/`flex-direction` por slot para acomodar múltiplos cards sem jitter.
6. **Revisar acessibilidade**
   - Confirmar que `aria-live`, `role` e descrições permanecem intactos e que a ordem de leitura continua lógica mesmo com alterações visuais.

**Validações da fase:**
- `npm run build`
- Checklist manual: alternar entre jogo ativo e pausa para garantir que os slots mantenham `z-index` correto, que o HUD não desloca o canvas e que navegabilidade por teclado não seja obstruída.

## Fase 4 — Redesign Visual e Microinterações
1. **Vida como barra dinâmica**
   - Atualizar `createHudItem` para o tipo `health` gerar um contêiner com barra preenchível (`<div class="hud-bar"><div class="hud-bar__fill"></div></div>`), garantindo que `aria-valuenow`/`aria-valuemax` reflitam o estado atual.
   - Adaptar `handleHealthChange` para controlar `width`/`data-state` da barra, reutilizando a lógica existente de `damage-flash` e evitando reflow completo a cada frame.
2. **Escudo com ícones individuais**
   - Criar elementos repetidos (por exemplo `span` com classe `.hud-shield-pip`) e armazená-los no cache de `hudElements` para alternar estados (`ativo`, `consumido`, `cooldown`).
   - Integrar com `flashShieldFailure` e garantir que remoção/adição de classes não interrompe animações em andamento.
3. **XP/Level up**
   - Mover a barra de XP para o slot inferior central, mantendo o elemento atual com estilização renovada e garantindo que `updateXPBar` continue atualizando tanto texto quanto barra.
   - Preparar o slot inferior para futuras notificações (ex.: level up) sem causar mudanças abruptas de layout.
4. **Feedback visual e microinterações**
   - Implementar classes CSS para animações (`.is-damaged`, `.gained-xp`, `.shield-hit`) usando `@keyframes`, removendo-as após `animationend` para não acumular classes órfãs.
   - Garantir que elementos com `pointer-events: auto` (se houver) mantenham foco visível e não sejam mascarados por `pointer-events: none` da overlay.
5. **Ajustes finos**
   - Revisar contrastes usando os design tokens existentes (`--color-*`) e atualizá-los se necessário.
   - Atualizar o checklist de validação com novos cenários (barra de vida piscando, ícones de escudo reduzindo, animação de XP) e documentar limitações conhecidas.

**Validações da fase:**
- `npm run build`
- Exercitar manualmente eventos (tomar dano, subir de nível, ativar escudo) para garantir que as microinterações disparam corretamente.
- Monitorar FPS aproximado durante sessões de 3–5 minutos para validar que animações não geraram regressões perceptíveis.

## Fase 5 — Pós-refatoração
1. **Documentação**
   - Registrar as mudanças de layout/escala neste guia e avaliar se `agents.md` ou outros documentos precisam de atualização.
   - Atualizar o `docs/validation/test-checklist.md` com os novos cenários validados.
2. **Histórico de decisões**
   - Atualizar `historico_do_projeto.txt` com um resumo da migração para overlay e decisões de escala.
3. **Monitoramento contínuo**
   - Criar tarefas futuras para medir performance (FPS), testar monitores ultrawide e acompanhar a experiência em dispositivos touch.
   - Planejar follow-ups para incorporar feedback visual/UX coletado após a refatoração.

---
Este plano mantém o canvas lógico em 800×600, evita alterações bruscas nos sistemas de física/renderização e estrutura a migração em incrementos auditáveis, permitindo validar cada etapa com builds e inspeções manuais antes de avançar para o redesign visual.
