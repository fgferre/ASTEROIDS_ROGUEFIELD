// The story before the first campaign's journey (ui/runCinematics.js):
// the Wake, an old freighter, waits at the Field's edge over a sea of dust
// under a low orange star (story/storySky.js); its reactors stutter, a
// signal pulses in the Field, the broken Ring stands on the horizon, and an
// interceptor drops from the hangar and leaves for the Field. Six shots, each
// a camera move about the ship. It is drawn in a scene of its own (the
// field's scene is not drawn meanwhile), lit by the Wake's own rig; the Ring
// and the player's ship are borrowed into it while it plays. Everything is a
// function of t (0..1): `?cinematic=story&t=` freezes a frame.

import { STORY_MS, STORY_SHOT_MS, easeInOut } from '../../core/cinematics.js';
import { STORY_SKY, buildStorySky } from './story/storySky.js';
import { buildWake, setWakeLight } from './travel/wake.js';
import { buildFieldRocks } from './story/storyRocks.js';
import { lightWake } from './travel/wakeRig.js';

// proposta 18/11: the shots, in order: `ms` long, the camera from `from` to
// `to` ([eye, aim], world units about the Wake: +x its bow, y up, −z port),
// eased; `fov` degrees. `on` names what the eye and the aim are about (the
// hangar's mouth, the departing ship); none: the Wake's centre.
export const STORY_SHOTS = [
  {
    id: 'wake',
    fov: 36,
    from: [
      [2700, 720, -4500],
      [-250, 200, 0],
    ],
    to: [
      [2350, 650, -4000],
      [-250, 200, 0],
    ],
  },
  {
    id: 'reactors',
    fov: 34,
    from: [
      [-4300, 380, -1150],
      [-1500, 150, 0],
    ],
    to: [
      [-4050, 340, -980],
      [-1500, 130, 0],
    ],
  },
  {
    id: 'signal',
    fov: 40,
    from: [
      [-440, 720, -40],
      [6000, -420, -300],
    ],
    to: [
      [-400, 700, -40],
      [6000, -360, -300],
    ],
  },
  {
    id: 'ring',
    fov: 44,
    from: [
      [420, 600, 520],
      [30000, 1300, 9500],
    ],
    to: [
      [560, 620, 560],
      [30000, 1500, 7500],
    ],
  },
  {
    id: 'hangar',
    fov: 34,
    on: ['hangar', 'hangar'],
    from: [
      [215, -52, 175],
      [-50, -8, 0],
    ],
    to: [
      [190, -48, 150],
      [-20, -12, 0],
    ],
  },
  {
    id: 'launch',
    fov: 44,
    on: ['hangar', 'ship'],
    from: [
      [900, -380, 240],
      [0, 0, 0],
    ],
    to: [
      [900, -380, 240],
      [300, -40, 0],
    ],
  },
];

STORY_SHOTS.forEach((shot, i) => {
  shot.ms = STORY_SHOT_MS[i];
});

// proposta 18/11: the Wake's rig at sunset: the star behind (its rim, warm
// and strong), a pale key off the bow, the dust sea's violet from below.
const RIG = {
  sun: ['#f2ebe6', 1.5],
  rim: ['#ffa468', 1.9],
  fill: ['#7462a8', 0.55],
};
// proposta 18/11: the Ring standing on the horizon ahead to starboard: its
// scale, where its centre stands, its tilt (radians about x, z).
const RING_POSE = { scale: 20, at: [62000, -30000, 22000], tilt: [0, 1.3] };
// The lens's far plane while it plays (the field's is 20000).
const FAR = 160000;
// The signal: a point in the Field ahead that pulses every `period` s.
const SIGNAL = {
  at: [15000, 150, -1500],
  color: '#4fd2ff',
  size: 900,
  period: 1.4,
};
// The interceptor: where it drops to under the hangar, how far it flies.
const LAUNCH = {
  inside: [-160, 0, 0],
  out: [2600, 80],
  dive: -420,
  idle: 0.15,
  thrust: 0.6,
};

export class StoryScene {
  constructor(t) {
    const { THREE } = t;
    this.t = t;
    this.THREE = THREE;
    this.active = false;
    this.built = false;
    this.startedAt = 0;
    this.frozenAt = null;
    this.baseFov = null;
    this.eye = new THREE.Vector3();
    this.aim = new THREE.Vector3();
    this.at = new THREE.Vector3();
    this.ship = new THREE.Vector3();
    this.origin = new THREE.Vector3();
    this.shipShown = false;
    this.thrust = 0;
  }

