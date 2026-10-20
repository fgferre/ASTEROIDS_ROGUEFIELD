// The Field's distant structures (docs/NORTE.md §2 "Fundo com volume"): the
// broken Ring as a lit megastructure far below for scale, the intact Ring of
// Warden's Reach, and dark fragments drifting below the field — 3D shapes at
// real depth in front of the space behind them (spaceField.js). Each biome
// (src/data/biomes.js) decides through setLook() how many far fragments
// drift below, how much of the intact Ring shows and the haze the broken
// Ring sits in.

import { createSeededRandom } from './asteroidMesh.js';
import { colorOf } from './batches.js';
import { mergeStatic } from './mergeStatic.js';

const DEBRIS_COUNT = 48;
const DEBRIS_COLOR = '#16130f';
const STRUCTURE_COLOR = '#07050f';
const STRUCTURE_EDGE = '#8070ff';
const STRUCTURE_EDGE_ALPHA = 0.35;
// The victory epilogue's "wake" (setWake): the broken Ring's seams, conduit
// and running lights light up to this along its arc, bright enough to bloom,
// and the intact structures from their dark silhouettes.
const RING_WAKE_COLOR = '#9a8cff';
const RING_WAKE_GAIN = 2.4;
const STRUCTURE_WAKE_COLOR = '#2c2470';

// proposta 20/10: the broken Ring (docs/NORTE.md §1–2), an arc of modules in
// its own plane (x → z, y up, risen `tilt` toward the field) about `centre`,
// `radius` out, from its break `stump` (in view, under the field's left
// half) round to its far end `far` (radians). Cross-section in world units:
// `width` rim to rim, the hull `hull` deep under the deck, the rim walls
// `rim` above it and `wall` thick. Plates `module` long, `seam` apart, a rib
// every `ribEvery`; `gap`: the modules missing where it broke again;
// `follow`: its share of the camera's travel (brokenRing).
export const RING = {
  radius: 2200,
  centre: [-1900, -900, -1700],
  tilt: 0.12,
  stump: (50 * Math.PI) / 180,
  far: (-112 * Math.PI) / 180,
  width: 96,
  hull: 24,
  rim: 9,
  wall: 8,
  module: 60,
  seam: 4,
  ribEvery: 6,
  gap: [44, 45],
  follow: 0.5,
};
// proposta 20/10: its look. Matte metal (`albedo`, `roughness`,
// `metalness`) under the field's own lights, the lower faces down to `low`
// of the light (self-shadow), the bevelled rim edges `edge` × brighter (they
// catch the key light). The haze (the biome's sky + haze × `hazeGain`)
// grows with the length of the view ray under the field plane, the same
// from any shot: 63% after `hazeDepth`. Running lights glow `idle` ×
// `idleColor` before the wake (most are dead); in the wake the hull takes
// `spill` of the violet.
const RING_LOOK = {
  albedo: '#272b32',
  roughness: 0.9,
  metalness: 0.1,
  low: 0.35,
  edge: 6.5,
  hazeGain: 0.05,
  hazeDepth: 1300,
  idleColor: '#ffc27a',
  idle: 0.5,
  spill: 0.25,
};

// The vertex colour carries (tone, idle light, wake light) per piece, not a
// colour. The haze and the lights go on after the tone map, like the
// nebula they sit in; the wake runs along the arc from the break.
const RING_VERTEX_HEAD = `
uniform vec2 uArc;
uniform vec3 uShade;
uniform float uHazeDepth;
uniform float uWake;
varying float vRingShade;
varying float vRingHaze;
varying float vRingWoken;`;
const RING_VERTEX = `
vec4 ringWorld = modelMatrix * vec4(transformed, 1.0);
float ringAlong = (uArc.x - atan(transformed.z, transformed.x)) / uArc.y;
vRingWoken = uWake * smoothstep(0.0, 0.06, uWake * 1.06 - ringAlong);
vRingShade = mix(uShade.z, 1.0, smoothstep(uShade.x, uShade.y, transformed.y));
float ringBelow = clamp(-ringWorld.y / max(cameraPosition.y - ringWorld.y, 1.0),
  0.0, 1.0);
vRingHaze = 1.0 - exp(-distance(ringWorld.xyz, cameraPosition) * ringBelow
  / uHazeDepth);`;
const RING_FRAGMENT_HEAD = `
uniform vec3 uHaze;
uniform vec3 uIdle;
uniform vec3 uWakeColor;
uniform float uSpill;
varying float vRingShade;
varying float vRingHaze;
varying float vRingWoken;`;
const RING_FRAGMENT = `
gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, vRingHaze)
  + (uIdle * vColor.g + uWakeColor * (vColor.b * vRingWoken))
  * (1.0 - 0.6 * vRingHaze);`;

