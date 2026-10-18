// Warden views, one kind each: Prime (a ring of plate segments around a hot
// core, shedding segments by phase), Choir (three singing cores on arms
// around a dark hub, breaking away) and Null (a dark core inside eight plates
// that open into an orbit and are shed, and the rings of its inverted pull),
// in the grooved plate material, with their telegraphs.

import { PALETTE } from '../../../data/constants/palette.js';
import { WARDEN_KINDS } from '../../../data/enemies/boss.js';
import { bakePlateMaps } from '../bakedMaps.js';
import { colorOf } from '../batches.js';
import { mergeStatic } from '../mergeStatic.js';
import { addRimLight } from '../rimLight.js';

const WARDEN_SEGMENTS = 6;
// Choir and Null views are drawn in field pixels (their bodies come from the
// boss: `cores`, `plates`); Prime is a unit model scaled by the radius.
const CHOIR_CORE_PX = 28;
const CHOIR_SHARDS = 5;
const NULL_CLOSED_PX = 70;
const BREAK_SECONDS = 1.6;
const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
// Baked plate maps (bakedMaps.js) on the segments, arms and plates.
// proposta 18/10: strengths.
const PLATE_NORMAL_SCALE = 0.7;
const PLATE_AO = 0.8;

// Energy orb: emissive brightest where the surface faces the camera, so the
// core reads as a volume of light instead of a flat disc.
function patchHotCore(shader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    `#include <emissivemap_fragment>
    float facing = max(dot(normal, normalize(vViewPosition)), 0.0);
    totalEmissiveRadiance *= 0.15 + 1.1 * pow(facing, 1.6);`
  );
}

/**
 * Warden views.
 * @param {object} kit - the mirror's toolkit (enemyMirror.js createKit), never
 *   the mirror itself.
 */
