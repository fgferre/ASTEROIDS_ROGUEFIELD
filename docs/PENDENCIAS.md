# Pendências — o que está quebrado e o que falta

Lista viva do que está aberto, nas palavras do dono. Leia só a seção O BASTÃO e o item da vez; o resto, por `grep`.
Item resolvido sai da lista e vira commit; a história de cada número fica no git (`git log --all --grep="(NNN)"`).
Número é identidade, não posição: item novo entra no fim da sua seção. **Próximo número livre: 16.**

## O BASTÃO — onde a sessão parou (18/10, noite) — RODADAS 12 E 13 (PARCIAL) MESCLADAS NA `main` (PR #261); SESSÃO NA NUVEM ENCERRADA, ELE SEGUE EM CONVERSA LOCAL

**Como retomar (conversa local, qualquer máquina):**

1. `git clone https://github.com/fgferre/ASTEROIDS_ROGUEFIELD.git && cd ASTEROIDS_ROGUEFIELD && git checkout main` — a
   `main` contém tudo (PRs #247–#261). O ramo `claude/session-011CUZwFkeqHg4syYX2GsSkg` não tem nada fora da `main`.
2. Ler, nesta ordem: este BASTÃO; `PLAN.md` (só a Rodada 12 — R12.5 não iniciado — e a Rodada 13 com o goal novo dele);
   `docs/NORTE.md` (§1 ficção, §2–3 arte, §7 Norte 2); `BACKLOG.md` (27 linhas).
3. `npm ci && npm run done` (160 arquivos / 1136 testes, build). Para ver o jogo: `npm run dev` →
   `http://localhost:5500/ASTEROIDS_ROGUEFIELD/`.
4. **Antes de qualquer junção na `main`:** rodar a sonda headless de erros de runtime (o gate não pega erro de render).
   Script (Playwright/Chromium; ajustar `executablePath` à máquina):

   ```js
   import { chromium } from 'playwright-core';
   const port = process.env.PORT || 5550;
   const b = await chromium.launch({
     args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
   });
   const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
   const errs = [];
   p.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 200)));
   p.on('console', (m) => {
     if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 240));
   });
   await p.goto(
     `http://127.0.0.1:${port}/ASTEROIDS_ROGUEFIELD/?scene=hero&desktop=force&debugLogging=0`
   );
   await p.waitForSelector('#game-canvas', {
     state: 'visible',
     timeout: 180000,
   });
   await p.waitForTimeout(20000);
   console.log(
     'errors:',
     new Set(errs).size,
     [...new Set(errs)].slice(0, 8).join('\n')
   );
   await b.close();
   ```

5. Juntar na `main` sempre via pull request mesclado pela API (`gh api .../pulls` + `PUT .../merge`): o hook bloqueia
   publicar a `main` diretamente, de propósito. Ele aprovou ("eu aprovo daqui… preciso que tudo seja mergeado na main").
6. **Limpeza que ele pediu e a nuvem não pôde fazer (bloqueio de segurança):** 224 ramos remotos antigos (`codex/*`,
   `feature/*`, `stash-recuperado-*`, `backup-main-quebrado`, …), nenhum ancestral da `main`. Localmente, com ele
   confirmando a lista (`git fetch --prune && git branch -r`), apagar cada um no remoto com o push de exclusão do git
   (`--delete`), em lotes de 20. Worktrees temporários da nuvem já foram removidos.

**Regras dele que valem para sempre:** (a) agir independentemente e crescer o jogo a cada rodada; (b) toda rodada
melhora também gráficos, efeitos, câmera, jogabilidade e UX, não só conteúdo; (c) tudo em inglês no jogo; (d) números
são "proposta" nomeada no código — ele julga jogando; (e) um commit por fatia, com captura; (f) nunca `git add -f`;
(g) docs só com o que está aberto (PLAN perde rodadas fechadas; BACKLOG perde linhas feitas; PENDENCIAS é dele).

**O goal dele (18/10, noite), nas palavras dele, está na seção "Goal novo" abaixo (itens 9–14), com os itens 7, 8 e 15.**
Estado por ponto: fundo com volume → R13.1 feita (ele ainda não viu); faixa escura do Anel → item 15, nada mudado,
explicado; casco/mira → nada no código acopla (lido 18/10), R13.2 proposta em Settings; medição na máquina dele →
R13.3 proposta; áudio morto → R12.6 feita, sobras em R13.7; paridade 2D/3D → o 2D virou easter egg congelado por decisão dele (18/10, conversa local; PLAN decisão 6), sobra só o anel 3D em R13.6; replay sem modo → R13.4
proposta; pooling/director → R13.5 feita (avisos 30–100/camada → 0); arquivos grandes → R13.8 proposta (pontos de
corte mapeados no histórico desta sessão, não no repo: CombatSystem 4867, SFXBus 4595, UISystem 4516, EffectsSystem
4462 linhas). **Ele pediu para avisar quando os oito estiverem fechados para trocar o goal; sugestão de goal seguinte
já dada a ele (polimento de lançamento: primeiros 5 minutos a 60 fps, arte de próxima geração no herói e Wardens, mix
ouvido, três finais, árvore do Hangar, zero avisos, regressão visual por capturas).**

**Rodada 12 (18/10, fim de tarde) — o que entrou:** terceira arma _Scatter Coil_ (carta épica; leque de 5 flaks que
estouram em estilhaços; chip do HUD lê a arma); família _Maneuver_ (6 cartas, 41 no total; sinergia Afterburn =
rastro ardente no dash; Apex Blink = dash vira salto; cartas de arma se excluem); _Leech_ (11ª máquina, come orbes e
devolve com juros); falas de primeiro avistamento por máquina, abertura do Boss Rush e compra do Bastion (Códice
descobre ao ver); áudio limpo (aviso do propulsor 40 → 0, crossfade sem bateria velha, Heralds com voz, controlador de
intensidade morto removido, cues da flak e da Leech); bloom em Settings **e a correção de que nenhuma opção gráfica
gravada chegava ao renderer 3D** (manifesto não injetava `settings`). R12.5 (entrada cinematográfica do Warden) não
iniciou.

**Rodada 13 (parcial):** R13.1 espaço com volume (estrelas por profundidade, nebulosa em 3 planos com o distante assado
uma vez, nuvens com paralaxe; −7 % ultra / −50 % low no quadro headless); R13.5 pooling/director. Restam R13.2–R13.4,
R13.6–R13.8 no PLAN.

**Vereditos dele:** só sobre a Rodada 4 (itens 7 e 8, implementados em R5.10/R5.11) e, em 18/10 à noite, a faixa escura
(item 15). **Rodadas 5–13 sem veredito jogando.** Primeira coisa a pedir na nova conversa.

**Tudo visto só em headless sem GPU (1–4 fps); nada ouvido em browser.** `?stats=1`/F8 mostra fps/ms reais.

**Avisos de processo:** workers em paralelo só em arquivos disjuntos; `pgrep -f`/`pkill -f` matam o shell do worker;
nunca `| tail`/`| grep` antes de `&&` em comandos de teste (usar `set -o pipefail`); um worker pode "cair" sem
escrever nada (R12.5) — conferir o diff antes de dar por feito; um worker apagou `scratchpad/*.js` de outros; o
container pode reiniciar; apagar/arquivar refs remotas em massa é bloqueado na nuvem.

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
