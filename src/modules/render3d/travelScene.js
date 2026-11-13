// The journey between sectors (ui/runCinematics.js), drawn in the game's own
// scene: the real ship, seen from behind, skims the broken Ring — laid along
// its flight at `FLIGHT.scale` × its size (brokenRing.js `offset`), plating
// and running lights streaming past under it, its far side arched across the
// sky — through streaks of dust, flying toward the place it goes to: that
// place's set (places/placeSets.js setFlight) hangs ahead, posed as the
// intro's first shot will see it, and grows as the ship closes in, while the
// colours cross-fade from the place just left (deep space before the first).
// A journey into a new chapter jumps: a tunnel of stretched streaks, a
// white-out, and the drop-out in front of the new place. The opening flies
// in from deep space toward the whole Ring, small and far. The flight
// decelerates onto the ship's spawn, heading where it will start; over its
// last stretch the camera rises into the intro's first pose, the Ring and
// the set settle back where the field sees them, and over the last second
// the field (its border, the drifting fragments) fades in, so the intro goes
// on without a cut. Everything is a function of t (0..1): `?cinematic=
// travel&t=` freezes a frame (core/cinematics.js). Nothing is allocated per
// frame.

import { BIOMES, biomeForLayer } from '../../data/biomes.js';
import { SECTORS, sectorById } from '../../data/sectors.js';
import { TRAVEL, easeInOut } from '../../core/cinematics.js';
import { createSeededRandom } from './asteroidMesh.js';
import { HALF_H, HALF_W } from './batches.js';
import { RING, RING_LOOK } from './ring/ringShape.js';

// proposta 12/11: the flight. The ship flies `arc` radians of the Ring's
// circle, laid at `scale` × its size, skimming its deck (`skim`: [side,
// height], world units inward of its centre line and over its deck) and,
// from `peel`, easing out to its destination's distance (PLACES); it
// cruises, then from `brake` slows onto its spawn, its engines at `thrust`.
// From `rise` the camera climbs into the intro's pose. The Ring's running
// lights glow `lights` × and its haze runs `haze` × deeper while it flies.
export const FLIGHT = {
  arc: (40 * Math.PI) / 180,
  scale: 5,
  skim: [-60, 44],
  peel: [0.42, 0.72],
  thrust: 0.5,
  brake: 0.62,
  rise: 0.72,
  lights: 4,
  haze: 3,
};
// proposta 12/11: how far from the Ring each place is as its journey ends
// (docs/ROTEIRO.md "Os lugares"): [side, height] in world units, inward of
// the laid Ring's centre line (negative: outside its outer wall) and over
// its deck.
export const PLACES = {
  'debris-wake': [6000, 2600],
  'salvage-lanes': [2600, 1100],
  'prime-gate': [-380, -10],
  'furnace-drift': [1500, 500],
  'crystal-choir': [300, 120],
  'dense-core': [220, 90],
  'assembly-graveyard': [1800, 700],
  'quarantine-grid': [2600, 1200],
  'wardens-reach': [600, 240],
  'the-crucible': [500, 160],
};
// proposta 12/11: the place ahead. Its set shows from `appear` (a jump: at
// the jump), `lift` radians over the chase camera's line of sight and
// `ahead` units further off than the intro will see it at the start
// (`opening`: the opening's start; `drop`: just out of a jump), closing in
// to the intro's own distance by the rise.
const DESTINATION = {
  appear: [0, 0.12],
  lift: 0.24,
  ahead: 7000,
  opening: 8000,
  drop: 5000,
};
// proposta 12/11: a journey into a new chapter (and the opening) jumps:
// from `from` the streaks pull into a tunnel of radius `tube` and stretch
// `stretch` ×, `speed` × faster at `at`; the frame whites out over
// `white` ([up, peak, held, clear]); the ship drops out at its destination
// and the streaks slow back to the cruise by `settle`.
export const JUMP = {
  to: ['debris-wake', 'furnace-drift', 'assembly-graveyard', 'the-crucible'],
  from: 0.18,
  at: 0.36,
  settle: 0.54,
  tube: 150,
  stretch: 16,
  speed: 14,
  white: [0.3, 0.355, 0.375, 0.45],
  tint: '#a9dcff',
};
// proposta 12/11: the chase camera, in the ship's frame (world units):
// `back` behind, `up` above, `right` to the side, aiming `ahead` past the
// ship and `lift` over it; it rolls `roll` × the ship's bank.
const CHASE = {
  back: 105,
  up: 24,
  right: 10,
  ahead: 420,
  lift: -14,
  roll: 0.5,
};
// proposta 12/11: the ship banks `base` into the Ring's curve and sways
// ±`sway` `swayTurns` times over the flight (radians).
const BANK = { base: 0.16, sway: 0.1, swayTurns: 1.5 };
// proposta 12/11: the colours cross-fade between these points of t.
const LOOK_FADE = [0.04, 0.3];
// proposta 12/11: the Ring's far side, arched across the sky ahead: the
// whole Ring again at `scale` × its size, its centre `at` [right, height,
// ahead] of the ship in the flight's final heading turned `yaw` toward its
// start (it keeps that offset: too far to parallax), its plane stood `lift`
// radians up so its arc rises over the horizon.
const SKY_ARC = { scale: 3.5, at: [0, -3500, -10000], yaw: -0.35, lift: 1.2 };
// proposta 12/11: the dust streaks: `count` in a box `half` wide and high
// round the flight line, from `ahead` in front to `behind` the ship, none
// within `clear` of it; each `length` long (× 0.6..1.4) and `width` thick,
// never under `minPixels` on screen. They pass `gain` × faster than the
// ship (the eye reads their speed, not the ship's) at `alpha`.
const STREAKS = {
  count: 320,
  half: [320, 180],
  ahead: 1400,
  behind: 200,
  clear: 70,
  length: 150,
  width: 0.35,
  minPixels: 1,
  gain: 0.9,
  alpha: 0.45,
};
// proposta 12/11: the place before the first sector: a nearly bare sky.
const DEEP_SPACE = Object.freeze({
  ...BIOMES[0],
  place: 'deep-space',
  sky: ['#04060b', '#010102'],
  hazeDensity: 0.25,
  veinDensity: 0,
  debris: 0,
  structures: 0,
});

