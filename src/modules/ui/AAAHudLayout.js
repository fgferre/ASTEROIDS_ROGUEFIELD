// src/modules/ui/AAAHudLayout.js

import { ENEMY_TYPES, BOSS_CONFIG } from '../../data/constants/visual.js';
import { WEAPONS } from '../../data/weapons.js';
import { UPGRADE_FAMILIES } from '../../data/upgrades/families.js';
import RandomService from '../../core/RandomService.js';

const COMBO_VISIBLE_MIN = 2;
const RADAR_SIZE = 220;
const RADAR_POOL_SIZE = 80;
// Sensor Jam: noise dots on the radar, re-rolled every RADAR_NOISE_MS.
const RADAR_NOISE_DOTS = 28;
const RADAR_NOISE_MS = 90;
const BOSS_FALLBACK_COLOR = '#ff003c';
const BOSS_FALLBACK_DARK = '#880020';
const LAYER_BANNER_MS = 1200;
const CHAPTER_BANNER_MS = 3000;
const BOSS_INTRO_MS = 1500;
const BOSS_BAR_HOLD_MS = 1000;
const FADE_OUT_MS = 300;
const FEED_LIFE_MS = 1600;
const FEED_MAX_ROWS = 4;
const COMBO_POP_MS = 120;
const LOW_HULL_PERCENT = 30;
const CRITICAL_HULL_PERCENT = 15;
// One pip per lance shot before the Harmonic beam (the beam is the last shot).
const BEAM_PIPS = WEAPONS.harmonic.beam.every - 1;
// Asteroids have no enemy data entry; the Warden's feed name is the boss config's.
const ASTEROID_FEED_NAME = 'Fragment';
const COMBO_TIER_RANK = { text: 0, status: 1, xp: 2, boss: 3 };

/** Combo color tier: text < 1.3×, status 1.3–1.6×, xp 1.7–1.9×, boss at 2.0×. */
export function comboTier(multiplier) {
  const m = Number(multiplier) || 1;
  if (m >= 1.999) return 'boss';
  if (m > 1.601) return 'xp';
  if (m >= 1.299) return 'status';
  return 'text';
}

export class AAAHudLayout {
  constructor() {
    this._mounted = false;
    this._styleElement = null;
    this._root = null;
    this.els = null;
    this._lastBossHealthPercent = null;
    this._bossHitTimeout = null;
    this._bossCriticalTimeout = null;
    this._bossPhaseMarkers = [];
    this._lastBossPhaseMarkerCount = null;
    this._lastCombo = null;
    this._lastDashFraction = null;
    this._lastComboTier = 'text';
    this._blipPool = [];
    this._radarJammed = false;
    this._radarNoise = new RandomService('radar-jam');
    this._radarNoiseAt = -Infinity;
    this._timers = new Set();
    this._bannerTimer = null;
    this._bannerEndsAt = 0;
    this._bossIntroEndsAt = 0;
    this._transmissionHideTimer = null;
    this._onboardingHideTimer = null;
    this._bossBarHeldUntil = 0;
    this._feedRows = [];
    this._lastWeaponKey = null;
    this._evolutionChips = new Map();
    this._buffs = new Map();
  }

  mount(container) {
    if (this._mounted) {
      return;
    }

    if (!(container instanceof HTMLElement)) {
      throw new Error(
        '[AAAHudLayout] mount(container) requires an HTMLElement.'
      );
    }

    this._styleElement = document.createElement('style');
    this._styleElement.dataset.hudLayout = 'aaa_tactical';
    this._styleElement.textContent = this._getCSS();
    document.head.appendChild(this._styleElement);

    this._root = document.createElement('div');
    this._root.dataset.hudLayoutRoot = 'aaa_tactical';
    container.appendChild(this._root);

    const hudLayer = document.createElement('div');
    hudLayer.id = 'hud-layer';
    hudLayer.innerHTML = this._getHTML();
    const cockpitFrame = hudLayer.querySelector('.cockpit-frame');
    if (cockpitFrame) {
      cockpitFrame.remove();
    }

    this._root.appendChild(hudLayer);
    if (cockpitFrame) {
      this._root.appendChild(cockpitFrame);
    }

    this._cacheElements();
    this._initializeBars();
    this._createBlipPool();

    if (
      typeof globalThis !== 'undefined' &&
      globalThis.lucide &&
      typeof globalThis.lucide.createIcons === 'function'
    ) {
      globalThis.lucide.createIcons();
    }

    this._mounted = true;
  }

  unmount() {
    if (this._root && this._root.parentNode) {
      this._root.parentNode.removeChild(this._root);
    }

    if (this._styleElement && this._styleElement.parentNode) {
      this._styleElement.parentNode.removeChild(this._styleElement);
    }

    this._mounted = false;
    this._styleElement = null;
    this._root = null;
    this.els = null;
    if (this._bossHitTimeout) {
      window.clearTimeout(this._bossHitTimeout);
      this._bossHitTimeout = null;
    }
    if (this._bossCriticalTimeout) {
      window.clearTimeout(this._bossCriticalTimeout);
      this._bossCriticalTimeout = null;
    }
    this._lastBossHealthPercent = null;
    this._bossPhaseMarkers = [];
    this._lastBossPhaseMarkerCount = null;
    this._lastCombo = null;
    this._lastDashFraction = null;
    this._lastComboTier = 'text';
    this._blipPool = [];
    this._radarJammed = false;
    this._timers.forEach((id) => window.clearTimeout(id));
    this._timers.clear();
    this._bannerTimer = null;
    this._bannerEndsAt = 0;
    this._bossIntroEndsAt = 0;
    this._transmissionHideTimer = null;
    this._onboardingHideTimer = null;
    this._bossBarHeldUntil = 0;
    this._feedRows = [];
    this._lastWeaponKey = null;
    this._evolutionChips = new Map();
    this._buffs = new Map();
  }

  _later(fn, ms) {
    const id = window.setTimeout(() => {
      this._timers.delete(id);
      fn();
    }, ms);
    this._timers.add(id);
    return id;
  }

  _cancel(id) {
    window.clearTimeout(id);
    this._timers.delete(id);
  }

