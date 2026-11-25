// Gameplay renderer in Three.js (docs/NORTE.md §4b): a top-down scene tilted
// 18°, real key + fill lights, UnrealBloom on emissives only, SMAA. The
// simulation stays 2D: every frame the mirrors copy entity state from the
// systems into pooled meshes. Registered as 'renderer'.
//
// World mapping: logical (x, y) on the 800×600 field → world (x − 400, 0,
// y − 300) on the XZ plane, y up, 1 logical unit = 1 world unit.
// The constructor touches no THREE (Node tests build the manifest); the
// WebGL side is created on the first render().

import { BaseSystem } from '../../core/BaseSystem.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../../core/GameConstants.js';
import {
  CAMERA_ZOOM,
  createCamera,
  resolveCameraMode,
} from '../../core/camera.js';
import { epiloguePath, introPath } from '../../core/cinematics.js';
import { CAMERA_DIRECTOR } from '../../data/constants/camera.js';
import { HERALD_KINDS } from '../../data/enemies/herald.js';
import { IS_DEV } from '../../core/env.js';
import {
  StepInterpolator,
  interpolationDisabledByUrl,
} from '../../core/interpolation.js';
import {
  AutoQuality,
  QUALITY_PRESETS,
  qualityFromUrl,
} from '../../core/qualityPresets.js';
import { getViewport } from '../../core/viewport.js';
import { BiomeTransition } from '../../data/biomes.js';
import { resolveService } from '../../core/serviceUtils.js';
import { PALETTE } from '../../data/constants/palette.js';
import { HALF_H, HALF_W } from './batches.js';
import { CameraRig } from './cameraRig.js';
import { EndingScene, isRevelationBeat } from './endingScene.js';
import { VIEW_KINDS, markShadowCasters } from './enemyMirror.js';
import {
  mirrorEffects,
  mirrorPickups,
  mirrorProjectiles,
} from './fieldMirrors.js';
import { FormationMarks } from './formationMarks.js';
import {
  HitSparks,
  KillPops,
  MuzzleFlashes,
  SPARK_KIND,
  ShotWisps,
} from './hitSparks.js';
import { PickupFx } from './pickupFx.js';
import { BurnMarks } from './burnMarks.js';
import { DECAL_KIND, SHIP_DECAL_ID } from './scorchDecals.js';
import { hullLoss } from '../effects/ScreenFeedback.js';
import { registerEffectEvents } from './effectEvents.js';
import { ImpactKick, TRENCH_PULL, lensPull } from './impactPass.js';
import {
  mirrorBossTransitions,
  mirrorLocks,
  mirrorOverlays,
  WardLinks,
} from './overlayMirror.js';
import { setRimLight } from './rimLight.js';
import { BLOOM, FOV, SCENE_FOV, setupThree } from './sceneSetup.js';
import { StoryScene } from './storyScene.js';
import { TravelScene } from './travelScene.js';

// proposta 18/10: Settings > Bloom Intensity scales the preset's strength
// (Bloom off is the toggle, which drops the pass).
const BLOOM_INTENSITY = { low: 0.6, normal: 1, high: 1.4 };
// proposta 17/10: what kicks the impact pass (strength 0..1); big
// shockwaves kick it too (fieldMirrors.js).
const KICK_PLAYER_HIT = 1;
const KICK_BOSS_PHASE = 1;
const KICK_DASH = 0.45;
// proposta 18/10: the dash opens the shot for a beat (zoom × DASH_ZOOM_PULSE)
// and the emergency brake leans in (× BRAKE_ZOOM_PULSE), each over its
// seconds; none with reduced motion, like the slow-motion pulses.
const DASH_ZOOM_PULSE = 0.94;
const DASH_ZOOM_PULSE_SECONDS = 0.3;
const BRAKE_ZOOM_PULSE = 1.04;
const BRAKE_ZOOM_PULSE_SECONDS = 0.25;
// The ship's hull panels cast; its turret, nozzles and canopy (radius under
// this, world units) only receive.
const SHIP_MIN_CASTER = 5;
// Point sizes of the star layers are authored for a frame this tall.
const STAR_FRAME_HEIGHT = 900;
// The journey's rig holds the intro's first pose under its own camera.
const INTRO_START = introPath(0);
const holdIntroStart = () => INTRO_START;

// The pose of an entity's angle field, 0 when it has none.
function angleOf(holder, key) {
  return holder && Number.isFinite(holder[key]) ? holder[key] : 0;
}

// r128's UnrealBloomPass blurs a fixed five mips (two draws each) and its
// composite samples all five: fewer `mips` end the blur loop early and point
// the composite's unused slots at `pass.blackMip` (a black texel, made in
// setup). The active targets are resized to the composer's (`width` ×
// `height`, skipped before the first).
export function setBloomMips(pass, mips, width, height) {
  if (pass.nMips === mips) return;
  pass.nMips = mips;
  const { uniforms } = pass.compositeMaterial;
  pass.renderTargetsVertical.forEach((target, i) => {
    uniforms[`blurTexture${i + 1}`].value =
      i < mips ? target.texture : pass.blackMip;
  });
  if (width > 0) pass.setSize(width, height);
}

