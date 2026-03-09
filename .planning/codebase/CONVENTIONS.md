# Coding Conventions

**Analysis Date:** 2026-03-09

## Naming Patterns

**Files:**
- PascalCase for classes: `DIContainer.js`, `EventBus.js`, `BaseSystem.js`, `RandomService.js`
- camelCase for utilities and helpers: `serviceUtils.js`, `gameEvents.js`, `randomHelpers.js`
- kebab-case for modules with hyphens: `asteroid-configs.js`, `spatial-hash.js`
- Constants files: `gameplay.js`, `physics.js`, `visual.js` in `src/data/constants/`

**Functions:**
- camelCase for all function names: `resolve()`, `register()`, `emit()`, `reset()`, `createTestContainer()`
- Private methods prefixed with underscore: `_getRandomRange()`, `_eventListeners`, `_unregisterDebugController()`
- Factory functions: `create[Thing]`, `make[Thing]`: `createEventBusMock()`, `createRandomServiceStub()`

**Variables:**
- camelCase for all variables: `container`, `eventBus`, `dependencies`, `randomForks`, `listeners`
- Descriptive names required: avoid single letters except in loops (`index`, `i`): `const resolvedServices = {}`
- Instance caches use `cached` prefix or `Cache` suffix: `cachedPlayer`, `metricsCache`, `GradientCache`

**Types/Classes:**
- PascalCase for all classes and constructors: `DIContainer`, `EventBus`, `BaseSystem`, `RandomService`
- Descriptive abstract concepts: `Manager` suffix for managers (`WaveManager`, `RewardManager`), `System` suffix for systems (`PlayerSystem`, `RenderingSystem`)

**Constants:**
- ALL_CAPS for module-level constants: `DEFAULT_POOL_CONFIG`, `DEFAULT_GC_OPTIONS`, `PRESERVE_LEGACY_SIZE_DISTRIBUTION`
- camelCase for nested object properties even if parent is constant: `const config = { initialSize: 25, maxSize: 120 }`

## Code Style

**Formatting:**
- Tool: Prettier 3.2.5
- Semi: true (always end statements with semicolons)
- Single Quotes: enabled (use 'string' not "string")
- Trailing Comma: 'es5' (trailing commas where valid in ES5)
- Print Width: 80 characters
- Tab Width: 2 spaces
- End of Line: 'auto' (respects platform line endings)

**Linting:**
- No ESLint configuration detected; formatting enforced only via Prettier
- Dev mode detection: `isDevEnvironment()` from `src/utils/dev/GameDebugLogger.js`
- Strict type checking via JSDoc: `@param {Type}`, `@returns {Type}`

## Import Organization

**Order:**
1. Core Node/browser APIs (if any)
2. Vitest/testing framework imports: `import { describe, it, expect } from 'vitest'`
3. Internal relative imports grouped by depth
4. Deepest imports first (e.g., `../../`) then shallower (`../`, `./`)
5. Named imports alphabetically within each group

**Pattern:**
```javascript
// Standard module imports
import { DIContainer } from './core/DIContainer.js';
import { EventBus, gameEvents } from './core/EventBus.js';
import RandomService from './core/RandomService.js';

// Multiple levels with alphabetical grouping
import { createEventBusMock } from '../__helpers__/mocks.js';
import { setupGlobalMocks, cleanupGlobalState } from '../__helpers__/setup.js';

// Default exports
import RenderingSystem from '../../../src/modules/RenderingSystem.js';
```

**Path Aliases:**
- No path aliases configured; always use relative imports with explicit `./` or `../`
- All imports are ESM with explicit `.js` extensions

**Exports:**
- Named exports preferred for utilities: `export { EventBus, gameEvents }`
- Default exports for classes: `export default class DIContainer { }`
- Barrel files not commonly used; imports are direct

## Error Handling

**Patterns:**
- Always prefix errors with component identifier: `[ComponentName]` in error messages
- Example: `throw new Error('[DIContainer] Service name must be a non-empty string')`
- Use `console.error()` for caught exceptions with context: `console.error('[DIContainer] Error resolving...:', error)`
- Return early on validation failures; throw only for unrecoverable state
- Never silently fail; log or throw

**Try/Catch Usage:**
- Used in factories during initialization: `catch (error) { console.error(...); throw error; }`
- Used in event emission: `catch (error) { console.error('[EventBus] Error in listener...:', error); }`
- Listeners should not throw; errors are caught and logged, not re-thrown

