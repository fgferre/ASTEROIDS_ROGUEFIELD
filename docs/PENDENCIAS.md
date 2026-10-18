# Pendências — o que está quebrado e o que falta

Lista viva do que está aberto, nas palavras do dono. Leia só a seção O BASTÃO e o item da vez; o resto, por `grep`.
Item resolvido sai da lista e vira commit; a história de cada número fica no git (`git log --all --grep="(NNN)"`).
Número é identidade, não posição: item novo entra no fim da sua seção. **Próximo número livre: 7.**

## O BASTÃO — onde a rodada parou (18/10, ~02h20) — RODADAS 2, 3 E PARTE DA 4 MESCLADAS NA `main` (publicado)

**Como retomar (qualquer máquina):** `git clone https://github.com/fgferre/ASTEROIDS_ROGUEFIELD.git` (ou `git fetch`),
`git checkout main` — a `main` já contém tudo (PRs #247 e o seguinte, mesclados a pedido dele: _"eu aprovo daqui"_).
Ler este BASTÃO, `PLAN.md` (Rodadas 2–4) e `docs/NORTE.md` (§7 é o Norte 2); rodar `npm ci && npm run done`.

**Palavras dele nesta rodada:** _"crie um goal novo baseado nos seus achados e aja independentemente… aumentando o
conteúdo do jogo a cada rodada"_; _"preciso que tudo seja mergeado e commitado no main no github"_.

**O que entrou desde o bastão anterior (um commit por fatia):**

- Rodada 2 (medley): profundidade e luz no 3D; roster Husk/Ram/Weaver/Bulwark + Elite; diretor de camadas com
  surtos; VFX 3D; SFX com limitador/reverb/música que acompanha a run; pickups Ímã/Pulso/Sobrecarga.
- Rodada 3: nave com presença (casco em três tons, propulsores com núcleo); cartas com raridade + reroll + banish
  (gravados no replay v3); `?stats=1` para medir na máquina dele.
- Rodada 4 (Norte 2): três biomas (Outer Ring, Dense Core, Warden's Reach) com título de capítulo; transmissões dos
  Wardens (roteiro em `src/data/story.js`); Warden Choir (10) e Warden Null (15); sete variantes de rocha em 3D;
  Harmonic Plasma Lance + cinco evoluções por família.

**Ainda não feito do Norte 2 (`PLAN.md` Rodada 4):** texturas procedurais assadas (R4.5), códice/recap de
morte/onboarding (R4.7), tema musical por bioma (R4.8), interpolação de render e presets por fps (R4.9); e da
Rodada 3: meta-progressão/Hangar (R3.4), modo infinito (R3.5), dissolve de morte (R3.6).

**Tudo visto só em headless sem GPU (2–4 fps).** Ele ainda não jogou nada disto. `?stats=1` mostra fps/ms reais.

**O que só ele pode responder, jogando:** desempenho do 3D na placa dele; legibilidade da nave e dos inimigos novos;
ritmo das 15 camadas, surtos e dos três Wardens; se os biomas e as transmissões dão sensação de lugar e história;
raridade/reroll/banish; a segunda arma e as evoluções; música e mix. Tudo é "proposta" nomeada no código.

**Avisos de processo (18/10):** um worker rodou `git stash` na árvore compartilhada (restaurou limpo); workers em
paralelo no mesmo servidor Vite recarregam capturas uns dos outros — usar servidores descartáveis por porta.
`BACKLOG.md` passou de 30 linhas: triar antes de adicionar.

## Jogabilidade e sensação

- **(1)** _"dos gráficos até as dinâmicas e efeitos, UX tudo ruim"_ (17/10). O que o diagnóstico achou está em
  `PLAN.md`; este item fecha quando ele disser, jogando, que não está mais amador.
- **(2)** Boss da wave 5 levou ~120 s para morrer com 6 upgrades — _"difícil, mas dá"_ (maio/2026). Alvo era 60–90 s.

## Visual

- **(3)** O menu (Three.js, bloom) é muito melhor que o jogo (Canvas 800×600 esticado, borrado). O jogo tem de parecer
  continuação do menu — é o que `docs/brand.md` e `docs/NORTE.md` já pedem.

## Interface

## Desempenho

- **(6)** Ele abriu o DevTools _"justamente porque estava lento demais"_ (17/10). O trace mostrou `gameLoop` a 377 ms.
  Em headless (17/10) o jogo fica em 16,7 ms de mediana com picos de 33–50 ms, com ou sem log de depuração — o
  travamento dele **não reproduziu** aqui. Falta medir na máquina dele: `?debugLogging=0`, DevTools fechado, e o
  painel F3 do jogo aberto por 60 s; só depois decidir o que otimizar.
