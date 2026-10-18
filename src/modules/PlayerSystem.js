// src/modules/PlayerSystem.js
import { BaseSystem } from '../core/BaseSystem.js';
import { GAME_HEIGHT, GAME_WIDTH, SHIP_SIZE } from '../core/GameConstants.js';
import shipModels from '../data/shipModels.js';
import {
  FILL_LIGHT,
  KEY_LIGHT_DIR,
  LINE,
  PALETTE,
  withAlpha,
} from '../data/constants/palette.js';
import { getRenderScale, resolveDevicePixelRatio } from '../core/viewport.js';
import { getEmissive } from '../core/bloomLayer.js';
import { resolveService } from '../core/serviceUtils.js';
import { BASE_MODIFIERS } from '../data/hangar.js';
import {
  MODERN_MOVE_ACCEL,
  SHIP_ACCELERATION,
  SHIP_ANGULAR_DAMPING,
  SHIP_FACE_VELOCITY_MIN_SPEED,
  SHIP_FACING_RESPONSE,
  SHIP_HEADING_TURN_RATE,
  SHIP_LINEAR_DAMPING,
  SHIP_MAX_SPEED,
  SHIP_MOVE_TURN_RATE,
  SHIP_ROTATION_SPEED,
  TURRET_BARREL_LENGTH,
  TURRET_PIVOT_X,
  TURRET_RESPONSE,
  TURRET_TURN_RATE,
} from '../data/constants/physics.js';
import { GAMEPAD_AIM_ENGAGE } from '../data/constants/gamepad.js';
import {
  DASH_COOLDOWN,
  DASH_DURATION,
  DASH_GHOST_COUNT,
  DASH_GHOST_LIFE,
  DASH_IMPULSE,
  DASH_INVULNERABILITY,
  DASH_SPEED_CAP_MULTIPLIER,
  MAGNETISM_RADIUS,
  SHIELD_COOLDOWN_DURATION,
  SHIELD_IMPACT_DAMAGE_BASE,
  SHIELD_IMPACT_DAMAGE_PER_LEVEL,
  SHOT_RECOIL_IMPULSE,
} from '../data/constants/gameplay.js';

const DRIFT_SETTINGS = {
  rampSpeed: 2.8,
  decaySpeed: 5.2,
  brakeReduction: 0.4,
};

const SHIELD_LEVEL_CONFIG = {
  1: {
    maxHP: 50,
    cooldown: SHIELD_COOLDOWN_DURATION,
  },
  2: {
    maxHP: 75,
    cooldown: SHIELD_COOLDOWN_DURATION,
  },
  3: {
    maxHP: 75,
    cooldown: Math.max(5, SHIELD_COOLDOWN_DURATION - 5),
  },
  4: {
    maxHP: 100,
    cooldown: Math.max(5, SHIELD_COOLDOWN_DURATION - 5),
  },
  5: {
    maxHP: 125,
    cooldown: Math.max(4, SHIELD_COOLDOWN_DURATION - 7),
  },
};

const DEFAULT_THRUSTER_PORTS = Object.freeze({
  main: Object.freeze({ x: -SHIP_SIZE * 0.95, y: 0 }),
  aux: Object.freeze({ x: SHIP_SIZE * 0.95, y: 0 }),
  left: Object.freeze({ x: 0, y: -SHIP_SIZE * 0.95 }),
  right: Object.freeze({ x: 0, y: SHIP_SIZE * 0.95 }),
});

const buildClosedPath = (vertices) => {
  if (
    typeof Path2D !== 'function' ||
    !Array.isArray(vertices) ||
    vertices.length < 3
  ) {
    return null;
  }

  const path = new Path2D();
  let hasMoved = false;

  vertices.forEach((vertex) => {
    if (!vertex) return;
    if (!hasMoved) {
      path.moveTo(vertex.x, vertex.y);
      hasMoved = true;
      return;
    }

    path.lineTo(vertex.x, vertex.y);
  });

  if (!hasMoved) {
    return null;
  }

  path.closePath();
  return path;
};

const THRUSTER_TRAIL_LENGTH = 12;
const TRAIL_BREAK_DISTANCE = 40;
const PREVIEW_THRUST = 0.35;
const PREVIEW_ANGLE = -Math.PI / 2;
const IDLE_THRUST = Object.freeze({ main: 0, aux: 0, sideL: 0, sideR: 0 });

// 'modern' (NORTE §4b): WASD moves on the screen axes, the hull faces the
// motion and the turret aims on its own.
// 'classic' (?controls=classic): A/D rotate, Asteroids-style.
const controlSchemeFromUrl = () => {
  try {
    return new URLSearchParams(window.location.search).get('controls') ===
      'classic'
      ? 'classic'
      : 'modern';
  } catch {
    return 'modern';
  }
};

const coneLength = (thrust, thrusterLevel) =>
  (4 + 12 * thrust) * (1 + 0.1 * thrusterLevel);

// The emissive layer shares the frame transform; sync it to the caller's
// current transform (recoil, ship rotation) and hand it back saved.
const beginEmissive = (emissive, ctx) => {
  if (!emissive) return null;
  emissive.save();
  emissive.setTransform(ctx.getTransform());
  return emissive;
};

const createSpriteCanvas = (width, height, scale) => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);
  return { canvas, ctx };
};

// Thrust cone along +x from the origin: accent flame with a white-hot core.
const CONE_SIZE = { length: 32, height: 12 };
const coneSpriteCache = new Map();
const getConeSprite = (color, scale) => {
  const key = `${color}|${scale}`;
  if (!coneSpriteCache.has(key)) {
    const sprite = createSpriteCanvas(
      CONE_SIZE.length,
      CONE_SIZE.height,
      scale
    );
    if (sprite) {
      const { ctx } = sprite;
      const mid = CONE_SIZE.height / 2;
      const flame = (length, halfWidth, fill) => {
        ctx.beginPath();
        ctx.moveTo(0, mid - halfWidth);
        ctx.quadraticCurveTo(length * 0.3, mid - halfWidth, length, mid);
        ctx.quadraticCurveTo(length * 0.3, mid + halfWidth, 0, mid + halfWidth);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };
      const outer = ctx.createLinearGradient(0, 0, CONE_SIZE.length, 0);
      outer.addColorStop(0, withAlpha(color, 0.95));
      outer.addColorStop(0.35, withAlpha(color, 0.5));
      outer.addColorStop(1, withAlpha(color, 0));
      flame(CONE_SIZE.length, mid * 0.8, outer);
      const core = ctx.createLinearGradient(0, 0, CONE_SIZE.length * 0.45, 0);
      core.addColorStop(0, withAlpha(PALETTE.text, 1));
      core.addColorStop(1, withAlpha(PALETTE.text, 0));
      flame(CONE_SIZE.length * 0.45, mid * 0.35, core);
    }
    coneSpriteCache.set(key, sprite ? sprite.canvas : null);
  }
  return coneSpriteCache.get(key);
};

const drawCone = (ctx, sprite, x, y, rotation, length, width, alpha) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(sprite, 0, -width / 2, length, width);
  ctx.restore();
};

// Applies the visual-upgrade levels to a hull's panel data (shipModels.js).
const buildHullGeometry = (visual, levels) => {
  const levelOf = (key) => levels[key] || 0;
  const panels = visual.panels
    .filter(
      (panel) =>
        !panel.minLevel || levelOf(panel.minLevel.key) >= panel.minLevel.value
    )
    .map((panel) => {
      const steps = panel.grow ? levelOf(panel.grow.key) : 0;
      const points = panel.points.map((point, index) =>
        steps && panel.grow.indices.includes(index)
          ? {
              x: point.x + panel.grow.step.x * steps,
              y: point.y + panel.grow.step.y * steps,
            }
          : point
      );
      const length = Math.hypot(panel.facing.x, panel.facing.y) || 1;
      return {
        points,
        path: buildClosedPath(points),
        facing: { x: panel.facing.x / length, y: panel.facing.y / length },
        rcsPort: Number.isInteger(panel.rcsPort) ? points[panel.rcsPort] : null,
      };
    });
  const thrusterLevel = levelOf('thruster');
  const nozzleLength =
    visual.nozzleLength + visual.nozzleLengthPerLevel * thrusterLevel;
  const nozzles = visual.nozzles
    .filter((nozzle) => !nozzle.minLevel || thrusterLevel >= nozzle.minLevel)
    .map((nozzle) => ({ ...nozzle, exitX: nozzle.x - nozzleLength }));

  let minX = 0;
  let maxX = 0;
  let maxY = 0;
  panels.forEach((panel) =>
    panel.points.forEach((point) => {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, Math.abs(point.y));
    })
  );
  const minNozzleX = Math.min(...nozzles.map((nozzle) => nozzle.exitX));
  minX = Math.min(minX, minNozzleX);

  return {
    accent: PALETTE[visual.accent] || PALETTE.player,
    blades: Boolean(visual.blades),
    panels,
    nozzles,
    nozzleLength,
    nozzleRadius: nozzles[0].r,
    minNozzleX,
    retroPorts: visual.retroPorts,
    rcsPorts: panels.filter((panel) => panel.rcsPort).map((p) => p.rcsPort),
    cockpit: visual.cockpit,
    minX,
    maxX,
    maxY,
    extent: Math.max(-minX, maxX, maxY),
  };
};

