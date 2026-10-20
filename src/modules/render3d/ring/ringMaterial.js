// The broken Ring's lit material, one for every chunk and level of detail.
// The vertex colour carries (tone, idle light, wake light) per piece, not a
// colour; a tone past half the rim bevels' (RING_LOOK.edge) is a bevel,
// which dims toward `edgeClose` as the camera comes close. The haze and the
// lights go on after the tone map, like the nebula they sit in; the wake
// runs along the arc from the break.

import { colorOf } from '../batches.js';
import { RING, RING_LOOK } from './ringShape.js';

// The victory epilogue's "wake" (FieldBackdrop.setWake): the seams, conduits,
// windows and running lights light up to this along the arc, bright enough
// to bloom.
const RING_WAKE_COLOR = '#9a8cff';
const RING_WAKE_GAIN = 2.4;

const RING_VERTEX_HEAD = `
uniform vec2 uArc;
uniform vec3 uShade;
uniform vec4 uEdgeFade;
uniform float uHazeDepth;
uniform float uWake;
varying float vRingShade;
varying float vRingHaze;
varying float vRingWoken;
varying float vRingTone;`;
const RING_VERTEX = `
vec4 ringWorld = modelMatrix * vec4(transformed, 1.0);
float ringAlong = (uArc.x - atan(transformed.z, transformed.x)) / uArc.y;
vRingWoken = uWake * smoothstep(0.0, 0.06, uWake * 1.06 - ringAlong);
vRingShade = mix(uShade.z, 1.0, smoothstep(uShade.x, uShade.y, transformed.y));
float ringReach = distance(ringWorld.xyz, cameraPosition);
vRingTone = color.r > uEdgeFade.z
  ? mix(uEdgeFade.w, color.r, smoothstep(uEdgeFade.x, uEdgeFade.y, ringReach))
  : color.r;
float ringBelow = clamp(-ringWorld.y / max(cameraPosition.y - ringWorld.y, 1.0),
  0.0, 1.0);
vRingHaze = 1.0 - exp(-ringReach * ringBelow / uHazeDepth);`;
const RING_FRAGMENT_HEAD = `
uniform vec3 uHaze;
uniform vec3 uIdle;
uniform vec3 uWakeColor;
uniform float uSpill;
varying float vRingShade;
varying float vRingHaze;
varying float vRingWoken;
varying float vRingTone;`;
const RING_FRAGMENT = `
gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, vRingHaze)
  + (uIdle * vColor.g + uWakeColor * (vColor.b * vRingWoken))
  * (1.0 - 0.6 * vRingHaze);`;

export function ringMaterial(THREE) {
  const uniforms = {
    uArc: { value: new THREE.Vector2(RING.stump, RING.stump - RING.far) },
    uShade: { value: new THREE.Vector3(-RING.hull, RING.rim, RING_LOOK.low) },
    uEdgeFade: {
      value: new THREE.Vector4(
        ...RING_LOOK.edgeFade,
        RING_LOOK.edge / 2,
        RING_LOOK.edgeClose
      ),
    },
    uHazeDepth: { value: RING_LOOK.hazeDepth },
    uHaze: { value: new THREE.Color() },
    uIdle: {
      value: colorOf(THREE, RING_LOOK.idleColor).multiplyScalar(RING_LOOK.idle),
    },
    uWakeColor: {
      value: colorOf(THREE, RING_WAKE_COLOR).multiplyScalar(RING_WAKE_GAIN),
    },
    uSpill: { value: RING_LOOK.spill },
    uWake: { value: 0 },
  };
  const material = new THREE.MeshStandardMaterial({
    color: colorOf(THREE, RING_LOOK.albedo),
    roughness: RING_LOOK.roughness,
    metalness: RING_LOOK.metalness,
    vertexColors: true,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${RING_VERTEX_HEAD}`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>${RING_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${RING_FRAGMENT_HEAD}`)
      .replace(
        '#include <color_fragment>',
        'diffuseColor.rgb *= vRingTone * vRingShade;'
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * uWakeColor * (uSpill * vRingWoken);`
      )
      .replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>${RING_FRAGMENT}`
      );
  };
  material.customProgramCacheKey = () => 'broken-ring';
  return { material, uniforms };
}
