# Plano Mestre de Implementação da Pasta `docs`

**Atualizado em 2025-10-11 (revisão pós-auditoria de código).** Este plano mantém somente o que ainda precisa ser entregue com base nos documentos arquivados em `docs/archive/2025-plan/` e na varredura completa do código atual.

## 1. Entregas comprovadas
- **Motor, propulsão e progressão** — `ProgressionSystem` já opera com a biblioteca de upgrades agressivos e eventos de boost descritos nos guias arquivados (`src/data/upgrades.js`). Nenhuma ação adicional é necessária.
- **Gerenciamento de ondas e recompensas** — `EnemySystem` inicializa `WaveManager` e `RewardManager` ativos, sincronizando estatísticas e drops com o restante dos sistemas (`src/modules/EnemySystem.js`, `src/modules/enemies/managers/RewardManager.js`).
- **Correção do XP Drop** — O cálculo de multiplicadores de XP usa diretamente os fatores parametrizados em `GameConstants`, refletindo o diagnóstico feito em `orb-reward-mechanics-analysis.md.old`.
- **Tela inicial 3D e overlays acessíveis** — `MenuBackgroundSystem` carrega Three.js/Cannon-es para o fundo animado e o `UISystem` já oferece preferências de acessibilidade como HUD em alto contraste, redução de movimento e paleta assistiva.

## 2. UI e Experiência do Jogador

### 2.1 HUD sobreposto sem bordas extras (⚠️ pendente)
- **Fontes:** `hud-redesign-proposal.md`, `hud-refined-redesign.md`, `hud-overlay-refactor.md`, `Guia_impllementação_Melhorias_UIUX`.
- **Diagnóstico atual:** `#game-ui` mantém `padding` superior/inferior/lateral e o `hud-root` aplica `margin-top` e largura máxima, o que continua reservando espaço físico ao redor do canvas. O escalonamento em `UISystem.updateViewportScaling()` ainda calcula um "reservado" horizontal fixo de 48px além dos paddings, impedindo o HUD de funcionar como overlay puro.
- **Checklist de implementação:**
  1. Ajustar `src/style.css` para que `#game-ui` e `#hud-root` operem com posicionamento absoluto sobre o canvas, eliminando margens e reduzindo os paddings a zero nos modos de jogo.
  2. Revisar `UISystem.updateViewportScaling` para usar somente a área real do canvas (sem reservas extras), atualizando os testes manuais de redimensionamento.
  3. Garantir que o modo alto contraste e as preferências de HUD existentes continuem funcionais após a refatoração.
  4. Registrar antes/depois em `docs/progress/` com screenshots e descrição das mudanças.
- **Critérios de aceite:** Canvas ocupa 100% do contêiner em proporções 16:9 e 4:3, HUD não desloca a área jogável, screenshots anexadas no PR.

### 2.2 Modularização do `UISystem` e overlays (⚠️ pendente)
- **Fontes:** `hud-overlay-refactor.md`, `implementation-checklist.md`, notas de revisão de UI.
- **Diagnóstico atual:** `src/modules/UISystem.js` concentra 2.9k linhas cobrindo HUD, pause, level-up, settings e créditos em um único construtor. O `update()` faz `gameServices.get` a cada quadro para `player`, `progression` e `enemies`, dificultando testes e a futura migração para DI.
- **Checklist de implementação:**
  1. Extrair um módulo dedicado ao HUD (ex.: `HudController`) com dependências injetadas por construtor e listeners baseados em eventos (`experience-changed`, `wave-state-updated`).
  2. Mover lógica de sobreposições (pause, settings, créditos) para módulos específicos, preservando acessibilidade e foco.
  3. Converter `refreshHudFromServices` em callbacks disparados por eventos do jogo, mantendo apenas sincronização manual quando necessário.
  4. Documentar APIs públicas em `docs/` e atualizar o checklist de implementação para refletir a nova divisão.
- **Critérios de aceite:** Arquivos separados por responsabilidade, cobertura mínima de testes manuais para cada overlay e ausência de `gameServices.get` dentro do loop de `update()`.

## 3. Progressão, Recompensas e Telemetria

### 3.1 Telemetria e ajuste dinâmico de orbs (⚠️ pendente)
- **Fontes:** `xp-drop-system-analysis.md`, `orb-reward-mechanics-analysis.md`, notas das fases 2.2.
- **Diagnóstico atual:** `RewardManager.dropRewards` calcula valores com base em `GameConstants`, mas não emite métricas de distribuição. Não há agregado em `ProgressionSystem` nem relatório automatizado para validar equilíbrio em sessões reais.
- **Checklist de implementação:**
  1. Instrumentar `RewardManager` e `XPOrbSystem` para emitir eventos de telemetria contendo `wave`, `variant`, quantidade de orbs/XP e tempo da partida.
  2. Criar agregador simples (ex.: `TelemetryService`) para resumir médias por onda e expor via console ou arquivo.
  3. Registrar relatório `docs/progress/xp-drop-report-<data>.md` com dados de pelo menos 5 sessões e decisões de ajuste.
- **Critérios de aceite:** Evento de telemetria disponível, relatório anexado e plano de ajuste documentado no tracker.

## 4. Arquitetura e Infraestrutura Técnica

