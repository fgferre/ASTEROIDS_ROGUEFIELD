// Thruster cues: the procedural loop (owned by the bus's ThrusterLoopManager, reached as sfx.thrusterLoops),
// the ship engine's fallback while its files are not in (shipEngine.js). World sounds on the ambient bus (ducks).
import { requireRandom } from '../../../utils/randomHelpers.js';

/**
 * Thruster cues: player propulsion loops on the ambient bus.
 * @param {import('../SFXBus.js').SfxKit} sfx - the bus toolkit (live handles,
 *   routing and the shared synth primitives); never the bus itself.
 */
export function createThrusterCues(sfx) {
  /**
   * Start a thruster loop; automatic (damping) thrusters spray softer.
   * @param {string} type
   * @param {number} intensity
   * @param {boolean} isAutomatic
   */
  function startThrusterLoop(type, intensity, isAutomatic = false) {
    sfx.trackPerformance(`_startThrusterSound:${type}`);
    if (isThrusterActive(type)) return;

    const randomScope = getThrusterRandomScope(type);
    const variation = Math.floor(
      requireRandom(randomScope, 'audio.sfx.thruster').range(0, 3)
    );
    sfx.thrusterLoops.startLoop(
      type,
      variation,
      isAutomatic ? intensity * 0.4 : intensity,
      sfx.context,
      sfx.pool,
      sfx.cache,
      randomScope,
      (node) => sfx.connectAmbient(node)
    );
  }

  function updateThrusterLoop(type, intensity) {
    sfx.thrusterLoops.updateLoop(type, intensity);
  }

  function stopThrusterLoop(type) {
    sfx.trackPerformance(`_stopThrusterSound:${type}`);
    sfx.thrusterLoops.stopLoop(type, sfx.pool);
  }

  function isThrusterActive(type) {
    return sfx.thrusterLoops.isActive(type);
  }

  function getThrusterRandomScope(type) {
    const scopes = sfx.randomScopes;
    const family =
      type === 'main'
        ? 'thrusterMain'
        : type === 'retro'
          ? 'thrusterRetro'
          : 'thrusterSide';
    return (
      scopes?.families?.[family] || scopes?.families?.thruster || scopes?.base
    );
  }

  return {
    startThrusterLoop,
    updateThrusterLoop,
    stopThrusterLoop,
    isThrusterActive,
  };
}
