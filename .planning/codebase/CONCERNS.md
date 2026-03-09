# Codebase Concerns

**Analysis Date:** 2026-03-09

## Code Size & Complexity

**Module File Size:**
- **AudioSystem.js** (4,458 lines) - Monolithic audio engine with Web Audio API
  - Issue: Combines audio loop management, batching, caching, effects, and synthesis in single file
  - Files: `src/modules/AudioSystem.js`
  - Impact: Difficult to test, high cognitive load, changes risk cascading failures
  - Fix approach: Extract ThrusterLoopManager, effects synthesis, and batcher into separate classes; establish clear internal interfaces

- **MenuBackgroundSystem.js** (4,436 lines) - Menu background with starfield and parallax
  - Issue: Single file handles rendering, animation, particle systems, shader effects
  - Files: `src/modules/MenuBackgroundSystem.js`
  - Impact: Testing individual components impossible, maintenance burden high
  - Fix approach: Extract particle manager, shader system, parallax controller into modules

- **EffectsSystem.js** (4,413 lines) - Particle effects and visual feedback
  - Issue: Mixed concerns: particle pools, rendering, physics, lifecycle management
  - Files: `src/modules/EffectsSystem.js`
  - Impact: Particle effect additions require understanding entire system; fragile
  - Fix approach: Extract particle types into separate classes; consolidate rendering into RenderComponent pattern

- **EnemySystem.js** (3,989 lines) - Enemy spawning, management, and wave control
  - Issue: Core gameplay loop dependency; tightly coupled with WaveManager, EnemyFactory, and subsystems
  - Files: `src/modules/EnemySystem.js`
  - Impact: Any change risks wave progression, balance, or spawn behavior
  - Fix approach: Extract spawn strategy pattern; move wave logic fully to WaveManager

- **WaveManager.js** (3,075 lines) - Wave progression and enemy spawning rules
  - Issue: Encapsulates entire wave algorithm plus spawning coordination
  - Files: `src/modules/enemies/managers/WaveManager.js`
  - Impact: Balance tuning difficult; hard to test different progression curves
  - Fix approach: Extract progression curve calculation into data-driven config; separate spawn dispatch

## Type Safety & Validation

**Lack of TypeScript:**
- All source is ES6 JavaScript with JSDoc type hints
- Issue: No compile-time type checking; runtime errors possible on type mismatches
- Files: `src/**/*.js`
- Impact: Refactoring risky without strong IDE support; harder to catch API contract violations
- Current mitigation: JSDoc provides some IDE hints
- Recommendations: Consider gradual TypeScript migration starting with critical files (DIContainer, services)

**Any Types in JSDoc:**
- Multiple `/** @type {any} */` annotations present in core files
- Files: `src/core/DIContainer.js` (Map<string, any>), `src/core/ServiceRegistry.js`
- Impact: Type system circumvented in service resolution; no enforcement of service contracts
- Fix approach: Replace with generic templates: `Map<string, IService>` or union types

## Memory Management

**Web Audio Node Lifecycle:**
- AudioSystem manages oscillators, gains, filters without guaranteed cleanup
- Issue: AudioContext nodes created but not always disconnected on stop
- Files: `src/modules/AudioSystem.js` (lines 35-100+)
- Impact: Audio memory leaks possible on long play sessions; AudioContext can reach resource limits
- Current mitigation: Pool pattern via AudioPool.js
- Recommendations: Add explicit node.disconnect() calls in all stop/cleanup paths; audit ThrusterLoopManager.stopLoop()

**Object Pool Tuning Fragile:**
- GamePools.js with auto-tuning; cleanup deferred to GarbageCollectionManager
- Issue: Pool sizing heuristics not well-documented; potential under/over-allocation
- Files: `src/core/GamePools.js`, `src/core/GarbageCollectionManager.js`
- Impact: Memory spikes if pools sized too small; waste if sized too large
- Fix approach: Add metrics logging; establish pool thresholds; document heuristics

**Canvas ImageData Accumulation:**
- GradientCache and pattern caches use LRU eviction
- Issue: Cache size limits hardcoded; no monitoring of actual memory pressure
- Files: `src/core/GradientCache.js` (cleanup at lines 323, 342, 361)
- Impact: On low-memory devices, caches may grow unbounded between GC cycles
- Fix approach: Track canvas size in bytes; implement size-based eviction policy

