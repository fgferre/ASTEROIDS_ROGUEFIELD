// Machine views drawn by hand: the Wardens' machines — Seeker (hunter),
// Tether (mine), Husk, Ram, Weaver, Bulwark, Caster, Shade and Leech: their
// views (shapes from lightMachines.js), outlines and eyes, and what each
// lights or moves per frame (the Ram's charge, the Caster's landing marks,
// the Shade's phasing, the Leech's belly, the Weaver's rotor, the Bulwark's
// plate). The hard-surface ones (Caster, Tether, Leech below; Husk, Weaver,
// Bulwark in heavyMachines.js) are recipe looks (recipes.js) as data with
// their moving parts added here. An enemy's content
// file picks one by name (`view`); a new enemy is built from its `visual`
// instead (recipes.js).

import { PALETTE } from '../../../data/constants/palette.js';
import {
  CASTER_SHELL_APEX,
  CASTER_SHELL_RADIUS,
} from '../../../content/enemies/caster.js';
import { getContent } from '../../../content/registry.js';
import { createSeededRandom } from '../asteroidMesh.js';
import { HALF_H, HALF_W, colorOf } from '../batches.js';
import { rimLoop } from '../rimBatch.js';
import { BULWARK_LOOK, HUSK_LOOK, WEAVER_LOOK } from './heavyMachines.js';
import { ramModel, seekerModel, shadeModel } from './lightMachines.js';
import { drum, gon, turned } from './shapes.js';

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
// proposta 18/10: the Leech — its belly's colour (gold → lime) and glow
// (empty → full), how much the belly swells when full, and the full pulse
// (rad/s, gain, swell).
const LEECH_BELLY_LIME = 0.55;
const LEECH_BELLY_GAIN = [0.5, 1.05];
const LEECH_BELLY_SWELL = 0.25;
const LEECH_PULSE_RATE = 6;
const LEECH_PULSE_GAIN = 0.25;
const LEECH_PULSE_SWELL = 0.08;
// the Leech's belly window: its size (radii) empty, and where it sits
const LEECH_BELLY = [0.31, 0.03, 0.31];
const LEECH_BELLY_AT = [-0.38, 0.25, 0];

// Caster: a squat mortar platform — a dark octagonal base on four braced
// outriggers with foot pads, a steel deck, a hull turret block between the
// trunnion cheeks and a short thick barrel tilted up at the nose, banded,
// its breech behind and an ammo drum each side. The muzzle is the light:
// the charging shell glows in its mouth.
const CASTER_PIVOT = [0.04, 0.3];
const CASTER_TILT = 0.7;
const casterAlong = (d) => [
  CASTER_PIVOT[0] + Math.cos(CASTER_TILT) * d,
  CASTER_PIVOT[1] + Math.sin(CASTER_TILT) * d,
  0,
];
const CASTER_LEG = [
  [0.3, 0.08],
  [0.84, 0.1],
  [0.92, 0.05],
  [0.92, -0.05],
  [0.84, -0.1],
  [0.3, -0.08],
];
const CASTER_LEGS = [1, 3, 5, 7].map((k) => (k * Math.PI) / 4);
const barrel = (d, part) => ({
  shape: 'drum',
  axis: 'x',
  sides: 8,
  at: casterAlong(d),
  rotate: [0, 0, CASTER_TILT],
  ...part,
});
const CASTER_LOOK = Object.freeze({
  scale: 1.1,
  finish: 'panel',
  parts: [
    {
      shape: 'slab',
      outline: gon(8, 0.6, Math.PI / 8),
      bottom: -0.22,
      top: -0.08,
      material: 'trim',
    },
    ...CASTER_LEGS.flatMap((a) => [
      {
        shape: 'slab',
        outline: turned(CASTER_LEG, a),
        bottom: -0.2,
        top: -0.1,
        bevel: 0.02,
      },
      {
        shape: 'drum',
        sides: 6,
        size: [0.12, 0.05, 0.12],
        at: [Math.cos(a) * 0.86, -0.2, -Math.sin(a) * 0.86],
        material: 'trim',
      },
    ]),
    {
      shape: 'slab',
      outline: gon(8, 0.44),
      bottom: -0.1,
      top: 0.04,
      material: 'steel',
    },
    {
      shape: 'slab',
      outline: [
        [0.3, 0],
        [0.22, 0.22],
        [-0.2, 0.26],
        [-0.34, 0.14],
        [-0.34, -0.14],
        [-0.2, -0.26],
        [0.22, -0.22],
      ],
      bottom: 0.02,
      top: 0.2,
    },
    {
      shape: 'box',
      size: [0.1, 0.09, 0.025],
      at: [CASTER_PIVOT[0], 0.27, 0.17],
      mirror: true,
      material: 'trim',
    },
    {
      shape: 'drum',
      axis: 'z',
      sides: 8,
      size: [0.07, 0.07, 0.2],
      at: [CASTER_PIVOT[0], CASTER_PIVOT[1], 0],
      material: 'steel',
    },
    barrel(0.17, { size: [0.32, 0.15, 0.15], material: 'steel' }),
    barrel(0.02, { size: [0.035, 0.175, 0.175], material: 'trim' }),
    barrel(0.42, { size: [0.04, 0.175, 0.175], material: 'trim' }),
    barrel(-0.18, { shape: 'box', size: [0.06, 0.12, 0.12], material: 'trim' }),
    barrel(0.485, { size: [0.01, 0.115, 0.115], material: 'soot' }),
    {
      shape: 'drum',
      sides: 8,
      size: [0.1, 0.06, 0.1],
      at: [-0.22, 0.26, 0.13],
      mirror: true,
      material: 'trim',
    },
  ],
  lights: [
    {
      at: casterAlong(0.48),
      dir: [Math.cos(CASTER_TILT), Math.sin(CASTER_TILT), 0],
      size: 0.12,
      housing: false,
      pulse: 'telegraphRatio',
    },
  ],
});