**Validation:**
```javascript
// Early validation with clear error messages
if (!name || typeof name !== 'string') {
  throw new Error('[DIContainer] Service name must be a non-empty string');
}

if (typeof factory !== 'function') {
  throw new Error(
    `[DIContainer] Factory for '${name}' must be a function. ` +
      'To register a pre-built instance, use registerInstance(name, value).'
  );
}
```

## Logging

**Framework:** console (no external logger; uses built-in console API)

**Patterns:**
- Use `console.log()` for informational messages with component prefix: `console.log('[EventBus] Registered listener for: ${eventName}')`
- Use `console.error()` for error conditions: `console.error('[DIContainer] Error resolving...:', error)`
- Use `console.warn()` for warnings: typically in validation checks
- Use `console.group()` / `console.groupEnd()` for organized output (e.g., debug reports)
- Suppress high-frequency logs with `emitSilently()` in EventBus

**Development Mode:**
- Component prefix always included: `[ComponentName]`
- Conditional logging via `this.debug` or `isDevEnvironment()`: Check `src/utils/dev/GameDebugLogger.js`
- Verbose logging controllable at runtime: DIContainer has `.verbose` property

## Comments

**When to Comment:**
- JSDoc comments for public functions and classes: `/** @param {Type} name - Description */`
- Inline comments for complex logic or non-obvious decisions: `// Component prefix for debugging`
- Section comments for major code blocks: `// Validation`, `// Resolve dependencies`, `// Create instance`
- No comments for obvious code: `const name = 'test'` does not need a comment

**JSDoc/TSDoc:**
- Used throughout for public APIs
- Pattern: `/** @param {Type} name - Description @returns {Type} Description */`
- Example from `DIContainer.js`:
```javascript
/**
 * Registers a service factory in the container.
 *
 * @param {string} name - Unique service identifier
 * @param {Function} factory - Factory function
 * @param {Object} [options={}] - Configuration options
 * @param {Array<string>} [options.dependencies=[]] - List of dependency service names
 * @param {boolean} [options.singleton=true] - Whether to cache as singleton
 * @returns {DIContainer} This container for chaining
 * @throws {Error} If service name is invalid or already registered
 */
```

## Function Design

**Size:**
- Prefer small focused functions (10-30 lines)
- Complex logic broken into smaller private methods: `_validateDependencies()`, `_resolveDependencies()`, `_createInstance()`
- Example: `DIContainer.resolve()` at 73 lines includes circular dependency detection, validation, resolution, caching, and error handling—appropriate scope for infrastructure code

**Parameters:**
- Use objects for multiple parameters (>3): `register(name, factory, options = {})`
- Destructure options with defaults: `const { dependencies = [], singleton = true, lazy = true } = options`
- Validate all inputs at function start

**Return Values:**
- Consistent return types: if function returns DIContainer sometimes, always return for chaining
- Null/undefined only when explicitly intended: `getDependencies(name)` returns `null` if not found
- Throw errors for failure cases; do not return null for errors

**Null Handling:**
```javascript
// Check before use
if (!config) {
  throw new Error('[DIContainer] Service not found...');
}

// Return null only when optional lookup
if (!config) return null;
```

## Module Design

**Exports:**
- Each file exports one primary thing: `export default class DIContainer { }`
- Utility files export multiple named functions: `export { resolve, register, ... }`
- Re-exports (barrel files) used sparingly: prefer direct imports

**Service/System Pattern:**
- Services/Systems are classes: `class EventBus { }`, `class BaseSystem extends { }`
- Constructor accepts dependencies: `constructor(dependencies, options = {})`
- Lifecycle methods: `initialize()`, `reset()`, `destroy()`
- Shared logic in `BaseSystem` parent class

**Singleton Pattern:**
- Services registered in DIContainer as singletons: `container.register('audio', factory, { singleton: true })`
- Global singleton instances created via factories: `export const gameEvents = new EventBus()`
- Instances accessed via DI, not global references

**Dependency Injection:**
- Dependencies passed to constructors, not accessed globally
- Service resolution via `DIContainer.resolve(name)`
- Dependencies normalized in `BaseSystem`: `this.dependencies = normalizeDependencies(dependencies)`

---

*Convention analysis: 2026-03-09*
