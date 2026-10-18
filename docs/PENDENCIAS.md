# Pendências — o que está quebrado e o que falta

Lista viva do que está aberto, nas palavras do dono. Leia só a seção O BASTÃO e o item da vez; o resto, por `grep`.
Item resolvido sai da lista e vira commit; a história de cada número fica no git (`git log --all --grep="(NNN)"`).
Número é identidade, não posição: item novo entra no fim da sua seção. **Próximo número livre: 9.**

## O BASTÃO — onde a rodada parou (18/10, ~13h00) — RODADA 9 MESCLADA NA `main` (publicado)

**Como retomar (qualquer máquina):** `git clone https://github.com/fgferre/ASTEROIDS_ROGUEFIELD.git`, `git checkout main`
(PRs #247–#255 e o décimo). Ler este BASTÃO, `PLAN.md` (Rodadas 2–9) e `docs/NORTE.md` (§7 + regra dos dois eixos);
`npm ci && npm run done` (998 testes). **Antes de qualquer junção:** sonda headless `scratchpad/errprobe.mjs` → `errors: 0`.

**Regra dele:** toda rodada melhora também gráficos, efeitos, câmera, jogabilidade e UX, não só conteúdo.

**Vereditos dele (itens 7 e 8):** atendidos na Rodada 5. **Sem veredito ainda sobre as Rodadas 5–9.**

**Rodada 9:** nave fundida numa malha (33 → 12 objetos; cena hero no ultra ~95 → ~66 draw calls) e badges de afixo
com seed; drift do Magnetic Storm pela seed de run; flash do boss respeita "reduce flashing"; prévia de casco
bloqueado no Hangar; Heralds falam ao surgir e ao cair, com voz própria; Códice com lore e contagens de Heralds e
Wardens; conquista Herald Hunter. A meta de draw calls fechou no que dependia da sessão (resta passe de sombra e pós).

**Tudo visto só em headless sem GPU (2–4 fps).** `?stats=1` mostra fps/ms reais (monitor interno).

**O que só ele pode responder, jogando:** Rodadas 5–9 inteiras e todas as "propostas" nomeadas no código.

**Próxima rodada sem veredito dele:** BACKLOG (26 linhas) — enquadramento do casco no Hangar; teal do banner de
modificador; chip de buff/evolução na medição dos painéis; linhas de transmissão de morte/vitória atrás das telas;
2D parity residual.

**Avisos de processo (18/10):** `pgrep -f`/`pkill -f` matam o próprio shell do worker; dois workers no mesmo arquivo
exigem separar hunks; o container pode reiniciar (trabalho em disco sobrevive); desligar temporizadores antigos;
pedir ao worker que encerre quando passar de ~60 min medindo.

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
