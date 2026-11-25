// The campaign's ending (ui/runCinematics.js plays its beats,
// core/cinematics.js REVELATION_BEATS and endingBeats). Act 1 (its shots
// REVELATION_SHOTS) is drawn
// in the game's own scene after the camera rig, on the rough cut the owner
// approved (24/11): close on Sovereign where it fell, sealed and still, its
// shells opening wide; a slow quarter turn round it; the pull-back over the
// Crucible as the Ring wakes; hard cuts to the Null Boundary's rupture and
// the Quarantine Grid's fence (their place sets and looks, held where the
// journeys show them) and back to the Crucible's star and arcs; then the
// interceptor before the open Sovereign, the picture the choice opens over.
// Sovereign is the very view the fight drew (enemyMirror keepFallen),
// driven by a stand-in boss from the pose it fell in. Nothing of the fight
// shows meanwhile (hideField), and the ship only in the Crucible's shots.
// Act 2 at the Crucible (ENDING_SHOTS): `answer` rises from that last
// picture, Sovereign still standing open, to a wide view over the Crucible
// as the Ring's wake goes to the ending's own (the set answers:
// theCrucible.js); `twin`, the last image (endingTwin.js), goes on from
// it at the slip of an arc no other shot shows (places/crucibleSlip.js),
// a Wake identical to ours, empty, one window lit. The black holds after the act (its end, or a skip) until the
// scene resets (stop). The beats between, in the opening's scene, are not
// drawn yet: they hold `answer`'s last picture.
// Each beat sets its whole state from scratch, a function of its progress:
// `?cinematic=ending&beat=<id>&t=&ending=` holds one (core/cinematics.js).
// Nothing is allocated per frame.

import {
  ENDING_SHOTS,
  ENDING_WAKE,
  REVELATION_BEATS,
  REVELATION_SHOTS as SHOTS,
  cinematicFreezeFromUrl,
  easeInOut,
  endingBeats,
  wakeAt,
} from '../../core/cinematics.js';
import { IS_DEV } from '../../core/env.js';
import { biomeForLayer } from '../../data/biomes.js';
import { sectorById } from '../../data/sectors.js';
import { HALF_H, HALF_W } from './batches.js';
import { LastImage } from './endingTwin.js';
import { RING } from './ring/ringShape.js';

const BEATS = new Set(REVELATION_BEATS.map((beat) => beat.id));
const ALL_BEATS = new Set([
  ...BEATS,
  ...endingBeats('severance').map((beat) => beat.id),
  ...endingBeats('stewardship').map((beat) => beat.id),
]);
const CRUCIBLE = 'the-crucible';
// The hero view's lens up (+y), and the pull-back's (up the field).
const UP = [0, 1, 0];
const UP_FIELD = [0, 0, -1];
// The boss light on Sovereign's fallen view, as Renderer3D lights a live one.
const BOSS_LIGHT = 2.6;

/** Whether beat `id` is act 1's (drawn here). */
export function isRevelationBeat(id) {
  return BEATS.has(id);
}

/**
 * Sovereign's shells at progress `u` of `opens`: from `from` (as it fell)
 * shut over the first two thirds of the sealed share, held, then open to
 * the act's widest.
 */
export function shellsAt(u, from) {
  const { sealed } = SHOTS.opens;
  if (u < sealed) return from * (1 - easeInOut(u / ((sealed * 2) / 3)));
  return SHOTS.open * easeInOut((u - sealed) / (1 - sealed));
}

/** The hero eye's turn about Sovereign (rad) at `u` of `beat`. */
export function heroAngle(beat, u) {
  if (beat === 'opens') return SHOTS.opens.orbit;
  if (beat === 'count') return SHOTS.opens.orbit * (1 - easeInOut(u));
  return 0;
}

function lerp(a, b, k) {
  return a + (b - a) * k;
}