function ringMaterial(THREE) {
  const uniforms = {
    uArc: { value: new THREE.Vector2(RING.stump, RING.stump - RING.far) },
    uShade: { value: new THREE.Vector3(-RING.hull, RING.rim, RING_LOOK.low) },
    uHazeDepth: { value: RING_LOOK.hazeDepth },
    uHaze: { value: new THREE.Color() },
    uIdle: {
      value: colorOf(THREE, RING_LOOK.idleColor).multiplyScalar(RING_LOOK.idle),
    },
    uWakeColor: {
      value: colorOf(THREE, RING_WAKE_COLOR).multiplyScalar(RING_WAKE_GAIN),
    },
    uSpill: { value: RING_LOOK.spill },
    uWake: { value: 0 },
  };
  const material = new THREE.MeshStandardMaterial({
    color: colorOf(THREE, RING_LOOK.albedo),
    roughness: RING_LOOK.roughness,
    metalness: RING_LOOK.metalness,
    vertexColors: true,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${RING_VERTEX_HEAD}`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>${RING_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${RING_FRAGMENT_HEAD}`)
      .replace(
        '#include <color_fragment>',
        'diffuseColor.rgb *= vColor.r * vRingShade;'
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * uWakeColor * (uSpill * vRingWoken);`
      )
      .replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>${RING_FRAGMENT}`
      );
  };
  material.customProgramCacheKey = () => 'broken-ring';
  return { material, uniforms };
}

