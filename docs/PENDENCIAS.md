# Pendências — o que está quebrado e o que falta

Lista viva do que está aberto, nas palavras do dono. Leia só a seção O BASTÃO e o item da vez; o resto, por `grep`.
Item resolvido sai da lista e vira commit; a história de cada número fica no git (`git log --all --grep="(NNN)"`).
Número é identidade, não posição: item novo entra no fim da sua seção. **Próximo número livre: 7.**

## O BASTÃO — onde a rodada parou (18/10, ~00h40) — RODADA 2 FECHADA NO RAMO; NADA PUBLICADO

**Como retomar (próxima sessão):** `git fetch && git checkout claude/session-011CUZwFkeqHg4syYX2GsSkg`; ler este
BASTÃO, `PLAN.md` (seção "Rodada 2") e `docs/NORTE.md` (§4 arco novo, §4b o salto); rodar `npm ci && npm run done`
(passou: 648 testes, build ok). `git status` deve estar limpo.

**Palavras dele nesta rodada (`/goal`):** _"medley de um Asteroids com Vampire Survivors… muitos inimigos diferentes
e fases. Motor gráfico de top de linha… SFX e VFX de grandes estúdios, mas tudo num browser."_

**O que a Rodada 2 colocou no ramo (sete fatias, um commit cada; publicar é dele; `main` não foi tocada):**

- **Profundidade e luz no 3D:** pipeline de cor sRGB + ACES (antes saía linear, por isso chapado), chão de poeira
  que a luz da nave varre, sombras suaves sob rochas/inimigos/nave, luzes que piscam nas explosões.
- **Roster:** Husk (parte-se em Motes), Ram (investida telegrafada), Weaver (semeia Tethers), Bulwark (escudo
  frontal) + modificador **Elite** (vida ×2,5, tamanho ×1,3, recompensa ×3, dourado). Look 2D e 3D próprios.
  Dano de contato passou a ler o valor de cada tipo (era 12 fixo para tudo menos o Warden).
- **Diretor de camadas:** `src/data/layers.js` é a única tabela das 15 camadas (rochas, roster com cadência,
  chance de elite, Wardens em 5/10/15, **surtos** com faixa vermelha "SURGE"). WaveManager perdeu 400 linhas.
- **VFX 3D:** estilhaços de rocha girando, lens-kick (aberração + blur radial) em dano/fase do boss/dash/explosão
  grande, cone de faíscas no impacto, flash no nariz a cada tiro.
- **SFX:** limitador no master, reverb procedural, pan por posição, explosões em três tamanhos, música que sobe
  com camada/densidade/casco baixo (antes só acordava no boss), cues para surto, Elite, telegraph do Ram, pickups.
- **Pickups à la VS:** Ímã, Pulso, Sobrecarga caem de Elites (35 %) e Wardens; feed anuncia.

**Tudo visto só em headless sem GPU (2–4 fps); ele ainda não jogou nada da Rodada 1 nem da 2 na máquina dele.**

**O que só ele pode responder, jogando:** se o 3D agora "parece 3D" (chão, sombras, profundidade) e roda liso
(`?renderer=2d` compara; `?bloom=0/1.5`; `?renderScale=1`); se os quatro inimigos novos são legíveis e divertidos;
se o arco de 15 camadas com surtos tem o ritmo de VS ou está lento/duro (números em `src/data/layers.js`); se a
música acompanhando a run agrada (limiares em `GameConstants.js`); se os pickups viram momentos; o lens-kick e os
estilhaços (fosco de propósito) são visíveis o bastante.

**Decisões da sessão sob o mandato, reversíveis:** arco revisto do NORTE §4 (Motes na 4, Husks 6–7, Rams 8–9,
Seekers/Bulwarks 11–12, tudo + Weavers 13–14); Wardens não trazem mais o grupo de apoio antigo; ACES como tone
mapping; chão de poeira 140 unidades abaixo do plano; pickups só de Elites/Wardens.

**Fora do que a sessão podia fazer sozinha:** dividir os arquivos gigantes (pedido explícito); meta-progressão;
medir desempenho real; ouvir o áudio.

**Aviso de processo (18/10):** um worker rodou `git stash`/`stash pop` na árvore compartilhada no meio de outros
workers; restaurou limpo, mas o risco existe — se repetir, bloquear `git stash` no hook.

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
