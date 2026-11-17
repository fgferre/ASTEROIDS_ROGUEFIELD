// src/modules/ui/hangar.js

// The Hangar screen and the Salvage line of the run recaps (docs/NORTE.md §7
// pillar 7). Markup only; HangarScreen wires the buttons.

import {
  DIFFICULTY_PRESETS,
  PRESSURE_RUNGS,
  pressureNumeral,
} from '../../data/difficulty.js';
import { HANGAR_ITEMS } from '../../data/hangar.js';
import UPGRADE_LIBRARY from '../../data/upgrades/index.js';

export function salvageBalanceText(salvage) {
  return `Salvage ${salvage}`;
}

/**
 * The run end's salvage: `amount` ("+120") and the line after it, "salvage ·
 * 340 to spend in the Hangar"; off the Veteran rate it names the difficulty
 * multiplier: "salvage (×1.3 difficulty) · …"; medals paid during the run
 * add "+100 from medals".
 */
export function salvageLine(award) {
  const multiplier = award?.multiplier ?? 1;
  const rate = multiplier === 1 ? '' : ` (×${multiplier} difficulty)`;
  const medals = award?.medals ? ` · +${award.medals} from medals` : '';
  return {
    amount: `+${award?.amount ?? 0}`,
    text: `salvage${rate}${medals} · ${award?.total ?? 0} to spend in the Hangar`,
  };
}

const cardName = (id) =>
  UPGRADE_LIBRARY.find((card) => card.id === id)?.text.name ?? id;

/** What a medal pays: "+50 Salvage", "License · Arc Lattice", "Opens Pressure · +100 Salvage". */
export function medalRewardText(reward = {}) {
  return [
    ...(reward.opensPressure ? ['Opens Pressure'] : []),
    ...(reward.license ? [`License · ${cardName(reward.license)}`] : []),
    ...(reward.salvage ? [`+${reward.salvage} Salvage`] : []),
  ].join(' · ');
}

/** One medal on the wall: glyph, title, what to do (with progress), what it pays. */
export function medalMarkup(medal) {
  const earned = Boolean(medal.unlockedAt);
  const progress =
    !earned && medal.target ? ` · ${medal.progress} / ${medal.target}` : '';
  const reward = medalRewardText(medal.reward);
  const key = medal.reward?.opensPressure ? ' is-key' : '';
  return `<li class="medal ${earned ? 'is-earned' : 'is-locked'}${key}" data-medal="${medal.id}">
    <span class="achievement-card__glyph medal__glyph" aria-hidden="true">${medal.glyph}</span>
    <div class="medal__text">
      <h3 class="medal__title">${medal.title}</h3>
      <p class="medal__desc">${medal.description}${progress}</p>
      <p class="medal__reward">${earned ? `✓ ${reward} · paid` : reward}</p>
    </div></li>`;
}

const percent = (factor) => `+${Math.round((factor - 1) * 100)}%`;

/**
 * The Pressure ladder: "Off" (the Settings difficulty), then each rung with
 * what it does, its Salvage rate and whether it is open and selected.
 */
export function pressureLadderMarkup({ open, selected, best }) {
  const off = `<li class="pressure-rung${selected === 0 ? ' is-selected' : ''}">
    <button type="button" class="pressure-rung__pick" data-hangar-pressure="0" aria-pressed="${selected === 0}"${
      open === 0 ? ' disabled' : ''
    }>
      <span class="pressure-rung__numeral">—</span>
      <span class="pressure-rung__text"><span class="pressure-rung__name">Off</span>
      <span class="pressure-rung__stats">Your difficulty, as chosen in Settings</span></span>
      <span class="pressure-rung__pay">Salvage ×${DIFFICULTY_PRESETS.pilot.salvage} – ×${DIFFICULTY_PRESETS.warden.salvage}</span>
    </button></li>`;
  const rungs = PRESSURE_RUNGS.map((rung, index) => {
    const n = index + 1;
    const numeral = pressureNumeral(n);
    const locked = n > open;
    const isSelected = n === selected;
    const stats = locked
      ? `🔒 ${n === 1 ? 'Win your first run to open' : `Win at Pressure ${pressureNumeral(n - 1)} to open`}`
      : `Enemy hull ${percent(rung.enemyHp)} · hits ${percent(rung.enemyDamage)} · fields ${percent(rung.spawnCount)}`;
    const tags = [
      ...(isSelected ? ['selected'] : []),
      ...(n <= best ? ['won'] : []),
    ];
    return `<li class="pressure-rung${isSelected ? ' is-selected' : ''}${locked ? ' is-locked' : ''}">
    <button type="button" class="pressure-rung__pick" data-hangar-pressure="${n}" aria-pressed="${isSelected}"${
      locked ? ' disabled' : ''
    }>
      <span class="pressure-rung__numeral">${numeral}</span>
      <span class="pressure-rung__text"><span class="pressure-rung__name">Pressure ${numeral}${
        tags.length ? ` · ${tags.join(' · ')}` : ''
      }</span>
      <span class="pressure-rung__stats">${stats}</span></span>
      <span class="pressure-rung__pay">Salvage ×${rung.salvage}</span>
    </button></li>`;
  });
  return [off, ...rungs].join('');
}