## Rendering Pipeline

**Canvas Context State Mutations:**
- Direct `ctx.globalAlpha`, `ctx.globalCompositeOperation` changes scattered across files
- Files: `src/modules/EffectsSystem.js`, `src/modules/CombatSystem.js`, `src/modules/enemies/components/RenderComponent.js`
- Impact: Rendering order sensitivity; easy to break visual layers if code reordered
- Fix approach: Create RenderState wrapper to manage context mutations; use stack for alpha/composite

**Multiple Rendering Passes:**
- Enemies, effects, UI, projectiles all render independently via RenderingSystem.render()
- Issue: No depth sorting; overdraw not optimized
- Files: `src/modules/RenderingSystem.js`
- Impact: Performance ceiling hit with many entities; visual artifacts if z-order changes
- Fix approach: Implement spatial sorting by y-coordinate or explicit depth layer system

## Console & Debug Logging

**High Console Output:**
- 461 console.* calls across codebase (console.log, console.warn, console.table)
- Files: `src/app.js`, `src/core/BaseSystem.js`, `src/modules/AudioSystem.js`, many others
- Impact: Prod builds may log extensively; performance overhead in DevTools-heavy environments
- Current mitigation: debugLogging system with preference toggle
- Recommendations: Remove console.log from prod paths; audit all console calls for sensitive data

**Debug Flag Exposure to Window:**
- `window.__AUDIO_RANDOM_DEBUG__`, `window.downloadDebugLog()` exposed in dev
- Files: `src/modules/AudioSystem.js` (line 3363), `src/app.js` (lines 136-139)
- Impact: Debug hooks could be called from console in prod if not properly gated
- Fix approach: Ensure all window.* debug methods check `isDevEnvironment()` guard

## Error Handling

**Silent Failures in Service Resolution:**
- DIContainer.resolve() can return null if service not registered; callers must check
- Files: `src/core/DIContainer.js`, `src/core/serviceUtils.js`
- Impact: Null pointer errors downstream if service missing
- Recommendations: Throw clear error on missing service; log service resolution stack trace

**Try-Catch Swallowing Errors:**
- Multiple nested try-catch blocks in app.js without re-throw or logging
- Files: `src/app.js` (lines 182-221, 341-343, 438-452)
- Impact: Silent failures in game initialization; hard to debug
- Fix approach: Log caught errors before swallowing; re-throw if unrecoverable

**No Validation on Pool Return:**
- ObjectPool.return() doesn't validate object state before re-use
- Files: `src/core/ObjectPool.js`
- Impact: Corrupted objects can persist if return() called with modified state
- Fix approach: Add reset() validation hook per pool; assert clean state on acquire

## State Management

**Global Game State Object:**
- `gameState` object in app.js holds screen, isPaused, canvas, etc.
- Files: `src/app.js` (lines 35-48)
- Impact: Central mutation point; hard to track state changes
- Current mitigation: Some state via services; DIContainer inversion of control
- Recommendations: Migrate remaining gameState to StateManager or service-based pattern

**Snapshot Serialization Issues:**
- `deathSnapshot` and random snapshot used for retry; deepClone() used
- Files: `src/app.js` (line 43), `src/utils/StateManager.js`
- Impact: deepClone() not guaranteed to handle all object types; circular refs possible
- Fix approach: Use JSON round-trip for safe serialization; document which objects are serializable

## Randomness & Determinism

**Direct Math.random() Calls:**
- 30 instances of `Math.random()` found despite RandomService singleton
- Files: Scattered across `src/` (should all use RandomService)
- Impact: Replay/debugging impossible if some RNG not seeded; makes deterministic testing fragile
- Fix approach: Replace all Math.random() with RandomService calls; grep for regressions

**Random Scope Seeding:**
- Multiple random scopes (spawn, variants, fragments) with manual seed management
- Files: `src/modules/EnemySystem.js` (lines 93-98)
- Impact: Interdependencies between random scopes not clear; potential for skew
- Fix approach: Document seed dependency graph; centralize seed initialization

## Game Balance & Configuration

**Magic Numbers in Code:**
- Frequencies, gains, durations hardcoded in AudioSystem
  - Lines 72-90: baseFreq, filterCutoff values embedded
  - Impact: Tuning requires code edits + recompile
