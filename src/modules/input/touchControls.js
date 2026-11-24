// src/modules/input/touchControls.js
//
// Touch play, for a phone or tablet held sideways (mobileGuard lets it in):
// a stick born where the left thumb lands in the left half (nipplejs, one at
// a time: a second finger there is ignored), DASH and SHIELD by the right
// thumb, STRAFE above them (held: the stick's sideways part strafes, as LB on
// a pad), a pause button by the clock, and the HUD's mode words toggle the
// modes. Styles: style.css, body.touch-play. The stick feeds the same step
// input as the pad's left stick (InputSystem.sampleInputFrame -> merge). In
// classic flight `?toque=` picks how it flies the ship: 'teclas' (default)
// works like the pad (sideways turn, up thrusts, down brakes), 'aponta' turns
// the nose toward the thumb and thrusts. Both are made of the same turn
// and thrust inputs as the keys; modern flight takes the stick's direction.
// On a screen that declares a mouse (a car, a touch laptop) the last device
// used rules: a finger turns touch play on, a key or pad turns it off;
// Settings' Touch Controls on Always, or `?touch=force`, pins it on,
// mouse-type pointers working the stick and buttons one at a time (a
// browser that sends its touches as a mouse).

import {
  hasForceTouchFlag,
  isPortrait,
  mayTurnToTouch,
  onFinger,
  setTouchShown,
  waitAtDoor,
} from '../../bootstrap/mobileGuard.js';
import { spinCoast, wrapAngle } from '../player/flight.js';
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
  // Where the nose comes to rest if the thumb turns against the spin now.
  const coast =
    ship.angle + spinCoast(ship.angularVelocity || 0, ship.flight?.agility);
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
  <button type="button" class="touch-btn touch-btn--strafe">STRAFE</button>
  <button type="button" class="touch-btn touch-btn--pause" data-touch-action="pause" aria-label="Pause"></button>`;

// No card for the button yet: it shakes once per press, like the vitals.
function refuse(button) {
  button.classList.remove('is-refused');
  void button.offsetWidth;
  button.classList.add('is-refused');
}

export class TouchControls {
  /**
   * `input`: InputSystem; `player`: PlayerSystem (the nose for 'aponta');
   * `settings`: SettingsSystem (Touch Controls);
   * `declared`: the device says it is touch (mobileGuard), on for good;
   * `onShow`: called when touch play turns on or off on another screen.
   */
  constructor({
    input,
    player,
    eventBus,
    settings,
    mode = touchModeFromUrl(),
    declared = false,
    onShow = () => {},
  }) {
    this.input = input;
    this.player = player;
    this.eventBus = eventBus;
    this.settings = settings;
    this.mode = mode;
    this.declared = declared;
    this.onShow = onShow;
    this.stick = CENTRED;
    // STRAFE is held down.
    this.strafing = false;
    this.on = false;
    this.pinned = false;
    this.screen = null;
    this.layer = null;
    // The turn notice's wait while the device is upright, else null.
    this.upright = null;
  }

  /** On for good on a touch device; elsewhere, a finger turns it on. */
  start() {
    if (!this.declared && !mayTurnToTouch()) {
      return;
    }
    this.eventBus.on('screen-changed', ({ screen } = {}) => {
      this.screen = screen;
      this.stick = CENTRED;
      this.syncLayer();
    });
    if (this.declared) {
      // Tips name the touch gestures from the start; a key or pad takes over.
      this.input.setActiveDevice('touch');
      this.show(true);
      return;
    }
    this.eventBus.on('input-device-changed', ({ device } = {}) => {
      if (!this.pinned) this.show(device === 'touch');
    });
    onFinger(() => this.input.setActiveDevice('touch'));
    const pinned = () =>
      hasForceTouchFlag() ||
      this.settings.getSetting('controls', 'touchControls') === 'always';
    this.eventBus.on('settings-changed', ({ category } = {}) => {
      if (category === 'controls' && pinned() !== this.pinned) {
        this.pin(pinned());
      }
    });
    if (pinned()) this.pin(true);
  }

  /** Touch play kept on whatever device is used (`on`), or back to the last one. */
  pin(on) {
    this.pinned = on;
    if (on) this.input.setActiveDevice('touch');
    this.show(on || this.input.getActiveDevice() === 'touch');
  }

  show(on) {
    if (on === this.on) {
      return;
    }
    this.on = on;
    document.body.classList.toggle('touch-play', on);
    if (!this.declared) {
      setTouchShown(on);
      this.onShow();
    }
    if (on && !this.layer) {
      void this.mount();
    }
    this.syncLayer();
  }

  /** The stick and buttons show in play while touch play is on. */
  syncLayer() {
    if (!this.layer) {
      return;
    }
    this.layer.hidden = !this.on || this.screen !== 'playing';
    if (this.layer.hidden) {
      this.stick = CENTRED;
      this.strafing = false;
    }
    requestAnimationFrame(() => this.placePause());
  }

  /**
   * The device's step values with the touch stick added (pad sticks win). A
   * hidden stick adds nothing, though a finger still dragging since a key hid
   * it (Auto) keeps reporting. STRAFE held is the strafe hold, the stick read
   * as in 'teclas' so its sideways part is left and right.
   */
  merge(values) {
    const hidden = this.layer?.hidden;
    const stick = hidden ? CENTRED : this.stick;
    const strafing = !hidden && this.strafing;
    const touch = touchMovement(
      stick,
      strafing ? 'teclas' : this.mode,
      this.player
    );
    const padCentred = !values.moveX && !values.moveY;
    return {
      ...values,
      up: values.up || touch.up,
      down: values.down || touch.down,
      left: values.left || touch.left,
      right: values.right || touch.right,
      moveX: padCentred ? touch.moveX : values.moveX,
      moveY: padCentred ? touch.moveY : values.moveY,
      strafeHold: values.strafeHold || strafing,
    };
  }

  /**
   * Builds the layer over the field once, the first time touch play turns
   * on. nipplejs is loaded here: it reads the window on import, and a
   * desktop never touched never fetches it.
   */
  async mount(root = document.getElementById('game-ui')) {
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

    const shield = this.layer.querySelector('.touch-btn--shield');
    this.eventBus.on('shield-activation-failed', ({ reason } = {}) => {
      if (reason === 'locked') refuse(shield);
    });
    // STRAFE is held, not tapped.
    const strafe = this.layer.querySelector('.touch-btn--strafe');
    strafe.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.input.setActiveDevice('touch');
      this.strafing = true;
      strafe.setPointerCapture(event.pointerId);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) =>
      strafe.addEventListener(type, () => {
        this.strafing = false;
      })
    );
    window.addEventListener('resize', () => {
      this.placePause();
      this.holdWhileUpright();
    });
    // Home, the notification shade or a call took the screen mid-run.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.on) this.pauseRun();
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
    // A computer's window may be taller than wide: no turn notice there.
    if (!this.declared || !isPortrait() || this.upright) {
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
    this.strafing = false;
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
