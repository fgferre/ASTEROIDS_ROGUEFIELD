import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import {
  createHeadlessGame,
  installDomStubs,
} from '../__helpers__/headlessGame.js';
import { installFakeGamepad } from '../__helpers__/fakeGamepad.js';

const AIM = Math.atan2(0.7, -0.7); // right stick down-left

describe('right-stick manual aim', () => {
  let restoreDom;
  let fake;

  beforeEach(() => {
    restoreDom = installDomStubs();
    fake = installFakeGamepad();
  });

  afterEach(() => {
    fake.restore();
    GamePools.releaseAll();
    restoreDom();
  });

  const steps = (game, count, each = () => {}) => {
    for (let i = 0; i < count; i += 1) {
      game.step();
      each();
    }
  };

  // The bullet fired last has the most life left.
  const newestBulletAngle = (combat) => {
    const bullet = combat.bullets.reduce((a, b) => (b.life > a.life ? b : a));
    return Math.atan2(bullet.vy, bullet.vx);
  };

  it('aims the turret and the shots along the held stick, without a lock, then back to auto', () => {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test' });
    const { combat, player } = game.services;
    steps(game, 150);
    expect(combat.currentTarget).not.toBeNull();

    // A light push (inside the engage) leaves auto-aim alone.
    fake.set({ axes: [0, 0, -0.2, 0.2] });
    steps(game, 5);
    expect(player.getAimStick()).toBeNull();
    expect(combat.currentTarget).not.toBeNull();

    fake.set({ axes: [0, 0, -0.7, 0.7] });
    let locked = 0;
    steps(game, 60, () => {
      if (combat.currentTarget) locked += 1;
    });
    expect(locked).toBe(0);
    expect(player.turretAngle).toBeCloseTo(AIM, 2);
    expect(newestBulletAngle(combat)).toBeCloseTo(AIM, 2);

    fake.set();
    steps(game, 30);
    expect(player.getAimStick()).toBeNull();
    expect(combat.currentTarget).not.toBeNull();
    expect(player.aimPoint).toEqual(combat.getPrimaryAimPoint());
  });
});
