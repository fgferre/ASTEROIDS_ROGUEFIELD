import { describe, expect, it } from 'vitest';

import RandomService from '../../../src/core/RandomService.js';
import { Asteroid } from '../../../src/modules/enemies/types/Asteroid.js';

const rock = (variant, size, look) => {
  const asteroid = new Asteroid();
  asteroid.initialize(null, {
    size,
    variant,
    look,
    x: 100,
    y: 100,
    random: new RandomService(`look-${variant}`),
  });
  return asteroid;
};

describe('Asteroid look', () => {
  it("gives a crystal rock's pieces its look and keeps their own variant", () => {
    const pieces = rock('crystal', 'large').generateFragments();
    expect(pieces.length).toBeGreaterThan(0);
    pieces.forEach((piece) => expect(piece.look).toBe('crystal'));

    const plain = rock('iron', 'medium', 'crystal');
    expect(plain.variant).toBe('iron');
    expect(plain.look).toBe('crystal');
    expect(rock('volatile', 'medium', 'crystal').look).toBe(null);
    expect(rock('common', 'large').generateFragments()[0].look).toBe(undefined);
  });
});
