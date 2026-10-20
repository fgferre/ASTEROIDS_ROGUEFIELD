// src/modules/ui/AAAHudLayout.js

import { ENEMY_TYPES, BOSS_CONFIG } from '../../data/constants/visual.js';
import RandomService from '../../core/RandomService.js';
import { BossBar } from './hud/bossBar.js';
import {
  createDirectionPools,
  measurePanelCorners,
  placeEdgeArrows,
  showDamageArc,
} from './hud/direction.js';
import { FADE_OUT_MS, FEED_MAX_ROWS, replay } from './hud/hudCommon.js';
import { getHudHtml } from './hud/hudMarkup.js';
import { getHudCss } from './hud/hudStyles.js';
import {
  RADAR_NOISE_DOTS,
  RADAR_NOISE_MS,
  createBlipPool,
  drawBlips,
} from './hud/radar.js';
import { SystemsPanel } from './hud/systemsPanel.js';

// The pure helpers live with their panels; tests and TacticalHud read them here.
export {
  damageArcAngle,
  edgeArrow,
  spreadEdgeArrows,
} from './hud/direction.js';
export { radarGlyph } from './hud/radar.js';
export { bossSegments } from './hud/bossBar.js';

const COMBO_VISIBLE_MIN = 2;
const LAYER_BANNER_MS = 1200;
const CHAPTER_BANNER_MS = 3000;
const BOSS_INTRO_MS = 1500;
const BOSS_BAR_HOLD_MS = 1000;
const FEED_LIFE_MS = 1600;
const LOW_HULL_PERCENT = 30;
const CRITICAL_HULL_PERCENT = 15;
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
    this._bossBar = new BossBar();
    this._systems = new SystemsPanel();
    this._lastCombo = null;
    this._lastComboTier = 'text';
    this._blipPool = [];
    this._arcPool = [];
    this._arrowPool = [];
    this._panelCorners = null;
    this._radarJammed = false;
    this._radarNoise = new RandomService('radar-jam');
    this._radarNoiseAt = -Infinity;
    this.radarRangeFactor = 1;
    this._timers = new Set();
    this._bannerTimer = null;
    this._modifierBannerTimer = null;
    this._bannerEndsAt = 0;
    this._bossIntroEndsAt = 0;
    this._transmissionHideTimer = null;
    this._onboardingHideTimer = null;
    this._bossBarHeldUntil = 0;
    this._feedRows = [];
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

    this._cacheElements();
    this._initializeBars();
    this._createBlipPool();
    this._createDirectionPools();

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
    this._bossBar.reset();
    this._systems.reset();
    this._lastCombo = null;
    this._lastComboTier = 'text';
    this._blipPool = [];
    this._arcPool = [];
    this._arrowPool = [];
    this._panelCorners = null;
    this._radarJammed = false;
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
    this._feedRows = [];
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
      bossSegments: query('#ui-boss-segments'),
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
      letterbox: query('#ui-letterbox'),
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
      direction: query('#ui-direction'),
    };
  }

  /**
   * Plan 01.07 Task 5/6 — update spread + aim mode indicators.
   * @param {string} spreadMode - 'concentrated' or 'fan'.
   * @param {string} aimMode - 'auto' or 'manual'.
   */
  updateModeIndicators(spreadMode, aimMode) {
    this._systems.updateModeIndicators(this.els, spreadMode, aimMode);
  }

  /** The right stick aims by hand while held: the AIM chip reads MANUAL. */
  setAimStick(active) {
    this._systems.setAimStick(active);
  }

  /**
   * DASH chip: the bar empties as the dash recharges and the chip flashes
   * once when it is ready again.
   * @param {number} cooldownFraction - 1 right after a dash, 0 when ready.
   */
  updateDashCooldown(cooldownFraction) {
    this._systems.updateDashCooldown(this.els, cooldownFraction);
  }

  /**
   * WEAPON chip, beam pips and evolution chips from
   * CombatSystem.getWeaponState(); writes the DOM only when something changed.
   */
  updateWeapon(state) {
    this._systems.updateWeapon(this.els, state);
  }

  /** A beam fired: the weapon chip and its pips flash once. */
  flashBeam() {
    this._systems.flashBeam(this.els);
  }

  /** Timed pickup chip ("OVERCHARGE 7.9s"); collecting it again restarts it. */
  startBuff(kind, label, duration, color) {
    this._systems.startBuff(this.els, kind, label, duration, color);
  }

  /** Counts the buff chips down on the game's clock; a chip at 0 goes away. */
  tickBuffs(deltaTime) {
    this._systems.tickBuffs(deltaTime);
  }

  clearBuffs() {
    this._systems.clearBuffs();
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
          replay(this.els.comboBox, 'pulse');
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
    this._bossBar.update(
      this.els,
      this._bossBarHeldUntil,
      active,
      name,
      healthPercent,
      phaseInfo
    );
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
   * @param {Array} blips - [{x: -1..1, y: -1..1, type, phased}]: type is a
   *   radarGlyph() name or 'pickup'; a phased blip is dimmed.
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
    drawBlips(this._blipPool, list);
  }

  /** Dense Fog: the radar reaches `factor` of its usual range (1 = normal). */
  setRadarRange(factor) {
    this.radarRangeFactor = factor;
  }

  /** Sensor Jam: noise instead of blips and a "NO SIGNAL" label while on. */
  setRadarJammed(jammed) {
    this._radarJammed = Boolean(jammed);
    this._radarNoiseAt = -Infinity;
    this.els?.radar?.classList.toggle('is-jammed', this._radarJammed);
  }

  _createBlipPool() {
    this._blipPool = createBlipPool(this.els.radarContainer);
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
   * order; the first EDGE_ARROW_MAX off-screen ones get an arrow.
   */
  updateEdgeArrows(targets) {
    placeEdgeArrows(this._arrowPool, targets, this._measuredCorners());
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
