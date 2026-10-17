# Pendências — o que está quebrado e o que falta

Lista viva do que está aberto, nas palavras do dono. Leia só a seção O BASTÃO e o item da vez; o resto, por `grep`.
Item resolvido sai da lista e vira commit; a história de cada número fica no git (`git log --all --grep="(NNN)"`).
Número é identidade, não posição: item novo entra no fim da sua seção. **Próximo número livre: 7.**

## O BASTÃO — onde a rodada parou (17/10) — DIAGNÓSTICO FEITO, JEITO DE TRABALHAR IMPORTADO, NADA VISUAL MUDOU AINDA

Palavras dele (17/10): *"revise tudo e vamos melhorar o projeto como um todo, sinto que estamos presos no passado
ainda... tudo muito amador... dos gráficos até as dinâmicas e efeitos, UX tudo ruim"*; e *"precisamos começar a
trabalhar mais inteligentemente"* — importar o jeito de trabalhar do Mar de Estrelas.

**Feito nesta rodada (ramo `claude/session-011CUZwFkeqHg4syYX2GsSkg`, não publicado — publicar é dele):**
- `AGENTS.md` e `CLAUDE.md` reescritos no molde do Mar de Estrelas; `.claude/` (settings, hook que barra push na
  `main` e `git add -f`, agentes Explore/worker) agora versionado; `BACKLOG.md` (30 linhas) no lugar do `backlog.md`.
- Portões: `npm run done` = lint + formatação + testes + build (o mesmo que o CI); `npm run gate` para o commit
  rápido; ESLint entrou (8 defeitos reais corrigidos: variável inexistente em `UISystem.renderSettingsPanel`, três
  métodos duplicados que se sobrescreviam, dois `defineProperty` em teste). CI sem Node 18 (Vite 7 pede 20.19+).
- `PLAN.md`: o diagnóstico inteiro (gráficos, UX, jogabilidade, engenharia) e a ordem de modernização proposta.

**A próxima rodada — a ordem é dele.** Sugestão (ver `PLAN.md`): 1) resolução nativa do canvas (acaba com o
borrão em qualquer tela); 2) um só sistema de design e HUD enxuta; 3) bloom real + paleta única no gameplay, para o
jogo parecer com o menu; depois passo fixo no loop e as dinâmicas. Cada etapa termina com captura antes × depois.

## Jogabilidade e sensação

- **(1)** *"dos gráficos até as dinâmicas e efeitos, UX tudo ruim"* (17/10). O que o diagnóstico achou está em
  `PLAN.md`; este item fecha quando ele disser, jogando, que não está mais amador.
- **(2)** Boss da wave 5 levou ~120 s para morrer com 6 upgrades — *"difícil, mas dá"* (maio/2026). Alvo era 60–90 s.

## Visual

- **(3)** O menu (Three.js, bloom) é muito melhor que o jogo (Canvas 800×600 esticado, borrado). O jogo tem de parecer
  continuação do menu — é o que `docs/brand.md` e `docs/visual-direction.md` já pedem.

## Interface

- **(4)** Em máquinas Windows com touch habilitado o jogo trava em 0 % na tela de carregamento (`mobileGuard`); a
  saída `?desktop=force` é escondida. Precisa estar resolvido antes de qualquer teste com outras pessoas.
- **(5)** Idioma misturado: menu e HUD em inglês, cartas de upgrade em português. Ele decide o idioma do jogo.

## Desempenho

- **(6)** Ele abriu o DevTools *"justamente porque estava lento demais"* (17/10). O trace mostrou `gameLoop` a 377 ms,
  mas o jogo roda a ~5 ms de render em headless; o suspeito é o log de depuração (um `console.log` por evento, dezenas
  por quadro) somado ao profiler. Falta medir na máquina dele com `?debugLogging=0` antes de concluir.
