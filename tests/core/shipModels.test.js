import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_HULL_ID,
  getShipModelById,
  solarSlicer,
} from '../../src/data/shipModels.js';

const SOLAR_SLICER_BACKGROUND_SIGNATURE =
  /transform="scale\(0\.625977 0\.625977\)" d="M0 0L1024 0L1024 1024L0 1024L0 0Z"/i;

describe('shipModels', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to the default hull and warns once for an unknown hull id', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(getShipModelById('missing-hull').id).toBe(DEFAULT_HULL_ID);
    expect(getShipModelById('missing-hull').id).toBe(DEFAULT_HULL_ID);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('Unknown hull id "missing-hull"');
  });

  it('strips the full-canvas background path from the solar slicer sprite source', () => {
    const encodedMarkup = solarSlicer.visual.source.replace(
      'data:image/svg+xml;charset=utf-8,',
      ''
    );
    const decodedMarkup = decodeURIComponent(encodedMarkup);

    expect(decodedMarkup).toContain('<svg');
    expect(decodedMarkup).not.toMatch(SOLAR_SLICER_BACKGROUND_SIGNATURE);
  });
});