export class EndingScene {
  /**
   * `t`: Renderer3D's WebGL kit. Act 1 ends (or is skipped) on
   * 'cinematic-ended', act 2 starts on 'cinematic-started' (`eventBus`).
   */
  constructor(t, eventBus) {
    const { THREE } = t;
    this.t = t;
    this.mirror = t.enemies;
    this.active = false;
    this.beat = null;
    this.startedAt = 0;
    this.durationMs = 1;
    this.frozenAt = null;
    this.posed = false;
    this.freeze = IS_DEV ? cinematicFreezeFromUrl() : null;
    // Sovereign's pose as it fell: act 1 goes on from it (its view is kept
    // the next frame, enemyMirror keepFallen)
    eventBus?.on('boss-defeated', ({ enemy } = {}) => {
      if (enemy?.bossKind === 'sovereign') this.fallen(enemy);
    });
    // act 1 over: its last picture holds under the choice; act 2 over:
    // the black holds
    eventBus?.on('cinematic-ended', ({ kind } = {}) => {
      if (kind === 'revelation') this.settle('known');
      if (kind === 'ending') this.settle('twin');
    });
    // A cut away from the Crucible's field (no Sovereign, no ship).
    this.cut = false;
    // The look drawn instead of the run's (the cuts), or null.
    this.look = null;
    this.looks = new Map();
    ['rupture', 'fences'].forEach((id) => {
      const sector = sectorById(SHOTS[id].sector);
      const look = biomeForLayer(sector.layers[0], sector);
      this.looks.set(id, { from: look, to: look, mix: 1 });
    });
    this.baseFov = null;
    this.exposure = t.renderer.toneMappingExposure;
    // The ending picked (act 2), the last image (endingTwin.js), and
    // whether the picture is black.
    this.ending = null;
    this.last = new LastImage(t);
    this.black = false;
    this.blank = new THREE.Scene();
    // Where Sovereign fell (world) and how, and the stand-in boss that
    // poses it.
    this.centre = new THREE.Vector3();
    this.fell = {
      known: false,
      x: 0,
      y: 0,
      radius: 0,
      plateOpen: 0,
      plateTurn: 0,
      order: 'protect',
      splitAngle: 0,
      facing: 0,
    };
    this.boss = {
      radius: 0,
      plateOpen: 0,
      plateTurn: 0,
      order: 'protect',
      splitAngle: 0,
      facing: 0,
      barrier: null,
      beams: null,
      split: null,
      telegraph: null,
      getHitFlash: () => 0,
    };
    this.eye = new THREE.Vector3();
    this.aim = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.from = new THREE.Vector3();
    this.to = new THREE.Vector3();
    this.toAim = new THREE.Vector3();
    this.star = new THREE.Vector3();
    // The scene's roots drawn in act 1 (keepRoots), and those hidden now.
    this.keep = null;
    this.hidden = [];
  }

  // Besides the lights: the Ring, the places and the space behind them
  // (what the backdrop and the space field hold, one level down) and the
  // chunks of the final blow's bursts (its flash is a light). The shared
  // batches of sparks, smoke and trails go too: shots and pickups draw in
  // them.
  keepRoots() {
    const t = this.t;
    const keep = new Set([
      t.key.target,
      ...t.debris.meshes,
      ...t.debris.plates,
    ]);
    const add = (value) => {
      if (value?.isObject3D) keep.add(value);
      else if (Array.isArray(value)) value.forEach(add);
      else if (value?.constructor === Object) Object.values(value).forEach(add);
    };
    [t.backdrop, t.backdrop.ring, t.backdrop.places, t.space].forEach((part) =>
      Object.values(part).forEach(add)
    );
    return keep;
  }

  /**
   * Beat `id` of either act over `durationMs`, `ending` the one picked (act
   * 2; a dev freeze holds its own beat at its t, for its own ending); the
   * first takes Sovereign from where it fell. True.
   */
  start(id, durationMs, ending = null) {
    const { freeze } = this;
    const held = freeze?.kind === 'ending' && ALL_BEATS.has(freeze.beat);
    if (held) this.ending = freeze.ending;
    else this.ending = ending;
    this.hold(held ? freeze.beat : id, durationMs, held ? freeze.t : null);
    return true;
  }

