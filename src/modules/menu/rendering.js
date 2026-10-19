// src/modules/menu/rendering.js
//
// How the menu scene reaches the screen: the WebGL2 renderer, the lights
// (one distant sun at a grazing angle, a faint cool fill, a whisper of
// ambient) and the post chain (bloom, a chromatic-aberration/grain pass,
// SMAA). Builders only: MenuBackgroundSystem stores what they return. The
// bodies came from it unchanged.

import { debugLog } from '../../core/debugLogging.js';

export function createMenuRenderer(THREE, canvas) {
  // WebGL2 upgrade - enables #version 300 es shaders like the study
  const gl2Context = canvas.getContext('webgl2', {
    antialias: true,
    alpha: true,
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
  });

  const renderer = new THREE.WebGLRenderer({
    canvas,
    context: gl2Context,
    antialias: true,
    alpha: true,
    premultipliedAlpha: true,
  });

  // Log WebGL version for debugging
  const glVersion = renderer.capabilities.isWebGL2 ? 'WebGL2' : 'WebGL1';
  debugLog(`[MenuBackgroundSystem] Renderer: ${glVersion}`);
  const pixelRatio = window.devicePixelRatio || 1;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x050916, 1);
  renderer.shadowMap.enabled = true;
  if (
    typeof renderer.shadowMap.type !== 'undefined' &&
    THREE?.PCFSoftShadowMap
  ) {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  if (
    typeof renderer.outputEncoding !== 'undefined' &&
    THREE &&
    THREE.sRGBEncoding
  ) {
    renderer.outputEncoding = THREE.sRGBEncoding;
  }
  if (
    typeof renderer.toneMapping !== 'undefined' &&
    THREE &&
    typeof THREE.NoToneMapping !== 'undefined'
  ) {
    // Monolith shader outputs in linear and lets renderer handle encoding.
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;
  }

  return renderer;
}

/**
 * The post chain over the menu scene; returns { composer, bloomPass,
 * customFX, smaaPass } (only the passes this Three build has), or {} when
 * there is no EffectComposer.
 */
export function setupPostProcessing({
  THREE,
  scene,
  camera,
  renderer,
  adaptiveQuality,
}) {
  const post = {};
  if (!THREE || !renderer || !THREE.EffectComposer) return post;

  post.composer = new THREE.EffectComposer(renderer);

  const renderPass = new THREE.RenderPass(scene, camera);
  post.composer.addPass(renderPass);

  const fxConfig =
    adaptiveQuality?.levels?.[adaptiveQuality.currentLevel] ?? null;
  const bloomStrength =
    typeof fxConfig?.bloomStrength === 'number' ? fxConfig.bloomStrength : 0.1;
  const chromaticAberration =
    typeof fxConfig?.chromaticAberration === 'number'
      ? fxConfig.chromaticAberration
      : 0.0;

  // 1. Unreal Bloom Pass - reduced for clarity
  if (THREE.UnrealBloomPass) {
    post.bloomPass = new THREE.UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      bloomStrength,
      0.2, // Radius: tighter bloom
      0.92 // Threshold: only very bright spots bloom
    );
    post.composer.addPass(post.bloomPass);
  }

  // 2. Custom FX: Chromatic Aberration + Filmic Grain
  if (THREE.ShaderPass) {
    post.customFX = createCustomFXPass(THREE);
    if (post.customFX?.uniforms?.amount) {
      post.customFX.uniforms.amount.value = chromaticAberration;
    }
    // F3: disable pass when both effects are zero (avoids 3 texture samples/pixel for no result)
    const grainValue = post.customFX?.uniforms?.grainAmount?.value ?? 0;
    post.customFX.enabled = chromaticAberration !== 0 || grainValue !== 0;
    post.composer.addPass(post.customFX);
  }

  // 3. SMAA Anti-aliasing
  if (THREE.SMAAPass) {
    const pixelRatio = renderer.getPixelRatio();
    post.smaaPass = new THREE.SMAAPass(
      window.innerWidth * pixelRatio,
      window.innerHeight * pixelRatio
    );
    post.composer.addPass(post.smaaPass);
  }

  return post;
}

function createCustomFXPass(THREE) {
  const shader = {
    uniforms: {
      tDiffuse: { value: null },
      amount: { value: 0.0 },
      grainAmount: { value: 0.0 }, // Keep sharp by default (study parity)
      time: { value: 0.0 },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
      `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float amount;
        uniform float grainAmount;
        uniform float time;
        varying vec2 vUv;

        float random(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
          vec2 uv = vUv;

          // Very subtle Chromatic Aberration (R/B shift)
          float r = texture2D(tDiffuse, uv + vec2(amount, 0.0)).r;
          float g = texture2D(tDiffuse, uv).g;
          float b = texture2D(tDiffuse, uv - vec2(amount, 0.0)).b;

          vec3 color = vec3(r, g, b);

          float noise = (random(uv + time * 0.01) - 0.5) * grainAmount;
          color += noise;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
  };
  return new THREE.ShaderPass(shader);
}

/** Adds the menu's lights to `scene`; returns the key light (the sun). */
export function createLighting(THREE, scene) {
  // Keep scene lights minimal and dramatic (single distant sun + subtle ambient).
  const ambient = new THREE.AmbientLight(0x101820, 0.015);
  scene.add(ambient);

  // Distant sun-like directional light (grazing angle for strong terminator).
  const keyLight = new THREE.DirectionalLight(0xfff0e6, 3.1);
  keyLight.position.set(560, 130, -240);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.bias = -0.00008;
  keyLight.shadow.normalBias = 0.02;
  const shadowCam = keyLight.shadow.camera;
  shadowCam.near = 10;
  shadowCam.far = 1400;
  shadowCam.left = -320;
  shadowCam.right = 320;
  shadowCam.top = 320;
  shadowCam.bottom = -320;
  scene.add(keyLight);

  // Very subtle cool fill to avoid pure-black crush while keeping contrast.
  const fill = new THREE.DirectionalLight(0x4466aa, 0.1);
  fill.position.set(-260, -120, 180);
  scene.add(fill);

  return keyLight;
}
