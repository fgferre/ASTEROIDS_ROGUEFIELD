// Elite looks: the gold accent and the six gold blades that orbit an Elite,
// and its affixes — a badge sprite per affix over the enemy (the 2D glyphs
// baked once into a texture each) and the live parts: the Shielded plate,
// Swift's afterimages, Warded's ring, the Volatile fuse's blast ring.

import { PALETTE } from '../../../data/constants/palette.js';
import { AFFIX_IDS, ELITE_AFFIXES } from '../../../data/enemies/affixes.js';
import { drawAffixBadge } from '../../enemies/components/affixGlyphs.js';
import { colorOf } from '../batches.js';
import { loft, spline } from './shapes.js';

const ELITE_BLADES = 6;
const BADGE_PX = 13; // world size of an affix badge sprite
const BADGE_TEXTURE = 64;
const SWIFT_GHOSTS = [0.05, 0.1, 0.15]; // seconds behind, as in 2D
const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
// An Elite blade over its length (0 trailing end, 1 the tip): half-width,
// half-thickness, and its orbit radius (the tip hooks outward).
const BLADE_SPAN = (TAU / ELITE_BLADES) * 0.5;
const bladeWidth = spline([0, 0.022, 0.3, 0.032, 0.75, 0.022, 1, 0]);
const bladeThick = spline([0, 0.016, 0.3, 0.022, 0.75, 0.016, 1, 0.003]);
const bladeOrbit = (t) => 1.225 + 0.04 * t * t;
const BLADE_BANK = 0.25;

/**
 * Elite and affix views.
 * @param {object} kit - the mirror's toolkit (enemyMirror.js createKit), never
 *   the mirror itself.
 */
