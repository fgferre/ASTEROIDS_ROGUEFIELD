// src/modules/PlayerSystem.js
import { BaseSystem } from '../core/BaseSystem.js';
import { GAME_HEIGHT, GAME_WIDTH, SHIP_SIZE } from '../core/GameConstants.js';
import shipModels from '../data/shipModels.js';
import { HullArt } from './player/hullArt.js';
import { computeHullMetrics, getHullThrusterPort } from './player/hullShape.js';
import { PlayerFlight, wrapAngle } from './player/flight.js';
import { PlayerManeuvers } from './player/maneuvers.js';
import { getAimStickDirection, MovementInput } from './player/movementInput.js';
import { PlayerShield } from './player/shield.js';
import { PlayerThrusters } from './player/thrusters.js';
import { resolveService } from '../core/serviceUtils.js';
import { BASE_MODIFIERS } from '../data/hangar.js';
import {
  SHIP_ACCELERATION,
  SHIP_ANGULAR_DAMPING,
  SHIP_LINEAR_DAMPING,
  SHIP_MAX_SPEED,
  SHIP_ROTATION_SPEED,
  TURRET_BARREL_LENGTH,
  TURRET_PIVOT_X,
  TURRET_RESPONSE,
  TURRET_TURN_RATE,
} from '../data/constants/physics.js';
import { UPGRADE_FAMILIES } from '../data/upgrades/families.js';
import {
  DASH_COOLDOWN,
  MAGNETISM_RADIUS,
  SHOT_RECOIL_IMPULSE,
} from '../data/constants/gameplay.js';

// 'modern' (NORTE §4b): WASD moves on the screen axes and the hull faces the
// motion. 'classic': A/D rotate, W thrusts, Asteroids-style. The turret aims
// on its own in both. Settings → Controls → Hull Control, or ?controls=classic.

// 'classic' for `?controls=classic`, else null.
function controlSchemeFromUrl() {
  try {
    const value = new URLSearchParams(window.location.search).get('controls');
    if (value === 'classic') return 'classic';
  } catch {
    // no window (Node tests)
  }
  return null;
}

/** The scheme to fly: the URL flag wins over the Hull Control setting. */
export function resolveControlScheme(setting) {
  return (
    controlSchemeFromUrl() || (setting === 'classic' ? 'classic' : 'modern')
  );
}

