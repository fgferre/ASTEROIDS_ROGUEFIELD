# Codebase Structure

**Analysis Date:** 2026-03-09

## Directory Layout

```
ASTEROIDS_ROGUEFIELD/
├── src/                              # All application source code
│   ├── app.js                        # Main application entry point and game loop
│   ├── index.html                    # HTML entry point
│   ├── bootstrap/                    # Service initialization and configuration
│   │   ├── bootstrapServices.js      # Service instantiation orchestrator
│   │   └── serviceManifest.js        # Service factory definitions and pool config
│   ├── core/                         # Core infrastructure and DI
│   │   ├── DIContainer.js            # Dependency injection container
│   │   ├── EventBus.js               # Event emitter and listener management
│   │   ├── GameConstants.js          # Game dimension constants (aggregator)
│   │   ├── GamePools.js              # Object pool manager for all pooled types
│   │   ├── ObjectPool.js             # Individual object pool implementation
│   │   ├── GarbageCollectionManager.js # Periodic cleanup and resource management
│   │   ├── RandomService.js          # Deterministic RNG with forking
│   │   ├── ServiceRegistry.js        # Service registration from manifest
│   │   ├── serviceUtils.js           # Helper functions for service resolution
│   │   ├── BaseSystem.js             # Base class for all game systems
│   │   ├── RenderBatch.js            # Rendering optimization/batching
│   │   ├── SpatialHash.js            # Spatial partitioning for collision detection
│   │   ├── CanvasStateManager.js     # Canvas rendering state management
│   │   ├── GradientCache.js          # Cached gradient generation
│   │   └── debugLogging.js           # Global debug logging configuration
│   ├── modules/                      # Game systems (12+ systems, extends BaseSystem)
│   │   ├── PlayerSystem.js           # Ship physics, movement, weapons
│   │   ├── EnemySystem.js            # Enemy spawning, AI, wave management
│   │   ├── CombatSystem.js           # Projectile tracking, hit detection, damage
│   │   ├── PhysicsSystem.js          # Collision detection, physics simulation
│   │   ├── ProgressionSystem.js      # Level-ups, XP tracking, upgrade selection
│   │   ├── UISystem.js               # Menu, HUD, UI state and rendering
│   │   ├── RenderingSystem.js        # Canvas drawing, composite rendering
│   │   ├── AudioSystem.js            # Audio playback, mixing, effects
│   │   ├── EffectsSystem.js          # Particle effects, visual feedback
│   │   ├── XPOrbSystem.js            # XP drop spawning and collection
│   │   ├── InputSystem.js            # Keyboard input handling
│   │   ├── WorldSystem.js            # Canvas wrapping and boundary logic
│   │   ├── SettingsSystem.js         # Game settings management
│   │   ├── UpgradeSystem.js          # Upgrade mechanics and progression
│   │   ├── MenuBackgroundSystem.js   # Main menu background animation
│   │   ├── collectibles/             # Collectible item systems
│   │   │   ├── HealthHeart.js        # Health item entity
│   │   │   └── HealthHeartSystem.js  # Health item spawning/collection
│   │   ├── enemies/                  # Enemy systems and components
│   │   │   ├── base/
│   │   │   │   ├── BaseEnemy.js      # Base class for all enemies
│   │   │   │   └── EnemyFactory.js   # Factory for creating enemy instances
│   │   │   ├── components/
│   │   │   │   ├── AsteroidCollision.js
│   │   │   │   ├── AsteroidRenderer.js
│   │   │   │   ├── RenderComponent.js
│   │   │   │   └── ... (other components)
│   │   │   ├── managers/
│   │   │   │   └── WaveManager.js    # Wave spawning and progression logic
│   │   │   ├── systems/
│   │   │   │   └── ... (system-specific enemy logic)
│   │   │   └── types/
│   │   │       └── ... (enemy type definitions)
│   │   ├── graphics/                 # Graphics and rendering utilities
│   │   └── ui/                       # UI-specific components
│   ├── services/                     # High-level application services
│   │   ├── GameSessionService.js     # Session state and random coordination
│   │   ├── CommandQueueService.js    # Command queuing and execution
│   │   └── CrackGenerationService.js # Procedural crack/damage generation
│   ├── data/                         # Configuration and game data
│   │   ├── constants/                # Gameplay, physics, visual constants
│   │   │   ├── gameplay.js           # Game mechanics config (waves, cooldowns, etc)
│   │   │   ├── physics.js            # Physics config (speed, damping, forces)
│   │   │   └── visual.js             # Visual config (colors, sizes, effects)
│   │   ├── enemies/                  # Enemy configuration data
│   │   │   ├── asteroid-configs.js   # Asteroid size/health/speed configs
│   │   │   ├── boss.js               # Boss enemy configuration
│   │   │   ├── drone.js              # Drone enemy configuration
│   │   │   ├── hunter.js             # Hunter enemy configuration
│   │   │   ├── mine.js               # Mine enemy configuration
│   │   │   └── schema.js             # Enemy data structure validation
│   │   ├── upgrades/                 # Upgrade system configuration
│   │   │   ├── categories.js         # Upgrade categories (offense, defense, etc)
│   │   │   ├── offense.js            # Weapon/damage upgrades
│   │   │   ├── defense.js            # Shield/health upgrades
│   │   │   ├── mobility.js           # Speed/movement upgrades
│   │   │   ├── utility.js            # Utility upgrades
│   │   │   └── index.js              # Aggregated upgrade definitions
│   │   ├── shipModels.js             # Ship model definitions and variants
│   │   ├── settingsSchema.js         # Settings validation schema
│   │   └── ui/
│   │       └── hudLayout.js          # HUD layout and positioning
│   ├── utils/                        # Utility functions and helpers
│   │   ├── mathHelpers.js            # Math operations (distance, angle, etc)
│   │   ├── vectorHelpers.js          # Vector math operations
│   │   ├── combatHelpers.js          # Combat calculation helpers
│   │   ├── randomHelpers.js          # Random generation utilities
│   │   ├── NeonGraphics.js           # Neon/glow rendering utilities
│   │   ├── PerformanceMonitor.js     # Performance tracking and display
│   │   ├── ScreenShake.js            # Screen shake effect manager
│   │   ├── StateManager.js           # Generic state management utility
│   │   ├── drawEnemyProjectile.js    # Enemy projectile rendering
│   │   ├── deepFreeze.js             # Object immutability utility
│   │   ├── AsteroidImpactEffect.js   # Asteroid impact visual effects
│   │   ├── AudioBatcher.js           # Audio batching for performance
│   │   ├── AudioCache.js             # Audio file caching
│   │   ├── AudioPool.js              # Audio context resource pooling
│   │   ├── DustParticleShader.js     # Particle shader implementation
│   │   └── dev/                      # Development-only utilities
│   │       ├── GameDebugLogger.js    # Debug logging to localStorage
│   │       └── mathRandomGuard.js    # Math.random usage detector
│   ├── styles/                       # CSS stylesheets
│   ├── public/                       # Static assets
│   │   ├── libs/                     # External libraries (Three.js, etc)
│   │   └── nasa/                     # NASA-related assets
│   └── __tests__/                    # Co-located test directory (legacy)
├── tests/                            # Test suite root
│   ├── __helpers__/                  # Test utilities and setup
│   │   ├── global-setup.js           # Vitest global setup
│   │   └── setup.js                  # Shared test fixtures and helpers
│   ├── __fixtures__/                 # Test data and fixtures
│   ├── core/                         # Core system tests
│   │   ├── DIContainer.test.js
│   │   ├── ObjectPool.test.js
│   │   ├── RandomService.test.js
│   │   ├── SpatialHash.test.js
│   │   └── ...
│   ├── balance/                      # Game balance and metrics tests
│   │   ├── asteroid-metrics/         # Asteroid spawn/wave testing
│   │   │   ├── determinism.test.js
│   │   │   ├── spawn-rates.test.js
│   │   │   └── ...
│   │   └── reward-mechanics.test.js
│   ├── integration/                  # Integration tests
│   │   ├── determinism/              # Deterministic behavior verification
│   │   │   ├── systems.test.js
│   │   │   └── ...
│   │   ├── gameplay/                 # Gameplay mechanics
│   │   │   └── mixed-enemy-waves.test.js
│   │   └── ...
│   ├── services/                     # Service layer tests
│   ├── physics/                      # Physics system tests
│   ├── rendering/                    # Rendering system tests
│   ├── progression/                  # Progression system tests
│   ├── audio/                        # Audio system tests
│   └── legacy/                       # Legacy/deprecated tests
├── docs/                             # Documentation
│   ├── architecture/                 # Architecture documentation
│   └── analysis/                     # Analysis documents
├── .planning/                        # GSD planning directory
│   └── codebase/                     # Codebase mapping documents
├── .claude/                          # Claude-specific configurations
│   ├── helpers/                      # Helper scripts
│   └── runtime/                      # Runtime state
├── tasks/                            # Task tracking
├── scripts/                          # Build and utility scripts
├── assets/                           # Game assets (sprites, audio, etc)
├── exported-assets/                  # Exported asset files
├── dist/                             # Build output directory
├── package.json                      # Project dependencies and scripts
├── vite.config.js                    # Vite build configuration
├── CLAUDE.md                         # Claude agent instructions
└── README.md                         # Project documentation
```