  /** Restarts a CSS animation class on an element. */
  _replay(el, className) {
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  /**
   * Centered "LAYER N" banner; boss layers read "LAYER N — WARDEN". A
   * `chapter` title (a biome's first layer) goes underneath and holds longer.
   */
  showLayerBanner(layer, { boss = false, delayMs = 0, chapter = '' } = {}) {
    this._showBanner(boss ? `LAYER ${layer} — WARDEN` : `LAYER ${layer}`, {
      tone: boss ? 'boss' : null,
      subtitle: chapter,
      delayMs,
      durationMs: chapter ? CHAPTER_BANNER_MS : LAYER_BANNER_MS,
    });
  }

  /** "SURGE" banner with the burst's label underneath. */
  showSurgeBanner(label) {
    this._showBanner('SURGE', { tone: 'surge', subtitle: label });
  }

  /** Amber "EVENT" banner with the field event's label underneath. */
  showFieldEventBanner(label) {
    this._showBanner('EVENT', { tone: 'event', subtitle: label });
  }

  /**
   * The centered banner, shown for `durationMs`, the last FADE_OUT_MS
   * fading. `tone` 'boss', 'surge' or 'event' recolours it.
   */
  _showBanner(
    title,
    {
      tone = null,
      subtitle = '',
      delayMs = 0,
      durationMs = LAYER_BANNER_MS,
    } = {}
  ) {
    const banner = this.els?.layerBanner;
    if (!banner) {
      return;
    }
    if (this._bannerTimer) {
      this._cancel(this._bannerTimer);
    }
    this._bannerEndsAt = performance.now() + delayMs + durationMs;
    this._bannerTimer = this._later(() => {
      this.els.layerBannerTitle.textContent = title;
      this.els.layerBannerSub.textContent = subtitle;
      banner.classList.toggle('is-boss', tone === 'boss');
      banner.classList.toggle('is-surge', tone === 'surge');
      banner.classList.toggle('is-event', tone === 'event');
      banner.classList.remove('is-leaving');
      this._replay(banner, 'is-showing');
      this._bannerTimer = this._later(() => {
        banner.classList.add('is-leaving');
        this._bannerTimer = this._later(() => {
          banner.classList.remove('is-showing', 'is-leaving');
          this._bannerTimer = null;
        }, FADE_OUT_MS);
      }, durationMs - FADE_OUT_MS);
    }, delayMs);
  }

  /** Drops the layer/surge banner, shown or pending (a cinematic owns it). */
  cancelBanner() {
    if (this._bannerTimer) {
      this._cancel(this._bannerTimer);
      this._bannerTimer = null;
    }
    this._bannerEndsAt = 0;
    this.els?.layerBanner?.classList.remove('is-showing', 'is-leaving');
  }

  /** The "press any key to skip" line under a cinematic. */
  showCinematicHint(show) {
    this.els?.cinematicHint?.classList.toggle('is-showing', Boolean(show));
  }

  /** Keeps the boss bar hidden for `ms` (the boss intro owns the moment). */
  holdBossBar(ms = BOSS_BAR_HOLD_MS) {
    this._bossBarHeldUntil = Math.max(
      this._bossBarHeldUntil,
      performance.now() + ms
    );
  }

  /**
   * Boss name card, queued after a layer banner still on screen; the boss bar
   * stays hidden until the card is gone.
   */
  showBossIntro(name, subtitle) {
    const card = this.els?.bossIntro;
    if (!card) {
      return;
    }
    const now = performance.now();
    const delayMs = Math.max(0, this._bannerEndsAt - FADE_OUT_MS - now);
    // The bar stays hidden until the card has faded out.
    this._bossBarHeldUntil = Infinity;
    this._bossIntroEndsAt = now + delayMs + BOSS_INTRO_MS;
    this._later(() => {
      this.els.bossIntroName.textContent = name || 'Warden Prime';
      this.els.bossIntroSub.textContent = subtitle || 'Guardian of the Ring';
      card.classList.remove('is-leaving');
      this._replay(card, 'is-showing');
      this._later(() => {
        card.classList.add('is-leaving');
        this._later(() => {
          card.classList.remove('is-showing', 'is-leaving');
          this._bossBarHeldUntil = 0;
        }, FADE_OUT_MS);
      }, BOSS_INTRO_MS - FADE_OUT_MS);
    }, delayMs);
  }

  /** True while the layer/surge banner or the boss intro owns the screen. */
  isBannerBusy() {
    const now = performance.now();
    return now < this._bannerEndsAt || now < this._bossIntroEndsAt;
  }

  /** Opens the transmission banner for `speaker` with an empty line. */
  showTransmission(speaker) {
    const panel = this.els?.transmission;
    if (!panel) {
      return;
    }
    if (this._transmissionHideTimer) {
      this._cancel(this._transmissionHideTimer);
      this._transmissionHideTimer = null;
    }
    this.els.transmissionSpeaker.textContent = `▌TRANSMISSION — ${speaker}`;
    this.els.transmissionLine.textContent = '';
    panel.classList.remove('is-leaving');
    panel.classList.add('is-typing');
    this._replay(panel, 'is-showing');
  }

  /** Shows the typed part of the line; `done` drops the typing caret. */
  typeTransmission(text, done) {
    const panel = this.els?.transmission;
    if (!panel) {
      return;
    }
    this.els.transmissionLine.textContent = text;
    panel.classList.toggle('is-typing', !done);
  }

  hideTransmission() {
    const panel = this.els?.transmission;
    if (!panel || !panel.classList.contains('is-showing')) {
      return;
    }
    panel.classList.add('is-leaving');
    this._transmissionHideTimer = this._later(() => {
      panel.classList.remove('is-showing', 'is-leaving', 'is-typing');
      this._transmissionHideTimer = null;
    }, FADE_OUT_MS);
  }

  /** First-run tip under the top HUD: key chips and one line. */
  showOnboardingTip(keys, text) {
    const tip = this.els?.onboardingTip;
    if (!tip) {
      return;
    }
    if (this._onboardingHideTimer) {
      this._cancel(this._onboardingHideTimer);
      this._onboardingHideTimer = null;
    }
    this.els.onboardingKeys.replaceChildren(
      ...keys.map((label) => {
        const chip = document.createElement('kbd');
        chip.className = 'onboarding-tip__key';
        chip.textContent = label;
        return chip;
      })
    );
    this.els.onboardingText.textContent = text;
    tip.classList.remove('is-leaving');
    this._replay(tip, 'is-showing');
  }

  hideOnboardingTip() {
    const tip = this.els?.onboardingTip;
    if (!tip || !tip.classList.contains('is-showing')) {
      return;
    }
    tip.classList.add('is-leaving');
    this._onboardingHideTimer = this._later(() => {
      tip.classList.remove('is-showing', 'is-leaving');
      this._onboardingHideTimer = null;
    }, FADE_OUT_MS);
  }

  /** Kill feed row for a destroyed enemy; repeated kills count up (×N). */
  addKillFeed(enemyType, elite = false) {
    const baseName =
      enemyType === 'asteroid'
        ? ASTEROID_FEED_NAME
        : enemyType === 'boss'
          ? BOSS_CONFIG.displayName
          : ENEMY_TYPES[enemyType]?.displayName;
    if (!baseName) {
      return;
    }
    const name = elite ? `Elite ${baseName}` : baseName;
    this._pushFeed(`kill:${name}`, 'kill', (row) => {
      row.count += 1;
      row.label.textContent = name;
      row.value.textContent = row.count > 1 ? `×${row.count}` : '';
    });
  }

  /** XP feed row; orbs collected while the row is up add into it. */
  addXpFeed(amount) {
    if (!(amount > 0)) {
      return;
    }
    this._pushFeed('xp', 'xp', (row) => {
      row.count += amount;
      row.label.textContent = `+${Math.round(row.count)} XP`;
    });
  }

  /** Feed row announcing a collected field pickup, in the pickup's color. */
  addPickupFeed(label, detail, color) {
    this._pushFeed(`pickup:${label}`, 'pickup', (row) => {
      row.el.style.color = color;
      row.el.style.borderRightColor = color;
      row.label.textContent = label;
      row.value.textContent = detail;
    });
  }

  /** Gold feed row announcing an achievement the moment it unlocks. */
  addAchievementFeed(title) {
    this._pushFeed(`achievement:${title}`, 'achievement', (row) => {
      row.label.textContent = `ACHIEVEMENT — ${title}`;
    });
  }

  _pushFeed(key, tone, render) {
    const container = this.els?.feed;
    if (!container) {
      return;
    }
    // A row still on screen keeps counting and moves back to the top.
    let row = this._feedRows.find((entry) => entry.key === key);
    if (row) {
      container.prepend(row.el);
      this._feedRows = [
        row,
        ...this._feedRows.filter((entry) => entry !== row),
      ];
    } else {
      const el = document.createElement('div');
      el.className = `feed-row feed-row--${tone}`;
      el.innerHTML =
        '<span class="feed-label"></span><span class="feed-value"></span>';
      row = {
        key,
        el,
        count: 0,
        label: el.firstChild,
        value: el.lastChild,
        timer: null,
      };
      container.prepend(el);
      this._feedRows.unshift(row);
      while (this._feedRows.length > FEED_MAX_ROWS) {
        this._removeFeedRow(this._feedRows[this._feedRows.length - 1]);
      }
    }
    render(row);
    row.el.classList.remove('is-leaving');
    if (row.timer) {
      this._cancel(row.timer);
    }
    row.timer = this._later(
      () => {
        row.el.classList.add('is-leaving');
        row.timer = this._later(
          () => this._removeFeedRow(row),
          FADE_OUT_MS + 100
        );
      },
      FEED_LIFE_MS - FADE_OUT_MS - 100
    );
    return row;
  }

  _removeFeedRow(row) {
    if (row.timer) {
      this._cancel(row.timer);
    }
    row.el.remove();
    this._feedRows = this._feedRows.filter((entry) => entry !== row);
  }

  _cacheElements() {
    const root = this._root;
    if (!root) {
      this.els = null;
      return;
    }

    const query = (selector) => root.querySelector(selector);

    this.els = {
      timer: query('#ui-timer'),
      kills: query('#ui-kills'),
      combo: query('#ui-combo'),
      comboBox: query('#ui-combo-box'),
      bossPanel: query('#ui-boss-panel'),
      bossName: query('#ui-boss-name'),
      bossFill: query('#ui-boss-fill'),
      bossMarkers: query('#ui-boss-markers'),
      radar: query('#ui-radar'),
      radarContainer: query('#ui-radar-blips'),
      shieldRow: query('#ui-shield-row'),
      shieldText: query('#ui-shield-text'),
      hullRow: query('#ui-hull-row'),
      hullText: query('#ui-hull-text'),
      wave: query('#ui-wave-num'),
      xpFill: query('#ui-xp-fill'),
      xpText: query('#ui-xp-text'),
      lvlText: query('#ui-lvl-text'),
      nextWaveBox: query('#el-wave-alert'),
      nextWaveTimer: query('#ui-next-wave-timer'),
      // Plan 01.07 Task 5/6 — combat mode indicators.
      spreadModeIndicator: query('#ui-spread-mode'),
      aimModeIndicator: query('#ui-aim-mode'),
      dashChip: query('#ui-dash-chip'),
      dashFill: query('#ui-dash-fill'),
      weaponChip: query('#ui-weapon-chip'),
      weaponName: query('#ui-weapon-name'),
      beamPips: query('#ui-beam-pips'),
      beamPipEls: [...root.querySelectorAll('.beam-pip')],
      evolutions: query('#ui-evolutions'),
      buffs: query('#ui-buffs'),
      layerBanner: query('#ui-layer-banner'),
      layerBannerTitle: query('#ui-layer-banner-title'),
      layerBannerSub: query('#ui-layer-banner-sub'),
      cinematicHint: query('#ui-cinematic-hint'),
      bossIntro: query('#ui-boss-intro'),
      bossIntroName: query('#ui-boss-intro-name'),
      bossIntroSub: query('#ui-boss-intro-sub'),
      transmission: query('#ui-transmission'),
      transmissionSpeaker: query('#ui-transmission-speaker'),
      transmissionLine: query('#ui-transmission-line'),
      feed: query('#ui-feed'),
      onboardingTip: query('#ui-onboarding-tip'),
      onboardingKeys: query('#ui-onboarding-keys'),
      onboardingText: query('#ui-onboarding-text'),
      lowHpVignette: query('#ui-lowhp-vignette'),
    };
  }

  /**
   * Plan 01.07 Task 5/6 — update spread + aim mode indicators.
   * @param {string} spreadMode - 'concentrated' or 'fan'.
   * @param {string} aimMode - 'auto' or 'manual'.
   */
  updateModeIndicators(spreadMode, aimMode) {
    if (!this.els) {
      return;
    }
    if (this.els.spreadModeIndicator) {
      const label = spreadMode === 'fan' ? 'FAN' : 'CONC';
      this.els.spreadModeIndicator.innerText = label;
    }
    if (this.els.aimModeIndicator) {
      const label = aimMode === 'manual' ? 'MANUAL' : 'AUTO';
      this.els.aimModeIndicator.innerText = label;
    }
  }

  /**
   * DASH chip: the bar empties as the dash recharges and the chip flashes
   * once when it is ready again.
   * @param {number} cooldownFraction - 1 right after a dash, 0 when ready.
   */
  updateDashCooldown(cooldownFraction) {
    if (!this.els?.dashFill) {
      return;
    }
    const fraction = Math.min(1, Math.max(0, cooldownFraction || 0));
    if (fraction === this._lastDashFraction) {
      return;
    }
    const wasCharging = this._lastDashFraction > 0;
    this._lastDashFraction = fraction;
    this.els.dashFill.style.transform = `scaleX(${fraction})`;
    this.els.dashChip.classList.toggle('is-charging', fraction > 0);
    if (wasCharging && fraction === 0) {
      this._replay(this.els.dashChip, 'is-ready');
    }
  }

  /**
   * WEAPON chip, beam pips and evolution chips from
   * CombatSystem.getWeaponState(); writes the DOM only when something changed.
   */
  updateWeapon(state) {
    if (!this.els?.weaponName || !state) {
      return;
    }
    const harmonic = state.weaponId === 'harmonic';
    const filled = harmonic ? BEAM_PIPS + 1 - state.shotsToBeam : 0;
    const key = `${state.weaponId}:${filled}:${state.evolutions.map((evolution) => evolution.id).join(',')}`;
    if (key === this._lastWeaponKey) {
      return;
    }
    this._lastWeaponKey = key;
    this.els.weaponName.textContent = harmonic ? 'HARMONIC' : 'LANCE';
    this.els.beamPips.classList.toggle('is-hidden', !harmonic);
    this.els.beamPipEls.forEach((pip, index) =>
      pip.classList.toggle('is-filled', index < filled)
    );

    const ids = new Set(state.evolutions.map((evolution) => evolution.id));
    for (const [id, chip] of this._evolutionChips) {
      if (!ids.has(id)) {
        chip.remove();
        this._evolutionChips.delete(id);
      }
    }
    for (const { id, family } of state.evolutions) {
      if (this._evolutionChips.has(id)) {
        continue;
      }
      const chip = document.createElement('span');
      chip.className = 'evo-chip';
      chip.textContent = id.toUpperCase();
      chip.style.setProperty('--family-color', UPGRADE_FAMILIES[family].color);
      this.els.evolutions.appendChild(chip);
      this._evolutionChips.set(id, chip);
    }
  }

  /** The Harmonic beam fired: the weapon chip and its pips flash once. */
  flashBeam() {
    if (this.els?.weaponChip) {
      this._replay(this.els.weaponChip, 'is-beam');
    }
  }

  /** Timed pickup chip ("OVERCHARGE 7.9s"); collecting it again restarts it. */
  startBuff(kind, label, duration, color) {
    const container = this.els?.buffs;
    if (!container) {
      return;
    }
    let buff = this._buffs.get(kind);
    if (!buff) {
      const el = document.createElement('div');
      el.className = 'mode-chip buff-chip';
      el.style.setProperty('--buff-color', color);
      const text = document.createElement('span');
      const meter = document.createElement('span');
      meter.className = 'buff-meter';
      const fill = document.createElement('span');
      fill.className = 'buff-meter__fill';
      meter.appendChild(fill);
      el.appendChild(text);
      el.appendChild(meter);
      container.appendChild(el);
      buff = { el, text, fill, label, duration, remaining: 0, shown: '' };
      this._buffs.set(kind, buff);
    }
    buff.duration = duration;
    buff.remaining = duration;
    this._renderBuff(buff);
  }

  /** Counts the buff chips down on the game's clock; a chip at 0 goes away. */
  tickBuffs(deltaTime) {
    for (const [kind, buff] of this._buffs) {
      buff.remaining -= deltaTime;
      if (buff.remaining <= 0) {
        buff.el.remove();
        this._buffs.delete(kind);
      } else {
        this._renderBuff(buff);
      }
    }
  }

  clearBuffs() {
    this._buffs.forEach((buff) => buff.el.remove());
    this._buffs.clear();
  }

  _renderBuff(buff) {
    const shown = `${buff.label} ${buff.remaining.toFixed(1)}s`;
    if (shown !== buff.shown) {
      buff.shown = shown;
      buff.text.textContent = shown;
    }
    buff.fill.style.transform = `scaleX(${buff.remaining / buff.duration})`;
  }

  _initializeBars() {
    if (!this.els) {
      return;
    }

    this.createSegments(this.els.shieldRow, 20);
    this.createSegments(this.els.hullRow, 20);
    this.updateVitals(100, 100, 100, 100);
  }

  /** Cria as divs de segmentos para as barras de vida/escudo */
  createSegments(container, count) {
    if (!container) {
      return;
    }

    container.innerHTML = '';
    for (let index = 0; index < count; index += 1) {
      const div = document.createElement('div');
      div.className = 'bar-segment filled';
      container.appendChild(div);
    }
  }

  /** Atualiza tempo, abates e combo */
  updateStats(timeStr, kills, combo, multiplier) {
    if (!this.els) {
      return;
    }

    if (timeStr) this.els.timer.innerText = timeStr;
    if (kills !== undefined) this.els.kills.innerText = kills;
    if (combo !== undefined && combo !== this._lastCombo) {
      const increased = combo > (this._lastCombo ?? 0);
      this._lastCombo = combo;
      const visible = combo >= COMBO_VISIBLE_MIN;
      this.els.comboBox.classList.toggle('is-hidden', !visible);
      const tier = comboTier(multiplier);
      this.els.comboBox.dataset.tier = tier;
      if (visible) {
        this.els.combo.innerText = 'x' + combo;
        if (increased) {
          this._replay(this.els.comboBox, 'pulse');
        }
      }
      if (COMBO_TIER_RANK[tier] > COMBO_TIER_RANK[this._lastComboTier]) {
        this._pushFeed('combo', 'combo', (row) => {
          row.el.dataset.tier = tier;
          row.label.textContent = `Combo x${combo}`;
          row.value.textContent = `${Number(multiplier).toFixed(1)}×`;
        });
      }
      this._lastComboTier = tier;
    }
  }

  /** Atualiza barras de vida e escudo */
  updateVitals(shield, maxShield, hull, maxHull) {
    if (!this.els) {
      return;
    }

    const safeMaxShield =
      Number.isFinite(maxShield) && maxShield > 0 ? maxShield : 1;
    const safeMaxHull = Number.isFinite(maxHull) && maxHull > 0 ? maxHull : 1;
    const safeShield = Number.isFinite(shield) ? Math.max(0, shield) : 0;
    const safeHull = Number.isFinite(hull) ? Math.max(0, hull) : 0;

    this._updateBar(this.els.shieldRow, safeShield, safeMaxShield);
    this._updateBar(this.els.hullRow, safeHull, safeMaxHull);

    const shieldPercent = Math.floor((safeShield / safeMaxShield) * 100);
    this.els.shieldText.innerText = shieldPercent + '%';

    const hpPercent = Math.floor((safeHull / safeMaxHull) * 100);
    this.els.hullText.innerText = hpPercent + '%';

    // Feedback visual de dano cr¡tico
    if (hpPercent < LOW_HULL_PERCENT) {
      this.els.hullText.classList.add('is-critical', 'glitch-text');
    } else {
      this.els.hullText.classList.remove('is-critical', 'glitch-text');
    }

    const vignette = this.els.lowHpVignette;
    const hullPercent = (safeHull / safeMaxHull) * 100;
    const alive = safeHull > 0;
    vignette.classList.toggle(
      'is-low',
      alive && hullPercent < LOW_HULL_PERCENT
    );
    vignette.classList.toggle(
      'is-critical',
      alive && hullPercent < CRITICAL_HULL_PERCENT
    );
  }

  /** Helper interno para preencher segmentos */
  _updateBar(container, value, max) {
    if (!container) {
      return;
    }

    const segments = container.children;
    const total = segments.length;
    if (!total) {
      return;
    }

    const safeMax = Number.isFinite(max) && max > 0 ? max : 1;
    const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;

    const filledCount = Math.ceil((safeValue / safeMax) * total);
    for (let index = 0; index < total; index += 1) {
      if (index < filledCount) segments[index].classList.add('filled');
      else segments[index].classList.remove('filled');
    }
  }

  /** Mostra/Esconde e atualiza Boss Bar */
  updateBoss(active, name, healthPercent, phaseInfo) {
    if (!this.els) {
      return;
    }

    if (!active) {
      this.els.bossPanel.classList.remove('active');
      this.els.bossPanel.classList.remove('is-hit', 'is-invulnerable');
      this.els.bossPanel.classList.remove('is-critical');
      if (this._bossHitTimeout) {
        window.clearTimeout(this._bossHitTimeout);
        this._bossHitTimeout = null;
      }
      if (this._bossCriticalTimeout) {
        window.clearTimeout(this._bossCriticalTimeout);
        this._bossCriticalTimeout = null;
      }
      this._lastBossHealthPercent = null;
      this._updateBossPhaseMarkers(0, 0);
      this._resetBossColors();
      return;
    }

    this.els.bossPanel.classList.toggle(
      'active',
      performance.now() >= this._bossBarHeldUntil
    );
    this.els.bossPanel.classList.toggle(
      'is-invulnerable',
      Boolean(phaseInfo?.invulnerable)
    );

    // Phase text: "BOSS NAME • PHASE 2/3"
    const phase = phaseInfo?.phase;
    const phaseCount = phaseInfo?.phaseCount;
    const hasPhases = typeof phase === 'number' && phaseCount > 1;
    const displayName = hasPhases
      ? `${name || 'BOSS'} • PHASE ${phase + 1}/${phaseCount}`
      : name || 'BOSS';
    this.els.bossName.innerText = displayName;

    // Phase color: change bar color based on current phase
    const phaseColors = phaseInfo?.phaseColors;
    if (
      Array.isArray(phaseColors) &&
      phaseColors.length > 0 &&
      typeof phase === 'number'
    ) {
      const color =
        phaseColors[Math.min(phase, phaseColors.length - 1)] ||
        BOSS_FALLBACK_COLOR;
      const darkColor = this._darkenColor(color, 0.4);
      this.els.bossFill.style.background = `repeating-linear-gradient(45deg, ${color}, ${color} 10px, ${darkColor} 10px, ${darkColor} 20px)`;
      this.els.bossFill.style.boxShadow = `0 0 20px ${color}`;
    }

    if (healthPercent !== undefined) {
      this.els.bossFill.style.width = healthPercent + '%';
    }

    if (Number.isFinite(healthPercent)) {
      const delta =
        this._lastBossHealthPercent !== null
          ? this._lastBossHealthPercent - healthPercent
          : 0;
      if (
        this._lastBossHealthPercent !== null &&
        healthPercent < this._lastBossHealthPercent
      ) {
        this._triggerBossHit();
        if (delta >= 8) {
          this._triggerBossCritical();
        }
      }
      this._lastBossHealthPercent = healthPercent;
    }

    this._updateBossPhaseMarkers(phaseCount, phase);
  }

  /** Reset boss bar colors to default */
  _resetBossColors() {
    if (!this.els?.bossFill) return;
    this.els.bossFill.style.background = '';
    this.els.bossFill.style.boxShadow = '';
  }

  _triggerBossHit() {
    if (!this.els?.bossPanel) {
      return;
    }
    this.els.bossPanel.classList.add('is-hit');
    if (this._bossHitTimeout) {
      window.clearTimeout(this._bossHitTimeout);
    }
    this._bossHitTimeout = window.setTimeout(() => {
      this.els?.bossPanel?.classList.remove('is-hit');
      this._bossHitTimeout = null;
    }, 180);
  }

  _triggerBossCritical() {
    if (!this.els?.bossPanel) {
      return;
    }
    this.els.bossPanel.classList.add('is-critical');
    if (this._bossCriticalTimeout) {
      window.clearTimeout(this._bossCriticalTimeout);
    }
    this._bossCriticalTimeout = window.setTimeout(() => {
      this.els?.bossPanel?.classList.remove('is-critical');
      this._bossCriticalTimeout = null;
    }, 280);
  }

  _updateBossPhaseMarkers(phaseCount, phaseIndex) {
    if (!this.els?.bossMarkers) {
      return;
    }

    const total = Number.isFinite(phaseCount) ? Math.floor(phaseCount) : 0;
    const markerCount = total > 1 ? total - 1 : 0;

    if (markerCount !== this._lastBossPhaseMarkerCount) {
      this.els.bossMarkers.innerHTML = '';
      this._bossPhaseMarkers = [];
      for (let i = 0; i < markerCount; i += 1) {
        const marker = document.createElement('div');
        marker.className = 'boss-phase-marker';
        marker.style.left = `${((i + 1) / total) * 100}%`;
        this.els.bossMarkers.appendChild(marker);
        this._bossPhaseMarkers.push(marker);
      }
      this._lastBossPhaseMarkerCount = markerCount;
    }

    if (!markerCount) {
      return;
    }

    const currentPhase = Number.isFinite(phaseIndex) ? phaseIndex : 0;
    this._bossPhaseMarkers.forEach((marker, index) => {
      marker.classList.toggle('passed', currentPhase > index);
      marker.classList.toggle(
        'next',
        currentPhase <= index && currentPhase === index
      );
    });
  }

  /** Darken a hex color by a factor (0-1) */
  _darkenColor(hex, factor) {
    if (!hex || typeof hex !== 'string') return BOSS_FALLBACK_DARK;
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return BOSS_FALLBACK_DARK;
    const num = parseInt(clean, 16);
    const r = Math.max(0, Math.floor(((num >> 16) & 0xff) * (1 - factor)));
    const g = Math.max(0, Math.floor(((num >> 8) & 0xff) * (1 - factor)));
    const b = Math.max(0, Math.floor((num & 0xff) * (1 - factor)));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  /** Atualiza XP, N¡vel e Onda */
  updateExperience(level, currentXP, requiredXP, waveNum) {
    if (!this.els) {
      return;
    }

    if (waveNum !== undefined) this.els.wave.innerText = waveNum;

    const safeRequired =
      Number.isFinite(requiredXP) && requiredXP > 0 ? requiredXP : 1;
    const safeCurrent = Number.isFinite(currentXP) ? Math.max(0, currentXP) : 0;

    const xpPercent = Math.min(
      100,
      Math.floor((safeCurrent / safeRequired) * 100)
    );
    this.els.xpFill.style.width = xpPercent + '%';

    this.els.xpText.innerText = `${Math.floor(safeCurrent)} / ${Math.floor(
      safeRequired
    )}`;
    this.els.lvlText.innerText = `Lvl ${level}`;
  }

  updateNextWaveTimer(seconds) {
    if (!this.els) {
      return;
    }

    const nextWaveBox = this.els.nextWaveBox;
    const nextWaveTimer = this.els.nextWaveTimer;
    if (!nextWaveBox || !nextWaveTimer) {
      return;
    }

    const safeSeconds = Number.isFinite(seconds) ? Math.ceil(seconds) : 0;
    if (safeSeconds <= 0) {
      nextWaveBox.classList.remove('visible');
      return;
    }

    nextWaveBox.classList.add('visible');
    nextWaveTimer.innerText = safeSeconds;
  }

  /**
   * Atualiza Radar
   * @param {Array} blips - [{x: -1..1, y: -1..1, type: 'enemy'|'ally'}]
   */
  updateRadar(blips) {
    if (!this.els) {
      return;
    }

    let list = Array.isArray(blips) ? blips : [];
    if (this._radarJammed) {
      const now = performance.now();
      if (now - this._radarNoiseAt < RADAR_NOISE_MS) {
        return;
      }
      this._radarNoiseAt = now;
      list = Array.from({ length: RADAR_NOISE_DOTS }, () => ({
        x: this._radarNoise.range(-0.85, 0.85),
        y: this._radarNoise.range(-0.85, 0.85),
        type: 'noise',
      }));
    }
    const count = Math.min(list.length, this._blipPool.length);
    for (let i = 0; i < this._blipPool.length; i += 1) {
      const el = this._blipPool[i];
      if (i >= count) {
        if (el.style.display !== 'none') el.style.display = 'none';
        continue;
      }
      const b = list[i];
      const type = b.type || 'enemy';
      if (el.dataset.type !== type) {
        el.dataset.type = type;
        el.className = 'blip ' + type;
      }
      el.style.display = '';
      const x = ((b.x + 1) / 2) * RADAR_SIZE;
      const y = ((b.y + 1) / 2) * RADAR_SIZE;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    }
  }

  /** Sensor Jam: noise instead of blips and a "NO SIGNAL" label while on. */
  setRadarJammed(jammed) {
    this._radarJammed = Boolean(jammed);
    this._radarNoiseAt = -Infinity;
    this.els?.radar?.classList.toggle('is-jammed', this._radarJammed);
  }

  _createBlipPool() {
    this._blipPool = [];
    for (let i = 0; i < RADAR_POOL_SIZE; i += 1) {
      const el = document.createElement('div');
      el.className = 'blip enemy';
      el.dataset.type = 'enemy';
      el.style.display = 'none';
      this.els.radarContainer.appendChild(el);
      this._blipPool.push(el);
    }
  }

  _getHTML() {
    return `
            <div class="lowhp-vignette" id="ui-lowhp-vignette"></div>

            <!-- STATS (Top Left) -->
            <div class="stats-area hud-panel">
                <div class="stats-grid">
                    <div class="stat-block">
                        <div class="stat-label"><i data-lucide="clock" size="14"></i> TIME</div>
                        <div class="stat-value" id="ui-timer">00:00</div>
                    </div>
                    <div class="stat-block">
                        <div class="stat-label"><i data-lucide="crosshair" size="14"></i> KILLS</div>
                        <div class="stat-value" id="ui-kills">0</div>
                    </div>
                </div>
                <div class="combo-box is-hidden" id="ui-combo-box">
                    <div class="combo-label">COMBO</div>
                    <div class="combo-val" id="ui-combo">x0</div>
                </div>
            </div>

            <!-- BOSS (Top Center) -->
            <div class="boss-area hud-panel" id="ui-boss-panel">
                <div class="boss-bar-container">
                    <div class="boss-name" id="ui-boss-name">BOSS</div>
                    <div class="boss-skull"><i data-lucide="skull" size="24"></i></div>
                    <div class="boss-fill" id="ui-boss-fill"></div>
                    <div class="boss-phase-markers" id="ui-boss-markers"></div>
                </div>
            </div>

            <!-- RADAR (Top Right - Decagon + Analog Ring) -->
            <div class="radar-area hud-panel">
                <div class="radar-structure" id="ui-radar">
                    <svg class="radar-svg-layer" viewBox="0 0 220 220">
                        <circle class="radar-ring" cx="110" cy="110" r="108" />
                        <circle class="radar-ring-dash" cx="110" cy="110" r="100" />
                        <polygon class="radar-outline" points="110,15 166,33 200,81 200,139 166,187 110,205 54,187 20,139 20,81 54,33" />
                        <line class="radar-axis" x1="110" y1="15" x2="110" y2="205" />
                        <line class="radar-axis" x1="20" y1="139" x2="200" y2="81" />
                        <line class="radar-axis" x1="20" y1="81" x2="200" y2="139" />
                        <line class="radar-axis" x1="166" y1="33" x2="54" y2="187" />
                        <line class="radar-axis" x1="54" y1="33" x2="166" y2="187" />
                        <polygon class="radar-inner" points="110,53 144,64 164,93 164,127 144,156 110,167 76,156 56,127 56,93 76,64" />
                    </svg>

                    <div class="radar-mask">
                        <div class="radar-sweep"></div>
                        <div class="blip-container" id="ui-radar-blips">
                            <div class="blip player"></div>
                        </div>
                    </div>
                    <div class="radar-jam-label">NO SIGNAL</div>
                </div>
            </div>

            <!-- NEXT WAVE (Center) -->
            <div class="next-wave-box" id="el-wave-alert">
                <div class="next-wave-label">INCOMING LAYER</div>
                <div class="next-wave-timer" id="ui-next-wave-timer">10</div>
            </div>

            <!-- LAYER BANNER + BOSS INTRO (Center, upper third) -->
            <div class="layer-banner" id="ui-layer-banner" aria-live="polite">
                <div class="layer-banner__title" id="ui-layer-banner-title">LAYER 1</div>
                <div class="layer-banner__line"></div>
                <div class="layer-banner__sub" id="ui-layer-banner-sub"></div>
            </div>
            <div class="cinematic-hint" id="ui-cinematic-hint">PRESS ANY KEY TO SKIP</div>
            <div class="boss-intro" id="ui-boss-intro" aria-live="polite">
                <div class="boss-intro__line"></div>
                <div class="boss-intro__name" id="ui-boss-intro-name">Warden Prime</div>
                <div class="boss-intro__sub" id="ui-boss-intro-sub">Guardian of the Ring</div>
                <div class="boss-intro__line"></div>
            </div>
            <div class="onboarding-tip" id="ui-onboarding-tip" role="status">
                <div class="onboarding-tip__keys" id="ui-onboarding-keys"></div>
                <div class="onboarding-tip__text" id="ui-onboarding-text"></div>
            </div>
            <div class="transmission" id="ui-transmission" aria-live="polite">
                <div class="transmission__speaker" id="ui-transmission-speaker"></div>
                <div class="transmission__rule"></div>
                <div class="transmission__line" id="ui-transmission-line"></div>
            </div>

            <!-- KILL FEED (Right, under the radar) -->
            <div class="hud-feed" id="ui-feed"></div>

            <!-- VITALS (Bottom Left) -->
            <div class="status-area hud-panel">
                <div class="bars-container">
                    <div class="system-label shield-label">❖ SHIELDS</div>
                    <div class="bar-wrapper">
                        <div class="health-bar-row shield" id="ui-shield-row"></div>
                        <div class="numeric-text shield-text" id="ui-shield-text">100%</div>
                    </div>
                    <div class="bar-wrapper">
                        <div class="health-bar-row" id="ui-hull-row"></div>
                        <div class="numeric-text hull-text" id="ui-hull-text">100%</div>
                    </div>
                    <div class="system-label hull-label">♥ HULL INTEGRITY</div>
                </div>
            </div>

            <!-- PROGRESS (Bottom Center) -->
            <div class="bottom-center hud-panel">
                <div class="wave-indicator">
                    <div class="wave-content">
                        <div class="wave-label">LAYER</div>
                        <div class="wave-num" id="ui-wave-num">1</div>
                    </div>
                </div>
                <div class="xp-bar-container">
                    <div class="xp-label"><i data-lucide="zap" size="12"></i> XP</div>
                    <div class="xp-fill" id="ui-xp-fill"></div>
                </div>
                <div class="xp-details">
                    <div class="xp-values" id="ui-xp-text">0 / 1000</div>
                    <div class="lvl-indicator" id="ui-lvl-text">Lvl 1</div>
                </div>
            </div>

            <!-- MODES (Bottom Right) -->
            <div class="systems-area hud-panel">
                <div class="buff-row" id="ui-buffs"></div>
                <div class="weapon-group">
                    <div class="mode-chip weapon-chip" id="ui-weapon-chip">WEAPON <span class="data-val" id="ui-weapon-name">LANCE</span><span class="beam-pips is-hidden" id="ui-beam-pips">${'<span class="beam-pip"></span>'.repeat(BEAM_PIPS)}</span></div>
                    <div class="evo-row" id="ui-evolutions"></div>
                </div>
                <div class="systems-row">
                    <div class="mode-chip">AIM <span class="data-val" id="ui-aim-mode">AUTO</span></div>
                    <div class="mode-chip">SPREAD <span class="data-val" id="ui-spread-mode">CONC</span></div>
                    <div class="mode-chip dash-chip" id="ui-dash-chip">DASH <span class="dash-meter"><span class="dash-meter__fill" id="ui-dash-fill"></span></span></div>
                </div>
            </div>

            <div class="cockpit-frame"></div>
        `;
  }
  _getCSS() {
    return `
            #hud-layer {
                position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 20;
                box-sizing: border-box;
                padding: var(--space-4, 16px);
                display: grid;
                grid-template-columns: 220px 1fr 220px;
                grid-template-rows: auto 1fr auto;
                pointer-events: none;
                font-family: var(--font-ui, 'Rajdhani', sans-serif);
                font-size: calc(1rem * var(--hud-scale-effective, 1));
                color: var(--text, #e8f4ff);
            }
            .hud-panel { pointer-events: auto; transition: opacity var(--motion-base, 0.3s); }

            .cockpit-frame {
                position: absolute; width: 100%; height: 100%; z-index: 11; pointer-events: none;
                background: linear-gradient(135deg, rgba(5,5,5,0.5) 2%, transparent 10%),
                            linear-gradient(-135deg, rgba(5,5,5,0.5) 2%, transparent 10%),
                            linear-gradient(45deg, rgba(5,5,5,0.5) 2%, transparent 10%),
                            linear-gradient(-45deg, rgba(5,5,5,0.5) 2%, transparent 10%);
            }

            /* STATS */
            .stats-area { display: flex; flex-direction: column; gap: var(--space-3, 12px); }
            .stats-grid { display: flex; flex-direction: column; gap: var(--space-3, 12px); }
            .stat-block { display: flex; flex-direction: column; background: linear-gradient(90deg, var(--surface, rgba(12, 20, 31, 0.65)) 0%, transparent 100%); padding: var(--space-1, 4px) var(--space-2, 8px) var(--space-1, 4px) var(--space-3, 12px); border-left: 3px solid var(--neutral, #00aaff); width: fit-content; min-width: 160px; }
            .stat-label { font-size: var(--text-xs, 12px); color: var(--neutral, #00aaff); letter-spacing: 1px; margin-bottom: 2px; display: flex; align-items: center; gap: 6px; font-weight: 700; }
            .stat-value { font-family: var(--font-display, 'Orbitron', sans-serif); font-size: var(--text-xl, 28px); color: var(--text, #fff); line-height: 1.1; }
            .combo-box { margin-top: var(--space-2, 8px); }
            .combo-box.is-hidden { visibility: hidden; }
            .combo-box { transform-origin: left center; }
            .combo-label { font-size: var(--text-sm, 14px); color: var(--accent, #00f2ff); letter-spacing: 2px; font-weight: 700; }
            .combo-val { font-size: var(--text-xl, 28px); line-height: 1; font-family: var(--font-display, 'Orbitron', sans-serif); color: var(--text); font-weight: 900; transition: color var(--motion-fast); }
            .combo-box[data-tier='status'] .combo-val { color: var(--status); }
            .combo-box[data-tier='xp'] .combo-val { color: var(--xp); }
            .combo-box[data-tier='boss'] .combo-val { color: var(--boss); text-shadow: 0 0 12px var(--boss); }

            /* BOSS */
            .boss-area { grid-column: 2; display: flex; flex-direction: column; align-items: center; padding-top: var(--space-4, 16px); opacity: 0; transition: opacity 0.5s; }
            .boss-area.active { opacity: 1; }
            .boss-bar-container { position: relative; width: 70%; height: 32px; background: var(--surface, rgba(20, 0, 0, 0.6)); border: 1px solid var(--boss, #ff003c); display: flex; align-items: center; margin-top: var(--space-4, 16px); }
            .boss-skull { width: 45px; height: 45px; background: var(--bg, #0a0a0f); border: 2px solid var(--boss, #ff003c); position: absolute; left: -22px; display: flex; justify-content: center; align-items: center; clip-path: polygon(25% 0%, 75% 0%, 100% 25%, 100% 75%, 75% 100%, 25% 100%, 0% 75%, 0% 25%); color: var(--boss, #ff003c); z-index: 5; }
            .boss-fill { height: 100%; width: 100%; background: var(--boss, #ff003c); box-shadow: 0 0 20px var(--boss, #ff003c); transition: width 0.3s ease-out; position: relative; }
            .boss-name { position: absolute; top: -24px; width: 100%; text-align: center; font-size: var(--text-md, 16px); letter-spacing: 4px; color: var(--text, #fff); font-weight: 700; }
            .boss-phase-markers { position: absolute; inset: 0; z-index: 6; pointer-events: none; }
            .boss-phase-marker { position: absolute; top: -2px; width: 2px; height: calc(100% + 4px); background: var(--line, rgba(255, 255, 255, 0.18)); transform: translateX(-50%); }
            .boss-phase-marker.passed { background: var(--boss, #ff003c); }
            .boss-phase-marker.next { background: var(--text, #fff); }
            .boss-area.is-hit .boss-fill { animation: boss-hit 0.25s ease-out; }
            .boss-area.is-critical .boss-fill { animation: boss-critical 0.3s ease-out; }
            .boss-area.is-invulnerable .boss-fill { filter: grayscale(0.35) brightness(0.75); opacity: 0.65; }
            .boss-area.is-invulnerable .boss-bar-container { border-color: var(--text-dim, rgba(255, 255, 255, 0.35)); }
            .boss-area.is-invulnerable .boss-skull { border-color: var(--text-dim, rgba(255, 255, 255, 0.7)); color: var(--text-dim, rgba(255, 255, 255, 0.9)); }

            /* RADAR - Decagon + Analog Ring */
            .radar-area { grid-column: 3; grid-row: 1; justify-self: end; align-self: start; }
            .radar-structure { width: 220px; height: 220px; position: relative; }
            .radar-svg-layer { position: absolute; inset: 0; z-index: 5; pointer-events: none; fill: none; }
            .radar-ring { stroke: var(--neutral, #00aaff); stroke-width: 2; stroke-opacity: 0.6; }
            .radar-ring-dash { stroke: var(--accent, #00f2ff); stroke-width: 1; stroke-dasharray: 4 6; opacity: 0.3; }
            .radar-outline { stroke: var(--accent, #00f2ff); stroke-width: 1.5; opacity: 0.8; }
            .radar-axis { stroke: var(--neutral, #00aaff); stroke-width: 1; opacity: 0.1; }
            .radar-inner { stroke: var(--neutral, #00aaff); stroke-width: 1; opacity: 0.2; }
            .radar-mask {
                position: absolute; inset: 0; z-index: 2; background: var(--surface, rgba(0, 10, 20, 0.5));
                clip-path: polygon(50% 7%, 75.5% 15%, 91% 37%, 91% 63%, 75.5% 85%, 50% 93%, 24.5% 85%, 9% 63%, 9% 37%, 24.5% 15%);
            }
            .radar-sweep { position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: conic-gradient(from 0deg, transparent 0%, transparent 60%, transparent 80%, var(--glow-accent, rgba(0, 242, 255, 0.35)) 100%); animation: radar-sweep-anim 4s linear infinite; border-radius: 50%; mix-blend-mode: screen; pointer-events: none; }
            .blip-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 10; }
            .blip { position: absolute; top: 0; left: 0; border-radius: 50%; box-shadow: 0 0 6px 1px currentColor; will-change: transform; }
            .blip.enemy { width: 6px; height: 6px; background: var(--danger, #ff003c); color: var(--danger, #ff003c); }
            .blip.boss { width: 10px; height: 10px; background: var(--boss, #ff003c); color: var(--boss, #ff003c); }
            .blip.ally { width: 6px; height: 6px; background: var(--status, #00ff66); color: var(--status, #00ff66); }
            .blip.noise { width: 3px; height: 3px; background: var(--text-dim); color: var(--text-dim); box-shadow: none; }
            .radar-jam-label { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); z-index: 20; display: none; text-align: center; font-family: var(--font-display); font-size: var(--text-sm); font-weight: 700; letter-spacing: 0.3em; margin-right: -0.3em; color: var(--xp); text-shadow: 0 0 8px var(--xp), 0 1px 0 rgba(0, 0, 0, 0.8); pointer-events: none; }
            .radar-structure.is-jammed .radar-jam-label { display: block; }
            .radar-structure.is-jammed .radar-sweep { opacity: 0.2; }
            .radar-structure.is-jammed .blip.player { display: none; }
            .blip.player { top: 50%; left: 50%; width: 8px; height: 8px; background: var(--text, #fff); border: 1px solid var(--accent, #00f2ff); color: var(--text, #fff); z-index: 15; transform: translate(-50%, -50%); }

            /* NEXT WAVE */
            .next-wave-box { position: absolute; top: 50%; left: 0; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; transform: translateY(-50%); font-family: var(--font-display, 'Orbitron', sans-serif); opacity: 0; transition: opacity var(--motion-base, 0.3s); pointer-events: none; z-index: 100; }
            .next-wave-box.visible { opacity: 1; }
            .next-wave-label { font-size: var(--text-lg, 20px); color: var(--danger, #ff003c); letter-spacing: 6px; font-weight: 900; margin: 0; text-transform: uppercase; text-shadow: 0 0 15px rgba(0, 0, 0, 0.9); line-height: 1.2; }
            .next-wave-timer { font-size: 4rem; line-height: 1; color: var(--text, #fff); font-weight: 900; text-shadow: 0 0 20px var(--danger, #ff003c), 2px 2px 0 #000; margin-top: var(--space-2, 8px); }
            .next-wave-box.visible .next-wave-timer { animation: alert-pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite; }

            /* VITALS */
            .status-area { grid-row: 3; display: flex; flex-direction: column; justify-content: flex-end; }
            .bars-container { transform: skewX(-15deg); }
            .bar-wrapper { display: flex; align-items: center; margin-bottom: 2px; }
            .health-bar-row { display: flex; height: 16px; gap: 3px; flex-grow: 1; min-width: 120px; }
            .health-bar-row.shield { height: 12px; opacity: 0.9; }
            .bar-segment { flex: 1; background: var(--surface, rgba(12, 20, 31, 0.65)); border: 1px solid var(--line, rgba(255, 255, 255, 0.2)); transition: background var(--motion-fast, 0.15s); }
            .bar-segment.filled { background: var(--hull, #00ff66); border-color: var(--text, #fff); }
            .shield .bar-segment.filled { background: var(--accent, #00f2ff); border-color: var(--text, #fff); }
            .system-label { font-size: var(--text-xs, 12px); font-weight: 700; letter-spacing: 1px; margin: 2px 0; }
            .shield-label, .shield-text { color: var(--accent, #00f2ff); }
            .hull-label, .hull-text { color: var(--status, #00ff66); }
            .hull-text.is-critical { color: var(--danger, #ff003c); }
            .numeric-text { font-family: var(--font-display, 'Orbitron', sans-serif); font-size: var(--text-md, 16px); font-weight: bold; transform: skewX(15deg); margin-left: var(--space-2, 8px); min-width: 48px; transition: color var(--motion-base, 0.3s); }

            /* PROGRESS */
            .bottom-center { grid-row: 3; grid-column: 2; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
            .wave-indicator { width: 70px; height: 70px; border-radius: 50%; border: 2px solid var(--line, rgba(255,255,255,0.1)); border-top: 2px solid var(--accent, #00f2ff); border-bottom: 2px solid var(--accent, #00f2ff); display: flex; flex-direction: column; justify-content: center; align-items: center; background: var(--surface-strong, rgba(0,0,0,0.8)); margin-bottom: var(--space-3, 12px); animation: rotate-border 4s infinite linear reverse; }
            .wave-content { animation: rotate-border 4s infinite linear; text-align: center; }
            .wave-num { font-size: var(--text-xl, 28px); color: var(--text, #fff); font-family: var(--font-display, 'Orbitron', sans-serif); line-height: 1; }
            .wave-label { font-size: var(--text-xs, 12px); color: var(--neutral, #00aaff); letter-spacing: 1px; }
            .xp-bar-container { width: 100%; max-width: 300px; height: 6px; background: var(--surface-strong, #0a0a0a); border: 1px solid var(--line, #333); border-radius: var(--radius-sm, 4px); position: relative; display: flex; align-items: center; margin-bottom: 2px; }
            .xp-fill { height: 100%; width: 0%; background: var(--xp, #aa00ff); border-radius: 2px; transition: width 0.5s var(--ease-out, ease-out); }
            .xp-label { position: absolute; left: 0; top: -20px; font-size: var(--text-xs, 12px); color: var(--xp, #aa00ff); font-weight: bold; z-index: 2; display: flex; align-items: center; gap: 5px; }
            .xp-details { display: flex; justify-content: space-between; width: 100%; max-width: 300px; margin-top: 2px; }
            .xp-values { font-family: var(--font-mono, 'Consolas', monospace); font-size: var(--text-xs, 12px); color: var(--text-dim, #ccc); letter-spacing: 1px; }
            .lvl-indicator { font-family: var(--font-display, 'Orbitron', sans-serif); font-size: var(--text-sm, 14px); font-weight: 700; color: var(--text, #fff); letter-spacing: 1px; }

            /* MODES */
            .systems-area { grid-row: 3; grid-column: 3; display: flex; flex-direction: column; justify-content: flex-end; align-items: flex-end; gap: var(--space-2, 8px); }
            .systems-row { display: flex; flex-direction: row; justify-content: flex-end; align-items: flex-end; gap: var(--space-2, 8px); }
            .mode-chip { font-family: var(--font-mono, 'Consolas', monospace); font-size: var(--text-xs, 12px); color: var(--text-dim, #ccc); background: var(--surface, rgba(12, 20, 31, 0.65)); border: 1px solid var(--line, rgba(255,255,255,0.2)); border-radius: var(--radius-sm, 4px); padding: var(--space-1, 4px) var(--space-2, 8px); letter-spacing: 1px; }
            .data-val { color: var(--accent, #00f2ff); font-weight: bold; }
            .dash-chip { display: flex; align-items: center; gap: var(--space-1, 4px); color: var(--accent); border-color: var(--accent-line); }
            .dash-chip.is-charging { color: var(--text-dim); border-color: var(--line); }
            .dash-meter { width: 28px; height: 4px; background: var(--accent); border-radius: var(--radius-sm); overflow: hidden; box-shadow: var(--glow-accent); }
            .dash-chip.is-charging .dash-meter { background: var(--surface-strong); box-shadow: none; }
            .dash-meter__fill { display: block; width: 100%; height: 100%; background: var(--accent-line); transform: scaleX(0); transform-origin: left; }
            .weapon-group { display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-1, 4px); }
            .weapon-chip { display: flex; align-items: center; gap: var(--space-1, 4px); }
            .beam-pips { display: flex; gap: 3px; margin-left: 2px; }
            .beam-pips.is-hidden { display: none; }
            .beam-pip { width: 5px; height: 5px; border: 1px solid var(--accent-line); border-radius: 1px; }
            .beam-pip.is-filled { background: var(--accent); box-shadow: var(--glow-accent); }
            .evo-row { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 3px; max-width: 220px; }
            .evo-chip { font-family: var(--font-mono); font-size: 9px; letter-spacing: 1px; padding: 1px var(--space-1, 4px); color: var(--family-color); background: var(--surface); border: 1px solid color-mix(in srgb, var(--family-color) 55%, transparent); border-radius: var(--radius-sm); }
            .buff-row { display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-1, 4px); }
            .buff-row:empty { display: none; }
            .evo-row:empty { display: none; }
            .buff-chip { display: flex; align-items: center; gap: var(--space-2, 8px); color: var(--buff-color); border-color: color-mix(in srgb, var(--buff-color) 55%, transparent); }
            .buff-meter { width: 36px; height: 4px; background: var(--surface-strong); border-radius: var(--radius-sm); overflow: hidden; }
            .buff-meter__fill { display: block; width: 100%; height: 100%; background: var(--buff-color); transform-origin: left; }

            /* ANIMATIONS */
            @keyframes rotate-border { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            @keyframes radar-sweep-anim { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            @keyframes alert-pulse { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }
            @keyframes boss-hit { 0% { filter: brightness(1.6); } 100% { filter: brightness(1); } }
            @keyframes boss-critical { 0% { filter: brightness(2); } 100% { filter: brightness(1); } }
            @keyframes glitch { 0%, 92%, 95%, 100% { transform: translate(0, 0); opacity: 1; } 93% { transform: translate(-2px, 2px); opacity: 0.8; } 94% { transform: translate(2px, -2px); opacity: 0.8; } 96% { transform: translate(1px, 2px); opacity: 0.9; } 97% { transform: translate(-1px, -1px); opacity: 0.9; } }
            .glitch-text { animation: glitch 3s infinite; }

            /* LOW HULL VIGNETTE */
            .lowhp-vignette { position: absolute; inset: 0; z-index: 0; pointer-events: none; opacity: 0; transition: opacity var(--motion-base); box-shadow: inset 0 0 120px 24px var(--danger-line); }
            .lowhp-vignette.is-low { opacity: 0.6; }
            .lowhp-vignette.is-critical { opacity: 0.9; box-shadow: inset 0 0 130px 36px var(--danger-line), inset 0 0 28px 3px var(--danger); }

            /* LAYER BANNER */
            .layer-banner { position: absolute; top: 28%; left: 0; width: 100%; display: flex; flex-direction: column; align-items: center; gap: var(--space-2); pointer-events: none; z-index: 90; opacity: 0; visibility: hidden; }
            .layer-banner.is-showing { opacity: 1; visibility: visible; }
            .layer-banner__title { font-family: var(--font-display); font-size: var(--text-2xl); font-weight: 700; letter-spacing: 0.5em; margin-right: -0.5em; color: var(--text); text-shadow: 0 0 18px var(--accent-line), 0 2px 0 rgba(0, 0, 0, 0.8); }
            .layer-banner__line { width: 420px; max-width: 70%; height: 1px; background: linear-gradient(90deg, transparent, var(--accent) 20%, var(--accent) 80%, transparent); box-shadow: var(--glow-accent); }
            .layer-banner.is-boss .layer-banner__title { color: var(--boss); text-shadow: 0 0 18px var(--boss), 0 2px 0 rgba(0, 0, 0, 0.8); }
            .layer-banner.is-boss .layer-banner__line { background: linear-gradient(90deg, transparent, var(--boss) 20%, var(--boss) 80%, transparent); box-shadow: 0 0 12px var(--boss); }
            .layer-banner__sub { font-family: var(--font-ui); font-size: var(--text-lg); font-weight: 600; letter-spacing: 0.4em; margin-right: -0.4em; text-transform: uppercase; color: var(--text-dim); text-shadow: 0 0 10px rgba(0, 0, 0, 0.9); }
            .layer-banner__sub:empty { display: none; }
            .layer-banner.is-surge .layer-banner__title { color: var(--danger); text-shadow: 0 0 18px var(--danger), 0 2px 0 rgba(0, 0, 0, 0.8); }
            .layer-banner.is-surge .layer-banner__line { background: linear-gradient(90deg, transparent, var(--danger) 20%, var(--danger) 80%, transparent); box-shadow: 0 0 12px var(--danger); }
            .layer-banner.is-surge .layer-banner__sub { color: var(--danger); }
            .layer-banner.is-event .layer-banner__title { color: var(--xp); text-shadow: 0 0 18px var(--xp), 0 2px 0 rgba(0, 0, 0, 0.8); }
            .layer-banner.is-event .layer-banner__line { background: linear-gradient(90deg, transparent, var(--xp) 20%, var(--xp) 80%, transparent); box-shadow: 0 0 12px var(--xp); }
            .layer-banner.is-event .layer-banner__sub { color: var(--xp); }

            /* BOSS INTRO */
            .boss-intro { position: absolute; top: 26%; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: var(--space-2); padding: var(--space-4) var(--space-6); background: radial-gradient(ellipse at center, color-mix(in srgb, var(--boss) 22%, transparent) 0%, transparent 70%); pointer-events: none; z-index: 95; opacity: 0; visibility: hidden; }
            .boss-intro.is-showing { opacity: 1; visibility: visible; }
            .layer-banner.is-leaving, .boss-intro.is-leaving { opacity: 0; }
            .boss-intro__name { font-family: var(--font-display); font-size: var(--text-hero); font-weight: 900; letter-spacing: 0.3em; margin-right: -0.3em; text-transform: uppercase; color: var(--text); text-shadow: 0 0 24px var(--boss), 0 0 4px var(--boss), 0 3px 0 rgba(0, 0, 0, 0.85); line-height: 1; white-space: nowrap; }
            .boss-intro__sub { font-family: var(--font-ui); font-size: var(--text-lg); font-weight: 600; letter-spacing: 0.4em; margin-right: -0.4em; text-transform: uppercase; color: var(--boss); text-shadow: 0 0 10px rgba(0, 0, 0, 0.9); }
            .boss-intro__line { width: 100%; height: 1px; background: linear-gradient(90deg, transparent, var(--boss) 25%, var(--boss) 75%, transparent); box-shadow: 0 0 10px var(--boss); }

            /* TRANSMISSION (Warden radio, bottom centre above the layer dial) */
            .transmission { position: absolute; bottom: 150px; left: 50%; transform: translateX(-50%); width: min(640px, 80%); display: flex; flex-direction: column; align-items: center; gap: var(--space-1); padding: var(--space-2) var(--space-4); background: radial-gradient(ellipse at center, color-mix(in srgb, var(--accent) 8%, transparent) 0%, transparent 70%); pointer-events: none; z-index: 85; opacity: 0; visibility: hidden; }
            .transmission.is-showing { opacity: 1; visibility: visible; }
            .transmission.is-leaving { opacity: 0; }
            .transmission__speaker { font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.25em; color: var(--accent); text-shadow: 0 0 8px var(--accent-line); }
            .transmission__rule { width: 100%; height: 1px; background: linear-gradient(90deg, transparent, var(--accent-line) 20%, var(--accent-line) 80%, transparent); }
            .transmission__line { min-height: 1.5em; font-family: var(--font-display); font-size: var(--text-md); letter-spacing: 0.06em; line-height: 1.5; text-align: center; color: var(--text); text-shadow: 0 0 10px rgba(0, 0, 0, 0.9), 0 0 6px var(--accent-line); }
            .transmission.is-typing .transmission__line::after { content: '▌'; margin-left: 2px; color: var(--accent); }

            /* ONBOARDING TIP (first run, top centre under the boss bar slot) */
            .onboarding-tip { position: absolute; top: 15%; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-4); background: var(--surface-strong); border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: var(--radius-md); pointer-events: none; z-index: 80; white-space: nowrap; opacity: 0; visibility: hidden; }
            .onboarding-tip.is-showing { opacity: 1; visibility: visible; }
            .onboarding-tip.is-leaving { opacity: 0; }
            .onboarding-tip__keys { display: flex; gap: var(--space-1); }
            .onboarding-tip__key { min-width: 1.9em; padding: 2px var(--space-2); font-family: var(--font-mono); font-size: var(--text-sm); font-weight: 700; letter-spacing: 1px; text-align: center; text-transform: uppercase; color: var(--accent); background: var(--surface); border: 1px solid var(--accent-line); border-bottom-width: 2px; border-radius: var(--radius-sm); }
            .onboarding-tip__text { font-family: var(--font-ui); font-size: var(--text-md); font-weight: 600; letter-spacing: 0.04em; color: var(--text); }

            /* KILL FEED */
            .hud-feed { position: absolute; top: calc(220px + var(--space-6)); right: var(--space-4); width: 200px; display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-1); pointer-events: none; z-index: 30; }
            .feed-row { display: flex; align-items: baseline; gap: var(--space-2); padding: 2px var(--space-2); background: linear-gradient(270deg, var(--surface) 0%, transparent 100%); border-right: 2px solid var(--neutral); font-family: var(--font-ui); font-size: var(--text-md); font-weight: 600; letter-spacing: 1px; color: var(--text); white-space: nowrap; }
            .feed-row.is-leaving { opacity: 0; }
            .feed-value { font-family: var(--font-display); font-size: var(--text-sm); color: var(--text-dim); }
            .feed-row--xp { border-right-color: var(--xp); color: var(--xp); }
            .feed-row--combo { border-right-color: var(--status); color: var(--status); }
            .feed-row--combo[data-tier='xp'] { border-right-color: var(--xp); color: var(--xp); }
            .feed-row--combo[data-tier='boss'] { border-right-color: var(--boss); color: var(--boss); }
            .feed-row--combo .feed-value { color: inherit; }
            .feed-row--achievement { border-right-color: var(--xp); color: var(--xp); background: linear-gradient(270deg, color-mix(in srgb, var(--xp) 22%, var(--surface)) 0%, transparent 100%); text-shadow: 0 0 8px color-mix(in srgb, var(--xp) 60%, transparent); }

            @media (prefers-reduced-motion: no-preference) {
                .combo-box.pulse { animation: combo-pop ${COMBO_POP_MS}ms var(--ease-out) 1; }
                .dash-chip.is-ready { animation: dash-ready var(--motion-base) var(--ease-out) 1; }
                .weapon-chip.is-beam { animation: dash-ready var(--motion-base) var(--ease-out) 1; }
                .weapon-chip.is-beam .beam-pip { animation: beam-pip-flash var(--motion-base) var(--ease-out) 1; }
                .evo-chip, .buff-chip { animation: feed-in var(--motion-base) var(--ease-out); }
                .lowhp-vignette.is-low { animation: lowhp-pulse 0.83s ease-in-out infinite alternate; }
                .lowhp-vignette.is-critical { animation-name: lowhp-pulse-critical; }
                .layer-banner.is-showing .layer-banner__title { animation: banner-title-in 420ms var(--ease-out); }
                .layer-banner.is-showing .layer-banner__line { animation: banner-line-draw 600ms var(--ease-out) 120ms both; }
                .layer-banner.is-leaving, .boss-intro.is-leaving { transition: opacity ${FADE_OUT_MS}ms ease-in; }
                .boss-intro.is-showing { animation: boss-intro-in 360ms var(--ease-out); }
                .boss-intro.is-showing .boss-intro__line { animation: banner-line-draw 600ms var(--ease-out) 150ms both; }
                .transmission.is-showing { animation: transmission-flicker 2.4s steps(1, end) infinite; }
                .transmission.is-leaving { animation: none; transition: opacity ${FADE_OUT_MS}ms ease-in; }
                .onboarding-tip.is-showing { animation: onboarding-tip-in var(--motion-base) var(--ease-out); }
                .onboarding-tip.is-leaving { animation: none; transition: opacity ${FADE_OUT_MS}ms ease-in; }
                .boss-area { transform: translateY(-24px); transition: opacity 0.5s var(--ease-out), transform 0.5s var(--ease-out); }
                .boss-area.active { transform: translateY(0); }
                .feed-row { animation: feed-in var(--motion-base) var(--ease-out); transition: opacity ${FADE_OUT_MS}ms ease-in, transform ${FADE_OUT_MS}ms ease-in; }
                .feed-row.is-leaving { transform: translateX(8px); }
            }
            @keyframes combo-pop { 0% { transform: scale(1); } 50% { transform: scale(1.18); } 100% { transform: scale(1); } }
            @keyframes dash-ready { 0% { box-shadow: var(--glow-accent); background: var(--accent-soft); } 100% { box-shadow: none; } }
            @keyframes beam-pip-flash { 0% { background: var(--accent); box-shadow: var(--glow-accent); } 100% { background: transparent; box-shadow: none; } }
            @keyframes lowhp-pulse { from { opacity: 0.25; } to { opacity: 0.75; } }
            @keyframes lowhp-pulse-critical { from { opacity: 0.55; } to { opacity: 1; } }
            @keyframes banner-title-in { from { opacity: 0; letter-spacing: 0.2em; margin-right: -0.2em; } to { opacity: 1; letter-spacing: 0.5em; margin-right: -0.5em; } }
            @keyframes banner-line-draw { from { transform: scaleX(0); } to { transform: scaleX(1); } }
            @keyframes boss-intro-in { from { opacity: 0; transform: translateX(-50%) scale(0.9); } to { opacity: 1; transform: translateX(-50%) scale(1); } }
            @keyframes transmission-flicker { 0%, 100% { opacity: 1; } 3% { opacity: 0.55; } 5% { opacity: 0.9; } 7% { opacity: 0.7; } 9% { opacity: 1; } 61% { opacity: 0.82; } 62% { opacity: 1; } }
            @keyframes onboarding-tip-in { from { opacity: 0; transform: translate(-50%, -8px); } to { opacity: 1; transform: translate(-50%, 0); } }
            @keyframes feed-in { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }

            @media (max-width: 900px) { #hud-layer { grid-template-columns: 1fr; grid-template-rows: auto 1fr auto; } .stats-area { position: absolute; top: 10px; left: 10px; } .radar-area { position: absolute; top: 10px; right: 10px; } .boss-area { margin-top: 60px; transform: scale(0.8); } .status-area { position: absolute; bottom: 20px; left: 10px; transform: scale(0.9); transform-origin: bottom left; } .systems-area { position: absolute; bottom: 20px; right: 10px; } .bottom-center { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); width: 300px; } }
        `;
  }
}
