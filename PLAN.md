# Modernização do Asteroid Roguefield — plano (17/10/2026; Rodada 12 em curso — O BASTÃO em docs/PENDENCIAS.md)

Tarefa que atravessa sessões. Quem pegar este arquivo lê tudo antes de mexer; marca a etapa feita aqui; o que fecha
sai daqui (a história fica no git: `git log --oneline --grep="R11"`, PRs #247–#260). Decisões de produto são do dono,
por imagem e jogando — nunca por teste.

## O pedido do dono (palavras dele, 17/10)

- _"revise tudo e vamos melhorar o projeto como um todo, sinto que estamos presos no passado ainda... tudo muito
  amador... dos gráficos até as dinâmicas e efeitos, UX tudo ruim"_
- _"precisamos começar a trabalhar mais inteligentemente"_ — jeito de trabalhar importado do Mar de Estrelas
  (`AGENTS.md`, `CLAUDE.md`, `.claude/`), feito nesta rodada.

## Decisões já tomadas (17/10)

1. O jogo continua **Canvas 2D** com um passe de pós-processamento próprio; não se reescreve o gameplay em WebGL.
   Reabrir só se o bloom em Canvas não segurar 60 fps na máquina do dono.
2. O menu em Three.js fica como está: é o alvo visual do jogo ("o jogo é continuação do menu", `docs/brand.md`).
3. Direção: `docs/NORTE.md` vale (casco fosco, neon só na informação, fundo com volume). A escolha
   **vetor neon (Geometry Wars) × sprite ilustrado (Nova Drift)** é dele, por prancha comparativa (Etapa 3).
4. Cada etapa visual termina com captura antes × depois (headless, `?desktop=force&debugLogging=0`), e com
   `npm run done` verde. Ele aprova pela imagem; nada de "ficou melhor" em texto.
5. Balanceamento e sensação (XP, boss, shake, hit-stop) nunca fecham por harness: proposta com número, ele joga.
6. **(18/10, noite, conversa local) O Canvas 2D está congelado como easter egg** (`?renderer=2d`). Não recebe feature
   nova, paridade, captura nem leitura de rodada: máquina, arma ou efeito novo nasce só no 3D (`src/modules/render3d/`)
   e no 2D aparece como silhueta genérica ou não aparece. Só se mexe nele para não quebrar (ele precisa continuar
   abrindo). `tests/process/render2d-frozen.test.js` trava o tamanho dos quatro arquivos 2D; os docs não listam mais
   pendências 2D. Matar o 2D de vez fica como opção dele para depois.

## Rodadas 1–11 — fechadas e mescladas na `main` (17–18/10; PRs #247–#260)

Diagnóstico, medições, etapas 1–9 e as Rodadas 2–11 (3D com visão por cima, espaço procedural, sombras reais,
texturas assadas, instancing e batches, câmera 2.0, cinema, 10 tipos de inimigo + afixos, 3 Heralds, 3 Wardens,
15 camadas em 3 biomas, torreta + twin-stick, dash/freio, 3 cascos, 34 cartas + evoluções + Apex, Hangar, Códice,
conquistas, Boss Rush, áudio procedural com temas e cues por máquina, HUD direcional, acessibilidade) estão
resumidas no BASTÃO de `docs/PENDENCIAS.md` e detalhadas nos commits. Vereditos dele: só sobre a Rodada 4 (itens 7 e
8 de PENDENCIAS, implementados em R5.10/R5.11); Rodadas 5–11 sem veredito.

## Rodada 12 (18/10, fim de tarde) — terceira arma, cartas de manobra, Leech, falas; entrada do Warden, áudio limpo, bloom

Conteúdo:

- [x] **R12.1 Terceira arma: _Scatter Coil_.** Carta como a do Harmonic: leque de 5 flaks curtos que estouram a ~180 px
      em estilhaços de área; cadência menor, dano por flak menor; controle de multidão de perto. 2D, 3D, chip do HUD
      lendo o nome da arma (hoje fixo em LANCE/HARMONIC), evoluções de família honradas onde já há gancho.
- [x] **R12.2 Família _Maneuver_ (6 cartas, 34→40).** Afterburner (recarga do dash), Ram Plating (dash dá dano de
      contato), Gyro Servos (torreta gira mais rápido), Reactive Brake (onda do freio empurra e fere), Inertial
      Dampers (freio mais forte), Phase Dash (i-frames do dash). Sinergia 3 → rastro ardente no dash; Apex 5 → Blink
      (dash vira salto curto com onda na chegada). Dash/torreta passam a ter stat escalável.
- [x] **R12.3 _Leech_ (11ª máquina).** Lenta, vai atrás de orbes de XP e pickups e os come, crescendo (raio/vida até um
      teto); foge quando cheia; ao morrer devolve tudo que comeu (com bônus). Camadas 7+. Códice, afixos, 2D/3D.
- [x] **R12.4 Falas que faltam.** Primeiro avistamento de Caster/Shade/Leech (emite `enemy-spawned` para máquinas de
      roster — fecha também o Códice que só descobria no abate), linha de abertura do Boss Rush, linha ao destravar o
      Bastion.

Qualidade:

- [ ] **R12.5 Entrada do Warden** (não iniciado em 18/10: o worker caiu sem escrever; fica para a próxima sessão)**.** No aviso de chefe: 1 s de câmera indo ao Warden, barras de letterbox, dilatação de
      tempo curta; sem nada disso com movimento reduzido. Constantes "proposta 18/10".
- [x] **R12.6 Áudio limpo.** Aviso `ThrusterLoopManager` centenas de vezes (timer de partida sem marcar ativo);
      crossfade de tema (dois conjuntos de osciladores, percussão velha no beat novo); cues do Heat/Dust Herald;
      ouvinte `shield-shockwave` sem emissor; `musicController.initialized` morto; cue da Scatter Coil e da Leech.
- [x] **R12.7 Bloom em Settings.** `graphics.bloom` (off/low/normal/high) em vez de só `?bloom=`; multi-lock conferido
      (exige Targeting Suite 3 + multishot ≥ 2 — é desenho, não bug; BACKLOG ajustado).

## Rodada 13 (18/10, noite) — o goal novo dele: os pontos abertos primeiro

Dele (18/10): _"priorizar os pontos concretos ainda abertos: fundo espacial que ainda lê como textura (mais volume
procedural, sombras só entre objetos 3D), controle do casco ainda acoplado demais à mira (torreta independente),
medição real de desempenho na máquina do dono, caminhos de áudio mortos, oddities visuais e de paridade 2D/3D, replay
que não grava o modo, edge cases de pooling/director e arquivos ainda muito grandes."_

