// The place a sector is in, as what stands far below and beyond the field
// (docs/ROTEIRO.md "Os lugares"): the backdrop set its look names
// (`backdrop`, places/index.js), all built with the scene, each shown at the look's share of it (a biome cross-fade fades one set into the
// next) and at the journey's `arrival` (travelScene.js: none while the ship
// flies, all of it once the camera has risen onto the field; the place it
// flies toward hangs ahead meanwhile, through setFlight). Like the
// broken Ring each layer of a set moves with the point the camera aims at,
// its own `follow` of the way, so it parallaxes like something deeper than
// it sits. A builder returns { layers: [{ object, anchor, follow }],
// update?(seconds, wake) }.
// A look with no backdrop (the Descent) shows none.

import { createPlaceKit } from './kit.js';
import { PLACE_SETS } from './index.js';

export class PlaceSets {
  /** `haze`: the broken Ring's haze colour, which every set sinks into. */
  constructor(THREE, scene, haze) {
    this.THREE = THREE;
    this.haze = haze;
    this.built = new Map();
    this.list = [];
    this.from = null;
    this.to = null;
    this.mix = 1;
    this.arrival = 1;
    // The Ring's wake (FieldBackdrop.setWake), for sets whose lights follow it.
    this.wake = 0;
    // Share of the view whose set hides the broken Ring / the intact arcs.
    this.hidesRing = 0;
    this.hidesStructures = 0;
    this.aim = new THREE.Vector3();
    // The set a journey flies toward (setFlight), shown on top of the look.
    this.flight = { id: null, share: 0, x: 0, z: 0 };
    // An LOD's update(camera) runs every frame before its children draw.
    this.object = new THREE.LOD();
    this.object.update = (camera) => this.update(camera);
    scene.add(this.object);
    // Built with the scene (seeded, and compiled by the warm-up), hidden.
    Object.keys(PLACE_SETS).forEach((id) => this.build(id));
  }

  /** A look from BiomeController (its `from`/`to` places and `mix`). */
  setLook(look) {
    this.from = look.from?.backdrop ?? null;
    this.to = look.to?.backdrop ?? null;
    this.mix = look.mix ?? 1;
    this.apply();
  }

  /** The journey's arrival, 0 (flying, no set) to 1 (on the field). */
  setArrival(arrival) {
    if (arrival === this.arrival) return;
    this.arrival = arrival;
    this.apply();
  }

  /**
   * The journey's view of set `id` (travelScene.js): shown at `share` on
   * top of the look's without hiding the Ring, its layers laid out for a
   * camera aiming at field point (x, z); the journey poses its group, which
   * this returns. Null ends it and puts the group back in place.
   */
  setFlight(id, share = 0, x = 0, z = 0) {
    const { flight } = this;
    if (flight.id !== id) {
      const left = this.built.get(flight.id)?.object;
      left?.position.set(0, 0, 0);
      left?.quaternion.identity();
      left?.scale.set(1, 1, 1);
    }
    flight.id = id;
    flight.share = id ? share : 0;
    flight.x = x;
    flight.z = z;
    this.apply();
    return this.built.get(id)?.object ?? null;
  }

  shareOf(id) {
    const from = this.from === id ? 1 - this.mix : 0;
    const to = this.to === id ? this.mix : 0;
    return (from + to) * this.arrival;
  }

  // Loops by index here and in update: nothing allocated per frame.
  apply() {
    this.hidesRing = 0;
    this.hidesStructures = 0;
    for (let i = 0; i < this.list.length; i += 1) {
      const set = this.list[i];
      const look = this.shareOf(set.id);
      const flying = this.flight.id === set.id ? this.flight.share : 0;
      const share = Math.max(look, flying);
      set.object.visible = share > 0.001;
      for (let m = 0; m < set.materials.length; m += 1) {
        const material = set.materials[m];
        material.opacity = share;
        // A surface blends only while it fades (unless it always blends, to
        // draw after the space behind it); a glow always adds.
        if (material.depthWrite && !material.userData.blended) {
          material.transparent = share < 0.999;
        }
      }
      if (!PLACE_SETS[set.id].ring) this.hidesRing += look;
      this.hidesStructures += look;
    }
  }

  build(id) {
    const { build, hazeDepth, under, seed } = PLACE_SETS[id];
    const kit = createPlaceKit(this.THREE, this.haze, {
      hazeDepth,
      under,
      seed,
    });
    const set = { id, ...build(this.THREE, kit) };
    set.materials = [...kit.materials.values()];
    set.object = new this.THREE.Group();
    set.layers.forEach((layer) => {
      layer.holder = new this.THREE.Group();
      layer.holder.add(layer.object);
      set.object.add(layer.holder);
    });
    set.object.visible = false;
    this.object.add(set.object);
    this.built.set(id, set);
    this.list.push(set);
  }

  update(camera) {
    const { aim } = this;
    camera.getWorldDirection(aim);
    const reach = -camera.position.y / Math.min(aim.y, -0.1);
    const time = performance.now() / 1000;
    for (let i = 0; i < this.list.length; i += 1) {
      const set = this.list[i];
      if (!set.object.visible) continue;
      const flying = this.flight.id === set.id;
      const x = flying ? this.flight.x : camera.position.x + aim.x * reach;
      const z = flying ? this.flight.z : camera.position.z + aim.z * reach;
      for (let j = 0; j < set.layers.length; j += 1) {
        const { holder, anchor, follow } = set.layers[j];
        holder.position.set(
          anchor[0] + x * follow,
          anchor[1],
          anchor[2] + z * follow
        );
      }
      set.update?.(time, this.wake);
      set.object.updateMatrixWorld(true);
    }
  }
}