// Each of `names` on `target` reads and sets that field on `owner`, live: a
// player module's fields other systems and tests still use on the player,
// and the player's own fields the modules use through their `ship` view.
function exposeFields(target, owner, names) {
  names.forEach((name) => {
    Object.defineProperty(target, name, {
      get: () => owner[name],
      set: (value) => {
        owner[name] = value;
      },
      configurable: true,
      enumerable: true,
    });
  });
}

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
    this.movementInput = new MovementInput({
      dependencies: this.dependencies,
    });
    exposeFields(this, this.movementInput, ['cachedMovementInput']);
    this.controlScheme =
      config?.controlScheme ||
      resolveControlScheme(
        resolveService('settings', this.dependencies)?.getCategoryValues(
          'controls'
        )?.hullControl
      );
    // World point CombatSystem aims at (null without a lock), set each step.
    this.aimPoint = null;
    // Right-stick direction (unit) while it is held past GAMEPAD_AIM_ENGAGE.
    this.aimStick = null;
    const startX = Number.isFinite(position?.x) ? position.x : GAME_WIDTH / 2;
    const startY = Number.isFinite(position?.y) ? position.y : GAME_HEIGHT / 2;

    // === APENAS MOVIMENTO E POSIÇÃO ===
    this.position = { x: startX, y: startY };
    this.velocity = { vx: 0, vy: 0 };
    this.angle = 0;
    // Weapon heading: the turret's, on the aim point in both schemes.
    this.turretAngle = 0;
    // Multi-lock (Targeting Matrix rank 3): the headings of the turret's
    // layers past the first, one per potential lock past the primary, and
    // the locks they turn onto (Weapons.getLockAims, or null).
    this.turretLayers = [];
    this.lockAims = null;
    this.targetAngle = 0; // Para rotação suave (futuro)
    this.angularVelocity = 0;

    // The ship's own fields the player modules read and set, live: other
    // systems and tests replace them, so no module keeps a copy.
    const ship = {};
    exposeFields(ship, this, [
      'position',
      'velocity',
      'angle',
      'angularVelocity',
      'controlScheme',
      'invulnerableTimer',
      '_quitExplosionHidden',
    ]);
    this.maneuvers = new PlayerManeuvers({
      ship,
      getEventBus: () => this.eventBus,
    });
    exposeFields(this, this.maneuvers, [
      'dashTimer',
      'dashCooldownTimer',
      'dashCooldown',
      'dashGhosts',
      'dashGhostsDropped',
      'dashRammed',
      'dashContactDamage',
    ]);
    this.flight = new PlayerFlight({ ship, maneuvers: this.maneuvers });
    exposeFields(this, this.flight, [
      'driftFactor',
      'maxSpeed',
      'acceleration',
      'brakingDamping',
      'linearDamping',
    ]);

    // === STATS DO JOGADOR ===
    this.health = 100;
    this.maxHealth = 100;
    this.damage = 25;
    this.multishot = 1;
    this.magnetismRadius = MAGNETISM_RADIUS;
    this.hullDrain = null;
    this.hullDrainTimer = 0;
    this.resetCardStats();
    // No thrust key held and no dash this step (updateMovement): Reactor
    // Bleed and Grav Anchor read it.
    this.enginesIdle = true;
    this.currentHull = null;
    this._currentHullMetrics = {
      outline: [],
      boundingRadius: SHIP_SIZE,
      shieldPadding: 0,
    };
    this.hullArt = new HullArt();
    this.setHull(shipModels.defaultHull);

    this.thrusters = new PlayerThrusters({
      getEventBus: () => this.eventBus,
      getShipPosition: () => this.position,
      getThrusterPort: (kind) => getHullThrusterPort(kind, this.currentHull),
      getLocalToWorld: (x, y) => this.getLocalToWorld(x, y),
      getLocalDirection: (dx, dy) => this.getLocalDirection(dx, dy),
    });
    exposeFields(this, this.thrusters, ['lastThrusterState', 'thrusterVisual']);

    // === WEAPON RECOIL ===
    this.recoilOffset = { x: 0, y: 0 };
    this.recoilDecay = 0.85; // Fast decay for snappy feel

    this.shield = new PlayerShield({
      getEventBus: () => this.eventBus,
      getPosition: () => this.getPosition(),
    });
    exposeFields(this, this.shield, [
      'isShieldActive',
      'shieldHP',
      'shieldMaxHP',
    ]);
    this.invulnerableTimer = 0;
    // A Warden's entrance holds the ship (holdControls).
    this.controlHoldTimer = 0;

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

  setupEventListeners() {
    // Applied in the next update, once this step's movement input is known.
    this.registerEventListener('dash-pressed', () => {
      this.maneuvers.dashRequested = true;
    });

    // Hull Control applies live, mid-run too.
    this.registerEventListener('settings-controls-changed', (payload = {}) => {
      if (payload?.values) {
        this.controlScheme = resolveControlScheme(payload.values.hullControl);
      }
    });

    this.registerEventListener('upgrade-damage-boost', (data) => {
      this.damage = Math.floor(this.damage * data.multiplier);
      console.log('[PlayerSystem] Damage boosted to', this.damage);
    });

    this.registerEventListener('upgrade-speed-boost', (data) => {
      this.flight.maxSpeed = Math.floor(this.flight.maxSpeed * data.multiplier);
      console.log('[PlayerSystem] Speed boosted to', this.flight.maxSpeed);
    });

    this.registerEventListener('upgrade-acceleration-boost', (data) => {
      this.flight.acceleration = this.flight.acceleration * data.multiplier;
      console.log(
        '[PlayerSystem] Acceleration boosted to',
        this.flight.acceleration
      );
    });

    // RCS System: snappier thrust, same top speed (flight.js).
    this.registerEventListener('upgrade-thrust-agility', (data) => {
      this.flight.agility = data.multiplier;
    });

    this.registerEventListener('upgrade-linear-damping', (data) => {
      // FIX-02: mutate brakingDamping only. baseLinearDamping is invariant.
      // Formula preserves the upgrade catalog's intent: "multiplier 1.30" means
      // "+30% damping during stops" — applied to the cumulative effective total,
      // then projected back onto the braking-only component.
      const previousTotal =
        this.flight.baseLinearDamping + this.flight.brakingDamping;
      const newTotal = previousTotal * data.multiplier;
      this.flight.brakingDamping = Math.max(
        0,
        newTotal - this.flight.baseLinearDamping
      );
      console.log(
        '[PlayerSystem] Braking damping adjusted to',
        this.flight.brakingDamping
      );
    });

    this.registerEventListener('upgrade-thruster-visual', (data) => {
      this.thrusters.thrusterVisualLevel = data.level || 0;
      console.log(
        '[PlayerSystem] Thruster visual level:',
        this.thrusters.thrusterVisualLevel
      );
    });

    this.registerEventListener('upgrade-rcs-visual', (data) => {
      this.thrusters.rcsVisualLevel = data.level || 0;
      console.log(
        '[PlayerSystem] RCS visual level:',
        this.thrusters.rcsVisualLevel
      );
    });

    this.registerEventListener('upgrade-braking-visual', (data) => {
      this.thrusters.brakingVisualLevel = data.level || 0;
      console.log(
        '[PlayerSystem] Braking visual level:',
        this.thrusters.brakingVisualLevel
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

    // Cards that change what a hit does to the hull or the shot's damage
    // (takeDamage, getStats); each keeps its latest rank's number.
    this.registerEventListener('upgrade-reactor-bleed', (data) => {
      this.idleDamageMultiplier = data.idleDamageMultiplier;
    });
    this.registerEventListener('upgrade-idle-guard', (data) => {
      this.idleDamageReduction = data.damageReduction;
    });
    this.registerEventListener('upgrade-hull-armor', (data) => {
      this.hullArmor = data.armor;
    });
    // Scrap Compactor and Blood Ledger: repairs on a level-up, on a Warden.
    this.registerEventListener('upgrade-level-up-repair', (data) => {
      this.levelUpRepair = data.repair;
    });
    this.registerEventListener('upgrade-boss-repair', (data) => {
      this.bossRepairFraction = data.fraction;
    });
    this.registerEventListener('player-leveled-up', () => {
      if (this.levelUpRepair > 0) this.heal(this.levelUpRepair);
    });
    this.registerEventListener('boss-defeated', () => {
      if (this.bossRepairFraction > 0) {
        this.heal(this.maxHealth * this.bossRepairFraction);
      }
    });

    // Phase Skin: invulnerability for `duration` s after a dash ends.
    this.registerEventListener('upgrade-phase-skin', (data) => {
      this.maneuvers.dashAfterInvulnerability = data.duration;
    });

    // Braking System 3: the hold-S emergency brake (updateEmergencyBrake).
    this.registerEventListener('upgrade-emergency-brake', (data) => {
      this.maneuvers.emergencyBrake = data;
    });

    // Maneuver cards. Afterburner: on top of the hull × Hangar cooldown.
    this.registerEventListener('upgrade-dash-cooldown', (data) => {
      this.maneuvers.dashCooldown *= data.multiplier;
    });
    // Ram Plating: PhysicsSystem hits each enemy a dash touches once.
    this.registerEventListener('upgrade-ram-plating', (data) => {
      this.maneuvers.dashContactDamage = data.damage;
    });
    this.registerEventListener('upgrade-reactive-brake', (data) => {
      this.maneuvers.reactiveBrake = data;
    });
    // Inertial Dampers: a faster dash under a higher cap goes further.
    this.registerEventListener('upgrade-dash-distance', (data) => {
      this.maneuvers.dashDistanceMultiplier *= data.multiplier;
    });
    // Ghost Drive: spare dash charges, ready at once.
    this.registerEventListener('upgrade-phase-dash', (data) => {
      this.maneuvers.dashSpareMax = data.extraCharges;
      this.maneuvers.dashSpare = data.extraCharges;
      this.maneuvers.dashGhostLinger = data.ghostLinger;
    });
    // Maneuver's Apex has no weapon: the dash becomes Blink (startDash).
    this.registerEventListener('apex-unlocked', ({ family } = {}) => {
      if (family === UPGRADE_FAMILIES.maneuver.id) {
        this.maneuvers.blink = UPGRADE_FAMILIES.maneuver.apex;
      }
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

      this.shield.applyShieldLevel(level);
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

  activateShield() {
    return this.shield.activateShield();
  }

  // === MÉTODO PRINCIPAL UPDATE ===
  update(deltaTime) {
    const commandQueue = this.movementInput.getCommandQueue();
    const inputSystem = resolveService('input', this.dependencies);

    if (!inputSystem && !commandQueue) {
      console.warn('[PlayerSystem] InputSystem and CommandQueue not found');
      return;
    }

    let movement = this.movementInput.readMovement(commandQueue, inputSystem);
    this.aimStick = getAimStickDirection(movement);

    this.shield.updateCooldown(deltaTime);

    let dashRequested = this.maneuvers.takeDashRequest(deltaTime);

    // === ONLY UPDATE WHEN ALIVE: ===
    if (this.isDead || this.isRetrying) {
      return; // Don't process input, movement, or effects when dead/retrying
    }

    // Held, the input is read (so nothing queues up) and dropped.
    if (this.controlHoldTimer > 0) {
      this.controlHoldTimer = Math.max(0, this.controlHoldTimer - deltaTime);
      movement = this.movementInput.getDefaultMovementBinary();
      this.aimStick = null;
      dashRequested = false;
    }

    if (dashRequested && this.maneuvers.canDash()) {
      this.maneuvers.startDash(movement);
    }

    this.updateMovement(deltaTime, movement);
    this.maneuvers.updateEmergencyBrake(deltaTime, movement);
    this.updatePosition(deltaTime);
    this.maneuvers.updateDash(deltaTime);
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

  getDashCooldownFraction() {
    return this.maneuvers.getDashCooldownFraction();
  }

  // === LÓGICA DE MOVIMENTO (COPIADA DO ORIGINAL) ===
  updateMovement(deltaTime, input) {
    const thrust = this.flight.updateMovement(deltaTime, input);
    this.enginesIdle =
      !thrust.isMainManual &&
      !thrust.isAuxManual &&
      !(this.maneuvers.dashTimer > 0);
    this.updateTurret(deltaTime);
    this.thrusters.emitThrusterEffects(thrust);
  }

  /** The held right-stick aim direction for this step, or null (auto). */
  getAimStick() {
    return this.aimStick;
  }

  // Both schemes: the turret turns along the right stick while it is held,
  // else onto the aim point (CombatSystem's lead point) on its own, and back
  // onto the nose without one.
  updateTurret(deltaTime) {
    const pivot = this.getTurretPivot();
    const goal = this.aimStick
      ? Math.atan2(this.aimStick.y, this.aimStick.x)
      : this.aimPoint
        ? Math.atan2(this.aimPoint.y - pivot.y, this.aimPoint.x - pivot.x)
        : this.angle;
    this.turretAngle = this.turnTurret(this.turretAngle, goal, deltaTime);
    // Each extra layer turns onto its own lock the same way; without one it
    // follows the turret.
    for (let i = 0; i < this.turretLayers.length; i += 1) {
      const aim = this.lockAims?.[i + 1]?.point;
      const layerGoal = aim
        ? Math.atan2(aim.y - pivot.y, aim.x - pivot.x)
        : this.turretAngle;
      this.turretLayers[i] = this.turnTurret(
        this.turretLayers[i],
        layerGoal,
        deltaTime
      );
    }
  }

  // One step of a turret heading onto `goal`: an exponential approach,
  // capped at the turn rate.
  turnTurret(angle, goal, deltaTime) {
    const maxStep = TURRET_TURN_RATE * deltaTime;
    const error = wrapAngle(goal - angle);
    const step = Math.max(
      -maxStep,
      Math.min(maxStep, error * (1 - Math.exp(-TURRET_RESPONSE * deltaTime)))
    );
    return wrapAngle(angle + step);
  }

  /** CombatSystem's aim point for this step, or null without a lock. */
  setAimPoint(point) {
    this.aimPoint = point;
  }

  /**
   * Multi-lock: the turret has `count` layers (Targeting's potential lock
   * count; 1 is the turret alone) and layer i turns onto `lockAims[i]`
   * (Weapons.getLockAims, or null). A new layer starts on the turret.
   */
  setTurretLayers(count, lockAims) {
    this.lockAims = lockAims;
    const extra = Math.max(0, count - 1);
    while (this.turretLayers.length < extra) {
      this.turretLayers.push(this.turretAngle);
    }
    this.turretLayers.length = extra;
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

    return computeHullMetrics(hullDefinition);
  }

  getHullVisualLevels() {
    return this.thrusters.getHullVisualLevels();
  }

  getHullGeometry(hullDefinition, levels) {
    return this.hullArt.getHullGeometry(hullDefinition, levels);
  }

  renderHullPreview(ctx, hullDefinition = this.currentHull, options = {}) {
    return this.hullArt.renderHullPreview(ctx, hullDefinition, options);
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

  /**
   * World point lances and the beam leave from: the turret's barrel tip.
   * With `toward` (multi-lock), the tip of the turret layer aimed at that
   * point, wherever the layer has turned so far.
   */
  getMuzzlePoint(toward = null) {
    const pivot = this.getTurretPivot();
    const angle = toward
      ? Math.atan2(toward.y - pivot.y, toward.x - pivot.x)
      : this.turretAngle;
    return {
      x: pivot.x + Math.cos(angle) * TURRET_BARREL_LENGTH,
      y: pivot.y + Math.sin(angle) * TURRET_BARREL_LENGTH,
    };
  }

  getShieldImpactProfile() {
    return this.shield.getShieldImpactProfile();
  }

  updateThrusterVisual() {
    return this.thrusters.updateThrusterVisual();
  }

  // === GERENCIAMENTO DE VIDA ===
  // `source`: the enemy (or its snapshot) that dealt the hit; the last one to
  // reach the hull is kept by value (enemies are pooled) for the death recap.
  // Every hit is scaled by the difficulty preset's enemyDamage.
  // Grav Anchor cuts the hit while the engines are idle; Ablative Plating
  // takes a fixed bite off what reaches the hull.
  takeDamage(amount, source = null) {
    const damageAmount =
      Math.max(0, amount) *
      (resolveService('difficulty', this.dependencies)?.getModifiers()
        .enemyDamage ?? 1) *
      (this.enginesIdle ? 1 - this.idleDamageReduction : 1);
    if (damageAmount <= 0) {
      return this.health;
    }

    let remainingDamage = damageAmount;

    if (this.shield.isShieldActive) {
      const overflow = this.shield.shieldTookDamage(damageAmount);
      if (!Number.isFinite(overflow) || overflow <= 0) {
        return this.health;
      }

      remainingDamage = Math.max(0, overflow);
    }
    if (this.hullArmor > 0 && remainingDamage > 0) {
      remainingDamage = Math.max(1, remainingDamage - this.hullArmor);
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

  /**
   * A Warden's entrance (enemies/boss/arrival.js): for `seconds` of world
   * time the ship takes no steering, dash or fire, and nothing hurts it.
   */
  holdControls(seconds) {
    this.controlHoldTimer = Math.max(this.controlHoldTimer, seconds);
    this.invulnerableTimer = Math.max(this.invulnerableTimer, seconds);
  }

  get controlsHeld() {
    return this.controlHoldTimer > 0;
  }

  getStats() {
    return {
      health: this.health,
      maxHealth: this.maxHealth,
      maxHP: this.maxHealth, // Alias for consistency
      // Reactor Bleed: harder shots while the engines are idle.
      damage: this.enginesIdle
        ? this.damage * this.idleDamageMultiplier
        : this.damage,
      multishot: this.multishot,
      magnetismRadius: this.magnetismRadius,
      shieldLevel: this.shield.shieldUpgradeLevel,
      shieldMaxHP: this.shield.shieldMaxHP,
      shieldCooldown: this.shield.shieldMaxCooldown,
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
    this._currentHullMetrics = computeHullMetrics(hullDefinition);
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
    this.angle = wrapAngle(angle);
  }

  getShieldState() {
    return this.shield.getShieldState();
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
    this.maneuvers.dashCooldown =
      DASH_COOLDOWN * hull.dashCooldown * hangar.dashCooldownMultiplier;
    this.maneuvers.dashAfterInvulnerability = 0;
    this.maneuvers.resetManeuverStats();
    this.maneuvers.emergencyBrake = null;
    this.hullDrain = null;
    this.hullDrainTimer = 0;
    this.resetCardStats();
    this.flight.maxSpeed = SHIP_MAX_SPEED * hull.maxSpeed;
    this.flight.acceleration = SHIP_ACCELERATION * hull.acceleration;
    this.flight.rotationSpeed = SHIP_ROTATION_SPEED;
    this.flight.agility = 1;
    // FIX-02: split damping — reset both components. baseLinearDamping returns
    // to ship default; brakingDamping clears any accumulated braking_system
    // upgrade contribution.
    this.flight.baseLinearDamping = SHIP_LINEAR_DAMPING;
    this.flight.brakingDamping = 0;
    this.flight.angularDamping = SHIP_ANGULAR_DAMPING;
    this.invulnerableTimer = 0;
    this.controlHoldTimer = 0;
    this.flight.driftFactor = 0;

    // Reset visual upgrade levels
    this.thrusters.thrusterVisualLevel = 0;
    this.thrusters.rcsVisualLevel = 0;
    this.thrusters.brakingVisualLevel = 0;

    this.shield.resetShieldState();
  }

  // What the hull and shot cards above change, back to none.
  resetCardStats() {
    this.idleDamageMultiplier = 1;
    this.idleDamageReduction = 0;
    this.hullArmor = 0;
    this.levelUpRepair = 0;
    this.bossRepairFraction = 0;
  }

  reset() {
    super.reset();

    // Force stop all thruster sounds before reset
    this.thrusters._stopAllThrusterSounds();

    this.resetStats();
    this.position = {
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2,
    };
    this.velocity = { vx: 0, vy: 0 };
    this.angle = 0;
    this.turretAngle = 0;
    this.turretLayers.length = 0;
    this.lockAims = null;
    this.angularVelocity = 0;
    this.aimPoint = null;
    this.aimStick = null;
    this.enginesIdle = true;
    this.flight.driftFactor = 0;
    this.maneuvers.resetDashState();
    this._quitExplosionHidden = false; // Reset visibility flag
    this.lastDamageSource = null;
    this.isDead = false;
    this.isRetrying = false;
  }

  markDead() {
    this.isDead = true;
    this.isRetrying = false;

    // Force stop all thruster sounds
    this.thrusters._stopAllThrusterSounds();

    console.log('[PlayerSystem] Player marked as dead');
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
    this.turretLayers.fill(this.angle);
    this.lockAims = null;
    this.aimPoint = null;
    this.aimStick = null;
    this.flight.driftFactor = 0;
    this.maneuvers.resetDashState();

    // Reset thruster state to stop any active sounds
    this.thrusters.lastThrusterState = {
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