class Renderer3D extends BaseSystem {
  constructor(dependencies = {}) {
    super(dependencies, {
      systemName: 'Renderer3D',
      serviceName: 'renderer',
    });

    this.camera = createCamera();
    this.camera.setMode(resolveCameraMode());
    // Dolly, roll, field clamp, key shadow and cinematics (cameraRig.js).
    this.cameraRig = new CameraRig(this.camera);
    this.lastRenderTime = null;
    // The ship's screen point as last drawn (trackShip), or null.
    this.shipOnScreen = null;
    this.shipPoint = { x: 0, y: 0 };
    this.three = null;
    // The journey between sectors (travelScene.js), built with the scene.
    this.travel = null;
    // The story before the first campaign's journey (storyScene.js).
    this.story = null;
    this.failed = false;
    this.graphics = {
      bloom: true,
      bloomLevel: BLOOM_INTENSITY.normal,
      postProcessing: true,
      smaa: true,
      aberration: true,
    };
    this.reducedMotion = false;
    this.flashScale = 1; // Reduce Flashing: 0.3
    // `?quality=` pins a preset (or 'auto') over the Graphics setting.
    this.qualityUrl = qualityFromUrl();
    this.quality = new AutoQuality({
      mode: this.qualityUrl || 'auto',
      onChange: (change) => {
        this.applyQuality();
        this.eventBus?.emit('quality-changed', change);
      },
    });
    // Render interpolation (interpolation.js): poses captured per step,
    // written into the entities only while a frame is drawn, then restored.
    this.interp = interpolationDisabledByUrl() ? null : new StepInterpolator();
    this.poseOut = { x: 0, y: 0, angle: 0 };
    this.poseAlpha = 1;
    this.posed = [];
    this.captureBody = (pos, holder, key, id) => {
      this.interp.capture(pos, pos.x, pos.y, angleOf(holder, key), id);
    };
    this.poseBody = (pos, holder, key) => {
      const angle = angleOf(holder, key);
      const out = this.interp.sample(
        pos,
        pos.x,
        pos.y,
        angle,
        this.poseAlpha,
        this.poseOut
      );
      if (!out) return;
      const turns = holder && Number.isFinite(holder[key]);
      this.posed.push(pos, pos.x, pos.y, turns ? holder : null, key, angle);
      pos.x = out.x;
      pos.y = out.y;
      if (turns) holder[key] = out.angle;
    };
    this.impact = new ImpactKick();
    this.lensSide = { x: 0, y: 0 };
    this.lensAhead = { x: 0, y: 0 };
    this.trenchEnds = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
    this.hitSparks = new HitSparks();
    this.burnMarks = new BurnMarks();
    this.killPops = new KillPops();
    this.muzzles = new MuzzleFlashes();
    this.shotWisps = new ShotWisps();
    this.pickupFx = new PickupFx();
    this.formationMarks = new FormationMarks();
    this.wardLinks = new WardLinks();
    this.biome = new BiomeTransition();
    // Dense Fog (endless layer modifier): the far rocks and the space dim,
    // with distance from the camera target (the rig's focus).
    this.denseFog = false;
    this.stats = { drawCalls: 0, triangles: 0, frames: 0 };

    this.resolveCachedServices(
      {
        cachedPlayer: 'player',
        cachedXPOrbs: 'xp-orbs',
        cachedHealthHearts: 'healthHearts',
        cachedPickups: 'pickups',
        cachedEffects: 'effects',
        cachedCombat: 'combat',
        cachedEnemies: 'enemies',
      },
      { force: true }
    );

    // Three.js draws UUIDs from Math.random: object creation runs inside the
    // menu's seeded swap, so the dev RandomGuard stays quiet.
    const menu = resolveService('menu-background', this.dependencies);
    this.seeded = (fn) => menu.withSeededMathRandom(fn);

    // 'settings-graphics-changed' comes at startup, on every graphics edit and
    // after Reset All; accessibility edits arrive as 'settings-changed'.
    const settings = resolveService('settings', this.dependencies);
    if (settings) {
      this.applyGraphicsPreferences(settings.getCategoryValues('graphics'));
      this.applyAccessibilityPreferences(
        settings.getCategoryValues('accessibility')
      );
      this.camera.setLead(settings.getCategoryValues('controls')?.cameraLead);
    }
    this.registerEventListener('settings-graphics-changed', (payload = {}) => {
      if (payload?.values) this.applyGraphicsPreferences(payload.values);
    });
    // Controls → Camera Lead; this event covers live edits and resets too.
    this.registerEventListener('settings-controls-changed', (payload = {}) => {
      if (payload?.values) this.camera.setLead(payload.values.cameraLead);
    });
    this.registerEventListener('settings-changed', (change = {}) => {
      if (
        settings &&
        (change.category === 'accessibility' || change.type === 'reset-all')
      ) {
        this.applyAccessibilityPreferences(
          settings.getCategoryValues('accessibility')
        );
      }
    });
    this.registerEventListener('wave-started', (payload = {}) => {
      // A sector run shows its sector's look (WaveManager holds the sector).
      this.biome.enterLayer(
        payload.wave,
        this.cachedEnemies?.waveManager?.sector
      );
      this.camera.trigger('waveStart');
    });
    // What opens the camera director's wide view (core/cameraDirector.js).
    this.registerEventListener('wave-complete', () => {
      this.camera.trigger('cleared');
    });
    this.registerEventListener('elite-spawned', (payload) => {
      this.camera.trigger('elite', payload);
    });
    // A Warden crossing the edge on its entrance lights the border there.
    this.registerEventListener('boss-arrival-crossed', (payload) => {
      this.three?.veil.flare(
        payload.x - HALF_W,
        payload.y - HALF_H,
        payload.flare
      );
    });
    // A formation's marks, and the edge lit where it comes in. They end on
    // the layer clock (emitted as the schedule sets the formation's time).
    this.registerEventListener('formation-warned', (payload) => {
      const clock = this.cachedEnemies?.waveManager?.layerElapsed ?? 0;
      const until = clock + payload.warn;
      for (const { x, y } of this.formationMarks.add({ ...payload, until })) {
        this.three?.veil.flare(x - HALF_W, y - HALF_H, PALETTE.threat);
      }
    });
    // A look at an announced attack, only when its source is out of sight.
    this.registerEventListener('boss-telegraph', (payload) => {
      this.camera.trigger('telegraph', payload?.enemy);
    });
    // A boss falling mid-run: the view dives back near, with a short push
    // from above.
    this.registerEventListener('boss-defeated', ({ enemy } = {}) => {
      this.camera.trigger('dive', enemy);
      if (!this.reducedMotion) {
        this.camera.pulseZoom(
          CAMERA_ZOOM * CAMERA_DIRECTOR.bossDown.zoom,
          CAMERA_DIRECTOR.bossDown.duration
        );
      }
    });
    this.registerEventListener('layer-modifier-started', (payload = {}) => {
      if (payload.id === 'dense-fog') this.denseFog = true;
    });
    this.registerEventListener('layer-modifier-ended', (payload = {}) => {
      if (payload.id === 'dense-fog') this.denseFog = false;
    });
    this.registerEventListener('shield-hit', () => {
      const time = performance.now() / 1000;
      const dir = this.threatDirection();
      this.three?.shield.hit(time, dir.x, dir.y);
      // flecks off the shell where it was struck
      const pos = this.cachedPlayer?.position;
      const len = Math.hypot(dir.x, dir.y);
      if (pos && len > 0) {
        const r = (this.three?.player.shieldRadius || 20) * 0.9;
        this.hitSparks.emit(
          pos.x + (dir.x / len) * r,
          pos.y + (dir.y / len) * r,
          dir.x,
          dir.y,
          -dir.x,
          -dir.y,
          false,
          SPARK_KIND.shield
        );
      }
    });
    this.registerEventListener('shield-activated', () => {
      this.three?.shield.activate(performance.now() / 1000);
    });
    this.registerEventListener('shield-broken', () => {
      this.three?.shield.break(performance.now() / 1000, this.flashScale);
    });
    this.registerEventListener('camera-zoom-pulse', ({ zoom, duration }) => {
      this.camera.pulseZoom(zoom, duration);
    });
    // The hull took it: the lens kicks. The shield took it all: no kick and
    // no hurt blink (the i-frames still run; only their look is held).
    this.registerEventListener('player-took-damage', (payload = {}) => {
      if (hullLoss(payload) > 0) {
        this.impact.kick(KICK_PLAYER_HIT);
        this.strikeHull(payload);
      } else this.three?.player.holdBlink(performance.now() / 1000 + 0.5);
    });
    this.registerEventListener('boss-phase-changed', ({ enemy } = {}) => {
      this.impact.kick(KICK_BOSS_PHASE);
      this.camera.trigger('dive', enemy);
    });
    this.registerEventListener('herald-defeated', ({ kind, x, y } = {}) => {
      this.camera.trigger('dive', { x, y, radius: HERALD_KINDS[kind]?.radius });
    });
    this.registerEventListener('player-dashed', () => {
      this.impact.kick(KICK_DASH);
      if (!this.reducedMotion) {
        this.camera.pulseZoom(
          CAMERA_ZOOM * DASH_ZOOM_PULSE,
          DASH_ZOOM_PULSE_SECONDS
        );
      }
    });
    // Its ring is an EffectsSystem shockwave: mirrorEffects draws it.
    this.registerEventListener('player-braked', () => {
      if (!this.reducedMotion) {
        this.camera.pulseZoom(
          CAMERA_ZOOM * BRAKE_ZOOM_PULSE,
          BRAKE_ZOOM_PULSE_SECONDS
        );
      }
    });
    this.registerEventListener('weapon-beam-fired', (data) => {
      this.impact.kick(data.kick);
    });
    registerEffectEvents(this);
  }

