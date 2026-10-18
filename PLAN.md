# Modernização do Asteroid Roguefield — plano (17/10/2026; sessão 2 em curso — Rodada 2 abaixo; O BASTÃO em docs/PENDENCIAS.md)

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
- A paleta de `docs/NORTE.md` aparece 5 vezes no código; há ~571 literais de cor (~323 distintos).
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
3. Direção: `docs/NORTE.md` vale (casco fosco, neon só na informação, fundo com volume). A escolha
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
- [x] **2. Um design system e HUD enxuta.** (17/10) `style.css` de 2700 para ~1700 linhas: bloco Perplexity e
      fonte de CDN fora, um `:root` com os 8 hex da direção + tipo/espaço/movimento, 216 → 24 cores hardcoded; telas
      com fade de 250 ms (reduced-motion respeitado); grade de upgrades cabe em 1366×768; HUD sem painel falso, sem
      NAV, combo some em zero, radar com pool de nós, colunas 220 px, escala da HUD funcionando; level-up com o jogo
      visível e congelado atrás + lockout 400 ms; game over com tempo/onda/kills/combo máx./nível/build; Quit pede
      segundo toque; foco em Resume; controles no menu e na pausa + toast de primeira run; `mobileGuard` com dois
      sinais e aviso em DOM; idioma inglês. Capturas em todas as telas conferidas.
- [x] **3. Arte nova (docs/NORTE.md).** (17/10) Paleta em código, bloom em 3 níveis (opção Bloom, `?bloom=0`),
      fundo do Campo (450 → 12 draw calls), fragmentos com rachaduras que acendem, Motes/Seekers/Tethers/Warden Prime,
      Interceptor e Solar Slicer procedurais, lanças, fagulhas, brasas, câmera 1.3× com follow e dead zone
      (`src/core/camera.js`, `?camera=0`), escudo hexagonal, efeitos inteiros na paleta (103 → 0 literais), clarão de
      boca pequeno. **Em aberto para ele:** perf real na máquina dele (headless sem GPU não mede); brilho inicial do
      anel de choque dos fragmentos grandes (sensação); captura de Warden em jogo (só a prancha de lineup).
- [x] **4. Loop de passo fixo.** (17/10) `src/core/fixedStep.js`: acumulador a 60 Hz, teto de 5 passos por quadro
      (acima disso o atraso é descartado — câmera lenta breve em vez de espiral), quadro acima de 250 ms tratado como
      250 ms; `app.js` roda pools, GC, efeitos (que devolvem o delta com freeze/dilatação) e sistemas por passo, e
      renderiza uma vez por rAF. Testes unitários do acumulador. **Sem interpolação de render ainda** (`alpha` já é
      exposto): a 144 Hz pode haver repetição de quadros; medir na máquina dele antes de investir. O `try` global do
      loop ficou (etapa 7).
- [x] **5. Sensação (juice).** (17/10, tudo como proposta nomeada para ele julgar jogando) Telegraphs do boss
      (faixa da investida, cunha do leque — e o bug que os deixava mortos no caminho de componentes, corrigido);
      curva de shake trauma^1.6, teto 12 px, 1° de rotação; hit-stop em todo abate com cooldown; flash branco de 60 ms
      em dano a inimigo; slow-mo com pulso de zoom em level-up e morte (o de level-up toca depois da escolha — BACKLOG);
      banner "LAYER N", intro "WARDEN PRIME — Guardian of the Ring", kill feed e popups de XP, combo com cor por tier,
      vinheta pulsante com casco < 30 %. Vida ambiente e densidade propostas (6 × 1,26^(n−1), teto 40).
- [x] **6. Dinâmicas** (ver item 6 abaixo, feito como proposta em 17/10). Fato (17/10): `docs/positioning.md` promete 5 famílias de tag, sinergia "3 iguais" e matriz
      16 células de status; **nada disso existe no código** (zero ocorrências). Hoje: 9 upgrades em 4 categorias com
      ~3 ranks, 1 arma, escudo como única habilidade ativa, sem dash, ondas infinitas sem fim de run, sem
      meta-progressão, HP do boss composto (onda 15 ≈ 19 mil). **Decisões dele antes de codar:** (a) dash/impulso e em
      que tecla (Shift já é escudo); (b) a regra de sinergia por tag — ou retirar a promessa do positioning; (c) fim de
      run (onda alvo ou tempo) e o que a meta-progressão desbloqueia. Com isso decidido: catálogo de upgrades de 9 para
      ~25 com tags reais, raridade/reroll/banish nas cartas, telegraphs dos inimigos, teto ou linearização do HP do boss
      (`BossEnemy.js:220-226`).