## Directory Purposes

**src/app.js:**
- Purpose: Application bootstrap and main game loop
- Contains: Initialization logic, game loop orchestration, service caching, performance monitoring
- Key functions: `init()`, `gameLoop()`, `updateGame()`, `renderGame()`

**src/bootstrap/:**
- Purpose: Service initialization and orchestration
- Contains: Service manifest (factory definitions), bootstrap function, pool configuration
- Key functions: `bootstrapServices()`, service factory creation

**src/core/:**
- Purpose: Foundational infrastructure and utilities
- Contains: DI system, event bus, object pools, random service, utilities
- Key exports: DIContainer, EventBus, GamePools, RandomService, BaseSystem

**src/modules/:**
- Purpose: Game systems implementing actual gameplay
- Contains: 12+ systems each with specific domain (player, enemies, physics, combat, UI, audio, effects, etc)
- Pattern: All extend BaseSystem, override initialize(), setupEventListeners(), update(deltaTime)

**src/services/:**
- Purpose: Application-level services (session management, command queuing, procedural generation)
- Contains: GameSessionService, CommandQueueService, CrackGenerationService
- Usage: Instantiated in bootstrap, accessed via DI container

**src/data/:**
- Purpose: Configuration and game balancing data
- Contains: Physics constants, gameplay constants, visual constants, enemy configs, upgrade definitions
- Usage: Imported by systems and modules for balancing, no side effects

