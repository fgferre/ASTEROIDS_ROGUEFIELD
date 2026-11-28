// src/modules/cardEffectRoutes.js
//
// A card effect is declared once, on the card (src/content/cards/, the family
// bonuses in data/upgrades/families.js, the weapon cards in
// data/upgrades/index.js): `{ type: 'event', event, payload, to, lands }`.
// UpgradeSystem emits `event` on the bus with the payload and the pick's
// upgradeId, level and category; that delivered object is what the owner gets.
// `to` names the service that owns the effect: a list when two own it, in the
// order they hear it; [] when it is only an announcement, heard by whoever
// listens. `lands`, when the effect only stores, is where the delivered object
// goes on its owner: a path for the whole object ('maneuvers.reactiveBrake'),
// or { ownerPath: payloadKey } for some of its keys. Any other effect is the
// owner's function of that event's name. Each owner calls routeCardEffects
// once and hears its effects on the bus under their own names, so an effect
// still runs inside its emit. tests/process/cardEffectRoutes.test.js keeps the
// cards and the owners in line.

import UPGRADE_LIBRARY from '../data/upgrades/index.js';
import { UPGRADE_FAMILIES } from '../data/upgrades/families.js';

let declared = null;

/**
 * Every event effect the cards and the family bonuses declare, as
 * `{ source, effect }`: `source` is the card's id or 'the <family> bonus'.
 */
export function declaredCardEffects() {
  declared ??= [
    ...UPGRADE_LIBRARY.flatMap((card) =>
      card.levels.flatMap((level) =>
        (level.effects ?? []).map((effect) => ({ source: card.id, effect }))
      )
    ),
    ...Object.values(UPGRADE_FAMILIES).flatMap((family) =>
      family.bonus.effects.map((effect) => ({
        source: `the ${family.id} bonus`,
        effect,
      }))
    ),
  ].filter(({ effect }) => (effect.type ?? 'event') === 'event');
  return declared;
}

// Sets `path` ('a.b.c') on `owner`, reading the holders on the way when the
// effect lands, as the old listeners did.
function assign(owner, path, value) {
  const keys = path.split('.');
  const field = keys.pop();
  keys.reduce((holder, key) => holder[key], owner)[field] = value;
}

function land(owner, lands, data) {
  if (typeof lands === 'string') {
    assign(owner, lands, data);
    return;
  }
  Object.entries(lands).forEach(([path, key]) =>
    assign(owner, path, data[key])
  );
}

/**
 * Subscribes `owner` (the service `service`) to every effect routed to it,
 * through `subscribe(event, handler)`: the effect lands where the card says,
 * or runs `functions[event]`. A routed effect without `lands` and without a
 * function, or a function no card routes here, is a developer error.
 */
export function routeCardEffects(owner, service, subscribe, functions = {}) {
  const routes = new Map(
    declaredCardEffects()
      .filter(({ effect }) => [effect.to ?? []].flat().includes(service))
      .map(({ effect }) => [effect.event, effect.lands])
  );
  Object.keys(functions).forEach((event) => {
    if (!routes.has(event) || routes.get(event)) {
      throw new Error(
        `[cardEffectRoutes] '${service}' has a function for '${event}', but no card routes that effect to it without \`lands\``
      );
    }
  });
  routes.forEach((lands, event) => {
    const handler = lands
      ? (data) => land(owner, lands, data)
      : functions[event];
    if (!handler) {
      throw new Error(
        `[cardEffectRoutes] '${service}' has no function for '${event}' (its card declares no \`lands\`)`
      );
    }
    subscribe(event, handler);
  });
}
