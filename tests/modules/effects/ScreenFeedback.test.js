import { describe, expect, it } from 'vitest';
import RandomService from '../../../src/core/RandomService.js';
import {
  BOSS_LOOT_FUSION_GAP,
  PLAYER_HIT_SHAKE,
  ScreenFeedback,
  hullFlashIntensity,
  hullLoss,
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

  it('counts only what reached the hull: a hit the shield took whole is 0', () => {
    expect(hullLoss({ damage: 12, healthDamage: 0 })).toBe(0);
    expect(hullLoss({ damage: 12, healthDamage: 5 })).toBe(5);
    expect(hullLoss({ damage: 12 })).toBe(12);
  });

  it('reddens the screen as much as the hull lost', () => {
    expect(hullFlashIntensity(12, 100)).toBeCloseTo(0.3, 5);
    expect(hullFlashIntensity(3, 100)).toBeLessThan(0.3);
    expect(hullFlashIntensity(30, 100)).toBeGreaterThan(0.3);
    expect(hullFlashIntensity(100, 100)).toBeLessThanOrEqual(0.45);
  });

  it("lets a boss's fall hold the screen only as long as it was given", () => {
    const feedback = new ScreenFeedback({
      random: () => new RandomService('screen-feedback-test'),
      screenShakeScale: () => 1,
      motionReduced: () => false,
      flashingReduced: () => false,
      damageFlashEnabled: () => true,
    });
    feedback.bossFallHold = BOSS_LOOT_FUSION_GAP;
    // other shakes do not stretch it
    feedback.addScreenShake('bossDefeated');
    feedback.update(BOSS_LOOT_FUSION_GAP);
    expect(feedback.screenShake.trauma).toBeGreaterThan(0);
    expect(feedback.bossFallHold).toBe(0);
  });
});
