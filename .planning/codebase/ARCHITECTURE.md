# Architecture

**Analysis Date:** 2026-03-09

## Pattern Overview

**Overall:** Service-Oriented Architecture with Dependency Injection (DI) and Event-Driven Communication

**Key Characteristics:**
- Unified Dependency Injection container (`DIContainer`) serves as the single service registry
- Service-based modular design: each game system is a standalone service with clear responsibilities
- Event-driven communication via central `EventBus` for decoupled service interactions
- Object pooling and garbage collection for performance optimization
- Layered architecture: core infrastructure → systems → services → utilities

## Layers

**Core Infrastructure Layer:**
- Purpose: Foundation services and resource management
- Location: `src/core/`
- Contains: DI container, event bus, object pools, garbage collection, random service, service utilities
- Depends on: None (foundational)
- Used by: All other layers

**System Layer (Game Systems):**
- Purpose: Domain-specific game logic (player, enemies, physics, combat, rendering, UI)
- Location: `src/modules/`
- Contains: PlayerSystem, EnemySystem, CombatSystem, PhysicsSystem, RenderingSystem, UISystem, AudioSystem, EffectsSystem, and others (12+ systems)
- Depends on: Core infrastructure, event bus, random service, other systems via DI
- Used by: Main application loop in `app.js`

**Service Layer:**
- Purpose: Specialized high-level services for game session management, command queuing, and procedural generation
- Location: `src/services/`
- Contains: GameSessionService, CommandQueueService, CrackGenerationService
- Depends on: Core infrastructure, systems
- Used by: Application bootstrapping and game systems

**Data Layer:**
- Purpose: Configuration, constants, and game data definitions
- Location: `src/data/`
- Contains: Game constants (physics, gameplay, visual), enemy configurations, ship models, upgrade definitions, UI layouts, settings schema
- Depends on: None (data only)
- Used by: Systems, modules, and configurations

**Utilities Layer:**
- Purpose: Helper functions and reusable utilities
- Location: `src/utils/`
- Contains: Math helpers, vector helpers, graphics utilities, performance monitoring, state management, debug logging
- Depends on: Core constants
- Used by: Systems and modules

**Bootstrap Layer:**
- Purpose: Service initialization and manifest configuration
- Location: `src/bootstrap/`
- Contains: Service manifest definitions, bootstrap orchestration, pool configuration, service setup
- Depends on: All layers (orchestrates initialization)
- Used by: Application initialization in `app.js`

## Data Flow

**Initialization Flow:**
1. `app.js` initializes canvas and game state
2. DIContainer created and populated with service factories via ServiceRegistry
3. bootstrapServices() resolves services, establishing DI graph
4. GameSessionService handles random seeding and state initialization
5. All systems' `initialize()` and `setupEventListeners()` hooks called
6. Cache warmup for render components and projectile caches
7. RequestAnimationFrame begins game loop

**Game Loop Flow:**
1. `gameLoop()` calls `updateGame()` and `renderGame()` each frame
2. `updateGame()` calls each system's `update(deltaTime)` in sequence:
   - InputSystem reads keyboard/game state
   - PlayerSystem updates ship position, rotation, weapons
   - EnemySystem spawns waves and updates enemy positions
   - PhysicsSystem calculates collisions and movements
   - CombatSystem processes projectiles and hits
   - XPOrbSystem manages drop collection
   - HealthHeartSystem manages health items
   - ProgressionSystem handles level-ups and upgrade selection
   - UISystem updates UI state and visuals
   - AudioSystem manages audio playback
   - EffectsSystem updates particle effects
   - WorldSystem manages world state
3. `renderGame()` calls RenderingSystem to draw everything to canvas
4. Performance metrics cached every 5 frames, metrics synced after render

**Event Communication Flow:**
- System A emits event: `eventBus.emit('event-name', data)`
- EventBus broadcasts to all registered listeners for that event
- System B has pre-registered listener via `registerEventListener('event-name', handler)`
- BaseSystem tracks all registered listeners for automatic cleanup on destroy

**State Synchronization:**
- GameSessionService acts as source of truth for pause state, screen transitions
- Legacy gameState object synchronized with GameSessionService every 100ms (lazy sync)
- Cache invalidation on screen-changed, pause-state-changed, session-state-changed events

## Key Abstractions

