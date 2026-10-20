const TAU = Math.PI * 2;

/**
 * On death it splits into `count` copies of itself, evenly round a seeded
 * angle, flying apart at `speed` px/s, each on its own fork of its stream.
 * Each split makes them `scale` × as big (radius and health) and `haste` × as
 * fast (top speed and acceleration); a copy splits again until it is
 * `generations` splits deep (its `generation`). After the base death, so a
 * Volatile blast spares them.
 */
export default {
  params: {
    count: 'count',
    generations: 'count',
    scale: 'positive',
    haste: 'positive',
    speed: 'number',
  },
  check: ({ scale }) => (scale >= 1 ? 'scale is not below 1' : null),
  usesRandom: true,
  died(enemy, { count, generations, scale, haste, speed }) {
    if (enemy.generation >= generations) return;
    const generation = enemy.generation + 1;
    const size = scale ** generation;
    const pace = haste ** generation;
    const offset = enemy.random.range(0, TAU);
    for (let i = 0; i < count; i += 1) {
      const angle = offset + (i * TAU) / count;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const child = enemy.spawnChild(enemy.type, {
        x: enemy.x + dx * enemy.radius * 0.5,
        y: enemy.y + dy * enemy.radius * 0.5,
        vx: dx * speed,
        vy: dy * speed,
        rotation: angle,
        generation,
        random: enemy.random.fork(`${enemy.type}:split:${generation}:${i}`),
      });
      if (!child) continue;
      // Sized and paced from its own spawn stats, so a copy of an Elite is a
      // plain one.
      child.radius *= size;
      child.collisionRadius *= size;
      child.maxHealth *= size;
      child.health = child.maxHealth;
      for (const key of ['maxSpeed', 'acceleration']) {
        if (Number.isFinite(child.movementConfig?.[key])) {
          child.movementConfig[key] *= pace;
        }
      }
    }
  },
};
