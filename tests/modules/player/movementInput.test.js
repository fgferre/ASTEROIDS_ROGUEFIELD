import { describe, expect, it } from 'vitest';
import {
  STRAFE_STICK_DEADZONE,
  splitStrafe,
} from '../../../src/modules/player/movementInput.js';

// The strafe's input (every ship strafes; the RCS System pushes harder).
const IDLE = { up: false, down: false, left: false, right: false };

describe('the strafe input', () => {
  it('Z and C strafe in both flights, the steering left as it is', () => {
    for (const modern of [false, true]) {
      const input = { ...IDLE, up: true, strafeLeft: true };
      expect(splitStrafe(input, modern)).toEqual({ strafe: -1, steer: input });
      expect(splitStrafe({ ...IDLE, strafeRight: true }, modern).strafe).toBe(
        1
      );
    }
  });

  it("classic on a pad: the left stick strafes as far as it leans clearly sideways; modern's and touch's stick do not", () => {
    const pad = { ...IDLE, pad: true, moveX: -0.7, moveY: -0.7 };
    const past = (0.7 - STRAFE_STICK_DEADZONE) / (1 - STRAFE_STICK_DEADZONE);
    expect(splitStrafe(pad, false).strafe).toBeCloseTo(-(past ** 1.5), 9);
    expect(splitStrafe(pad, false).steer).toBe(pad); // it still thrusts
    // pushed forward 20° off straight: no slide
    const crooked = { ...IDLE, pad: true, moveX: Math.sin(0.35), moveY: -1 };
    expect(splitStrafe(crooked, false).strafe).toBe(0);
    expect(splitStrafe({ ...pad, moveX: 1, moveY: 0 }, false).strafe).toBe(1);
    expect(splitStrafe(pad, true).strafe).toBe(0); // modern: it steers
    expect(splitStrafe({ ...IDLE, moveX: -0.5 }, false).strafe).toBe(0);
  });

  it('held (LB): left and right strafe instead of turning; modern lets go of the steering', () => {
    const dpad = { ...IDLE, up: true, right: true, strafeHold: true };
    expect(splitStrafe(dpad, false)).toMatchObject({
      strafe: 1,
      steer: { up: true, right: false },
    });
    const stick = { ...IDLE, pad: true, moveX: 1, moveY: -0.4 };
    expect(splitStrafe({ ...stick, strafeHold: true }, true)).toMatchObject({
      strafe: 1,
      steer: { up: false, moveX: 0, moveY: 0 },
    });
  });
});
