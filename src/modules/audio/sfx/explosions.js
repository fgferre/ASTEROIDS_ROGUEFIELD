// The three-size explosion (sub thump, mid crack, air tail).
// World sound on the ambient bus (ducks), panned and distance-mixed, throttled per size by EXPLOSION_PROFILES.minIntervalMs.
// The body came from SFXBus.js unchanged.
import { EXPLOSION_PROFILES } from '../../../data/audio/explosions.js';
import { requireRandom } from '../../../utils/randomHelpers.js';

/**
 * Explosion cues: the three-size explosion on the ambient bus.
 * @param {import('../SFXBus.js').SfxKit} sfx - the bus toolkit (live handles,
 *   routing and the shared synth primitives); never the bus itself.
 */
export function createExplosionCues(sfx) {
  const lastExplosionTime = {
    small: -Infinity,
    medium: -Infinity,
    large: -Infinity,
  };

  /**
   * Explosion in three sizes (EXPLOSION_PROFILES): sub thump, mid crack and a
   * filtered noise tail, panned, with a size-scaled reverb send. Same-size
   * pile-ups inside `minIntervalMs` are dropped. Distance-mixed when
   * `distance` is given.
   *
   * @param {'small'|'medium'|'large'} [size='large']
   * @param {{pan?: number, distance?: {gain: number, cutoff: number}}} [options]
   */
  function playExplosion(size = 'large', { pan = 0, distance = null } = {}) {
    sfx.trackPerformance('playExplosion');
    const profile = EXPLOSION_PROFILES[size] || EXPLOSION_PROFILES.large;
    const sizeKey = EXPLOSION_PROFILES[size] ? size : 'large';

    sfx.safePlay(() => {
      const now = sfx.context.currentTime;
      if ((now - lastExplosionTime[sizeKey]) * 1000 < profile.minIntervalMs) {
        return;
      }
      lastExplosionTime[sizeKey] = now;

      const destination = sfx.ambientInput(pan, distance);
      if (!destination) {
        return;
      }

      const { sub, mid, noise: noiseProfile } = profile;

      // Layer 1: sub-bass sine (the thump)
      const subOsc = sfx.pool
        ? sfx.pool.getOscillator()
        : sfx.context.createOscillator();
      const subGain = sfx.pool ? sfx.pool.getGain() : sfx.context.createGain();
      subOsc.connect(subGain);

      // Layer 2: mid-range triangle (the crack)
      const midOsc = sfx.pool
        ? sfx.pool.getOscillator()
        : sfx.context.createOscillator();
      const midGain = sfx.pool ? sfx.pool.getGain() : sfx.context.createGain();
      midOsc.connect(midGain);

      // Layer 3: lowpassed noise (debris / air tail)
      const noiseFilter = sfx.pool
        ? sfx.pool.getFilter()
        : sfx.context.createBiquadFilter();
      noiseFilter.type = 'lowpass';

      subGain.connect(destination);
      midGain.connect(destination);
      noiseFilter.connect(destination);
      sfx.sendToReverb(midGain, profile.reverbSendDb);
      sfx.sendToReverb(noiseFilter, profile.reverbSendDb);

      let noiseBuffer;
      if (sfx.cache) {
        noiseBuffer = sfx.cache.getNoiseBuffer(0.8, true, 'exponential', {
          family: 'explosion',
          random: sfx.randomScopes.bufferFamilies.explosion,
        });
      } else {
        const bufferSize = sfx.context.sampleRate * 0.8;
        noiseBuffer = sfx.context.createBuffer(
          1,
          bufferSize,
          sfx.context.sampleRate
        );
        const output = noiseBuffer.getChannelData(0);
        const noiseRandom = requireRandom(
          sfx.randomScopes?.bufferFamilies?.explosion,
          'audio.sfx.explosion'
        );
        for (let i = 0; i < bufferSize; i++) {
          output[i] = noiseRandom.range(-1, 1);
        }
      }

      const noise = sfx.pool
        ? sfx.pool.getBufferSource()
        : sfx.context.createBufferSource();
      noise.buffer = noiseBuffer;
      const noiseGain = sfx.pool
        ? sfx.pool.getGain()
        : sfx.context.createGain();
      noise.connect(noiseGain);
      noiseGain.connect(noiseFilter);

      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(sub.start, now);
      subOsc.frequency.exponentialRampToValueAtTime(
        sub.end,
        now + sub.duration
      );
      subGain.gain.setValueAtTime(sub.gain, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + sub.duration);

      midOsc.type = 'triangle';
      midOsc.frequency.setValueAtTime(mid.start, now);
      midOsc.frequency.exponentialRampToValueAtTime(
        mid.end,
        now + mid.duration
      );
      midGain.gain.setValueAtTime(mid.gain, now);
      midGain.gain.exponentialRampToValueAtTime(0.001, now + mid.duration);

      noiseGain.gain.setValueAtTime(noiseProfile.gain, now);
      noiseGain.gain.exponentialRampToValueAtTime(
        0.001,
        now + noiseProfile.duration
      );
      noiseFilter.frequency.setValueAtTime(noiseProfile.filterStart, now);
      noiseFilter.frequency.exponentialRampToValueAtTime(
        noiseProfile.filterEnd,
        now + noiseProfile.duration * 0.9
      );

      subOsc.start(now);
      subOsc.stop(now + sub.duration + 0.01);
      midOsc.start(now);
      midOsc.stop(now + mid.duration + 0.01);
      noise.start(now);
      noise.stop(now + noiseProfile.duration + 0.01);

      if (sfx.pool) {
        const longest = Math.max(
          sub.duration,
          mid.duration,
          noiseProfile.duration
        );
        setTimeout(
          () => {
            sfx.pool.returnGain(subGain);
            sfx.pool.returnGain(midGain);
            sfx.pool.returnGain(noiseGain);
            sfx.pool.returnFilter(noiseFilter);
          },
          longest * 1000 + 100
        );
      }
    });
  }

  return {
    playExplosion,
  };
}
