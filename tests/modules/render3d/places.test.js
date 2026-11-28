import { describe, expect, it } from 'vitest';
import { biomeForLayer } from '../../../src/data/biomes.js';
import { SECTORS, sectorById } from '../../../src/data/sectors.js';
import { FieldBackdrop } from '../../../src/modules/render3d/fieldBackdrop.js';
import { buildCrystalChoir } from '../../../src/modules/render3d/places/crystalChoir.js';
import { buildTheCrucible } from '../../../src/modules/render3d/places/theCrucible.js';
import { PLACE_SETS } from '../../../src/modules/render3d/places/index.js';
import { createPlaceKit } from '../../../src/modules/render3d/places/kit.js';
import { crystal } from '../../../src/modules/render3d/places/pieces.js';
import { buildWake } from '../../../src/modules/render3d/travel/wake.js';
import { lightWake } from '../../../src/modules/render3d/travel/wakeRig.js';
import THREE from '../../../src/modules/render3d/three.js';

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

  it("dims the Crucible's star once a full wake falls back, and plates its arcs past it", () => {
    const kit = createPlaceKit(THREE, new THREE.Color(), {});
    const set = buildTheCrucible(THREE, kit);
    const star = kit.materials.get('crucible-star').uniforms;
    const plating = kit.materials.get('crucible-plating');

    set.update(1, 0.5);
    expect(star.uLevel.value).toBe(1);
    set.update(1.05, 1.25);
    expect(plating.color.r).toBeGreaterThan(0.5);
    set.update(1.1, 1);
    set.update(1.15, 0);
    expect(star.uLevel.value).toBeLessThan(0.5);
  });

  it("builds the last image's twin on the opening's Wake: its geometry and maps shared, its own darker paint, no light, the opening's untouched", () => {
    const kit = createPlaceKit(THREE, new THREE.Color(), {});
    const set = buildTheCrucible(THREE, kit);
    const wake = buildWake(THREE);
    lightWake(THREE, wake, -1); // the opening's rig, in the Wake's group
    const painted = wake.group.children.filter((part) => part.isMesh);
    const before = painted.map((part) => part.material.envMapIntensity);

    const slip = set.slip(wake);
    expect(set.slip(wake)).toBe(slip);
    const twin = [];
    slip.frame.traverse((part) => part.isMesh && twin.push(part));
    painted.forEach((part, i) => {
      const copy = twin.find((mesh) => mesh.geometry === part.geometry);
      expect(copy, part.name).toBeDefined();
      expect(copy.material).not.toBe(part.material);
      expect(copy.material.map).toBe(part.material.map);
      expect(copy.material.onBeforeCompile).toBe(part.material.onBeforeCompile);
      expect(copy.material.customProgramCacheKey()).toBe(
        part.material.customProgramCacheKey()
      );
      expect(copy.material.envMapIntensity).toBeLessThan(before[i]);
      expect(part.material.envMapIntensity).toBe(before[i]);
    });
    // none of the opening's lights, lamps or rig came along
    const lights = [wake.lights.windows, wake.lights.lamps, wake.lights.floods]
      .concat(wake.lights.beacons, wake.lights.engines)
      .flatMap((light) => light.children.map((mesh) => mesh.geometry));
    twin.forEach((mesh) => expect(lights).not.toContain(mesh.geometry));
    let lit = 0;
    slip.object.traverse((part) => (lit += part.isLight ? 1 : 0));
    expect(lit).toBe(0);
    expect(painted.every((part) => part.parent === wake.group)).toBe(true);
    expect(slip.pane.geometry.getAttribute('position').count).toBeGreaterThan(
      0
    );
  });
});
