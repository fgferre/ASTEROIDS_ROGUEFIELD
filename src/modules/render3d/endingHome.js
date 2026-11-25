// The ending's act 2 at home (render3d/endingScene.js hands these beats on,
// core/cinematics.js HOME_SHOTS): drawn in the opening's own scene
// (storyScene.js, built on the loading screen and never disposed), the
// Ring and the player's ship borrowed into it as the opening does. `home`
// and `steady` are the opening's first two shots, every engine now steady;
// Severance's `return` flies the launch backwards into the hangar, its
// `depart` turns the Wake away from the Ring as it goes dark; Stewardship's
// `watch` holds the Wake and the interceptor before the lit Ring. Every
// beat sets its whole state from its progress; no sound cue of the opening
// is emitted here. leave() puts back all it borrowed or changed. Nothing is
// allocated per frame.

import { HOME_SHOTS, easeInOut } from '../../core/cinematics.js';
import { LAUNCH, STORY_FAR, STORY_SHOTS } from './storyScene.js';
import { setWakeLight } from './travel/wake.js';

const BEATS = new Set(['home', 'steady', 'return', 'depart', 'watch']);
// The opening's shots by id.
const OPENING = Object.fromEntries(STORY_SHOTS.map((shot) => [shot.id, shot]));
// Steps of the Wake's path through `depart` (its heading turns as it goes).
const STEPS = 24;
// The frames warm() draws: each beat's middle, by ending.
const WARM = [
  ['home', 'severance'],
  ['steady', 'severance'],
  ['return', 'severance'],
  ['depart', 'severance'],
  ['watch', 'stewardship'],
];

/** Whether beat `id` is one of the beats at home (drawn here). */
export function isHomeBeat(id) {
  return BEATS.has(id);
}

function span(u, [from, to]) {
  return easeInOut((u - from) / (to - from));
}

function lerp(a, b, k) {
  return a + (b - a) * k;
}

// The share of `depart`'s way made by `x`: gathering way, still
// gathering at the end.
function gather(x) {
  const { go } = HOME_SHOTS.depart;
  const k = Math.min(1, Math.max(0, (x - go[0]) / (go[1] - go[0])));
  return k * k;
}

// The Wake's turn by share `x` of `depart`: slow off the mark and still
// turning as the beat ends (she is heavy).
function turnAt(x) {
  const { yaw, turn } = HOME_SHOTS.depart;
  const k = Math.min(1, Math.max(0, (x - turn[0]) / (turn[1] - turn[0])));
  return yaw * k * k * (1.5 - 0.5 * k);
}

/**
 * The beat's state at progress `u` for `ending`: the horizon Ring's wake
 * and idle lights ×, the Wake's engines and turn (rad), the hangar's
 * light, and the interceptor (shown, thrust).
 */
export function homeAt(beat, u, ending, out = {}) {
  const ring = HOME_SHOTS.ring[ending] ?? HOME_SHOTS.ring.severance;
  let dark = 0;
  if (ending !== 'stewardship') {
    if (beat === 'return') dark = ring.dying * easeInOut(u);
    if (beat === 'depart') {
      dark = lerp(ring.dying, 1, easeInOut(u / ring.darkBy));
    }
  }
  out.wake = ring.wake * (1 - dark);
  out.idle = ring.idle * (1 - dark);
  out.engines = 1;
  out.yaw = 0;
  out.bay = 0;
  out.ship = false;
  out.thrust = 0;
  if (beat === 'return') {
    const { cut, thrust, bay, lamp, enter } = HOME_SHOTS.return;
    out.ship = true;
    out.thrust = lerp(thrust[0], thrust[1], Math.min(1, u / cut));
    out.bay =
      u < cut
        ? bay[0] * span(u, lamp)
        : lerp(bay[0], bay[1], span((u - cut) / (1 - cut), enter));
  } else if (beat === 'depart') {
    const shot = HOME_SHOTS.depart;
    out.yaw = turnAt(u);
    out.engines = lerp(1, shot.engines, gather(u));
  } else if (beat === 'watch') {
    out.ship = true;
    out.thrust = HOME_SHOTS.watch.thrust;
  }
  return out;
}

