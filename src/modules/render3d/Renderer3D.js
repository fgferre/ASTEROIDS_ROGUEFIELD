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
import { GAME_WIDTH, XP_ORB_SIZE } from '../../core/GameConstants.js';
import { cameraDisabledByUrl, createCamera } from '../../core/camera.js';
import { IS_DEV } from '../../core/env.js';
import { resolveService } from '../../core/serviceUtils.js';
import { KEY_LIGHT_DIR, PALETTE } from '../../data/constants/palette.js';
import { SHIP_MAX_SPEED } from '../../data/constants/physics.js';
import {
  CapsuleBatch,
  HALF_H,
  HALF_W,
  PointBatch,
  RibbonBatch,
  rgbOf,
} from './batches.js';
import { EnemyMirror } from './enemyMirror.js';
import { FieldBackdrop } from './fieldBackdrop.js';
import { PlayerMirror } from './playerMirror.js';

const FOV = 38;
const TILT = (18 * Math.PI) / 180;
const KEY_ELEVATION = (40 * Math.PI) / 180;
const DOLLY_TIME_CONSTANT = 0.4;
const DOLLY_SPEED_OUT = 0.08;
const DOLLY_COMBAT_IN = 0.06;
const COMBAT_RANGE = 140;
const BLOOM = { strength: 0.9, radius: 0.6, threshold: 0.75 };
const MAX_SHOCKWAVES = 25;
const MAX_TRAIL_POINTS = 64;
const WHITE = [1, 1, 1];

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