export function createWardenViews(kit) {
  const { THREE } = kit;
  // The Wardens' segments, arms and plates: the plate look plus grooved
  // surface maps on their UVs.
  const plateMaps = bakePlateMaps(THREE, kit.mapSeed);
  // clone() drops the rim patch (and userData functions): add it again
  const wardenPlateMaterial = addRimLight(kit.plateMaterial.clone());
  Object.assign(wardenPlateMaterial, plateMaps, {
    normalScale: new THREE.Vector2(PLATE_NORMAL_SCALE, PLATE_NORMAL_SCALE),
    aoMapIntensity: PLATE_AO,
  });

  const arc = ((Math.PI * 2) / WARDEN_SEGMENTS) * 0.8;
  // diamond cross-section, flattened: machined plates, not a tube
  const wardenSegment = new THREE.TorusGeometry(1, 0.22, 4, 10, arc);
  wardenSegment.rotateX(Math.PI / 2);
  wardenSegment.scale(1, 0.55, 1);
  wardenSegment.rotateY(-arc / 2);
  // Choir: a machined arm from the hub to a core; shards for its break.
  const choirArm = new THREE.BoxGeometry(1, 0.5, 1);
  choirArm.translate(0.5, 0, 0);
  // the arm is drawn ~7× longer than wide: repeat the plate maps along it
  const armUv = choirArm.getAttribute('uv');
  for (let i = 0; i < armUv.count; i += 1) armUv.setX(i, armUv.getX(i) * 2);
  const shardGeometry = new THREE.TetrahedronGeometry(1, 0);
  // Null: one curved plate of the shell, centred on its own origin.
  const plateArc = (TAU / 8) * 0.82;
  const nullPlate = new THREE.TorusGeometry(1, 0.3, 4, 6, plateArc);
  nullPlate.rotateX(Math.PI / 2);
  nullPlate.scale(1, 0.8, 1);
  nullPlate.rotateY(-plateArc / 2);
  nullPlate.translate(-1, 0, 0);
  // aoMap reads uv2
  [wardenSegment, choirArm, shardGeometry, nullPlate].forEach((geometry) =>
    geometry.setAttribute('uv2', geometry.getAttribute('uv'))
  );

  // One view kind per Warden: the boss's `bossKind` picks the body.
  function createWarden(kind) {
    if (kind === 'boss-choir') return createChoir();
    if (kind === 'boss-null') return createNull();
    return createPrime();
  }

  function wardenCoreMaterial(intensity) {
    const material = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, '#120a1a'),
      emissive: colorOf(THREE, PALETTE.boss),
      emissiveIntensity: intensity,
      roughness: 0.35,
      metalness: 0.2,
    });
    material.onBeforeCompile = patchHotCore;
    return material;
  }

  function createPrime() {
    const group = new THREE.Group();
    // one mesh; the phases shed segments by shortening its draw range, so
    // each Prime owns its geometry
    const ring = new THREE.Mesh(
      mergeStatic(
        THREE,
        Array.from({ length: WARDEN_SEGMENTS }, (_, i) => ({
          geometry: wardenSegment,
          rotationY: (i / WARDEN_SEGMENTS) * Math.PI * 2,
        }))
      ),
      wardenPlateMaterial
    );
    const coreMaterial = wardenCoreMaterial(1.3);
    const core = new THREE.Mesh(kit.sphere, coreMaterial);
    core.scale.setScalar(0.45);
    group.add(ring, core);
    kit.scene.add(group);

    return {
      kind: 'boss',
      object: group,
      ring,
      core,
      coreMaterial,
      rims: [kit.rim(group, kit.circleRim, 1.24)],
      rimColor: kit.rimColors.boss,
      telegraph: kit.createTelegraph(),
      id: null,
    };
  }

  // Three cores on arms around a dark hub; each core owns its material so it
  // can sing (lit) or stay dim, and its arm and shards for the break.
  function createChoir() {
    const group = new THREE.Group();
    const hub = new THREE.Mesh(kit.sphere, kit.darkMaterial);
    hub.scale.set(22, 14, 22);
    group.add(hub);
    const hubRim = kit.rim(group, kit.circleRim, 30);
    const halos = [];
    const cores = [];
    for (let i = 0; i < 3; i += 1) {
      const pivot = new THREE.Group();
      const arm = new THREE.Mesh(choirArm, wardenPlateMaterial);
      arm.scale.set(90 - CHOIR_CORE_PX, 6, 9);
      const coreMaterial = wardenCoreMaterial(0.2);
      const core = new THREE.Mesh(kit.sphere, coreMaterial);
      core.position.x = 90;
      core.scale.setScalar(CHOIR_CORE_PX);
      // the singing halo: a rim whose gain beats (it was its opacity)
      const haloTone = kit.tone(PALETTE.boss, 1.3);
      const halo = kit.rim(pivot, kit.circleRim, 1, haloTone.color);
      halo.anchor.position.x = 90;
      halos.push(halo);
      const shards = [];
      for (let k = 0; k < CHOIR_SHARDS; k += 1) {
        const shard = new THREE.Mesh(shardGeometry, wardenPlateMaterial);
        shard.visible = false;
        shards.push(shard);
        pivot.add(shard);
      }
      pivot.add(arm, core);
      group.add(pivot);
      cores.push({
        pivot,
        arm,
        core,
        coreMaterial,
        halo: halo.anchor,
        haloTone,
        shards,
      });
    }
    kit.scene.add(group);
    return {
      kind: 'boss-choir',
      object: group,
      cores,
      rims: [hubRim, ...halos],
      rimColor: kit.rimColors.boss,
      telegraph: kit.createTelegraph(3),
      id: null,
    };
  }

  // A dark core inside eight plates; the plates open into an orbit, then are
  // shed. Two rings announce and show the inverted XP pull.
  function createNull() {
    const group = new THREE.Group();
    const coreMaterial = wardenCoreMaterial(0.5);
    coreMaterial.color.copy(colorOf(THREE, '#05030a'));
    const core = new THREE.Mesh(kit.sphere, coreMaterial);
    const rim = kit.rim(group, kit.circleRim);
    const plates = [];
    for (let i = 0; i < 8; i += 1) {
      const mesh = new THREE.Mesh(nullPlate, wardenPlateMaterial);
      mesh.scale.setScalar(NULL_CLOSED_PX);
      plates.push({ mesh, shed: null });
      group.add(mesh);
    }
    const pullRings = [0, 1].map(() => {
      const ring = new THREE.Mesh(
        kit.warnRing,
        new THREE.MeshBasicMaterial({
          color: colorOf(THREE, PALETTE.xp),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          toneMapped: false,
        })
      );
      ring.position.y = 1;
      ring.visible = false;
      group.add(ring);
      return ring;
    });
    group.add(core);
    kit.scene.add(group);
    return {
      kind: 'boss-null',
      object: group,
      core,
      coreMaterial,
      rim: rim.anchor,
      rims: [rim],
      rimColor: kit.rimColors.boss,
      plates,
      pullRings,
      shedAt: null,
      telegraph: kit.createTelegraph(),
      id: null,
    };
  }

  // A pooled Choir or Null comes back whole.
  function bindWarden(view) {
    if (view.kind === 'boss-choir') {
      view.cores.forEach((core) => {
        core.broken = null;
        core.pivot.visible = true;
        core.pivot.position.set(0, 0, 0);
        core.pivot.rotation.set(0, 0, 0);
        core.shards.forEach((shard) => (shard.visible = false));
      });
      return;
    }
    if (view.kind === 'boss-null') {
      view.shedAt = null;
      view.plates.forEach((plate) => {
        plate.shed = null;
        plate.mesh.visible = true;
        plate.mesh.rotation.set(0, 0, 0);
        plate.mesh.scale.setScalar(NULL_CLOSED_PX);
      });
    }
  }

  function updateWarden(view, boss, time) {
    if (view.kind === 'boss-choir') updateChoir(view, boss, time);
    else if (view.kind === 'boss-null') updateNull(view, boss, time);
    else updatePrime(view, boss, time);
  }

  function updatePrime(view, boss, time) {
    const radius = boss.radius || 60;
    view.object.scale.setScalar(radius);
    view.object.rotation.y = -(boss.rotation || 0);
    view.ring.rotation.y = time * 0.35;
    const phase = Math.max(0, boss.currentPhase || 0);
    const intact = Math.max(1, WARDEN_SEGMENTS - phase * 2);
    const { geometry } = view.ring;
    const perSegment =
      geometry.getAttribute('position').count / WARDEN_SEGMENTS;
    geometry.setDrawRange(0, perSegment * intact);
    view.core.scale.setScalar(0.45 + phase * 0.08);
    const flash = boss.getHitFlash();
    view.coreMaterial.emissiveIntensity =
      1.25 + 0.25 * Math.sin(time * 3) + phase * 0.2 + flash * 0.8;
    kit.updateTelegraph(view.telegraph, boss, radius);
  }

  // The singing core is lit and haloed, the others dim. A broken core keeps
  // its last angle and drifts out with its arm, tumbling and going dark,
  // while shards fly from it.
  function updateChoir(view, boss, time) {
    const flash = boss.getHitFlash();
    const states = boss.cores || [];
    for (let i = 0; i < view.cores.length; i += 1) {
      const c = view.cores[i];
      const state = states[i];
      if (!state) {
        c.pivot.visible = false;
        continue;
      }
      if (state.alive) {
        const angle = Math.atan2(state.y - boss.y, state.x - boss.x);
        c.pivot.rotation.y = -angle;
        const singing = boss.singingIndex === i;
        const beat = Math.sin(time * 5 + i);
        c.coreMaterial.emissiveIntensity = singing
          ? 1.7 + 0.35 * beat + flash * 0.8
          : 0.16 + flash * 0.25;
        c.core.scale.setScalar(
          CHOIR_CORE_PX * (singing ? 1.06 + 0.04 * beat : 0.9)
        );
        c.halo.visible = singing;
        c.halo.scale.setScalar(CHOIR_CORE_PX * (1.3 + 0.08 * beat));
        kit.setGain(c.haloTone, 1.3 * (0.6 + 0.3 * beat));
        continue;
      }
      if (!c.broken) {
        c.broken = { start: time };
        c.halo.visible = false;
      }
      const age = time - c.broken.start;
      if (age > BREAK_SECONDS) {
        c.pivot.visible = false;
        continue;
      }
      const u = age / BREAK_SECONDS;
      // out along the arm, sinking and tipping as it goes
      c.pivot.position.set(0, -40 * u * u, 0);
      c.arm.position.x = 70 * u;
      c.core.position.x = 90 + 120 * u;
      c.arm.rotation.z = -1.2 * u;
      c.arm.rotation.x = 2.5 * u;
      c.core.rotation.y = 6 * u;
      c.coreMaterial.emissiveIntensity =
        (1 - u) * (1.2 + 1.2 * Math.abs(Math.sin(age * 31)));
      c.core.scale.setScalar(CHOIR_CORE_PX * (1 - 0.45 * u));
      const spray = 90 * Math.sqrt(u);
      c.shards.forEach((shard, k) => {
        const a = (k / CHOIR_SHARDS) * TAU + i;
        shard.visible = true;
        shard.position.set(
          90 + Math.cos(a) * spray + 60 * u,
          Math.sin(a * 2) * spray * 0.4 - 30 * u * u,
          Math.sin(a) * spray
        );
        shard.rotation.set(age * (3 + k), age * 2, age * (1 + k));
        shard.scale.setScalar(9 * (1 - u) + 2);
      });
    }
    const t = boss.telegraph;
    kit.updateTelegraph(
      view.telegraph,
      boss,
      t?.type === 'fan' ? CHOIR_CORE_PX * 1.3 : boss.radius || 118
    );
  }

  // Plates follow the boss's own positions (closed shell, then open orbit);
  // once shed they fly out, tumbling and shrinking. The core brightens when
  // exposed. The pull rings close in during the windup and ripple outward
  // while the XP pull is inverted.
  function updateNull(view, boss, time) {
    const flash = boss.getHitFlash();
    const phase = Math.max(0, boss.currentPhase || 0);
    const exposed = phase >= 2;
    const radius = boss.radius || NULL_CLOSED_PX;
    view.core.scale.setScalar(radius * (exposed ? 0.62 : 0.52));
    view.coreMaterial.emissiveIntensity = exposed
      ? 2.2 + 0.5 * Math.sin(time * 6) + flash * 0.8
      : 0.25 + 0.1 * Math.sin(time * 2) + flash * 0.6;
    view.rim.scale.setScalar(radius * (exposed ? 0.8 : 1.25));
    view.rim.visible = exposed || (boss.shellOpen || 0) > 0.2;

    const states = boss.plates || [];
    if (boss.shellShed && view.shedAt === null) view.shedAt = time;
    const shedAge = view.shedAt === null ? 0 : time - view.shedAt;
    for (let i = 0; i < view.plates.length; i += 1) {
      const plate = view.plates[i];
      const state = states[i];
      const { mesh } = plate;
      if (!state) {
        mesh.visible = false;
        continue;
      }
      const dx = state.x - boss.x;
      const dy = state.y - boss.y;
      const angle = Math.atan2(dy, dx);
      if (view.shedAt === null) {
        mesh.visible = true;
        mesh.position.set(dx, 0, dy);
        mesh.rotation.set(0, -angle, 0);
        // an open plate tilts up, so it reads as loose
        mesh.rotation.z = (boss.shellOpen || 0) * 0.5;
        continue;
      }
      if (!plate.shed) plate.shed = { x: dx, y: dy, angle };
      if (shedAge > BREAK_SECONDS) {
        mesh.visible = false;
        continue;
      }
      const u = shedAge / BREAK_SECONDS;
      const out = 260 * u;
      const a = plate.shed.angle;
      mesh.position.set(
        plate.shed.x + Math.cos(a) * out,
        30 * Math.sin(u * Math.PI) - 20 * u,
        plate.shed.y + Math.sin(a) * out
      );
      mesh.rotation.set(shedAge * (2 + (i % 3)), -a + shedAge, shedAge * 3);
      mesh.scale.setScalar(NULL_CLOSED_PX * (1 - 0.7 * u));
    }

    const state = boss.pullState;
    view.pullRings.forEach((ring, k) => {
      ring.visible = state === 'windup' || state === 'inverting';
      if (!ring.visible) return;
      let r;
      let opacity;
      if (state === 'windup') {
        const p = clamp01(
          1 - (boss.pullStateTimer || 0) / WARDEN_KINDS.null.pullWindup
        );
        r = 260 - 170 * p + k * 30;
        opacity = 0.2 + 0.6 * p;
      } else {
        const w = (time * 1.4 + k * 0.5) % 1;
        r = 90 + 300 * w;
        opacity = 0.75 * (1 - w);
      }
      ring.scale.set(r, 1, r);
      ring.material.opacity = opacity;
    });

    kit.updateTelegraph(view.telegraph, boss, radius);
  }

  // Quality preset flipped (EnemyMirror.setSurfaceMaps): the plate maps on
  // or off (one recompile).
  function refreshSurfaceMaps() {
    const enabled = kit.quality.surfaceMaps;
    const plate = wardenPlateMaterial;
    Object.keys(plateMaps).forEach((name) => {
      plate[name] = enabled ? plateMaps[name] : null;
    });
    plate.needsUpdate = true;
  }

  return { createWarden, bindWarden, updateWarden, refreshSurfaceMaps };
}
