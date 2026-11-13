// The tools a place's backdrop set (places/index.js) is built with: parts
// placed by any transform and merged into one static mesh per material, in
// the four materials every set shares the look of — `matte` (lit by the
// field's lights, the hard surfaces), `lamp` (unlit and opaque, a surface
// that glows from inside: a dark planet), `gem` (polished, lit from inside
// and catching the field's lights: crystals) and `glow` (added light:
// running lights, cracks, a star) — all sinking into the place's haze with
// their depth under the field, as the broken Ring does (ring/ringMaterial.js),
// so the far shapes sit low in contrast behind the play. Seen through the
// arena (the view ray crossing the 800×600 field) a set may sink further,
// to `under` of its contrast, so it never competes with the play there.

import { createSeededRandom } from '../asteroidMesh.js';
import { colorOf } from '../batches.js';
import { mergeStatic } from '../mergeStatic.js';

// proposta 12/11: the matte surfaces' finish; a glow loses `glowHaze` of
// its light where the haze is full.
const MATTE = { roughness: 0.92, metalness: 0.08 };
// proposta 13/11: a gem's polished facets — `glow` of its vertex colour lit
// from inside, `body` of it taking the field's lights, its sheen capped at
// `cap` (direct, reflected) as the ship's is (hullModel.js
// SPECULAR_CAP_GLSL), higher because the haze takes most of it.
const GEM = {
  roughness: 0.25,
  metalness: 0.1,
  envMapIntensity: 2,
  body: 0.3,
  glow: 0.7,
  cap: [0.7, 0.3],
};
const GLOW_HAZE = 0.55;
// The field's half extents in world units, and the soft edge (inside,
// outside) over which the arena's dimming fades.
const FIELD_HALF = [400, 300];
const FIELD_EDGE = [40, 120];

const VERTEX_HEAD = `
uniform float uHazeDepth;
uniform float uUnder;
varying float vPlaceHaze;
varying float vPlaceUnder;`;
const VERTEX = `
vec4 placeWorld = modelMatrix * vec4(transformed, 1.0);
float placeReach = distance(placeWorld.xyz, cameraPosition);
float placeBelow = clamp(-placeWorld.y / max(cameraPosition.y - placeWorld.y, 1.0),
  0.0, 1.0);
vPlaceHaze = 1.0 - exp(-placeReach * placeBelow / uHazeDepth);
vec2 placeOn = cameraPosition.xz + (placeWorld.xz - cameraPosition.xz)
  * cameraPosition.y / max(cameraPosition.y - placeWorld.y, 1.0);
vec2 placeIn = 1.0 - smoothstep(
  vec2(${FIELD_HALF[0] - FIELD_EDGE[0]}.0, ${FIELD_HALF[1] - FIELD_EDGE[0]}.0),
  vec2(${FIELD_HALF[0] + FIELD_EDGE[1]}.0, ${FIELD_HALF[1] + FIELD_EDGE[1]}.0),
  abs(placeOn));
vPlaceUnder = mix(1.0, uUnder, placeIn.x * placeIn.y);`;
const FRAGMENT_HEAD = `
uniform vec3 uHaze;
uniform float uGlowHaze;
varying float vPlaceHaze;
varying float vPlaceUnder;`;
const SURFACE = `
gl_FragColor.rgb = mix(uHaze, mix(gl_FragColor.rgb, uHaze, vPlaceHaze),
  vPlaceUnder);`;
const LIGHT = `
gl_FragColor.rgb *= (1.0 - uGlowHaze * vPlaceHaze) * vPlaceUnder;`;
const GEM_GLOW = `
totalEmissiveRadiance += vColor.rgb * ${GEM.glow.toFixed(2)};`;
const GEM_CAP = `
reflectedLight.directSpecular = min(reflectedLight.directSpecular, vec3(${GEM.cap[0].toFixed(2)}));
reflectedLight.indirectSpecular = min(reflectedLight.indirectSpecular, vec3(${GEM.cap[1].toFixed(2)}));`;

function hazed(material, uniforms, kind) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${VERTEX_HEAD}`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>${VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${FRAGMENT_HEAD}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>${kind === 'gem' ? GEM_GLOW : ''}`
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>${kind === 'gem' ? GEM_CAP : ''}`
      )
      .replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>${kind === 'glow' ? LIGHT : SURFACE}`
      );
  };
  material.customProgramCacheKey = () => `place-${kind}`;
  return material;
}

function makeMaterial(THREE, kind, uniforms) {
  if (kind === 'matte') {
    return hazed(
      new THREE.MeshStandardMaterial({ vertexColors: true, ...MATTE }),
      uniforms,
      kind
    );
  }
  if (kind === 'gem') {
    const { roughness, metalness, envMapIntensity, body } = GEM;
    return hazed(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        color: new THREE.Color(body, body, body),
        roughness,
        metalness,
        envMapIntensity,
      }),
      uniforms,
      kind
    );
  }
  if (kind === 'lamp') {
    return hazed(
      new THREE.MeshBasicMaterial({ vertexColors: true }),
      uniforms,
      kind
    );
  }
  return hazed(
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
    uniforms,
    kind
  );
}

