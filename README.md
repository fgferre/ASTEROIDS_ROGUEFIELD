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

## Presets de renderização de inimigos

- **Localização:** `src/core/GameConstants.js`
- **Descrição:** o mapa `ENEMY_RENDER_PRESETS` concentra as dimensões, multiplicadores de brilho e constantes de desenho para cada inimigo jogável. Os efeitos de cor continuam definidos em `ENEMY_EFFECT_COLORS`.
- **Boas práticas:** novas rotinas de `onDraw()` devem consumir exclusivamente esses presets para evitar números mágicos em módulos de renderização. Ajustes de estilo devem ser registrados no preset correspondente antes de editar os arquivos em `src/modules/enemies/types/`.

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

### Testes Visuais de Renderização

Antes de ativar o spawn dos novos inimigos via WaveManager, execute a validação visual isolada:

```bash
npm run test:visual-enemies
```

O comando inicia o servidor de desenvolvimento e instrui a abrir `http://localhost:5173/scripts/visual-enemy-rendering-test.html`.

**O que observar:**
- **Drone:** nave triangular com exhaust glow reativo à velocidade
- **Mine:** esfera pulsante com intensidade variável conforme estado `armed`
- **Hunter:** diamante com turret rotacionando independentemente do hull

**Checklist de validação:** `docs/validation/enemy-rendering-visual-checklist.md`

O harness oferece:
- Slider para controlar a velocidade do Drone
- Botão para alternar o estado armed da Mine
- Slider para ajustar a velocidade de rotação do turret do Hunter
- Checkbox para exibir bounding circles e validar preservação de estado do canvas
- Monitoramento de FPS, frame time e contagem de chamadas de renderização

**Critérios de aprovação:**
- Geometria e cores alinhadas às paletas de `ENEMY_EFFECT_COLORS`
- Animações suaves (sem jitter/popping)
- Performance estável (60 FPS com múltiplas instâncias)
- Estado do canvas restaurado após cada `onDraw()`

**Testes automatizados relacionados:**

```bash
npm test -- --run src/__tests__/rendering/enemy-types-rendering.test.js
```

Validam payloads, propriedades dinâmicas e preservação de estado do canvas.

---

## Feature Flags

O projeto utiliza feature flags para permitir ativação controlada de funcionalidades experimentais:

### `USE_WAVE_MANAGER` (Em Validação - WAVE-007)

**Localização:** `src/core/GameConstants.js` (linha 1742)

**Status:** 🔄 **Em Validação Final** (WAVE-007)

**Descrição:** Controla qual sistema de ondas é utilizado:
- `false` (padrão atual): Sistema legado de ondas (100% estável)
- `true` (em validação): Novo WaveManager com suporte a múltiplos tipos de inimigos

**Progresso da Integração:**
- ✅ WAVE-001: Baseline metrics capturadas
- ✅ WAVE-002: Feature flag implementada
- ✅ WAVE-003: Renderização de Drone, Mine, Hunter completa
- ✅ WAVE-004: WaveManager integrado ao loop principal
- ✅ WAVE-005: RewardManager expandido para novos inimigos
- ✅ WAVE-006: Spawn de asteroides migrado para WaveManager
- 🔄 WAVE-007: Validação final em andamento

**Funcionalidades Implementadas:**
- ✅ Listener de `enemy-destroyed` conectado para progressão automática
- ✅ Inimigos spawned registrados no sistema ativo via `registerActiveEnemy()`
- ✅ Parâmetros legados mapeados (spawn rate, delays, distribuição)
- ✅ Eventos `wave-started` e `wave-complete` sincronizados
- ✅ Renderização de novos inimigos (Drone, Mine, Hunter, Boss)
- ✅ Reward system para todos os tipos de inimigos
- ✅ Spawn de asteroides via WaveManager com flags de compatibilidade

**Como Validar (WAVE-007):**

1. **Ativar flags para validação:**

   ```javascript
   // Em src/core/GameConstants.js
   USE_WAVE_MANAGER = true
   WAVEMANAGER_HANDLES_ASTEROID_SPAWN = true
   PRESERVE_LEGACY_SIZE_DISTRIBUTION = true
   PRESERVE_LEGACY_POSITIONING = true
   ```

2. **Executar testes automatizados:**

   ```bash
   npm run test:baseline  # Deve passar com 0 failures
   npm test               # Suite completa
   ```

3. **Validação manual in-game:**

   ```bash
   npm run dev
   ```

   - Jogar 10 waves completas
   - Validar boss wave (wave 5, 10)
   - Validar novos inimigos (Drone, Mine, Hunter)
   - Verificar rewards (XP orbs, health hearts)
   - Monitorar performance (≥55 FPS)
   - Verificar console (sem erros)

4. **Preencher relatório de validação:**
   - `docs/validation/wavemanager-integration-report.md`

5. **Seguir checklist completo:**
   - `docs/validation/wave-007-final-validation-checklist.md`

**Flags de Compatibilidade:**

- `WAVEMANAGER_HANDLES_ASTEROID_SPAWN` (default: false)
  - Ativa controle de spawn de asteroides pelo WaveManager
  - Requer `USE_WAVE_MANAGER=true`

- `PRESERVE_LEGACY_SIZE_DISTRIBUTION` (default: true)
  - `true`: 50/30/20 (large/medium/small) - baseline original
  - `false`: 30/40/30 - otimizado para mix com novos inimigos

- `PRESERVE_LEGACY_POSITIONING` (default: true)
  - `true`: Spawn nas 4 bordas (baseline original)
  - `false`: Spawn com distância mínima do player

**Critérios de Aprovação (WAVE-007):**
- ✅ Todos os testes baseline passando
- ✅ Métricas de spawn correspondem ao baseline (±2%)
- ✅ Novos inimigos renderizam e funcionam corretamente
- ✅ Boss spawns na wave 5, 10, 15 sem erros
- ✅ Rewards dropam conforme especificado
- ✅ Performance estável (≥55 FPS, sem memory leaks)
- ✅ Console sem erros durante 10 waves

**Procedimento de Rollback:**

Se problemas críticos forem detectados:

```javascript
// Rollback rápido (2-5 min)
USE_WAVE_MANAGER = false
WAVEMANAGER_HANDLES_ASTEROID_SPAWN = false
// Commit e redeploy
```

Ver `docs/validation/wave-007-rollback-plan.md` para procedimento completo.

**Próximos Passos:**

**Se WAVE-007 Aprovado:**
1. Manter flags ativadas em produção
2. Monitorar métricas por 1-2 semanas
3. Após validação: remover código legado (Fase 6)
4. Prosseguir para Phase 2: Boss System Enhancements

**Se WAVE-007 Reprovado:**
1. Desativar flags (rollback)
2. Corrigir bloqueadores identificados
3. Re-executar WAVE-007 completo

**Documentação Completa:**
- Plano de Fase 1: `docs/plans/phase1-enemy-foundation-plan.md`
- Checklist WAVE-007: `docs/validation/wave-007-final-validation-checklist.md`
- Baseline Metrics: `docs/validation/asteroid-baseline-metrics.md`
- Plano de Rollback: `docs/validation/wave-007-rollback-plan.md`

**Nota:** Esta seção será atualizada após conclusão de WAVE-007 com resultado final (Aprovado/Reprovado) e próximos passos.