- Asteroid spawn rates in EnemySystem constants
- Upgrade multipliers scattered across upgrade modules

- Fix approach: Move all game constants to `src/data/constants/` files; reference from modules

**Upgrade System Complexity:**
- UpgradeSystem.js (890 lines) manages 50+ upgrades with interdependencies
- Files: `src/modules/UpgradeSystem.js`, `src/data/upgrades/`
- Impact: Balance changes cascade; no isolation between upgrade effects
- Fix approach: Implement upgrade modifier stack system; test each upgrade in isolation

## Security Considerations

**localStorage Used for Settings & Debug Logs:**
- Settings and game progress stored in localStorage without validation
- Files: `src/modules/SettingsSystem.js`, `src/core/debugLogging.js`
- Risk: Malicious script injection via XSS could tamper with progress; no encryption
- Current mitigation: No sensitive data (no passwords, no tokens)
- Recommendations: Validate localStorage data on load; consider IndexedDB for larger data

**Fetch Used Without Error Handling:**
- MenuBackgroundSystem fetches NASA data without timeout
- Files: `src/modules/MenuBackgroundSystem.js` (lines 1457-1507)
- Risk: Network request could hang; no CORS headers validated
- Fix approach: Add fetch timeout; validate response headers; fail gracefully

**Window Global Access:**
- AudioContext accessed via window.AudioContext || window.webkitAudioContext
- Files: `src/modules/AudioSystem.js` (line 492)
- Impact: Assumes window exists; could break in workers or non-browser environments
- Fix approach: Encapsulate in feature detection function; return null if unavailable

## Testing & Verification

**45 Test Files Present, Coverage Unknown:**
- Test suite covers: core, modules, integration, balance, physics, visual
- Files: `tests/`
- Gap: No explicit coverage metrics; no pre-commit hook enforcing test passage
- Recommendations: Add coverage enforcement (80%+ threshold); add pre-commit hook

**Enemy System Behavior Complex to Test:**
- WaveManager, EnemyFactory, EnemySystem interdependent; unit tests difficult
- Files: `src/modules/EnemySystem.js`, `src/modules/enemies/`
- Risk: Regressions in wave progression, spawn rates, enemy AI not caught until play-test
- Fix approach: Extract spawn strategy into testable interfaces; mock WaveManager for EnemySystem tests

**Visual Rendering Not Tested:**
- EffectsSystem particles, CombatSystem projectiles, RenderComponent visuals not validated by tests
- Files: `src/modules/EffectsSystem.js`, `src/modules/CombatSystem.js`, `src/modules/enemies/components/RenderComponent.js`
- Risk: Visual bugs (particle leaks, artifacts) only found by manual play
- Fix approach: Add visual regression tests; baseline screenshot comparisons

## Performance Bottlenecks

**Audio Loop Frequency Updates:**
- ThrusterLoopManager updates oscillator frequencies every frame if intensity changes
- Files: `src/modules/AudioSystem.js` (update loop ~170+ lines)
- Problem: Setters on Web Audio nodes are expensive; potentially 60+ per frame in heavy use
- Cause: No batching of frequency updates; checking for changes every frame
- Improvement path: Batch frequency updates; use delta time threshold before applying

**Spatial Hash Collision Queries:**
- SpatialHash used for collision detection; unclear if gridding efficient for game scale
- Files: `src/core/SpatialHash.js`
- Problem: Query performance not benchmarked; potential O(n) fallback in large collision sets
- Improvement path: Profile spatial hash cell density; tune grid size; benchmark against quadtree

**Effect System Particle Iteration:**
- EffectsSystem.update() iterates all particles every frame for alpha, position, lifetime
- Files: `src/modules/EffectsSystem.js` (lines 1000+)
- Problem: No spatial culling; all particles processed even if off-screen
- Improvement path: Cull particles outside viewport; use Vec2 pool for positions to avoid allocations

**Canvas Draw Calls:**
- Each enemy drawn with potential multiple draw calls (fill + stroke + glow)
- Files: `src/modules/enemies/components/RenderComponent.js`
- Problem: No batching; each enemy = multiple state changes
- Improvement path: Batch rendering by type; use composite canvas or WebGL

## Dependencies at Risk

