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
import { IS_DEV } from '../../core/env.js';
import {
  StepInterpolator,
  interpolationDisabledByUrl,
} from '../../core/interpolation.js';
import { AutoQuality, qualityFromUrl } from '../../core/qualityPresets.js';
import { getViewport } from '../../core/viewport.js';
import { BiomeTransition } from '../../data/biomes.js';
import { resolveService } from '../../core/serviceUtils.js';
import { PALETTE } from '../../data/constants/palette.js';
import { HALF_H, HALF_W } from './batches.js';
import { CameraRig } from './cameraRig.js';
import { VIEW_KINDS, markShadowCasters } from './enemyMirror.js';
import {
  mirrorEffects,
  mirrorPickups,
  mirrorProjectiles,
} from './fieldMirrors.js';
import { HitSparks, MuzzleFlashes } from './hitSparks.js';
import { ImpactKick } from './impactPass.js';
import {
  mirrorBossTransitions,
  mirrorLocks,
  mirrorOverlays,
} from './overlayMirror.js';
import { setRimLight } from './rimLight.js';
import { BLOOM, FOV, setupThree } from './sceneSetup.js';

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
    this.three = null;
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
    this.hitSparks = new HitSparks();
    this.muzzles = new MuzzleFlashes();
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

    // SettingsSystem emits 'settings-graphics-changed' only at startup; live
    // edits arrive as 'settings-changed' with the category.
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
        (change.category === 'graphics' || change.type === 'reset-all')
      ) {
        this.applyGraphicsPreferences(settings.getCategoryValues('graphics'));
      }
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
      this.biome.enterLayer(payload.wave);
      this.camera.trigger('waveStart');
    });
    // What opens the camera director's wide view (core/cameraDirector.js).
    this.registerEventListener('wave-complete', () => {
      this.camera.trigger('cleared');
    });
    this.registerEventListener('elite-spawned', (payload) => {
      this.camera.trigger('elite', payload);
    });
    this.registerEventListener('boss-telegraph', () => {
      this.camera.trigger('telegraph');
    });
    // A boss falling mid-run: a short push from above.
    this.registerEventListener('boss-defeated', () => {
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
    this.registerEventListener('player-took-damage', () => {
      this.impact.kick(KICK_PLAYER_HIT);
    });
    this.registerEventListener('boss-phase-changed', () => {
      this.impact.kick(KICK_BOSS_PHASE);
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
    // Flak shrapnel: a spark cone along the bolt's flight.
    this.registerEventListener('flak-burst', (data) => {
      const { position, angle } = data || {};
      if (!position) return;
      const dx = Math.cos(angle || 0);
      const dy = Math.sin(angle || 0);
      this.hitSparks.emit(position.x, position.y, dx, dy, dx, dy, false);
    });
    // a split asteroid lives on as its fragments: only real deaths burn
    this.registerEventListener('enemy-destroyed', (data) => {
      if (data?.enemy && !data.fragments?.length) {
        this.three?.enemies.markDead(data.enemy);
      }
    });
    this.registerEventListener('bullet-hit', (data) => {
      const { position, enemy, bullet } = data || {};
      if (!position || data.blocked) return;
      this.hitSparks.emit(
        position.x,
        position.y,
        enemy ? position.x - enemy.x : 0,
        enemy ? position.y - enemy.y : 0,
        bullet?.vx || 0,
        bullet?.vy || 0,
        Boolean(data.killed)
      );
      // a rock that survives the hit keeps a scorch mark
      if (enemy?.type === 'asteroid' && bullet && !data.killed) {
        const view = this.three?.enemies.views.get(enemy.id || enemy);
        if (view) {
          this.three.decals.hit(
            view,
            position.x - enemy.x,
            position.y - enemy.y
          );
        }
      }
    });
    this.registerEventListener('bullet-created', (data) => {
      const { from, bullet } = data || {};
      if (!from || !bullet) return;
      const speed = Math.hypot(bullet.vx || 0, bullet.vy || 0);
      if (speed <= 0) return;
      this.muzzles.emit(from.x, from.y, bullet.vx / speed, bullet.vy / speed);
    });
  }

  /**
   * Logical field (x, y) → screen point through the perspective camera (last
   * rendered pose), for the HUD: the screen spans 800 × 600 whatever its
   * aspect (hud/direction.js restores real proportions). Null before the
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
   * Runs the intro descent over `durationMs`, then hands back to the follow
   * camera. False when nothing would move (WebGL failed, `?camera=0`,
   * reduced motion): the caller skips the cinematic.
   */
  playIntro(durationMs) {
    return this.startCinematic(introPath, durationMs, false, 'intro');
  }

  /** The victory pull-back; it holds its last shot until endCinematic(). */
  playEpilogue(durationMs) {
    return this.startCinematic(epiloguePath, durationMs, true, 'epilogue');
  }

  startCinematic(path, durationMs, hold, kind) {
    if (this.failed || !this.camera.isEnabled() || this.reducedMotion) {
      return false;
    }
    this.cameraRig.startCinematic(path, durationMs, hold, kind);
    return true;
  }

  /**
   * The Warden's arrival: the camera director opens its wide view on the
   * whole field (a cut under reduced motion). False when the letterbox
   * should not play (no Warden, WebGL failed, not the dynamic camera,
   * reduced motion): the caller keeps the plain banner.
   */
  playArrival(warden) {
    if (!warden || this.failed || this.camera.mode !== 'dynamic') {
      return false;
    }
    this.camera.trigger('bossArrival', warden);
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
    this.syncPasses();
  }

  // The key light's shadow map, `size` texels square (0 = off). Toggling it
  // changes the lit programs, so a preset change recompiles them once. A
  // new map is drawn once here, seeded: three names it with a Math.random
  // UUID. Through a whole render(): shadowMap.render alone reads the
  // renderer's per-frame light state, which is null between frames.
  applyShadows(size) {
    const { renderer, key, scene, camera } = this.three;
    const on = size > 0;
    renderer.shadowMap.enabled = on;
    key.castShadow = on;
    if (on && key.shadow.mapSize.x !== size) {
      key.shadow.mapSize.set(size, size);
      key.shadow.map?.dispose();
      key.shadow.map = null;
      this.seeded(() => renderer.render(scene, camera));
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
    this.three?.backdrop.setWake(0);
    this.three?.enemies.clear();
    this.three?.bursts.clear();
    this.three?.player.reset();
    this.three?.decals.clear();
    this.three?.shield.reset();
    this.impact.strength = 0;
    this.hitSparks.clear();
    this.muzzles.clear();
    this.biome.reset();
    this.interp?.clear();
  }

  // --- setup -----------------------------------------------------------------

  setup() {
    this.three = setupThree(this.seeded);
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
   * burning, both hulls, then one frame of everything through the composer
   * (post passes, texture and buffer uploads). One chunk per task, so the
   * bar repaints; `onProgress(done)` after each, 0..1.
   */
  async warmUp(onProgress) {
    const compile = () => this.compileScene();
    const steps = [
      () => this.ready(),
      () => this.three.player.warm(this.cachedPlayer, compile),
      ...VIEW_KINDS.map((kind) => () => this.three.enemies.warm(kind, compile)),
      () => this.drawEverything(),
    ];
    for (let i = 0; i < steps.length; i += 1) {
      if (!this.failed) steps[i]();
      onProgress((i + 1) / steps.length);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Programs for the scene's materials (pooled views included) as the
  // frame draws them: into the composer's target, or the screen without it.
  compileScene() {
    const t = this.three;
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
    // a damage number: the sprite program takes its map
    t.texts.begin();
    t.texts.push('0', 0, 0, 10, PALETTE.text, 1);
    t.texts.end();
    t.bloomPass.enabled = true;
    t.smaaPass.enabled = true;
    t.impactPass.enabled = true;
    // Seeded: the shadow pass names its depth material with a Math.random
    // UUID the first time it draws.
    this.seeded(() => t.composer.render(0));
    t.renderer.render(t.overlay, t.camera);
    t.texts.begin();
    t.texts.end();
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
    // The ambient field spawns around the view and muzzle flashes are queued
    // until a draw: both are fed here, once per frame.
    effects?.setAmbientView(this.camera.getView());
    effects?.flushMuzzleFlashQueue();

    t.ribbons.begin();
    t.lances.begin();
    t.glow.begin();
    t.matte.begin();
    t.smoke.begin();
    t.texts.begin();
    t.debris.begin();

    const warden = t.enemies.update(enemyList, time, dt);
    if (t.key.castShadow) {
      t.enemies.budgetShadows(t.key.target.position.x, t.key.target.position.z);
    }
    const { focus } = this.cameraRig;
    const fog = t.enemies.updateFog(dt, this.denseFog, focus.x, focus.z);
    t.decals.update(dt, t.enemies.views);
    t.bursts.update(dt);
    t.wardenLight.intensity = warden ? 2.6 : 0;
    if (warden) t.wardenLight.position.copy(warden.object.position).setY(40);
    t.player.update(player, t.ribbons, time);
    this.mirrorShield(player, time);
    markShadowCasters(t.player.group, SHIP_MIN_CASTER);
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
    this.hitSparks.update(dt, t.ribbons, t.shotRgb, t.textRgb);
    if (this.muzzles.update(t.glow, t.ribbons, t.shotRgb, t.textRgb) > 0) {
      t.player.flashMuzzle();
    }
    mirrorOverlays(
      t,
      player,
      effects,
      this.cachedXPOrbs,
      this.cachedCombat,
      this.flashScale
    );

    const pointScale = t.height / (2 * Math.tan((FOV * Math.PI) / 360));
    this.biome.update(dt);
    t.biomes.update(this.biome, fog);
    const ship = t.player.group.visible && player?.position;
    t.space.update(this.camera.x, this.camera.y, dt, {
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
    t.texts.end();
    t.debris.end();
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
    if (this.graphics.postProcessing) t.composer.render(dt);
    else t.renderer.render(t.scene, t.camera);
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
    shield.update(
      time,
      Boolean(alive && state?.isActive),
      state?.maxHits > 0 ? state.currentHits / state.maxHits : 1,
      alive ? player.position.x - HALF_W : 0,
      alive ? player.position.y - HALF_H : 0,
      alive ? ship.shieldRadius : 0
    );
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
  mirrorLocks(player) {
    mirrorLocks(this.three, this.cachedCombat, player);
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
