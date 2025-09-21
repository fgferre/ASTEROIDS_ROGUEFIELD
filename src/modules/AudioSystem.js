class AudioSystem {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.musicGain = null;
    this.effectsGain = null;
    this.initialized = false;
    this.sounds = new Map();
    this.settings = null;
    this.volumeState = {
      master: 0.25,
      music: 0.6,
      effects: 1,
      muteAll: false,
    };

    if (typeof gameServices !== 'undefined') {
      gameServices.register('audio', this);
      if (typeof gameServices.has === 'function' && gameServices.has('settings')) {
        this.settings = gameServices.get('settings');
      }
    }

    this.setupEventListeners();
    this.bootstrapSettings();
    console.log('[AudioSystem] Initialized');
  }

  async init() {
    if (this.initialized) return;

    try {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      await this.context.resume();

      this.masterGain = this.context.createGain();
      this.masterGain.connect(this.context.destination);

      this.musicGain = this.context.createGain();
      this.effectsGain = this.context.createGain();

      this.musicGain.connect(this.masterGain);
      this.effectsGain.connect(this.masterGain);

      this.applyVolumeToNodes();
      this.initialized = true;
    } catch (error) {
      console.warn('Áudio não disponível:', error);
      this.initialized = false;
    }
  }

  setupEventListeners() {
    if (typeof gameEvents === 'undefined') return;

    gameEvents.on('settings-audio-changed', (payload = {}) => {
      if (payload?.values) {
        this.updateVolumeState(payload.values);
      }
    });

    gameEvents.on('weapon-fired', () => {
      this.playLaserShot();
    });

    gameEvents.on('enemy-destroyed', (data) => {
      if (!data) return;
      this.playAsteroidBreak(data.size);
      if (data.size === 'large') {
        this.playBigExplosion();
      }
    });

    gameEvents.on('asteroid-volatile-exploded', () => {
      this.playBigExplosion();
    });

    gameEvents.on('player-leveled-up', () => {
      this.playLevelUp();
    });

    gameEvents.on('xp-collected', () => {
      this.playXPCollect();
    });

    gameEvents.on('player-took-damage', () => {
      this.playShipHit();
    });

    gameEvents.on('shield-activated', () => {
      this.playShieldActivate();
    });

    gameEvents.on('shield-hit', () => {
      this.playShieldImpact();
    });

    gameEvents.on('shield-broken', () => {
      this.playShieldBreak();
    });

    gameEvents.on('shield-recharged', () => {
      this.playShieldRecharged();
    });

    gameEvents.on('shield-activation-failed', () => {
      this.playShieldFail();
    });

    gameEvents.on('shield-shockwave', () => {
      this.playShieldShockwave();
    });
  }

  bootstrapSettings() {
    if (this.settings && typeof this.settings.getCategoryValues === 'function') {
      const values = this.settings.getCategoryValues('audio');
      if (values) {
        this.updateVolumeState(values);
        return;
      }
    }

    this.applyVolumeToNodes();
  }

  sanitizeVolume(value, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return Math.min(1, Math.max(0, numeric));
  }

  updateVolumeState(values = {}) {
    this.volumeState = {
      master: this.sanitizeVolume(values.masterVolume, this.volumeState.master),
      music: this.sanitizeVolume(values.musicVolume, this.volumeState.music),
      effects: this.sanitizeVolume(values.effectsVolume, this.volumeState.effects),
      muteAll: Boolean(values.muteAll ?? this.volumeState.muteAll),
    };

    this.applyVolumeToNodes();
  }

  applyVolumeToNodes() {
    if (!this.masterGain) {
      return;
    }

    const { master, music, effects, muteAll } = this.volumeState;
    const masterValue = muteAll ? 0 : master;

    this.masterGain.gain.value = masterValue;

    if (this.musicGain) {
      this.musicGain.gain.value = muteAll ? 0 : master * music;
    }

    if (this.effectsGain) {
      this.effectsGain.gain.value = muteAll ? 0 : master * effects;
    }
  }

  getEffectsDestination() {
    if (this.effectsGain) {
      return this.effectsGain;
    }
    if (this.masterGain) {
      return this.masterGain;
    }
    return null;
  }

  connectGainNode(node) {
    const destination = this.getEffectsDestination();
    if (destination && node && typeof node.connect === 'function') {
      node.connect(destination);
    }
  }

  safePlay(soundFunction) {
    if (!this.initialized || !this.context) return;

    try {
      if (this.context.state === 'suspended') {
        this.context.resume();
      }
      soundFunction();
    } catch (error) {
      console.warn('Erro ao reproduzir som:', error);
    }
  }

  playLaserShot() {
    this.safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

      osc.frequency.setValueAtTime(800, this.context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        150,
        this.context.currentTime + 0.08
      );

      gain.gain.setValueAtTime(0.12, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.context.currentTime + 0.08
      );

      osc.start();
      osc.stop(this.context.currentTime + 0.08);
    });
  }

  playAsteroidBreak(size) {
    this.safePlay(() => {
      const baseFreq = size === 'large' ? 70 : size === 'medium' ? 110 : 150;
      const duration =
        size === 'large' ? 0.35 : size === 'medium' ? 0.25 : 0.18;

      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(baseFreq, this.context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        baseFreq * 0.4,
        this.context.currentTime + duration
      );

      gain.gain.setValueAtTime(0.15, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.context.currentTime + duration
      );

      osc.start();
      osc.stop(this.context.currentTime + duration);
    });
  }

  playBigExplosion() {
    this.safePlay(() => {
      const osc = this.context.createOscillator();
      const oscGain = this.context.createGain();
      osc.connect(oscGain);
      const destination = this.getEffectsDestination();
      if (destination) {
        oscGain.connect(destination);
      }

      const bufferSize = this.context.sampleRate * 0.5;
      const noiseBuffer = this.context.createBuffer(
        1,
        bufferSize,
        this.context.sampleRate
      );
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const noise = this.context.createBufferSource();
      noise.buffer = noiseBuffer;
      const noiseGain = this.context.createGain();
      noise.connect(noiseGain);
      if (destination) {
        noiseGain.connect(destination);
      }

      const now = this.context.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(60, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.5);

      oscGain.gain.setValueAtTime(0.2, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      noiseGain.gain.setValueAtTime(0.5, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.start(now);
      osc.stop(now + 0.5);

      noise.start(now);
      noise.stop(now + 0.4);
    });
  }

  playXPCollect() {
    this.safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

      osc.frequency.setValueAtTime(600, this.context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        1200,
        this.context.currentTime + 0.12
      );

      gain.gain.setValueAtTime(0.08, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.context.currentTime + 0.12
      );

      osc.start();
      osc.stop(this.context.currentTime + 0.12);
    });
  }

  playLevelUp() {
    this.safePlay(() => {
      const frequencies = [440, 554, 659, 880, 1108];
      frequencies.forEach((freq, index) => {
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();

        osc.connect(gain);
        this.connectGainNode(gain);

        const startTime = this.context.currentTime + index * 0.06;
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.1, startTime + 0.04);
        gain.gain.linearRampToValueAtTime(0, startTime + 0.18);

        osc.start(startTime);
        osc.stop(startTime + 0.18);
      });
    });
  }

  playShipHit() {
    this.safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, this.context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        40,
        this.context.currentTime + 0.3
      );

      gain.gain.setValueAtTime(0.2, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.context.currentTime + 0.3
      );

      osc.start();
      osc.stop(this.context.currentTime + 0.3);
    });
  }

  playShieldActivate() {
    this.safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

      const now = this.context.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(540, now + 0.18);

      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.start(now);
      osc.stop(now + 0.18);
    });
  }

  playShieldImpact() {
    this.safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

      const now = this.context.currentTime;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.1);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.start(now);
      osc.stop(now + 0.12);
    });
  }

  playShieldBreak() {
    this.safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

      const now = this.context.currentTime;
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.25);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.start(now);
      osc.stop(now + 0.25);
    });
  }

  playShieldRecharged() {
    this.safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

      const now = this.context.currentTime;
      osc.type = 'square';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.setValueAtTime(540, now + 0.06);
      osc.frequency.setValueAtTime(660, now + 0.12);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.start(now);
      osc.stop(now + 0.18);
    });
  }

  playShieldFail() {
    this.safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

      const now = this.context.currentTime;
      osc.type = 'square';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.12);

      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.start(now);
      osc.stop(now + 0.15);
    });
  }

  playShieldShockwave() {
    this.safePlay(() => {
      const noiseBuffer = this.context.createBuffer(
        1,
        this.context.sampleRate * 0.4,
        this.context.sampleRate
      );
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseBuffer.length; i++) {
        output[i] = (Math.random() * 2 - 1) * (1 - i / noiseBuffer.length);
      }

      const noise = this.context.createBufferSource();
      noise.buffer = noiseBuffer;
      const noiseGain = this.context.createGain();

      const osc = this.context.createOscillator();
      const oscGain = this.context.createGain();

      noise.connect(noiseGain);
      this.connectGainNode(noiseGain);

      osc.connect(oscGain);
      this.connectGainNode(oscGain);

      const now = this.context.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.4);

      oscGain.gain.setValueAtTime(0.18, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      noiseGain.gain.setValueAtTime(0.4, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      noise.start(now);
      noise.stop(now + 0.35);

      osc.start(now);
      osc.stop(now + 0.4);
    });
  }

  reset() {
    // Nada específico por enquanto, mas mantemos interface consistente
  }
}

export default AudioSystem;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioSystem;
}
