import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GamePools } from '../../../src/core/GamePools.js';
import { createHeadlessGame } from '../../__helpers__/headlessGame.js';
import { installDomStubs } from '../../__helpers__/domStubs.js';
import {
  killerName,
  runLocationLine,
} from '../../../src/modules/ui/runRecap.js';

describe('death recap', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => {
    GamePools.releaseAll();
    restoreDom();
  });

  const killedBy = (hit) => {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test' });
    const { player } = game.services;
    player.setInvulnerableTimer(0);
    player.health = 1;
    let died = null;
    game.eventBus.on('player-died', (payload) => {
      died = payload;
    });
    hit(game);
    expect(died).not.toBeNull();
    return died.killedBy;
  };

  it('names the enemy whose projectile landed the last hit', () => {
    // The Hunter's own payload: CombatSystem snapshots it onto the bullet.
    const source = killedBy(({ eventBus }) =>
      eventBus.emit('player-hit-by-projectile', {
        damage: 50,
        position: null,
        source: {
          type: 'hunter',
          displayName: 'Elite Hunter',
          elite: true,
        },
      })
    );
    expect(source).toEqual({
      type: 'hunter',
      displayName: 'Elite Hunter',
      elite: true,
      bossKind: null,
      variant: null,
    });
    expect(`Killed by ${killerName(source)}`).toBe('Killed by Elite Hunter');
  });

  it("names a special rock's kind, its blast included; a common rock none", () => {
    const source = killedBy(({ services: { enemies, player } }) => {
      const rock = enemies.acquireAsteroid({
        size: 'small',
        variant: 'volatile',
        wave: 1,
        x: player.position.x + 10,
        y: player.position.y,
        vx: 0,
        vy: 0,
      });
      enemies.registerActiveEnemy(rock);
      enemies.applyDamage(rock, 1e6);
    });
    expect(killerName(source)).toBe('Volatile Ring Fragment');
    expect(killerName({ type: 'asteroid', variant: 'common' })).toBe(
      'Ring Fragment'
    );
  });

  it('names the Warden by kind when its snapshot carries no display name', () => {
    expect(killerName({ type: 'boss', bossKind: 'choir' })).toBe(
      'Warden Choir'
    );
    expect(killerName({ type: 'ram', elite: true })).toBe('Elite Ram');
  });

  it('falls back to the Field when the last hit had no source', () => {
    const source = killedBy(({ services }) =>
      services.enemies.applyDirectDamageToPlayer(50, { cause: 'test' })
    );
    expect(source).toBeNull();
    expect(killerName(source)).toBe('the Field');
  });

  it('places the death by layer, time and chapter', () => {
    expect(runLocationLine(9, 462)).toBe(
      'Layer 9 · 7:42 · CHAPTER II — THE DENSE CORE'
    );
  });

  it('ends the recap line with the best layer when one is recorded', () => {
    expect(runLocationLine(9, 462, 17)).toBe(
      'Layer 9 · 7:42 · CHAPTER II — THE DENSE CORE · BEST LAYER 17'
    );
  });
});
