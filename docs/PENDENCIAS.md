# Pendências — o que está quebrado e o que falta

Lista viva do que está aberto, nas palavras do dono. Leia só a seção O BASTÃO e o item da vez; o resto, por `grep`.
Item resolvido sai da lista e vira commit; a história de cada número fica no git (`git log --all --grep="(NNN)"`).
Número é identidade, não posição: item novo entra no fim da sua seção. **Próximo número livre: 16.**

## O BASTÃO — onde a sessão parou (18/10, ~16h30) — RODADA 11 MESCLADA NA `main` (PR #259)

**Como retomar (nova sessão, qualquer máquina):**

1. `git clone https://github.com/fgferre/ASTEROIDS_ROGUEFIELD.git && cd ASTEROIDS_ROGUEFIELD && git checkout main` — a
   `main` contém tudo (PRs #247–#259). O ramo `claude/session-011CUZwFkeqHg4syYX2GsSkg` não tem nada fora da `main`.
2. Ler, nesta ordem: este BASTÃO; `PLAN.md` (Rodadas 2–11, cada etapa marcada); `docs/NORTE.md` (§1 ficção, §2–3 arte,
   §7 Norte 2 + a regra dos dois eixos); `BACKLOG.md` (24 linhas, conferidas em 18/10).
3. `npm ci && npm run done` (155 arquivos / 1082 testes, build). Para ver o jogo: `npm run dev` →
   `http://localhost:5500/ASTEROIDS_ROGUEFIELD/`.
4. **Antes de qualquer junção na `main`:** rodar a sonda headless de erros de runtime (20 s de cena hero, 3D) — o gate
   não pega erro de render. Script curto (Playwright): abre `?scene=hero&desktop=force&debugLogging=0`, espera
   `#game-canvas`, 20 s, conta `pageerror` e `console.error`; deve imprimir `errors: 0`.
5. Juntar na `main` sempre via pull request mesclado pela API (`gh api .../pulls` + `PUT .../merge`): o hook bloqueia
   `git push origin main` de propósito. Ele aprovou ("eu aprovo daqui… preciso que tudo seja mergeado na main").

**Regras dele que valem para sempre:** (a) agir independentemente e crescer o jogo a cada rodada; (b) toda rodada
melhora também gráficos, efeitos, câmera, jogabilidade e UX, não só conteúdo; (c) tudo em inglês no jogo; (d) números
são "proposta" nomeada no código — ele julga jogando; (e) um commit por fatia, com captura; (f) nunca `git add -f`.

**Vereditos dele até agora (jogando a Rodada 4):** item (7) fundo como textura e sombra no "chão" → espaço procedural
com sombras só entre objetos (R5.10); item (8) nave virava para a mira → casco segue o movimento, arma é torreta
(R5.11). **Ele ainda não deu veredito sobre as Rodadas 5–11.** É a primeira coisa a pedir na nova sessão.

**Rodada 11 (18/10, tarde) — o que entrou:** duas máquinas novas (_Caster_, artilharia que marca a zona de impacto;
_Shade_, que some em dissolve e reaparece no flanco), terceiro casco _Bastion_ no Hangar (pesado, blindado, 520
Salvage), modo **Boss Rush** no menu (os três Wardens em sequência, respiro de 8 s e uma carta entre eles, recorde e
Salvage próprios, destrava ao vencer o Prime), quatro conquistas; qualidade: dash e freio com som e pulso de câmera,
som próprio por máquina (Ram, Husk, Weaver, Bulwark, Caster, Shade), telas finais esperam a última fala e o recap a
guarda como citação, enquadramento de chefe considera o raio do Warden, volume mestre aplicado uma vez (no padrão
0,7 sai ~3 dB mais alto que antes), radar mostra Shade em fase apagado, revisão independente do diff com 7 achados
corrigidos ou anotados. Tudo visto só em headless sem GPU; **nada ouvido em browser**.

**O que o jogo tem hoje (11 rodadas):** gameplay em Three.js com pipeline sRGB/ACES, espaço procedural, sombras reais,
texturas assadas, nave em uma malha, rochas instanciadas, máquinas fundidas, batches de rim/emissivos, presets de
qualidade automáticos, interpolação de render, warm-up de shaders, câmera 2.0, cinema de intro/epílogo; 10 tipos de
inimigo + afixos de Elite, 3 Heralds, 3 Wardens, 15 camadas em 3 biomas com surtos, eventos e modificadores no
infinito, Boss Rush; torreta + twin-stick (gamepad), dash, freio, 3 cascos, 34 cartas com raridade/reroll/banish,
evoluções e Apex, pickups, Hangar, Códice com lore, 18 conquistas, dificuldade/seed/Daily; áudio procedural com
limitador, reverb, distância, temas por bioma, percussão, vozes dos Wardens e Heralds, cues por máquina; HUD
direcional, acessibilidade. `?stats=1` mostra fps/ms reais; `graphics.quality` em Settings.

**Próxima rodada:** o que ele disser jogando (Rodadas 5–11). Sem veredito: `BACKLOG.md` — candidatos: balance do Boss
Rush (nível 1 + ~1 carta por Warden), replays gravarem o modo, friso âmbar do Bastion no preview, Caster com granadas
que sobrevivem à morte dele, cue de áudio do Heat/Dust Herald, crossfade de tema.

**Avisos de processo:** workers em paralelo só em arquivos disjuntos; `pgrep -f`/`pkill -f` matam o próprio shell do
worker; nunca `| tail`/`| grep` antes de `&&` em comandos de teste (mascarou uma falha nesta rodada — usar
`set -o pipefail`); um worker apagou `scratchpad/*.js` de outros — scripts compartilhados em `.mjs`; o container pode
reiniciar (trabalho em disco sobrevive); desligar temporizadores antigos; pedir ao worker que encerre após ~60 min.

## Visual (itens 7 e 3; o 7 nas palavras dele, 18/10, jogando a Rodada 4)

- **(7)** _"Tá ficando muito interessante, mas tá um pouco estranho o background ser essas estrelas como se fosse uma
  textura. Achei que tinha que ser algo mais procedural ali. Além disso, é estranho fazer sombra em cima dessa
  textura. É espaço, é o espaço atrás."_ → Rodada 5, R5.10: fundo procedural (estrelas em pontos 3D com paralaxe
  real, nebulosa em shader) e fim das sombras projetadas no "chão". Depois: _"A sombra faz sentido nas coisas que são 3D, né? Se tem uma fonte de luz iluminando, tudo que emite luz fazer
  sombra é interessante também, mas ter uma sombra refletida embaixo no chão, nas estrelas, como se fosse um chão, é
  estranho."_ → sombras só entre objetos 3D (shadow map da luz-chave; nave e rochas sombreando rochas), nenhuma num
  plano de fundo. **Relistado por ele como aberto no goal novo (18/10, fim de tarde; sem confirmação jogando a R5.10):** _"fundo espacial que ainda lê como textura
  (mais volume procedural, sombras só entre objetos 3D)"_ → ainda aberto; Rodada 13.
