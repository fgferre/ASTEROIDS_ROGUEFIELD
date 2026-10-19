/**
 * Its arms turn at `speed` rad/s the way it circles (`orbitDirection`), from
 * a seeded angle (`spin`, read by the view).
 */
export default {
  params: { speed: 'number' },
  usesRandom: true,
  reset(enemy) {
    enemy.spin = 0;
  },
  init(enemy) {
    enemy.spin = enemy.random.range(0, Math.PI * 2);
  },
  tick(enemy, { speed }, deltaTime, { live }) {
    if (!live) return;
    enemy.spin += speed * deltaTime * enemy.orbitDirection;
  },
};
