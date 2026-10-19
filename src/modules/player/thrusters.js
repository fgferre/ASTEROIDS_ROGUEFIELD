// src/modules/player/thrusters.js
//
// The ship's thrusters as the rest of the game sees them: the per-step
// 'thruster-effect' events (flames and their sounds), the stop events on
// death and reset, the smoothed intensities the 3D ship's cones follow, and
// the thruster, RCS and braking visual levels the cards raise. PlayerSystem
// owns one and tells it each step's thrust.

export class PlayerThrusters {
  /**
   * `getEventBus()`: the player's event bus, read live; the thruster events go out on it.
   * `getShipPosition()`: the ship's position object itself; the stop events carry it.
   * `getThrusterPort(kind)`: the current hull's port for 'main', 'aux', 'left' or 'right', in hull space.
   * `getLocalToWorld(x, y)`: a hull-space point in the world, at the ship's position and angle now.
   * `getLocalDirection(dx, dy)`: a hull-space direction in the world, at the ship's angle now.
   */
  constructor({
    getEventBus,
    getShipPosition,
    getThrusterPort,
    getLocalToWorld,
    getLocalDirection,
  }) {
    this.getEventBus = getEventBus;
    this.getShipPosition = getShipPosition;
    this.getThrusterPort = getThrusterPort;
    this.getLocalToWorld = getLocalToWorld;
    this.getLocalDirection = getLocalDirection;

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
  }

  // === EFEITOS DE THRUSTER ===
  // Emitir eventos SEMPRE (não só na mudança) para manter visuais funcionando
  // AudioSystem usa timeout de inatividade para detectar quando parar os loops
  // `fwd`: the hull's nose, a unit vector; the rest is updateMovement's thrust.
  emitThrusterEffects({
    fwd,
    thrMain,
    thrAux,
    thrSideL,
    thrSideR,
    isMainManual,
    isAuxManual,
  }) {
    // Main thruster (forward)
    if (thrMain > 0 || this.lastThrusterState.main > 0) {
      const mainThrusterPort = this.getThrusterPort('main');
      const thrusterPos = this.getLocalToWorld(
        mainThrusterPort.x,
        mainThrusterPort.y
      );
      this.getEventBus()?.emit?.('thruster-effect', {
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
      const auxThrusterPort = this.getThrusterPort('aux');
      const thrusterPos = this.getLocalToWorld(
        auxThrusterPort.x,
        auxThrusterPort.y
      );
      this.getEventBus()?.emit?.('thruster-effect', {
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
      const leftThrusterPort = this.getThrusterPort('left');
      const thrusterPos = this.getLocalToWorld(
        leftThrusterPort.x,
        leftThrusterPort.y
      );
      const dir = this.getLocalDirection(0, 1);
      this.getEventBus()?.emit?.('thruster-effect', {
        position: thrusterPos,
        direction: dir,
        intensity: thrSideL,
        type: 'side',
        visualLevel: this.rcsVisualLevel,
      });
      this.lastThrusterState.sideL = thrSideL;
    }

    if (thrSideR > 0 || this.lastThrusterState.sideR > 0) {
      const rightThrusterPort = this.getThrusterPort('right');
      const thrusterPos = this.getLocalToWorld(
        rightThrusterPort.x,
        rightThrusterPort.y
      );
      const dir = this.getLocalDirection(0, -1);
      this.getEventBus()?.emit?.('thruster-effect', {
        position: thrusterPos,
        direction: dir,
        intensity: thrSideR,
        type: 'side',
        visualLevel: this.rcsVisualLevel,
      });
      this.lastThrusterState.sideR = thrSideR;
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
    ['main', 'aux', 'sideL', 'sideR'].forEach((key) => {
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
      this.lastThrusterState.sideL,
      this.lastThrusterState.sideR
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

    // Reset state
    this.lastThrusterState = {
      main: 0,
      aux: 0,
      sideL: 0,
      sideR: 0,
    };
  }
}
