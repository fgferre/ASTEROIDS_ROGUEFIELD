/**
 * Every `interval` s it lays an enemy of `type` where it is, on its own fork
 * of its stream, while fewer than `max` it laid are still on the field
 * (`tethers`); its arms light for `glow` s after (`layGlow` 1..0, read by the
 * view). Emits `event` on each one.
 */
export default {
  params: {
    type: 'string',
    interval: 'number',
    max: 'number',
    glow: 'number',
    event: 'string',
  },
  usesRandom: true,
  reset(enemy, { interval }) {
    enemy.layTimer = interval;
    enemy.layGlow = 0;
    enemy.tethers = [];
  },
  act(enemy, params, deltaTime, { live }) {
    if (!live) return;
    enemy.layGlow = Math.max(0, enemy.layGlow - deltaTime / params.glow);
    enemy.layTimer -= deltaTime;
    if (enemy.layTimer > 0) return;

    enemy.layTimer += params.interval;
    enemy.tethers = enemy.tethers.filter(
      ({ mine, id }) => mine.alive && mine.id === id
    );
    if (enemy.tethers.length >= params.max) return;

    const mine = enemy.spawnChild(params.type, {
      x: enemy.x,
      y: enemy.y,
      random: enemy.random.fork(`${enemy.type}:tether:${enemy.tethers.length}`),
    });
    if (!mine) return;
    enemy.tethers.push({ mine, id: mine.id });
    enemy.layGlow = 1;
    enemy.emitEvent(params.event);
  },
};
