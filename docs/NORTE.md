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

Oito a doze minutos, tudo numa tabela só (`src/data/layers.js`, proposta 17/10). Camadas 1–3 só pedra, com uma
**surge** "Rockfall" aos 40 s; 4 chegam os Motes, em enxames; 5 primeiro Guardião; 6–7 Motes e Husks, Tethers a partir
do 7; 8–9 entram os Rams (surge "Ram pack"); 10 Guardião com Motes pingando; 11–12 Seekers e Bulwarks, elites 10–15 %;
13–14 tudo, Weavers incluídos, surge "Full field" aos 30 s, elites 20–30 %; 15 Guardião final escoltado por Seekers
→ **fim da run com vitória** (a decidir com ele: a run termina no 15 ou vira modo infinito com placar). Surge = rajada
vinda da borda longe do jogador, anunciada por uma faixa "SURGE" na tela. Build: 9 → ~25 upgrades em quatro famílias com um bônus "3 iguais" simples e visível; dash em Shift
(escudo passa para E apenas). **Decidido pela sessão em 17/10 à noite, sob o mandato "reimaginar tudo, segue em frente":
entram como propostas com os números ao lado; ele aprova ou reverte jogando.** Fim de run: vitória no Warden da
camada 15 (modo infinito só se ele pedir).

## 4b. O salto (decidido em 17/10, noite, a pedido dele: "falta um salto enorme… câmera dinâmica, zoom, movimento lateral, quase 3D visto de cima")

- **O gameplay passa a ser desenhado em Three.js (WebGL)**, como o menu já é: cena 3D vista de cima com inclinação
  de ~18°, luz-chave direcional + preenchimento frio, asteroides como malhas 3D procedurais (o gerador do menu,
  extraído para `src/modules/render3d/asteroidMesh.js`), nave low-poly extrudada do contorno de colisão, lanças e
  fagulhas emissivas, UnrealBloom + SMAA. A **simulação continua 2D** no plano 800×600; o renderer espelha as
  entidades em malhas. `?renderer=2d` mantém o Canvas 2D como fallback — nada do trabalho 2D é jogado fora.
- **Câmera dinâmica:** follow com dead zone e antecipação, dolly que afasta na velocidade e aproxima no combate,
  shake por deslocamento da câmera. Mesma lógica de `src/core/camera.js`, agora dirigindo uma câmera perspectiva.
- **Movimento lateral:** A/D passam a ser strafe (deslocamento lateral); W/S empuxo; a nave aponta para onde se
  move ou para o alvo da mira; dash em Shift. Controle à la twin-stick sem o segundo stick (a mira é automática).
- A regra de §2 continua valendo em 3D: massa fosca, luz só onde há energia.

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

## 7. Norte 2 — "grandioso" (18/10, madrugada; pedido dele: _"crie um goal novo baseado nos seus achados e aja independentemente… aumentando o conteúdo a cada rodada"_)

**Diagnóstico honesto após as Rodadas 1–3.** Arte: procedural competente, não AAA — sem texturas, sem herói visual,
o mesmo Warden três vezes, variantes de rocha iguais em 3D. Roteiro: um parágrafo em §1 que o jogador nunca vê.
Assets: tudo gerado em código, nenhum pipeline. UX: HUD e menu bons; sem onboarding, sem códice, sem recap de morte,
sem sensação de lugar. Áudio: procedural sólido, sem tema por bioma. Meta: nada entre runs.

**O goal novo (uma frase):** _uma descida de 15 camadas por três biomas do Anel, contada em jogo, com um Warden
diferente por bioma, arte com material e textura, um herói visual, duas armas que evoluem com as famílias, códice e
hangar — tudo no browser, tudo medido na máquina dele._

**Pilares, cada um vira rodadas (ordem = impacto visível por custo):**

1. **Lugar.** Três biomas que trocam fundo, paleta, chão e névoa a cada 5 camadas: _Outer Ring_ (poeira cinza-azul,
   fragmentos), _Dense Core_ (lascas escuras, veios âmbar, luz baixa), _Warden's Reach_ (violeta, estruturas do Anel
   intactas, luz fria). Título de capítulo ao entrar; uma linha de transmissão do Warden antes de cada chefe.
2. **Três Wardens, não um.** _Warden Prime_ (anel segmentado, 5), _Warden Choir_ (três núcleos orbitando que se
   revezam, 10), _Warden Null_ (núcleo que inverte a gravidade das fagulhas e abre o Anel, 15). Cada fase destrói
   geometria visível.
3. **Material e textura.** Mapas procedurais assados uma vez (normal/roughness/AO) para rocha, casco e placas do
   Warden; cinco variantes de rocha distintas em 3D (Dense Core, Volatile, Golden, Parasite, Crystal); herói com
   detalhe de painel e luz própria. Sem assets externos até ele pedir.
4. **Duas armas e evoluções.** Lança âmbar + _Harmonic Plasma Lance_ (feixe curto que parte fragmentos). Sinergia
   "3 iguais" vira **evolução** da arma (ex.: Thermal → lança incendiária com trilha; Arc → feixe que salta).
5. **UX de estúdio.** Primeira run com onboarding de 20 s em jogo (não tela de texto); códice com inimigos
   descobertos; recap de morte ("killed by Elite Ram, layer 9, 7:42") com o build; pausa mostrando o build e as
   sinergias; presets de qualidade automáticos por fps medido (`?stats=1`).
6. **Som com lugar.** Um tema procedural por bioma, tema de Warden, stingers de capítulo; mix já tem limitador/reverb.
7. **Meta.** Hangar (salvage → melhorias pequenas, segundo casco), modo infinito após o 15, placar local.
8. **Tecnologia.** Interpolação de render (144 Hz sem repetição), rochas instanciadas, partículas em GPU, orçamento
   de draw calls < 120, medição real antes de cada otimização.

Regra que não muda: números são propostas; ele julga jogando; nada publica sem ele.
