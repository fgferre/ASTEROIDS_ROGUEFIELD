import { PALETTE } from '../../../../data/constants/palette.js';
import { SENTINEL_KINDS } from '../../../../data/enemies/boss.js';
import { colorOf } from '../../batches.js';
import { addRimLight } from '../../rimLight.js';
import { arcSweep, revolve } from '../shapes.js';
import {
  CORE_COLD,
  CORE_HOT,
  CORE_BEAT,
  CORE_FLASH,
  clamp01,
  range,
} from './kit.js';

const TAU = Math.PI * 2;
// Its own panel maps, finer than the other Sentinels' (panels per radius).
const SOV_MAP_SEED = 0x50e7;
const SOV_PANEL_TILE = 3.2;
// The outline round it (radii): the halo reaches past the others' 1.2.
const SOV_RIM = 1.3;
const SHELLS = 8;
// proposta 12/11: how far an open shell slides out (radii) and leans out
// about its foot (rad).
const SHELL_SLIDE = 0.08;
const SHELL_TILT = 1.0;
// The egg (radii): its waist, height and how much the top narrows.
const EGG_R = 0.6;
const EGG_Y = 0.1;
const EGG_H = 0.68;
const EGG_POINT = 0.12;
// How far up the egg (0..1) the shells reach: all but a pinhole at the tip.
const SHELL_TOP = 0.998;
// The order lamps: jewels round the collar.
const LAMP_R = 0.665;
const LAMP_Y = 0.137;
const LAMP_COUNT = 40;
// proposta 12/11: the lamps' gain per order (lime blooms far more than amber).
const LAMP_GAIN = { protect: 0.6, rebuild: 1.0 };
// proposta 12/11: the halos' lean when open (rad) and how fast they settle
// into it (1/s).
const HALO_TILT = [0.22, 0.16];
const HALO_EASE = 3;
// proposta 12/11: the shell's lacquer and the halos' polish.
const SHELL_ROUGH = 0.45;
const SHELL_ENV = 1.3;
const METAL_ROUGH = 0.45;
const METAL_ENV = 1.2;

// A point of the egg's outer face, `t` of the way from its waist to its tip,
// pushed out by `d` (radii).
const egg = (t, d = 0) => {
  const r = EGG_R * Math.sqrt(Math.max(0, 1 - t * t)) * (1 - EGG_POINT * t);
  // the face's normal, near enough: out from the waist's centre
  const ny = (t * EGG_R) / EGG_H;
  const n = Math.hypot(1, ny);
  return [r + d / n, EGG_Y + EGG_H * t + (d * ny) / n];
};
// A band of the egg's face, `t0` to `t1`, between depth `d0` and `d1` (out
// positive), as a closed section (r, y, … flat).
const band = (t0, t1, d0, d1, steps = 1) => {
  const ts = range(t0, t1, steps + 1);
  const outer = ts.map((t) => egg(t, d1));
  const inner = ts.map((t) => egg(t, d0)).reverse();
  return [...outer, ...inner].flat();
};