/** The line over the ladder. */
export function pressureNoteText(open) {
  return open === 0
    ? 'Win your first run, a sector of the map or the descent, to open Pressure: rungs above Warden that pay more Salvage.'
    : 'Rungs above Warden. A chosen rung replaces the Settings difficulty; a run won on the highest open rung opens the next. The Daily Field stays on Veteran.';
}

const hullPrice = (hullId) =>
  HANGAR_ITEMS.find((entry) => entry.unlocksHull === hullId).cost;

/** Over a hovered locked hull's silhouette: "🔒 LOCKED · 400 SALVAGE". */
export function hullLockText(hullId) {
  return `🔒 LOCKED · ${hullPrice(hullId)} SALVAGE`;
}

/** A locked hull on the menu: "🔒 400 Salvage in the Hangar". */
export function hullUnlockText(hullId) {
  return `🔒 ${hullPrice(hullId)} Salvage in the Hangar`;
}

// A hull's stats against the Interceptor's, in the order they are listed;
// `lowerIsBetter`: a shorter dash cooldown is the better one.
const HULL_STATS = [
  { key: 'maxHealth', label: 'Hull' },
  { key: 'maxSpeed', label: 'Speed' },
  { key: 'acceleration', label: 'Thrust' },
  { key: 'dashCooldown', label: 'Dash cooldown', lowerIsBetter: true },
];

/**
 * What a hull does: its `role` and, for each stat off the baseline, a signed
 * percent ("Hull +35%") with `better` for the markup's colour. A hull with
 * none off it reads "Standard hull, speed and dash".
 */
export function hullTraits(hull) {
  const stats = HULL_STATS.filter(({ key }) => hull.stats[key] !== 1).map(
    ({ key, label, lowerIsBetter }) => {
      const percent = Math.round((hull.stats[key] - 1) * 100);
      return {
        text: `${label} ${percent > 0 ? '+' : ''}${percent}%`,
        better: lowerIsBetter ? percent < 0 : percent > 0,
      };
    }
  );
  return {
    role: hull.role,
    stats,
    plain: stats.length === 0 ? 'Standard hull, speed and dash' : null,
  };
}

/** The hull's name and traits as one line of markup; `lock` (optional) ends it. */
export function hullTraitsMarkup(hull, lock = '') {
  const { role, stats, plain } = hullTraits(hull);
  const parts = [
    `<span class="hull-traits__name">${hull.name}</span>`,
    `<span class="hull-traits__role">${role}</span>`,
    ...(plain ? [plain] : []),
    ...stats.map(
      (stat) =>
        `<span class="hull-traits__stat ${stat.better ? 'is-better' : 'is-worse'}">${stat.text}</span>`
    ),
    ...(lock ? [`<span class="hull-traits__lock">${lock}</span>`] : []),
  ];
  return parts.join(' · ');
}

/** One upgrade card: name, effect, cost and OWNED or a BUY button. */
export function hangarItemMarkup(item) {
  const action = item.owned
    ? '<span class="hangar-item__action hangar-item__owned" tabindex="-1">OWNED</span>'
    : `<button type="button" class="btn btn--secondary hangar-item__action" data-hangar-buy="${item.id}"${
        item.affordable ? '' : ' disabled'
      }>BUY · ${item.cost}</button>`;
  return `<li class="hangar-item${item.owned ? ' is-owned' : ''}" data-hangar-item="${item.id}">
    <div class="hangar-item__text">
      <h3 class="hangar-item__name">${item.name}</h3>
      <p class="hangar-item__effect">${item.effect}</p>
    </div>
    ${action}</li>`;
}
