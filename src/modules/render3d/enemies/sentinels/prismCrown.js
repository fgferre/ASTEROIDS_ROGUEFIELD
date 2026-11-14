import { PALETTE } from '../../../../data/constants/palette.js';
import { SENTINEL_KINDS } from '../../../../data/enemies/boss.js';
import { colorOf } from '../../batches.js';
import {
  RIM,
  CORE_COLD,
  CORE_HOT,
  CORE_BEAT,
  CORE_FLASH,
  clamp01,
  ring,
  hex,
  progressOf,
} from './kit.js';

// proposta 13/11: how hot the gem burns as the beams charge and while they
// fire (on top of its own heat), and how far the panes turn red when lit.
const GEM_CHARGE = [1.4, 2.2];
const PANE_LIT = 0.85;

export function createPrismCrown(sk) {
  const {
    THREE,
    kit,
    recipeViews,
    panelMaterial,
    emitterMaterial,
    hull,
    dark,
    steel,
    soot,
    slab,
    box,
    drum,
    merge,
  } = sk;
  // Prism Crown: a six-sided setting (a dark foot, a collar, a steel claw at
  // every corner) holding a cut gem, and up to four mirrors placed each frame
  // from boss.mirrors: a pane of crystal in a dark frame on a foot, turned so
  // that it really reflects the core's beam into its own (its face bisects
  // the two). Spread out (boss.crownOpen) the panes go dark and the gem burns
  // hot. Its beams are one telegraph under one group.
  const CROWN = SENTINEL_KINDS['prism-crown'];
  const CROWN_MIRRORS = Math.max(...CROWN.cycle.map((c) => c.mirrors));
  const crownCore = merge([
    { geometry: slab(hex(0.68, Math.PI / 6), -0.28, -0.04, 0.05), color: dark },
    { geometry: slab(hex(0.54), -0.06, 0.12, 0.04), color: hull },
    { geometry: drum(0.34, 0.03, 12), color: soot, position: [0, 0.125, 0] },
    ...ring(6, 0.42).flatMap(([x, z, angle]) => [
      {
        geometry: box(0.09, 0.36, 0.09),
        color: steel,
        position: [x, 0.24, z],
        rotationY: -angle,
      },
      {
        geometry: box(0.16, 0.05, 0.09),
        color: steel,
        position: [x * 0.86, 0.43, z * 0.86],
        rotationY: -angle,
      },
    ]),
    // a rib down every face of the foot
    ...ring(6, 0.6, Math.PI / 6).map(([x, z, angle]) => ({
      geometry: box(0.05, 0.2, 0.2),
      color: hull,
      position: [x, -0.16, z],
      rotationY: -angle,
    })),
  ]);
  // The gem: a bipyramid, taller than wide.
  const crownGem = new THREE.OctahedronGeometry(0.3).scale(1, 1.25, 1);
  // A mirror, its face toward +x: the frame (posts, sills, a foot), in
  // polished steel as the weapon part it is, and the pane in it.
  const crownFrame = merge([
    ...[0.31, -0.31].map((z) => ({
      geometry: box(0.07, 0.56, 0.06),
      color: dark,
      position: [0, 0.2, z],
    })),
    { geometry: box(0.07, 0.05, 0.68), color: steel, position: [0, 0.5, 0] },
    { geometry: box(0.09, 0.06, 0.68), color: dark, position: [0, -0.06, 0] },
    { geometry: drum(0.16, 0.1, 8), color: dark, position: [0, -0.14, 0] },
  ]);
  const paneColor = colorOf(THREE, '#9fe8ff');
  const crownPane = box(0.03, 0.48, 0.56);
  crownPane.translate(0, 0.21, 0);
  const CROWN_LIGHTS = Object.freeze({
    parts: [],
    lights: [{ at: [0, 0.3, 0.3], dir: [0, 1, 0.4], size: 0.04 }],
  });

  function createPrismCrown(kind) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(crownCore, panelMaterial));
    const lights = recipeViews.lookOf(CROWN_LIGHTS).create(kind);
    group.add(lights.object);
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, '#0a1a22'),
      emissive: colorOf(THREE, PALETTE.threat),
      emissiveIntensity: CORE_COLD,
      roughness: 0.3,
      metalness: 0.1,
      flatShading: true,
    });
    const gem = new THREE.Mesh(crownGem, coreMaterial);
    gem.position.set(0, 0.42, 0);
    group.add(gem);
    const mirrorMaterial = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, '#9fe8ff'),
      emissive: colorOf(THREE, '#9fe8ff'),
      emissiveIntensity: 0.6,
      roughness: 0.15,
      metalness: 0.4,
    });
    const mirrors = Array.from({ length: CROWN_MIRRORS }, () => {
      const mirror = new THREE.Group();
      mirror.add(
        new THREE.Mesh(crownFrame, emitterMaterial),
        new THREE.Mesh(crownPane, mirrorMaterial)
      );
      group.add(mirror);
      return mirror;
    });
    kit.scene.add(group);
    const beams = kit.createTelegraph(CROWN_MIRRORS * 2, 0, CROWN_MIRRORS * 2);
    const telegraphs = new THREE.Group();
    telegraphs.add(beams.group);
    kit.scene.add(telegraphs);
    return {
      kind,
      object: group,
      mirrors,
      mirrorMaterial,
      coreMaterial,
      rims: [kit.rim(group, kit.circleRim, RIM)],
      rimColor: kit.rimColors.boss,
      glows: [...lights.lights, ...beams.sparks],
      telegraph: { group: telegraphs, beams },
      id: null,
    };
  }

  function updatePrismCrown(view, boss, time) {
    const radius = boss.radius || CROWN.radius;
    view.object.scale.setScalar(radius);
    view.object.rotation.y = 0;
    view.mirrors.forEach((mesh, i) => {
      const m = boss.mirrors?.[i];
      mesh.visible = Boolean(m);
      if (!m) return;
      mesh.position.set((m.x - boss.x) / radius, 0, (m.y - boss.y) / radius);
      // its face bisects the way back to the core and the way its beam goes
      mesh.rotation.y = -Math.atan2(
        Math.sin(m.angle) - Math.sin(m.orbit),
        Math.cos(m.angle) - Math.cos(m.orbit)
      );
    });
    const open = clamp01(boss.crownOpen ?? 0);
    // the gem is the emitter: it gathers light while the beams warn and
    // burns while they fire; the panes it feeds turn red as they reflect
    const b = boss.beams;
    const warning = b?.phase === 'warn';
    const charge = b
      ? warning
        ? GEM_CHARGE[0] * progressOf(b) ** 2
        : GEM_CHARGE[1] * (0.85 + 0.15 * Math.sin(time * 40))
      : 0;
    const lit = b ? (warning ? 0.3 * progressOf(b) : 1) * PANE_LIT : 0;
    view.mirrorMaterial.emissive.copy(paneColor).lerp(kit.threatColor, lit);
    view.mirrorMaterial.emissiveIntensity = 0.6 * (1 - open) + lit;
    view.coreMaterial.emissiveIntensity =
      CORE_COLD +
      charge +
      open * (CORE_HOT + 0.3 * Math.sin(time * CORE_BEAT)) +
      boss.getHitFlash() * CORE_FLASH * (0.2 + open);
    view.telegraph.group.visible = true;
    kit.updateTelegraph(
      view.telegraph.beams,
      { telegraph: boss.beams },
      radius
    );
  }

  return {
    kind: 'boss-prism-crown',
    create: createPrismCrown,
    update: updatePrismCrown,
  };
}
