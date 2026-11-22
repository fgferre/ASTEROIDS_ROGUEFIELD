// How a rock breaks (pedras, 17/11): where a shot strikes, its cracks grow
// from there; a rock that splits opens along its cracks and each piece IS
// one of its fragments (it keeps the cut shape, its cut face hot, cooling);
// a rock that dies whole falls apart into hot pieces of itself that tumble
// out, shrink and go. No ring: the stone itself shows the blow.

import { createSeededRandom } from '../asteroidMesh.js';
import { cutRock } from './rockCut.js';

// The variant a rock looks like: a gold or crystal rock's pieces look like
// it (Asteroid's `look`), the rest like their own.
export const lookOf = (enemy) => enemy.look || enemy.variant;

// The colour each variant's inside glows in when it breaks (rockShader.js
// ROCK_TINT): lava, a dense core's cold light, blood, gold, lit glass.
const CUT_TINTS = { denseCore: 1, parasite: 2, gold: 3, crystal: 4 };
// a cut face's heat, 1 → 0, over this many seconds
export const CUT_COOL_SECONDS = 1.4;
// a fragment starts where its piece was and eases onto its own position
const SETTLE_SECONDS = 0.15;
// a crack's reach (unit-sphere distance) around a struck point, by stage
const CRACK_REACH = [0.75, 0.75, 1.15, 1.55];
// shots strike the rim seen from above: the struck point leans up, as the
// scorch decals do
const STRIKE_LEAN = 0.35;
// a rock that dies whole: pieces by size, their speed (radii / s), when
// they start to shrink and when they are gone (s)
// (pieces by the rock's radius: up to 14, up to 26, larger)
const CRUMBLE_PIECES = [4, 5, 6];
const CRUMBLE_SPEED = [1.6, 2.8];
const CRUMBLE_SHRINK = 0.18;
const CRUMBLE_LIFE = 0.55;
// a rock crushed in a Quarry Maw's mouth: pieces, how much faster, and how
// far off the jaws' facing they leave (rad: out of the sides, a little ahead)
const CRUSH_PIECES = 9;
const CRUSH_SPEED = 1.4;
const CRUSH_SIDE = 1.45;
// A crystal's or gold's shell: it shatters into this many shards, this
// much faster, and its fragments (rolled anew, mostly plain stone: the
// game's rule) come out from inside, growing over EMERGE_SECONDS.
const SHELLS = { crystal: 1, gold: 1 };
const SHELL_SHARDS = 9;
const SHELL_SPEED = 1.6;
const EMERGE_SECONDS = 0.22;
// a split's pieces not claimed by a fragment view within this long are dropped
const PENDING_SECONDS = 1;
// cuts a frame (each well under a millisecond): a Pulse breaks every rock on
// the field at once, so past this many the rest wait their turn, nearest the
// ship first (the break runs outward with the Pulse's ring), each still
// drawn whole where it broke, and its fragments hidden, until its cut
const CUTS_PER_FRAME = 4;
const WAIT_FLASH = 0.6;

/**
 * @param {object} kit - the mirror's toolkit (THREE, scene).
 * @param {object} rocks - RockInstances, which draws live rocks and pieces.
 */
