import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { biomeForLayer } from '../../../src/data/biomes.js';
import { SECTORS, sectorById } from '../../../src/data/sectors.js';
import { FieldBackdrop } from '../../../src/modules/render3d/fieldBackdrop.js';
import { buildCrystalChoir } from '../../../src/modules/render3d/places/crystalChoir.js';
import { PLACE_SETS } from '../../../src/modules/render3d/places/index.js';
import { createPlaceKit } from '../../../src/modules/render3d/places/kit.js';
import { crystal } from '../../../src/modules/render3d/places/pieces.js';

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
  it("has a set for every sector's backdrop, each placed off the Ring for its journey", () => {
    SECTORS.filter((s) => s.look?.backdrop).forEach((s) =>
      expect(PLACE_SETS[s.look.backdrop]).toBeTruthy()
    );
    Object.values(PLACE_SETS).forEach((set) =>
      expect(set.offRing).toHaveLength(2)
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

  it("builds the Crystal Choir's finer shards only when the quality preset asks, never on low", () => {
    const backdrop = new FieldBackdrop(THREE, new THREE.Scene());
    const choir = backdrop.places.built.get('crystal-choir');
    const meshes = () => {
      let n = 0;
      choir.object.traverse((o) => (n += o.isMesh ? 1 : 0));
      return n;
    };
    const plain = meshes();

    backdrop.places.setDetail(false);
    expect(meshes()).toBe(plain);
    backdrop.places.setDetail(true);
    expect(meshes()).toBe(plain + 1);
    choir.fine.forEach((part) => expect(part.visible).toBe(true));
    backdrop.places.setDetail(false);
    expect(meshes()).toBe(plain + 1);
    choir.fine.forEach((part) => expect(part.visible).toBe(false));
  });

  it('colours a crystal from its foot to its point with no gaps', () => {
    const colors = crystal(THREE, 300, 27, 6, 0.08).getAttribute('color').array;
    expect(colors.every(Number.isFinite)).toBe(true);
  });

  it("draws the Crystal Choir's crystals polished, lit from inside, their sheen capped", () => {
    const kit = createPlaceKit(THREE, new THREE.Color(), { under: 0.7 });
    buildCrystalChoir(THREE, kit);
    const gem = kit.materials.get('gem');
    expect(gem.roughness).toBeLessThan(kit.materials.get('matte').roughness);
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    };
    gem.onBeforeCompile(shader);
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance += vColor');
    expect(shader.fragmentShader).toContain(
      'min(reflectedLight.directSpecular'
    );
  });

  it("fades the Quarantine Grid's planet with its set and turns its ground under a fixed sun", () => {
    const backdrop = new FieldBackdrop(THREE, new THREE.Scene());
    const grid = backdrop.places.built.get('quarantine-grid');
    const ground = backdrop.places.built
      .get('quarantine-grid')
      .materials.find((m) => m.uniforms?.uMap);
    expect(ground).toBeTruthy();

    backdrop.places.setLook({
      from: 'x',
      to: { backdrop: 'quarantine-grid' },
      mix: 0.4,
    });
    expect(ground.opacity).toBeCloseTo(0.4);
    const sun = ground.uniforms.uSun.value.clone();
    grid.update(10, 0);
    const spin = ground.uniforms.uSpin.value;
    grid.update(30, 0);
    expect(ground.uniforms.uSpin.value).toBeGreaterThan(spin);
    expect(ground.uniforms.uSun.value.equals(sun)).toBe(true);
  });
});
