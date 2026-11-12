# Pendências — o que está quebrado e o que falta

Lista viva do que está aberto, nas palavras do dono. Fechados em 19/10 pelo veredito dele jogando (Mac M1, 60 fps):
1, 3, 6, 7, 8, 9; e 10–14 (o goal de 18/10) feitos na conversa local em 19/10; 17 (câmera) fechado por ele em 20/10 —
história no git. Leia só a seção O BASTÃO e o item da vez; o resto, por `grep`.
Item resolvido sai da lista e vira commit; a história de cada número fica no git (`git log --all --grep="(NNN)"`).
Número é identidade, não posição: item novo entra no fim da sua seção. **Próximo número livre: 21.**

## O BASTÃO — onde as sessões pararam (12/11) — A CAMPANHA ESTÁ NO RAMO `campanha/setores`, ESPERANDO ELE JOGAR

**Estado em 12/11 (vale sobre o que estiver mais abaixo e disser outra coisa):** em 12/11 ele entregou o projeto —
_"Esse projeto é seu… Decida o que fazer"_, _"o projeto está sendo tocado por você"_, _"não necessariamente algo que foi
feito… quer dizer que isso é definitivo e que está bom o suficiente… você mesmo deve perceber e avaliar"_ — e autorizou
conversas paralelas. A `main` está parada em 21/10 (PR #302: correções de combate e de telas feitas por outro agente).
Todo o trabalho de 12/11 está só no ramo `campanha/setores` (retomar por ele, não pela `main`): mapa de campanha,
fases com camadas e chefe próprios, três Sentinels, os três cascos em placas; o detalhe está no `PLAN.md`. A visão do
jogo é `docs/GAME_DESIGN_MASTER_PLAN.md` (22/10). Conteúdo hoje: 16 inimigos, 7 armas, 39 cartas, 3 cascos, 15 camadas
na descida, 3 biomas, 3 Wardens, 3 Heralds, Sentinels por fase; o golden trace tem 26 cenários. Dois pedidos dele
estão em conversas paralelas: audição de som e painel menor em imagens. Ele ainda não jogou nada de 12/11.

**Como retomar (conversa local, qualquer máquina):**

1. `git checkout campanha/setores && git pull && npm ci && npm run done` (gate = lint + formato + testes + build; o golden trace de
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

**Estado (20/10):**

- **Feito e aprovado por ele:** a fábrica de conteúdo (Rodada 0: `src/content` com registro automático — 10 inimigos,
  6 chefes, 3 armas, 39 cartas, 4 cascos, 15 camadas, 3 biomas; cena `?content=<id>&count=&fire=1`; teto de 1.200
  linhas por arquivo); a janela inteira com tela cheia (_"tudo está rodando liso, não precisa medir nada"_); a câmera
  de dois estados (_"está boa, pode fechar"_) e as chegadas dos Wardens (_"aprovado"_); a arena com volume de qualquer
  ângulo.
- **Rodada 15, frentes 1–4, na `main` (PR #299, 20/10; não há mais ramos nem cópias de ajudantes):** sons
  escolhidos por ele (19 amostras, `SOUND.md`) e o motor da nave com as camadas que ele escolheu; economia (curva
  120 + 40·(n−2)^1.7, ~45 cartas, arma garantida nos níveis 3 e 7, raridade por carta, Warden com vida fixa); 15
  cartas refeitas; orbes com peso; baús com cerimônia e 3 pickups novos; HUD de instrumento (encaixes, presets,
  cápsula de escudo/casco, radar, editor; `HUD.md`); telas novas de level-up, baú e fim; 4 armas, 6 inimigos e 4
  formações; o Anel 3D de todos os lados (`?scene=ring` em dev); correções de duas revisões.
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
- **Próximo, nesta ordem (aprovado por ele em 20/10: _"a próxima conversa começa pela visão do jogo"_):** (1) a visão do jogo num documento que ele aprova
  antes de mais conteúdo — capítulos → fases → ondas → chefe, o mapa, a história (item 19) e a árvore de desbloqueios
  com moeda (frente 6), com o tempo de jogo de cada pedaço; (2) o conteúdo da frente 5 feito para essa estrutura; (3)
  painel menor (escala dos encaixes no preset, por imagem); (4) a revisão do som e da trilha (tiro mais sutil, graves no
  motor, o som do início, a trilha de tensão; a música da introdução fica); (5) balanceamento por último.
- **Avisos desta sessão:** o navegador escondido do app toca som — sair da página do jogo ao terminar e todo
  Playwright de ajudante com `--mute-audio`; ele não vê o painel do navegador quando não está na janela desta conversa
  (mandar o endereço local); até 4 ajudantes ao mesmo tempo (limite do app).
- **Abertos dele:** itens 2, 15, 16, 18, 19, 20 e 21–23 abaixo. `BACKLOG.md`: notas técnicas, não são dele.

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
  amostras geradas pela skill local dele `/sfx-generator` (TangoFlux) e CC0 onde o modelo falha, página de audição
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
