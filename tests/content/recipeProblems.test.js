// The recipe check itself (recipeProblems.js): the files a content author is
// told to copy pass it, and a copy with one number past its limit, a name the
// engine lacks or numbers that make no sense together does not.
import { describe, expect, it } from 'vitest';
import { getContent } from '../../src/content/registry.js';
import gnat from '../__fixtures__/enemies/gnat.js';
import sentry from '../__fixtures__/enemies/sentry.js';
import { recipeProblems } from './recipeProblems.js';

const [caster, drone, hunter, mine, ram, shade, weaver] = [
  'caster',
  'drone',
  'hunter',
  'mine',
  'ram',
  'shade',
  'weaver',
].map((id) => getContent('enemies', id));

// `enemy` with `patch` laid over one of its behaviors, or components.
const behaving = (enemy, name, patch) => ({
  ...enemy,
  behaviors: {
    ...enemy.behaviors,
    [name]: { ...enemy.behaviors[name], ...patch },
  },
});
const component = (enemy, name, patch) => ({
  ...enemy,
  components: {
    ...enemy.components,
    [name]: { ...enemy.components[name], ...patch },
  },
});

describe('recipe limits', () => {
  it.each([gnat, sentry])(
    '$id, a copy-me file, has none to report',
    (enemy) => {
      expect(recipeProblems(enemy)).toEqual([]);
    }
  );

  it('a fan of one shot is a supported recipe', () => {
    expect(recipeProblems(behaving(shade, 'fan-shot', { shots: 1 }))).toEqual(
      []
    );
  });

  it.each([
    ['a fan of no shots', behaving(shade, 'fan-shot', { shots: 0 }), 'shots'],
    ['half a shot', behaving(shade, 'fan-shot', { shots: 1.5 }), 'shots'],
    [
      'a phase window of zero seconds',
      behaving(shade, 'phase', { phased: 0 }),
      'phase.phased',
    ],
    [
      'a negative duration',
      behaving(ram, 'charge', { windup: -0.7 }),
      'charge.windup',
    ],
    [
      'a shell that lands the moment it is lobbed',
      behaving(caster, 'lob-shell', { flight: 0 }),
      'lob-shell.flight',
    ],
    [
      'a number that is not finite',
      behaving(shade, 'fan-shot', { speed: Infinity }),
      'fan-shot.speed',
    ],
    [
      'a number that is a string',
      behaving(shade, 'fan-shot', { damage: '10' }),
      'fan-shot.damage',
    ],
    [
      'a mine layer that holds no mine',
      behaving(weaver, 'lay-mines', { max: 0 }),
      'lay-mines.max',
    ],
    [
      'a hold band whose min is past its max',
      behaving(caster, 'hold-range', { min: 400 }),
      'min is past max',
    ],
    [
      'a flank nearer than its clearance',
      behaving(shade, 'phase', { flankMin: 200 }),
      'flankMin is past flank',
    ],
    [
      'a mine that blows before it arms',
      behaving(mine, 'proximity-fuse', { armTime: 40 }),
      'armTime is past lifetime',
    ],
    [
      'a behavior the library lacks',
      { ...shade, behaviors: { ...shade.behaviors, teleport: {} } },
      'is not in the behavior library',
    ],
    [
      'a param a behavior does not read',
      behaving(shade, 'phase', { wobble: 2 }),
      'does not read wobble',
    ],
    [
      'a param left out',
      { ...shade, behaviors: { ...shade.behaviors, phase: { fade: 0.35 } } },
      'lacks visible',
    ],
    [
      'a random behavior in an unseeded recipe',
      { ...shade, seeded: false },
      'must be seeded',
    ],
  ])('flags %s', (_, enemy, sentence) => {
    const problems = recipeProblems(enemy);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join('\n')).toContain(sentence);
  });

  it.each([
    [
      'a misspelt movement strategy',
      component(drone, 'movement', { strategy: 'trakcing' }),
      'movement.strategy',
    ],
    [
      'a negative speed',
      component(drone, 'movement', { maxSpeed: -180 }),
      'movement.maxSpeed',
    ],
    [
      'an orbit direction that is neither way round',
      component(hunter, 'movement', { orbitDirection: 2 }),
      'movement.orbitDirection',
    ],
    [
      'a misspelt weapon pattern',
      component(drone, 'weapon', { pattern: 'sngle' }),
      'weapon.pattern',
    ],
    [
      'a weapon that fires every frame',
      component(drone, 'weapon', { cooldown: 0 }),
      'weapon.cooldown',
    ],
    [
      'a burst of no shots',
      component(hunter, 'weapon', { burstCount: 0 }),
      'weapon.burstCount',
    ],
    [
      'a body with no size',
      component(drone, 'collision', { radius: 0 }),
      'collision.radius',
    ],
    [
      'a hull with no health',
      component(drone, 'health', { base: 0 }),
      'health.base',
    ],
  ])('flags %s', (_, enemy, where) => {
    expect(recipeProblems(enemy).join('\n')).toContain(where);
  });
});
