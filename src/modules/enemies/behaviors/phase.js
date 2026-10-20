import { GAME_HEIGHT, GAME_WIDTH } from '../../../core/GameConstants.js';
import { resolvePlayerVelocity } from '../../../utils/combatHelpers.js';

const TAU = Math.PI * 2;

// Each step of the cycle and what follows; how long it lasts, from the params.
const NEXT = {
  'fade-in': 'visible',
  visible: 'fade-out',
  'fade-out': 'phased',
  phased: 'fade-in',
};
const stepSeconds = (params, step) =>
  step === 'visible'
    ? params.visible
    : step === 'phased'
      ? params.phased
      : params.fade;

// The side of the ship's heading it is on now; a fresh seeded angle for a
// ship standing still.
function pickFlank(enemy, player, target) {
  enemy.flankAngle = enemy.random.range(0, TAU);
  if (!target) return;
  const { vx, vy } = resolvePlayerVelocity(player);
  const across = vx * (enemy.y - target.y) - vy * (enemy.x - target.x);
  if (across !== 0) enemy.flankSide = Math.sign(across);
}

function advance(enemy, params, deltaTime, player, target) {
  enemy.phaseTimer -= deltaTime;
  while (enemy.phaseTimer <= 0) {
    enemy.phase = NEXT[enemy.phase];
    enemy.phaseTimer += stepSeconds(params, enemy.phase);
    if (enemy.phase === 'visible') enemy.fired = false;
    if (enemy.phase === 'phased') pickFlank(enemy, player, target);
    if (enemy.phase === 'fade-out') enemy.emitEvent(params.outEvent);
    if (enemy.phase === 'fade-in') enemy.emitEvent(params.inEvent);
  }
  enemy.intangible = enemy.phase === 'phased';
}

function flankPoint(enemy, params, player, target) {
  const { vx, vy } = resolvePlayerVelocity(player);
  const speed = Math.hypot(vx, vy);
  const moving = speed >= params.still;
  const nx = moving
    ? (-vy / speed) * enemy.flankSide
    : Math.cos(enemy.flankAngle);
  const ny = moving
    ? (vx / speed) * enemy.flankSide
    : Math.sin(enemy.flankAngle);
  const clampToField = (value, size) =>
    Math.min(size - params.margin, Math.max(params.margin, value));
  const toward = (dx, dy) => ({
    x: clampToField(target.x + dx * params.flank, GAME_WIDTH),
    y: clampToField(target.y + dy * params.flank, GAME_HEIGHT),
  });
  const clear = (point) =>
    Math.hypot(point.x - target.x, point.y - target.y) >= params.flankMin;
  const side = toward(nx, ny);
  if (clear(side)) return side;
  const other = toward(-nx, -ny);
  if (clear(other)) return other;
  const cx = GAME_WIDTH / 2 - target.x;
  const cy = GAME_HEIGHT / 2 - target.y;
  const span = Math.hypot(cx, cy) || 1;
  return toward(cx / span, cy / span);
}

/**
 * Phase flanker. Cycle: fade-in → visible (`visible` s; the solid window a
 * fan-shot fires in, re-armed as it starts: `fired`) → fade-out → phased
 * (`phased` s) → fade-in, each fade `fade` s. Phased, it is `intangible`: no
 * collisions, no damage, no lock (PhysicsSystem and CombatSystem skip it). It
 * keeps to a flank point `flank` px beside the ship — across the ship's
 * heading on the side it is on, or a seeded side while the ship is slower than
 * `still` — inside the field (`margin`); phased, it glides there at up to
 * `phaseSpeed` to arrive as the window ends. A wall that clamps the point
 * within `flankMin` of the ship sends it to the other side, else toward the
 * field's centre. A lit Volatile fuse holds it solid. `visibility`: 0 phased …
 * 1 solid. Emits `outEvent` / `inEvent` as each dissolve starts.
 */
export default {
  params: {
    fade: 'positive',
    visible: 'positive',
    phased: 'positive',
    flank: 'positive',
    flankMin: 'number',
    still: 'number',
    margin: 'number',
    outEvent: 'string',
    inEvent: 'string',
  },
  check: ({ flank, flankMin }) =>
    flankMin > flank ? 'flankMin is past flank' : null,
  usesRandom: true,
  getters: {
    speed: (enemy) => enemy.movementValue('maxSpeed'),
    phaseSpeed: (enemy) => enemy.movementValue('phaseSpeed'),
    /** How solid it looks: 0 phased … 1 visible. */
    visibility(enemy, { fade }) {
      const left = Math.min(1, Math.max(0, enemy.phaseTimer / fade));
      if (enemy.phase === 'visible') return 1;
      if (enemy.phase === 'phased') return 0;
      return enemy.phase === 'fade-out' ? left : 1 - left;
    },
    /** Seconds into the current step. */
    phaseElapsed: (enemy, params) =>
      stepSeconds(params, enemy.phase) - enemy.phaseTimer,
  },
  reset(enemy, { fade }) {
    enemy.phase = 'fade-in';
    enemy.phaseTimer = fade;
    enemy.fired = false;
    enemy.flankSide = 1;
    enemy.flankAngle = 0;
    enemy.intangible = false;
  },
  init(enemy) {
    enemy.flankSide = enemy.random.chance(0.5) ? 1 : -1;
    enemy.flankAngle = enemy.random.range(0, TAU);
  },
  tick(enemy, params, deltaTime, { live, player, target }) {
    if (!live || enemy.volatileFuse !== null) return;
    advance(enemy, params, deltaTime, player, target);
  },
  steer(enemy, params, deltaTime, { live, player, target }) {
    if (!live) return;
    if (!target) {
      enemy.vx = 0;
      enemy.vy = 0;
      return;
    }
    const to = flankPoint(enemy, params, player, target);
    const dx = to.x - enemy.x;
    const dy = to.y - enemy.y;
    const distance = Math.hypot(dx, dy);
    const pace =
      enemy.phase === 'phased'
        ? Math.min(
            enemy.phaseSpeed,
            distance / Math.max(enemy.phaseTimer, deltaTime)
          )
        : Math.min(enemy.speed, distance / deltaTime);
    enemy.vx = distance > 0 ? (dx / distance) * pace : 0;
    enemy.vy = distance > 0 ? (dy / distance) * pace : 0;
    enemy.rotation = Math.atan2(target.y - enemy.y, target.x - enemy.x);
  },
  takeDamage: (enemy, params, amount) => (enemy.intangible ? null : amount),
  dying(enemy) {
    enemy.intangible = false;
  },
};
