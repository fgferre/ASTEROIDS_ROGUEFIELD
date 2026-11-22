// src/modules/player/thrusters.js
//
// The ship's thrusters as the rest of the game sees them: the per-step
// 'thruster-effect' events (flames and their sounds), the stop events on
// death and reset, the smoothed intensities the 3D ship's cones follow, and
// the thruster, RCS and braking visual levels the cards raise. PlayerSystem
// owns one and tells it each step's thrust.

// Below this speed the auto-brake stops (flight.js), and the coast brake
// disarms until the pilot thrusts again: it shows until the ship stops.
const COAST_DISARM_SPEED = 2; // px/s
// A jet under this share is off (proposta 16/11). The nose settles onto its
// heading asymptotically, so the turn share never reaches zero by itself, and
// a burning jet throws at least one spark a step: flying straight, the side
// of the last turn sparked forever.
const SHOWN_MIN = 0.08;
const shown = (share) => (share >= SHOWN_MIN ? share : 0);

export class PlayerThrusters {
  /**
   * `getEventBus()`: the player's event bus, read live; the thruster events go out on it.
   * `getShipPosition()`: the ship's position object itself; the stop events carry it.
   * `getThrusterPort(kind)`: the current hull's port for 'main', 'aux', 'left' or 'right' (the aft wingtips), 'noseLeft' or 'noseRight', in hull space.
   * `getLocalToWorld(x, y)`: a hull-space point in the world, at the ship's position and angle now.
   * `getLocalDirection(dx, dy)`: a hull-space direction in the world, at the ship's angle now.
   * `getAccent()`: the current hull's accent (a PALETTE key); the exhaust sparks take it.
   */
  constructor({
    getEventBus,
    getShipPosition,
    getThrusterPort,
    getLocalToWorld,
    getLocalDirection,
    getAccent,
  }) {
    this.getEventBus = getEventBus;
    this.getShipPosition = getShipPosition;
    this.getThrusterPort = getThrusterPort;
    this.getLocalToWorld = getLocalToWorld;
    this.getLocalDirection = getLocalDirection;
    this.getAccent = getAccent;

    // === VISUAL UPGRADE LEVELS ===
    this.thrusterVisualLevel = 0;
    this.rcsVisualLevel = 0;
    this.brakingVisualLevel = 0;

    // === THRUSTER STATE TRACKING (for audio) ===
    // What the thrusters show this step (0..1): the main engine, the retro,
    // and the turn couple swinging the nose to port (turnL) or starboard (turnR).
    this.lastThrusterState = {
      main: 0,
      aux: 0,
      turnL: 0,
      turnR: 0,
      brakeStarboard: 0,
      brakePort: 0,
    };
    this.thrusterVisual = { main: 0, aux: 0, turnL: 0, turnR: 0 };
    // The coast brake shows only after the pilot's own thrust or a dash.
    this.coastArmed = false;
  }

  // === EFEITOS DE THRUSTER ===
  // Emitir eventos SEMPRE (não só na mudança) para manter visuais funcionando
  // AudioSystem usa timeout de inatividade para detectar quando parar os loops
  // `step`: flight.js updateMovement's display fields. The thrusters show what
  // the pilot asked for: idle, a shot's recoil or a knockback show nothing
  // (the auto-brake still acts, silently); after the pilot's own thrust or a
  // dash, coasting shows the auto-brake's own push on each jet it fires
  // (flight.js `brake`): the retro or the main engine along the nose, the
  // flank jets across (drawing only: the flank jets send no event).
  emitThrusterEffects({
    fwd,
    pilotMain,
    pilotAux,
    pilotForce,
    pilotTurn,
    brake,
    speed,
    dashing,
    isMainManual,
    isAuxManual,
  }) {
    if (isMainManual || isAuxManual || dashing) this.coastArmed = true;
    else if (speed < COAST_DISARM_SPEED) this.coastArmed = false;
    const coasting = brake.main + brake.aux + brake.starboard + brake.port > 0;
    const shows = coasting && this.coastArmed && !dashing;
    const braked = (push) => (shows ? push : 0);
    // A stick's push scales a jet that burns, never puts one out: the trail
    // cards drop on any burn of the main engine.
    const main = shown(coasting ? braked(brake.main) : pilotMain) * pilotForce;
    const aux = shown(coasting ? braked(brake.aux) : pilotAux) * pilotForce;
    this.lastThrusterState.brakeStarboard = shown(braked(brake.starboard));
    this.lastThrusterState.brakePort = shown(braked(brake.port));

    this.emitJet('main', main, fwd, 'main', 1, coasting);
    this.emitJet('aux', aux, fwd, 'aux', -1, coasting);
    // A turn shows as the couple that would cause it: nose swinging to
    // starboard, the aft starboard wingtip and the port nose jet blow
    // outboard; mirrored to port. The sound pans to the turn's side.
    this.emitTurn('turnR', shown(pilotTurn), 'right', 'noseLeft');
    this.emitTurn('turnL', shown(-pilotTurn), 'left', 'noseRight');
  }

