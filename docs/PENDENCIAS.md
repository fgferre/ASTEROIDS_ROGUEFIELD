# Pendências — o que está quebrado e o que falta

Lista viva do que está aberto, nas palavras do dono. Leia só a seção O BASTÃO e o item da vez; o resto, por `grep`.
Item resolvido sai da lista e vira commit; a história de cada número fica no git (`git log --all --grep="(NNN)"`).
Número é identidade, não posição: item novo entra no fim da sua seção. **Próximo número livre: 8.**

## O BASTÃO — onde a rodada parou (18/10, ~04h00) — RODADAS 2, 3 E 4 COMPLETAS E MESCLADAS NA `main` (publicado)

**Como retomar (qualquer máquina):** `git clone https://github.com/fgferre/ASTEROIDS_ROGUEFIELD.git`, `git checkout main`
(contém tudo: PRs #247, #248, #249 e o quarto, mesclados a pedido dele: _"eu aprovo daqui… preciso que tudo seja mergeado"_).
Ler este BASTÃO, `PLAN.md` (Rodadas 2–4) e `docs/NORTE.md` (§7 = Norte 2); `npm ci && npm run done` (773 testes).

**Palavras dele:** _"crie um goal novo baseado nos seus achados e aja independentemente… aumentando o conteúdo do
jogo a cada rodada"_. O Norte 2 (NORTE §7) é o goal escrito pela sessão; a Rodada 4 do PLAN é a execução.

**O que entrou desde o bastão anterior:** texturas procedurais assadas (normal/roughness/AO em rocha, casco,
placas do Warden); recap de morte ("Killed by…", build, melhor camada), Códice entre runs, pausa com build;
onboarding em jogo na primeira run; temas musicais por bioma + tema de Warden + stingers; Wardens Choir/Null também
no renderer 2D; modo infinito após o 15 ("Continue into the deep field", recorde local); Hangar (Salvage → seis
melhorias permanentes, casco Solar Slicer) como **proposta reversível num commit**; dissolve de morte em 3D;
HUD com arma/evoluções/buffs; nomes unificados (Mote/Seeker/Tether); cues de áudio para tudo que é novo.

**Norte 2 tem uma primeira versão de todos os oito pilares.** R4.9 fechou por último: interpolação de render pelo alpha do passo fixo (`?interp=0` desliga) e preset de qualidade automático por tempo de quadro medido (`graphics.quality` em Settings, `?quality=` para A/B). Próxima rodada = o que ele disser jogando; sem veredito dele, candidatos: `BACKLOG.md` (30 linhas, triado), 2D parity residual, e a divisão dos arquivos gigantes (só com pedido explícito).

**Tudo visto só em headless sem GPU (2–4 fps).** Ele ainda não jogou nada disto. `?stats=1` mostra fps/ms reais.

**O que só ele pode responder, jogando:** desempenho do 3D com texturas e dissolve na placa dele; legibilidade;
ritmo das 15 camadas, surtos e Wardens; se biomas, transmissões e temas dão lugar e história; cartas
(raridade/reroll/banish); segunda arma e evoluções; se o Hangar agrada ou se prefere roguelite puro (um commit
remove); se o modo infinito vale; todas as "propostas" nomeadas no código.

**Avisos de processo (18/10):** workers em paralelo no mesmo arquivo (`UISystem.js`) exigiram separar hunks na hora
do commit — preferir fatias com arquivos disjuntos; `pgrep -f` mata o próprio shell do worker (usar PID da porta);
`BACKLOG.md` está no limite de 30 linhas — triar antes de adicionar.

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

## Interface

## Desempenho

- **(6)** Ele abriu o DevTools _"justamente porque estava lento demais"_ (17/10). O trace mostrou `gameLoop` a 377 ms.
  Em headless (17/10) o jogo fica em 16,7 ms de mediana com picos de 33–50 ms, com ou sem log de depuração — o
  travamento dele **não reproduziu** aqui. Falta medir na máquina dele: `?debugLogging=0`, DevTools fechado, e o
  painel F3 do jogo aberto por 60 s; só depois decidir o que otimizar.
