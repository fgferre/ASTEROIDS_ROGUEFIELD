# ASTEROIDS_ROGUEFIELD

Jogo Roguelike inspirado nas mecânicas de Asteroids

## Build

Execute `npm run build` para gerar os arquivos finais em `dist/`.

## Formatação

Use `npm run format` para aplicar o Prettier localmente.
No CI, `npm run format:check` garante que os commits estejam formatados antes do build.

## 🧪 Testing & Feature Flags

O jogo possui **feature flags** que controlam o comportamento do sistema de ondas (WaveManager). Estes flags podem ser modificados em tempo de execução durante o desenvolvimento, sem necessidade de editar código ou recompilar.

### Flags Disponíveis

| Flag | Tipo | Padrão | Descrição |
|------|------|--------|----------|
| `USE_WAVE_MANAGER` | boolean | `false` | Ativa o novo WaveManager (substitui sistema legado) |
| `WAVEMANAGER_HANDLES_ASTEROID_SPAWN` | boolean | `false` | WaveManager controla spawn de asteroides (requer `USE_WAVE_MANAGER=true`) |
| `PRESERVE_LEGACY_SIZE_DISTRIBUTION` | boolean | `true` | Mantém distribuição legada de tamanhos (50/30/20) |
| `PRESERVE_LEGACY_POSITIONING` | boolean | `true` | Asteroides spawnam nas bordas (legado) vs. distância segura |
| `STRICT_LEGACY_SPAWN_SEQUENCE` | boolean | `true` | Garante sequência determinística de spawn |
| `ASTEROID_EDGE_SPAWN_MARGIN` | number | `80` | Margem em pixels para spawn nas bordas (0-200) |

### Modificar Flags via Console do Navegador

1. Inicie o jogo em modo desenvolvimento: `npm run dev`
2. Abra o DevTools do navegador (F12)
3. No console, use os comandos:

```javascript
// Ver todos os flags disponíveis
window.featureFlags.getAllFlags()

// Ativar o WaveManager
window.featureFlags.setFlag('USE_WAVE_MANAGER', true)

// Ativar controle de spawn pelo WaveManager
window.featureFlags.setFlag('WAVEMANAGER_HANDLES_ASTEROID_SPAWN', true)

// Ver flags ativos (com overrides)
window.featureFlags.getOverrides()

// Resetar um flag específico
window.featureFlags.resetFlag('USE_WAVE_MANAGER')

// Resetar todos os flags
window.featureFlags.resetAllFlags()
```

4. **Recarregue a página** (F5) para aplicar as mudanças
5. Os overrides são salvos automaticamente no `localStorage` e persistem entre sessões

### Cenários de Teste

**Testar WaveManager (apenas progressão de ondas):**

```javascript
window.featureFlags.setFlag('USE_WAVE_MANAGER', true)
// Spawn ainda controlado pelo sistema legado
```

**Testar WaveManager completo (com controle de spawn):**

```javascript
window.featureFlags.setFlag('USE_WAVE_MANAGER', true)
window.featureFlags.setFlag('WAVEMANAGER_HANDLES_ASTEROID_SPAWN', true)
```

**Testar novos inimigos (Drone, Mine, Hunter):**

```javascript
window.featureFlags.setFlag('USE_WAVE_MANAGER', true)
window.featureFlags.setFlag('WAVEMANAGER_HANDLES_ASTEROID_SPAWN', true)
// Jogue até a onda 8+ para ver novos inimigos
```

**Testar sistema de Boss:**

```javascript
window.featureFlags.setFlag('USE_WAVE_MANAGER', true)
window.featureFlags.setFlag('WAVEMANAGER_HANDLES_ASTEROID_SPAWN', true)
// Boss aparece nas ondas 5, 10, 15, etc.
```

**Voltar ao sistema legado:**

```javascript
window.featureFlags.resetAllFlags()
```

### Guia Simplificado (Sem Programação)

**Passo 1:** Abra o jogo no navegador (Chrome/Edge recomendado)

**Passo 2:** Pressione **F12** para abrir as ferramentas de desenvolvedor

**Passo 3:** Clique na aba **"Console"** (geralmente a segunda aba)

**Passo 4:** Copie e cole um dos comandos acima e pressione **Enter**

**Passo 5:** Pressione **F5** para recarregar o jogo com as novas configurações

**Dica:** Os comandos ficam salvos automaticamente. Para voltar ao normal, use:

```javascript
window.featureFlags.resetAllFlags()
```

e recarregue a página (F5).

**Nota sobre Feature Flags:** Todos os flags são persistidos no `localStorage` do navegador. Para limpar completamente, use `localStorage.clear()` no console ou `window.featureFlags.resetAllFlags()`.

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