  /**
   * Logical field (x, y) → screen point through the perspective camera (last
   * rendered pose), for the HUD: the screen spans 800 × 600 whatever its
   * aspect (hud/direction.js restores real proportions). Right after a draw
   * (UISystem.placeOnField) it is that frame's projection. Null before the
   * first frame.
   */
  worldToScreen(x, y, out = { x: 0, y: 0 }) {
    const t = this.three;
    if (!t) return null;
    const v = this.projected || (this.projected = new t.THREE.Vector3());
    v.set(x - HALF_W, 0, y - HALF_H).project(t.camera);
    out.x = ((v.x + 1) / 2) * GAME_WIDTH;
    out.y = ((1 - v.y) / 2) * GAME_HEIGHT;
    return out;
  }

  /**
   * The ship's screen point as this frame draws it (worldToScreen's units):
   * its drawn pose through the camera as posed this frame, so the HUD drawn
   * on the ship (UISystem.placeOnField, after each drawn frame) sits on it
   * whatever the camera does, paused too. Null when no ship is drawn.
   */
  trackShip(player) {
    const t = this.three;
    const at = t.player.group.visible && player?.position;
    // The pose updateCamera set, before the draw would apply it.
    t.camera.updateMatrixWorld();
    this.shipOnScreen = at
      ? this.worldToScreen(at.x, at.y, this.shipPoint)
      : null;
  }

  // The Gravity Brake bends space round the ship out to its reach (the
  // impact pass's lens), harder the more the card slows; `allowed` with the
  // screen pass on.
  aimLens(player, allowed) {
    const brake = this.cachedCombat?.cards?.cardEffects?.gravityBrake;
    const at = this.shipOnScreen;
    if (!allowed || !brake || !at || player?.isDead) {
      this.impact.lens(0.5, 0.5, 0.1, 0.1, 0);
      return;
    }
    const { x, y } = player.position;
    const side = this.worldToScreen(x + brake.radius, y, this.lensSide);
    const ahead = this.worldToScreen(x, y + brake.radius, this.lensAhead);
    this.impact.lens(
      at.x / GAME_WIDTH,
      1 - at.y / GAME_HEIGHT,
      Math.hypot(side.x - at.x, side.y - at.y) / GAME_WIDTH,
      Math.hypot(ahead.x - at.x, ahead.y - at.y) / GAME_HEIGHT,
      lensPull(brake.slowFraction)
    );
  }

