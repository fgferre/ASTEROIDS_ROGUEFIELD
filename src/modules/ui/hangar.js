// src/modules/ui/hangar.js

// The Hangar screen and the Salvage line of the run recaps (docs/NORTE.md §7
// pillar 7). Markup only; UISystem wires the buttons.

export function salvageBalanceText(salvage) {
  return `Salvage ${salvage}`;
}

/** "SALVAGE +120 (total 340)" under the game over / victory recap. */
export function salvageLine(award) {
  return `SALVAGE +${award?.amount ?? 0} (total ${award?.total ?? 0})`;
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