- [ ] **7. Engenharia contínua (em paralelo, por fatias pequenas).** `resolveService` lança em vez de devolver
      `null` e os sistemas recebem dependências obrigatórias no construtor → remover os `typeof`/`try` defensivos;
      ~~apagar flags de legado e o espelho `gameState`; um só `isDev`~~ (feitos 17/10); zerar `no-unused-vars` e `Math.random` e
      promovê-los a erro; quebrar os god-files (meta ~600 linhas; **só com pedido explícito dele** — AGENTS.md não move arquivos sem pedido) começando por `EnemySystem`, `CombatSystem`,
      `EffectsSystem`; JSDoc + `checkJs` como caminho para TypeScript folha a folha (`core/`, `utils/`, `data/`).
- [x] **8. Replay** (17/10) `src/core/replay.js` + `src/bootstrap/replaySession.js`: gravação de seed + input por passo
      (máscara de 7 bits, só mudanças) + escolhas de upgrade; `?replay=<url>` repete no navegador; F9 (dev) baixa a
      gravação. Teste de integração grava 600 passos com o manifesto real e repete numa instância nova com posição,
      kills, XP, nível e inimigos idênticos. Efeito colateral deliberado: E/G/T agem no passo seguinte, não no handler
      de tecla. Restam leituras de relógio de parede que podem divergir (BACKLOG). **Falta:** cenários jogáveis
      headless ("mata a camada 1", "Warden aparece na 5") no lugar de snapshots; cobertura mínima no CI.

- [~] **9. O salto (NORTE §4b).** (17/10, noite) Gameplay renderizado em **Three.js**: `src/modules/render3d/`
  (Renderer3D, asteroidMesh extraído do menu, mirrors de inimigos/jogador, batches, fundo), escolhido no manifesto;
  `?renderer=2d` mantém o Canvas 2D. Câmera perspectiva 18° com follow/zoom/dolly/shake, rochas 3D com rachaduras
  âmbar em shader, nave extrudada, Wardens/Motes/Seekers/Tethers em malha, lanças instanciadas, bloom + SMAA em
  HalfFloat; 44–53 draw calls. Controles modernos (A/D strafe, nariz segue a mira; `?controls=classic`). **Falta
  (BACKLOG):** overlays 2D que ainda não existem em 3D, nave pequena/escura, materiais dos Wardens, Anel; e a
  medida de fps na máquina dele — headless sem GPU dá 2–4 fps nos dois renderers.
- [x] **6. Dinâmicas (como propostas).** Dash em Shift, famílias de tag com sinergia "3 iguais", catálogo 9 → 20,
      vitória no Warden 15 ("Field cleared"). Meta-progressão entre runs continua em aberto.

## Rodada 2 (17/10, noite, sessão 2) — o medley: "muitos inimigos diferentes e fases, motor top, VFX/SFX de estúdio"

Pedido dele (`/goal`): _"3D visto de cima, câmera dinâmica, fases, ondas e inimigos como um medley de Asteroids com
Vampire Survivors… muitos inimigos diferentes e fases. Motor gráfico top de linha… SFX e VFX de grandes estúdios,
tudo num browser."_ Fatias, cada uma um commit com captura; números como "proposta 17/10" para ele julgar jogando.

- [x] **R2.1 Profundidade e luz (render3d).** sRGB + tone mapping (hoje saída linear, por isso chapado perto do menu),
      chão de poeira que a luz da nave varre, sombras suaves sob rochas/inimigos/nave, pool de luzes para explosões.
- [x] **R2.2 Roster.** Quatro tipos novos com comportamento próprio (Husk que se parte em Motes, Ram com investida
      telegrafada, Weaver que semeia Tethers, Bulwark com escudo frontal) + modificador **Elite** (vida, tamanho,
      cor emissiva, recompensa) aplicável a qualquer tipo de apoio. Look 2D no RenderComponent.
- [x] **R2.3 Look 3D dos novos** em `render3d/enemyMirror.js` (+ tipo desconhecido não pode virar Mote em silêncio).
- [x] **R2.4 Diretor de camadas.** Uma tabela só (`src/data/layers.js`) com, por camada: rochas, pesos de variante,
      roster de apoio com cadência, chance de elite, **surtos** (burst com faixa na tela, à la VS) e eventos;
      WaveManager lê dela e as três tabelas de hoje (configs 1–12, pesos hardcoded, geração dinâmica 13+) saem.