  // A Field trench (the Harmonic's, beamForms.js) bends space toward its
  // line out to its reach, at the Gravity Brake's strength: in fast, letting
  // go over its last third; `allowed` with the screen pass on.
  aimTrench(allowed) {
    const trench = this.cachedCombat?.trench;
    if (!allowed || !trench) {
      this.impact.line(0.5, 0.5, 1, 0, 1, 1, 0);
      return;
    }
    const t = this.three;
    const [a, b, side] = this.trenchEnds;
    this.worldToScreen(trench.x, trench.y, a);
    this.worldToScreen(trench.ex, trench.ey, b);
    const length = Math.hypot(trench.ex - trench.x, trench.ey - trench.y) || 1;
    this.worldToScreen(
      trench.x - ((trench.ey - trench.y) / length) * trench.reach,
      trench.y + ((trench.ex - trench.x) / length) * trench.reach,
      side
    );
    const sx = t.width / GAME_WIDTH;
    const sy = t.height / GAME_HEIGHT;
    const dx = (b.x - a.x) * sx;
    const dy = -(b.y - a.y) * sy;
    const k = trench.life / trench.maxLife;
    const strength = Math.min(1, (1 - k) * 8) * Math.min(1, k * 3);
    this.impact.line(
      (a.x + b.x) / 2 / GAME_WIDTH,
      1 - (a.y + b.y) / 2 / GAME_HEIGHT,
      dx,
      dy,
      Math.hypot(dx, dy) / 2,
      Math.hypot((side.x - a.x) * sx, (side.y - a.y) * sy),
      TRENCH_PULL * strength
    );
  }

  /**
   * Runs the intro descent over `durationMs`, then hands back to the follow
   * camera. False when nothing would move (WebGL failed, `?camera=0`,
   * reduced motion): the caller skips the cinematic.
   */
  playIntro(durationMs) {
    return this.startCinematic(introPath, durationMs, false, 'intro');
  }

  /**
   * The journey to sector `to` over `durationMs` (ui/runCinematics.js): the
   * ship flown along the Ring by its own camera, ending on the intro's first
   * pose (playIntro next). False when nothing would move, as playIntro.
   */
  playTravel({ to, durationMs }) {
    if (!this.ready()) return false;
    if (!this.startCinematic(holdIntroStart, 1, true, 'travel')) return false;
    const freeze = this.cameraRig.cinematicFreeze;
    this.travel.start(
      to,
      durationMs,
      this.cachedPlayer,
      freeze?.kind === 'travel' ? freeze.t : null
    );
    return true;
  }

  /**
   * The story before a campaign launch's journey (ui/runCinematics.js),
   * in its own scene. False when nothing would move, as playIntro.
   */
  playStory() {
    if (!this.ready()) return false;
    if (!this.startCinematic(holdIntroStart, 1, true, 'story')) return false;
    const freeze = this.cameraRig.cinematicFreeze;
    if (!this.story.built) this.warmStory();
    this.story.start(freeze?.kind === 'story' ? freeze.t : null);
    return true;
  }

  /** The story goes on from `ms` in (a tap of the skip key). */
  seekStory(ms) {
    this.story?.seek(ms);
  }

  /**
   * The story is over: the field's scene is drawn again. The Wake stays
   * built for the next launch (rebuilding it stalled the start a second).
   */
  endStory() {
    this.story?.stop();
  }

  // Seeded: three names what the story builds and draws with Math.random.
  warmStory() {
    this.seeded(() => this.story.warm(this.three.camera));
  }

  /**
   * The journey is over: the Ring and the field are back, and the run's
   * sector shows its own place already (its first layer may wait for cards).
   */
  endTravel() {
    if (!this.travel?.active) return;
    this.travel.stop();
    const sector = this.cachedEnemies?.waveManager?.sector;
    if (sector) this.biome.enterLayer(sector.layers[0], sector);
  }

  /** The victory pull-back; it holds its last shot until endCinematic(). */
  playEpilogue(durationMs) {
    return this.startCinematic(epiloguePath, durationMs, true, 'epilogue');
  }

  /**
   * Beat `id` of the campaign's ending (ui/runCinematics.js), `durationMs`
   * long, `ending` the one picked in act 2: every beat of both acts drawn
   * by endingScene.js. False when nothing would move, as playIntro.
   */
  playEndingBeat(id, durationMs, ending) {
    const kind = isRevelationBeat(id) ? 'revelation' : 'ending';
    const drawn = this.startCinematic(holdIntroStart, 1, true, kind);
    return drawn && this.ending.start(id, durationMs, ending);
  }

  startCinematic(path, durationMs, hold, kind) {
    if (this.failed || !this.camera.isEnabled() || this.reducedMotion) {
      return false;
    }
    this.cameraRig.startCinematic(path, durationMs, hold, kind);
    return true;
  }

  /**
   * A Warden's entrance: the camera director plays its live shot while it
   * flies in, then a short wide look (only the wide look, a cut, under
   * reduced motion). False when the letterbox should not play (no Warden,
   * WebGL failed, not the dynamic camera, reduced motion): the caller keeps
   * the plain banner.
   */
  playArrival(warden) {
    if (!warden || this.failed || this.camera.mode !== 'dynamic') {
      return false;
    }
    this.camera.trigger('bossArrival');
    return !this.reducedMotion;
  }