// Static hull art per (hull, levels, scale): matte base, seams + nozzles,
// and the 1 px player rim (emissive layer only).
const bakeHullSprites = (geometry, scale) => {
  const half = Math.ceil(geometry.extent + 3);
  const size = half * 2;
  const base = createSpriteCanvas(size, size, scale);
  const detail = createSpriteCanvas(size, size, scale);
  const mask = createSpriteCanvas(size, size, scale);
  const rim = createSpriteCanvas(size, size, scale);
  if (!base || !detail || !mask || !rim) return null;
  [base, detail, mask].forEach(({ ctx }) => ctx.translate(half, half));

  const housing = (ctx, nozzle) =>
    ctx.rect(
      nozzle.exitX,
      nozzle.y - nozzle.r,
      geometry.nozzleLength,
      nozzle.r * 2
    );

  // base: nozzle housings under the matte panels
  base.ctx.fillStyle = PALETTE.rockShadow;
  geometry.nozzles.forEach((nozzle) => {
    base.ctx.beginPath();
    housing(base.ctx, nozzle);
    base.ctx.fill();
  });
  base.ctx.fillStyle = PALETTE.hull;
  geometry.panels.forEach((panel) => base.ctx.fill(panel.path));

  // detail: seams, nozzle lips, dim cockpit slit
  const d = detail.ctx;
  d.lineJoin = 'round';
  d.strokeStyle = withAlpha(PALETTE.background, 0.9);
  d.lineWidth = 0.6;
  geometry.panels.forEach((panel) => d.stroke(panel.path));
  d.strokeStyle = withAlpha(PALETTE.neutral, 0.55);
  d.lineWidth = 0.4;
  geometry.nozzles.forEach((nozzle) => {
    d.beginPath();
    housing(d, nozzle);
    d.stroke();
    d.fillStyle = withAlpha(geometry.accent, 0.5);
    d.beginPath();
    d.ellipse(
      nozzle.exitX,
      nozzle.y,
      nozzle.r * 0.35,
      nozzle.r * 0.8,
      0,
      0,
      Math.PI * 2
    );
    d.fill();
  });
  const { cockpit } = geometry;
  d.lineCap = 'round';
  d.lineWidth = cockpit.width;
  d.strokeStyle = withAlpha(PALETTE.player, 0.75);
  d.beginPath();
  d.moveTo(cockpit.from.x, cockpit.from.y);
  d.lineTo(cockpit.to.x, cockpit.to.y);
  d.stroke();
  // blades (Solar Slicer): edged in the hull accent
  if (geometry.blades) {
    d.strokeStyle = withAlpha(geometry.accent, 0.8);
    d.lineWidth = 0.5;
    geometry.panels
      .filter((panel) => panel.rcsPort)
      .forEach((panel) => d.stroke(panel.path));
  }

  // rim: dilate the silhouette by 1 logical px, keep only the ring
  mask.ctx.fillStyle = PALETTE.text;
  geometry.panels.forEach((panel) => mask.ctx.fill(panel.path));
  geometry.nozzles.forEach((nozzle) => {
    mask.ctx.beginPath();
    housing(mask.ctx, nozzle);
    mask.ctx.fill();
  });
  const r = rim.ctx;
  r.setTransform(1, 0, 0, 1, 0, 0);
  const step = LINE.hair * scale;
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 2;
    r.drawImage(mask.canvas, Math.cos(a) * step, Math.sin(a) * step);
  }
  r.globalCompositeOperation = 'source-in';
  r.fillStyle = PALETTE.player;
  r.fillRect(0, 0, rim.canvas.width, rim.canvas.height);
  r.globalCompositeOperation = 'destination-out';
  r.drawImage(mask.canvas, 0, 0);

  return { base: base.canvas, detail: detail.canvas, rim: rim.canvas, half };
};

class PlayerSystem extends BaseSystem {
  constructor(config = {}) {
    const { position, dependencies } = PlayerSystem.normalizeConfig(config);

    super(dependencies, {
      systemName: 'PlayerSystem',
      serviceName: 'player',
      enableRandomManagement: false,
    });

    const normalizedDependencies = this.dependencies;

    if (config && typeof config === 'object' && !Array.isArray(config)) {
      if (config['command-queue'] && !normalizedDependencies['command-queue']) {
        normalizedDependencies['command-queue'] = config['command-queue'];
      }

      if (config.commandQueue && !normalizedDependencies['command-queue']) {
        normalizedDependencies['command-queue'] = config.commandQueue;
      }
    }

    this.dependencies = normalizedDependencies;
    this.commandQueue =
      this.dependencies['command-queue'] ||
      resolveService('command-queue', this.dependencies) ||
      null;
    this.commandQueueConsumerId = 'player-system';
    this.controlScheme = config?.controlScheme || controlSchemeFromUrl();
    // World point CombatSystem aims at (null without a lock), set each step.
    this.aimPoint = null;
    // Right-stick direction (unit) while it is held past GAMEPAD_AIM_ENGAGE.
    this.aimStick = null;
    this.cachedMovementInput = this.getDefaultMovementBinary();
    this.lastConsumedMovementCommand = null;
    const startX = Number.isFinite(position?.x) ? position.x : GAME_WIDTH / 2;
    const startY = Number.isFinite(position?.y) ? position.y : GAME_HEIGHT / 2;

    // === APENAS MOVIMENTO E POSIÇÃO ===
    this.position = { x: startX, y: startY };
    this.velocity = { vx: 0, vy: 0 };
    this.angle = 0;
    // Weapon heading: on the aim point in modern, the hull's in classic.
    this.turretAngle = 0;
    this.targetAngle = 0; // Para rotação suave (futuro)
    this.angularVelocity = 0;
    this.driftFactor = 0;

    // === CONFIGURAÇÕES DE MOVIMENTO ===
    // Usar constantes do arquivo separado
    this.maxSpeed = SHIP_MAX_SPEED;
    this.acceleration = SHIP_ACCELERATION;
    this.rotationSpeed = SHIP_ROTATION_SPEED;
    this.strafeMultiplier = 1;
    // FIX-02: split damping into base (always) + braking (no-thrust frames only).
    this.baseLinearDamping = SHIP_LINEAR_DAMPING;
    this.brakingDamping = 0;
    // Backward-compat read shape: `this.linearDamping` returns the combined total
    // so any external reader (snapshot / serialize / UI tooltip) keeps a sensible
    // value. No setter — writes that previously hit `this.linearDamping` must
    // route through the upgrade-linear-damping handler or mutate `brakingDamping`
    // directly; any other writer is a latent bug.
    Object.defineProperty(this, 'linearDamping', {
      get() {
        return this.baseLinearDamping + this.brakingDamping;
      },
      configurable: true,
      enumerable: false,
    });
    this.angularDamping = SHIP_ANGULAR_DAMPING;

    // === STATS DO JOGADOR ===
    this.health = 100;
    this.maxHealth = 100;
    this.damage = 25;
    this.multishot = 1;
    this.magnetismRadius = MAGNETISM_RADIUS;
    this.dashCooldown = DASH_COOLDOWN;
    this.dashAfterInvulnerability = 0;
    this.hullDrain = null;
    this.hullDrainTimer = 0;
    this.currentHull = null;
    this._currentHullMetrics = {
      outline: [],
      boundingRadius: SHIP_SIZE,
      shieldPadding: 0,
    };
    this.hullGeometryCache = new Map();
    this.hullSpriteCache = new Map();
    this.setHull(shipModels.defaultHull);

    // === VISUAL UPGRADE LEVELS ===
    this.thrusterVisualLevel = 0;
    this.rcsVisualLevel = 0;
    this.brakingVisualLevel = 0;

    // === THRUSTER STATE TRACKING (for audio) ===
    this.lastThrusterState = {
      main: 0,
      aux: 0,
      sideL: 0,
      sideR: 0,
    };
    this.thrusterVisual = { main: 0, aux: 0, sideL: 0, sideR: 0 };
    this.thrusterTrail = {
      points: Array.from({ length: THRUSTER_TRAIL_LENGTH }, () => ({
        x: 0,
        y: 0,
        i: 0,
      })),
      head: 0,
      count: 0,
    };

    // === WEAPON RECOIL ===
    this.recoilOffset = { x: 0, y: 0 };
    this.recoilDecay = 0.85; // Fast decay for snappy feel

    this.shieldUpgradeLevel = 0;
    this.shieldMaxHP = 0;
    this.shieldHP = 0;
    this.shieldCooldownTimer = 0;
    this.shieldMaxCooldown = 0;
    this.shieldWasInCooldown = false;
    this.isShieldActive = false;
    this.invulnerableTimer = 0;
    this.resetDashState();

    // === DEATH/RETRY STATE ===
    this.isDead = false;
    this.isRetrying = false;

    // Event listeners are set up by BaseSystem after initialize()
  }

  static normalizeConfig(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return { position: null, dependencies: {} };
    }

    const { position = null, dependencies = null, ...rest } = config;

    if (
      dependencies &&
      typeof dependencies === 'object' &&
      !Array.isArray(dependencies)
    ) {
      return { position, dependencies };
    }

