// The boss's own voice: the roar on spawn, the phase-change sweep and the
// defeat fanfare, synthesized from BOSS_AUDIO_FREQUENCY_PRESETS. They route
// through the facade's effects destination (connectGainNode) with the boss
// reverb send, behind the facade's resume gate; AudioSystem's playBoss*
// methods call these.
import { BOSS_AUDIO_FREQUENCY_PRESETS } from '../../data/audio/bossCues.js';
import { AUDIO_REVERB_SEND_DB } from '../../data/audio/mix.js';

export function playBossRoar(audio) {
  audio._trackPerformance('playBossRoar');

  audio.safePlay(() => {
    const context = audio.context;
    const config = BOSS_AUDIO_FREQUENCY_PRESETS?.roar;
    if (!config) {
      return;
    }

    const now = context.currentTime;
    const duration = config.duration ?? 1.2;
    const sweepStart = config.sweep?.start ?? 90;
    const sweepEnd = config.sweep?.end ?? 150;
    const sweepDuration = config.sweep?.duration ?? duration * 0.6;

    const baseOsc = context.createOscillator();
    const baseGain = context.createGain();
    const filter = context.createBiquadFilter();

    baseOsc.type = 'sawtooth';
    baseOsc.frequency.setValueAtTime(sweepStart, now);
    baseOsc.frequency.linearRampToValueAtTime(sweepEnd, now + sweepDuration);

    filter.type = config.filter?.type || 'lowpass';
    filter.frequency.setValueAtTime(config.filter?.frequency ?? 420, now);

    baseGain.gain.setValueAtTime(0, now);
    baseGain.gain.linearRampToValueAtTime(
      config.attackGain ?? 0.25,
      now + 0.12
    );
    const sustainTime =
      now + Math.max(0.2, duration - (config.releaseDuration ?? 0.5));
    baseGain.gain.linearRampToValueAtTime(
      config.sustainGain ?? 0.18,
      sustainTime
    );
    baseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    baseOsc.connect(filter);
    filter.connect(baseGain);
    audio.connectGainNode(baseGain);
    audio.sfxBus._sendToReverb(baseGain, AUDIO_REVERB_SEND_DB.boss);

    baseOsc.start(now);
    baseOsc.stop(now + duration);

    if (config.vibrato) {
      const vibratoOsc = context.createOscillator();
      const vibratoGain = context.createGain();
      vibratoOsc.type = 'sine';
      vibratoOsc.frequency.setValueAtTime(config.vibrato.speed ?? 5, now);
      vibratoGain.gain.setValueAtTime(config.vibrato.depth ?? 6, now);
      vibratoOsc.connect(vibratoGain);
      vibratoGain.connect(baseOsc.frequency);
      vibratoOsc.start(now);
      vibratoOsc.stop(now + duration);
    }

    if (Array.isArray(config.harmonics)) {
      config.harmonics.forEach((frequency, index) => {
        const osc = context.createOscillator();
        const gain = context.createGain();
        const startTime = now + index * 0.05;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(frequency, startTime);

        gain.gain.setValueAtTime(0, startTime);
        const harmonicGain = (config.sustainGain ?? 0.18) * 0.4;
        gain.gain.linearRampToValueAtTime(harmonicGain, startTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        audio.connectGainNode(gain);
        audio.sfxBus._sendToReverb(gain, AUDIO_REVERB_SEND_DB.boss);

        osc.start(startTime);
        osc.stop(now + duration);
      });
    }

    if (config.tail?.frequency) {
      const tailOsc = context.createOscillator();
      const tailGain = context.createGain();
      const tailStart = now + (config.sweep?.duration ?? duration * 0.6);
      const tailDuration = config.tail.duration ?? 0.5;

      tailOsc.type = 'sine';
      tailOsc.frequency.setValueAtTime(config.tail.frequency, tailStart);

      tailGain.gain.setValueAtTime(0, tailStart);
      tailGain.gain.linearRampToValueAtTime(
        config.tail.gain ?? 0.12,
        tailStart + 0.05
      );
      tailGain.gain.exponentialRampToValueAtTime(
        0.001,
        tailStart + tailDuration
      );

      tailOsc.connect(tailGain);
      audio.connectGainNode(tailGain);
      audio.sfxBus._sendToReverb(tailGain, AUDIO_REVERB_SEND_DB.boss);

      tailOsc.start(tailStart);
      tailOsc.stop(tailStart + tailDuration);
    }
  });
}

export function playBossPhaseChange(audio, payload = {}) {
  audio._trackPerformance('playBossPhaseChange');

  audio.safePlay(() => {
    const context = audio.context;
    const config = BOSS_AUDIO_FREQUENCY_PRESETS?.phaseChange;
    if (!config) {
      return;
    }

    const now = context.currentTime;
    const duration = config.duration ?? 0.6;
    const sweepOsc = context.createOscillator();
    const sweepGain = context.createGain();

    const startFreq = config.sweep?.start ?? 220;
    const endFreq = config.sweep?.end ?? 820;

    sweepOsc.type = 'triangle';
    sweepOsc.frequency.setValueAtTime(startFreq, now);
    sweepOsc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

    sweepGain.gain.setValueAtTime(0, now);
    sweepGain.gain.linearRampToValueAtTime(0.16, now + 0.08);
    sweepGain.gain.exponentialRampToValueAtTime(0.001, now + duration + 0.25);

    sweepOsc.connect(sweepGain);
    audio.connectGainNode(sweepGain);
    audio.sfxBus._sendToReverb(sweepGain, AUDIO_REVERB_SEND_DB.boss);

    sweepOsc.start(now);
    sweepOsc.stop(now + duration + 0.25);

    const shimmerConfig = config.shimmer || {};
    if (Array.isArray(shimmerConfig.frequencies)) {
      const spacing = shimmerConfig.spacing ?? 0.08;
      const shimmerDuration = shimmerConfig.duration ?? 0.45;
      const shimmerGainBase = shimmerConfig.gain ?? 0.1;
      const phaseIndex =
        (payload?.phase ?? payload?.nextPhase ?? payload?.newPhase ?? 1) - 1;
      const intensityScale = 1 + Math.max(0, phaseIndex) * 0.12;

      shimmerConfig.frequencies.forEach((frequency, index) => {
        const osc = context.createOscillator();
        const gain = context.createGain();
        const startTime = now + 0.1 + index * spacing;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(
          shimmerGainBase * intensityScale,
          startTime + 0.04
        );
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          startTime + shimmerDuration
        );

        osc.connect(gain);
        audio.connectGainNode(gain);
        audio.sfxBus._sendToReverb(gain, AUDIO_REVERB_SEND_DB.boss);

        osc.start(startTime);
        osc.stop(startTime + shimmerDuration);
      });
    }

    if (config.swell?.frequency) {
      const swellOsc = context.createOscillator();
      const swellGain = context.createGain();
      const swellDuration = config.swell.duration ?? 0.8;

      swellOsc.type = 'sine';
      swellOsc.frequency.setValueAtTime(config.swell.frequency, now);
      swellOsc.frequency.linearRampToValueAtTime(
        config.swell.frequency * 0.75,
        now + swellDuration
      );

      swellGain.gain.setValueAtTime(0, now);
      swellGain.gain.linearRampToValueAtTime(
        config.swell.gain ?? 0.12,
        now + 0.1
      );
      swellGain.gain.exponentialRampToValueAtTime(0.001, now + swellDuration);

      swellOsc.connect(swellGain);
      audio.connectGainNode(swellGain);
      audio.sfxBus._sendToReverb(swellGain, AUDIO_REVERB_SEND_DB.boss);

      swellOsc.start(now);
      swellOsc.stop(now + swellDuration);
    }
  });
}

