import { PALETTE } from '../../../../data/constants/palette.js';
import { SENTINEL_KINDS } from '../../../../data/enemies/boss.js';
import { colorOf } from '../../batches.js';
import { addRimLight } from '../../rimLight.js';
import { arcSweep, revolve } from '../shapes.js';
import { CORE_BEAT, CORE_FLASH, clamp01, range } from './kit.js';

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
// The core: a round brilliant cut in eights round a burning heart, held at
// its girdle by eight prongs. proposta 12/11: its girdle's radius and height,
// the table's radius and the window in it, the crown's and pavilion's heights, the girdle
// band, and half the seam between crown and pavilion where the heart shows.
const GEM_R = 0.21;
const GEM_Y = 0.3;
const GEM_TABLE = 0.115;
const GEM_WINDOW = 0.055;
const GEM_CROWN = 0.075;
const GEM_DEPTH = 0.18;
const GEM_BAND = 0.012;
const GEM_SEAM = 0.008;
// proposta 12/11: the facets' shades: table, stars, kites, upper girdle,
// girdle band, pavilion mains, lower girdle.
const GEM_SHADES = [
  '#ffd27a',
  '#f2a840',
  '#8a4a14',
  '#c87a28',
  '#6e3c10',
  '#5e300c',
  '#c07428',
];
// proposta 12/11: the gem's own heat and the heart's, sealed and open.
const GEM_HEAT = [0.04, 0.4];
const HEART_GAIN = [0.1, 1.1];
// The order lamps: jewels round the collar.
const LAMP_R = 0.665;
const LAMP_Y = 0.137;
const LAMP_COUNT = 40;
// proposta 12/11: the lamps' gain per order (lime blooms far more than amber).
const LAMP_GAIN = { protect: 0.6, rebuild: 1.0 };
// proposta 12/11: the halos' lean when open (rad) and how fast they settle
// into it (1/s).
const HALO_TILT = [0.3, 0.2];
// The halos' gaps: four in each, lined up when sealed; open, the outer
// halo's slip this far round (rad) and it turns against the inner.
const HALO_GAP = 0.3;
const HALO_SLIP = Math.PI / 4;
const HALO_EASE = 3;
// proposta 12/11: the shell's lacquer and the halos' polish.
const SHELL_ROUGH = 0.76;
const SHELL_ENV = 0.6;
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
    lacquer,
    box,
    drum,
    merge,
  } = sk;
  // proposta 12/11: the boss light over it, pale gold and dim, so the
  // lining stays dark against the shell
  const BOSS_LIGHT = new THREE.Color('#ffe2b0').multiplyScalar(0.4);
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
    { geometry: drum(0.56, 0.02, 24), color: lacquer, position: [0, 0.07, 0] },
  ]);
  // The polished trim: the gold collar and its lip, the cradle's ring and
  // eight prongs curling up to the gem's girdle.
  const claw = [
    0.42, 0.07, 0.42, 0.18, 0.34, 0.26, 0.245, 0.31, 0.225, 0.29, 0.31, 0.24,
    0.39, 0.17, 0.39, 0.07,
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
    ...around(8).map((a) => ({
      geometry: sweep(claw, 1, a - 0.035, 0.07),
      color: gold,
    })),
    ...around(8, TAU / 16).map((a) =>
      at(box(0.1, 0.02, 0.02), bronze, a, 0.3, 0.08)
    ),
  ]);

  // One shell, centred on +x, about its foot (the hinge): the lacquered
  // face, an inlaid rib down its middle crossed by two bands, a medallion
  // between them, a band at its foot with three studs, and its lining in
  // three dark ribbed strips.
  const HALF = Math.PI / SHELLS - 0.028;
  const shell = merge([
    {
      geometry: sweep(band(0, SHELL_TOP, -0.03, 0, 9), 3, -HALF, 2 * HALF),
      color: ivory,
    },
    {
      geometry: sweep(band(0.08, 0.92, 0, 0.012, 7), 1, -0.025, 0.05),
      color: bronze,
    },
    ...[
      [0.4, 0.43],
      [0.7, 0.72],
    ].map(([t0, t1]) => ({
      geometry: sweep(band(t0, t1, 0, 0.008), 3, -HALF + 0.01, 2 * HALF - 0.02),
      color: bronze,
    })),
    // a medallion on the rib between the bands, a tile either side of it
    {
      geometry: sweep(band(0.52, 0.6, 0, 0.018, 2), 2, -0.07, 0.14),
      color: gold,
    },
    ...[-1, 1].map((k) => ({
      geometry: sweep(band(0.53, 0.59, 0, 0.01), 1, k * 0.2 - 0.04, 0.08),
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
      color: lacquer,
    })),
  ]);
  const [HINGE_R, HINGE_Y] = egg(0);
  shell.translate(-HINGE_R, -HINGE_Y, 0);
  // The halos: polished rings broken in four, the inner with notches, the
  // outer wider, an inlaid line along it, tabs on it and a key either side
  // of each gap.
  const arcs = (gap) => around(4).map((a) => [a + gap / 2, Math.PI / 2 - gap]);
  const inGap = (a, gap) => {
    const off = ((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
    return off < gap / 2 + 0.06 || off > Math.PI / 2 - gap / 2 - 0.06;
  };
  const innerHalo = merge([
    ...arcs(HALO_GAP).map(([from, span]) => ({
      geometry: sweep(
        [
          0.8, -0.09, 0.88, -0.09, 0.895, -0.065, 0.875, -0.04, 0.815, -0.04,
          0.795, -0.065,
        ],
        16,
        from,
        span
      ),
      color: gold,
    })),
    ...around(24)
      .filter((a) => !inGap(a, HALO_GAP))
      .map((a) => at(box(0.05, 0.015, 0.018), bronze, a, 0.84, -0.035)),
  ]);
  const outerHalo = merge([
    ...arcs(HALO_GAP).flatMap(([from, span]) => [
      {
        geometry: sweep(
          [
            1.0, -0.19, 1.1, -0.19, 1.115, -0.16, 1.1, -0.13, 1.0, -0.13, 0.985,
            -0.16,
          ],
          18,
          from,
          span
        ),
        color: gold,
      },
      {
        geometry: sweep(
          [1.035, -0.13, 1.065, -0.13, 1.06, -0.118, 1.04, -0.118],
          18,
          from + 0.04,
          span - 0.08
        ),
        color: bronze,
      },
      ...[from, from + span - 0.1].map((a) => ({
        geometry: sweep(
          [1.1, -0.185, 1.17, -0.175, 1.18, -0.16, 1.17, -0.145, 1.1, -0.135],
          2,
          a,
          0.1
        ),
        color: gold,
      })),
    ]),
    ...around(40)
      .filter((a) => !inGap(a, HALO_GAP))
      .map((a) => at(box(0.025, 0.012, 0.03), bronze, a, 1.012, -0.126)),
  ]);

  // The jewels: one geometry, a colour per jewel written each frame.
  const lampAngles = around(LAMP_COUNT, TAU / (2 * LAMP_COUNT));
  const lampGeometry = merge(
    lampAngles.map((a) =>
      at(box(0.022, 0.012, 0.048), new THREE.Color(1, 1, 1), a, LAMP_R, LAMP_Y)
    )
  );
  const LAMP_VERTS = 36; // a box, non-indexed
  // The brilliant (about its girdle): an octagonal table with a window in
  // it, eight star facets, eight kite bezels and sixteen upper-girdle facets
  // on the crown, a thin girdle band, then the seam, and the pavilion's eight
  // long mains and sixteen lower-girdle facets down to the culet. The kites'
  // side points sit where each kite stays flat. Each kind of facet carries
  // its own shade of amber, so the cut reads at play size as well as close.
  function brilliant() {
    const ring = (n, r, y, turn = 0) =>
      around(n, turn).map((a) => [Math.cos(a) * r, y, Math.sin(a) * r]);
    const lean = Math.cos(Math.PI / 8);
    const base = GEM_SEAM + GEM_BAND;
    const top = base + GEM_CROWN;
    const culet = -GEM_SEAM - GEM_DEPTH;
    // proposta 12/11: the stars reach halfway down the crown, the lower
    // girdle facets two thirds of the way to the culet
    const starR = (GEM_TABLE + 0.5 * (GEM_R - GEM_TABLE)) / lean;
    const lowR = (0.35 * GEM_R) / lean;
    const table = ring(8, GEM_TABLE, top);
    const eye = ring(8, GEM_WINDOW, top);
    const stars = ring(8, starR, (top + base) / 2, Math.PI / 8);
    const band = ring(16, GEM_R, GEM_SEAM);
    const girdle = ring(16, GEM_R, base);
    const rim = ring(16, GEM_R, -GEM_SEAM);
    const lows = ring(8, lowR, culet + 0.35 * GEM_DEPTH, Math.PI / 8);
    const point = [0, culet, 0];
    const facets = GEM_SHADES.map((hex) => ({ color: hex, faces: [] }));
    const [flat, star, kite, upper, rimBand, main, lower] = facets;
    for (let k = 0; k < 8; k += 1) {
      const [j, k1, k0] = [2 * k, (k + 1) % 8, (k + 7) % 8];
      const [g0, g1, g2] = [j, j + 1, (j + 2) % 16];
      flat.faces.push(
        [table[k], table[k1], eye[k1]],
        [table[k], eye[k1], eye[k]]
      );
      star.faces.push([table[k], table[k1], stars[k]]);
      kite.faces.push(
        [table[k], stars[k0], girdle[g0]],
        [table[k], girdle[g0], stars[k]]
      );
      upper.faces.push(
        [stars[k], girdle[g0], girdle[g1]],
        [stars[k], girdle[g1], girdle[g2]]
      );
      main.faces.push([point, lows[k0], rim[g0]], [point, rim[g0], lows[k]]);
      lower.faces.push(
        [lows[k], rim[g0], rim[g1]],
        [lows[k], rim[g1], rim[g2]]
      );
    }
    for (let j = 0; j < 16; j += 1) {
      const j1 = (j + 1) % 16;
      rimBand.faces.push(
        [band[j], band[j1], girdle[j1]],
        [band[j], girdle[j1], girdle[j]]
      );
    }
    // each face wound to look out from the girdle's centre
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    return facets.map(({ color, faces }) => {
      const position = faces.flatMap(([p, q, r]) => {
        a.fromArray(p);
        b.fromArray(q).sub(a);
        c.fromArray(r).sub(a);
        a.set(p[0] + q[0] + r[0], p[1] + q[1] + r[1], p[2] + q[2] + r[2]);
        return b.cross(c).dot(a) < 0 ? [...p, ...r, ...q] : [...p, ...q, ...r];
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(position, 3)
      );
      geometry.computeVertexNormals();
      return {
        geometry: mapped(geometry),
        color: colorOf(THREE, color),
        position: [0, GEM_Y, 0],
      };
    });
  }
  const gem = merge(brilliant());
  // The heart fills the gem just inside it: a hot plate under the window
  // and a rim level with the seam.
  const heartGeometry = revolve(
    THREE,
    [
      0,
      GEM_SEAM + GEM_BAND + GEM_CROWN - 0.012,
      GEM_TABLE * 0.9,
      GEM_SEAM + GEM_BAND + GEM_CROWN - 0.012,
      GEM_R - 0.012,
      0,
      0,
      -GEM_SEAM - GEM_DEPTH + 0.03,
    ],
    16
  );
  const heartColor = colorOf(THREE, '#ffe0a8');
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
      vertexColors: true,
      emissive: colorOf(THREE, PALETTE.shot),
      emissiveIntensity: GEM_HEAT[0],
      // proposta 12/11: polished hard, so each facet catches its own light
      roughness: 0.12,
      metalness: 0.5,
      envMapIntensity: 2,
    });
    const heartMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
    const heart = new THREE.Mesh(heartGeometry, heartMaterial);
    heart.position.set(0, GEM_Y, 0);
    group.add(new THREE.Mesh(gem, coreMaterial), heart);
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
      // The scene's boss light in pale gold, not the Wardens' violet, which
      // dyed the open shells' linings purple.
      light: BOSS_LIGHT,
      heart,
      ring,
      plates,
      halos,
      lamps,
      axis: new THREE.Vector3(),
      last: null,
      coreMaterial,
      heartMaterial,
      bound: null,
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
    view.heart.rotation.y = time * 0.7;
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
    // a pooled view taken by a new Sovereign starts its halos level
    if (view.bound !== view.id) {
      view.bound = view.id;
      view.last = null;
      for (const h of view.halos) h.x = h.z = 0;
    }
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
        i ? -turn + open * (2 * turn + HALO_SLIP) : -turn,
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
    // the gem warms but keeps its facets; the heart in its seams burns
    const beat = 1 + 0.15 * Math.sin(time * CORE_BEAT);
    const flash = boss.getHitFlash() * CORE_FLASH * (0.2 + open);
    view.coreMaterial.emissiveIntensity =
      GEM_HEAT[0] + open * (GEM_HEAT[1] - GEM_HEAT[0]) * beat + 0.3 * flash;
    view.heartMaterial.color
      .copy(heartColor)
      .multiplyScalar(
        HEART_GAIN[0] + open * (HEART_GAIN[1] - HEART_GAIN[0]) * beat + flash
      );
    const { wall, cone, lanes, split: line } = view.telegraph;
    kit.updateTelegraph(wall, { telegraph: boss.barrier }, radius);
    kit.updateTelegraph(cone, boss, radius);
    kit.updateTelegraph(lanes, { telegraph: boss.beams }, radius);
    kit.updateTelegraph(line, { telegraph: boss.split }, radius);
  }

  return { kind: 'boss-sovereign', create, update };
}
