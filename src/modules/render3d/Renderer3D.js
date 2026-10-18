// Gameplay renderer in Three.js (docs/NORTE.md §4b): a top-down scene tilted
// 18°, real key + fill lights, UnrealBloom on emissives only, SMAA. The
// simulation stays 2D: every frame the mirrors copy entity state from the
// systems into pooled meshes. Registered as 'renderer' instead of
// RenderingSystem unless `?renderer=2d` (see rendererMode.js).
//
// World mapping: logical (x, y) on the 800×600 field → world (x − 400, 0,
// y − 300) on the XZ plane, y up, 1 logical unit = 1 world unit.
// The constructor touches no THREE (Node tests build the manifest); the
// WebGL side is created on the first render().

import { BaseSystem } from '../../core/BaseSystem.js';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  XP_ORB_SIZE,
} from '../../core/GameConstants.js';
import {
  CAMERA_ZOOM,
  createCamera,
  createCameraScene,
  dampTo,
  readCameraScene,
  resolveCameraMode,
} from '../../core/camera.js';
import {
  blendPose,
  cinematicFreezeFromUrl,
  epiloguePath,
  followPose,
  introPath,
} from '../../core/cinematics.js';
import { IS_DEV } from '../../core/env.js';
import {
  StepInterpolator,
  interpolationDisabledByUrl,
} from '../../core/interpolation.js';
import { AutoQuality, qualityFromUrl } from '../../core/qualityPresets.js';
import { getViewport } from '../../core/viewport.js';
import { BiomeTransition } from '../../data/biomes.js';
import { resolveService } from '../../core/serviceUtils.js';
import {
  KEY_LIGHT_DIR,
  PALETTE,
  withAlpha,
} from '../../data/constants/palette.js';
import { SHIP_MAX_SPEED } from '../../data/constants/physics.js';
import {
  CapsuleBatch,
  HALF_H,
  HALF_W,
  PointBatch,
  RibbonBatch,
  colorOf,
  rgbOf,
} from './batches.js';
import { BiomeController } from './biomes3d.js';
import { DebrisChunks } from './debrisChunks.js';
import { DeathBursts } from './dissolve.js';
import { EnemyMirror, VIEW_KINDS, markShadowCasters } from './enemyMirror.js';
import { FieldBackdrop } from './fieldBackdrop.js';
import { FlashLights } from './flashLights.js';
import { HitSparks, MuzzleFlashes } from './hitSparks.js';
import { ImpactKick, createImpactPass } from './impactPass.js';
import { PickupMirror } from './pickupMirror.js';
import { PlayerMirror } from './playerMirror.js';
import { setRimLight } from './rimLight.js';
import { ScorchDecals } from './scorchDecals.js';
import { ShieldMirror } from './shieldMirror.js';
import { SpaceField } from './spaceField.js';
import { TextSprites } from './textSprites.js';
import {
  mirrorWeaponEffects,
  pushFlakBolt,
  pushLance,
} from './weaponMirror.js';
import { WEAPONS } from '../../data/weapons.js';

const FOV = 38;
const TILT = (18 * Math.PI) / 180;
const KEY_ELEVATION = (40 * Math.PI) / 180;
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
const BLOOM = { strength: 0.9, radius: 0.6, threshold: 0.75 };
// proposta 18/10: Settings > Bloom Intensity scales the preset's strength
// (Bloom off is the toggle, which drops the pass).
const BLOOM_INTENSITY = { low: 0.6, normal: 1, high: 1.4 };
// proposta 17/10: ACES on lit surfaces, sRGB on the way out (emissives are
// toneMapped:false, so they stay hot enough to bloom).
const EXPOSURE = 1;
const WARDEN_LIGHT_DISTANCE = 420;
const MAX_SHOCKWAVES = 25;
const MAX_TRAIL_POINTS = 64;
const MAX_DAMAGE_TEXTS = 16;
const OVERLAY_H = 9;
const WHITE = [1, 1, 1];
// proposta 17/10: what kicks the impact pass (strength 0..1). Shockwaves
// kick only from KICK_WAVE_RADIUS up, full at KICK_WAVE_FULL.
const KICK_PLAYER_HIT = 1;
const KICK_BOSS_PHASE = 1;
const KICK_DASH = 0.45;
const KICK_WAVE_RADIUS = 90;
const KICK_WAVE_FULL = 200;
const KICK_WAVE_MIN = 0.25;
const KICK_WAVE_MAX = 0.8;
// proposta 18/10: the dash opens the shot for a beat (zoom × DASH_ZOOM_PULSE)
// and the emergency brake leans in (× BRAKE_ZOOM_PULSE), each over its
// seconds; none with reduced motion, like the slow-motion pulses.
const DASH_ZOOM_PULSE = 0.94;
const DASH_ZOOM_PULSE_SECONDS = 0.3;
const BRAKE_ZOOM_PULSE = 1.04;
const BRAKE_ZOOM_PULSE_SECONDS = 0.25;
// proposta 18/10: the key light's shadow box follows the camera target: the
// light sits KEY_SHADOW.distance away along its direction, the box spans the
// shot (`span` × the camera range, clamped) and the biases keep rocks from
// shadowing themselves in stripes.
const KEY_SHADOW = {
  distance: 1000,
  depth: 500,
  span: 0.62,
  min: 380,
  max: 1400,
  bias: -0.0006,
  normalBias: 0.6,
};
// The ship's hull panels cast; its turret, nozzles and canopy (radius under
// this, world units) only receive.
const SHIP_MIN_CASTER = 5;
// Point sizes of the star layers are authored for a frame this tall.
const STAR_FRAME_HEIGHT = 900;