export function createAffixViews(kit) {
  const { THREE } = kit;
  // Accent energy: gold on an Elite.
  const goldColor = colorOf(THREE, PALETTE.xp);
  // Six curved blades, a faceted diamond in section, tip first along the
  // turn (rotation.y grows: the orbit runs toward −angle); unlit gold with
  // their facets' shading baked in (bladeGeometry), so they glow, cast
  // nothing and still read solid from any side.
  function bladeParts() {
    const blade = loft(
      THREE,
      9,
      4,
      (t) => {
        const a = BLADE_SPAN * (0.5 - t);
        const r = bladeOrbit(t);
        return {
          at: [Math.cos(a) * r, 0, Math.sin(a) * r],
          w: bladeWidth(t) + 0.002,
          top: bladeThick(t),
          bottom: bladeThick(t),
        };
      },
      { start: 'flat', end: 'smooth' }
    );
    // banked like a rotor blade, its outer edge up
    blade.translate(-bladeOrbit(0.5), 0, 0);
    blade.rotateZ(BLADE_BANK);
    blade.translate(bladeOrbit(0.5), 0, 0);
    return Array.from({ length: ELITE_BLADES }, (_, i) => ({
      geometry: blade,
      flat: true,
      rotationY: (i * TAU) / ELITE_BLADES,
    }));
  }
  function bladeGeometry() {
    const geometry = kit.merged('elite-ring', bladeParts);
    if (geometry.getAttribute('color')) return geometry;
    // facets lit from above and outside: a bright ridge on the outer top
    // face, the inner and lower ones darker
    const normal = geometry.getAttribute('normal');
    const position = geometry.getAttribute('position');
    const colors = new Float32Array(normal.count * 3);
    const n = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < normal.count; i += 1) {
      n.fromBufferAttribute(normal, i);
      const out =
        (n.x * position.getX(i) + n.z * position.getZ(i)) /
        Math.hypot(position.getX(i), position.getZ(i));
      const lit = 0.12 + 0.35 * Math.max(0, n.y) + 0.75 * Math.max(0, out);
      c.copy(goldColor).multiplyScalar(lit);
      c.toArray(colors, i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  }
  const bladeMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false,
  });

  // Badge textures are baked once, in warm() (badgeMaterials).
  let bakedBadges = null;
  const glow = (hex, opacity, extra = {}) =>
    new THREE.MeshBasicMaterial({
      color: colorOf(THREE, hex),
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      ...extra,
    });
  const shieldEdgeMaterial = kit.emissive(ELITE_AFFIXES.shielded.color, 1.1);
  // Swift: faint lime copies of the hull, front faces only. Additive but in
  // the opaque pass and drawn before it (renderOrder −1): the hull covers
  // them, so they show only behind it, never as patches on it.
  const ghostMaterials = SWIFT_GHOSTS.map((_, i) =>
    glow(ELITE_AFFIXES.swift.color, 0.2 * (1 - i / 3), { transparent: false })
  );
  // Warded: a glowing tube round the hull, a bright core in a faint halo
  // (one mesh, its two tones in vertex colours)
  const wardMaterial = glow(ELITE_AFFIXES.warded.color, 0.8, {
    vertexColors: true,
  });
  const wardTorus = (tube, color) => {
    const geometry = new THREE.TorusGeometry(1, tube, 6, 48);
    geometry.rotateX(Math.PI / 2);
    return { geometry, color: new THREE.Color(color, color, color) };
  };

  // Elite: accent energy burns gold and six gold blades orbit the
  // silhouette. Pooled views can come back with either flag.
  function applyElite(view, elite) {
    if (view.elite === elite) return;
    view.elite = elite;
    const accent = elite ? goldColor : kit.threatColor;
    for (let i = 0; i < view.accents.length; i += 1) {
      const material = view.accents[i];
      material.userData.base.copy(accent);
      if (material.userData.gain !== undefined)
        kit.setGain(material, material.userData.gain);
    }
    if (view.material)
      view.material.userData.rockUniforms.uVein.value.copy(accent);
    view.rimColor = elite ? kit.rimColors.elite : kit.rimColors.threat;
    if (elite && !view.eliteRing) {
      view.eliteRing = kit.seeded(
        () => new THREE.Mesh(bladeGeometry(), bladeMaterial)
      );
      view.object.add(view.eliteRing);
    }
    if (view.eliteRing) view.eliteRing.visible = elite;
  }

  /**
   * affix id → badge sprite material, baked once (seeded: three names each
   * texture and material with Math.random); warm() bakes them ahead of play.
   */
  function badgeMaterials() {
    bakedBadges ??= kit.seeded(() => bakeBadges());
    return bakedBadges;
  }

  function bakeBadges() {
    const badges = {};
    AFFIX_IDS.forEach((id) => {
      const canvas = document.createElement('canvas');
      canvas.width = BADGE_TEXTURE;
      canvas.height = BADGE_TEXTURE;
      const ctx = canvas.getContext('2d');
      ctx.translate(BADGE_TEXTURE / 2, BADGE_TEXTURE / 2);
      drawAffixBadge(ctx, ELITE_AFFIXES[id], BADGE_TEXTURE * 0.44, 5);
      const texture = new THREE.CanvasTexture(canvas);
      texture.encoding = THREE.sRGBEncoding;
      badges[id] = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
    });
    return badges;
  }

  // The hull Swift's afterimages copy: the view's first merged matte body
  // (the Bulwark's, not its plate), else its biggest mesh (the Husk's rock).
  const hullAt = new THREE.Vector3();
  const hullTurn = new THREE.Quaternion();
  const hullSize = new THREE.Vector3();
  const vertices = (mesh) => mesh.geometry.getAttribute('position').count;
  function hullOf(view) {
    let body = null;
    let biggest = null;
    view.object.traverse((o) => {
      if (!o.isMesh || o === view.eliteRing) return;
      if (!body && o.material === kit.machineMaterial) body = o;
      if (!biggest || vertices(o) > vertices(biggest)) biggest = o;
    });
    return body ?? biggest;
  }

  // Parts live in their own field-space group (not under the view, which
  // turns and scales with the hull), built the first time a view needs them.
  function createAffixParts(view) {
    const group = new THREE.Group();
    const badges = [0, 1].map(() => {
      // its material (badgeMaterials) is set per frame; the program is the
      // damage numbers' (TextSprites), already compiled
      const sprite = new THREE.Sprite();
      sprite.scale.setScalar(BADGE_PX);
      sprite.renderOrder = 10;
      return sprite;
    });
    const plate = new THREE.Group();
    plate.add(
      new THREE.Mesh(kit.bulwarkPlate, kit.machineMaterial),
      new THREE.Mesh(kit.bulwarkEdge, shieldEdgeMaterial)
    );
    const hull = hullOf(view);
    const ghosts = ghostMaterials.map((material) => {
      const ghost = new THREE.Mesh(hull.geometry, material);
      ghost.renderOrder = -1;
      return ghost;
    });
    const ward = new THREE.Mesh(
      kit.merged('elite-ward', () => [
        wardTorus(0.018, 1),
        wardTorus(0.05, 0.3),
      ]),
      wardMaterial
    );
    const fuseMaterial = new THREE.MeshBasicMaterial({
      color: colorOf(THREE, ELITE_AFFIXES.volatile.color),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const fuse = new THREE.Mesh(kit.fuseRing, fuseMaterial);
    const fuseInner = new THREE.Mesh(kit.fuseRing, fuseMaterial);
    group.add(...badges, plate, ...ghosts, ward, fuse, fuseInner);
    kit.scene.add(group);
    return { group, badges, plate, hull, ghosts, ward, fuse, fuseInner };
  }

  function updateAffixes(view, enemy, time) {
    view.affix ??= kit.seeded(() => createAffixParts(view));
    const parts = view.affix;
    const { affixes } = enemy;
    parts.group.visible = affixes.length > 0;
    if (!parts.group.visible) return;
    const r = enemy.radius || 12;
    parts.group.position.copy(view.object.position);

    parts.badges.forEach((badge, i) => {
      badge.visible = i < affixes.length;
      if (!badge.visible) return;
      badge.material = badgeMaterials()[affixes[i]];
      const x = (i - (affixes.length - 1) / 2) * BADGE_PX * 1.05;
      badge.position.set(x, r * 0.8, -(r * 1.25 + BADGE_PX * 0.6));
    });

    const shielded = enemy.hasAffix('shielded') && !enemy.shieldBroken;
    parts.plate.visible = shielded;
    if (shielded) {
      parts.plate.scale.setScalar(r * 1.08);
      parts.plate.rotation.y = -(enemy.facing || 0);
      const ratio = clamp01(enemy.shieldHealth / enemy.maxShieldHealth);
      kit.setGain(shieldEdgeMaterial, 0.3 + 0.6 * ratio);
    }

    const speed = Math.hypot(enemy.vx, enemy.vy);
    const trail = enemy.hasAffix('swift') && speed >= 20;
    if (trail) {
      parts.hull.updateWorldMatrix(true, false);
      parts.hull.matrixWorld.decompose(hullAt, hullTurn, hullSize);
      hullAt.sub(parts.group.position);
    }
    parts.ghosts.forEach((ghost, i) => {
      ghost.visible = trail;
      if (!trail) return;
      const t = SWIFT_GHOSTS[i];
      ghost.position.set(-enemy.vx * t, 0, -enemy.vy * t).add(hullAt);
      ghost.quaternion.copy(hullTurn);
      ghost.scale.copy(hullSize).multiplyScalar(1 - 0.08 * i);
    });

    const warded = enemy.age < enemy.wardedUntil;
    parts.ward.visible = warded;
    if (warded) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 14);
      parts.ward.scale.setScalar(r * (1.3 + 0.08 * pulse) + 2);
      wardMaterial.opacity = 0.4 + 0.5 * pulse;
    }

    const lit = enemy.volatileFuse !== null;
    parts.fuse.visible = lit;
    parts.fuseInner.visible = lit;
    if (lit) {
      const { fuse, radius } = ELITE_AFFIXES.volatile;
      const progress = clamp01(1 - enemy.volatileFuse / fuse);
      parts.fuse.scale.setScalar(radius);
      parts.fuseInner.scale.setScalar(Math.max(1, radius * progress));
      parts.fuse.material.opacity = 0.3 + 0.5 * progress;
    }
  }

  // Warm-up (EnemyMirror.warm): `view` as an Elite with every affix part
  // and badge on show, so their programs compile now too.
  function showAll(view) {
    applyElite(view, true);
    view.affix ??= kit.seeded(() => createAffixParts(view));
    view.affix.group.visible = true;
    view.affix.group.children.forEach((part) => (part.visible = true));
    view.affix.badges.forEach(
      (badge, n) => (badge.material = badgeMaterials()[AFFIX_IDS[n]])
    );
  }

  return {
    applyElite,
    badgeMaterials,
    showAll,
    updateAffixes,
    // affix id → badge material once baked, else null
    get badges() {
      return bakedBadges;
    },
  };
}