// Every piece of the broken Ring, for mergeStatic: boxes placed `s` along
// the arc from the break, `r` out from its centre line, `y` up from the
// deck, sized [across, up, along]; colour = (tone, idle light, wake light).
// Intact modules are a deck between two rim walls with a lit bevel, a belt,
// deck plates, now and then a hall, a conduit and running lights; between
// them a recessed seam; every few a rib. Toward each break the plates go and
// the frame shows, torn short, with pieces hanging and drifting off the
// stump.
function ringParts(THREE) {
  const random = createSeededRandom(2200.7);
  const between = (a, b) => a + (b - a) * random();
  const { radius: R, width: W, hull: H, rim: h, wall, module: L, seam } = RING;
  const side = (W - wall) / 2;
  const floorWidth = W - 2 * wall;
  const parts = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  // A plate turned 45° about its length: the bevel along a rim's outer top
  // edge, facing up and out (k: the rim's side).
  const bevels = [-1, 1].map((k) =>
    new THREE.BoxGeometry(7, 1.5, 1).rotateZ((-k * Math.PI) / 4)
  );
  const put = (geometry, s, r, y, size, tone, idle = 0, wake = 0) => {
    const phi = RING.stump - s / R;
    parts.push({
      geometry,
      color: new THREE.Color(tone, idle, wake),
      position: [(R + r) * Math.cos(phi), y, (R + r) * Math.sin(phi)],
      rotationY: -phi,
      scale: size,
    });
  };
  // A piece turned its own way (radians about across, up, along), its size
  // in its own geometry.
  const tilted = (s, r, y, size, turn, tone) => {
    const geometry = new THREE.BoxGeometry(...size)
      .rotateZ(turn[2])
      .rotateY(turn[1])
      .rotateX(turn[0]);
    put(geometry, s, r, y, 1, tone);
  };

  // One rim wall, its bevel and belt, from s0 to s1; `k` −1 inner, 1 outer.
  const rimWall = (s0, s1, k, tone, height = H + h) => {
    const s = (s0 + s1) / 2;
    const len = s1 - s0;
    // A torn wall keeps its foot: its top drops.
    put(box, s, k * side, height - H - height / 2, [wall, height, len], tone);
    if (height === H + h) {
      put(
        bevels[(k + 1) / 2],
        s,
        k * (W / 2 - 1),
        h - 1,
        [1, 1, len],
        RING_LOOK.edge
      );
    }
    put(box, s, k * (W / 2 + 1), -H * 0.45, [3, 3, len], tone * 1.15);
  };
  const runningLights = (s, idle) => {
    put(box, s, -side, h + 1, [3, 2, 3], 1, idle, 1.4);
    put(box, s, side, h + 1, [3, 2, 3], 1, idle, 1.4);
  };

  const intact = (s0, s1, tone) => {
    const s = (s0 + s1) / 2;
    const len = s1 - s0;
    rimWall(s0, s1, -1, tone);
    rimWall(s0, s1, 1, tone);
    put(box, s, 0, -H / 2, [floorWidth, H, len], tone * 0.8);
    // Two lanes of deck plates, a few gone, either side of the conduit;
    // now and then a block of machinery on them.
    const lane = (floorWidth - 8) / 2;
    [-1, 1].forEach((k) => {
      let at = s0 + 1;
      while (at < s1 - 4) {
        const long = Math.min(s1 - 1 - at, between(9, 22));
        if (random() > 0.12) {
          put(
            box,
            at + long / 2,
            k * (4 + lane / 2),
            0.5,
            [lane - 1.5, between(1, 2.6), long - 1.5],
            tone * between(0.6, 1.5)
          );
        }
        at += long;
      }
    });
    if (random() < 0.5) {
      const size = between(5, 10);
      put(
        box,
        between(s0 + 8, s1 - 8),
        (random() < 0.5 ? -1 : 1) * between(10, lane),
        between(2, 4),
        [size, between(3, 7), size * between(0.8, 2)],
        tone * between(0.9, 1.4)
      );
    }
    // Now and then a hall rising off one lane, a dead light on its roof.
    if (random() < 0.14) {
      const tall = between(7, 14);
      const r = (random() < 0.5 ? -1 : 1) * (4 + lane / 2);
      put(
        box,
        s,
        r,
        tall / 2,
        [lane * between(0.7, 1), tall, len * between(0.45, 0.8)],
        tone * 1.2
      );
      put(box, s, r, tall + 1, [3, 2, 3], 1, 0, 1.4);
    }
    put(box, s, 0, 1.2, [6, 2.5, len + seam], 0.6, 0, 1.6);
    runningLights(s, random() < 0.75 ? RING_LOOK.idle * 0.6 : 0);
  };

  // The frame where the plates are gone: the keel under the floor, cross
  // beams and diagonals, a plate or two left.
  const frame = (s0, s1, tone) => {
    const s = (s0 + s1) / 2;
    const len = s1 - s0;
    put(box, s, 0, -H + 3, [floorWidth * 0.3, 6, len], tone * 0.7);
    const beams = Math.max(1, Math.round(len / 18));
    for (let b = 0; b <= beams; b += 1) {
      put(box, s0 + (len * b) / beams, 0, -3, [floorWidth, 3, 3], tone);
    }
    const diagonal = Math.atan2(floorWidth, len / beams);
    for (let b = 0; b < beams; b += 1) {
      tilted(
        s0 + (len * (b + 0.5)) / beams,
        0,
        -4,
        [2.2, 2.2, Math.hypot(floorWidth, len / beams)],
        [0, b % 2 ? diagonal : -diagonal, 0],
        tone
      );
    }
    if (random() < 0.6) {
      put(
        box,
        between(s0 + 8, s1 - 8),
        between(-20, 20),
        -1,
        [floorWidth * between(0.3, 0.5), 2.5, len * between(0.25, 0.45)],
        tone * 0.9
      );
    }
  };

  // A torn end at `at`, the module running from it toward `into` (±1): the
  // rims stop short at different lengths, the deck shorter still, the keel
  // and a bent girder sticking out over the break.
  const torn = (at, into, tone) => {
    const from = (d) => at + into * d;
    const span = (a, b) => [
      Math.min(from(a), from(b)),
      Math.max(from(a), from(b)),
    ];
    const inner = between(4, 22);
    const outer = between(10, 34);
    rimWall(...span(inner, L), -1, tone);
    rimWall(...span(outer, L), 1, tone);
    rimWall(...span(0, inner), -1, tone * 0.9, (H + h) * between(0.4, 0.7));
    rimWall(
      ...span(between(0, 8), outer),
      1,
      tone * 0.9,
      (H + h) * between(0.3, 0.6)
    );
    // The deck ends ragged, four strips torn at different lengths, the
    // frame showing past them; plates peeled up off the edge catch the light.
    const deck = between(30, 40);
    const strip = floorWidth / 4;
    for (let k = 0; k < 4; k += 1) {
      const end = deck - between(0, 22);
      put(
        box,
        from((end + L) / 2),
        -floorWidth / 2 + strip * (k + 0.5),
        -H / 2,
        [strip, H, L - end],
        tone * between(0.7, 0.9)
      );
    }
    frame(...span(-6, deck), tone);
    for (let p = 0; p < 2; p += 1) {
      tilted(
        from(deck - between(16, 26)),
        between(-30, 10),
        4,
        [between(14, 22), 1.5, between(10, 16)],
        [-into * between(0.3, 0.6), 0, between(0.3, 0.7)],
        tone * 1.3
      );
    }
    // Rails bent out over the break: one drooping, one swung aside.
    tilted(
      from(-14),
      side * (random() < 0.5 ? -1 : 1),
      -6,
      [4, 4, 34],
      [into * 0.7, 0, 0],
      tone
    );
    tilted(
      from(-12),
      -side * 0.6,
      -H * 0.45,
      [3, 3, 30],
      [into * 0.25, into * 0.5, 0],
      tone
    );
  };

  const arc = R * (RING.stump - RING.far);
  const count = Math.floor((arc + seam) / (L + seam));
  for (let i = 0; i < count; i += 1) {
    if (RING.gap.includes(i)) continue;
    const s0 = i * (L + seam);
    const s1 = s0 + L;
    const tone = between(0.82, 1.08);
    if (i === 0 || RING.gap.includes(i - 1)) torn(s0, 1, tone);
    else if (i === count - 1 || RING.gap.includes(i + 1)) torn(s1, -1, tone);
    else if (i <= 2) {
      rimWall(s0, s1, -1, tone);
      rimWall(s0, s1, 1, tone);
      frame(s0, s1, tone);
      runningLights((s0 + s1) / 2, 0);
    } else intact(s0, s1, tone);

    // The seam to the next module, recessed under the deck; a rib on some.
    if (i === count - 1 || RING.gap.includes(i + 1)) continue;
    const s = s1 + seam / 2;
    put(
      box,
      s,
      0,
      -3 - H * 0.35,
      [floorWidth - 4, H * 0.7, seam + 0.5],
      0.5,
      0,
      1.3
    );
    if (i % RING.ribEvery === RING.ribEvery - 1) {
      [-1, 1].forEach((k) => {
        put(
          box,
          s,
          k * side,
          (h + 14 - H) / 2,
          [wall + 4, H + h + 14, 8],
          tone
        );
        put(box, s, k * side, h + 15, [4, 2, 4], 1, RING_LOOK.idle, 1.6);
      });
      put(box, s, 0, h + 12, [W + 4, 3, 8], tone * 1.4);
    }
  }

  // Off the stump: cables and a plate hanging past its end, pieces
  // drifting away.
  [-3, -5, -8].forEach((s, c) =>
    tilted(
      s,
      -18 + c * 17,
      -H - 20,
      [1.2, 38 + c * 6, 1.2],
      [between(-0.2, 0.2), 0, between(-0.25, 0.25)],
      0.9
    )
  );
  tilted(-8, 20, -H - 8, [34, 2.5, 26], [0.5, 0.2, 0.6], 0.9);
  for (let d = 0; d < 5; d += 1) {
    tilted(
      -between(30, 120),
      between(-70, 70),
      -between(20, 80),
      [between(6, 16), between(4, 10), between(8, 20)],
      [random() * 6, random() * 6, random() * 6],
      between(0.7, 1)
    );
  }
  return parts;
}