- [x] **R2.5 VFX 3D.** Estilhaços de rocha com rotação, dissolve na morte de inimigo, afterimage do dash,
      aberração cromática em impactos grandes, faíscas direcionais; tudo lendo os eventos que já existem.
- [x] **R2.6 SFX.** Compressor/limitador no master, reverb por bus, cues por inimigo novo (spawn, telegraph, morte),
      explosão em três tamanhos, música que sobe com camada/densidade e não só com boss.
- [x] **R2.7 Pickups à la VS.** Ímã (puxa todas as fagulhas), pulso (limpa a tela), sobrecarga (cadência ×2 por 8 s);
      caem de Elites e Wardens; HUD mostra o que caiu.

## Rodada 3 (18/10, madrugada, sessão 2) — o que o hook e o BACKLOG ainda apontam como distante

- [x] **R3.1 Nave com presença.** No 3D a nave é pequena e branca; casco fosco com linhas de painel, silhueta maior
      (proposta de escala), propulsores legíveis, luz própria mais quente. Só `render3d/playerMirror.js`.
- [x] **R3.2 Cartas com raridade, reroll e banish.** Prometido na etapa 6 e nunca feito: raridade por cor na carta,
      1 reroll e 1 banish por run (proposta), com teclas e botões; famílias continuam.
- [x] **R3.3 Medição na máquina dele.** `?stats=1` liga o Stats.min.js já vendorizado (fps e ms por quadro) para ele
      reportar números reais; `F8` alterna no dev.
- [x] **R3.4 Meta-progressão (proposta).** Salvage persistido no navegador, ganho por camada/abates; "Hangar" no menu
      com 6 melhorias permanentes pequenas (ex.: +1 reroll, casco Solar Slicer, +5 % casco). Tudo atrás de um serviço
      só, para reverter com um commit.
- [x] **R3.5 Modo infinito (proposta).** Na vitória do Warden 15, botão "Continue into the deep field": `beyond(n)` da
      tabela de camadas escala rochas/roster/elite; placar de camada máxima.
- [x] **R3.6 Morte de inimigo em 3D.** Dissolve (shader) + estilhaços na cor do inimigo; Warden perde segmentos
      visivelmente a cada fase.

## Rodada 4+ (18/10) — Norte 2, "grandioso" (`docs/NORTE.md` §7)

Pedido dele: _"crie um goal novo baseado nos seus achados e aja independentemente… aumentando o conteúdo a cada
rodada"_. Cada pilar do §7 vira fatias; a ordem é impacto visível por custo. Marcar aqui conforme fecha.

- [x] **R4.1 Biomas.** `src/data/biomes.js` (3 entradas: paleta, fundo, chão, névoa, tema de música) ligado à tabela
      de camadas; render3d troca fieldBackdrop/dustFloor por bioma com transição de 2 s; título de capítulo na HUD.
- [x] **R4.2 Transmissões.** Uma linha do Warden antes de cada chefe e no fim de cada bioma (texto em inglês, dados em
      `src/data/story.js`), banner estilo rádio na HUD, cue de áudio.
- [x] **R4.3 Warden Choir (10) e Warden Null (15).** Dois chefes novos com fases que destroem geometria visível;
      Warden Prime fica no 5.
- [x] **R4.4 Variantes de rocha em 3D** (Dense Core, Volatile, Golden, Parasite, Crystal) com material próprio.
- [x] **R4.5 Texturas procedurais assadas** (normal/roughness/AO) para rocha, casco e Warden.
- [x] **R4.6 Harmonic Plasma Lance + evoluções por família.**
- [x] **R4.7 Códice, recap de morte, pausa com build, onboarding em jogo.**
- [x] **R4.8 Tema por bioma, tema de Warden, stingers.**
- [x] **R4.9 Interpolação de render, rochas instanciadas, presets automáticos por fps.**

## Rodada 5 (18/10, madrugada) — conteúdo e cinema, ainda sem veredito dele

Norte 2 tem primeira versão de tudo; esta rodada engorda o jogo onde um jogador sente falta aos 5 minutos:
variedade de evento, de carta e de chefe, e um começo/fim de run com peso. Tudo proposta; ele reverte jogando.

