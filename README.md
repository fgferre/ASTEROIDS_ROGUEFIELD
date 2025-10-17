# ASTEROIDS_ROGUEFIELD

Jogo Roguelike inspirado nas mecânicas de Asteroids

## Build

Execute `npm run build` para gerar os arquivos finais em `dist/`.

## Formatação

Use `npm run format` para aplicar o Prettier localmente.
No CI, `npm run format:check` garante que os commits estejam formatados antes do build.

## Protótipos de referência (fora do build oficial)

Alguns experimentos e bancadas de desempenho são mantidos em `docs/reference/prototypes/`. Eles servem apenas como suporte de engenharia e **não fazem parte do build distribuído**. Consulte o [README dos protótipos](docs/reference/prototypes/README.md) para entender objetivo, dependências e passos de execução.

## Arquitetura de Serviços (Fase 2)

- **`gameServices` (Service Locator legado):** continua registrando as instâncias concretas criadas pelos sistemas. Toda a lógica existente ainda depende dele.
- **`diContainer`:** recebe placeholders pré-registrados por `ServiceRegistry.setupServices(diContainer)` e ficará responsável por resolver dependências quando a migração para injeção por construtor avançar.
- **`ServiceLocatorAdapter`:** inicializado em `src/app.js` para observar o locator legado e preparar a transição. Em desenvolvimento você pode acessar `window.serviceLocatorAdapter` e `window.diContainer` para depuração.
- **Novos serviços:** registre no `gameServices` e acrescente o nome ao array de `ServiceRegistry`. Planeje o construtor do sistema para aceitar dependências explicitamente, facilitando o switch para DI assim que habilitado.

## Seeds e execução determinística

- Para forçar uma seed específica durante o desenvolvimento, basta abrir o jogo com `?seed=<valor>` (ex.: `http://localhost:5173/?seed=1337`). O bootstrap registrará a origem da seed nos logs e reutilizará o mesmo valor em resets.
- O `RandomService` deve ser a única fonte de aleatoriedade após o bootstrap. Em modo desenvolvimento há um guardião que monkey patcha `Math.random()` depois da inicialização e emite `console.warn` sempre que um módulo ignora o serviço (mantendo um stack trace resumido para facilitar a correção).
- Os testes de integração em `tests/integration/deterministic-systems.test.js` cobrem starfield, ondas e drops de orbes para garantir reprodutibilidade com seeds fixas. Execute `npm test` antes de abrir PRs.

## Testes de Baseline (Golden Metrics)

Antes de alterar o sistema de ondas ou integrar o `WaveManager`, execute a suite
de baseline para capturar o comportamento atual:

```bash
npm run test:baseline
```

Os testes validam:
- Taxa de spawn de asteroides por wave (1-10)
- Distribuição de tamanhos (large/medium/small)
- Distribuição de variantes (common, iron, gold, volatile, etc.)
- Regras de fragmentação e herança de velocidade
- Contadores de `waveState`
- Determinismo com seeds fixas

Para desenvolvimento contínuo há um modo watch:

```bash
npm run test:baseline:watch
```

Documentação completa: `docs/validation/asteroid-baseline-metrics.md`

## Feature Flags

O projeto utiliza feature flags para permitir ativação controlada de funcionalidades experimentais:

### `USE_WAVE_MANAGER` (Experimental)

**Localização:** `src/core/GameConstants.js`

**Descrição:** Controla qual sistema de ondas é utilizado:
- `false` (padrão): Sistema legado de ondas (100% estável)
- `true`: Novo WaveManager com suporte a múltiplos tipos de inimigos

**Como testar:**

1. Validar comportamento padrão (flag desativada):

   ```bash
   npm run test:baseline
   npm run dev
   ```

2. Ativar o WaveManager:
   - Abrir `src/core/GameConstants.js`
   - Alterar `USE_WAVE_MANAGER` para `true`
   - Executar testes: `npm run test:baseline`
   - Iniciar aplicação: `npm run dev`

3. Verificar logs de debug:
   - Abrir console do navegador
   - Procurar por `[EnemySystem] Wave system: WaveManager` ou `Legacy`
   - Confirmar que estado de ondas é sincronizado corretamente na HUD

**Status:** Em desenvolvimento. O WaveManager está parcialmente integrado e requer:
- Renderização de novos tipos de inimigos (Drone, Mine, Hunter)
- Conexão completa do loop de spawn
- Validação de paridade com métricas baseline

**Documentação completa:** `docs/plans/phase1-enemy-foundation-plan.md`

**Nota:** Esta flag será removida após validação completa da migração para o WaveManager.
