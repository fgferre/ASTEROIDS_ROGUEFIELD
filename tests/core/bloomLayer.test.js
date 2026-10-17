import { describe, it, expect, beforeEach } from 'vitest';
import * as bloom from '../../src/core/bloomLayer.js';

// Node has no canvas: the layer must degrade to a no-op without throwing.
describe('bloomLayer', () => {
  beforeEach(() => {
    bloom.configure({ enabled: true, intensity: 1 });
  });

  it('hands out no emissive context before a frame begins', () => {
    expect(bloom.getEmissive()).toBeNull();
  });

  it('stays inactive when there is no canvas to back the layer', () => {
    const fakeCtx = { canvas: { width: 800, height: 600 } };
    bloom.beginFrame(fakeCtx);
    expect(bloom.getEmissive()).toBeNull();
    expect(() => bloom.composite(fakeCtx)).not.toThrow();
  });

  it('can be switched off through configure', () => {
    bloom.configure({ enabled: false });
    expect(bloom.isEnabled()).toBe(false);
    bloom.beginFrame({ canvas: { width: 8, height: 8 } });
    expect(bloom.getEmissive()).toBeNull();
  });

  it('clamps intensity to zero or more', () => {
    bloom.configure({ intensity: -3 });
    expect(bloom.getState().intensity).toBe(0);
  });
});
