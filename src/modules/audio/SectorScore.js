// The recorded music of a campaign sector (data/audio/sectorScores.js): a
// looping stage track and a boss track of the same length that play
// sample-synced, the boss one silent until a Warden warns. While it plays the
// procedural MusicMixer is silenced; the danger (the mixer's run intensity)
// opens and lifts the stage track. Three one-shot stingers mark the boss
// warning, the sector cleared and the signal lost.
//
//   stage → lowpass (danger) → dangerGain → stageFade ┐
//   boss → bossFade ──────────────────────────────────┴→ output (fades)
//     → pauseLowpass → pauseGain → target (the music duck node)
//   stingers → target
import {
  SECTOR_SCORES,
  SECTOR_SCORE_MIX as MIX,
  SECTOR_SCORE_STINGERS,
} from '../../data/audio/sectorScores.js';

// Encoder padding: the first sample louder than this starts the music.
const AUDIBLE = 1e-4;
const CURVE_POINTS = 64;

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.arrayBuffer();
}

// `bytes`: the file already fetched (prefetch), decoded here.
async function fetchAndDecode(context, url, bytes) {
  return context.decodeAudioData(bytes ?? (await fetchBytes(url)));
}

function firstAudibleSeconds(buffer) {
  let first = buffer.length;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    let i = 0;
    while (i < first && Math.abs(data[i]) <= AUDIBLE) i++;
    first = Math.min(first, i);
  }
  return first / buffer.sampleRate;
}

class SectorScore {
  /**
   * @param {object} deps
   * @param {object} deps.mixer - the MusicMixer (setSilenced, runIntensity).
   * @param {(context, url, bytes?) => Promise<AudioBuffer>} [deps.load]
   * @param {(url) => Promise<ArrayBuffer>} [deps.fetchBytes]
   */
  constructor({
    mixer,
    load = fetchAndDecode,
    fetchBytes: fetchFile = fetchBytes,
  }) {
    this.mixer = mixer;
    this.load = load;
    this.fetchBytes = fetchFile;
    // The one sector picked, its two files fetched and not yet decoded.
    this._prefetch = null;
    this.context = null;
    this.target = null;
    this.sectorId = null; // the sector with a score: kept to restart a retry
    this.active = false;
    this._token = 0;
    this._held = false;
    this._paused = false;
    this._bossOn = false;
    this._nodes = null;
    this._sources = [];
    this._stingers = null;
    this._pollHandle = null;
  }

  init(context, target) {
    this.context = context;
    this.target = target;
  }

  /**
   * A sector is picked: fetch its two files now (not decoded), keeping only
   * this sector's bytes, so start() does not wait for the download.
   */
  prefetch(sectorId) {
    const score = SECTOR_SCORES[sectorId];
    if (!score || this._prefetch?.sectorId === sectorId) return;
    const bytes = Promise.all([
      this.fetchBytes(score.stage),
      this.fetchBytes(score.boss),
    ]).catch(() => null);
    this._prefetch = { sectorId, bytes };
  }

  /** The prefetched bytes of `sectorId` (once: start decodes them) or null. */
  async _takePrefetch(sectorId) {
    const prefetch = this._prefetch;
    if (prefetch?.sectorId !== sectorId) return null;
    this._prefetch = null;
    return prefetch.bytes;
  }

  /** Play the sector's score; a sector without one leaves the mixer alone. */
  async start(sectorId) {
    this.sectorId = sectorId ?? null;
    this._stopNow();
    const score = SECTOR_SCORES[sectorId];
    if (!score || !this.context || !this.target) return;
    const token = ++this._token;
    const context = this.context;
    let stage;
    let boss;
    try {
      const bytes = await this._takePrefetch(sectorId);
      [stage, boss, this._stingers] = await Promise.all([
        this.load(context, score.stage, bytes?.[0]),
        this.load(context, score.boss, bytes?.[1]),
        this._loadStingers(),
      ]);
    } catch (error) {
      console.warn('[SectorScore] could not load the score:', error);
      return;
    }
    if (token !== this._token) return;

    this._build(stage, boss, score.loopSeconds);
    this.active = true;
    this._bossOn = false;
    this.mixer.setSilenced(true, MIX.mixerFadeSeconds);
    this._fadeOutput(this._held ? 0 : 1, MIX.fadeInSeconds);
    this._pollHandle = setInterval(() => this._followDanger(), MIX.pollMs);
    this._followDanger(true);
  }

  async _loadStingers() {
    const entries = await Promise.all(
      Object.entries(SECTOR_SCORE_STINGERS).map(async ([name, url]) => [
        name,
        await this.load(this.context, url),
      ])
    );
    return Object.fromEntries(entries);
  }

  _build(stageBuffer, bossBuffer, loopSeconds) {
    const context = this.context;
    const now = context.currentTime;
    const gain = (value) => {
      const node = context.createGain();
      node.gain.setValueAtTime(value, now);
      return node;
    };
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(MIX.lowpassCalmHz, now);

    const nodes = {
      lowpass,
      dangerGain: gain(MIX.stageGainCalm),
      stageFade: gain(1),
      bossFade: gain(0),
      output: gain(0),
      pauseLowpass: context.createBiquadFilter(),
      pauseGain: gain(1),
    };
    nodes.pauseLowpass.type = 'lowpass';
    nodes.pauseLowpass.frequency.setValueAtTime(MIX.lowpassOpenHz + 2000, now);

    const startAt = now + MIX.startAt;
    const play = (buffer, destination) => {
      const loopStart = firstAudibleSeconds(buffer);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = loopStart;
      source.loopEnd = loopStart + loopSeconds;
      source.connect(destination);
      // Both at the same context time, each from its own first sound.
      source.start(startAt, loopStart);
      return source;
    };
    this._sources = [
      play(stageBuffer, lowpass),
      play(bossBuffer, nodes.bossFade),
    ];

    lowpass.connect(nodes.dangerGain);
    nodes.dangerGain.connect(nodes.stageFade);
    nodes.stageFade.connect(nodes.output);
    nodes.bossFade.connect(nodes.output);
    nodes.output.connect(nodes.pauseLowpass);
    nodes.pauseLowpass.connect(nodes.pauseGain);
    nodes.pauseGain.connect(this.target);
    this._nodes = nodes;
    if (this._paused) this._applyPause(true);
  }

