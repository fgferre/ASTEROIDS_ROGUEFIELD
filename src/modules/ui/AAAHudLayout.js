// src/modules/ui/AAAHudLayout.js

import { ENEMY_TYPES, BOSS_CONFIG } from '../../data/constants/visual.js';
import { DEFAULT_HUD_PRESET, getHudPreset } from '../../data/ui/hudPresets.js';
import {
  createDirectionPools,
  edgeMarker,
  measurePanelCorners,
  placeEdgeArrows,
  showDamageArc,
} from './hud/direction.js';
import { FADE_OUT_MS, comboTier, replay } from './hud/hudCommon.js';
import { getHudHtml } from './hud/hudMarkup.js';
import { getHudCss } from './hud/hudStyles.js';
import { mountInstruments } from './hud/instruments/registry.js';

// The pure helpers live with their panels; tests and TacticalHud read them here.
export {
  damageArcAngle,
  edgeArrow,
  spreadEdgeArrows,
} from './hud/direction.js';
export { bossSegments, comboTier } from './hud/hudCommon.js';

const LAYER_BANNER_MS = 1200;
const CHAPTER_BANNER_MS = 3000;
const BOSS_INTRO_MS = 1500;
const BOSS_BAR_HOLD_MS = 1000;
// Asteroids have no enemy data entry; the Warden's feed name is the boss config's.
const ASTEROID_FEED_NAME = 'Fragment';
const COMBO_TIER_RANK = { text: 0, status: 1, xp: 2, boss: 3 };

// A max of 0 (no shield yet) reads as an empty bar, not a division by zero.
const safeMax = (max) => (Number.isFinite(max) && max > 0 ? max : 1);
const safeValue = (value) => (Number.isFinite(value) ? Math.max(0, value) : 0);

export class AAAHudLayout {
  // `items`: the preset's instruments (data/ui/hudPresets.js), mounted with it.
  constructor({ items = getHudPreset(DEFAULT_HUD_PRESET).items } = {}) {
    this._items = items;
    this._instruments = new Map();
    this._mounted = false;
    this._styleElement = null;
    this._root = null;
    this._layer = null;
    this.els = null;
    this._lastCombo = null;
    this._lastComboTier = 'text';
    this._aimStick = false;
    this._buffs = [];
    this._beams = 0;
    this._wardenMarker = null;
    this._arcPool = [];
    this._arrowPool = [];
    this._panelCorners = null;
    this.radarJammed = false;
    this.radarRangeFactor = 1;
    this._timers = new Set();
    this._bannerTimer = null;
    this._modifierBannerTimer = null;
    this._bannerEndsAt = 0;
    this._bossIntroEndsAt = 0;
    this._transmissionHideTimer = null;
    this._onboardingHideTimer = null;
    this._bossBarHeldUntil = 0;
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
    hudLayer.innerHTML = getHudHtml();
    const cockpitFrame = hudLayer.querySelector('.cockpit-frame');
    if (cockpitFrame) {
      cockpitFrame.remove();
    }

    this._root.appendChild(hudLayer);
    if (cockpitFrame) {
      this._root.appendChild(cockpitFrame);
    }
    this._layer = hudLayer;

    this._cacheElements();
    this._createDirectionPools();
    this._mountInstruments();
    this._mounted = true;
  }

  /** Swaps the instruments for another preset's items (the HUD stays up). */
  setItems(items) {
    this._items = items;
    if (!this._mounted) {
      return;
    }
    this._destroyInstruments();
    this._mountInstruments();
    this.invalidatePanelCorners();
  }

  _mountInstruments() {
    this._instruments = mountInstruments(
      this._layer,
      this._items,
      this.els.direction
    );
    if (
      typeof globalThis !== 'undefined' &&
      globalThis.lucide &&
      typeof globalThis.lucide.createIcons === 'function'
    ) {
      globalThis.lucide.createIcons();
    }
  }

  _destroyInstruments() {
    this._instruments.forEach((instrument) => instrument.destroy());
    this._instruments = new Map();
  }

