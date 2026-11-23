# Pendências — o que está quebrado e o que falta

Lista viva do que está aberto, nas palavras do dono. Fechados em 19/10 pelo veredito dele jogando (Mac M1, 60 fps):
1, 3, 6, 7, 8, 9; e 10–14 (o goal de 18/10) feitos na conversa local em 19/10; 17 (câmera) fechado por ele em 20/10 —
história no git. Leia só a seção O BASTÃO e o item da vez; o resto, por `grep`.
Item resolvido sai da lista e vira commit; a história de cada número fica no git (`git log --all --grep="(NNN)"`).
Número é identidade, não posição: item novo entra no fim da sua seção. **Próximo número livre: 43.**

## O BASTÃO — onde as sessões pararam (23/11) — a `main` está publicada até a versão 0.8.0 (PR do `publicar/conjunto`, 23/11)

**23/11 (vale sobre o que estiver mais abaixo e disser outra coisa):** a versão 0.8.0 vai ao ar por ordem dele — à
pergunta "Publico a versão 0.8.0 com esta lista, trocando a configuração de checagens do GitHub?", _"Sim, publica"_ —
pela PR do `publicar/conjunto` para a `main`. Entra:

- o voo, um algoritmo só (40);
- as cartas por arma (41): a Harmonic e a Scatter nas cinco famílias, a Seeker em três; dos números da Scatter e da
  Seeker, jogando o conjunto, ele disse _"Ficam como estão"_;
- as ferramentas das rodadas mais rápidas: a checagem que não repete o que já passou e os testes no Node fixo
  (24.22.3, o mesmo no GitHub, que passa a exigir a checagem `validate`).

Os replays gravados antes desta versão deixam de tocar (o voo mudou); progresso, pilotos e Hangar ficam intactos.

**Fica de fora:** o equilíbrio completo (27), que ele deixou para depois desta publicação (_"Sim, fica para depois"_);
as vozes (37); a segunda parte da abertura (o carregamento em fatias, espera o teste dele no Tesla).

