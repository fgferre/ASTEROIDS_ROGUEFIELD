import { describe, expect, it } from 'vitest';
import {
  DAMAGE_TEXT_PX,
  DamageText,
  damageTextPop,
  damageTextStyle,
} from '../../src/modules/EffectEntities.js';
import { PALETTE } from '../../src/data/constants/palette.js';

describe('damage numbers', () => {
  it('grow with the log of the damage and step white → amber → red', () => {
    expect(damageTextStyle(2)).toEqual({ scale: 0.8, color: PALETTE.text });
    expect(damageTextStyle(20).color).toBe(PALETTE.text);
    expect(damageTextStyle(30).color).toBe(PALETTE.shot);
    expect(damageTextStyle(60).color).toBe(PALETTE.threat);
    expect(damageTextStyle(100).scale).toBeCloseTo(1.6, 6);
    expect(damageTextStyle(400).scale).toBeCloseTo(1.6, 6);
    const mid = damageTextStyle(Math.sqrt(5 * 100)).scale;
    expect(mid).toBeCloseTo(1.2, 6);
    expect(damageTextStyle(20, true).scale).toBeGreaterThan(
      damageTextStyle(20).scale
    );
    expect(damageTextStyle(10, true).color).toBe(PALETTE.shot);
  });

  it('pop in past their size, then settle', () => {
    expect(damageTextPop(0)).toBe(0);
    expect(damageTextPop(0.12)).toBeGreaterThan(1.2);
    expect(damageTextPop(0.5)).toBe(1);

    const text = new DamageText(0, 0, 100, false);
    let peak = 0;
    for (let i = 0; i < 40; i += 1) {
      text.update(0.01);
      peak = Math.max(peak, text.size);
    }
    expect(peak).toBeGreaterThan(DAMAGE_TEXT_PX * 1.6);
    expect(text.size).toBeCloseTo(DAMAGE_TEXT_PX * 1.6, 6);
  });
});
