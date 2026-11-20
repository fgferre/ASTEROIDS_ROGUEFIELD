// src/modules/input/touchControls.js
//
// Touch play, for a phone or tablet held sideways (mobileGuard lets it in):
// a stick born where the left thumb lands in the left half (nipplejs, one at
// a time: a second finger there is ignored), DASH and SHIELD by the right
// thumb, a pause button by the clock, and the HUD's mode words toggle the
// modes. Styles: style.css, body.touch-play. The stick feeds the same step
// input as the pad's left stick (InputSystem.sampleInputFrame -> merge). In
// classic flight `?toque=` picks how it flies the ship: 'teclas' (default)
// works like the pad (sideways turn, up thrusts, down brakes), 'aponta' turns
// the nose toward the thumb and thrusts. Both are made of the same turn
// and thrust inputs as the keys; modern flight takes the stick's direction.

import { isPortrait, waitAtDoor } from '../../bootstrap/mobileGuard.js';
import { SHIP_ANGULAR_DAMPING } from '../../data/constants/physics.js';
import { wrapAngle } from '../player/flight.js';
import {
  DEFAULT_GAMEPAD_AXIS_THRESHOLD,
  applyStickDeadzone,
} from '../InputSystem.js';

/** 'aponta': a push lighter than this only turns the nose; past it, thrust. */
export const POINT_THRUST_FORCE = 0.5;
/** 'aponta' thrusts once the nose is this close (radians) to the thumb. */
export const POINT_THRUST_CONE = Math.PI / 4;
/** 'aponta' stops turning once the nose will coast within this (radians). */
export const POINT_TURN_DEADBAND = 0.06;

const CENTRED = Object.freeze({ x: 0, y: 0 });

/** How the thumb flies the ship in classic flight: `?toque=aponta|teclas`. */
export function touchModeFromUrl(search = window.location.search) {
  return new URLSearchParams(search).get('toque') === 'aponta'
    ? 'aponta'
    : 'teclas';
}

/**
 * The step input for a stick at (x, y) on the screen axes (y down, 1 at the
 * plate's edge): the pad's analog move after its deadzone, and the held
 * turn/thrust keys classic flight reads. `ship`: { angle, angularVelocity }.
 */
export function touchMovement({ x, y }, mode, ship) {
  const stick = applyStickDeadzone(x, y);
  const force = Math.hypot(stick.x, stick.y);
  const move = {
    up: false,
    down: false,
    left: false,
    right: false,
    moveX: stick.x,
    moveY: stick.y,
  };
  if (!force) {
    return move;
  }
  if (mode === 'teclas') {
    // As the pad's left stick on its four move bindings.
    const t = DEFAULT_GAMEPAD_AXIS_THRESHOLD;
    return { ...move, left: x <= -t, right: x >= t, up: y <= -t, down: y >= t };
  }
  const heading = Math.atan2(stick.y, stick.x);
  // Where the nose comes to rest if no turn is held (the spin decays).
  const coast = ship.angle + (ship.angularVelocity || 0) / SHIP_ANGULAR_DAMPING;
  const turn = wrapAngle(heading - coast);
  return {
    ...move,
    right: turn > POINT_TURN_DEADBAND,
    left: turn < -POINT_TURN_DEADBAND,
    up:
      force >= POINT_THRUST_FORCE &&
      Math.abs(wrapAngle(heading - ship.angle)) < POINT_THRUST_CONE,
  };
}

const LAYER_HTML = `
  <div class="touch-zone"></div>
  <button type="button" class="touch-btn touch-btn--dash" data-touch-action="dash">DASH</button>
  <button type="button" class="touch-btn touch-btn--shield" data-touch-action="activateShield">SHIELD</button>
  <button type="button" class="touch-btn touch-btn--pause" data-touch-action="pause" aria-label="Pause"></button>`;

export class TouchControls {
  /** `input`: InputSystem; `player`: PlayerSystem (the nose for 'aponta'). */
  constructor({ input, player, eventBus, mode = touchModeFromUrl() }) {
    this.input = input;
    this.player = player;
    this.eventBus = eventBus;
    this.mode = mode;
    this.stick = CENTRED;
    // The turn notice's wait while the device is upright, else null.
    this.upright = null;
  }

