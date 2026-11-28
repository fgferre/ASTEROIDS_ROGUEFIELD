// Rock views: the Ring's fragments, drawn instanced (rockInstances.js) as
// procedural rocks whose cracks light up with damage; each asteroid
// variant's look (VARIANT_LOOKS); how they break (rockBreak.js);
// Dense Fog's fade and the baked surface maps' quality toggle.

import { PALETTE } from '../../../data/constants/palette.js';
import { createAsteroidGeometry, createSeededRandom } from '../asteroidMesh.js';
import { bakeRockMaps } from '../bakedMaps.js';
import { colorOf } from '../batches.js';
import { SHINE } from '../hullModel.js';
import { SPARK_KIND } from '../hitSparks.js';
import { RockInstances } from '../rockInstances.js';
import { createRockBreak, lookOf } from './rockBreak.js';
import {
  FOG_DIM,
  FOG_FADE_SECONDS,
  patchRockShader,
  rockUniforms,
} from './rockShader.js';

const ROCK_SHAPES = 8;
const ROCK_DETAIL = 4;
// Rock geometry is unit-radius with craters cut in; this keeps the visible
// silhouette close to the collision radius.
const ROCK_SCALE = 1.08;
// Amber stays amber up to ~1.4 (above that green clips → yellow); bloom
// starts at ~1.0 (threshold 0.75).
const CRACK_GLOW = [0, 0.8, 1.15, 1.4];
const CRACK_REVEAL = [0, 0.35, 0.65, 1];
const TAU = Math.PI * 2;
// proposta 21/11 (35, tiro/na-pedra): a shot knocks the rock it hits, in
// the picture only, as the machines' jolt (the sim keeps its path, so
// replays and the balance stay): the rock jumps back along the shot by
// KICK_REACH world units and settles in KICK_TIME s, and it turns about
// where it was struck at KICK_SPIN rad/s, which dies out over
// KICK_SPIN_DECAY s, its new pose kept. Both for one Lance shot
// (KICK_DAMAGE) on a large rock (KICK_RADIUS), more for a harder hit or a
// smaller rock (both × the square root of KICK_RADIUS / radius).
const KICK_DAMAGE = 25;
const KICK_RADIUS = 35;
const KICK_REACH = 2.4;
const KICK_REACH_MAX = 5;
const KICK_TIME = 0.16;
const KICK_SPIN = 0.6;
const KICK_SPIN_MAX = 3;
const KICK_SPIN_DECAY = 0.7;
// how high on the rock a hit lands (× its radius): where its burn shows
const KICK_LEVER = 0.5;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Variant looks (§3 "Fragmento do Anel"): `base` (sRGB) multiplies the baked
// rock color; veins are the light inside, glowing between `floor` and
// `veinGlow` at `rate` Hz. A Volatile's veins race at `armedRate` once its
// fuse arms; a Parasite's quicken toward `nearRate` as it closes on the player.
// `reveal`/`width` set how much of the crack network the veins light.
// Crystal swaps to a glossy faceted material with a cold rim (`rim`);
// `gain` multiplies `base` past white (a polished metal's reflectance).
// Stone and crystal take their finish from hullModel.js SHINE; iron, the
// dense core and gold are their own mixes of ore and stone.
export const VARIANT_LOOKS = {
  common: { base: '#ffffff', ...SHINE.rock },
  iron: { base: '#f4f7ff', roughness: 0.42, metalness: 0.3 },
  denseCore: { base: '#a4b6dc', roughness: 0.7, metalness: 0.12 },
  // proposta 13/11: polished gold between the veins — `gain` lifts the
  // dark rock albedo to a metal's reflectance, its sheen capped (ROCK_SHEEN).
  gold: {
    base: '#ffae48',
    gain: 9,
    roughness: 0.38,
    metalness: 0.85,
    vein: PALETTE.xp,
    veinGlow: 0.9,
    reveal: 1,
    width: 0.03,
  },
  volatile: {
    base: '#f0d2bc',
    ...SHINE.rock,
    vein: PALETTE.shot,
    veinGlow: 1.3,
    floor: 0.35,
    rate: 0.9,
    armedRate: 4,
    reveal: 0.5,
    width: 0.065,
  },
  parasite: {
    base: '#dcbcc4',
    ...SHINE.rock,
    vein: PALETTE.threat,
    veinGlow: 1.2,
    floor: 0.25,
    rate: 0.7,
    nearRate: 2.6,
    reveal: 0.5,
    width: 0.05,
  },
  // The Scatter's Kindling (approved 23/11): a rock burning inside, its
  // crust charred dark and every crack running molten, breathing slowly;
  // `veinLight` false: it lights no rocks round it (they went pink).
  kindled: {
    base: '#6a5850',
    ...SHINE.rock,
    vein: '#ff4a12',
    veinGlow: 2.2,
    floor: 1.3,
    rate: 0.55,
    reveal: 1,
    width: 0.1,
    veinLight: false,
  },
  crystal: {
    base: '#86b8e8',
    ...SHINE.crystal,
    vein: '#bfe8ff',
    veinGlow: 0.45,
    reveal: 0.3,
    width: 0.03,
    rim: 0.5,
    crystal: true,
  },
};
// What a shot strikes on each variant (a hitSparks SPARK_KIND; a
// scorchDecals DECAL_KIND where it leaves a mark): iron is metal, crystal
// glass (cold glints, no scorch); the rest stone. pedras, 17/11.
const STRIKE = { iron: 'metal', crystal: 'shield' };
export const strikeOf = (enemy) => STRIKE[lookOf(enemy)] || 'rock';

