# Modernização do Asteroid Roguefield — plano (17/10/2026)

Tarefa que atravessa sessões. Quem pegar este arquivo lê tudo antes de mexer; marca a etapa feita aqui; apaga o
arquivo quando a última etapa fechar. Decisões de produto são do dono, por imagem e jogando — nunca por teste.

## O pedido do dono (palavras dele, 17/10)

- _"revise tudo e vamos melhorar o projeto como um todo, sinto que estamos presos no passado ainda... tudo muito
  amador... dos gráficos até as dinâmicas e efeitos, UX tudo ruim"_
- _"precisamos começar a trabalhar mais inteligentemente"_ — jeito de trabalhar importado do Mar de Estrelas
  (`AGENTS.md`, `CLAUDE.md`, `.claude/`), feito nesta rodada.

## O que foi medido (17/10, checkout `9183e82`, Chromium headless 1600×900, `?desktop=force`)

- 564 testes passam em 14 s; build em 2 s; CI e deploy (GitHub Pages) funcionam.
- O jogo roda a 16,7 ms de mediana (60 fps) com picos de 33–50 ms (p95) em headless sem GPU; o `RenderingSystem`
  reporta ~5 ms de render. Os 377 ms do trace do dono **não reproduzem** aqui; log de depuração ligado ou desligado
  não mudou o quadro em headless. Medir na máquina dele antes de otimizar qualquer coisa (`docs/PENDENCIAS.md` (6)).
- Canvas do jogo: `800×600` de atributo, esticado por CSS para ~1116×837 (DPR 1). Em 1080p o jogo é desenhado a
  ~1,6× menos resolução que a tela; em tela retina, ~3,8×. **É a causa isolada mais forte do aspecto amador.**

## Diagnóstico (resumo; os relatórios completos estão no histórico desta sessão)

### Gráficos (`src/modules/RenderingSystem.js`, `enemies/components/RenderComponent.js`, `PlayerSystem.js`)

- Três linguagens visuais que não conversam: wireframe neon (Drone, Hunter, nave padrão), formas chapadas com
  gradiente (asteroides viram anéis marrom/rosa — o "neon" do asteroide comum é `#654321` em blend aditivo), e
  SVGs ilustrados vindos de `assets/inpirational mockups/` usados como asset final (nave Solar Slicer, boss).
- A paleta de `docs/visual-direction.md` aparece 5 vezes no código; há ~571 literais de cor (~323 distintos).
- Não existe pós-processamento no jogo: "bloom" é traço repetido; as opções de bloom, aberração cromática e
  `hudScale` em Settings são gravadas e nunca lidas. O **menu** tem Three.js + UnrealBloom + SMAA + grão: o
  contraste menu → jogo é o que grita "inacabado".
- `RenderBatch`, `GradientCache` e `CanvasStateManager` são infraestrutura sem chamadores reais (só estatísticas).
- Sprites são assados a 1×, sem DPR; nave, Drone, Hunter e escudo são redesenhados a cada quadro (`shadowBlur`,
  `ctx.filter blur` ao vivo); a vinheta do fundo recria o gradiente por quadro.

### UX (`src/style.css`, `src/modules/UISystem.js`, `src/modules/ui/AAAHudLayout.js`)

- Três design systems empilhados: template Perplexity (863 linhas, fonte do CDN deles, modo claro como padrão),
  tokens "AAA neon", e um terceiro `:root` injetado pela HUD. 207 custom properties contra ~377 cores hardcoded.
- Toda troca de tela é `display:none` — zero transições. O level-up esconde o campo de jogo inteiro. Game over sem
  estatística nenhuma. "Quit" na pausa sem confirmação. Pausa não move o foco.
- HUD é um mockup colado: colunas de 320 px sobre 800 px de jogo; painel "WEAPON SYSTEM LOCKED // LVL 5 REQ"
  estático e falso; coordenadas e "km/h" como ruído; combo pulsa em x0; radar recria ~80 nós DOM por quadro.
