import { GAME_HEIGHT, GAME_WIDTH } from '../../../core/GameConstants.js';
import { GameDebugLogger } from '../../../utils/dev/GameDebugLogger.js';

/**
 * Spawned more than `margin` px off the field (a Husk dying past an edge), it
 * starts instead within `spread` px of the field's centre, at a seeded spot.
 */
export default {
  params: { margin: 'number', spread: 'number' },
  usesRandom: true,
  init(enemy, { margin, spread }) {
    const off =
      enemy.x < -margin ||
      enemy.x > GAME_WIDTH + margin ||
      enemy.y < -margin ||
      enemy.y > GAME_HEIGHT + margin;
    if (!off) return;
    GameDebugLogger.log('ERROR', `${enemy.type} spawned off the field`, {
      position: { x: enemy.x, y: enemy.y },
    });
    enemy.x = GAME_WIDTH / 2 + enemy.random.range(-spread, spread);
    enemy.y = GAME_HEIGHT / 2 + enemy.random.range(-spread, spread);
  },
};