  /** Eases from wherever the cinematic is back to the follow camera. */
  endCinematic() {
    this.cameraRig.endCinematic();
  }

  /** Kicks the lens (aberration + radial blur) by `strength` 0..1. */
  kick(strength) {
    this.impact.kick(strength);
  }

  // The graphics settings: postProcessing off skips the composer (no bloom,
  // no SMAA); antialiasing 'None' drops the SMAA pass.
  applyGraphicsPreferences(values = {}) {
    this.graphics.postProcessing = values.postProcessing !== false;
    this.graphics.bloom = values.bloom !== false;
    this.graphics.bloomLevel =
      BLOOM_INTENSITY[values.bloomIntensity] ?? BLOOM_INTENSITY.normal;
    this.graphics.smaa = values.antialiasing !== 'None';
    this.graphics.aberration = values.chromaticAberration !== false;
    if (!this.qualityUrl) this.quality.setMode(values.quality);
    this.camera.setMode(resolveCameraMode(values.cameraMode));
    this.applyBloomStrength();
    this.syncPasses();
  }

  // The bloom strength: the preset's scale times Bloom Intensity (or the
  // `?bloom=<n>` scale when given). biomes.update writes it next frame.
  applyBloomStrength() {
    const t = this.three;
    if (!t) return;
    const level = t.bloomSet ? t.bloomScale : this.graphics.bloomLevel;
    t.biomes.targets.bloomBase =
      BLOOM.strength * level * this.quality.settings.bloomScale;
    t.biomes.applied = null;
  }

  // The current preset (qualityPresets.js) on the live scene. Resolution
  // follows in syncSize, which compares the scale every frame.
  applyQuality() {
    const t = this.three;
    if (!t) return;
    const q = this.quality.settings;
    this.applyBloomStrength();
    t.biomes.targets.fillScale = q.fillScale;
    t.biomes.targets.hemiScale = q.hemiScale;
    setBloomMips(t.bloomPass, q.bloomMips, t.width, t.height);
    t.enemies.setSurfaceMaps(q.surfaceMaps);
    t.player.setSurfaceMaps(q.surfaceMaps);
    this.applyShadows(q.shadows);
    t.debris.limit = q.debrisCap;
    setRimLight(q.rimLight);
    t.decals.setEnabled(q.decals);
    t.space.setLayers(q.spaceLayers);
    t.backdrop.places.setDetail(q.placeDetail);
    this.syncPasses();
  }

  // The key light's shadow map, `size` texels square (0 = off). Toggling it
  // changes the lit programs, so a preset change recompiles them once. A
  // new map is drawn once here, seeded: three names it with a Math.random
  // UUID. Through a whole render(): shadowMap.render alone reads the
  // renderer's per-frame light state, which is null between frames. Into
  // the target the frame draws to, or it compiles a screen-encoded program
  // for every material, mid-play.
  applyShadows(size) {
    const { renderer, key, scene, camera, composer } = this.three;
    const on = size > 0;
    renderer.shadowMap.enabled = on;
    key.castShadow = on;
    if (on && key.shadow.mapSize.x !== size) {
      key.shadow.mapSize.set(size, size);
      key.shadow.map?.dispose();
      key.shadow.map = null;
      renderer.setRenderTarget(
        this.graphics.postProcessing ? composer.readBuffer : null
      );
      this.seeded(() => renderer.render(scene, camera));
      renderer.setRenderTarget(null);
    }
  }

  /** After every simulation step (app.js): captures poses to interpolate. */
  snapshot() {
    if (!this.interp) return;
    this.interp.beginStep();
    this.visitBodies(this.captureBody);
    this.interp.endStep();
  }

  // Every entity drawn at an interpolated pose: visit(pos, angleHolder,
  // angleKey, id), pos holding x/y.
  visitBodies(visit) {
    const enemies = this.cachedEnemies?.getActiveEnemies() || [];
    for (let i = 0; i < enemies.length; i += 1) {
      const e = enemies[i];
      if (e) visit(e, e, 'rotation', e.id);
    }
    const player = this.cachedPlayer;
    if (player?.position) visit(player.position, player, 'angle', null);
    const combat = this.cachedCombat;
    const lists = [
      combat?.bullets,
      combat?.enemyBullets,
      this.cachedPickups?.pickups,
      this.cachedXPOrbs?.xpOrbs,
      this.cachedHealthHearts?.hearts,
    ];
    for (let l = 0; l < lists.length; l += 1) {
      const list = lists[l] || [];
      for (let i = 0; i < list.length; i += 1) {
        const item = list[i];
        if (item) visit(item, null, null, item.id);
      }
    }
  }

  applyPoses(alpha) {
    // alpha 1 is the latest step: the live pose itself
    if (!this.interp || !(alpha < 1)) return;
    this.poseAlpha = alpha;
    this.visitBodies(this.poseBody);
  }

  restorePoses() {
    const p = this.posed;
    for (let i = 0; i < p.length; i += 6) {
      p[i].x = p[i + 1];
      p[i].y = p[i + 2];
      if (p[i + 3]) p[i + 3][p[i + 4]] = p[i + 5];
    }
    p.length = 0;
  }

  // The game's Reduce Motion, or the system's (the camera page's rule).
  applyAccessibilityPreferences(values = {}) {
    this.reducedMotion =
      Boolean(values.reducedMotion) ||
      Boolean(
        globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      );
    this.camera.setReducedMotion(this.reducedMotion);
    this.flashScale = values.reduceFlashing ? 0.3 : 1;
    this.impact.scale = this.flashScale;
  }