- [x] **R5.1 Cinema.** Intro de 3 s (câmera desce do Anel até a nave, cartão "LAYER 1 — THE OUTER RING", pulável) e
      epílogo da vitória (câmera recua, o Anel acende).
- [x] **R5.2 Heralds.** Mini-chefes nas camadas 3, 8 e 13, uma mecânica cada (Dust: muros de rocha; Heat: torna rochas
      voláteis; Silence: embaralha o radar), intro curta, drop garantido.
- [x] **R5.3 Eventos de campo** na tabela de camadas: Gravity Well (fagulhas puxadas a um ponto), Solar Flare (flash
      do bioma, inimigos atordoados 1 s), Sensor Jam (radar fora 10 s); banner e cue.
- [x] **R5.4 Catálogo 21 → 34.** Duas cartas novas por família + três "cursed" raras (ganho grande com custo).
- [x] **R5.5 Warm-up de shaders** na tela de loading (compila todos os materiais, inclusive os gêmeos do dissolve);
      barra de progresso real.
- [x] **R5.6 Conquistas locais** numa aba do Códice (12, com toast na hora).

**Regra dele (18/10, ~04h30): _"além de aumentar conteúdo tem que melhorar tudo em relação a qualidade gráfica e
efeitos e câmera, jogabilidade, etc. UX melhor a cada rodada."_** Toda rodada tem dois eixos: conteúdo (acima) e
**qualidade** (abaixo); nenhuma rodada fecha só com conteúdo.

- [x] **R5.7 Câmera 2.0.** Antecipação para onde a mira aponta, zoom por densidade de ameaça (afasta com muitos
      inimigos, aproxima no 1×1), enquadramento de chefe (nave e Warden sempre no quadro), rolagem sutil no strafe,
      transição suave entre modos; `?camera=1` mantém a atual para A/B.
- [x] **R5.8 Passe gráfico.** Vinheta + grão leve no passe de impacto, luz de borda (rim) nos cascos, estrelas que
      cintilam, partículas suaves (fade por profundidade), escudo hexagonal em 3D, marcas de queimadura (decals)
      nas rochas atingidas, poeira volumétrica no bioma.
- [x] **R5.10 Espaço procedural (veredito dele, 18/10).** O fundo lê como textura de estrelas e as sombras no "chão"
      não fazem sentido no espaço. Trocar `dustFloor`/`fieldBackdrop` por: 3–4 camadas de estrelas em pontos 3D a
      profundidades diferentes (paralaxe real com a câmera, cintilação), nebulosa em shader (fbm) num plano distante,
      poeira volumétrica esparsa; **sem chão e sem sombras num plano de fundo**; sombras reais só entre objetos 3D
      (shadow map da luz-chave: rochas sobre rochas, nave sobre rocha; presets alto/ultra); a luz da nave ilumina rochas e poeira.
- [x] **R5.11 Torreta (veredito dele, 18/10).** O casco vira sozinho para a mira e o WASD "puxa" para onde atira.
      Separar: casco aponta para a direção do movimento (WASD relativo à tela, suavizado, inclina nas curvas);
      a arma é uma **torreta** no casco que gira sozinha para o alvo (malha visível em 3D e 2D, tiro sai dela,
      linha de mira a partir da torreta); `?controls=classic` continua girar + empurrar.
- [x] **R5.9 Sensação e UX.** Nave inclina no strafe (banking), recuo no tiro, knockback nos inimigos atingidos,
      i-frames do dash visíveis; menu com a nave 3D em destaque e presets de qualidade visíveis; pausa/settings com
      o mesmo design das cartas; transição das cartas no level-up; números de dano com peso por tamanho.

## Rodada 6 (18/10, manhã) — dois eixos, enquanto ele joga a 5

Conteúdo:

- [x] **R6.1 Gamepad twin-stick.** Analógico esquerdo move, direito mira a torreta manualmente (solta = mira automática),
      gatilhos dash/escudo, vibração em dano e Warden; navegação dos menus com o controle; ícones de botão nas dicas.
- [x] **R6.2 Afixos de Elite.** Elite ganha 1–2 afixos visíveis (Shielded, Swift, Volatile, Splitter, Warded) com
      ícone no inimigo e no feed; tabela por camada; recompensa por afixo.
- [x] **R6.3 Dificuldade e seed.** Settings: Pilot / Veteran / Warden (multiplicadores nomeados); seed da run na HUD
      e no recap, `?seed=` compartilhável, "Daily Field" com seed do dia e placar local separado.
