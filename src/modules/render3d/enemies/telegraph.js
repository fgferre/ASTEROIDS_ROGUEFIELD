// Telegraphs on the field plane: the charge lane (or the Null's dark lane
// between violet edges, or the Gatekeeper's strip), a marksman's aim line,
// the spread fan (and the Quarry Maw's intake cone, the same wedge), the
// warning ring and the beams (the Choir's converging lines, the Maw's eject
// fan, the Gatekeeper's barrier and its gap, the Prism Crown's reflected
// beams), the Kiln Engine's hot wedges and slag pools (flat fans and
// discs), the Foundry Mother's arms (flat ring sectors) and Sovereign's
// split line between its two halves (the Interdictor draws its cage and
// beam in its own view). The Ram, the Wardens and any recipe enemy that aims draw them;
// built once into the toolkit (enemyMirror.js createKit) as
// kit.createTelegraph and kit.updateTelegraph. The Sentinels' attacks wear
// the shared danger language (telegraphLook.js: beams with a core and a
// sheath, zones with burning edges) and light `sparks`, glows of their own
// on the field (a view adds them to its glows): impacts, flares, slag in
// flight.

import { PALETTE } from '../../../data/constants/palette.js';
import { HALF_H, HALF_W, colorOf } from '../batches.js';
import { ZONE, createTelegraphLook } from './telegraphLook.js';

// How far Sovereign's split line and halves reach from its centre (field px).
const SPLIT_REACH = 1100;
// proposta 13/11: a barrier flares this long (s) as it locks solid, a slag
// pool as it lands; how high (px) a slag shot arcs.
const LOCK_FLASH = 0.3;
const SPLASH = 0.25;
const SLAG_ARC = 90;
// proposta 13/11: the hit width the barrier is drawn at when its view gives
// none (px), and the width of an eject/lane line.
const BARRIER_WIDTH = 10;
const LINE_WIDTH = 10;
const SPLIT_WIDTH = 6;
// proposta 13/11: each look's strength [warning, live]. The wedges and the
// arms cover a wide stretch of the field, so they stay faint enough to read
// rocks and orbs through.
const LANE_GAIN = [0.8, 1];
const INTAKE_GAIN = [0.8, 0.7];
const SECTOR_GAIN = [0.7, 0.5];
const ARMS_GAIN = [0.5, 0.7];
const POOL_GAIN = [1, 0.6];
// The slag's glow: molten orange.
const SLAG = '#ff9a3a';

/**
 * Telegraph parts and their per-frame update.
 * @param {object} kit - the mirror's toolkit as built so far (THREE, scene,
 *   seeded, warnRing, threatColor, bossColor), never the mirror itself.
 */
