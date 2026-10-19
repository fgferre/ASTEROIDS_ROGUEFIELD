/**
 * One fan of `shots` aimed at the ship (one shot flies straight at it), `arc`
 * radians outer to outer, `delay` s into each solid (`visible`) window of the
 * phase cycle (phase.js re-arms it): `speed` px/s, `damage`, `lifetime` s,
 * tagged `pattern`.
 */
export default {
  params: {
    delay: 'number',
    shots: 'count',
    arc: 'number',
    speed: 'number',
    damage: 'number',
    lifetime: 'number',
    pattern: 'string',
  },
  act(enemy, params, deltaTime, { live, target }) {
    if (
      !live ||
      enemy.phase !== 'visible' ||
      enemy.fired ||
      !(enemy.phaseElapsed >= params.delay)
    ) {
      return;
    }
    enemy.fired = true;
    if (!target) return;
    const { shots, arc, speed, damage, lifetime, pattern } = params;
    const base = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    for (let i = 0; i < shots; i += 1) {
      const angle = shots === 1 ? base : base + (i / (shots - 1) - 0.5) * arc;
      enemy.getEventBus()?.emit?.('enemy-fired', {
        enemy,
        enemyId: enemy.id,
        enemyType: enemy.type,
        wave: enemy.wave,
        position: { x: enemy.x, y: enemy.y },
        velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        damage,
        projectile: { speed, angle, pattern, lifetime },
        source: { id: enemy.id, type: enemy.type, wave: enemy.wave },
      });
    }
  },
};
