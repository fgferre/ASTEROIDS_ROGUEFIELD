// The ship's engine (SOUND.md): the owner's picks on the engine bench, in
// src/public/audio/engine/ (manifest.json: the files, their loop points,
// each file's origin and `level`, the engine's level in the game mix in dB:
// the bench's balance against the lance shot it played at 0.45, here at its
// manifest -15 dB). engineModel.js plays them from the ship's real flight on
// the protected bus (player feedback, under the SFX slider). The files load
// at boot beside the SFX samples and decode once the AudioContext exists;
// until then, or if they fail, follow() returns false and the procedural
// thruster loop (thrusterEvents.js) plays, as before.
//
// Per simulation step, PlayerSystem sends its thruster-effect events, then
// player-moved; on player-moved the engine gets:
//   thrust   the main engine's manual push, or the retro's (classic S) at RETRO_THRUST
//   lateral  the manual side thrusters: the right one +, the left one -
//   speed    how near the ship flies to the top speed its push holds, along
//            the push, from two steps of velocity (speedShare)
//   tier     the propulsion cards' ranks (player-moved's visualLevels, every
//            step, firing or not) against TIER_RANKS
// and the player's own shot (weapon-fired) ducks it on the next step, with
// the stabilizer's puffs as strong as its automatic correction of the recoil
// in that step. No step for ENGINE_IDLE_MS (pause, death, menu, a card screen)
// stops it at rest.
import { createEngineModel } from './engineModel.js';
import { fetchAudioFile } from './samplePlayer.js';
import { dbToGain } from './MusicThemes.js';
import { FIXED_STEP_SECONDS } from '../../core/fixedStep.js';
import { SHIP_LINEAR_DAMPING } from '../../data/constants/physics.js';

// proposta 20/10, for the owner to judge by playing:
const RETRO_THRUST = 0.6; // the retro nozzle spins the turbine, never the roar (above 0.6)
const TIER_RANKS = [1, 4, 8]; // Main Thrusters + RCS System + Braking System ranks for tiers 1, 2, 3
const STABILIZER_FLOOR = 0.35; // the auto-damper's least push (flight.js); from it the puffs are full
export const ENGINE_IDLE_MS = 150; // the old loop's inactivity timeout

// One step of flight.js: v' = (v + push * dt) * e^(-k * dt).
const STEP_DAMPING = Math.exp(SHIP_LINEAR_DAMPING * FIXED_STEP_SECONDS);

/**
 * Of the top speed the push holds, the share the ship flies at along it,
 * from its speed along the push one step `before` and `after`. That top
 * speed is (e^(k*dt) * after - before) / (e^(k*dt) - 1), whatever the hull
 * and the cards make the push. Flying against the push, or no push: 0.
 */
export function speedShare(before, after) {
  const top = (STEP_DAMPING * after - before) / (STEP_DAMPING - 1);
  return top > 0 ? Math.min(1, Math.max(0, after / top)) : 0;
}

/** The engine tier (0-3) for the propulsion cards' summed ranks. */
export function engineTier(ranks) {
  return TIER_RANKS.filter((needed) => ranks >= needed).length;
}

const idleStep = () => ({ main: 0, retro: 0, left: 0, right: 0, automatic: 0 });

/**
 * @param {import('./SFXBus.js').SfxKit} sfx - the bus toolkit (live context,
 *   protected destination, seeded scopes); never the bus itself.
 */
