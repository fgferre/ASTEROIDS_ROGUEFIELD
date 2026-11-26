// Quarantine Grid (docs/ROTEIRO.md "Os lugares" 8): in the shadow of a dark
// planet. The planet hangs whole in a corner, far off: its night side turned
// to the field, a thin crescent where the sun is behind it, thin air round
// its limb; on the dark side the specks of dead cities and one hot crack
// round most of the globe; it turns slowly. Across it, at two depths, the
// quarantine lattice, its beacons pulsing amber at the nodes. When the
// Interdictor goes offline the boundary opens: the beacons go out and the
// lattices sag away into the dark, the nearer first.

import { bakePlanetMap } from '../bakedMaps.js';
import { lightPoint, under } from './pieces.js';

// proposta 21/11 ("B · Mundo que teve gente, rachado"): the planet's radius,
// the depth of its top under the field (above the far nebula, which hides
// what is deeper) and its place off the view's middle; the share of the
// camera's travel it follows (near 1: far off); its turn (rad/s) and tilt.
const PLANET = {
  radius: 680,
  depth: 2550,
  at: [-1500, -700],
  follow: 0.97,
  spin: 0.015,
  tilt: [0.5, 0, 0.35],
  air: 1.035,
};
// The sun behind it (the direction its lit ground faces) and its look: rock
// albedo, day side, the night's faint fill and the glow toward the
// terminator, dead cities, the crack, the limb and the air, the haze.
const SUN = [0.42, -0.8, -0.45];
const LOOK = {
  rock: ['#6e6860', 1],
  day: 0.7,
  fill: 0.035,
  term: 0.2,
  city: ['#bfe4ff', 0.16],
  crack: ['#ff4a1c', 0.55],
  rim: ['#ffc890', 0.4],
  air: 0.5,
  haze: 0.1,
};
// the lattices' spacing and depth; the beacons' pulse (seconds).
const LATTICES = [
  { depth: 1000, spacing: 340, lines: [9, 7], follow: 0.3 },
  { depth: 1700, spacing: 520, lines: [9, 7], follow: 0.5 },
];
const PULSE = { period: 2.6, low: 0.45 };
// proposta 12/11: the open boundary — each lattice's beacons out and its
// fall done over `span` of the wake (the beacons out in its first half),
// the farther `step` later; it sinks
// `sink` (a share of its depth) and tips `tip` radians as it goes.
const FALL = { span: 0.55, step: 0.25, sink: 0.35, tip: 0.1 };

