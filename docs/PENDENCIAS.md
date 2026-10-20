# Pendências — o que está quebrado e o que falta

Lista viva do que está aberto, nas palavras do dono. Fechados em 19/10 pelo veredito dele jogando (Mac M1, 60 fps):
1, 3, 6, 7, 8, 9; e 10–14 (o goal de 18/10) feitos na conversa local em 19/10 — história no git. Leia só a seção O BASTÃO e o item da vez; o resto, por `grep`.
Item resolvido sai da lista e vira commit; a história de cada número fica no git (`git log --all --grep="(NNN)"`).
Número é identidade, não posição: item novo entra no fim da sua seção. **Próximo número livre: 18.**

## O BASTÃO — onde as sessões pararam (20/10) — RODADA 0 E METADE DA 14 NA `main` (PRs até #292); PRÓXIMA CONVERSA: FECHAR A 14 (HUD) E DEPOIS A 15 (LONGEVIDADE)

**Como retomar (conversa local, qualquer máquina):**

1. `git checkout main && git pull && npm ci && npm run done` (gate = lint + formato + testes + build; 190 arquivos de
   teste; o golden trace de 21 partidas prova comportamento igual). Jogo: `npm run dev` →
   `http://localhost:5500/ASTEROIDS_ROGUEFIELD/`. Sonda e captura headless já estão no repo: `scripts/probe.mjs` e
   `scripts/capture.mjs` (para nuvem ou automação; a conversa local tem navegador embutido).
2. Ler, nesta ordem: este BASTÃO; `PLAN.md` (Passagem de bastão 19/10, Rodada 0 feita, **Rodada 14 com 14.1, 14.2 e
   quase toda a 14.2b feitas**, Rodada 15 redigida); `CONTENT.md` (como adicionar inimigo, arma, carta, casco, fase,
   bioma, chefe — um arquivo cada, zero linhas no motor); `docs/NORTE.md` (§1 ficção, §2–3 arte); `BACKLOG.md`.
3. Juntar na `main` sempre por pull request (a conversa local tem feito isso; o hook bloqueia publicar a `main` direto).

**Regras dele que valem para sempre:** (a) agir independentemente e crescer o jogo a cada rodada; (b) toda rodada
melhora também gráficos, efeitos, câmera, jogabilidade e UX; (c) tudo em inglês no jogo; (d) números são "proposta"
nomeada no conteúdo — ele julga jogando; (e) um commit por fatia, com captura; (f) nunca `git add -f`; (g) docs só com
o que está aberto; (h) **maquete antes de código** para interface e câmera (ele aprova a imagem, depois se implementa);
(i) **"às vezes menos é mais"** — a primeira câmera diretora foi rejeitada por overengineering; a de dois estados
(perto/aberta) foi aprovada.

**Estado por frente (20/10):**

- **Fábrica de conteúdo (Rodada 0): feita.** `src/content` com registro automático (10 inimigos, 6 chefes, 3 armas, 39
  cartas, 4 cascos, 15 camadas, 3 biomas); inimigos e armas como receitas; visual por receita; diretor por papéis; cena
  `?content=<id>&count=&fire=1`; teto de 1.200 linhas por arquivo sem exceções; horda de 200 Motes a 60 fps no M1.
- **Janela inteira (14.2): feita e publicada.** Canvas = janela, densidade = tela (teto 2); a câmera vê uma fatia com a
  proporção da janela e chega às quatro bordas; tela cheia (Settings → Interface, tecla F). **Falta ele medir na tela
  dele:** no M1 em 1440×900 Retina, ultra com `renderScale=2`, deu ~52 fps na horda (era ~61 na caixa 4:3) — um teto de
  pixels por preset é decisão dele.
- **Câmera diretora (14.2b, item 17): quase feita.** Dois estados de cima (perto com inclinação leve; aberta quase de
  cima com o campo inteiro em perigo, fim de fase, ameaça fora da vista), nave sempre na tela, pode passar da borda
  deslizando rápido, véu de luz na borda e espaço mais escuro além dela, fundo sem emendas visto de baixo, chegada
  animada própria de cada Warden com cena viva curta (mundo a 1/4, nave protegida). **Falta:** cena viva de morte e de
  vitória final (passo e), e ele jogar e dizer que a câmera dirige a cena.
