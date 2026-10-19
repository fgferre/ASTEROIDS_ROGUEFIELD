// Blows itself up: the kill takes the normal damage path, and its death then
// sends 'mine-exploded' (PhysicsSystem hurts what is within the radius).
function triggerDetonation(enemy, params, reasonOrPayload, context = {}) {
  if (enemy.detonated || !enemy.alive) return;

  let cause = reasonOrPayload;
  let resolvedContext = context;
  if (typeof reasonOrPayload === 'object' && reasonOrPayload !== null) {
    const { reason, cause: causeOverride, ...rest } = reasonOrPayload;
    cause = causeOverride ?? reason ?? 'detonation';
    resolvedContext = { ...rest };
    if (context && typeof context === 'object' && Object.keys(context).length) {
      resolvedContext = { ...resolvedContext, ...context };
    }
  }
  if (typeof cause !== 'string' || !cause.length) cause = 'detonation';

  enemy.detonated = true;
  enemy.explosionCause = { cause, context: resolvedContext };
  // Its own blast is never warded off (a Warded mine would sit forever).
  enemy.wardedUntil = -Infinity;
  const lethalDamage = Math.max(1, enemy.health || enemy.maxHealth || 1);
  enemy.takeDamage(lethalDamage, {
    cause: 'mine-detonation',
    reason: cause,
    context: resolvedContext,
  });
}

/**
 * A proximity mine. It arms `armTime` s after spawn (`armed`, lit by the
 * view), then blows when the ship comes within `proximityRadius` px, or when
 * its `lifetime` s run out: `explosionDamage` within `explosionRadius` px.
 * Its timers run on the enemy's age clock, ticked here a second time per
 * frame (as the Tether always has; Warded's window reads that age).
 * `triggerDetonation(reason, context)` is the weapon component's way in too.
 */
export default {
  params: {
    armTime: 'number',
    lifetime: 'number',
    proximityRadius: 'number',
    explosionRadius: 'number',
    explosionDamage: 'number',
  },
  methods: { triggerDetonation },
  reset(enemy, params) {
    enemy.armed = false;
    enemy.detonated = false;
    enemy.armTimer = params.armTime;
    enemy.lifetime = params.lifetime;
    enemy.remainingLifetime = params.lifetime;
    enemy.proximityRadius = params.proximityRadius;
    enemy.explosionRadius = params.explosionRadius;
    enemy.explosionDamage = params.explosionDamage;
    enemy.explosionCause = null;
  },
  // Its clocks run even on the frame it died in (its weapon component can
  // set it off earlier in that frame).
  tick(enemy, params, deltaTime, { player }) {
    if (!(deltaTime > 0)) return;
    enemy.age += deltaTime;
    enemy.armTimer -= deltaTime;
    enemy.remainingLifetime -= deltaTime;
    if (!enemy.armed && enemy.armTimer <= 0) enemy.armed = true;

    if (!enemy.alive || enemy.detonated) return;
    if (enemy.remainingLifetime <= 0) {
      triggerDetonation(enemy, params, 'timeout');
      return;
    }
    if (!enemy.armed) return;

    const { system } = enemy;
    const target = system?.getPlayerPositionSnapshot
      ? system.getPlayerPositionSnapshot(player)
      : player?.position;
    if (!target) return;
    const distance = Math.hypot(target.x - enemy.x, target.y - enemy.y);
    if (distance <= enemy.proximityRadius) {
      triggerDetonation(enemy, params, 'proximity', { distance });
    }
  },
  died(enemy, params, source) {
    const safeSource = source ?? {};
    const cause =
      safeSource.reason ??
      safeSource.cause ??
      enemy.explosionCause?.cause ??
      'detonation';
    enemy.getEventBus()?.emit?.('mine-exploded', {
      enemy,
      enemyId: enemy.id,
      enemyType: enemy.type,
      wave: enemy.wave,
      position: { x: enemy.x, y: enemy.y },
      velocity: { x: enemy.vx, y: enemy.vy },
      radius: enemy.explosionRadius,
      damage: enemy.explosionDamage,
      cause,
      context: safeSource.context ?? enemy.explosionCause?.context ?? {},
      source: { id: enemy.id, type: enemy.type, wave: enemy.wave },
      __emittedByMine: true,
    });
  },
};