  /** The device's step values with the touch stick added (pad sticks win). */
  merge(values) {
    const touch = touchMovement(this.stick, this.mode, this.player);
    const padCentred = !values.moveX && !values.moveY;
    return {
      ...values,
      up: values.up || touch.up,
      down: values.down || touch.down,
      left: values.left || touch.left,
      right: values.right || touch.right,
      moveX: padCentred ? touch.moveX : values.moveX,
      moveY: padCentred ? touch.moveY : values.moveY,
    };
  }

  /**
   * Builds the layer over the field, shown only in play. nipplejs is loaded
   * here: it reads the window on import, and desktops never fetch it.
   */
  async mount(root = document.getElementById('game-ui')) {
    document.body.classList.add('touch-play');
    // Tips name the touch gestures from the start; a key or pad takes over.
    this.input.setActiveDevice('touch');
    this.layer = document.createElement('div');
    this.layer.className = 'touch-layer';
    this.layer.hidden = true;
    this.layer.innerHTML = LAYER_HTML;
    root.appendChild(this.layer);
    this.pauseButton = this.layer.querySelector('.touch-btn--pause');

    const zone = this.layer.querySelector('.touch-zone');
    const size = Math.round(
      Math.min(124, Math.max(100, Math.min(innerWidth, innerHeight) * 0.15))
    );
    zone.style.setProperty('--stick', `${size}px`);
    // The buttons and the HUD's mode words act on the touch, like a key tap.
    document.addEventListener('pointerdown', (event) => {
      const action = event.target.closest?.('[data-touch-action]')?.dataset
        .touchAction;
      if (!action || this.layer.hidden) {
        return;
      }
      event.preventDefault();
      this.input.setActiveDevice('touch');
      this.input.handleActionPress(action, 'touch', { device: 'touch' });
      this.input.handleActionRelease(action, 'touch', { device: 'touch' });
    });

    this.eventBus.on('screen-changed', ({ screen } = {}) => {
      this.layer.hidden = screen !== 'playing';
      this.stick = CENTRED;
      requestAnimationFrame(() => this.placePause());
    });
    // No shield card yet: the button shakes once per press, like the vitals.
    const shield = this.layer.querySelector('.touch-btn--shield');
    this.eventBus.on('shield-activation-failed', ({ reason } = {}) => {
      if (reason !== 'locked') return;
      shield.classList.remove('is-refused');
      void shield.offsetWidth;
      shield.classList.add('is-refused');
    });
    window.addEventListener('resize', () => {
      this.placePause();
      this.holdWhileUpright();
    });
    // Home, the notification shade or a call took the screen mid-run.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pauseRun();
    });

    const { default: nipplejs } = await import('nipplejs');
    const manager = nipplejs.create({
      zone,
      mode: 'dynamic',
      size,
      shape: 'square',
      fadeTime: 0,
      color: {
        back: 'rgba(8, 12, 18, 0.4)',
        front: 'rgba(235, 240, 245, 0.4)',
      },
    });
    manager.on('start', () => this.input.setActiveDevice('touch'));
    // nipplejs's y points up; the field's points down.
    manager.on('move', (event) => {
      this.stick = { x: event.data.vector.x, y: -event.data.vector.y };
    });
    manager.on('end', () => {
      this.stick = CENTRED;
    });
  }

  /** Turned upright: the run pauses and the turn notice shows until sideways. */
  holdWhileUpright() {
    if (!isPortrait() || this.upright) {
      return;
    }
    this.pauseRun();
    this.upright = waitAtDoor().then(() => {
      this.upright = null;
    });
  }

  /** The thumb lets go and a running run pauses (upright, or app left). */
  pauseRun() {
    this.stick = CENTRED;
    if (this.input.isGameRunning()) {
      this.eventBus.emit('toggle-pause');
    }
  }

  /** The pause button sits just right of the clock's row (run-info). */
  placePause() {
    const row = document.querySelector('[data-slot="run-info"] .ri-layer');
    if (!row || this.layer.hidden) {
      return;
    }
    const box = row.getBoundingClientRect();
    const origin = this.layer.getBoundingClientRect();
    this.pauseButton.style.left = `${box.right - origin.left + 14}px`;
    this.pauseButton.style.top = `${box.top + box.height / 2 - origin.top}px`;
  }
}