- **(3)** O menu (Three.js, bloom) é muito melhor que o jogo (Canvas 800×600 esticado, borrado). O jogo tem de parecer
  continuação do menu — é o que `docs/brand.md` e `docs/NORTE.md` já pedem.

## Jogabilidade e sensação

- **(1)** _"dos gráficos até as dinâmicas e efeitos, UX tudo ruim"_ (17/10). O que o diagnóstico achou está em
  `PLAN.md`; este item fecha quando ele disser, jogando, que não está mais amador.
- **(2)** Boss da wave 5 levou ~120 s para morrer com 6 upgrades — _"difícil, mas dá"_ (maio/2026). Alvo era 60–90 s.

## Controles (palavras dele, 18/10)

- **(8)** _"A nave está sempre virando de forma automática para onde a mira está atirando. No jogo original a gente
  pilotava a nave independente de onde o tiro ia, como se o tiro saísse de um canhão móvel em volta da nave. O
  movimento fica muito estranho usando o WASD, porque ela vai em direção para onde está atirando."_ → Rodada 5,
  R5.11: casco aponta para onde se move (WASD relativo à tela), arma vira torreta que gira sozinha para o alvo.
  **Relistado por ele como aberto no goal novo (18/10, fim de tarde; sem confirmação jogando a R5.11):** _"controle do casco ainda acoplado demais à mira (torreta
  independente)"_ → Rodada 13: no código nada liga casco à mira (lido 18/10); o esquema clássico (A/D gira, W empurra) só existe por `?controls=classic` e nele a torreta trava no nariz — oferecer em Settings "casco Moderno/Clássico" com torreta automática nos dois.

