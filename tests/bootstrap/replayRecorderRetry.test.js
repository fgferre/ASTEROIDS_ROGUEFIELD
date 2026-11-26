import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/EventBus.js';
import { createReplayController } from '../../src/bootstrap/replaySession.js';

// The recording ends at the death; a Retry plays on past it, so the dev F9
// must not offer that recording as the run's (outside audit 8, verdict A6).
describe('the run recording and a Retry', () => {
  const setup = () => {
    const eventBus = new EventBus();
    const services = {
      difficulty: {
        getRunSeed: () => 7,
        getDifficulty: () => 'veteran',
        isDaily: () => false,
        dateKey: null,
      },
      player: { stickSensitivity: 'medium' },
      hangar: { getRunSetup: () => null },
    };
    const session = {
      replayRecorder: null,
      services,
      getConfiguredHullId: () => 'interceptor',
    };
    createReplayController({
      eventBus,
      input: { setInputSource() {} },
      session,
      progression: { pendingUpgradeOptions: [] },
      ui: {},
      getStep: () => 0,
    });
    return { eventBus, session };
  };

  it('keeps the recording to the death on the death screen', () => {
    const { eventBus, session } = setup();
    eventBus.emit('game-started', {});
    eventBus.emit('player-died', {});
    expect(session.replayRecorder).not.toBeNull();
  });

  it('drops it once a Retry starts', () => {
    const { eventBus, session } = setup();
    eventBus.emit('game-started', {});
    eventBus.emit('player-died', {});
    eventBus.emit('session-retry-countdown', { remaining: 3 });
    expect(session.replayRecorder).toBeNull();
  });
});
