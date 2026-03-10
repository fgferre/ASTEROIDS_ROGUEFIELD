**Arquivo recomendado para salvar:** docs/auditorias-racionalizacao/racionalizacao-codigo-consenso-codex-opus-2026-03-10.md

# Auditoria de Racionalização de Código — Consenso Codex + Claude Opus

**Repositório:** ASTEROIDS_ROGUEFIELD  
**Data:** 2026-03-10  
**Escopo:** código morto, duplicação, inconsistências, tooling ruidoso, debug residual e simplificação arquitetural segura.

## Resumo executivo

O repositório está em bom estado para um projeto editado por múltiplas IAs, mas ainda carrega três fontes principais de custo cognitivo:

1. tooling de auditoria e validação que hoje mistura sinal real com ruído;
2. debug, métricas e globais de observabilidade espalhados no caminho de produção;
3. monólitos grandes sustentados por contratos legados, abstrações fantasmas e catálogos duplicados.

O maior retorno imediato não está em refatoração profunda, e sim em limpar o entorno: fazer o tooling voltar a ser confiável, remover debug always-on, colapsar configurações falsas e reduzir duplicação de manutenção.

## Achados prioritários

### 1. Tooling de saúde do repositório perdeu confiabilidade

- [scripts/analyze-dependencies.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/scripts/analyze-dependencies.js) usa regex simplista: lê imports em comentários e ignora `<script>` de [src/index.html](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/index.html). Hoje isso gera ciclo falso em `EnemyUpdateSystem` e “órfãos” falsos em `src/public/libs`.
- [scripts/validate-test-optimizations.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/scripts/validate-test-optimizations.js) existe e é exposto em `package.json`, mas sua saída atual é heurística demais para ser tratada como regra dura; ele sinaliza paralelização, `beforeAll` e outros padrões sem validar contexto.
- Há scripts versionados sem integração oficial clara com `package.json`, CI ou docs vivas:
  - [scripts/validate-object-pooling.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/scripts/validate-object-pooling.js)
  - [scripts/validate-performance.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/scripts/validate-performance.js)
  - [scripts/benchmarks/batch-rendering-benchmark.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/scripts/benchmarks/batch-rendering-benchmark.js)
  - [scripts/benchmarks/collision-stress.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/scripts/benchmarks/collision-stress.js)
  - [scripts/benchmarks/performance-baseline.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/scripts/benchmarks/performance-baseline.js)

**Impacto:** futuras IAs podem gastar tempo corrigindo problemas falsos ou ignorar ferramentas potencialmente úteis porque elas não inspiram confiança.

### 2. Há debug e observabilidade residuais no runtime de produção

- [src/index.html](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/index.html) carrega `Stats.min.js` incondicionalmente, injeta painel FPS no DOM e [src/modules/MenuBackgroundSystem.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/MenuBackgroundSystem.js) consome `window.stats` no loop de render.
- O mesmo HTML sempre carrega `gsap.min.js`, mas não há uso real de `gsap` no código atual.
- [src/app.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/app.js) ainda concentra `logServiceRegistrationFlow()`, banner de debug, comandos globais (`downloadDebugLog`, `showDebugLog`, `clearDebugLog`) e um `console.log` incondicional no bootstrap.
- O projeto mantém duas estratégias de observabilidade em paralelo:
  - centralizada: [src/core/debugLogging.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/core/debugLogging.js) + [src/utils/dev/GameDebugLogger.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/utils/dev/GameDebugLogger.js)
  - dispersa: `console.*` direto em dezenas de pontos do runtime
- Também existem globals de debug espalhados entre `app`, `GamePools`, `ObjectPool`, `SpatialHash` e `AudioSystem`.

**Impacto:** o entrypoint ficou poluído por instrumentação histórica e parte do comportamento de debug já vaza para a execução normal.

### 3. `app.js` ainda carrega duplicação de estado e lógica de transição

- No `gameLoop()`, [src/app.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/app.js) sincroniza `gameState` a partir de `GameSessionService` e, logo depois, relê `session.getScreen()` e `session.isPaused()` em um segundo bloco quase idêntico.
- Isso adiciona branching e `try/catch` redundantes no hot path e reforça a sensação de migração incompleta entre o estado local do app e [src/services/GameSessionService.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/services/GameSessionService.js).

**Impacto:** mais superfície para bugs sutis no entrypoint e mais custo de leitura em um arquivo que já acumula bootstrap, cache, observabilidade e loop principal.

### 4. O sistema de HUD e settings mantém abstrações que já não são reais

