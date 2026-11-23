import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
// The game's version lives only in package.json (src/data/changelog.js says how
// it moves); the menu shows it through __GAME_VERSION__.
const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
);

export default defineConfig(({ mode }) => ({
  root: 'src', // Define a pasta raiz do projeto
  base: '/ASTEROIDS_ROGUEFIELD/', // Caminho base para GitHub Pages
  // INFRA-03: defense-in-depth strip of dev debug globals. `__AUDIO_DEBUG_BUILD__`
  // is false in production builds so Vite dead-code-eliminates the body of
  // AudioSystem._exposeRandomDebugControls (assignment STRING removed, not just
  // made unreachable behind the runtime DEV_MODE gate). The CI gate is the
  // runtime-reachability test in tests/process/no-dev-globals.test.js — NOT a
  // dist string grep (the minified string survives behind a dead gate; see
  // 02-RESEARCH Pitfall 3). vitest loads this config too, so the define is also
  // available at test time.
  define: {
    __AUDIO_DEBUG_BUILD__: JSON.stringify(mode !== 'production'),
    __GAME_VERSION__: JSON.stringify(version),
  },
  build: {
    outDir: '../dist', // Build para a pasta dist na raiz
    emptyOutDir: true, // Limpa a pasta antes do build
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
      },
    },
  },
  server: {
    port: 5500, // Mantém a porta que já estávamos usando
  },
  test: {
    root: resolve(__dirname),
    include: ['tests/**/*.test.js', 'tests/**/*.spec.js'],
    exclude: [
      'tests/__helpers__/**',
      'tests/__fixtures__/**',
      'node_modules/**',
    ],
    environment: 'node',
    // Headless scenario tests boot the real manifest and step hundreds of
    // frames; under a loaded machine (parallel workers) they passed alone but
    // tripped the 5 s default. Proposta 18/10.
    testTimeout: 20000,
    globals: true,
    // The game logs every event; only failing tests print their console.
    silent: 'passed-only',
    // Stops vitest on any Node but the one pinned in .nvmrc.
    globalSetup: ['tests/__helpers__/pinned-node-guard.js'],
    // Optimization: global setup eliminates 27 duplicated afterEach blocks
    setupFiles: ['tests/__helpers__/global-setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      exclude: ['dist/**', 'src/public/libs/**'],
    },
  },
}));