**src/utils/:**
- Purpose: Reusable helper functions
- Contains: Math, vector, combat, rendering, audio, performance helpers
- Usage: Imported by systems and modules as needed

**tests/:**
- Purpose: Comprehensive test suite
- Contains: Unit tests for systems, integration tests for game mechanics, balance verification tests, determinism tests
- Organization: Mirrors src/ structure for easy navigation

**src/__tests__/:**
- Purpose: Legacy co-located tests (gradual migration to tests/)
- Contains: Some older tests in individual directories
- Status: Being phased out in favor of tests/ root-level organization

## Key File Locations

**Entry Points:**
- `src/app.js` - Application entry point (DOMContentLoaded event)
- `src/index.html` - HTML document root

**Configuration:**
- `package.json` - Dependencies, build scripts, project metadata
- `vite.config.js` - Build configuration and test setup
- `src/data/constants/*` - Game balancing constants
- `src/bootstrap/serviceManifest.js` - Service definitions
- `CLAUDE.md` - Agent instructions for Claude Code

**Core Logic:**
- `src/core/DIContainer.js` - Service registration and resolution
- `src/core/EventBus.js` - Event publishing and subscription
- `src/core/BaseSystem.js` - System base class with common patterns
- `src/modules/` - Game systems (PlayerSystem, EnemySystem, etc)

**Testing:**
- `tests/` - Root test directory
- `tests/__helpers__/setup.js` - Test fixtures and global setup
- `vite.config.js` - Test configuration (Vitest setup)

## Naming Conventions

