// src/data/constants/gamepad.js

// Gamepad support (R6.1), PROPOSAL 18/10 ("proposta 18/10"), judged by
// playing. Indices follow the W3C "standard" mapping.
export const PAD_BUTTON = Object.freeze({
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  VIEW: 8,
  START: 9,
  LS: 10,
  RS: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
});

/** Labels shown in tips, hints and the settings panel, by button index. */
export const PAD_BUTTON_GLYPHS = Object.freeze([
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'LT',
  'RT',
  'View',
  'Start',
  'LS',
  'RS',
  'D-pad ↑',
  'D-pad ↓',
  'D-pad ←',
  'D-pad →',
]);

/** Axis pairs: 0/1 left stick (move), 2/3 right stick (aim). */
export const PAD_STICK_GLYPHS = Object.freeze(['L-Stick', 'R-Stick']);

/** Default gamepad bindings of the remappable actions (settings `controls`). */
export const GAMEPAD_BINDINGS = Object.freeze({
  moveUp: ['axis:1:-', `button:${PAD_BUTTON.UP}`],
  moveDown: ['axis:1:+', `button:${PAD_BUTTON.DOWN}`],
  moveLeft: ['axis:0:-', `button:${PAD_BUTTON.LEFT}`],
  moveRight: ['axis:0:+', `button:${PAD_BUTTON.RIGHT}`],
  activateShield: [`button:${PAD_BUTTON.LT}`],
  dash: [`button:${PAD_BUTTON.RT}`],
  pause: [`button:${PAD_BUTTON.START}`],
  openSettings: [`button:${PAD_BUTTON.VIEW}`],
  confirm: [`button:${PAD_BUTTON.A}`],
  toggleSpreadMode: [`button:${PAD_BUTTON.X}`],
  toggleAimMode: [`button:${PAD_BUTTON.Y}`],
});

/**
 * Menu and overlay navigation (fixed, not remappable). The left stick also
 * moves the focus (GAMEPAD_NAV_STICK_THRESHOLD).
 */
export const GAMEPAD_NAV_BUTTONS = Object.freeze({
  [PAD_BUTTON.A]: 'confirm',
  [PAD_BUTTON.B]: 'back',
  [PAD_BUTTON.X]: 'reroll',
  [PAD_BUTTON.Y]: 'banish',
  [PAD_BUTTON.LB]: 'tabPrev',
  [PAD_BUTTON.RB]: 'tabNext',
  [PAD_BUTTON.UP]: 'up',
  [PAD_BUTTON.DOWN]: 'down',
  [PAD_BUTTON.LEFT]: 'left',
  [PAD_BUTTON.RIGHT]: 'right',
});

/** Radial deadzone of both sticks; the rest is rescaled to 0..1. */
export const GAMEPAD_STICK_DEADZONE = 0.2;
/** Right stick past this magnitude aims the turret by hand (no lock). */
export const GAMEPAD_AIM_ENGAGE = 0.35;
/** Left stick past this moves the menu focus once per push. */
export const GAMEPAD_NAV_STICK_THRESHOLD = 0.5;

/** `vibrationActuator.playEffect('dual-rumble', …)` parameters, ms and 0..1. */
export const GAMEPAD_RUMBLE = Object.freeze({
  hullHit: { duration: 120, weakMagnitude: 0.6, strongMagnitude: 0 },
  wardenSpawn: { duration: 400, weakMagnitude: 0, strongMagnitude: 0.8 },
  dash: { duration: 60, weakMagnitude: 0.3, strongMagnitude: 0 },
});