  // One jet's event while it burns, and a last one at 0 when it stops.
  // `sign`: along the nose (main) or against it (retro).
  emitJet(key, intensity, fwd, type, sign, isAutomatic) {
    if (intensity > 0 || this.lastThrusterState[key] > 0) {
      const port = this.getThrusterPort(type);
      this.getEventBus()?.emit?.('thruster-effect', {
        position: this.getLocalToWorld(port.x, port.y),
        direction: { x: sign * fwd.x, y: sign * fwd.y },
        intensity,
        type,
        visualLevel:
          type === 'main' ? this.thrusterVisualLevel : this.brakingVisualLevel,
        isAutomatic, // the coast brake sounds softer than the pilot's thrust
        accent: this.getAccent(),
      });
      this.lastThrusterState[key] = intensity;
    }
  }

  // The turn couple's two jets: the aft wingtip on `side` and the nose jet
  // on the other flank, each blowing outboard.
  emitTurn(key, intensity, side, nosePort) {
    if (intensity > 0 || this.lastThrusterState[key] > 0) {
      [side, nosePort].forEach((kind) => {
        const port = this.getThrusterPort(kind);
        this.getEventBus()?.emit?.('thruster-effect', {
          position: this.getLocalToWorld(port.x, port.y),
          // the sparks fly against `direction`: outboard of the port's flank
          direction: this.getLocalDirection(0, port.y < 0 ? 1 : -1),
          intensity,
          type: 'side',
          side, // the engine sound pans its puffs by it
          visualLevel: this.rcsVisualLevel,
          isAutomatic: false,
          accent: this.getAccent(),
        });
      });
      this.lastThrusterState[key] = intensity;
    }
  }

  getHullVisualLevels() {
    return {
      thruster: this.thrusterVisualLevel || 0,
      rcs: this.rcsVisualLevel || 0,
      braking: this.brakingVisualLevel || 0,
    };
  }

  // Smoothed thruster intensities for the cone (input is on/off).
  updateThrusterVisual() {
    const visual = this.thrusterVisual;
    const target = this.lastThrusterState;
    ['main', 'aux', 'turnL', 'turnR'].forEach((key) => {
      visual[key] += ((target[key] || 0) - visual[key]) * 0.35;
      if (visual[key] < 0.005) visual[key] = 0;
    });
    return visual;
  }

  /**
   * Force stops all thruster sounds by emitting events with intensity 0
   * Called when player dies or game resets
   */
  _stopAllThrusterSounds() {
    const eventBus = this.getEventBus();
    if (!eventBus?.emit) return;

    // Emit stop events for all thruster types
    if (this.lastThrusterState.main > 0) {
      eventBus.emit('thruster-effect', {
        position: this.getShipPosition(),
        direction: { x: 0, y: -1 },
        intensity: 0,
        type: 'main',
        visualLevel: this.thrusterVisualLevel,
      });
    }

    if (this.lastThrusterState.aux > 0) {
      eventBus.emit('thruster-effect', {
        position: this.getShipPosition(),
        direction: { x: 0, y: 1 },
        intensity: 0,
        type: 'aux',
        visualLevel: this.brakingVisualLevel,
      });
    }

    const sideIntensity = Math.max(
      this.lastThrusterState.turnL,
      this.lastThrusterState.turnR
    );
    if (sideIntensity > 0) {
      eventBus.emit('thruster-effect', {
        position: this.getShipPosition(),
        direction: { x: 1, y: 0 },
        intensity: 0,
        type: 'side',
        visualLevel: this.rcsVisualLevel,
      });
    }

    this.resetState();
  }

  /** Nothing burning, the coast brake disarmed (death, reset, respawn). */
  resetState() {
    this.lastThrusterState = {
      main: 0,
      aux: 0,
      turnL: 0,
      turnR: 0,
      brakeStarboard: 0,
      brakePort: 0,
    };
    this.coastArmed = false;
  }
}
