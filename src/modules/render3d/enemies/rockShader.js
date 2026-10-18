// The Ring rock's crack shader: the patch (patchRockShader, an
// onBeforeCompile), the per-rock uniforms it reads (rockUniforms) and the
// Dense Fog it dims rocks with. The rocks draw with it (rocks.js) and the
// Husk's hull plate wears it for its seams (machines.js).

import { colorOf } from '../batches.js';

// Dense Fog (endless layer modifier, PLAN.md R8.2): rocks lose up to
// FOG_DIM of their light with distance from the camera target, all of it
// from FOG_FAR px out (smoothstep from FOG_NEAR); fades in and out over
// FOG_FADE_SECONDS.
export const FOG_DIM = 0.55;
export const FOG_NEAR = 180;
export const FOG_FAR = 420;
export const FOG_FADE_SECONDS = 1;

// The cold rim a Crystal's facets catch (uRimColor; its strength is uRim).
const CRYSTAL_RIM = '#9fdcff';

// Per-rock values: instance attributes on the instanced rocks
// (ROCK_INSTANCED, rockInstances.js), uniforms on single meshes (a burning
// rock, the Husk's shell).
const ROCK_SHADER_HEAD = `
#ifdef ROCK_INSTANCED
varying vec4 vRockGlow;
varying vec3 vRockVein;
varying vec3 vRockSeed;
varying vec3 vRockBase;
varying vec2 vRockSurface;
#define ROCK_GLOW vRockGlow.x
#define ROCK_REVEAL vRockGlow.y
#define ROCK_WIDTH vRockGlow.z
#define ROCK_FLASH vRockGlow.w
#define ROCK_VEIN vRockVein
#define ROCK_SEED vRockSeed
#else
uniform float uGlow;
uniform float uReveal;
uniform float uWidth;
uniform float uFlash;
uniform vec3 uVein;
uniform vec3 uSeed;
#define ROCK_GLOW uGlow
#define ROCK_REVEAL uReveal
#define ROCK_WIDTH uWidth
#define ROCK_FLASH uFlash
#define ROCK_VEIN uVein
#define ROCK_SEED uSeed
#endif
uniform float uRim;
uniform vec3 uRimColor;
varying vec3 vRockPos;
#ifdef ROCK_FOG
uniform float uFogDim;
uniform vec2 uFogCenter;
varying vec2 vRockFogXZ;
#endif
#ifdef ROCK_NORMAL
uniform sampler2D uRockNormalMap;
uniform float uRockNormalScale;
uniform float uRockTile;
varying vec3 vRockNormal;
varying vec3 vRockViewX;
varying vec3 vRockViewY;
varying vec3 vRockViewZ;
#endif
#ifdef ROCK_SURFACE
uniform sampler2D uRockRoughnessMap;
uniform sampler2D uRockAoMap;
uniform float uRockAoIntensity;
#endif
// Triplanar sample of a grey map, planes blended by the object normal.
float rockTriplanar(sampler2D map, vec3 p, vec3 w) {
  return texture2D(map, p.zy).g * w.x + texture2D(map, p.xz).g * w.y
    + texture2D(map, p.xy).g * w.z;
}
vec3 rockHash(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453);
}
// F2 - F1 of a 3D cellular field: ~0 along the walls between cells (cracks).
// The nearest cell's random id decides whether its walls are revealed yet.
vec2 rockCracks(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  float id = 0.0;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 h = rockHash(i + g);
    vec3 r = g + h - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = h.x; }
    else if (d < d2) { d2 = d; }
  }
  return vec2(sqrt(d2) - sqrt(d1), id);
}
`;

