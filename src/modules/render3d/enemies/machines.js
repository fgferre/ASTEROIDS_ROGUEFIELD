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
import { createHeavyParts } from './heavyMachines.js';
import {
  moteModel,
  ramModel,
  seekerModel,
  shadeModel,
  tetherModel,
} from './lightMachines.js';

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
  // The light machines' hulls, eyes and outlines (lightMachines.js).
  const seeker = seekerModel(kit);

  const mote = moteModel(kit);
  const tether = tetherModel(kit);

  // The heavy machines' parts: Husk, Weaver, Bulwark, Caster, Leech.
  const heavy = createHeavyParts(kit);

  const ram = ramModel(kit);

  // Weaver, Caster: rotor arms and mortar turret (heavyMachines.js).

  const shade = shadeModel(kit);

  // Leech: segmented pod (heavyMachines.js).

  function createMote(kind) {
    const group = new THREE.Group();
    const body = kit.body('mote-body', mote.parts);
    const eyeTone = kit.tone(PALETTE.threat, 1.4);
    group.add(body);
    kit.scene.add(group);
    return kit.view(kind, group, {
      body,
      accents: [eyeTone],
      rims: [kit.rim(group, kit.circleRim, 1.04)],
      glows: [kit.glow(group, eyeTone, mote.eyeSize, mote.eye)],
    });
  }

  function createSeeker(kind) {
    const group = new THREE.Group();
    const body = kit.body('seeker-body', seeker.parts);
    const lensTone = kit.tone(PALETTE.threat, 0.5);
    group.add(body);
    kit.scene.add(group);
    return kit.view(kind, group, {
      lensTone,
      accents: [lensTone],
      rims: [kit.rim(group, seeker.rim)],
      glows: [kit.glow(group, lensTone, seeker.lensSize, seeker.lens)],
    });
  }

  function createTether(kind) {
    const group = new THREE.Group();
    const spin = new THREE.Group();
    const { tips } = tether;
    const frame = kit.body('tether-frame', tether.parts);
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
      glows: tips.map((tip) => kit.glow(spin, nodeTone, tether.nodeSize, tip)),
    });
  }

  function createHusk(kind) {
    const group = new THREE.Group();
    // the Ring rock's crack shader on the carapace: seams instead of veins;
    // plates and belly keep their hull/dark tones in vertex colours
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
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
    const geometry = kit.merged('husk-shell', heavy.huskShell);
    const shell = new THREE.Mesh(geometry, material);
    group.add(shell);
    kit.scene.add(group);
    return kit.view(kind, group, {
      shell,
      material,
      // its outline at the plates' waist turns with the shell (bindHusk)
      rims: [kit.rim(shell, heavy.outline(geometry, 0.04))],
    });
  }

  function createRam(kind) {
    const group = new THREE.Group();
    const body = kit.body('ram-body', ram.parts);
    const lensTone = kit.tone(PALETTE.threat, 0.4);
    const lens = kit.glow(group, lensTone, 0.12, ram.lens);
    const coreTone = kit.tone(PALETTE.text, 0);
    const core = kit.glow(group, coreTone, 0.07, ram.core);
    group.add(body);
    kit.scene.add(group);
    return kit.view(kind, group, {
      lens: lens.anchor,
      lensTone,
      core: core.anchor,
      coreTone,
      telegraph: kit.createTelegraph(),
      accents: [lensTone],
      rims: [kit.rim(group, ram.rim)],
      glows: [lens, core],
    });
  }

  function createWeaver(kind) {
    const group = new THREE.Group();
    const hub = kit.body('weaver-hub', heavy.weaverHub);
    // the matte rotor (hull/dark vertex tones) flushes with the accent while
    // laying; the emissive color itself is the accent base the Elite swap
    // rewrites
    const armMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
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
      kit.merged('weaver-arms', () => heavy.weaverArms(turns)),
      armMaterial
    );
    const up = new THREE.Vector3(0, 1, 0);
    const tips = turns.map((turn) =>
      kit.glow(
        spin,
        tipTone,
        1,
        heavy.weaverTip.clone().applyAxisAngle(up, turn)
      )
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
      rims: [kit.rim(group, kit.circleRim, 0.49)],
      glows: tips,
    });
  }

  function createBulwark(kind) {
    const group = new THREE.Group();
    const hull = kit.body('bulwark-hull', heavy.bulwarkHull);
    // the plate and the body braced behind it turn together to the player
    const plate = new THREE.Group();
    // the arc its recipe's frontal shield hits within, so plate and hit area agree
    const arc = getContent('enemies', kind).behaviors['frontal-shield'].halfArc;
    const geometries = kit.frontalPlate(arc);
    const plateMesh = new THREE.Mesh(geometries.plate, kit.plateMaterial);
    const edgeMaterial = kit.emissive(PALETTE.threat, 1.2);
    const edge = new THREE.Mesh(geometries.edge, edgeMaterial);
    plate.add(hull, plateMesh, edge);
    group.add(plate);
    kit.scene.add(group);
    return kit.view(kind, group, {
      plate,
      plateMesh,
      edge,
      edgeMaterial,
      accents: [edgeMaterial],
      rims: [kit.rim(plate, heavy.outline(hull.geometry, 0.02))],
    });
  }

  function createCaster(kind) {
    const group = new THREE.Group();
    const body = kit.body('caster-body', heavy.casterBody);
    const lensTone = kit.tone(PALETTE.threat, 0.4);
    const lens = kit.glow(group, lensTone, 0.15, heavy.casterMuzzle);
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
      rims: [kit.rim(group, kit.circleRim, 0.82)],
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
    const body = kit.body('shade-body', shade.parts);
    const eyeTone = kit.tone(PALETTE.threat, 1.3);
    group.add(body);
    kit.scene.add(group);
    return kit.view(kind, group, {
      body,
      eyeTone,
      phased: false,
      accents: [eyeTone],
      rims: [kit.rim(group, shade.rim)],
      glows: [kit.glow(group, eyeTone, shade.eyeSize, shade.eye)],
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

  // A segmented pod leaning teal, its dark maw forward; the belly window in
  // the socket on its back is its own emissive material, the maw's lips the
  // accent.
  function createLeech(kind) {
    const group = new THREE.Group();
    const teal = kit.tones.hull
      .clone()
      .lerp(colorOf(THREE, PALETTE.player), LEECH_TEAL_MIX);
    const body = kit.body('leech-body', () => heavy.leechBody(teal));
    const lime = colorOf(THREE, PALETTE.status);
    const bellyMaterial = kit.emissive(PALETTE.xp, LEECH_BELLY_GAIN[0]);
    bellyMaterial.userData.base.lerp(lime, LEECH_BELLY_LIME);
    kit.setGain(bellyMaterial, LEECH_BELLY_GAIN[0]);
    const belly = new THREE.Mesh(kit.smallSphere, bellyMaterial);
    belly.position.copy(heavy.leechBelly);
    const lipsTone = kit.tone(PALETTE.threat, 1.2);
    group.add(body, belly);
    kit.scene.add(group);
    return kit.view(kind, group, {
      belly,
      bellyMaterial,
      accents: [lipsTone],
      rims: [kit.rim(group, heavy.outline(body.geometry, 0))],
      glows: [kit.glow(group, lipsTone, 0.1, heavy.leechMaw)],
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
    view.belly.scale.set(0.28 * swell, 0.1 * swell, 0.24 * swell);
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
