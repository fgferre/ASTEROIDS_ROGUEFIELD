# ASTEROIDS_ROGUEFIELD

Jogo Roguelike inspirado nas mecânicas de Asteroids

## Build

Execute `npm run build` para gerar os arquivos finais em `dist/`.

## Formatação

Use `npm run format` para aplicar o Prettier localmente.
No CI, `npm run format:check` garante que os commits estejam formatados antes do build.

## Development & Debugging

### Automatic Debug Logging

The game includes an automatic debug logging system that captures all critical events during gameplay. This is essential for diagnosing issues.

**How to Use:**

1. **Start game in dev mode:**
   ```bash
   npm run dev
   ```
   Logging activates automatically (no configuration needed).

2. **Play the game normally** until you encounter the issue.

3. **Download the log:**
   - Open browser console (press **F12**)
   - Type: `downloadDebugLog()`
   - File `game-debug.log` will download to your Downloads folder

4. **Share the log:**
   - Open `game-debug.log` in any text editor
   - Copy the entire content
   - Paste in chat when reporting a bug

**Available Commands:**

```javascript
downloadDebugLog()  // Download game-debug.log file
showDebugLog()      // Show log in console
clearDebugLog()     // Clear current log
```

**What's Logged:**

- System initialization and feature flags
- Wave progression and boss wave detection
- Enemy spawning (position, type, health)
- Update loop (which enemies are being updated)
- Render loop (which enemies are being drawn)
- Collisions and damage
- Errors and warnings
- State changes (phase transitions, etc.)

**Log Format:**

```
[01:30.123] [WAVE] Wave 5 started - {"isBossWave":true}
[01:30.125] [SPAWN] Boss spawn attempted - {"entrance":"top-center"}
[01:30.126] [SPAWN] Boss position: {"x":400,"y":-100}
[01:30.127] [SPAWN] Boss created - {"health":2592}
[01:30.150] [UPDATE] Updating enemies - {"types":{"boss":1}}
[01:30.151] [RENDER] Rendering enemies - {"types":{"boss":1}}
[01:31.234] [COLLISION] Bullet hit boss - {"damage":10}
```

**Troubleshooting:**

If you encounter a bug:
1. Run `npm run dev` (logging activates automatically)
2. Reproduce the issue
3. Execute `downloadDebugLog()` in console (F12)
4. Share the `game-debug.log` file when reporting

The log shows exactly where problems occur, making debugging much faster.

**Log Capacity:**

- **Limit:** 50,000 entries (~2-3MB)
- **Coverage:** ~30 waves or ~15 minutes of gameplay
- **Trimming:** When limit reached, removes 10,000 oldest entries (preserves beginning)
- **Storage:** Browser localStorage (persists between reloads)

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

**Status:** Ativo (com flags de compatibilidade). WAVE-006 concluiu a migração de spawn de asteroides mantendo paridade com o sistema legado.

**Funcionalidades implementadas:**
- ✅ Listener de `enemy-destroyed` conectado para progressão automática de waves
- ✅ Inimigos registrados via `registerActiveEnemy()` após spawn da factory
- ✅ Parâmetros legados aplicados (`ASTEROIDS_PER_WAVE_BASE`, `ASTEROIDS_PER_WAVE_MULTIPLIER`, `WAVE_BREAK_TIME`)
- ✅ Eventos `wave-started` e `wave-complete` sincronizados com HUD, áudio e efeitos
- ✅ Migração de spawn de asteroides com flags de compatibilidade (WAVE-006)

### Flags de Compatibilidade (WAVE-006)

Para preservar comportamento baseline durante migração de asteroides:

#### `WAVEMANAGER_HANDLES_ASTEROID_SPAWN`
**Localização:** `src/core/GameConstants.js`  
**Default:** `false`  
**Descrição:** Ativa controle de spawn de asteroides pelo WaveManager (requer `USE_WAVE_MANAGER=true`).

- `false`: EnemySystem usa `handleSpawning()` legado
- `true`: WaveManager controla spawn via `generateDynamicWave()`

#### `PRESERVE_LEGACY_SIZE_DISTRIBUTION`
**Localização:** `src/core/GameConstants.js`  
**Default:** `true`  
**Descrição:** Controla distribuição de tamanhos de asteroides.

- `true`: 50% large, 30% medium, 20% small (baseline)
- `false`: 30% large, 40% medium, 30% small (otimizado para mix com outros inimigos)

#### `PRESERVE_LEGACY_POSITIONING`
**Localização:** `src/core/GameConstants.js`
**Default:** `true`
**Descrição:** Controla posicionamento de spawn de asteroides.

- `true`: Spawn nas 4 bordas (top/right/bottom/left) com margin=80
- `false`: Spawn com distância mínima do player (safe distance)

#### `STRICT_LEGACY_SPAWN_SEQUENCE`
**Localização:** `src/core/GameConstants.js`
**Default:** `true`
**Descrição:** Força posição e tamanho a compartilharem o mesmo stream `spawn`, reproduzindo a sequência determinística do legado.

- `true`: Sequência idêntica à do EnemySystem para a mesma seed (recomendado para baseline)
- `false`: Permite novas variações na ordem de spawn para experimentação

**Como testar a migração completa:**

1. Ativar todas as flags em `src/core/GameConstants.js`:

   ```javascript
   USE_WAVE_MANAGER = true
   WAVEMANAGER_HANDLES_ASTEROID_SPAWN = true
   PRESERVE_LEGACY_SIZE_DISTRIBUTION = true
   PRESERVE_LEGACY_POSITIONING = true
   STRICT_LEGACY_SPAWN_SEQUENCE = true
   ```

2. Executar testes de baseline:

   ```bash
   npm run test:baseline
   ```

3. Validação manual:

   ```bash
   npm run dev
   ```

   - Jogar 10 waves completas
   - Verificar que asteroides spawnam nas bordas
   - Confirmar distribuição de tamanhos (50/30/20)
   - Validar que variantes aparecem conforme esperado

4. Testar configuração otimizada (opcional):
   - Desativar `PRESERVE_LEGACY_SIZE_DISTRIBUTION` e `PRESERVE_LEGACY_POSITIONING`
   - Observar diferenças: mais asteroides médios/pequenos, spawn mais seguro

**Critério para ativação permanente:**
- Validação em produção por pelo menos 1 semana com flags de compatibilidade ativas
- Todos os testes de baseline passando
- Aprovação formal da equipe
- Remoção de `WAVEMANAGER_HANDLES_ASTEROID_SPAWN`, `PRESERVE_LEGACY_SIZE_DISTRIBUTION`, `PRESERVE_LEGACY_POSITIONING` e `STRICT_LEGACY_SPAWN_SEQUENCE` junto com `USE_WAVE_MANAGER`

**Documentação completa:** `docs/plans/phase1-enemy-foundation-plan.md` (seções WAVE-004 e WAVE-006)

**Nota:** Estas flags serão removidas após validação completa e estabilização do WaveManager em produção.
