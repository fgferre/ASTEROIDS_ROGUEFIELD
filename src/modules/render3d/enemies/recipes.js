// Recipe views (PLAN.md 0a.5): an enemy whose content file names no
// hand-made `view` is built from its `visual`, so a new enemy needs no render
// code; with neither it gets DEFAULT_VISUAL. Same matte tones, outline and
// glow batch as the hand views (docs/NORTE.md §2: matte mass, light only where
// there is energy) and the same view record, so pooling, the Elite look,
// affixes and the burn treat it as any machine.
//
// visual: {
//   scale: × the enemy's radius (1),
//   parts: [{
//     shape: sphere | box | octahedron | icosahedron | cone | cylinder | torus,
//       each 1 radius out from its centre (cone and cylinder stand along y,
//       the torus lies flat around y),
//     size: number or [x, y, z] (1), at: [x, y, z], rotate: [x, y, z] radians,
//       in radii, +x the nose and +y up,
//     material: hull | trim | glow (hull),
//     color: a PALETTE key (hull: hullLit, trim: hull, glow: threat),
//   }],
//   lights: [{ at, size (0.18), color (threat), pulse: getter }],
//   animate: { spin: [x, y, z] rad/s, bob: radii, pulse: getter },
// }
// Lights are the eyes, lenses and nodes (one glow batch); a getter is an enemy
// property read per frame as 0..1 (telegraphRatio, damageRatio, ...): a
// light's `pulse` lights it up, `animate.pulse` throbs the body and its glowing
// parts. Threat-red light burns gold on an Elite.

import { PALETTE } from '../../../data/constants/palette.js';
import { colorOf } from '../batches.js';
import { mergeStatic } from '../mergeStatic.js';

// proposta 19/10: a light's size (radii) and gain, steady (the Mote's eye) or
// from dim to lit with its getter, growing with it (the Ram's lens); a
// glowing part's gain (the Bulwark's edge); the outline's margin past the
// body; the bob's and the throb's rates (rad/s), how much a throb swells the
// body and brightens its glow.
const LIGHT_SIZE = 0.18;
const LIGHT_GAIN = 1.4;
const LIGHT_DIM = 0.4;
const LIGHT_LIT = 2.2;
const LIGHT_GROW = 0.8;
const GLOW_GAIN = 1.2;
const RIM_MARGIN = 1.04;
const BOB_RATE = 2.4;
const PULSE_RATE = 6;
const PULSE_SWELL = 0.1;
const PULSE_GAIN = 0.6;

// A plain machine: a matte pod, a dark cap and one eye forward.
const DEFAULT_VISUAL = Object.freeze({
  parts: [
    { shape: 'sphere', size: [0.8, 0.42, 0.8] },
    {
      shape: 'sphere',
      size: [0.34, 0.08, 0.34],
      at: [0, 0.37, 0],
      material: 'trim',
    },
  ],
  lights: [{ at: [0.66, 0.16, 0], size: 0.16 }],
});

// The matte materials' default tones (kit.tones).
const MATTE = { hull: 'hull', trim: 'dark' };

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const level = (enemy, getter) => clamp01(Number(enemy[getter]) || 0);

/**
 * Recipe views.
 * @param {object} kit - the mirror's toolkit (enemyMirror.js createKit), never
 *   the mirror itself.
 */