  /** Builds the Wake and its stage (about a second): before it plays. */
  build() {
    if (this.built) return;
    const { THREE, t } = this;
    const scene = new THREE.Scene();
    scene.environment = t.scene.environment;
    this.scene = scene;
    this.sky = buildStorySky(THREE);
    this.sky.mesh.visible = true;
    scene.add(this.sky.mesh);
    this.wake = buildWake(THREE);
    scene.add(this.wake.group);
    this.wake.group.updateMatrixWorld(true);
    this.rig = lightWake(THREE, this.wake, -1);
    Object.entries(RIG).forEach(([name, [color, intensity]]) => {
      this.rig[name].color.set(color).convertSRGBToLinear();
      this.rig[name].intensity = intensity;
    });
    this.rig.rim.position
      .set(...STORY_SKY.sun)
      .normalize()
      .multiplyScalar(150);
    this.hangar = this.wake.anchors.hangar.getWorldPosition(
      new THREE.Vector3()
    );
    // The hangar's own light: its mouth lies in the bow's shadow.
    this.bay = new THREE.PointLight(0xbfd8ff, 0, 900, 2);
    this.bay.position.copy(this.hangar).add(new THREE.Vector3(120, -60, 0));
    scene.add(this.bay);
    this.signal = new THREE.Sprite(
      new THREE.SpriteMaterial({
        color: new THREE.Color(SIGNAL.color),
        map: this.dot(),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    this.signal.position.set(...SIGNAL.at);
    scene.add(this.signal);
    scene.add(buildFieldRocks(THREE));
    this.built = true;
  }

  // A soft round spot for the signal (no ring, no cross).
  dot() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const g = canvas.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new this.THREE.CanvasTexture(canvas);
  }

  /** Plays it from now; `frozenAt` (dev) holds one t. */
  start(frozenAt = null) {
    this.build();
    this.startedAt = performance.now();
    this.frozenAt = frozenAt;
    this.baseFov = null;
    this.borrow();
    this.active = true;
  }

  // The Ring and the player's ship stand in the story's scene meanwhile.
  borrow() {
    const { t } = this;
    const ring = t.backdrop.ring;
    this.ringWas = { follow: ring.follow, parent: ring.object.parent };
    ring.follow = 0;
    ring.offset.set(...RING_POSE.at);
    ring.object.scale.setScalar(RING_POSE.scale);
    ring.object.rotation.set(RING_POSE.tilt[0], 0, RING_POSE.tilt[1]);
    this.scene.add(ring.object);
    this.shipWas = t.player.group.parent;
    this.scene.add(t.player.group);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    const { t } = this;
    const ring = t.backdrop.ring;
    ring.follow = this.ringWas.follow;
    ring.offset.set(0, 0, 0);
    ring.object.scale.setScalar(1);
    this.ringWas.parent.add(ring.object);
    this.shipWas.add(t.player.group);
    if (this.baseFov !== null) {
      t.camera.fov = this.baseFov;
      t.camera.far = this.baseFar;
      t.camera.updateProjectionMatrix();
    }
  }

  get progress() {
    if (this.frozenAt !== null) return Math.min(1, Math.max(0, this.frozenAt));
    return Math.min(1, (performance.now() - this.startedAt) / STORY_MS);
  }

  // The shot at t and how far through it (0..1).
  shotAt(t) {
    let ms = t * STORY_MS;
    for (const shot of STORY_SHOTS) {
      if (ms < shot.ms) return [shot, ms / shot.ms];
      ms -= shot.ms;
    }
    const last = STORY_SHOTS[STORY_SHOTS.length - 1];
    return [last, 1];
  }

  /** This frame: the camera, the lights, the ship. */
  frame(camera, time) {
    const t = this.progress;
    const [shot, k] = this.shotAt(t);
    this.placeShip(shot, k);
    const about = (name) => this[name] ?? this.origin;
    const e = easeInOut(k);
    this.eye
      .set(...shot.from[0])
      .lerp(this.at.set(...shot.to[0]), e)
      .add(about(shot.on?.[0]));
    this.aim
      .set(...shot.from[1])
      .lerp(this.at.set(...shot.to[1]), e)
      .add(about(shot.on?.[1]));
    camera.position.copy(this.eye);
    camera.up.set(0, 1, 0);
    camera.lookAt(this.aim);
    if (this.baseFov === null) {
      this.baseFov = camera.fov;
      this.baseFar = camera.far;
      // The Ring stands far out: the lens sees past the field's far plane.
      camera.far = FAR;
      camera.updateProjectionMatrix();
    }
    if (camera.fov !== shot.fov) {
      camera.fov = shot.fov;
      camera.updateProjectionMatrix();
    }
    this.sky.place(camera, this.origin);
    // The field's backdrop may have hidden the Ring: here it always stands.
    const ring = this.t.backdrop.ring;
    ring.object.visible = true;
    ring.material.opacity = 1;
    ring.material.transparent = false;
    const pulse = 0.5 + 0.5 * Math.cos((time * 2 * Math.PI) / SIGNAL.period);
    this.signal.scale.setScalar(SIGNAL.size * (0.6 + 0.6 * pulse));
    this.signal.material.opacity = 0.35 + 0.65 * pulse;
    this.bay.intensity = shot.id === 'hangar' ? 1.4 : 0;
    // The reactors falter from the second shot on: the port engine dies.
    const failing = shot.id !== 'wake';
    const flicker = 0.55 + 0.45 * Math.sin(time * 23) * Math.sin(time * 7.3);
    setWakeLight(this.wake.lights.engines[0], failing ? 0.05 : 1);
    setWakeLight(this.wake.lights.engines[1], failing ? flicker : 1);
  }

  // The interceptor: hidden till the hangar, dropped out under it, then off
  // toward the Field.
  placeShip(shot, k) {
    this.shipShown = STORY_SHOTS.indexOf(shot) >= 4;
    this.ship.copy(this.hangar);
    if (shot.id === 'hangar') {
      this.ship.add(
        this.at.set(...LAUNCH.inside).multiplyScalar(1 - easeInOut(k))
      );
      this.thrust = LAUNCH.idle;
    } else {
      // Down clear of the keel first, then away under the bow.
      const [ahead, side] = LAUNCH.out;
      this.ship.add(
        this.at.set(ahead * k * k, LAUNCH.dive * (1 - (1 - k) ** 3), side * k)
      );
      this.thrust = LAUNCH.thrust * Math.min(1, k * 4);
    }
  }

  /** The ship mirror on its story pose; after its update. */
  poseShip(mirror, level, time) {
    mirror.group.visible = this.shipShown;
    if (!this.shipShown) return;
    mirror.group.position.copy(this.ship);
    mirror.group.quaternion.identity();
    mirror.lightEngines(this.thrust, level, time);
  }
}