export function patchRockShader(shader) {
  const { rockUniforms, rockMaps, rockFog } = this.userData;
  Object.assign(shader.uniforms, rockUniforms, rockMaps, rockFog);
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
      varying vec3 vRockPos;
      #ifdef ROCK_FOG
      varying vec2 vRockFogXZ;
      #endif
      #ifdef ROCK_INSTANCED
      attribute vec4 aGlow;
      attribute vec3 aVein;
      attribute vec3 aSeed;
      attribute vec3 aBase;
      attribute vec2 aSurface;
      varying vec4 vRockGlow;
      varying vec3 vRockVein;
      varying vec3 vRockSeed;
      varying vec3 vRockBase;
      varying vec2 vRockSurface;
      #endif
      #ifdef ROCK_NORMAL
      varying vec3 vRockNormal;
      varying vec3 vRockViewX;
      varying vec3 vRockViewY;
      varying vec3 vRockViewZ;
      #endif`
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vRockPos = position;
      #ifdef ROCK_INSTANCED
      vRockGlow = aGlow;
      vRockVein = aVein;
      vRockSeed = aSeed;
      vRockBase = aBase;
      vRockSurface = aSurface;
      #endif
      #ifdef ROCK_NORMAL
      vRockNormal = objectNormal;
      #ifdef USE_INSTANCING
      mat3 rockToView = normalMatrix * mat3(instanceMatrix);
      #else
      mat3 rockToView = normalMatrix;
      #endif
      vRockViewX = rockToView[0];
      vRockViewY = rockToView[1];
      vRockViewZ = rockToView[2];
      #endif`
    )
    .replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      #ifdef ROCK_FOG
      vec4 rockFogPos = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
      rockFogPos = instanceMatrix * rockFogPos;
      #endif
      vRockFogXZ = (modelMatrix * rockFogPos).xz;
      #endif`
    );
  // Baked maps (rock geometry has no UVs): triplanar in object space, the
  // detail normal added to the shaded normal (flat crystal facets keep their
  // facets), roughness and AO multiplied into what the material sets.
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${ROCK_SHADER_HEAD}`)
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      #ifdef ROCK_INSTANCED
      diffuseColor.rgb *= vRockBase;
      #endif`
    )
    .replace(
      '#include <metalnessmap_fragment>',
      `#include <metalnessmap_fragment>
      #ifdef ROCK_INSTANCED
      metalnessFactor = vRockSurface.y;
      #endif`
    )
    .replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      #ifdef ROCK_INSTANCED
      roughnessFactor = vRockSurface.x;
      #endif
      #ifdef ROCK_NORMAL
      vec3 rockN = normalize(vRockNormal);
      vec3 rockP = vRockPos * uRockTile;
      vec3 rockW = pow(abs(rockN), vec3(4.0));
      rockW /= rockW.x + rockW.y + rockW.z;
      #endif
      #ifdef ROCK_SURFACE
      roughnessFactor *= rockTriplanar(uRockRoughnessMap, rockP, rockW);
      float rockAo = rockTriplanar(uRockAoMap, rockP, rockW);
      #endif`
    )
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      #ifdef ROCK_NORMAL
      {
        vec3 tx = texture2D(uRockNormalMap, rockP.zy).xyz * 2.0 - 1.0;
        vec3 ty = texture2D(uRockNormalMap, rockP.xz).xyz * 2.0 - 1.0;
        vec3 tz = texture2D(uRockNormalMap, rockP.xy).xyz * 2.0 - 1.0;
        tx.xy *= uRockNormalScale;
        ty.xy *= uRockNormalScale;
        tz.xy *= uRockNormalScale;
        // whiteout blend per plane, swizzled back to object axes
        vec3 nx = vec3(tx.xy + rockN.zy, abs(tx.z) * rockN.x);
        vec3 ny = vec3(ty.xy + rockN.xz, abs(ty.z) * rockN.y);
        vec3 nz = vec3(tz.xy + rockN.xy, abs(tz.z) * rockN.z);
        vec3 detail = normalize(nx.zyx * rockW.x + ny.xzy * rockW.y + nz * rockW.z);
        mat3 toView = mat3(vRockViewX, vRockViewY, vRockViewZ);
        normal = normalize(normal + normalize(toView * detail)
          - normalize(toView * rockN));
      }
      #endif`
    )
    .replace(
      '#include <aomap_fragment>',
      `#include <aomap_fragment>
      #ifdef ROCK_SURFACE
      float rockOcclusion = mix(1.0, rockAo, uRockAoIntensity);
      reflectedLight.indirectDiffuse *= rockOcclusion;
      reflectedLight.directDiffuse *= mix(1.0, rockOcclusion, 0.5);
      #endif`
    )
    .replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      if (ROCK_GLOW > 0.001) {
        vec2 c = rockCracks(vRockPos * 2.3 + ROCK_SEED);
        float wall = 1.0 - smoothstep(ROCK_WIDTH * 0.4, ROCK_WIDTH, c.x);
        float fine = 1.0 - smoothstep(0.0, ROCK_WIDTH * 0.5,
          rockCracks(vRockPos * 5.1 + ROCK_SEED.zxy).x);
        float crack = max(wall, fine * 0.7 * step(0.6, ROCK_REVEAL))
          * step(c.y, ROCK_REVEAL);
        diffuseColor.rgb *= 1.0 - 0.7 * crack;
        totalEmissiveRadiance += ROCK_VEIN * crack * ROCK_GLOW;
      }
      if (uRim > 0.001) {
        float edge = 1.0 - max(dot(normal, normalize(vViewPosition)), 0.0);
        totalEmissiveRadiance += uRimColor * uRim * pow(edge, 2.2);
      }
      totalEmissiveRadiance += vec3(ROCK_FLASH);`
    )
    .replace(
      '#include <tonemapping_fragment>',
      `#ifdef ROCK_FOG
      gl_FragColor.rgb *= 1.0 - uFogDim * smoothstep(${FOG_NEAR.toFixed(1)},
        ${FOG_FAR.toFixed(1)}, distance(vRockFogXZ, uFogCenter));
      #endif
      #include <tonemapping_fragment>`
    );
}

// Crack-shader uniforms; a rock's stone and crystal materials share them.
export function rockUniforms(THREE, vein) {
  return {
    uGlow: { value: 0 },
    uReveal: { value: 0 },
    uWidth: { value: 0.05 },
    uFlash: { value: 0 },
    uVein: { value: vein },
    uSeed: { value: new THREE.Vector3() },
    uRim: { value: 0 },
    uRimColor: { value: colorOf(THREE, CRYSTAL_RIM) },
  };
}
