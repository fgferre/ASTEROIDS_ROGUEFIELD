// The production manifest: the simulation (simulationManifest.js) with the
// systems that show, sound and draw it in their slots.

import UISystem from '../modules/UISystem.js';
import AudioSystem from '../modules/AudioSystem.js';
import Renderer3D from '../modules/render3d/Renderer3D.js';
import MenuBackgroundSystem from '../modules/MenuBackgroundSystem.js';
import { createServiceResolver } from '../core/serviceUtils.js';
import { createSimulationManifest } from './simulationManifest.js';

export {
  DEFAULT_POOL_CONFIG,
  DEFAULT_GC_OPTIONS,
} from './simulationManifest.js';

export function createServiceManifest(context = {}) {
  return createSimulationManifest(context, {
    audio: {
      name: 'audio',
      singleton: true,
      lazy: true,
      dependencies: ['event-bus', 'settings', 'random'],
      factory: ({ resolved }) =>
        new AudioSystem({
          eventBus: resolved['event-bus'],
          settings: resolved['settings'],
          random: resolved['random'],
        }),
    },
    ui: {
      name: 'ui',
      singleton: true,
      lazy: false,
      dependencies: ['event-bus', 'settings', 'hangar', 'difficulty'],
      factory: ({ resolved, container }) => {
        const serviceResolver = createServiceResolver(container);
        return new UISystem({
          eventBus: resolved['event-bus'],
          settings: resolved['settings'],
          serviceResolver,
        });
      },
    },
    'menu-background': {
      name: 'menu-background',
      singleton: true,
      lazy: false,
      dependencies: ['event-bus', 'settings', 'random'],
      factory: ({ resolved, container }) => {
        const serviceResolver = createServiceResolver(container);
        return new MenuBackgroundSystem({
          eventBus: resolved['event-bus'],
          settings: resolved['settings'],
          random: resolved['random'],
          serviceResolver,
        });
      },
    },
    renderer: {
      name: 'renderer',
      singleton: true,
      lazy: false,
      dependencies: [
        'event-bus',
        'player',
        'progression',
        'xp-orbs',
        'healthHearts',
        'pickups',
        'effects',
        'combat',
        'enemies',
        'random',
        'menu-background',
        'settings',
      ],
      factory: ({ resolved }) => {
        return new Renderer3D({
          eventBus: resolved['event-bus'],
          player: resolved['player'],
          progression: resolved['progression'],
          'xp-orbs': resolved['xp-orbs'],
          healthHearts: resolved['healthHearts'],
          pickups: resolved['pickups'],
          effects: resolved['effects'],
          combat: resolved['combat'],
          enemies: resolved['enemies'],
          random: resolved['random'],
          'menu-background': resolved['menu-background'],
          settings: resolved['settings'],
        });
      },
    },
  });
}