- [src/data/ui/hudLayout.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/data/ui/hudLayout.js) só conhece `aaa_tactical`, mas ainda exporta API de múltiplos layouts (`HUD_LAYOUT_OPTIONS`, `HUD_LAYOUT_OPTION_LABELS`, `getHudLayoutItems()`).
- [src/modules/UISystem.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/UISystem.js) força esse layout na inicialização.
- [src/data/settingsSchema.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/data/settingsSchema.js) ainda importa `DEFAULT_HUD_LAYOUT_ID` sem expor `video.hudLayout`, enquanto [src/modules/SettingsSystem.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/SettingsSystem.js) ainda deriva esse valor internamente.
- O mesmo `settingsSchema` hardcodeia IDs e labels de hulls (`default-hull`, `solar-slicer`) que já existem como fonte canônica em [src/data/shipModels.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/data/shipModels.js).

**Impacto:** há catálogo e flexibilidade duplicados onde o produto já se comporta como single-layout e single-source.

### 5. Existem “fontes canônicas” que já não batem com a prática do runtime

- [src/data/enemies/schema.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/data/enemies/schema.js) se apresenta como “single source of truth”, mas `validateEnemyConfig()` não é usada e o arquivo funciona, na prática, como documentação/typedef.
- [src/README.md](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/README.md) ainda menciona `/legacy`, que não existe.
- [src/data/ui/hudLayout.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/data/ui/hudLayout.js) referencia `layoutmockupstudy.html`, que não existe.
- [docs/plans/enemy-expansion-overview.md](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/docs/plans/enemy-expansion-overview.md) ainda descreve uma arquitetura de HUD com múltiplos layouts já inexistente no código vivo.

### 6. Feature flags “legacy” não são mero lixo, mas continuam caras

- Flags de [src/data/constants/gameplay.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/data/constants/gameplay.js) têm valores fixos há bastante tempo, mas ainda sustentam muitos branches em arquivos grandes.
- Ao mesmo tempo, [src/modules/enemies/systems/EnemyUpdateSystem.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/enemies/systems/EnemyUpdateSystem.js) implementa override via `globalThis`, e a suíte usa isso deliberadamente via [tests/__helpers__/setup.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/tests/__helpers__/setup.js).
- Há ainda duplicação de cobertura entre:
  - [tests/balance/asteroid-metrics/feature-flags.test.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/tests/balance/asteroid-metrics/feature-flags.test.js)
  - [tests/integration/wavemanager/feature-flags.test.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/tests/integration/wavemanager/feature-flags.test.js)

**Leitura correta:** isso é contrato legado com override ativo, não simples código morto.  
**Consequência:** remover esses caminhos exige decisão explícita de arquitetura/produto e atualização coordenada de testes e mecanismo de override.

### 7. Os grandes monólitos seguem sendo o principal risco de manutenção

Arquivos mais longos do código vivo:

| Arquivo | Linhas atuais | Observação |
|---|---:|---|
| [src/modules/AudioSystem.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/AudioSystem.js) | 4235 | mistura loops de thruster, música, file tracks, preload, perf e integração |
| [src/modules/EffectsSystem.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/EffectsSystem.js) | 3894 | partículas, explosões, shockwaves, screen shake e utilidades inline |
| [src/modules/MenuBackgroundSystem.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/MenuBackgroundSystem.js) | 3838 | render 3D, física, câmera, pós-processamento e assets de menu |
| [src/modules/EnemySystem.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/EnemySystem.js) | 3487 | fachada que ainda acumula muito estado e integração |
| [src/modules/enemies/managers/WaveManager.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/enemies/managers/WaveManager.js) | 2669 | progressão de waves, boss e compatibilidade |

Ponto específico de alto valor:
- [src/modules/EffectsSystem.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/EffectsSystem.js) ainda declara `SpaceParticle`, `HitMarker` e `DamageText` inline no topo do módulo.

**Impacto:** qualquer mudança local nesses sistemas continua exigindo leitura de milhares de linhas, o que aumenta custo de contexto e risco de regressão.

### 8. Ainda há material de estudo, scaffolds e resíduos de workspace na árvore viva