**Web Audio API Browser Support:**
- AudioContext requires modern browser; degradation path unclear
- Files: `src/modules/AudioSystem.js`
- Risk: Older browsers or strict CSP policies may block audio
- Mitigation: Check exists before accessing; silent no-op if unavailable
- Recommendation: Add feature detection; test on target browsers

**Three.js Shader Libraries:**
- SMAAPass, ShaderPass, RenderPass included in `src/public/libs/three-examples/`
- Risk: Large external code; potential security issues; license compliance check needed
- Impact: Minified/uncommented; hard to debug if issues arise
- Recommendation: Verify licenses; consider replacing with simpler custom shaders if weight issue

**Vitest & Test Dependencies:**
- vitest ^3.2.4, vite ^5.2.11
- Risk: Major version bumps could break test suite
- Mitigation: Pin versions in package-lock.json
- Recommendation: Monitor for security updates; test major version upgrades in isolation

## Missing Critical Features

**No Graceful Degradation for Audio:**
- If Web Audio fails, game continues silent; no warning to player
- Problem: Audio is core to game feel; silent failure poor UX
- Impact: Player may not realize audio broken
- Fix approach: Add audio initialization error callback; show warning in UI if audio unavailable

**No Save Game System:**
- Progress not persisted across sessions (only settings)
- Problem: Players must complete run in one session
- Impact: Limits play session length; breaks roguelike progression expectation
- Fix approach: Add checkpoint saves; serialize game state to localStorage or IndexedDB

**No Input Remapping:**
- Key bindings hardcoded in InputSystem
- Files: `src/modules/InputSystem.js`
- Problem: Players with non-US keyboards or accessibility needs cannot customize
- Fix approach: Extract key map to config; add UI for rebinding

## Test Coverage Gaps

**AudioSystem Untested:**
- No unit tests for ThrusterLoopManager, audio synthesis, or frequency scaling
- Files: `src/modules/AudioSystem.js`
- Risk: Audio changes (frequency, gain, timing) could break gameplay feel unnoticed
- Priority: High - audio is critical to game experience

**WaveManager Progression Untested:**
- Wave difficulty curve not validated by automated tests
- Files: `src/modules/enemies/managers/WaveManager.js`
- Risk: Balance changes silently degrade difficulty progression
- Priority: High - breaks core roguelike progression

**Combat System Targeting:**
- Enemy targeting AI, prediction, multishot spread not covered
- Files: `src/modules/CombatSystem.js`
- Risk: AI behavior changes break gameplay difficulty
- Priority: Medium - affects enemy challenge level

**Physics Interaction Edge Cases:**
- Collision response at screen edges; shield shockwave interactions not tested
- Files: `src/modules/PhysicsSystem.js`
- Risk: Exploitable movement glitches possible
- Priority: Medium - affects balance and fairness

**EffectsSystem Particle Cleanup:**
- Particle pool exhaustion; memory leak under high effect load not tested
- Files: `src/modules/EffectsSystem.js`
- Risk: Long play sessions could run out of particles or leak memory
- Priority: Medium - affects long-session stability

## Architecture Fragility

**Circular Dependency Risks:**
- 134 relative imports going up directories (`import ... from '../...'`)
- Files: All module files
- Risk: Refactoring module boundaries could introduce cycles
- Fix approach: Enforce module boundary rules; audit dependency graph

**Service Initialization Order:**
- Services registered in manifest; no explicit dependency ordering
- Files: `src/bootstrap/serviceManifest.js`, `src/core/ServiceRegistry.js`
- Risk: Service A depends on Service B, but B not yet initialized
- Impact: Difficult to debug; manifests as null pointer errors
- Fix approach: Explicit dependency declaration; validation pass before initialization

**BaseSystem Extension:**
- All game systems inherit from BaseSystem; unclear which methods must be overridden
- Files: `src/core/BaseSystem.js` (14+ methods), subclasses
- Risk: Missing method override causes inherited default behavior; hard to detect
- Fix approach: Mark abstract methods; add abstract method check in constructor

## Known Issues

**Console Warning on ThrusterLoopManager:**
- Already active loop check logs warning instead of throwing
- Files: `src/modules/AudioSystem.js` (lines 46-50)
- Symptom: "Loop already active for type" warning in console during normal play
- Cause: Multiple simultaneous stop/start calls possible
- Workaround: None; warning is side effect
- Recommendation: Investigate root cause; consider state machine for loop lifecycle

---

*Concerns audit: 2026-03-09*