// `?bloom=0` turns the pass off; `?bloom=<n>` (0..3) scales its strength —
// the same flag the 2D bloomLayer reads.
function bloomFromUrl() {
  try {
    const raw = new URLSearchParams(window.location.search).get('bloom');
    if (raw === null) return { enabled: true, scale: 1 };
    const value = Number(raw);
    if (!Number.isFinite(value)) return { enabled: true, scale: 1 };
    return { enabled: value > 0, scale: Math.min(3, Math.max(0, value)) };
  } catch {
    return { enabled: true, scale: 1 };
  }
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
    this.camera.setEnabled(!cameraDisabledByUrl());
    this.lastRenderTime = null;
    this.dolly = 1;
    this.three = null;
    this.failed = false;
    this.bloomSetting = true;
    this.stats = { drawCalls: 0, triangles: 0, frames: 0 };

    this.resolveCachedServices(
      {
        cachedPlayer: 'player',
        cachedXPOrbs: 'xp-orbs',
        cachedHealthHearts: 'healthHearts',
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

    const settings = resolveService('settings', this.dependencies);
    if (settings) {
      this.applyGraphicsPreferences(settings.getCategoryValues('graphics'));
    }
    this.registerEventListener('settings-graphics-changed', (payload = {}) => {
      if (payload?.values) this.applyGraphicsPreferences(payload.values);
    });
    this.registerEventListener('camera-zoom-pulse', ({ zoom, duration }) => {
      this.camera.pulseZoom(zoom, duration);
    });
  }

  applyGraphicsPreferences(values = {}) {
    this.bloomSetting =
      values.bloom !== false && values.postProcessing !== false;
    if (this.three?.bloomPass) {
      this.three.bloomPass.enabled = this.bloomSetting && this.three.bloomUrl;
    }
  }

  onReset() {
    this.camera.reset();
    this.lastRenderTime = null;
    this.dolly = 1;
    this.three?.enemies.clear();
    this.three?.player.reset();
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
    renderer.setClearColor(PALETTE.background, 1);
    renderer.info.autoReset = false;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 4 / 3, 10, 4000);

    // Key: warm white from upper-left (KEY_LIGHT_DIR), fixed in the world.
    // No shadow maps in this slice (cost); the fill and the environment keep
    // the unlit sides readable.
    const key = new THREE.DirectionalLight(0xfff1e2, 1.6);
    key.position.set(
      KEY_LIGHT_DIR.x * Math.cos(KEY_ELEVATION),
      Math.sin(KEY_ELEVATION),
      KEY_LIGHT_DIR.y * Math.cos(KEY_ELEVATION)
    );
    // Fill: cool, from below-right; hemisphere keeps shadows from going void.
    const fill = new THREE.DirectionalLight(PALETTE.neutral, 0.35);
    fill.position.set(0.7, 0.3, 0.65);
    const hemi = new THREE.HemisphereLight(0x2a3346, 0x050608, 0.3);
    const wardenLight = new THREE.PointLight(PALETTE.boss, 0, 320, 2);
    scene.add(key, fill, hemi, wardenLight);
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
    bloomPass.enabled = bloomUrl.enabled && this.bloomSetting;
    composer.addPass(bloomPass);
    composer.addPass(new THREE.SMAAPass(width, height));

    const backdrop = new FieldBackdrop(THREE, scene);
    const enemies = new EnemyMirror(THREE, scene, this.seeded);
    const player = new PlayerMirror(THREE, scene, this.seeded);

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

    this.three = {
      THREE,
      canvas,
      renderer,
      scene,
      camera,
      composer,
      bloomPass,
      bloomUrl: bloomUrl.enabled,
      wardenLight,
      backdrop,
      enemies,
      player,
      ribbons,
      lances,
      glow,
      matte,
      smoke,
      shockwaves,
      flash,
      flashAlpha: 0,
      width: 0,
      height: 0,
      shotRgb: rgbOf(THREE, PALETTE.shot),
      threatRgb: rgbOf(THREE, PALETTE.threat),
      xpRgb: rgbOf(THREE, PALETTE.xp),
      statusRgb: rgbOf(THREE, PALETTE.status),
    };
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

  // --- frame -----------------------------------------------------------------

  render() {
    if (this.failed) return;
    if (!this.three) {
      try {
        this.seeded(() => this.setup());
      } catch (error) {
        this.failed = true;
        console.error('[Renderer3D] WebGL setup failed:', error);
        return;
      }
    }

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

    const warden = t.enemies.update(enemyList, time);
    t.wardenLight.intensity = warden ? 2.6 : 0;
    if (warden) t.wardenLight.position.copy(warden.object.position).setY(40);
    t.player.update(player, t.ribbons, time);
    this.mirrorProjectiles();
    this.mirrorPickups(time);
    this.mirrorEffects(effects);

    const pointScale = t.height / (2 * Math.tan((FOV * Math.PI) / 360));
    t.backdrop.update(this.camera.x, this.camera.y, dt, pointScale);
    t.ribbons.end();
    t.lances.end();
    t.glow.end(pointScale);
    t.matte.end(pointScale);
    t.smoke.end(pointScale);

    t.renderer.info.reset();
    t.composer.render(dt);
    this.recordStats();
  }

  syncSize() {
    const t = this.three;
    const width = Math.max(1, t.canvas.width);
    const height = Math.max(1, t.canvas.height);
    if (width === t.width && height === t.height) return;
    t.width = width;
    t.height = height;
    t.renderer.setSize(width, height, false);
    t.composer.setSize(width, height);
    t.camera.aspect = width / height;
    t.camera.updateProjectionMatrix();
  }

  updateCamera(player, enemies, effects, dt) {
    const t = this.three;
    const position = player?.position;
    if (position) {
      if (this.lastRenderTime === null) {
        this.camera.snapTo(position.x, position.y);
      } else {
        this.camera.update(position.x, position.y, dt);
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
    const tx = this.camera.x - HALF_W - ox;
    const tz = this.camera.y - HALF_H - oy;
    t.camera.position.set(
      tx,
      distance * Math.cos(TILT),
      tz + distance * Math.sin(TILT)
    );
    t.camera.up.set(0, 0, -1);
    t.camera.lookAt(tx, 0, tz);
    if (shaking && Math.abs(shake.angle) > 0.001) t.camera.rotateZ(shake.angle);
  }

  mirrorProjectiles() {
    const t = this.three;
    const combat = this.cachedCombat;
    if (!combat) return;
    const { lances } = t;

    const bullets = combat.bullets || [];
    for (let i = 0; i < bullets.length; i += 1) {
      const b = bullets[i];
      if (!b || b.hit) continue;
      this.pushTrail(b, t.shotRgb, 2.4, 1.3);
      lances.push(
        b.x,
        b.y,
        3,
        Math.atan2(b.vy || 0, b.vx || 1),
        6.5,
        1.5,
        t.shotRgb,
        1.9
      );
    }

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
        matte.push(p.x, 2, p.y, rgb, p.size * 1.4, p.alpha);
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