- Assets de estudo e mockup seguem fora do archive:
  - [assets/starfield_tela_abertura_estudo/nasa-starfield.html](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/assets/starfield_tela_abertura_estudo/nasa-starfield.html)
  - [assets/procedural/asteroid_generator_study.html](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/assets/procedural/asteroid_generator_study.html)
  - [assets/procedural/Criando Asteroides Procedurais Realistas em WebGL2.pdf](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/assets/procedural/Criando%20Asteroides%20Procedurais%20Realistas%20em%20WebGL2.pdf)
  - [assets/ui/HUD_layout_mockup.html](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/assets/ui/HUD_layout_mockup.html)
  - [assets/ui/minimal-tactical-hud.svg](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/assets/ui/minimal-tactical-hud.svg)
- Há diretórios vazios e resíduos periféricos:
  - `src/styles/`
  - `src/modules/graphics/`
  - `exported-assets/`
  - [assets/.gitkeep](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/assets/.gitkeep)
  - `src/__tests__/` como scaffold local vazio não versionado
  - [.idx/dev.nix](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/.idx/dev.nix) como config legada de IDE/cloud

## Próximos passos práticos e seguros

1. **Consertar o tooling antes de usá-lo como verdade.**
   - corrigir ou limitar `analyze-dependencies.js`;
   - rebaixar `validate-test-optimizations.js` a checklist heurístico até que ele fique mais preciso;
   - revisar scripts auxiliares sem integração oficial e arquivar o que não fizer mais parte da superfície do projeto.

2. **Secar debug e observabilidade no caminho de produção.**
   - remover `gsap.min.js`;
   - condicionar `Stats.min.js` e o painel FPS a dev mode;
   - remover `logServiceRegistrationFlow()` e o banner/boilerplate de debug do entrypoint;
   - consolidar ou simplificar a estratégia de logging para não manter dois sistemas concorrentes.

3. **Simplificar `app.js` antes de qualquer nova feature transversal.**
   - colapsar a duplicação de sincronização/leitura de estado no `gameLoop()`;
   - reduzir responsabilidades do entrypoint a bootstrap e orquestração.

4. **Eliminar abstrações fantasmas de HUD/settings e catálogos duplicados.**
   - simplificar `hudLayout.js` para o contrato real;
   - remover exports sem consumidores;
   - eliminar o caminho residual de `video.hudLayout`;
   - derivar opções de hull do catálogo canônico em `shipModels.js`.

5. **Tratar canônicos falsos e documentação vencida como dívida real.**
   - integrar `schema.js` ao runtime de validação ou rebaixá-lo explicitamente para documentação/tipos;
   - corrigir referências quebradas em `src/README.md`, `hudLayout.js` e docs vivas.

6. **Reduzir ruído de manutenção antes de decompor os monólitos.**
   - consolidar as suítes duplicadas de feature flags;
   - arquivar material de estudo/mockup que não precisa ficar na árvore viva;
   - começar extrações seguras de baixo risco como `ThrusterLoopManager` e as entidades inline de `EffectsSystem`.

## Como executar este documento

Este relatório **não deve ser executado como um backlog linear único**. Ele está pronto para virar plano, mas precisa ser quebrado em frentes independentes com gates explícitos. A próxima IA deve tratar este documento como **diagnóstico + priorização**, não como sequência automática de commits.

### Ordem recomendada de planejamento

1. **Frente A — Confiabilidade do tooling**
   - Escopo:
     - `analyze-dependencies.js`
     - `validate-test-optimizations.js`
     - scripts sem integração oficial
   - Critério de aceite:
     - o tooling deixa de emitir falsos positivos óbvios;
     - cada script restante tem propósito claro e superfície oficial definida;
     - docs não prometem validadores inexistentes ou enganosos.
   - Risco:
     - baixo, desde que não se altere comportamento de runtime.

2. **Frente B — Debug e observabilidade em produção**
   - Escopo:
     - `Stats.min.js`
     - `gsap.min.js`
     - `logServiceRegistrationFlow()`
     - banner/comandos de debug do `app.js`
     - globals de debug
   - Critério de aceite:
     - nenhuma UI de debug aparece por padrão em produção;
     - nenhuma dependência morta continua carregada em `index.html`;
     - o bootstrap fica menor e mais previsível.
   - Risco:
     - baixo, com validação manual do menu e do bootstrap.

3. **Frente C — Canônicos falsos e abstrações fantasmas**
   - Escopo:
     - `hudLayout.js`
     - `settingsSchema.js`
     - `SettingsSystem.js`
     - `schema.js`
     - docs com referências quebradas
   - Critério de aceite:
     - uma única fonte de verdade por domínio;
     - nenhum export/config/layout residual sem consumidor;
     - documentação viva alinhada ao código atual.
   - Risco:
     - baixo a médio, porque mexe em schema/config e exige revisão de UI/settings.

