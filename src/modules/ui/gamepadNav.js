// src/modules/ui/gamepadNav.js

// Gamepad focus navigation for menus and overlays (R6.1): the d-pad or left
// stick moves the focus to the nearest control in that direction.

/** Screens a pad can navigate, topmost first (`#<id>-screen`). */
export const GAMEPAD_NAV_SCREENS = Object.freeze([
  'settings',
  'codex',
  'hangar',
  'credits',
  'gameover',
  'levelup',
  'pause',
  'victory',
  'menu',
]);

export const GAMEPAD_FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const centre = (rect) => ({
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2,
});

/**
 * Index of the candidate rect to focus from `from` going `direction`
 * ('up' | 'down' | 'left' | 'right'), or -1 when nothing lies that way.
 * Without a current rect the first candidate is picked. Off-axis distance
 * weighs double, so a grid moves along its rows and columns.
 */
export function pickFocusTarget(from, candidates, direction) {
  if (!from) {
    return candidates.length > 0 ? 0 : -1;
  }
  const axis = DIRECTIONS[direction];
  if (!axis) {
    return -1;
  }
  const origin = centre(from);
  let best = -1;
  let bestScore = Infinity;
  candidates.forEach((rect, index) => {
    const point = centre(rect);
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const along = dx * axis.x + dy * axis.y;
    if (along <= 1) {
      return;
    }
    const across = Math.abs(dx * axis.y - dy * axis.x);
    const score = along + across * 2;
    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}
