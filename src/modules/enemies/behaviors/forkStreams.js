/**
 * Forks an aim and a maneuver stream off its own at spawn (`aimRandom`,
 * `maneuverRandom`). Each fork advances its own stream, so every later draw
 * from it (the movement and weapon components') depends on them.
 */
export default {
  params: {},
  usesRandom: true,
  reset(enemy) {
    enemy.aimRandom = null;
    enemy.maneuverRandom = null;
  },
  init(enemy) {
    enemy.aimRandom = enemy.random.fork(`${enemy.type}:aim`);
    enemy.maneuverRandom = enemy.random.fork(`${enemy.type}:maneuver`);
  },
};