- **Arena com volume (PRs #289–#292):** toda nave e inimigo com forma desenhada para qualquer ângulo; tiros, rastros,
  feixes, fagulhas, orbes, corações, pickups, explosões, escudo e fundo lendo como volumes de qualquer ângulo.
- **HUD e instrumentos (14.3–14.7, item 16): não começados.** `HUD.md` (tokens, hierarquia, movimento, estados) →
  radar tático por maquete aprovada → recargas ancoradas na nave, barras, chips como ícones, barra de chefe, feed →
  menu/Hangar/Códice/Settings na mesma linguagem → legibilidade com 200 inimigos → guardas no gate (orçamento de quadro
  por cena; capturas de referência que pedem aprovação dele). O radar acompanha o zoom da câmera nova.
- **Abertos dele:** item 2 (tempo do chefe da camada 5), item 15 (o Anel partido lê como faixa; explicado, nada mudado;
  modelar como estrutura iluminada mantendo o acender do epílogo), itens 16 e 17 acima. `BACKLOG.md`: 29 linhas.
- **Depois da 14: Rodada 15 (longevidade)**, texto já no PLAN — 12+ armas, 30+ inimigos, 6 biomas, roster de cascos,
  árvore de desbloqueios, runs de 20–30 min com centenas de inimigos, qualidade por padrão mais alta.

**Vereditos dele até aqui:** Rodadas 5–13 aprovadas jogando (M1, 60 fps; "é pouco conteúdo… Vampire Survivors são
dias de desafio"); câmera de dois estados aprovada por maquete; primeira câmera contínua rejeitada; "não tem problema
mostrar a borda"; "a gente quer ver o inimigo chegando" (sem pausar a cena). **Sem veredito ainda:** janela inteira na
tela dele, câmera diretora jogando, chegadas dos Wardens.

**Avisos de processo:** até cinco ajudantes em paralelo, cada um com os arquivos dos outros nomeados; `pgrep -f`/
`pkill -f` matam o shell do ajudante; `set -o pipefail` em cadeias com testes; um ajudante pode "cair" sem escrever —
conferir o diff; apagar refs remotas em massa é bloqueado na nuvem (a limpeza foi feita localmente: de 224 ramos
antigos restam ~29); o erro de console `game-session` → `renderer` ao carregar é antigo e não impede a partida.

## Jogabilidade e sensação

- **(2)** Boss da wave 5 levou ~120 s para morrer com 6 upgrades — _"difícil, mas dá"_ (maio/2026). Alvo era 60–90 s.

## HUD e janela (palavras dele, 19/10, manhã)

- **(16)** _"O radar está muito básico… todos os instrumentos do painel não condizem com a realidade nova de um projeto
  AAA."_ / _"O app tem uma janela dinâmica… precisa se adaptar a isso também."_ → Rodada 14 no PLAN (janela inteira,
  `HUD.md`, instrumentos por maquete aprovada por ele). Fecha quando ele disser que o painel está à altura do jogo.
- **(17)** _"Acho que a câmera dinâmica precisa ser revista depois dessas mudanças."_ / _"Tem que ser um algoritmo mais
  inteligente que entenda como a movimentação de câmera deve se adequar ao viewport e ao contexto relevante… trocar de
  posição, aumentar e diminuir o zoom de acordo com o que tem de importante na tela no momento, sejam spoils,
  inimigos, high value targets, bosses, mini bosses… não acho que seja simplesmente uma correção… ela inclusive pode
  brincar com ângulos diferentes. Enfim, dinâmica mesmo."_ / _"Tem que ter pesquisa de benchmarks hoje no mundo gamer e
  talvez já existam algoritmos top-tier prontos."_ (19/10, depois da janela inteira) → 14.2b no PLAN. Fecha quando
  ele jogar e disser que a câmera dirige a cena.

## Goal novo (palavras dele, 18/10, fim de tarde)

_"iterar continuamente no Asteroid Roguefield existente, usando a essência de Asteroids + Vampire Survivors apenas como
inspiração e direção, e priorizar os pontos concretos ainda abertos: fundo espacial que ainda lê como textura (mais
volume procedural, sombras só entre objetos 3D), controle do casco ainda acoplado demais à mira (torreta independente),
medição real de desempenho na máquina do dono, caminhos de áudio mortos, oddities visuais e de paridade 2D/3D, replay
que não grava o modo, edge cases de pooling/director e arquivos ainda muito grandes. A cada rodada, melhorar também
qualidade gráfica, efeitos, câmera, jogabilidade e UX, buscando o polimento de um título AAA de próxima geração no
browser, sem se limitar às referências."_

- **(15)** _"Eu olhando bem no fundo aqui, eu percebo uma faixa mais escura no fundo, como se fosse um ribbon, um
  stripe, que eu não entendo do que se trata. Parece um defeito."_ / _"Ao invés de só tirar, me explica qual era a
  intenção. Talvez seja algo importante para a história."_ (18/10, noite). É o **Anel partido** (`fieldBackdrop.js`,
  NORTE §1–2): o campo de jogo é o campo de destroços de uma megaestrutura em anel; a faixa é um pedaço dela, longe
  abaixo, em silhueta contra a nebulosa, para dar escala e lugar — e no epílogo da vitória ela acende em violeta
  (`setWake`), o Anel voltando à vida quando os Wardens caem. A intenção é importante; a execução não lê: banda
  chapada, sem luz, sem espessura. Nada foi mudado em 18/10 (ele não aprovou o paliativo de opacidade). Próxima
  sessão: modelar o Anel como estrutura iluminada (espessura, segmentos, borda pela luz-chave, névoa de distância),
  mantendo o acender do epílogo.
