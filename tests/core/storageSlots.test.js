import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomStubs } from '../__helpers__/domStubs.js';
import {
  SLOTS_STORAGE_KEY,
  SLOT_KEYS,
  chooseSlot,
  deleteSlot,
  getActiveSlot,
  holdProgress,
  loadJSON,
  resolveActiveSlot,
  saveJSON,
  saveProgress,
} from '../../src/core/storage.js';
import { loadRecords, updateRecords } from '../../src/services/runRecords.js';

// The save from before slots, as a player has it today: records, the old
// Hangar (v1), a medal, the story seen, and settings.
const TODAY = {
  'roguefield:records:v1': {
    bestLayer: 15,
    runs: 23,
    sectorsWon: ['prime-gate'],
  },
  'roguefield:hangar:v1': {
    salvage: 340,
    owned: { 'reinforced-plating': true },
  },
  'roguefield:achievements:v1': { unlocked: { survivor: '2026-11-01' } },
  'roguefield:story-told:v1': true,
  'astro:settings:v1': { gameplay: { selectedHull: 'bastion' } },
};

const keys = () =>
  Array.from({ length: localStorage.length }, (_, i) =>
    localStorage.key(i)
  ).sort();
const seedToday = () =>
  Object.entries(TODAY).forEach(([key, value]) =>
    localStorage.setItem(key, JSON.stringify(value))
  );
const playSlot = (slot) => {
  chooseSlot(slot);
  resolveActiveSlot();
};