// The broken Ring: one baked mesh in one draw. Before it draws it moves
// `follow` of the way with the point the camera aims at on the field, so it
// parallaxes like something much deeper than it sits.
function brokenRing(THREE) {
  const { material, uniforms } = ringMaterial(THREE);
  const mesh = new THREE.Mesh(mergeStatic(THREE, ringParts(THREE)), material);
  mesh.position.set(...RING.centre);
  mesh.rotation.x = -RING.tilt;
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  const aim = new THREE.Vector3();
  mesh.onBeforeRender = (renderer, scene, camera) => {
    camera.getWorldDirection(aim);
    const reach = -camera.position.y / Math.min(aim.y, -0.1);
    mesh.position.set(
      RING.centre[0] + (camera.position.x + aim.x * reach) * RING.follow,
      RING.centre[1],
      RING.centre[2] + (camera.position.z + aim.z * reach) * RING.follow
    );
    mesh.updateMatrixWorld();
  };
  return { mesh, uniforms };
}

// The intact Ring of Warden's Reach: two thick arcs and the beams between
// them, far below, as dark silhouettes with a faint lit edge.
function ringStructures(THREE) {
  const group = new THREE.Group();
  const dark = new THREE.MeshBasicMaterial({
    color: colorOf(THREE, STRUCTURE_COLOR),
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const edge = new THREE.MeshBasicMaterial({
    color: colorOf(THREE, STRUCTURE_EDGE),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const center = { x: 1500, z: 1100 };
  const arc = Math.PI * 0.75;
  const start = Math.PI * 0.62;
  [
    { radius: 1500, tube: 46 },
    { radius: 2050, tube: 64 },
  ].forEach(({ radius, tube }) => {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube, 4, 120, arc),
      dark
    );
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(radius - tube, 3, 4, 120, arc),
      edge
    );
    [band, rim].forEach((mesh) => {
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = start;
      mesh.position.set(center.x, 0, center.z);
      group.add(mesh);
    });
  });
  // Beams joining the arcs, every few degrees.
  for (let i = 0; i <= 6; i += 1) {
    const angle = start + (arc * (i + 0.5)) / 7;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(560, 24, 30), dark);
    const mid = 1775;
    beam.position.set(
      center.x + Math.cos(angle) * mid,
      0,
      center.z - Math.sin(angle) * mid
    );
    beam.rotation.y = angle;
    group.add(beam);
  }
  group.position.y = -1080;
  group.traverse((child) => {
    child.renderOrder = -10;
  });
  return { group, dark, edge };
}

