# Modernização do Asteroid Roguefield — plano (17/10/2026; Rodada 0 na `main` desde 19/10, PR #280)

Tarefa que atravessa sessões. Quem pegar este arquivo lê tudo antes de mexer; marca a etapa feita aqui; o que fecha
sai daqui (a história fica no git: `git log --oneline --merges main`, PRs até #280). Decisões de produto são do dono,
por imagem e jogando — nunca por teste.

## Passagem de bastão (19/10, noite)

- **Rodada 0 na `main`** (PR #280, 19/10, com o OK dele): `npm run done` e a checagem do GitHub verdes; sonda no
  navegador (menu, configurações, partida, morte → Game Over → Retry, cena hero, `?content=`).
- **Prova da fábrica** (19/10): um ajudante, só com o `CONTENT.md`, criou um inimigo (Lancet) e uma arma (Needle Array)
  com um arquivo cada e zero linhas no motor; o ramo foi apagado a pedido dele depois de visto (a carta nova só mudava as
  ofertas de nível no trace). Recriar é um arquivo cada.
- **Para o dono conferir:** jogar uma partida no site (nada deve ter mudado); medir a horda na tela dele — abrir
  `?content=drone&count=200&quality=ultra&fire=1&desktop=force` e ler o fps no painel F8 (aqui, com a GPU do M1 em
  Chromium headless, deu 60,0).
- O erro de console `game-session` → `renderer` ao carregar já existia na `main` (19/10) e não impede a partida.
- **Se ele notar brilho mais fraco ou controle "clássico":** conferir primeiro o endereço e a qualidade. Em 19/10, no
  endereço local, as configurações salvas estavam em clássico (sem inclinação lateral, de propósito) e a qualidade
  automática caía de ultra para alto; na mesma qualidade, quatro conferências deram imagem e valores idênticos.

## Rodada 0 (19/10) — baratear o conteúdo antes de crescê-lo: feita

Dele (19/10): _"vi e aprovei, mas é pouco conteúdo… Vampire Survivors são dias de desafio"_; _"repensar a nossa
estrutura de forma inteligente para diminuir o custo de todas as melhorias feitas só por AIs"_. Princípio: **conteúdo é
dado, comportamento é biblioteca pequena, um registro liga os dois; quem adiciona conteúdo não toca no motor.**

- **Teto de 1.200 linhas** por arquivo no ESLint, sem exceções: os 17 arquivos acima dele foram divididos por assunto
  (menu, inimigos, ondas, sessão, nave, física, orbes, áudio — a tabela evento → som virou dado —, HUD, renderizador,
  mira, chefe, efeitos, configurações, interface, entrada, teste da mira) e a lista de exceções chegou a zero.
- **Prova de comportamento igual:** `tests/integration/golden-trace.test.js` (21 partidas headless de 60 s, hash por
  segundo do estado e dos eventos; duas voam a nave). Toda fatia de refatoração passou com o fixture intacto, salvo uma
  mudança de propósito: em `21de1fb` a carta de arma passou a emitir um evento só (`upgrade-weapon`), e mudaram os hashes
  de eventos de Harmonic e Scatter, não os de estado. Replays gravados na `main` tocam iguais no ramo. Limites: o trace
  não desenha nem toca som (imagem, som e fps foram conferidos à parte), guarda nomes de eventos e não os dados, e em
  outra arquitetura (CI x64) compara duas partidas atuais entre si, não com o fixture.
- **Registro** (`src/content/registry.js`): inimigos, chefes, armas, cartas, cascos, camadas, biomas — um arquivo cada.
  O motor não nomeia inimigo nem arma: tipos, pools, agenda, recompensas, afixos, efeitos, sons, Códice, falas e
  aparência vêm do arquivo. Um teste trava a regra de import dos arquivos de conteúdo.
- **Inimigo = receita** (`RecipeEnemy` + 15 comportamentos em `src/modules/enemies/behaviors/`); **arma = padrões**
  (`stream`, `beam` a cada N, `fan`) com a carta dentro do arquivo; **visual = receita** (`view` ou `visual`, com
  aparência padrão); **diretor por papéis** (camadas pedem papéis; inimigo declara `roles`, `weight`, `fromLayer`).
- **Cena de conteúdo** `?content=<id>` (`&count=`, `&fire=1`); **`CONTENT.md`** de uma página; **horda**: 200 Motes a
  60 fps no M1 em Retina e qualidade ultra (era 56 com engasgos; o custo eram as passadas de tela cheia, não os
  inimigos).

**Pronto quando** — conferido 19/10: inimigo e arma novos com um arquivo cada e zero linhas no motor (prova de 19/10, acima); os 10
inimigos e 3 armas migrados com comportamento igual (trace); nenhum arquivo acima do teto e nenhuma exceção; 200 Motes a
60 fps no M1 (medido aqui; falta ele ver na tela dele).

**O que ficou de fora, de propósito:** Wardens e Heralds continuam classes (só os dados viraram conteúdo); padrões de
arma orbital/aura/cadeia nascem quando uma arma pedir; instancing de inimigos não foi feito porque a medida não pediu.

## Próximo goal (proposto 19/10; ele decide)

Longevidade estilo Vampire Survivors sobre a fábrica: 12+ armas, 30+ inimigos, 6 biomas, árvore de desbloqueios. Cada
item novo é um brief "adicione X seguindo CONTENT.md"; números são proposta, ele joga.

## Decisões já tomadas

1. O menu em Three.js fica como está: é o alvo visual do jogo ("o jogo é continuação do menu", `docs/brand.md`).
2. Direção: `docs/NORTE.md` vale (casco fosco, neon só na informação, fundo com volume).
3. Cada etapa visual termina com captura antes × depois e com `npm run done` verde. Ele aprova pela imagem.
4. Balanceamento e sensação (XP, boss, shake, hit-stop) nunca fecham por harness: proposta com número, ele joga.
5. O 2D saiu do código (19/10); a versão original é peça de museu, gerada da tag `classic-2d`, link nos créditos.

## Fora de escopo deste plano

Steam, mobile/touch, multiplayer, narrativa, troca do framework de testes, monetização. Arquivos antigos de processo
(GSD, `.planning/`) ficam fora do repo; o histórico está no git.