**Files:**
- `[NameOfClass].js` - Class files (PascalCase): `PlayerSystem.js`, `DIContainer.js`
- `[camelCaseFunction].js` - Utility/function files (camelCase): `mathHelpers.js`, `vectorHelpers.js`
- `[kebab-case].test.js` - Test files: `DIContainer.test.js`, `asteroid-metrics.test.js`

**Directories:**
- Lowercase or camelCase: `src/core/`, `src/utils/`, `src/modules/`
- Domain-organized: `modules/enemies/`, `data/constants/`, `data/upgrades/`
- Functional grouping: `bootstrap/`, `services/`, `utils/dev/`

**Classes/Exports:**
- PascalCase: `PlayerSystem`, `BaseSystem`, `DIContainer`, `EventBus`
- Constants: UPPERCASE_WITH_UNDERSCORES: `GAME_WIDTH`, `SHIP_SIZE`, `DEFAULT_POOL_CONFIG`
- Functions: camelCase: `resolveService()`, `normalizeDependencies()`, `distance()`

**Events:**
- kebab-case with topic prefix: `'event-bus'`, `'screen-changed'`, `'pause-state-changed'`, `'player-hit'`
- System-specific: `'[system-name]-[event-name'`: `'player-died'`, `'asteroid-destroyed'`

## Where to Add New Code

**New Game System:**
- Implementation: `src/modules/[SystemName].js`
- Extend: BaseSystem with `systemName` and appropriate options
- Register: Add factory to `src/bootstrap/serviceManifest.js`
- Test: Create `tests/[system-name]/` directory with test files
- Constants: Add configuration to `src/data/constants/` if needed

**New Utility Function:**
- File: `src/utils/[purpose].js` or `src/utils/[category]/[purpose].js`
- Pattern: Pure functions or static class with no side effects
- Export: Named exports (avoid default export)
- Test: Create `tests/utils/` test file if critical

**New Enemy Type:**
- Definition: `src/data/enemies/[type].js` (e.g., `src/data/enemies/mine.js`)
- Factory logic: Add to `src/modules/enemies/base/EnemyFactory.js`
- Rendering: Create component in `src/modules/enemies/components/`
- Wave spawn: Configure in `src/modules/enemies/managers/WaveManager.js`
- Tests: Add balance tests in `tests/balance/`

**New Upgrade:**
- Definition: `src/data/upgrades/[category].js` (offense, defense, mobility, utility)
- System: Update `src/modules/ProgressionSystem.js` to apply upgrade
- Category: List in `src/data/upgrades/categories.js`
- Index: Export from `src/data/upgrades/index.js`

**New Constant:**
- Physics: `src/data/constants/physics.js`
- Gameplay: `src/data/constants/gameplay.js`
- Visual: `src/data/constants/visual.js`
- Import in: `src/core/GameConstants.js` (aggregator)

**Test File:**
- Location: `tests/[category]/[subject].test.js`
- Setup: Import helpers from `tests/__helpers__/setup.js`
- Pattern: Vitest with describe/it blocks, use fixtures from `tests/__fixtures__/`

## Special Directories

**src/public/:**
- Purpose: Static assets served directly
- Generated: No
- Committed: Yes (contains Three.js libs, NASA data)

**dist/:**
- Purpose: Build output directory
- Generated: Yes (by `npm run build`)
- Committed: No (listed in .gitignore)

**src/node_modules/ and node_modules/:**
- Purpose: Installed dependencies
- Generated: Yes (by npm install)
- Committed: No (listed in .gitignore)

**src/__tests__/:**
- Purpose: Legacy co-located tests
- Generated: No
- Committed: Yes (gradual migration in progress)
- Migration: Moving to `tests/` root directory structure

**.planning/codebase/:**
- Purpose: GSD planning and codebase analysis documents
- Generated: Yes (by GSD analysis commands)
- Committed: Yes (reference for future work)
- Contents: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, STACK.md, INTEGRATIONS.md, CONCERNS.md

**.claude/:**
- Purpose: Claude-specific configuration and helper scripts
- Generated: Yes (evolves over time)
- Committed: Yes
- Contents: Runtime configuration, mode detection, hook scripts, helper utilities