    return { position, dependencies: rest };
  }

  getCommandQueue() {
    if (this.commandQueue) {
      return this.commandQueue;
    }

    if (this.dependencies && this.dependencies['command-queue']) {
      this.commandQueue = this.dependencies['command-queue'];
      return this.commandQueue;
    }

    this.commandQueue =
      resolveService('command-queue', this.dependencies) || null;

    if (this.commandQueue && this.dependencies) {
      this.dependencies['command-queue'] = this.commandQueue;
    }

    return this.commandQueue;
  }

  consumeMovementCommands() {
    const queue = this.getCommandQueue();

    if (!queue || typeof queue.consume !== 'function') {
      return { consumed: false, binary: null };
    }

    let entries;

    try {
      entries = queue.consume({
        types: ['move'],
        consumerId: this.commandQueueConsumerId,
      });
    } catch (error) {
      console.warn('[PlayerSystem] Failed to consume move commands:', error);
      return { consumed: false, binary: null };
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return { consumed: false, binary: null };
    }

    const latestEntry = entries[entries.length - 1];
    const normalizedBinary = this.extractMovementBinary(latestEntry);

    if (!normalizedBinary) {
      this.lastConsumedMovementCommand = latestEntry || null;
      return { consumed: true, binary: null };
    }

    this.cachedMovementInput = { ...normalizedBinary };
    this.lastConsumedMovementCommand = latestEntry || null;

    return { consumed: true, binary: { ...normalizedBinary } };
  }

  extractMovementBinary(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const payload = entry.payload || null;

    if (payload && typeof payload === 'object') {
      if (payload.binary && typeof payload.binary === 'object') {
        const movement = this.normalizeMovementBinary(payload.binary);
        // Gamepad sticks (InputSystem `analog`), centred from the keyboard.
        if (payload.analog) {
          movement.moveX = Number(payload.analog.moveX) || 0;
          movement.moveY = Number(payload.analog.moveY) || 0;
          movement.aimX = Number(payload.analog.aimX) || 0;
          movement.aimY = Number(payload.analog.aimY) || 0;
        }
        return movement;
      }

      if (payload.axes && typeof payload.axes === 'object') {
        const threshold = 0.25;
        const x = Number(payload.axes.x) || 0;
        const y = Number(payload.axes.y) || 0;

        return this.normalizeMovementBinary({
          up: y < -threshold,
          down: y > threshold,
          left: x < -threshold,
          right: x > threshold,
        });
      }
    }

    return null;
  }

  normalizeMovementBinary(binary) {
    if (!binary || typeof binary !== 'object') {
      return this.getDefaultMovementBinary();
    }

    return {
      up: Boolean(binary.up),
      down: Boolean(binary.down),
      left: Boolean(binary.left),
      right: Boolean(binary.right),
    };
  }

  getDefaultMovementBinary() {
    return {
      up: false,
      down: false,
      left: false,
      right: false,
    };
  }

  pullLegacyMovementFromInput(inputSystem) {
    if (!inputSystem || typeof inputSystem.getMovementInput !== 'function') {
      return null;
    }

    try {
      const legacy = inputSystem.getMovementInput();
      if (legacy && typeof legacy === 'object') {
        return this.normalizeMovementBinary(legacy);
      }
    } catch (error) {
      console.warn(
        '[PlayerSystem] Failed to read legacy movement input:',
        error
      );
    }

    return null;
  }

  setupEventListeners() {
    // Applied in the next update, once this step's movement input is known.
    this.registerEventListener('dash-pressed', () => {
      this.dashRequested = true;
    });

    this.registerEventListener('upgrade-damage-boost', (data) => {
      this.damage = Math.floor(this.damage * data.multiplier);
      console.log('[PlayerSystem] Damage boosted to', this.damage);
    });

    this.registerEventListener('upgrade-speed-boost', (data) => {
      this.maxSpeed = Math.floor(this.maxSpeed * data.multiplier);
      console.log('[PlayerSystem] Speed boosted to', this.maxSpeed);
    });

    this.registerEventListener('upgrade-acceleration-boost', (data) => {
      this.acceleration = this.acceleration * data.multiplier;
      console.log('[PlayerSystem] Acceleration boosted to', this.acceleration);
    });

    this.registerEventListener('upgrade-rotation-boost', (data) => {
      this.rotationSpeed = this.rotationSpeed * data.multiplier;
      console.log(
        '[PlayerSystem] Rotation speed boosted to',
        this.rotationSpeed
      );
    });

    // rcs_system rank 5: harder sidesteps (strafe is base movement now).
    this.registerEventListener('upgrade-strafe-movement', (data) => {
      this.strafeMultiplier *= data.multiplier;
    });

    this.registerEventListener('upgrade-angular-damping', (data) => {
      this.angularDamping = this.angularDamping * data.multiplier;
      console.log(
        '[PlayerSystem] Angular damping adjusted to',
        this.angularDamping
      );
    });

    this.registerEventListener('upgrade-linear-damping', (data) => {
      // FIX-02: mutate brakingDamping only. baseLinearDamping is invariant.
      // Formula preserves the upgrade catalog's intent: "multiplier 1.30" means
      // "+30% damping during stops" — applied to the cumulative effective total,
      // then projected back onto the braking-only component.
      const previousTotal = this.baseLinearDamping + this.brakingDamping;
      const newTotal = previousTotal * data.multiplier;
      this.brakingDamping = Math.max(0, newTotal - this.baseLinearDamping);
      console.log(
        '[PlayerSystem] Braking damping adjusted to',
        this.brakingDamping
      );
    });

    this.registerEventListener('upgrade-thruster-visual', (data) => {
      this.thrusterVisualLevel = data.level || 0;
      console.log(
        '[PlayerSystem] Thruster visual level:',
        this.thrusterVisualLevel
      );
    });

    this.registerEventListener('upgrade-rcs-visual', (data) => {
      this.rcsVisualLevel = data.level || 0;
      console.log('[PlayerSystem] RCS visual level:', this.rcsVisualLevel);
    });

    this.registerEventListener('upgrade-braking-visual', (data) => {
      this.brakingVisualLevel = data.level || 0;
      console.log(
        '[PlayerSystem] Braking visual level:',
        this.brakingVisualLevel
      );
    });

    // `bonus` adds hull and repairs it; `multiplier` (Glass Cannon) scales it.
    this.registerEventListener('upgrade-health-boost', (data) => {
      const bonus = data.bonus ?? 0;
      this.maxHealth = Math.round(
        (this.maxHealth + bonus) * (data.multiplier ?? 1)
      );
      this.health = Math.min(this.health + bonus, this.maxHealth);
      console.log('[PlayerSystem] Health boosted to', this.maxHealth);
    });

    // Phase Skin: invulnerability for `duration` s after a dash ends.
    this.registerEventListener('upgrade-phase-skin', (data) => {
      this.dashAfterInvulnerability = data.duration;
    });

    // Overclocked Core: the hull loses `amount` every `interval` s, never
    // below `floorFraction` of max.
    this.registerEventListener('upgrade-hull-drain', (data) => {
      this.hullDrain = data;
    });

    this.registerEventListener('upgrade-multishot', (data) => {
      this.multishot += data.bonus;
      console.log('[PlayerSystem] Multishot boosted to', this.multishot);
    });

    this.registerEventListener('upgrade-magnetism', (data) => {
      this.magnetismRadius = Math.floor(this.magnetismRadius * data.multiplier);
      console.log('[PlayerSystem] Magnetism boosted to', this.magnetismRadius);
    });

    this.registerEventListener('upgrade-deflector-shield', (data = {}) => {
      const level = Number(data.level);
      if (!Number.isFinite(level) || level <= 0) {
        return;
      }

      this.applyShieldLevel(level);
      console.log('[PlayerSystem] Deflector shield upgraded to level', level);
    });

    this.registerEventListener('weapon-fired', (data) => {
      // Apply recoil when weapon fires. Per plan 01.07 Task 2, prefer the new
      // `centerlineTarget` field (the logical aim center, recoil-correct in
      // concentrated mode where the first projectile's `target` is offset by a
      // perpendicular lane) and fall back to `target` for backward compatibility.
      const aimTarget = data?.centerlineTarget ?? data?.target;
      if (data?.position && aimTarget) {
        const dx = aimTarget.x - data.position.x;
        const dy = aimTarget.y - data.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0) {
          // Recoil opposite to firing direction
          const recoilStrength = 2.5; // pixels
          this.recoilOffset.x = -(dx / distance) * recoilStrength;
          this.recoilOffset.y = -(dy / distance) * recoilStrength;
          // ...and a small kick to the hull, the same path as the dash.
          this.velocity.vx -= (dx / distance) * SHOT_RECOIL_IMPULSE;
          this.velocity.vy -= (dy / distance) * SHOT_RECOIL_IMPULSE;
        }
      }
    });
  }

  applyShieldLevel(level) {
    const config = SHIELD_LEVEL_CONFIG[level];
    if (!config) {
      return;
    }

    this.shieldUpgradeLevel = level;
    this.shieldMaxHP = config.maxHP;
    this.shieldMaxCooldown = config.cooldown;

    if (this.isShieldActive) {
      this.shieldHP = this.shieldMaxHP;
    } else if (this.shieldCooldownTimer <= 0) {
      this.shieldHP = this.shieldMaxHP;
    } else {
      this.shieldHP = Math.min(this.shieldHP, this.shieldMaxHP);
    }

    if (level === 1) {
      this.shieldCooldownTimer = 0;
      this.shieldWasInCooldown = false;
    } else {
      this.shieldCooldownTimer = Math.min(
        this.shieldCooldownTimer,
        this.shieldMaxCooldown
      );
    }

    this.emitShieldStats();
  }

  emitShieldStats() {
    this.eventBus?.emit?.('shield-stats-changed', {
      level: this.shieldUpgradeLevel,
      maxHP: this.shieldMaxHP,
      currentHP:
        this.isShieldActive || this.shieldCooldownTimer > 0
          ? this.shieldHP
          : this.shieldMaxHP,
      isActive: this.isShieldActive,
      cooldownTimer: this.shieldCooldownTimer,
      cooldownDuration: this.shieldMaxCooldown,
    });
  }

  emitShieldActivationFailed(reason) {
    this.eventBus?.emit?.('shield-activation-failed', {
      reason,
      level: this.shieldUpgradeLevel,
    });
  }

  activateShield() {
    if (this.shieldUpgradeLevel <= 0) {
      this.emitShieldActivationFailed('locked');
      return false;
    }

    if (this.isShieldActive) {
      this.emitShieldActivationFailed('active');
      return false;
    }

    if (this.shieldCooldownTimer > 0) {
      this.emitShieldActivationFailed('cooldown');
      return false;
    }

    if (this.shieldMaxHP <= 0) {
      this.emitShieldActivationFailed('unavailable');
      return false;
    }

    this.isShieldActive = true;
    this.shieldHP = this.shieldMaxHP;
    this.shieldWasInCooldown = false;

    this.eventBus?.emit?.('shield-activated', {
      level: this.shieldUpgradeLevel,
      maxHP: this.shieldMaxHP,
    });

    this.emitShieldStats();
    return true;
  }

  shieldTookDamage(damageAmount) {
    const incomingDamage = Math.max(0, damageAmount);

    if (!this.isShieldActive || this.shieldMaxHP <= 0) {
      return incomingDamage;
    }

    const previousHP = Number.isFinite(this.shieldHP) ? this.shieldHP : 0;
    const absorbed = Math.min(previousHP, incomingDamage);
    const overflow = Math.max(0, incomingDamage - absorbed);

    this.shieldHP = Math.max(0, previousHP - absorbed);

    this.eventBus?.emit?.('shield-hit', {
      level: this.shieldUpgradeLevel,
      remainingHP: this.shieldHP,
      maxHP: this.shieldMaxHP,
      damage: absorbed,
    });

    if (this.shieldHP <= 0) {
      this.breakShield();
    } else {
      this.emitShieldStats();
    }

    return overflow;
  }

  breakShield() {
    if (!this.isShieldActive) {
      return;
    }

    this.isShieldActive = false;
    this.shieldHP = 0;

    this.eventBus?.emit?.('shield-broken', {
      level: this.shieldUpgradeLevel,
    });

    // Level 5: Deflective explosion on shield break
    if (this.shieldUpgradeLevel >= 5) {
      const position = this.getPosition();
      this.eventBus?.emit?.('shield-deflective-explosion', {
        position,
        level: this.shieldUpgradeLevel,
      });
    }

    if (this.shieldMaxCooldown > 0) {
      this.shieldCooldownTimer = this.shieldMaxCooldown;
      this.shieldWasInCooldown = true;
    } else {
      this.shieldCooldownTimer = 0;
      this.shieldWasInCooldown = false;
      this.eventBus?.emit?.('shield-recharged', {
        level: this.shieldUpgradeLevel,
      });
      this.shieldHP = this.shieldMaxHP;
    }

    this.emitShieldStats();
  }

  // === MÉTODO PRINCIPAL UPDATE ===
  update(deltaTime) {
    const commandQueue = this.getCommandQueue();
    const inputSystem = resolveService('input', this.dependencies);

    if (!inputSystem && !commandQueue) {
      console.warn('[PlayerSystem] InputSystem and CommandQueue not found');
      return;
    }

    const { consumed, binary } = this.consumeMovementCommands();
    let movement = null;

    if (consumed && binary) {
      movement = { ...binary };
    } else if (!commandQueue) {
      const legacyMovement = this.pullLegacyMovementFromInput(inputSystem);
      if (legacyMovement) {
        this.cachedMovementInput = { ...legacyMovement };
        movement = { ...legacyMovement };
      }
    }

    if (!movement) {
      movement = { ...this.cachedMovementInput };
    }
    this.aimStick = this.getAimStickDirection(movement);

    if (this.shieldCooldownTimer > 0) {
      this.shieldCooldownTimer -= deltaTime;
      if (this.shieldCooldownTimer <= 0) {
        this.shieldCooldownTimer = 0;
        if (this.shieldWasInCooldown) {
          this.shieldWasInCooldown = false;
          this.shieldHP = this.shieldMaxHP;
          this.eventBus?.emit?.('shield-recharged', {
            level: this.shieldUpgradeLevel,
          });
          this.emitShieldStats();
        } else {
          this.emitShieldStats(); // Emit stats during cooldown for UI progress bar
        }
      }
    }

    if (this.dashCooldownTimer > 0) {
      this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - deltaTime);
    }
    const dashRequested = this.dashRequested;
    this.dashRequested = false;

    // === ONLY UPDATE WHEN ALIVE: ===
    if (this.isDead || this.isRetrying) {
      return; // Don't process input, movement, or effects when dead/retrying
    }

    if (dashRequested && this.dashCooldownTimer <= 0) {
      this.startDash(movement);
    }

    this.updateMovement(deltaTime, movement);
    this.updatePosition(deltaTime);
    this.updateDash(deltaTime);
    this.updateHullDrain(deltaTime);

    // Update weapon recoil (decay over time)
    this.recoilOffset.x *= this.recoilDecay;
    this.recoilOffset.y *= this.recoilDecay;

    // Clear recoil when very small (prevent tiny jitter)
    if (Math.abs(this.recoilOffset.x) < 0.01) this.recoilOffset.x = 0;
    if (Math.abs(this.recoilOffset.y) < 0.01) this.recoilOffset.y = 0;

    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - deltaTime);
    }

    if (this.shieldHitGraceTimer > 0) {
      this.shieldHitGraceTimer = Math.max(
        0,
        this.shieldHitGraceTimer - deltaTime
      );
    }

    // Emitir evento para outros sistemas
    // Usamos o método 'emitSilently' para não poluir o console a cada frame.
    this.eventBus?.emitSilently?.('player-moved', {
      position: { ...this.position },
      velocity: { ...this.velocity },
      angle: this.angle,
    });
  }

  // === DASH ===
  resetDashState() {
    this.dashRequested = false;
    this.dashTimer = 0;
    this.dashCooldownTimer = 0;
    this.dashGhosts = [];
    this.dashGhostsDropped = 0;
  }

  /**
   * Classic: forward along the nose, or backward while only S/↓ is held.
   * Modern: along the held WASD direction, else along the nose.
   */
  startDash(movement) {
    const fwd = { x: Math.cos(this.angle), y: Math.sin(this.angle) };
    let direction;
    if (this.controlScheme === 'modern') {
      direction = this.getModernMove(movement) || fwd;
    } else {
      const sign = movement.down && !movement.up ? -1 : 1;
      direction = { x: fwd.x * sign, y: fwd.y * sign };
    }
    this.velocity.vx += direction.x * DASH_IMPULSE;
    this.velocity.vy += direction.y * DASH_IMPULSE;
    this.dashTimer = DASH_DURATION;
    this.dashCooldownTimer = this.dashCooldown;
    this.invulnerableTimer = Math.max(
      this.invulnerableTimer,
      DASH_INVULNERABILITY
    );
    this.dashGhostsDropped = 0;
    this.dropDashGhosts();
    this.eventBus?.emit?.('player-dashed', {
      position: { ...this.position },
      direction,
    });
  }

  // Afterimages spread evenly over the dash, the first at its start.
  dropDashGhosts() {
    const elapsed = DASH_DURATION - this.dashTimer;
    const interval = DASH_DURATION / (DASH_GHOST_COUNT - 1);
    const due = Math.min(
      DASH_GHOST_COUNT,
      1 + Math.floor(elapsed / interval + 1e-6)
    );
    while (this.dashGhostsDropped < due) {
      this.dashGhosts.push({
        x: this.position.x,
        y: this.position.y,
        angle: this.angle,
        age: 0,
      });
      this.dashGhostsDropped += 1;
    }
  }

  updateDash(deltaTime) {
    this.dashGhosts.forEach((ghost) => {
      ghost.age += deltaTime;
    });
    this.dashGhosts = this.dashGhosts.filter(
      (ghost) => ghost.age < DASH_GHOST_LIFE
    );
    if (this.dashTimer > 0) {
      this.dashTimer = Math.max(0, this.dashTimer - deltaTime);
      this.dropDashGhosts();
      if (this.dashTimer === 0) {
        this.invulnerableTimer = Math.max(
          this.invulnerableTimer,
          this.dashAfterInvulnerability
        );
      }
    }
  }

  updateHullDrain(deltaTime) {
    if (!this.hullDrain) return;
    const { amount, interval, floorFraction } = this.hullDrain;
    this.hullDrainTimer += deltaTime;
    while (this.hullDrainTimer >= interval) {
      this.hullDrainTimer -= interval;
      const floor = Math.ceil(this.maxHealth * floorFraction);
      if (this.health <= floor) continue;
      this.health = Math.max(floor, this.health - amount);
      this.eventBus?.emit?.('player-health-changed', {
        current: this.health,
        max: this.maxHealth,
      });
    }
  }

  /** 0 when the dash is ready, 1 right after dashing. */
  getDashCooldownFraction() {
    return this.dashCooldownTimer / this.dashCooldown;
  }

  // Cyan rim copies of the hull, fading out where the dash passed.
  renderDashGhosts(ctx, geometry, levels) {
    if (this.dashGhosts.length === 0) return;
    const sprites = this.getHullSprites(
      this.currentHull,
      levels,
      geometry,
      getRenderScale()
    );
    if (!sprites) return;
    const { half } = sprites;
    const emissive = beginEmissive(getEmissive(), ctx);
    const layers = emissive ? [ctx, emissive] : [ctx];
    layers.forEach((target) => {
      this.dashGhosts.forEach((ghost) => {
        target.save();
        target.translate(ghost.x, ghost.y);
        target.rotate(ghost.angle);
        target.globalAlpha = 0.6 * (1 - ghost.age / DASH_GHOST_LIFE);
        target.drawImage(sprites.rim, -half, -half, half * 2, half * 2);
        target.restore();
      });
    });
    emissive?.restore();
  }

  // === LÓGICA DE MOVIMENTO (COPIADA DO ORIGINAL) ===
  updateMovement(deltaTime, input) {
    // COPIAR EXATAMENTE da função updatePlayerMovement() original
    const modern = this.controlScheme === 'modern';
    const accelStep = this.acceleration * deltaTime;
    const fwd = {
      x: Math.cos(this.angle),
      y: Math.sin(this.angle),
    };
    // Ship's starboard (screen y points down).
    const right = { x: -fwd.y, y: fwd.x };

    const move = modern ? this.getModernMove(input) : null;

    // Thruster intensities (lógica do original)
    let thrMain = input.up ? 1 : 0;
    let thrAux = input.down ? 1 : 0;
    // Classic: torque. Modern: sideL pushes to starboard, sideR to port.
    let thrSideR = input.left ? 1 : 0; // CCW torque
    let thrSideL = input.right ? 1 : 0; // CW torque
    if (modern) {
      // Main flame while moving (the hull turns onto the motion); side puffs
      // on the part of the move off the nose.
      const lateral = move ? move.x * right.x + move.y * right.y : 0;
      thrMain = move ? 1 : 0;
      thrAux = 0;
      thrSideL = Math.max(0, lateral);
      thrSideR = Math.max(0, -lateral);
    }

    // Track if thrusters are manually controlled (for audio distinction)
    const isMainManual = modern ? Boolean(move) : input.up;
    const isAuxManual = !modern && input.down;

    // Auto-brake quando não há input linear
    const noLinearInput = modern ? !move : !input.up && !input.down;
    const speed = Math.hypot(this.velocity.vx, this.velocity.vy);

    if (noLinearInput) {
      this.driftFactor = Math.min(
        1,
        this.driftFactor + DRIFT_SETTINGS.rampSpeed * deltaTime
      );
    } else {
      this.driftFactor = Math.max(
        0,
        this.driftFactor - DRIFT_SETTINGS.decaySpeed * deltaTime
      );
    }

    const driftBrakeScale =
      1 - this.driftFactor * DRIFT_SETTINGS.brakeReduction;

    // Auto-damping thrusters (activate without manual input)
    if (noLinearInput && speed > 2) {
      const proj = this.velocity.vx * fwd.x + this.velocity.vy * fwd.y;
      const kBase = Math.max(
        0.35,
        Math.min(1, Math.abs(proj) / (this.maxSpeed * 0.8))
      );
      const k = kBase * driftBrakeScale;
      if (proj > 0) thrAux = Math.max(thrAux, k);
      else if (proj < 0) thrMain = Math.max(thrMain, k);
      if (modern) {
        // Coasting with the nose off the motion: brake the drift too.
        const lateral = this.velocity.vx * right.x + this.velocity.vy * right.y;
        const kLateral =
          Math.max(
            0.35,
            Math.min(1, Math.abs(lateral) / (this.maxSpeed * 0.8))
          ) * driftBrakeScale;
        if (lateral > 0) thrSideR = Math.max(thrSideR, kLateral);
        else if (lateral < 0) thrSideL = Math.max(thrSideL, kLateral);
      }
    }

    // Aplicar forças dos thrusters
    if (move) {
      // Along the WASD direction; the part off the nose (a sidestep) takes
      // the RCS strafe upgrade.
      const moveStep = accelStep * MODERN_MOVE_ACCEL;
      const along = move.x * fwd.x + move.y * fwd.y;
      const side =
        (move.x * right.x + move.y * right.y) * this.strafeMultiplier;
      this.velocity.vx += (fwd.x * along + right.x * side) * moveStep;
      this.velocity.vy += (fwd.y * along + right.y * side) * moveStep;
    } else {
      if (thrMain > 0) {
        this.velocity.vx += fwd.x * accelStep * thrMain;
        this.velocity.vy += fwd.y * accelStep * thrMain;
      }
      if (thrAux > 0) {
        this.velocity.vx -= fwd.x * accelStep * thrAux;
        this.velocity.vy -= fwd.y * accelStep * thrAux;
      }
      if (modern) {
        const strafeStep =
          accelStep * MODERN_MOVE_ACCEL * this.strafeMultiplier;
        this.velocity.vx += right.x * strafeStep * (thrSideL - thrSideR);
        this.velocity.vy += right.y * strafeStep * (thrSideL - thrSideR);
      }
    }

    // Amortecimento ambiente — FIX-02: split damping with conditional gate.
    // baseLinearDamping always applies; brakingDamping applies ONLY on frames
    // where no manual thrust input is active. This preserves the braking
    // upgrade's "Paradas mais rápidas" intent without making active flight
    // sluggish. The auto-damping thrusters (above) still fire during coast;
    // brakingDamping is the additive component layered on top of base.
    const noManualThrust = !isMainManual && !isAuxManual;
    const effectiveDamping =
      this.baseLinearDamping + (noManualThrust ? this.brakingDamping : 0);
    // A dash carries its burst undamped, under a raised speed cap.
    const dashing = this.dashTimer > 0;
    if (!dashing) {
      const linearDamp = Math.exp(-effectiveDamping * deltaTime);
      this.velocity.vx *= linearDamp;
      this.velocity.vy *= linearDamp;
    }

    // Limitar velocidade máxima
    const speedCap = dashing
      ? this.maxSpeed * DASH_SPEED_CAP_MULTIPLIER
      : this.maxSpeed;
    const currentSpeed = Math.hypot(this.velocity.vx, this.velocity.vy);
    if (currentSpeed > speedCap) {
      const scale = speedCap / currentSpeed;
      this.velocity.vx *= scale;
      this.velocity.vy *= scale;
    }

    // === MOVIMENTO ANGULAR ===
    if (modern) {
      this.updateFacing(deltaTime, move);
    } else {
      // Restaurando a lógica de aceleração e amortecimento angular do app.js original
      const rotationAccel = this.rotationSpeed * deltaTime;
      let angularAccel = 0;
      if (thrSideR) angularAccel -= rotationAccel; // 'a' ou 'arrowleft'
      if (thrSideL) angularAccel += rotationAccel; // 'd' ou 'arrowright'

      this.angularVelocity += angularAccel;

      // Amortecimento angular
      const angularDamp = Math.exp(-this.angularDamping * deltaTime);
      this.angularVelocity *= angularDamp;

      // Limitar velocidade angular (clamp)
      const maxAng = this.rotationSpeed;
      if (this.angularVelocity > maxAng) this.angularVelocity = maxAng;
      if (this.angularVelocity < -maxAng) this.angularVelocity = -maxAng;
      this.angle = this.wrapAngle(
        this.angle + this.angularVelocity * deltaTime
      );
    }
    this.updateTurret(deltaTime);

    // === EFEITOS DE THRUSTER ===
    // Emitir eventos SEMPRE (não só na mudança) para manter visuais funcionando
    // AudioSystem usa timeout de inatividade para detectar quando parar os loops

    // Main thruster (forward)
    if (thrMain > 0 || this.lastThrusterState.main > 0) {
      const mainThrusterPort = this.getHullThrusterPort('main');
      const thrusterPos = this.getLocalToWorld(
        mainThrusterPort.x,
        mainThrusterPort.y
      );
      this.eventBus?.emit?.('thruster-effect', {
        position: thrusterPos,
        direction: { x: fwd.x, y: fwd.y },
        intensity: thrMain,
        type: 'main',
        visualLevel: this.thrusterVisualLevel,
        isAutomatic: !isMainManual, // Flag para distinguir auto-damping de input manual
      });
      this.lastThrusterState.main = thrMain;
    }

    // Aux thruster (braking)
    if (thrAux > 0 || this.lastThrusterState.aux > 0) {
      const auxThrusterPort = this.getHullThrusterPort('aux');
      const thrusterPos = this.getLocalToWorld(
        auxThrusterPort.x,
        auxThrusterPort.y
      );
      this.eventBus?.emit?.('thruster-effect', {
        position: thrusterPos,
        direction: { x: -fwd.x, y: -fwd.y },
        intensity: thrAux,
        type: 'aux',
        visualLevel: this.brakingVisualLevel,
        isAutomatic: !isAuxManual, // Flag para distinguir auto-damping de input manual
      });
      this.lastThrusterState.aux = thrAux;
    }

    // Side thrusters (emit both L and R for visuals, audio will aggregate)
    if (thrSideL > 0 || this.lastThrusterState.sideL > 0) {
      const leftThrusterPort = this.getHullThrusterPort('left');
      const thrusterPos = this.getLocalToWorld(
        leftThrusterPort.x,
        leftThrusterPort.y
      );
      const dir = this.getLocalDirection(0, 1);
      this.eventBus?.emit?.('thruster-effect', {
        position: thrusterPos,
        direction: dir,
        intensity: thrSideL,
        type: 'side',
        visualLevel: this.rcsVisualLevel,
      });
      this.lastThrusterState.sideL = thrSideL;
    }

    if (thrSideR > 0 || this.lastThrusterState.sideR > 0) {
      const rightThrusterPort = this.getHullThrusterPort('right');
      const thrusterPos = this.getLocalToWorld(
        rightThrusterPort.x,
        rightThrusterPort.y
      );
      const dir = this.getLocalDirection(0, -1);
      this.eventBus?.emit?.('thruster-effect', {
        position: thrusterPos,
        direction: dir,
        intensity: thrSideR,
        type: 'side',
        visualLevel: this.rcsVisualLevel,
      });
      this.lastThrusterState.sideR = thrSideR;
    }
  }

  /**
   * Modern WASD, or the left stick's direction, as a unit vector on the
   * screen axes (W up), or null. The stick steers at full thrust like a key.
   */
  getModernMove(input) {
    const stickX = Number(input.moveX) || 0;
    const stickY = Number(input.moveY) || 0;
    const stick = Math.hypot(stickX, stickY);
    if (stick > 0) {
      return { x: stickX / stick, y: stickY / stick };
    }
    const x = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const y = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const length = Math.hypot(x, y);
    return length > 0 ? { x: x / length, y: y / length } : null;
  }

  // Modern scheme: nose onto the WASD direction, else onto the motion, else
  // hold. Exponential approach under a rate cap, so it never overshoots. RCS
  // rotation upgrades raise the cap.
  updateFacing(deltaTime, move) {
    let heading = null;
    let rate = 0;
    if (move) {
      heading = Math.atan2(move.y, move.x);
      rate = SHIP_HEADING_TURN_RATE;
    } else if (
      Math.hypot(this.velocity.vx, this.velocity.vy) >
      SHIP_FACE_VELOCITY_MIN_SPEED
    ) {
      heading = Math.atan2(this.velocity.vy, this.velocity.vx);
      rate = SHIP_MOVE_TURN_RATE;
    }
    if (heading === null) {
      this.angularVelocity = 0;
      return;
    }
    const maxStep =
      rate * (this.rotationSpeed / SHIP_ROTATION_SPEED) * deltaTime;
    const error = this.wrapAngle(heading - this.angle);
    const step = Math.max(
      -maxStep,
      Math.min(
        maxStep,
        error * (1 - Math.exp(-SHIP_FACING_RESPONSE * deltaTime))
      )
    );
    this.angle = this.wrapAngle(this.angle + step);
    this.angularVelocity = step / deltaTime;
  }

  /** Modern only: the right stick's unit direction past the engage, or null. */
  getAimStickDirection(input) {
    const x = Number(input.aimX) || 0;
    const y = Number(input.aimY) || 0;
    const magnitude = Math.hypot(x, y);
    if (this.controlScheme !== 'modern' || magnitude <= GAMEPAD_AIM_ENGAGE) {
      return null;
    }
    return { x: x / magnitude, y: y / magnitude };
  }

  /** The held right-stick aim direction for this step, or null (auto). */
  getAimStick() {
    return this.aimStick;
  }

  // Modern: the turret turns along the right stick while it is held, else
  // onto the aim point (CombatSystem's lead point) on its own, and back onto
  // the nose without one. Classic: it is the nose.
  updateTurret(deltaTime) {
    if (this.controlScheme !== 'modern') {
      this.turretAngle = this.angle;
      return;
    }
    const pivot = this.getTurretPivot();
    const goal = this.aimStick
      ? Math.atan2(this.aimStick.y, this.aimStick.x)
      : this.aimPoint
        ? Math.atan2(this.aimPoint.y - pivot.y, this.aimPoint.x - pivot.x)
        : this.angle;
    const maxStep = TURRET_TURN_RATE * deltaTime;
    const error = this.wrapAngle(goal - this.turretAngle);
    const step = Math.max(
      -maxStep,
      Math.min(maxStep, error * (1 - Math.exp(-TURRET_RESPONSE * deltaTime)))
    );
    this.turretAngle = this.wrapAngle(this.turretAngle + step);
  }

  /** CombatSystem's aim point for this step, or null without a lock. */
  setAimPoint(point) {
    this.aimPoint = point;
  }

  updatePosition(deltaTime) {
    // Integrar posição
    this.position.x += this.velocity.vx * deltaTime;
    this.position.y += this.velocity.vy * deltaTime;

    // Screen wrapping
    if (this.position.x < 0) this.position.x = GAME_WIDTH;
    if (this.position.x > GAME_WIDTH) this.position.x = 0;
    if (this.position.y < 0) this.position.y = GAME_HEIGHT;
    if (this.position.y > GAME_HEIGHT) this.position.y = 0;
  }

  // === UTILITÁRIOS ===
  computeHullMetrics(hullDefinition) {
    if (!hullDefinition) {
      return {
        outline: [],
        boundingRadius: SHIP_SIZE,
        shieldPadding: 0,
      };
    }

    const outline = Array.isArray(hullDefinition.outline)
      ? hullDefinition.outline.map((vertex) => ({
          x: Number.isFinite(vertex?.x) ? vertex.x : 0,
          y: Number.isFinite(vertex?.y) ? vertex.y : 0,
        }))
      : [];

    let boundingRadius = 0;
    outline.forEach((vertex) => {
      const radius = Math.hypot(vertex.x, vertex.y);
      if (radius > boundingRadius) {
        boundingRadius = radius;
      }
    });

    if (boundingRadius <= 0) {
      boundingRadius = SHIP_SIZE;
    }

    const shieldPadding =
      typeof hullDefinition.shieldPadding === 'number' &&
      Number.isFinite(hullDefinition.shieldPadding)
        ? hullDefinition.shieldPadding
        : 0;

    return {
      outline,
      boundingRadius,
      shieldPadding,
      outlinePath: buildClosedPath(outline),
    };
  }

  wrapAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  // Transform local ship coordinates to world
  getLocalToWorld(localX, localY) {
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    return {
      x: this.position.x + (localX * cos - localY * sin),
      y: this.position.y + (localX * sin + localY * cos),
    };
  }

  // Transform local direction to world
  getLocalDirection(dx, dy) {
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    return {
      x: dx * cos - dy * sin,
      y: dx * sin + dy * cos,
    };
  }

  getHullMetricsFor(hullDefinition = this.currentHull) {
    if (!hullDefinition) {
      return {
        outline: [],
        boundingRadius: SHIP_SIZE,
        shieldPadding: 0,
        outlinePath: null,
      };
    }

    if (hullDefinition === this.currentHull && this._currentHullMetrics) {
      return this._currentHullMetrics;
    }

    return this.computeHullMetrics(hullDefinition);
  }

  getHullThrusterPort(kind, hullDefinition = this.currentHull) {
    const hullPorts =
      hullDefinition?.thrusterPorts &&
      typeof hullDefinition.thrusterPorts === 'object'
        ? hullDefinition.thrusterPorts
        : null;
    const preferredPort =
      hullPorts && hullPorts[kind] && Number.isFinite(hullPorts[kind].x)
        ? hullPorts[kind]
        : DEFAULT_THRUSTER_PORTS[kind] || DEFAULT_THRUSTER_PORTS.main;

    return {
      x: Number.isFinite(preferredPort?.x) ? preferredPort.x : 0,
      y: Number.isFinite(preferredPort?.y) ? preferredPort.y : 0,
    };
  }

  getHullVisualLevels() {
    return {
      thruster: this.thrusterVisualLevel || 0,
      rcs: this.rcsVisualLevel || 0,
      braking: this.brakingVisualLevel || 0,
    };
  }

  getHullGeometry(hullDefinition, levels) {
    const key = `${hullDefinition.id}|${levels.thruster}|${levels.rcs}|${levels.braking}`;
    let geometry = this.hullGeometryCache.get(key);
    if (!geometry) {
      geometry = buildHullGeometry(hullDefinition.visual, levels);
      this.hullGeometryCache.set(key, geometry);
    }
    return geometry;
  }

  getHullSprites(hullDefinition, levels, geometry, pixelScale) {
    const key = `${hullDefinition.id}|${levels.thruster}|${levels.rcs}|${levels.braking}|${pixelScale}`;
    if (!this.hullSpriteCache.has(key)) {
      this.hullSpriteCache.set(key, bakeHullSprites(geometry, pixelScale));
    }
    return this.hullSpriteCache.get(key);
  }

  // Matte facets lit by the fixed world key light: the lit amount follows
  // the ship's rotation, so it is drawn live over the baked base.
  renderHullLighting(ctx, geometry, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    ctx.save();
    geometry.panels.forEach((panel) => {
      const wx = panel.facing.x * cos - panel.facing.y * sin;
      const wy = panel.facing.x * sin + panel.facing.y * cos;
      const light = wx * KEY_LIGHT_DIR.x + wy * KEY_LIGHT_DIR.y;
      ctx.globalAlpha = 0.12 + 0.88 * Math.max(0, light);
      ctx.fillStyle = PALETTE.hullLit;
      ctx.fill(panel.path);
      if (light < 0) {
        ctx.globalAlpha = -light;
        ctx.fillStyle = FILL_LIGHT;
        ctx.fill(panel.path);
      }
    });
    ctx.restore();
  }

  renderHullModel(ctx, hullDefinition = this.currentHull, options = {}) {
    if (!ctx || !hullDefinition?.visual) {
      return false;
    }

    const levels = options.levels || this.getHullVisualLevels();
    const geometry = this.getHullGeometry(hullDefinition, levels);
    const pixelScale = options.pixelScale || getRenderScale();
    const sprites = this.getHullSprites(
      hullDefinition,
      levels,
      geometry,
      pixelScale
    );
    if (!sprites) {
      return false;
    }

    const angle = Number.isFinite(options.angle) ? options.angle : this.angle;
    const thrust = options.thrust || IDLE_THRUST;
    const cone = getConeSprite(geometry.accent, pixelScale);
    const emissive = beginEmissive(options.emissive, ctx);
    const layers = emissive ? [ctx, emissive] : [ctx];

    // main thrust sits under the hull
    if (cone && thrust.main > 0.01) {
      const length = coneLength(thrust.main, levels.thruster);
      geometry.nozzles.forEach((nozzle) => {
        layers.forEach((target) =>
          drawCone(
            target,
            cone,
            nozzle.exitX,
            nozzle.y,
            Math.PI,
            length * (nozzle.r / geometry.nozzleRadius),
            nozzle.r * 5,
            thrust.main
          )
        );
      });
    }

    const { half } = sprites;
    ctx.drawImage(sprites.base, -half, -half, half * 2, half * 2);
    this.renderHullLighting(ctx, geometry, angle);
    ctx.drawImage(sprites.detail, -half, -half, half * 2, half * 2);

    if (cone && thrust.aux > 0.01) {
      geometry.retroPorts.forEach((port) => {
        layers.forEach((target) =>
          drawCone(
            target,
            cone,
            port.x,
            port.y,
            0,
            3 + 7 * thrust.aux,
            3.5,
            thrust.aux
          )
        );
      });
    }
    if (cone) {
      geometry.rcsPorts.forEach((port) => {
        const amount = port.y < 0 ? thrust.sideL : thrust.sideR;
        if (amount > 0.01) {
          layers.forEach((target) =>
            drawCone(
              target,
              cone,
              port.x,
              port.y,
              port.y < 0 ? -Math.PI / 2 : Math.PI / 2,
              2 + 5 * amount,
              3,
              amount
            )
          );
        }
      });
    }

    if (emissive) {
      emissive.drawImage(sprites.rim, -half, -half, half * 2, half * 2);
      const { cockpit } = geometry;
      emissive.lineCap = 'round';
      emissive.lineWidth = cockpit.width;
      emissive.strokeStyle = withAlpha(PALETTE.player, 0.7);
      emissive.beginPath();
      emissive.moveTo(cockpit.from.x, cockpit.from.y);
      emissive.lineTo(cockpit.to.x, cockpit.to.y);
      emissive.stroke();
      emissive.fillStyle = withAlpha(
        geometry.accent,
        0.35 + thrust.main * 0.65
      );
      geometry.nozzles.forEach((nozzle) => {
        emissive.beginPath();
        emissive.arc(nozzle.exitX, nozzle.y, nozzle.r, 0, Math.PI * 2);
        emissive.fill();
      });
      emissive.restore();
    }

    return true;
  }

  renderHullPreview(ctx, hullDefinition = this.currentHull, options = {}) {
    if (!ctx || !hullDefinition?.visual) {
      return false;
    }

    const canvas = ctx.canvas;
    if (!canvas) {
      return false;
    }

    // Native-resolution backing store for the CSS box (crisp at DPR 2).
    const cssWidth = Number.isFinite(options.width)
      ? options.width
      : canvas.clientWidth || canvas.width;
    const cssHeight = Number.isFinite(options.height)
      ? options.height
      : canvas.clientHeight || canvas.height;
    if (!Number.isFinite(options.width) && canvas.clientWidth > 0) {
      const dpr = resolveDevicePixelRatio();
      const width = Math.round(cssWidth * dpr);
      const height = Math.round(cssHeight * dpr);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    }
    const pixelRatio = canvas.width / cssWidth;

    const padding = Number.isFinite(options.padding)
      ? Math.max(0, options.padding)
      : 10;
    const levels = { thruster: 0, rcs: 0, braking: 0 };
    const geometry = this.getHullGeometry(hullDefinition, levels);
    const tailX = geometry.minNozzleX - coneLength(PREVIEW_THRUST, 0);
    const minX = Math.min(geometry.minX, tailX);
    const spanX = Math.max(1, geometry.maxX - minX);
    const spanY = Math.max(1, geometry.maxY * 2);
    // nose points up: ship x runs along the preview's height
    const scale = Math.min(
      Math.max(1, cssWidth - padding * 2) / spanY,
      Math.max(1, cssHeight - padding * 2) / spanX
    );

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (options.clear !== false) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.translate(cssWidth / 2, cssHeight / 2);
    ctx.scale(scale, scale);
    ctx.rotate(PREVIEW_ANGLE);
    ctx.translate(-(geometry.maxX + minX) / 2, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    this.renderHullModel(ctx, hullDefinition, {
      levels,
      angle: PREVIEW_ANGLE,
      pixelScale: scale * pixelRatio,
      thrust: { main: PREVIEW_THRUST, aux: 0, sideL: 0, sideR: 0 },
    });
    ctx.restore();
    return true;
  }

  // === GETTERS PÚBLICOS ===
  getPosition() {
    return { ...this.position };
  }

  getAngle() {
    return this.angle;
  }

  getVelocity() {
    return { ...this.velocity };
  }

  getAngularVelocity() {
    return this.angularVelocity;
  }

  getMagnetismRadius() {
    return this.magnetismRadius;
  }

  getHullOutline() {
    if (
      !this._currentHullMetrics ||
      !Array.isArray(this._currentHullMetrics.outline)
    ) {
      return [];
    }

    return this._currentHullMetrics.outline.map((vertex) => ({ ...vertex }));
  }

  getHullBoundingRadius() {
    if (
      this._currentHullMetrics &&
      typeof this._currentHullMetrics.boundingRadius === 'number'
    ) {
      return this._currentHullMetrics.boundingRadius;
    }

    return SHIP_SIZE;
  }

  getShieldPadding() {
    if (
      this._currentHullMetrics &&
      typeof this._currentHullMetrics.shieldPadding === 'number'
    ) {
      return this._currentHullMetrics.shieldPadding;
    }

    return 0;
  }

  getShieldRadius() {
    return this.getHullBoundingRadius() + this.getShieldPadding();
  }

  getTurretAngle() {
    return this.turretAngle;
  }

  /** World point the turret turns on, on the hull's centreline. */
  getTurretPivot() {
    return this.getLocalToWorld(TURRET_PIVOT_X, 0);
  }

  /** World point lances and the beam leave from: the turret's barrel tip. */
  getMuzzlePoint() {
    const pivot = this.getTurretPivot();
    return {
      x: pivot.x + Math.cos(this.turretAngle) * TURRET_BARREL_LENGTH,
      y: pivot.y + Math.sin(this.turretAngle) * TURRET_BARREL_LENGTH,
    };
  }

  getShieldImpactProfile() {
    if (this.shieldUpgradeLevel <= 0) {
      return { damage: 0, forceMultiplier: 1, level: 0 };
    }

    const level = this.shieldUpgradeLevel;
    const damage =
      SHIELD_IMPACT_DAMAGE_BASE +
      SHIELD_IMPACT_DAMAGE_PER_LEVEL * Math.max(0, level - 1);
    const forceMultiplier = 1 + Math.max(0, level - 1) * 0.22;

    return { damage, forceMultiplier, level };
  }

  // Smoothed thruster intensities for the cone (input is on/off).
  updateThrusterVisual() {
    const visual = this.thrusterVisual;
    const target = this.lastThrusterState;
    ['main', 'aux', 'sideL', 'sideR'].forEach((key) => {
      visual[key] += ((target[key] || 0) - visual[key]) * 0.35;
      if (visual[key] < 0.005) visual[key] = 0;
    });
    return visual;
  }

  // Persistent light trail behind the main nozzles (world space).
  renderThrusterTrail(ctx, emissive, geometry, intensity) {
    const trail = this.thrusterTrail;
    const exit = this.getLocalToWorld(geometry.minNozzleX, 0);
    const slot = trail.points[trail.head];
    slot.x = exit.x;
    slot.y = exit.y;
    slot.i = intensity;
    trail.head = (trail.head + 1) % THRUSTER_TRAIL_LENGTH;
    trail.count = Math.min(THRUSTER_TRAIL_LENGTH, trail.count + 1);
    if (trail.count < 2) return;

    const layers = emissive ? [ctx, emissive] : [ctx];
    const start = trail.head - trail.count + THRUSTER_TRAIL_LENGTH;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    layers.forEach((target) => {
      target.lineCap = 'round';
    });
    for (let k = 1; k < trail.count; k += 1) {
      const a = trail.points[(start + k - 1) % THRUSTER_TRAIL_LENGTH];
      const b = trail.points[(start + k) % THRUSTER_TRAIL_LENGTH];
      const strength = Math.min(a.i, b.i);
      if (strength < 0.02) continue;
      if (Math.hypot(b.x - a.x, b.y - a.y) > TRAIL_BREAK_DISTANCE) continue;
      const age = k / (trail.count - 1);
      layers.forEach((target) => {
        target.strokeStyle = withAlpha(geometry.accent, 0.5 * age * strength);
        target.lineWidth = (0.5 + 2.5 * age) * strength;
        target.beginPath();
        target.moveTo(a.x, a.y);
        target.lineTo(b.x, b.y);
        target.stroke();
      });
    }
    ctx.restore();
  }

  render(ctx, options = {}) {
    if (!ctx) return;
    if (this.isDead || this._quitExplosionHidden) return;
    if (!this.currentHull?.visual) return;

    const tilt = typeof options.tilt === 'number' ? options.tilt : 0;
    const thrust = this.updateThrusterVisual();
    const levels = this.getHullVisualLevels();
    const geometry = this.getHullGeometry(this.currentHull, levels);
    const emissive = beginEmissive(getEmissive(), ctx);
    this.renderThrusterTrail(ctx, emissive, geometry, thrust.main);
    emissive?.restore();
    this.renderDashGhosts(ctx, geometry, levels);

    ctx.save();
    ctx.translate(this.position.x, this.position.y);
    ctx.rotate(this.angle);

    if (tilt !== 0) {
      ctx.transform(1, 0, tilt, 1, 0, 0);
    }

    this.renderHullModel(ctx, this.currentHull, {
      levels,
      angle: this.angle,
      thrust,
      emissive: getEmissive(),
    });
    if (this.controlScheme === 'modern') this.renderTurret(ctx);

    ctx.restore();
  }

  // Dorsal turret in hull-local space: a round base, twin barrels out to
  // the muzzle and an amber lens, turned to the turret's own heading.
  renderTurret(ctx) {
    ctx.save();
    ctx.translate(TURRET_PIVOT_X, 0);
    ctx.rotate(this.turretAngle - this.angle);
    ctx.fillStyle = PALETTE.neutral;
    ctx.fillRect(1, -2, TURRET_BARREL_LENGTH - 1, 1.4);
    ctx.fillRect(1, 0.6, TURRET_BARREL_LENGTH - 1, 1.4);
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.hull;
    ctx.fill();
    ctx.lineWidth = LINE.hair;
    ctx.strokeStyle = withAlpha(PALETTE.player, 0.8);
    ctx.stroke();
    const emissive = beginEmissive(getEmissive(), ctx);
    [ctx, emissive].forEach((target) => {
      if (!target) return;
      target.fillStyle = PALETTE.shot;
      target.beginPath();
      target.arc(1.6, 0, 1, 0, Math.PI * 2);
      target.fill();
    });
    emissive?.restore();
    ctx.restore();
  }

  // === GERENCIAMENTO DE VIDA ===
  // `source`: the enemy (or its snapshot) that dealt the hit; the last one to
  // reach the hull is kept by value (enemies are pooled) for the death recap.
  // Every hit is scaled by the difficulty preset's enemyDamage.
  takeDamage(amount, source = null) {
    const damageAmount =
      Math.max(0, amount) *
      (resolveService('difficulty', this.dependencies)?.getModifiers()
        .enemyDamage ?? 1);
    if (damageAmount <= 0) {
      return this.health;
    }

    let remainingDamage = damageAmount;

    if (this.isShieldActive) {
      const overflow = this.shieldTookDamage(damageAmount);
      if (!Number.isFinite(overflow) || overflow <= 0) {
        return this.health;
      }

      remainingDamage = Math.max(0, overflow);
    }

    const previousHealth = this.health;
    this.health = Math.max(0, this.health - remainingDamage);

    if (this.health !== previousHealth) {
      this.lastDamageSource = source?.type
        ? {
            type: source.type,
            displayName: source.displayName ?? null,
            elite: Boolean(source.elite),
            bossKind: source.bossKind ?? null,
          }
        : null;
      this.eventBus?.emit?.('player-health-changed', {
        current: this.health,
        max: this.maxHealth,
      });
    }

    return this.health;
  }

  setInvulnerableTimer(duration) {
    this.invulnerableTimer = duration;
  }

  getStats() {
    return {
      health: this.health,
      maxHealth: this.maxHealth,
      maxHP: this.maxHealth, // Alias for consistency
      damage: this.damage,
      multishot: this.multishot,
      magnetismRadius: this.magnetismRadius,
      shieldLevel: this.shieldUpgradeLevel,
      shieldMaxHP: this.shieldMaxHP,
      shieldCooldown: this.shieldMaxCooldown,
      recoilOffset: this.recoilOffset, // Expose recoil for rendering
    };
  }

  // === SETTERS (para reset, teleport, etc.) ===
  setHull(hullDefinition) {
    if (!hullDefinition) {
      this.currentHull = null;
      this._currentHullMetrics = {
        outline: [],
        boundingRadius: SHIP_SIZE,
        shieldPadding: 0,
      };
      return false;
    }

    const previous = this.currentHull;
    this.currentHull = hullDefinition;
    this._currentHullMetrics = this.computeHullMetrics(hullDefinition);
    // A different hull flies with its own stats (the run start sets the hull
    // right after the reset).
    if (previous && previous.id !== hullDefinition.id) this.resetStats();
    return true;
  }

  setPosition(x, y) {
    this.position.x = x;
    this.position.y = y;
  }

  setAngle(angle) {
    this.angle = this.wrapAngle(angle);
  }

  resetShieldState() {
    this.shieldUpgradeLevel = 0;
    this.shieldMaxHP = 0;
    this.shieldHP = 0;
    this.shieldCooldownTimer = 0;
    this.shieldMaxCooldown = 0;
    this.shieldWasInCooldown = false;
    this.isShieldActive = false;
  }

  getShieldState() {
    return {
      isActive: this.isShieldActive,
      maxHits: this.shieldMaxHP,
      currentHits: this.shieldHP,
      isCooldown: this.shieldCooldownTimer > 0,
    };
  }

  resetStats() {
    // The Hangar's permanent upgrades, read once per run.
    const hangar =
      resolveService('hangar', this.dependencies)?.getModifiers() ??
      BASE_MODIFIERS;
    // The hull's own flight stats (shipModels.js), before the Hangar's.
    const hull = (this.currentHull ?? shipModels.defaultHull).stats;
    this.maxHealth = Math.round(100 * hull.maxHealth * hangar.hullMultiplier);
    this.health = this.maxHealth;
    this.damage = 25;
    this.multishot = 1;
    this.magnetismRadius = MAGNETISM_RADIUS * hangar.pickupRadiusMultiplier;
    this.dashCooldown =
      DASH_COOLDOWN * hull.dashCooldown * hangar.dashCooldownMultiplier;
    this.dashAfterInvulnerability = 0;
    this.hullDrain = null;
    this.hullDrainTimer = 0;
    this.maxSpeed = SHIP_MAX_SPEED * hull.maxSpeed;
    this.acceleration = SHIP_ACCELERATION * hull.acceleration;
    this.rotationSpeed = SHIP_ROTATION_SPEED;
    this.strafeMultiplier = 1;
    // FIX-02: split damping — reset both components. baseLinearDamping returns
    // to ship default; brakingDamping clears any accumulated braking_system
    // upgrade contribution.
    this.baseLinearDamping = SHIP_LINEAR_DAMPING;
    this.brakingDamping = 0;
    this.angularDamping = SHIP_ANGULAR_DAMPING;
    this.invulnerableTimer = 0;
    this.driftFactor = 0;

    // Reset visual upgrade levels
    this.thrusterVisualLevel = 0;
    this.rcsVisualLevel = 0;
    this.brakingVisualLevel = 0;

    this.resetShieldState();
  }

  reset() {
    super.reset();

    // Force stop all thruster sounds before reset
    this._stopAllThrusterSounds();

    this.resetStats();
    this.position = {
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2,
    };
    this.velocity = { vx: 0, vy: 0 };
    this.angle = 0;
    this.turretAngle = 0;
    this.angularVelocity = 0;
    this.aimPoint = null;
    this.aimStick = null;
    this.driftFactor = 0;
    this.resetDashState();
    this._quitExplosionHidden = false; // Reset visibility flag
    this.lastDamageSource = null;
    this.isDead = false;
    this.isRetrying = false;
  }

  markDead() {
    this.isDead = true;
    this.isRetrying = false;

    // Force stop all thruster sounds
    this._stopAllThrusterSounds();

    console.log('[PlayerSystem] Player marked as dead');
  }

  /**
   * Force stops all thruster sounds by emitting events with intensity 0
   * Called when player dies or game resets
   */
  _stopAllThrusterSounds() {
    const eventBus = this.eventBus;
    if (!eventBus?.emit) return;

    // Emit stop events for all thruster types
    if (this.lastThrusterState.main > 0) {
      eventBus.emit('thruster-effect', {
        position: this.position,
        direction: { x: 0, y: -1 },
        intensity: 0,
        type: 'main',
        visualLevel: this.thrusterVisualLevel,
      });
    }

    if (this.lastThrusterState.aux > 0) {
      eventBus.emit('thruster-effect', {
        position: this.position,
        direction: { x: 0, y: 1 },
        intensity: 0,
        type: 'aux',
        visualLevel: this.brakingVisualLevel,
      });
    }

    const sideIntensity = Math.max(
      this.lastThrusterState.sideL,
      this.lastThrusterState.sideR
    );
    if (sideIntensity > 0) {
      eventBus.emit('thruster-effect', {
        position: this.position,
        direction: { x: 1, y: 0 },
        intensity: 0,
        type: 'side',
        visualLevel: this.rcsVisualLevel,
      });
    }

    // Reset state
    this.lastThrusterState = {
      main: 0,
      aux: 0,
      sideL: 0,
      sideR: 0,
    };
  }

  respawn(position, invulnerabilityDuration = 3) {
    this.isDead = false;
    this.isRetrying = false;

    if (position) {
      this.position.x = position.x;
      this.position.y = position.y;
    }

    // Reset velocity and rotation
    this.velocity.vx = 0;
    this.velocity.vy = 0;
    this.angularVelocity = 0;
    this.turretAngle = this.angle;
    this.aimPoint = null;
    this.aimStick = null;
    this.driftFactor = 0;
    this.resetDashState();

    // Reset thruster state to stop any active sounds
    this.lastThrusterState = {
      main: 0,
      aux: 0,
      sideL: 0,
      sideR: 0,
    };

    // Give invulnerability
    this.invulnerableTimer = invulnerabilityDuration;

    // Show ship again
    this._quitExplosionHidden = false;

    console.log(
      '[PlayerSystem] Player respawned at',
      position,
      'with',
      invulnerabilityDuration,
      's invulnerability'
    );
  }

  heal(amount) {
    if (this.isDead) return 0;

    const oldHealth = this.health;
    this.health = Math.min(this.maxHealth, this.health + amount);
    const actualHealing = this.health - oldHealth;

    if (actualHealing > 0) {
      this.eventBus?.emit?.('player-healed', {
        amount: actualHealing,
        currentHealth: this.health,
        maxHealth: this.maxHealth,
      });
    }

    return actualHealing;
  }

  destroy() {
    console.log('[PlayerSystem] Destroyed');
  }
}

export default PlayerSystem;
