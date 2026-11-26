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
import { UnrealBloomPass as BloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

// Every bloom step is one opaque full-screen quad, so the clears before the
// bright pass and each blur are wiped at once: only the composite's (and the
// screen's) clear runs. The frame is bit-identical.
class UnrealBloomPass extends BloomPass {
  render(renderer, ...rest) {
    const clear = renderer.clear;
    renderer.clear = (...args) => {
      if (
        this.fsQuad.material === this.compositeMaterial ||
        renderer.getRenderTarget() === null
      ) {
        clear.apply(renderer, args);
      }
    };
    try {
      return super.render(renderer, ...rest);
    } finally {
      renderer.clear = clear;
    }
  }
}

const THREE = {
  ...core,
  EffectComposer,
  RenderPass,
  ShaderPass,
  UnrealBloomPass,
  SMAAPass,
};

export default THREE;