export class EndingHome {
  /** `t`: Renderer3D's WebGL kit; `story`: the opening (storyScene.js). */
  constructor(t, story) {
    const { THREE } = t;
    this.t = t;
    this.story = story;
    this.lent = false;
    this.far = 0;
    this.state = {};
    this.idle = t.backdrop.ring.uniforms.uIdle.value.clone();
    this.eye = new THREE.Vector3();
    this.aim = new THREE.Vector3();
    this.at = new THREE.Vector3();
    this.ship = new THREE.Vector3();
    this.nose = new THREE.Vector3();
  }

  /** The opening's scene, drawn in the field's place while lent. */
  get scene() {
    return this.story.scene;
  }

  // The Ring and the ship into the opening's scene, once.
  lend() {
    if (this.lent) return;
    const { story, t } = this;
    story.build();
    story.borrow();
    this.far = t.camera.far;
    story.signal.visible = false;
    this.lent = true;
  }

  /**
   * Beat `beat` at progress `u` for `ending`: the camera, the lens, the
   * sky, the Wake's engines, turn and way, the hangar's light, and the
   * interceptor's place (posed in pose()).
   */
  frame(camera, beat, u, ending) {
    this.lend();
    const { story } = this;
    const state = homeAt(beat, u, ending, this.state);
    if (beat === 'home' || beat === 'steady') {
      this.poseOpening(HOME_SHOTS[beat].story, easeInOut(u));
    } else if (beat === 'return') this.poseReturn(u);
    else this.poseWide(HOME_SHOTS[beat], u);
    camera.position.copy(this.eye);
    camera.up.set(0, 1, 0);
    camera.lookAt(this.aim);
    if (camera.fov !== this.fov || camera.far !== STORY_FAR) {
      camera.fov = this.fov;
      camera.far = STORY_FAR;
      camera.updateProjectionMatrix();
    }
    story.sky.place(camera, story.origin);
    this.t.backdrop.ring.follow = 0;
    const { engines } = story.wake.lights;
    for (let i = 0; i < engines.length; i += 1) {
      setWakeLight(engines[i], state.engines);
    }
    story.bay.intensity = state.bay;
    this.placeWake(beat === 'depart' ? u : 0);
  }

  // The opening's own camera of its shot `id` at eased progress `e`
  // (storyScene.js frame), about the hangar or the interceptor as it says.
  poseOpening(id, e) {
    const shot = OPENING[id];
    this.eye
      .fromArray(shot.from[0])
      .lerp(this.at.fromArray(shot.to[0]), e)
      .add(this.about(shot.on?.[0]));
    this.aim
      .fromArray(shot.from[1])
      .lerp(this.at.fromArray(shot.to[1]), e)
      .add(this.about(shot.on?.[1]));
    this.fov = shot.fov;
  }

  // What a shot's eye or aim is about: the hangar's mouth, the
  // interceptor, or the Wake's centre.
  about(name) {
    if (name === 'hangar') return this.story.hangar;
    if (name === 'ship') return this.ship;
    return this.story.origin;
  }

  // The opening's launch and hangar shots backwards: the interceptor in
  // from the field, up under the hangar (the launch's path from its end),
  // then in.
  poseReturn(u) {
    const shot = HOME_SHOTS.return;
    const mouth = this.story.hangar;
    if (u < shot.cut) {
      const k = shot.from * (1 - u / shot.cut);
      const [ahead, side] = LAUNCH.out;
      this.ship.set(ahead * k * k, LAUNCH.dive * (1 - (1 - k) ** 3), side * k);
      this.aimShip(shot);
      this.ship.add(mouth);
      this.poseOpening('launch', easeInOut(k));
    } else {
      const k = (u - shot.cut) / (1 - shot.cut);
      this.ship.fromArray(LAUNCH.inside).multiplyScalar(span(k, shot.enter));
      this.aimShip(shot);
      this.ship.add(mouth);
      this.poseOpening('hangar', easeInOut(1 - k));
    }
  }