// Tether (the Mine): a faceted octagonal core — a dark belt between hull
// plates top and bottom, a steel crown — with six short diamond prongs
// collared round its waist; the trigger light in a socket on top. Armed, a
// ring runs through the prong tips.
const MINE_PRONGS = Array.from({ length: 6 }, (_, i) => (i * TAU) / 6);
const MINE_REACH = 0.95;
const MINE_LOOK = Object.freeze({
  finish: 'panel',
  parts: [
    {
      shape: 'slab',
      outline: gon(8, 0.5, Math.PI / 8),
      bottom: -0.1,
      top: 0.1,
      material: 'trim',
    },
    {
      shape: 'slab',
      outline: gon(8, 0.44),
      bottom: 0.06,
      top: 0.2,
      bevel: 0.04,
    },
    {
      shape: 'slab',
      outline: gon(8, 0.42),
      bottom: -0.2,
      top: -0.06,
      bevel: 0.04,
    },
    {
      shape: 'slab',
      outline: gon(8, 0.26, Math.PI / 8),
      bottom: 0.18,
      top: 0.27,
      material: 'steel',
    },
    ...MINE_PRONGS.flatMap((a) => [
      {
        shape: 'drum',
        axis: 'x',
        sides: 4,
        taper: 0.15,
        size: [0.24, 0.13, 0.13],
        at: [Math.cos(a) * 0.71, 0, -Math.sin(a) * 0.71],
        rotate: [0, a, 0],
        material: 'steel',
      },
      {
        shape: 'drum',
        axis: 'x',
        sides: 6,
        size: [0.04, 0.13, 0.13],
        at: [Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5],
        rotate: [0, a, 0],
        material: 'trim',
      },
    ]),
  ],
  lights: [{ at: [0, 0.27, 0], dir: [0, 1, 0], size: 0.14 }],
});