  /** Danger 0..1 → the stage's cutoff (exponential) and level. */
  _followDanger(immediate = false) {
    const nodes = this._nodes;
    if (!nodes) return;
    const open = Math.min(
      1,
      Math.max(0, (this.mixer.runIntensity || 0) / MIX.dangerFull)
    );
    const cutoff =
      MIX.lowpassCalmHz * (MIX.lowpassOpenHz / MIX.lowpassCalmHz) ** open;
    const level =
      MIX.stageGainCalm + (MIX.stageGainOpen - MIX.stageGainCalm) * open;
    const now = this.context.currentTime;
    const tc = immediate ? 0.01 : MIX.dangerTimeConstant;
    nodes.lowpass.frequency.setTargetAtTime(cutoff, now, tc);
    nodes.dangerGain.gain.setTargetAtTime(level, now, tc);
  }

  /** boss-warning / boss-defeated: the stinger and the crossfade. */
  onBossEvent(eventName) {
    if (!this.active) return;
    if (eventName === 'boss-warning') {
      this._playStinger('bossWarning');
      this._crossfade(true, MIX.bossCrossfadeSeconds);
    } else if (eventName === 'boss-defeated') {
      this._playStinger('sectorCleared');
      this._crossfade(false, MIX.clearedCrossfadeSeconds);
    }
  }

  // Equal-power: the two gains follow sin/cos of the same angle, so the
  // summed power stays level through the crossfade.
  _crossfade(toBoss, seconds) {
    const { stageFade, bossFade } = this._nodes;
    if (this._bossOn === toBoss) return;
    this._bossOn = toBoss;
    const now = this.context.currentTime;
    const curve = (param, to) => {
      const from = typeof param.value === 'number' ? param.value : 1 - to;
      const values = new Float32Array(CURVE_POINTS);
      for (let i = 0; i < CURVE_POINTS; i++) {
        const angle = (i / (CURVE_POINTS - 1)) * (Math.PI / 2);
        values[i] =
          to === 1
            ? from + (1 - from) * Math.sin(angle)
            : from * Math.cos(angle);
      }
      param.cancelScheduledValues(now);
      param.setValueCurveAtTime(values, now, seconds);
    };
    curve(bossFade.gain, toBoss ? 1 : 0);
    curve(stageFade.gain, toBoss ? 0 : 1);
  }

  _playStinger(name) {
    const buffer = this._stingers?.[name];
    if (!buffer || !this.context) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.target);
    source.start();
  }

  /** The journey between sectors plays alone: hold the score down meanwhile. */
  holdForJourney(held) {
    this._held = !!held;
    if (this.active) this._fadeOutput(held ? 0 : 1, MIX.fadeInSeconds);
  }

  /** Pause: the whole score underwater (700 Hz) at half level. */
  pause(isPaused) {
    this._paused = !!isPaused;
    if (this._nodes) this._applyPause(this._paused);
  }

  _applyPause(paused) {
    const { pauseLowpass, pauseGain } = this._nodes;
    const now = this.context.currentTime;
    const tc = MIX.pauseRampSeconds / 3;
    pauseLowpass.frequency.setTargetAtTime(
      paused ? MIX.pauseLowpassHz : MIX.lowpassOpenHz + 2000,
      now,
      tc
    );
    pauseGain.gain.setTargetAtTime(paused ? MIX.pauseGain : 1, now, tc);
  }

  _fadeOutput(level, seconds) {
    const param = this._nodes.output.gain;
    const now = this.context.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(level, now + seconds);
  }

  /**
   * Fade the score out and give the mixer back. `stinger` names a stinger
   * played as it goes. Drops the buffers once the sources are stopped.
   */
  stop({ seconds = MIX.fadeOutSeconds, stinger = null } = {}) {
    this._token++;
    if (!this.active) return;
    if (stinger) this._playStinger(stinger);
    this._fadeOutput(0, seconds);
    this.mixer.setSilenced(false, MIX.mixerFadeSeconds);
    this._teardown(this.context.currentTime + seconds);
  }

  /** Immediately, for a new start or reset: no fade, no stinger. */
  _stopNow() {
    this._token++;
    if (!this.active && !this._nodes) return;
    this.mixer.setSilenced(false, 0);
    this._teardown(this.context.currentTime);
  }

  _teardown(stopAt) {
    clearInterval(this._pollHandle);
    this._pollHandle = null;
    const sources = this._sources;
    const nodes = this._nodes;
    sources.forEach((source) => {
      try {
        source.stop(stopAt);
      } catch {
        // Already stopped.
      }
    });
    // The graph is released once the fade has played out.
    setTimeout(
      () => {
        sources.forEach((source) => source.disconnect());
        Object.values(nodes || {}).forEach((node) => node.disconnect());
      },
      Math.max(0, (stopAt - this.context.currentTime) * 1000) + 100
    );
    this._sources = [];
    this._nodes = null;
    this._stingers = null;
    this.active = false;
  }

  /** AudioSystem.reset / destroy: back to nothing, the mixer restored. */
  reset() {
    this._stopNow();
    this.sectorId = null;
    this._held = false;
  }
}

export default SectorScore;
