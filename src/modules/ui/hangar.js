// src/modules/ui/hangar.js

// The Hangar screen and the Salvage line of the run recaps (docs/NORTE.md §7
// pillar 7). Markup only; HangarScreen wires the buttons.

import { HANGAR_ITEMS } from '../../data/hangar.js';

export function salvageBalanceText(salvage) {
  return `Salvage ${salvage}`;
}

/**
 * The run end's salvage: `amount` ("+120") and the line after it, "salvage ·
 * 340 to spend in the Hangar"; off the Veteran rate it names the difficulty
 * multiplier: "salvage (×1.3 difficulty) · …".
 */
export function salvageLine(award) {
  const multiplier = award?.multiplier ?? 1;
  const rate = multiplier === 1 ? '' : ` (×${multiplier} difficulty)`;
  return {
    amount: `+${award?.amount ?? 0}`,
    text: `salvage${rate} · ${award?.total ?? 0} to spend in the Hangar`,
  };
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
