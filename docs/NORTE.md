# Norte — a direção de arte e de jogo (17/10/2026)

Decisões de produto em vigor que não moram no código. O que virou código sai daqui. O dono julga por imagem e
jogando; cada etapa visual termina em captura antes × depois. Substitui `docs/visual-direction.md` (histórico:
`git log --all -- docs/visual-direction.md`). Posicionamento de mercado continua em `docs/positioning.md`.

Palavras dele (17/10): _"a direção toda de arte está muito fraca... a nave, os inimigos, o roteiro, temos que
reimaginar tudo"_; _"como se fosse uma versão nova para uma plataforma nova, com as melhores placas de vídeo"_.

## 1. Ficção em um parágrafo (o roteiro)

Há mil anos uma megaestrutura orbital — o **Anel** — se partiu. O que sobrou é o **Campo**: um cinturão de cascos
de pedra e metal que ainda guarda, por dentro, a luz da máquina que o Anel era. Você pilota um **interceptor de
salvamento** enviado para dentro do Campo. Quanto mais fundo, mais o Campo acorda: os fragmentos revelam cristal
quando rachados, os **Guardiões** (restos automáticos do Anel) voltam a patrulhar, e a cada cinco camadas um
**Guardião-Maior** barra o caminho. Não há vilão falando. A história é contada pelo que você vê: a luz dentro das
pedras, as máquinas que acordam, a profundidade. _"Solidão na vastidão: o jogador é pequeno num campo que não o
nota"_ — isso fica.

Nomes no jogo (inglês): the Field, the Ring, Wardens, Warden Prime. Ondas viram **layers** ("Layer 7"). A
palavra "wave" sai da interface quando a etapa 6 abrir.

## 2. Linguagem visual: "pedra escura, luz por dentro"

Uma regra que decide tudo: **superfícies são foscas e escuras; a luz só existe onde há energia** (propulsor, tiro,
cristal exposto, olho de máquina, escudo). A informação é luz; o resto é massa.

- **Material.** Pedra e metal fosco, tonalidades de `#1A1C1E` e `#64748B`, iluminados por uma luz-chave fixa
  (alto-esquerda, 35°) e uma luz de preenchimento azul-fria vinda do fundo. Nada de contorno neon em asteroide.
- **Luz.** Emissivos entram numa camada própria e recebem **bloom** real (3 níveis: 1/2, 1/4, 1/8). Cores de luz:
  ciano `#00F2FF` (jogador/sistemas), âmbar `#FFB347` (cristal do Campo e tiros do jogador), vermelho `#FF3131`
  (ameaça e aviso), violeta `#8A2BE2` (Guardião-Maior), dourado `#FFD700` (XP), lima `#BCFF00` (status ativo).
- **Legibilidade sob caos.** Ameaças têm um **aro emissivo fino** (1 px lógico) na cor da ameaça, e o jogador tem
  o aro ciano. É a única exceção à regra "sem contorno": existe para ler a tela, não para enfeitar.
- **Fundo com volume, não vazio.** Névoa cósmica em duas camadas com parallax, poeira à deriva na camada do meio,
  poucas estrelas (≈120, brancas, 1–2 px, sem confete colorido), vinheta suave. Ao fundo, longe, a curvatura do
  Anel partido como silhueta escura — a "paisagem" que dá escala.
- **Câmera.** Zoom 1.3× com follow suave (o campo lógico continua 800×600; a câmera enquadra ~615×460 e segue a
  nave com atraso de ~0,25 s, com margem morta). Shake é translação + 1° de rotação máxima. Zoom-in curto em
  level-up e morte. **Isto é decisão de produto tomada em 17/10 pelo dono ao pedir "reimaginar tudo"; se ele
  reprovar jogando, volta à câmera fixa com uma flag.**
- **Movimento.** Rastros persistentes de luz (propulsor, tiro), faíscas esticadas pela velocidade, anéis de
  choque, flash branco de 60 ms em qualquer dano a inimigo.

## 3. Folha de entidades