- [x] **R6.4 Solar Slicer de verdade.** Casco próprio (lâminas, propulsor âmbar, torreta própria), stats distintos
      (mais leve, mais rápido, menos casco), seleção no Hangar com prévia.
      Qualidade:
- [x] **R6.5 HUD direcional.** Indicador de direção do dano na borda, setas de fora-de-tela para Heralds/Wardens e
      pickups, barra do chefe segmentada por fase, minimapa com ícones por tipo.
- [x] **R6.6 Desempenho.** Rochas instanciadas por variante (atributos por instância para rachaduras/veios), orçamento
      do passe de sombra (só casters perto da câmera), meta de < 80 draw calls no ultra com 40 rochas.
- [x] **R6.7 Áudio espacial.** Atenuação por distância + filtro passa-baixa por distância nos cues de inimigo, camada
      de percussão por bioma que entra com a intensidade, voz dos Wardens nas transmissões (síntese granular curta).

## Rodada 7 (18/10, manhã) — consolidação enquanto ele não joga: dívidas do BACKLOG + meta de draw calls

Qualidade:

- [x] **R7.1 Máquinas em menos malhas.** Fundir as partes estáticas de cada máquina (Mote, Seeker, Tether, Husk, Ram,
      Weaver, Bulwark, Heralds, placas dos Wardens) numa geometria com cor por vértice; só partes animadas separadas;
      meta < 80 draw calls na cena carregada (40 rochas + 10 máquinas) no ultra.
- [x] **R7.2 Pequenos acabamentos de UX.** Chip AIM MANUAL, linha de lock 3D a partir da torreta, Esc fecha Settings
      aberto do menu, setas de fora de tela não caem sobre painéis, chips de casco com nome em uma linha, dicas estáticas
      de teclado com o esquema moderno, salvage escalado pela dificuldade.
- [x] **R7.3 Dívidas.** Apagar código morto listado no BACKLOG (initializeMusicController, RenderBatch/GradientCache/
      CanvasStateManager, teste scope-freeze de `.planning/`, cópias de resolveRandom, pools duplicados), unificar os
      dois painéis de desempenho, passe de verdade em `docs/plans` e `docs/validation`.
      Conteúdo:
- [x] **R7.4 Modificadores de camada no infinito.** A partir da 16, cada camada sorteia um modificador visível
      ("Dense fog" alcance de radar menor, "Magnetic storm" fagulhas erráticas, "Hunters' moon" só Seekers e Rams,
      "Glass field" rochas voláteis) com banner e cue.

## Rodada 8 (18/10, fim da manhã) — dois eixos, ainda sem veredito dele

Conteúdo:

- [x] **R8.1 Evoluções Apex.** Cinco cartas da mesma família (além da sinergia em três) elevam a evolução da arma a
      um segundo estágio visível (Incendiary → Solar Flare Lance; Railshot → Coilgun; Chain → Storm Lance; Gravitic →
      Singularity Lance; Prospector → Motherlode), com look próprio em 3D/2D, chip na HUD e conquista.
      Qualidade:
- [x] **R8.2 Decisão de draw calls.** Rims de todas as máquinas num LineSegments só, olhos/lentes/esferas emissivas num
      InstancedMesh, bloom com menos mips no preset alto; Dense Fog escurece rochas distantes no 3D; meta < 100 no
      ultra na cena carregada.
- [x] **R8.3 BACKLOG curto.** Seed do wave-manager por run (modificadores variam entre runs); prévia 3D do casco no
      Hangar; dois arrows no mesmo painel não se empilham.
- [x] **R8.4 Acessibilidade.** Escala de texto da HUD (Settings), modo alto contraste da HUD, redução de flashes
      (Solar Flare/lens-kick/flash de dano respeitam uma opção "reduce flashing"), legendas de transmissão maiores,
      tudo persistido e coberto por teste.

## Rodada 9 (18/10, meio-dia) — pequena, dois eixos, ainda sem veredito dele

Qualidade:

- [x] **R9.1 Nave em menos malhas + badges com seed.** Fundir as placas estáticas do casco (ambos os cascos) numa
      geometria com cor por vértice (banking/recuo/turret/propulsores continuam separados); `badgeMaterials()` cria
      texturas pela seed (guard de Math.random limpo); medir draw calls da nave antes/depois.