export function createRockBreak(kit, rocks) {
  const { THREE } = kit;
  const pending = new Map();
  const debris = [];
  const queue = [];
  let spent = 0;
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  let clock = 0;

  const randomOf = (view, salt) =>
    createSeededRandom(((view.seed || 1) % 100000) + salt);

  // A world direction on the field plane, into `view`'s own space.
  function toRock(view, x, y, z) {
    q.copy(view.object.quaternion).invert();
    return new THREE.Vector3(x, y, z).normalize().applyQuaternion(q);
  }

  /** A shot struck `view` from (nx, ny) (logical, from its centre). */
  function struck(view, nx, ny) {
    if (view.look?.vein) return; // a veined rock shows its veins, not cracks
    const len = Math.hypot(nx, ny) || 1;
    const dir = toRock(view, nx / len, STRIKE_LEAN, ny / len);
    const [first, last] = view.rock.hit;
    if (!view.struck) dir.toArray(first);
    dir.toArray(last);
    view.struck = true;
  }

  // `view`'s rock as it broke: what its cut and its stand-in need, so the
  // view can go back to the pool. Its cut shape's slot (a rock that was a
  // piece) is held until its own cut is done.
  function still(view) {
    const { object, rock } = view;
    // a bare pose, not an Object3D (whose id would draw on Math.random)
    const pose = {
      geometry: object.geometry,
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
      scale: object.scale.clone(),
      matrixWorld: new THREE.Matrix4(),
    };
    pose.matrixWorld.compose(pose.position, pose.quaternion, pose.scale);
    const kept = {
      seed: view.seed,
      radius: view.radius,
      variant: view.variant,
      family: view.family,
      shape: view.shape,
      slot: view.cut,
      object: pose,
      rock: {
        ...rock,
        base: rock.base.clone(),
        vein: rock.vein.clone(),
        seed: rock.seed.clone(),
        glow: rock.glow.slice(),
        surface: rock.surface.slice(),
        hit: rock.hit.map((h) => h.slice()),
      },
    };
    view.cut = undefined;
    return kept;
  }

  // Cut now if this frame has room and no rock is waiting, else in turn,
  // lit meanwhile with a struck rock's full flash (rocks.js updateRock).
  function inTurn(view, enemy, cut, split = false) {
    const job = { kept: still(view), cut, split };
    if (!queue.length && spent < CUTS_PER_FRAME) {
      run(job);
      return;
    }
    job.kept.rock.glow[3] = WAIT_FLASH;
    const ship = enemy?.system?.getCachedPlayer?.()?.position;
    job.born = clock;
    job.far = ship ? Math.hypot(enemy.x - ship.x, enemy.y - ship.y) : 0;
    let at = queue.length;
    while (
      at > 0 &&
      queue[at - 1].born === clock &&
      queue[at - 1].far > job.far
    )
      at -= 1;
    queue.splice(at, 0, job);
  }

  function run(job) {
    spent += 1;
    kit.seeded(() => job.cut(job.kept));
    if (job.kept.slot !== undefined) rocks.freeShape(job.kept.slot);
  }

  /**
   * `view`'s rock split into `fragments` (live Asteroids): its geometry is
   * cut into one piece per fragment, facing where each one spawned.
   */
  function split(view, enemy, fragments) {
    if (!view || !fragments.length) return;
    const whole = { variant: lookOf(enemy), x: enemy.x, y: enemy.y };
    const parts = fragments.map((f) => {
      const piece = { waiting: true, born: clock };
      pending.set(f.id, piece);
      return { x: f.x, y: f.y, piece };
    });
    inTurn(view, enemy, (kept) => splitInto(kept, whole, parts), true);
  }

  function splitInto(view, enemy, fragments) {
    if (SHELLS[enemy.variant]) {
      crumbleInto(view, SHELL_SHARDS, SHELL_SPEED);
      fragments.forEach((f) =>
        Object.assign(f.piece, {
          waiting: false,
          emerge: true,
          world: view.object.position.clone(),
          born: clock,
        })
      );
      return;
    }
    const dirs = fragments.map((f, i) => {
      let x = f.x - enemy.x;
      let z = f.y - enemy.y;
      if (!x && !z) {
        const a = (i / fragments.length) * Math.PI * 2;
        x = Math.cos(a);
        z = Math.sin(a);
      }
      return toRock(view, x, 0, z);
    });
    const pieces = cutRock(
      THREE,
      view.object.geometry,
      view.rock.seed,
      dirs,
      randomOf(view, 31)
    );
    const { object } = view;
    pieces.forEach((piece, i) => {
      const world = piece.centre
        .clone()
        .multiplyScalar(object.scale.x)
        .applyQuaternion(object.quaternion)
        .add(object.position);
      Object.assign(fragments[i].piece, {
        waiting: false,
        geometry: piece.geometry,
        turn: object.quaternion.clone(),
        world,
        tint: CUT_TINTS[lookOf(enemy)] || 0,
        born: clock,
      });
    });
  }

  /** A fragment's view binds: it takes its piece, if it has one. */
  function adopt(view, enemy) {
    if (view.cut !== undefined) {
      rocks.freeShape(view.cut);
      view.cut = undefined;
    }
    view.piece = pending.get(enemy.id) || null;
    pending.delete(enemy.id);
    view.struck = false;
    view.rock.hit[0].fill(0);
    view.rock.hit[1].fill(0);
    view.rock.heat = 0;
    view.rock.tint = view.piece?.tint || 0;
  }

  /**
   * Per frame, after `view`'s pose is set and before it is drawn: a new
   * piece takes the turn its rock had (so it does not jump) and eases from
   * where it was onto its fragment; the cut cools; cracks reach by stage.
   */
  function settle(view, enemy, dt) {
    const { piece, object, rock } = view;
    // its rock is still waiting for its cut (drawn whole meanwhile)
    view.hidden = Boolean(piece?.waiting);
    if (view.hidden) return;
    if (piece?.emerge) {
      piece.age = (piece.age ?? -dt) + dt;
      const k = Math.min(1, piece.age / EMERGE_SECONDS);
      if (k < 1) {
        object.position.lerp(piece.world, (1 - k) * (1 - k));
        object.scale.multiplyScalar(0.35 + 0.65 * k);
      } else view.piece = null;
    } else if (piece && !piece.shaped) {
      // baked so that the fragment's own turn shows the rock's turn now
      q.copy(object.quaternion).invert().multiply(piece.turn);
      piece.geometry.applyMatrix4(m.makeRotationFromQuaternion(q));
      view.cut = kit.seeded(() => rocks.addShape(piece.geometry));
      view.shape = view.cut;
      object.geometry = piece.geometry;
      piece.offset = piece.world.clone().sub(object.position);
      piece.age = 0;
      piece.shaped = true;
      rock.heat = 1;
    }
    if (piece?.offset) {
      piece.age += dt;
      const k = 1 - Math.min(1, piece.age / SETTLE_SECONDS);
      if (k > 0) object.position.addScaledVector(piece.offset, k * k);
      else piece.offset = null;
    }
    rock.heat = Math.max(0, rock.heat - dt / CUT_COOL_SECONDS);
    if (view.struck) {
      const reach = CRACK_REACH[Math.min(3, enemy.crackStage || 0)];
      rock.hit[0][3] = reach;
      rock.hit[1][3] = reach;
    }
  }

  // From the rock's centre to a piece, on the field plane.
  function outward(at, centre, random) {
    const out = at.clone().sub(centre).setY(0);
    if (out.lengthSq() < 1e-6) out.set(random() - 0.5, 0, random() - 0.5);
    return out.normalize();
  }

  /** `view`'s rock died whole: it falls apart into hot pieces of itself. */
  function crumble(view) {
    inTurn(view, view.body, (kept) => crumbleInto(kept));
  }

  /**
   * `view`'s rock was crushed in a mouth facing `facing` (rad, logical):
   * its pieces leave out of the jaws' sides.
   */
  function crush(view, facing) {
    inTurn(view, null, (kept) =>
      crumbleInto(kept, CRUSH_PIECES, CRUSH_SPEED, facing)
    );
  }

  function crumbleInto(view, pieces, speedScale = 1, facing = null) {
    const random = randomOf(view, 57);
    const r = view.radius || 12;
    const count = pieces || CRUMBLE_PIECES[r <= 14 ? 0 : r <= 26 ? 1 : 2];
    const start = random() * Math.PI * 2;
    const dirs = [];
    for (let i = 0; i < count; i += 1) {
      const a =
        facing === null
          ? start + (i / count) * Math.PI * 2
          : facing + (i % 2 ? 1 : -1) * CRUSH_SIDE + (random() - 0.5) * 0.6;
      dirs.push(toRock(view, Math.cos(a), (random() - 0.5) * 0.6, Math.sin(a)));
    }
    const { object, rock } = view;
    const scale = object.scale.x;
    cutRock(THREE, object.geometry, rock.seed, dirs, random).forEach(
      (piece) => {
        const part = new THREE.Object3D();
        part.position
          .copy(piece.centre)
          .multiplyScalar(scale)
          .applyQuaternion(object.quaternion)
          .add(object.position);
        part.quaternion.copy(object.quaternion);
        const size0 = piece.size * scale;
        part.scale.setScalar(size0);
        const speed =
          scale *
          speedScale *
          (CRUMBLE_SPEED[0] + random() * (CRUMBLE_SPEED[1] - CRUMBLE_SPEED[0]));
        debris.push({
          family: view.family,
          shape: rocks.addShape(piece.geometry),
          object: part,
          size: size0,
          age: 0,
          velocity: outward(
            part.position,
            object.position,
            random
          ).multiplyScalar(speed),
          spinAxis: new THREE.Vector3(
            random() - 0.5,
            random() - 0.5,
            random() - 0.5
          ).normalize(),
          spinRate: (random() - 0.5) * 9,
          rock: {
            base: rock.base.clone(),
            vein: rock.vein.clone(),
            seed: rock.seed.clone(),
            glow: [Math.max(rock.glow[0], 1), 1, rock.glow[2], 0],
            surface: rock.surface.slice(),
            hit: [new Float32Array(4), new Float32Array(4)],
            heat: 1,
            tint: CUT_TINTS[view.variant] || rock.tint,
          },
        });
      }
    );
  }

  /**
   * Per frame, between the instances' begin and end: waiting rocks are cut
   * in turn (one split now shows whole this frame still, its fragments
   * take their pieces next frame), the rest drawn whole; pieces fly and go.
   */
  function update(dt) {
    clock += dt;
    const shown = [];
    while (queue.length && spent < CUTS_PER_FRAME) {
      const job = queue.shift();
      run(job);
      if (job.split) shown.push(job);
    }
    spent = 0;
    queue.forEach((job) => rocks.push(job.kept));
    shown.forEach((job) => rocks.push(job.kept));
    pending.forEach((piece, id) => {
      if (!piece.waiting && clock - piece.born > PENDING_SECONDS)
        pending.delete(id);
    });
    for (let i = debris.length - 1; i >= 0; i -= 1) {
      const d = debris[i];
      d.age += dt;
      if (d.age >= CRUMBLE_LIFE) {
        rocks.freeShape(d.shape);
        debris.splice(i, 1);
        continue;
      }
      const { object } = d;
      object.position.addScaledVector(d.velocity, dt);
      d.velocity.multiplyScalar(Math.max(0, 1 - dt * 2.5));
      object.quaternion.multiply(
        q.setFromAxisAngle(d.spinAxis, d.spinRate * dt)
      );
      const shrink = Math.max(
        0,
        (d.age - CRUMBLE_SHRINK) / (CRUMBLE_LIFE - CRUMBLE_SHRINK)
      );
      object.scale.setScalar(d.size * (1 - shrink * shrink));
      object.updateMatrixWorld();
      const life = d.age / CRUMBLE_LIFE;
      d.rock.heat = 1 - life;
      d.rock.glow[0] = Math.max(0, 1.2 * (1 - life * 2));
      rocks.push(d);
    }
  }

  /** The mirror was cleared (reset, quit, retry): nothing is left to cut or fall. */
  function clear() {
    queue.forEach((job) => {
      if (job.kept.slot !== undefined) rocks.freeShape(job.kept.slot);
    });
    queue.length = 0;
    debris.forEach((d) => rocks.freeShape(d.shape));
    debris.length = 0;
    pending.clear();
    spent = 0;
  }

  rocks.onClear = clear;

  return { struck, split, adopt, settle, crumble, crush, update, clear };
}
