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

export function createFieldVeil(THREE, scene) {
  const color = colorOf(THREE, VEIL_COLOR);
  const group = new THREE.Group();

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
      uniforms: { uColor: { value: color } },
      vertexShader: PLANE_VERTEX,
      fragmentShader: `
        uniform vec3 uColor;
        varying vec2 vPos;
        ${RECT_DISTANCE}
        void main() {
          float g = exp(-abs(outside(vPos)) / ${EDGE_WIDTH.toFixed(1)});
          gl_FragColor = vec4(uColor * g * ${EDGE_GLOW.toFixed(2)}, 1.0);
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
    uniforms: { uColor: { value: color } },
    vertexShader: `
      varying float vY;
      void main() {
        vY = (modelMatrix * vec4(position, 1.0)).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vY;
      void main() {
        float k = vY > 0.0 ? vY / ${CURTAIN_HEIGHT.toFixed(1)} : -vY / ${CURTAIN_SKIRT.toFixed(1)};
        float g = pow(max(0.0, 1.0 - k), 2.0) * ${CURTAIN_GLOW.toFixed(2)};
        gl_FragColor = vec4(uColor * g, 1.0);
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
  return group;
}