const STREAK_VERTEX = `
attribute vec3 aSeed;
attribute vec2 aCorner;
uniform vec3 uOrigin;
uniform vec3 uForward;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uTravel;
uniform vec4 uBox;
uniform vec3 uShape;
uniform vec2 uTube;
uniform float uPixel;
varying float vFade;
varying float vSide;
void main() {
  float span = uBox.z + uBox.w;
  float along = fract(aSeed.z + uTravel / span);
  vec2 lateral = (aSeed.xy * 2.0 - 1.0) * uBox.xy;
  float r = length(lateral);
  if (r < uShape.z) lateral *= uShape.z / max(r, 0.001);
  vec2 wall = lateral / max(length(lateral), 0.001)
    * uTube.y * (0.8 + 0.4 * fract(aSeed.x * 13.7));
  lateral = mix(lateral, wall, uTube.x);
  vec3 head = uOrigin + uForward * (uBox.z - along * span)
    + uRight * lateral.x + uUp * lateral.y;
  float len = uShape.x * (0.6 + 0.8 * fract(aSeed.x * 7.13 + aSeed.y * 3.7));
  vec3 p = head - uForward * len * aCorner.x;
  float dist = distance(cameraPosition, p);
  vec3 side = normalize(cross(uForward, normalize(cameraPosition - p)));
  float width = max(uShape.y, uPixel * dist);
  p += side * aCorner.y * width;
  vFade = (1.0 - aCorner.x)
    * smoothstep(0.0, 0.12, along) * (1.0 - smoothstep(0.88, 1.0, along))
    * smoothstep(20.0, 70.0, dist) * min(1.0, uShape.y / width + 0.35);
  vSide = aCorner.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const STREAK_FRAGMENT = `