  // The interceptor's nose (this.ship about the mouth) on a point deep in
  // the hangar, held near level.
  aimShip(shot) {
    this.nose.fromArray(LAUNCH.inside).multiplyScalar(shot.nose).sub(this.ship);
    const flat = Math.hypot(this.nose.x, this.nose.z);
    this.shipYaw = Math.atan2(-this.nose.z, this.nose.x);
    this.shipPitch = Math.max(
      -shot.pitch,
      Math.min(shot.pitch, Math.atan2(this.nose.y, flat))
    );
  }

  // The wide view on the Ring (depart, watch): the eye drifting, the aim
  // panning, the lens closing; the interceptor where the shot sets it.
  poseWide(shot, u) {
    const e = easeInOut(u);
    this.eye.fromArray(shot.eye[0]).lerp(this.at.fromArray(shot.eye[1]), e);
    this.aim.fromArray(shot.aim[0]).lerp(this.at.fromArray(shot.aim[1]), e);
    this.fov = lerp(shot.fov[0], shot.fov[1], e);
    if (shot.ship) {
      this.ship.fromArray(shot.ship);
      this.shipYaw = Math.atan2(
        -(shot.aim[0][2] - shot.ship[2]),
        shot.aim[0][0] - shot.ship[0]
      );
      this.shipPitch = 0;
    }
  }

  // The Wake by `u` of `depart` (none: at rest where she was built): her
  // turn so far and the way she has made along her turning heading; its
  // shadows drawn again when she moves.
  placeWake(u) {
    const group = this.story.wake.group;
    const { travel } = HOME_SHOTS.depart;
    let x = 0;
    let z = 0;
    const step = u / STEPS;
    for (let i = 0; i < STEPS && u > 0; i += 1) {
      const at = (i + 0.5) * step;
      const way = travel * (gather(at + step / 2) - gather(at - step / 2));
      const a = turnAt(at);
      x += Math.cos(a) * way;
      z -= Math.sin(a) * way;
    }
    const yaw = turnAt(u);
    if (
      group.rotation.y === yaw &&
      group.position.x === x &&
      group.position.z === z
    ) {
      return;
    }
    group.rotation.y = yaw;
    group.position.set(x, 0, z);
    group.updateMatrixWorld(true);
    this.story.rig.sun.shadow.needsUpdate = true;
  }

  /**
   * Just before the draw: the horizon Ring's light (the backdrop's own
   * setting is the field's, put back on leave) and the interceptor.
   */
  pose(time) {
    const { state, t } = this;
    const ring = t.backdrop.ring;
    ring.uniforms.uWake.value = state.wake;
    ring.uniforms.uIdle.value.copy(this.idle).multiplyScalar(state.idle);
    ring.object.visible = true;
    ring.material.opacity = 1;
    ring.material.transparent = false;
    const mirror = t.player;
    mirror.group.visible = state.ship;
    if (!state.ship) return;
    mirror.still(time);
    mirror.group.position.copy(this.ship);
    mirror.group.rotation.set(0, this.shipYaw, this.shipPitch);
    mirror.lightEngines(state.thrust, 1, time);
  }

  /** Everything borrowed or changed put back (idempotent). */
  leave() {
    if (!this.lent) return;
    const { story, t } = this;
    this.lent = false;
    story.giveBack();
    story.signal.visible = true;
    story.bay.intensity = 0;
    story.wake.lights.engines.forEach((light) => setWakeLight(light, 1));
    this.placeWake(0);
    t.player.group.rotation.set(0, 0, 0);
    t.backdrop.ring.uniforms.uIdle.value.copy(this.idle);
    t.backdrop.applyStructures();
    t.camera.far = this.far;
    t.camera.updateProjectionMatrix();
  }

  /**
   * Loading screen, once the opening is warm: a frame of each beat drawn
   * through the composer (the ship and the Ring together in its scene is a
   * light count the opening never draws), then all put back.
   */
  warm(camera) {
    const { t } = this;
    const pass = t.composer.passes[0];
    const field = pass.scene;
    const shown = t.player.group.visible;
    const fov = camera.fov;
    pass.scene = this.scene;
    WARM.forEach(([beat, ending]) => {
      this.frame(camera, beat, 0.5, ending);
      this.pose(0);
      t.composer.render(0);
    });
    pass.scene = field;
    this.leave();
    camera.fov = fov;
    camera.updateProjectionMatrix();
    t.player.group.visible = shown;
  }
}
