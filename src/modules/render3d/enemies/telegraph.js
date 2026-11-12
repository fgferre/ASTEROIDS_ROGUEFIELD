// Telegraphs on the field plane: the charge lane (or the Null's dark lane
// between violet edges, or the Gatekeeper's strip), a marksman's aim line,
// the spread fan (and the Quarry Maw's intake cone, the same wedge), the
// warning ring and the beams (the Choir's converging lines, the Maw's eject
// fan, the Gatekeeper's barrier and its gap, the Prism Crown's reflected
// beams), the Kiln Engine's hot wedges and slag pools (flat fans and
// discs), the Foundry Mother's arms (flat ring sectors) and the
// Interdictor's cage of fences and its locked beam. The Ram, the Wardens and any recipe enemy that aims draw them;
// built once into the toolkit (enemyMirror.js createKit) as
// kit.createTelegraph and kit.updateTelegraph.

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
  const ringGeometries = new Map();

  // Charge lane / fan / warning ring on the field plane (Wardens and Ram);
  // `beams` lines for the Choir's converging volley and the Maw's eject;
  // `fans` flat wedges or discs for the Kiln Engine's sectors and pools.
  function createTelegraph(beams = 0, fans = 0) {
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
    const fanList = [];
    for (let i = 0; i < fans; i += 1) {
      fanList.push(new THREE.Mesh(lanePlane, additive(PALETTE.threat)));
    }
    group.add(lane, line, fan, warn, dark, ...edges, ...beamList, ...fanList);
    group.visible = false;
    kit.scene.add(group);
    return {
      group,
      lane,
      line,
      fan,
      warn,
      dark,
      edges,
      beams: beamList,
      fans: fanList,
    };
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

  // A ring sector `arc` wide from `inner` (a share of the outer radius, 1)
  // out, centred on +x like a fan.
  function ringGeometry(arc, inner) {
    const key = `${Math.round(arc * 100)}:${Math.round(inner * 100)}`;
    let geometry = ringGeometries.get(key);
    if (!geometry) {
      geometry = kit.seeded(
        () => new THREE.RingGeometry(inner, 1, 32, 1, -arc / 2, arc)
      );
      geometry.rotateX(-Math.PI / 2);
      ringGeometries.set(key, geometry);
    }
    return geometry;
  }

  // Charge lane / aim line / spread fan on the field plane, timed by the
  // boss's live `telegraph` state; an aim line held still (`locked`) burns
  // brighter and wider.
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
    // beams are placed on the field, not turned with the telegraph
    const chorus = t.type === 'chorus' || t.type === 'eject';
    parts.group.rotation.y = chorus ? 0 : -(t.angle || 0);
    // the Gatekeeper's strip is a charge lane of its own width
    const charge = t.type === 'charge' || t.type === 'lane';
    const aim = t.type === 'aim';
    const dark = charge && t.tone === 'dark';
    parts.lane.visible = charge && !dark;
    parts.dark.visible = dark;
    parts.edges.forEach((edge) => (edge.visible = dark));
    parts.line.visible = charge || aim;
    const intake = t.type === 'intake';
    parts.fan.visible = t.type === 'fan' || intake;
    parts.fans.forEach((fan) => (fan.visible = false));
    if (t.type === 'barrier') {
      updateBarrier(parts, t, progress, pulse);
      return;
    }
    if (t.type === 'prism') {
      updatePrism(parts, t, ox, oy, progress, pulse);
      return;
    }
    if (t.type === 'grid') {
      updateGrid(parts, t, ox, oy, progress, pulse);
      return;
    }
    if (t.type === 'lock') {
      updateLock(parts, t, progress, pulse);
      return;
    }
    if (t.type === 'sectors' || t.type === 'pools' || t.type === 'arms') {
      parts.warn.visible = false;
      parts.beams.forEach((beam) => (beam.visible = false));
      if (t.type === 'sectors') updateSectors(parts, t, progress, pulse);
      else if (t.type === 'arms') updateArms(parts, t, progress, pulse);
      else updatePools(parts, t, ox, oy);
      return;
    }
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
        parts.lane.scale.set(length, 1, t.width || r * 1.8);
        parts.lane.material.opacity = 0.08 + 0.18 * progress;
      }
    } else if (aim) {
      parts.line.material.color.copy(kit.threatColor);
      parts.line.scale.set(
        Math.max(r * 2, t.length || 900),
        1,
        t.locked ? 3 : 1.5
      );
      parts.line.material.opacity = t.locked
        ? 0.55 + 0.25 * pulse
        : 0.15 + 0.35 * progress;
    } else if (t.type === 'fan' || intake) {
      const arc = Math.max(0.1, t.arc || 0.8);
      const length = Math.max(r * 1.5, t.length || 180);
      parts.fan.geometry = fanGeometry(arc);
      parts.fan.scale.set(length, 1, length);
      // the intake's cone holds, beating, while it pulls
      parts.fan.material.opacity = t.pulling
        ? 0.05 + 0.05 * pulse
        : 0.07 + 0.2 * progress;
    }
    // the aim line is warning enough: no ring round a marksman
    parts.warn.visible = !aim;
    const ring = r * (1.15 + 0.1 * pulse);
    parts.warn.scale.set(ring, 1, ring);
    parts.warn.material.opacity = (0.2 + 0.5 * progress) * (0.6 + 0.4 * pulse);
  }

  // The Gatekeeper's barrier (4 beams): a line across the field in two
  // pieces round its gap, a bright post at each side of the gap; dim while it
  // warns, solid and bright once it holds, fading out.
  function updateBarrier(parts, t, progress, pulse) {
    parts.warn.visible = false;
    const [from, to] = t.span || [-1000, 1000];
    const lo = t.gapAt - t.gapWidth / 2;
    const hi = t.gapAt + t.gapWidth / 2;
    const warning = t.phase === 'warn';
    const glow = warning ? 0.12 + 0.3 * progress : 0.9 * t.solid;
    const width = warning ? 2 + 2 * progress : 6 + 2 * pulse;
    const pieces = [
      [from, Math.max(0, lo - from), width, glow],
      [hi, Math.max(0, to - hi), width, glow],
      [lo - 2, 4, 40, Math.max(glow, warning ? 0.6 : 0)],
      [hi - 2, 4, 40, Math.max(glow, warning ? 0.6 : 0)],
    ];
    parts.beams.forEach((beam, i) => {
      const piece = pieces[i];
      beam.visible = Boolean(piece);
      if (!piece) return;
      beam.position.set(piece[0], 0, 0);
      beam.rotation.y = 0;
      beam.scale.set(Math.max(0.01, piece[1]), 1, piece[2]);
      beam.material.opacity = piece[3];
    });
  }

  // The Prism Crown's beams (two per mirror: core → mirror, mirror → edge):
  // thin and dim while they warn, bright and a little wider as they burn.
  function updatePrism(parts, t, ox, oy, progress, pulse) {
    parts.warn.visible = false;
    parts.group.rotation.y = 0;
    const warning = t.phase === 'warn';
    const width = warning ? 2 : t.width * 0.5 + 2 * pulse;
    const glow = warning ? 0.12 + 0.3 * progress : 0.6 + 0.3 * pulse;
    parts.beams.forEach((beam, i) => {
      const s = t.segments?.[i];
      beam.visible = Boolean(s);
      if (!s) return;
      beam.position.set(s.x1 - ox, 0, s.y1 - oy);
      beam.rotation.y = -Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      beam.scale.set(
        Math.max(0.01, Math.hypot(s.x2 - s.x1, s.y2 - s.y1)),
        1,
        width
      );
      beam.material.opacity = glow;
    });
  }

  // A beam piece from (x1, y1) to (x2, y2), placed on the field round the
  // group at (ox, oy).
  function placeBeam(beam, s, ox, oy, width, glow) {
    beam.visible = true;
    beam.position.set(s.x1 - ox, 0, s.y1 - oy);
    beam.rotation.y = -Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    beam.scale.set(
      Math.max(0.01, Math.hypot(s.x2 - s.x1, s.y2 - s.y1)),
      1,
      width
    );
    beam.material.opacity = glow;
  }

  // The Interdictor's cage (7 beams: its three fences, then a short bright
  // post at each corner): thin and dim while it warns, solid and bright once
  // it holds, fading out, like the Gatekeeper's barrier.
  function updateGrid(parts, t, ox, oy, progress, pulse) {
    parts.warn.visible = false;
    parts.group.rotation.y = 0;
    const warning = t.phase === 'warn';
    const glow = warning ? 0.12 + 0.3 * progress : 0.9 * t.solid;
    const width = warning ? 2 + 2 * progress : 6 + 2 * pulse;
    const post = Math.max(glow, warning ? 0.6 : 0);
    const fences = t.fences || [];
    const posts = (t.posts || []).map((p) => ({
      x1: p.x - 6,
      y1: p.y,
      x2: p.x + 6,
      y2: p.y,
    }));
    parts.beams.forEach((beam, i) => {
      beam.visible = false;
      if (i < fences.length) placeBeam(beam, fences[i], ox, oy, width, glow);
      else if (posts[i - fences.length]) {
        placeBeam(beam, posts[i - fences.length], ox, oy, 12, post);
      }
    });
  }

  // The Interdictor's locked beam (1 beam), from its start to the field's
  // edge: hair-thin while it aims, steady and brighter frozen, wide and
  // bright as it burns.
  function updateLock(parts, t, progress, pulse) {
    parts.warn.visible = false;
    parts.group.rotation.y = 0;
    const [beam] = parts.beams;
    if (!beam) return;
    const look = {
      aim: [1, 0.15 + 0.3 * progress],
      freeze: [3, 0.75],
      burn: [t.width * 0.6 + 2 * pulse, 0.6 + 0.3 * pulse],
    }[t.phase] || [1, 0];
    placeBeam(
      beam,
      { x1: t.x, y1: t.y, x2: t.x2, y2: t.y2 },
      t.x,
      t.y,
      ...look
    );
    parts.beams.slice(1).forEach((other) => (other.visible = false));
  }

  // Dim while a hazard warns (brightening), bright and beating as it burns.
  const hazardGlow = (warning, progress, pulse) =>
    warning ? 0.06 + 0.16 * progress : 0.3 + 0.08 * pulse;

  // The Kiln Engine's hot wedges (one fan each, `count / 2` fans): every
  // other wedge from its `angle`, as far as `length`.
  function updateSectors(parts, t, progress, pulse) {
    parts.group.rotation.y = 0;
    const width = (Math.PI * 2) / t.count;
    // proposta 12/11: the wedges cover half the field, so they glow fainter
    // than a pool: rocks and orbs still read through them.
    const glow = 0.45 * hazardGlow(t.phase === 'warn', progress, pulse);
    let next = 0;
    for (let i = 0; i < t.count; i += 1) {
      if ((i + t.offset) % 2 !== 0) continue;
      const fan = parts.fans[next];
      next += 1;
      if (!fan) break;
      fan.visible = true;
      fan.geometry = fanGeometry(width);
      fan.position.set(0, 0, 0);
      fan.rotation.y = -(t.angle + width * (i + 0.5));
      fan.scale.set(t.length, 1, t.length);
      fan.material.opacity = glow;
    }
  }

  // The Foundry Mother's arms (one ring sector each), round the boss; as
  // faint as the Kiln's wedges, for the same reason.
  function updateArms(parts, t, progress, pulse) {
    parts.group.rotation.y = 0;
    const glow = 0.45 * hazardGlow(t.phase === 'warn', progress, pulse);
    parts.fans.forEach((fan, i) => {
      const s = t.segments?.[i];
      fan.visible = Boolean(s);
      if (!s) return;
      fan.geometry = ringGeometry(s.width, s.inner / s.outer);
      fan.position.set(0, 0, 0);
      fan.rotation.y = -s.angle;
      fan.scale.set(s.outer, 1, s.outer);
      fan.material.opacity = glow;
    });
  }

  // The Kiln Engine's slag pools (one disc each), placed on the field.
  function updatePools(parts, t, ox, oy) {
    parts.group.rotation.y = 0;
    parts.fans.forEach((fan, i) => {
      const pool = t.pools?.[i];
      fan.visible = Boolean(pool);
      if (!pool) return;
      const duration = pool.duration > 0 ? pool.duration : 1;
      const progress = Math.min(1, Math.max(0, 1 - pool.timer / duration));
      const pulse = 0.5 + 0.5 * Math.sin(progress * Math.PI * 6);
      fan.geometry = fanGeometry(Math.PI * 2);
      fan.position.set(pool.x - ox, 0, pool.y - oy);
      fan.rotation.y = 0;
      fan.scale.set(pool.radius, 1, pool.radius);
      fan.material.opacity = hazardGlow(pool.phase === 'warn', progress, pulse);
    });
  }

  return { createTelegraph, updateTelegraph };
}