**21/11, à noite (vale sobre o que estiver mais abaixo e disser outra coisa):** a sexta auditoria de fora vai ao ar
por ordem dele — à pergunta "Publico os cinco consertos de pilotos e replays?", _"Sim, publica"_ — pela PR do
`auditoria/seis` para a `main`. Ao relatório ele tinha dito _"o codex mandou um recado para vc verificar:"_, e valia a
ordem do dia: _"Vamos resolver os problemas todos, verifica se são problemas mesmo e resolva."_ Avisado de que as
gravações antigas deixam de tocar (_"Se as gravações antigas forem importantes para você, me diga antes de
publicar."_), respondeu só _"Sim, publica"_. Entra:

- pilotos em duas abas: a pergunta antiga de apagar só apaga o piloto sobre o qual perguntou;
- a aba percebe que a outra mexeu no piloto dela, para de gravar, volta à tela inicial, e o Continue recarrega a página;
- o botão de apagar velho não dá mais erro;
- o mesmo piloto em duas abas não se sobrescreve;
- replays na versão 10: as gravações de versão 9 são recusadas com o aviso que já existe;
- o "tentar de novo" de um replay mantém as melhorias gravadas.

**Fica de fora**, como na publicação anterior: as duas perguntas da abertura (cartão `abertura-7`); a segunda parte da
abertura (o carregamento em fatias, espera o teste dele no Tesla); o planeta (36); o tiro na pedra com a cor da luz e a
morte do chefe que treme duas vezes (35, 38); as vozes (37); as naves do jogador (20); as cartas por arma.

**21/11, mais tarde (vale sobre o que estiver mais abaixo e disser outra coisa):** a quinta auditoria de fora e os
cristais vão ao ar por ordem dele — à pergunta "Publico os consertos do Codex com os cristais novos?", _"Sim,
publica"_ — pela PR do `jogo/conjunto-3` para a `main`. Ao relatório ele tinha dito _"o codex (chatgpt astra high)
achou alguns problemas:"_ e depois _"Não vamos esperar eu jogar, não. Vamos saber se é um problema mesmo antes de
jogar e vamos resolver. Não vamos ter preguiça, não. Vamos resolver os problemas todos, verifica se são problemas
mesmo e resolva."_ Entra:

- o dash para trás com o analógico do Xbox no voo Classic, e o freio de emergência que reconhece a ré pelo analógico;
- a mira com o analógico direito sem zerar a aceleração do direcional, no voo Modern;
- no toque, o dedo que movia a nave depois de uma tecla esconder o direcional;
- o Esc segurado em Settings que levava direto à tela inicial;
- o toque rápido no RB que mudava a aba sem renovar o prazo de inatividade;
- o piloto apagado numa aba que voltava quando a outra aba comprava no Hangar;
- o replay que começava com os números da nave de quem assiste (142 de casco virava 135, e a carta inicial sumia);
- o escudo do Hunter Elite quebrado que voltava cheio no "tentar de novo";
- a música da campanha trocada quando se escolhe rápido um setor e depois outro;
- os cristais do fundo da Crystal Choir com a cor B e os leques (_"B e a forma"_, _"Forma 1, leques"_; ele tinha
  dito _"A minha crítica é quanto ao cenário 3D, aqueles cristais que ficam ao fundo"_), com o custo de construí-los reduzido;
- as ferramentas de teste atualizadas: o `npm audit` não acusa nenhum alerta (antes eram 14, três críticos; nada
  disso ia para quem joga).

Só ele confere: o controle de verdade, o iPhone de verdade e o Tesla. **Fica de fora:** as duas perguntas da abertura
(cartão `abertura-7`); a segunda parte da abertura (o carregamento em fatias, espera o teste dele no Tesla); o planeta
(36); o tiro na pedra com a cor da luz e a morte do chefe que treme duas vezes (35, 38); as vozes (37); as naves do
jogador (20); as cartas por arma.

**21/11 (vale sobre o que estiver mais abaixo e disser outra coisa):** os consertos de 20–21/11 vão ao ar juntos, por
ordem dele — primeiro _"vamos esperar as outras conversas volgtarem para publicar todos os consertos junto"_, depois, à
pergunta "Publico o jogo com tudo junto?", _"Sim, publica"_ — pela PR do `jogo/conjunto-2` para a `main`. Entra: a
volta à tela inicial pelo nome do jogo no menu, no iPad, no iPhone e no computador (_"B, nome do jogo"_); a abertura
com o robozinho em camadas na pista separada, que parou de travar no iPhone simulado, e a música chegando mais cedo
numa rede fraca (ele tinha dito: _"aquela página que tem a animação do People Studio Labs, ela fica engasgando"_ e
_"Eu acho que a graça dessa tela era justamente dela servir como uma animação que distrai, né?"_); o controle de Xbox
— o menu inteiro alcançável com destaque de console e LB/RB entre as abas, os dois analógicos com força (_"B, dois
analógicos"_), dash e escudo nos ombros (_"ok com a sugestao"_); a marca da contagem no lugar das luzes soltas das
placas da primeira fase (_"B, marca da contagem"_; ele tinha dito _"Tem umas luzes, né, azuis, vermelhas, e elas tão
estranhas"_). Só ele confere: o controle de verdade e o robozinho num iPhone de verdade; o Tesla, só depois de
publicar. **Fica de fora:** os cristais do fundo da Crystal Choir (cartão `cenario-3`: _"A minha crítica é quanto ao
cenário 3D, aqueles cristais que ficam ao fundo"_); a cena no celular e a música do menu numa rede fraca (cartão
`abertura-7`, as duas perguntas dele); a segunda parte da abertura (o carregamento em fatias, espera o teste dele no
Tesla); o planeta (36); o tiro na pedra e a cor da luz (35, 38); as vozes (37); as naves do jogador, que ele vai levar
a outra AI (20).

**20/11, à noite (vale sobre o que estiver mais abaixo e disser outra coisa):** o toque em telas que se dizem
computador vai ao ar por ordem dele — à pergunta "Publico já estes quatro itens do toque?", _"Sim, publica"_ — pela
PR do `controle/toque-em-computador` para a `main`. Ele tinha perguntado: _"Eu tentei fazer funcionar a tela touch no
browser do meu Tesla, que é um modelo 3, e não funcionou o touch"_ e _"como que a gente faria para contornar isso? Até
porque diversos computadores hoje têm tela touch."_ Entra: num computador, o primeiro toque de dedo traz o direcional,
o DASH, o SHIELD e a pausa, e uma tecla ou o controle devolvem ao teclado (um clique de mouse nunca liga o toque); a
chave "Touch Controls: Auto / Always" em Settings → Controls, só no computador, com a linha do que a tela diz ao
navegador (_"A, só nos ajustes"_); instalar como aplicativo — no iPhone e, pela primeira vez, no iPad, o aviso da
entrada com os dois passos desenhados (_"gostei desse que vc coloca os simbolos"_), no Android o botão Install do
próprio navegador na entrada e no computador no alto do menu, depois de Settings (_"gostei do A"_); o ícone, uma pedra
de veios dourados fotografada no jogo (_"gostei mais do foto do jogo"_), e o nome inteiro embaixo dele, "Asteroid
Roguefield", que o celular corta (_"Asteroid Roguefiled"_). Limites ditos a ele: a confirmação de instalar de verdade
e o teste no Tesla só depois de publicar; o ícone grande (512 px) sai um pouco mais macio. **Fica de fora:** a volta à
tela inicial pelo toque (cartão `volta-1`, A ou B, sem resposta; hoje, pelo toque, só os 2 minutos parado no menu);
as naves do jogador, que ele vai levar a outra AI (20); a rodada seguinte (35, 36, 37 e a luz, 38).

**20/11, mais tarde (vale sobre o que estiver mais abaixo e disser outra coisa):** os save games vão ao ar por ordem
dele — à pergunta "Publico os save games e a volta à tela inicial?", _"Sim, publica"_ — pela PR do `piloto/saves`
para a `main`. Ele tinha perguntado: _"Eu não entendi aonde que ficou aquela questão que a gente conversou sobre ter
os saving slots"_ e _"depois de muito tempo na tela do Mission Control, sem atividade, ou depois que a pessoa der ESC
nessa tela, será que não valeria a pena voltar para a tela inicial do menu de Start?"_. Entra: três pilotos, cada um
com o seu progresso, escolhidos depois do PRESS START; quem já joga vira o Piloto 1 com o progresso inteiro; no menu
("Mission Control"), o Esc sem painel aberto e 2 minutos parado voltam à tela do PRESS START (_"2 minutos"_,
_"Esmaece, música segue"_); a troca de piloto é por esse caminho. O parágrafo de baixo, que deixava os pilotos de fora,
vale só para a publicação anterior.

**20/11 (vale sobre o que estiver mais abaixo e disser outra coisa):** a rodada de 19–20/11 vai ao ar por ordem dele —
à pergunta "Publico o jogo com tudo, sem os pilotos?", _"Sim, publica"_ — pela PR do `jogo/conjunto` para a `main`.
Entra: jogar no iPhone e no iPad pelo toque, com o painel novo (o radar mais transparente: _"Ficou bom"_) e as cartas
no celular com a setinha que abre a carta (_"B — com a setinha que abre a carta"_; a trilha só com a conta); a
abertura nova do Pipo Studio Labs (_"gostei mais da opcao C"_), com frases de carregamento no lugar das dicas, a música
do menu só depois do toque que sai dela e a animação do robozinho (_"Ficou bom"_ aos três ajustes); a cena do
cargueiro com os motores do jogo (_"Ficou bom"_) e a música nova feita no Flow Music desde a primeira cena
(_"Nova 2"_); o escudo apertado sem a carta responde com a tremidinha e o bipe de hoje (_"B. Tremidinha"_, _"1. O bipe
de hoje"_); as pedras dos setores do fundo, os impactos com a travadinha e o tiro perfurante; o menu sem a faixa
escura; os consertos das quatro auditorias de fora, cada um provado no jogo; o site passa a esperar os testes antes de
ir ao ar. **Fica de fora**, para a publicação seguinte: os três pilotos (`piloto/saves` em 98a69b16; juntar hoje briga
com a tela de carregar). **Conferência (19/11), a lista inteira:** _"Está bom"_ ao primeiro chefe, aos ataques dos
chefes, ao chefe final, à Mother e ao Interdictor, à dificuldade fase a fase, à pilotagem, ao começo da partida, à
Stasis, ao radar e aos instrumentos, ao Boss Rush, aos nomes, aos sons e à música — por isso os itens 2, 16, 18, 25 e
31 saíram da lista; o dano das pedras nos capítulos II e III ele não viu. **A rodada seguinte**, das observações dele:
o tiro que empurra e gira a pedra onde tocou (35); o planeta e as placas de luz (36); vozes e roteiro (37); as naves
do jogador (20); a abertura mais rápida (a compilação medida no carregamento, no `BACKLOG.md`). Trabalho novo sai de um
ramo novo a partir da `main`.

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
- **Abertos dele:** itens 20, 27, 35, 36 e 37 abaixo. `BACKLOG.md`: notas técnicas, não são dele.

**Vereditos dele até aqui:** Rodadas 5–13 aprovadas jogando (M1, 60 fps; "é pouco conteúdo… Vampire Survivors são
dias de desafio"); primeira câmera contínua rejeitada; câmera de dois estados e chegadas dos Wardens aprovadas
jogando (20/10); "não tem problema mostrar a borda"; "a gente quer ver o inimigo chegando" (sem pausar a cena).

**Avisos de processo:** até quatro ajudantes ao mesmo tempo (limite do app), cada um com os arquivos dos outros nomeados; `pgrep -f`/
`pkill -f` matam o shell do ajudante; `set -o pipefail` em cadeias com testes; um ajudante pode "cair" sem escrever —
conferir o diff; apagar refs remotas em massa é bloqueado na nuvem (a limpeza foi feita localmente: de 224 ramos
antigos restam ~29); o erro de console `game-session` → `renderer` ao carregar é antigo e não impede a partida.

## Jogabilidade e sensação

- **(35)** Impacto do tiro na pedra (19/11, na conferência): _"acho que tem que ter um impacto do tiro que faça a
  pedra se moviemntar, seja rodando um pouco, tem que ter uma física do impacto do tiro (memso que seja fake para
  efeitos de arcade) o incandescente tem que ser aonde o tiro efetivamente tocou a pedra."_ Fecha quando ele aprovar
  jogando. 21/11, ramo `tiro/na-pedra` (cartão `tiro-1`): a marca nasce onde o tiro toca e a pedra dá um tranco e gira,
  só no desenho. Resposta dele (21/11, à noite): _"Tiro 1.1 — Quanto a pedra pula e gira com cada tiro? Como nos
  filmes"_ e _"Tiro 1.5 — Depois de matar o chefe, a câmera lenta de subir de nível fica? Fica como está"_. Fecha quando
  ele aprovar jogando.
- **(39)** O controle de videogame (20/11, fim da noite, com o controle do Xbox): _"A movimentação em menus por
  controle de videogame, eu estou testando no do Xbox, mas deve ser igual em qualquer controle, ela é impossível pelos
  menus. Simplesmente não funciona. […] a gente tinha que repensar essa navegação como se esse jogo fosse meio que
  nativo pro videogame […] quando é por ficha, às vezes os jogos fazem alguns para passar de uma ficha para outra,
  usando o LB e o RB. […] Tem jogos que usam até um mouse, né, como o Halo […] a gente tem que ter sensibilidade de
  quanto que a gente está apertando. […] num controle, o controle ele pode jogar pouca potência ou muita potência, né?
  […] a gente pode criar um controle padrão, né, quando está usando o controle, em que a aceleração fica num analógico
  e virar para a direita e para a esquerda fica em outro analógico. […] Acionar escudo, qual que seria a tecla mais
  comum, o dash, qual que seria a tecla mais comum, né?"_ Texto inteiro em `quadro/respostas/controle-20-11.txt`.
  Feito e publicado em 21/11 (ramo `controle/videogame`, cartão `controle-1`): destaque de console nos menus, LB/RB
  entre as abas, dois analógicos com força, dash e escudo nos ombros; conferido com um controle imitado. Falta só ele:
  fecha quando ele aprovar jogando com o controle de verdade.
- **(40)** O voo, um algoritmo só (21/11, à noite, na conversa do controle): _"o algoritmo ele é um só para tudo,
  né? Para movimento, o que que faz a nave se movimentar? É o thruster. [...] A nave ela é movimentada porque está
  ligado um thruster. E o thruster ele faz o movimento real da nave. Então, se ela precisa parar, seja por freio
  automático, seja pela ação do usuário, né, é, isso é refletido, obviamente, no thruster da forma física realista, de
  acordo com os thrusters que já existem hoje na nave. A gente não vai desenhar nada novo, né?"_ Texto inteiro em
  `quadro/respostas/freio-automatico-21-11.txt`. Em 22/11 ele mandou tocar a frente. Ramo `voo/um-algoritmo`: estudo
  entregue (cartão `voo-1`). Ao estudo ele disse (22/11): _"vamos deixar a e b printos para testrar."_ As duas
  estão prontas ao lado do voo de hoje, pelo endereço (`?voo=a`, `?voo=b`; cartão `voo-2`). Depois (22/11): _"Ainda não consegui decidir.
  Eu acho que eu preciso fazer um teste com os upgrades para entender como que é a evolução em cada modo."_ Os
  endereços de teste com as cartas em cinco degraus estão no cartão `voo-3`. Voando os degraus (22/11): _"a gente
  tem que repensar o modo com o computador de manobra [...] tinha que estar ter uma sensação de que a nave está mais
  poderosa, mais rápida, mais manobrável."_ Análise e três propostas de moderno (`?moderno=1|2|3`) no cartão `voo-4`.
  Ao voo-4 (22/11): _"Eu gostei do Turbo."_, a chama com _"um estouro"_ e depois _"uma chama constante"_, e o começo
  sem atrito: _"o modo inicial, ele é o modo simulação"_. O voo que fica (`?voo=c`) no cartão `voo-5`. Depois (22/11): _"Quando a gente faz o giro da
  nave, ela também deveria ter momentum, né? E quando a gente solta, imediatamente ela para o giro."_ e _"o que faz
  parar o giro de forma automática não é o RCS, é as cartas [...] de freio"_: giro com momento no voo que fica.
  Voou (22/11): _"voei, fica com ajustes, está bem difícil, mas peguei um UCS e nao melhorou o giro"_; combinado com
  ele (_"concordo, faz assim"_): a RCS é a dona do giro, o freio da viagem, e o giro do começo para sozinho devagar.
  Cartão `voo-7`. Ao `voo-7` (22/11): _"Ficou bom: o voo que fica — obs: acho que o giro pode ter um pouco de
  assitencia desde o inicio, mas muito pouco no inicio para ter mais dificuldade no voo. a medida que evoluir
  melhora."_ e a chama constante _"Assim, um terço do estouro"_. A ajuda do giro no começo ficou a metade. Em 22/11,
  20h30, a coordenadora mandou o voo que fica virar o único voo neste ramo (sem juntar nem publicar). Publicado na
  0.8.0 em 23/11. Fecha quando ele aprovar voando.
- **(41)** Cartas por arma (21/11): _"Está faltando criar cartas para cada tipo de arma, é isso? Isso seria um ramo
  inteiro, né, para a gente repensar."_ e _"vamos manter ele no nosso backlog por enquanto, mas não vamos tirar do
  radar. Em breve a gente retoma esse trabalho."_ Retomado em 22/11 (ramo `cartas/por-arma`): o mapa, medido no jogo,
  está no cartão `cartas-por-arma-1`. Respostas dele aos cartões 2 e 3 (22/11): tudo _"Gostei: pode construir"_; a Scatter
  e a Seeker ganham versão própria _"aos poucos, depois da Harmonic"_; os números da Scatter, _"Decido jogando"_. No ramo:
  as cartas de número e as cinco famílias próprias da Harmonic. Em 23/11 a Scatter e a Seeker ganharam as delas, com
  os nomes que ele escolheu: Kindling, Discharge, Implosion e Scrap Rounds na Scatter; Thermite, Storm Warhead e
  Gravity Warhead na Seeker (cartões `cartas-por-arma-7` e `cartas-por-arma-9`). Jogando o conjunto (23/11), dos números
  da Scatter e da Seeker: _"Ficam como estão"_. Publicado na 0.8.0 em 23/11.
- **(42)** Voltar com B e ESC no menu (23/11, jogando a 0.8.0, dito na conversa da fase presa): _"Agora eu estou na
  tela de Choose Your Pilot, eu não consigo dar B para voltar para a tela de Start do menu inicial. Deveria ser
  possível, você não acha? Ele está preso nessa tela, eu sou obrigado a escolher um piloto nesse momento. Se eu
  apertasse B aqui, ele deveria voltar para a tela de Press Start."_ No ramo `conserto/voltar-do-menu`: B e ESC na
  tela dos pilotos voltam para Press Start (com a caixa de apagar aberta, só fecham a caixa). Fecha quando ele aprovar
  jogando.

## Som (palavras dele, 19/11)

- **(37)** Vozes e roteiro (19/11, na conferência): _"sinto quie poderia ter mais efeito nessas vozes e acho que
  falta emoçao certa na entonaçao, nao sei se isso é possivel para os modelos que temos usado para geracao."_ E da
  cena da história: _"acho que a história falada da primeira cena do Wake nao faz sentido, está solta demais. tem que
  rever esse roteiro de falas e diálogos, nao tem muita conexao entre uma frase e outra as vezes..."_ Da música: _"talvez
  valha uma analise a mais em volumes e transicoes."_ Fecha quando ele aprovar ouvindo.

## Modelos 3D (palavras dele, 12/11)

- **(20)** Sobre os modelos: _"a qualidade dos modelos 3D está bem fraca, próximo ao que a gente tinha antes"_ (o
  primeiro Quarry Maw; refeito no mesmo dia pela conversa principal, em placas com painéis — falta ele ver). E sobre as
  naves do jogador: _"o próprio modelo das naves do player… tem algumas oportunidades também. Aos moldes do que faz o
  Elite Dangerous, aquele jogo de nave também chamado Chorus, tem modelos muito legais. De naves. Everspace."_ → imagem
  antes de código; fecha quando ele aprovar as naves novas. Na conferência de 19/11, "As naves do jogador estão
  bonitas?": _"Precisa mexer"_. Em 21/11 ele trouxe o redesenho dos três cascos feito em outra AI e escolheu a V3:
  _"Integre ao Asteroid Roguefield a V3 dos modelos 3D da Interceptor, Solar Slicer e Bastion. Vi a comparação e
  prefiro a V3."_ Integrada no ramo local `naves/cascos-v3`, esperando ele jogar; _"A publicação fica para depois da
  minha aprovação."_

## Campanha (palavras dele, 12/11, jogando no site)

- **(27)** Equilíbrio como no Vampire Survivors (13/11, ao não escolher alvo para a fase final): _"acho que temos que
  repensar o equilíbrio como é hoje em Vampire Survivors (nossa inspiração além do Asteroids). Hoje você só consegue
  avançar no Vampire Survivors depois que começa a comprar itens de power-ups na loja com a moeda do jogo. Já havia
  pedido um estudo sobre isso, deve estar no repo. Precisamos lançar isso para ser investigado e implementado
  corretamente no jogo. Não vamos fazer isso agora, mas deixe registrado."_ → o estudo é `docs/GAME_DESIGN_MASTER_PLAN.md`
  (§3 e a parte de meta entre partidas); o jogo já tem moeda (Salvage) e loja (Hangar). Não começar sem ele pedir; até
  lá, não calibrar a campanha para ser vencível sem loja.

## Cenário (palavras dele, 19/11, na conferência)

- **(36)** Planeta (ao planeta da Quarantine Grid e ao creme do Crisol, _"Precisa mexer"_): _"acho que tem umas
  oportunidades para deixar com cara mais de planeta, talvez nao tao proximo. QUe tipo de planeta é esse? ele é 3d?
  ele tem rotacao? Ele era habitaado ou é? Ele está destruído? Pensar e resolver."_ (As placas de luz da primeira fase,
  a outra metade deste item, saíram em 21/11 com a marca da contagem.) Imagem antes de código; fecha quando ele
  aprovar por imagem.
- **(38)** A cor da luz (20/11, depois de publicar): _"eu percebi que hoje parte dos elementos luminosos nas pedras
  não estão sendo refletidos com a cor certa, né? Eu percebi que o tiro é de uma cor e a sombra a iluminação que vai é
  de outra. Então, eu acho que tem uma oportunidade aí na questão da iluminação do jogo, do algoritmo ler exatamente
  qual é a cor da luminosidade que está batendo em aonde, né?"_ Imagem antes de código; fecha quando ele aprovar por
  imagem. 21/11, cartão `tiro-1`, aprovado por imagem: _"Tiro 1.2 — A luz do tiro na cor do próprio tiro entra no
  jogo? Sim, como nas imagens"_, _"Tiro 1.3 — O primeiro brilho da marca na cor do tiro? Na cor do tiro, esfriando para
  lava"_, _"Tiro 1.4 — As pedras com veios iluminam as vizinhas? Sim, como na imagem"_. Juntado ao ramo `tiro/na-pedra`.