| Entidade        | Antes                        | Agora                                                                                                                                                                                                                                                                                                                                                                     |
| --------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nave padrão     | wireframe neon de 4 vértices | **Interceptor**: cunha fosca de 3 segmentos (proa, corpo, duas aletas), painéis com sombra, dois propulsores com cone emissivo ciano e rastro; upgrades mudam a silhueta (aletas maiores, bicos extras).                                                                                                                                                                  |
| Solar Slicer    | SVG de mockup                | casco alternativo, mesma linguagem (sombreado, aletas em lâmina, propulsor âmbar).                                                                                                                                                                                                                                                                                        |
| Asteroide       | polígono neon marrom         | **Fragmento do Anel**: pedra fosca com crateras e arestas, iluminada pela luz-chave; **rachaduras acendem em âmbar** conforme perde vida (dano = luz). Variantes: _Dense Core_ (cinza-azulado, mais escuro), _Volatile_ (veios âmbar pulsando), _Golden_ (veios dourados), _Parasite_ (veios vermelhos, pulsa com o alvo), _Crystal_ (facetas translúcidas, brilho frio). |
| Drone           | triângulo neon               | **Mote**: disco fosco com um olho vermelho; enxame; rastro curto.                                                                                                                                                                                                                                                                                                         |
| Hunter          | losango neon                 | **Seeker**: casco alongado, lente frontal emissiva que **acende antes de atirar** (telegraph).                                                                                                                                                                                                                                                                            |
| Mine            | esfera com gradiente         | **Tether**: núcleo escuro com três hastes; arco elétrico entre as hastes quando armada.                                                                                                                                                                                                                                                                                   |
| Boss            | disco voador SVG             | **Warden Prime**: anel segmentado (6 segmentos foscos) em torno de um núcleo violeta; cada fase destrói segmentos e expõe mais núcleo; a investida é telegrafada pela faixa vermelha (feita 17/10).                                                                                                                                                                       |
| Tiro do jogador | ponto amarelo                | **lança âmbar**: traço curto com cabeça brilhante e rastro, emissivo.                                                                                                                                                                                                                                                                                                     |
| Tiro inimigo    | ponto branco                 | **farpa vermelha**, rastro na cor do tiro.                                                                                                                                                                                                                                                                                                                                |
| Orbe de XP      | ponto estático               | **fagulha dourada**: pulsa, gira, é atraída com rastro.                                                                                                                                                                                                                                                                                                                   |

## 4. Arco da run (etapa 6, com ele)

Oito a doze minutos. Camadas 1–4 só pedra; 5 primeiro Guardião-Maior; 6–9 Motes e Tethers; 10 Guardião; 11–14
Seekers; 15 Guardião final → **fim da run com vitória** (a decidir com ele: a run termina no 15 ou vira modo infinito
com placar). Build: 9 → ~25 upgrades em quatro famílias com um bônus "3 iguais" simples e visível; dash em Shift
(escudo passa para E apenas). **Decidido pela sessão em 17/10 à noite, sob o mandato "reimaginar tudo, segue em frente":
entram como propostas com os números ao lado; ele aprova ou reverte jogando.** Fim de run: vitória no Warden da
camada 15 (modo infinito só se ele pedir).

## 5. O que não fazemos

Sem narrativa falada, sem personagens, sem textura fotográfica, sem reescrever o gameplay em WebGL (o menu em
Three.js fica como alvo visual; o jogo chega lá com Canvas 2D + bloom). Sem contorno neon em massa. Sem azul e
rosa saturados em pedra.

## 6. Ordem de execução (fatias, cada uma com captura)

1. Camada de bloom + paleta em código (`src/data/constants/palette.js`).
2. Fundo: névoa, poeira, estrelas novas, silhueta do Anel.
3. Fragmentos do Anel (asteroides) com rachaduras que acendem.
4. Interceptor e Solar Slicer novos; tiros e orbes.
5. Motes, Seekers, Tethers; Warden Prime segmentado.
6. Câmera 1.3× com follow; zoom em level-up/morte.
