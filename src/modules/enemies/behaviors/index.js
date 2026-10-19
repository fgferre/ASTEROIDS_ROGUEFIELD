// The behavior library a recipe enemy (types/RecipeEnemy.js) is built from:
// its content file names behaviors from here, in order, with their params.
//
// A behavior is a plain object. `params` names each param it reads and its
// kind ('number' or 'string'; tests/content/enemies.test.js checks every
// recipe against it); `usesRandom` marks one that draws from the enemy's own
// stream, so its recipe must be `seeded`. Its hooks, all optional, receive
// (enemy, params, ...):
// - reset(): its state's starting values (construction and pool reset);
// - init(config): at spawn, after the stats and the random stream;
// - tick / steer / act(deltaTime, frame): one frame, in that order across
//   behaviors; `frame` = { live, player, target } (live: a positive step on
//   a living enemy; target: the ship's position or null);
// - takeDamage(amount, source): the damage left for the hull, or null for none;
// - dying(source, context) / died(source, context): before and after the
//   base death (its event, Volatile, Splitter).
// `getters` are read on the enemy by name (the views read them).
// Its state lives on the enemy, under the names the views and tests read.
import fanShot from './fanShot.js';
import forage from './forage.js';
import frontalShield from './frontalShield.js';
import holdRange from './holdRange.js';
import lobShell from './lobShell.js';
import phase from './phase.js';
import spawnOnDeath from './spawnOnDeath.js';

export const BEHAVIORS = Object.freeze({
  'hold-range': holdRange,
  'lob-shell': lobShell,
  phase,
  'fan-shot': fanShot,
  forage,
  'spawn-on-death': spawnOnDeath,
  'frontal-shield': frontalShield,
});
