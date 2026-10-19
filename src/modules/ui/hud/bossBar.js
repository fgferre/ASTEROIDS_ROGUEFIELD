// src/modules/ui/hud/bossBar.js

import { BOSS_CONFIG } from '../../../data/constants/visual.js';

const BOSS_FALLBACK_COLOR = '#ff003c';
const BOSS_FALLBACK_DARK = '#880020';

/**
 * Boss bar segments left → right ({ left, width } in %, state). Health
 * drains right to left, so phase 0 is the rightmost segment; segments to
 * its right are spent, to its left still ahead. Boundaries come from the
 * Warden's phase thresholds when they match the count, else equal parts.
 */
export function bossSegments(
  phaseCount,
  phase,
  thresholds = BOSS_CONFIG.phaseThresholds
) {
  const total = Math.max(1, Math.floor(Number(phaseCount) || 1));
  const bounds =
    Array.isArray(thresholds) && thresholds.length === total - 1
      ? [0, ...[...thresholds].sort((a, b) => a - b).map((t) => t * 100), 100]
      : Array.from({ length: total + 1 }, (_, i) => (i / total) * 100);
  const current = total - 1 - Math.min(total - 1, Math.max(0, phase || 0));
  return Array.from({ length: total }, (_, i) => ({
    left: bounds[i],
    width: bounds[i + 1] - bounds[i],
    state: i === current ? 'current' : i > current ? 'spent' : 'ahead',
  }));
}

/** Darken a hex color by a factor (0-1) */
function darkenColor(hex, factor) {
  if (!hex || typeof hex !== 'string') return BOSS_FALLBACK_DARK;
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return BOSS_FALLBACK_DARK;
  const num = parseInt(clean, 16);
  const r = Math.max(0, Math.floor(((num >> 16) & 0xff) * (1 - factor)));
  const g = Math.max(0, Math.floor(((num >> 8) & 0xff) * (1 - factor)));
  const b = Math.max(0, Math.floor((num & 0xff) * (1 - factor)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** The boss bar's state (hit flashes, segments); `els` is the HUD's element map. */
export class BossBar {
  constructor() {
    this._lastBossHealthPercent = null;
    this._bossHitTimeout = null;
    this._bossCriticalTimeout = null;
    this._bossSegmentEls = [];
    this._bossSegmentKey = null;
  }

  /** Clears the flash timers and the remembered bar (the HUD unmounts). */
  reset() {
    if (this._bossHitTimeout) {
      window.clearTimeout(this._bossHitTimeout);
      this._bossHitTimeout = null;
    }
    if (this._bossCriticalTimeout) {
      window.clearTimeout(this._bossCriticalTimeout);
      this._bossCriticalTimeout = null;
    }
    this._lastBossHealthPercent = null;
    this._bossSegmentEls = [];
    this._bossSegmentKey = null;
  }

  /** Mostra/Esconde e atualiza Boss Bar; hidden while `now < heldUntil`. */
  update(els, heldUntil, active, name, healthPercent, phaseInfo) {
    if (!active) {
      els.bossPanel.classList.remove('active');
      els.bossPanel.classList.remove('is-hit', 'is-invulnerable');
      els.bossPanel.classList.remove('is-critical', 'is-herald');
      if (this._bossHitTimeout) {
        window.clearTimeout(this._bossHitTimeout);
        this._bossHitTimeout = null;
      }
      if (this._bossCriticalTimeout) {
        window.clearTimeout(this._bossCriticalTimeout);
        this._bossCriticalTimeout = null;
      }
      this._lastBossHealthPercent = null;
      this._updateBossSegments(els, 0, 0);
      this._resetBossColors(els);
      return;
    }

    // A Herald: shorter violet bar, one segment, no phase colours.
    const herald = Boolean(phaseInfo?.herald);
    if (herald !== els.bossPanel.classList.contains('is-herald')) {
      els.bossPanel.classList.toggle('is-herald', herald);
      this._resetBossColors(els);
    }

    els.bossPanel.classList.toggle('active', performance.now() >= heldUntil);
    els.bossPanel.classList.toggle(
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
    els.bossName.innerText = displayName;

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
      const darkColor = darkenColor(color, 0.4);
      els.bossFill.style.background = `repeating-linear-gradient(45deg, ${color}, ${color} 10px, ${darkColor} 10px, ${darkColor} 20px)`;
      els.bossFill.style.boxShadow = `0 0 20px ${color}`;
    }

    if (healthPercent !== undefined) {
      els.bossFill.style.width = healthPercent + '%';
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
        this._triggerBossHit(els);
        if (delta >= 8) {
          this._triggerBossCritical(els);
        }
      }
      this._lastBossHealthPercent = healthPercent;
    }

    this._updateBossSegments(els, phaseCount, phase);
  }

  /** Reset boss bar colors to default */
  _resetBossColors(els) {
    if (!els.bossFill) return;
    els.bossFill.style.background = '';
    els.bossFill.style.boxShadow = '';
  }

  _triggerBossHit(els) {
    if (!els.bossPanel) {
      return;
    }
    els.bossPanel.classList.add('is-hit');
    if (this._bossHitTimeout) {
      window.clearTimeout(this._bossHitTimeout);
    }
    this._bossHitTimeout = window.setTimeout(() => {
      els.bossPanel?.classList.remove('is-hit');
      this._bossHitTimeout = null;
    }, 180);
  }

  _triggerBossCritical(els) {
    if (!els.bossPanel) {
      return;
    }
    els.bossPanel.classList.add('is-critical');
    if (this._bossCriticalTimeout) {
      window.clearTimeout(this._bossCriticalTimeout);
    }
    this._bossCriticalTimeout = window.setTimeout(() => {
      els.bossPanel?.classList.remove('is-critical');
      this._bossCriticalTimeout = null;
    }, 280);
  }

  _updateBossSegments(els, phaseCount, phase) {
    const container = els.bossSegments;
    if (!container) {
      return;
    }

    const total = Number.isFinite(phaseCount) ? Math.floor(phaseCount) : 0;
    const segments = total > 0 ? bossSegments(total, phase) : [];
    const key = segments.map((seg) => seg.state).join();
    if (key === this._bossSegmentKey) {
      return;
    }
    this._bossSegmentKey = key;

    if (segments.length !== this._bossSegmentEls.length) {
      container.innerHTML = '';
      this._bossSegmentEls = segments.map((seg) => {
        const el = document.createElement('div');
        el.style.left = `${seg.left}%`;
        el.style.width = `${seg.width}%`;
        container.appendChild(el);
        return el;
      });
    }
    // One segment (a Herald) is just the bar: no pulse.
    segments.forEach((seg, index) => {
      const state = segments.length > 1 ? seg.state : 'ahead';
      this._bossSegmentEls[index].className = `boss-seg is-${state}`;
    });
  }
}
