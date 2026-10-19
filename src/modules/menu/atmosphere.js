// src/modules/menu/atmosphere.js
//
// The menu's atmosphere: two slow nebula planes far behind the field and a
// cloud of blue dust in front, all seeded from the 'atmosphere' fork (the
// NASA starfield hides them once it loads). MenuBackgroundSystem stores what
// createAtmosphere returns and calls updateAtmosphere every frame; the
// bodies came from it unchanged.

/**
 * @param {object} deps - THREE and scene; ensureRandom(fork) and
 *   createStarTexture() from the system (asked in that order, as before).
 * @returns {{ nebulas: object[], dustSystem: object } | undefined} nothing
 *   without THREE.
 */
export function createAtmosphere({
  THREE,
  scene,
  ensureRandom,
  createStarTexture,
}) {
  if (!THREE) return;
  const rng = ensureRandom('atmosphere');

  // 1. Nebula Layers (Gaseous backdrops)
  const nebulas = [];
  const nebulaConfigs = [
    { size: 2000, color: 0x0a1835, opacity: 0.15, z: -1200, speed: 0.02 },
    { size: 1800, color: 0x1a0a25, opacity: 0.12, z: -1500, speed: -0.015 },
  ];

  nebulaConfigs.forEach((cfg) => {
    const geometry = new THREE.PlaneGeometry(cfg.size, cfg.size);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        color: { value: new THREE.Color(cfg.color) },
        opacity: { value: cfg.opacity },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
      fragmentShader: `
          uniform float time;
          uniform float opacity;
          uniform vec3 color;
          varying vec2 vUv;

          float noise(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
          }

          void main() {
            vec2 uv = (vUv - 0.5) * 2.0;
            float dist = length(uv);
            float mask = smoothstep(1.0, 0.2, dist);
            
            float n = noise(vUv * 4.0 + time * 0.02);
            n += noise(vUv * 8.0 - time * 0.01) * 0.5;
            
            gl_FragColor = vec4(color * (n * 0.6 + 0.4), mask * opacity);
          }
        `,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = cfg.z;
    mesh.rotation.z = rng.float() * Math.PI * 2;
    mesh.userData.rotateSpeed = cfg.speed;
    scene.add(mesh);
    nebulas.push(mesh);
  });

  // 2. Space Dust (Foreground particles)
  const dustCount = 800;
  const dustGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(dustCount * 3);

  for (let i = 0; i < dustCount; i++) {
    positions[i * 3] = (rng.float() - 0.5) * 500;
    positions[i * 3 + 1] = (rng.float() - 0.5) * 500;
    positions[i * 3 + 2] = (rng.float() - 0.5) * 500;
  }

  dustGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3)
  );

  const dustMaterial = new THREE.PointsMaterial({
    size: 0.7,
    color: 0x66aaff,
    map: createStarTexture(),
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const dustSystem = new THREE.Points(dustGeometry, dustMaterial);
  scene.add(dustSystem);

  return { nebulas, dustSystem };
}

/** Per frame: the nebulas drift and turn, the dust turns. */
export function updateAtmosphere(nebulas, dustSystem, elapsedTime, delta) {
  // Update Atmosphere
  if (nebulas) {
    nebulas.forEach((neb) => {
      neb.material.uniforms.time.value = elapsedTime;
      neb.rotation.z += neb.userData.rotateSpeed * delta;
    });
  }

  if (dustSystem) {
    dustSystem.rotation.y += delta * 0.02;
  }
}