export function createRecipeViews(kit) {
  const { THREE } = kit;
  const torus = new THREE.TorusGeometry(1, 0.12, 8, 32);
  torus.rotateX(Math.PI / 2);
  const shapes = {
    sphere: kit.sphere,
    box: new THREE.BoxGeometry(2, 2, 2),
    octahedron: new THREE.OctahedronGeometry(1, 0),
    icosahedron: new THREE.IcosahedronGeometry(1, 0),
    cone: new THREE.ConeGeometry(1, 2, 12),
    cylinder: new THREE.CylinderGeometry(1, 1, 2, 12),
    torus,
  };
  const looks = new Map();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();

  function paletteHex(role) {
    const hex = PALETTE[role];
    if (typeof hex !== 'string' || !hex.startsWith('#')) {
      throw new Error(`[recipes] no palette colour '${role}'`);
    }
    return hex;
  }

  function getter(name) {
    if (name !== undefined && typeof name !== 'string') {
      throw new Error(`[recipes] a pulse names a getter, not ${name}`);
    }
    return name ?? null;
  }

  // A part's own geometry, sized, turned and placed in the view's radii.
  function place({ shape, size = 1, at = [0, 0, 0], rotate = [0, 0, 0] }) {
    const geometry = shapes[shape];
    if (!geometry) throw new Error(`[recipes] no shape '${shape}'`);
    matrix.compose(
      position.fromArray(at),
      quaternion.setFromEuler(euler.set(rotate[0], rotate[1], rotate[2])),
      typeof size === 'number' ? scale.setScalar(size) : scale.fromArray(size)
    );
    return geometry.clone().applyMatrix4(matrix);
  }

  // How far a geometry reaches from the view's axis, on the field plane.
  function reach(geometry) {
    const points = geometry.getAttribute('position');
    let far = 0;
    for (let i = 0; i < points.count; i += 1) {
      far = Math.max(far, Math.hypot(points.getX(i), points.getZ(i)));
    }
    return far;
  }

  // A visual's shared parts: the merged matte body, a merged geometry per
  // glow colour, the outline's radius, the lights and the motion.
  function compile(visual) {
    const { parts = [], lights = [], animate = {} } = visual;
    const matte = [];
    const glows = new Map();
    let far = 0;
    parts.forEach((part) => {
      const geometry = place(part);
      far = Math.max(far, reach(geometry));
      const material = part.material ?? 'hull';
      if (material === 'glow') {
        const hex = paletteHex(part.color ?? 'threat');
        if (!glows.has(hex)) glows.set(hex, []);
        glows.get(hex).push({ geometry });
      } else if (MATTE[material]) {
        const color = part.color
          ? colorOf(THREE, paletteHex(part.color))
          : kit.tones[MATTE[material]];
        matte.push({ geometry, color });
      } else {
        throw new Error(`[recipes] no material '${material}'`);
      }
    });
    return {
      scale: visual.scale ?? 1,
      body: matte.length ? mergeStatic(THREE, matte) : null,
      glows: [...glows].map(([hex, list]) => ({
        hex,
        geometry: mergeStatic(THREE, list),
      })),
      rim: far ? far * RIM_MARGIN : 1,
      lights: lights.map((light) => ({
        at: new THREE.Vector3().fromArray(light.at ?? [0, 0, 0]),
        size: light.size ?? LIGHT_SIZE,
        hex: paletteHex(light.color ?? 'threat'),
        pulse: getter(light.pulse),
      })),
      spin: animate.spin ?? null,
      bob: animate.bob ?? 0,
      pulse: getter(animate.pulse),
    };
  }

  function create(kind, recipe) {
    const group = new THREE.Group();
    const body = new THREE.Group();
    body.scale.setScalar(recipe.scale);
    if (recipe.body) body.add(new THREE.Mesh(recipe.body, kit.machineMaterial));
    const accents = [];
    const glowMaterials = recipe.glows.map(({ hex, geometry }) => {
      const material = kit.emissive(hex, GLOW_GAIN);
      if (hex === PALETTE.threat) accents.push(material);
      body.add(new THREE.Mesh(geometry, material));
      return material;
    });
    const lights = recipe.lights.map(({ at, size, hex, pulse }) => {
      const tone = kit.tone(hex, pulse ? LIGHT_DIM : LIGHT_GAIN);
      if (hex === PALETTE.threat) accents.push(tone);
      return { ...kit.glow(body, tone, size, at), size, pulse };
    });
    group.add(body);
    kit.scene.add(group);
    return kit.view(kind, group, {
      recipe,
      body,
      glowMaterials,
      lights,
      accents,
      rims: [kit.rim(group, kit.circleRim, recipe.rim * recipe.scale)],
      glows: lights,
    });
  }

  function update(view, enemy, time) {
    const { recipe, body } = view;
    const t = time + (view.seed % 7);
    const { spin, bob, pulse } = recipe;
    if (spin) body.rotation.set(spin[0] * t, spin[1] * t, spin[2] * t);
    if (bob) body.position.y = bob * Math.sin(t * BOB_RATE);
    if (pulse) {
      const throb =
        level(enemy, pulse) * (0.5 + 0.5 * Math.sin(t * PULSE_RATE));
      body.scale.setScalar(recipe.scale * (1 + PULSE_SWELL * throb));
      for (let i = 0; i < view.glowMaterials.length; i += 1) {
        kit.setGain(
          view.glowMaterials[i],
          GLOW_GAIN * (1 + PULSE_GAIN * throb)
        );
      }
    }
    for (let i = 0; i < view.lights.length; i += 1) {
      const light = view.lights[i];
      if (!light.pulse) continue;
      const lit = level(enemy, light.pulse);
      kit.setGain(light.tone, LIGHT_DIM + (LIGHT_LIT - LIGHT_DIM) * lit);
      light.anchor.scale.setScalar(light.size * (1 + LIGHT_GROW * lit));
    }
  }

  /**
   * The look built from `visual` (DEFAULT_VISUAL when there is none), once
   * per visual: `create(kind)` builds a view for that enemy kind, `update`
   * moves it per frame.
   */
  function lookOf(visual = DEFAULT_VISUAL) {
    let look = looks.get(visual);
    if (!look) {
      const recipe = compile(visual);
      look = { create: (kind) => create(kind, recipe), update };
      looks.set(visual, look);
    }
    return look;
  }

  return { lookOf };
}
