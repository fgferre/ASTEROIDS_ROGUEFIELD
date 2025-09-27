import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src', // Define a pasta raiz do projeto
  assetsInclude: ['**/*.gltf', '**/*.glb'],
  server: {
    port: 5500, // Mantém a porta que já estávamos usando
  },
});
