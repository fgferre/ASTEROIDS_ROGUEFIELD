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

/** Over a hovered locked hull's silhouette: "🔒 LOCKED · 400 SALVAGE". */
export function hullLockText(hullId) {
  const item = HANGAR_ITEMS.find((entry) => entry.unlocksHull === hullId);
  return `🔒 LOCKED · ${item.cost} SALVAGE`;
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
