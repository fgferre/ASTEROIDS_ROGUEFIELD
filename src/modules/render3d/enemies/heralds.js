// Herald views, violet-rimmed officials of the Ring: Dust (a chamfered slab
// in a haze of motes, its slits lighting), Heat (a matte ring whose seam
// glows, a warning ring around it) and Silence (a tall prism with one eye and
// the blink rings).

import { PALETTE } from '../../../data/constants/palette.js';
import { createSeededRandom } from '../asteroidMesh.js';
import { HALF_H, HALF_W, colorOf } from '../batches.js';
import { rimLoop } from '../rimBatch.js';
import { addRimLight } from '../rimLight.js';

const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
// Heralds: dust motes around the Dust slab; the Silence blink ring starts
// this many radii wide and closes to one.
const DUST_MOTES = 10;
const BLINK_RING_START = 2.2;

/**
 * Herald views.
 * @param {object} kit - the mirror's toolkit (enemyMirror.js createKit), never
 *   the mirror itself.
 */
export function createHeraldViews(kit) {
  const { THREE } = kit;
  // Dust: a chamfered slab, broadside to the ship (local +x),
  // three slits along its face.
  const outline = (points) => {
    const shape = new THREE.Shape();
    points.forEach(([x, y], i) =>
      i ? shape.lineTo(x, y) : shape.moveTo(x, y)
    );
    shape.closePath();
    return shape;
  };
  const slabC = 0.19;
  const slabOutline = [
    [-0.55 + slabC, -1],
    [0.55 - slabC, -1],
    [0.55, -1 + slabC],
    [0.55, 1 - slabC],
    [0.55 - slabC, 1],
    [-0.55 + slabC, 1],
    [-0.55, 1 - slabC],
    [-0.55, -1 + slabC],
  ];
  const dustSlab = new THREE.ExtrudeGeometry(outline(slabOutline), {
    depth: 0.36,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 1,
  });
  dustSlab.rotateX(-Math.PI / 2);
  dustSlab.translate(0, -0.18, 0);
  const dustRim = rimLoop(
    slabOutline.map(([x, y]) => new THREE.Vector3(x * 1.06, 0.24, -y * 1.04))
  );
  const dustSlit = new THREE.BoxGeometry(0.1, 0.04, 0.36);
  // Silence: a tall thin prism with a raised spine (the 2D outline).
  const prismOutline = [
    [0, -1.25],
    [0.36, -0.44],
    [0.36, 0.75],
    [0, 1.25],
    [-0.36, 0.75],
    [-0.36, -0.44],
  ];
  const silencePrism = new THREE.ExtrudeGeometry(outline(prismOutline), {
    depth: 0.3,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 1,
  });
  const prism = silencePrism.getAttribute('position');
  for (let i = 0; i < prism.count; i += 1) {
    const z = prism.getZ(i);
    if (z > 0)
      prism.setZ(
        i,
        z * (1.6 - 1.2 * Math.min(1, Math.abs(prism.getX(i)) / 0.36))
      );
  }
  silencePrism.rotateX(-Math.PI / 2);
  silencePrism.computeVertexNormals();
  const silenceRim = rimLoop(
    prismOutline.map(([x, y]) => new THREE.Vector3(x * 1.08, 0.02, -y * 1.04))
  );
  // Heat: a matte ring around a dark core, the seam between them.
  const heatShell = new THREE.TorusGeometry(0.74, 0.22, 8, 40);
  heatShell.rotateX(Math.PI / 2);
  heatShell.scale(1, 0.7, 1);
  const heatSeam = new THREE.TorusGeometry(0.5, 0.05, 6, 48);
  heatSeam.rotateX(Math.PI / 2);

  function createDust() {
    const group = new THREE.Group();
    const slab = kit.body('herald-dust', () => [
      { geometry: dustSlab, color: kit.tones.dark },
    ]);
    const slitMaterial = kit.emissive(PALETTE.shot, 0.3);
    const slits = new THREE.Mesh(
      kit.merged('herald-dust-slits', () =>
        [-0.55, 0, 0.55].map((z) => ({
          geometry: dustSlit,
          position: [0.24, 0.27, z],
        }))
      ),
      slitMaterial
    );
    // the haze: a slow ring of faint dust motes, never in the bloom
    const haze = new THREE.Group();
    const hazeMaterial = new THREE.MeshBasicMaterial({
      color: colorOf(THREE, PALETTE.rockLit),
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    });
    haze.add(
      new THREE.Mesh(
        kit.merged('herald-dust-haze', () => {
          const random = createSeededRandom(31.7);
          return Array.from({ length: DUST_MOTES }, (_, i) => {
            const angle = (i / DUST_MOTES) * TAU + random() * 0.5;
            const reach = 1.0 + random() * 0.5;
            const position = [
              Math.cos(angle) * reach,
              -0.1 + random() * 0.3,
              Math.sin(angle) * reach,
            ];
            const size = 0.12 + random() * 0.16;
            return {
              geometry: kit.smallSphere,
              position,
              scale: [size, size * 0.5, size],
            };
          });
        }),
        hazeMaterial
      )
    );
    group.add(slab, slits, haze);
    kit.scene.add(group);
    return kit.view('herald-dust', group, {
      slitMaterial,
      hazeMaterial,
      haze,
      accents: [slitMaterial],
      rims: [kit.rim(group, dustRim)],
      rimColor: kit.rimColors.boss,
    });
  }

  function createHeat() {
    const group = new THREE.Group();
    const shell = kit.body('herald-heat', () => [
      { geometry: heatShell, color: kit.tones.hull, flat: true },
      { geometry: kit.sphere, color: kit.tones.dark, scale: [0.5, 0.3, 0.5] },
    ]);
    const seamMaterial = kit.emissive(PALETTE.shot, 0.8);
    const seam = new THREE.Mesh(heatSeam, seamMaterial);
    seam.position.y = 0.08;
    const warnMaterial = new THREE.MeshBasicMaterial({
      color: colorOf(THREE, PALETTE.shot),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const warn = new THREE.Mesh(kit.warnRing, warnMaterial);
    warn.visible = false;
    group.add(shell, seam, warn);
    kit.scene.add(group);
    return kit.view('herald-heat', group, {
      seam,
      seamMaterial,
      warn,
      accents: [seamMaterial],
      rims: [kit.rim(group, kit.circleRim)],
      rimColor: kit.rimColors.boss,
    });
  }

  function createSilence() {
    const group = new THREE.Group();
    const prismMaterial = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, '#120a1a'),
      emissive: colorOf(THREE, PALETTE.boss),
      emissiveIntensity: 0.06,
      metalness: 0.5,
      roughness: 0.38,
      flatShading: true,
    });
    addRimLight(prismMaterial);
    const prism = new THREE.Mesh(silencePrism, prismMaterial);
    const eyeTone = kit.tone(PALETTE.text, 1.6);
    const eye = kit.glow(
      group,
      eyeTone,
      0.12,
      new THREE.Vector3(0, 0.58, -0.2)
    );
    group.add(prism);
    kit.scene.add(group);
    // the blink rings live in field pixels, outside the scaled body
    const ring = () =>
      new THREE.Mesh(
        kit.warnRing,
        new THREE.MeshBasicMaterial({
          color: colorOf(THREE, PALETTE.boss).multiplyScalar(1.4),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          toneMapped: false,
        })
      );
    const telegraph = {
      group: new THREE.Group(),
      target: ring(),
      self: ring(),
    };
    telegraph.group.add(telegraph.target, telegraph.self);
    telegraph.group.visible = false;
    kit.scene.add(telegraph.group);
    return kit.view('herald-silence', group, {
      eye: eye.anchor,
      eyeTone,
      prismMaterial,
      telegraph,
      accents: [eyeTone],
      rims: [kit.rim(group, silenceRim)],
      rimColor: kit.rimColors.boss,
      glows: [eye],
    });
  }

  // `telegraphRatio` lights what acts: the Dust slits, the Heat seam (and a
  // ring), the Silence eye with the blink rings.
  function updateHerald(view, herald, time, flash) {
    const { object } = view;
    const radius = herald.radius || 30;
    const charge = clamp01(herald.telegraphRatio || 0);
    object.scale.setScalar(radius);
    if (view.kind === 'herald-dust') {
      object.rotation.y = -(herald.rotation || 0);
      kit.setGain(view.slitMaterial, 0.2 + 1.4 * charge + flash * 0.6);
      view.haze.rotation.y = time * 0.15 + (herald.rotation || 0);
      view.hazeMaterial.opacity = 0.08 + 0.1 * charge;
    } else if (view.kind === 'herald-heat') {
      object.rotation.y = 0;
      const breathe = 0.5 + 0.5 * Math.sin(time * 2.2);
      kit.setGain(
        view.seamMaterial,
        0.7 + 0.25 * breathe + 2.2 * charge + flash * 0.6
      );
      view.warn.visible = charge > 0;
      const ring = 1.25 + 0.2 * (1 - charge);
      view.warn.scale.set(ring, 1, ring);
      view.warn.material.opacity = 0.6 * charge;
    } else {
      object.rotation.y = 0;
      view.eye.scale.setScalar(0.12 + 0.05 * charge);
      kit.setGain(
        view.eyeTone,
        1.4 + 0.25 * Math.sin(time * 3) + flash * 0.8 + charge
      );
      const t = view.telegraph;
      const to = herald.blinkTarget;
      t.group.visible = Boolean(to);
      if (to) {
        t.group.position.set(herald.x - HALF_W, 1, herald.y - HALF_H);
        t.target.position.set(to.x - herald.x, 0, to.y - herald.y);
        const r = radius * (BLINK_RING_START - (BLINK_RING_START - 1) * charge);
        t.target.scale.set(r, 1, r);
        t.target.material.opacity = 0.3 + 0.6 * charge;
        const s = radius * (1.3 + 0.4 * charge);
        t.self.scale.set(s, 1, s);
        t.self.material.opacity = 0.3 * charge;
      }
    }
  }

  return { createDust, createHeat, createSilence, updateHerald };
}
