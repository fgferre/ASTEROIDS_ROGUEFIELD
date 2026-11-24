// Run recording and replay.
//
// A run is reproducible from its seed, hull, control scheme, difficulty, mode and
// the input the simulation consumed at each fixed step (see fixedStep.js). The recording stores that
// per-step input run-length encoded (only the steps where it changes) plus the
// upgrade picked at each level-up, in pick order, with any reroll or banish
// made on the level-up screen before the pick, and the Stick Sensitivity at
// the start and at each change (a pause's Settings). Analog stick values
// (gamepad) are quantized before the simulation sees them, so the stored
// integers replay exactly. Dependency-free on purpose:
// the browser (F9 download, `?replay=`) and the headless tests share it.

export const REPLAY_VERSION = 12;
// Recordings before version 12 are refused, as they no longer play back the
// same: 8 drew its random streams from the page's boot seed, before 9 none
// stored the run's Hangar setup, in 9 a pad's left stick held back fired the
// dash forward and its D-pad lost thrust while the right stick aimed
// (outside audit 5, 21/11), 10 flew the drag flight the jets' flight
// replaced (22/11), and 11's Braking System braked the start's flight with a
// turn key held or right after a tap of thrust (23/11). 12 also records the
// strafe (Z and C, the strafe hold); a pad's left stick pushed sideways
// strafes the start's flight.

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
  'dash',
  // The sticks are a pad's (Felipe's two-stick scheme, controle-1, 20/11):
  // their tilt is the force. Last, so older recordings read it false.
  'pad',
  // The strafe (23/11): Z and C held, and the strafe hold (LB, touch).
  'strafeLeft',
  'strafeRight',
  'strafeHold',
]);

// Held stick axes in -1..1 (screen axes, y down): left stick move, right
// stick aim. Stored after the mask as integers.
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
 * which its seed is drawn from, and null on any other run. `sector` is a
 * sector run's sector id (a 'normal' run), null on any other. `hangar` is the run's
 * start-of-run Hangar setup (JSON-safe HangarService modifiers).
 */
export function createRecorder({
  seed,
  hull = null,
  difficulty = 'veteran',
  mode = 'normal',
  date = null,
  sector = null,
  hangar = null,
  stick = 'medium',
  version = REPLAY_VERSION,
}) {
  const inputs = [];
  const upgrades = [];
  const sticks = [[0, stick]];
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
    /** Stick Sensitivity from `step` on (a change from the pause). */
    recordStick(step, value) {
      if (value !== sticks[sticks.length - 1][1]) sticks.push([step, value]);
    },
    /** Level-up pick, applied after `step` steps of the run. */
    recordUpgrade(step, upgradeId) {
      upgrades.push([step, upgradeId]);
    },
    /** Level-up screen reroll, before the pick. */
    recordReroll(step) {
      upgrades.push([step, { type: 'reroll' }]);
    },
    /** Level-up screen banish of `upgradeId`, before the pick. */
    recordBanish(step, upgradeId) {
      upgrades.push([step, { type: 'banish', id: upgradeId }]);
    },
    /** Level-up screen hold of `upgradeId`, before the pick. */
    recordHold(step, upgradeId) {
      upgrades.push([step, { type: 'hold', id: upgradeId }]);
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
        sector,
        hangar,
        stick: sticks.map((entry) => [...entry]),
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
  const { inputs, upgrades, steps, stick } = recording;
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
     * banish or a hold `{ step, action: 'banish' | 'hold', upgradeId }`.
     */
    takeUpgrade() {
      if (nextUpgrade >= upgrades.length) return null;
      const [step, entry] = upgrades[nextUpgrade];
      nextUpgrade += 1;
      if (typeof entry === 'string') {
        return { step, upgradeId: entry };
      }
      return entry.type === 'reroll'
        ? { step, action: 'reroll' }
        : { step, action: entry.type, upgradeId: entry.id };
    },
    /** The Stick Sensitivity flown at `step`. */
    stickAt(step) {
      return stick.findLast(([from]) => from <= step)[1];
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
  if (!data || data?.version !== REPLAY_VERSION) {
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
    difficulty: data.difficulty,
    mode: data.mode,
    date: data.date ?? null,
    sector: data.sector ?? null,
    hangar: data.hangar ?? null,
    // Before the setting (21/11) every pad run flew Medium.
    stick: Array.isArray(data.stick) ? data.stick : [[0, 'medium']],
    steps: data.steps,
    inputs: data.inputs,
    upgrades: Array.isArray(data.upgrades) ? data.upgrades : [],
  };
}
