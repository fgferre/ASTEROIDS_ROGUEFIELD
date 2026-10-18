import { describe, expect, it } from 'vitest';
import {
  FOLLOW_TILT,
  blendPose,
  epiloguePath,
  followPose,
  introPath,
} from '../../src/core/cinematics.js';

const samples = (path) => Array.from({ length: 21 }, (_, i) => path(i / 20));

describe('cinematic camera paths', () => {
  it('descends from high over the Ring and lands exactly on the follow camera', () => {
    expect(introPath(0)).toMatchObject({ distance: 3.2, tilt: 32 });
    expect(introPath(0).offsetY).toBeLessThan(0);
    expect(introPath(1)).toEqual(followPose());
  });

  it('pulls back from the follow camera while the Ring wakes', () => {
    expect(epiloguePath(0)).toEqual(followPose());
    expect(epiloguePath(1)).toMatchObject({ distance: 2.6, tilt: 26, wake: 1 });
  });

  it('moves the distance one way only', () => {
    const intro = samples(introPath).map((p) => p.distance);
    const epilogue = samples(epiloguePath).map((p) => p.distance);
    intro.slice(1).forEach((d, i) => expect(d).toBeLessThanOrEqual(intro[i]));
    epilogue
      .slice(1)
      .forEach((d, i) => expect(d).toBeGreaterThanOrEqual(epilogue[i]));
  });

  it('clamps t outside 0..1', () => {
    expect(introPath(-2)).toEqual(introPath(0));
    expect(introPath(5)).toEqual(introPath(1));
    expect(epiloguePath(NaN)).toEqual(epiloguePath(0));
    expect(epiloguePath(9).wake).toBe(1);
  });

  it('hands a cinematic pose back to the follow pose', () => {
    const from = epiloguePath(1);
    expect(blendPose(from, followPose(), 0)).toEqual(from);
    expect(blendPose(from, followPose(), 1)).toEqual(followPose());
    expect(blendPose(from, followPose(), 0.5).tilt).toBeGreaterThan(
      FOLLOW_TILT
    );
  });
});