export function playBossDefeated(audio) {
  audio._trackPerformance('playBossDefeated');

  audio.safePlay(() => {
    const context = audio.context;
    const config = BOSS_AUDIO_FREQUENCY_PRESETS?.defeated;
    if (!config) {
      return;
    }

    const now = context.currentTime;

    const fanfare = config.fanfare;
    if (fanfare?.notes?.length) {
      fanfare.notes.forEach((note, index) => {
        const osc = context.createOscillator();
        const gain = context.createGain();
        const noteDelay = Number.isFinite(note.delay)
          ? note.delay
          : index * 0.18;
        const startTime = now + Math.max(0, noteDelay);
        const noteDuration = note.duration ?? 0.6;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.frequency ?? 440, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(note.gain ?? 0.18, startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          startTime + Math.max(0.3, noteDuration)
        );

        osc.connect(gain);
        audio.connectGainNode(gain);
        audio.sfxBus._sendToReverb(gain, AUDIO_REVERB_SEND_DB.boss);

        osc.start(startTime);
        osc.stop(startTime + Math.max(0.4, noteDuration));
      });

      if (Array.isArray(fanfare.harmony?.frequencies)) {
        const harmonyGain = context.createGain();
        const harmonyStart = now + (fanfare.notes[0]?.delay ?? 0);
        const harmonyDuration = fanfare.harmony.duration ?? 1.6;

        harmonyGain.gain.setValueAtTime(0, harmonyStart);
        harmonyGain.gain.linearRampToValueAtTime(
          fanfare.harmony.gain ?? 0.12,
          harmonyStart + 0.2
        );
        harmonyGain.gain.exponentialRampToValueAtTime(
          0.001,
          harmonyStart + harmonyDuration
        );

        audio.connectGainNode(harmonyGain);
        audio.sfxBus._sendToReverb(harmonyGain, AUDIO_REVERB_SEND_DB.boss);

        fanfare.harmony.frequencies.forEach((frequency) => {
          const osc = context.createOscillator();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(frequency, harmonyStart);
          osc.connect(harmonyGain);
          osc.start(harmonyStart);
          osc.stop(harmonyStart + harmonyDuration);
        });
      }
    }

    if (config.choir?.frequency) {
      const choirOsc = context.createOscillator();
      const choirGain = context.createGain();
      const choirStart = now + 0.2;
      const choirDuration = config.choir.duration ?? 1.8;

      choirOsc.type = 'sawtooth';
      choirOsc.frequency.setValueAtTime(config.choir.frequency, choirStart);
      choirOsc.frequency.linearRampToValueAtTime(
        config.choir.frequency * 0.75,
        choirStart + choirDuration
      );

      choirGain.gain.setValueAtTime(0, choirStart);
      choirGain.gain.linearRampToValueAtTime(
        config.choir.gain ?? 0.08,
        choirStart + 0.25
      );
      choirGain.gain.exponentialRampToValueAtTime(
        0.001,
        choirStart + choirDuration
      );

      choirOsc.connect(choirGain);
      audio.connectGainNode(choirGain);
      audio.sfxBus._sendToReverb(choirGain, AUDIO_REVERB_SEND_DB.boss);

      choirOsc.start(choirStart);
      choirOsc.stop(choirStart + choirDuration);
    }

    if (Array.isArray(config.sparkle?.frequencies)) {
      const spacing = config.sparkle.spacing ?? 0.12;
      const sparkleDuration = config.sparkle.duration ?? 0.5;
      const sparkleGain = config.sparkle.gain ?? 0.08;

      config.sparkle.frequencies.forEach((frequency, index) => {
        const osc = context.createOscillator();
        const gain = context.createGain();
        const startTime = now + 0.4 + index * spacing;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(sparkleGain, startTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          startTime + sparkleDuration
        );

        osc.connect(gain);
        audio.connectGainNode(gain);
        audio.sfxBus._sendToReverb(gain, AUDIO_REVERB_SEND_DB.boss);

        osc.start(startTime);
        osc.stop(startTime + sparkleDuration);
      });
    }
  });
}