  // Beat `id` from now over `durationMs`, or held at `frozenAt`.
  hold(id, durationMs, frozenAt) {
    if (!this.active) this.begin();
    this.beat = id;
    this.startedAt = performance.now();
    this.durationMs = Math.max(1, durationMs);
    this.frozenAt = frozenAt;
  }

  // Sovereign as the simulation lets it go (its pose, read once).
  fallen(enemy) {
    const f = this.fell;
    f.known = true;
    f.x = Number.isFinite(enemy.x) ? enemy.x : HALF_W;
    f.y = Number.isFinite(enemy.y) ? enemy.y : HALF_H;
    f.radius = enemy.radius || 0;
    f.plateOpen = enemy.plateOpen ?? 0;
    f.plateTurn = enemy.plateTurn ?? 0;
    f.order = enemy.order ?? 'protect';
    f.splitAngle = enemy.splitAngle ?? 0;
    f.facing = enemy.facing ?? 0;
  }

  begin() {
    this.active = true;
    this.keep ??= this.keepRoots();
    this.mirror.keepFallen = true;
    this.posed = false;
    this.baseFov = this.t.camera.fov;
  }

  // On the act's first frame, once the fall's every listener has run: the
  // stand-in takes Sovereign's pose (a win with no Sovereign on the field,
  // a dev's, poses one mid-field).
  takePose() {
    const f = this.fell;
    if (!f.known) this.fallen({});
    this.centre.set(f.x - HALF_W, 0, f.y - HALF_H);
    const boss = this.boss;
    boss.radius = f.radius;
    boss.plateTurn = f.plateTurn;
    boss.splitAngle = f.splitAngle;
    boss.facing = f.facing;
    this.posed = true;
  }

  /**
   * An act ended (or was skipped): its last picture (`last`, act 1's or the
   * black after the last image) holds until the next act or a reset.
   */
  settle(last) {
    if (!this.active || this.frozenAt !== null) return;
    this.hold(last, 1, 1);
  }

  /** Loading screen: the last image's slip built and compiled (LastImage). */
  warm(compile) {
    this.last.warm(compile);
  }

  stop() {
    if (!this.active) return;
    const t = this.t;
    this.active = false;
    this.fell.known = false;
    this.beat = null;
    this.cut = false;
    this.look = null;
    this.showField();
    this.mirror.keepFallen = false;
    this.mirror.releaseHusk();
    this.ending = null;
    this.black = false;
    this.last.show(false);
    t.backdrop.places.built.get(CRUCIBLE).ending(false);
    t.backdrop.places.setFlight(null);
    t.backdrop.ring.follow = RING.follow;
    t.renderer.toneMappingExposure = this.exposure;
    this.setFov(this.baseFov);
  }

  /** The scene drawn instead of the field's: an empty one while black. */
  get scene() {
    return this.active && this.black ? this.blank : null;
  }

  get progress() {
    if (this.frozenAt !== null) return Math.min(1, Math.max(0, this.frozenAt));
    return Math.min(1, (performance.now() - this.startedAt) / this.durationMs);
  }