const VERTEX = `
varying vec3 vNormal;
varying vec3 vLocal;
varying vec3 vView;
void main() {
  vLocal = normal;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vView = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
// The ground: the map read in the planet's own turning frame, lit by the
// fixed sun; cities only on the night side, the crack everywhere.
const GROUND = `
uniform sampler2D uMap;
uniform vec3 uSun;
uniform float uSpin;
uniform float uOpacity;
uniform vec3 uRock;
uniform vec3 uCity;
uniform vec3 uCrack;
uniform vec3 uRim;
uniform vec3 uHaze;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec3 vView;
void main() {
  vec3 n = normalize(vNormal);
  float c = cos(uSpin);
  float s = sin(uSpin);
  vec3 p = normalize(vec3(c * vLocal.x - s * vLocal.z, vLocal.y,
    s * vLocal.x + c * vLocal.z));
  vec2 uv = vec2(atan(p.z, p.x) / 6.2831853 + 0.5,
    asin(clamp(p.y, -1.0, 1.0)) / 3.1415927 + 0.5);
  vec4 ground = texture2D(uMap, uv);
  float lit = dot(n, uSun);
  float day = smoothstep(-0.02, 0.35, lit);
  float night = 1.0 - smoothstep(-0.2, 0.02, lit);
  float near = smoothstep(-0.55, 0.15, lit);
  vec3 color = uRock * ground.r * (${LOOK.day.toFixed(2)} * day
    + ${LOOK.fill.toFixed(3)} + ${LOOK.term.toFixed(2)} * near * near);
  color += uCity * ground.g * night + uCrack * ground.b;
  float edge = pow(1.0 - max(dot(n, vView), 0.0), 3.0);
  float toward = smoothstep(-0.35, 0.5, lit);
  color += uRim * edge * mix(0.03, 1.0, toward * toward);
  gl_FragColor = vec4(mix(color, uHaze, ${LOOK.haze.toFixed(2)}), uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
// The air outside the limb: a back-face shell, brightest toward the sun.
const AIR = `
uniform vec3 uSun;
uniform vec3 uRim;
uniform float uOpacity;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec3 vView;
void main() {
  vec3 n = normalize(vNormal);
  float inner = sqrt(1.0 - 1.0 / ${(PLANET.air * PLANET.air).toFixed(4)});
  float k = pow(smoothstep(0.0, inner, max(dot(-n, vView), 0.0)), 5.0);
  float toward = smoothstep(-0.35, 0.55, dot(n, uSun));
  gl_FragColor = vec4(uRim * ${LOOK.air.toFixed(2)} * k
    * mix(0.04, 1.0, toward * toward) * uOpacity, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// A shader material the set fades like its others (PlaceSets.apply sets
// `opacity`; the mesh hands it to the shader as it draws).
function faded(THREE, kit, name, options) {
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    transparent: true,
    ...options,
  });
  material.uniforms.uOpacity = { value: 1 };
  kit.materials.set(name, material);
  return material;
}

function planet(THREE, kit) {
  // the shader's own levels, as the approved mock-up set them (not sRGB)
  const color = ([css, k]) => new THREE.Color(css).multiplyScalar(k);
  const sun = { value: new THREE.Vector3(...SUN).normalize() };
  const rim = { value: color(LOOK.rim) };
  const ground = faded(THREE, kit, 'planet', {
    fragmentShader: GROUND,
    uniforms: {
      uMap: { value: bakePlanetMap(THREE, 18) },
      uSun: sun,
      uSpin: { value: 0 },
      uRock: { value: color(LOOK.rock) },
      uCity: { value: color(LOOK.city) },
      uCrack: { value: color(LOOK.crack) },
      uRim: rim,
      uHaze: { value: kit.haze },
    },
  });
  // it draws after the space behind it (its stars and clouds, which would
  // ghost through it), still behind the lattices and the play
  ground.userData.blended = true;
  const air = faded(THREE, kit, 'planet-air', {
    fragmentShader: AIR,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uSun: sun, uRim: rim },
  });
  const sphere = new THREE.SphereGeometry(1, 48, 32);
  const body = new THREE.Mesh(sphere, ground);
  body.scale.setScalar(PLANET.radius);
  body.renderOrder = -7.5;
  const shell = new THREE.Mesh(sphere, air);
  shell.scale.setScalar(PLANET.radius * PLANET.air);
  shell.renderOrder = -7;
  [body, shell].forEach((mesh) => {
    const { uniforms } = mesh.material;
    mesh.onBeforeRender = () => {
      uniforms.uOpacity.value = mesh.material.opacity;
    };
  });
  const turned = new THREE.Group();
  turned.rotation.set(...PLANET.tilt);
  turned.add(body, shell);
  turned.position.y = -PLANET.radius;
  const object = new THREE.Group();
  object.add(turned);
  return { object, spin: ground.uniforms.uSpin };
}

function lattice(kit, beams, beacons, { spacing, lines: [nx, nz] }, level) {
  const { tone, random } = kit;
  const steel = tone('#2e2a26');
  const node = tone('#3a352f');
  const amber = tone('#ff9030', 1.5 - level * 0.4);
  const sx = ((nx - 1) * spacing) / 2;
  const sz = ((nz - 1) * spacing) / 2;
  for (let i = 0; i < nx; i += 1) {
    kit.box(beams, steel, [i * spacing - sx, 0, 0], [5, 5, sz * 2 + spacing]);
  }
  for (let j = 0; j < nz; j += 1) {
    kit.box(beams, steel, [0, -6, j * spacing - sz], [sx * 2 + spacing, 5, 5]);
  }
  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < nz; j += 1) {
      const at = [i * spacing - sx, 0, j * spacing - sz];
      kit.box(beams, node, at, [26, 18, 26], [0, Math.PI / 4, 0]);
      kit.put(beams, kit.unit.drum(6), steel, [at[0], -40, at[2]], [5, 80, 5]);
      if ((i + j) % 2 === 0 && random() < 0.8) {
        lightPoint(kit, beacons, amber, [at[0], 12, at[2]], 4);
      }
    }
  }
}

export function buildQuarantineGrid(THREE, kit) {
  const world = planet(THREE, kit);
  const layers = [
    {
      object: world.object,
      anchor: under(PLANET.depth, ...PLANET.at),
      follow: PLANET.follow,
    },
  ];
  const fences = LATTICES.map((spec, level) => {
    const beams = kit.parts();
    const beacons = kit.parts();
    lattice(kit, beams, beacons, spec, level);
    const object = new THREE.Group();
    object.add(kit.mesh(beams), kit.mesh(beacons, 'glow', `beacons-${level}`));
    object.rotation.set(0, 0.2 + level * 0.12, 0);
    layers.push({ object, anchor: under(spec.depth), follow: spec.follow });
    return {
      object,
      beacons: kit.materials.get(`beacons-${level}`),
      sink: spec.depth * FALL.sink,
    };
  });
  return {
    layers,
    update(time, wake) {
      world.spin.value = time * PLANET.spin;
      const wave = 0.5 + 0.5 * Math.sin((time * Math.PI * 2) / PULSE.period);
      const pulse = PULSE.low + (1 - PULSE.low) * wave;
      for (let level = 0; level < fences.length; level += 1) {
        const { object, beacons, sink } = fences[level];
        const t = (Math.min(1, wake) - level * FALL.step) / FALL.span;
        const down = Math.min(1, Math.max(0, t));
        const eased = down * down * (3 - 2 * down);
        beacons.color.setScalar(pulse * Math.max(0, 1 - 2 * Math.max(0, t)));
        object.position.y = -sink * eased;
        object.rotation.z = FALL.tip * eased;
      }
    },
  };
}