describe('save slots', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
    resolveActiveSlot();
  });
  afterEach(() => {
    restoreDom();
    resolveActiveSlot();
  });

  it.each([
    ['absent', null],
    ['broken JSON', '{active'],
    ['out of range', JSON.stringify({ active: 4 })],
    ['zero', JSON.stringify({ active: 0 })],
    ['text for the number', JSON.stringify({ active: '2' })],
    ['not an object', JSON.stringify(2)],
  ])('opens slot 1 when the slots index is %s', (_, raw) => {
    seedToday();
    if (raw !== null) localStorage.setItem(SLOTS_STORAGE_KEY, raw);
    expect(resolveActiveSlot()).toBe(1);
    expect(loadRecords().bestLayer).toBe(15);
  });

  it("is today's save in slot 1, Hangar v1 included, and empty in slots 2 and 3", () => {
    seedToday();
    const before = keys();
    expect(loadJSON('roguefield:hangar:v1').salvage).toBe(340);
    playSlot(2);
    expect(loadRecords().bestLayer).toBe(0);
    expect(loadJSON('roguefield:hangar:v1')).toBeNull();
    playSlot(3);
    expect(loadJSON('roguefield:achievements:v1')).toBeNull();
    // Nothing of today's save was moved or copied.
    expect(keys()).toEqual([...before, SLOTS_STORAGE_KEY].sort());
  });

  it('keeps a pilot to its slot: playing slot 2 leaves slot 1 as it was', () => {
    seedToday();
    const slot1 = localStorage.getItem('roguefield:records:v1');
    playSlot(2);
    updateRecords({ layer: 3 });
    expect(localStorage.getItem('roguefield:records:v1')).toBe(slot1);
    expect(
      JSON.parse(localStorage.getItem('roguefield:slot2:records:v1'))
    ).toMatchObject({ bestLayer: 3 });
    playSlot(1);
    expect(loadRecords().bestLayer).toBe(15);
  });

  it('takes progress only for the listed keys, and keeps settings shared', () => {
    playSlot(2);
    expect(() => saveProgress('astro:settings:v1', {})).toThrow(/SLOT_KEYS/);
    expect(() => saveProgress('roguefield:records:v2', {})).toThrow();
    saveJSON('astro:settings:v1', { audio: { masterVolume: 0.4 } });
    expect(localStorage.getItem('astro:settings:v1')).not.toBeNull();
    expect(keys()).not.toContain('roguefield:slot2:settings:v1');
    saveJSON(SLOTS_STORAGE_KEY, { active: 2 });
    expect(keys()).not.toContain('roguefield:slot2:slots:v1');
  });

  it('switches slot even while a run keeps no progress', () => {
    holdProgress(true);
    chooseSlot(3);
    expect(resolveActiveSlot()).toBe(3);
  });

  it('deletes slot 2 or 3 to the listed keys, never an unprefixed one', () => {
    seedToday();
    for (const slot of [2, 3]) {
      playSlot(slot);
      SLOT_KEYS.forEach((key) => saveJSON(key, { slot }));
    }
    playSlot(1);
    const kept = keys().filter((key) => !key.includes(':slot2:'));
    deleteSlot(2);
    expect(keys()).toEqual(kept);
    expect(keys().filter((key) => key.includes(':slot3:'))).toHaveLength(
      SLOT_KEYS.length
    );
  });

  it('deletes slot 1 with the old Hangar, so the pilot does not come back', () => {
    seedToday();
    playSlot(2);
    saveJSON('roguefield:records:v1', { bestLayer: 2 });
    playSlot(1);
    deleteSlot(1);
    resolveActiveSlot();
    expect(loadJSON('roguefield:hangar:v1')).toBeNull();
    expect(loadRecords().bestLayer).toBe(0);
    expect(localStorage.getItem('astro:settings:v1')).not.toBeNull();
    expect(localStorage.getItem('roguefield:slot2:records:v1')).not.toBeNull();
    expect(getActiveSlot()).toBe(1);
  });

  it('a tab still playing a pilot another tab deleted does not bring it back', () => {
    playSlot(2);
    saveProgress('roguefield:hangar:v2', { salvage: 100 });
    // Another tab, on its pilots screen, deletes pilot 2 (the same storage);
    // this one buys in its Hangar and finishes the tutorial.
    deleteSlot(2);
    saveProgress('roguefield:hangar:v2', { salvage: 40 });
    saveJSON('roguefield:onboarding:v1', { done: true });
    expect(keys().filter((key) => key.includes(':slot2:'))).toEqual([]);
    // A page loaded after the deletion plays the new, empty pilot 2.
    resolveActiveSlot();
    saveProgress('roguefield:hangar:v2', { salvage: 5 });
    expect(loadJSON('roguefield:hangar:v2')).toEqual({ salvage: 5 });
  });

  it('says whether a chosen slot was kept, so a refused one is not reloaded into', () => {
    expect(chooseSlot(2)).toBe(true);
    const set = localStorage.setItem;
    localStorage.setItem = (key, value) => {
      if (key === SLOTS_STORAGE_KEY) throw new Error('QuotaExceededError');
      set(key, value);
    };
    expect(chooseSlot(3)).toBe(false);
    expect(resolveActiveSlot()).toBe(2);
  });
});

describe('a pilot another tab wrote', () => {
  it('is an old copy here: none of it is written back until a reload', async () => {
    const restoreDom = installDomStubs();
    // A page whose window hears the other tabs' writes ('storage' events).
    const events = new EventTarget();
    window.addEventListener = events.addEventListener.bind(events);
    vi.resetModules();
    const storage = await import('../../src/core/storage.js');
    storage.saveProgress('roguefield:hangar:v2', { salvage: 100 });
    // Another tab, on the same pilot, buys in its Hangar.
    localStorage.setItem(
      'roguefield:hangar:v2',
      JSON.stringify({ salvage: 40, owned: { plating: true } })
    );
    const write = new Event('storage');
    write.key = 'roguefield:hangar:v2';
    events.dispatchEvent(write);
    expect(storage.isPilotStale()).toBe(true);
    storage.saveProgress('roguefield:hangar:v2', { salvage: 130 });
    expect(storage.loadJSON('roguefield:hangar:v2')).toEqual({
      salvage: 40,
      owned: { plating: true },
    });
    storage.resolveActiveSlot();
    expect(storage.isPilotStale()).toBe(false);
    restoreDom();
  });
});