**DIContainer (Dependency Injection Container):**
- Purpose: Singleton service registry and factory resolver
- Examples: `src/core/DIContainer.js`
- Pattern: Factory pattern with lazy initialization, singleton caching, circular dependency detection
- Key methods: `register(name, factory, options)`, `resolve(name)`, `has(name)`, `validate()`

**BaseSystem:**
- Purpose: Common infrastructure for game systems reducing boilerplate
- Examples: PlayerSystem, EnemySystem, CombatSystem, PhysicsSystem (extend BaseSystem)
- Pattern: Template method pattern with hooks for initialize, setupEventListeners, onReset, onDestroy
- Features: Service caching, random fork management, event listener tracking, performance monitoring

**EventBus:**
- Purpose: Decoupled publish-subscribe messaging
- Examples: `src/core/EventBus.js`, referenced as 'event-bus' service
- Pattern: Observer pattern with event name → listeners array mapping
- Key methods: `on(eventName, callback)`, `emit(eventName, data)`, `emitSilently(eventName, data)`, `off(eventName, callback)`

**ObjectPool & GamePools:**
- Purpose: Memory-efficient object reuse for high-frequency allocations
- Examples: `src/core/ObjectPool.js`, `src/core/GamePools.js` (pool manager)
- Pattern: Object pool pattern with pre-allocated arrays and reuse markers
- Manages: bullets, particles, asteroids, XP orbs, shockwaves, temporary objects

**RandomService:**
- Purpose: Deterministic random number generation with fork/seed support
- Examples: `src/core/RandomService.js`
- Pattern: PRNG wrapper with seed-based reproducibility for replay/testing
- Features: Fork creation for scoped randomness, seed capture/reset for determinism

**GameSessionService:**
- Purpose: Game session state management and random number coordination
- Examples: `src/services/GameSessionService.js`
- Pattern: Service locator with state coordination
- Responsibilities: Seed derivation, random scope coordination, pause/screen state management, state snapshots

## Entry Points

**Application Entry:**
- Location: `src/app.js`
- Triggers: DOMContentLoaded event
- Responsibilities:
  - Initialize canvas and 2D context
  - Setup DI container and service bootstrap
  - Initialize debug logging and math.random guard
  - Start game loop via requestAnimationFrame

**Game Loop Entry:**
- Location: `gameLoop()` in `src/app.js`
- Triggers: requestAnimationFrame
- Responsibilities:
  - Delta time calculation and performance monitoring
  - Call updateGame() to tick all systems
  - Call renderGame() to draw frame
  - Metrics collection and cache invalidation

**System Update Entry:**
- Location: Each system's `update(deltaTime)` method
- Triggers: Called from updateGame() in app.js
- Responsibilities: System-specific state updates and logic

**Rendering Entry:**
- Location: `RenderingSystem.render(ctx)` in `src/modules/RenderingSystem.js`
- Triggers: Called from renderGame() in app.js
- Responsibilities: Canvas drawing and visual composition

## Error Handling

**Strategy:** Defensive try-catch with graceful degradation

**Patterns:**
- DIContainer resolution wrapped in try-catch with circular dependency detection and error logging
- EventBus listener execution wrapped to prevent one listener crashing others
- Service bootstrap with early exit if DI initialization fails
- GameSessionService with fallback to legacy gameState if service unavailable
- Feature flag guards for experimental/optional systems
- Lazy sync with fallback to raw state if synchronization fails

## Cross-Cutting Concerns

**Logging:**
- GameDebugLogger (development mode only) logs to localStorage and provides console download
- SystemName-prefixed console logs for identification
- Debug mode enabled via CLAUDE.md development environment detection
- Event-based toggle for enabling/disabling logging per system

**Validation:**
- DIContainer validates dependency graph on initialization
- ServiceRegistry.setupServices checks all manifest services register correctly
- GameSessionService validates random seed derivation
- ObjectPool validates reuse markers before returning objects

**Authentication:** Not applicable (single-player game)

**Performance Monitoring:**
- PerformanceMonitor tracks frame timing and system metrics
- Cache-aware metric collection every 5 frames to reduce overhead
- Performance overlay (F3 toggle) shows real-time metrics in development
- Auto-logging to localStorage every 10 seconds in development
- Combat system tracks projectile update/render timing separately

**Determinism & Reproducibility:**
- RandomService provides seed-based deterministic random generation
- GameSessionService manages random scope coordination for system isolation
- Feature flags control legacy behavior for migration (asteroid spawn, positioning, sizing)
- Math.random guard in dev mode detects and warns about improper RNG usage
