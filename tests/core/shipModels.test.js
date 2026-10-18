import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ALL_HULLS,
  DEFAULT_HULL_ID,
  getShipModelById,
} from '../../src/data/shipModels.js';

describe('shipModels', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to the default hull and warns once for an unknown hull id', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(getShipModelById('missing-hull').id).toBe(DEFAULT_HULL_ID);
    expect(getShipModelById('missing-hull').id).toBe(DEFAULT_HULL_ID);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain(
      'Unknown hull id "missing-hull"'
    );
  });

  it('draws every hull from procedural panels with at least one nozzle', () => {
    ALL_HULLS.forEach((hull) => {
      expect(hull.visual.panels.length).toBeGreaterThan(0);
      expect(hull.visual.nozzles.length).toBeGreaterThan(0);
      expect(hull.visual.source).toBeUndefined();
    });
  });

  it('names every hull short enough for one line on the menu chip', () => {
    expect(ALL_HULLS.map((hull) => hull.name)).toEqual([
      'Interceptor',
      'Solar Slicer',
    ]);
  });
});