  /**
   * This frame of the beat, after the rig has posed `camera`: the camera,
   * the places, the Ring's wake and hold, the look and Sovereign's pose;
   * the slip shown only in the last image.
   */
  frame(camera) {
    if (!this.active) return;
    if (!this.posed) this.takePose();
    const u = this.progress;
    const { beat, boss } = this;
    const t = this.t;
    const revelation = isRevelationBeat(beat);
    // Sovereign: as it fell, shut, then open; its orders turn to REBUILD's
    // once sealed (both orders would open only half the shells); it stays
    // open after
    const opening = beat === 'opens';
    boss.plateOpen = opening ? shellsAt(u, this.fell.plateOpen) : SHOTS.open;
    boss.order =
      opening && u < (SHOTS.opens.sealed * 2) / 3 ? this.fell.order : 'rebuild';
    t.backdrop.places.built.get(CRUCIBLE).ending(!revelation);
    this.last.show(beat === 'twin');
    this.cut = beat === 'twin' || Boolean(SHOTS[beat]?.sector);
    this.black = false;
    this.look = null;
    t.backdrop.ring.follow = RING.follow;
    t.renderer.toneMappingExposure = this.exposure;
    let wake;
    if (beat === 'twin') wake = this.poseTwin(camera, u);
    else if (!revelation) {
      // answer; the beats at home hold its last picture until drawn
      const k = easeInOut(beat === 'answer' ? u : 1);
      this.poseRise(camera, k, ENDING_SHOTS.answer);
      wake = lerp(1, ENDING_WAKE[this.ending] ?? 1, k);
    } else if (this.cut) wake = this.poseCut(camera, SHOTS[beat], u);
    else if (beat === 'recoil') {
      this.poseRise(camera, easeInOut(u), SHOTS.recoil);
      wake = wakeAt(u);
    } else {
      const { pull } = SHOTS[beat];
      this.poseHero(heroAngle(beat, u), lerp(pull[0], pull[1], easeInOut(u)));
      this.up.set(...UP);
      this.aimCamera(camera, SHOTS.hero.fov);
      this.holdStar(this.eye, this.aim);
      t.backdrop.places.setFlight(CRUCIBLE, 1, this.star.x, this.star.z);
      wake = beat === 'known' ? 1 : 0;
    }
    t.backdrop.setWake(wake);
  }

  // The last image (endingTwin.js): its camera, the slip, the exposure
  // and the black. Returns the Ring's wake.
  poseTwin(camera, u) {
    const t = this.t;
    const twin = this.last.frame(
      u,
      this.ending,
      this.durationMs,
      this.eye,
      this.aim
    );
    this.up.set(...UP);
    this.aimCamera(camera, ENDING_SHOTS.twin.fov);
    t.renderer.toneMappingExposure = this.exposure * twin.exposure;
    t.backdrop.ring.follow = 0;
    this.black = twin.black;
    return twin.wake;
  }

  // The hero view turned `angle` about Sovereign, `pull` × as far.
  poseHero(angle, pull) {
    const { eye, aim } = SHOTS.hero;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    this.eye
      .set(eye[0] * c - eye[2] * s, eye[1], eye[0] * s + eye[2] * c)
      .multiplyScalar(pull)
      .add(this.centre);
    this.aim
      .set(aim[0] * c - aim[2] * s, aim[1], aim[0] * s + aim[2] * c)
      .add(this.centre);
  }

  // The camera at this.eye on this.aim, its up this.up, lens `fov`.
  aimCamera(camera, fov) {
    camera.position.copy(this.eye);
    camera.up.copy(this.up);
    camera.lookAt(this.aim);
    this.setFov(fov);
  }

