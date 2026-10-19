# Pesquisa: câmera diretora, jogos e ferramentas de referência (19/10/2026)

Base do item 14.2b do plano. Feita em 19/10/2026 por busca e leitura de páginas. Toda afirmação sobre jogo ou ferramenta
leva o número da fonte (`[n]`, lista no fim) ou a marca "(conhecimento geral, sem fonte)"; onde só vi o resumo de uma
busca, está dito. O desenho da seção 4 é proposta para ele aprovar e ajustar jogando; nada está decidido.

## 1. Resumo para o Felipe

- Os melhores jogos tratam a câmera como um diretor: a cada instante ela decide **o que mostrar, quanto mostrar e com
  que calma chegar lá**.
- A receita é quase sempre a mesma: juntar o que importa numa "caixa", centrar nela e aproximar ou afastar até a caixa
  caber na tela (Smash Bros., Unity, Godot).
- O que é importante funciona como ímã: quanto mais importante e mais perto, mais a câmera se vira para lá. Chefes
  ganham tela: a câmera abre para mostrar o tamanho do bicho (Yoshi's Story, Klonoa, Diablo IV).
- Câmera boa fica quieta quando nada muda e só se mexe com motivo. Movimento sem parar cansa e enjoa.
- O que não copiar: câmera que corre atrás da mira. Jogadores de Enter the Gungeon contam tontura e perda de pontaria.
- Ângulo ousado e tremida forte rendem como tempero, em momentos marcados (chefe chegando, golpe final, vitória), e
  sempre com jeito de reduzir ou desligar.
- Para nós: com a janela cheia, o campo inteiro é a visão mais aberta possível. A câmera deixa de "afastar" e passa a
  "chegar perto": aproxima do que importa na calma e volta ao campo todo quando o perigo sobe.
- Em tela larga o campo cabe de lado a lado, mas só uma faixa cabe de cima a baixo: a ameaça que vai acertar manda.
- Não há ferramenta pronta para ligar no jogo. As boas (Unity, Godot, Unreal) só rodam nos motores delas; a única com
  Three.js serve para girar um objeto, não para dirigir cena. Caminho: escrever pequeno, sem biblioteca nova.
- Limite honesto: não achei fala dos criadores de Hades, Nex Machina, Resogun ou Alienation sobre a câmera.

## 2. Jogos de referência

A evidência varia: Keren [1] e a documentação das ferramentas são de primeira mão; vários jogos só têm relato de
jogadores ou resumo de busca, e isso vem marcado.

- **Geometry Wars** (campo fechado): "região-foco". A vista mistura a posição da nave com o centro do campo e anda na
  direção dela à metade da velocidade; funciona porque as ameaças tendem ao centro. Cópia: puxão parcial ao centro. [1]
- **Super Smash Bros.** (vários alvos): mantém todos na tela, centrada no grupo, afastando quando se separam; a
  aproximação tem teto, e em palcos grandes o afastamento exagera. Cópia: caixa + zoom limitado; o teto é o campo. [15]
- **Yoshi's Story, Klonoa, Aztez** (zoom para enquadrar): Yoshi's Story enquadra Yoshi, chefe e pilar e recua para
  caber; Klonoa recua para mostrar o chefe; Aztez usa zoom e inclinação para dar drama a golpes finais. Cópia: entrada
  de chefe e golpe final são os lugares do ângulo ousado. [1]
- **Insanely Twisted Shadow Planet** (ímãs): cada pista (ponto de controle, inimigo) tem dois anéis. No de fora a
  câmera desliza para ela por média ponderada; no de dentro ignora a nave. Anéis sobrepostos dão transição suave. É o
  modelo mais próximo de "pesos por importância". [1]
- **Defender** (olhar à frente): foco a cerca de 25% da largura da tela à frente da nave, de onde vem a maioria dos
  inimigos. Cópia: avançar na direção da ameaça, não só da mira. [1]
- **Nuclear Throne** (tremida curta): num relato de entrevista (via blog, segunda mão), cada tiro empurra a vista 6 px
  para trás da mira e soma 4 à tremida, que some rápido; tudo em 320×240. Cópia: pancadas pequenas por evento. [19]
- **Enter the Gungeon** (câmera segue o cursor): jogadores pedem opção para desligar; dizem que o alvo "escorrega" na
  tela, causa tontura e estraga a memória muscular da mira; sem resposta dos criadores. Em co-op a câmera trava nos
  jogadores e eles levam tiro de fora da tela (resumo de busca). Cópia: avanço pela mira com teto. [18]
- **Diablo IV** (chefe do mundo): segundo o diretor, a câmera afasta bastante para pôr o jogador no mesmo espaço de
  outros 12, raro no jogo ao vivo; depois veio opção de distância "Far". Não abri o texto da entrevista: resumo de
  busca. [17]
- **Helldivers** (visão de cima compartilhada): a Arrowhead diz que a visão de cima dá a todos a mesma realidade e
  trocou por terceira pessoa no 2 por imersão. Sem detalhe de algoritmo. Lição: legibilidade da arena vale mais. [16]
- **Assault Android Cactus** (uma câmera para todos): numa prévia de 2013, o enquadramento único dificultava saber onde
  você estava quando o parceiro ficava do outro lado da fase. Lição: o jogador tem prioridade na caixa. [20]
- **Housemarque (Nex Machina, Resogun, Alienation) e Hades / Hades II**: sem entrevista nem palestra sobre câmera. A
  única menção que achei: resenha elogia a câmera de renascimento do Nex Machina como um movimento contínuo (resumo de
  busca) [21]. O resto, de memória: ângulo fixo, pouco movimento (conhecimento geral, sem fonte).
- **Vampire Survivors e Brotato** (contraste): câmera centrada no jogador e zoom fixo, sem direção de cena
  (conhecimento geral, sem fonte). São o piso que a câmera diretora precisa superar sem atrapalhar.

## 3. Algoritmos e ferramentas prontos

- **Cinemachine, Target Group + Group Framing (Unity).** Cada alvo tem Peso (só pesa na média) e Raio (entra na caixa).
  "Tamanho de enquadramento" é a fração da tela que a caixa ocupa (1 = tela toda); ajuste por zoom, recuo ou recuo e
  depois zoom, com faixas; deslocamento de centro e amortecimento. [5] Licença Unity Companion, para projetos que
  dependem do Unity [8]. **Como está: não. Ideia: sim**, caixa + fração da tela.
- **Cinemachine, Confiner 2D / 3D.** Mantém a vista dentro de um polígono ou volume. O 2D só vale com a câmera olhando
  reto para o polígono (a nossa inclina), tem zona de desaceleração na borda e um cache caro que precisa ser refeito
  quando o zoom muda. [6]
  **Como está: não.** A regra do campo é cálculo próprio com o trapézio inclinado (seção 4).
- **Cinemachine, Impulse, State-Driven e Blending.** Impulso: fonte emite sinal com direção e curva no tempo, a câmera
  treme. Estado: cada câmera tem "espera" antes de entrar e "mínimo" ativa; mistura padrão e mistura por par de/para,
  com "qualquer câmera". [7] Ideias diretas: eventos viram impulsos; tempo mínimo evita piscar nos momentos.
- **Phantom Camera (Godot, MIT).** Seguir em grupo: caixa em volta dos alvos, centro dela, `auto_zoom` com mínimo,
  máximo e margem; "Framed" com zona morta; prioridade e transições. [9] **Como está: não** (plugin do Godot). Ideia:
  margem do auto-zoom e zona morta.
- **Unreal, Gameplay Cameras.** Ativo com várias "rigs" (redes de nós), transições de entrada e saída e um "diretor"
  que escolhe a rig (Blueprint ou State Tree); experimental no 5.8. [11] Licença da Epic (conhecimento geral, sem
  fonte). **Como está: não.** Ideia: separar "quem escolhe a câmera" de "como cada câmera se comporta".
- **camera-controls (Three.js, MIT).** `fitToBox` enquadra uma caixa com margens, `setLookAt`, transições por promessa e
  `smoothTime` (padrão 0,25 s); exige `three` e instalação. [10] **Como está: não resolve**: é controle de órbita guiado
  pelo usuário, não conhece o trapézio nem o campo, e seria dependência nova (precisa de OK). Ideia: caixa + transição.
- **Enquadrar vários objetos em Three.js.** Receita de fórum: `Box3` de todos, distância pelos dois FOV, fica o maior.
  [24] Para nós: o mesmo teste, projetando os cantos da caixa e comparando com a tela. Código pequeno, escrito aqui.
- **Mola criticamente amortecida / SmoothDamp.** Segue o alvo sem passar dele, com `smoothTime` e passo de tempo; Unity
  e Unreal têm, e a do Unreal só é precisa com passo menor que metade do tempo. Keren recomenda para câmera. [12][1]
  **Como está: escrever (cerca de 15 linhas)**, sem dependência.
- **Tremida por trauma (Eiserloh, GDC 2016).** Evento soma trauma (0 a 1), que decai; nas implementações que citam a
  palestra o deslocamento é trauma^2 (ou ^3) vezes ruído suave. [3][4] Exemplos: decaimento 0,5/s, 10° e 20 px no
  Bevy; 0,8/s e 0,1 rad no Godot. São valores de tutorial, fortes demais para nós.
- **Catálogo de Keren (GDC 2015).** Janela da câmera, foco à frente, foco projetado (pela velocidade), foco de alvo,
  foco de região, foco de pista (ímãs), zoom para enquadrar, lerp e SmoothDamp. Vocabulário para nomear cada
  comportamento. [1] **Nesky, "50 Game Camera Mistakes" (GDC 2014)**: falhas típicas são desorientar, errar distâncias,
  quebrar a linha de visão e causar enjoo; só li a descrição, não vi a palestra. [2]
- **He, Cohen, Salesin, Virtual Cinematographer (1996).** Convenções de filmagem ("idiomas") como pequenas máquinas de
  estados hierárquicas que escolhem plano e hora de cortar; módulos fazem a geometria. [13] Ideia: cada momento é um
  idioma pequeno. **Lino e Christie, espaço tórico (SIGGRAPH 2015)**: pontos de vista em torno de dois alvos por
  ângulos, mantendo tamanho e posição na tela. [14] Pesquisa pesada; base teórica de "nave + chefe bem compostos".
  Levantamento de Christie et al. (2008): conhecimento geral, sem fonte.
- **Tutorial de caixa (Demons with Shotguns).** Mín. e máx. dos alvos, centro, zoom pelo espalhamento; sem suavização, e
  a fórmula de zoom do texto parece errada. [15] Só confirma o básico.

## 4. Desenho proposto para o nosso jogo

Medidas na escala do campo (800×600). "Zoom 1,00" = campo inteiro tocando as bordas da vista, a visão mais aberta
permitida; zoom maior = mais perto. Com a janela cheia, **toda a dinâmica é aproximar a partir de 1,00**. Sobra espaço
de movimento no eixo que a janela não preenche (tela larga: de cima a baixo; tela alta: de lado a lado) e, ao
aproximar, nos dois.

1. **Pontos de interesse com peso.** Todo objeto relevante vira (posição, raio, peso). Peso = base do tipo × urgência
   (ameaça: tempo até acertar) × valor. Comuns e orbes contam por monte, com teto, para 200 drones não mandarem na
   câmera. O jogador é âncora (sempre entra). Modelo: Group Average + Raio [5], ímãs [1].
2. **Caixa de enquadramento.** Obrigatórios: jogador, ameaças iminentes, chefe ativo. Os demais entram por ordem de
   peso enquanto o zoom exigido ficar acima do mínimo do momento. Centro desejado = jogador + puxão limitado ao centro
   ponderado (região-foco [1]); avanço pela mira só na calma.
3. **Zoom exigido.** Projetar os cantos da caixa com a câmera candidata e exigir que caiam na margem segura da tela;
   achar o maior zoom que serve por bisseção (cerca de 8 passos). Cobre proporção e inclinação pela ideia de "o maior
   dos dois eixos" [5][24].
4. **Restrições, por prioridade.** (a) Campo: achar onde os quatro raios dos cantos da vista tocam o chão (um trapézio,
   mais largo no fundo da tela) e empurrar o centro, ou reduzir o zoom, até os quatro caírem dentro do campo, também
   em ângulos intermediários. (b) Ameaça que vai acertar dentro da margem segura: primeiro reduzir zoom, depois
   deslocar; se mais de uma não cabe, vence a de menor tempo até acertar e as outras ficam para as setas do radar
   planejado. (c) Jogador e ponto de mira dentro da margem. Se colidem, vale a ordem: campo, ameaça, jogador.
5. **Suavização.** Uma mola amortecida por canal (posição, zoom, inclinação, giro), com tempos diferentes: afastar
   rápido, aproximar devagar. O alvo passa antes por filtro e faixa morta (janela de Keren [1]) para a câmera não
   perseguir caixa que pisca. A restrição (a) roda de novo depois da mola: o caminho nunca sai do campo.
6. **Momentos como estados.** Calmo, pressão, perigo, onda limpa, entrada de chefe, luta de chefe, morte, vitória. Cada
   um tem faixa de zoom, pesos, tempos de mola, ângulo extra, tremida, duração mínima e espera de entrada [7].
   Transições por par, com duração própria [7]. Eventos do jogo disparam os especiais; "perigo" vem de uma nota somada
   das ameaças, com histerese (entra alto, sai baixo e só depois de um tempo). Prioridade: morte > vitória > entrada
   de chefe > perigo > o resto. Cada momento é um "idioma" pequeno [13].
7. **Ângulos.** Inclinação, giro e rolagem são canais extras com a mesma mola. Calmo e perigo ficam em poucos graus;
   só entrada de chefe, morte e vitória vão além. Rolagem só na tremida. A restrição (a) roda com o ângulo do instante.
   Zoom e inclinação juntos dão peso a golpes finais, como em Aztez [1].
8. **Proporção da janela.** A cada mudança de tamanho recalcular o zoom 1,00 e o retângulo seguro; conferir 4:3, 16:9,
   21:9 e tela alta. Em 21:9 a faixa vertical é curta: a câmera trabalha de cima para baixo.
9. **Reduzir movimento.** Ao detectar a preferência do sistema [23] ou a opção do jogo, usar intensidade em vez de
   liga/desliga [22]: tremida 0, ângulo 0, avanço 0, molas ×2, zoom máximo menor; momentos viram corte curto.

Números de partida. **Proposta, ele ajusta jogando.** Zoom em relação ao campo todo (1,00); tempos em segundos.

| Momento          | Zoom        | Ângulo extra                  | Mínimo ativo | Observação                        |
| ---------------- | ----------- | ----------------------------- | ------------ | --------------------------------- |
| Calmo            | 1,15 a 1,30 | até 2°                        | 3,0          | avanço pela mira até 12% da vista |
| Pressão          | 1,05 a 1,15 | até 2°                        | 1,5          | avanço pela mira cai a zero       |
| Perigo           | 1,00 a 1,05 | 0°                            | 1,0          | ameaça iminente manda             |
| Onda limpa       | 1,25        | 0°                            | 1,5          | depois varre os orbes             |
| Entrada de chefe | 1,00        | +10° de inclinação            | 3,0          | chefe e jogador na caixa          |
| Luta de chefe    | 1,00 a 1,10 | até 3°                        | 2,0          | chefe obrigatório na caixa        |
| Morte            | até 1,60    | +6° de inclinação             | 2,5          | aproxima da nave em 1,2 s         |
| Vitória          | 1,35        | +8° de inclinação, giro de 8° | 4,0          | giro lento                        |

| Parâmetro            | Valor inicial                                                                 |
| -------------------- | ----------------------------------------------------------------------------- |
| Pesos, fixos         | jogador 10; chefe 8; mini-chefe 5; alvo valioso 4                             |
| Pesos, variáveis     | ameaça rápida 6 × urgência; orbe 1 (até 3 montes); inimigo comum 0,3 (teto 2) |
| Urgência             | tempo até acertar: 3 abaixo de 0,8 s; 2 abaixo de 1,5 s; senão 1              |
| Margem segura        | ameaça iminente nos 88% centrais; jogador nos 60% centrais                    |
| Tempo de mola        | posição 0,30; aproximar 0,90; afastar 0,25; ângulo 0,80                       |
| Faixa morta          | zoom 4%; posição 6 unidades                                                   |
| Perigo (histerese)   | entra com nota 1,0 por 1,0 s; sai com nota 0,5 por 2,0 s                      |
| Tremida              | decai 1,0/s; expoente 2; no máximo 6 unidades e 0,6° (rotação opcional)       |
| Velocidade da câmera | a medir jogando, ligada à velocidade da nave para a mira não fugir            |

## 5. Riscos

- **Enjoo.** Nesky lista o enjoo de simulação entre as falhas de câmera [2]; o Xbox pede poder desligar tremida e
  balanço [22]. Zoom que "respira" e rolagem são o que mais preocupa (sem fonte). Mitigação: faixa morta, aproximar
  devagar, nunca oscilar, rolagem só na tremida, controle de intensidade e respeito ao sistema [23].
- **Perda de mira.** Câmera que se mexe faz o alvo escorregar sob o cursor [18]. Mitigação: limite de velocidade, avanço
  zero em perigo, e testar sempre atirando em movimento.
- **Borda com wrap.** A nave cruza a borda e reaparece do outro lado; uma câmera presa ao campo varreria 800 unidades
  numa mola de 0,3 s. Proposta (sem fonte, a testar): perto da borda tender a zoom 1,00 e, na travessia, corte ou
  panorâmica curta.
- **Legibilidade em horda.** Aproximar encurta o tempo de ver o que chega e a perspectiva comprime o fundo da tela. Com
  200 inimigos a caixa satura: teto por monte e setas do radar carregam a leitura (sem fonte; medir).
- **Regra fixa quebrada por sorte.** Vista além do campo ou escondendo ameaça deve ser impossível por construção
  (restrição depois da mola); um teste por proporção, com o trapézio.
- **Desempenho.** Varredura de entidades e bisseção são baratas (centenas de objetos, 8 passos, 4 raios): pontuar a 10
  a 15 Hz e deixar só as molas a cada quadro. Evitar recalcular polígonos, como o Confiner 2D faz [6].
- **Subjetividade.** Pesos, tempos e ângulos são de sensação: cena de teste por momento e painel de depuração (caixa,
  pesos, estado) para ele ver; o teste confere só as regras fixas.

## 6. Fontes

1. Keren, "Scroll Back" (GDC 2015): https://www.gamedeveloper.com/design/scroll-back-the-theory-and-practice-of-cameras-in-side-scrollers e https://gdcvault.com/play/1022243/Scroll-Back-The-Theory-and
2. Nesky, "50 Camera Mistakes" (GDC 2014): https://gdcvault.com/play/1021262/50-Camera e https://www.youtube.com/watch?v=C7307qRmlMI
3. Eiserloh, "Juicing Your Cameras With Math" (GDC 2016): https://www.gamedeveloper.com/programming/video-sprucing-up-cameras-with-math e https://www.youtube.com/watch?v=tu-Qe66AvtY
4. Tremida por trauma, Bevy: https://bevy.org/examples/camera/2d-screen-shake/ e Godot: https://kidscancode.org/godot_recipes/3.x/2d/screen_shake/
5. Cinemachine 3.1, Group Framing: https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineGroupFraming.html e Target Group: https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineTargetGroup.html
6. Cinemachine 3.1, Confiner 2D: https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineConfiner2D.html e Confiner 3D: https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineConfiner3D.html
7. Cinemachine 3.1, Impulse: https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineImpulse.html, State-Driven: https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineStateDrivenCamera.html, Blending: https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineBlending.html
8. Cinemachine, licença (Unity Companion License): https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/license/LICENSE.html
9. Phantom Camera, seguir em grupo: https://phantom-camera.dev/follow-modes/group e repositório (MIT): https://github.com/ramokz/phantom-camera
10. camera-controls (MIT): https://github.com/yomotsu/camera-controls e https://www.jsdelivr.com/package/npm/camera-controls
11. Unreal, Gameplay Camera System: https://dev.epicgames.com/documentation/unreal-engine/gameplay-camera-system-overview
12. Unity SmoothDamp: https://docs.unity.com/en-us/engine/6000.0/script-reference/unityengine/vector3/smoothdamp e Unreal CriticallyDampedSmoothing: https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/Core/FMath/CriticallyDampedSmoothing
13. He, Cohen, Salesin, The Virtual Cinematographer: https://www.microsoft.com/en-us/research/?p=150986
14. Lino e Christie, espaço tórico: https://history.siggraph.org/?p=112722 (artigo de 2012, só resumo de busca: https://www.irisa.fr/mimetic/GENS/mchristi/Publications/2012/LC12.html)
15. Smash, câmera: https://www.ssbwiki.com/Camera e tutorial de caixa: https://www.gamedeveloper.com/programming/single-camera-system-for-four-players
16. Helldivers 2, PlayStation Blog: https://blog.playstation.com/2024/03/12/helldivers-2-how-arrowhead-turned-the-twin-stick-shooter-original-into-a-bombastic-ps5-sequel/
17. Diablo IV, entrevista Barriga (só resumo de busca): https://www.wowhead.com/cn/news/diablo-iv-ausgamers-interview-with-game-director-luis-barriga-and-art-director-298424 e https://www.pcgamesn.com/diablo-4/season-4-camera-distance
18. Gungeon, tópico da Steam: https://steamcommunity.com/app/311690/discussions/0/371918937283235999 (co-op, só resumo: https://steamcommunity.com/app/311690/discussions/1/371918937289355574)
19. Nuclear Throne, blog sobre a entrevista da RPS: https://infovore.org/?p=5275
20. Assault Android Cactus, prévia: https://www.nintendolife.com/news/2013/09/hands_on_assault_android_cactus
21. Nex Machina, resenha de co-op (só resumo de busca): https://www.co-optimus.com/review/2045/nex-machina-co-op-review.html
22. Xbox Accessibility Guideline 117: https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/117
23. MDN, prefers-reduced-motion: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion
24. Fórum do Three.js, enquadrar todos os objetos: https://discourse.threejs.org/t/how-can-i-place-camera-to-show-all-objects/35226
