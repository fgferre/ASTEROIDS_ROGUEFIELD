# Testing Patterns

**Analysis Date:** 2026-03-09

## Test Framework

**Runner:**
- Vitest 3.2.4
- Config: `vite.config.js` (lines 22-34)
- Environment: Node.js (`environment: 'node'`)
- Globals: true (describe, it, expect available without imports)

**Setup Files:**
- `tests/__helpers__/global-setup.js` (runs once before all tests)
- Imported module: `tests/__helpers__/setup.js` (shared afterEach hooks)

**Assertion Library:**
- Vitest built-in expect() function
- Custom assertions in `tests/__helpers__/assertions.js`: `expectDeterministicSequence()`, `expectWithinTolerance()`

**Run Commands:**
```bash
npm test                    # Run all tests once
npm run test:watch         # Watch mode
npm run test:ui            # UI test explorer
npm run test:coverage      # Code coverage report
npm run test:core          # Core module tests only
npm run test:modules       # Modules tests
npm run test:utils         # Utilities tests
npm run test:services      # Services tests
npm run test:integration   # Integration tests
npm run test:balance       # Balance/metrics tests
npm run test:visual        # Visual determinism tests
npm run test:physics       # Physics tests
```

## Test File Organization

**Location:**
- Tests are in separate `tests/` directory (not co-located with source)
- Mirrored structure to `src/`: `tests/core/` mirrors `src/core/`, `tests/modules/` mirrors `src/modules/`
- Special directories: `tests/__helpers__/` for shared utilities, `tests/__fixtures__/` for data

**Naming:**
- Pattern: `[description].test.js` (e.g., `DIContainer.test.js`, `RandomService.test.js`)
- Integration tests: `[feature]/[aspect].test.js` (e.g., `determinism/systems.test.js`)

**Vitest Config Patterns:**
- Include pattern: `tests/**/*.test.js` and `tests/**/*.spec.js`
- Exclude: `tests/__helpers__/**`, `tests/__fixtures__/**`, `node_modules/**`
- Run via vite.config.js root resolution

## Test Structure

**Suite Organization:**
```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Component from '../../src/path/Component.js';
import { createTestContainer } from '../__helpers__/setup.js';

describe('Component name', () => {
  // Parallel test suite (all tests independent)
  describe.concurrent('Feature area', () => {
    it.concurrent('should do something specific', () => {
      // Setup
      const component = new Component();

      // Execute
      const result = component.method();

      // Assert
      expect(result).toBe(expected);
    });
  });

  // Sequential test suite (tests share state)
  describe('Sequential behavior', () => {
    let component;

    beforeEach(() => {
      component = new Component();
    });

    afterEach(() => {
      component.destroy?.();
    });

    it('should maintain state', () => {
      component.setState('initial');
      expect(component.getState()).toBe('initial');
    });
  });
});
```

**Patterns:**
- Use `describe.concurrent()` when tests are fully independent (no shared state)
- Use `it.concurrent()` for independent test cases within a suite
- Global setup in `tests/__helpers__/global-setup.js` provides `afterEach()` that calls `vi.restoreAllMocks()` and `cleanupGlobalState()`
- Manual `beforeEach()` / `afterEach()` for test-specific setup/teardown

## Mocking

**Framework:** Vitest's `vi` (vi.fn, vi.spyOn, etc.)

**Patterns:**
```javascript
// Mock event emitter
const eventBus = createEventBusMock({ withSpies: true });
eventBus.on('test', vi.fn());
eventBus.emit('test', data);
expect(eventBus.emit).toHaveBeenCalledWith('test', data);

// Mock random service
const random = createRandomServiceStub('seed');
const value = random.float(); // Returns deterministic 0.5

// Spy on actual service
vi.spyOn(component, 'method').mockReturnValue(42);
expect(component.method).toHaveBeenCalled();
```

**Helper Functions:**
- `createEventBusMock(options)` from `tests/__helpers__/mocks.js`: Returns in-memory EventBus
- `createRandomServiceStub(seed)` from `tests/__helpers__/mocks.js`: Returns deterministic stub
- `createAudioSystemStub()` from `tests/__helpers__/mocks.js`: Returns stub for audio testing
- `createTestContainer(seed)` from `tests/__helpers__/setup.js`: Returns full DI container with services

