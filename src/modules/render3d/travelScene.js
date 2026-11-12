// The journey between sectors (ui/runCinematics.js), drawn in the game's own
// scene: the real ship, seen from behind and a little above, flies along
// the broken Ring — laid beside its flight for the trip (brokenRing.js
// `offset`) — through streaks of dust while the place's colours cross-fade
// from the one just left (deep space before the first) to the one ahead.
// The flight decelerates onto the ship's spawn, heading where it will start;
// over its last stretch the camera rises into the intro's first pose and
// the Ring settles back where the field sees it, so the intro goes on
// without a cut. Everything is a function of t (0..1): `?cinematic=travel&t=`
// freezes a frame (core/cinematics.js). Nothing is allocated per frame.

import { BIOMES, biomeForLayer } from '../../data/biomes.js';
import { SECTORS, sectorById } from '../../data/sectors.js';
import { easeInOut } from '../../core/cinematics.js';
import { createSeededRandom } from './asteroidMesh.js';
import { HALF_H, HALF_W } from './batches.js';
import { RING } from './ring/ringShape.js';

// proposta 12/11: the flight. The ship flies `arc` radians of the Ring's
// circle, inside it (the arc sweeps ahead) and over its deck, moving from
// the place it left to the one it flies to (PLACES), ending where the arc
// heads up the field; it cruises, then from `brake` slows onto its spawn,
// its engines at `thrust`. From `rise` the camera climbs into the intro's
// pose.
export const FLIGHT = {
  arc: (62 * Math.PI) / 180,
  thrust: 0.5,
  brake: 0.62,
  rise: 0.72,
};
// proposta 12/11: how close each place sits to the Ring as its journey
// ends (docs/ROTEIRO.md "Os lugares"): [side, height], the ship's distance
// inside its centre line and over its deck. `outside`: where the opening
// starts, far off.
export const PLACES = {
  outside: [1500, 700],
  'debris-wake': [900, 420],
  'salvage-lanes': [520, 240],
  'prime-gate': [70, 26],
  'furnace-drift': [320, 120],
  'crystal-choir': [150, 50],
  'dense-core': [110, 36],
  'assembly-graveyard': [380, 160],
  'quarantine-grid': [520, 260],
  'wardens-reach': [200, 80],
};
// proposta 12/11: a journey into a new chapter (and the opening) jumps:
// the streaks stretch into a tunnel from `from` to `at` while the frame
// flashes (exposure × `flash` at its peak), and the ship drops out at its
// destination, in its colours, the streaks settling by `settle`.
export const JUMP = {
  to: ['debris-wake', 'furnace-drift', 'assembly-graveyard'],
  from: 0.26,
  at: 0.4,
  settle: 0.5,
  stretch: 9,
  speed: 10,
  flash: 4,
};
// proposta 12/11: the chase camera, in the ship's frame (world units):
// `back` behind, `up` above, `right` to the side (the Ring is on the
// right), aiming `ahead` past the ship and `lift` over it; it rolls `roll`
// × the ship's bank.
const CHASE = {
  back: 120,
  up: 34,
  right: -12,
  ahead: 260,
  lift: -60,
  roll: 0.35,
};
// proposta 12/11: the ship banks `base` into the Ring's curve and sways
// ±`sway` `swayTurns` times over the flight (radians).
const BANK = { base: 0.2, sway: 0.12, swayTurns: 1.5 };
// proposta 12/11: the colours cross-fade between these points of t.
const LOOK_FADE = [0.12, 0.7];
// proposta 12/11: the dust streaks: `count` in a box `half` wide and high
// round the flight line, from `ahead` in front to `behind` the ship, none
// within `clear` of it; each `length` long (× 0.6..1.4) and `width` thick,
// never under `minPixels` on screen. They pass `gain` × faster than the
// ship (the eye reads their speed, not the ship's) at `alpha`.
const STREAKS = {
  count: 220,
  half: [320, 180],
  ahead: 1400,
  behind: 200,
  clear: 70,
  length: 150,
  width: 0.35,
  minPixels: 1,
  gain: 3.2,
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
uniform float uPixel;
varying float vFade;
varying float vSide;
void main() {
  float span = uBox.z + uBox.w;
  float along = fract(aSeed.z + uTravel / span);
  vec2 lateral = (aSeed.xy * 2.0 - 1.0) * uBox.xy;
  float r = length(lateral);
  if (r < uShape.z) lateral *= uShape.z / max(r, 0.001);
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
    this.near = [PLACES.outside, PLACES.outside];
    this.look = { from: this.places.from, to: this.places.to, mix: 0 };
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
    this.streaks = this.buildStreaks(THREE);
    t.scene.add(this.streaks);
    prepareTravelRing(t.backdrop.ring);
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

  /**
   * Flies to sector `to` over `durationMs`, ending on `player`'s spawn;
   * `frozenAt` (dev) holds one t.
   */
  start(to, durationMs, player, frozenAt = null) {
    this.places = travelPlaces(to);
    const sector = sectorById(to) ?? SECTORS[0];
    const before = SECTORS[SECTORS.indexOf(sector) - 1];
    this.jumps = JUMP.to.includes(sector.id);
    this.near[0] = PLACES[before?.id] ?? PLACES.outside;
    this.near[1] = PLACES[sector.id] ?? PLACES.outside;
    this.look.from = this.places.from;
    this.look.to = this.places.to;
    this.look.mix = 0;
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
    this.t.veil.setLevel(1);
    this.t.backdrop.setArrival(1);
    this.t.renderer.toneMappingExposure = 1;
    const ring = this.t.backdrop.ring;
    ring.offset.set(0, 0, 0);
    ring.follow = RING.follow;
    ring.object.rotation.set(-RING.tilt, 0, 0);
  }

  // The ship's place in the flight frame (the spawn at the origin, heading
  // −z as it lands) after share `f` of the flight, into `out`.
  flightPoint(f, out, at = f) {
    const phi = FLIGHT.arc * (1 - f);
    // A jump moves the ship between places at once, under its flash.
    const close = this.jumps ? Number(at >= flown(JUMP.at)) : smooth(0, 1, at);
    const [side0, height0] = this.near[0];
    const [side1, height1] = this.near[1];
    const side = side0 + (side1 - side0) * close;
    const height = height0 + (height1 - height0) * close;
    const radius = RING.radius - side;
    const last = RING.radius - side1;
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

  /**
   * This frame of the flight, after the rig has posed `camera` on the
   * intro's first pose: the ship's pose, the camera, the Ring, the look and
   * the streaks. `pixelHeight`: the frame's height in pixels.
   */
  frame(camera, pixelHeight) {
    const t = this.progress;
    const f = flown(t);
    const k = easeInOut((t - FLIGHT.rise) / (1 - FLIGHT.rise));
    this.k = k;

    // The ship closing in on the laid Ring, heading along its flight.
    const { ship, forward, aim } = this;
    this.flightPoint(f, aim);
    this.place(aim.x, aim.y, aim.z, ship);
    this.flightPoint(Math.max(0, f - 0.002), forward, f);
    this.place(forward.x, forward.y, forward.z, forward);
    if (f > 0.002) forward.subVectors(ship, forward).normalize();
    else forward.set(0, 0, -1);
    this.pitch = Math.asin(forward.y);
    this.right.set(-forward.z, 0, forward.x).normalize();
    this.heading = Math.atan2(forward.z, forward.x);
    const sway = Math.sin(t * Math.PI * 2 * BANK.swayTurns);
    this.bank = (BANK.base + BANK.sway * sway) * (1 - k);
    this.main = FLIGHT.thrust * (1 - k);

    // The Ring's centre for the flight, then back to its place.
    const ring = this.t.backdrop.ring;
    const last = RING.radius - this.near[1][0];
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

    // The chase pose, then eased into the intro's, which the rig holds
    // under it: both relative to the ship (it lands on the spawn the intro
    // looks at), the distance growing geometrically so the ship stays in
    // the shot while the camera climbs.
    this.introPos.copy(camera.position);
    this.introQuat.copy(camera.quaternion);
    this.introUp.set(0, 1, 0).applyQuaternion(this.introQuat);
    this.introAim.set(0, 0, -1).applyQuaternion(this.introQuat);
    this.introAim
      .multiplyScalar(-this.introPos.y / Math.min(-0.05, this.introAim.y))
      .add(this.introPos)
      .sub(this.end);
    this.introOffset.copy(this.introPos).sub(this.end);
    this.offset
      .copy(this.forward)
      .multiplyScalar(-CHASE.back)
      .addScaledVector(this.right, CHASE.right);
    this.offset.y += CHASE.up;
    const near = this.offset.length();
    const far = this.introOffset.length();
    this.offset
      .divideScalar(near)
      .lerp(this.introOffset.divideScalar(far), k)
      .normalize()
      .multiplyScalar(near * (far / near) ** k);
    camera.position.copy(this.ship).add(this.offset);
    this.aim.copy(this.forward).multiplyScalar(CHASE.ahead);
    this.aim.y += CHASE.lift;
    this.aim.lerp(this.introAim, k).add(this.ship);
    camera.up.set(0, 1, 0).lerp(this.introUp, k);
    camera.lookAt(this.aim);
    camera.rotateZ(this.bank * CHASE.roll);
    camera.quaternion.slerp(this.introQuat, k ** 4);

    // The field's border and the place's set fade in as the camera reaches
    // the field.
    this.t.veil.setLevel(smooth(0.4, 1, k));
    this.t.backdrop.setArrival(smooth(0.4, 1, k));
    this.look.mix = this.jumps
      ? Number(t >= JUMP.at)
      : smooth(LOOK_FADE[0], LOOK_FADE[1], t);
    // The jump: a tunnel of stretched streaks, a flash, then the drop-out.
    const tunnel = this.jumps
      ? smooth(JUMP.from, JUMP.at, t) * (1 - smooth(JUMP.at, JUMP.settle, t))
      : 0;
    const flash = this.jumps
      ? smooth(JUMP.at - 0.04, JUMP.at, t) *
        (1 - smooth(JUMP.at, JUMP.at + 0.06, t))
      : 0;
    this.t.renderer.toneMappingExposure = 1 + (JUMP.flash - 1) * flash;
    this.focus.x = this.ship.x + HALF_W;
    this.focus.y = this.ship.z + HALF_H;

    const u = this.uniforms;
    u.uOrigin.value.copy(this.ship);
    u.uForward.value.copy(this.forward);
    u.uRight.value.copy(this.right);
    u.uTravel.value =
      f * FLIGHT.arc * last * STREAKS.gain +
      smooth(JUMP.from, JUMP.settle, this.jumps ? t : 0) *
        JUMP.speed *
        STREAKS.ahead;
    u.uShape.value.x = STREAKS.length * (1 + (JUMP.stretch - 1) * tunnel);
    u.uPixel.value =
      (STREAKS.minPixels * 2 * Math.tan((camera.fov * Math.PI) / 360)) /
      Math.max(1, pixelHeight);
    u.uAlpha.value = STREAKS.alpha * (1 - k) * (1 + 1.5 * tunnel);
    u.uColor.value.copy(this.t.biomes.look.dustColor);
  }

  /** The ship mirror on its flight pose, engines lit; after its update. */
  poseShip(mirror, level, time) {
    mirror.group.position.copy(this.ship);
    mirror.group.rotation.set(this.bank, -this.heading, this.pitch);
    mirror.lightEngines(this.main, level, time);
  }
}
