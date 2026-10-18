import { describe, expect, it } from 'vitest';
import {
  INPUT_ANALOG_FIELDS,
  INPUT_FRAME_FIELDS,
  REPLAY_VERSION,
  createInputFrame,
  createPlayer,
  createRecorder,
  decodeInputFrame,
  deserialize,
  encodeInputFrame,
  serialize,
} from '../../src/core/replay.js';

describe('replay recording', () => {
  it('round-trips every input frame field through the encoded mask', () => {
    for (const field of INPUT_FRAME_FIELDS) {
      const frame = createInputFrame({ [field]: true });
      expect(decodeInputFrame(encodeInputFrame(frame))).toEqual(frame);
    }
    expect(Object.keys(createInputFrame())).toEqual([
      ...INPUT_FRAME_FIELDS,
      ...INPUT_ANALOG_FIELDS,
    ]);
  });

  it('stores only the steps where the input changes', () => {
    const recorder = createRecorder({ seed: 42, hull: 'default' });
    const thrust = createInputFrame({ up: true });
    recorder.record(0, thrust);
    recorder.record(1, thrust);
    recorder.record(2, createInputFrame({ up: true, shield: true }));
    recorder.record(3, thrust);
    recorder.record(4, thrust);

    const json = recorder.toJSON();
    expect(json).toMatchObject({
      version: REPLAY_VERSION,
      seed: 42,
      hull: 'default',
      steps: 5,
    });
    expect(json.inputs).toEqual([
      [0, 1],
      [2, 17],
      [3, 1],
    ]);
  });

  it('plays back the recorded frame for every step and null past the end', () => {
    const recorder = createRecorder({ seed: 7 });
    const frames = [
      { left: true },
      { left: true },
      {},
      { right: true, aim: true },
      { right: true },
    ].map((values) => createInputFrame(values));
    frames.forEach((frame, step) => recorder.record(step, frame));

    const player = createPlayer(recorder.toJSON());
    frames.forEach((frame, step) => {
      expect(player.frameAt(step)).toEqual(frame);
    });
    expect(player.frameAt(frames.length)).toBeNull();
    // Reading backwards still works (cursor rewinds).
    expect(player.frameAt(0)).toEqual(frames[0]);
  });

  it('returns level-up picks in the order they were made', () => {
    const recorder = createRecorder({ seed: 1 });
    recorder.record(0, createInputFrame());
    recorder.recordUpgrade(120, 'plasma');
    recorder.recordUpgrade(400, 'multishot');

    const player = createPlayer(recorder.toJSON());
    expect(player.takeUpgrade()).toEqual({ step: 120, upgradeId: 'plasma' });
    expect(player.takeUpgrade()).toEqual({
      step: 400,
      upgradeId: 'multishot',
    });
    expect(player.takeUpgrade()).toBeNull();
  });

  it('returns level-up rerolls and banishes in order with the picks (version 3)', () => {
    const recorder = createRecorder({ seed: 1 });
    recorder.record(0, createInputFrame());
    recorder.recordReroll(120);
    recorder.recordBanish(120, 'plasma');
    recorder.recordUpgrade(120, 'multishot');

    const player = createPlayer(deserialize(serialize(recorder.toJSON())));
    expect(REPLAY_VERSION).toBeGreaterThanOrEqual(3);
    expect(player.takeUpgrade()).toEqual({ step: 120, action: 'reroll' });
    expect(player.takeUpgrade()).toEqual({
      step: 120,
      action: 'banish',
      upgradeId: 'plasma',
    });
    expect(player.takeUpgrade()).toEqual({ step: 120, upgradeId: 'multishot' });
  });

  it('serializes to JSON and rejects other versions', () => {
    const recorder = createRecorder({ seed: 'abc', hull: 'interceptor' });
    recorder.record(0, createInputFrame({ down: true }));
    const recording = recorder.toJSON();

    expect(deserialize(serialize(recording))).toEqual(recording);
    expect(() =>
      deserialize(JSON.stringify({ ...recording, version: 99 }))
    ).toThrow(/version/);
  });

  it('records dash presses as bit 7 (version 2)', () => {
    expect(REPLAY_VERSION).toBeGreaterThanOrEqual(2);
    expect(encodeInputFrame(createInputFrame({ dash: true }))).toBe(128);
  });

  it('records quantized stick values only while a stick is off centre (version 4)', () => {
    const recorder = createRecorder({ seed: 5 });
    const frames = [
      createInputFrame({ right: true, moveX: 0.8123, moveY: -0.004 }),
      createInputFrame({ right: true, moveX: 0.81 }),
      createInputFrame({ aimX: -1.5, aimY: 0.333 }),
      createInputFrame(),
    ];
    frames.forEach((frame, step) => recorder.record(step, frame));

    const json = recorder.toJSON();
    expect(json.version).toBeGreaterThanOrEqual(4);
    // Step 1 quantizes to the same frame as step 0, so it is not stored.
    expect(json.inputs).toEqual([
      [0, 8, 81, 0, 0, 0],
      [2, 0, 0, 0, -100, 33],
      [3, 0],
    ]);
    expect(frames[0].moveX).toBe(0.81);
    const player = createPlayer(deserialize(serialize(json)));
    frames.forEach((frame, step) => {
      expect(player.frameAt(step)).toEqual(frame);
    });
  });

  it('still reads version 3 recordings, with the sticks centred', () => {
    const v3 = { version: 3, seed: 3, hull: null, steps: 1, inputs: [[0, 1]] };
    const frame = createPlayer(deserialize(v3)).frameAt(0);
    expect(frame.up).toBe(true);
    expect([frame.moveX, frame.moveY, frame.aimX, frame.aimY]).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it('records the difficulty (version 5); older recordings load as Veteran', () => {
    const json = createRecorder({ seed: 9, difficulty: 'warden' }).toJSON();
    expect(json.version).toBe(5);
    expect(deserialize(serialize(json)).difficulty).toBe('warden');
    const v4 = { version: 4, seed: 9, hull: null, steps: 1, inputs: [[0, 1]] };
    expect(deserialize(v4).difficulty).toBe('veteran');
  });

  it('still reads version 1 recordings, with dash off', () => {
    const v1 = { version: 1, seed: 3, hull: null, steps: 2, inputs: [[0, 17]] };
    const player = createPlayer(deserialize(serialize(v1)));
    expect(player.frameAt(1)).toEqual(
      createInputFrame({ up: true, shield: true })
    );
  });
});
