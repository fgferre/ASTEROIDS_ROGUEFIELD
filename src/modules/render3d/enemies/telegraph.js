// Telegraphs on the field plane: the charge lane (or the Null's dark lane
// between violet edges), the spread fan, the warning ring and the Choir's
// converging beams. The Ram and the Wardens draw them; built once into the
// toolkit (enemyMirror.js createKit) as kit.createTelegraph and
// kit.updateTelegraph.

import { PALETTE } from '../../../data/constants/palette.js';
import { HALF_H, HALF_W, colorOf } from '../batches.js';

/**
 * Telegraph parts and their per-frame update.
 * @param {object} kit - the mirror's toolkit as built so far (THREE, scene,
 *   seeded, warnRing, threatColor, bossColor), never the mirror itself.
 */
export function createTelegraphs(kit) {
  const { THREE } = kit;
  // telegraph pieces (flat on the field plane)
  const lanePlane = new THREE.PlaneGeometry(1, 1);
  lanePlane.rotateX(-Math.PI / 2);
  lanePlane.translate(0.5, 0, 0);
  const fanGeometries = new Map();

  // Charge lane / fan / warning ring on the field plane (Wardens and Ram);
  // `beams` lines for the Choir's converging volley.
  function createTelegraph(beams = 0) {
    const additive = (hex) =>
      new THREE.MeshBasicMaterial({
        color: colorOf(THREE, hex),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
    const group = new THREE.Group();
    const lane = new THREE.Mesh(lanePlane, additive(PALETTE.threat));
    const line = new THREE.Mesh(lanePlane, additive(PALETTE.threat));
    const fan = new THREE.Mesh(lanePlane, additive(PALETTE.threat));
    const warn = new THREE.Mesh(kit.warnRing, additive(PALETTE.threat));
    // the Null's lane: a dark band between two violet edges
    const dark = new THREE.Mesh(
      lanePlane,
      new THREE.MeshBasicMaterial({
        color: colorOf(THREE, '#030106'),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    const edges = [0, 1].map(
      () => new THREE.Mesh(lanePlane, additive(PALETTE.boss))
    );
    const beamList = [];
    for (let i = 0; i < beams; i += 1) {
      beamList.push(new THREE.Mesh(lanePlane, additive(PALETTE.threat)));
    }
    group.add(lane, line, fan, warn, dark, ...edges, ...beamList);
    group.visible = false;
    kit.scene.add(group);
    return { group, lane, line, fan, warn, dark, edges, beams: beamList };
  }

  function fanGeometry(arc) {
    const key = Math.round(arc * 100);
    let geometry = fanGeometries.get(key);
    if (!geometry) {
      geometry = kit.seeded(
        () => new THREE.CircleGeometry(1, 32, -arc / 2, arc)
      );
      geometry.rotateX(-Math.PI / 2);
      fanGeometries.set(key, geometry);
    }
    return geometry;
  }

  // Charge lane / spread fan on the field plane, same timing as the 2D path
  // (EffectsSystem.drawTelegraphs).
  function updateTelegraph(parts, boss, radius) {
    const t = boss.telegraph;
    parts.group.visible = Boolean(t);
    if (!t) return;
    const duration = t.duration > 0 ? t.duration : 1;
    const progress = Math.min(1, Math.max(0, 1 - t.timer / duration));
    const pulse = 0.5 + 0.5 * Math.sin(progress * Math.PI * 6);
    const r = Math.max(20, radius);
    const ox = Number.isFinite(t.x) ? t.x : boss.x;
    const oy = Number.isFinite(t.y) ? t.y : boss.y;
    parts.group.position.set(ox - HALF_W, 1, oy - HALF_H);
    const chorus = t.type === 'chorus';
    parts.group.rotation.y = chorus ? 0 : -(t.angle || 0);
    const charge = t.type === 'charge';
    const dark = charge && t.tone === 'dark';
    parts.lane.visible = charge && !dark;
    parts.dark.visible = dark;
    parts.edges.forEach((edge) => (edge.visible = dark));
    parts.line.visible = charge;
    parts.fan.visible = t.type === 'fan';
    parts.beams.forEach((beam, i) => {
      const line = chorus ? t.lines?.[i] : null;
      beam.visible = Boolean(line);
      if (!line) return;
      beam.position.set(line.x - ox, 0, line.y - oy);
      beam.rotation.y = -line.angle;
      beam.scale.set(Math.max(1, line.length), 1, 2 + 4 * progress);
      beam.material.opacity = (0.3 + 0.6 * progress) * (0.7 + 0.3 * pulse);
    });
    if (charge) {
      const length = Math.max(r * 2, t.length || 400);
      parts.line.material.color.copy(dark ? kit.bossColor : kit.threatColor);
      parts.line.scale.set(length, 1, 2);
      parts.line.material.opacity = 0.35 + 0.55 * progress;
      if (dark) {
        parts.dark.scale.set(length, 1, r * 1.8);
        parts.dark.material.opacity = 0.35 + 0.4 * progress;
        parts.edges.forEach((edge, i) => {
          edge.position.z = (i ? 1 : -1) * r * 0.9;
          edge.scale.set(length, 1, 3);
          edge.material.opacity = 0.3 + 0.6 * progress;
        });
      } else {
        parts.lane.scale.set(length, 1, r * 1.8);
        parts.lane.material.opacity = 0.08 + 0.18 * progress;
      }
    } else if (t.type === 'fan') {
      const arc = Math.max(0.1, t.arc || 0.8);
      const length = Math.max(r * 1.5, t.length || 180);
      parts.fan.geometry = fanGeometry(arc);
      parts.fan.scale.set(length, 1, length);
      parts.fan.material.opacity = 0.07 + 0.2 * progress;
    }
    const ring = r * (1.15 + 0.1 * pulse);
    parts.warn.scale.set(ring, 1, ring);
    parts.warn.material.opacity = (0.2 + 0.5 * progress) * (0.6 + 0.4 * pulse);
  }

  return { createTelegraph, updateTelegraph };
}
