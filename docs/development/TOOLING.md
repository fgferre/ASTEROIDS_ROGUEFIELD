# Development Tooling

## Build & Development

### Vite
- **Purpose:** Fast development server with HMR (Hot Module Replacement)
- **Commands:**
  - `npm run dev`: Start development server at `http://localhost:5173`
  - Automatically injects `process.env.NODE_ENV = 'development'`
  - Enables debug logging via `GameDebugLogger`
- **Configuration:** `vite.config.js`

### Grunt
- **Purpose:** Build automation and file copying
- **Commands:**
  - `npm run build`: Execute build tasks
- **Configuration:** `Gruntfile.cjs`
- **Tasks:** `grunt-contrib-clean`, `grunt-contrib-copy`

## Code Quality

### Prettier
- **Purpose:** Consistent code formatting
- **Commands:**
  - `npm run format`: Format all files
  - `npm run format:check`: Check formatting without modifying
- **Configuration:** `.prettierrc.json`, `.prettierignore`

## Testing

### Vitest
- **Purpose:** Unit and integration testing
- **Commands:** See `tests/README.md` for complete list
  - `npm test`: Run all tests
  - `npm run test:watch`: Watch mode
  - `npm run test:ui`: Visual interface
  - `npm run test:coverage`: Coverage report
  - `npm run test:core`, `test:modules`, `test:utils`, `test:services`, `test:integration`, `test:balance`, `test:visual`, `test:physics`: Category-specific tests
- **Configuration:** `vite.config.js` (test section)
- **Documentation:** `tests/README.md`, `tests/OPTIMIZATION_GUIDE.md`

## CI/CD

### GitHub Actions
- **Workflows:**
  - Format check: Runs `prettier --check` on push/PR
  - Build validation: Runs `npm run build` on push/PR
  - Dependency validation: Runs `npm run analyze:deps` when `src/**/*.js` or `scripts/**/*.js` change
  - Deploy: Builds and deploys to GitHub Pages on push to `main`
- **Configuration:** `.github/workflows/`

## Dependency Analysis

### Scripts
- **`npm run analyze:deps`:** Generate dependency graph, issues report, and Mermaid diagram
  - Outputs: `dependency-graph.json`, `dependency-issues.json`, `dependency-graph.dot`, `docs/architecture/dependency-graph.mmd`
- **`npm run validate:deps`:** Validation-only mode (fails on cycles)
- **`npm run analyze:deps:watch`:** Watch mode with nodemon
- **Documentation:** `docs/architecture/DEPENDENCY_GRAPH.md`

## Performance

### Benchmarking
- **`npm run test:benchmark`:** Run performance benchmarks (5 runs)
- **`npm run test:validate-optimizations`:** Validate optimization patterns
- **`npm run stress`:** Run stress tests
- **Scripts:** `scripts/benchmark-tests.js`, `scripts/run-stress-checks.mjs`

## Module System
- **ES6 Modules:** All code uses `import`/`export`
- **Type:** `"type": "module"` in `package.json`
- **Entry point:** `src/app.js`

For testing details, see `tests/README.md`. For dependency analysis, see `docs/architecture/DEPENDENCY_GRAPH.md`.