// Last linear → sRGB step of the composer (the passes work in linear; the
// renderer's outputEncoding only applies when drawing to the screen).
const OUTPUT_SHADER = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
  fragmentShader: `
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() {
  gl_FragColor = LinearTosRGB(texture2D(tDiffuse, vUv));
}`,
};

const SHOCKWAVE_VERTEX = `
varying vec2 vPos;
void main() {
  vPos = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// A sharp ring of uWidth world units plus a soft halo, premultiplied color.
const SHOCKWAVE_FRAGMENT = `
uniform float uRadius;
uniform float uWidth;
uniform float uExtent;
uniform vec3 uColor;
varying vec2 vPos;
void main() {
  float d = abs(length(vPos) * uExtent - uRadius);
  float core = 1.0 - smoothstep(uWidth * 0.5, uWidth * 0.5 + 1.0, d);
  float halo = (1.0 - smoothstep(0.0, uWidth * 3.0, d)) * 0.3;
  gl_FragColor = vec4(uColor * (core + halo), 1.0);
}`;

// `?bloom=0` turns the pass off; `?bloom=<n>` (0..3) scales its strength and
// replaces the Bloom Intensity setting (`set`) — the same flag the 2D
// bloomLayer reads.
function bloomFromUrl() {
  const unset = { enabled: true, scale: 1, set: false };
  try {
    const raw = new URLSearchParams(window.location.search).get('bloom');
    if (raw === null) return unset;
    const value = Number(raw);
    if (!Number.isFinite(value)) return unset;
    return {
      enabled: value > 0,
      scale: Math.min(3, Math.max(0, value)),
      set: true,
    };
  } catch {
    return unset;
  }
}

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

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

class Renderer3D extends BaseSystem {
  constructor(dependencies = {}) {
    super(dependencies, {
      systemName: 'Renderer3D',
      serviceName: 'renderer',
    });

    this.camera = createCamera();
    this.camera.setMode(resolveCameraMode());
    this.cameraScene = createCameraScene();
    this.roll = { value: 0, velocity: 0 };
    this.lastRenderTime = null;
    this.dolly = 1;
    // The run's intro/epilogue camera (core/cinematics.js), on render time.
    this.cinematic = null;
    this.cinePose = followPose();
    this.cinematicFreeze = IS_DEV ? cinematicFreezeFromUrl() : null;
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
    // with distance from the camera target (world x, z; updateCamera).
    this.denseFog = false;
    this.focus = { x: 0, z: 0 };
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
    }
    this.registerEventListener('settings-graphics-changed', (payload = {}) => {
      if (payload?.values) this.applyGraphicsPreferences(payload.values);
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
    this.registerEventListener('weapon-beam-fired', () => {
      this.impact.kick(WEAPONS.harmonic.beam.kick);
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
   * Logical field (x, y) → 800×600 screen point through the perspective
   * camera (last rendered pose), for the HUD. Null before the first frame.
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
    const freeze = this.cinematicFreeze;
    this.cinematic = {
      path,
      startedAt: performance.now(),
      durationMs,
      hold,
      frozenAt: freeze?.kind === kind ? freeze.t : null,
    };
    return true;
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

  /** Kicks the lens (aberration + radial blur) by `strength` 0..1. */
  kick(strength) {
    this.impact.kick(strength);
  }

  // The same flags RenderingSystem reads: postProcessing off skips the
  // composer (no bloom, no SMAA); antialiasing 'None' drops the SMAA pass.
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

  applyAccessibilityPreferences(values = {}) {
    this.reducedMotion = Boolean(values.reducedMotion);
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
    this.roll.value = 0;
    this.roll.velocity = 0;
    this.lastRenderTime = null;
    this.dolly = 1;
    this.cinematic = null;
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
    const THREE = window.THREE;
    const canvas = document.getElementById('game-canvas');
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(1);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = EXPOSURE;
    renderer.setClearColor(colorOf(THREE, PALETTE.background), 1);
    renderer.info.autoReset = false;

    const scene = new THREE.Scene();
    // Far enough for the nebula from the cinematics' high shots.
    const camera = new THREE.PerspectiveCamera(FOV, 4 / 3, 10, 9000);

    // Key: warm white from upper-left (KEY_LIGHT_DIR), fixed in direction;
    // on high/ultra it casts shadows between the 3D objects (applyShadows),
    // its target following the camera (updateCamera). The fill and the
    // environment keep the unlit sides readable.
    const key = new THREE.DirectionalLight(colorOf(THREE, '#fff1e2'), 1.6);
    const keyDir = new THREE.Vector3(
      KEY_LIGHT_DIR.x * Math.cos(KEY_ELEVATION),
      Math.sin(KEY_ELEVATION),
      KEY_LIGHT_DIR.y * Math.cos(KEY_ELEVATION)
    );
    key.position.copy(keyDir).multiplyScalar(KEY_SHADOW.distance);
    key.shadow.bias = KEY_SHADOW.bias;
    key.shadow.normalBias = KEY_SHADOW.normalBias;
    key.shadow.camera.near = KEY_SHADOW.distance - KEY_SHADOW.depth;
    key.shadow.camera.far = KEY_SHADOW.distance + KEY_SHADOW.depth;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Fill: cool, from below-right; hemisphere keeps shadows from going void.
    const fill = new THREE.DirectionalLight(
      colorOf(THREE, PALETTE.neutral),
      0.35
    );
    fill.position.set(0.7, 0.3, 0.65);
    const hemi = new THREE.HemisphereLight(
      colorOf(THREE, '#2a3346'),
      colorOf(THREE, '#050608'),
      0.3
    );
    const wardenLight = new THREE.PointLight(
      colorOf(THREE, PALETTE.boss),
      0,
      WARDEN_LIGHT_DISTANCE,
      2
    );
    scene.add(key, key.target, fill, hemi, wardenLight);
    scene.environment = this.buildEnvironment(THREE, renderer);

    const width = Math.max(1, canvas.width);
    const height = Math.max(1, canvas.height);
    const target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    });
    const composer = new THREE.EffectComposer(renderer, target);
    composer.addPass(new THREE.RenderPass(scene, camera));
    const bloomUrl = bloomFromUrl();
    const bloomPass = new THREE.UnrealBloomPass(
      new THREE.Vector2(width, height),
      BLOOM.strength * bloomUrl.scale,
      BLOOM.radius,
      BLOOM.threshold
    );
    // The bloom chain defaults to 8-bit targets: in linear, its faint tail
    // quantizes into steps that the sRGB encode turns into visible blocks.
    [
      bloomPass.renderTargetBright,
      ...bloomPass.renderTargetsHorizontal,
      ...bloomPass.renderTargetsVertical,
    ].forEach((rt) => {
      rt.texture.type = THREE.HalfFloatType;
    });
    bloomPass.blackMip = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    bloomPass.blackMip.needsUpdate = true;
    composer.addPass(bloomPass);
    const impactPass = createImpactPass(THREE);
    composer.addPass(impactPass);
    composer.addPass(new THREE.ShaderPass(OUTPUT_SHADER));
    const smaaPass = new THREE.SMAAPass(width, height);
    composer.addPass(smaaPass);

    // Drawn after the composer: text stays crisp, never bloomed.
    const overlay = new THREE.Scene();
    const texts = new TextSprites(
      THREE,
      overlay,
      this.seeded,
      MAX_DAMAGE_TEXTS
    );

    const backdrop = new FieldBackdrop(THREE, scene);
    const space = new SpaceField(THREE, scene);
    const biomes = new BiomeController(THREE, {
      key,
      fill,
      hemi,
      hemiBase: hemi.intensity,
      bloomPass,
      bloomBase: BLOOM.strength * bloomUrl.scale,
      backdrop,
      space,
    });
    const flashes = new FlashLights(THREE, scene);
    const debris = new DebrisChunks(THREE, scene);
    const bursts = new DeathBursts(debris, flashes);
    const enemies = new EnemyMirror(THREE, scene, this.seeded, bursts);
    const player = new PlayerMirror(THREE, scene, this.seeded);
    const pickups = new PickupMirror(THREE, scene);
    const decals = new ScorchDecals(THREE, scene);
    const shield = new ShieldMirror(
      THREE,
      scene,
      rgbOf(THREE, PALETTE.player).map((c) => c * 1.4)
    );

    const ribbons = new RibbonBatch(THREE, 4000);
    const lances = new CapsuleBatch(THREE, 240);
    const glow = new PointBatch(THREE, 900);
    const matte = new PointBatch(THREE, 500, { shape: 'disc' });
    const smoke = new PointBatch(THREE, 300, { shape: 'puff' });
    scene.add(
      ribbons.object,
      lances.mesh,
      glow.object,
      matte.object,
      smoke.object
    );

    // Shockwaves: a flat quad whose shader draws a ring of constant width
    // in world units at any radius (a scaled RingGeometry would thicken).
    const quad = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const shockwaves = [];
    for (let i = 0; i < MAX_SHOCKWAVES; i += 1) {
      const mesh = new THREE.Mesh(
        quad,
        new THREE.ShaderMaterial({
          uniforms: {
            uRadius: { value: 1 },
            uWidth: { value: 1 },
            uExtent: { value: 1 },
            uColor: { value: new THREE.Color() },
          },
          vertexShader: SHOCKWAVE_VERTEX,
          fragmentShader: SHOCKWAVE_FRAGMENT,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      mesh.visible = false;
      scene.add(mesh);
      shockwaves.push(mesh);
    }

    // Red damage flash stays in the DOM, over the canvas.
    const flash = document.createElement('div');
    flash.style.cssText =
      'position:absolute;inset:0;pointer-events:none;opacity:0;z-index:6;border-radius:inherit;';
    canvas.after(flash);
    // Boss phase transitions: tinted border + wash, like drawBossTransitions.
    const bossFlash = flash.cloneNode();
    canvas.after(bossFlash);

    this.three = {
      THREE,
      canvas,
      renderer,
      scene,
      camera,
      composer,
      bloomPass,
      impactPass,
      smaaPass,
      bloomUrl: bloomUrl.enabled,
      bloomScale: bloomUrl.scale,
      bloomSet: bloomUrl.set,
      overlay,
      texts,
      bossFlash,
      bossFlashKey: '',
      key,
      keyDir,
      wardenLight,
      backdrop,
      space,
      biomes,
      flashes,
      enemies,
      player,
      pickups,
      decals,
      shield,
      ribbons,
      lances,
      glow,
      matte,
      smoke,
      debris,
      bursts,
      shockwaves,
      flash,
      flashAlpha: 0,
      width: 0,
      height: 0,
      canvasWidth: 0,
      canvasHeight: 0,
      scale: 1,
      shotRgb: rgbOf(THREE, PALETTE.shot),
      threatRgb: rgbOf(THREE, PALETTE.threat),
      xpRgb: rgbOf(THREE, PALETTE.xp),
      statusRgb: rgbOf(THREE, PALETTE.status),
      accentRgb: rgbOf(THREE, PALETTE.player),
      textRgb: rgbOf(THREE, PALETTE.text),
    };
    this.applyQuality();
  }

  // A dim reflection environment so metal reads as metal: black below, a
  // cool sky, one warm patch where the key light is.
  buildEnvironment(THREE, renderer) {
    const sky = new THREE.SphereGeometry(100, 32, 16);
    const position = sky.getAttribute('position');
    const colors = new Float32Array(position.count * 3);
    const keyDir = new THREE.Vector3(
      KEY_LIGHT_DIR.x * Math.cos(KEY_ELEVATION),
      Math.sin(KEY_ELEVATION),
      KEY_LIGHT_DIR.y * Math.cos(KEY_ELEVATION)
    );
    const dir = new THREE.Vector3();
    for (let i = 0; i < position.count; i += 1) {
      dir.fromBufferAttribute(position, i).normalize();
      const up = Math.max(0, dir.y);
      const warm = Math.pow(Math.max(0, dir.dot(keyDir)), 24);
      colors[i * 3] = 0.03 * up + 0.3 * warm;
      colors[i * 3 + 1] = 0.045 * up + 0.27 * warm;
      colors[i * 3 + 2] = 0.07 * up + 0.24 * warm;
    }
    sky.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const envScene = new THREE.Scene();
    envScene.add(
      new THREE.Mesh(
        sky,
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          side: THREE.BackSide,
        })
      )
    );
    const pmrem = new THREE.PMREMGenerator(renderer);
    const texture = pmrem.fromScene(envScene, 0.02).texture;
    pmrem.dispose();
    return texture;
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
  render(ctx, alpha = 1) {
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
    this.updateCamera(player, enemyList, effects, dt);
    this.lastRenderTime = now;

    const t = this.three;
    // The ambient field spawns around the view and muzzle flashes are queued
    // until a draw: both are fed by the 2D draw calls, so call them here.
    effects?.drawAmbient(null, this.camera.getView());
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
    const { focus } = this;
    const fog = t.enemies.updateFog(dt, this.denseFog, focus.x, focus.z);
    t.decals.update(dt, t.enemies.views);
    t.bursts.update(dt);
    t.wardenLight.intensity = warden ? 2.6 : 0;
    if (warden) t.wardenLight.position.copy(warden.object.position).setY(40);
    t.player.update(player, t.ribbons, time);
    this.mirrorShield(player, time);
    markShadowCasters(t.player.group, SHIP_MIN_CASTER);
    t.flashes.update(dt);
    this.mirrorProjectiles();
    this.mirrorPickups(time);
    this.mirrorEffects(effects);
    this.hitSparks.update(dt, t.ribbons, t.shotRgb, t.textRgb);
    if (this.muzzles.update(t.glow, t.ribbons, t.shotRgb, t.textRgb) > 0) {
      t.player.flashMuzzle();
    }
    this.mirrorOverlays(player, effects);

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
  }

  updateCamera(player, enemies, effects, dt) {
    const t = this.three;
    // Poses are interpolated by now (render → applyPoses), so is the scene.
    const position = player?.position;
    if (position) {
      if (this.lastRenderTime === null) {
        this.camera.snapTo(position.x, position.y);
      } else {
        const scene = readCameraScene(
          this.cameraScene,
          player,
          this.cachedCombat,
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

    // Height so the plane shows GAME_WIDTH / zoom units across (zoom 1.3 →
    // ~615), times the dolly.
    const zoom = this.camera.effectiveZoom;
    const visibleWidth = GAME_WIDTH / zoom;
    const distance =
      (visibleWidth / (2 * Math.tan((FOV * Math.PI) / 360) * t.camera.aspect)) *
      this.dolly;

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
    this.aimKeyShadow(tx, tz, range);
    const roll = this.updateRoll(player, dt);
    const angle = roll + (shaking ? shake.angle : 0);
    if (Math.abs(angle) > 0.0001) t.camera.rotateZ(angle);
  }

  // The key light's shadow box over the shot: centred on the camera target
  // (snapped to whole texels so still edges don't crawl), sized by the range.
  aimKeyShadow(tx, tz, range) {
    const { key, keyDir } = this.three;
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
  updateRoll(player, dt) {
    let goal = 0;
    const v = player?.velocity;
    if (
      v &&
      this.camera.mode === 'dynamic' &&
      !this.cinematic &&
      !this.reducedMotion
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

  // The follow point, kept so the frustum's footprint on the field plane (a
  // trapezoid: wider at the far, upper edge) stays inside the 800×600 field.
  // createCamera clamps for the flat 2D view; tilt and dolly widen this one.
  clampToField(distance, aspect) {
    const out = this.clampedFollow || (this.clampedFollow = { x: 0, y: 0 });
    out.x = this.camera.x;
    out.y = this.camera.y;
    if (!this.camera.isEnabled()) return out;
    const tanV = Math.tan((FOV * Math.PI) / 360);
    const cos = Math.cos(TILT);
    const sin = Math.sin(TILT);
    const height = distance * cos;
    const far = cos - tanV * sin;
    const near = cos + tanV * sin;
    const halfW = (height * tanV * aspect) / far;
    const up = (height * (sin + tanV * cos)) / far - distance * sin;
    const down = distance * sin + (height * (tanV * cos - sin)) / near;
    out.x =
      halfW * 2 >= GAME_WIDTH
        ? GAME_WIDTH / 2
        : Math.max(halfW, Math.min(GAME_WIDTH - halfW, out.x));
    out.y =
      up + down >= GAME_HEIGHT
        ? (up + GAME_HEIGHT - down) / 2
        : Math.max(up, Math.min(GAME_HEIGHT - down, out.y));
    return out;
  }

  mirrorProjectiles() {
    const t = this.three;
    const combat = this.cachedCombat;
    if (!combat) return;
    const { lances } = t;

    const bullets = combat.bullets || [];
    const look = combat.lanceLook;
    const evolved = combat.evolutions.length > 0;
    const pushTrail = this.pushTrail.bind(this);
    for (let i = 0; i < bullets.length; i += 1) {
      const b = bullets[i];
      if (!b || b.hit) continue;
      if (b.kind === 'flak') pushFlakBolt(t.THREE, t, b, pushTrail);
      else pushLance(t.THREE, t, look, evolved, b, pushTrail);
    }
    mirrorWeaponEffects(t.THREE, combat, t, t.flashes);

    const enemyBullets = combat.enemyBullets || [];
    for (let i = 0; i < enemyBullets.length; i += 1) {
      const b = enemyBullets[i];
      if (!b || b.hit) continue;
      const rgb = b.color ? rgbOf(t.THREE, b.color) : t.threatRgb;
      const r = b.radius || 4;
      this.pushTrail(b, rgb, r * 1.2, 1.2);
      lances.push(
        b.x,
        b.y,
        3,
        Math.atan2(b.vy || 0, b.vx || 1),
        r * 1.6,
        r * 0.75,
        rgb,
        1.8
      );
    }
  }

  pushTrail(bullet, rgb, width, gain) {
    const trail = bullet.trail;
    if (!trail || !trail.length) return;
    const { ribbons } = this.three;
    const start = Math.max(0, trail.length - (MAX_TRAIL_POINTS - 1));
    let n = 0;
    for (let i = start; i < trail.length; i += 1) {
      ribbons.px[n] = trail[i].x;
      ribbons.py[n] = trail[i].y;
      n += 1;
    }
    ribbons.px[n] = bullet.x;
    ribbons.py[n] = bullet.y;
    ribbons.polyline(n + 1, 2.5, rgb, width, gain);
  }

  mirrorPickups(time) {
    const t = this.three;
    const orbs = this.cachedXPOrbs?.xpOrbs || [];
    for (let i = 0; i < orbs.length; i += 1) {
      const orb = orbs[i];
      if (!orb || orb.collected) continue;
      const tier = orb.tier || 1;
      const base = XP_ORB_SIZE * (1 + (tier - 1) * 0.2);
      const age = Number.isFinite(orb.age) ? orb.age : time;
      const pulse = 1 + 0.18 * Math.sin(age * 4 + i * 0.7);
      t.glow.push(orb.x, 4, orb.y, t.xpRgb, base * 1.5 * pulse, 0.7, 1);
      t.glow.push(orb.x, 4.5, orb.y, WHITE, base * 0.35, 0.9, 1.2);
    }

    const hearts = this.cachedHealthHearts?.hearts || [];
    for (let i = 0; i < hearts.length; i += 1) {
      const heart = hearts[i];
      if (!heart || heart.isCollected()) continue;
      const pulse = 1 + Math.sin(heart.pulsePhase || 0) * 0.12;
      const r = heart.radius || 14;
      t.glow.push(heart.x, 4, heart.y, t.statusRgb, r * 1.6 * pulse, 0.7, 1);
      t.glow.push(heart.x, 4.5, heart.y, WHITE, r * 0.4, 0.9, 1.2);
    }

    t.pickups.update(this.cachedPickups?.getActivePickups() || []);
  }

  mirrorEffects(effects) {
    const t = this.three;
    if (!effects) return;
    const { THREE, glow, matte, ribbons } = t;

    const chips = effects.ambientChips || [];
    for (let i = 0; i < chips.length; i += 1) {
      const c = chips[i];
      matte.push(c.x, -6, c.y, rgbOf(THREE, c.color), c.size * 1.3, c.alpha);
    }
    const motes = effects.ambientMotes || [];
    for (let i = 0; i < motes.length; i += 1) {
      const m = motes[i];
      glow.push(m.x, -4, m.y, t.shotRgb, m.size * 2.4, m.alpha, 1.4);
    }

    const particles = effects.particles || [];
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      if (!p || !(p.alpha > 0)) continue;
      const rgb = rgbOf(THREE, p.color);
      if (p.type === 'debris') {
        t.debris.push(p, rgb);
      } else if (p.type === 'smoke') {
        t.smoke.push(p.x, 3, p.y, rgb, p.size * 2.8, p.alpha * 0.5);
      } else if (p.type === 'spark') {
        // stretched along velocity, like the 2D strokeSpark
        const speed = Math.hypot(p.vx, p.vy);
        const stretch = p.size * Math.max(1.5, Math.min(4, speed * 0.012));
        const k = speed > 1 ? stretch / speed : 0;
        ribbons.streak(
          p.x - p.vx * k,
          p.y - p.vy * k,
          p.x + p.vx * k * 0.3,
          p.y + p.vy * k * 0.3,
          2,
          rgb,
          Math.max(0.6, Math.min(stretch * 0.35, p.size * p.alpha)),
          1.6 * p.alpha
        );
      } else if (p.type === 'crack') {
        const half = p.size * 1.6;
        const cx = Math.cos(p.rotation || 0) * half;
        const cy = Math.sin(p.rotation || 0) * half;
        ribbons.streak(
          p.x - cx,
          p.y - cy,
          p.x + cx,
          p.y + cy,
          2,
          rgb,
          Math.max(0.6, p.size * 0.4),
          2 * p.alpha
        );
      } else {
        glow.push(
          p.x,
          2,
          p.y,
          rgb,
          Math.max(1, p.size * p.alpha * 2.4),
          p.alpha,
          2
        );
        if (p.type === 'flare')
          glow.push(p.x, 2.5, p.y, WHITE, p.size * 0.6, p.alpha, 2.5);
      }
    }

    const waves = effects.shockwaves || [];
    for (let i = 0; i < t.shockwaves.length; i += 1) {
      const mesh = t.shockwaves[i];
      const wave = waves[i];
      if (!wave || !(wave.radius > 0)) {
        mesh.visible = false;
        continue;
      }
      const rgb = rgbOf(THREE, wave.color || PALETTE.shot);
      if (t.flashes.observe(wave, rgb)) this.kickForWave(wave);
      const alpha = Math.max(0, Math.min(1, wave.alpha)) * 1.6;
      const width = Math.max(1.5, (wave.lineWidth || 4) * 0.3);
      const extent = wave.radius + width * 3 + 2;
      const { uniforms } = mesh.material;
      mesh.visible = true;
      mesh.position.set(wave.x - HALF_W, 1.5, wave.y - HALF_H);
      mesh.scale.set(extent, 1, extent);
      uniforms.uRadius.value = wave.radius;
      uniforms.uWidth.value = width;
      uniforms.uExtent.value = extent;
      uniforms.uColor.value.setRGB(
        rgb[0] * alpha,
        rgb[1] * alpha,
        rgb[2] * alpha
      );
    }

    const screenFlash = effects.screenFlash;
    const alpha =
      screenFlash && screenFlash.timer > 0 && screenFlash.duration > 0
        ? (screenFlash.timer / screenFlash.duration) * screenFlash.intensity
        : 0;
    if (
      Math.abs(alpha - t.flashAlpha) > 0.01 ||
      (alpha === 0 && t.flashAlpha !== 0)
    ) {
      t.flashAlpha = alpha;
      t.flash.style.opacity = String(alpha);
      if (alpha > 0) t.flash.style.background = screenFlash.color;
    }
  }

  // Only big blasts kick the lens; strength grows with the wave's reach.
  kickForWave(wave) {
    const radius = wave.maxRadius || 0;
    if (radius < KICK_WAVE_RADIUS) return;
    const k = smoothstep(KICK_WAVE_RADIUS, KICK_WAVE_FULL, radius);
    this.impact.kick(KICK_WAVE_MIN + (KICK_WAVE_MAX - KICK_WAVE_MIN) * k);
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

  // The 2D overlays (EffectsSystem.drawWorld/drawScreenSpace, the
  // CombatSystem lock marks, RenderingSystem.drawMagnetismField) as flat
  // ribbons on the field plane and camera-facing sprites.
  mirrorOverlays(player, effects) {
    const t = this.three;
    const { ribbons } = t;
    const alive =
      player &&
      !player.isDead &&
      !player.isRetrying &&
      !player._quitExplosionHidden &&
      player.position;

    if (effects) {
      const markers = effects.hitMarkers || [];
      for (let i = 0; i < markers.length; i += 1) {
        const m = markers[i];
        if (!m) continue;
        const alpha = Math.max(0, m.life / m.maxLife);
        const r = m.size + m.expansion;
        const k = m.killed ? Math.SQRT1_2 : 1;
        const a = r * k;
        const b = m.killed ? a : 0;
        const gain = 0.7 * alpha;
        ribbons.segment(
          m.x - a,
          m.y - b,
          m.x + a,
          m.y + b,
          OVERLAY_H,
          t.textRgb,
          1.2,
          gain
        );
        ribbons.segment(
          m.x + b,
          m.y - a,
          m.x - b,
          m.y + a,
          OVERLAY_H,
          t.textRgb,
          1.2,
          gain
        );
      }

      const texts = effects.damageTexts || [];
      for (let i = 0; i < texts.length; i += 1) {
        const d = texts[i];
        if (!d) continue;
        t.texts.push(
          d.damage,
          d.x,
          d.y,
          d.size,
          d.color,
          Math.min(1, d.life * 2)
        );
      }

      this.mirrorBossTransitions(effects.bossTransitionEffects);
    }

    if (!alive) return;
    const { x: px, y: py } = player.position;
    this.mirrorLocks(player);

    const orbs = this.cachedXPOrbs?.xpOrbs || [];
    let orbActive = false;
    for (let i = 0; i < orbs.length && !orbActive; i += 1) {
      orbActive = Boolean(orbs[i] && !orbs[i].collected);
    }
    if (orbActive) {
      const radius =
        player.getMagnetismRadius() || this.cachedXPOrbs.getMagnetismRadius();
      const dashes = Math.max(12, Math.round((Math.PI * 2 * radius) / 6));
      ribbons.circle(px, py, radius, OVERLAY_H, t.accentRgb, 1, 0.25, dashes);
    }
  }

  // Same gating as CombatSystem.render: rank 1 ring + line, rank 2 the
  // predicted-aim marker, rank 3 every lock; nothing in manual aim. The
  // lock line leaves the turret's muzzle.
  mirrorLocks(player) {
    const combat = this.cachedCombat;
    if (!combat || combat.aimMode === 'manual') return;
    const rank = combat.targetingUpgradeLevel || 0;
    if (rank < 1) return;
    const { x: mx, y: my } = player.getMuzzlePoint();
    const t = this.three;
    const { ribbons, accentRgb } = t;
    const multi = rank >= 3;
    const locks = combat.currentLockAssignments || [];
    const pulse = Math.max(
      0,
      Math.min(
        1,
        combat.targetIndicatorPulse / (combat.targetPulseDuration || 0.0001)
      )
    );
    const count = locks.length || (combat.currentTarget ? 1 : 0);
    for (let i = 0; i < count; i += 1) {
      if (!multi && i > 0) break;
      const lock = locks[i];
      const target = lock ? lock.enemy : combat.currentTarget;
      if (!target || target.destroyed) continue;
      const base = i === 0 ? combat.lockHighlightAlpha : combat.lockLineAlpha;
      const alpha = Math.min(1, (base || 0.6) + pulse * 0.25);
      const radius =
        (target.radius || 16) +
        6 +
        (lock?.duplicateIndex || 0) * 4 +
        pulse * (i === 0 ? 6 : 3.5);
      const dashes = Math.max(8, Math.round((Math.PI * 2 * radius) / 10));
      ribbons.circle(
        target.x,
        target.y,
        radius,
        OVERLAY_H,
        accentRgb,
        i === 0 ? 1.5 : 1,
        alpha * 0.8,
        dashes,
        0.6
      );
      ribbons.segment(
        mx,
        my,
        target.x,
        target.y,
        OVERLAY_H,
        accentRgb,
        1,
        alpha * 0.3
      );
    }

    if (rank < 2 || !combat.usingDynamicPrediction()) return;
    const points = combat.predictedAimPoints || [];
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      if (!point?.position || (!multi && point.index > 0)) continue;
      const primary = point.index === 0;
      const alpha = primary ? 0.55 : 0.38;
      const radius =
        (combat.predictedMarkerRadius || 12) *
        (primary ? 1 : 0.82 + (point.duplicateIndex || 0) * 0.04);
      const { x, y } = point.position;
      ribbons.circle(x, y, radius, OVERLAY_H, accentRgb, 1, alpha);
      t.glow.push(x, OVERLAY_H, y, accentRgb, radius * 0.9, alpha * 0.3, 0.6);
    }
  }

  mirrorBossTransitions(list) {
    const t = this.three;
    let border = 0;
    let wash = 0;
    let width = 0;
    let color = PALETTE.boss;
    const effects = list || [];
    // Reduce Flashing: 30 % strength, a steady fade instead of the pulse, and
    // an effect starting under 0.34 s after another still showing is skipped.
    const reduced = this.flashScale < 1;
    for (let i = 0; i < effects.length; i += 1) {
      const e = effects[i];
      if (!e) continue;
      if (
        reduced &&
        effects.some((o) => o && o.timer > e.timer && o.timer - e.timer < 0.34)
      ) {
        continue;
      }
      const progress = Math.min(1, e.timer / e.duration);
      const fadePower = Number.isFinite(e.fadePower)
        ? Math.max(0.1, e.fadePower)
        : 1.5;
      const fade = Math.max(0, 1 - Math.pow(progress, fadePower));
      const frequency = Number.isFinite(e.pulseFrequency)
        ? e.pulseFrequency
        : 1.8;
      const pulse = reduced
        ? 1
        : 0.65 + 0.35 * Math.sin(progress * Math.PI * frequency);
      const b = e.maxAlpha * fade * pulse * this.flashScale;
      const w =
        e.overlayAlpha * fade * Math.min(1, pulse + 0.15) * this.flashScale;
      if (b > border) {
        border = b;
        width = e.borderWidth * (0.85 + 0.15 * pulse);
      }
      wash = Math.max(wash, w);
      if (e.color) color = e.color;
    }
    // quantized so the DOM is touched only when the look changes
    const key =
      border > 0.01 || wash > 0.01
        ? `${color}|${Math.round(border * 50)}|${Math.round(wash * 50)}|${Math.round(width)}`
        : '';
    if (key === t.bossFlashKey) return;
    t.bossFlashKey = key;
    const style = t.bossFlash.style;
    if (!key) {
      style.opacity = '0';
      return;
    }
    // canvas px are logical px × the CSS stretch
    const scale = t.canvas.clientWidth / GAME_WIDTH || 1;
    const px = Math.max(1, width * scale);
    style.opacity = '1';
    style.background = withAlpha(color, wash);
    style.boxShadow = `inset 0 0 ${px * 1.4}px ${px}px ${withAlpha(color, border)}`;
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
