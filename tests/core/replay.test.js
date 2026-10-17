import { describe, expect, it } from 'vitest';
import {
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
    expect(Object.keys(createInputFrame())).toEqual(INPUT_FRAME_FIELDS);
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

  it('serializes to JSON and rejects other versions', () => {
    const recorder = createRecorder({ seed: 'abc', hull: 'interceptor' });
    recorder.record(0, createInputFrame({ down: true }));
    const recording = recorder.toJSON();

    expect(deserialize(serialize(recording))).toEqual(recording);
    expect(() =>
      deserialize(JSON.stringify({ ...recording, version: 99 }))
    ).toThrow(/version/);
  });
});
