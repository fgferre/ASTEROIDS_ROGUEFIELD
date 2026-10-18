# Pendências — o que está quebrado e o que falta

Lista viva do que está aberto, nas palavras do dono. Leia só a seção O BASTÃO e o item da vez; o resto, por `grep`.
Item resolvido sai da lista e vira commit; a história de cada número fica no git (`git log --all --grep="(NNN)"`).
Número é identidade, não posição: item novo entra no fim da sua seção. **Próximo número livre: 9.**

## O BASTÃO — onde a rodada parou (18/10, ~08h30) — RODADA 6 (PRIMEIRA METADE) MESCLADA NA `main` + CORREÇÃO

**Como retomar (qualquer máquina):** `git clone https://github.com/fgferre/ASTEROIDS_ROGUEFIELD.git`, `git checkout main`
(contém PRs #247–#251 e o sexto). Ler este BASTÃO, `PLAN.md` (Rodadas 2–6) e `docs/NORTE.md` (§7 + regra dos dois
eixos); `npm ci && npm run done` (~900 testes).

**Correção importante (18/10):** a `main` do PR #251 tinha um erro de render em 3D (`Cannot read properties of null
(reading 'state')`, frame a frame depois de alguns segundos): o shadow map era reconstruído fora de um frame quando o
preset de qualidade mudava. Corrigido em `66cb870` com teste de regressão; sonda headless de 20 s: 0 erros.

**Regra dele:** toda rodada melhora também gráficos, efeitos, câmera, jogabilidade e UX, não só conteúdo.

**Vereditos dele (itens 7 e 8):** atendidos na Rodada 5 (espaço procedural sem chão; casco segue o movimento, arma é
torreta). Ainda sem veredito sobre a Rodada 5 em si.

**Rodada 6 feita:** gamepad twin-stick (stick direito mira a torreta, rumble, menus pelo controle, replay v4);
afixos de Elite (Shielded, Swift, Volatile, Splitter, Warded) com badges e nomes; HUD direcional (arcos de dano,
setas de fora de tela, barra de chefe por fase, ícones no radar). **Rodada 6 pendente:** dificuldade + seed diária
(R6.3), Solar Slicer de verdade (R6.4), rochas instanciadas/orçamento de sombra (R6.6), áudio espacial (R6.7).

**Tudo visto só em headless sem GPU (2–4 fps).** `?stats=1` mostra fps/ms reais; `graphics.quality` em Settings.

**O que só ele pode responder, jogando:** fundo/sombras/torreta da Rodada 5; se o controle twin-stick responde bem
(deadzone 0,2, mira manual acima de 0,35); se os afixos leem à distância; setas e arcos da HUD atrapalham ou ajudam.

**Avisos de processo (18/10):** sempre rodar a sonda headless de erros (`scratchpad/errprobe.mjs`, 20 s de cena hero)
antes de mesclar — o gate não pega erro de runtime no render; o container pode reiniciar e derrubar workers (o
trabalho em disco sobrevive); `pgrep -f` mata o próprio shell do worker.

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
