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

// Since r163 a material's envMapIntensity scales only its own envMap, and
// the scene's sky (Scene.environment) takes Scene.environmentIntensity. The
// game's materials set their own strength against the scene's sky, as r128
// read it: each hands it to the scene as it is drawn (three reads it then).
core.MeshStandardMaterial.prototype.onBeforeRender = function (_r, scene) {
  if (this.envMap === null && scene.isScene) {
    scene.environmentIntensity = this.envMapIntensity;
  }
};

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
