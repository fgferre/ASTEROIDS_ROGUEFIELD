# External Integrations

**Analysis Date:** 2026-03-09

## APIs & External Services

**Third-party Web APIs:**
- Google Fonts API - CSS font delivery via `https://fonts.googleapis.com` (Orbitron, Rajdhani families)
  - Preconnect: `https://fonts.googleapis.com`, `https://fonts.gstatic.com`
  - Used in `src/index.html` for typography

**Note:** No traditional REST APIs, third-party SDKs, or external service integrations detected. Game is fully self-contained client-side.

## Data Storage

**Local Client Storage:**
- LocalStorage (browser API)
  - Used by `src/modules/SettingsSystem.js` for settings persistence
  - Storage key: Configurable via `this.storageKey` (default pattern observed)
  - Data persisted: User settings and configuration
  - Fallback: Graceful degradation if LocalStorage unavailable (check in `SettingsSystem.js` line ~330)

**In-Memory Storage:**
- `src/core/GamePools.js` - Object pooling for entity reuse
- `src/core/ObjectPool.js` - Generic pool management
- Service registry via `DIContainer` - Singleton pattern for all game services
- Game state in `src/app.js` - `gameState` object holds canvas, context, UI refs, session state

**Caching:**
- `src/modules/AudioCache.js` - Audio buffer cache for synthesized sounds
- `src/modules/AudioPool.js` - Reusable Web Audio nodes
- `src/core/GradientCache.js` - Canvas gradient caching for rendering
- `src/modules/MenuBackgroundSystem.js` - Three.js geometry and material caching
- Service cache in `src/app.js` - `servicesCache` object with lazy initialization (line ~64-76)

## File Storage

**Local Filesystem Only:**
- No cloud storage integration
- No file upload/download (except debug log download via `downloadDebugLog()` in dev mode)
- Static assets bundled with Vite build

## Authentication & Identity

**Auth Provider:**
- None - No user authentication system
- Game is single-player, local-only
- No user accounts or identity management

## Monitoring & Observability

**Error Tracking:**
- None detected - No error reporting service (Sentry, Rollbar, etc.)

**Logs:**
- Client-side console logging via `console.log/warn/error`
- Custom debug logging system: `src/utils/dev/GameDebugLogger.js`
  - Methods: `init()`, `log()`, `download()`, `clear()`, `getLogContent()`
  - Dev mode only (check `isDevEnvironment()`)
  - Persisted to localStorage with `GameDebugLogger.sessionStart` tracking
  - Accessible via `window.downloadDebugLog()`, `window.showDebugLog()`, `window.clearDebugLog()` in dev
- Performance monitoring: `src/utils/PerformanceMonitor.js`
  - FPS, memory, frame timing, system metrics
  - Overlay toggle: F3 key
  - Auto-logging every 10 seconds in dev mode
  - Accessible via `window.performanceMonitor`
- Stats.js overlay - Real-time FPS/memory panel (enabled via `src/public/libs/Stats.min.js`)

## Web Audio API

**Audio System:**
- Web Audio API (standard browser API, not external service)
- Implementation: `src/modules/AudioSystem.js`
- `AudioContext` or `webkitAudioContext` (Safari fallback)
- Audio subsystems:
  - `src/modules/AudioPool.js` - Pooled oscillators, gains, filters
  - `src/modules/AudioCache.js` - Buffer caching
  - `src/modules/AudioBatcher.js` - Batch rendering of audio
- Deterministic audio synthesis for thruster loops, weapon fire, impacts
- Used by: Player, enemies, combat system, UI feedback

## CI/CD & Deployment

**Hosting:**
- GitHub Pages
  - Base path: `/ASTEROIDS_ROGUEFIELD/` (see `vite.config.js`)
  - Static site deployment from `dist/` directory

**Build Pipeline:**
- Vite build: `npm run build` → outputs to `../dist`
- No automated CI/CD service detected (no GitHub Actions workflows for auto-deploy found in `.github/workflows/`)

## Session Management

**Game Session:**
- `src/services/GameSessionService.js` - Manages game state, seeding, random scope
  - Methods: `initialize()`, `deriveInitialSeed()`, `getScreen()`, `isPaused()`, `isRunning()`, `synchronizeLegacyState()`, `getRandomSnapshot()`, `prepareRandomForScope()`
  - Persists last seed to localStorage via `persistLastSeed()`
  - Deterministic random generation via scoped RandomService

**Retries & Death State:**
- Death snapshot in `src/app.js` - `gameState.deathSnapshot` for retry functionality
- Seed persistence for reproducible runs

## Environment Configuration

**Required env vars:**
- None - No `.env` file used

**Configuration sources:**
- Feature flags: `src/data/constants/gameplay.js`
  - USE_WAVE_MANAGER, WAVEMANAGER_HANDLES_ASTEROID_SPAWN, WAVE_BOSS_INTERVAL, PRESERVE_LEGACY_SIZE_DISTRIBUTION, PRESERVE_LEGACY_POSITIONING, STRICT_LEGACY_SPAWN_SEQUENCE
- Physics constants: `src/data/constants/physics.js`
- Game constants: `src/core/GameConstants.js`
- Settings storage: LocalStorage via `SettingsSystem.js`

**Secrets location:**
- Not applicable - No API keys, credentials, or secrets in codebase
- Game is stateless and single-player

## Random Number Generation

**Random Service:**
- `src/core/RandomService.js` - Custom seeded random implementation
- Deterministic per-session via seed
- Fork-based scoping: `getRandomFork(name)` for isolated random streams
- Used throughout game for weapon variation, asteroid spawning, particle effects, enemy behavior

## Webhooks & Callbacks

**Incoming:**
- None - Game has no server-side backend

**Outgoing:**
- None - Game generates no external API calls

**Event-Driven:**
- Internal event bus: `src/core/EventBus.js`
- Events: `screen-changed`, `pause-state-changed`, `session-state-changed`, and game-specific events
- Used for cache invalidation and state synchronization

---

*Integration audit: 2026-03-09*
