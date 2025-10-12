import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src', // Define a pasta raiz do projeto
  server: {
    port: 5500, // Mantém a porta que já estávamos usando
  },
  test: {
    include: ['**/__tests__/**/*.test.js', '**/*.{test,spec}.js', '../tests/**/*.{test,spec}.js'],
    environment: 'node'
  },
});