- Onboarding inexistente: nenhuma linha diz que o tiro é automático, que A/D giram, que E é escudo, G/T alternam
  modos. Idioma misturado (EN no menu/HUD, PT nos upgrades). `mobileGuard` trava Windows com touch em 0 %.

### Engenharia (`src/app.js`, `src/core/`, `src/services/`)

- Loop de passo variável com `dt` travado em 16 ms: a 144 Hz a física muda; abaixo de 60 fps o jogo entra em
  câmera lenta. Isso anula o investimento em RNG determinístico (`RandomService`, 74 forks, snapshots).
- 709 checagens `typeof x === 'function'` e 209 `try` em `src/`; `resolveService` engole erro e devolve `null`,
  então dependência faltando vira no-op silencioso. 13 arquivos acima de 1500 linhas (metade do código;
  `MenuBackgroundSystem` 4585, `EffectsSystem` 4132, `EnemySystem` 3999, `CombatSystem` 3704).
- Flags de legado (`PRESERVE_LEGACY_*`, `USE_WAVE_MANAGER`, `legacyFallbackActive`) e espelho `gameState` /
  `synchronizeLegacyState` de uma migração já terminada. Quatro jeitos de detectar modo dev.
- Sem TypeScript; ESLint entrou em 17/10 (0 erros, ~212 avisos a zerar).

### Jogabilidade

- Núcleo: rotação + empuxo newtoniano (Asteroids clássico) com **tiro automático e auto-aim** por padrão; escudo
  (E) e dois toggles (G spread, T mira). Inimigos: asteroides (variantes), Drone, Hunter, Mine, Boss com fases.
- `docs/positioning.md` promete cinco famílias de tag com sinergias e uma matriz 16 células de status × status;
  o que disso existe no código fica a confirmar quando a Etapa 6 abrir (o levantamento de jogabilidade de 17/10 foi cancelado antes de terminar; refazer com um Explore na hora).

## Decisões já tomadas (17/10)

1. O jogo continua **Canvas 2D** com um passe de pós-processamento próprio; não se reescreve o gameplay em WebGL.
   Reabrir só se o bloom em Canvas não segurar 60 fps na máquina do dono.
2. O menu em Three.js fica como está: é o alvo visual do jogo ("o jogo é continuação do menu", `docs/brand.md`).
3. Direção: `docs/visual-direction.md` vale (casco fosco, neon só na informação, fundo com volume). A escolha
   **vetor neon (Geometry Wars) × sprite ilustrado (Nova Drift)** é dele, por prancha comparativa (Etapa 3).
4. Cada etapa visual termina com captura antes × depois (headless, `?desktop=force&debugLogging=0`), e com
   `npm run done` verde. Ele aprova pela imagem; nada de "ficou melhor" em texto.
5. Balanceamento e sensação (XP, boss, shake, hit-stop) nunca fecham por harness: proposta com número, ele joga.

## Etapas (nesta ordem; cada uma é um commit ou poucos, sempre jogável no fim)

- [x] **0. Jeito de trabalhar.** AGENTS/CLAUDE/.claude, lint, `done`, `tocados`, Prettier no repo inteiro, CI
      sem Node 18. (17/10)
- [x] **1. Resolução nativa.** (17/10) `src/core/viewport.js` dimensiona o backing store em CSS × DPR (teto 2×) e
      aplica a transformação base por quadro; `UISystem` chama isso no resize; `setTransform(1,…)` de tela virou
      `applyBaseTransform`; todos os sprites assados (asteroide, inimigos, orbes, tiros, partículas, estrelas, nebulosa)
      passaram a assar em `tamanho × escala`. Captura antes × depois em DPR 2: bordas nítidas. **Desempenho não
      validado:** o headless (sem GPU) foi de 33 para 333 ms por quadro em DPR 2 — `drawImage` em software domina (~940
      por quadro, 450 só de estrelas). Em máquina com GPU o custo é outro; ele mede com e sem `?renderScale=1`. Se ficar
      lento, a saída é reduzir chamadas (estrelas em camadas assadas, etapa 3), não voltar ao borrão.
