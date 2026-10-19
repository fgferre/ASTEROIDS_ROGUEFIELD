import { GAME_HEIGHT, GAME_WIDTH } from '../../../core/GameConstants.js';
import { resolvePlayerVelocity } from '../../../utils/combatHelpers.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Where the ship will be `lead` s from now, on the field.
function leadPoint(player, target, lead) {
  const { vx, vy } = resolvePlayerVelocity(player);
  return {
    x: clamp(target.x + vx * lead, 0, GAME_WIDTH),
    y: clamp(target.y + vy * lead, 0, GAME_HEIGHT),
  };
}

// Hurts the ship only (the direct-damage path checks the radius); its own
// impact look and sound, nothing left behind.
function land(enemy, { radius, damage, cause, landEvent }, x, y) {
  const position = { x, y };
  enemy.system?.applyDirectDamageToPlayer?.(damage, {
    cause,
    position,
    radius,
    source: enemy,
  });
  enemy.emitEvent(landEvent, { position, radius, damage });
}

/**
 * Telegraphed grenade. Every `interval` s it marks a point `lead` s ahead of
 * the ship (`aim`, lit by `telegraphRatio` over the last `telegraph` s), then
 * lobs a `shell` there: it flies `flight` s over the field, colliding with
 * nothing, and blows on landing — `damage` to the ship alone within `radius`
 * (`shellProgress` 0..1 in flight). A shell in the air dies with it. Emits
 * `telegraphEvent`, `fireEvent` and `landEvent`.
 */
export default {
  params: {
    interval: 'number',
    telegraph: 'number',
    lead: 'number',
    flight: 'number',
    radius: 'number',
    damage: 'number',
    cause: 'string',
    telegraphEvent: 'string',
    fireEvent: 'string',
    landEvent: 'string',
  },
  getters: {
    telegraphRatio(enemy, { telegraph }) {
      if (!enemy.aim) return 0;
      return clamp(1 - enemy.fireTimer / telegraph, 0, 1);
    },
    shellProgress(enemy, { flight }) {
      return enemy.shell ? Math.min(1, enemy.shell.age / flight) : null;
    },
  },
  reset(enemy, { interval }) {
    enemy.fireTimer = interval;
    enemy.aim = null;
    enemy.shell = null;
  },
  tick(enemy, params, deltaTime, { live }) {
    const { shell } = enemy;
    if (!live || !shell) return;
    shell.age += deltaTime;
    if (shell.age < params.flight) return;
    enemy.shell = null;
    land(enemy, params, shell.x, shell.y);
  },
  act(enemy, params, deltaTime, { live, player, target }) {
    if (!live || !target) return;
    enemy.fireTimer -= deltaTime;
    if (enemy.fireTimer <= params.telegraph) {
      const charging = !enemy.aim;
      enemy.aim = leadPoint(player, target, params.lead);
      enemy.rotation = Math.atan2(enemy.aim.y - enemy.y, enemy.aim.x - enemy.x);
      if (charging) {
        enemy.emitEvent(params.telegraphEvent, { target: enemy.aim });
      }
    }
    if (enemy.fireTimer > 0) return;
    enemy.fireTimer += params.interval;
    enemy.shell = { fromX: enemy.x, fromY: enemy.y, ...enemy.aim, age: 0 };
    enemy.emitEvent(params.fireEvent, { target: enemy.aim });
    enemy.aim = null;
  },
  dying(enemy) {
    enemy.aim = null;
    enemy.shell = null;
  },
};
