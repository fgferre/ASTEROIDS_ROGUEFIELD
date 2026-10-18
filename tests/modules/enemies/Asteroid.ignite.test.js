import { describe, expect, it } from 'vitest';

import RandomService from '../../../src/core/RandomService.js';
import { Asteroid } from '../../../src/modules/enemies/types/Asteroid.js';

describe('Asteroid.ignite', () => {
  it('turns a rock Volatile with its fuse starting now, once', () => {
    const rock = new Asteroid();
    rock.initialize(null, {
      size: 'small',
      variant: 'common',
      x: 100,
      y: 100,
      random: new RandomService('ignite'),
    });

    expect(rock.ignite()).toBe(true);

    expect(rock.variant).toBe('volatile');
    expect(rock.behavior.type).toBe('volatile');
    expect(rock.variantState).toMatchObject({
      fuseTimer: rock.behavior.fuseTime,
      armed: false,
    });
    expect(rock.ignite()).toBe(false);
  });
});