uniform vec3 uColor;
uniform float uAlpha;
varying float vFade;
varying float vSide;
void main() {
  float edge = 1.0 - abs(vSide);
  gl_FragColor = vec4(uColor * (uAlpha * vFade * edge), 1.0);
}`;

// The jump's light over the whole frame, drawn after the scene: the
// tunnel's glow round the edges, then the white-out.
const VEIL_VERTEX = `
varying vec2 vAt;
void main() {
  vAt = position.xy;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const VEIL_FRAGMENT = `
uniform vec3 uTint;
uniform float uWhite;
uniform float uTunnel;
uniform float uAspect;
varying vec2 vAt;
void main() {
  float r = length(vAt * vec2(uAspect, 1.0));
  float rim = smoothstep(0.4, 1.7, r);
  float a = max(uWhite, uTunnel * rim * 0.6);
  gl_FragColor = vec4(mix(uTint, vec3(1.0), uWhite), a);
}`;

/** The place a journey to `to` leaves: the sector before, else deep space. */
export function travelPlaces(to) {
  const sector = sectorById(to) ?? SECTORS[0];
  const index = SECTORS.indexOf(sector);
  const before = SECTORS[index - 1];
  return {
    from: before ? biomeForLayer(before.layers[1], before) : DEEP_SPACE,
    to: biomeForLayer(sector.layers[0], sector),
  };
}

/**
 * Share of the flight's length flown by t: a cruise, then from
 * FLIGHT.brake a steady slowing to rest at 1 (speed continuous).
 */
export function flown(t) {
  const x = Math.min(1, Math.max(0, t));
  const b = FLIGHT.brake;
  const v = 2 / (1 + b);
  if (x <= b) return v * x;
  const d = x - b;
  return v * (b + d - (d * d) / (2 * (1 - b)));
}

/**
 * The jump's extra distance by t (in units of its top speed × t): its
 * speed climbs from JUMP.from to JUMP.at, then falls away by JUMP.settle.
 */
export function jumpDistance(t) {
  const { from, at, settle } = JUMP;
  if (t <= from) return 0;
  const up = at - from;
  if (t <= at) return (t - from) ** 2 / (2 * up);
  const x = Math.min(1, (t - at) / (settle - at));
  return up / 2 + ((settle - at) * (1 - (1 - x) ** 3)) / 3;
}

function smooth(a, b, x) {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
}

// The chunks of the Ring the flight passes, built at their close levels
// with the scene (the loading screen): no build mid-flight.
function prepareTravelRing(ring) {
  ring.chunks.forEach((chunk) => {
    if (chunk.phi + chunk.half < -0.1) return;
    if (chunk.phi - chunk.half > FLIGHT.arc + 0.1) return;
    ring.build(chunk, 1);
    ring.build(chunk, 2);
  });
}

export class TravelScene {
  constructor(t) {
    const { THREE } = t;
    this.t = t;
    this.active = false;
    this.places = travelPlaces(null);
    this.jumps = false;
    this.opening = false;
    this.near = [FLIGHT.skim, FLIGHT.skim];
    this.look = { from: this.places.from, to: this.places.to, mix: 0 };
    this.bare = null;
    this.setId = null;
    this.startedAt = 0;
    this.durationMs = 1;
    this.frozenAt = null;
    // Where it ends: the ship's spawn and heading (field angle).
    this.end = new THREE.Vector3();
    this.turn = 0;
    this.k = 0;
    this.ship = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.heading = 0;
    this.pitch = 0;
    this.bank = 0;
    this.main = 1;
    this.focus = { x: HALF_W, y: HALF_H };
    this.introPos = new THREE.Vector3();
    this.introQuat = new THREE.Quaternion();
    this.introAim = new THREE.Vector3();
    this.introUp = new THREE.Vector3();
    this.offset = new THREE.Vector3();
    this.introOffset = new THREE.Vector3();
    this.aim = new THREE.Vector3();
    this.ringStart = new THREE.Vector3();
    // The set ahead's pose: a view like the chase camera's, `ahead` further
    // on, standing in for the intro's first pose.
    this.eye = new THREE.Vector3();
    this.viewPos = new THREE.Vector3();
    this.viewQuat = new THREE.Quaternion();
    this.look4 = new THREE.Matrix4();
    this.view4 = new THREE.Matrix4();
    this.intro4 = new THREE.Matrix4();
    this.unit = new THREE.Vector3(1, 1, 1);
    this.side = new THREE.Vector3(1, 0, 0);
    this.lifted = new THREE.Quaternion();
    const ring = t.backdrop.ring;
    this.idle = ring.uniforms.uIdle.value.clone();
    this.streaks = this.buildStreaks(THREE);
    t.scene.add(this.streaks);
    this.skyArc = this.buildSkyArc(THREE, ring);
    t.scene.add(this.skyArc);
    this.veil = this.buildVeil(THREE);
    t.overlay.add(this.veil);
    prepareTravelRing(ring);
  }

  buildStreaks(THREE) {
    const { count } = STREAKS;
    const random = createSeededRandom(7171.3);
    const seeds = new Float32Array(count * 12);
    const corners = new Float32Array(count * 8);
    const index = [];
    const quad = [0, -1, 0, 1, 1, 1, 1, -1];
    for (let i = 0; i < count; i += 1) {
      const seed = [random(), random(), random()];
      for (let v = 0; v < 4; v += 1) {
        seeds.set(seed, (i * 4 + v) * 3);
        corners.set([quad[v * 2], quad[v * 2 + 1]], (i * 4 + v) * 2);
      }
      const o = i * 4;
      index.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(index);
    geometry.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    geometry.setAttribute('aCorner', new THREE.BufferAttribute(corners, 2));
    this.uniforms = {
      uOrigin: { value: new THREE.Vector3() },
      uForward: { value: new THREE.Vector3() },
      uRight: { value: new THREE.Vector3() },
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uTravel: { value: 0 },
      uBox: {
        value: new THREE.Vector4(
          STREAKS.half[0],
          STREAKS.half[1],
          STREAKS.ahead,
          STREAKS.behind
        ),
      },
      uShape: {
        value: new THREE.Vector3(STREAKS.length, STREAKS.width, STREAKS.clear),
      },
      uTube: { value: new THREE.Vector2(0, JUMP.tube) },
      uPixel: { value: 0 },
      uColor: { value: new THREE.Color() },
      uAlpha: { value: 0 },
    };
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: STREAK_VERTEX,
        fragmentShader: STREAK_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
    );
    mesh.frustumCulled = false;
    mesh.visible = false;
    return mesh;
  }

  // The Ring's far side for the sky: its chunks' far geometry again, in its
  // material, posed by frame().
  buildSkyArc(THREE, ring) {
    const group = new THREE.Group();
    ring.chunks.forEach((chunk) => {
      const mesh = new THREE.Mesh(chunk.meshes[0].geometry, ring.material);
      mesh.renderOrder = -10;
      mesh.frustumCulled = false;
      group.add(mesh);
    });
    group.visible = false;
    return group;
  }

  buildVeil(THREE) {
    this.veilUniforms = {
      uTint: { value: new THREE.Color(JUMP.tint) },
      uWhite: { value: 0 },
      uTunnel: { value: 0 },
      uAspect: { value: 16 / 9 },
    };
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: this.veilUniforms,
        vertexShader: VEIL_VERTEX,
        fragmentShader: VEIL_FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      })
    );
    mesh.frustumCulled = false;
    mesh.renderOrder = 1000;
    mesh.visible = false;
    return mesh;
  }

  /**
   * Flies to sector `to` over `durationMs`, ending on `player`'s spawn;
   * `frozenAt` (dev) holds one t.
   */
  start(to, durationMs, player, frozenAt = null) {
    this.places = travelPlaces(to);
    const sector = sectorById(to) ?? SECTORS[0];
    this.opening = SECTORS.indexOf(sector) === 0;
    this.jumps = JUMP.to.includes(sector.id);
    this.near[0] = FLIGHT.skim;
    this.near[1] = PLACES[sector.id] ?? FLIGHT.skim;
    // Over the last second the field's drifting fragments come in.
    this.bare = {
      ...this.places.to,
      place: `${this.places.to.place ?? this.places.to.id}~bare`,
      debris: 0,
    };
    this.look.from = this.places.from;
    this.look.to = this.places.to;
    this.look.mix = 0;
    this.setId = this.places.to.backdrop ?? null;
    this.startedAt = performance.now();
    this.durationMs = durationMs;
    this.frozenAt = frozenAt;
    const at = player?.position ?? { x: HALF_W, y: HALF_H };
    this.end.set(at.x - HALF_W, 0, at.y - HALF_H);
    // The flight below heads up the field (−π/2) as it lands: turned to
    // the spawn's heading.
    this.turn = (player?.angle ?? -Math.PI / 2) + Math.PI / 2;
    this.active = true;
    this.streaks.visible = true;
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.streaks.visible = false;
    this.skyArc.visible = false;
    this.veil.visible = false;
    this.t.veil.setLevel(1);
    this.t.backdrop.places.setFlight(null);
    this.t.backdrop.setArrival(1);
    const ring = this.t.backdrop.ring;
    ring.offset.set(0, 0, 0);
    ring.follow = RING.follow;
    ring.object.rotation.set(-RING.tilt, 0, 0);
    ring.object.scale.setScalar(1);
    ring.uniforms.uIdle.value.copy(this.idle);
    ring.uniforms.uHazeDepth.value = RING_LOOK.hazeDepth;
  }

  // Share of the way from skimming the Ring to the destination's distance
  // at t: a jump drops there at once, under its white-out.
  closeness(t) {
    if (this.jumps) return Number(t >= JUMP.at);
    return smooth(FLIGHT.peel[0], FLIGHT.peel[1], t);
  }

  // The ship's place in the flight frame (the spawn at the origin, heading
  // −z as it lands) after share `f` of the flight at t, into `out`.
  flightPoint(f, t, out) {
    const phi = FLIGHT.arc * (1 - f);
    const close = this.closeness(t);
    const [side0, height0] = this.near[0];
    const [side1, height1] = this.near[1];
    const side = side0 + (side1 - side0) * close;
    const height = height0 + (height1 - height0) * close;
    const radius = RING.radius * FLIGHT.scale - side;
    const last = RING.radius * FLIGHT.scale - side1;
    return out.set(
      radius * Math.cos(phi) - last,
      height - height1,
      radius * Math.sin(phi)
    );
  }

  get progress() {
    if (this.frozenAt !== null) return Math.min(1, Math.max(0, this.frozenAt));
    return Math.min(1, (performance.now() - this.startedAt) / this.durationMs);
  }

  // (x, z) turned by the spawn's heading, about the end point, into `out`.
  place(x, y, z, out) {
    const c = Math.cos(this.turn);
    const s = Math.sin(this.turn);
    return out.set(
      this.end.x + x * c - z * s,
      this.end.y + y,
      this.end.z + x * s + z * c
    );
  }

  // How much further off the place ahead is than the intro will see it.
  destinationAhead(t, f) {
    const toRise = Math.max(0, 1 - f / flown(FLIGHT.rise));
    if (!this.jumps) return DESTINATION.ahead * toRise;
    if (t < JUMP.at) return DESTINATION.opening;
    // Out of the jump it rushes in, then closes slowly.
    const x = Math.min(1, (t - JUMP.at) / (FLIGHT.rise - JUMP.at));
    return DESTINATION.drop * (1 - x) ** 2 * (1 - 0.6 * x) * (toRise > 0);
  }

  destinationShare(t) {
    if (this.opening) return 1;
    if (this.jumps) return Number(t >= JUMP.at);
    return smooth(DESTINATION.appear[0], DESTINATION.appear[1], t);
  }

  /**
   * This frame of the flight, after the rig has posed `camera` on the
   * intro's first pose: the ship's pose, the camera, the Ring, the place
   * ahead, the look and the streaks. `pixelHeight`: the frame's height in
   * pixels.
   */
  frame(camera, pixelHeight) {
    const t = this.progress;
    const f = flown(t);
    const k = easeInOut((t - FLIGHT.rise) / (1 - FLIGHT.rise));
    this.k = k;
    const hand = smooth(1 - TRAVEL.handOffMs / this.durationMs, 1, t);

    // The ship closing in on the laid Ring, heading along its flight.
    const { ship, forward, aim } = this;
    this.flightPoint(f, t, aim);
    this.place(aim.x, aim.y, aim.z, ship);
    this.flightPoint(Math.max(0, f - 0.002), t, forward);
    this.place(forward.x, forward.y, forward.z, forward);
    if (f > 0.002) forward.subVectors(ship, forward).normalize();
    else forward.set(0, 0, -1);
    this.pitch = Math.asin(forward.y);
    this.right.set(-forward.z, 0, forward.x).normalize();
    this.heading = Math.atan2(forward.z, forward.x);
    const sway = Math.sin(t * Math.PI * 2 * BANK.swayTurns);
    this.bank = (BANK.base + BANK.sway * sway) * (1 - k);
    this.main = FLIGHT.thrust * (1 - k);

    // The Ring laid for the flight at its flight size, then back to its
    // place; its far side arched over the sky while it flies.
    const ring = this.t.backdrop.ring;
    const size = RING.radius * FLIGHT.scale;
    const last = size - this.near[1][0];
    this.place(-last, -this.near[1][1], 0, this.ringStart);
    ring.offset
      .set(
        this.ringStart.x - RING.centre[0],
        this.ringStart.y - RING.centre[1],
        this.ringStart.z - RING.centre[2]
      )
      .multiplyScalar(1 - k);
    ring.follow = RING.follow * k;
    ring.object.rotation.set(-RING.tilt * k, -this.turn * (1 - k), 0);
    ring.object.scale.setScalar(FLIGHT.scale + (1 - FLIGHT.scale) * k);
    ring.uniforms.uIdle.value
      .copy(this.idle)
      .multiplyScalar(FLIGHT.lights + (1 - FLIGHT.lights) * k);
    ring.uniforms.uHazeDepth.value =
      RING_LOOK.hazeDepth * (FLIGHT.haze + (1 - FLIGHT.haze) * k);
    const [sx, sy, sz] = SKY_ARC.at;
    const c = Math.cos(SKY_ARC.yaw);
    const s = Math.sin(SKY_ARC.yaw);
    this.place(sx * c + sz * s, sy, sz * c - sx * s, this.skyArc.position)
      .sub(this.end)
      .add(this.ship);
    this.skyArc.rotation.set(SKY_ARC.lift, SKY_ARC.yaw - this.turn, 0, 'YXZ');
    this.skyArc.scale.setScalar(SKY_ARC.scale);

    // The chase pose, then eased into the intro's, which the rig holds
    // under it: both relative to the ship (it lands on the spawn the intro
    // looks at), the distance growing geometrically so the ship stays in
    // the shot while the camera climbs.
    this.introPos.copy(camera.position);
    this.introQuat.copy(camera.quaternion);
    this.introUp.set(0, 1, 0).applyQuaternion(this.introQuat);
    this.introAim.set(0, 0, -1).applyQuaternion(this.introQuat);
    this.introAim
      .multiplyScalar(-this.introPos.y / Math.min(-0.1, this.introAim.y))
      .add(this.introPos)
      .sub(this.end);
    this.introOffset.copy(this.introPos).sub(this.end);
    this.offset
      .copy(this.forward)
      .multiplyScalar(-CHASE.back)
      .addScaledVector(this.right, CHASE.right);
    this.offset.y += CHASE.up;
    this.aim.copy(this.forward).multiplyScalar(CHASE.ahead);
    this.aim.y += CHASE.lift;
    this.poseDestination(t, f, k, hand);
    const near = this.offset.length();
    const far = this.introOffset.length();
    this.offset
      .divideScalar(near)
      .lerp(this.introOffset.divideScalar(far), k)
      .normalize()
      .multiplyScalar(near * (far / near) ** k);
    camera.position.copy(this.ship).add(this.offset);
    this.aim.lerp(this.introAim, k).add(this.ship);
    camera.up.set(0, 1, 0).lerp(this.introUp, k);
    camera.lookAt(this.aim);
    camera.rotateZ(this.bank * CHASE.roll);
    camera.quaternion.slerp(this.introQuat, k ** 4);

    // The field's border and drifting fragments fade in over the last
    // second; the place's own set already flies ahead.
    this.t.veil.setLevel(hand);
    this.t.backdrop.setArrival(smooth(0.3, 1, k));
    this.look.mix = this.jumps
      ? Number(t >= JUMP.at)
      : smooth(LOOK_FADE[0], LOOK_FADE[1], t);
    this.look.from = this.places.from;
    this.look.to = this.places.to;
    if (hand > 0) {
      this.look.from = this.bare;
      this.look.mix = hand;
    }

    // The jump: the streaks pull into a tunnel and stretch, the frame
    // whites out, and the ship drops out in front of the new place.
    const build = this.jumps ? smooth(JUMP.from, JUMP.at, t) : 0;
    const tunnel = t < JUMP.at ? build : 0;
    const stretch = this.jumps
      ? t < JUMP.at
        ? build
        : 1 - smooth(JUMP.at, JUMP.settle, t)
      : 0;
    const [up, peak, held, clear] = JUMP.white;
    const white = this.jumps
      ? smooth(up, peak, t) * (1 - smooth(held, clear, t))
      : 0;
    this.veilUniforms.uWhite.value = white;
    this.veilUniforms.uTunnel.value = tunnel;
    this.veilUniforms.uAspect.value = camera.aspect;
    this.veil.visible = white > 0.001 || tunnel > 0.001;

    // The Ring hides while the ship is out of it: before the opening's
    // jump, and inside a jump's tunnel.
    let inRing = 1;
    if (this.opening) inRing = 0;
    else if (this.jumps && t < JUMP.at) {
      inRing = 1 - smooth(JUMP.from, JUMP.at - 0.04, t);
    }
    const shown = ring.material.opacity * (inRing + (1 - inRing) * k);
    ring.material.opacity = shown;
    ring.material.transparent = shown < 0.999;
    ring.object.visible = shown > 0.001;
    this.skyArc.visible = shown > 0.001 && k < 0.6;
    this.focus.x = this.ship.x + HALF_W;
    this.focus.y = this.ship.z + HALF_H;

    const u = this.uniforms;
    u.uOrigin.value.copy(this.ship);
    u.uForward.value.copy(this.forward);
    u.uRight.value.copy(this.right);
    u.uTravel.value =
      f * FLIGHT.arc * last * STREAKS.gain +
      (this.jumps ? jumpDistance(t) * JUMP.speed * STREAKS.ahead * 4 : 0);
    u.uShape.value.x = STREAKS.length * (1 + (JUMP.stretch - 1) * stretch);
    u.uTube.value.x = tunnel;
    u.uPixel.value =
      (STREAKS.minPixels * 2 * Math.tan((camera.fov * Math.PI) / 360)) /
      Math.max(1, pixelHeight);
    u.uAlpha.value = STREAKS.alpha * (1 - k) * (1 + 1.5 * stretch);
    u.uColor.value.copy(this.t.biomes.look.dustColor);
  }

  // The destination's set ahead: posed so a view like the chase camera's,
  // `ahead` further on, sees it as the intro's first pose will; that view
  // eases into the intro's own pose as the camera rises, where the set is
  // back in its place. `this.offset` and `this.aim` hold the chase pose.
  poseDestination(t, f, k, hand) {
    const places = this.t.backdrop.places;
    const share = this.destinationShare(t);
    if (!this.setId || share <= 0) {
      places.setFlight(null);
      return;
    }
    const at = this.introAim;
    const group = places.setFlight(
      this.setId,
      Math.max(share, hand),
      at.x + this.end.x,
      at.z + this.end.z
    );
    if (!group) return;
    this.eye.copy(this.ship).add(this.offset);
    this.viewPos.copy(this.ship).add(this.aim);
    this.look4.lookAt(this.eye, this.viewPos, this.up);
    this.viewQuat.setFromRotationMatrix(this.look4);
    this.lifted.setFromAxisAngle(this.side, DESTINATION.lift);
    this.viewQuat.multiply(this.lifted);
    this.viewPos
      .set(0, 0, -1)
      .applyQuaternion(this.viewQuat)
      .multiplyScalar(this.destinationAhead(t, f))
      .add(this.eye)
      .lerp(this.introPos, k);
    this.viewQuat.slerp(this.introQuat, k);
    this.view4.compose(this.viewPos, this.viewQuat, this.unit);
    this.intro4.compose(this.introPos, this.introQuat, this.unit).invert();
    this.view4
      .multiply(this.intro4)
      .decompose(group.position, group.quaternion, group.scale);
  }

  /** The ship mirror on its flight pose, engines lit; after its update. */
  poseShip(mirror, level, time) {
    mirror.group.position.copy(this.ship);
    mirror.group.rotation.set(this.bank, -this.heading, this.pitch);
    mirror.lightEngines(this.main, level, time);
  }
}
