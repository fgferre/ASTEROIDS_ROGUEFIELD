// src/modules/menu/openingRocks.js
//
// The opening scene's rocks (proposta 17/11, the owner's ask: rocks of
// every size and shape that now and then are hurled into each other at very
// high speed, with damage and explosions, as the first menu had). They
// drift in a box in front of the held shot (camera-frame units: x right,
// y up, −z ahead), drawn as the game's own rocks (render3d/enemies/rocks.js),
// so damage is light: a hit lights the cracks amber. Every few seconds one
// rock flies in from off frame at a visible target; a hard hit shatters the
// smaller rock into glowing pieces (or into chunks, if it is small), cracks
// the bigger one, and throws embers, chunks, a shockwave and a flash of
// light. With `still` (reduced motion) nothing moves and nothing is thrown.

import { PALETTE } from '../../data/constants/palette.js';
import { createAsteroidGeometry } from '../render3d/asteroidMesh.js';
import { colorOf } from '../render3d/batches.js';

// proposta 17/11: sizes (radius in units, share of rocks), stretch per axis,
// drift and spin. Radii scale with the shot's `scale`.
const SIZES = [
  { share: 0.55, r: [5, 11] },
  { share: 0.33, r: [12, 22] },
  { share: 0.12, r: [24, 36] },
];
const STRETCH = [0.7, 1.35];
// No rock fills more than this share of the frame's half height: big ones
// sit deeper in the box.
const APPARENT = 0.18;
const DRIFT = [2, 7];
const SPIN = [0.05, 0.35];
// The game's crack light per damage stage (enemies/rocks.js CRACK_GLOW,
// CRACK_REVEAL); a fresh hit glows `HOT` × that and cools in COOL seconds.
const CRACK_GLOW = [0, 0.8, 1.15, 1.4];
const CRACK_REVEAL = [0, 0.35, 0.65, 1];
const HOT = 1.6;
const COOL = 2.5;
const FLASH_SECONDS = 0.08;
// Throws: the first after `first` s, then every `every` s; the thrower
// crosses to its target in `travel` s (very fast) from just off frame.
const THROW = {
  first: [2.5, 4],
  every: [6, 11],
  travel: [0.6, 0.95],
  r: [11, 22],
};
// A thrown rock hitting this fast (units/s, relative) breaks rocks; slower
// hits, and rocks knocked into each other, bounce.
const IMPACT_SPEED = 60;
// Rocks under BREAKS radius shatter when hit hard; the bigger one cracks.
const BREAKS = 24;
// Pieces: how many, their share of the parent radius, outward speed; pieces
// smaller than DUST only become chunks.
const PIECES = { count: [2, 4], share: [0.35, 0.6], speed: [12, 40] };
const DUST = 3;
const MAX_ROCKS = 28;
// Effects: embers, chunks, shockwaves and lights, all pooled.
const EMBERS = { pool: 480, life: [0.6, 1.6], speed: [40, 200], drag: 1.6 };
const CHUNKS = {
  pool: 90,
  life: [1.2, 2.4],
  speed: [20, 90],
  size: [0.8, 2.4],
};
const WAVES = { pool: 4, life: 0.6, reach: 4.5 };
const LIGHTS = { pool: 3, peak: 9, reach: 10, decay: 0.2 };
// A burst spans this many times the radius of the rock that broke.
const BURST = 1.5;
// Camera shake: units per unit of impact radius, its decay (s).
const SHAKE = { amount: 0.06, decay: 0.35 };