**What to Mock:**
- External dependencies (audio, graphics): use stubs from `mocks.js`
- Event listeners: use `createEventBusMock()` with spies
- Time-dependent code: mock `performance.now()` via `setupGlobalMocks()`
- Random generation: use seeded `RandomService` or `createRandomServiceStub()`

**What NOT to Mock:**
- Core business logic: test actual implementations
- Deterministic algorithms: use real RandomService with seeds
- DIContainer or EventBus: these are infrastructure for testing
- Utilities like `randomHelpers`: test real implementations

## Fixtures and Factories

**Test Data:**
```javascript
// Helper function pattern (not a factory)
function createEnemySystemStub(random) {
  const created = [];
  return {
    created,
    factory: {
      create(type, config) {
        created.push({ type, x: config.x, y: config.y });
        return { type, ...config };
      }
    },
    getCachedWorld() {
      return { width: 960, height: 720 };
    }
  };
}

// Usage in test
const stub = createEnemySystemStub(random);
```

**Location:**
- Shared fixtures: `tests/__helpers__/fixtures.js`
- Mock/stub helpers: `tests/__helpers__/mocks.js`, `tests/__helpers__/stubs.js`
- Test-specific helpers: defined inline in test file or in local helpers directory
- Asteroid test helpers: `tests/__helpers__/asteroid-helpers.js`

**Naming:**
- `create[Thing]` for factory functions: `createTestContainer()`, `createEventBusMock()`
- `[Thing]Stub` or `[Thing]Mock` for objects
- Helpers prefixed with verb: `setupGlobalMocks()`, `captureStarfieldSnapshot()`

## Coverage

**Requirements:** None enforced (no coverage threshold configured)

**View Coverage:**
```bash
npm run test:coverage
```

**Coverage Report Location:** Depends on Vitest provider (C8 by default); usually in `coverage/` directory

**Target areas (observed from tests):**
- Core: DIContainer, EventBus, RandomService, BaseSystem
- Modules: PlayerSystem, EnemySystem, AudioSystem, RenderingSystem
- Services: GameSessionService, CommandQueueService
- Determinism: Random seeding, asteroid spawning, wave generation

## Test Types

**Unit Tests:**
- Scope: Single class or function in isolation
- Location: `tests/core/`, `tests/modules/`, `tests/utils/`
- Example: `DIContainer.test.js` tests registration, resolution, circular dependency detection
- Setup: Usually just constructor + method calls
- Assertions: Direct output validation

**Integration Tests:**
- Scope: Multiple systems working together
- Location: `tests/integration/determinism/`, `tests/integration/gameplay/`
- Example: `systems.test.js` creates container, multiple systems, validates wave generation
- Setup: Uses `createTestContainer()` with full DI bootstrap
- Assertions: Snapshot comparison, state consistency

**Determinism Tests:**
- Scope: Validate reproducible behavior with same seed
- Location: `tests/integration/determinism/`, `tests/visual/`
- Pattern: Run scenario twice with same seed, compare outputs
- Example: `RandomService.test.js` creates two instances with same seed, verifies identical sequences
- Assertions: `expectDeterministicSequence()`, `expectSameSeeds()`

**Balance/Metrics Tests:**
- Scope: Validate game balance parameters (spawn rates, distribution)
- Location: `tests/balance/`
- Example: `asteroid-metrics/spawn-rates.test.js` validates spawn behavior
- Setup: Often uses WaveManager with controlled random
- Assertions: Numeric range checks, distribution validation

**Visual Tests:**
- Scope: Validate rendering output reproducibility
- Location: `tests/visual/`
- Example: `rendering-determinism.test.js` captures pixel data with seeds
- Setup: Uses canvas stubs or actual rendering
- Assertions: Snapshot/pixel comparison

## Common Patterns

**Async Testing:**
```javascript
// Test async function (automatically awaited by Vitest)
it('should resolve promise', async () => {
  const result = await asyncFunction();
  expect(result).toBe(expected);
});

// Manual promise handling
it('should handle promise chain', () => {
  return functionReturningPromise().then(result => {
    expect(result).toBe(expected);
  });
});
```

