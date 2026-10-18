# Pendências — o que está quebrado e o que falta

Lista viva do que está aberto, nas palavras do dono. Leia só a seção O BASTÃO e o item da vez; o resto, por `grep`.
Item resolvido sai da lista e vira commit; a história de cada número fica no git (`git log --all --grep="(NNN)"`).
Número é identidade, não posição: item novo entra no fim da sua seção. **Próximo número livre: 9.**

## O BASTÃO — onde a rodada parou (18/10, ~07h40) — RODADA 5 COMPLETA E MESCLADA NA `main` (publicado)

**Como retomar (qualquer máquina):** `git clone https://github.com/fgferre/ASTEROIDS_ROGUEFIELD.git`, `git checkout main`
(contém tudo: PRs #247–#250 e o quinto, mesclados a pedido dele). Ler este BASTÃO, `PLAN.md` (Rodadas 2–5) e
`docs/NORTE.md` (§7 = Norte 2 + regra dos dois eixos); `npm ci && npm run done` (870 testes).

**Regra dele (18/10):** toda rodada melhora também gráficos, efeitos, câmera, jogabilidade e UX, não só conteúdo.

**Vereditos dele jogando a Rodada 4 (itens 7 e 8 abaixo), já atendidos na Rodada 5:** fundo de estrelas como textura
e sombras no "chão" → espaço procedural (estrelas 3D com paralaxe, nebulosa em shader, sombras reais só entre
objetos); nave virava para a mira e o WASD puxava para onde atirava → casco segue o movimento, arma é torreta.

**Rodada 5 (conteúdo):** eventos de campo (Gravity Well, Solar Flare, Sensor Jam), catálogo de 34 cartas com três
malditas, Heralds nas camadas 3/8/13, conquistas no Códice, intro/epílogo cinematográficos, warm-up de shaders.
**Rodada 5 (qualidade):** Câmera 2.0 (antecipação, zoom por ameaça, enquadramento de chefe, rolagem), passe gráfico
(grão/vinheta, rim light, escudo hexagonal, decals), sensação (banking, recuo, knockback, números com peso), UX
(menu com nave 3D, settings em abas, pausa em card, transição das cartas), espaço procedural, torreta.

**Tudo visto só em headless sem GPU (2–4 fps).** `?stats=1` mostra fps/ms reais; `graphics.quality` em Settings.

**O que só ele pode responder, jogando:** se o fundo agora lê como espaço e as sombras entre objetos convencem
(sutis de propósito); se pilotar com o casco seguindo o movimento e a torreta mirando sozinha é o que ele queria
(MODERN_MOVE_ACCEL, TURRET_TURN_RATE em `physics.js`); se banking do casco + rolagem da câmera somados incomodam;
ritmo dos Heralds e eventos; cartas malditas; menu/settings novos; e todas as "propostas" nomeadas no código.

**Próxima rodada:** o que ele disser jogando. Sem veredito: `BACKLOG.md` (30 linhas, triado) e o resto do §7.

**Avisos de processo (18/10):** o container pode reiniciar e derrubar workers (o trabalho em disco sobrevive;
relançar com "continue do que está na árvore"); `pgrep -f` mata o próprio shell do worker; dois workers no mesmo
arquivo exigem separar hunks no commit.

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
