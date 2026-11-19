# Pendências — o que está quebrado e o que falta

Lista viva do que está aberto, nas palavras do dono. Fechados em 19/10 pelo veredito dele jogando (Mac M1, 60 fps):
1, 3, 6, 7, 8, 9; e 10–14 (o goal de 18/10) feitos na conversa local em 19/10; 17 (câmera) fechado por ele em 20/10 —
história no git. Leia só a seção O BASTÃO e o item da vez; o resto, por `grep`.
Item resolvido sai da lista e vira commit; a história de cada número fica no git (`git log --all --grep="(NNN)"`).
Número é identidade, não posição: item novo entra no fim da sua seção. **Próximo número livre: 35.**

## O BASTÃO — onde as sessões pararam (18/11) — a `main` está publicada até a PR do `jogo/conjunto` (rodada 16–18/11)

**18/11 (vale sobre o que estiver mais abaixo e disser outra coisa):** a rodada de 16–18/11 foi fechada e publicada
por ordem dele — _"ok, está ok para publicar. vamos encerrar essa rodada de desenvolvimento e vamos deixar o github e
o projeto todo limpo e organziado e publicado"_ e, depois de ver o que sobra e o que seria apagado, _"Pode seguir"_ —
pela PR do `jogo/conjunto`. Entrou: cartas e trilha de pilotagem; hangar com medalhas, loja e pressão; trilha sonora;
efeitos de dano e impacto; 17 dos 43 sons trocados de gerador; pedras que se partem pela própria forma e o Pulse que
as parte em sequência; a cena da história com o cargueiro Wake e a ignição única. Decisões dele de 18/11: a doação
aparece e não espera a troca dos sons (_"nao precisa segurar nada pode usar as musiscas e sons feitos
tranquilamente"_); a cena da história não muda com "menos movimento" (_"ok, esperado, nem quero que fique..."_). Ele
ainda julga jogando a lista da conferência final, que não marcou: chefes, dificuldade fase a fase, sensação da nave,
radar e naves, sons e música. Trabalho novo sai de um ramo novo a partir da `main`.

**15–16/11 (vale sobre o que estiver mais abaixo e disser outra coisa):** ele reafirmou o modo dono — _"que se
sentisse dono do projeto, para passar por cima dessas coisas"_: escolha antiga não é motivo para deixar de melhorar —
e pediu _"tudo que vc fizer eu quero o antes e depois para comparar aonde eles mudam"_. Duas auditorias de fora
(Gemini) foram conferidas ponto a ponto rodando o jogo; os consertos entraram pelas PRs #308–#311 por ordem dele
(_"Pode juntar"_, _"Conserte"_). Sugestão de outro modelo não se descarta em uma linha (_"um modelo realmente
inteligente trouxe esses pontos"_): fechar a conta proposta por proposta — feita, feita de outro jeito e por quê, não
feita e por quê. **Câmera:** ele jogou três enquadramentos e escolheu — _"Fica a C"_ (o campo enche a tela na
largura); os defeitos da câmera de 19/10 foram corrigidos e ela mergulha para perto na queda de chefe (esses números
ele ainda não julgou em separado). **Fluidez** (`perf/fluidez`, sem mudança de imagem): entrou na `main` pela PR #313 (a
câmera pela #312), depois de ele jogar — _"Quero jogar antes"_ (14/11); a versão de teste que ele jogou em 16/11 já a incluía. Ele decide
jogando: o Salvage ao sair pela pausa e por máquina abatida, os corações, o canto seguro da Foundry Mother, os Casters
em uníssono, a morte dos Heralds, o som de ataque de Prime e Choir no aviso (tudo na última linha do `BACKLOG.md`).

**Estado em 12/11 (vale sobre o que estiver mais abaixo e disser outra coisa):** em 12/11 ele entregou o projeto —
_"Esse projeto é seu… Decida o que fazer"_, _"o projeto está sendo tocado por você"_, _"não necessariamente algo que foi
feito… quer dizer que isso é definitivo e que está bom o suficiente… você mesmo deve perceber e avaliar"_ — e autorizou
conversas paralelas. A campanha de nove fases (seis Sentinels, três Wardens) entrou na `main` pela PR #303 (12/11) e está publicada. O
trabalho de 12–13/11 entrou pela PR #305 (13/11, por ordem dele); o detalhe ficou no `PLAN.md`, hoje só no histórico do git. A visão do
jogo é `docs/GAME_DESIGN_MASTER_PLAN.md` (22/10). Conteúdo hoje: 16 inimigos, 7 armas, 39 cartas, 3 cascos, 15 camadas
na descida, 3 biomas, 3 Wardens, 3 Heralds, Sentinels por fase; o golden trace tem 26 cenários. Dois pedidos dele
estão em conversas paralelas: audição de som e painel menor em imagens. Ele ainda não jogou nada de 12/11.
**13/11:** ele respondeu à página de decisões (`src/exported-assets/decisoes/`, fora do git) e escolheu os sons dos
sete chefes novos; as respostas viraram os itens 26 (complemento) e 27–32 abaixo. Ainda não publicar: _"quero jogar
antes"_. Autorizou regravar o golden trace (feito) e arquivar as sessões e ramos de 12/11.
**13/11 à noite:** depois de aprovar por imagem e de ouvido a viagem (filme, sons, trilha, vozes), os ataques dos
chefes, o brilho e as vozes de todos os personagens, ele mandou: _"Vamos comittar, mergear, limpar e publicar"_ → a
PR #305 entrou na `main` e o site tem a campanha de dez fases. **Ele ainda não jogou nada de 12–13/11**: decide
jogando a luta do Interdictor (e se os aparelhos levam tiro), os volumes de voz/trilha, a cura, o alarme de casco
baixo. Trabalho novo sai de um ramo novo a partir da `main` (o primeiro: `som/armas-inimigos`, os dezesseis sons
que ele escolheu em 13/11, item 18).

**Como retomar (conversa local, qualquer máquina):**

1. `git checkout main && git pull && git checkout -b <ramo novo> && npm ci && npm run done` (gate = lint + formato + testes + build; o golden trace de
   26 cenários prova comportamento igual). Jogo: `npm run dev` → `http://localhost:5500/ASTEROIDS_ROGUEFIELD/`. Captura: o
   navegador embutido da conversa local (não há scripts de sonda ou captura no repo).
2. Ler, nesta ordem: este BASTÃO; `CONTENT.md` (como adicionar inimigo,
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
- **Abertos dele:** itens 2, 16, 18, 20, 25, 27 e 31 abaixo. `BACKLOG.md`: notas técnicas, não são dele.

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
  **13/11 (audição `src/exported-assets/audicao-armas-inimigos/`, dezesseis sons que ainda eram síntese ou mudos):**
  _"arc-caster=A shard-halo=A furnace-corona=A seeker-swarm=A harmonic-beam=A scatter-flak=A hunter-rajada=A
  mira-trava=A caster-carga=A caster-disparo=A caster-impacto=A chefe-fase=B chefe-derrota=B prime-ataque=C
  coro-ataque=B null-ataque=A"_.

## Modelos 3D (palavras dele, 12/11)

- **(20)** Sobre os modelos: _"a qualidade dos modelos 3D está bem fraca, próximo ao que a gente tinha antes"_ (o
  primeiro Quarry Maw; refeito no mesmo dia pela conversa principal, em placas com painéis — falta ele ver). E sobre as
  naves do jogador: _"o próprio modelo das naves do player… tem algumas oportunidades também. Aos moldes do que faz o
  Elite Dangerous, aquele jogo de nave também chamado Chorus, tem modelos muito legais. De naves. Everspace."_ → imagem
  antes de código; fecha quando ele aprovar as naves novas.

## Campanha (palavras dele, 12/11, jogando no site)

- **(25)** Chefe final: _"o Final Boss tem que ser algo assim muito, muito diferente. Tipo, super bem feito, detalhado,
  um modelo diferenciado, tipo… aquela nave que no filme dos Guardiões da Galáxia era do pai do Star-Lord? Algo naquele
  gênero… Ou até mesmo a própria nave do Star-Lord… seria muito legal ter um modelo mais diferenciado, assim, inspirado
  em coisas mais bacanas. Óbvio que pode ser adaptado para nossa estética."_ Inspiração, não cópia. Fecha quando ele
  aprovar o modelo do Sovereign por imagem.
- **(27)** Equilíbrio como no Vampire Survivors (13/11, ao não escolher alvo para a fase final): _"acho que temos que
  repensar o equilíbrio como é hoje em Vampire Survivors (nossa inspiração além do Asteroids). Hoje você só consegue
  avançar no Vampire Survivors depois que começa a comprar itens de power-ups na loja com a moeda do jogo. Já havia
  pedido um estudo sobre isso, deve estar no repo. Precisamos lançar isso para ser investigado e implementado
  corretamente no jogo. Não vamos fazer isso agora, mas deixe registrado."_ → o estudo é `docs/GAME_DESIGN_MASTER_PLAN.md`
  (§3 e a parte de meta entre partidas); o jogo já tem moeda (Salvage) e loja (Hangar). Não começar sem ele pedir; até
  lá, não calibrar a campanha para ser vencível sem loja.
- **(31)** Ataques dos chefes (13/11, sobre a jaula do Interdictor): _"mas como a nave lança essa grade? Isso não
  deveria ser um material de verdade? Tem que ter algo real e físico ou um dispositivo que gere esse campo, uma arma…
  acho particularmente que o efeito está muito sem graça e feio… aliás todas as miras e efeitos de dano e armas dos
  bosses estão muito sem graça, deveria tudo isso ser revisto e polido."_ Fecha quando ele aprovar por imagem e jogando.
  **Veredito dele por imagem (13/11, página `chefes-ataques`):** os sete chefes _"Ficou bom"_ (Interdictor refeito
  incluído); no geral _"A direção é essa"_. Atirar nos aparelhos da jaula: _"Decido depois de jogar a luta nova."_
  Os cinco retoques seguintes (fim da jaula, anel de aviso, setas do Gatekeeper, sucção do Maw, feixe do Sovereign):
  _"Ficou bom"_. Falta ele jogar.