- [x] **R13.1 Espaço com volume.** Estrelas atenuadas pela profundidade + cintilação; nebulosa em três profundidades
      (a distante assada uma vez por bioma em alvo de baixa resolução, a média viva e barata, filamentos próximos
      aditivos e fracos); nuvens de poeira a meia profundidade com paralaxe real; nada recebe luz ou sombra; presets
      cortam camadas no low/medium. Captura antes/depois por bioma.
- [ ] **R13.2 Casco e torreta como ele quer, em Settings.** Hoje nada no código liga casco à mira; o clássico (A/D
      gira, W empurra) só existe por `?controls=classic` e trava a torreta no nariz. Opção "Hull control: Modern /
      Classic" persistida em Settings, torreta automática nos dois, dica de onboarding; câmera "look-ahead" passa a
      poder seguir o casco em vez da mira (opção) — é a única coisa que pode parecer acoplamento.
- [ ] **R13.3 Medição na máquina dele, sem fricção.** Botão "Copy performance report" no painel `?stats=1`/F8 e em
      Settings; benchmark de 20 s que recomenda um preset; relatório em texto para colar na conversa.
- [ ] **R13.4 Replay grava o modo e o casco.** Boss Rush/Daily/infinito e casco no cabeçalho; playback restaura.
- [x] **R13.5 Pooling/director.** Velocidade/timers zerados no reaproveitamento; Heralds/Wardens descartam o espelho
      3D; seed do director igual no EnemySystem e no WaveManager; avisos de "accounting discrepancy" explicados ou
      eliminados.
- [ ] **R13.6 Oddity do 3D.** Anel chapado sob o domo do escudo (candidato: o anel do dash no espelho do jogador, que
      só deveria aparecer nos i-frames — conferir na captura). Os itens 2D saíram: 2D congelado (decisão 6).
- [ ] **R13.7 Áudio morto.** `MUSIC_LAYER_CONFIG` sem uso, `_randomBetween`, e o que mais a auditoria achar.
- [ ] **R13.8 Arquivos grandes.** CombatSystem, SFXBus, UISystem, EffectsSystem (> 4400 linhas cada) divididos por
      assunto em módulos novos, sem mudar comportamento (testes iguais antes e depois). Os métodos de desenho 2D que
      vivem neles (`render(ctx)`) só mudam de arquivo junto com o assunto; não ganham nada (decisão 6).

## Fora de escopo deste plano

Steam, mobile/touch, multiplayer, narrativa, reescrita do gameplay em WebGL (ver decisão 1), troca do framework de
testes, monetização. Arquivos antigos de processo (GSD, `.planning/`) ficam fora do repo; o histórico está no git.
