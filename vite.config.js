import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

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
    globals: true,
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
