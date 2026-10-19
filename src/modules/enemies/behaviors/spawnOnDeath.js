const TAU = Math.PI * 2;

/**
 * On death it cracks open and releases `count` enemies of `type`, evenly round
 * a seeded angle, flying outward at `speed` px/s, each on its own fork of its
 * stream. After the base death, so a Volatile blast spares them.
 */
export default {
  params: { type: 'string', count: 'count', speed: 'number' },
  usesRandom: true,
  died(enemy, { type, count, speed }) {
    const offset = enemy.random.range(0, TAU);
    for (let i = 0; i < count; i += 1) {
      const angle = offset + (i * TAU) / count;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      enemy.spawnChild(type, {
        x: enemy.x + dx * enemy.radius * 0.6,
        y: enemy.y + dy * enemy.radius * 0.6,
        vx: dx * speed,
        vy: dy * speed,
        random: enemy.random.fork(`${enemy.type}:split:${i}`),
      });
    }
  },
};