// Leech: a tick of a machine — a fat octagonal tank, belted, a steel cap astern,
// its whole back a sooty well where the belly window glows with what it has
// drained; a thin neck, a head round the lit intake, and two big steel
// dark-tipped pincers closing a ring in front of it.
const LEECH_TANK_X = -0.38;
const LEECH_PINCER_TIP = [
  [1, 0.12],
  [0.98, 0.3],
  [0.84, 0.26],
  [0.88, 0.14],
];
const LEECH_LOOK = Object.freeze({
  finish: 'panel',
  parts: [
    {
      shape: 'slab',
      outline: gon(8, 0.58, Math.PI / 8),
      bottom: -0.2,
      top: 0.2,
      bevel: 0.06,
      at: [LEECH_TANK_X, 0, 0],
    },
    {
      shape: 'slab',
      outline: gon(8, 0.62),
      bottom: -0.07,
      top: 0.07,
      at: [LEECH_TANK_X, 0, 0],
      material: 'trim',
    },
    {
      shape: 'slab',
      outline: gon(8, 0.45, Math.PI / 8),
      bottom: 0.18,
      top: 0.225,
      at: [LEECH_TANK_X, 0, 0],
      material: 'soot',
    },
    {
      shape: 'slab',
      outline: [
        [-0.44, 0.2],
        [-0.6, 0.12],
        [-0.6, -0.12],
        [-0.44, -0.2],
      ],
      bottom: -0.1,
      top: 0.24,
      at: [LEECH_TANK_X, 0, 0],
      material: 'steel',
    },
    {
      shape: 'slab',
      outline: [
        [0.26, 0.15],
        [0.06, 0.24],
        [0.06, -0.24],
        [0.26, -0.15],
      ],
      bottom: -0.12,
      top: 0.12,
      material: 'trim',
    },
    {
      shape: 'slab',
      outline: [
        [0.46, 0.1],
        [0.4, 0.22],
        [0.22, 0.22],
        [0.16, 0.12],
        [0.16, -0.12],
        [0.22, -0.22],
        [0.4, -0.22],
        [0.46, -0.1],
      ],
      bottom: -0.14,
      top: 0.2,
      bevel: 0.04,
    },
    {
      shape: 'slab',
      outline: [
        ...LEECH_PINCER_TIP.slice(0, 2),
        [0.74, 0.5],
        [0.42, 0.52],
        [0.2, 0.38],
        [0.2, 0.16],
        [0.4, 0.16],
        [0.4, 0.26],
        [0.5, 0.34],
        [0.68, 0.34],
        ...LEECH_PINCER_TIP.slice(2),
      ],
      bottom: -0.12,
      top: 0.12,
      bevel: 0.03,
      mirror: true,
      material: 'steel',
    },
    {
      shape: 'slab',
      outline: LEECH_PINCER_TIP,
      bottom: -0.14,
      top: 0.16,
      mirror: true,
      material: 'trim',
    },
  ],
  lights: [
    { at: [0.47, 0.08, 0], dir: [1, 0.5, 0], size: 0.16, housing: false },
  ],
});

/**
 * Machine views.
 * @param {object} kit - the mirror's toolkit (enemyMirror.js createKit), never
 *   the mirror itself.
 */