### 4.1 Migração para `diContainer` (⚠️ pendente)
- **Fontes:** `phase-2-architecture.md`, `phase-2-2-actual-state.md`, `EnemySystem.old.js`.
- **Diagnóstico atual:** `ServiceLocatorAdapter.get` ainda retorna `null` para serviços não registrados como legado e todos os sistemas consultam `gameServices.get` diretamente. O container está preparado, mas não resolve dependências reais.
- **Checklist de implementação:**
  1. Mapear dependências por sistema e introduzir construtores que recebam serviços via DI.
  2. Atualizar `ServiceRegistry.setupServices` para registrar fábricas reais no container.
  3. Ativar o adaptador apenas como fallback e remover acessos diretos a `gameServices` fora dele.
- **Critérios de aceite:** Busca por `gameServices.get` restrita ao adaptador e aos pontos de bootstrap, jogo executando normalmente.

### 4.2 Fatiar `src/app.js` e o fluxo de jogo (⚠️ pendente)
- **Fontes:** `phase-2-architecture.md`, `phase-2-2-actual-state.md`, documentação de retry.
- **Diagnóstico atual:** `src/app.js` acumula lógica de snapshot, retry, boot, métricas e integração com UI num único arquivo de mais de 800 linhas, o que aumenta a complexidade e acoplamento.
- **Checklist de implementação:**
  1. Mover responsabilidades de retry/snapshot para um serviço dedicado (`RetryManager`).
  2. Extrair inicialização do loop e registro de serviços para módulos separados (ex.: `GameBootstrap`).
  3. Preparar testes unitários para partes puras (snapshot, retry, geração de pontos seguros).
- **Critérios de aceite:** Arquivo principal reduzido e dividido por responsabilidade, com novos módulos reutilizáveis.

### 4.3 Automação de métricas de performance (⚠️ pendente)
- **Fontes:** `baseline-metrics.md`, `performance-monitor-guide.md`, `quick-performance-test.js`, `realistic-performance-test.js`.
- **Diagnóstico atual:** Existem scripts isolados para medir desempenho e um `PerformanceMonitor` acessível no `window`, porém não há comando npm ou pipeline que registre os resultados no repositório.
- **Checklist de implementação:**
  1. Criar comando `npm run perf:record` que execute os testes rápidos e realistas, gerando relatórios em `docs/progress/perf/`.
  2. Documentar no README como executar o comando e interpretar os resultados.
  3. Avaliar integração com CI (artefato opcional) ou checklist manual obrigatório antes de releases.
- **Critérios de aceite:** Último relatório disponível no repositório com FPS médio >= alvo e instruções públicas sobre o comando.

## 5. Feedback Sensorial e Polish

### 5.1 Sistema de easing/tween compartilhado (⚠️ pendente)
- **Fontes:** `phase-3-juice-polish.md`, `consolidation-polish-masterplan.md`, protótipos em `docs/archive/2025-plan/reference/`.
- **Diagnóstico atual:** Não existe módulo de easing/tween reutilizável; animações ainda dependem apenas de CSS ou lógica local dos sistemas.
- **Checklist de implementação:**
  1. Criar `src/core/Easing.js` e `src/core/TweenSystem.js` conforme especificações arquivadas.
  2. Integrar com `EffectsSystem` e `UISystem` para reutilizar curvas em partículas e microanimações.
  3. Documentar exemplos de uso no README ou em arquivo dedicado.
- **Critérios de aceite:** Exemplos registrados em `docs/progress/juice-showcase.md` e APIs documentadas.

### 5.2 Indicadores de objetivos fora de tela (⚠️ pendente)
- **Fontes:** `phase-3-juice-polish.md`, `asteroid-break-enhancement.md`, `vfx-sfx-current-state.md`, `death-explosion-flow-analysis.md`.
- **Diagnóstico atual:** `EffectsSystem` desenha indicadores apenas para dano/direção de impacto; não há setas ou bússolas para objetivos, colecionáveis ou eventos especiais fora da tela.
- **Checklist de implementação:**
  1. Adicionar submódulo em `EffectsSystem` ou novo sistema que renderize indicadores para objetivos configuráveis.
  2. Expor API orientada a eventos para registrar/remover alvos.
  3. Validar impacto de performance usando o monitor interno antes/depois.
- **Critérios de aceite:** Vídeo curto anexado ao tracker e impacto no FPS dentro da meta (<5% de queda).

## 6. Documentação e Governança

### 6.1 Checklist unificado de implementação e testes (⚠️ pendente)
- **Fontes:** `implementation-checklist.md`, `test-checklist.md`, `phase-4-documentation.md`.
- **Checklist:** Criar `docs/checklists/implementation-and-test.md`, referenciar cada seção do plano e atualizar o README.
- **Critérios de aceite:** Checklist usado no próximo PR relevante.

### 6.2 Histórico de decisões e prompts (⚠️ pendente)
- **Fontes:** `completed-prompts.md`, `Guia Completo de Refatoração Modular - Prompts Pas.md`, `week-1-session-1-report.md`.
- **Checklist:** Criar `docs/progress/historico_do_projeto.md` com timeline por sprint, normalizar prompts úteis em `docs/prompts/README.md` e ligar tudo no tracker.
- **Critérios de aceite:** Timeline com entradas das fases 2.x e 3.x com links para commits/PRs.

---

> **Política:** Sempre referenciar a seção correspondente deste plano em novos documentos. Concluiu um item? Movimente as evidências para `docs/progress/` e atualize o tracker.
