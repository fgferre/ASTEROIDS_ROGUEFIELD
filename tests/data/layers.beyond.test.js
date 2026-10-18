import { describe, expect, it } from 'vitest';
import { MAX_ASTEROIDS_ON_SCREEN } from '../../src/data/constants/gameplay.js';
import { bossKindForLayer } from '../../src/data/enemies/boss.js';
import {
  LAYER_MODIFIERS,
  MODIFIER_FROM,
  directorFor,
  modifierFor,
} from '../../src/data/layers.js';

const DEEP = Array.from({ length: 15 }, (_, index) => 16 + index); // 16–30
const rosterTotal = (layer) =>
  layer.roster.reduce((sum, entry) => sum + entry.count, 0);

describe('layers past the table (endless run)', () => {
  it('never eases off from 16 to 30, layer type by layer type', () => {
    const fieldLayers = DEEP.filter((n) => n % 5 !== 0);
    const wardenLayers = DEEP.filter((n) => n % 5 === 0);
    [fieldLayers, wardenLayers].forEach((layers) => {
      for (let i = 1; i < layers.length; i += 1) {
        const before = directorFor(layers[i - 1]);
        const after = directorFor(layers[i]);
        expect(after.rocks).toBeGreaterThanOrEqual(before.rocks);
        expect(rosterTotal(after)).toBeGreaterThanOrEqual(rosterTotal(before));
        expect(after.roster[0].elite).toBeGreaterThanOrEqual(
          before.roster[0].elite
        );
      }
    });
    expect(rosterTotal(directorFor(29))).toBeGreaterThan(
      rosterTotal(directorFor(16))
    );
    expect(directorFor(29).roster[0].elite).toBeGreaterThan(
      directorFor(16).roster[0].elite
    );
  });

  it('puts a Warden on every fifth layer, cycling Prime, Choir and Null', () => {
    DEEP.forEach((n) => {
      expect(directorFor(n).warden).toBe(n % 5 === 0);
    });
    expect([20, 25, 30].map(bossKindForLayer)).toEqual([
      'prime',
      'choir',
      'null',
    ]);
  });

  it('keeps rocks under the on-screen limit and elite chance at 0.5', () => {
    [16, 30, 60, 200].forEach((n) => {
      const layer = directorFor(n);
      expect(layer.rocks).toBeLessThanOrEqual(MAX_ASTEROIDS_ON_SCREEN);
      layer.roster.forEach((entry) => {
        expect(entry.elite).toBeLessThanOrEqual(0.5);
      });
    });
    expect(directorFor(200).roster[0].elite).toBe(0.5);
  });
});

describe('layer modifiers (endless run)', () => {
  it('lists four modifiers, each with a label and a colour', () => {
    expect(Object.keys(LAYER_MODIFIERS)).toEqual([
      'dense-fog',
      'magnetic-storm',
      'hunters-moon',
      'glass-field',
    ]);
    Object.values(LAYER_MODIFIERS).forEach(({ label, color }) => {
      expect(label).toEqual(expect.any(String));
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    });
  });

  it('rolls one from layer 16 on, the same for the same run seed', () => {
    expect(MODIFIER_FROM).toBe(16);
    expect(modifierFor(15, 7)).toBeNull();
    DEEP.forEach((n) => {
      expect(Object.keys(LAYER_MODIFIERS)).toContain(
        directorFor(n, 7).modifier
      );
      expect(directorFor(n, 7).modifier).toBe(modifierFor(n, 7));
    });
    const run = (seed) => DEEP.map((n) => modifierFor(n, seed));
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });

  it('never repeats a modifier two layers in a row', () => {
    [0, 7, 12345].forEach((seed) => {
      for (let n = 17; n <= 60; n += 1) {
        expect(modifierFor(n, seed)).not.toBe(modifierFor(n - 1, seed));
      }
    });
  });
});
