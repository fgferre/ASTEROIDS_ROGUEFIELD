// Run recording and replay.
//
// A run is reproducible from its seed, hull and the input the simulation
// consumed at each fixed step (see fixedStep.js). The recording stores that
// per-step input run-length encoded (only the steps where it changes) plus the
// upgrade picked at each level-up, in pick order. Dependency-free on purpose:
// the browser (F9 download, `?replay=`) and the headless tests share it.

export const REPLAY_VERSION = 1;

// One step of input. Movement fields are held state; the rest are presses
// that happened since the previous step. Field order is the bit order of the
// encoded mask, so it must never be reordered — only appended to (with a
// version bump).
export const INPUT_FRAME_FIELDS = Object.freeze([
  'up',
  'down',
  'left',
  'right',
  'shield',
  'spread',
  'aim',
]);

export function createInputFrame(values = {}) {
  const frame = {};
  for (const field of INPUT_FRAME_FIELDS) {
    frame[field] = Boolean(values[field]);
  }
  return Object.seal(frame);
}

export function encodeInputFrame(frame) {
  let mask = 0;
  INPUT_FRAME_FIELDS.forEach((field, bit) => {
    if (frame?.[field]) mask |= 1 << bit;
  });
  return mask;
}

export function decodeInputFrame(mask) {
  const frame = {};
  INPUT_FRAME_FIELDS.forEach((field, bit) => {
    frame[field] = (mask & (1 << bit)) !== 0;
  });
  return Object.seal(frame);
}

/**
 * Records a run. `record(step, frame)` must be called with increasing steps,
 * starting at 0 for the first simulated step of the run.
 */
export function createRecorder({
  seed,
  hull = null,
  version = REPLAY_VERSION,
}) {
  const inputs = [];
  const upgrades = [];
  let lastMask = null;
  let steps = 0;

  return {
    record(step, frame) {
      const mask = encodeInputFrame(frame);
      if (mask !== lastMask) {
        inputs.push([step, mask]);
        lastMask = mask;
      }
      steps = Math.max(steps, step + 1);
    },
    /** Level-up pick, applied after `step` steps of the run. */
    recordUpgrade(step, upgradeId) {
      upgrades.push([step, upgradeId]);
    },
    get steps() {
      return steps;
    },
    toJSON() {
      return {
        version,
        seed,
        hull,
        steps,
        inputs: inputs.map((entry) => [...entry]),
        upgrades: upgrades.map((entry) => [...entry]),
      };
    },
  };
}

/** Plays back a recording produced by `createRecorder().toJSON()`. */
export function createPlayer(recording) {
  const { inputs, upgrades, steps } = recording;
  let cursor = 0;
  let nextUpgrade = 0;

  return {
    recording,
    steps,
    /** Input for `step`, or null once the recording has ended. */
    frameAt(step) {
      if (step < 0 || step >= steps || inputs.length === 0) {
        return null;
      }
      // Steps are read in order during playback; rewind only if asked back.
      if (inputs[cursor][0] > step) cursor = 0;
      while (cursor + 1 < inputs.length && inputs[cursor + 1][0] <= step) {
        cursor += 1;
      }
      return decodeInputFrame(inputs[cursor][1]);
    },
    /** Next recorded level-up pick, in order; null when none are left. */
    takeUpgrade() {
      if (nextUpgrade >= upgrades.length) return null;
      const [step, upgradeId] = upgrades[nextUpgrade];
      nextUpgrade += 1;
      return { step, upgradeId };
    },
    isFinished(step) {
      return step >= steps;
    },
  };
}

export function serialize(recording) {
  return JSON.stringify(recording);
}

export function deserialize(text) {
  const data = typeof text === 'string' ? JSON.parse(text) : text;
  if (!data || data.version !== REPLAY_VERSION) {
    throw new Error(
      `[replay] Unsupported recording version ${data?.version} (expected ${REPLAY_VERSION})`
    );
  }
  if (!Array.isArray(data.inputs) || !Number.isInteger(data.steps)) {
    throw new Error('[replay] Recording is missing inputs or steps');
  }
  return {
    version: data.version,
    seed: data.seed,
    hull: data.hull ?? null,
    steps: data.steps,
    inputs: data.inputs,
    upgrades: Array.isArray(data.upgrades) ? data.upgrades : [],
  };
}
