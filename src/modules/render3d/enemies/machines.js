// Machine views drawn by hand: the Wardens' machines — Mote (drone), Seeker
// (hunter), Tether (mine), Husk, Ram, Weaver, Bulwark, Caster, Shade and
// Leech: their hulls, outlines and eyes, and what each lights or moves per
// frame (the Ram's charge, the Caster's landing marks, the Shade's phasing,
// the Leech's belly). An enemy's content file picks one by name (`view`); a
// new enemy is built from its `visual` instead (recipes.js).

import { PALETTE } from '../../../data/constants/palette.js';
import {
  CASTER_SHELL_APEX,
  CASTER_SHELL_RADIUS,
} from '../../../content/enemies/caster.js';
import { getContent } from '../../../content/registry.js';
import { createSeededRandom } from '../asteroidMesh.js';
import { HALF_H, HALF_W, colorOf } from '../batches.js';
import { rimLoop } from '../rimBatch.js';
import { addRimLight } from '../rimLight.js';
import { patchRockShader, rockUniforms } from './rockShader.js';

const WEAVER_ARMS = 3;
const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
// proposta 18/10: the Caster's shell (px across, glow gain) and the Shade
// fully phased — its dissolve threshold (a few flecks stay, dissolve.js noise
// tops out near 0.85), their edge glow and the noise cells per radius.
const CASTER_SHELL_PX = 5;
const CASTER_SHELL_GAIN = 1.8;
const SHADE_PHASED_THRESHOLD = 0.76;
const SHADE_FLECK_GLOW = 2;
const SHADE_NOISE_CELLS = 2.4;
// proposta 18/10: the Leech — how far its hull leans teal, its belly's
// colour (gold → lime) and glow (empty → full), how much the belly swells
// when full, and the full pulse (rad/s, gain, swell).
const LEECH_TEAL_MIX = 0.14;
const LEECH_BELLY_LIME = 0.55;
const LEECH_BELLY_GAIN = [0.5, 1.05];
const LEECH_BELLY_SWELL = 0.25;
const LEECH_PULSE_RATE = 6;
const LEECH_PULSE_GAIN = 0.25;
const LEECH_PULSE_SWELL = 0.08;

/**
 * Machine views.
 * @param {object} kit - the mirror's toolkit (enemyMirror.js createKit), never
 *   the mirror itself.
 */
