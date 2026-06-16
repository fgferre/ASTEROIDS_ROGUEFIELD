import { describe, expect, it } from 'vitest';
import { createAudioContextStub } from '../../__helpers__/stubs.js';

// Self-test for the Wave-0 createAudioContextStub extensions (plan 02.01 Task 1).
// The stub imports `vi`, so it can only be exercised under vitest — a plain
// `node -e` cannot resolve the test runner (review fix: run under vitest).
// These assertions lock the shape downstream manager plans depend on:
//   - createConvolver   -> ReverbBus (02.08)
//   - decodeAudioData   -> stinger buffer path (02.09)
//   - createStereoPanner-> D-13 CONC/FAN fire pan (02.10)
describe('createAudioContextStub Web Audio extensions', () => {
  it('exposes createConvolver, decodeAudioData, createStereoPanner as functions', () => {
    const context = createAudioContextStub();

    expect(context).toHaveProperty('createConvolver');
    expect(context).toHaveProperty('decodeAudioData');
    expect(context).toHaveProperty('createStereoPanner');
    expect(typeof context.createConvolver).toBe('function');
    expect(typeof context.decodeAudioData).toBe('function');
    expect(typeof context.createStereoPanner).toBe('function');
  });

  it('createConvolver returns a node with a writable buffer and connect/disconnect', () => {
    const context = createAudioContextStub();
    const convolver = context.createConvolver();

    expect(convolver).toHaveProperty('buffer');
    expect(convolver.buffer).toBeNull();
    expect(typeof convolver.connect).toBe('function');
    expect(typeof convolver.disconnect).toBe('function');

    // ReverbBus assigns the IR buffer after construction — prove it is writable.
    const fakeIR = { numberOfChannels: 2, length: 4 };
    convolver.buffer = fakeIR;
    expect(convolver.buffer).toBe(fakeIR);
  });

  it('decodeAudioData resolves to a buffer-like whose getChannelData returns a Float32Array', async () => {
    const context = createAudioContextStub();
    const decoded = await context.decodeAudioData(new ArrayBuffer(8));

    expect(decoded).toHaveProperty('getChannelData');
    expect(typeof decoded.getChannelData).toBe('function');
    expect(decoded).toHaveProperty('numberOfChannels');
    expect(decoded).toHaveProperty('sampleRate');

    const channel = decoded.getChannelData(0);
    expect(channel).toBeInstanceOf(Float32Array);
  });

  it('createStereoPanner returns a node whose pan param defaults to 0 with scheduling methods', () => {
    const context = createAudioContextStub();
    const panner = context.createStereoPanner();

    expect(panner).toHaveProperty('pan');
    expect(panner.pan).toHaveProperty('value');
    expect(panner.pan.value).toBe(0);
    expect(typeof panner.pan.setValueAtTime).toBe('function');
    expect(typeof panner.pan.linearRampToValueAtTime).toBe('function');
    expect(typeof panner.connect).toBe('function');
    expect(typeof panner.disconnect).toBe('function');
  });

  it('does NOT add an unused createDynamicsCompressor node (review: keep the stub minimal)', () => {
    const context = createAudioContextStub();
    expect(context.createDynamicsCompressor).toBeUndefined();
  });
});
