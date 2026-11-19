import { describe, expect, it } from 'vitest';
import {
  TouchControls,
  touchModeFromUrl,
  touchMovement,
} from '../../../src/modules/input/touchControls.js';

const UP = { x: 0, y: -1 };
const facingRight = { angle: 0, angularVelocity: 0 };

describe('touch stick', () => {
  it("picks the thumb's flight from ?toque=, 'teclas' by default", () => {
    expect(touchModeFromUrl('')).toBe('teclas');
    expect(touchModeFromUrl('?toque=aponta')).toBe('aponta');
    expect(touchModeFromUrl('?toque=other')).toBe('teclas');
  });

  it("'teclas': the stick is the pad's four move keys plus its analog", () => {
    expect(touchMovement(UP, 'teclas', facingRight)).toEqual({
      up: true,
      down: false,
      left: false,
      right: false,
      moveX: 0,
      moveY: -1,
    });
    const leftDown = touchMovement({ x: -0.8, y: 0.6 }, 'teclas', facingRight);
    expect([leftDown.left, leftDown.down, leftDown.up]).toEqual([
      true,
      true,
      false,
    ]);
    // Inside the deadzone nothing is held.
    expect(touchMovement({ x: 0.1, y: 0.1 }, 'teclas', facingRight)).toEqual({
      up: false,
      down: false,
      left: false,
      right: false,
      moveX: 0,
      moveY: 0,
    });
  });

  it("'aponta': turns the nose toward the thumb, thrusts once it is near", () => {
    // Nose right, thumb up (screen y down): turn counter-clockwise, no thrust.
    const turning = touchMovement(UP, 'aponta', facingRight);
    expect([turning.left, turning.right, turning.up]).toEqual([
      true,
      false,
      false,
    ]);
    // Nose almost up: thrust, no turn; nothing ever brakes.
    const flying = touchMovement(UP, 'aponta', { angle: -1.55 });
    expect([flying.left, flying.right, flying.up, flying.down]).toEqual([
      false,
      false,
      true,
      false,
    ]);
    // A light push only turns the nose (aiming the fixed cannon).
    const light = touchMovement({ x: 0, y: -0.45 }, 'aponta', { angle: -1.55 });
    expect(light.up).toBe(false);
    // Spinning toward the thumb fast: counter-steer instead of overshooting.
    const coasting = touchMovement(UP, 'aponta', {
      angle: -1.2,
      angularVelocity: -3,
    });
    expect([coasting.left, coasting.right]).toEqual([false, true]);
  });

  it('joins the keys and pad: keys add up, a moved pad stick wins', () => {
    const touch = new TouchControls({
      input: null,
      player: facingRight,
      eventBus: null,
      mode: 'teclas',
    });
    touch.stick = UP;
    const keys = { up: false, down: false, left: true, right: false };
    expect(touch.merge({ ...keys, moveX: 0, moveY: 0 })).toMatchObject({
      up: true,
      left: true,
      moveX: 0,
      moveY: -1,
    });
    expect(touch.merge({ ...keys, moveX: 0.5, moveY: 0 })).toMatchObject({
      moveX: 0.5,
      moveY: 0,
    });
  });
});
