import assert from 'node:assert/strict';
import ProgressionSystem from '../../src/modules/ProgressionSystem.js';

class StubEventBus {
  constructor() {
    this.listeners = new Map();
    this.emittedEvents = [];
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }

  emit(event, payload) {
    this.emittedEvents.push({ event, payload });
    const handlers = this.listeners.get(event) || [];
    handlers.forEach((handler) => handler(payload));
  }
}

globalThis.gameEvents = new StubEventBus();
globalThis.gameServices = {
  services: new Map(),
  register(name, instance) {
    this.services.set(name, instance);
  },
  get(name) {
    return this.services.get(name);
  },
};

const progression = new ProgressionSystem();
const initialLevel = progression.getLevel();
const xpAward = 250;

progression.collectXP(xpAward);

const xpState = progression.getExperience();
const levelAfterGain = progression.getLevel();

assert.equal(levelAfterGain, initialLevel + 2, 'Expected two level ups for 250 XP');
assert.equal(xpState.current, 30, 'Expected leftover experience to match remainder');
assert.equal(xpState.needed, 144, 'Expected XP required for next level to scale correctly');

const levelUpEvents = globalThis.gameEvents.emittedEvents.filter(
  (event) => event.event === 'player-leveled-up'
);
assert.equal(levelUpEvents.length, 2, 'Expected two level-up events to be emitted');
assert.deepEqual(
  levelUpEvents.map((evt) => evt.payload.newLevel),
  [initialLevel + 1, initialLevel + 2],
  'Expected sequential newLevel payloads when leveling twice'
);

const xpChangedEvents = globalThis.gameEvents.emittedEvents.filter(
  (event) => event.event === 'experience-changed'
);
assert.equal(xpChangedEvents.length, 1, 'Expected a single experience-changed event emission');
assert.equal(
  xpChangedEvents[0].payload.current,
  xpState.current,
  'experience-changed current payload should match system experience'
);
assert.equal(
  xpChangedEvents[0].payload.needed,
  xpState.needed,
  'experience-changed needed payload should match system requirement'
);
assert.equal(
  xpChangedEvents[0].payload.level,
  levelAfterGain,
  'experience-changed level payload should match current level'
);

console.log('ProgressionSystem multi-level-up test passed.');