  syncPasses() {
    const t = this.three;
    if (!t) return;
    const { bloom, postProcessing, smaa } = this.graphics;
    t.bloomPass.enabled = bloom && postProcessing && t.bloomUrl;
    t.smaaPass.enabled = smaa && postProcessing && this.quality.settings.smaa;
  }

  onReset() {
    this.camera.reset();
    this.cameraRig.reset();
    this.lastRenderTime = null;
    this.shipOnScreen = null;
    this.three?.backdrop.setWake(0);
    this.travel?.stop();
    this.story?.stop();
    this.ending?.stop();
    this.three?.enemies.clear();
    this.three?.bursts.clear();
    this.three?.player.reset();
    this.three?.decals.clear();
    this.three?.blasts.clear();
    this.three?.shield.reset();
    this.impact.strength = 0;
    this.hitSparks.clear();
    this.killPops.clear();
    this.muzzles.clear();
    this.shotWisps.clear();
    this.pickupFx.clear();
    this.wardLinks.clear();
    this.biome.reset();
    this.interp?.clear();
  }

  // --- setup -----------------------------------------------------------------

  setup() {
    this.three = setupThree(this.seeded);
    this.travel = new TravelScene(this.three, (event, payload) =>
      this.eventBus?.emit(event, payload)
    );
    this.story = new StoryScene(this.three, (event, payload) =>
      this.eventBus?.emit(event, payload)
    );
    this.ending = new EndingScene(this.three, this.eventBus);
    this.applyQuality();
  }

  // The WebGL side, built on first use; false once setup has failed.
  ready() {
    if (this.failed) return false;
    if (this.three) return true;
    try {
      this.seeded(() => this.setup());
      return true;
    } catch (error) {
      this.failed = true;
      console.error('[Renderer3D] WebGL setup failed:', error);
      return false;
    }
  }

  // --- warm-up ---------------------------------------------------------------

