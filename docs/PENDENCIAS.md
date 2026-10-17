# Pendências — o que está quebrado e o que falta

Lista viva do que está aberto, nas palavras do dono. Leia só a seção O BASTÃO e o item da vez; o resto, por `grep`.
Item resolvido sai da lista e vira commit; a história de cada número fica no git (`git log --all --grep="(NNN)"`).
Número é identidade, não posição: item novo entra no fim da sua seção. **Próximo número livre: 7.**

## O BASTÃO — onde a rodada parou (17/10, ~23h) — SESSÃO ENCERRADA POR CONTEXTO CHEIO; TUDO NO RAMO, NADA PUBLICADO

**Como retomar (próxima sessão):** `git fetch && git checkout claude/session-011CUZwFkeqHg4syYX2GsSkg`; ler este
BASTÃO, `PLAN.md` e `docs/NORTE.md` (§4b é o salto); rodar `npm ci && npm run done`. Primeiro ato: `git status` —
se houver arquivos modificados em `src/modules/render3d/`, são da **segunda fatia do renderer 3D** que um worker
estava fazendo quando a sessão acabou (nave legível, overlays 2D portados para 3D, materiais foscos, câmera presa ao
campo, settings gráficos no renderer). Revisar o diff, rodar o portão e commitar ou descartar; não assumir que está
completo. Se a árvore estiver limpa, essa fatia nunca chegou: refazer pelo brief resumido na linha "Renderer 3D
(17/10), primeira fatia" do `BACKLOG.md`.

**Palavras dele nesta rodada:** _"falta um salto enorme… câmera dinâmica rolando, zoom, movimento lateral da nave,
quase um 3D visto de cima"_; antes: _"reimaginar tudo, segue em frente"_, _"tudo em inglês"_.

**O que está no ramo (publicar é dele; `main` não foi tocada):**

- Jeito de trabalhar (AGENTS/CLAUDE/.claude, `npm run done`, hook de git), lint zero, tudo em inglês.
- Resolução nativa, design system único, telas com conteúdo e transições, HUD enxuta, kill feed, banner de camada,
  intro do Warden, combo por tier, vinheta de HP baixo.
- Arte nova por NORTE (fundo, fragmentos com rachaduras que acendem, Wardens, nave, lanças, fagulhas, bloom),
  câmera com follow, impacto (shake, hit-stop, flash, slow-mo), telegraphs do Warden (e o bug que os deixava mortos).
- **O salto:** gameplay em Three.js (`src/modules/render3d/`, `?renderer=2d` volta ao Canvas), câmera perspectiva
  com follow/zoom/dolly, controles modernos (A/D strafe, nariz segue a mira; `?controls=classic`), dash em Shift,
  famílias de upgrade com sinergia "3 iguais", catálogo 9 → 20, vitória no Warden 15.
- Engenharia: passo fixo, sem `Math.random` solto, um modo dev, flags de legado fora, dependências falham cedo,
  relógio de simulação, gravação e replay (`?replay=`, F9), testes de cenário jogável (~615 testes).

**Tudo acima foi visto só em headless sem GPU (2–4 fps).** Ele ainda não jogou nada disto na máquina dele.

**O que só ele pode responder, jogando:** fluidez e aparência do 3D na placa dele (`?renderer=2d` como comparação;
`?bloom=0`/`?bloom=1.5`; `?renderScale=1`); se o salto é o que ele imaginava ou se precisa ir além (inclinação da
câmera, tamanho da nave, campo maior); controles modernos × `?controls=classic`; os números de densidade, dash,
shake e sinergia (todos marcados "proposta 17/10" no código); meta-progressão entre runs (em aberto).

**Decisões que a sessão tomou por ele, sob o mandato, e ele pode reverter:** renderer 3D como padrão; A/D strafe;
dash em Shift com escudo só em E; as cinco famílias (Thermal, Kinetic, Arc, Field, Salvage) e seus bônus; fim de
run no 15; "wave" → "layer" na interface; nomes Warden Prime / Mote / Seeker / Tether.

**Fora do que a sessão podia fazer sozinha:** dividir os arquivos gigantes (AGENTS.md exige pedido explícito);
meta-progressão (decisão de produto); medir desempenho real.

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
