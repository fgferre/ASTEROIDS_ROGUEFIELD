# Pendências — o que está quebrado e o que falta

Lista viva do que está aberto, nas palavras do dono. Leia só a seção O BASTÃO e o item da vez; o resto, por `grep`.
Item resolvido sai da lista e vira commit; a história de cada número fica no git (`git log --all --grep="(NNN)"`).
Número é identidade, não posição: item novo entra no fim da sua seção. **Próximo número livre: 7.**

## O BASTÃO — onde a rodada parou (17/10, noite) — ETAPAS 1–5, 7 E 8 FEITAS; FALTA SÓ A 6 (DECISÕES DELE); NÃO PUBLICADAS

Palavras dele (17/10): _"transformar isso num jogo maravilhoso para as próximas gerações de videogame"_; _"como se
fosse uma versão nova para uma plataforma nova... com as melhores placas de vídeo"_; _"tudo em inglês"_.

**No ramo `claude/session-011CUZwFkeqHg4syYX2GsSkg`, pronto para ele olhar (publicar é dele):**

- Etapa 1 — resolução nativa (teto 2× DPR), sprites nítidos; `?renderScale=1` volta ao antigo para comparar.
- Etapa 2 — um só design system, telas com fade, HUD enxuta, level-up com o jogo atrás, game over com números,
  controles visíveis, Quit com confirmação, `mobileGuard` que não trava Windows.
- Etapa 4 — loop de passo fixo a 60 Hz.
- Arte nova por `docs/NORTE.md` (o roteiro do Anel partido, pedra fosca e luz só onde há energia): fundo, fragmentos
  com rachaduras que acendem, Wardens, nave Interceptor, lanças, fagulhas, bloom, câmera 1.3× com follow,
  escudo hexagonal, explosões e clarões na paleta.
- Etapa 5 — impacto e legibilidade: telegraphs do Warden (vivos de verdade agora), shake, hit-stop, flash de dano,
  slow-mo, banner de camada, intro do Warden, kill feed, combo por tier, vinheta de HP baixo.
- Etapas 7 e 8 — engenharia: sem Math.random solto, um só modo dev, flags de legado fora, dependências falham cedo,
  relógio de simulação, gravação e replay de runs (F9 baixa; `?replay=`), testes de cenário jogável.
- Jogo todo em inglês.

**O que ele precisa fazer na máquina dele:** jogar uma run inteira e dizer, por tela, o que ainda parece amador;
comparar fluidez com e sem `?renderScale=1`; conferir se a 144 Hz o movimento repete quadros.

**Propostas de números em jogo (17/10), para ele julgar jogando e eu travar ou reverter:** asteroides por camada
6 × 1,26^(n−1) com teto 40 (era 4 × 1,3^(n−1), teto 35); fagulhas de XP ao coletar duram 1,5×; brasas de explosão
1,3×; 28 lascas e 6 motes âmbar de vida ambiente; 14 fragmentos distantes no fundo. `?scene=hero` monta a cena da
prancha com entidades reais; `?bloom=1.5`, `?camera=0` e `?renderScale=1` são as comparações.

**Decisões dele que destravam as próximas etapas (ver `PLAN.md`):**

- Arte: ele pediu para reimaginar tudo e eu decidi (NORTE.md). Ele julga jogando: o que ainda parece fraco?
- Câmera 1.3× com follow já está no jogo (`?camera=0` desliga): aprovar ou reprovar jogando.
- Etapa 6: dash e sua tecla; regra de sinergia por tag (ou retirar a promessa); fim de run e meta-progressão.

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
