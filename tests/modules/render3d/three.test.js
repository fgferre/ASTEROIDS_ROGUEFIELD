import { describe, expect, it, vi } from 'vitest';
import { forgetDeadHandles } from '../../../src/modules/render3d/three.js';

describe('a lost graphics context', () => {
  it('drops the deletes of what the dead context made, and only those', () => {
    const listeners = {};
    const canvas = { addEventListener: (name, fn) => (listeners[name] = fn) };
    const deleteTexture = vi.fn();
    const gl = { createTexture: () => ({}), deleteTexture };
    forgetDeadHandles(gl, canvas);
    const old = gl.createTexture();
    const freed = gl.createTexture();
    gl.deleteTexture(freed);
    listeners.webglcontextlost();
    const fresh = gl.createTexture();
    gl.deleteTexture(old);
    gl.deleteTexture(fresh);
    const unknown = {};
    gl.deleteTexture(unknown);
    gl.deleteTexture(null);
    expect(deleteTexture.mock.calls.map(([handle]) => handle)).toEqual([
      freed,
      fresh,
      unknown,
      null,
    ]);
  });
});