- [x] **R9.2 Três ajustes.** Drift do Magnetic Storm pela seed de run; flash de borda/wash do boss respeita "reduce
      flashing"; prévia de casco bloqueado no Hangar (silhueta escura + cadeado).
      Conteúdo:
- [x] **R9.3 Heralds falam.** Uma linha de transmissão ao surgir e ao cair para cada Herald (voz própria), entradas de
      lore no Códice para Heralds e Wardens com "visto em" e "derrotado ×N", conquista "Herald Hunter" (os três).

## Rodada 10 (18/10, tarde) — segunda consolidação: dívidas reais, BACKLOG verdadeiro, polimento visual

Conteúdo:

- [x] **R10.1 Cartas que prometem e não entregam.** `upgrade-emergency-brake` (Braking System 3) vira freio de emergência
      real (segurar S parado por 0,25 s zera a velocidade com onda de choque leve) e `upgrade-ion-trail` (Propulsors 5)
      vira rastro iônico que dá dano por contato; dash deixa de cair de 418 → 220 de uma vez (decai em 0,2 s).
      Qualidade:
- [x] **R10.2 BACKLOG verdadeiro.** Conferir cada linha contra o código; apagar o que já foi feito (lock da torreta, HUD
      de arma, chip de Overcharge, menu 2×3…); kill feed com o nome certo de cada Warden; `BossEnemy.spawnMinion` via
      `spawnChild`; meta ≤ 20 linhas.
- [x] **R10.3 Polimento visual.** Céu-base do Dense Core sem marrom; token próprio para o banner de modificador (não o
      ciano); enquadramento do casco no Hangar (sem transbordar); sombras reais um pouco mais presentes (fill −15 %).

## Rodada 11 (18/10, tarde) — mais máquinas, terceiro casco, Boss Rush; peso no dash/freio, últimas falas, som por máquina

Conteúdo:

- [x] **R11.1 Duas máquinas novas.** _Caster_ (mantém distância e lança projéteis em arco sobre zonas marcadas no
      campo — anel de impacto encolhe, explosão em área) e _Shade_ (some com dissolve, reaparece no flanco do jogador,
      dispara um leque de 3 e some de novo). Entram no roster/surtos das camadas 6+, no Códice, nos afixos de Elite,
      no 2D e no 3D (`enemyMirror`). Corrigir a linha do Mote no Códice (tiro único, não rajada).
- [x] **R11.2 Boss Rush.** Botão no menu: os três Wardens em sequência, com respiro e carta entre eles, sem camadas;
      recorde próprio; Salvage próprio.
- [x] **R11.3 Terceiro casco: _Bastion_.** Casco pesado (vida +, aceleração/velocidade −, dash −), placas blindadas e
      torreta alta, visual distinto no 3D, no 2D e no preview do Hangar; item do Hangar que o desbloqueia.

Qualidade:

- [x] **R11.4 Dash e freio com peso.** Cue de som para `player-dashed` e `player-braked`, pulso de câmera (zoom-out no
      dash, pulso curto no freio), anel do freio visível no 3D. Constantes "proposta 18/10".
- [x] **R11.5 Últimas falas ouvidas.** A tela de morte/vitória espera a transmissão terminar (com teto) e o recap mostra
      a fala como citação; hoje ~2 s de cada fala ficam atrás da tela.
- [x] **R11.6 Som por máquina.** Husk, Ram, Weaver, Bulwark, Caster e Shade com cue próprio de telegrafia/ataque/morte
      (hoje Ram usa o telegrafo do Warden e os outros não têm som próprio).
- [x] **R11.7 Caster e Shade com peso certo.** A granada do Caster deixa de disparar o tremor/flash de rocha Volátil
      (evento próprio, mais leve, sem duck) e não deixa "chamusco" no espaço (não há chão); cues próprios de
      telegrafia/lançamento/impacto do Caster e de fase do Shade.
- [x] **R11.8 Conquistas do conteúdo novo.** Counter-Battery (20 Casters), Unphased (15 Shades), Iron Escort (vitória
      com o Bastion), Full Garage (os três cascos).
- [x] **R11.9 Números de dano no 3D.** Provar por captura que aparecem e na fonte do jogo (Rajdhani); corrigir a menor
      causa se assarem na fonte reserva.

## Fora de escopo deste plano

Steam, mobile/touch, multiplayer, narrativa, reescrita do gameplay em WebGL (ver decisão 1), troca do framework de
testes, monetização. Arquivos antigos de processo (GSD, `.planning/`) ficam fora do repo; o histórico está no git.
