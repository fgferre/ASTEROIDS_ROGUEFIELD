import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/EventBus.js';
import { installDomStubs } from '../__helpers__/headlessGame.js';
import { BASTION_HULL_ID } from '../../src/data/shipModels.js';
import AchievementService from '../../src/services/AchievementService.js';

describe('AchievementService in Boss Rush', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => restoreDom());

  const setup = () => {
    const eventBus = new EventBus();
    const service = new AchievementService({ eventBus });
    const unlocked = [];
    eventBus.on('achievement-unlocked', ({ id }) => unlocked.push(id));
    return { eventBus, service, unlocked };
  };

  it('does not count the Warden layers it starts at as layers cleared or reached', () => {
    const { eventBus, unlocked } = setup();
    eventBus.emit('game-started', { bossRush: true });
    eventBus.emit('wave-started', { wave: 5, bossRush: true });
    eventBus.emit('wave-complete', { wave: 5 });
    eventBus.emit('wave-started', { wave: 20, bossRush: true });
    expect(unlocked).toEqual([]);
  });

  it('counts layers again in a normal run after a Boss Rush', () => {
    const { eventBus, unlocked } = setup();
    eventBus.emit('wave-started', { wave: 5, bossRush: true });
    eventBus.emit('wave-started', { wave: 1, bossRush: false });
    eventBus.emit('wave-complete', { wave: 1 });
    expect(unlocked).toEqual(['first-light']);
  });

  it('still unlocks Warden, no-damage and win achievements', () => {
    const { eventBus, unlocked } = setup();
    eventBus.emit('wave-started', { wave: 5, bossRush: true });
    eventBus.emit('boss-defeated', { bossKind: 'prime' });
    eventBus.emit('wave-started', { wave: 15, bossRush: true });
    eventBus.emit('boss-defeated', { bossKind: 'null' });
    eventBus.emit('run-won', { wave: 15, hullId: BASTION_HULL_ID });
    expect(unlocked).toEqual(
      expect.arrayContaining([
        'ring-breaker',
        'untouchable',
        'null-and-void',
        'iron-escort',
      ])
    );
    expect(unlocked).not.toContain('first-light');
  });
});
