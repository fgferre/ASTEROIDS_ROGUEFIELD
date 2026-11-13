// Goes with item1-combo-recipe-kills.patch (place under tests/modules/enemies/).
import { afterEach, beforeEach, expect, it } from 'vitest';
import { setupGlobalMocks, cleanupGlobalState } from '../../__helpers__/setup.js';
import { createHeadlessGame, installDomStubs } from '../../__helpers__/headlessGame.js';

let restore;
beforeEach(() => {
  setupGlobalMocks();
  restore = installDomStubs();
});
afterEach(() => {
  restore();
  cleanupGlobalState();
});

it('a player hit that kills a recipe enemy steps the combo', () => {
  const game = createHeadlessGame();
  game.session.startNewRun({ source: 'test' });
  const { enemies, progression } = game.services;
  const hunter = enemies.acquireEnemyViaFactory('hunter', { x: 300, y: 300, wave: 1 });
  enemies.applyDamage(hunter, hunter.maxHealth, {
    source: { hitPosition: { x: 300, y: 300 } },
  });
  expect(progression.currentCombo).toBe(1);
});
