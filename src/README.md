# Source Code Overview

## Directory Structure
- `/core`: Infrastructure (EventBus, DIContainer, GameConstants, RandomService, pools)
- `/bootstrap`: Service manifest and initialization
- `/modules`: Game systems (EnemySystem, PlayerSystem, CombatSystem, etc.)
- `/modules/enemies`: Enemy subsystems (base, types, managers, components)
- `/data`: Configuration files (upgrades, ship models, settings schema)
- `/services`: High-level services (GameSessionService, CommandQueueService)
- `/utils`: Utilities (ScreenShake, PerformanceMonitor, random helpers)
- `/legacy`: Historical code preserved for reference
- `app.js`: Main orchestrator and game loop

## HTML Structure
`index.html` defines:
- Menu screen with background canvas
- Level-up screen for upgrade selection
- Pause screen with resume/settings/quit options
- Settings screen with tabbed interface
- Credits screen
- Game over screen with retry/restart/quit options
- Game UI with canvas and HUD regions (top-left, top-middle, top-right, bottom-left, bottom-center, bottom-right)
- Wave countdown overlay

**Global script loading (lines 313-314):** `EventBus.js` and `ServiceLocator.js` are loaded as modules before `app.js` to ensure availability throughout the application.

## CSS Architecture
`style.css` uses:
- **Design tokens:** CSS custom properties in `:root` for colors, spacing, typography, and timing
- **Component-based classes:** `.menu-screen`, `.levelup-content`, `.pause-content`, `.settings-container`, `.hud`, etc.
- **Utility classes:** `.hidden`, `.screen`, `.btn`, `.btn--primary`, `.btn--secondary`, `.btn--outline`
- **Responsive design:** Media queries for different viewport sizes
- **Accessibility:** ARIA attributes, focus states, keyboard navigation support

For detailed architecture patterns, see `docs/architecture/CURRENT_STRUCTURE.md`.
