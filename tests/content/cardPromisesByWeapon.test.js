import { describe, expect, it } from 'vitest';
import UPGRADE_LIBRARY, {
  textForWeapon,
} from '../../src/data/upgrades/index.js';

// What a card says with a weapon in hand must be something that weapon can
// get (the card matrix's check, 25/11): the Shard Halo and the Furnace Corona
// never aim and the Arc Caster and the Scatter Coil cannot reach that far,
// so a longer lock-on is nothing to them, and the Halo fires
// nothing, so a card cannot sell it a "fire rate".
const linesFor = (weaponId) =>
  UPGRADE_LIBRARY.flatMap((card) =>
    textForWeapon(card, weaponId).levels.map(({ description }) => ({
      card: card.id,
      description,
    }))
  );

describe('card text by the weapon in hand', () => {
  // The Arc Caster and the Scatter Coil cannot reach what a longer lock-on
  // finds: the lock keeps to what the weapon reaches.
  it.each(['shard-halo', 'furnace-corona', 'arc-caster', 'scatter'])(
    'promises no lock-on range to the %s',
    (weaponId) => {
      const promising = linesFor(weaponId).filter(({ description }) =>
        /lock-on range/i.test(description)
      );
      expect(promising).toEqual([]);
    }
  );

  it('promises the Shard Halo no fire rate', () => {
    const promising = linesFor('shard-halo').filter(({ description }) =>
      /fire rate/i.test(description)
    );
    expect(promising).toEqual([]);
  });
});