// A Parasite's pulse is at its fastest within this many logical pixels.
const PARASITE_NEAR = 80;
// a crushed rock's chips and dust leave this far off the mouth's facing (rad)
const CRUSH_SPRAY = 1.5;
const PARASITE_FAR = 360;
// Baked surface maps (bakedMaps.js): rock maps tile every 1/ROCK_TILE rock
// radii, sampled triplanar; crystal facets take only a faint normal.
// proposta 18/10: strengths.
const ROCK_TILE = 0.8;
const ROCK_NORMAL_SCALE = 0.9;
const CRYSTAL_NORMAL_SCALE = 0.25;
const ROCK_AO = 0.8;

function smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Bakes per-vertex albedo from relief: crater floors dark, crests lighter.
function paintRock(THREE, geometry, seed) {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const low = colorOf(THREE, PALETTE.rockShadow);
  const mid = colorOf(THREE, PALETTE.rock);
  const high = colorOf(THREE, PALETTE.rockLit);
  const color = new THREE.Color();
  const random = createSeededRandom(seed + 9);
  for (let i = 0; i < position.count; i += 1) {
    const r = Math.hypot(position.getX(i), position.getY(i), position.getZ(i));
    const t = smooth(0.72, 1.18, r);
    color.copy(low).lerp(mid, Math.min(1, t * 1.6));
    color.lerp(high, Math.max(0, t - 0.55) * 1.2);
    const grain = 0.92 + random() * 0.16;
    colors[i * 3] = color.r * grain;
    colors[i * 3 + 1] = color.g * grain;
    colors[i * 3 + 2] = color.b * grain;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/**
 * Rock views.
 * @param {object} kit - the mirror's toolkit (enemyMirror.js createKit), never
 *   the mirror itself.
 */
export function createRockViews(kit) {
  const { THREE } = kit;
  const rockGeometries = [];
  for (let i = 0; i < ROCK_SHAPES; i += 1) {
    const seed = 11.3 + i * 7.77;
    const geometry = createAsteroidGeometry(THREE, seed, {
      detail: ROCK_DETAIL,
    });
    paintRock(THREE, geometry, seed);
    // no cut face on a whole rock (rockCut.js gives cut pieces theirs)
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute(
      'cut',
      new THREE.Float32BufferAttribute(new Float32Array(count), 1)
    );
    rockGeometries.push(geometry);
  }
  const rockMaps = bakeRockMaps(THREE, kit.mapSeed);
  const turnAxis = new THREE.Vector3();
  const turnStep = new THREE.Quaternion();
  const rockNormal = {
    uRockNormalMap: { value: rockMaps.normalMap },
    uRockTile: { value: ROCK_TILE },
  };
  const stoneMaps = {
    ...rockNormal,
    uRockNormalScale: { value: ROCK_NORMAL_SCALE },
    uRockRoughnessMap: { value: rockMaps.roughnessMap },
    uRockAoMap: { value: rockMaps.aoMap },
    uRockAoIntensity: { value: ROCK_AO },
  };
  const crystalMaps = {
    ...rockNormal,
    uRockNormalScale: { value: CRYSTAL_NORMAL_SCALE },
  };
  // every rock material, for the quality preset and Dense Fog
  const rockMaterials = [];
  const fog = {
    amount: 0,
    uniforms: {
      uFogDim: { value: 0 },
      uFogCenter: { value: new THREE.Vector2() },
    },
  };
  const rockFamilies = createRockFamilies();
  const rocks = new RockInstances(
    THREE,
    kit.scene,
    rockGeometries,
    rockFamilies
  );
  const breaks = createRockBreak(kit, rocks);

  // The instanced rocks' two shared materials: stone (each variant's colour
  // and surface come per instance) and Crystal, with its cold rim.
  function createRockFamilies() {
    const stone = new THREE.MeshStandardMaterial({ vertexColors: true });
    stone.userData.rockUniforms = rockUniforms(
      THREE,
      colorOf(THREE, PALETTE.shot)
    );
    stone.userData.rockMaps = stoneMaps;
    stone.defines.ROCK_SHEEN = '';
    const crystal = crystalMaterial({
      ...stone.userData.rockUniforms,
      uRim: { value: VARIANT_LOOKS.crystal.rim },
    });
    [stone, crystal].forEach((material) => {
      material.defines.ROCK_INSTANCED = '';
      material.defines.ROCK_CUT = '';
      material.onBeforeCompile = patchRockShader;
      trackRockMaterial(material);
    });
    return { stone, crystal };
  }

  // A live rock is an instance (rockInstances.js); `object` only holds its
  // pose and shape (the scorch decals raycast it) and is never drawn.
  function createRock() {
    const object = new THREE.Mesh(rockGeometries[0], rockFamilies.stone);
    object.rotation.order = 'YXZ';
    return {
      kind: 'asteroid',
      object,
      // the shots' knock (kick()): the jump, the spin and the pose it left
      kickX: 0,
      kickZ: 0,
      kickAt: -Infinity,
      spin: new THREE.Vector3(),
      turn: new THREE.Quaternion(),
      id: null,
      shape: 0,
      family: 'stone',
      look: null,
      rock: {
        base: new THREE.Color(),
        vein: new THREE.Color(),
        seed: new THREE.Vector3(),
        glow: [0, 0, 0, 0],
        surface: [1, 0],
        hit: [new Float32Array(4), new Float32Array(4)],
        heat: 0,
        tint: 0,
      },
    };
  }

  // Crystal: same rock geometry, flat-shaded glossy facets, clear coat.
  function crystalMaterial(rockUniforms) {
    const material = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      flatShading: true,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    });
    material.userData.rockUniforms = rockUniforms;
    material.userData.rockMaps = crystalMaps;
    return material;
  }

  // Every rock material: surface maps per preset, Dense Fog dimming.
  function trackRockMaterial(material) {
    rockMaterials.push(material);
    material.defines.ROCK_FOG = '';
    material.userData.rockFog = fog.uniforms;
    applySurfaceMaps(material);
  }

  /**
   * Per frame: Dense Fog `on` or off (faded over FOG_FADE_SECONDS), (x, z)
   * the camera target in world units. Returns the fade, 0..1.
   */
  function updateFog(dt, on, x, z) {
    const step = dt / FOG_FADE_SECONDS;
    fog.amount = clamp01(fog.amount + (on ? step : -step));
    fog.uniforms.uFogDim.value = FOG_DIM * fog.amount;
    fog.uniforms.uFogCenter.value.set(x, z);
    return fog.amount;
  }

  // Stone takes normal + roughness/AO; crystal only the faint normal.
  function applySurfaceMaps(material) {
    const { defines } = material;
    delete defines.ROCK_NORMAL;
    delete defines.ROCK_SURFACE;
    if (kit.quality.surfaceMaps) {
      defines.ROCK_NORMAL = '';
      if (material.userData.rockMaps === stoneMaps) {
        defines.ROCK_SURFACE = '';
      }
    }
    material.needsUpdate = true;
  }

  // Quality preset flipped (EnemyMirror.setSurfaceMaps): every rock
  // material again (one recompile each).
  function refreshSurfaceMaps() {
    rockMaterials.forEach(applySurfaceMaps);
  }

  // A rock view takes its seed's shape (or the piece it was cut as), spin
  // and lean and its variant's look; a rock ignited alive keeps its shape.
  function bindRock(view, enemy) {
    const seed = view.seed;
    view.body = enemy;
    if (view.boundId !== enemy.id) {
      view.boundId = enemy.id;
      breaks.adopt(view, enemy);
      view.kickAt = -Infinity;
      view.spin.set(0, 0, 0);
      view.turn.identity();
    }
    if (view.cut === undefined) {
      view.shape = seed % ROCK_SHAPES;
      view.object.geometry = rockGeometries[view.shape];
    }
    const random = createSeededRandom((seed % 100000) + 1);
    view.spinRate = (0.25 + random() * 0.5) * (random() < 0.5 ? -1 : 1);
    view.spinPhase = random() * Math.PI * 2;
    view.lean = (random() - 0.5) * 1.2;
    const look = VARIANT_LOOKS[lookOf(enemy)] || VARIANT_LOOKS.common;
    view.look = look;
    view.variant = lookOf(enemy);
    view.pulse = view.spinPhase;
    view.lastTime = null;
    view.family = look.crystal ? 'crystal' : 'stone';
    view.object.material = rockFamilies[view.family];
    const { rock } = view;
    rock.base.set(look.base).multiplyScalar(look.gain || 1);
    rock.vein.set(look.vein || PALETTE.shot);
    rock.surface[0] = look.roughness;
    rock.surface[1] = look.metalness;
    rock.seed.set(random() * 50, random() * 50, random() * 50);
  }

  // A shot hit `view`'s rock at (dx, dy) from its centre (logical), flying
  // along (vx, vy) with `damage`: it jumps and turns (KICK_*).
  function kick(view, dx, dy, vx, vy, damage) {
    const speed = Math.hypot(vx, vy);
    if (speed < 1e-3) return;
    const ux = vx / speed;
    const uz = vy / speed;
    const hard = (damage || 0) / KICK_DAMAGE;
    const r = Math.max(4, view.radius || 12);
    const small = Math.sqrt(KICK_RADIUS / r);
    const reach = Math.min(KICK_REACH_MAX, KICK_REACH * hard * small);
    view.kickX = ux * reach;
    view.kickZ = uz * reach;
    view.kickAt = view.lastTime ?? 0;
    // the turn is the hit's lever (where it struck, raised to its burn)
    // crossed with the shot, per radius
    const ly = KICK_LEVER * r;
    turnAxis.set(ly * uz, dy * ux - dx * uz, -ly * ux).divideScalar(r);
    view.spin.addScaledVector(turnAxis, KICK_SPIN * hard * small);
    if (view.spin.length() > KICK_SPIN_MAX) view.spin.setLength(KICK_SPIN_MAX);
  }

  // The knock on the pose just set: the turn so far, the jump settling.
  function settleKick(view, time, dt) {
    const { object, spin } = view;
    const rate = spin.length();
    if (rate > 1e-4 && dt > 0) {
      turnStep.setFromAxisAngle(
        turnAxis.copy(spin).divideScalar(rate),
        rate * dt
      );
      view.turn.premultiply(turnStep);
      spin.multiplyScalar(Math.exp(-dt / KICK_SPIN_DECAY));
    }
    object.quaternion.premultiply(view.turn);
    const since = time - view.kickAt;
    if (since >= 0 && since < KICK_TIME) {
      const k = (1 - since / KICK_TIME) ** 2;
      object.position.x += view.kickX * k;
      object.position.z += view.kickZ * k;
    }
  }

  // Vein pulse rate (Hz) from the live variant state.
  function pulseRate(look, enemy) {
    if (look.armedRate && enemy.variantState?.armed) return look.armedRate;
    if (look.nearRate) {
      const target = enemy.system?.getCachedPlayer?.()?.position;
      if (target) {
        const distance = Math.hypot(target.x - enemy.x, target.y - enemy.y);
        const near = clamp01(
          (PARASITE_FAR - distance) / (PARASITE_FAR - PARASITE_NEAR)
        );
        return look.rate + (look.nearRate - look.rate) * near;
      }
    }
    return look.rate || 0;
  }

  function updateRock(view, enemy, time, flash) {
    // a rock can change variant alive (the Herald of Heat ignites it)
    if (view.look !== (VARIANT_LOOKS[lookOf(enemy)] || VARIANT_LOOKS.common)) {
      bindRock(view, enemy);
    }
    const { object, look } = view;
    object.scale.setScalar((enemy.radius || 12) * ROCK_SCALE);
    object.rotation.y = -(enemy.rotation || 0);
    object.rotation.x = view.spinPhase + time * view.spinRate;
    object.rotation.z = view.lean;
    const dt = view.lastTime === null ? 0 : Math.max(0, time - view.lastTime);
    settleKick(view, time, dt);
    breaks.settle(view, enemy, dt);
    const stage = Math.max(0, Math.min(3, enemy.crackStage || 0));
    let glow = CRACK_GLOW[stage];
    let reveal = CRACK_REVEAL[stage];
    if (look.vein) {
      view.pulse += dt * TAU * pulseRate(look, enemy);
      let veins = look.veinGlow;
      if (look.floor !== undefined) {
        const wave = 0.5 + 0.5 * Math.sin(view.pulse);
        veins = look.floor + (look.veinGlow - look.floor) * wave;
      }
      glow = Math.max(glow, veins);
      reveal = Math.max(reveal, look.reveal);
    }
    view.lastTime = time;
    const g = view.rock.glow;
    g[0] = glow;
    g[1] = reveal;
    g[2] = Math.max(0.035 + stage * 0.012, look.width || 0);
    g[3] = flash * 0.6;
    object.updateMatrixWorld();
    if (!view.hidden) rocks.push(view);
  }

  // A rock a Quarry Maw swallowed (its crushedIn) is crushed in the mouth:
  // its pieces (rockBreak.js) and its own chips and dust (the shot's, by
  // material) leave out of the jaws' sides. False for any other.
  function crushRock(view, sparks) {
    const at = view.body?.crushedIn;
    if (!at) return false;
    const kind = SPARK_KIND[strikeOf(view.body)];
    view.body = null;
    breaks.crush(view, at.facing);
    for (const side of [1, -1]) {
      const a = at.facing + side * CRUSH_SPRAY;
      sparks?.emit(at.x, at.y, Math.cos(a), Math.sin(a), 0, 0, true, kind);
    }
    return true;
  }

  return {
    rocks,
    rockFamilies,
    createRock,
    bindRock,
    updateRock,
    updateFog,
    refreshSurfaceMaps,
    kick,
    struck: breaks.struck,
    split: breaks.split,
    crumble: breaks.crumble,
    crush: crushRock,
    updateBreaks: breaks.update,
  };
}