4. **Frente D — Limpeza de ruído de manutenção**
   - Escopo:
     - assets de estudo
     - diretórios vazios
     - scripts de benchmark/validação sem integração
     - tags históricas de IA
     - suíte duplicada de feature flags
   - Critério de aceite:
     - a árvore viva contém apenas material operacional ou runtime;
     - comentários históricos não competem com comentários técnicos úteis;
     - não existem duas suítes cobrindo o mesmo contrato.
   - Risco:
     - baixo, mas exige cuidado para não remover material ainda referenciado em docs.

5. **Frente E — Monólitos e dívida estrutural**
   - Escopo:
     - `AudioSystem.js`
     - `EffectsSystem.js`
     - `MenuBackgroundSystem.js`
     - `EnemySystem.js`
     - `WaveManager.js`
   - Critério de aceite:
     - cada extração reduz contexto e responsabilidade sem alterar comportamento;
     - novas fronteiras de módulo ficam testáveis e com contratos claros.
   - Risco:
     - médio a alto. Só deve começar depois das frentes A-C.

### Gate obrigatório antes de mexer em feature flags legacy

Os paths ligados a `USE_WAVE_MANAGER` e overrides via `globalThis` **não são cleanup puro**.

Antes de qualquer plano que remova ou consolide esses caminhos, a próxima IA precisa registrar explicitamente:

1. Se o produto ainda quer preservar override/runtime fallback.
2. Se os testes existentes são documentação do contrato atual ou apenas dívida histórica.
3. Qual será a estratégia de transição:
   - remover flags e simplificar comportamento;
   - manter flags e reduzir duplicação;
   - substituir override global por mecanismo mais explícito.

Sem essa decisão, a próxima IA deve limitar-se a:
- consolidar testes duplicados;
- documentar o contrato atual;
- reduzir ruído ao redor, sem apagar os caminhos.

### Formato recomendado para os próximos planos

Cada plano derivado deste relatório deve conter, no mínimo:

1. **Objetivo**
   - o que será simplificado e por quê.

2. **Arquivos-alvo**
   - lista fechada de arquivos a tocar.

3. **Mudanças permitidas**
   - o que pode ser removido, consolidado ou reescrito.

4. **Mudanças proibidas**
   - especialmente em frentes de baixo risco:
     - não alterar gameplay;
     - não mudar contrato de save/settings sem migração;
     - não remover paths legacy sem decisão explícita.

5. **Critério de aceite**
   - resultado observável e verificável.

6. **Validação mínima**
   - comandos e checks manuais necessários.

### Validação mínima recomendada por qualquer IA executora

Após cada frente, a validação mínima deveria incluir:

- `npm test`
- `npm run format:check`
- `npm run validate:deps`
- `npm run test:validate-optimizations`
- verificação manual do bootstrap/menu quando houver mudança em `index.html`, `app.js` ou `MenuBackgroundSystem`

Observação:
- `validate:deps` e `test:validate-optimizations` hoje não são oráculos confiáveis; devem ser usados como sinal complementar até serem corrigidos.
- Mesmo assim, mantê-los na rotina ajuda a detectar regressões enquanto o próprio tooling é saneado.

### Melhor corte inicial

Se a próxima IA precisar começar por um único plano pequeno e de alto retorno, o melhor primeiro corte é:

1. remover `gsap.min.js`;
2. condicionar `Stats.min.js` a dev mode;
3. remover `logServiceRegistrationFlow()` e o `console.log` final do bootstrap;
4. corrigir/explicar as limitações de `analyze-dependencies.js`.

Esse pacote é pequeno, coeso, de baixo risco e melhora imediatamente a legibilidade do projeto e a confiança no ambiente de manutenção.

## Backlog secundário

- Normalizar helpers matemáticos repetidos, especialmente `clamp`.
- Documentar catches vazios/intencionais no sistema de áudio.
- Avaliar sobreposição entre `CollisionComponent` e `AsteroidCollision` antes de qualquer consolidação.
- Revisar se `src/public/libs/` deve continuar versionado como fonte local ou migrar para CDN/npm; como passo mínimo, excluí-lo das ferramentas de formatação/análise genérica.

## Nota de cautela

Os caminhos legacy ligados ao sistema de waves não devem ser removidos como se fossem apenas lixo histórico. Hoje eles são sustentados por override runtime e por testes deliberados. A remoção faz sentido só depois de decisão explícita de arquitetura/produto, com atualização coordenada da suíte e do mecanismo de override.
