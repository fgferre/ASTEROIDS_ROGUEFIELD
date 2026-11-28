// src/modules/render3d/three.js
//
// The game's one door to three.js: the npm package (its version pinned in
// package.json) and the post-processing passes from its examples, joined in
// one plain object. The two renderers take it from here (sceneSetup.js,
// MenuBackgroundSystem.js) and hand it on as the `THREE` parameter every
// render module receives. Plain, not the module namespace: threeUuid.js
// swaps MathUtils on it.

import * as core from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

// Lights in three's units (r155 made r128's optional, r165 removed them):
// each light's r128 strength is set × Math.PI where the game sets it. A
// point light also fades otherwise: r128 as (1 − d / distance)² to nothing
// at its distance, three as 1 / d^decay, windowed to nothing at it. The
// game's point lights take decay POINT_DECAY, whose curve, scaled, follows
// r128's over the whole reach (within 5% near the light, 0.7× at a quarter,
// up to 1.7× at three quarters where little light is left); with decay 2 a
// light matched at mid-reach burned what stood close to it white. So
// pointStrength() is the three intensity of `light` (its distance set
// first) that lights as r128's `strength` did.
export const POINT_DECAY = 0.5;
export function pointStrength(light, strength) {
  return strength * Math.PI * 0.1926 * Math.sqrt(light.distance);
}

// After a lost context comes back, three keeps the dead context's handles on
// all it had uploaded and frees them when the game disposes those things
// (the stopped menu shrinking its buffers as a run starts): the browser warns
// for each ("delete: object does not belong to this context") and frees
// nothing, that memory went with the context. Those deletes are dropped: only
// an object made in an earlier life of the context, anything else as before.
const FREES = {
  createBuffer: 'deleteBuffer',
  createFramebuffer: 'deleteFramebuffer',
  createProgram: 'deleteProgram',
  createRenderbuffer: 'deleteRenderbuffer',
  createShader: 'deleteShader',
  createTexture: 'deleteTexture',
  createVertexArray: 'deleteVertexArray',
};
export function forgetDeadHandles(gl, canvas) {
  let life = 0;
  const born = new WeakMap();
  canvas.addEventListener('webglcontextlost', () => (life += 1));
  Object.entries(FREES).forEach(([make, free]) => {
    const create = gl[make];
    const remove = gl[free];
    if (!create || !remove) return;
    gl[make] = (...args) => {
      const handle = create.apply(gl, args);
      if (handle) born.set(handle, life);
      return handle;
    };
    gl[free] = (handle) => {
      if (born.has(handle) && born.get(handle) !== life) return;
      remove.call(gl, handle);
    };
  });
}

class WebGLRenderer extends core.WebGLRenderer {
  constructor(...args) {
    super(...args);
    forgetDeadHandles(this.getContext(), this.domElement);
  }
}

const THREE = {
  ...core,
  WebGLRenderer,
  EffectComposer,
  RenderPass,
  ShaderPass,
  UnrealBloomPass,
  SMAAPass,
};

export default THREE;