  setFov(fov) {
    const camera = this.t.camera;
    if (fov === null || camera.fov === fov) return;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  // The Crucible's set laid so its star stands straight behind the view's
  // aim, at its own depth (the hero view); into this.star as the field
  // point its layer follows.
  holdStar(eye, aim) {
    const layer = this.t.backdrop.places.built.get(CRUCIBLE).layers[0];
    const dx = aim.x - eye.x;
    const dy = aim.y - eye.y;
    const dz = aim.z - eye.z;
    const k = (layer.anchor[1] - eye.y) / dy;
    this.star.set(
      (eye.x + dx * k - layer.anchor[0]) / layer.follow,
      0,
      (eye.z + dz * k - layer.anchor[2]) / layer.follow
    );
  }

  // From the hero view's end (count's, known's) up and back over the
  // whole Crucible to `shot`'s pose, `k` of the way: the eye's offset turns
  // and grows geometrically, the star eases from behind Sovereign to where
  // the view would lay it.
  poseRise(camera, k, shot) {
    const { range, tilt, ahead, fov } = shot;
    this.poseHero(0, 1);
    this.holdStar(this.eye, this.aim);
    const sx = this.star.x;
    const sz = this.star.z;
    this.from.subVectors(this.eye, this.aim);
    const a = (tilt * Math.PI) / 180;
    this.toAim.set(this.centre.x, 0, this.centre.z + ahead);
    this.to.set(0, Math.cos(a), Math.sin(a)).multiplyScalar(range);
    const near = this.from.length();
    this.aim.lerp(this.toAim, k);
    this.eye
      .copy(this.from)
      .divideScalar(near)
      .lerp(this.to.divideScalar(range), k)
      .normalize()
      .multiplyScalar(near * (range / near) ** k)
      .add(this.aim);
    this.up
      .set(...UP)
      .lerp(this.to.set(...UP_FIELD), k)
      .normalize();
    this.aimCamera(camera, lerp(SHOTS.hero.fov, fov, k));
    this.t.backdrop.places.setFlight(
      CRUCIBLE,
      1,
      lerp(sx, this.toAim.x, k),
      lerp(sz, this.toAim.z, k)
    );
  }

  // A cut to another place (or the Crucible's own, far below): its set and
  // the Ring held still where the play view lays them about the field's
  // middle, its look, the eye drifting. Returns the Ring's wake: the
  // places shown as the pilot saw them, the Crucible's awake.
  poseCut(camera, shot, u) {
    const t = this.t;
    const sector = sectorById(shot.sector);
    this.eye.set(
      shot.eye[0] + shot.drift[0] * u,
      shot.eye[1] + shot.drift[1] * u,
      shot.eye[2] + shot.drift[2] * u
    );
    this.aim.set(...shot.aim);
    this.up.set(...UP);
    this.aimCamera(camera, shot.fov);
    t.backdrop.places.setFlight(sector.look.backdrop, 1, 0, 0);
    t.backdrop.ring.follow = 0;
    t.renderer.toneMappingExposure = this.exposure * shot.exposure;
    this.look = this.looks.get(this.beat) ?? null;
    return sector.id === CRUCIBLE ? 1 : 0;
  }

  /**
   * Just before the draw, every mirror updated: Sovereign's view (the one
   * the mirror kept as it fell, a fresh one mid-field when none fell)
   * posed by the stand-in and lit by the boss light, the ship before it
   * facing it (both out of the cuts), and the fight out of the frame.
   */
  pose(time) {
    if (!this.active) return;
    const { mirror, t } = this;
    if (!mirror.husk) {
      mirror.husk = mirror.acquire('boss-sovereign');
      mirror.husk.object.position.copy(this.centre);
    }
    const view = mirror.husk;
    const ship = t.player.group;
    view.object.visible = !this.cut;
    t.wardenLight.intensity = this.cut ? 0 : BOSS_LIGHT;
    if (this.cut) ship.visible = false;
    else {
      mirror.sentinelViews.update(view, this.boss, time);
      t.wardenLight.position.copy(view.object.position).setY(40);
      t.wardenLight.color.copy(view.light);
      const [x, , z] = SHOTS.ship;
      ship.position.set(this.centre.x + x, 0, this.centre.z + z);
      ship.rotation.y = -Math.atan2(-z, -x);
    }
    this.hideField();
    if (this.beat === 'twin' && !this.black) this.last.light(this.ending);
  }

  // Every root of the fight out of the frame (showField after the draw),
  // the Ring too in the last image.
  hideField() {
    const roots = this.t.scene.children;
    const husk = this.mirror.husk?.object;
    const ship = this.t.player.group;
    const { ring, structures } = this.t.backdrop;
    const twin = this.beat === 'twin';
    for (let i = 0; i < roots.length; i += 1) {
      const root = roots[i];
      if (!root.visible || root.isLight) continue;
      // the last image shows no Ring: only the Crucible's arcs and star
      const ringRoot = root === ring.object || root === structures.group;
      if (twin && ringRoot) {
        root.visible = false;
        this.hidden.push(root);
        continue;
      }
      if (root === husk || root === ship || this.keep.has(root)) continue;
      root.visible = false;
      this.hidden.push(root);
    }
  }

  /** After the draw: the fight's roots and the lights as they were. */
  showField() {
    this.last.unlight();
    for (let i = 0; i < this.hidden.length; i += 1) {
      this.hidden[i].visible = true;
    }
    this.hidden.length = 0;
  }
}
