import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: 'src', // Define a pasta raiz do projeto
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
  },
});