  /**
   * Loading screen (app.js): builds the scene (maps baked) and compiles every
   * program a run can draw with — each enemy view kind in all its looks and
   * burning, both hulls, the bosses' danger looks, then one frame of everything through the composer
   * (post passes, texture and buffer uploads). One chunk per task, so the
   * bar repaints; `onProgress(done)` after each, 0..1.
   */
  async warmUp(onProgress) {
    const compile = () => this.compileScene();
    const steps = [
      () => this.ready(),
      () => this.three.player.warm(this.cachedPlayer, compile),
      ...VIEW_KINDS.map((kind) => () => this.three.enemies.warm(kind, compile)),
      () => this.three.enemies.kit.warmLooks(compile),
      // The ending's last image: its slip and twin Wake (seeded: three
      // names programs with Math.random).
      () => this.seeded(() => this.ending.warm(compile)),
      () => this.drawEverything(),
      // The story's freighter (seconds): every campaign launch tells it.
      () => this.warmStory(),
    ];
    for (let i = 0; i < steps.length; i += 1) {
      if (!this.failed) steps[i]();
      onProgress((i + 1) / steps.length);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Programs for the scene's materials (pooled views included) as the
  // frame draws them: into the composer's target, or the screen without it.
  // Once per program variant the presets use (shadows on/off, surface maps
  // on/off), the current preset's last: a quality step in a fight then finds
  // its programs built (compiling them there froze a frame 150 ms, seconds
  // on a cold shader cache). Programs keep the uniforms of their last build.
  compileScene() {
    const q = this.quality.settings;
    const variants = new Map();
    Object.values(QUALITY_PRESETS).forEach((p) =>
      variants.set(`${p.shadows > 0}/${p.surfaceMaps}`, p)
    );
    variants.delete(`${q.shadows > 0}/${q.surfaceMaps}`);
    [...variants.values(), q].forEach((p) => {
      this.compileVariant(p.shadows > 0, p.surfaceMaps);
    });
  }

  compileVariant(shadows, surfaceMaps) {
    const t = this.three;
    t.renderer.shadowMap.enabled = shadows;
    t.key.castShadow = shadows;
    t.enemies.setSurfaceMaps(surfaceMaps);
    t.player.setSurfaceMaps(surfaceMaps);
    markShadowCasters(t.player.group, SHIP_MIN_CASTER);
    t.renderer.setRenderTarget(
      this.graphics.postProcessing ? t.composer.readBuffer : null
    );
    t.renderer.compile(t.scene, t.camera);
    t.renderer.setRenderTarget(null);
    t.renderer.compile(t.overlay, t.camera);
  }

  // One frame with every object shown and unculled (lights as they are, so
  // the light count programs are keyed on stays the run's) and every pass on.
  drawEverything() {
    const t = this.three;
    const saved = [];
    t.scene.traverse((object) => {
      if (object.isLight) return;
      saved.push(object, object.visible, object.frustumCulled);
      object.visible = true;
      object.frustumCulled = false;
    });
    t.bloomPass.enabled = true;
    t.smaaPass.enabled = true;
    t.impactPass.enabled = true;
    // Seeded: the shadow pass names its depth material with a Math.random
    // UUID the first time it draws.
    this.seeded(() => t.composer.render(0));
    t.renderer.render(t.overlay, t.camera);
    for (let i = 0; i < saved.length; i += 3) {
      saved[i].visible = saved[i + 1];
      saved[i].frustumCulled = saved[i + 2];
    }
    t.impactPass.enabled = false;
    this.syncPasses();
  }

  // --- frame -----------------------------------------------------------------

  /** `alpha`: the fixed stepper's leftover fraction (1 = latest step). */
  render(alpha = 1) {
    if (!this.ready()) return;
    this.applyPoses(alpha);
    try {
      this.drawFrame();
    } finally {
      this.restorePoses();
    }
  }

  drawFrame() {
    const now = performance.now();
    const dt =
      this.lastRenderTime === null
        ? 0
        : Math.min(0.1, Math.max(0, (now - this.lastRenderTime) / 1000));
    const time = now / 1000;
    this.syncSize();

    const player = this.cachedPlayer;
    const effects = this.cachedEffects;
    const enemyList = this.cachedEnemies?.getActiveEnemies() || [];
    const travel = this.travel?.active ? this.travel : null;
    const story = this.story?.active ? this.story : null;
    this.cameraRig.updateCamera(
      this.three,
      player,
      enemyList,
      effects,
      this.cachedCombat,
      this.cachedXPOrbs,
      dt,
      this.lastRenderTime === null,
      this.reducedMotion
    );
    this.lastRenderTime = now;

    const t = this.three;
    travel?.frame(t.camera, t.height);
    story?.frame(t.camera, time);
    this.ending?.frame(t.camera);
    // The ambient field spawns around the view and muzzle flashes are queued
    // until a draw: both are fed here, once per frame.
    effects?.setAmbientView(this.camera.getView());
    effects?.flushMuzzleFlashQueue();

    t.ribbons.begin();
    t.lances.begin();
    t.glow.begin();
    t.matte.begin();
    t.smoke.begin();
    t.debris.begin();
    t.bodies.begin();

    const warden = t.enemies.update(enemyList, time, dt, this.hitSparks);
    t.veins.update(t.enemies.views);
    if (t.key.castShadow) {
      t.enemies.budgetShadows(t.key.target.position.x, t.key.target.position.z);
    }
    const { focus } = this.cameraRig;
    const fog = t.enemies.updateFog(dt, this.denseFog, focus.x, focus.z);
    this.burnMarks.update(
      dt,
      this.cachedCombat,
      player,
      this.three,
      this.hitSparks
    );
    t.decals.update(dt, t.enemies.views);
    t.blasts.update(dt, t.camera, this.flashScale);
    t.veil.update(dt);
    t.bursts.update(dt);
    t.wardenLight.intensity = warden ? 2.6 : 0;
    if (warden) {
      t.wardenLight.position.copy(warden.object.position).setY(40);
      // A boss view may name its own light (Sovereign: pale gold).
      t.wardenLight.color.copy(warden.light ?? t.wardenLightColor);
    }
    t.player.update(
      player,
      t.ribbons,
      time,
      dt * (effects?.gameTime?.scale ?? 1),
      this.reducedMotion
    );
    if (story) {
      story.poseShip(t.player, player?.getHullVisualLevels().thruster, time);
      this.shipOnScreen = null;
    } else if (travel) {
      travel.poseShip(t.player, player?.getHullVisualLevels().thruster, time);
      this.shipOnScreen = null;
    } else {
      this.trackShip(this.ending?.active ? null : player);
    }
    this.mirrorShield(player, time);
    // a breaking ship casts none: the depth pass draws it whole
    if (!t.player.breaking) markShadowCasters(t.player.group, SHIP_MIN_CASTER);
    t.flashes.update(dt);
    mirrorProjectiles(t, this.cachedCombat);
    mirrorPickups(
      t,
      time,
      this.cachedXPOrbs,
      this.cachedHealthHearts,
      this.cachedPickups
    );
    mirrorEffects(t, effects, this.impact);
    // Hit Markers (Settings): the molten slag off struck metal
    this.hitSparks.slagOn = effects?.hitMarkersEnabled !== false;
    this.hitSparks.update(dt, t.ribbons, t.shotRgb, t.textRgb, t.smoke, t.glow);
    this.killPops.update(dt, t.glow, this.flashScale);
    this.formationMarks.update(
      this.cachedEnemies?.waveManager?.layerElapsed ?? 0,
      t.ribbons,
      t.threatRgb
    );
    this.wardLinks.update(dt, t, enemyList, this.flashScale);
    if (this.muzzles.update(t.glow, t.ribbons, t.shotRgb, t.textRgb) > 0) {
      t.player.flashMuzzle();
    }
    this.shotWisps.update(dt, t.ribbons);
    this.pickupFx.update(dt, t, player, this.flashScale, this.reducedMotion);
    mirrorOverlays(
      t,
      player,
      effects,
      this.cachedXPOrbs,
      this.cachedCombat,
      this.flashScale
    );

    // The journey's points are sized for its lens until it rises into the
    // intro's pose, which is the play lens.
    const lens = story
      ? SCENE_FOV
      : travel
        ? SCENE_FOV + (FOV - SCENE_FOV) * travel.risen
        : t.camera.fov;
    const pointScale = t.height / (2 * Math.tan((lens * Math.PI) / 360));
    this.biome.update(dt);
    t.biomes.update(travel?.look ?? this.ending?.look ?? this.biome, fog);
    const ship = t.player.group.visible && (travel?.focus || player?.position);
    const view = travel?.focus || this.camera;
    t.space.update(view.x, view.y, dt, {
      ship: ship || null,
      shipLight: t.player.light.intensity,
      pointScale,
      pixel: t.height / STAR_FRAME_HEIGHT,
    });
    t.ribbons.end();
    t.lances.end();
    t.glow.end(pointScale);
    t.matte.end(pointScale);
    t.smoke.end(pointScale);
    t.debris.end();
    t.bodies.end();
    this.aimLens(
      player,
      this.graphics.postProcessing && this.quality.settings.impactPass
    );
    this.aimTrench(
      this.graphics.postProcessing && this.quality.settings.impactPass
    );
    this.impact.apply(
      t.impactPass,
      t.width,
      t.height,
      this.impact.update(
        dt,
        this.graphics.postProcessing &&
          !this.reducedMotion &&
          this.quality.settings.impactPass,
        this.graphics.aberration
      ),
      this.graphics.postProcessing && this.quality.settings.filmGrain
    );

    t.renderer.info.reset();
    // The story draws its own scene in the field's place (the ending's
    // black, an empty one).
    const drawn = story ? story.scene : this.ending?.scene ?? t.scene;
    t.composer.passes[0].scene = drawn;
    this.ending?.pose(time);
    if (this.graphics.postProcessing) t.composer.render(dt);
    else t.renderer.render(drawn, t.camera);
    this.ending?.showField();
    t.renderer.autoClear = false;
    t.renderer.render(t.overlay, t.camera);
    t.renderer.autoClear = true;
    this.recordStats();
  }

  // The canvas stays at native size; the composer draws at the preset's
  // pixel-ratio cap and its last pass scales up. t.width/height are the
  // composer's pixels (point sizes, impact pass).
  syncSize() {
    const t = this.three;
    const width = Math.max(1, t.canvas.width);
    const height = Math.max(1, t.canvas.height);
    const scale = Math.min(
      1,
      this.quality.settings.pixelRatio / (getViewport().dpr || 1)
    );
    if (
      width === t.canvasWidth &&
      height === t.canvasHeight &&
      scale === t.scale
    ) {
      return;
    }
    t.canvasWidth = width;
    t.canvasHeight = height;
    t.scale = scale;
    t.width = Math.max(1, Math.round(width * scale));
    t.height = Math.max(1, Math.round(height * scale));
    t.renderer.setSize(width, height, false);
    t.composer.setSize(t.width, t.height);
    t.camera.aspect = width / height;
    t.camera.updateProjectionMatrix();
    // The logical camera frames the field for this screen (getView, clamp).
    this.camera.setAspect(t.camera.aspect);
  }

  // The follow point kept inside the field (cameraRig.js).
  clampToField(distance, aspect) {
    return this.cameraRig.clampToField(distance, aspect);
  }

  // The field's particles, shockwaves and screen flash (fieldMirrors.js).

  mirrorEffects(effects) {
    mirrorEffects(this.three, effects, this.impact);
  }

  // The hex dome (shieldMirror.js) is sized from the hull mirror.
  mirrorShield(player, time) {
    const { shield, player: ship } = this.three;
    const state = player?.getShieldState();
    const alive = ship.group.visible && player?.position;
    shield.setFlicker(this.flashScale === 1);
    shield.update(
      time,
      Boolean(alive && state?.isActive),
      state?.maxHits > 0 ? state.currentHits / state.maxHits : 1,
      alive ? player.position.x - HALF_W : 0,
      alive ? player.position.y - HALF_H : 0,
      alive ? ship.shieldRadius : 0
    );
  }

  // The hull was struck (17/11, efeito/impacto): on the side the blow came
  // from it throws sparks and molten slag, a rock that rammed it adds chips
  // and dust, and the plate there glows white-hot and cools to a dark scar.
  strikeHull(payload) {
    const t = this.three;
    const pos = this.cachedPlayer?.position;
    if (!t || !pos || !t.player.group.visible) return;
    const from = payload.damageSource;
    let dx = from ? from.x - pos.x : 0;
    let dy = from ? from.y - pos.y : 0;
    if (Math.hypot(dx, dy) < 1e-3) {
      const threat = this.threatDirection();
      dx = threat.x;
      dy = threat.y;
    }
    const len = Math.hypot(dx, dy);
    if (len < 1e-3) return;
    const reach = t.player.shieldRadius / 1.7;
    const x = pos.x + (dx / len) * reach * 0.8;
    const y = pos.y + (dy / len) * reach * 0.8;
    this.hitSparks.emit(x, y, dx, dy, -dx, -dy, true, SPARK_KIND.metal);
    if (payload.cause === 'collision') {
      this.hitSparks.emit(x, y, dx, dy, -dx, -dy, false, SPARK_KIND.rock);
    }
    const view = this.shipView || (this.shipView = { id: SHIP_DECAL_ID });
    view.object = t.player.group;
    view.reach = reach;
    t.decals.hit(view, dx, dy, DECAL_KIND.metal);
  }

  // Logical direction from the ship to the nearest threat (enemy shot or
  // enemy): where a shield hit most likely came from.
  threatDirection() {
    const out = this.threatDir || (this.threatDir = { x: 1, y: 0 });
    const pos = this.cachedPlayer?.position;
    if (!pos) return out;
    let best = Infinity;
    const scan = (list) => {
      for (let i = 0; i < list.length; i += 1) {
        const e = list[i];
        if (!e || e.destroyed) continue;
        const dx = e.x - pos.x;
        const dy = e.y - pos.y;
        const d = dx * dx + dy * dy - (e.radius || 0) ** 2;
        if (d < best) {
          best = d;
          out.x = dx;
          out.y = dy;
        }
      }
    };
    scan(this.cachedCombat?.enemyBullets || []);
    scan(this.cachedEnemies?.getActiveEnemies() || []);
    return out;
  }

  // The lock marks (overlayMirror.js).
  mirrorLocks() {
    mirrorLocks(this.three, this.cachedCombat);
  }

  // The boss-transition border and wash (overlayMirror.js).
  mirrorBossTransitions(list) {
    mirrorBossTransitions(this.three, list, this.flashScale);
  }

  recordStats() {
    const t = this.three;
    this.stats.drawCalls = t.renderer.info.render.calls;
    this.stats.triangles = t.renderer.info.render.triangles;
    this.stats.frames += 1;
    if (IS_DEV && this.stats.frames % 30 === 0) {
      t.canvas.dataset.drawCalls = String(this.stats.drawCalls);
    }
  }
}

export default Renderer3D;
