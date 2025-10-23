import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src', // Define a pasta raiz do projeto
  server: {
    port: 5500, // Mantém a porta que já estávamos usando
  },
  test: {
    include: ['**/__tests__/**/*.test.js', '**/*.{test,spec}.js', '../tests/**/*.{test,spec}.js'],
    exclude: ['../tests/__helpers__/**', '../tests/__fixtures__/**', 'node_modules/**'],
    environment: 'node',
    globals: true,
    // Optimization: global setup eliminates 27 duplicated afterEach blocks
    setupFiles: ['../tests/__helpers__/global-setup.js']
  },
});
