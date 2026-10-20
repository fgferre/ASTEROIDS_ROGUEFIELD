// The ship engine's fallback while its files are not in (shipEngine.js):
// thruster loops follow PlayerSystem's thruster-effect events. A loop starts
// above the start threshold, follows the intensity while above the stop
// threshold and stops below it (hysteresis, no flapping); a loop that hears no
// event for inactivityTimeout ms stops too. The loop synthesis lives in
// SFXBus (sfx/thrusters.js); this is the event-driven state machine.
import { ENGINE_IDLE_MS } from './shipEngine.js';

const THRUSTER_TYPES = ['main', 'retro', 'side'];

export function createThrusterState() {
  return {
    lastEventTime: { main: 0, retro: 0, side: 0 }, // last event per type
    startThreshold: 0.1, // intensity that starts a loop
    stopThreshold: 0.05, // lower threshold that stops it (hysteresis)
    inactivityTimeout: ENGINE_IDLE_MS, // ms without an event before the loop stops
  };
}

/**
 * One thruster-effect event: start, update or stop that thruster's loop.
 * PlayerSystem emits 'main', 'aux' (braking = the retro loop) and 'side';
 * automatic (damping) thrusters spray softer.
 */
export function followThrusterEffect(audio, data) {
  if (!audio.initialized || !audio.context) return;

  const { type, intensity, isAutomatic } = data;
  if (!type || typeof intensity !== 'number') return;

  const thrusterKey = type === 'aux' ? 'retro' : type;
  const state = audio.thrusterState;
  const isActive = audio.sfxBus.isThrusterActive(thrusterKey);
  state.lastEventTime[thrusterKey] = performance.now();

  if (intensity > state.startThreshold && !isActive) {
    audio.sfxBus.startThrusterLoop(
      thrusterKey,
      intensity,
      isAutomatic || false
    );
  } else if (intensity > state.stopThreshold && isActive) {
    audio.sfxBus.updateThrusterLoop(thrusterKey, intensity);
  } else if (intensity <= state.stopThreshold && isActive) {
    audio.sfxBus.stopThrusterLoop(thrusterKey);
  }
}

/**
 * Stops the loops that heard no event within the timeout (typically
 * automatic damping fading out).
 */
export function stopIdleThrusters(audio) {
  if (!audio.initialized || !audio.sfxBus) return;

  const now = performance.now();
  const { lastEventTime, inactivityTimeout } = audio.thrusterState;
  THRUSTER_TYPES.forEach((type) => {
    if (!audio.sfxBus.isThrusterActive(type)) return;
    if (now - (lastEventTime[type] || 0) > inactivityTimeout) {
      audio.sfxBus.stopThrusterLoop(type);
    }
  });
}
