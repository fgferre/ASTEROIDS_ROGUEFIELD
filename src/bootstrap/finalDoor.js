/**
 * `?final=1` (development only: app.js reads it behind IS_DEV): the
 * campaign's last sector started at its boss, the boss one hit from down, so
 * the ending (the truth, the choice, either ending) is a minute away on any
 * device. It is a real run of that sector, started once the pilot is past
 * the start gate and the pilots: the head start's cards first ("Equip for
 * me", pressed twice, makes them at once), then the game's own boss after
 * its own entrance, hurt through its own takeDamage down to HULL_LEFT. The
 * pilot's first shot to land is the last blow (the ship of a head start
 * alone does not outlast this boss), so the win and all that follows it are
 * the game's.
 */

import { ENDING_SECTOR } from '../data/story.js';
import { undoWhenRunEnds } from './contentScene.js';

// The hull the boss keeps: one hit's worth.
export const HULL_LEFT = 1;
const TICK_MS = 100;

// The menu is open: past the loading, the start gate and the pilots
// (loadingScreen.js; the menu sits open under the loading screen at boot).
function menuOpen() {
  const has = (id, name) =>
    document.getElementById(id).classList.contains(name);
  return (
    has('loading-screen', 'hidden') &&
    !has('menu-screen', 'hidden') &&
    !has('menu-screen', 'menu-screen--gated')
  );
}

/** Starts the run once the menu opens. `getServices`: the game's service map. */
export async function openFinalDoor({ getServices }) {
  while (!menuOpen()) {
    await new Promise((resolve) => setTimeout(resolve, TICK_MS));
  }
  const services = getServices();
  const { enemies, 'game-session': session } = services;

  session.startNewRun({ source: 'final-door', sector: ENDING_SECTOR });
  const { lastLayer, sector } = session.mode;
  // The head start holds the first layer: its last pick starts this one.
  enemies.waveManager.currentWave = lastLayer - 1;

  // Its entrance is left whole. After it the boss takes no damage while it
  // closes up, and less than asked behind its shells: asked again until its
  // hull is down.
  const intervalId = setInterval(() => {
    const boss = enemies
      .getActiveEnemies()
      .find((enemy) => enemy.bossKind === sector.boss);
    if (!boss || boss.arrival) return;
    const over = boss.health - HULL_LEFT;
    if (over < 1) clearInterval(intervalId);
    else boss.takeDamage(over + boss.armor, { type: 'final-door' });
  }, TICK_MS);
  undoWhenRunEnds(services['event-bus'], () => clearInterval(intervalId));
}
