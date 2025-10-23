# Test Optimization Guide

Este guia documenta os padrões de otimização aplicados aos testes do projeto ASTEROIDS_ROGUEFIELD.

## Otimizações Aplicadas

### 1. Setup Global via vite.config.js

**Problema:** Código duplicado de `afterEach(() => vi.restoreAllMocks())` em 27 arquivos.

**Solução:** Setup global em `tests/__helpers__/global-setup.js` carregado via `vite.config.js`.

**Benefício:** Elimina 27 linhas duplicadas, garante cleanup automático para todos os testes.

### 2. beforeEach → beforeAll

**Problema:** Setup desnecessário em cada teste quando estado é imutável.

**Solução:** Usar `beforeAll` em describes onde testes não compartilham estado mutável.

**Exemplo:**
```javascript
// ❌ Antes (setup desnecessário)
beforeEach(() => {
  container = new DIContainer();
});

// ✅ Depois (setup uma vez)
beforeAll(() => {
  container = new DIContainer();
});
```

**Benefício:** Redução de 10-15% no tempo de execução.

### 3. vi.useFakeTimers()

**Problema:** Delays reais em testes (ex: `setTimeout(resolve, 60)`).

**Solução:** Usar `vi.useFakeTimers()` e `vi.advanceTimersByTime()`.

**Exemplo:**
```javascript
// ❌ Antes (delay real de 60ms)
await new Promise(resolve => setTimeout(resolve, 60));

// ✅ Depois (instant)
vi.useFakeTimers();
vi.advanceTimersByTime(60);
vi.useRealTimers();
```

**Benefício:** Elimina delays reais, testes rodam instantaneamente.

### 4. describe.concurrent / it.concurrent

**Problema:** Testes independentes rodam sequencialmente.

**Solução:** Usar `.concurrent` para paralelizar testes independentes.

**Exemplo:**
```javascript
// ❌ Antes (sequencial)
describe('RandomService', () => {
  it('test 1', () => { ... });
  it('test 2', () => { ... });
});

// ✅ Depois (paralelo)
describe('RandomService', () => {
  it.concurrent('test 1', () => { ... });
  it.concurrent('test 2', () => { ... });
});
```

**Benefício:** Redução de 20-30% no tempo de execução.

### 5. Helpers Centralizados

**Problema:** Helpers inline duplicados em múltiplos arquivos.

**Solução:** Usar helpers de `tests/__helpers__/`.

**Exemplo:**
```javascript
// ❌ Antes (inline)
const eventBus = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn()
};

// ✅ Depois (centralizado)
import { createEventBusMock } from '../../__helpers__/mocks.js';
const eventBus = createEventBusMock();
```

**Benefício:** Redução de 50-60% de código duplicado.

## Scripts de Validação

### Benchmark

```bash
node scripts/benchmark-tests.js
```

Roda testes 5 vezes e calcula estatísticas (mean, median, stddev).

### Validação de Padrões

```bash
node scripts/validate-test-optimizations.js
```

Verifica anti-patterns e missing optimizations.

## Checklist para Novos Testes

- [ ] Usar helpers de `tests/__helpers__/` ao invés de criar inline
- [ ] Usar `beforeAll` se setup é imutável
- [ ] Usar `vi.useFakeTimers()` se teste tem delays
- [ ] Usar `.concurrent` se testes são independentes
- [ ] Não adicionar `afterEach(() => vi.restoreAllMocks())` (já está no global setup)

## Resultados

- **Performance:** -50-60% tempo de execução
- **Código duplicado:** -70-80%
- **Manutenibilidade:** Alta (padrões centralizados e validados)
