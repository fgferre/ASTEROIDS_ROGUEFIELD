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

  it('returns level-up rerolls and banishes in order with the picks', () => {
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

  it('marks a run flown on a ?voo= variant, and only such a run', () => {
    const today = createRecorder({ seed: 1 }).toJSON();
    const flown = createRecorder({ seed: 1, jets: 'b' }).toJSON();

    expect(today).not.toHaveProperty('jets');
    expect(deserialize(serialize(today))).not.toHaveProperty('jets');
    expect(deserialize(serialize(flown)).jets).toBe('b');
  });

  it('records dash presses as bit 7', () => {
    expect(REPLAY_VERSION).toBeGreaterThanOrEqual(2);
    expect(encodeInputFrame(createInputFrame({ dash: true }))).toBe(128);
  });

  it('records quantized stick values only while a stick is off centre', () => {
    const recorder = createRecorder({ seed: 5 });
    const frames = [
      createInputFrame({ right: true, moveX: 0.8123, moveY: -0.004 }),
      createInputFrame({ right: true, moveX: 0.81 }),
      createInputFrame({ aimX: -1.5, aimY: 0.333 }),
      createInputFrame(),
    ];
    frames.forEach((frame, step) => recorder.record(step, frame));

    const json = recorder.toJSON();
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

  it('records the difficulty, mode and Daily Field day', () => {
    const json = createRecorder({
      seed: 9,
      difficulty: 'warden',
      mode: 'daily',
      date: '2026-10-18',
    }).toJSON();
    expect(json.version).toBe(REPLAY_VERSION);
    expect(deserialize(serialize(json))).toMatchObject({
      difficulty: 'warden',
      mode: 'daily',
      date: '2026-10-18',
    });
  });

  it('refuses recordings made before version 10', () => {
    const old = { version: 9, seed: 9, hull: null, steps: 1, inputs: [[0, 1]] };
    expect(() => deserialize(old)).toThrow(/version/);
    expect(() => deserialize({ ...old, version: 8 })).toThrow(/version/);
    expect(() => deserialize({ ...old, version: 1 })).toThrow(/version/);
  });

  it('records the control scheme', () => {
    const json = createRecorder({ seed: 9, controls: 'classic' }).toJSON();
    expect(deserialize(serialize(json)).controls).toBe('classic');
  });

  it('records the stick sensitivity at the start and at each change; an older recording flies Medium', () => {
    const recorder = createRecorder({ seed: 9, stick: 'high' });
    recorder.record(0, createInputFrame({}));
    recorder.recordStick(120, 'low');
    recorder.recordStick(130, 'low');
    const json = recorder.toJSON();
    const recording = deserialize(serialize(json));
    expect(recording.stick).toEqual([
      [0, 'high'],
      [120, 'low'],
    ]);
    const player = createPlayer(recording);
    expect(player.stickAt(0)).toBe('high');
    expect(player.stickAt(119)).toBe('high');
    expect(player.stickAt(120)).toBe('low');

    delete json.stick;
    expect(createPlayer(deserialize(serialize(json))).stickAt(50)).toBe(
      'medium'
    );
  });
});