- [ ] **2. Um design system e HUD enxuta.** Apagar o bloco Perplexity e a fonte do CDN; `tokens.css` único (cor,
      tipo, espaço, movimento) com os 8 hex da direção visual; HUD em tokens, sem inline, colunas ~200 px, sem painel
      falso nem NAV/km/h, combo some em x0, radar no canvas; `.hidden` vira `is-open` com 150–250 ms; level-up com o
      jogo visível e congelado atrás + lockout de 400 ms; game over com tempo/onda/kills/combo/build; confirmação no
      Quit; foco em Resume; painel de controles no menu e na pausa + dicas nos primeiros 20 s; **idioma: inglês, decidido em 17/10 e já aplicado a cartas e telas**; `mobileGuard` com dois sinais e aviso em DOM. Worker: opus (há escolhas de composição).
- [ ] **3. Paleta única + bloom real.** Prancha A/B para ele escolher a linguagem (item 3 das decisões). Depois:
      `src/data/constants/palette.js` com tokens + escala de traço e de glow, literais trocados; camada emissiva num
      canvas próprio, reduzida a 1/4, `filter: blur()` e composta em `lighter` (liga as opções de bloom/aberração que
      hoje não fazem nada); asteroides com volume (gradiente com luz fixa, borda iluminada, crateras por ruído —
      portar o gerador de textura do menu, `MenuBackgroundSystem.js:2244+`); aposentar o multi-stroke do
      `NeonGraphics`; rastro do tiro inimigo na cor do tiro; orbes animados. Apagar `RenderBatch`/`GradientCache`/
      `CanvasStateManager` ou pô-los para trabalhar. Worker: opus. Baseline de perf antes (`?profile=mid-game`).
- [ ] **4. Loop de passo fixo.** Acumulador a 60 Hz, teto de ~5 passos/quadro, render com interpolação; tirar o
      `try` global do loop (pausar e mostrar o erro na primeira falha). Fecha câmera lenta, 144 Hz e determinismo de
      uma vez; pré-requisito para replay. Worker: opus (máquina de estados).
- [ ] **5. Sensação (juice).** Flash branco em dano, hit-stop calibrado, anéis de onda de choque, faíscas
      esticadas pela velocidade, sequência de morte do inimigo em camadas, vinheta pulsante com HP < 30 %, banner
      "WAVE N", intro de boss (nome + 1,5 s), kill feed/popup de XP, combo com cor por tier. Números propostos, ele
      joga, depois trava. Worker: opus.
- [ ] **6. Dinâmicas.** Confirmar o que existe das sinergias por tag e da matriz de status; onde não existe,
      decidir com ele o que entra no v1; raridade/reroll/banish nas cartas; comportamento dos inimigos por onda; uma
      habilidade ativa além do escudo (dash?) é decisão de produto dele. Esta etapa começa por um levantamento de jogabilidade (o de 17/10 foi cancelado) antes de ser detalhada.
- [ ] **7. Engenharia contínua (em paralelo, por fatias pequenas).** `resolveService` lança em vez de devolver
      `null` e os sistemas recebem dependências obrigatórias no construtor → remover os `typeof`/`try` defensivos;
      apagar flags de legado e o espelho `gameState`; um só `isDev`; zerar `no-unused-vars` e `Math.random` e
      promovê-los a erro; quebrar os god-files (meta ~600 linhas) começando por `EnemySystem`, `CombatSystem`,
      `EffectsSystem`; JSDoc + `checkJs` como caminho para TypeScript folha a folha (`core/`, `utils/`, `data/`).
- [ ] **8. Replay e testes de comportamento** (depende da 4). Gravar input + seed, reproduzir; cenários headless
      ("mata a onda 1", "boss aparece na onda N") no lugar de snapshots; cobertura mínima no CI.

## Fora de escopo deste plano

Steam, mobile/touch, multiplayer, narrativa, reescrita do gameplay em WebGL (ver decisão 1), troca do framework de
testes, monetização. Arquivos antigos de processo (GSD, `.planning/`) ficam fora do repo; o histórico está no git.
