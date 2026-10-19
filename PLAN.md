# Modernização do Asteroid Roguefield — plano (17/10/2026; Rodada 0 em curso no ramo `r0/fabrica`, 19/10)

Tarefa que atravessa sessões. Quem pegar este arquivo lê tudo antes de mexer; marca a etapa feita aqui; o que fecha
sai daqui (a história fica no git: `git log --oneline --grep="R11"`, PRs #247–#260). Decisões de produto são do dono,
por imagem e jogando — nunca por teste.

## Passagem de bastão (19/10, noite)

- **Goal do dono (19/10, `/goal`):** a Rodada 0 inteira, abaixo. Rodadas 12–13 e R14 já estão na `main` (PRs até #279).
- **Ramo `r0/fabrica`** (integração, no checkout principal): um commit por fatia, trazido por cherry-pick do worktree do
  ajudante. Junta na `main` só com o OK do dono. A sonda no navegador (menu, partida com abates) vem antes da junção;
  o erro de console `game-session` → `renderer` ao carregar já existia na `main` (19/10) e não impede a partida.

## Rodada 0 (decidida 19/10, madrugada) — baratear o conteúdo antes de crescê-lo

Dele (19/10): _"vi e aprovei, mas é pouco conteúdo… Vampire Survivors são dias de desafio"_; _"tudo roda bem a 60 fps
num Mac M1"_; _"repensar a nossa estrutura de forma inteligente para diminuir o custo de todas as melhorias feitas só
por AIs"_; _"você sabe o que é melhor fazer"_. Referência de estrutura: jogos de conteúdo massivo (dados do Vampire
Survivors, Shattered Pixel Dungeon, Cataclysm DDA): **conteúdo é dado, comportamento é biblioteca pequena, um registro
liga os dois; quem adiciona conteúdo não toca no motor.** Hoje um inimigo novo toca 10 arquivos e uma classe de 200–250
linhas; uma arma, 8 arquivos com ids à mão; testes enumeram tipos à mão. As duas metades abaixo correm em paralelo
(arquivos disjuntos), um commit por fatia, comportamento igual antes e depois (mesmos testes verdes).

- [x] **Regra que vira verificação (primeira fatia de todas; feita 19/10, ramo `r0/teto-de-linhas`):** teto de **1.200
      linhas por arquivo** no ESLint (`max-lines`), com lista de exceções nomeadas que só pode diminuir — a lista é o
      placar da dívida (`OVER_THE_CAP` em `eslint.config.js`; `tests/process/max-lines.test.js` falha num nome cujo
      arquivo voltou para baixo do teto). Medido em 19/10: **17 arquivos**, não 13. Além dos nove de 0b, a fábrica deve
      encolher EnemySystem (3.159), WaveManager (2.749), Targeting (1.619), EnemyEffects (1.512) e BossEnemy (1.372);
      SettingsPanel (1.328), UISystem (1.253) e o teste `aim-regression` (2.715) não têm etapa ainda.

**Método (19/10).** Prova de comportamento igual: `tests/integration/golden-trace.test.js` joga partidas headless (cada
camada, uma infinita, as duas armas extras) e guarda por segundo um hash do estado e outro dos eventos; uma fatia de
refatoração não muda o fixture (renomear evento muda só o hash de eventos). No máximo 4 ajudantes ao mesmo tempo (limite
do app), cada um num worktree, arquivos disjuntos. Ordem: trace → divisões 0b e de EnemySystem/WaveManager → 0a.1 →
0a.3 ∥ 0a.4 → 0a.2, 0a.5, 0a.6 → 0a.7 → 0a.8 (medir antes de otimizar) → divisões restantes até a lista ter ≤ 3 nomes.

**Desenho da fábrica (19/10, mapeado: o roster tem 10 máquinas — drone, hunter, mine, husk, ram, bulwark, weaver,
caster, shade, leech —, cada id copiado à mão em ~10 arquivos do motor):**

- _Registro:_ `src/content/registry.js` lê `import.meta.glob('./*/*.js', { eager: true })`; cada arquivo faz
  `export default { id, … }` com `id` = nome do arquivo; `order` onde a ordem decide sorteio (cartas, inimigos), para a
  sequência não mudar; `listContent(kind)`, `getContent(kind, id)`. Tipos: enemies, bosses, weapons, cards, hulls,
  stages, biomes.
- _Inimigo:_ o arquivo junta o que hoje está espalhado (dados, componentes, recompensas, pool, tags, papéis, afixos,
  cues, Códice, fala de avistamento, explosão, cor do projétil, visual). Uma classe só (`RecipeEnemy`) monta
  comportamentos por nome de `src/modules/enemies/behaviors/`: movimento (estratégias do MovementComponent + manter
  distância, investida, fase, forragear), ataque (padrões do WeaponComponent + granada com marcação, pôr mina), morte
  (dividir, filhotes, devolver orbes, explodir), extra (escudo frontal). Nenhum arquivo do motor nomeia id de inimigo:
  as listas à mão (EnemySystem, WaveManager, GamePools, RewardManager, `visual.js`, Códice, falas, afixos,
  enemyMirror) leem o registro. Wardens e Heralds mantêm as classes; só os dados vão para `content/bosses`.
- _Arma:_ `fire` lista padrões (projéteis, feixe a cada N, leque de flak), `projectile` declara tipo e propriedades
  (velocidade, vida, estouro, perfuração), `card` declara a carta que a liga (ids `harmonic_resonator` e
  `scatter_coil` ficam: replays gravam ids); a exclusividade entre cartas de arma é derivada; HUD, áudio e 3D leem a
  arma; um evento só, `upgrade-weapon`, com o id.
- _Visual:_ `view: '<nome>'` usa uma das vistas feitas à mão (as 10 de hoje ficam: redesenhá-las mudaria a imagem);
  `visual: {…}` é montado pelo construtor de receitas em `render3d` (partes primitivas, papel de paleta, pontos
  emissivos, escala, animação). Inimigo novo usa `visual`.
- _Diretor:_ roster e surtos pedem `role`; cada inimigo declara `roles`, `weight`, `fromLayer`. Com um candidato só não
  há sorteio (não consome random), então os papéis de hoje (um inimigo por papel) mantêm a sequência idêntica; inimigo
  novo num papel passa a dividir as vagas.
- _Prova final:_ ramo descartável com um inimigo e uma arma novos, um arquivo cada, `git diff --stat` só com os dois,
  vistos na cena `?content=` e numa partida.

### 0a — a fábrica de conteúdo

- [ ] **0a.1 Registro** (em curso 19/10: `src/content/registry.js` + `tests/content/registry.test.js`; feitos biomas,
      41 cartas, 3 cascos, 3 armas, 15 camadas (`src/data/layerParts.js` evita o ciclo) — cada módulo antigo mantém os exports, agora lidos do registro; regra: arquivo de
      conteúdo só importa constantes e outros arquivos de conteúdo, nunca um módulo que lê o registro — ciclo de import).
      Pedido original: `src/content/{enemies,weapons,hulls,cards,stages,bosses}/<id>.js` carregados por
      `import.meta.glob`; criar o arquivo é registrar. `tests/content.test.js` valida todo item (campos, referências a
      comportamentos/cues/paleta, papéis resolvíveis) e substitui os testes que enumeram tipos à mão. Mover os dados
      atuais (`src/data/enemies`, `upgrades`, `weapons.js`, `shipModels.js`, `layers.js`, `biomes.js`) para lá.
- [ ] **0a.2 Cena de conteúdo.** `?content=<id>` coloca qualquer item do registro diante da nave (hero generalizada);
      acaba o script de captura sob medida por worker.
- [ ] **0a.3 Inimigo = receita.** Biblioteca de ataques (tiro, rajada, arco com marcação, feixe, leque, pôr mina,
      investida, fase) e de mortes (dividir, filhotes, devolver orbes, explodir) sobre as estratégias de movimento que
      já existem; a receita declara stats, move, attack, onDeath, afixos, drops, cues, Códice e **papéis** para o
      diretor. Migrar os 11 inimigos um a um (Caster, Shade, Leech viram as primeiras receitas; suas classes somem).
- [ ] **0a.4 Arma = padrão + projétil.** Padrões: projétil, leque, feixe a cada N, orbital, aura, cadeia; evoluções por
      família declaradas na arma; o combate executa padrões e não conhece ids. Migrar lance, harmonic e scatter.
- [ ] **0a.5 Visual = receita.** Vocabulário curto (partes primitivas, papel de paleta, pontos emissivos, escala, o que
      anima) lido por um construtor só em `render3d`; inimigo novo não escreve render.
- [ ] **0a.6 Diretor por papéis.** Roster e surtos das camadas sorteiam por papel e peso (`artillery`, `flanker`,
      `scavenger`, `fromLayer`), não por nome.
- [ ] **0a.7 `CONTENT.md`** de uma página: como adicionar inimigo, arma, carta, casco, fase. O brief de um worker vira
      "adicione X seguindo CONTENT.md" — 1–2 arquivos, cinco em paralelo sem conflito.
- [ ] **0a.8 Motor de horda.** Inimigos por instância (como as rochas), balas e partículas em GPU, orçamentos por
      quadro; meta: **200 Motes a 60 fps no Mac M1**, medido por ele.

### 0b — os arquivos gigantes que a fábrica não encolhe

- [ ] **0b.1 AudioSystem (2.370)** — a tabela evento→cue vira dado (uma tabela de ~200 linhas); fachadas somem.
- [x] **0b.2 MenuBackgroundSystem** (3.864 → 1.163, 19/10): onze partes da cena em `src/modules/menu/`; num rascunho
      contra o original, os mesmos 16.741 sorteios e o mesmo estado da cena em cada quadro; menu visto no navegador.
- [ ] **0b.3 PlayerSystem (2.444)** — movimento, dash/freio, torreta, escudo, cascos.
- [x] **0b.4 GameSessionService** (2.394 → 1.131, 19/10): sementes, foto da morte, contagem do retry, fim de run e botões
      do menu em `src/services/session/`; trace igual; morte → Game Over → Retry visto no navegador.
- [ ] **0b.5 PhysicsSystem (2.223)** — por par de colisão.
- [x] **EnemySystem** (3.159 → 1.183, 19/10): registro dos tipos numa função só (`enemyTypeRegistry.js`), chefes,
      recompensas, fotos, consultas e acertos em `src/modules/enemies/{base,systems}/`; trace igual a cada passo.
- [x] **EnemyEffects** (1.512 → 665, 19/10): tiro, rachaduras e Volatile em módulos; o despacho de morte por tipo
      ficou num lugar só.
- [x] **WaveManager** (2.749 → 1.081, 19/10): agenda da camada, spawner, onda de chefe, eventos e random em
      `src/modules/enemies/waves/`; a agenda (tipos de apoio, grupos por tipo) num módulo só, para o diretor por papéis.
- [x] **0b.6 XPOrbSystem** (2.077 → 678, 19/10): desenho 2D morto apagado; campo, fusão, espaçamento, ímã e números
      em `src/modules/xp/`; hash por quadro de cada orbe igual em cinco partidas.
- [x] **AAAHudLayout** (1.892 → 889, 19/10): um módulo por painel em `src/modules/ui/hud/` (mesmas 976 operações de DOM
      num DOM falso, antes e depois); HUD visto numa partida.
- [x] **0b.7 Renderer3D** (1.791 → 839, 19/10): montagem da cena, câmera, espelhos do campo e sobreposições em
      `src/modules/render3d/`; cena hero vista no navegador.
- [x] **SettingsPanel** (1.328 → 868) e **UISystem** (1.253 → 964), 19/10: construtores de campo e textos de tecla em
      `src/modules/ui/settings/`; busca no DOM e escala da tela em `src/modules/ui/`; painel e teclas vistos no navegador.
- [x] **Trace de comparação** (19/10): 19 partidas de 60 s (camadas 1–15, 17, Boss Rush, harmonic e scatter na 9); pega
      a velocidade de um inimigo de 180 para 181 em 14 das 19. Depois (19/10) mais duas em que a nave voa: move, dash, freio e escudo, uma com o Bastion.
- [x] **InputSystem** (1.386 → 1.184, 19/10): montagem dos comandos em `src/modules/input/commandPayloads.js`.
- [x] **Teste `aim-regression`** (2.715, 19/10): quatro arquivos por assunto em `tests/integration/aim/`, os mesmos 80
      testes.

**Pronto quando:** um inimigo e uma arma novos entram com um arquivo cada e zero linhas no motor; os 11 inimigos e 3
armas migrados com comportamento igual; nenhum arquivo acima do teto fora da lista de exceções, e a lista com no máximo
três nomes; 200 Motes a 60 fps no M1 (ele mede). **Fora de escopo:** conteúdo novo (fica para o goal de longevidade que
vem depois: 12+ armas, 30+ inimigos, 6 biomas, árvore de desbloqueios).

## O pedido do dono (palavras dele, 17/10)

- _"revise tudo e vamos melhorar o projeto como um todo, sinto que estamos presos no passado ainda... tudo muito
  amador... dos gráficos até as dinâmicas e efeitos, UX tudo ruim"_
- _"precisamos começar a trabalhar mais inteligentemente"_ — jeito de trabalhar importado do Mar de Estrelas
  (`AGENTS.md`, `CLAUDE.md`, `.claude/`), feito nesta rodada.

## Decisões já tomadas (17/10)

1. ~~O jogo continua **Canvas 2D** com um passe de pós-processamento próprio; não se reescreve o gameplay em WebGL.~~
   Superada: o salto para Three.js aconteceu em 17/10 (decisão 6) e o 2D sai do código em R14 (19/10).
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
   pendências 2D. Matar o 2D de vez fica como opção dele para depois. **Decidido em 19/10: o 2D sai do código (R14);
   a versão 2D original vira peça de museu, gerada da tag `classic-2d` e aberta por um botão nos créditos.**

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

- [x] **R12.5 Entrada do Warden** (19/10, ramo `r13/fechamento`; o dono joga antes de mesclar)**.** No nascimento do
      Warden (o aviso vem uma camada antes, sem Warden para visitar): câmera vai e volta em 1,5 s, letterbox, mundo a 40 %
      por 1 s; nada disso com movimento reduzido. Constantes "proposta 19/10" em `src/core/cinematics.js`.
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
- [x] **R13.2 Casco e torreta como ele quer, em Settings** (19/10; o dono joga)**.** Hoje nada no código liga casco à mira; o clássico (A/D
      gira, W empurra) só existe por `?controls=classic` e trava a torreta no nariz. Opção "Hull control: Modern /
      Classic" persistida em Settings, torreta automática nos dois, dica de onboarding; câmera "look-ahead" passa a
      poder seguir o casco em vez da mira (opção) — é a única coisa que pode parecer acoplamento.
- [ ] ~~**R13.3 Medição na máquina dele, sem fricção.**~~ Cancelado pelo dono (19/10). Botão "Copy performance report" no painel `?stats=1`/F8 e em
      Settings; benchmark de 20 s que recomenda um preset; relatório em texto para colar na conversa.
- [x] **R13.4 Replay grava o modo e o casco** (19/10; casco já gravava; modo, dia do Daily e esquema de controle agora também)**.** Boss Rush/Daily/infinito e casco no cabeçalho; playback restaura.
- [x] **R13.5 Pooling/director.** Velocidade/timers zerados no reaproveitamento; Heralds/Wardens descartam o espelho
      3D; seed do director igual no EnemySystem e no WaveManager; avisos de "accounting discrepancy" explicados ou
      eliminados.
- [x] **R13.6 Oddity do 3D** (19/10, ramo `r13/anel-sob-escudo`)**.** Era o anel do dash (i-frames), inclinado com o
      casco, desenhado dentro do domo; agora some com o escudo erguido, como o comentário do domo já prometia.
      Conferido no navegador com escudo + i-frames forçados (antes: anel; depois: só o domo).
- [x] **R13.7 Áudio morto** (19/10; 261 linhas, nada audível muda)**.** `MUSIC_LAYER_CONFIG` sem uso, `_randomBetween`, e o que mais a auditoria achar.
- [x] **R13.8 Arquivos grandes** (fechado 19/10; PRs #263 a #267)**.** CombatSystem, SFXBus, UISystem, EffectsSystem (> 4400 linhas cada) divididos por
      assunto em módulos novos, sem mudar comportamento (testes iguais antes e depois). Os métodos de desenho 2D que
      vivem neles (`render(ctx)`) só mudam de arquivo junto com o assunto; não ganham nada (decisão 6).
      Análise e ordem em `docs/analise-estrutura-ia-2026-10-18.md` (seção 5); o custo de cada iteração vem antes da divisão.

  - [x] **R13.8.1 Base da iteração** (18/10, ramo `r13/base-da-iteracao`, portão e sonda no navegador ok): seletor de testes transitivo e por base do ramo;
        portão imprime só falhas; grafo gera sem erro e seus artefatos são ignorados; `src/README.md` vira mapa por
        assunto e `tests/README.md` página curta; um só interruptor de dev, com lint; ramo morto do manifesto removido.
  - [x] **R13.8.2 Piloto SFXBus** (18/10, ramo `claude/inspiring-panini-c21aa9`): nove famílias de sons em `src/modules/audio/sfx/`
        (fábricas que recebem o kit do barramento, nunca o barramento; `SFXBus.js` 4595 → 1105 linhas, só infraestrutura e
        delegados de uma linha); dados de áudio em `src/data/audio/` (`GameConstants.js` 783 → 126, reexporta).
  - [x] **R13.8.3 UISystem** (18/10, ramo `r13/ui-por-tela`): 4516 → 1229 linhas; nove classes em `src/modules/ui/`, uma por
        tela, cada uma com dependências nomeadas e sem ponteiro de volta; cinco recortes, cada um visto no jogo antes do
        commit. Medição: um ajudante opus por recorte (85 a 120 mil tokens cada); sessão principal em 42% da janela (420 mil
        tokens) ao fim, somando o marco 2; portão passou de primeira em todos; uma chamada órfã escapou dos testes e só
        apareceu no navegador (a sonda é obrigatória).
  - [x] **R13.8.4** (18/10, ramo `r13/combate-por-assunto`): CombatSystem 4867 → 655 linhas (Targeting, Projectiles,
        Weapons, HitResolution, CardEffects e o 2D congelado em `src/modules/combat/`); enemyMirror 2965 → 755 (sete
        famílias em `src/modules/render3d/enemies/` sobre uma caixa de ferramentas); EffectsSystem 4462 → 612 (GameTime,
        ScreenFeedback, Particles, BossTransitions, PlayerEffects, EnemyEffects e o 2D congelado em `src/modules/effects/`).
        A fragmentação do feixe voltou ao domínio de inimigos (`spawnBeamFragments`, mesma contagem). Medição: dez
        ajudantes (nove opus, um sonnet; 60 a 290 mil tokens cada), três comparações roteirizadas byte a byte (visual,
        efeitos ×2), portão de primeira em todos os recortes; sessão principal em 59% da janela (590 mil tokens) ao fim.
  - [x] **R13.8.5 Autoridade das ondas** (mesclado 19/10, PR #267) (ramo `r13/ondas-uma-autoridade`, aberto 18/10). Decisão: NÃO virar a chave
        `WAVEMANAGER_HANDLES_ASTEROID_SPAWN` (o caminho "true" soltava todas as rochas de uma vez, sem cadência nem limite);
        o WaveManager vira dono único herdando a cadência atual. Prova em cada recorte: sonda headless (3 sementes ×
        1500/7200/3000 quadros) comparando spawns, eventos e contadores entre a main e o ramo, byte a byte.
    - [x] 5.1 Subtração: chave, override, caminho "tudo de uma vez", espelho e rajada do caminho morto removidos (commit
          798bed6; 35.100 quadros idênticos).
    - [x] 5.2 Dono único (commit fbf852c; 44.100 quadros idênticos, camadas 1 a 5 e Boss Rush): cadência das rochas e rajada inicial no WaveManager; `waveState` vira snapshot derivado; espelho do
          EnemyUpdateSystem e modo legado sem WaveManager removidos. Achado: a rajada de 4 rochas no início nunca
          disparava (antes nem depois); ligá-la seria mudança de sensação, decisão do dono.
    - [x] 5.3 Faxina e escopos de random (commit fef84c9; 87.300 quadros × 2 modos idênticos ao ramo; contra a main só 67
          linhas de payload de depuração com `metadata` em outro lugar, vindas do 5.1, sem leitor): rajada de 4 rochas,
          `getState`/`managerTotalsForWave`/`compatibilityModeActive`, `wave-state-updated` e a cópia de `layerDirector`
          apagados; `layerDirector` mora no WaveManager. De random só a captura repetida de sementes saiu; rótulos,
          escopos pai e fork legado ficam (fazem parte dos replays). Medição: 1 ajudante opus, 1 tentativa, 181k tokens,
          17 min; revisão aqui.
    - [x] Fechamento (19/10): `npm run done` verde (173 arquivos, 1161 testes, build), sonda no navegador (partida, arena de
          chefe, easter egg 2D, zero erros), PR #267 mesclado em 19/10 com o OK do dono.

- [x] **R14 Sem o 2D** (mesclado 19/10, PR #269) (ramo `r14/sem-2d`, aberto 19/10 sobre `r13/ondas-uma-autoridade`; mescla depois das ondas e só com o
      OK do dono). Decisão dele (19/10): o desenho Canvas 2D sai do código vivo; a versão 2D original vira peça de museu:
      ramo `classic` e tag `classic-2d` = bc1ad27 (último commit 2D por padrão) + prefixo `classic:` nos dados salvos
      (mesma origem no GitHub Pages), gerada pela publicação a partir da tag em `dist/classic/`, botão nos créditos.
      Mapa (19/10): só cai no 2D sozinho se o Three.js não carregar, e aí o menu também não abre: nada real a perder.
  - [x] 1 Desenho, troca de modo, serviços e testes só do 2D (commit 3e66b7d; portão verde, 1141 testes). Os testes de
        mira conferem o estado da mira, não mais o desenho. Medição: 1 ajudante opus, 1 tentativa, 118k tokens, 9 min.
  - [x] 2 Componente de desenho dos inimigos (commit c7d4c83; portão verde, 1137 testes): construído nos dois modos, nunca
        desenhado no 3D; saiu com `renderStrategy`, os blocos `render` dos 12 dados (nenhum campo lido pelo 3D), o
        desenho base dos inimigos e a esculpida do sprite da rocha. Medição: 1 ajudante opus, 1 tentativa, 131k tokens,
        10 min.
    - [x] 3 Restos (commit f142116; portão verde, 1134 testes): as listas de avisos e indicadores do arquivo de efeitos 2D só
          alimentavam o próprio desenho (o 3D lê o estado do chefe e o HUD desenha os próprios chevrons), então o arquivo
          saiu inteiro; `ctx` nulo, getters do combate, schema, presets, payload do chefe, pulso da mina e script de
          benchmark órfão também. Medição: 1 ajudante opus, 1 tentativa, 190k tokens, 14 min. Restos da era 2D fora do
          desenho ficaram em uma linha do BACKLOG.
    - [x] 4 Museu (commits 469bcb5, 0124f96): `deploy.yml` faz checkout da tag `classic-2d` e a compila em `dist/classic/`;
          link "Play the original 2D game" nos créditos, acima da dobra (só resolve no site publicado). Tag e ramo
          `classic` criados localmente (bc1ad27 + prefixo `classic:` nos dados salvos, conferido no navegador).
    - [x] Fechamento (19/10): `npm run done` verde (1134 testes, build); sonda em Chromium headless (menu, partida, arena
          de chefe, camada 10 com máquinas, créditos com o link, `?renderer=2d` abrindo em 3D), zero erros; tag `classic-2d`
          publicada; mesclado em 19/10 como PR #269 com o OK do dono (o #268 fechou sozinho quando o ramo das ondas foi apagado).

## Fora de escopo deste plano

Steam, mobile/touch, multiplayer, narrativa, reescrita do gameplay em WebGL (ver decisão 1), troca do framework de
testes, monetização. Arquivos antigos de processo (GSD, `.planning/`) ficam fora do repo; o histórico está no git.
