import { describe, expect, it } from 'vitest';
import { HOME_SHOTS } from '../../../src/core/cinematics.js';
import {
  homeAt,
  isHomeBeat,
} from '../../../src/modules/render3d/endingHome.js';

describe("the ending's beats at home", () => {
  it('are the five between the answer and the last image', () => {
    ['home', 'steady', 'return', 'depart', 'watch'].forEach((id) =>
      expect(isHomeBeat(id)).toBe(true)
    );
    ['answer', 'twin', 'known'].forEach((id) =>
      expect(isHomeBeat(id)).toBe(false)
    );
  });

  it("darkens Severance's horizon Ring last: lit at home, dying on the way in, dark by the middle of the departure, never relit", () => {
    const at = (beat, u) => ({ ...homeAt(beat, u, 'severance') });
    expect(at('home', 0.5)).toMatchObject({ wake: 1, idle: 1 });
    expect(at('steady', 1)).toMatchObject({ wake: 1, idle: 1 });
    const back = at('return', 1).wake;
    expect(back).toBeLessThan(1);
    expect(back).toBeGreaterThan(0);
    expect(at('depart', 0).wake).toBeCloseTo(back);
    const { darkBy } = HOME_SHOTS.ring.severance;
    expect(at('depart', darkBy)).toMatchObject({ wake: 0, idle: 0 });
    expect(at('depart', 1)).toMatchObject({ wake: 0, idle: 0 });
  });

  it("keeps Stewardship's Ring lit a little brighter throughout", () => {
    ['home', 'steady', 'watch'].forEach((beat) =>
      [0, 0.5, 1].forEach((u) =>
        expect(homeAt(beat, u, 'stewardship').wake).toBe(1.25)
      )
    );
  });

  it('turns the Wake slowly away as she gets under way, the interceptor shown only coming home and on watch', () => {
    const yaw = [0, 0.25, 0.5, 0.75, 1].map(
      (u) => homeAt('depart', u, 'severance').yaw
    );
    expect(yaw[0]).toBe(0);
    for (let i = 1; i < yaw.length; i += 1) {
      expect(yaw[i]).toBeGreaterThan(yaw[i - 1]);
    }
    expect(yaw[4]).toBeCloseTo(HOME_SHOTS.depart.yaw);
    // slow off the mark: the first half turns less than the second
    expect(yaw[2] - yaw[0]).toBeLessThan(yaw[4] - yaw[2]);
    expect(homeAt('home', 0.5, 'severance').yaw).toBe(0);
    expect(homeAt('return', 0.5, 'severance').ship).toBe(true);
    expect(homeAt('watch', 0.5, 'stewardship').ship).toBe(true);
    expect(homeAt('depart', 0.5, 'severance').ship).toBe(false);
    expect(homeAt('steady', 0.5, 'severance').ship).toBe(false);
    // the hangar's light takes the interceptor in
    expect(homeAt('return', 0, 'severance').bay).toBe(0);
    expect(homeAt('return', 1, 'severance').bay).toBe(HOME_SHOTS.return.bay[1]);
  });
});
