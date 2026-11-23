// The full-game tests and the golden trace run with a double in the
// renderer's place (createRendererDouble in tests/__helpers__/headlessGame.js)
// and record the game's events; on a reset the double must announce what the
// real Renderer3D announces, or the double drifts from it unseen.

import { describe, expect, it } from 'vitest';
import { EventBus } from '../../../src/core/EventBus.js';
import Renderer3D from '../../../src/modules/render3d/Renderer3D.js';
import { createRendererDouble } from '../../__helpers__/headlessGame.js';

function eventsOnReset(build) {
  const eventBus = new EventBus();
  const renderer = build(eventBus);
  const events = [];
  const emit = eventBus.emit.bind(eventBus);
  eventBus.emit = (name, payload) => {
    events.push([name, payload]);
    return emit(name, payload);
  };
  renderer.reset();
  return events;
}

describe("the headless game's renderer double", () => {
  it('announces on a reset the same events as the real renderer', () => {
    const real = eventsOnReset((eventBus) => new Renderer3D({ eventBus }));
    expect(real.length).toBeGreaterThan(0);
    expect(eventsOnReset(createRendererDouble)).toEqual(real);
  });
});