const EMBER_VERTEX = `
attribute float aAge;
attribute float aSize;
uniform float uScale;
varying float vAge;
void main() {
  vAge = aAge;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aAge < 1.0 ? aSize * uScale / -mv.z : 0.0;
  gl_Position = projectionMatrix * mv;
}`;
const EMBER_FRAGMENT = `
uniform vec3 uColor;
varying float vAge;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.2, 1.0, d)) * (1.0 - vAge);
  vec3 hot = mix(vec3(1.0, 0.95, 0.85), uColor, smoothstep(0.0, 0.4, vAge));
  gl_FragColor = vec4(hot * (1.0 + 3.0 * (1.0 - vAge)) * a, 1.0);
}`;
const WAVE_VERTEX = `
varying vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
// A thin ring and a soft halo inside it, fading as it grows.
const WAVE_FRAGMENT = `
uniform vec3 uColor;
uniform float uAge;
varying vec2 vPos;
void main() {
  float d = length(vPos);
  float ring = 1.0 - smoothstep(0.0, 0.05, abs(d - 0.92));
  float halo = smoothstep(1.0, 0.3, d) * 0.12;
  float fade = (1.0 - uAge) * (1.0 - uAge);
  gl_FragColor = vec4(uColor * (ring + halo) * fade * 2.0, 1.0);
}`;

/**
 * `frame`: the held shot's camera matrix (the box's frame); `fov` degrees
 * and `aspect` of the shot; `field`: { near, far, count, scale };
 * `rockViews`: the game's rock views; `random`: a seeded () => [0, 1).
 */
export function createOpeningRocks({
  THREE,
  world,
  frame,
  fov,
  aspect,
  field,
  rockViews,
  random,
}) {
  const between = ([a, b]) => a + (b - a) * random();
  const tan = Math.tan((fov * Math.PI) / 360);
  const halfW = (z) => tan * aspect * -z;
  const halfH = (z) => tan * -z;
  const scale = field.scale ?? 1;

  // Pose holders hang off a detached anchor in the shot's frame; the
  // effects sit in a group in the same frame.
  const anchor = new THREE.Object3D();
  anchor.matrixAutoUpdate = false;
  anchor.matrix.copy(frame);
  anchor.matrixWorld.copy(frame);
  const fx = new THREE.Group();
  fx.matrixAutoUpdate = false;
  fx.matrix.copy(frame);
  world.add(fx);

  const amber = colorOf(THREE, PALETTE.shot);
  const rocks = [];
  const spare = [];
  const temp = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const spin = new THREE.Quaternion();

  function newView() {
    const view = spare.pop() || rockViews.createRock();
    if (!view.object.parent) anchor.add(view.object);
    return view;
  }

  // A depth (negative z) in the box where `radius` stays a modest size.
  function depthFor(radius) {
    const nearest = Math.max(field.near, radius / (APPARENT * tan));
    return -between([Math.min(nearest, field.far), field.far]);
  }

  function pickRadius() {
    let roll = random();
    const size = SIZES.find((s) => (roll -= s.share) < 0) || SIZES[0];
    return between(size.r) * scale;
  }

  function addRock({
    position,
    velocity,
    radius,
    stage = 0,
    heat = 0,
    family = null,
  }) {
    if (rocks.length >= MAX_ROCKS) return null;
    const view = newView();
    view.seed = Math.floor(random() * 100000);
    rockViews.bindRock(view, { variant: 'common' });
    view.rock.vein.copy(amber);
    const stretch = new THREE.Vector3(
      between(STRETCH),
      between(STRETCH),
      between(STRETCH)
    );
    stretch.multiplyScalar(1 / Math.cbrt(stretch.x * stretch.y * stretch.z));
    const rock = {
      view,
      position: position.clone(),
      velocity: velocity.clone(),
      radius,
      stretch,
      spinAxis: new THREE.Vector3(
        random() - 0.5,
        random() - 0.5,
        random() - 0.5
      ).normalize(),
      spinRate: between(SPIN) * (random() < 0.5 ? -1 : 1),
      stage,
      heat,
      flash: 0,
      thrown: false,
      family,
    };
    view.object.quaternion.setFromAxisAngle(rock.spinAxis, random() * 6.28);
    rocks.push(rock);
    return rock;
  }

  function removeRock(rock) {
    rocks.splice(rocks.indexOf(rock), 1);
    spare.push(rock.view);
  }

  // A point in the box at depth z, (u, v) across the frame.
  function boxPoint(u, v, z) {
    return temp.set(u * halfW(z), v * halfH(z), z);
  }

  function drift() {
    const angle = random() * Math.PI * 2;
    const speed = between(DRIFT);
    return new THREE.Vector3(
      Math.cos(angle) * speed,
      Math.sin(angle) * speed * 0.6,
      (random() - 0.5) * speed * 0.5
    );
  }

  // The opening field: spread over the frame, big rocks kept off the title.
  for (let tries = 0; rocks.length < field.count && tries < 200; tries += 1) {
    const radius = pickRadius();
    const z = depthFor(radius);
    // Most to the sides, where throws may land; a few across the middle.
    const side = random() < 0.5 ? -1 : 1;
    const u = random() < 0.7 ? side * between([0.5, 1]) : random() * 2 - 1;
    const v = random() * 2 - 1;
    if (radius > 14 * scale && Math.abs(u) < 0.4 && Math.abs(v) < 0.35)
      continue;
    const position = boxPoint(u * 0.95, v * 0.9, z).clone();
    if (
      rocks.some(
        (r) => r.position.distanceTo(position) < (r.radius + radius) * 1.6
      )
    )
      continue;
    addRock({ position, velocity: drift(), radius });
  }

  // A rock drifting in from just past an edge, out of view.
  function spawnDrifter() {
    const radius = pickRadius();
    const z = depthFor(radius);
    const side = random() < 0.5 ? -1 : 1;
    const position = boxPoint(0, between([-0.8, 0.8]), z).clone();
    position.x = side * (halfW(z) + radius * 1.5);
    const velocity = drift();
    velocity.x = -side * Math.abs(velocity.x) - side * 2;
    addRock({ position, velocity, radius });
  }

  function inView(p, margin = 0) {
    return (
      Math.abs(p.x) < halfW(p.z) * (1 - margin) &&
      Math.abs(p.y) < halfH(p.z) * (1 - margin)
    );
  }

  // The column the title and PRESS START take, with room for a burst's
  // ring and embers: no burst there.
  function onTitle(p) {
    const u = p.x / halfW(Math.min(p.z, -1));
    const v = p.y / halfH(Math.min(p.z, -1));
    return Math.abs(u) < 0.6 && v > -0.95 && v < 0.7;
  }

  // Throws one rock at a visible target off the title; false when none.
  function throwRock() {
    const pool = rocks.filter(
      (r) => !r.thrown && inView(r.position, 0.1) && !onTitle(r.position)
    );
    if (!pool.length) return false;
    const target = pool[Math.floor(random() * pool.length)];
    const travel = between(THROW.travel);
    const aim = target.position
      .clone()
      .addScaledVector(target.velocity, travel);
    const radius = between(THROW.r) * scale;
    // From the nearer side edge, a little off the target's height and depth.
    const side = aim.x < 0 ? -1 : 1;
    const z = aim.z * between([0.85, 1.15]);
    const start = new THREE.Vector3(
      side * (halfW(z) + radius * 2),
      aim.y + between([-0.5, 0.5]) * halfH(z),
      z
    );
    const velocity = aim.clone().sub(start).divideScalar(travel);
    const rock = addRock({ position: start, velocity, radius });
    if (rock) {
      rock.thrown = true;
      rock.spinRate *= 6;
    }
    return true;
  }

  // --- effects -----------------------------------------------------------
  const embers = {
    position: new Float32Array(EMBERS.pool * 3),
    velocity: new Float32Array(EMBERS.pool * 3),
    age: new Float32Array(EMBERS.pool).fill(1),
    life: new Float32Array(EMBERS.pool).fill(1),
    size: new Float32Array(EMBERS.pool),
    next: 0,
  };
  const emberGeometry = new THREE.BufferGeometry();
  emberGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(embers.position, 3)
  );
  emberGeometry.setAttribute('aAge', new THREE.BufferAttribute(embers.age, 1));
  emberGeometry.setAttribute(
    'aSize',
    new THREE.BufferAttribute(embers.size, 1)
  );
  const emberMaterial = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 500 }, uColor: { value: amber } },
    vertexShader: EMBER_VERTEX,
    fragmentShader: EMBER_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const emberPoints = new THREE.Points(emberGeometry, emberMaterial);
  emberPoints.frustumCulled = false;
  fx.add(emberPoints);

  const chunkMesh = new THREE.InstancedMesh(
    createAsteroidGeometry(THREE, 41.7, { detail: 1 }),
    new THREE.MeshStandardMaterial({
      color: colorOf(THREE, PALETTE.rock),
      roughness: 1,
      metalness: 0,
      flatShading: true,
    }),
    CHUNKS.pool
  );
  chunkMesh.frustumCulled = false;
  chunkMesh.count = 0;
  fx.add(chunkMesh);
  const chunks = [];
  const chunkMatrix = new THREE.Matrix4();
  const chunkQuat = new THREE.Quaternion();
  const chunkScale = new THREE.Vector3();

  const waveGeometry = new THREE.PlaneGeometry(2, 2);
  const waves = Array.from({ length: WAVES.pool }, () => {
    const mesh = new THREE.Mesh(
      waveGeometry,
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: amber }, uAge: { value: 1 } },
        vertexShader: WAVE_VERTEX,
        fragmentShader: WAVE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    mesh.visible = false;
    fx.add(mesh);
    return { mesh, age: 1, reach: 1 };
  });
  let nextWave = 0;

  // Created at 0 up front: the light count never changes (no recompiles).
  const lights = Array.from({ length: LIGHTS.pool }, () => {
    const light = new THREE.PointLight(colorOf(THREE, '#ffd29a'), 0, 1, 2);
    fx.add(light);
    return light;
  });
  let nextLight = 0;

  const shake = { amount: 0 };

  // `size`: the radius that broke; the burst reads bigger than the rock.
  function explode(at, radius, heat) {
    const size = radius * BURST;
    const ember = Math.round(30 + size * 2.2 * heat);
    for (let i = 0; i < ember; i += 1) {
      const n = embers.next;
      embers.next = (n + 1) % EMBERS.pool;
      axis.set(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
      const speed = between(EMBERS.speed) * (0.5 + 0.5 * heat);
      at.toArray(embers.position, n * 3);
      axis.multiplyScalar(speed).toArray(embers.velocity, n * 3);
      embers.age[n] = 0;
      embers.life[n] = between(EMBERS.life);
      embers.size[n] = between([1.2, 3.2]);
    }
    const count = Math.min(14, Math.round(4 + size * 0.35));
    for (let i = 0; i < count; i += 1) {
      if (chunks.length >= CHUNKS.pool) chunks.shift();
      axis.set(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
      chunks.push({
        position: at.clone(),
        velocity: axis.clone().multiplyScalar(between(CHUNKS.speed)),
        axis: axis.clone(),
        angle: random() * 6.28,
        rate: between([2, 7]),
        size: between(CHUNKS.size) * Math.min(2, 0.5 + size / 14),
        age: 0,
        life: between(CHUNKS.life),
      });
    }
    const wave = waves[nextWave];
    nextWave = (nextWave + 1) % waves.length;
    wave.age = 0;
    // Never wider than a share of the frame, however near the burst.
    wave.reach = Math.min(size * WAVES.reach, halfH(Math.min(at.z, -1)) * 0.22);
    wave.mesh.position.copy(at);
    wave.mesh.visible = true;
    const light = lights[nextLight];
    nextLight = (nextLight + 1) % lights.length;
    light.position.copy(at);
    light.intensity = LIGHTS.peak * Math.min(1.5, 0.4 + size / 20) * heat;
    light.distance = size * LIGHTS.reach * 4;
    shake.amount = Math.max(shake.amount, SHAKE.amount * size * heat);
  }

  function shatter(rock, at) {
    const family = {};
    const pieces = Math.floor(between(PIECES.count) + 0.5);
    for (let i = 0; i < pieces; i += 1) {
      const radius = rock.radius * between(PIECES.share);
      if (radius < DUST) continue;
      axis.set(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
      const position = rock.position
        .clone()
        .addScaledVector(axis, rock.radius * 0.5);
      const velocity = rock.velocity
        .clone()
        .multiplyScalar(0.4)
        .addScaledVector(axis, between(PIECES.speed));
      const piece = addRock({
        position,
        velocity,
        radius,
        stage: 2,
        heat: 1,
        family,
      });
      if (piece) piece.spinRate *= 3;
    }
    explode(at, rock.radius, 1);
    removeRock(rock);
  }

  function crack(rock) {
    rock.stage = Math.min(3, rock.stage + 1);
    rock.heat = 1;
    rock.flash = FLASH_SECONDS;
  }

  // Sphere against sphere; a hard hit breaks, a soft one bounces.
  function collide(a, b) {
    // Pieces of one rock fly apart through each other.
    if (a.family && a.family === b.family) return;
    const normal = temp.copy(b.position).sub(a.position);
    const distance = normal.length();
    const reach = (a.radius + b.radius) * 0.92;
    if (distance >= reach || distance === 0) return;
    normal.divideScalar(distance);
    const closing = a.velocity.dot(normal) - b.velocity.dot(normal);
    if (closing <= 0) return;
    const ma = a.radius ** 3;
    const mb = b.radius ** 3;
    const at = a.position.clone().addScaledVector(normal, a.radius);
    const impulse = (2 * closing) / (ma + mb);
    a.velocity.addScaledVector(normal, -impulse * mb * 0.6);
    b.velocity.addScaledVector(normal, impulse * ma * 0.6);
    // Only a thrown rock breaks things: a knocked rock bounces, so one
    // throw never sets off a chain; nor does a hit over the title.
    if (closing < IMPACT_SPEED || !(a.thrown || b.thrown) || onTitle(at)) {
      return;
    }
    [a, b].forEach((rock) => {
      const other = rock === a ? b : a;
      if (rock.radius < BREAKS * scale && rock.radius <= other.radius * 1.25) {
        shatter(rock, at);
      } else {
        crack(rock);
      }
    });
    if (rocks.includes(a) && rocks.includes(b))
      explode(at, Math.min(a.radius, b.radius), 0.7);
  }

  let throwIn = between(THROW.first);
  const gone = [];

  return {
    shake,
    update(dt, time, still, pointScale) {
      if (!still) {
        throwIn -= dt;
        if (throwIn <= 0) {
          // No target yet: look again soon.
          throwIn = throwRock() ? between(THROW.every) : 1;
        }
        rocks.forEach((rock) =>
          rock.position.addScaledVector(rock.velocity, dt)
        );
        for (let i = 0; i < rocks.length; i += 1) {
          for (let j = i + 1; j < rocks.length; j += 1) {
            if (rocks[i] && rocks[j]) collide(rocks[i], rocks[j]);
          }
        }
        // Gone past the edges or the depth: recycled; the field refilled.
        gone.length = 0;
        rocks.forEach((rock) => {
          const p = rock.position;
          const out =
            Math.abs(p.x) > halfW(Math.min(p.z, -1)) * 1.3 + rock.radius * 3 ||
            Math.abs(p.y) > halfH(Math.min(p.z, -1)) * 1.3 + rock.radius * 3 ||
            -p.z < field.near * 0.4 ||
            -p.z > field.far * 1.5;
          if (out) gone.push(rock);
        });
        gone.forEach(removeRock);
        if (
          rocks.filter((r) => !r.thrown && r.stage < 2).length < field.count
        ) {
          spawnDrifter();
        }
      }

      rockViews.rocks.begin();
      rocks.forEach((rock) => {
        const { view } = rock;
        if (!still) {
          spin.setFromAxisAngle(rock.spinAxis, rock.spinRate * dt);
          view.object.quaternion.multiply(spin);
          rock.heat = Math.max(0, rock.heat - dt / COOL);
          rock.flash = Math.max(0, rock.flash - dt);
        }
        view.object.position.copy(rock.position);
        view.object.scale.copy(rock.stretch).multiplyScalar(rock.radius * 1.08);
        view.object.updateMatrixWorld();
        const g = view.rock.glow;
        g[0] =
          CRACK_GLOW[rock.stage] * (1 + (HOT - 1) * rock.heat) +
          0.9 * rock.heat;
        g[1] = Math.max(CRACK_REVEAL[rock.stage], rock.heat * 0.5);
        g[2] = 0.035 + rock.stage * 0.012;
        g[3] = rock.flash > 0 ? 0.2 : 0;
        rockViews.rocks.push(view);
      });
      rockViews.rocks.end();

      const step = still ? 0 : dt;
      for (let n = 0; n < EMBERS.pool; n += 1) {
        if (embers.age[n] >= 1) continue;
        embers.age[n] = Math.min(1, embers.age[n] + step / embers.life[n]);
        const k = Math.exp(-EMBERS.drag * step);
        for (let c = 0; c < 3; c += 1) {
          embers.velocity[n * 3 + c] *= k;
          embers.position[n * 3 + c] += embers.velocity[n * 3 + c] * step;
        }
      }
      emberGeometry.attributes.position.needsUpdate = true;
      emberGeometry.attributes.aAge.needsUpdate = true;
      emberGeometry.attributes.aSize.needsUpdate = true;
      emberMaterial.uniforms.uScale.value = pointScale;

      let alive = 0;
      chunks.forEach((chunk) => {
        chunk.age += step;
        chunk.position.addScaledVector(chunk.velocity, step);
        chunk.velocity.multiplyScalar(Math.exp(-0.6 * step));
        chunk.angle += chunk.rate * step;
        const left = 1 - chunk.age / chunk.life;
        if (left <= 0) return;
        chunkQuat.setFromAxisAngle(chunk.axis, chunk.angle);
        chunkScale.setScalar(chunk.size * Math.min(1, left * 4));
        chunkMatrix.compose(chunk.position, chunkQuat, chunkScale);
        chunkMesh.setMatrixAt(alive, chunkMatrix);
        alive += 1;
      });
      for (let i = chunks.length - 1; i >= 0; i -= 1) {
        if (chunks[i].age >= chunks[i].life) chunks.splice(i, 1);
      }
      chunkMesh.count = alive;
      chunkMesh.instanceMatrix.needsUpdate = true;

      waves.forEach((wave) => {
        if (wave.age >= 1) return;
        wave.age = Math.min(1, wave.age + step / WAVES.life);
        const grow = 1 - (1 - wave.age) ** 3;
        wave.mesh.scale.setScalar(Math.max(0.01, wave.reach * grow));
        wave.mesh.material.uniforms.uAge.value = wave.age;
        wave.mesh.visible = wave.age < 1;
      });

      const fade = Math.exp(-step / LIGHTS.decay);
      lights.forEach((light) => {
        light.intensity = light.intensity > 0.02 ? light.intensity * fade : 0;
      });
      shake.amount *= Math.exp(-step / SHAKE.decay);
      if (still) shake.amount = 0;
      fx.updateMatrixWorld(true);
      return time;
    },
  };
}