  unmount() {
    this._destroyInstruments();
    if (this._root && this._root.parentNode) {
      this._root.parentNode.removeChild(this._root);
    }

    if (this._styleElement && this._styleElement.parentNode) {
      this._styleElement.parentNode.removeChild(this._styleElement);
    }

    this._mounted = false;
    this._styleElement = null;
    this._root = null;
    this._layer = null;
    this.els = null;
    this._lastCombo = null;
    this._lastComboTier = 'text';
    this._aimStick = false;
    this._buffs = [];
    this._beams = 0;
    this._wardenMarker = null;
    this._arcPool = [];
    this._arrowPool = [];
    this._panelCorners = null;
    this.radarJammed = false;
    this.radarRangeFactor = 1;
    this._timers.forEach((id) => window.clearTimeout(id));
    this._timers.clear();
    this._bannerTimer = null;
    this._modifierBannerTimer = null;
    this._bannerEndsAt = 0;
    this._bossIntroEndsAt = 0;
    this._transmissionHideTimer = null;
    this._onboardingHideTimer = null;
    this._bossBarHeldUntil = 0;
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

  /**
   * Centered "LAYER N" banner; boss layers read "LAYER N — WARDEN", Boss
   * Rush ones "BOSS RUSH". A `chapter` title (a biome's first layer, the
   * Boss Rush stage) goes underneath and holds longer.
   */
  showLayerBanner(
    layer,
    { boss = false, bossRush = false, delayMs = 0, chapter = '' } = {}
  ) {
    let title = boss ? `LAYER ${layer} — WARDEN` : `LAYER ${layer}`;
    if (bossRush) title = 'BOSS RUSH';
    this._showBanner(title, {
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
   * "MODIFIER" banner (indigo --modifier frame) with the layer modifier's
   * label underneath in its `color`; it waits for the banner on screen (the
   * LAYER one) to end.
   */
  showModifierBanner(label, color) {
    const delayMs = Math.max(0, this._bannerEndsAt - performance.now());
    this._modifierBannerTimer = this._later(() => {
      this._modifierBannerTimer = null;
      this.els?.layerBanner?.style.setProperty('--modifier-color', color);
      this._showBanner('MODIFIER', { tone: 'modifier', subtitle: label });
    }, delayMs);
  }

  /** Amber "CHEST" banner with what it grants underneath. */
  showChestBanner(subtitle) {
    this._showBanner('CHEST', { tone: 'event', subtitle });
  }

  /** Violet "HERALD OF …" banner with the Herald's line underneath. */
  showHeraldBanner(name, subtitle) {
    this._showBanner(String(name).toUpperCase(), {
      tone: 'herald',
      subtitle,
    });
  }

  /**
   * The centered banner, shown for `durationMs`, the last FADE_OUT_MS
   * fading. `tone` 'boss', 'surge', 'event', 'herald' or 'modifier'
   * recolours it.
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
      banner.classList.toggle('is-herald', tone === 'herald');
      banner.classList.toggle('is-modifier', tone === 'modifier');
      banner.classList.remove('is-leaving');
      replay(banner, 'is-showing');
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
    if (this._modifierBannerTimer) {
      this._cancel(this._modifierBannerTimer);
      this._modifierBannerTimer = null;
    }
    this._bannerEndsAt = 0;
    this.els?.layerBanner?.classList.remove('is-showing', 'is-leaving');
  }

  /** The "press any key to skip" line under a cinematic. */
  showCinematicHint(show) {
    this.els?.cinematicHint?.classList.toggle('is-showing', Boolean(show));
  }

  /** The letterbox bars of the Warden's arrival, sliding in or out. */
  showLetterbox(show) {
    this.els?.letterbox?.classList.toggle('is-showing', Boolean(show));
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
      replay(card, 'is-showing');
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
    replay(panel, 'is-showing');
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
    replay(tip, 'is-showing');
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
  addKillFeed(enemyType, elite = false, displayName = null) {
    const baseName =
      enemyType === 'asteroid'
        ? ASTEROID_FEED_NAME
        : enemyType === 'boss'
          ? displayName ?? BOSS_CONFIG.displayName
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

  // The feed slot's model keeps the rows (instruments/registry.js, feed).
  _pushFeed(key, tone, render) {
    this._instruments.get('feed')?.push(key, tone, render);
  }

  _cacheElements() {
    const root = this._root;
    if (!root) {
      this.els = null;
      return;
    }

    const query = (selector) => root.querySelector(selector);

    this.els = {
      nextWaveBox: query('#el-wave-alert'),
      nextWaveTimer: query('#ui-next-wave-timer'),
      layerBanner: query('#ui-layer-banner'),
      layerBannerTitle: query('#ui-layer-banner-title'),
      layerBannerSub: query('#ui-layer-banner-sub'),
      cinematicHint: query('#ui-cinematic-hint'),
      letterbox: query('#ui-letterbox'),
      bossIntro: query('#ui-boss-intro'),
      bossIntroName: query('#ui-boss-intro-name'),
      bossIntroSub: query('#ui-boss-intro-sub'),
      transmission: query('#ui-transmission'),
      transmissionSpeaker: query('#ui-transmission-speaker'),
      transmissionLine: query('#ui-transmission-line'),
      onboardingTip: query('#ui-onboarding-tip'),
      onboardingKeys: query('#ui-onboarding-keys'),
      onboardingText: query('#ui-onboarding-text'),
      direction: query('#ui-direction'),
    };
  }

  /**
   * The ship's state this frame, for the vitals, the hull ring and the
   * recharges: shield and hull with their maxima, `ship` its screen point
   * (or null), `dash` the dash cooldown left (1 right after a dash, 0
   * ready); the shield's `shieldMode` ('locked' | 'ready' | 'active' |
   * 'cooldown'), `shieldSeconds` and `shieldCooldown` (fraction) of its
   * cooldown left, `shieldKey` the bound key while it is ready.
   */
  updateShip({
    shield,
    maxShield,
    hull,
    maxHull,
    ship,
    dash,
    shieldMode,
    shieldSeconds,
    shieldCooldown,
    shieldKey,
  }) {
    const now = performance.now();
    const vitals = {
      shield: safeValue(shield),
      maxShield: safeMax(maxShield),
      hull: safeValue(hull),
      maxHull: safeMax(maxHull),
    };
    this._instruments.get('vitals')?.update({
      ...vitals,
      now,
      shieldMode,
      shieldSeconds,
      shieldCooldown,
      shieldKey,
    });
    this._instruments.get('hull-ring')?.update({ ...vitals, now, ship });
    this._instruments
      .get('recharges')
      ?.update({ now, ship, dash, shield: shieldCooldown });
  }

  /**
   * The run's numbers: `clock` 'HH:MM:SS' and `seconds` elapsed, the layer,
   * kills, the combo and its multiplier. A combo reaching a hotter tier gets
   * a feed row.
   */
  updateStats({ clock, seconds, layer, kills, combo, multiplier }) {
    this._instruments.get('run-info')?.update({
      now: performance.now(),
      clock,
      seconds,
      layer,
      kills,
      combo,
      multiplier,
    });
    if (combo === this._lastCombo) {
      return;
    }
    this._lastCombo = combo;
    const tier = comboTier(multiplier);
    if (COMBO_TIER_RANK[tier] > COMBO_TIER_RANK[this._lastComboTier]) {
      this._pushFeed('combo', 'combo', (row) => {
        row.el.dataset.tier = tier;
        row.label.textContent = `Combo x${combo}`;
        row.value.textContent = `${Number(multiplier).toFixed(1)}×`;
      });
    }
    this._lastComboTier = tier;
  }

  /**
   * The weapon and the build: CombatSystem.getWeaponState(), the family
   * card counts, the fire modes and the dash cooldown; the timed pickups
   * and the beam count ride along.
   */
  updateBuild({ weapon, families, spreadMode, aimMode, dash }) {
    this._instruments.get('build')?.update({
      now: performance.now(),
      weapon,
      families,
      spreadMode,
      aimMode: this._aimStick ? 'manual' : aimMode,
      dash,
      buffs: this._buffs,
      beams: this._beams,
    });
  }

  /** The right stick aims by hand while held: the aim reads MANUAL. */
  setAimStick(active) {
    this._aimStick = Boolean(active);
  }

  /** A beam fired: the weapon flashes once. */
  flashBeam() {
    this._beams += 1;
  }

  /** Timed pickup ("OVERCHARGE 7.9s"); collecting it again restarts it. */
  startBuff(kind, label, duration, color) {
    const buff = this._buffs.find((entry) => entry.kind === kind);
    if (buff) {
      buff.duration = duration;
      buff.remaining = duration;
      return;
    }
    this._buffs.push({ kind, label, color, duration, remaining: duration });
  }

  /** Counts the timed pickups down on the game's clock; at 0 one goes. */
  tickBuffs(deltaTime) {
    this._buffs.forEach((buff) => {
      buff.remaining -= deltaTime;
    });
    this._buffs = this._buffs.filter((buff) => buff.remaining > 0);
  }

  clearBuffs() {
    this._buffs = [];
  }

  /**
   * The boss bar: a Warden's (or a Herald's) name, health in % and phase
   * info ({ phase, phaseCount, phaseColors, invulnerable, herald }); hidden
   * while the boss intro holds it. A living Warden dims the corners.
   */
  updateBoss(active, name, healthPercent, phaseInfo = {}) {
    const herald = Boolean(phaseInfo.herald);
    const warden = Boolean(active) && !herald;
    if (
      this._layer &&
      this._layer.dataset.hudMode !== (warden ? 'warden' : 'calm')
    ) {
      this._layer.dataset.hudMode = warden ? 'warden' : 'calm';
    }
    const now = performance.now();
    this._instruments.get('warden')?.update({
      now,
      active: Boolean(active),
      shown: now >= this._bossBarHeldUntil,
      name,
      percent: Number.isFinite(healthPercent) ? healthPercent : 100,
      phase: Math.max(0, Math.floor(phaseInfo.phase ?? 0)),
      phaseCount: Math.max(1, Math.floor(phaseInfo.phaseCount ?? 1)),
      phaseColors: phaseInfo.phaseColors || [],
      invulnerable: Boolean(phaseInfo.invulnerable),
      herald,
      marker: this._wardenMarker,
    });
  }

  /** XP toward the next level, the level and the layer. */
  updateExperience({ level, current, required, layer }) {
    this._instruments.get('xp')?.update({ level, current, required, layer });
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
   * The radar slot's model draws this frame's radar state (its shape is
   * documented in hud/instruments/registry.js).
   */
  updateRadar(state) {
    this._instruments.get('radar')?.update(state);
  }

  /** Field units the radar reaches: its model's range, after Dense Fog. */
  get radarRange() {
    return (this._instruments.get('radar')?.range ?? 0) * this.radarRangeFactor;
  }

  /** Dense Fog: the radar reaches `factor` of its usual range (1 = normal). */
  setRadarRange(factor) {
    this.radarRangeFactor = factor;
  }

  /** Sensor Jam: noise instead of contacts and a "NO SIGNAL" label while on. */
  setRadarJammed(jammed) {
    this.radarJammed = Boolean(jammed);
  }

  _createDirectionPools() {
    const { arcPool, arrowPool } = createDirectionPools(this.els.direction);
    this._arcPool = arcPool;
    this._arrowPool = arrowPool;
  }

  /**
   * Red arc on the screen edge toward a hit's source (screen points of the
   * ship and the source), DAMAGE_ARC_MS long; up to DAMAGE_ARC_MAX at once.
   * Reduced motion: shown without the fade (CSS).
   */
  showDamageFrom(ship, source) {
    showDamageArc(
      this._arcPool,
      ship,
      source,
      {
        later: (fn, ms) => this._later(fn, ms),
        cancel: (id) => this._cancel(id),
      },
      this._measuredCorners()?.width
    );
  }

  /**
   * Edge arrows for targets off the screen: [{ kind: 'warden' | 'herald' |
   * 'pickup', x, y (800×600 screen point), color?, distance? }], in priority
   * order; the first EDGE_ARROW_MAX off-screen ones get an arrow. A Warden
   * model with its own edge marker gets the first Warden instead.
   */
  updateEdgeArrows(targets) {
    const corners = this._measuredCorners();
    this._wardenMarker = null;
    let arrows = targets;
    if (this._instruments.get('warden')?.edgeMarker) {
      const warden = targets.find((target) => target.kind === 'warden');
      if (warden) this._wardenMarker = edgeMarker(warden, corners);
      arrows = targets.filter((target) => target.kind !== 'warden');
    }
    placeEdgeArrows(this._arrowPool, arrows, corners);
  }

  // The screen and its corner panels (measurePanelCorners), kept until the
  // layout changes.
  _measuredCorners() {
    if (!this._panelCorners) {
      this._panelCorners = measurePanelCorners(this._root, this.els?.direction);
    }
    return this._panelCorners;
  }

  /** The panel layout changed (resize, HUD scale): measure it again. */
  invalidatePanelCorners() {
    this._panelCorners = null;
  }

  _getCSS() {
    return getHudCss();
  }
}
