# Pendências — o que está quebrado e o que falta

Lista viva do que está aberto, nas palavras do dono. Fechados em 19/10 pelo veredito dele jogando (Mac M1, 60 fps):
1, 3, 6, 7, 8, 9; e 10–14 (o goal de 18/10) feitos na conversa local em 19/10; 17 (câmera) fechado por ele em 20/10 —
história no git. Leia só a seção O BASTÃO e o item da vez; o resto, por `grep`.
Item resolvido sai da lista e vira commit; a história de cada número fica no git (`git log --all --grep="(NNN)"`).
Número é identidade, não posição: item novo entra no fim da sua seção. **Próximo número livre: 34.**

## O BASTÃO — onde as sessões pararam (12/11) — A CAMPANHA ESTÁ NA `main`; O TRABALHO ATUAL, NO RAMO `campanha/ajustes`

**Estado em 12/11 (vale sobre o que estiver mais abaixo e disser outra coisa):** em 12/11 ele entregou o projeto —
_"Esse projeto é seu… Decida o que fazer"_, _"o projeto está sendo tocado por você"_, _"não necessariamente algo que foi
feito… quer dizer que isso é definitivo e que está bom o suficiente… você mesmo deve perceber e avaliar"_ — e autorizou
conversas paralelas. A campanha de nove fases (seis Sentinels, três Wardens) entrou na `main` pela PR #303 (12/11) e está publicada. O
trabalho atual está no ramo `campanha/ajustes` (PR #305 aberta; não incorporar até ele dizer); o detalhe está no `PLAN.md`. A visão do
jogo é `docs/GAME_DESIGN_MASTER_PLAN.md` (22/10). Conteúdo hoje: 16 inimigos, 7 armas, 39 cartas, 3 cascos, 15 camadas
na descida, 3 biomas, 3 Wardens, 3 Heralds, Sentinels por fase; o golden trace tem 26 cenários. Dois pedidos dele
estão em conversas paralelas: audição de som e painel menor em imagens. Ele ainda não jogou nada de 12/11.
**13/11:** ele respondeu à página de decisões (`src/exported-assets/decisoes/`, fora do git) e escolheu os sons dos
sete chefes novos; as respostas viraram os itens 26 (complemento) e 27–32 abaixo. Ainda não publicar: _"quero jogar
antes"_. Autorizou regravar o golden trace (feito) e arquivar as sessões e ramos de 12/11.

**Como retomar (conversa local, qualquer máquina):**

1. `git checkout campanha/ajustes && git pull && npm ci && npm run done` (gate = lint + formato + testes + build; o golden trace de
   26 cenários prova comportamento igual). Jogo: `npm run dev` → `http://localhost:5500/ASTEROIDS_ROGUEFIELD/`. Captura: o
   navegador embutido da conversa local (não há scripts de sonda ou captura no repo).
2. Ler, nesta ordem: este BASTÃO; `PLAN.md` (Rodada 15, oito frentes em ordem); `CONTENT.md` (como adicionar inimigo,
   arma, carta, casco, fase, bioma, chefe — um arquivo cada, zero linhas no motor); `docs/NORTE.md` (§1 ficção, §2–3
   arte); `BACKLOG.md`.
3. Juntar na `main` sempre por pull request (a conversa local tem feito isso; o hook bloqueia publicar a `main` direto).

**Regras dele que valem para sempre:** (a) agir independentemente e crescer o jogo a cada rodada; (b) toda rodada
melhora também gráficos, efeitos, câmera, jogabilidade e UX; (c) tudo em inglês no jogo; (d) números são "proposta"
nomeada no conteúdo — ele julga jogando; (e) um commit por fatia, com captura; (f) nunca `git add -f`; (g) docs só com
o que está aberto; (h) **maquete antes de código** para interface e câmera (ele aprova a imagem, depois se implementa);
(i) **"às vezes menos é mais"** — a primeira câmera diretora foi rejeitada por overengineering; a de dois estados
(perto/aberta) foi aprovada.

- **Aprovado por ele (até 20/10):** a janela inteira com tela cheia (_"tudo está rodando liso, não precisa medir
  nada"_); a câmera de dois estados (_"está boa, pode fechar"_); as chegadas dos Wardens (_"aprovado"_); a arena com
  volume de qualquer ângulo; os sons que escolheu (`SOUND.md`).
- **Veredito dele, jogando (20/10):** _"por enquanto eu diria que a gente está numa fase beta. O jogo ainda não tem
  conteúdo suficiente… algo que a gente tem aqui para poucos minutos de jogo… nada do trabalho que a gente fez é
  perdido, mas eu acho que falta uma visão grande das fases, da história e do mapa"_.
  - Balanceamento: _"vem mais para frente"_.
  - Som (revisar _"mais para frente"_): o tiro _"está com um barulho constante, um pouco chato… tinha que ser um pouco
    mais sutil"_; ao motor _"falta… umas camadas de som mais graves"_; ao começar a partida _"tem um barulhinho que
    parece que foi herdado do modelo antigo… precisa refazer"_; a trilha _"vai fazendo umas frequências chatas… para
    criar uma tensão… não funciona bem… repensar toda essa parte"_; _"a única coisa… funcionando bem é a música da
    introdução"_ (feita por ele).
  - Baú: _"a abertura do baú foi legal, me agradou"_.
  - Painel e telas: _"me agradou essa versão nova"_; os indicadores na nave _"deixa a interface mais clean"_; _"alguns
    elementos estão muito grandes… podem diminuir um pouco, ocupar um pedacinho menor do layout"_.
  - Modo daltônico: _"nem testei, não é importante isso agora"_. Anel de perto: _"tem que refinar ainda"_.
  - Estrutura: capítulos com fases, fases com ondas e um chefe no fim; _"o próximo capítulo da história… a gente talvez
    mude totalmente o cenário"_; uma árvore de habilidades, equipamentos e melhorias liberada aos poucos com o dinheiro
    ganho, como no Vampire Survivors, pensada junto com a evolução e o tempo para vencer cada desafio; ligar tudo num
    roteiro que faça sentido (item 19).
- **Avisos desta sessão:** o navegador escondido do app toca som — sair da página do jogo ao terminar e todo
  Playwright de ajudante com `--mute-audio`; ele não vê o painel do navegador quando não está na janela desta conversa
  (mandar o endereço local); até 4 ajudantes ao mesmo tempo (limite do app).
- **Abertos dele:** itens 2, 15, 16, 18, 19, 20 e 21–26 abaixo. `BACKLOG.md`: notas técnicas, não são dele.

**Vereditos dele até aqui:** Rodadas 5–13 aprovadas jogando (M1, 60 fps; "é pouco conteúdo… Vampire Survivors são
dias de desafio"); primeira câmera contínua rejeitada; câmera de dois estados e chegadas dos Wardens aprovadas
jogando (20/10); "não tem problema mostrar a borda"; "a gente quer ver o inimigo chegando" (sem pausar a cena).

**Avisos de processo:** até quatro ajudantes ao mesmo tempo (limite do app), cada um com os arquivos dos outros nomeados; `pgrep -f`/
`pkill -f` matam o shell do ajudante; `set -o pipefail` em cadeias com testes; um ajudante pode "cair" sem escrever —
conferir o diff; apagar refs remotas em massa é bloqueado na nuvem (a limpeza foi feita localmente: de 224 ramos
antigos restam ~29); o erro de console `game-session` → `renderer` ao carregar é antigo e não impede a partida.

## Jogabilidade e sensação

- **(2)** Boss da wave 5 levou ~120 s para morrer com 6 upgrades — _"difícil, mas dá"_ (maio/2026). Alvo era 60–90 s.
  Em 20/10, perguntado se ainda sente: _"ainda demora"_ → Rodada 15, frente 7.

## HUD e janela (palavras dele, 19/10, manhã)

- **(16)** _"O radar está muito básico… todos os instrumentos do painel não condizem com a realidade nova de um projeto
  AAA."_ / _"O app tem uma janela dinâmica… precisa se adaptar a isso também."_ → janela inteira feita; o resto é a
  Rodada 15, frente 4 (`HUD.md`, instrumentos por maquete aprovada por ele). Fecha quando ele disser que o painel está à altura do jogo.

## Som (palavras dele, 20/10)

- **(18)** _"O som do jogo SFX precisa renascer do zero praticamente, tudo muito ruim também."_ → Rodada 15, frente 2:
  amostras geradas pela skill local dele `/sfx-generator` (AudioLDM) e CC0 onde o modelo falha, página de audição
  `?sound=` onde ele escolhe, `SOUND.md`, mix com ele jogando. Decisão dele: o jogo passa a carregar arquivos de áudio. Fecha quando ele
  disser que o som está à altura do jogo.

## Fundo (palavras dele, 18/10, noite)

- **(15)** _"Eu olhando bem no fundo aqui, eu percebo uma faixa mais escura no fundo, como se fosse um ribbon, um
  stripe, que eu não entendo do que se trata. Parece um defeito."_ / _"Ao invés de só tirar, me explica qual era a
  intenção. Talvez seja algo importante para a história."_ (18/10, noite). É o **Anel partido** (`fieldBackdrop.js`,
  NORTE §1–2): o campo de jogo é o campo de destroços de uma megaestrutura em anel; a faixa é um pedaço dela, longe
  abaixo, em silhueta contra a nebulosa, para dar escala e lugar — e no epílogo da vitória ela acende em violeta
  (`setWake`), o Anel voltando à vida quando os Wardens caem. A intenção é importante; a execução não lê: banda
  chapada, sem luz, sem espessura. Nada foi mudado em 18/10 (ele não aprovou o paliativo de opacidade). Em 20/10 ele
  escolheu _"virar estrutura de verdade"_: modelar o Anel como estrutura iluminada (espessura, segmentos, borda pela
  luz-chave, névoa de distância), mantendo o acender do epílogo → Rodada 15, frente 8.

## História (palavras dele, 20/10)

- **(19)** Sobre o Anel remodelado: _"mesma estrutura, mas ela tem que ser 3d de verdade por todos os lados pois acho
  que no futuro numa fase nova, podemos viajar para região desse ring, mostrar a viagem acontecer e mais etapas da
  história acontecerem lá. essa viagem poderia ser até mesmo mostrando a nave por trás em 3a pessoa sabe? como num
  cutscene e ter diálogos acontecendo, etc temos que refinar melhor esse roteiro o drama nele, a surpresa, a
  reviravolta, até o endgame."_ → narrativa sai do "fora de escopo"; primeiro um roteiro em texto que ele aprova, o
  Anel como asset 3D completo, depois a fase da viagem. Fecha quando ele aprovar o roteiro e jogar a viagem.

## Modelos 3D (palavras dele, 12/11)

- **(20)** Sobre os modelos: _"a qualidade dos modelos 3D está bem fraca, próximo ao que a gente tinha antes"_ (o
  primeiro Quarry Maw; refeito no mesmo dia pela conversa principal, em placas com painéis — falta ele ver). E sobre as
  naves do jogador: _"o próprio modelo das naves do player… tem algumas oportunidades também. Aos moldes do que faz o
  Elite Dangerous, aquele jogo de nave também chamado Chorus, tem modelos muito legais. De naves. Everspace."_ → imagem
  antes de código; fecha quando ele aprovar as naves novas.

## Campanha (palavras dele, 12/11, jogando no site)

- **(21)** Passagem de fase: _"quando você passa de fase, mata o boss… e escolhe seguir no jogo para a próxima etapa,
  todas as coisas da tela somem, então não dá nem para pegar os spoils, os orbes que estão na tela, não aparece aquele
  countdown como aparecia antes."_ Fecha quando ele passar de fase e conseguir recolher o que caiu.
- **(22)** Primeiro boss: _"a segunda etapa dele, não inova, não fica mais difícil, nada muda. Ele continua jogando 3
  asteroides que são muito fáceis de destruir. Deveria ter um desafio um pouco maior na segunda etapa dele."_
- **(23)** _"todos os upgrades que eu peguei desapareceram de uma etapa para outra, assim que eu dei próximo setor…
  Mais grave ainda."_ Fecha quando ele seguir para o próximo setor com a nave como estava.
- **(24)** Lugares e viagens (depois de ver a prancha das nove fases só com cores): _"tem que ter cenários diferentes,
  mas percebe que já é uma arena 3D, o próprio anel por trás faz parte dessa ambientação. Então, talvez uma fase
  poderia ser mais próxima do anel, até dentro do anel em algum momento, em volta do anel, num planeta de fundo, um
  planeta próximo, perto de uma estrela, um campo de asteroides gigantes ao fundo… Um cemitério de naves enormes… um
  disco protoplanetário… tem que pensar no roteiro que você escreveu… o roteiro é que pode prever isso. E entre uma
  fase e outra, a nave pode se deslocar, entrar no hiperespaço… na hora do jogo, tudo bem ser isométrico… Mas na hora
  que você vai de um lugar para o outro, os cutscenes e tal, são horas interessantes para a gente brincar com essas
  possibilidades, já que a gente está se esmerando em fazer um mundo que é todo 3D."_ São ideias, não lista fechada.
  Fecha quando ele vir as fases em lugares diferentes e as viagens.
- **(25)** Chefe final: _"o Final Boss tem que ser algo assim muito, muito diferente. Tipo, super bem feito, detalhado,
  um modelo diferenciado, tipo… aquela nave que no filme dos Guardiões da Galáxia era do pai do Star-Lord? Algo naquele
  gênero… Ou até mesmo a própria nave do Star-Lord… seria muito legal ter um modelo mais diferenciado, assim, inspirado
  em coisas mais bacanas. Óbvio que pode ser adaptado para nossa estética."_ Inspiração, não cópia. Fecha quando ele
  aprovar o modelo do Sovereign por imagem.
- **(26)** Materiais: _"Eu não sei porque que a gente deixou tudo fosco. Acho que podia ter coisas que tivessem materiais
  mais reflexivos e brilhosos também. Não sei se isso penaliza muito o jogo, mas por quê, né? Por que não?"_ → o fosco
  veio do `docs/NORTE.md` (luz só como informação); a cena já tem ambiente para reflexo, custo quase nulo. Primeiro no
  Sovereign, por imagem; depois onde fizer sentido (cristais, metais de nave, chefes).
  **13/11, ao aprovar a pedra de ouro polida:** _"falei de brilho nos materiais, mas acho que nave, vidros, metais,
  todos podem ter um pouco de brilho de acordo com o material real… se for aço inoxidável tem brilho, se é vidro, tem
  brilho e daí por diante. Metais geralmente têm brilho, entendeu meu pedido? Talvez você já tenha feito isso, só estou
  explicando."_ → o brilho segue o material de verdade em tudo (máquinas, chefes, estruturas), não só onde é "joia".
- **(27)** Equilíbrio como no Vampire Survivors (13/11, ao não escolher alvo para a fase final): _"acho que temos que
  repensar o equilíbrio como é hoje em Vampire Survivors (nossa inspiração além do Asteroids). Hoje você só consegue
  avançar no Vampire Survivors depois que começa a comprar itens de power-ups na loja com a moeda do jogo. Já havia
  pedido um estudo sobre isso, deve estar no repo. Precisamos lançar isso para ser investigado e implementado
  corretamente no jogo. Não vamos fazer isso agora, mas deixe registrado."_ → o estudo é `docs/GAME_DESIGN_MASTER_PLAN.md`
  (§3 e a parte de meta entre partidas); o jogo já tem moeda (Salvage) e loja (Hangar). Não começar sem ele pedir; até
  lá, não calibrar a campanha para ser vencível sem loja.
- **(28)** Itens fora da tela e área de coleta (13/11): _"os corações muitas vezes ficam para fora da tela e precisam
  voltar para a arena assim como as orbes. Os demais itens também talvez estejam passando pela mesma coisa… tenho
  dúvidas se precisamos aumentar um pouco a área de atuação do collect da nave para pegar um pouco mais facilmente esses
  itens (não acho que eles devam ser magnéticos como são as orbes)."_ → coração agora sempre cai dentro da arena
  (13/11); conferir baús e outros itens; a área de coleta é dúvida dele: propor com número, ele decide.
- **(29)** Sortear e banir ao passar de fase (13/11): _"Tudo segue junto: usos gastos continuam gastos."_ E a conquista
  Full Set: _"Prefiro a meta difícil: família completa."_
- **(30)** Som ao pegar coração (13/11): _"Quero um som: prepare opções para eu ouvir."_
- **(31)** Ataques dos chefes (13/11, sobre a jaula do Interdictor): _"mas como a nave lança essa grade? Isso não
  deveria ser um material de verdade? Tem que ter algo real e físico ou um dispositivo que gere esse campo, uma arma…
  acho particularmente que o efeito está muito sem graça e feio… aliás todas as miras e efeitos de dano e armas dos
  bosses estão muito sem graça, deveria tudo isso ser revisto e polido."_ Fecha quando ele aprovar por imagem e jogando.
- **(32)** Viagem entre fases (13/11): _"De uma forma geral acho que avançamos, mas vejo oportunidades ainda. As trocas
  de fase, tipo os cutscenes, imaginei que a nave estaria realmente viajando no espaço 3D do universo que criamos, indo
  de uma localização para outra. E acho que a nave precisa respeitar essa movimentação dentro do cenário, usando seus
  motores ou talvez, dependendo da distância, entrando em dobra, mas o movimento da nave tem que ser real, de virar de
  frente para onde ela está indo e ir. A câmera tem que ser interessante, como num filme de Star Wars que segue um
  X-wing. Precisa polir."_ Fecha quando ele vir a viagem nova.
  **13/11, depois de ver os vídeos da viagem refeita** (as três: _"Está no caminho certo"_): _"Quero mais cara de
  filme: câmera mais ousada, mais cortes… está na direção certa, mas acho que o polimento pode ser levado mais para
  cara de filme e integrando melhor com as localizações 3D."_
- **(33)** Som da viagem (13/11): _"também está sem som para mim, acho que tem que pensar na direção de SFX e trilha se
  couber, falas também seriam bem-vindas… as vozes que têm legenda seriam muito interessantes de serem ouvidas."_ →
  audição antes de código (SFX da viagem, trilha, vozes do Anel e do Wake); voz falada pede um modelo de voz que o
  projeto ainda não tem.
  **Escolhas dele para os sons da viagem (13/11, audição em `src/exported-assets/audicao-viagem/`):**
  _"queima=B carga-dobra=A passagem=C ignicao=B salto=A saida=C"_. Autorizou baixar um modelo de voz livre
  (_"Sim, pode baixar"_) para a audição das vozes. Escolheu também o som do coração (_"coracao=A"_, já no jogo) e os
  sete dos chefes (já no jogo).
  **Vozes escolhidas (13/11, audição em `src/exported-assets/audicao-vozes/`):** _"ring=bf_emma/tratada
  wake=bm_george/tratada sovereign=am_onyx/tratada"_. Faltam as vozes dos outros que falam (Wardens, Sentinels,
  Heralds): audição antes de entrar.