export function createSovereign(sk) {
  const {
    THREE,
    kit,
    hullMaterial,
    ivory,
    bone,
    gold,
    bronze,
    soot,
    box,
    drum,
    merge,
  } = sk;
  // Sovereign, Continuance's seat: a pale lacquered egg standing in a gold
  // collar, ringed by two polished halos that float round it. The egg's upper
  // face is eight shells (an inlaid rib down each, two bands across, a band
  // at its foot, a dark ribbed lining); inside, on a gold cradle, the core.
  // The halos turn with boss.plateTurn, the inner one with the shells, the
  // outer against them. PROTECT (boss.plateOpen 0): sealed, the shells meet
  // at the tip, the halos level. REBUILD: the shells lean out on their feet
  // like petals, the halos tip (the inner toward the ship,
  // boss.facing, the outer away) and the core lies open. Both orders: a shell
  // opens on the REBUILD half only (boss.splitAngle) and both halos tip up on
  // that half. The one light that speaks is the ring of jewels on the collar:
  // cool (the shielded colour) under PROTECT, warm under REBUILD, split by
  // the line under both; the core burns as it is exposed. Four telegraphs
  // under one group: the wall, the cone, the lanes and the split.
  const SOV = SENTINEL_KINDS.sovereign;
  // the lacquered shell, and polished metal for the halos and the cradle
  const shellMaterial = hullMaterial(SOV_MAP_SEED, SOV_PANEL_TILE);
  Object.assign(shellMaterial, {
    roughness: SHELL_ROUGH,
    metalness: 0.05,
    envMapIntensity: SHELL_ENV,
  });
  const metalMaterial = addRimLight(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.9,
      roughness: METAL_ROUGH,
      envMapIntensity: METAL_ENV,
      flatShading: true,
    })
  );
  // Turned and swept parts carry no uv: the panel maps go on from above,
  // leaning with the height so walls get their share.
  function mapped(geometry) {
    const position = geometry.getAttribute('position');
    const uv = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i);
      uv[i * 2] = position.getX(i) + 0.6 * y;
      uv[i * 2 + 1] = position.getZ(i) - 0.6 * y;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geometry;
  }
  const sweep = (section, steps, from = 0, span = TAU) =>
    mapped(arcSweep(THREE, section, steps, { from, span }));
  const turned = (profile, segments) =>
    mapped(revolve(THREE, profile, segments));
  const around = (n, turn = 0) =>
    Array.from({ length: n }, (_, i) => turn + (i * TAU) / n);
  // a part `r` out at angle `a`, turned to face out
  const at = (geometry, color, a, r, y) => ({
    geometry,
    color,
    position: [Math.cos(a) * r, y, Math.sin(a) * r],
    rotationY: -a,
  });

  // The lacquered body: the egg's lower half, a groove round it, the collar
  // at its waist with studs under it, the dark well inside.
  const body = merge([
    {
      geometry: turned(
        [
          0.6, 0.1, 0.59, 0.0, 0.55, -0.1, 0.48, -0.2, 0.38, -0.29, 0.25, -0.35,
          0.11, -0.385, 0, -0.39,
        ],
        24
      ),
      color: ivory,
    },
    {
      geometry: sweep([0.6, -0.13, 0.64, -0.14, 0.62, -0.07, 0.585, -0.06], 48),
      color: bone,
    },
    ...around(24, TAU / 48).map((a) =>
      at(box(0.04, 0.05, 0.035), bone, a, 0.66, 0.02)
    ),
    { geometry: drum(0.56, 0.02, 24), color: soot, position: [0, 0.07, 0] },
  ]);
  // The polished trim: a gold lip on the collar, the cradle's ring and six
  // claws curling up round the core.
  const claw = [
    0.42, 0.07, 0.42, 0.2, 0.36, 0.31, 0.28, 0.38, 0.255, 0.36, 0.33, 0.29,
    0.39, 0.19, 0.39, 0.07,
  ];
  const trim = merge([
    {
      geometry: sweep(
        [0.54, 0.05, 0.7, 0.055, 0.725, 0.09, 0.705, 0.135, 0.56, 0.135],
        48
      ),
      color: gold,
    },
    {
      geometry: sweep([0.715, 0.08, 0.745, 0.085, 0.74, 0.115, 0.71, 0.12], 48),
      color: gold,
    },
    {
      geometry: sweep([0.12, 0.07, 0.22, 0.07, 0.2, 0.12, 0.13, 0.12], 12),
      color: gold,
    },
    ...around(6).map((a) => ({
      geometry: sweep(claw, 1, a - 0.04, 0.08),
      color: gold,
    })),
    ...around(6, TAU / 12).map((a) =>
      at(box(0.1, 0.02, 0.02), bronze, a, 0.3, 0.08)
    ),
  ]);

  // One shell, centred on +x, about its foot (the hinge): the lacquered
  // face, an inlaid rib down its middle, a band at its foot with three
  // studs, and its lining in three dark ribbed strips.
  const HALF = Math.PI / SHELLS - 0.018;
  const shell = merge([
    {
      geometry: sweep(band(0, SHELL_TOP, -0.03, 0, 9), 3, -HALF, 2 * HALF),
      color: ivory,
    },
    {
      geometry: sweep(band(0.08, 0.92, 0, 0.012, 7), 1, -0.025, 0.05),
      color: bone,
    },
    ...[
      [0.4, 0.43],
      [0.7, 0.72],
    ].map(([t0, t1]) => ({
      geometry: sweep(band(t0, t1, 0, 0.008), 3, -HALF + 0.01, 2 * HALF - 0.02),
      color: bone,
    })),
    {
      geometry: sweep(band(0, 0.07, 0, 0.01), 3, -HALF + 0.01, 2 * HALF - 0.02),
      color: bone,
    },
    ...[-0.22, 0, 0.22].map((f) => {
      const [r, y] = egg(0.035, 0.012);
      return at(box(0.022, 0.025, 0.022), bone, f, r, y);
    }),
    ...[-1, 0, 1].map((k) => ({
      geometry: sweep(
        band(0.04, 0.93, -0.05, -0.029, 7),
        1,
        k * ((2 * HALF) / 3) - HALF / 3 + 0.012,
        (2 * HALF) / 3 - 0.024
      ),
      color: soot,
    })),
  ]);
  const [HINGE_R, HINGE_Y] = egg(0);
  shell.translate(-HINGE_R, -HINGE_Y, 0);
  // The halos: a polished ring each, the inner with notches, the outer
  // wider, an inlaid line round it, tabs on it and eight keys out from it.
  const innerHalo = merge([
    {
      geometry: sweep(
        [
          0.8, -0.09, 0.88, -0.09, 0.895, -0.065, 0.875, -0.04, 0.815, -0.04,
          0.795, -0.065,
        ],
        64
      ),
      color: gold,
    },
    ...around(16).map((a) =>
      at(box(0.05, 0.015, 0.018), bronze, a, 0.84, -0.035)
    ),
  ]);
  const outerHalo = merge([
    {
      geometry: sweep(
        [
          1.0, -0.19, 1.1, -0.19, 1.115, -0.16, 1.1, -0.13, 1.0, -0.13, 0.985,
          -0.16,
        ],
        72
      ),
      color: gold,
    },
    {
      geometry: sweep(
        [1.035, -0.13, 1.065, -0.13, 1.06, -0.118, 1.04, -0.118],
        72
      ),
      color: bronze,
    },
    ...around(32, TAU / 64).map((a) =>
      at(box(0.025, 0.012, 0.03), bronze, a, 1.012, -0.126)
    ),
    ...around(8).map((a) => ({
      geometry: sweep(
        [1.1, -0.185, 1.17, -0.175, 1.18, -0.16, 1.17, -0.145, 1.1, -0.135],
        2,
        a - 0.05,
        0.1
      ),
      color: gold,
    })),
  ]);

  // The jewels: one geometry, a colour per jewel written each frame.
  const lampAngles = around(LAMP_COUNT, TAU / (2 * LAMP_COUNT));
  const lampGeometry = merge(
    lampAngles.map((a) =>
      at(box(0.022, 0.012, 0.048), new THREE.Color(1, 1, 1), a, LAMP_R, LAMP_Y)
    )
  );
  const LAMP_VERTS = 36; // a box, non-indexed
  const core = new THREE.IcosahedronGeometry(0.19, 1);
  core.scale(1, 1.32, 1);
  const protect = colorOf(THREE, PALETTE.status).multiplyScalar(
    LAMP_GAIN.protect
  );
  const rebuild = colorOf(THREE, PALETTE.shot).multiplyScalar(
    LAMP_GAIN.rebuild
  );

  // A halo on its gimbal: the tip (a quaternion) over the turn.
  function halo(group, geometry) {
    const tip = new THREE.Group();
    const mesh = new THREE.Mesh(geometry, metalMaterial);
    tip.add(mesh);
    group.add(tip);
    return { tip, mesh, x: 0, z: 0 };
  }

  function create(kind) {
    const group = new THREE.Group();
    group.add(
      new THREE.Mesh(body, shellMaterial),
      new THREE.Mesh(trim, metalMaterial)
    );
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, '#14100a'),
      emissive: colorOf(THREE, PALETTE.shot),
      emissiveIntensity: CORE_COLD,
      roughness: 0.3,
      metalness: 0.2,
      flatShading: true,
    });
    const heart = new THREE.Mesh(core, coreMaterial);
    heart.position.set(0, 0.25, 0);
    group.add(heart);
    const lamps = new THREE.Mesh(
      lampGeometry.clone(),
      new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
    );
    group.add(lamps);
    const ring = new THREE.Group();
    const plates = Array.from({ length: SHELLS }, (_, i) => {
      const angle = (i * TAU) / SHELLS;
      const pivot = new THREE.Group();
      pivot.rotation.y = -angle;
      const hinge = new THREE.Group();
      const tilt = new THREE.Group();
      tilt.position.set(HINGE_R, HINGE_Y, 0);
      tilt.add(new THREE.Mesh(shell, shellMaterial));
      hinge.add(tilt);
      pivot.add(hinge);
      ring.add(pivot);
      return { hinge, tilt, angle };
    });
    group.add(ring);
    const halos = [halo(group, innerHalo), halo(group, outerHalo)];
    kit.scene.add(group);
    const wall = kit.createTelegraph(4);
    const cone = kit.createTelegraph(0);
    const lanes = kit.createTelegraph(SOV.lanes.count);
    const split = kit.createTelegraph(1, 2);
    const telegraphs = new THREE.Group();
    telegraphs.add(wall.group, cone.group, lanes.group, split.group);
    kit.scene.add(telegraphs);
    return {
      kind,
      object: group,
      heart,
      ring,
      plates,
      halos,
      lamps,
      axis: new THREE.Vector3(),
      last: null,
      coreMaterial,
      rims: [kit.rim(group, kit.circleRim, SOV_RIM)],
      rimColor: kit.rimColors.boss,
      glows: [],
      telegraph: { group: telegraphs, wall, cone, lanes, split },
      id: null,
    };
  }

  // A halo tips `lean` rad up on the side at field angle `toward`, eased
  // there (its only state: the smoothing), and turns `spin`.
  function tipHalo(view, h, lean, toward, spin, ease) {
    h.x += (lean * Math.cos(toward) - h.x) * ease;
    h.z += (lean * Math.sin(toward) - h.z) * ease;
    const amount = Math.hypot(h.x, h.z);
    if (amount > 1e-5) {
      view.axis.set(-h.z / amount, 0, h.x / amount);
      h.tip.quaternion.setFromAxisAngle(view.axis, amount);
    } else h.tip.quaternion.set(0, 0, 0, 1);
    h.mesh.rotation.y = spin;
  }

  function update(view, boss, time) {
    const radius = boss.radius || SOV.radius;
    view.object.scale.setScalar(radius);
    view.object.rotation.y = 0;
    const turn = boss.plateTurn ?? 0;
    const split = boss.splitAngle ?? 0;
    view.ring.rotation.y = -turn;
    view.heart.rotation.y = time * 0.4;
    const open = clamp01(boss.plateOpen ?? 0);
    const order = boss.order ?? 'protect';
    const both = order === 'both';
    for (const p of view.plates) {
      // with both orders, a shell opens on the REBUILD half only
      const half = both
        ? clamp01(0.5 + 2 * Math.sin(turn + p.angle - split))
        : 1;
      const amount = open * half;
      p.hinge.position.x = SHELL_SLIDE * amount;
      p.tilt.rotation.z = -SHELL_TILT * amount;
    }
    // the halos: level when sealed; open, the inner tips toward the ship and
    // the outer away, or both up on the REBUILD half
    const dt =
      view.last === null ? 1 : Math.min(0.1, Math.max(0, time - view.last));
    view.last = time;
    const ease = 1 - Math.exp(-HALO_EASE * dt);
    const facing = boss.facing ?? 0;
    const toward = both ? split + Math.PI / 2 : facing;
    view.halos.forEach((h, i) => {
      const away = !both && i === 1 ? Math.PI : 0;
      tipHalo(
        view,
        h,
        HALO_TILT[i] * open,
        toward + away,
        i ? turn : -turn,
        ease
      );
    });
    // each jewel by its half: warm on REBUILD's, cool on PROTECT's
    const colors = view.lamps.geometry.getAttribute('color');
    const array = colors.array;
    for (let i = 0; i < lampAngles.length; i += 1) {
      const w = both
        ? clamp01(0.5 + 4 * Math.sin(lampAngles[i] - split))
        : order === 'rebuild'
          ? 1
          : 0;
      const r = protect.r + (rebuild.r - protect.r) * w;
      const g = protect.g + (rebuild.g - protect.g) * w;
      const b = protect.b + (rebuild.b - protect.b) * w;
      for (let v = i * LAMP_VERTS; v < (i + 1) * LAMP_VERTS; v += 1) {
        array[v * 3] = r;
        array[v * 3 + 1] = g;
        array[v * 3 + 2] = b;
      }
    }
    colors.needsUpdate = true;
    view.coreMaterial.emissiveIntensity =
      CORE_COLD +
      open * (CORE_HOT + 0.3 * Math.sin(time * CORE_BEAT)) +
      boss.getHitFlash() * CORE_FLASH * (0.2 + open);
    const { wall, cone, lanes, split: line } = view.telegraph;
    kit.updateTelegraph(wall, { telegraph: boss.barrier }, radius);
    kit.updateTelegraph(cone, boss, radius);
    kit.updateTelegraph(lanes, { telegraph: boss.beams }, radius);
    kit.updateTelegraph(line, { telegraph: boss.split }, radius);
  }

  return { kind: 'boss-sovereign', create, update };
}
