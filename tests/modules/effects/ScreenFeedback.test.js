import { describe, expect, it } from 'vitest';
import RandomService from '../../../src/core/RandomService.js';
import {
  PLAYER_HIT_SHAKE,
  ScreenFeedback,
} from '../../../src/modules/effects/ScreenFeedback.js';

describe('ScreenFeedback', () => {
  it('softens and shortens a hit shake under Reduced Motion, read live', () => {
    let motionReduced = false;
    const feedback = new ScreenFeedback({
      random: () => new RandomService('screen-feedback-test'),
      screenShakeScale: () => 1,
      motionReduced: () => motionReduced,
      flashingReduced: () => false,
      damageFlashEnabled: () => true,
    });

    motionReduced = true;
    feedback.addScreenShake(
      PLAYER_HIT_SHAKE.intensity,
      PLAYER_HIT_SHAKE.duration
    );
    // 7 × 0.45 / 10, gone after 0.2 s instead of 0.35 s
    expect(feedback.screenShake.trauma).toBeCloseTo(0.315, 10);
    feedback.update(0.2);
    expect(feedback.screenShake.trauma).toBeCloseTo(0, 10);
  });
});
