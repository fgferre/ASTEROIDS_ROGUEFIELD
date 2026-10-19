// The gameplay shot around the logical follow camera (core/camera.js): the
// dolly, the strafe roll, the clamp to the field, the key light's shadow box
// and the run's cinematics, posed on the perspective camera every frame.

import { GAME_HEIGHT, GAME_WIDTH } from '../../core/GameConstants.js';
import {
  createCameraScene,
  dampTo,
  readCameraScene,
} from '../../core/camera.js';
import {
  blendPose,
  cinematicFreezeFromUrl,
  followPose,
} from '../../core/cinematics.js';
import { IS_DEV } from '../../core/env.js';
import { SHIP_MAX_SPEED } from '../../data/constants/physics.js';
import { HALF_H, HALF_W } from './batches.js';
import { FOV, KEY_SHADOW } from './sceneSetup.js';

const TILT = (18 * Math.PI) / 180;
const TAN_V = Math.tan((FOV * Math.PI) / 360);
const COS = Math.cos(TILT);
const SIN = Math.sin(TILT);
const DOLLY_TIME_CONSTANT = 0.4;
const DOLLY_SPEED_OUT = 0.08;
const DOLLY_COMBAT_IN = 0.06;
// Camera roll on strafe (dynamic mode only, none in boss framing).
const ROLL_MAX = (2.5 * Math.PI) / 180;
const ROLL_SMOOTH = 0.25;
// A skipped or released cinematic eases back to the follow camera this long.
const CINEMATIC_HANDBACK_MS = 500;
const FOLLOW_POSE = followPose();
const COMBAT_RANGE = 140;

export function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * The frustum's footprint on the field plane, `distance` from the target on
 * an `aspect` screen: a trapezoid, widest at its far (upper) edge. `halfWidth`
 * is that edge's half; `up` and `down` reach from the target to the far and
 * near edges. Every part grows with the distance, in proportion.
 */
export function footprint(distance, aspect, out = {}) {
  const height = distance * COS;
  const far = COS - TAN_V * SIN;
  const near = COS + TAN_V * SIN;
  out.halfWidth = (height * TAN_V * aspect) / far;
  out.up = (height * (SIN + TAN_V * COS)) / far - distance * SIN;
  out.down = distance * SIN + (height * (TAN_V * COS - SIN)) / near;
  return out;
}

const UNIT = footprint(1, 1);

/** The farthest the shot can sit with its footprint inside the field. */
export function fieldFitDistance(aspect) {
  return Math.min(
    GAME_WIDTH / (2 * UNIT.halfWidth * aspect),
    GAME_HEIGHT / (UNIT.up + UNIT.down)
  );
}

export class CameraRig {
  // `camera`: the logical follow camera (createCamera).
  constructor(camera) {
    this.camera = camera;
    this.cameraScene = createCameraScene();
    this.roll = { value: 0, velocity: 0 };
    this.dolly = 1;
    // The run's intro/epilogue camera (core/cinematics.js), on render time.
    this.cinematic = null;
    this.cinePose = followPose();
    this.cinematicFreeze = IS_DEV ? cinematicFreezeFromUrl() : null;
    // The camera target (world x, z), written by updateCamera.
    this.focus = { x: 0, z: 0 };
    // The shot's footprint this frame, as the logical camera's reach.
    this.reach = {};
  }

  reset() {
    this.roll.value = 0;
    this.roll.velocity = 0;
    this.dolly = 1;
    this.cinematic = null;
  }

  startCinematic(path, durationMs, hold, kind) {
    const freeze = this.cinematicFreeze;
    this.cinematic = {
      path,
      startedAt: performance.now(),
      durationMs,
      hold,
      frozenAt: freeze?.kind === kind ? freeze.t : null,
    };
  }

  /** Eases from wherever the cinematic is back to the follow camera. */
  endCinematic() {
    if (!this.cinematic) return;
    this.cinematic = {
      from: { ...this.cinePose },
      startedAt: performance.now(),
      durationMs: CINEMATIC_HANDBACK_MS,
    };
  }

  // The cinematic's pose this frame, null once the follow camera is back.
  cinematicPose(now) {
    const c = this.cinematic;
    if (!c) return null;
    const t = c.frozenAt ?? (now - c.startedAt) / c.durationMs;
    if (t >= 1 && !c.hold) {
      this.cinematic = null;
      return null;
    }
    const pose = c.path
      ? c.path(Math.min(1, t))
      : blendPose(c.from, FOLLOW_POSE, t);
    Object.assign(this.cinePose, pose);
    return this.cinePose;
  }

