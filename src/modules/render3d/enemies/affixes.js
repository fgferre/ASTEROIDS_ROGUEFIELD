// Elite looks: the gold accent and the slow dashed gold ring an Elite
// wears, and its affixes — a badge sprite per affix over the enemy (the 2D
// glyphs baked once into a texture each) and the live parts: the Shielded
// plate, Swift's ghosts, Warded's ring, the Volatile fuse's blast ring.

import { PALETTE } from '../../../data/constants/palette.js';
import { AFFIX_IDS, ELITE_AFFIXES } from '../../../data/enemies/affixes.js';
import { drawAffixBadge } from '../../enemies/components/affixGlyphs.js';
import { colorOf } from '../batches.js';

const ELITE_DASHES = 6;
const BADGE_PX = 13; // world size of an affix badge sprite
const BADGE_TEXTURE = 64;
const SWIFT_GHOSTS = [0.05, 0.1, 0.15]; // seconds behind, as in 2D
const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/**
 * Elite and affix views.
 * @param {object} kit - the mirror's toolkit (enemyMirror.js createKit), never
 *   the mirror itself.
 */
export function createAffixViews(kit) {
  const { THREE } = kit;
  // Accent energy: gold on an Elite (RenderComponent accentOf).
  const goldColor = colorOf(THREE, PALETTE.xp);
  // dashed, so the slow turn of the Elite ring reads
  const eliteDash = new THREE.RingGeometry(
    1.22,
    1.27,
    8,
    1,
    0,
    (TAU / ELITE_DASHES) * 0.62
  );
  eliteDash.rotateX(-Math.PI / 2);
  const eliteDashMaterial = new THREE.MeshBasicMaterial({
    color: colorOf(THREE, PALETTE.xp).multiplyScalar(0.9),
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

  // Badge textures are baked once, in warm() (badgeMaterials).
  let bakedBadges = null;
  const glow = (hex, opacity) =>
    new THREE.MeshBasicMaterial({
      color: colorOf(THREE, hex),
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
  const shieldEdgeMaterial = kit.emissive(ELITE_AFFIXES.shielded.color, 1.1);
  const ghostMaterials = SWIFT_GHOSTS.map((_, i) =>
    glow(ELITE_AFFIXES.swift.color, 0.2 * (1 - i / 3))
  );
  const wardMaterial = glow(ELITE_AFFIXES.warded.color, 0.8);

  // Elite: accent energy burns gold and a thin dashed gold ring turns around
  // the silhouette. Pooled views can come back with either flag.
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
        () =>
          new THREE.Mesh(
            kit.merged('elite-ring', () =>
              Array.from({ length: ELITE_DASHES }, (_, i) => ({
                geometry: eliteDash,
                rotationY: (i * TAU) / ELITE_DASHES,
              }))
            ),
            eliteDashMaterial
          )
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

  // Parts live in their own field-space group (not under the view, which
  // turns and scales with the hull), built the first time a view needs them.
  function createAffixParts() {
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
      new THREE.Mesh(kit.bulwarkPlate, kit.plateMaterial),
      new THREE.Mesh(kit.bulwarkEdge, shieldEdgeMaterial)
    );
    const ghosts = ghostMaterials.map(
      (material) => new THREE.Mesh(kit.ghostDisc, material)
    );
    const ward = new THREE.Mesh(kit.warnRing, wardMaterial);
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
    return { group, badges, plate, ghosts, ward, fuse, fuseInner };
  }

  function updateAffixes(view, enemy, time) {
    view.affix ??= kit.seeded(() => createAffixParts());
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
      kit.setGain(shieldEdgeMaterial, 0.5 + 0.9 * ratio);
    }

    const speed = Math.hypot(enemy.vx, enemy.vy);
    const trail = enemy.hasAffix('swift') && speed >= 20;
    parts.ghosts.forEach((ghost, i) => {
      ghost.visible = trail;
      if (!trail) return;
      const t = SWIFT_GHOSTS[i];
      ghost.position.set(-enemy.vx * t, 0, -enemy.vy * t);
      ghost.scale.setScalar(r * (0.7 - i * 0.15));
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
    view.affix ??= kit.seeded(() => createAffixParts());
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
