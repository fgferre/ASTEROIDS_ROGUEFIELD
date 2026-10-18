// Fixed-step accumulator for the game loop.
//
// Simulation advances in constant 1/60 s steps regardless of display rate:
// 144 Hz screens no longer change physics, a slow frame runs several steps
// to catch up instead of entering slow motion, and seeded randomness means
// the same thing on every machine. Render still happens once per animation
// frame. `alpha` (0..1) is the fraction of a step left over, available for
// render interpolation later.

export const FIXED_STEP_SECONDS = 1 / 60;
// More than this per frame means the machine cannot keep up; the backlog is
// dropped (brief slow motion) rather than spiralling into ever-longer frames.
export const MAX_STEPS_PER_FRAME = 5;
// A frame longer than this (tab in background, debugger) is treated as this.
export const MAX_FRAME_SECONDS = 0.25;

export function createFixedStepper({
  step = FIXED_STEP_SECONDS,
  maxSteps = MAX_STEPS_PER_FRAME,
  maxFrame = MAX_FRAME_SECONDS,
} = {}) {
  let accumulator = 0;

  return {
    step,
    /** Feeds one real-time frame (seconds); returns how many fixed steps to run now. */
    advance(frameSeconds) {
      const dt =
        Number.isFinite(frameSeconds) && frameSeconds > 0
          ? Math.min(frameSeconds, maxFrame)
          : 0;
      accumulator += dt;
      let steps = Math.floor(accumulator / step);
      if (steps > maxSteps) {
        steps = maxSteps;
        accumulator = 0;
      } else {
        accumulator -= steps * step;
      }
      return steps;
    },
    get alpha() {
      return accumulator / step;
    },
    reset() {
      accumulator = 0;
    },
  };
}
