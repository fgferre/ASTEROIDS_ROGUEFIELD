// The journey between sectors (ui/runCinematics.js), drawn in the game's own
// scene: the real ship flies through the world of the places (travel/
// world.js: the broken Ring laid at its flight size, every place fixed
// along it) from the place it just won — its set in view, posed where that
// place stands — to the place it goes to, whose set waits where the intro
// will see it. The ship turns off its place, burns, skims the Ring and
// brakes in on a hop inside a chapter; into a new chapter (and the opening,
// from deep space) it lines up, surges and jumps — a tunnel of stretched
// streaks, a white-out — and drops out short of the place (travel/
// motion.js). The camera cuts between a few shots (travel/shots.js); the
// last, over the ship's back, runs on into the rise to the intro's first
// pose while the Ring and the sets settle back where the field sees them,
// and over the last second the field (its border, the drifting fragments)
// fades in, so the intro goes on without a cut. The colours cross-fade
// from the place left (deep space before the first) to the place reached.
// Everything is a function of t (0..1): `?cinematic=travel&t=` freezes a
// frame (core/cinematics.js). Nothing is allocated per frame.

import { BIOMES, biomeForLayer } from '../../data/biomes.js';
import { SECTORS, nextInChapter, sectorById } from '../../data/sectors.js';
import { TRAVEL, easeInOut } from '../../core/cinematics.js';
import {
  TRANSMISSION_CHARS_PER_SECOND,
  holdMsFor,
  travelTransmissions,
} from '../ui/transmissions.js';
import { createSeededRandom } from './asteroidMesh.js';
import { HALF_H, HALF_W } from './batches.js';
import { RING, RING_LOOK } from './ring/ringShape.js';
import { ShipMotion } from './travel/motion.js';
import { MARKS, markPoint } from './travel/marks.js';
import { MomentClock, travelMoments } from './travel/moments.js';
import { ShotPlan } from './travel/shots.js';
import { PLACE_ANGLES, WORLD, WorldMap, placeFrame } from './travel/world.js';