  // `t`: Renderer3D's WebGL kit; `snap`: the first frame (no last render).
  updateCamera(t, player, enemies, effects, combat, dt, snap, reducedMotion) {
    // Poses are interpolated by now (render → applyPoses), so is the scene.
    const position = player?.position;
    if (position) {
      if (snap) {
        this.camera.snapTo(position.x, position.y);
      } else {
        const scene = readCameraScene(
          this.cameraScene,
          player,
          combat,
          enemies
        );
        this.camera.update(position.x, position.y, dt, scene);
      }
    }

    // Dolly: out at speed, in when something is close (smoothed).
    const v = player?.velocity;
    const speed = v ? Math.hypot(v.vx, v.vy) / SHIP_MAX_SPEED : 0;
    let near = false;
    if (position) {
      for (let i = 0; i < enemies.length && !near; i += 1) {
        const e = enemies[i];
        if (!e || e.destroyed) continue;
        const dx = e.x - position.x;
        const dy = e.y - position.y;
        const reach = COMBAT_RANGE + (e.radius || 0);
        near = dx * dx + dy * dy < reach * reach;
      }
    }
    const goal =
      1 +
      DOLLY_SPEED_OUT * smoothstep(0.55, 1, speed) -
      (near ? DOLLY_COMBAT_IN : 0);
    this.dolly +=
      (goal - this.dolly) * (1 - Math.exp(-dt / DOLLY_TIME_CONSTANT));

    const zoom = this.camera.effectiveZoom;
    const distance = this.frameShot(t.camera.aspect);

    // Shake: the same offset/rotation ScreenShake.apply() gives the 2D ctx,
    // in screen units → world units at this zoom.
    const shake = effects?.screenShake;
    const shaking = shake && shake.trauma > 0.001;
    const ox = shaking ? shake.offsetX / zoom : 0;
    const oy = shaking ? shake.offsetY / zoom : 0;
    const { x: cx, y: cy } = this.clampToField(distance, t.camera.aspect);
    // A cinematic poses the camera relative to the follow shot it ends on.
    const pose = this.cinematicPose(performance.now()) || FOLLOW_POSE;
    const tilt = (pose.tilt * Math.PI) / 180;
    const range = distance * pose.distance;
    const tx = cx - HALF_W - ox + pose.offsetX;
    const tz = cy - HALF_H - oy + pose.offsetY;
    t.backdrop.setWake(pose.wake);
    t.camera.position.set(
      tx,
      range * Math.cos(tilt),
      tz + range * Math.sin(tilt)
    );
    t.camera.up.set(0, 0, -1);
    t.camera.lookAt(tx, 0, tz);
    this.focus.x = tx;
    this.focus.z = tz;
    this.aimKeyShadow(t, tx, tz, range);
    const roll = this.updateRoll(player, dt, reducedMotion);
    const angle = roll + (shaking ? shake.angle : 0);
    if (Math.abs(angle) > 0.0001) t.camera.rotateZ(angle);
  }

  // The shot's distance this frame: far enough that the plane shows the flat
  // view's height (core/camera.js: 462 at zoom 1.3, 615 across at 4:3),
  // times the dolly, never so far that the tilted footprint spills past the
  // field. The logical camera then follows up to every edge of that shot.
  frameShot(aspect) {
    const { height } = this.camera.flatView();
    const distance = Math.min(
      (height / (2 * TAN_V)) * this.dolly,
      fieldFitDistance(aspect)
    );
    this.camera.setReach(footprint(distance, aspect, this.reach));
    return distance;
  }

  // The key light's shadow box over the shot: centred on the camera target
  // (snapped to whole texels so still edges don't crawl), sized by the range.
  aimKeyShadow(t, tx, tz, range) {
    const { key, keyDir } = t;
    if (!key.castShadow) return;
    const half = Math.min(
      KEY_SHADOW.max,
      Math.max(KEY_SHADOW.min, range * KEY_SHADOW.span)
    );
    const texel = (2 * half) / key.shadow.mapSize.x;
    const x = Math.round(tx / texel) * texel;
    const z = Math.round(tz / texel) * texel;
    key.target.position.set(x, 0, z);
    key.position.copy(keyDir).multiplyScalar(KEY_SHADOW.distance);
    key.position.x += x;
    key.position.z += z;
    const cam = key.shadow.camera;
    if (cam.right !== half) {
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      cam.updateProjectionMatrix();
    }
  }

  // Banks the view up to ROLL_MAX with the strafe: the screen-horizontal
  // part of the ship's sideways velocity. Not in classic/static, boss
  // framing, cinematics or reduced motion.
  updateRoll(player, dt, reducedMotion) {
    let goal = 0;
    const v = player?.velocity;
    if (
      v &&
      this.camera.mode === 'dynamic' &&
      !this.cinematic &&
      !reducedMotion
    ) {
      const angle = player.angle || 0;
      const sin = Math.sin(angle);
      const lateral = -v.vx * sin + v.vy * Math.cos(angle);
      const strafe = Math.max(
        -1,
        Math.min(1, (-sin * lateral) / SHIP_MAX_SPEED)
      );
      goal = -ROLL_MAX * strafe * (1 - this.camera.frameWeight);
    }
    return dampTo(this.roll, goal, ROLL_SMOOTH, dt);
  }

  // The follow point, kept so the frustum's footprint (footprint above)
  // stays inside the 800×600 field: a safety net, as frameShot already has
  // the logical camera clamp to the same reach. A footprint bigger than the
  // field (only past fieldFitDistance) is centred.
  clampToField(distance, aspect) {
    const out = this.clampedFollow || (this.clampedFollow = { x: 0, y: 0 });
    const { halfWidth, up, down } = footprint(
      distance,
      aspect,
      this.clampedFootprint || (this.clampedFootprint = {})
    );
    out.x =
      halfWidth * 2 >= GAME_WIDTH
        ? GAME_WIDTH / 2
        : Math.max(halfWidth, Math.min(GAME_WIDTH - halfWidth, this.camera.x));
    out.y =
      up + down >= GAME_HEIGHT
        ? (up + GAME_HEIGHT - down) / 2
        : Math.max(up, Math.min(GAME_HEIGHT - down, this.camera.y));
    return out;
  }
}
