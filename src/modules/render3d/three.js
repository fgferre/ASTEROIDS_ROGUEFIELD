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

// The bloom's blur and composite as r128 to r178 drew them, which the game's
// glows are tuned on: r187 doubled the kernels, narrowed the Gaussian to a
// third of them and tripled the composite, so every halo came out tighter.
// Its bright pass weighs light as r128's did (0.299, 0.587, 0.114): three's
// luminance since (0.2126, 0.7152, 0.0722) kept a strong red or blue lamp
// under the threshold and its halo went out, and let more greens through.
const QUAD_VERTEX = `varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

function blurMaterial(radius) {
  const weights = Array.from(
    { length: radius },
    (_, i) => (0.39894 * Math.exp((-0.5 * i * i) / (radius * radius))) / radius
  );
  return new core.ShaderMaterial({
    defines: { KERNEL_RADIUS: radius },
    uniforms: {
      colorTexture: { value: null },
      invSize: { value: new core.Vector2(0.5, 0.5) },
      direction: { value: new core.Vector2(0.5, 0.5) },
      gaussianCoefficients: { value: weights },
    },
    vertexShader: QUAD_VERTEX,
    fragmentShader: `varying vec2 vUv;
uniform sampler2D colorTexture;
uniform vec2 invSize;
uniform vec2 direction;
uniform float gaussianCoefficients[KERNEL_RADIUS];
void main() {
  float weightSum = gaussianCoefficients[0];
  vec3 diffuseSum = texture2D(colorTexture, vUv).rgb * weightSum;
  for (int i = 1; i < KERNEL_RADIUS; i++) {
    float w = gaussianCoefficients[i];
    vec2 uvOffset = direction * invSize * float(i);
    diffuseSum += (texture2D(colorTexture, vUv + uvOffset).rgb
      + texture2D(colorTexture, vUv - uvOffset).rgb) * w;
    weightSum += 2.0 * w;
  }
  gl_FragColor = vec4(diffuseSum / weightSum, 1.0);
}`,
  });
}

function compositeMaterial(mips, uniforms) {
  const term = (i) =>
    `lerpBloomFactor(bloomFactors[${i}]) * vec4(bloomTintColors[${i}], 1.0) * texture2D(blurTexture${i + 1}, vUv)`;
  return new core.ShaderMaterial({
    defines: { NUM_MIPS: mips },
    uniforms,
    vertexShader: QUAD_VERTEX,
    fragmentShader: `varying vec2 vUv;
uniform sampler2D blurTexture1;
uniform sampler2D blurTexture2;
uniform sampler2D blurTexture3;
uniform sampler2D blurTexture4;
uniform sampler2D blurTexture5;
uniform float bloomStrength;
uniform float bloomRadius;
uniform float bloomFactors[NUM_MIPS];
uniform vec3 bloomTintColors[NUM_MIPS];
float lerpBloomFactor(const in float factor) {
  float mirrorFactor = 1.2 - factor;
  return mix(factor, mirrorFactor, bloomRadius);
}
void main() {
  gl_FragColor = bloomStrength * (${[0, 1, 2, 3, 4].map(term).join(' + ')});
}`,
  });
}

// Every bloom step is one opaque full-screen quad, so the clears before the
// bright pass and each blur are wiped at once: only the composite's (the
// second clear of the first horizontal target) and the screen's run. The
// frame is bit-identical.
class UnrealBloomPass extends BloomPass {
  constructor(...args) {
    super(...args);
    this.separableBlurMaterials = this.separableBlurMaterials.map((own, i) => {
      const old = blurMaterial([3, 5, 7, 9, 11][i]);
      old.uniforms.invSize.value.copy(own.uniforms.invSize.value);
      own.dispose();
      return old;
    });
    const own = this.compositeMaterial;
    this.compositeMaterial = compositeMaterial(this.nMips, own.uniforms);
    own.dispose();
    const bright = this.materialHighPassFilter;
    const weighed = bright.fragmentShader.replace(
      'float v = luminance( texel.xyz );',
      'float v = dot( texel.xyz, vec3( 0.299, 0.587, 0.114 ) );'
    );
    if (weighed === bright.fragmentShader) {
      throw new Error('three.js: the bloom bright pass changed');
    }
    bright.fragmentShader = weighed;
  }

  render(renderer, ...rest) {
    const clear = renderer.clear;
    const first = this.renderTargetsHorizontal[0];
    let cleared = 0;
    renderer.clear = (...args) => {
      const target = renderer.getRenderTarget();
      if (target === null || (target === first && cleared++ > 0)) {
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
  WebGLRenderer,
  EffectComposer,
  RenderPass,
  ShaderPass,
  UnrealBloomPass,
  SMAAPass,
};

export default THREE;