// proposta 12/11: from `rise` the camera climbs into the intro's pose (13/11:
// over the last `riseSeconds` of a longer journey, so its shots get the
// time). The Ring's running lights glow `lights` × and its haze runs `haze`
// × deeper while it flies.
const FLIGHT = { rise: 0.72, riseSeconds: 2.6, lights: 4, haze: 3 };
// proposta 13/11: on a hop the place left fades out over `leave` and the
// place ahead in over `reach` (t), the colours crossing over `look`; on a
// jump all three swap under the white-out.
const PLACES = { leave: [0.26, 0.42], reach: [0.3, 0.46], look: [0.3, 0.5] };
// proposta 12/11: a journey into a new chapter (and the opening) jumps:
// from `from` the streaks pull into a tunnel of radius `tube` and stretch
// `stretch` ×, `speed` × faster at `at`; the frame whites out over
// `white` ([up, peak, held, clear]); the ship drops out at its destination
// and the streaks slow back to the cruise by `settle`.
const JUMP = {
  from: 0.18,
  at: 0.36,
  settle: 0.54,
  tube: 150,
  stretch: 16,
  speed: 14,
  white: [0.3, 0.355, 0.375, 0.45],
  tint: '#a9dcff',
};
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
// proposta 12/11: the journey into `to` (docs/ROTEIRO.md: the awakened
// Ring "pulling the Field back together") draws the dust toward the place
// ahead: once its set shows, the streaks stream on ahead of the ship at
// `speed` world units a second and gather toward its line of flight,
// `gather` × closer by the far end of their box.
const PULL = { to: 'the-crucible', speed: 1400, gather: 0.75 };
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
uniform float uPull;
varying float vFade;
varying float vSide;
// A point along the box (0: its far end ahead), gathered toward the line
// of flight the further ahead it is while the Field is pulled in.
vec3 streakAt(float along, vec2 lateral, float span) {
  float gather = 1.0 - uPull * (1.0 - clamp(along, 0.0, 1.0));
  return uOrigin + uForward * (uBox.z - along * span)
    + (uRight * lateral.x + uUp * lateral.y) * gather;
}
void main() {
  float span = uBox.z + uBox.w;
  float along = fract(aSeed.z + uTravel / span);
  vec2 lateral = (aSeed.xy * 2.0 - 1.0) * uBox.xy;
  float r = length(lateral);
  if (r < uShape.z) lateral *= uShape.z / max(r, 0.001);
  vec2 wall = lateral / max(length(lateral), 0.001)
    * uTube.y * (0.8 + 0.4 * fract(aSeed.x * 13.7));
  lateral = mix(lateral, wall, uTube.x);
  float len = uShape.x * (0.6 + 0.8 * fract(aSeed.x * 7.13 + aSeed.y * 3.7));
  vec3 head = streakAt(along, lateral, span);
  vec3 tail = streakAt(along + len / span, lateral, span);
  vec3 p = mix(head, tail, aCorner.x);
  float dist = distance(cameraPosition, p);
  vec3 side = normalize(cross(normalize(head - tail), normalize(cameraPosition - p)));
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
function travelPlaces(to) {
  const sector = sectorById(to) ?? SECTORS[0];
  const index = SECTORS.indexOf(sector);
  const before = SECTORS[index - 1];
  return {
    from: before ? biomeForLayer(before.layers[1], before) : DEEP_SPACE,
    to: biomeForLayer(sector.layers[0], sector),
  };
}

/**
 * The spans of a journey's t between its `lines` (typed, then held — a
 * recorded line through its voice: the text stands still), over
 * `durationMs`.
 */
export function linePauses(lines, durationMs) {
  const pauses = [];
  let at = 0;
  lines.forEach((line) => {
    const typing = (line.text.length / TRANSMISSION_CHARS_PER_SECOND) * 1000;
    const typed = at + typing;
    at = typed + holdMsFor({ holdMs: TRAVEL.lineHoldMs, ...line }, typing);
    pauses.push([typed / durationMs, at / durationMs]);
  });
  return pauses;
}

/**
 * The journey's shape to sector `to`: where it leaves from and goes to
 * (world.js place ids, null for deep space) and whether it jumps (into a
 * new chapter, and the opening).
 */
export function travelLeg(to) {
  const sector = sectorById(to) ?? SECTORS[0];
  const before = SECTORS[SECTORS.indexOf(sector) - 1];
  return {
    from: before?.look?.backdrop ?? null,
    to: sector.look?.backdrop ?? null,
    jumps: !before || !nextInChapter(before),
  };
}

/**
 * The jump's extra distance by t (in units of its top speed × t): its
 * speed climbs from JUMP.from to JUMP.at, then falls away by JUMP.settle.
 */
function jumpDistance(t) {
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

// proposta 13/11: how far round each place (radians of the Ring) a
// journey's camera comes close to it: a jump's drop-out and the arrival.
const SKIRT = 0.4;

// The chunks of the Ring a hop skims and those round the places, built at
// their close levels with the scene (the loading screen): no build
// mid-flight.
function prepareTravelRing(ring) {
  const spans = [];
  SECTORS.forEach((sector, i) => {
    const a = PLACE_ANGLES[sector.look?.backdrop];
    if (a === undefined) return;
    spans.push([a - SKIRT, a + SKIRT]);
    const next = SECTORS[i + 1];
    const b = PLACE_ANGLES[next?.look?.backdrop];
    if (nextInChapter(sector) && b !== undefined) {
      spans.push([Math.min(a, b), Math.max(a, b)]);
    }
  });
  ring.chunks.forEach((chunk) => {
    const lo = chunk.phi - chunk.half;
    const hi = chunk.phi + chunk.half;
    if (!spans.some(([a, b]) => hi >= a && lo <= b)) return;
    ring.build(chunk, 1);
    ring.build(chunk, 2);
  });
}

export class TravelScene {
  /**
   * `emit(event, payload)`: a played journey's planned sound moments
   * ('travel-planned'), then each as it comes ('travel-moment', moments.js).
   */
  constructor(t, emit = () => {}) {
    const { THREE } = t;
    this.t = t;
    this.active = false;
    this.emit = emit;
    this.clock = new MomentClock((id) => emit('travel-moment', { id }));
    this.moments = [];
    this.places = travelPlaces(null);
    this.leg = travelLeg(null);
    this.jumps = false;
    this.pulls = false;
    this.opening = false;
    this.look = { from: this.places.from, to: this.places.to, mix: 0 };
    this.bare = null;
    this.startedAt = 0;
    this.durationMs = 1;
    this.frozenAt = null;
    // Where it ends: the ship's spawn and heading (field angle).
    this.end = new THREE.Vector3();
    this.turn = 0;
    this.k = 0;
    this.map = new WorldMap(THREE);
    this.motion = new ShipMotion(THREE);
    this.shots = new ShotPlan(THREE);
    this.fromFrame = {
      position: new THREE.Vector3(),
      heading: new THREE.Vector3(),
      angle: 0,
    };
    this.toFrame = {
      position: new THREE.Vector3(),
      heading: new THREE.Vector3(),
      angle: 0,
    };
    this.ship = this.motion.position;
    this.forward = this.motion.forward;
    this.right = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.focus = { x: HALF_W, y: HALF_H };
    this.introPos = new THREE.Vector3();
    this.introQuat = new THREE.Quaternion();
    this.introAim = new THREE.Vector3();
    this.introUp = new THREE.Vector3();
    this.offset = new THREE.Vector3();
    this.introOffset = new THREE.Vector3();
    this.aim = new THREE.Vector3();
    this.eye = new THREE.Vector3();
    this.ringAt = new THREE.Vector3();
    // The place left's set, posed where that place stands (start()).
    this.leftPos = new THREE.Vector3();
    this.leftQuat = new THREE.Quaternion();
    this.leftScale = new THREE.Vector3();
    // The places' marks in the scene (travel/marks.js), found on the first
    // frame, once the intro's aim lays the sets out.
    this.marks = {
      leave: { near: new THREE.Vector3(), sign: new THREE.Vector3() },
      reach: { near: new THREE.Vector3(), sign: new THREE.Vector3() },
    };
    this.gate = new THREE.Vector3();
    this.view = new THREE.Vector3();
    this.lines = [];
    this.planned = false;
    this.rise = FLIGHT.rise;
    this.baseFov = null;
    this.identity = new THREE.Matrix4();
    this.pose4 = new THREE.Matrix4();
    this.home4 = new THREE.Matrix4();
    this.yawQuat = new THREE.Quaternion();
    this.unit = new THREE.Vector3(1, 1, 1);
    const ring = t.backdrop.ring;
    this.idle = ring.uniforms.uIdle.value.clone();
    this.streaks = this.buildStreaks(THREE);
    t.scene.add(this.streaks);
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
      uPull: { value: 0 },
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
    this.clock.stop();
    this.places = travelPlaces(to);
    this.leg = travelLeg(to);
    this.opening = !this.leg.from;
    this.jumps = this.leg.jumps;
    this.pulls = (sectorById(to) ?? SECTORS[0]).id === PULL.to;
    // Over the last second the field's drifting fragments come in.
    this.bare = {
      ...this.places.to,
      place: `${this.places.to.place ?? this.places.to.id}~bare`,
      debris: 0,
    };
    this.look.from = this.places.from;
    this.look.to = this.places.to;
    this.look.mix = 0;
    this.startedAt = performance.now();
    this.durationMs = durationMs;
    this.frozenAt = frozenAt;
    const at = player?.position ?? { x: HALF_W, y: HALF_H };
    this.end.set(at.x - HALF_W, 0, at.y - HALF_H);
    // The world's heading down the arc lands up the field (−π/2), turned
    // to the spawn's heading.
    this.turn = (player?.angle ?? -Math.PI / 2) + Math.PI / 2;
    placeFrame(this.leg.to, this.toFrame);
    placeFrame(this.leg.from, this.fromFrame);
    this.map.set(this.toFrame, this.end, this.turn);
    this.lines = travelTransmissions(to, TRAVEL.lineHoldMs);
    this.rise = Math.max(
      FLIGHT.rise,
      1 - (FLIGHT.riseSeconds * 1000) / durationMs
    );
    this.planned = false;
    // The place left's set: where it stands in the world, as the place
    // reached's stands on the spawn (its set's own pose).
    this.map.point(this.fromFrame.position, this.leftPos);
    this.yawQuat.setFromAxisAngle(
      this.up,
      -(this.map.yaw + this.fromFrame.angle)
    );
    this.pose4.compose(this.leftPos, this.yawQuat, this.unit);
    this.yawQuat.setFromAxisAngle(this.up, -this.turn);
    this.home4.compose(this.end, this.yawQuat, this.unit).invert();
    this.pose4
      .multiply(this.home4)
      .decompose(this.leftPos, this.leftQuat, this.leftScale);
    this.baseFov = null;
    this.active = true;
    this.streaks.visible = true;
  }

  // The flight and its shots, once the intro's aim (`x`, `z`) lays the
  // sets out where the camera will find their marks.
  plan(x, z) {
    const sets = this.t.backdrop.places.built;
    const mark = (id, pose, out) => {
      const set = sets.get(id);
      const spec = MARKS[id];
      if (!set || !spec) return null;
      markPoint(this.t.THREE, set, spec.near, x, z, pose, out.near);
      markPoint(this.t.THREE, set, spec.sign, x, z, pose, out.sign);
      out.view = spec.view
        ? markPoint(this.t.THREE, set, spec.view, x, z, pose, this.view)
        : null;
      return out;
    };
    const leave = this.leg.from
      ? mark(this.leg.from, this.pose4, this.marks.leave)
      : null;
    const reach = mark(this.leg.to, this.identity, this.marks.reach);
    const through = this.jumps && MARKS[this.leg.from]?.through;
    const gate = through
      ? markPoint(
          this.t.THREE,
          sets.get(this.leg.from),
          through,
          x,
          z,
          this.pose4,
          this.gate
        )
      : null;
    this.motion.plan(
      this.map,
      this.fromFrame,
      this.toFrame,
      this.durationMs,
      this.jumps ? JUMP.at : null,
      this.opening,
      gate
    );
    this.shots.plan(
      this.motion,
      this.durationMs,
      linePauses(this.lines, this.durationMs),
      { leave, reach },
      this.rise
    );
    this.moments = travelMoments(
      this.motion,
      this.shots,
      this.durationMs,
      this.rise,
      JUMP.white[2]
    );
    // A frozen capture plays no sound. The score (audio/journeyCue.js) is
    // told the whole plan now, in seconds from now, so its swells arrive on
    // their moments; `duration` runs to the journey's end.
    if (this.frozenAt === null) {
      this.clock.start(this.moments);
      const t0 = this.progress;
      const seconds = (t) => ((t - t0) * this.durationMs) / 1000;
      this.emit('travel-planned', {
        moments: this.moments.map(({ id, t }) => ({ id, at: seconds(t) })),
        duration: seconds(1),
      });
    }
    this.planned = true;
  }

  stop() {
    this.clock.stop();
    if (!this.active) return;
    this.active = false;
    if (this.baseFov !== null) {
      this.t.camera.fov = this.baseFov;
      this.t.camera.updateProjectionMatrix();
    }
    this.streaks.visible = false;
    this.veil.visible = false;
    this.t.veil.setLevel(1);
    this.t.backdrop.places.setFlight(null);
    this.t.backdrop.places.setFlight(null, 0, 0, 0, 1);
    this.t.backdrop.setArrival(1);
    const ring = this.t.backdrop.ring;
    ring.offset.set(0, 0, 0);
    ring.follow = RING.follow;
    ring.object.rotation.set(-RING.tilt, 0, 0);
    ring.object.scale.setScalar(1);
    ring.uniforms.uIdle.value.copy(this.idle);
    ring.uniforms.uHazeDepth.value = RING_LOOK.hazeDepth;
  }

  get progress() {
    if (this.frozenAt !== null) return Math.min(1, Math.max(0, this.frozenAt));
    return Math.min(1, (performance.now() - this.startedAt) / this.durationMs);
  }

  // Distance the ship has flown by t (both legs of a jump), world units.
  travelled(t) {
    const { motion } = this;
    if (!motion.leapt(t)) return motion.beforeTime.distance(t);
    return motion.before.length + motion.afterTime.distance(t);
  }

  /**
   * This frame of the flight, after the rig has posed `camera` on the
   * intro's first pose: the ship's pose, the camera, the Ring, the places,
   * the look and the streaks. `pixelHeight`: the frame's height in pixels.
   */
  frame(camera, pixelHeight) {
    const t = this.progress;
    const k = easeInOut((t - this.rise) / (1 - this.rise));
    this.k = k;
    const hand = smooth(1 - TRAVEL.handOffMs / this.durationMs, 1, t);
    const { motion, ship, forward } = this;

    // The Ring laid for the flight at its flight size, then back to its
    // place.
    const ring = this.t.backdrop.ring;
    this.ringAt.set(0, 0, 0);
    this.map.point(this.ringAt, this.ringAt);
    ring.offset
      .set(
        this.ringAt.x - RING.centre[0],
        this.ringAt.y - RING.centre[1],
        this.ringAt.z - RING.centre[2]
      )
      .multiplyScalar(1 - k);
    ring.follow = RING.follow * k;
    ring.object.rotation.set(-RING.tilt * k, -this.map.yaw * (1 - k), 0);
    ring.object.scale.setScalar(WORLD.scale + (1 - WORLD.scale) * k);
    ring.uniforms.uIdle.value
      .copy(this.idle)
      .multiplyScalar(FLIGHT.lights + (1 - FLIGHT.lights) * k);
    ring.uniforms.uHazeDepth.value =
      RING_LOOK.hazeDepth * (FLIGHT.haze + (1 - FLIGHT.haze) * k);

    // The shot, then eased into the intro's pose, which the rig holds under
    // it: both relative to the ship (it lands on the spawn the intro looks
    // at), the distance growing geometrically so the ship stays in the
    // shot while the camera climbs.
    this.introPos.copy(camera.position);
    this.introQuat.copy(camera.quaternion);
    this.introUp.set(0, 1, 0).applyQuaternion(this.introQuat);
    this.introAim.set(0, 0, -1).applyQuaternion(this.introQuat);
    this.introAim
      .multiplyScalar(-this.introPos.y / Math.min(-0.1, this.introAim.y))
      .add(this.introPos)
      .sub(this.end);
    this.introOffset.copy(this.introPos).sub(this.end);
    if (!this.planned) {
      this.plan(this.introAim.x + this.end.x, this.introAim.z + this.end.z);
    }
    this.clock.tick(t, this.durationMs);
    motion.sample(t);
    this.right.set(-forward.z, 0, forward.x).normalize();
    const roll = this.shots.pose(t, motion, this.eye, this.aim);
    this.offset.subVectors(this.eye, ship);
    this.aim.sub(ship);
    this.posePlaces(t, hand);
    if (k > 0) {
      const near = this.offset.length();
      const far = this.introOffset.length();
      this.offset
        .divideScalar(near)
        .lerp(this.introOffset.divideScalar(far), k)
        .normalize()
        .multiplyScalar(near * (far / near) ** k);
      this.aim.lerp(this.introAim, k);
    }
    camera.position.copy(ship).add(this.offset);
    this.aim.add(ship);
    camera.up.set(0, 1, 0).lerp(this.introUp, k);
    camera.lookAt(this.aim);
    camera.rotateZ(roll * (1 - k));
    camera.quaternion.slerp(this.introQuat, k ** 4);
    // The shot's lens, back to the intro's as it rises.
    if (this.baseFov === null) this.baseFov = camera.fov;
    const fov = this.shots.fov + (this.baseFov - this.shots.fov) * k;
    if (fov !== camera.fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    // The field's border and drifting fragments fade in over the last
    // second; the place's own set already stands ahead.
    this.t.veil.setLevel(hand);
    this.t.backdrop.setArrival(smooth(0.3, 1, k));
    this.look.mix = this.jumps
      ? Number(t >= JUMP.at)
      : smooth(PLACES.look[0], PLACES.look[1], t);
    this.look.from = this.places.from;
    this.look.to = this.places.to;
    if (hand > 0) {
      this.look.from = this.bare;
      this.look.mix = hand;
    }

    // The jump: the streaks pull into a tunnel and stretch, the frame
    // whites out, and the ship drops out short of the new place.
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

    // The Ring hides while the ship is out of it: in deep space before the
    // opening's jump, and inside a jump's tunnel.
    let inRing = 1;
    if (this.jumps && t < JUMP.at) {
      inRing = this.opening ? 0 : 1 - smooth(JUMP.from, JUMP.at - 0.04, t);
    }
    const shown = ring.material.opacity * (inRing + (1 - inRing) * k);
    ring.material.opacity = shown;
    ring.material.transparent = shown < 0.999;
    ring.object.visible = shown > 0.001;
    this.focus.x = ship.x + HALF_W;
    this.focus.y = ship.z + HALF_H;

    const u = this.uniforms;
    u.uOrigin.value.copy(ship);
    u.uForward.value.copy(forward);
    u.uRight.value.copy(this.right);
    // Pulled in, the dust outruns the ship toward the place ahead (its
    // share steps in under a jump's white-out).
    const pull = this.pulls ? this.reachShare(t) : 0;
    u.uTravel.value =
      this.travelled(t) * STREAKS.gain +
      (this.jumps ? jumpDistance(t) * JUMP.speed * STREAKS.ahead * 4 : 0) -
      (pull * PULL.speed * t * this.durationMs) / 1000;
    u.uPull.value = pull * PULL.gather;
    u.uShape.value.x = STREAKS.length * (1 + (JUMP.stretch - 1) * stretch);
    u.uTube.value.x = tunnel;
    u.uPixel.value =
      (STREAKS.minPixels * 2 * Math.tan((camera.fov * Math.PI) / 360)) /
      Math.max(1, pixelHeight);
    u.uAlpha.value = STREAKS.alpha * (1 - k) * (1 + 1.5 * stretch);
    u.uColor.value.copy(this.t.biomes.look.dustColor);
  }

  // Share of the place reached's set shown at t.
  reachShare(t) {
    if (this.jumps) return Number(t >= JUMP.at);
    return smooth(PLACES.reach[0], PLACES.reach[1], t);
  }

  // Share of the place left's set shown at t.
  leaveShare(t) {
    if (this.opening) return 0;
    if (this.jumps) return Number(t < JUMP.at);
    return 1 - smooth(PLACES.leave[0], PLACES.leave[1], t);
  }

  // The two places' sets, each standing where its place is in the world:
  // the place reached's in its own pose (the ship lands on its spawn), the
  // place left's where start() put it; both laid out for the intro's aim.
  posePlaces(t, hand) {
    const places = this.t.backdrop.places;
    const x = this.introAim.x + this.end.x;
    const z = this.introAim.z + this.end.z;
    const reach = Math.max(this.reachShare(t), hand);
    places.setFlight(reach > 0 ? this.leg.to : null, reach, x, z);
    const leave = this.leaveShare(t) * (1 - hand);
    const left = places.setFlight(
      leave > 0 ? this.leg.from : null,
      leave,
      x,
      z,
      1
    );
    if (!left) return;
    left.position.copy(this.leftPos);
    left.quaternion.copy(this.leftQuat);
  }

  /** The ship mirror on its flight pose, engines lit; after its update. */
  poseShip(mirror, level, time) {
    mirror.group.position.copy(this.ship);
    this.motion.pose(mirror.group.quaternion);
    mirror.lightEngines(this.motion.thrust, level, time);
  }
}