export class FieldBackdrop {
  constructor(THREE, scene) {
    this.THREE = THREE;
    const random = createSeededRandom(4242.5);

    // The broken Ring far below, its break inside the field's view.
    const ring = brokenRing(THREE);
    scene.add(ring.mesh);
    this.ring = ring.mesh;
    this.ringUniforms = ring.uniforms;

    this.structures = ringStructures(THREE);
    scene.add(this.structures.group);
    this.structureColor = colorOf(THREE, STRUCTURE_COLOR);
    this.structureWakeColor = colorOf(THREE, STRUCTURE_WAKE_COLOR);
    this.structureShare = 0;
    this.wake = 0;

    // Far fragments drifting well below the field, dark and barely lit;
    // the biome's `debris` share decides how many show.
    this.debris = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({
        color: colorOf(THREE, DEBRIS_COLOR),
        roughness: 1,
        metalness: 0,
        flatShading: true,
      }),
      DEBRIS_COUNT
    );
    this.debrisState = [];
    for (let i = 0; i < DEBRIS_COUNT; i += 1) {
      const depth = 520 + random() * 520;
      this.debrisState.push({
        position: new THREE.Vector3(
          (random() - 0.5) * 2200,
          -depth,
          (random() - 0.5) * 1700
        ),
        rotation: new THREE.Quaternion().setFromEuler(
          new THREE.Euler(random() * 6, random() * 6, random() * 6)
        ),
        scale: new THREE.Vector3(
          1,
          0.5 + random() * 0.6,
          0.7 + random() * 0.6
        ).multiplyScalar(7 + random() * 18),
      });
    }
    this.debrisMatrix = new THREE.Matrix4();
    this.debrisScale = new THREE.Vector3();
    scene.add(this.debris);
  }

  /** A biome look from BiomeController. */
  setLook(look) {
    this.structureShare = look.structures;
    this.applyStructures();
    // The haze the broken Ring sits in: the biome's sky and its clouds.
    this.ringUniforms.uHaze.value
      .copy(look.hazeColor)
      .multiplyScalar(look.hazeDensity * RING_LOOK.hazeGain)
      .add(look.sky0);

    // Fragments past the share shrink away one by one.
    const shown = look.debris * DEBRIS_COUNT;
    for (let i = 0; i < DEBRIS_COUNT; i += 1) {
      const d = this.debrisState[i];
      const k = Math.max(0, Math.min(1, shown - i));
      this.debrisScale.copy(d.scale).multiplyScalar(k);
      this.debrisMatrix.compose(d.position, d.rotation, this.debrisScale);
      this.debris.setMatrixAt(i, this.debrisMatrix);
    }
    this.debris.instanceMatrix.needsUpdate = true;
  }

  /** The Ring's wake, 0 (dead) to 1 (lit along its arc), for the epilogue. */
  setWake(wake) {
    if (wake === this.wake) return;
    this.wake = wake;
    this.ringUniforms.uWake.value = wake;
    this.structures.dark.color
      .copy(this.structureColor)
      .lerp(this.structureWakeColor, wake);
    this.applyStructures();
  }

  // The biome's share of the intact Ring, raised to full while it wakes.
  applyStructures() {
    const { group, dark, edge } = this.structures;
    const share = Math.max(this.structureShare, this.wake);
    group.visible = share > 0.001;
    dark.opacity = share;
    edge.opacity =
      share * (STRUCTURE_EDGE_ALPHA + (1 - STRUCTURE_EDGE_ALPHA) * this.wake);
  }
}
