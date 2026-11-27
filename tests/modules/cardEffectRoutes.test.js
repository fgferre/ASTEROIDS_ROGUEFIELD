import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/EventBus.js';
import { GamePools } from '../../src/core/GamePools.js';
import {
  declaredCardEffects,
  routeCardEffects,
} from '../../src/modules/cardEffectRoutes.js';
import { createHeadlessGame } from '../__helpers__/headlessGame.js';
import { installDomStubs } from '../__helpers__/domStubs.js';

const ownersOf = (effect) => [effect.to ?? []].flat();

// A stand-in for each function `service` must hand the router.
const functionsOf = (service) =>
  Object.fromEntries(
    declaredCardEffects()
      .filter(({ effect }) => ownersOf(effect).includes(service))
      .filter(({ effect }) => !effect.lands)
      .map(({ effect }) => [effect.event, vi.fn()])
  );

// One owner routed on its own bus.
function route(owner, service, functions = functionsOf(service)) {
  const eventBus = new EventBus();
  routeCardEffects(owner, service, (event, fn) => eventBus.on(event, fn), {
    ...functions,
  });
  return { eventBus, functions };
}

describe('card effect routes', () => {
  it('stores the delivered object where the card says, under the event name', () => {
    const combat = { cards: { cardEffects: {} } };
    const { eventBus } = route(combat, 'combat');
    const delivered = { beamLengthMultiplier: 1.4, upgradeId: 'thermal_lens' };
    eventBus.emit('upgrade-thermal-lens', delivered);
    expect(combat.cards.cardEffects.thermalLens).toBe(delivered);
  });

  it('stores payload keys on owner paths, in the order the card lists them', () => {
    const player = { maneuvers: {} };
    const { eventBus } = route(player, 'player');
    eventBus.emit('upgrade-phase-dash', { extraCharges: 2, ghostLinger: 0.5 });
    expect(player.maneuvers).toEqual({
      dashSpareMax: 2,
      dashSpare: 2,
      dashGhostLinger: 0.5,
    });
  });

  it("runs the owner's function for an effect that computes", () => {
    const { eventBus, functions } = route({}, 'combat');
    const delivered = { weaponId: 'scatter', level: 1 };
    eventBus.emit('upgrade-weapon', delivered);
    expect(functions['upgrade-weapon']).toHaveBeenCalledWith(delivered);
  });

  it('a missing function, or one no card routes, is a developer error', () => {
    expect(() => route({}, 'xp-orbs', {})).toThrow(/upgrade-tow-pulse/);
    expect(() =>
      route({}, 'pickups', { 'upgrade-lucky-fragment': () => {} })
    ).toThrow(/upgrade-lucky-fragment/);
  });

  describe('in the game', () => {
    let restoreDom;
    beforeEach(() => {
      restoreDom = installDomStubs();
    });
    afterEach(() => {
      GamePools.releaseAll();
      restoreDom();
    });

    // A holder that starts empty (combat's cardEffects) is a bag the cards
    // fill; any other holder already has the field a card sets.
    it('every `lands` path reaches a holder on its owner, and a field it holds', () => {
      const { services } = createHeadlessGame();
      const missing = declaredCardEffects()
        .filter(({ effect }) => effect.lands)
        .flatMap(({ source, effect }) =>
          ownersOf(effect).flatMap((service) =>
            (typeof effect.lands === 'string'
              ? [effect.lands]
              : Object.keys(effect.lands)
            )
              .filter((path) => {
                const keys = path.split('.');
                const field = keys.pop();
                const holder = keys.reduce(
                  (on, key) => on?.[key],
                  services[service]
                );
                if (typeof holder !== 'object' || !holder) return true;
                return Object.keys(holder).length > 0 && !(field in holder);
              })
              .map((path) => `${source}: ${service}.${path}`)
          )
        );
      expect([...new Set(missing)]).toEqual([]);
    });

    it('each owner hears an effect once, the player before combat on the Auto Turret', () => {
      const { services, eventBus } = createHeadlessGame();
      const heard = (event) => eventBus.events.get(event) ?? [];
      const miscounted = declaredCardEffects()
        .map(({ effect }) => effect)
        .filter((effect) => ownersOf(effect).length > 0)
        .filter(
          (effect) => heard(effect.event).length !== ownersOf(effect).length
        )
        .map(({ event }) => `${event}: ${heard(event).length}`);
      expect([...new Set(miscounted)]).toEqual([]);

      services.player.noseAim = true;
      heard('upgrade-auto-aim')[0].callback({});
      expect(services.player.noseAim).toBe(false);
    });
  });
});