export function createMachineViews(kit) {
  const { THREE } = kit;
  // Seeker: a dart-shaped hull.
  const seekerShape = new THREE.Shape();
  const seekerOutline = [
    [1.35, 0],
    [0.35, 0.5],
    [-0.85, 0.42],
    [-1.1, 0],
    [-0.85, -0.42],
    [0.35, -0.5],
  ];
  seekerOutline.forEach(([x, y], i) =>
    i ? seekerShape.lineTo(x, y) : seekerShape.moveTo(x, y)
  );
  seekerShape.closePath();
  const seekerHull = new THREE.ExtrudeGeometry(seekerShape, {
    depth: 0.42,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 1,
  });
  // ridge along the spine, so the key light breaks the top into facets
  const hull = seekerHull.getAttribute('position');
  for (let i = 0; i < hull.count; i += 1) {
    const z = hull.getZ(i);
    if (z > 0)
      hull.setZ(i, z * (1 - 0.6 * Math.min(1, Math.abs(hull.getY(i)) / 0.5)));
  }
  seekerHull.rotateX(-Math.PI / 2);
  seekerHull.computeVertexNormals();
  const seekerRim = rimLoop(
    seekerOutline.map(([x, y]) => new THREE.Vector3(x * 1.12, 0.05, y * 1.12))
  );

  const strut = new THREE.CylinderGeometry(0.07, 0.07, 0.6, 6);
  strut.rotateZ(Math.PI / 2);
  strut.translate(0.72, 0, 0);

  // Husk: faceted carapace, dented so the facets catch the key light
  // unevenly; the dent is a function of position, so the duplicated
  // vertices of the non-indexed polyhedron stay welded.
  const huskShell = new THREE.IcosahedronGeometry(1, 1);
  const shell = huskShell.getAttribute('position');
  for (let i = 0; i < shell.count; i += 1) {
    const x = shell.getX(i);
    const y = shell.getY(i);
    const z = shell.getZ(i);
    const k =
      0.95 + 0.07 * Math.sin(x * 7.1 + z * 3.3) * Math.cos(y * 5.7 + x * 2.1);
    shell.setXYZ(i, x * k, y * k * 0.55, z * k);
  }
  huskShell.computeVertexNormals();

  // Ram: arrowhead hull with a raised spine, like the Seeker's.
  const ramOutline = [
    [1.1, 0],
    [-0.8, 0.75],
    [-0.42, 0],
    [-0.8, -0.75],
  ];
  const ramShape = new THREE.Shape();
  ramOutline.forEach(([x, y], i) =>
    i ? ramShape.lineTo(x, y) : ramShape.moveTo(x, y)
  );
  ramShape.closePath();
  const ramHull = new THREE.ExtrudeGeometry(ramShape, {
    depth: 0.34,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.05,
    bevelSegments: 1,
  });
  const ram = ramHull.getAttribute('position');
  for (let i = 0; i < ram.count; i += 1) {
    const z = ram.getZ(i);
    if (z > 0)
      ram.setZ(i, z * (1 - 0.6 * Math.min(1, Math.abs(ram.getY(i)) / 0.75)));
  }
  ramHull.rotateX(-Math.PI / 2);
  ramHull.computeVertexNormals();
  const ramRim = rimLoop(
    ramOutline.map(([x, y]) => new THREE.Vector3(x * 1.08, 0.05, y * 1.08))
  );

  // Weaver: one arm, trailing the spin.
  const armPoint = (angle, r) =>
    new THREE.Vector3(Math.cos(angle) * r, 0.06, Math.sin(angle) * r);
  const weaverArm = new THREE.TubeGeometry(
    new THREE.QuadraticBezierCurve3(
      armPoint(0, 0.3),
      armPoint(-0.275, 0.75),
      armPoint(-0.55, 1)
    ),
    10,
    0.07,
    5,
    false
  );
  const weaverTip = armPoint(-0.55, 1);

  // Caster: a short mortar tilted 30° up, its breech at the turret's top.
  const casterBarrel = new THREE.CylinderGeometry(0.2, 0.26, 0.95, 10);
  casterBarrel.rotateZ(-Math.PI / 3);
  casterBarrel.translate(0.56, 0.34, 0);

  // Shade: a swept blade, a ridge along the spine.
  const shadeOutline = [
    [1.2, 0],
    [0.1, -0.5],
    [-0.95, -0.95],
    [-0.5, -0.2],
    [-0.75, 0],
    [-0.5, 0.2],
    [-0.95, 0.95],
    [0.1, 0.5],
  ];
  const shadeShape = new THREE.Shape();
  shadeOutline.forEach(([x, y], i) =>
    i ? shadeShape.lineTo(x, y) : shadeShape.moveTo(x, y)
  );
  shadeShape.closePath();
  const shadeHull = new THREE.ExtrudeGeometry(shadeShape, {
    depth: 0.26,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.04,
    bevelSegments: 1,
  });
  const blade = shadeHull.getAttribute('position');
  for (let i = 0; i < blade.count; i += 1) {
    const z = blade.getZ(i);
    if (z > 0)
      blade.setZ(i, z * (1 - 0.6 * Math.min(1, Math.abs(blade.getY(i)) / 0.5)));
  }
  shadeHull.rotateX(-Math.PI / 2);
  shadeHull.computeVertexNormals();
  const shadeRim = rimLoop(
    shadeOutline.map(([x, y]) => new THREE.Vector3(x * 1.06, 0.05, y * 1.06))
  );

  // Leech: the pod's outline.
  const pod = [];
  for (let i = 0; i < 40; i += 1) {
    const a = (i / 40) * TAU;
    pod.push(new THREE.Vector3(Math.cos(a) * 1.08, 0, Math.sin(a) * 0.8));
  }
  const leechRim = rimLoop(pod);

  function createMote(kind) {
    const group = new THREE.Group();
    const body = kit.body('mote-body', () => [
      { geometry: kit.sphere, color: kit.tones.hull, scale: [1, 0.42, 1] },
    ]);
    const eyeTone = kit.tone(PALETTE.threat, 1.4);
    group.add(body);
    kit.scene.add(group);
    return kit.view(kind, group, {
      body,
      accents: [eyeTone],
      rims: [kit.rim(group, kit.circleRim, 1.04)],
      glows: [kit.glow(group, eyeTone, 0.22, new THREE.Vector3(0.7, 0.16, 0))],
    });
  }

  function createSeeker(kind) {
    const group = new THREE.Group();
    const body = kit.body('seeker-body', () => [
      { geometry: seekerHull, color: kit.tones.hull },
    ]);
    const lensTone = kit.tone(PALETTE.threat, 0.5);
    group.add(body);
    kit.scene.add(group);
    return kit.view(kind, group, {
      lensTone,
      accents: [lensTone],
      rims: [kit.rim(group, seekerRim)],
      glows: [kit.glow(group, lensTone, 0.2, new THREE.Vector3(1.12, 0.3, 0))],
    });
  }

  function createTether(kind) {
    const group = new THREE.Group();
    const spin = new THREE.Group();
    const angles = [0, 1, 2].map((i) => (i / 3) * Math.PI * 2);
    const tips = angles.map(
      (angle) =>
        new THREE.Vector3(Math.cos(angle) * 1.05, 0, -Math.sin(angle) * 1.05)
    );
    const frame = kit.body('tether-frame', () => [
      { geometry: kit.sphere, color: kit.tones.dark, scale: 0.5 },
      ...angles.map((rotationY) => ({
        geometry: strut,
        color: kit.tones.hull,
        rotationY,
      })),
    ]);
    const nodeTone = kit.tone(PALETTE.threat, 0.6);
    spin.add(frame);
    // the arc between the nodes: a rim in its own (pulsing accent) colour
    const arcTone = kit.tone(PALETTE.threat, 1.1);
    const arc = kit.rim(spin, rimLoop(tips), 1, arcTone.color);
    group.add(spin);
    kit.scene.add(group);
    return kit.view(kind, group, {
      spin,
      nodeTone,
      arc,
      arcTone,
      accents: [nodeTone, arcTone],
      rims: [kit.rim(group, kit.circleRim, 1.2), arc],
      glows: tips.map((tip) => kit.glow(spin, nodeTone, 0.15, tip)),
    });
  }

  function createHusk(kind) {
    const group = new THREE.Group();
    // the Ring rock's crack shader on a hull plate: seams instead of veins
    const material = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, PALETTE.hullLit),
      metalness: 0.2,
      roughness: 0.88,
      flatShading: true,
    });
    material.userData.rockUniforms = rockUniforms(
      THREE,
      kit.threatColor.clone()
    );
    material.onBeforeCompile = patchRockShader;
    addRimLight(material);
    const shell = new THREE.Mesh(huskShell, material);
    shell.scale.setScalar(0.95);
    group.add(shell);
    kit.scene.add(group);
    return kit.view(kind, group, {
      shell,
      material,
      rims: [kit.rim(group, kit.circleRim, 0.98)],
    });
  }

  function createRam(kind) {
    const group = new THREE.Group();
    const body = kit.body('ram-body', () => [
      { geometry: ramHull, color: kit.tones.hull },
      {
        geometry: kit.smallSphere,
        color: kit.tones.dark,
        scale: [0.2, 0.06, 0.2],
        position: [0.45, 0.38, 0],
      },
    ]);
    const lensTone = kit.tone(PALETTE.threat, 0.4);
    const lens = kit.glow(
      group,
      lensTone,
      0.12,
      new THREE.Vector3(0.45, 0.4, 0)
    );
    const coreTone = kit.tone(PALETTE.text, 0);
    const core = kit.glow(
      group,
      coreTone,
      0.07,
      new THREE.Vector3(0.45, 0.48, 0)
    );
    group.add(body);
    kit.scene.add(group);
    return kit.view(kind, group, {
      lens: lens.anchor,
      lensTone,
      core: core.anchor,
      coreTone,
      telegraph: kit.createTelegraph(),
      accents: [lensTone],
      rims: [kit.rim(group, ramRim)],
      glows: [lens, core],
    });
  }

  function createWeaver(kind) {
    const group = new THREE.Group();
    const hub = kit.body('weaver-hub', () => [
      {
        geometry: kit.sphere,
        color: kit.tones.hull,
        scale: [0.34, 0.24, 0.34],
      },
      {
        geometry: kit.smallSphere,
        color: kit.tones.dark,
        scale: [0.14, 0.06, 0.14],
        position: [0, 0.2, 0],
      },
    ]);
    // matte arms that flush with the accent while laying; the emissive
    // color itself is the accent base the Elite swap rewrites
    const armMaterial = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, PALETTE.hullLit),
      metalness: 0.3,
      roughness: 0.7,
      emissive: kit.threatColor.clone(),
      emissiveIntensity: 0,
    });
    armMaterial.userData.base = armMaterial.emissive;
    addRimLight(armMaterial);
    const tipTone = kit.tone(PALETTE.threat, 0.5);
    const spin = new THREE.Group();
    const turns = Array.from(
      { length: WEAVER_ARMS },
      (_, i) => -(i * TAU) / WEAVER_ARMS
    );
    const arms = new THREE.Mesh(
      kit.merged('weaver-arms', () =>
        turns.map((rotationY) => ({ geometry: weaverArm, rotationY }))
      ),
      armMaterial
    );
    const up = new THREE.Vector3(0, 1, 0);
    const tips = turns.map((turn) =>
      kit.glow(spin, tipTone, 1, weaverTip.clone().applyAxisAngle(up, turn))
    );
    spin.add(arms);
    group.add(hub, spin);
    kit.scene.add(group);
    return kit.view(kind, group, {
      spin,
      armMaterial,
      tipTone,
      tips: tips.map((tip) => tip.anchor),
      accents: [armMaterial, tipTone],
      rims: [kit.rim(group, kit.circleRim, 0.36)],
      glows: tips,
    });
  }

  function createBulwark(kind) {
    const group = new THREE.Group();
    const hull = kit.body('bulwark-hull', () => [
      {
        geometry: kit.sphere,
        color: kit.tones.hull,
        scale: [0.72, 0.4, 0.72],
      },
      {
        geometry: kit.smallSphere,
        color: kit.tones.dark,
        scale: [0.4, 0.08, 0.4],
        position: [0, 0.34, 0],
      },
    ]);
    const plate = new THREE.Group();
    // the arc its recipe's frontal shield hits within, so plate and hit area agree
    const arc = getContent('enemies', kind).behaviors['frontal-shield'].halfArc;
    const geometries = kit.frontalPlate(arc);
    const plateMesh = new THREE.Mesh(geometries.plate, kit.plateMaterial);
    const edgeMaterial = kit.emissive(PALETTE.threat, 1.2);
    const edge = new THREE.Mesh(geometries.edge, edgeMaterial);
    plate.add(plateMesh, edge);
    group.add(hull, plate);
    kit.scene.add(group);
    return kit.view(kind, group, {
      plate,
      plateMesh,
      edge,
      edgeMaterial,
      accents: [edgeMaterial],
      rims: [kit.rim(group, kit.circleRim, 0.74)],
    });
  }

  function createCaster(kind) {
    const group = new THREE.Group();
    const body = kit.body('caster-body', () => [
      {
        geometry: kit.sphere,
        color: kit.tones.hull,
        scale: [0.78, 0.42, 0.78],
      },
      {
        geometry: kit.smallSphere,
        color: kit.tones.dark,
        scale: [0.34, 0.08, 0.34],
        position: [0, 0.37, 0],
      },
      { geometry: casterBarrel, color: kit.tones.hull },
    ]);
    const lensTone = kit.tone(PALETTE.threat, 0.4);
    const lens = kit.glow(
      group,
      lensTone,
      0.15,
      new THREE.Vector3(1.0, 0.6, 0)
    );
    group.add(body);
    kit.scene.add(group);
    // the aim ring, the blast ring (and its faint fill) and the one closing on
    // the landing, and the shell: field pixels, outside the body
    const fieldMaterial = () =>
      new THREE.MeshBasicMaterial({
        color: kit.threatColor.clone(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
    const shellMaterial = kit.emissive(PALETTE.threat, CASTER_SHELL_GAIN);
    const telegraph = {
      group: new THREE.Group(),
      aim: new THREE.Mesh(kit.fuseRing, fieldMaterial()),
      blast: new THREE.Mesh(kit.fuseRing, fieldMaterial()),
      fill: new THREE.Mesh(kit.ghostDisc, fieldMaterial()),
      closing: new THREE.Mesh(kit.fuseRing, fieldMaterial()),
      shell: new THREE.Mesh(kit.smallSphere, shellMaterial),
    };
    telegraph.shell.scale.setScalar(CASTER_SHELL_PX);
    const { aim, blast, fill, closing, shell } = telegraph;
    telegraph.group.add(fill, aim, blast, closing, shell);
    telegraph.group.position.set(-HALF_W, 1, -HALF_H);
    telegraph.group.visible = false;
    kit.scene.add(telegraph.group);
    return kit.view(kind, group, {
      lens: lens.anchor,
      lensTone,
      telegraph,
      accents: [lensTone, shellMaterial],
      rims: [kit.rim(group, kit.circleRim, 0.8)],
      glows: [lens],
    });
  }

  // `telegraphRatio` lights the lens and grows the aim ring; in flight the
  // blast ring holds, an inner ring closes on the landing and the shell
  // rises to CASTER_SHELL_APEX and falls; nothing stays after the landing.
  function updateCaster(view, caster) {
    const charge = clamp01(caster.telegraphRatio || 0);
    kit.setGain(view.lensTone, 0.4 + 1.8 * charge);
    view.lens.scale.setScalar(0.15 * (1 + 0.8 * charge));
    const { aim, shell } = caster;
    const t = view.telegraph;
    t.group.visible = Boolean(aim || shell);
    if (!t.group.visible) return;
    const accent = kit.accentOf(view);
    const ring = (mesh, at, radius, opacity) => {
      mesh.visible = Boolean(at);
      if (!at) return;
      mesh.position.set(at.x, 0, at.y);
      mesh.scale.set(Math.max(1, radius), 1, Math.max(1, radius));
      mesh.material.color.copy(accent);
      mesh.material.opacity = opacity;
    };
    ring(t.aim, aim, CASTER_SHELL_RADIUS * charge, 0.3 + 0.6 * charge);
    const progress = clamp01(caster.shellProgress || 0);
    ring(t.blast, shell, CASTER_SHELL_RADIUS, 0.5 + 0.4 * progress);
    // additive in linear light: a few percent already reads as a tint
    ring(t.fill, shell, CASTER_SHELL_RADIUS, 0.005 + 0.015 * progress);
    ring(t.closing, shell, CASTER_SHELL_RADIUS * (1 - progress), 0.9);
    t.shell.visible = Boolean(shell);
    if (shell) {
      t.shell.position.set(
        shell.fromX + (shell.x - shell.fromX) * progress,
        CASTER_SHELL_APEX * 4 * progress * (1 - progress),
        shell.fromY + (shell.y - shell.fromY) * progress
      );
    }
  }

  function createShade(kind) {
    const group = new THREE.Group();
    const body = kit.body('shade-body', () => [
      { geometry: shadeHull, color: kit.tones.hull },
    ]);
    const eyeTone = kit.tone(PALETTE.threat, 1.3);
    group.add(body);
    kit.scene.add(group);
    return kit.view(kind, group, {
      body,
      eyeTone,
      phased: false,
      accents: [eyeTone],
      rims: [kit.rim(group, shadeRim)],
      glows: [kit.glow(group, eyeTone, 0.13, new THREE.Vector3(0.45, 0.22, 0))],
    });
  }

  // The Shade out of the Field (`ghost` 0..1): its body takes its own dissolve
  // twin (dissolve.js) held at a live threshold, so fully out a few accent
  // flecks stay; the outline and the eye fade with it.
  function phaseShade(view, ghost) {
    const phased = ghost > 0;
    if (phased !== view.phased) {
      view.phased = phased;
      const parts = kit.dissolve.partsOf(view);
      view.body.material = phased
        ? kit.dissolve.twinOf(parts, kit.machineMaterial)
        : kit.machineMaterial;
    }
    view.rims[0].anchor.visible = ghost < 0.5;
    if (view.eliteRing) view.eliteRing.visible = view.elite && ghost < 0.5;
    kit.setGain(view.eyeTone, 1.3 * (1 - ghost));
    if (!phased) return;
    const u = view.dissolve.uniforms;
    const seed = view.seed || 0;
    u.uDissolve.value = SHADE_PHASED_THRESHOLD * ghost;
    u.uDissolveGlow.value = SHADE_FLECK_GLOW;
    u.uDissolveScale.value = SHADE_NOISE_CELLS / Math.max(4, view.radius || 12);
    u.uDissolveEdge.value.copy(kit.accentOf(view));
    u.uDissolveSeed.value.set(
      (seed % 997) * 0.37,
      ((seed >>> 10) % 991) * 0.41,
      ((seed >>> 20) % 983) * 0.43
    );
  }

  // A pod of three plates leaning teal, its dark maw forward; the belly
  // window on its back is its own emissive material, the maw's lips the
  // accent.
  function createLeech(kind) {
    const group = new THREE.Group();
    const teal = kit.tones.hull
      .clone()
      .lerp(colorOf(THREE, PALETTE.player), LEECH_TEAL_MIX);
    const body = kit.body('leech-body', () => [
      {
        geometry: kit.sphere,
        color: teal,
        scale: [0.42, 0.34, 0.5],
        position: [-0.62, 0, 0],
      },
      { geometry: kit.sphere, color: teal, scale: [0.6, 0.46, 0.76] },
      {
        geometry: kit.sphere,
        color: teal,
        scale: [0.44, 0.38, 0.62],
        position: [0.52, 0, 0],
      },
      {
        geometry: kit.smallSphere,
        color: kit.tones.dark,
        scale: [0.12, 0.2, 0.3],
        position: [0.9, 0.06, 0],
      },
    ]);
    const lime = colorOf(THREE, PALETTE.status);
    const bellyMaterial = kit.emissive(PALETTE.xp, LEECH_BELLY_GAIN[0]);
    bellyMaterial.userData.base.lerp(lime, LEECH_BELLY_LIME);
    kit.setGain(bellyMaterial, LEECH_BELLY_GAIN[0]);
    const belly = new THREE.Mesh(kit.smallSphere, bellyMaterial);
    belly.position.set(-0.04, 0.4, 0);
    const lipsTone = kit.tone(PALETTE.threat, 1.2);
    group.add(body, belly);
    kit.scene.add(group);
    return kit.view(kind, group, {
      belly,
      bellyMaterial,
      accents: [lipsTone],
      rims: [kit.rim(group, leechRim)],
      glows: [kit.glow(group, lipsTone, 0.1, new THREE.Vector3(1.0, 0.18, 0))],
    });
  }

  // `fullness` lights and swells the belly; `full` pulses it.
  function updateLeech(view, leech, time) {
    const fullness = clamp01(leech.fullness || 0);
    const pulse = leech.full
      ? 0.5 + 0.5 * Math.sin(time * LEECH_PULSE_RATE + (view.seed % 7))
      : 0;
    const [dim, lit] = LEECH_BELLY_GAIN;
    const gain = dim + (lit - dim) * fullness + LEECH_PULSE_GAIN * pulse;
    kit.setGain(view.bellyMaterial, gain);
    const swell = 1 + LEECH_BELLY_SWELL * fullness + LEECH_PULSE_SWELL * pulse;
    view.belly.scale.set(0.36 * swell, 0.12 * swell, 0.3 * swell);
  }

  // The Husk's seams and turn come from its seed.
  function bindHusk(view) {
    const random = createSeededRandom((view.seed % 100000) + 1);
    view.material.userData.rockUniforms.uSeed.value.set(
      random() * 50,
      random() * 50,
      random() * 50
    );
    view.shell.rotation.y = random() * TAU;
  }

  // What each look lights or moves per frame, after the pose, the Elite look
  // and the affixes every machine shares (EnemyMirror.updateMachine).
  function updateSeeker(view, enemy) {
    kit.setGain(view.lensTone, 0.5 + 1.3 * (enemy.telegraphRatio || 0));
  }

  function updateTether(view, enemy, time) {
    const armed = Boolean(enemy.armed);
    const pulse = 0.5 + 0.5 * Math.sin(time * 9 + (view.seed % 7));
    kit.setGain(view.nodeTone, armed ? 1.1 + 0.6 * pulse : 0.6);
    view.arc.anchor.visible = armed;
    kit.setGain(view.arcTone, 1.1 + 0.6 * pulse);
    view.spin.rotation.y = time * (armed ? 2.4 : 0.8);
  }

  function updateHusk(view, enemy, time, flash) {
    view.object.rotation.y = 0;
    const heat = clamp01(enemy.damageRatio || 0);
    const uniforms = view.material.userData.rockUniforms;
    // reveal stays under 0.6: the fine crack layer is the Ring rock's look
    uniforms.uGlow.value = 0.15 + 1.2 * heat;
    uniforms.uReveal.value = 0.35 + 0.2 * heat;
    uniforms.uWidth.value = 0.04 + 0.025 * heat;
    uniforms.uFlash.value = flash * 0.45;
  }

  function updateRam(view, enemy) {
    const charge = clamp01(enemy.telegraphRatio || 0);
    kit.setGain(view.lensTone, 0.4 + 1.8 * charge);
    view.lens.scale.setScalar(0.12 * (1 + 0.8 * charge));
    view.core.visible = charge > 0.5;
    kit.setGain(view.coreTone, (charge - 0.5) * 2.4);
    kit.updateTelegraph(view.telegraph, enemy, enemy.radius || 14);
  }

  function updateWeaver(view, enemy) {
    view.object.rotation.y = 0;
    view.spin.rotation.y = -(enemy.spin || 0);
    const lay = clamp01(enemy.layGlow || 0);
    view.armMaterial.emissiveIntensity = 2.2 * lay;
    kit.setGain(view.tipTone, 0.5 + 1.6 * lay);
    for (let i = 0; i < view.tips.length; i += 1) {
      view.tips[i].scale.setScalar(0.09 + 0.07 * lay);
    }
  }

  function updateShade(view, enemy) {
    phaseShade(view, 1 - clamp01(enemy.visibility ?? 1));
  }

  function updateBulwark(view, enemy) {
    view.object.rotation.y = 0;
    view.plate.rotation.y = -(enemy.facing || 0);
    const broken = Boolean(enemy.shieldBroken);
    view.plateMesh.material = broken ? kit.darkMaterial : kit.plateMaterial;
    view.edge.visible = !broken;
    const shield =
      enemy.maxShieldHealth > 0
        ? enemy.shieldHealth / enemy.maxShieldHealth
        : 1;
    kit.setGain(view.edgeMaterial, 0.5 + 0.9 * clamp01(shield));
  }

  return {
    // The hand-made looks, by the name an enemy's content file gives as
    // `view`: `create(kind)` builds a view for that enemy kind, `update`
    // moves it per frame, `bind` gives it its seed's looks (EnemyMirror).
    views: {
      mote: { create: createMote },
      seeker: { create: createSeeker, update: updateSeeker },
      tether: { create: createTether, update: updateTether },
      husk: { create: createHusk, update: updateHusk, bind: bindHusk },
      ram: { create: createRam, update: updateRam },
      weaver: { create: createWeaver, update: updateWeaver },
      bulwark: { create: createBulwark, update: updateBulwark },
      caster: { create: createCaster, update: updateCaster },
      shade: { create: createShade, update: updateShade },
      leech: { create: createLeech, update: updateLeech },
    },
    phaseShade,
  };
}