export function createMachineViews(kit, recipeViews) {
  const { THREE } = kit;
  // The light machines' hulls, eyes and outlines (lightMachines.js).
  const seeker = seekerModel(kit);

  const ram = ramModel(kit);
  const shade = shadeModel(kit);

  // The hard-surface looks, and the Leech's belly window.
  const huskLook = recipeViews.lookOf(HUSK_LOOK);
  const weaverLook = recipeViews.lookOf(WEAVER_LOOK);
  const bulwarkLook = recipeViews.lookOf(BULWARK_LOOK);
  const casterLook = recipeViews.lookOf(CASTER_LOOK);
  const mineLook = recipeViews.lookOf(MINE_LOOK);
  const leechLook = recipeViews.lookOf(LEECH_LOOK);
  const bellyGeometry = drum(THREE, 1, 2, 8).rotateY(Math.PI / 8);

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
    const view = mineLook.create(kind);
    const triggerTone = view.lights[0].tone;
    kit.setGain(triggerTone, 0.6);
    // armed, a ring through the prong tips: a rim in its own (pulsing
    // accent) colour, turning with the body
    const tips = MINE_PRONGS.map(
      (a) =>
        new THREE.Vector3(
          Math.cos(a) * MINE_REACH,
          0,
          -Math.sin(a) * MINE_REACH
        )
    );
    const arcTone = kit.tone(PALETTE.threat, 1.1);
    const arc = kit.rim(view.body, rimLoop(tips), 1, arcTone.color);
    view.rims.push(arc);
    view.accents.push(arcTone);
    return Object.assign(view, { triggerTone, arc, arcTone });
  }

  // The wreck drifts at its seed's own turn, never toward its heading.
  function createHusk(kind) {
    return huskLook.create(kind);
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

  // The rotor turns as one body; laying flushes the lay strips on its arms
  // (its glowing parts) and lights the emitters at their tips (its lights).
  function createWeaver(kind) {
    return weaverLook.create(kind);
  }

  // The hull and the plate braced to it turn together to the player; the
  // plate is the shield (kit.frontalPlate, the arc its recipe's frontal
  // shield hits within, so plate and hit area agree) and its lit edge.
  function createBulwark(kind) {
    const view = bulwarkLook.create(kind);
    const arc = getContent('enemies', kind).behaviors['frontal-shield'].halfArc;
    const geometries = kit.frontalPlate(arc);
    const plateMesh = new THREE.Mesh(geometries.plate, kit.machineMaterial);
    const edgeMaterial = kit.emissive(PALETTE.threat, 1.2);
    const edge = new THREE.Mesh(geometries.edge, edgeMaterial);
    view.body.add(plateMesh, edge);
    view.accents.push(edgeMaterial);
    return Object.assign(view, { plateMesh, edge, edgeMaterial });
  }

  function createCaster(kind) {
    const view = casterLook.create(kind);
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
    view.accents.push(shellMaterial);
    return Object.assign(view, { telegraph });
  }

  // `telegraphRatio` lights the muzzle (its recipe light) and grows the aim
  // ring; in flight the blast ring holds, an inner ring closes on the
  // landing and the shell rises to CASTER_SHELL_APEX and falls; nothing
  // stays after the landing.
  function updateCaster(view, caster, time) {
    casterLook.update(view, caster, time);
    const charge = clamp01(caster.telegraphRatio || 0);
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

  // The lit intake (its recipe light) is the accent; the belly window on
  // the tank is its own emissive material.
  function createLeech(kind) {
    const view = leechLook.create(kind);
    const lime = colorOf(THREE, PALETTE.status);
    const bellyMaterial = kit.emissive(PALETTE.xp, LEECH_BELLY_GAIN[0]);
    bellyMaterial.userData.base.lerp(lime, LEECH_BELLY_LIME);
    kit.setGain(bellyMaterial, LEECH_BELLY_GAIN[0]);
    const belly = new THREE.Mesh(bellyGeometry, bellyMaterial);
    belly.position.fromArray(LEECH_BELLY_AT);
    view.body.add(belly);
    return Object.assign(view, { belly, bellyMaterial });
  }

  // `fullness` lights and swells the belly; `full` pulses it.
  function updateLeech(view, leech, time) {
    leechLook.update(view, leech, time);
    const fullness = clamp01(leech.fullness || 0);
    const pulse = leech.full
      ? 0.5 + 0.5 * Math.sin(time * LEECH_PULSE_RATE + (view.seed % 7))
      : 0;
    const [dim, lit] = LEECH_BELLY_GAIN;
    const gain = dim + (lit - dim) * fullness + LEECH_PULSE_GAIN * pulse;
    kit.setGain(view.bellyMaterial, gain);
    const swell = 1 + LEECH_BELLY_SWELL * fullness + LEECH_PULSE_SWELL * pulse;
    view.belly.scale.fromArray(LEECH_BELLY).multiplyScalar(swell);
  }

  // The Husk's turn comes from its seed.
  function bindHusk(view) {
    const random = createSeededRandom((view.seed % 100000) + 1);
    view.body.rotation.y = random() * TAU;
  }

  // What each look lights or moves per frame, after the pose, the Elite look
  // and the affixes every machine shares (EnemyMirror.updateMachine).
  function updateSeeker(view, enemy) {
    kit.setGain(view.lensTone, 0.5 + 1.3 * (enemy.telegraphRatio || 0));
  }

  function updateTether(view, enemy, time) {
    mineLook.update(view, enemy, time);
    const armed = Boolean(enemy.armed);
    const pulse = 0.5 + 0.5 * Math.sin(time * 9 + (view.seed % 7));
    kit.setGain(view.triggerTone, armed ? 1.1 + 0.6 * pulse : 0.6);
    view.arc.anchor.visible = armed;
    kit.setGain(view.arcTone, 1.1 + 0.6 * pulse);
    view.body.rotation.y = time * (armed ? 2.4 : 0.8);
  }

  function updateHusk(view, enemy, time) {
    view.object.rotation.y = 0;
    huskLook.update(view, enemy, time);
  }

  function updateRam(view, enemy) {
    const charge = clamp01(enemy.telegraphRatio || 0);
    kit.setGain(view.lensTone, 0.4 + 1.8 * charge);
    view.lens.scale.setScalar(0.12 * (1 + 0.8 * charge));
    view.core.visible = charge > 0.5;
    kit.setGain(view.coreTone, (charge - 0.5) * 2.4);
    kit.updateTelegraph(view.telegraph, enemy, enemy.radius || 14);
  }

  function updateWeaver(view, enemy, time) {
    weaverLook.update(view, enemy, time);
    view.object.rotation.y = 0;
    view.body.rotation.y = -(enemy.spin || 0);
    const lay = clamp01(enemy.layGlow || 0);
    for (let i = 0; i < view.glowMaterials.length; i += 1) {
      kit.setGain(view.glowMaterials[i], 0.3 + 2 * lay);
    }
  }

  function updateShade(view, enemy) {
    phaseShade(view, 1 - clamp01(enemy.visibility ?? 1));
  }

  function updateBulwark(view, enemy, time) {
    bulwarkLook.update(view, enemy, time);
    view.object.rotation.y = -(enemy.facing || 0);
    const broken = Boolean(enemy.shieldBroken);
    view.plateMesh.material = broken ? kit.darkMaterial : kit.machineMaterial;
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
