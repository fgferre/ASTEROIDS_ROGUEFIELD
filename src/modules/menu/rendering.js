// src/modules/menu/rendering.js
//
// The menu's WebGL2 renderer and the lights of its own scene, the hull
// preview's (one distant sun at a grazing angle, a faint cool fill, a
// whisper of ambient); the opening scene brings its own post chain
// (openingScene.js). Builders only: MenuBackgroundSystem stores what they
// return.

import { debugLog } from '../../core/debugLogging.js';
import { resolveDevicePixelRatio } from '../../core/viewport.js';

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
  renderer.setPixelRatio(resolveDevicePixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x263553, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Monolith shader outputs in linear and lets renderer handle encoding.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.0;

  return renderer;
}

/** Adds the menu's lights to `scene`; returns the key light (the sun). */
export function createLighting(THREE, scene) {
  // Keep scene lights minimal and dramatic (single distant sun + subtle ambient).
  // The colours are sRGB hexes, read to the linear values they were tuned at.
  const ambient = new THREE.AmbientLight(0x475663, 0.015 * Math.PI);
  scene.add(ambient);

  // Distant sun-like directional light (grazing angle for strong terminator).
  const keyLight = new THREE.DirectionalLight(0xfff8f4, 3.1 * Math.PI);
  keyLight.position.set(560, 130, -240);
  scene.add(keyLight);

  // Very subtle cool fill to avoid pure-black crush while keeping contrast.
  const fill = new THREE.DirectionalLight(0x8daad5, 0.1 * Math.PI);
  fill.position.set(-260, -120, 180);
  scene.add(fill);

  return keyLight;
}
