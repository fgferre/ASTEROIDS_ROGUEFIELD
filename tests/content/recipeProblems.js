// What an enemy recipe may not say, beyond the right types: a number past its
// limit (a duration of zero seconds divides by zero), a name the engine does
// not have (an unknown movement strategy moves linearly, an unknown weapon
// pattern never fires) and numbers that make no sense together (a band whose
// min is past its max). One sentence per problem, naming where; [] is a clean
// recipe. tests/content/enemies.test.js asks it of every enemy file.
import { BEHAVIORS } from '../../src/modules/enemies/behaviors/index.js';
import { MovementComponent } from '../../src/modules/enemies/components/MovementComponent.js';
import { WeaponComponent } from '../../src/modules/enemies/components/WeaponComponent.js';

export const isCount = (value) => Number.isInteger(value) && value > 0;

// The kinds a behavior declares its params in (behaviors/index.js).
const KINDS = {
  string: { is: (v) => typeof v === 'string', named: 'a string' },
  number: {
    is: (v) => Number.isFinite(v) && v >= 0,
    named: 'a number of 0 or more',
  },
  positive: {
    is: (v) => Number.isFinite(v) && v > 0,
    named: 'a number above 0',
  },
  count: { is: isCount, named: 'a whole number of at least 1' },
};

// The fields of `components.weapon` that need more than "0 or more"; the
// rest of its numbers are damage, spreads and delays. Strings and flags are
// left alone.
const WEAPON_KINDS = {
  speed: 'positive',
  lifetime: 'positive',
  cooldown: 'positive',
  interval: 'positive',
  fireRange: 'positive',
  explosionRadius: 'positive',
  proximityRadius: 'positive',
  burstCount: 'count',
  burstSize: 'count',
  projectileCount: 'count',
};

// `components.collision` and `components.health`.
const BODY_KINDS = {
  collision: { radius: 'positive' },
  health: { base: 'positive', armor: 'number', scaling: 'positive' },
};

export function recipeProblems({ id, components, behaviors, seeded }) {
  const problems = [];
  const bad = (where, why) => problems.push(`${id} ${where}: ${why}`);
  const mustBe = (where, value, kind) => {
    if (!KINDS[kind].is(value)) {
      bad(where, `${String(value)} is not ${KINDS[kind].named}`);
    }
  };

  for (const [name, params] of Object.entries(behaviors)) {
    const behavior = BEHAVIORS[name];
    if (!behavior) {
      bad(name, 'is not in the behavior library');
      continue;
    }
    const declared = Object.keys(behavior.params);
    const given = Object.keys(params);
    const missing = declared.filter((key) => !given.includes(key));
    const unknown = given.filter((key) => !declared.includes(key));
    if (missing.length) bad(name, `lacks ${missing.join(' ')}`);
    if (unknown.length) bad(name, `does not read ${unknown.join(' ')}`);
    const before = problems.length;
    for (const key of given.filter((k) => declared.includes(k))) {
      mustBe(`${name}.${key}`, params[key], behavior.params[key]);
    }
    if (missing.length === 0 && problems.length === before) {
      const why = behavior.check?.(params);
      if (why) bad(name, why);
    }
    if (behavior.usesRandom && !seeded) {
      bad(name, 'draws random, so the recipe must be seeded');
    }
  }

  const { movement, weapon } = components;
  const strategies = new MovementComponent().strategies;
  if (!strategies.has(movement.strategy)) {
    bad(
      'movement.strategy',
      `${movement.strategy} is none of ${[...strategies.keys()].join(' ')}`
    );
  }
  for (const [key, value] of Object.entries(movement)) {
    if (key === 'strategy') continue;
    if (key === 'orbitDirection') {
      if (value !== 1 && value !== -1) {
        bad('movement.orbitDirection', `${String(value)} is not 1 or -1`);
      }
    } else {
      mustBe(`movement.${key}`, value, 'number');
    }
  }

  if (weapon) {
    const patterns = new WeaponComponent().patterns;
    if (!patterns.has(weapon.pattern)) {
      bad(
        'weapon.pattern',
        `${weapon.pattern} is none of ${[...patterns.keys()].join(' ')}`
      );
    }
    for (const [key, value] of Object.entries(weapon)) {
      if (typeof value === 'number') {
        mustBe(`weapon.${key}`, value, WEAPON_KINDS[key] ?? 'number');
      }
    }
  }

  for (const [part, kinds] of Object.entries(BODY_KINDS)) {
    for (const [key, kind] of Object.entries(kinds)) {
      mustBe(`${part}.${key}`, components[part]?.[key], kind);
    }
  }

  return problems;
}
