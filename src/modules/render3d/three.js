// src/modules/render3d/three.js
//
// The game's one door to three.js: the npm package (its version pinned in
// package.json) and the post-processing passes from its examples, joined in
// one plain object. The two renderers take it from here (sceneSetup.js,
// MenuBackgroundSystem.js) and hand it on as the `THREE` parameter every
// render module receives. Plain, not the module namespace: threeUuid.js
// swaps MathUtils on it.

import * as core from 'three';
import { EffectComposer as Composer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass as BloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass as EdgePass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

// Colours as r128 read them: a hex or a Color is used as given, never
// converted from sRGB (r152 turned that conversion on). Before any Color.
core.ColorManagement.enabled = false;

// Lights in r128's units, which r155 made optional and r165 removed:
// directional, point, ambient and hemisphere light count π times stronger,
// and a point light fades linearly to nothing at its distance rather than
// with the square of it. Done in the shader, so the light uniforms keep
// r128's values (rimLight.js reads the key light's colour directly).
function legacyLights(chunk) {
  const edits = [
    [
      /float getDistanceAttenuation\([\s\S]*?\n}\n/,
      `float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	if ( cutoffDistance > 0.0 && decayExponent > 0.0 ) {
		return pow( saturate( - lightDistance / cutoffDistance + 1.0 ), decayExponent );
	}
	return 1.0;
}
`,
    ],
    ['vec3 irradiance = ambientLightColor;', '$& irradiance *= PI;'],
    [
      'vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );',
      '$& irradiance *= PI;',
    ],
    ['light.color = directionalLight.color;', '$& light.color *= PI;'],
    ['light.color = pointLight.color;', '$& light.color *= PI;'],
  ];
  return edits.reduce((text, [find, put]) => {
    const next = text.replace(find, put);
    if (next === text) throw new Error(`three.js: light chunk lost ${find}`);
    return next;
  }, chunk);
}
core.ShaderChunk.lights_pars_begin = legacyLights(
  core.ShaderChunk.lights_pars_begin
);

// Since r154 three tone-maps only what it draws to the screen (or to a WebXR
// target). The composers draw the scene into their targets and its materials
// expect ACES there, as r128 gave it, a glow with toneMapped false left out
// (one full-screen pass after the scene could not leave it out): their two
// targets count as an output, in linear. Their depth keeps r128's 16 bits
// (r158 made it 24): a glow drawn at the heart of a crystal or a shot showed
// through its body's front at that precision, and the bloom is tuned on it.
function asOutput(target) {
  target.isXRRenderTarget = true;
  target.texture.colorSpace = core.LinearSRGBColorSpace;
  target.depthTexture = new core.DepthTexture(
    target.width,
    target.height,
    core.UnsignedShortType
  );
}

class EffectComposer extends Composer {
  constructor(renderer, target) {
    super(renderer, target);
    asOutput(this.renderTarget1);
    asOutput(this.renderTarget2);
  }

  reset(target) {
    super.reset(target);
    asOutput(this.renderTarget1);
    asOutput(this.renderTarget2);
  }
}

// r128's SMAA left the composer's buffers where they were; since then it
// swaps them, and the game's chains (sceneSetup.js displayTarget, the
// opening's) were built on it staying put.
class SMAAPass extends EdgePass {
  constructor(...args) {
    super(...args);
    this.needsSwap = false;
  }
}

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