export function createShipEngine(sfx) {
  let fetched = null; // { manifest, files: [path, ArrayBuffer][] } waiting for a context
  let model = null;
  let disposed = false; // torn down: a fetch or decode still in flight builds nothing
  let step = idleStep(); // this step's thrusters, until player-moved
  let before = null; // last step's velocity
  let share = 0; // last speedShare
  let clock = null; // audio time of the last update
  let lastStepAt = null; // performance.now() of the last step; null at rest
  let shotPending = false;

  /** Decode what was fetched, once the AudioContext and the buses exist. */
  async function decode() {
    const context = sfx.context;
    const destination = sfx.protectedDestination();
    if (disposed || !fetched || !context || !destination) return;
    const { manifest, files } = fetched;
    fetched = null;
    try {
      const decoded = new Map(
        await Promise.all(
          files.map(async ([path, file]) => [
            path,
            await context.decodeAudioData(file),
          ])
        )
      );
      if (disposed) return;
      const buffers = {};
      Object.entries(manifest.loops).forEach(([layer, loop]) => {
        buffers[layer] = { ...loop, buffer: decoded.get(loop.file) };
      });
      Object.entries(manifest.oneshots).forEach(([kind, oneshot]) => {
        buffers[kind] = oneshot.files.map((path) => decoded.get(path));
      });
      // The sample layer's seeded scope (reseeded per run), read live.
      const random = () =>
        sfx.resolveRandom(sfx.randomScopes?.families?.impact).float();
      model = createEngineModel({ context, destination, buffers, random });
      model.setVolume(dbToGain(manifest.level));
    } catch (error) {
      console.warn(
        '[Engine] The engine files did not decode; the thrusters stay synthesized.',
        error
      );
    }
  }

  /** Fetch the manifest and every file (the boot warm-up); never throws. */
  async function load(fetchFile = (path) => fetchAudioFile('engine', path)) {
    try {
      const manifest = await (await fetchFile('manifest.json')).json();
      const paths = [
        ...Object.values(manifest.loops).map((loop) => loop.file),
        ...Object.values(manifest.oneshots).flatMap((oneshot) => oneshot.files),
      ];
      const files = await Promise.all(
        paths.map(async (path) => [
          path,
          await (await fetchFile(path)).arrayBuffer(),
        ])
      );
      if (disposed) return;
      fetched = { manifest, files };
    } catch (error) {
      console.warn(
        '[Engine] The engine files did not load; the thrusters stay synthesized.',
        error
      );
      return;
    }
    await decode();
  }

  /**
   * One thruster-effect event into this step; false when the engine is not
   * playing (the procedural loop follows the event instead).
   */
  function follow({ type, intensity = 0, isAutomatic, side }) {
    if (!model) return false;
    const key = isAutomatic
      ? 'automatic'
      : type === 'main'
        ? 'main'
        : type === 'aux'
          ? 'retro'
          : side;
    if (key in step) step[key] = Math.max(step[key], intensity);
    return true;
  }

  /** The step's flight (player-moved): the engine's inputs, then its update. */
  function flightStep({ velocity, angle, visualLevels: levels }) {
    if (!model) return;
    const retro = step.retro * RETRO_THRUST > step.main;
    const sign = retro ? -1 : 1;
    const along = (v) =>
      sign * (v.vx * Math.cos(angle) + v.vy * Math.sin(angle));
    // The recoil's kick is no push: the step after a shot keeps the share.
    if (before && !shotPending) {
      share = speedShare(along(before), along(velocity));
    }
    model.set({
      thrust: Math.max(step.main, step.retro * RETRO_THRUST),
      lateral: step.right - step.left,
      speed: share,
      tier: engineTier(levels.thruster + levels.rcs + levels.braking),
    });
    if (shotPending) {
      model.shot({ recoil: Math.min(1, step.automatic / STABILIZER_FLOOR) });
      shotPending = false;
    }
    const now = sfx.context.currentTime;
    model.update(clock === null ? 0 : now - clock);
    clock = now;
    lastStepAt = performance.now();
    before = { ...velocity };
    step = idleStep();
  }

  /** At rest at once: pause, death, menu, a new run. */
  function stop() {
    model?.stop();
    step = idleStep();
    before = null;
    share = 0;
    clock = null;
    lastStepAt = null;
    shotPending = false;
  }

  return Object.freeze({
    load,
    decode,
    follow,
    flightStep,
    stop,
    /** The player's own shot: the duck and puffs land on the next step. */
    shot() {
      if (model) shotPending = true;
    },
    /** The dash's one-shot, through the resume gate; false when the engine is not playing. */
    dash() {
      if (!model) return false;
      sfx.safePlay(() => model?.dash());
      return true;
    },
    /** The emergency brake's one-shot, through the resume gate; false when the engine is not playing. */
    brake() {
      if (!model) return false;
      sfx.safePlay(() => model?.brake());
      return true;
    },
    /** No flight step for ENGINE_IDLE_MS: stop. */
    stopIfIdle(now = performance.now()) {
      if (lastStepAt !== null && now - lastStepAt > ENGINE_IDLE_MS) stop();
    },
    /** A new run: at rest (the cards come with every step). */
    reset: stop,
    /** The model's numbers (engineModel snapshot), null when not playing. */
    snapshot: () => model?.snapshot() ?? null,
    dispose() {
      disposed = true;
      fetched = null;
      model?.dispose();
      model = null;
    },
  });
}