## Goal novo (palavras dele, 18/10, fim de tarde)

_"iterar continuamente no Asteroid Roguefield existente, usando a essência de Asteroids + Vampire Survivors apenas como
inspiração e direção, e priorizar os pontos concretos ainda abertos: fundo espacial que ainda lê como textura (mais
volume procedural, sombras só entre objetos 3D), controle do casco ainda acoplado demais à mira (torreta independente),
medição real de desempenho na máquina do dono, caminhos de áudio mortos, oddities visuais e de paridade 2D/3D, replay
que não grava o modo, edge cases de pooling/director e arquivos ainda muito grandes. A cada rodada, melhorar também
qualidade gráfica, efeitos, câmera, jogabilidade e UX, buscando o polimento de um título AAA de próxima geração no
browser, sem se limitar às referências."_

- **(9)** medição real de desempenho na máquina dele (ver item 6) — o jogo precisa facilitar: relatório de fps/ms
  copiável a partir do `?stats=1`/F8.
- **(10)** caminhos de áudio mortos.
- **(11)** oddities visuais e de paridade 2D/3D (anel chapado sob o domo do escudo, nave 2D borrada, zoom do dash só no
  3D, Wardens 2D com o visual do Prime…).
- **(12)** replay que não grava o modo (Boss Rush/Daily tocam como run normal).
- **(13)** edge cases de pooling/director (velocidade velha em inimigos reaproveitados, Heralds/Wardens sem pool, seed
  do director inconsistente, avisos de "accounting discrepancy").
- **(14)** arquivos ainda muito grandes (UISystem, CombatSystem, PlayerSystem, Renderer3D, SFXBus).

- **(15)** _"Eu olhando bem no fundo aqui, eu percebo uma faixa mais escura no fundo, como se fosse um ribbon, um
  stripe, que eu não entendo do que se trata. Parece um defeito."_ / _"Ao invés de só tirar, me explica qual era a
  intenção. Talvez seja algo importante para a história."_ (18/10, noite). É o **Anel partido** (`fieldBackdrop.js`,
  NORTE §1–2): o campo de jogo é o campo de destroços de uma megaestrutura em anel; a faixa é um pedaço dela, longe
  abaixo, em silhueta contra a nebulosa, para dar escala e lugar — e no epílogo da vitória ela acende em violeta
  (`setWake`), o Anel voltando à vida quando os Wardens caem. A intenção é importante; a execução não lê: banda
  chapada, sem luz, sem espessura. Nada foi mudado em 18/10 (ele não aprovou o paliativo de opacidade). Próxima
  sessão: modelar o Anel como estrutura iluminada (espessura, segmentos, borda pela luz-chave, névoa de distância),
  mantendo o acender do epílogo.

## Desempenho

- **(6)** Ele abriu o DevTools _"justamente porque estava lento demais"_ (17/10). O trace mostrou `gameLoop` a 377 ms.
  Em headless (17/10) o jogo fica em 16,7 ms de mediana com picos de 33–50 ms, com ou sem log de depuração — o
  travamento dele **não reproduziu** aqui. Falta medir na máquina dele: `?debugLogging=0`, DevTools fechado, e o
  painel F3 do jogo aberto por 60 s; só depois decidir o que otimizar.
