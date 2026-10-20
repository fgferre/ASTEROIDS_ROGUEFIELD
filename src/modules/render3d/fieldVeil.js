// The arena's border, now that the camera may show past it (PLAN.md 14.2b,
// approved 19/10/2026): a veil of faint light you cross, never a wall, since
// the ship goes out one side and comes back on the other. Three pieces on
// the field's rectangle: the space beyond it a little darker, a glow along
// its edge, and a low curtain of light rising from that edge, which reads
// best when the camera looks across it; a short skirt below the plane keeps
// its foot soft from the side and from below.

import { GAME_HEIGHT, GAME_WIDTH } from '../../core/GameConstants.js';
import { colorOf } from './batches.js';

const VEIL_COLOR = '#8fe3ff';
// How dark the space past the edge gets, and over how many units it fades
// in from the edge.
const BEYOND_DARKNESS = 0.5;
const BEYOND_FADE = 60;
// The glow along the edge: its strength and how fast it falls off (units).
const EDGE_GLOW = 0.22;
const EDGE_WIDTH = 3;
// The curtain: its height and skirt below the plane (units) and strength at
// the base.
const CURTAIN_HEIGHT = 46;
const CURTAIN_SKIRT = 26;
const CURTAIN_GLOW = 0.12;
// How far past the field the darkening reaches (units).
const REACH = 6000;
// Where a Warden crosses the edge on its entrance (enemies/boss/arrival.js)
// the line and its curtain light up in its colour and fade: how far along
// the edge and across it (units), how bright, over how many seconds. At most
// `count` at once. Proposta 19/10.
const FLARE = { count: 4, along: 120, across: 9, glow: 1.1, fade: 1.1 };

const HALF_W = GAME_WIDTH / 2;
const HALF_H = GAME_HEIGHT / 2;

// Distance outside the field's rectangle in the shader, centred on it.
const RECT_DISTANCE = `
  float outside(vec2 p) {
    vec2 d = abs(p) - vec2(${HALF_W.toFixed(1)}, ${HALF_H.toFixed(1)});
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }
`;

const PLANE_VERTEX = `
  varying vec2 vPos;
  void main() {
    vPos = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// The flares in a shader: each one's light at field point `p` (world xz).
const FLARE_LIGHT = `
  uniform vec4 uFlares[${FLARE.count}];
  uniform vec3 uFlareColors[${FLARE.count}];
  vec3 flareLight(vec2 p, float across) {
    vec3 light = vec3(0.0);
    for (int i = 0; i < ${FLARE.count}; i++) {
      vec4 f = uFlares[i];
      if (f.z > 0.0) {
        vec2 d = (p - f.xy) / ${FLARE.along.toFixed(1)};
        light += uFlareColors[i] * f.z * across * exp(-dot(d, d));
      }
    }
    return light * ${FLARE.glow.toFixed(2)};
  }
`;

/**
 * The veil in `scene`. Returns `flare(x, z, color)` (world x/z of a point
 * on the edge) and `update(dt)`, which fades the flares.
 */
export function createFieldVeil(THREE, scene) {
  const color = colorOf(THREE, VEIL_COLOR);
  const group = new THREE.Group();
  const flares = Array.from({ length: FLARE.count }, () => ({
    at: new THREE.Vector4(0, 0, 0, 0),
    color: new THREE.Color(),
  }));
  const flareUniforms = {
    uFlares: { value: flares.map((f) => f.at) },
    uFlareColors: { value: flares.map((f) => f.color) },
  };

  const plane = (material, height, renderOrder) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(REACH * 2, REACH * 2).rotateX(-Math.PI / 2),
      material
    );
    mesh.position.y = height;
    mesh.renderOrder = renderOrder;
    mesh.frustumCulled = false;
    group.add(mesh);
  };

  // Past the edge: the space behind dims, fading in from the border.
  plane(
    new THREE.ShaderMaterial({
      vertexShader: PLANE_VERTEX,
      fragmentShader: `
        varying vec2 vPos;
        ${RECT_DISTANCE}
        void main() {
          float a = smoothstep(0.0, ${BEYOND_FADE.toFixed(1)}, outside(vPos));
          gl_FragColor = vec4(0.0, 0.0, 0.0, a * ${BEYOND_DARKNESS.toFixed(2)});
        }
      `,
      transparent: true,
      depthWrite: false,
    }),
    -2,
    -6
  );

  // The glow along the edge, on both sides of it.
  plane(
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color }, ...flareUniforms },
      vertexShader: PLANE_VERTEX,
      fragmentShader: `
        uniform vec3 uColor;
        varying vec2 vPos;
        ${RECT_DISTANCE}
        ${FLARE_LIGHT}
        void main() {
          float d = abs(outside(vPos));
          float g = exp(-d / ${EDGE_WIDTH.toFixed(1)});
          vec3 flare = flareLight(vPos, exp(-d / ${FLARE.across.toFixed(1)}));
          gl_FragColor = vec4(uColor * g * ${EDGE_GLOW.toFixed(2)} + flare, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    -1,
    -5
  );

  // The curtain: four walls of light on the edges, brightest at the base,
  // fading up to its top and down to the skirt's foot.
  const curtain = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color }, ...flareUniforms },
    vertexShader: `
      varying float vY;
      varying vec2 vPos;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vY = world.y;
        vPos = world.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vY;
      varying vec2 vPos;
      ${FLARE_LIGHT}
      void main() {
        float k = vY > 0.0 ? vY / ${CURTAIN_HEIGHT.toFixed(1)} : -vY / ${CURTAIN_SKIRT.toFixed(1)};
        float rise = max(0.0, 1.0 - k);
        vec3 flare = flareLight(vPos, rise) * 0.5;
        gl_FragColor = vec4(uColor * rise * rise * ${CURTAIN_GLOW.toFixed(2)} + flare, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const wall = (length, x, z, turn) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(length, CURTAIN_HEIGHT + CURTAIN_SKIRT),
      curtain
    );
    mesh.position.set(x, (CURTAIN_HEIGHT - CURTAIN_SKIRT) / 2, z);
    mesh.rotation.y = turn;
    mesh.renderOrder = -4;
    group.add(mesh);
  };
  wall(GAME_WIDTH, 0, -HALF_H, 0);
  wall(GAME_WIDTH, 0, HALF_H, 0);
  wall(GAME_HEIGHT, -HALF_W, 0, Math.PI / 2);
  wall(GAME_HEIGHT, HALF_W, 0, Math.PI / 2);

  scene.add(group);
  return {
    group,
    flare(x, z, flareColor) {
      const slot = flares.reduce((a, b) => (b.at.z < a.at.z ? b : a));
      slot.at.set(x, z, 1, 0);
      slot.color.set(flareColor);
    },
    update(dt) {
      flares.forEach(({ at }) => {
        at.z = Math.max(0, at.z - dt / FLARE.fade);
      });
    },
  };
}