**Error Testing:**
```javascript
// expect().toThrow() for thrown errors
it('should throw on invalid input', () => {
  expect(() => {
    container.register('', () => {}); // Empty name
  }).toThrow('[DIContainer] Service name must be a non-empty string');
});

// Match error message pattern
it('should throw with context', () => {
  expect(() => {
    container.resolve('nonexistent');
  }).toThrow(/Service 'nonexistent' not found/);
});
```

**State Mutation Testing:**
```javascript
it('should mutate state correctly', () => {
  const before = component.getState();
  component.setState('newValue');
  const after = component.getState();

  expect(before).not.toBe(after);
  expect(after).toBe('newValue');
});
```

**Determinism Testing:**
```javascript
// Capture output with seed 1
const result1A = captureBehavior(seed1);
const result1B = captureBehavior(seed1);
expect(result1B).toEqual(result1A); // Same seed = same output

// Different seeds produce different outputs
const result2 = captureBehavior(seed2);
expect(result2).not.toEqual(result1A); // Different seed = different output
```

**Concurrent Testing Optimization:**
```javascript
// Use describe.concurrent() for fully independent test suites
describe.concurrent('Registration', () => {
  it.concurrent('should register simple service', () => { ... });
  it.concurrent('should throw on duplicate', () => { ... });
  // All tests run in parallel
});
```

## Global Setup and Cleanup

**Global Setup File:** `tests/__helpers__/global-setup.js`

**Imported Module:** `tests/__helpers__/setup.js`

**Auto-invoked Hooks:**
- `afterEach()` registered in setup.js automatically calls:
  - `cleanupGlobalState()` - Restores globalThis.performance, removes feature flag overrides
  - `vi.restoreAllMocks()` - Clears all spies and mocks

**Manual Setup Functions:**
```javascript
// Setup mocks for a test
beforeEach(() => {
  setupGlobalMocks({ performance: { now: () => 0 } });
});

// Cleanup happens automatically via afterEach from global setup

// Feature flag overrides
await withWaveOverrides(
  { useManager: true, managerHandlesAsteroids: true },
  async () => {
    // Test code with flags active
  }
); // Flags automatically restored after callback
```

## Test Helpers

**Custom Assertions:**
- `expectDeterministicSequence(seq1, seq2, tolerance)` - Validates numeric sequences match within tolerance
- `expectWithinTolerance(value, expected, tolerance)` - Single value tolerance check
- `expectSameSeeds(snapshot1, snapshot2)` - Validates seed snapshots match

**Setup Helpers:**
- `setupGlobalMocks(options)` - Configures performance mock
- `cleanupGlobalState()` - Restores global state
- `withWaveOverrides(config, callback)` - Temporarily applies feature flags
- `createTestContainer(seed)` - Full DI container with services

**Mock/Stub Factories:**
- `createEventBusMock()` - In-memory event bus with optional spies
- `createRandomServiceStub()` - Deterministic stub returning fixed values
- `createAudioSystemStub()` - Audio system stub for testing
- `createEnemySystemStub()` - Enemy system stub (defined per test file)

## Best Practices

**Test Independence:**
- Use `describe.concurrent()` to run tests in parallel when possible
- Avoid shared state between tests (use beforeEach/afterEach)
- Global setup handles mock restoration automatically

**Descriptive Names:**
- Test name describes behavior not implementation: `'should resolve service with dependencies'` not `'calls getDeps then create'`
- Use should/expect verbs: should throw, should return, should call

**Determinism First:**
- Always test with seeds for reproducibility
- Use `createTestContainer(seed)` for integration tests
- Capture snapshots instead of hardcoding expected values

**Avoid Over-Mocking:**
- Mock only external dependencies and non-deterministic code
- Test real business logic whenever possible
- Mock time only when necessary (use `setupGlobalMocks()`)

**Assertion Count:**
- 1-3 assertions per test is ideal
- Complex behavior broken into multiple smaller tests
- Use `describe.concurrent()` to reduce test file size

---

*Testing analysis: 2026-03-09*
