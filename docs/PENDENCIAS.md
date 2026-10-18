# Pendências — o que está quebrado e o que falta

Lista viva do que está aberto, nas palavras do dono. Leia só a seção O BASTÃO e o item da vez; o resto, por `grep`.
Item resolvido sai da lista e vira commit; a história de cada número fica no git (`git log --all --grep="(NNN)"`).
Número é identidade, não posição: item novo entra no fim da sua seção. **Próximo número livre: 9.**

## O BASTÃO — onde a sessão parou (18/10, ~13h30) — RODADA 10 MESCLADA NA `main`; SESSÃO ENCERRADA POR CONTEXTO (ele pediu nova conversa)

**Como retomar (nova sessão, qualquer máquina):**

1. `git clone https://github.com/fgferre/ASTEROIDS_ROGUEFIELD.git && cd ASTEROIDS_ROGUEFIELD && git checkout main` — a
   `main` contém tudo (PRs #247–#256 e o décimo primeiro). O ramo `claude/session-011CUZwFkeqHg4syYX2GsSkg` pode ser
   apagado; não tem nada fora da `main`.
2. Ler, nesta ordem: este BASTÃO; `PLAN.md` (Rodadas 2–10, cada etapa marcada); `docs/NORTE.md` (§1 ficção, §2–3 arte,
   §7 Norte 2 + a regra dos dois eixos); `BACKLOG.md` (19 linhas, conferidas contra o código em 18/10).
3. `npm ci && npm run done` (1010 testes, build). Para ver o jogo: `npm run dev` → `http://localhost:5500/ASTEROIDS_ROGUEFIELD/`.
4. **Antes de qualquer junção na `main`:** rodar a sonda headless de erros de runtime (20 s de cena hero, 3D) — o gate
   não pega erro de render. O script estava no scratchpad da sessão anterior (perdido); recriar é curto: Playwright
   abre `?scene=hero&desktop=force&debugLogging=0`, espera `#game-canvas`, 20 s, conta `pageerror` e `console.error`.
5. Juntar na `main` sempre via pull request mesclado pela API (`gh api .../pulls` + `PUT .../merge`): o hook bloqueia
   `git push origin main` de propósito. Ele aprovou ("eu aprovo daqui… preciso que tudo seja mergeado na main").

**Regras dele que valem para sempre:** (a) agir independentemente e crescer o jogo a cada rodada; (b) toda rodada
melhora também gráficos, efeitos, câmera, jogabilidade e UX, não só conteúdo; (c) tudo em inglês no jogo; (d) números
são "proposta" nomeada no código — ele julga jogando; (e) um commit por fatia, com captura; (f) nunca `git add -f`.

**Vereditos dele até agora (jogando a Rodada 4):** item (7) fundo como textura e sombra no "chão" → espaço procedural
com sombras só entre objetos (R5.10); item (8) nave virava para a mira → casco segue o movimento, arma é torreta
(R5.11). **Ele ainda não deu veredito sobre as Rodadas 5–10.** É a primeira coisa a pedir na nova sessão.

**O que o jogo tem hoje (10 rodadas):** gameplay em Three.js com pipeline sRGB/ACES, espaço procedural, sombras reais,
texturas assadas, nave em uma malha, rochas instanciadas, máquinas fundidas, batches de rim/emissivos (cena hero ~66
draw calls no ultra), presets de qualidade automáticos, interpolação de render, warm-up de shaders, câmera 2.0,
cinema de intro/epílogo; 8 tipos de inimigo + afixos de Elite, 3 Heralds, 3 Wardens, 15 camadas em 3 biomas com
surtos, eventos e modificadores no infinito; torreta + twin-stick (gamepad), dash, 2 cascos, 34 cartas com raridade/
reroll/banish, evoluções e Apex, pickups, Hangar, Códice com lore, conquistas, dificuldade/seed/Daily; áudio com
limitador, reverb, distância, temas por bioma, percussão, vozes dos Wardens e Heralds; HUD direcional, acessibilidade.

**Tudo visto só em headless sem GPU (2–4 fps).** `?stats=1` mostra fps/ms reais; `graphics.quality` em Settings.

**Próxima rodada:** o que ele disser jogando. Sem veredito: `BACKLOG.md` (19 linhas) — nada grave; candidatos: cue do
freio, 2D parity residual, chip de buff na medição dos painéis, linhas de transmissão de morte/vitória atrás das telas.

**Avisos de processo:** workers em paralelo só em arquivos disjuntos (senão separar hunks no commit); `pgrep -f`/
`pkill -f` matam o próprio shell do worker; o container pode reiniciar (trabalho em disco sobrevive — relançar com
"continue do que está na árvore"); desligar temporizadores antigos; pedir ao worker que encerre após ~60 min medindo;
servidores Vite descartáveis por porta para capturas.

## Visual (palavras dele, 18/10, primeira vez jogando a Rodada 4)

- **(7)** _"Tá ficando muito interessante, mas tá um pouco estranho o background ser essas estrelas como se fosse uma
  textura. Achei que tinha que ser algo mais procedural ali. Além disso, é estranho fazer sombra em cima dessa
  textura. É espaço, é o espaço atrás."_ → Rodada 5, R5.10: fundo procedural (estrelas em pontos 3D com paralaxe
  real, nebulosa em shader) e fim das sombras projetadas no "chão". Depois: _"A sombra faz sentido nas coisas que são 3D, né? Se tem uma fonte de luz iluminando, tudo que emite luz fazer
  sombra é interessante também, mas ter uma sombra refletida embaixo no chão, nas estrelas, como se fosse um chão, é
  estranho."_ → sombras só entre objetos 3D (shadow map da luz-chave; nave e rochas sombreando rochas), nenhuma num
  plano de fundo. Fecha quando ele disser que o fundo lê como espaço.

## Jogabilidade e sensação

- **(1)** _"dos gráficos até as dinâmicas e efeitos, UX tudo ruim"_ (17/10). O que o diagnóstico achou está em
  `PLAN.md`; este item fecha quando ele disser, jogando, que não está mais amador.
- **(2)** Boss da wave 5 levou ~120 s para morrer com 6 upgrades — _"difícil, mas dá"_ (maio/2026). Alvo era 60–90 s.

## Visual

- **(3)** O menu (Three.js, bloom) é muito melhor que o jogo (Canvas 800×600 esticado, borrado). O jogo tem de parecer
  continuação do menu — é o que `docs/brand.md` e `docs/NORTE.md` já pedem.

## Controles (palavras dele, 18/10)

- **(8)** _"A nave está sempre virando de forma automática para onde a mira está atirando. No jogo original a gente
  pilotava a nave independente de onde o tiro ia, como se o tiro saísse de um canhão móvel em volta da nave. O
  movimento fica muito estranho usando o WASD, porque ela vai em direção para onde está atirando."_ → Rodada 5,
  R5.11: casco aponta para onde se move (WASD relativo à tela), arma vira torreta que gira sozinha para o alvo.
  Fecha quando ele disser que pilotar e atirar voltaram a ser independentes.

## Interface

## Desempenho

- **(6)** Ele abriu o DevTools _"justamente porque estava lento demais"_ (17/10). O trace mostrou `gameLoop` a 377 ms.
  Em headless (17/10) o jogo fica em 16,7 ms de mediana com picos de 33–50 ms, com ou sem log de depuração — o
  travamento dele **não reproduziu** aqui. Falta medir na máquina dele: `?debugLogging=0`, DevTools fechado, e o
  painel F3 do jogo aberto por 60 s; só depois decidir o que otimizar.
