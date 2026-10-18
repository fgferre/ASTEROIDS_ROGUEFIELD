// Rock views: the Ring's fragments, drawn instanced (rockInstances.js) as
// procedural rocks whose cracks light up with damage; each asteroid
// variant's look (VARIANT_LOOKS); the single-mesh rock a kill burns as;
// Dense Fog's fade and the baked surface maps' quality toggle.

import { PALETTE } from '../../../data/constants/palette.js';
import { createAsteroidGeometry, createSeededRandom } from '../asteroidMesh.js';
import { bakeRockMaps } from '../bakedMaps.js';
import { colorOf } from '../batches.js';
import { RockInstances } from '../rockInstances.js';
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
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Variant looks (§3 "Fragmento do Anel"): `base` (sRGB) multiplies the baked
// rock color; veins are the light inside, glowing between `floor` and
// `veinGlow` at `rate` Hz. A Volatile's veins race at `armedRate` once its
// fuse arms; a Parasite's quicken toward `nearRate` as it closes on the player.
// `reveal`/`width` set how much of the crack network the veins light.
// Crystal swaps to a glossy faceted material with a cold rim (`rim`).
export const VARIANT_LOOKS = {
  common: { base: '#ffffff', roughness: 0.94, metalness: 0.04 },
  iron: { base: '#f4f7ff', roughness: 0.42, metalness: 0.3 },
  denseCore: { base: '#a4b6dc', roughness: 0.7, metalness: 0.12 },
  gold: {
    base: '#ffe6b8',
    roughness: 0.5,
    metalness: 0.3,
    vein: PALETTE.xp,
    veinGlow: 0.9,
    reveal: 1,
    width: 0.03,
  },
  volatile: {
    base: '#f0d2bc',
    roughness: 0.94,
    metalness: 0.04,
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
    roughness: 0.9,
    metalness: 0.06,
    vein: PALETTE.threat,
    veinGlow: 1.2,
    floor: 0.25,
    rate: 0.7,
    nearRate: 2.6,
    reveal: 0.5,
    width: 0.05,
  },
  crystal: {
    base: '#86b8e8',
    roughness: 0.2,
    metalness: 0.05,
    vein: '#bfe8ff',
    veinGlow: 0.45,
    reveal: 0.3,
    width: 0.03,
    rim: 0.5,
    crystal: true,
  },
};
// A Parasite's pulse is at its fastest within this many logical pixels.
const PARASITE_NEAR = 80;
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
    rockGeometries.push(geometry);
  }
  const rockMaps = bakeRockMaps(THREE, kit.mapSeed);
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

  // The instanced rocks' two shared materials: stone (each variant's colour
  // and surface come per instance) and Crystal, with its cold rim.
  function createRockFamilies() {
    const stone = new THREE.MeshStandardMaterial({ vertexColors: true });
    stone.userData.rockUniforms = rockUniforms(
      THREE,
      colorOf(THREE, PALETTE.shot)
    );
    stone.userData.rockMaps = stoneMaps;
    const crystal = crystalMaterial({
      ...stone.userData.rockUniforms,
      uRim: { value: VARIANT_LOOKS.crystal.rim },
    });
    [stone, crystal].forEach((material) => {
      material.defines.ROCK_INSTANCED = '';
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
      },
    };
  }

  // A killed rock leaves its instance and burns as one of these (burnOf).
  function createBurnRock() {
    const material = new THREE.MeshStandardMaterial({ vertexColors: true });
    material.userData.rockUniforms = rockUniforms(
      THREE,
      colorOf(THREE, PALETTE.shot)
    );
    material.userData.rockMaps = stoneMaps;
    material.onBeforeCompile = patchRockShader;
    trackRockMaterial(material);
    const mesh = new THREE.Mesh(rockGeometries[0], material);
    mesh.rotation.order = 'YXZ';
    kit.scene.add(mesh);
    return {
      kind: 'asteroid-burn',
      object: mesh,
      material,
      stone: material,
      crystal: null,
      id: null,
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

  function createCrystal(view) {
    const material = crystalMaterial(view.stone.userData.rockUniforms);
    material.onBeforeCompile = patchRockShader;
    trackRockMaterial(material);
    return material;
  }

  // A killed rock's burn view (EnemyMirror.burnOf) takes over its pose and
  // look; the rock leaves its instance.
  function dressBurn(burn, view) {
    const { look, rock, object } = view;
    if (look.crystal && !burn.crystal) {
      burn.crystal = kit.seeded(() => createCrystal(burn));
    }
    const material = look.crystal ? burn.crystal : burn.stone;
    burn.material = material;
    burn.object.material = material;
    burn.object.geometry = object.geometry;
    burn.object.position.copy(object.position);
    burn.object.rotation.copy(object.rotation);
    burn.object.scale.copy(object.scale);
    burn.seed = view.seed;
    burn.radius = view.radius;
    // a twin from an earlier burn copied the look it had then
    [material, burn.dissolve?.twins.get(material)].forEach((target) => {
      if (!target) return;
      target.color.copy(rock.base);
      target.roughness = rock.surface[0];
      target.metalness = rock.surface[1];
    });
    const uniforms = material.userData.rockUniforms;
    uniforms.uVein.value.copy(rock.vein);
    uniforms.uSeed.value.copy(rock.seed);
    uniforms.uRim.value = look.rim || 0;
    [
      uniforms.uGlow.value,
      uniforms.uReveal.value,
      uniforms.uWidth.value,
      uniforms.uFlash.value,
    ] = rock.glow;
    object.visible = false;
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

  // A rock view takes its seed's shape, spin and lean and its variant's look.
  function bindRock(view, enemy) {
    const seed = view.seed;
    view.shape = seed % ROCK_SHAPES;
    view.object.geometry = rockGeometries[view.shape];
    const random = createSeededRandom((seed % 100000) + 1);
    view.spinRate = (0.25 + random() * 0.5) * (random() < 0.5 ? -1 : 1);
    view.spinPhase = random() * Math.PI * 2;
    view.lean = (random() - 0.5) * 1.2;
    const look = VARIANT_LOOKS[enemy.variant] || VARIANT_LOOKS.common;
    view.look = look;
    view.pulse = view.spinPhase;
    view.lastTime = null;
    view.family = look.crystal ? 'crystal' : 'stone';
    view.object.material = rockFamilies[view.family];
    const { rock } = view;
    rock.base.set(look.base).convertSRGBToLinear();
    rock.vein.set(look.vein || PALETTE.shot).convertSRGBToLinear();
    rock.surface[0] = look.roughness;
    rock.surface[1] = look.metalness;
    rock.seed.set(random() * 50, random() * 50, random() * 50);
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
    if (view.look !== (VARIANT_LOOKS[enemy.variant] || VARIANT_LOOKS.common)) {
      bindRock(view, enemy);
    }
    const { object, look } = view;
    object.scale.setScalar((enemy.radius || 12) * ROCK_SCALE);
    object.rotation.y = -(enemy.rotation || 0);
    object.rotation.x = view.spinPhase + time * view.spinRate;
    object.rotation.z = view.lean;
    const stage = Math.max(0, Math.min(3, enemy.crackStage || 0));
    let glow = CRACK_GLOW[stage];
    let reveal = CRACK_REVEAL[stage];
    if (look.vein) {
      const dt = view.lastTime === null ? 0 : Math.max(0, time - view.lastTime);
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
    g[3] = flash * 0.45;
    object.updateMatrixWorld();
    rocks.push(view);
  }

  return {
    rocks,
    rockFamilies,
    createRock,
    createBurnRock,
    dressBurn,
    bindRock,
    updateRock,
    updateFog,
    refreshSurfaceMaps,
  };
}
