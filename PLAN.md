# Modernização do Asteroid Roguefield — plano (17/10/2026; Rodada 0 na `main` desde 19/10, PR #280; Rodada 14 decidida 19/10)

Tarefa que atravessa sessões. Quem pegar este arquivo lê tudo antes de mexer; marca a etapa feita aqui; o que fecha
sai daqui (a história fica no git: `git log --oneline --merges main`, PRs até #280). Decisões de produto são do dono,
por imagem e jogando — nunca por teste.

## Passagem de bastão (19/10, noite)

- **Rodada 0 na `main`** (PR #280, 19/10, com o OK dele): `npm run done` e a checagem do GitHub verdes; sonda no
  navegador (menu, configurações, partida, morte → Game Over → Retry, cena hero, `?content=`).
- **Prova da fábrica** (19/10): um ajudante, só com o `CONTENT.md`, criou um inimigo (Lancet) e uma arma (Needle Array)
  com um arquivo cada e zero linhas no motor; o ramo foi apagado a pedido dele depois de visto (a carta nova só mudava as
  ofertas de nível no trace). Recriar é um arquivo cada.
- **Para o dono conferir:** jogar uma partida no site (nada deve ter mudado); medir a horda na tela dele — abrir
  `?content=drone&count=200&quality=ultra&fire=1&desktop=force` e ler o fps no painel F8 (aqui, com a GPU do M1 em
  Chromium headless, deu 60,0).
- O erro de console `game-session` → `renderer` ao carregar já existia na `main` (19/10) e não impede a partida.
- **Se ele notar brilho mais fraco ou controle "clássico":** conferir primeiro o endereço e a qualidade. Em 19/10, no
  endereço local, as configurações salvas estavam em clássico (sem inclinação lateral, de propósito) e a qualidade
  automática caía de ultra para alto; na mesma qualidade, quatro conferências deram imagem e valores idênticos.

## Rodada 0 (19/10) — baratear o conteúdo antes de crescê-lo: feita

Dele (19/10): _"vi e aprovei, mas é pouco conteúdo… Vampire Survivors são dias de desafio"_; _"repensar a nossa
estrutura de forma inteligente para diminuir o custo de todas as melhorias feitas só por AIs"_. Princípio: **conteúdo é
dado, comportamento é biblioteca pequena, um registro liga os dois; quem adiciona conteúdo não toca no motor.**

- **Teto de 1.200 linhas** por arquivo no ESLint, sem exceções: os 17 arquivos acima dele foram divididos por assunto
  (menu, inimigos, ondas, sessão, nave, física, orbes, áudio — a tabela evento → som virou dado —, HUD, renderizador,
  mira, chefe, efeitos, configurações, interface, entrada, teste da mira) e a lista de exceções chegou a zero.
- **Prova de comportamento igual:** `tests/integration/golden-trace.test.js` (21 partidas headless de 60 s, hash por
  segundo do estado e dos eventos; duas voam a nave). Toda fatia de refatoração passou com o fixture intacto, salvo uma
  mudança de propósito: em `21de1fb` a carta de arma passou a emitir um evento só (`upgrade-weapon`), e mudaram os hashes
  de eventos de Harmonic e Scatter, não os de estado. Replays gravados na `main` tocam iguais no ramo. Limites: o trace
  não desenha nem toca som (imagem, som e fps foram conferidos à parte), guarda nomes de eventos e não os dados, e em
  outra arquitetura (CI x64) compara duas partidas atuais entre si, não com o fixture.
- **Registro** (`src/content/registry.js`): inimigos, chefes, armas, cartas, cascos, camadas, biomas — um arquivo cada.
  O motor não nomeia inimigo nem arma: tipos, pools, agenda, recompensas, afixos, efeitos, sons, Códice, falas e
  aparência vêm do arquivo. Um teste trava a regra de import dos arquivos de conteúdo.
- **Inimigo = receita** (`RecipeEnemy` + 15 comportamentos em `src/modules/enemies/behaviors/`); **arma = padrões**
  (`stream`, `beam` a cada N, `fan`) com a carta dentro do arquivo; **visual = receita** (`view` ou `visual`, com
  aparência padrão); **diretor por papéis** (camadas pedem papéis; inimigo declara `roles`, `weight`, `fromLayer`).
- **Cena de conteúdo** `?content=<id>` (`&count=`, `&fire=1`); **`CONTENT.md`** de uma página; **horda**: 200 Motes a
  60 fps no M1 em Retina e qualidade ultra (era 56 com engasgos; o custo eram as passadas de tela cheia, não os
  inimigos).

**Pronto quando** — conferido 19/10: inimigo e arma novos com um arquivo cada e zero linhas no motor (prova de 19/10, acima); os 10
inimigos e 3 armas migrados com comportamento igual (trace); nenhum arquivo acima do teto e nenhuma exceção; 200 Motes a
60 fps no M1 (medido aqui; falta ele ver na tela dele).

**O que ficou de fora, de propósito:** Wardens e Heralds continuam classes (só os dados viraram conteúdo); padrões de
arma orbital/aura/cadeia nascem quando uma arma pedir; instancing de inimigos não foi feito porque a medida não pediu.

## Rodada 14 (decidida 19/10, manhã, com ele) — a janela inteira, um HUD de instrumento, e guardas no gate

Dele (19/10): _"o radar está muito básico… todos os instrumentos do painel não condizem com a realidade nova de um
projeto AAA"_; _"o app tem uma janela dinâmica… precisa se adaptar"_; _"vocês acham que esse box fixo é a melhor
solução para um browser?"_ (não é: herança do Canvas 800×600; nenhuma razão de estilo). Liberdade no **como** (estilo,
movimento, instrumentos); o **o quê** fica travado por critérios verificáveis. Nada aqui muda balance: a arena segue
800×600 lógicos com wrap; a câmera segue presa dentro do campo.

- [x] **14.1 Conferido (19/10, leitura do código; não medido em navegador).** O campo é uma caixa 4:3 escalada para
      caber, centrada (`viewportScaling.js` ~109-146: escala = min(altura, largura) presa a [0,45; 1,9]; canvas =
      800×600 × escala; mínimo 360×270, máximo 1520×1140); em 1920×1080 sobram ~288 px vazios de cada lado; as faixas
      são o gradiente do `#game-ui`. A câmera 3D usa a proporção do canvas (4:3) e já tem `clampToField(distance,
aspect)` (`cameraRig.js` ~136-150, 226-249): basta o canvas tomar a janela e a câmera receber a proporção dela.
      Densidade: `MAX_DEVICE_PIXEL_RATIO = 2` (`viewport.js`), composer por preset (ultra 2 / high 1,5 / medium 1,25 /
      low 1); o menu usa DPR sem teto. HUD é DOM + CSS dentro do canvas (grade fixa 220px 1fr 220px, feed 200px); fonte
      por `--hud-scale-effective` com três clamps que discordam (schema 0,8–1,3; painel 0,6–1,4; viewport 0,6–1,2) e
      saturando em 1,2 a partir de ~807 px de altura; `--game-canvas-width/height`, `--hud-max-width`, `--hud-scale`
      e `--hud-scale-auto` são escritos e nunca lidos; `@media ≤900px` do canvas nunca se aplica (inline vence);
      `#minimap-canvas` é procurado e não existe. Tela cheia existe em `SettingsPanel.js` ~352-368 mas sem botão nem
      chave no schema (inalcançável). Arena 800×600 com wrap só para nave e rochas (pickups prendem, projéteis somem).
      Menu, Hangar, Códice e Settings já são tela cheia (`.screen` fixed inset 0) com painéis limitados por `min()`.
- [ ] **14.2 A janela inteira.** O jogo ocupa toda a janela em qualquer proporção (16:9, 16:10, 21:9, 4:3) e densidade;
      a vista é uma fatia da arena com a proporção da janela, **nunca além da borda do campo** (teste: em 21:9 a câmera
      presa ao campo não expõe o wrap); canvas 3D na densidade real com teto por preset (Retina do M1 a 60 fps); botão
      e tecla de tela cheia; áreas seguras; nenhum texto cortado em 1280×720. Captura em quatro proporções.
      **Feito e publicado (19/10); falta ele jogar e medir na tela dele.** Canvas = janela, densidade = tela (teto 2,
      presets como estavam). Câmera: altura vista = min(600/zoom, 800/proporção), presa para que o trapézio inclinado
      caiba no campo; o renderer diz à câmera lógica até onde o quadro alcança, então ela chega às quatro bordas (teste
      em `cameraRig.test.js`, proporções 1:1 a 32:9). Em zoom 1,3 a vista no alvo é 615×462 em 4:3 (igual a antes),
      711×400 em 16:9, 711×305 em 21:9. Tela cheia: chave em Settings → Interface e tecla F (nunca pedida ao carregar).
      Menu comprimido pela altura para caber em 1280×720 (casco em uma linha de três). Medido no painel do app, M1,
      horda de 200 em ultra com `renderScale=2`: ~61 fps na caixa antiga (2232×1674) e ~52 fps na janela 1440×900
      (2880×1800) — falta medir na tela dele; um teto de pixels por preset seria decisão dele.
- [ ] **14.2b Câmera diretora** (pendência 17; antes do HUD, porque o radar acompanha o zoom). Com a janela inteira a
      câmera em tela larga já vê o campo de lado a lado: não tem para onde se adiantar nem se afastar. Ele quer uma
      câmera que dirige a cena: dá peso ao que importa no momento (chefe, mini-chefe, alvo valioso, ameaça rápida,
      saque, inimigos), escolhe posição, zoom e ângulo, adapta-se à forma da janela, tem momentos (calmo, perigo, onda
      limpa, entrada de chefe, morte, vitória). Regras fixas: nunca além da borda do campo; nunca esconde a ameaça que
      vai acertar; ângulos ousados só em momentos especiais; reduzir movimento respeitado. Ordem: (1) pesquisa de
      referências e algoritmos prontos (`docs/pesquisa-camera-2026-10-19.md`); (2) uma página de comportamento que ele
      aprova; (3) implementar sobre o que já existe (avanço pela mira, afastar em perigo, enquadrar chefe), números num
      lugar só, cena de teste por momento; (4) ele joga e ajusta — sensação, não fecha por teste.
      **(2) Página publicada 19/10** (privada, dele): https://claude.ai/artifact/2SQknYsbX8AxEQpPR5JDpi — oito momentos
      sobre capturas reais em janela 16:9 (quadro escolhido no campo + o que aparece na tela, com o movimento ao tocar),
      pesos, forma da janela (16:9, 21:9, em pé), cinco regras fixas, números de partida da pesquisa e uma escolha dele:
      travessia da borda por corte rápido (proposta) ou deslizar. **Aprovada por ele em 19/10:** _"1) ok 2) deslizar a
      camera rapidamente"_ — os oito momentos, pesos, regras e números de partida ficam como na página; na travessia
      da borda a câmera desliza rápido até o outro lado (não corta; a rapidez é número de ajuste).
      **(3) Primeira versão (19/10, ramo `r14/diretor`, commit `a65b28f`, PR #288): rejeitada.** Diretor contínuo com
      oito momentos, pesos e zoom por bisseção, preso dentro do campo. Dele, vendo as capturas: _"acho q ficou ruim, o
      zoom out para dar amplitude do enquadramento nao está funcionando direito... em momento algum conseguimos ver todo
      o battlefield na tela... as vezes menos é mais. talvez estejamos overengineering algo que é simples"_. Causa: a
      regra antiga (nunca além da borda) com o campo 4:3 e a inclinação; em 16:9 a altura inteira nunca cabe. Ele pediu
      uma análise ao ChatGPT (relatório fora do repo, 19/10): nave obrigatória acima da ameaça, perigo quase de cima,
      sem girar enquanto se joga (os controles não giram com a câmera), borda atravessável e visível, preparar a
      travessia, ler ataques anunciados, separar `boss-defeated` de `run-won`, flutuação sutil, conferir o quadro final.
      **Segunda versão aprovada 19/10:** https://claude.ai/artifact/DXgVoUtHcjcEob5er2Q69e. Dele: _"Aprovo: de cima
      enquanto jogo, cena viva só na chegada do chefe, vitória final e morte, véu de luz na borda, e perto com a
      inclinação leve de hoje."_ Também dele: _"não acho q tem problema mostrar a borda"_; pausar a cena não (_"a gente
      quer ver o inimigo chegando"_); jogo inteiro com câmera baixa fica como ideia futura. Passos da segunda versão:
      (a) câmera de jogo em dois estados de cima: perto (a inclinação de hoje, segue a nave, pode passar da borda) e
      aberta (quase de cima, campo inteiro e entorno; no fim da fase, ameaça fora da tela ou de vários lados, ataque
      anunciado, travessia prevista, elite ou onda grande fora da vista; tempo mínimo); nave sempre na tela; flutuação
      sutil na calma; reduzir movimento; (b) véu de luz nas bordas e espaço mais escuro além delas; (c) fundo de
      estrelas sem emendas visto de baixo; (d) chegada animada de cada chefe atravessando a borda; (e) cena viva
      (câmera lenta forte, jogador protegido e sem controle 2–3 s, câmera baixa que pode girar, sobe antes de devolver o
      controle) só na chegada do chefe, `run-won` e morte; queda de chefe no meio = destaque curto de cima. Ordem: (a) e
      (b) primeiro; (c) e (d) podem correr em paralelo; (e) depois deles. (4) ele joga e ajusta.
      **(a) e (b) feitos 19/10 no mesmo ramo:** `src/core/cameraDirector.js` reescrito em dois estados (perto/aberta,
      `?moment=near|wide` em dev), números em `src/data/constants/camera.js`; `src/modules/render3d/fieldVeil.js` (espaço
      além da borda mais escuro, linha de luz, cortina baixa). Eventos: `wave-started`, `wave-complete`, `elite-spawned`,
      `boss-telegraph`, `boss-spawned` (via `playArrival`, abre a vista aberta até existir a cena viva), `boss-defeated`
      (empurrão curto de cima). A cena viva, a morte e a vitória final ainda não têm câmera própria. (c) e (d) estão
      propostos como sessões à parte.
      **(d) e a cena viva da chegada feitos 19/10 (ramo `claude/dazzling-agnesi-e1b925`), falta ele jogar.** Maquete
      https://claude.ai/artifact/2AGKP3kzM1YeV2nFdK19GL; depois dele: _"cada chefe tem que ter sua própria animação
      de entrada… uma receita já pronta… uma câmera 3D que movimente e que mostre por outro ângulo uma entrada
      dramática"_, e rápida. Receita `arrival` em cada Warden (`src/content/bosses/`, CONTENT.md): nasce além da borda
      lateral mais longe da nave, entra aberto (Prime anel, Coro núcleos, Null placas) com o mundo a 1/4 e a nave
      presa e protegida, a borda acende onde ele cruza, fecha e só então luta (~1,2–1,7 s); câmera baixa do roteiro
      dele e volta à vista de jogo ao fechar. Na simulação (`enemies/boss/arrival.js`), então repetições exatas; golden
      trace muda só nos cenários com Warden. Morte e vitória final seguem sem cena viva.
- [ ] **14.3 `HUD.md`.** Tokens (cores do Anel, tipografia, escalas, espaçamentos), regras de hierarquia (o que importa
      agora é grande; o resto some até ser preciso), regras de movimento (toda mudança de valor pulsa curto; painéis
      entram e saem com easing), estados (calmo, ameaça, chefe, morte). Uma página. Todo instrumento obedece.
- [ ] **14.4 Maquete antes de código.** Cada instrumento novo nasce como imagem (HTML estático sobre captura real),
      ele aprova, só então implementa. Começar pelo **radar tático**: anéis de distância em escala real, blips com
      forma por tipo (rocha, máquina, Elite, Warden, pickup/orbe), direção das ameaças rápidas, marcas de pouso do
      Caster, zoom acompanhando a câmera, bordas que apontam o que está fora. Em seguida: recargas (dash, escudo,
      arma) como anéis ancorados na nave; barras de casco/escudo/XP com hierarquia e pulso; chips de arma/mira/dash
      como ícones; barra de chefe com fases; feed de abates. Menos instrumentos, mais densos.
- [ ] **14.5 Menu, Hangar, Códice e Settings na mesma linguagem** do `HUD.md`, na janela inteira.
- [ ] **14.6 Legibilidade em horda.** Com 200 inimigos (`?content=drone&count=200`), telegrafias, silhuetas e cores de
      ameaça lidas em meio segundo; passe de contraste e de prioridade visual (ameaça > pickup > decoração).
- [ ] **14.7 Guardas no gate.** Orçamento de quadro por cena (`?content=` e hero: tempo de quadro medido em headless
      com limite; falha se estourar) e capturas de referência por cena (diferença acima do limite exige aprovação dele
      — o teste não passa sozinho). Golden trace segue verde em toda fatia.

**Pronto quando:** sem faixas pretas em 16:9 e 21:9; 60 fps em Retina no M1 na horda; radar e instrumentos
implementados a partir de maquetes que ele aprovou; menu/Hangar/Códice na mesma linguagem; as duas guardas no gate;
golden trace verde. **Fora de escopo:** conteúdo novo (Rodada 15).

## Rodada 15 (próxima; texto do goal já redigido) — longevidade

Longevidade estilo Vampire Survivors sobre a fábrica e sobre o HUD novo: 12+ armas com evolução e Apex próprios, 30+
inimigos com papéis distintos, 6 biomas com segredos, eventos e chefes próprios, roster de cascos com habilidade única,
árvore de desbloqueios e desafios que atravessam dias, runs de 20–30 min com centenas de inimigos a 60 fps, infinito
que escala; qualidade por padrão mais alta (volumetria, feixes na poeira, Anel partido modelado, herói e chefes com
material de próxima geração). Cada item novo é um brief "adicione X seguindo CONTENT.md"; até cinco ajudantes em
paralelo; números são proposta; ele joga.

## Decisões já tomadas

1. O menu em Three.js fica como está: é o alvo visual do jogo ("o jogo é continuação do menu", `docs/brand.md`).
2. Direção: `docs/NORTE.md` vale (casco fosco, neon só na informação, fundo com volume).
3. Cada etapa visual termina com captura antes × depois e com `npm run done` verde. Ele aprova pela imagem.
4. Balanceamento e sensação (XP, boss, shake, hit-stop) nunca fecham por harness: proposta com número, ele joga.
5. O 2D saiu do código (19/10); a versão original é peça de museu, gerada da tag `classic-2d`, link nos créditos.

## Fora de escopo deste plano

Steam, mobile/touch, multiplayer, narrativa, troca do framework de testes, monetização. Arquivos antigos de processo
(GSD, `.planning/`) ficam fora do repo; o histórico está no git.
