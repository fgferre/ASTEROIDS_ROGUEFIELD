// Run recording and replay.
//
// A run is reproducible from its seed, hull, difficulty, mode and the input the
// simulation consumed at each fixed step (see fixedStep.js). The recording stores that
// per-step input run-length encoded (only the steps where it changes) plus the
// upgrade picked at each level-up, in pick order, with any reroll or banish
// made on the level-up screen before the pick. Analog stick values (gamepad)
// are quantized before the simulation sees them, so the stored integers
// replay exactly. Dependency-free on purpose:
// the browser (F9 download, `?replay=`) and the headless tests share it.

export const REPLAY_VERSION = 6;
// Version 1 had no `dash` bit (bit 7); its masks decode unchanged with dash off.
// Versions 1-2 had no level-up rerolls/banishes (version 3); their picks are
// ids only and load unchanged.
// Versions 1-3 had no analog sticks (version 4); their entries are
// [step, mask] only and decode with the sticks centred.
// Versions 1-4 had no difficulty (version 5); they load as Veteran, the only
// difficulty there was.
// Versions 1-5 had no mode (version 6); they load as a normal run, the way
// they always played back.
const READABLE_VERSIONS = new Set([1, 2, 3, 4, 5, REPLAY_VERSION]);
const LEGACY_DIFFICULTY = 'veteran';
const LEGACY_MODE = 'normal';

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
  'dash', // version 2
]);

// Held stick axes in -1..1 (screen axes, y down): left stick move, right
// stick aim. Stored after the mask as integers (version 4).
export const INPUT_ANALOG_FIELDS = Object.freeze([
  'moveX',
  'moveY',
  'aimX',
  'aimY',
]);
/** Analog steps per unit: values are multiples of 1 / ANALOG_RESOLUTION. */
export const ANALOG_RESOLUTION = 100;

function quantizeAxis(value) {
  const clamped = Math.max(-1, Math.min(1, Number(value) || 0));
  // `|| 0` folds -0 into 0.
  return Math.round(clamped * ANALOG_RESOLUTION) || 0;
}

function analogFrom(frame, ints) {
  INPUT_ANALOG_FIELDS.forEach((field, index) => {
    frame[field] = (ints[index] || 0) / ANALOG_RESOLUTION;
  });
}

export function createInputFrame(values = {}) {
  const frame = {};
  for (const field of INPUT_FRAME_FIELDS) {
    frame[field] = Boolean(values[field]);
  }
  analogFrom(
    frame,
    INPUT_ANALOG_FIELDS.map((field) => quantizeAxis(values[field]))
  );
  return Object.seal(frame);
}

/** The frame's sticks as stored integers; empty when all are centred. */
export function encodeAnalog(frame) {
  const ints = INPUT_ANALOG_FIELDS.map((field) => quantizeAxis(frame?.[field]));
  return ints.some((value) => value !== 0) ? ints : [];
}

export function encodeInputFrame(frame) {
  let mask = 0;
  INPUT_FRAME_FIELDS.forEach((field, bit) => {
    if (frame?.[field]) mask |= 1 << bit;
  });
  return mask;
}

export function decodeInputFrame(mask, analog = []) {
  const frame = {};
  INPUT_FRAME_FIELDS.forEach((field, bit) => {
    frame[field] = (mask & (1 << bit)) !== 0;
  });
  analogFrom(frame, analog);
  return Object.seal(frame);
}

/**
 * Records a run. `record(step, frame)` must be called with increasing steps,
 * starting at 0 for the first simulated step of the run. `mode` is 'normal',
 * 'daily' or 'bossRush'; `date` is the Daily Field's UTC day ('YYYY-MM-DD'),
 * which its seed is drawn from, and null on any other run.
 */
export function createRecorder({
  seed,
  hull = null,
  difficulty = LEGACY_DIFFICULTY,
  mode = LEGACY_MODE,
  date = null,
  version = REPLAY_VERSION,
}) {
  const inputs = [];
  const upgrades = [];
  let lastKey = null;
  let steps = 0;

  return {
    record(step, frame) {
      // [step, mask] or, with a stick off centre, [step, mask, ...analog].
      const entry = [step, encodeInputFrame(frame), ...encodeAnalog(frame)];
      const key = entry.slice(1).join();
      if (key !== lastKey) {
        inputs.push(entry);
        lastKey = key;
      }
      steps = Math.max(steps, step + 1);
    },
    /** Level-up pick, applied after `step` steps of the run. */
    recordUpgrade(step, upgradeId) {
      upgrades.push([step, upgradeId]);
    },
    /** Level-up screen reroll, before the pick (version 3). */
    recordReroll(step) {
      upgrades.push([step, { type: 'reroll' }]);
    },
    /** Level-up screen banish of `upgradeId`, before the pick (version 3). */
    recordBanish(step, upgradeId) {
      upgrades.push([step, { type: 'banish', id: upgradeId }]);
    },
    get steps() {
      return steps;
    },
    toJSON() {
      return {
        version,
        seed,
        hull,
        difficulty,
        mode,
        date,
        steps,
        inputs: inputs.map((entry) => [...entry]),
        upgrades: upgrades.map(([step, entry]) => [
          step,
          typeof entry === 'string' ? entry : { ...entry },
        ]),
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
      const [, mask, ...analog] = inputs[cursor];
      return decodeInputFrame(mask, analog);
    },
    /**
     * Next recorded level-up action, in order; null when none are left. A
     * pick is `{ step, upgradeId }`; a reroll `{ step, action: 'reroll' }`; a
     * banish `{ step, action: 'banish', upgradeId }`.
     */
    takeUpgrade() {
      if (nextUpgrade >= upgrades.length) return null;
      const [step, entry] = upgrades[nextUpgrade];
      nextUpgrade += 1;
      if (typeof entry === 'string') {
        return { step, upgradeId: entry };
      }
      return entry.type === 'banish'
        ? { step, action: 'banish', upgradeId: entry.id }
        : { step, action: 'reroll' };
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
  if (!data || !READABLE_VERSIONS.has(data.version)) {
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
    difficulty: data.difficulty ?? LEGACY_DIFFICULTY,
    mode: data.mode ?? LEGACY_MODE,
    date: data.date ?? null,
    steps: data.steps,
    inputs: data.inputs,
    upgrades: Array.isArray(data.upgrades) ? data.upgrades : [],
  };
}