export function createTelegraphs(kit) {
  const { THREE } = kit;
  // Sovereign's halves: REBUILD in the exposed colour, PROTECT in the
  // shielded one; the line between them white-gold.
  const rebuildColor = colorOf(THREE, PALETTE.shot);
  const protectColor = colorOf(THREE, PALETTE.status);
  const splitColor = colorOf(THREE, '#fff3d6');
  const slagColor = colorOf(THREE, SLAG);
  const danger = createTelegraphLook(THREE, colorOf, kit.seeded);
  // telegraph pieces (flat on the field plane)
  const lanePlane = new THREE.PlaneGeometry(1, 1);
  lanePlane.rotateX(-Math.PI / 2);
  lanePlane.translate(0.5, 0, 0);
  const fanGeometries = new Map();
  const ringGeometries = new Map();

  // Charge lane / fan / warning ring on the field plane (Wardens and Ram);
  // `beams` lines for the Choir's converging volley and the Maw's eject;
  // `fans` flat wedges or discs for the Kiln Engine's sectors and pools;
  // `sparks` glows on the field.
  function createTelegraph(beams = 0, fans = 0, sparks = 0) {
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
    const sparkList = Array.from({ length: sparks }, () =>
      kit.glow(group, kit.tone(PALETTE.threat, 0))
    );
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
      sparks: sparkList,
    };
  }

  // Spark `i` of `parts` at (x, y) round the group, `h` px up, `size` px,
  // `gain` × its colour (hex, default the threat red).
  function spark(parts, i, x, y, h, size, gain, hex = null) {
    const s = parts.sparks[i];
    if (!s || gain <= 0.05) return;
    s.anchor.visible = true;
    s.anchor.position.set(x, h, y);
    s.anchor.scale.setScalar(size);
    if (hex) s.tone.userData.base.copy(hex);
    kit.setGain(s.tone, gain);
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
  // brighter and wider. Its sparks are off unless a branch lights them.
  function updateTelegraph(parts, boss, radius) {
    danger.tick(performance.now() / 1000);
    // (a view's own telegraph parts, the Caster's, carry no sparks)
    const sparks = parts.sparks ?? [];
    for (const s of sparks) s.anchor.visible = false;
    drawTelegraph(parts, boss, radius);
    // the glow batch reads the sparks' poses after every view's update
    if (sparks.length) parts.group.updateMatrixWorld(true);
  }

  function drawTelegraph(parts, boss, radius) {
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
    // the Gatekeeper's strip carries its own centre line
    parts.line.visible = (charge && t.type !== 'lane') || aim;
    const intake = t.type === 'intake';
    parts.fan.visible = t.type === 'fan' || intake;
    parts.fans.forEach((fan) => (fan.visible = false));
    if (t.type === 'barrier') {
      updateBarrier(parts, t, progress);
      return;
    }
    if (t.type === 'prism') {
      updatePrism(parts, t, ox, oy, progress);
      return;
    }
    if (t.type === 'split') {
      updateSplit(parts, t, progress);
      return;
    }
    if (t.type === 'sectors' || t.type === 'pools' || t.type === 'arms') {
      parts.warn.visible = false;
      parts.beams.forEach((beam) => (beam.visible = false));
      if (t.type === 'sectors') updateSectors(parts, t, progress);
      else if (t.type === 'arms') updateArms(parts, t, progress);
      else updatePools(parts, t, ox, oy);
      return;
    }
    if (t.type === 'eject') updateEject(parts, t, ox, oy, progress);
    else
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
      } else if (t.type === 'lane') {
        updateLane(parts, t, boss, length, progress);
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
      if (intake) {
        // the Maw's and Sovereign's: rings flowing in to the mouth
        danger.zone(parts.fan, {
          color: kit.threatColor,
          warn: !t.pulling,
          progress,
          gain: t.pulling ? INTAKE_GAIN[1] : INTAKE_GAIN[0],
          radius: length,
          arc,
          style: ZONE.PULL,
        });
      }
      // the intake's cone holds, beating, while it pulls
      else
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

  // The Gatekeeper's strip: a track as wide as it, arrows down it toward
  // where it charges; while it winds up they light out from the boss, as it
  // runs the stretch behind it dims.
  function updateLane(parts, t, boss, length, progress) {
    const ran =
      (boss.x - t.x) * Math.cos(t.angle) + (boss.y - t.y) * Math.sin(t.angle);
    danger.beam(parts.lane, {
      x: 0,
      y: 0,
      angle: 0,
      length,
      width: t.width,
      color: kit.threatColor,
      warn: !t.charging,
      progress,
      gain: t.charging ? LANE_GAIN[1] : LANE_GAIN[0],
      front: t.charging ? Math.max(0, ran) : progress * length,
      core: 0.35,
      chevron: 1,
    });
  }

  // The Maw's eject fan and Sovereign's lanes: one line per shot from the
  // mouth, a charge front running out while they warn; live (Sovereign's
  // volley firing) bright, pulses running out.
  function updateEject(parts, t, ox, oy, progress) {
    const warning = t.timer > 0;
    parts.beams.forEach((beam, i) => {
      const line = t.lines?.[i];
      beam.visible = Boolean(line);
      if (!line) return;
      danger.beam(beam, {
        x: line.x - ox,
        y: line.y - oy,
        angle: line.angle,
        length: line.length,
        width: LINE_WIDTH,
        color: kit.threatColor,
        warn: warning,
        progress,
        gain: warning ? 0.7 + 0.5 * progress : 0.9,
        front: warning ? progress * line.length * 1.2 : Infinity,
      });
    });
  }

  // A barrier (4 beams, 2 sparks): a wall across the field in two pieces
  // round its gap, `parts.width` px thick (the hit's), and a post at each
  // side of the gap. Warning, a guide runs out both ways from where the boss
  // stood; solid, it locks with a flash at the posts and holds, energy
  // running out along it; fading, it dims.
  function updateBarrier(parts, t, progress) {
    parts.warn.visible = false;
    const [from, to] = t.span || [-1000, 1000];
    const lo = t.gapAt - t.gapWidth / 2;
    const hi = t.gapAt + t.gapWidth / 2;
    const warning = t.phase === 'warn';
    const held = t.phase === 'solid' ? t.duration - t.timer : Infinity;
    const lock = Math.max(0, 1 - held / LOCK_FLASH);
    const solid = t.solid ?? 1;
    const gain = warning ? 0.55 + 0.45 * progress : solid * (1 + 1.5 * lock);
    const front = warning ? progress * 1.2 * Math.max(-from, to) : Infinity;
    const walls = [
      [from, lo - from],
      [hi, to - hi],
    ];
    walls.forEach(([start, length], i) => {
      const beam = parts.beams[i];
      if (!beam) return;
      beam.visible = length > 0;
      if (length <= 0) return;
      danger.beam(beam, {
        x: start,
        y: 0,
        angle: 0,
        length,
        width: parts.width ?? BARRIER_WIDTH,
        color: kit.threatColor,
        warn: warning,
        progress,
        gain,
        origin: -start,
        front,
      });
    });
    [lo, hi].forEach((at, i) => {
      const post = parts.beams[i + 2];
      if (!post) return;
      post.visible = at > from && at < to;
      if (!post.visible) return;
      danger.beam(post, {
        x: at - 2,
        y: 0,
        angle: 0,
        length: 4,
        width: 40,
        color: kit.threatColor,
        warn: false,
        progress,
        gain: warning ? 0.5 + 0.5 * progress : solid * (1 + 2.5 * lock),
        core: 0,
      });
      spark(parts, i, at, 0, 4, 8, 3 * lock * solid, kit.threatColor);
    });
  }

  // The Prism Crown's beams (two per mirror: core → mirror, mirror → edge),
  // as wide as they burn: while they warn a guide charges out from the gem
  // to each mirror, then on to the edge; burning, full and bright, a flare
  // on each mirror and sparks where each beam meets the edge (sparks: one
  // per beam).
  function updatePrism(parts, t, ox, oy, progress) {
    parts.warn.visible = false;
    parts.group.rotation.y = 0;
    const warning = t.phase === 'warn';
    const flicker = 0.8 + 0.2 * Math.sin(performance.now() / 23);
    parts.beams.forEach((beam, i) => {
      const s = t.segments?.[i];
      beam.visible = Boolean(s);
      if (!s) return;
      const length = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
      const leg = i % 2;
      danger.beam(beam, {
        x: s.x1 - ox,
        y: s.y1 - oy,
        angle: Math.atan2(s.y2 - s.y1, s.x2 - s.x1),
        length,
        width: t.width,
        color: kit.threatColor,
        warn: warning,
        progress,
        gain: warning ? 0.6 + 0.5 * progress : 1,
        front: warning
          ? Math.min(1, Math.max(0, 2 * progress - leg)) * length
          : Infinity,
        flare: leg,
      });
      // the mirror (end of a first leg) and the edge (end of a second)
      const reached = warning ? 2 * progress - leg >= 1 : true;
      const gain = warning ? 0.8 * progress : (leg ? 2.6 : 2) * flicker;
      if (reached) {
        spark(
          parts,
          i,
          s.x2 - ox,
          s.y2 - oy,
          6,
          leg ? 7 : 9,
          gain,
          kit.threatColor
        );
      }
    });
  }

  // Sovereign's split (1 beam, 2 fans): a line across the field through it,
  // the REBUILD half washed warm (the exposed colour) and the PROTECT half
  // cool (the shielded one), faint enough to read the field through; thin
  // and dim while it warns, bright once it turns.
  function updateSplit(parts, t, progress) {
    parts.warn.visible = false;
    parts.group.rotation.y = 0;
    const warning = t.phase === 'warn';
    const [beam] = parts.beams;
    if (beam) {
      danger.beam(beam, {
        x: -Math.cos(t.angle) * SPLIT_REACH,
        y: -Math.sin(t.angle) * SPLIT_REACH,
        angle: t.angle,
        length: 2 * SPLIT_REACH,
        width: SPLIT_WIDTH,
        color: splitColor,
        warn: warning,
        progress,
        gain: warning ? 0.45 + 0.35 * progress : 0.5,
        origin: SPLIT_REACH,
        front: warning ? progress * SPLIT_REACH : Infinity,
      });
    }
    parts.beams.slice(1).forEach((other) => (other.visible = false));
    const wash = warning ? 0.02 + 0.05 * progress : 0.07;
    parts.fans.forEach((fan, i) => {
      fan.visible = i < 2;
      if (i >= 2) return;
      fan.geometry = fanGeometry(Math.PI);
      fan.position.set(0, 0, 0);
      fan.rotation.y = -(t.angle + (i === 0 ? 1 : -1) * (Math.PI / 2));
      fan.scale.set(SPLIT_REACH, 1, SPLIT_REACH);
      danger.zone(fan, {
        color: i === 0 ? rebuildColor : protectColor,
        warn: warning,
        progress,
        gain: wash,
        radius: SPLIT_REACH,
        arc: Math.PI,
        style: ZONE.WASH,
      });
    });
  }

  // The Kiln Engine's hot wedges (one fan each, `count / 2` fans): every
  // other wedge from its `angle`, as far as `length`: heat flowing out of
  // the vents, its edges burning in while it warns.
  function updateSectors(parts, t, progress) {
    parts.group.rotation.y = 0;
    const width = (Math.PI * 2) / t.count;
    const warning = t.phase === 'warn';
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
      danger.zone(fan, {
        color: kit.threatColor,
        warn: warning,
        progress,
        gain: warning ? SECTOR_GAIN[0] : SECTOR_GAIN[1],
        radius: t.length,
        arc: width,
        style: ZONE.HEAT,
        hot: slagColor,
        seed: i,
      });
    }
  }

  // The Foundry Mother's arms (one ring sector and one spark each), round
  // the boss: the field its claws project, a lattice scanning out; as they
  // swing, sparks fly at each claw.
  function updateArms(parts, t, progress) {
    parts.group.rotation.y = 0;
    const warning = t.phase === 'warn';
    const flicker = 0.7 + 0.3 * Math.sin(performance.now() / 17);
    parts.fans.forEach((fan, i) => {
      const s = t.segments?.[i];
      fan.visible = Boolean(s);
      if (!s) return;
      fan.geometry = ringGeometry(s.width, s.inner / s.outer);
      fan.position.set(0, 0, 0);
      fan.rotation.y = -s.angle;
      fan.scale.set(s.outer, 1, s.outer);
      danger.zone(fan, {
        color: kit.threatColor,
        warn: warning,
        progress,
        gain: warning ? ARMS_GAIN[0] : ARMS_GAIN[1],
        radius: s.outer,
        arc: s.width,
        inner: s.inner / s.outer,
        style: ZONE.FIELD,
      });
      if (!warning) {
        const x = Math.cos(s.angle) * s.outer;
        const y = Math.sin(s.angle) * s.outer;
        spark(parts, i, x, y, 6, 6, 2.6 * flicker, kit.threatColor);
      }
    });
  }

  // The Kiln Engine's slag pools (one disc each, a spark each), placed on
  // the field: while the shot flies (a glowing blob arcing from the crown)
  // its landing mark closes in; it lands with a splash and burns as molten
  // crust, cooling as it ends.
  function updatePools(parts, t, ox, oy) {
    parts.group.rotation.y = 0;
    parts.fans.forEach((fan, i) => {
      const pool = t.pools?.[i];
      fan.visible = Boolean(pool);
      if (!pool) return;
      const duration = pool.duration > 0 ? pool.duration : 1;
      const progress = Math.min(1, Math.max(0, 1 - pool.timer / duration));
      const warning = pool.phase === 'warn';
      const x = pool.x - ox;
      const y = pool.y - oy;
      fan.geometry = fanGeometry(Math.PI * 2);
      fan.position.set(x, 0, y);
      fan.rotation.y = 0;
      fan.scale.set(pool.radius, 1, pool.radius);
      danger.zone(fan, {
        color: kit.threatColor,
        warn: warning,
        progress,
        gain: warning ? POOL_GAIN[0] : POOL_GAIN[1],
        radius: pool.radius,
        style: ZONE.SLAG,
        hot: slagColor,
        seed: i * 7.3,
      });
      if (warning) {
        const h = 6 + SLAG_ARC * Math.sin(Math.PI * progress);
        spark(parts, i, x * progress, y * progress, h, 5, 3.2, slagColor);
      } else {
        const landed = (duration - pool.timer) / SPLASH;
        if (landed < 1) {
          spark(
            parts,
            i,
            x,
            y,
            4,
            pool.radius * 0.5 * (0.4 + landed),
            2.5 * (1 - landed),
            slagColor
          );
        }
      }
    });
  }

  return { createTelegraph, updateTelegraph };
}
