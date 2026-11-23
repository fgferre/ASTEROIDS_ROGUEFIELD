// The player ship's guard looks (playerMirror.js), mirroring the 2D
// PlayerSystem render: the dash's i-frames (a brighter cyan rim and a thin
// ring of light around the ship), its afterimages, and the white blink while
// invulnerable after a hit.

import {
  DASH_GHOST_COUNT,
  DASH_GHOST_LIFE,
} from '../../../data/constants/gameplay.js';
import { PALETTE } from '../../../data/constants/palette.js';
import { HALF_H, HALF_W, colorOf } from '../batches.js';
import { VISUAL_SCALE } from '../hullModel.js';

// Dash i-frames: brighter cyan rim and a thin ring (proposta 18/10), its
// band from DASH_RING_INNER to 1 of its radius.
const DASH_RIM_BOOST = 3;
const DASH_RING_OPACITY = 0.55;
const DASH_RING_INNER = 0.94;
const BLINK_HZ = 8;
const GHOST_ALPHA = 0.5;

// The dash ring turns to face the camera about the ship: a ring of light
// around it from any angle, never an edge (its radius is the mesh's scale).
const DASH_RING_VERTEX = `
varying vec2 vPos;
void main() {
  vPos = position.xy;
  vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 corner = position.xy * length(modelMatrix[0].xyz);
  gl_Position = projectionMatrix * (centre + vec4(corner, 0.0, 0.0));
}`;

const DASH_RING_FRAGMENT = `
uniform vec3 uColor;
varying vec2 vPos;
void main() {
  float r = length(vPos);
  float aa = fwidth(r);
  float inner = ${DASH_RING_INNER.toFixed(2)};
  float band = smoothstep(inner - aa, inner + aa, r)
    * (1.0 - smoothstep(1.0 - aa, 1.0, r));
  gl_FragColor = vec4(uColor * band, 1.0);
}`;

// The rim's plain and dash colours (`rim`: the hull's rim uniform), the
// dash ring and the afterimages.
export function createDash(mirror, THREE, scene, rim) {
  mirror.rim = rim.value;
  mirror.rimRgb = rim.value.clone();
  mirror.dashRimRgb = rim.value.clone().multiplyScalar(DASH_RIM_BOOST);
  mirror.dashRing = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: {
        uColor: {
          value: colorOf(THREE, PALETTE.player).multiplyScalar(
            1.6 * DASH_RING_OPACITY
          ),
        },
      },
      vertexShader: DASH_RING_VERTEX,
      fragmentShader: DASH_RING_FRAGMENT,
      extensions: { derivatives: true },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  mirror.dashRing.visible = false;
  mirror.group.add(mirror.dashRing);

  mirror.ghosts = [];
  for (let i = 0; i < DASH_GHOST_COUNT; i += 1) {
    const ghost = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: colorOf(THREE, PALETTE.player),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      })
    );
    ghost.visible = false;
    ghost.rotation.order = 'YXZ';
    ghost.scale.setScalar(VISUAL_SCALE);
    scene.add(ghost);
    mirror.ghosts.push(ghost);
  }
  mirror.ghostRgb = colorOf(THREE, PALETTE.player);
  // afterimages dropped while the ship was hidden (Blink): never drawn, so
  // the hidden stretch of the dash leaves a gap
  mirror.hiddenGhosts = new WeakSet();
  mirror.dashGuard = false;
}

// Blink while invulnerable after a hit; the dash's own i-frames, the
// win's steady guard and a hit the shield took whole (holdBlink) do not.
export function updateGuard(mirror, player, time) {
  const invulnerable = player.invulnerableTimer > 0;
  if (player.dashTimer > 0) mirror.dashGuard = true;
  else if (!invulnerable) mirror.dashGuard = false;
  mirror.blink.value =
    invulnerable &&
    !mirror.dashGuard &&
    !player.steadyGuard &&
    time >= mirror.blinkHeldUntil
      ? 0.35 * (1 + Math.sin(time * Math.PI * 2 * BLINK_HZ))
      : 0;
  const dashShield = invulnerable && mirror.dashGuard;
  mirror.rim.copy(dashShield ? mirror.dashRimRgb : mirror.rimRgb);
  // the shield shell already reads as protection; the ring would sit inside it
  mirror.dashRing.visible = dashShield && !player.isShieldActive;
}

export function updateGhosts(mirror, list) {
  const ghosts = list || [];
  for (let i = 0; i < mirror.ghosts.length; i += 1) {
    const mesh = mirror.ghosts[i];
    const ghost = ghosts[i];
    if (!ghost || mirror.hiddenGhosts.has(ghost)) {
      mesh.visible = false;
      continue;
    }
    const alpha = GHOST_ALPHA * Math.max(0, 1 - ghost.age / DASH_GHOST_LIFE);
    mesh.visible = alpha > 0.01;
    mesh.position.set(ghost.x - HALF_W, 0, ghost.y - HALF_H);
    mesh.rotation.y = -(ghost.angle || 0);
    mesh.material.color.copy(mirror.ghostRgb).multiplyScalar(alpha);
  }
}

export function hideGhosts(mirror) {
  for (let i = 0; i < mirror.ghosts.length; i += 1) {
    mirror.ghosts[i].visible = false;
  }
}