/**
 * A set's kit: `haze` is the place's haze colour (shared with the broken
 * Ring, updated in place), `hazeDepth` the depth at which 63% of a surface
 * has sunk into it, `under` its contrast seen through the arena (1: as
 * everywhere), `seed` its scatter.
 */
export function createPlaceKit(
  THREE,
  haze,
  { hazeDepth = 1300, under = 1, seed = 1 }
) {
  const uniforms = {
    uHaze: { value: haze },
    uHazeDepth: { value: hazeDepth },
    uGlowHaze: { value: GLOW_HAZE },
    uUnder: { value: under },
  };
  const materials = new Map();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const at = new THREE.Vector3();
  const size = new THREE.Vector3();
  const unit = {
    box: new THREE.BoxGeometry(1, 1, 1),
    octahedron: new THREE.OctahedronGeometry(1, 0),
    rock: new THREE.IcosahedronGeometry(1, 0),
    drum: (sides) => new THREE.CylinderGeometry(1, 1, 1, sides),
  };
  const kit = {
    THREE,
    haze,
    random: createSeededRandom(seed),
    materials,
    unit,
    tone: (css, k = 1) => colorOf(THREE, css).multiplyScalar(k),
    /** A list of parts for one mesh. */
    parts: () => [],
    /**
     * `geometry` scaled by `scale` (a number or [x, y, z]), turned by
     * `turn` ([x, y, z] radians, an Euler in 'YXZ' order unless a fourth
     * entry names another) and moved to
     * `position`, in `color`, onto `parts`. A geometry with its own vertex
     * colours keeps them, times `color`.
     */
    put(parts, geometry, color, position, scale = 1, turn = null) {
      euler.set(
        turn?.[0] ?? 0,
        turn?.[1] ?? 0,
        turn?.[2] ?? 0,
        turn?.[3] ?? 'YXZ'
      );
      matrix.compose(
        at.fromArray(position),
        quaternion.setFromEuler(euler),
        typeof scale === 'number'
          ? size.set(scale, scale, scale)
          : size.fromArray(scale)
      );
      const placed = (
        geometry.index ? geometry.toNonIndexed() : geometry.clone()
      ).applyMatrix4(matrix);
      parts.push({ geometry: placed, color, flat: !placed.userData.smooth });
      return placed;
    },
    /**
     * Moves every part of `parts` (already placed) by `turn` then
     * `position`, as a group would; returns them.
     */
    moved(parts, position, turn = null) {
      euler.set(turn?.[0] ?? 0, turn?.[1] ?? 0, turn?.[2] ?? 0, 'YXZ');
      matrix.compose(
        at.fromArray(position),
        quaternion.setFromEuler(euler),
        size.set(1, 1, 1)
      );
      parts.forEach((part) => part.geometry.applyMatrix4(matrix));
      return parts;
    },
    box(parts, color, position, scale, turn) {
      return kit.put(parts, unit.box, color, position, scale, turn);
    },
    /**
     * One static mesh of `parts` in the set's `kind` material; `name` gives
     * it a material of its own (one the set animates).
     */
    mesh(parts, kind = 'matte', name = kind) {
      if (!materials.has(name)) {
        materials.set(name, makeMaterial(THREE, kind, uniforms));
      }
      const mesh = new THREE.Mesh(merge(THREE, parts), materials.get(name));
      mesh.renderOrder = -10;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      return mesh;
    },
  };
  return kit;
}

// mergeStatic, then each part's own vertex colours (a gradient) multiplied
// into its stretch of the merged colours.
function merge(THREE, parts) {
  const merged = mergeStatic(THREE, parts);
  const color = merged.getAttribute('color');
  let offset = 0;
  parts.forEach(({ geometry }) => {
    const own = geometry.getAttribute('color');
    const count = geometry.getAttribute('position').count;
    if (own) {
      for (let i = 0; i < count; i += 1) {
        const o = offset + i;
        color.setXYZ(
          o,
          color.getX(o) * own.getX(i),
          color.getY(o) * own.getY(i),
          color.getZ(o) * own.getZ(i)
        );
      }
    }
    offset += count;
  });
  return merged;
}

/**
 * A flat disc in the x-z plane out to radius 1, in `rings` bands from `hole`
 * (an annulus) and `sides` steps over the angles `arc` ([from, to] radians,
 * from +x toward +z), its vertex colour `falloff(r, a)` (r 0..1, a radians):
 * a glow, a corona, a band of dust, a crescent.
 */
export function gradientDisc(
  THREE,
  falloff,
  { rings = 8, sides = 48, hole = 0, arc = [0, Math.PI * 2] } = {}
) {
  const positions = [];
  const colors = [];
  const radius = (i) => hole + ((1 - hole) * i) / rings;
  const angle = (j) => arc[0] + ((arc[1] - arc[0]) * j) / sides;
  const push = (i, j) => {
    const r = radius(i);
    const a = angle(j);
    positions.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    const k = Math.max(0, falloff(r, a));
    colors.push(k, k, k);
  };
  for (let i = 0; i < rings; i += 1) {
    for (let j = 0; j < sides; j += 1) {
      push(i, j);
      push(i + 1, j + 1);
      push(i + 1, j);
      push(i, j);
      push(i, j + 1);
      push(i + 1, j + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(
      positions.map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3
    )
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.userData.smooth = true;
  return geometry;
}
