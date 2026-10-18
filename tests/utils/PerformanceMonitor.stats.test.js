import { describe, expect, it } from 'vitest';
import { statsRequestedByUrl } from '../../src/utils/PerformanceMonitor.js';

describe('statsRequestedByUrl', () => {
  it('is true only for ?stats=1', () => {
    expect(statsRequestedByUrl('?stats=1')).toBe(true);
    expect(statsRequestedByUrl('?desktop=force&stats=1')).toBe(true);
    expect(statsRequestedByUrl('?stats=0')).toBe(false);
    expect(statsRequestedByUrl('')).toBe(false);
  });
});
