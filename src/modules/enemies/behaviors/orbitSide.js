/**
 * Which way it circles the ship (`orbitDirection`, 1 or -1, read by the orbit
 * movement strategy): a coin flip at spawn on the stream `stream` names
 * (`random`, or a fork such as `maneuverRandom`).
 */
export default {
  params: { stream: 'string' },
  usesRandom: true,
  reset(enemy) {
    enemy.orbitDirection = 1;
  },
  init(enemy, { stream }) {
    enemy.orbitDirection = enemy[stream].chance(0.5) ? 1 : -1;
  },
};
