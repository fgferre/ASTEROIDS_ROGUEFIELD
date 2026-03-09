# Technology Stack

**Analysis Date:** 2026-03-09

## Languages

**Primary:**
- JavaScript (ES6+ modules) - All game logic, systems, and utilities
- HTML5 - Entry point and UI structure in `src/index.html`
- CSS3 - Styling in `src/style.css`

## Runtime

**Environment:**
- Node.js 22.19.0 - Development and build tooling
- Browser (modern Web APIs) - Client execution

**Package Manager:**
- npm 10.9.3 - Dependency management
- Lockfile: `package-lock.json` present (v3)

## Frameworks

**Core:**
- Vite 5.2.11 - Build tool and dev server
- Vitest 3.2.4 - Unit and integration testing framework (configured in `vite.config.js`)

**Graphics & Animation:**
- Three.js (r128) - Loaded via `src/public/libs/three.min.js`
  - Used by `MenuBackgroundSystem` for menu background rendering
  - Post-processing: EffectComposer, RenderPass, ShaderPass, CopyShader, LuminosityHighPassShader, UnrealBloomPass, SMAAPass
  - All Three.js components in `src/public/libs/three-examples/`
- GSAP (GreenSock Animation Platform) - Loaded via `src/public/libs/gsap.min.js` for UI animations
- Canvas 2D API - Main game rendering in `src/modules/MenuBackgroundSystem.js` and render systems

**Physics:**
- Cannon.js - Loaded via `src/public/libs/cannon.min.js`
  - Referenced in `MenuBackgroundSystem` for physics simulation
  - Physics calculations handled by `src/modules/PhysicsSystem.js`

**Development & Build:**
- Grunt 1.6.1 - Task runner (grunt, grunt-cli, grunt-contrib-clean, grunt-contrib-copy)
- Prettier 3.2.5 - Code formatting (config: `.prettierrc.json`)
- Nodemon 3.1.10 - Development watch mode

**Monitoring:**
- Stats.js - Loaded via `src/public/libs/Stats.min.js` for performance metrics overlay

**Icons/Assets:**
- Lucide Icons - Loaded via `src/public/libs/lucide.min.js` for UI icons

## Key Dependencies

**Critical:**
- Vite - Module bundling and dev server; base path configured for GitHub Pages (`/ASTEROIDS_ROGUEFIELD/`)
- Vitest - Test running with Node environment, globals enabled, setupFiles: `tests/__helpers__/global-setup.js`
- Three.js r128 - 3D graphics for menu background with UnrealBloom and SMAA post-processing
- GSAP - Smooth animations throughout UI system
- Cannon.js - Physics engine for menu background effects

**Infrastructure:**
- Prettier - Enforces code style (semi: true, singleQuote: true, trailingComma: es5, printWidth: 80, tabWidth: 2)
- Lucide - SVG icon library for UI components
- Stats.js - Real-time FPS and memory monitoring overlay

## Configuration

**Environment:**
- No `.env` file present - Configuration handled via `src/data/constants/` and module params
- LocalStorage API - Used for settings persistence in `SettingsSystem.js` and debug logging
- Feature flags in `src/data/constants/gameplay.js` (USE_WAVE_MANAGER, WAVEMANAGER_HANDLES_ASTEROID_SPAWN, etc.)

**Build:**
- Vite config: `vite.config.js`
  - Root: `src/`
  - Base path: `/ASTEROIDS_ROGUEFIELD/` (GitHub Pages)
  - Output: `dist/`
  - Dev port: 5500
  - Test root: project root
  - Test globals: true
  - Test environment: node

**Prettier Config (.prettierrc.json):**
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 80,
  "tabWidth": 2,
  "endOfLine": "auto"
}
```

## Platform Requirements

**Development:**
- Node.js 22+ required
- npm 10+ recommended
- Modern browser with WebGL, Web Audio API, Canvas 2D support

**Production:**
- Static hosting (GitHub Pages via `/ASTEROIDS_ROGUEFIELD/` base path)
- Browser support: Chrome, Firefox, Safari, Edge (WebGL, ES6+, Web Audio)

## External Assets

**Fonts (Google Fonts):**
- Orbitron (400, 600, 700, 900) - Title and heading font
- Rajdhani (500, 700) - UI text font
- Loaded via CDN preconnect in `src/index.html`

**Libraries (Local CDN via `/libs/`):**
- three.min.js (Three.js rendering engine)
- three-examples/* (Post-processing passes)
- cannon.min.js (Physics engine)
- gsap.min.js (Animation library)
- Stats.min.js (Performance monitoring)
- lucide.min.js (Icon library)

---

*Stack analysis: 2026-03-09*
