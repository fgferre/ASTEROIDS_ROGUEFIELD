import { describe, expect, it, vi } from 'vitest';

describe('AudioSystem performance monitor', () => {
  it('starts no stats timer outside dev mode', async () => {
    vi.resetModules();
    vi.doMock('../../src/core/env.js', () => ({ IS_DEV: false }));
    const { default: AudioSystem } = await import(
      '../../src/modules/AudioSystem.js'
    );
    const timer = vi.spyOn(globalThis, 'setInterval');
    const fake = { performanceMonitor: { enabled: true } };
    AudioSystem.prototype._startPerformanceMonitoring.call(fake);
    expect(timer).not.toHaveBeenCalled();
    expect(fake.performanceStatsInterval).toBeUndefined();
    timer.mockRestore();
    vi.doUnmock('../../src/core/env.js');
  });
});
