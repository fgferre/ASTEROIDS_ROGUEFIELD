import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/EventBus.js';
import { installDomStubs } from '../__helpers__/headlessGame.js';
import { BASTION_HULL_ID } from '../../src/data/shipModels.js';
import UPGRADE_LIBRARY from '../../src/data/upgrades/index.js';
import AchievementService, {
  ACHIEVEMENTS_STORAGE_KEY,
} from '../../src/services/AchievementService.js';

describe('AchievementService', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => restoreDom());

  const setup = () => {
    const eventBus = new EventBus();
    const service = new AchievementService({ eventBus });
    const unlocked = [];
    eventBus.on('achievement-unlocked', ({ id }) => unlocked.push(id));
    return { eventBus, service, unlocked };
  };
  const repeat = (times, fn) => {
    for (let i = 0; i < times; i += 1) fn();
  };

  it.each([
    ['first-light', ['wave-complete', { wave: 1 }]],
    ['ring-breaker', ['boss-defeated', { enemy: { bossKind: 'prime' } }]],
    ['choir-silenced', ['boss-defeated', { bossKind: 'choir' }]],
    ['null-and-void', ['run-won', { wave: 15 }]],
    ['deep-field', ['wave-started', { wave: 20 }]],
    ['full-set', ['synergy-unlocked', { family: 'kinetic' }]],
    ['apex-predator', ['apex-unlocked', { family: 'arc' }]],
  ])('unlocks %s on its event', (id, [event, payload]) => {
    const { eventBus, unlocked } = setup();
    eventBus.emit('player-took-damage', { damage: 5 });
    eventBus.emit(event, payload);
    expect(unlocked).toContain(id);
    expect(unlocked).not.toContain('untouchable');
  });

  it.each([
    ['harmonic', 50, ['weapon-beam-fired', {}]],
    ['elite-hunter', 25, ['enemy-destroyed', { enemy: { elite: true } }]],
    ['scrapper', 10, ['pickup-collected', { kind: 'repair' }]],
    ['counter-battery', 20, ['enemy-destroyed', { enemy: { type: 'caster' } }]],
    ['unphased', 15, ['enemy-destroyed', { enemy: { type: 'shade' } }]],
    ['survivor', 10, ['game-started', {}]],
  ])('unlocks %s at %i', (id, target, [event, payload]) => {
    const { eventBus, service, unlocked } = setup();
    repeat(target - 1, () => eventBus.emit(event, payload));
    expect(unlocked).toEqual([]);
    expect(service.getEntries().find((e) => e.id === id).progress).toBe(
      target - 1
    );
    eventBus.emit(event, payload);
    expect(unlocked).toEqual([id]);
  });

  it('ignores kills of ordinary enemies for elite-hunter', () => {
    const { eventBus, service } = setup();
    eventBus.emit('enemy-destroyed', { enemy: { type: 'drone' } });
    const entry = service.getEntries().find((e) => e.id === 'elite-hunter');
    expect(entry.progress).toBe(0);
  });

  it('ignores an Elite Tether that blows itself up for elite-hunter', () => {
    const { eventBus, service } = setup();
    eventBus.emit('enemy-destroyed', {
      enemy: { type: 'mine', elite: true },
      source: { cause: 'mine-detonation' },
    });
    const entry = service.getEntries().find((e) => e.id === 'elite-hunter');
    expect(entry.progress).toBe(0);
  });

  it('iron-escort needs a victory flown in the Bastion hull', () => {
    const { eventBus, unlocked } = setup();
    eventBus.emit('run-won', { wave: 15, hullId: 'solar-slicer' });
    expect(unlocked).not.toContain('iron-escort');

    eventBus.emit('run-won', { wave: 15, hullId: BASTION_HULL_ID });
    expect(unlocked).toContain('iron-escort');
  });

  it('full-garage needs both hull items owned in the Hangar', () => {
    const { eventBus, unlocked } = setup();
    eventBus.emit('hangar-purchased', {
      id: 'solar-slicer-hull',
      owned: { 'solar-slicer-hull': true, 'dash-coils': true },
    });
    expect(unlocked).not.toContain('full-garage');

    eventBus.emit('hangar-purchased', {
      id: 'bastion-hull',
      owned: { 'solar-slicer-hull': true, 'bastion-hull': true },
    });
    expect(unlocked).toContain('full-garage');
  });

  it('untouchable needs a Warden layer with no hull damage since it started', () => {
    const { eventBus, unlocked } = setup();
    eventBus.emit('wave-started', { wave: 5 });
    eventBus.emit('player-took-damage', { damage: 10, healthDamage: 10 });
    eventBus.emit('boss-defeated', { bossKind: 'prime' });
    expect(unlocked).not.toContain('untouchable');

    eventBus.emit('wave-started', { wave: 10 });
    eventBus.emit('player-took-damage', { damage: 10, healthDamage: 0 });
    eventBus.emit('boss-defeated', { bossKind: 'choir' });
    expect(unlocked).toContain('untouchable');
  });

  it('cursed-run needs a cursed card taken this run', () => {
    const cursed = UPGRADE_LIBRARY.find((upgrade) => upgrade.cursed);
    const plain = UPGRADE_LIBRARY.find((upgrade) => !upgrade.cursed);
    const { eventBus, unlocked } = setup();
    eventBus.emit('game-started', {});
    eventBus.emit('upgrade-applied', { upgradeId: cursed.id });
    eventBus.emit('game-started', {});
    eventBus.emit('upgrade-applied', { upgradeId: plain.id });
    eventBus.emit('run-won', {});
    expect(unlocked).not.toContain('cursed-run');

    eventBus.emit('upgrade-applied', { upgradeId: cursed.id });
    eventBus.emit('run-won', {});
    expect(unlocked).toContain('cursed-run');
  });

  it('herald-hunter counts each Herald kind once, across sessions', () => {
    const { eventBus, service, unlocked } = setup();
    eventBus.emit('herald-defeated', { kind: 'dust' });
    eventBus.emit('herald-defeated', { kind: 'dust' });
    eventBus.emit('herald-defeated', { kind: 'heat' });
    expect(
      service.getEntries().find((e) => e.id === 'herald-hunter')
    ).toMatchObject({ progress: 2, target: 3, unlockedAt: null });

    const next = setup();
    next.eventBus.emit('herald-defeated', { kind: 'heat' });
    expect(next.unlocked).toEqual([]);
    next.eventBus.emit('herald-defeated', { kind: 'silence' });
    expect(next.unlocked).toEqual(['herald-hunter']);
    expect(unlocked).toEqual([]);
  });

  it('persists unlocks and counters into the next session, unlocking once', () => {
    const { eventBus } = setup();
    eventBus.emit('wave-complete', { wave: 1 });
    repeat(3, () => eventBus.emit('pickup-collected', { kind: 'repair' }));
    const stored = JSON.parse(localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY));
    expect(Object.keys(stored.unlocked)).toEqual(['first-light']);
    expect(stored.progress).toEqual({ scrapper: 3 });

    const next = setup();
    next.eventBus.emit('wave-complete', { wave: 2 });
    const entries = next.service.getEntries();
    expect(entries.find((e) => e.id === 'first-light').unlockedAt).toBe(
      stored.unlocked['first-light']
    );
    expect(entries.find((e) => e.id === 'scrapper').progress).toBe(3);
    expect(next.unlocked).toEqual([]);
  });
});
