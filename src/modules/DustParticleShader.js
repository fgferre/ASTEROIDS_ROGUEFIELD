// src/modules/DustParticleShader.js
// Shader procedural para partículas de poeira em colisões de asteroides (menu background)

export const DustParticleShader = {
  vertexShader: `
    attribute float size;
    attribute float opacity;
    attribute vec3 velocity;

    varying float vOpacity;

    void main() {
      vOpacity = opacity;

      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * (300.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,

  fragmentShader: `
    varying float vOpacity;

    void main() {
      // Criar círculo suave usando gl_PointCoord e smoothstep
      vec2 center = gl_PointCoord - vec2(0.5);
      float dist = length(center);

      // Smoothstep para borda suave (0.5 = borda externa, 0.2 = início do fade)
      float alpha = smoothstep(0.5, 0.2, dist) * vOpacity;

      // Cor cinza-marrom acinzentado (poeira espacial)
      vec3 dustColor = vec3(0.8, 0.75, 0.7);

      gl_FragColor = vec4(dustColor, alpha);
    }
  `
};
