import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { biomeForLayer } from '../../../src/data/biomes.js';
import { SECTORS, sectorById } from '../../../src/data/sectors.js';
import { FieldBackdrop } from '../../../src/modules/render3d/fieldBackdrop.js';
import {
  PLACE_SETS,
  placeSetOf,
} from '../../../src/modules/render3d/places/index.js';

const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

// A BiomeController look standing in one place.
const lookAt = (place) => ({
  from: place,
  to: place,
  mix: 1,
  structures: 1,
  debris: 0,
  sky0: new THREE.Color(),
  hazeColor: new THREE.Color(),
  hazeDensity: 0,
});

describe('place backdrop sets', () => {
  it("resolves a sector's backdrop on its layers, none for the Descent or a sector without one", () => {
    const wake = sectorById('debris-wake');
    const first = wake.layers[0];
    expect(placeSetOf(biomeForLayer(first, wake))).toBe(
      PLACE_SETS['debris-wake']
    );
    expect(placeSetOf(biomeForLayer(first))).toBeNull();
    const bare = { ...wake, look: undefined };
    expect(placeSetOf(biomeForLayer(first, bare))).toBeNull();
    SECTORS.filter((s) => s.look?.backdrop).forEach((s) =>
      expect(PLACE_SETS[s.look.backdrop]).toBeTruthy()
    );
  });

  it('shows the place instead of the Ring and its arcs, and nothing in the Descent', () => {
    const backdrop = new FieldBackdrop(THREE, new THREE.Scene());
    const wake = sectorById('debris-wake');
    const { built } = backdrop.places;

    backdrop.setLook(lookAt(biomeForLayer(wake.layers[0], wake)));
    expect(built.get('debris-wake').object.visible).toBe(true);
    expect(backdrop.ring.object.visible).toBe(false);
    expect(backdrop.structures.group.visible).toBe(false);

    backdrop.setArrival(0);
    expect(built.get('debris-wake').object.visible).toBe(false);
    expect(backdrop.ring.object.visible).toBe(true);

    backdrop.setArrival(1);
    backdrop.setLook(lookAt(biomeForLayer(wake.layers[0])));
    built.forEach((set) => expect(set.object.visible).toBe(false));
    expect(backdrop.ring.object.visible).toBe(true);
    expect(backdrop.structures.group.visible).toBe(true);
  });
});
