// Batched cues: the sounds that fire many times a second and go through the
// AudioBatcher. Laser shot, target lock and XP collect route to the protected
// bus (player feedback, never ducks); drone fire, hunter burst, mine explosion
// and asteroid break route to the ambient bus (world/enemy, ducks). The bodies
// came from SFXBus.js unchanged; the bus keeps the batcher and its dispatcher.
import { AUDIO_REVERB_SEND_DB } from '../../../data/audio/mix.js';

/**
 * Batched cues: normalizers, batch-scheduling wrappers and direct synthesis.
 * @param {import('../SFXBus.js').SfxKit} sfx - the bus toolkit (live handles,
 *   routing and the shared synth primitives); never the bus itself.
 */
export function createBatchedCues(sfx) {
  function normalizeLaserShotOptions(options = {}) {
    const targeting = options?.targeting || {};
    const lockCount = Math.max(1, Math.floor(targeting.lockCount || 1));

    let pitchMultiplier = 1;
    if (targeting.dynamicPrediction) {
      pitchMultiplier += 0.12;
    }
    if (lockCount > 1) {
      pitchMultiplier += Math.min(0.18, 0.04 * (lockCount - 1));
    }

    const tailGain = 0.12 + Math.min(0.05, 0.02 * (lockCount - 1));

    return {
      pitchMultiplier,
      tailGain,
      lockCount,
    };
  }

  function normalizeDroneFireOptions(data = {}) {
    const projectileSpeed = Number(data?.projectile?.speed);
    let speed = Number.isFinite(projectileSpeed)
      ? projectileSpeed
      : Math.hypot(data?.velocity?.x ?? 0, data?.velocity?.y ?? 0);
    if (!Number.isFinite(speed)) {
      speed = 320;
    }

    const spread = Math.abs(Number(data?.projectile?.spread ?? 0));
    const wave = Number(data?.wave);
    const speedRatio = Math.min(1, Math.max(0, (speed - 180) / 320));
    const baseFrequency = 600 + speedRatio * 200; // 600-800Hz window
    const detune = Math.min(80, spread * 120);
    const duration = 0.08 + speedRatio * 0.03;
    const intensity = Math.min(1.2, 0.6 + speedRatio * 0.5);

    return {
      type: 'drone',
      frequency: baseFrequency,
      detune,
      duration,
      gain: 0.1 + intensity * 0.04,
      intensity,
      wave,
      pan: Number(data?.pan) || 0,
      distance: data?.distance || null,
      enemyType: (
        data?.enemyType ||
        data?.enemy?.type ||
        'drone'
      ).toLowerCase(),
    };
  }

  function normalizeHunterBurstOptions(data = {}) {
    const burst = data?.projectile?.burst || {};
    const totalShots = Math.max(1, Math.floor(burst.total ?? 3));
    const shotsRemaining = Math.max(
      0,
      Math.floor(burst.shotsRemaining ?? totalShots)
    );
    const shotIndex = Math.max(0, totalShots - shotsRemaining);
    const isFirstShot = shotIndex === 0;

    if (!isFirstShot) {
      // We synthesize the entire burst on the opening shot so repeated
      // callbacks in the same burst don't stack unnecessarily.
      return null;
    }

    const projectileSpeed = Number(data?.projectile?.speed);
    const speedRatio = Number.isFinite(projectileSpeed)
      ? Math.min(1, Math.max(0, (projectileSpeed - 260) / 320))
      : 0.5;

    const baseFrequency = 700 + speedRatio * 120;
    const frequencyJitter = 60 + speedRatio * 30;
    const spacing = 0.05;

    return {
      type: 'hunter',
      baseFrequency,
      frequencyJitter,
      shotCount: totalShots,
      spacing,
      duration: 0.09,
      gain: 0.13 + speedRatio * 0.06,
      intensity: Math.min(1.2, 0.7 + speedRatio * 0.5),
      pan: Number(data?.pan) || 0,
      distance: data?.distance || null,
      burstId:
        burst.id !== undefined
          ? `hunter:${burst.id}`
          : `hunter:${data?.enemyId ?? 'unknown'}:${data?.wave ?? 'w0'}`,
      enemyType: (
        data?.enemyType ||
        data?.enemy?.type ||
        'hunter'
      ).toLowerCase(),
    };
  }

  function normalizeMineExplosionOptions(data = {}) {
    const radius = Number(data?.radius);
    const damage = Number(data?.damage);
    const normalizedRadius = Number.isFinite(radius) ? radius : 120;
    const normalizedDamage = Number.isFinite(damage) ? damage : 40;

    const intensityBase = normalizedRadius / 160 + normalizedDamage / 140;
    const intensity = Math.min(1.5, Math.max(0.5, intensityBase));
    const duration = 0.42 + Math.min(0.16, intensity * 0.12);

    return {
      type: 'mine',
      duration,
      startFrequency: 110 - intensity * 35,
      endFrequency: 38,
      noiseGain: 0.22 + intensity * 0.18,
      rumbleGain: 0.2 + intensity * 0.18,
      intensity,
      pan: Number(data?.pan) || 0,
      distance: data?.distance || null,
      enemyType: (data?.enemyType || data?.enemy?.type || 'mine').toLowerCase(),
    };
  }

  function resolveEnemySoundPriority(enemyType, data = {}) {
    const normalizedType =
      typeof enemyType === 'string' ? enemyType.toLowerCase() : '';
    const caps = {
      drone: 2,
      hunter: 3,
      mine: 3,
    };

    const cap = caps[normalizedType] ?? 2;
    let priority = 1;

    const wave = Number(data?.wave);
    if (Number.isFinite(wave) && wave > 0) {
      priority = Math.max(priority, Math.min(cap, Math.ceil(wave / 8)));
    }

    if (normalizedType === 'drone') {
      const projectileSpeed = Number(data?.projectile?.speed);
      const velocityMagnitude = Math.hypot(
        data?.velocity?.x ?? 0,
        data?.velocity?.y ?? 0
      );
      const speed = Number.isFinite(projectileSpeed)
        ? projectileSpeed
        : velocityMagnitude;
      if (Number.isFinite(speed) && speed > 360) {
        priority = Math.max(priority, 2);
      }
    } else if (normalizedType === 'hunter') {
      const burst = data?.projectile?.burst || {};
      const totalShots = Math.max(1, Math.floor(burst.total ?? 1));
      priority = Math.max(priority, Math.min(cap, totalShots));
    } else if (normalizedType === 'mine') {
      priority = cap;
    }

    const explicitPriority = Number(data?.priority);
    if (Number.isFinite(explicitPriority)) {
      priority = Math.max(priority, explicitPriority);
    }

    return Math.max(0, Math.min(cap, Math.round(priority)));
  }

  function playLaserShot(options = {}) {
    sfx.trackPerformance('playLaserShot');

    const params = normalizeLaserShotOptions(options);

    if (
      sfx.scheduleBatchedSound(
        'playLaserShot',
        [Math.round(params.pitchMultiplier * 1000), params.lockCount],
        { allowOverlap: true, priority: 1 }
      )
    ) {
      return;
    }

    playLaserShotDirect(params);
  }

  function playDroneFire(data = {}) {
    sfx.trackPerformance('playDroneFire');

    const params = normalizeDroneFireOptions(data);
    const priority = resolveEnemySoundPriority(params.enemyType, data);

    if (
      sfx.scheduleBatchedSound('playDroneFire', params, {
        allowOverlap: true,
        priority,
      })
    ) {
      return;
    }

    playDroneFireDirect(params);
  }

  function playHunterBurst(data = {}) {
    sfx.trackPerformance('playHunterBurst');

    const params = normalizeHunterBurstOptions(data);
    if (!params) {
      return;
    }

    const priority = resolveEnemySoundPriority(params.enemyType, data);

    if (
      sfx.scheduleBatchedSound('playHunterBurst', params, {
        allowOverlap: true,
        priority,
      })
    ) {
      return;
    }

    playHunterBurstDirect(params);
  }

  function playMineExplosion(data = {}) {
    sfx.trackPerformance('playMineExplosion');

    const params = normalizeMineExplosionOptions(data);
    const priority = resolveEnemySoundPriority(params.enemyType, data);

    if (
      sfx.scheduleBatchedSound('playMineExplosion', params, {
        allowOverlap: false,
        priority,
      })
    ) {
      return;
    }

    playMineExplosionDirect(params);
  }

  function playTargetLock(data = {}) {
    sfx.trackPerformance('playTargetLock');

    const lockCount = Math.max(1, Math.floor(data.lockCount || 1));

    if (
      sfx.scheduleBatchedSound('playTargetLock', [lockCount], {
        allowOverlap: false,
        priority: 2,
      })
    ) {
      return;
    }

    playTargetLockDirect({ lockCount });
  }

  function playAsteroidBreak(size) {
    sfx.trackPerformance('playAsteroidBreak');

    if (
      sfx.scheduleBatchedSound('playAsteroidBreak', [size], {
        allowOverlap: false,
        priority: 2,
      })
    ) {
      return;
    }

    playAsteroidBreakDirect(size);
  }

  function playXPCollect() {
    sfx.trackPerformance('playXPCollect');

    if (
      sfx.scheduleBatchedSound('playXPCollect', [], {
        allowOverlap: true,
        priority: 1,
      })
    ) {
      return;
    }

    playXPCollectDirect();
  }

  function playLaserShotDirect(params = {}) {
    sfx.safePlay(() => {
      const osc = sfx.pool
        ? sfx.pool.getOscillator()
        : sfx.context.createOscillator();
      const gain = sfx.pool ? sfx.pool.getGain() : sfx.context.createGain();

      osc.connect(gain);
      // Player shot — protected branch (player feedback never ducks; D-14).
      sfx.connectProtected(gain);

      const pitchMultiplier = Number.isFinite(params.pitchMultiplier)
        ? Math.max(0.6, Math.min(1.6, params.pitchMultiplier))
        : 1;
      const tailGain = Number.isFinite(params.tailGain)
        ? Math.min(0.22, Math.max(0.08, params.tailGain))
        : 0.12;

      const startFreq = Math.min(1150, 800 * pitchMultiplier);
      const endFreq = Math.max(110, 150 * Math.max(0.7, pitchMultiplier * 0.9));

      osc.frequency.setValueAtTime(startFreq, sfx.context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        endFreq,
        sfx.context.currentTime + 0.08
      );

      gain.gain.setValueAtTime(tailGain, sfx.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        sfx.context.currentTime + 0.08
      );

      osc.start();
      osc.stop(sfx.context.currentTime + 0.08);

      if (sfx.pool) {
        setTimeout(() => {
          sfx.pool.returnGain(gain);
        }, 90);
      }
    });
  }

  function playDroneFireDirect(params = {}) {
    sfx.safePlay(() => {
      if (!sfx.context) {
        return;
      }

      const voices = Math.max(
        1,
        Math.floor(params.count ?? params.concurrency ?? 1)
      );
      const intensity = Number.isFinite(params.intensity)
        ? params.intensity
        : 0.7;
      const baseGain = Number.isFinite(params.gain) ? params.gain : 0.12;
      const totalGain = Math.min(0.22, baseGain * (1 + (voices - 1) * 0.35));
      const gainPerVoice = Math.max(0.035, totalGain / voices);
      const detune = Number.isFinite(params.detune) ? params.detune : 0;
      const duration = Math.max(0.06, Number(params.duration) || 0.1);
      const startFrequency = Math.max(520, Number(params.frequency) || 680);
      const now = sfx.context.currentTime;
      const output = sfx.ambientInput(params.pan, params.distance);

      for (let i = 0; i < voices; i += 1) {
        const osc = sfx.pool
          ? sfx.pool.getOscillator()
          : sfx.context.createOscillator();
        const gain = sfx.pool ? sfx.pool.getGain() : sfx.context.createGain();

        osc.connect(gain);
        if (output) gain.connect(output);

        const spreadFactor = voices > 1 ? i / (voices - 1) - 0.5 : 0;
        const pitchOffset = detune * spreadFactor;
        const voiceStart = now + (voices > 2 ? i * 0.004 : 0);
        const voiceFrequency = Math.max(520, startFrequency + pitchOffset);
        const targetFrequency = Math.max(320, voiceFrequency * 0.55);

        osc.type = 'square';
        osc.frequency.setValueAtTime(voiceFrequency, voiceStart);
        osc.frequency.exponentialRampToValueAtTime(
          targetFrequency,
          voiceStart + duration
        );

        const accent = 1 + Math.min(0.35, intensity * 0.25) * spreadFactor;
        gain.gain.setValueAtTime(gainPerVoice * (1 + accent * 0.2), voiceStart);
        gain.gain.exponentialRampToValueAtTime(0.001, voiceStart + duration);

        osc.start(voiceStart);
        osc.stop(voiceStart + duration);

        if (sfx.pool) {
          setTimeout(
            () => {
              sfx.pool.returnGain(gain);
            },
            (voiceStart + duration - now) * 1000 + 20
          );
        }
      }
    });
  }

  function playHunterBurstDirect(params = {}) {
    sfx.safePlay(() => {
      if (!sfx.context) {
        return;
      }

      const shotCount = Math.max(1, Math.floor(params.shotCount ?? 3));
      const spacing = Math.max(0.02, Number(params.spacing) || 0.05);
      const duration = Math.max(0.06, Number(params.duration) || 0.09);
      const concurrency = Math.max(1, Math.floor(params.concurrency ?? 1));
      const baseFrequency = Math.min(
        900,
        Math.max(700, Number(params.baseFrequency) || 760)
      );
      const frequencyJitter = Math.max(0, Number(params.frequencyJitter) || 60);
      const intensity = Number.isFinite(params.intensity)
        ? params.intensity
        : 0.8;
      const baseGain = Number.isFinite(params.gain) ? params.gain : 0.15;
      const totalGain = Math.min(0.32, baseGain * concurrency);
      const perShotGain = Math.max(0.04, totalGain / shotCount);
      const now = sfx.context.currentTime;
      const output = sfx.ambientInput(params.pan, params.distance);

      for (let shot = 0; shot < shotCount; shot += 1) {
        const osc = sfx.pool
          ? sfx.pool.getOscillator()
          : sfx.context.createOscillator();
        const gain = sfx.pool ? sfx.pool.getGain() : sfx.context.createGain();

        osc.connect(gain);
        if (output) gain.connect(output);

        const shotStart = now + shot * spacing;
        const position = shotCount > 1 ? shot / (shotCount - 1) : 0.5;
        const freqOffset = (position - 0.5) * frequencyJitter;
        const shotFrequency = Math.min(
          900,
          Math.max(700, baseFrequency + freqOffset)
        );
        const targetFrequency = Math.max(360, shotFrequency * 0.6);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(shotFrequency, shotStart);
        osc.frequency.exponentialRampToValueAtTime(
          targetFrequency,
          shotStart + duration
        );

        const accent = 1 + Math.min(0.4, intensity * 0.3) * (1 - position);
        gain.gain.setValueAtTime(perShotGain * accent, shotStart);
        gain.gain.exponentialRampToValueAtTime(0.001, shotStart + duration);

        osc.start(shotStart);
        osc.stop(shotStart + duration);

        if (sfx.pool) {
          setTimeout(
            () => {
              sfx.pool.returnGain(gain);
            },
            (shotStart + duration - now) * 1000 + 20
          );
        }
      }
    });
  }

  function playMineExplosionDirect(params = {}) {
    sfx.safePlay(() => {
      if (!sfx.context) {
        return;
      }

      const duration = Math.max(0.32, Number(params.duration) || 0.5);
      const clusterSize = Math.max(1, Math.floor(params.clusterSize ?? 1));
      const intensity = Number.isFinite(params.intensity)
        ? params.intensity
        : 0.9;
      const startFrequency = Math.max(40, Number(params.startFrequency) || 90);
      const endFrequency = Math.max(22, Number(params.endFrequency) || 36);
      const noiseGainValue = Math.min(
        0.55,
        (Number(params.noiseGain) || 0.25) * (1 + (clusterSize - 1) * 0.18)
      );
      const rumbleGainValue = Math.min(
        0.36,
        (Number(params.rumbleGain) || 0.24) * (1 + (clusterSize - 1) * 0.22)
      );

      const now = sfx.context.currentTime;
      const destination = sfx.ambientInput(params.pan, params.distance);
      if (!destination) {
        return;
      }

      const rumbleOsc = sfx.pool
        ? sfx.pool.getOscillator()
        : sfx.context.createOscillator();
      const rumbleGain = sfx.pool
        ? sfx.pool.getGain()
        : sfx.context.createGain();

      rumbleOsc.type = 'sine';
      rumbleOsc.frequency.setValueAtTime(startFrequency, now);
      rumbleOsc.frequency.exponentialRampToValueAtTime(
        endFrequency,
        now + duration
      );
      rumbleOsc.connect(rumbleGain);
      rumbleGain.connect(destination);
      sfx.sendToReverb(rumbleGain, AUDIO_REVERB_SEND_DB.mine);

      rumbleGain.gain.setValueAtTime(rumbleGainValue, now);
      rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      let noiseBuffer = null;
      if (sfx.cache && typeof sfx.cache.getNoiseBuffer === 'function') {
        noiseBuffer = sfx.cache.getNoiseBuffer(duration, true, 'exponential', {
          family: 'explosion',
          random:
            sfx.randomScopes?.bufferFamilies?.explosion ||
            sfx.randomScopes?.families?.explosion ||
            sfx.randomScopes?.base ||
            null,
        });
      }

      if (!noiseBuffer) {
        const bufferSize = Math.max(
          1,
          Math.floor(sfx.context.sampleRate * duration)
        );
        noiseBuffer = sfx.context.createBuffer(
          1,
          bufferSize,
          sfx.context.sampleRate
        );
        const output = noiseBuffer.getChannelData(0);
        const rng = sfx.resolveRandom(
          sfx.randomScopes?.bufferFamilies?.explosion,
          sfx.randomScopes?.families?.explosion,
          sfx.randomScopes?.base
        );
        for (let i = 0; i < bufferSize; i += 1) {
          const sample =
            typeof rng.range === 'function'
              ? rng.range(-1, 1)
              : rng.float() * 2 - 1;
          output[i] = sample;
        }
      }

      const noiseSource = sfx.pool
        ? sfx.pool.getBufferSource()
        : sfx.context.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      noiseSource.loop = false;

      const noiseFilter = sfx.context.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(260 + intensity * 90, now);

      const noiseGain = sfx.pool
        ? sfx.pool.getGain()
        : sfx.context.createGain();

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(destination);
      sfx.sendToReverb(noiseGain, AUDIO_REVERB_SEND_DB.mine);

      noiseGain.gain.setValueAtTime(noiseGainValue, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.85);

      rumbleOsc.start(now);
      rumbleOsc.stop(now + duration);

      noiseSource.start(now);
      noiseSource.stop(now + duration * 0.85);

      if (sfx.pool) {
        setTimeout(
          () => {
            sfx.pool.returnGain(rumbleGain);
            sfx.pool.returnGain(noiseGain);
          },
          duration * 1000 + 40
        );
      }
    });
  }

  function playTargetLockDirect(params = {}) {
    sfx.safePlay(() => {
      const osc = sfx.pool
        ? sfx.pool.getOscillator()
        : sfx.context.createOscillator();
      const gain = sfx.pool ? sfx.pool.getGain() : sfx.context.createGain();

      osc.connect(gain);
      // Player targeting feedback — protected branch.
      sfx.connectProtected(gain);

      const lockCount = Math.max(1, Math.floor(params.lockCount || 1));
      const baseFrequency = 720;
      const frequency = Math.min(
        1200,
        baseFrequency * (1 + (lockCount - 1) * 0.12)
      );
      const peakGain = 0.08 + Math.min(0.05, 0.018 * (lockCount - 1));
      const now = sfx.context.currentTime;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(frequency, now);
      osc.frequency.linearRampToValueAtTime(frequency * 1.12, now + 0.1);

      gain.gain.setValueAtTime(peakGain, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc.start(now);
      osc.stop(now + 0.14);

      if (sfx.pool) {
        setTimeout(() => {
          sfx.pool.returnGain(gain);
        }, 150);
      }
    });
  }

  function playAsteroidBreakDirect(size) {
    sfx.safePlay(() => {
      // [NEO-ARCADE AUDIO] Crunchy Explosion
      const baseFreq = size === 'large' ? 100 : size === 'medium' ? 140 : 200; // Higher freq for clarity
      const duration = size === 'large' ? 0.4 : size === 'medium' ? 0.3 : 0.2;

      const osc = sfx.pool
        ? sfx.pool.getOscillator()
        : sfx.context.createOscillator();
      const gain = sfx.pool ? sfx.pool.getGain() : sfx.context.createGain();

      // Filter for weight
      const filter = sfx.pool
        ? sfx.pool.getFilter()
        : sfx.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, sfx.context.currentTime); // Open filter slightly
      filter.frequency.exponentialRampToValueAtTime(
        100,
        sfx.context.currentTime + duration
      );

      osc.connect(gain);
      gain.connect(filter);

      const destination = sfx.ambientDestination();
      if (destination) {
        filter.connect(destination);
      } else {
        // Fallback connection if getAmbientDestination fails
        sfx.connectAmbient(filter);
      }

      // Square wave for 8-bit crunch
      osc.type = 'square';
      osc.frequency.setValueAtTime(baseFreq, sfx.context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        baseFreq * 0.2, // Deep drop
        sfx.context.currentTime + duration
      );

      // Louder initial impact
      gain.gain.setValueAtTime(0.3, sfx.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        sfx.context.currentTime + duration
      );

      osc.start();
      osc.stop(sfx.context.currentTime + duration);

      if (sfx.pool) {
        setTimeout(
          () => {
            sfx.pool.returnGain(gain);
            sfx.pool.returnFilter(filter); // Assuming returnFilter exists or ignoring if leak is acceptable for now
          },
          duration * 1000 + 50
        );
      }
    });
  }

  function playXPCollectDirect() {
    sfx.safePlay(() => {
      const osc = sfx.pool
        ? sfx.pool.getOscillator()
        : sfx.context.createOscillator();
      const gain = sfx.pool ? sfx.pool.getGain() : sfx.context.createGain();

      osc.connect(gain);
      sfx.connectAmbient(gain);

      osc.frequency.setValueAtTime(600, sfx.context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        1200,
        sfx.context.currentTime + 0.12
      );

      gain.gain.setValueAtTime(0.08, sfx.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        sfx.context.currentTime + 0.12
      );

      osc.start();
      osc.stop(sfx.context.currentTime + 0.12);

      if (sfx.pool) {
        setTimeout(() => {
          sfx.pool.returnGain(gain);
        }, 130);
      }
    });
  }
  return {
    playLaserShot,
    playDroneFire,
    playHunterBurst,
    playMineExplosion,
    playTargetLock,
    playAsteroidBreak,
    playXPCollect,
    playLaserShotDirect,
    playDroneFireDirect,
    playHunterBurstDirect,
    playMineExplosionDirect,
    playTargetLockDirect,
    playAsteroidBreakDirect,
    playXPCollectDirect,
  };
}
