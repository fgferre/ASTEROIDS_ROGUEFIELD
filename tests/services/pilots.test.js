import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installDomStubs } from '../__helpers__/headlessGame.js';
import { chooseSlot, resolveActiveSlot } from '../../src/core/storage.js';
import { pilotSummaries } from '../../src/services/pilots.js';
import { localDay, updateRecords } from '../../src/services/runRecords.js';
import {
  deleteConfirmMarkup,
  lastFlownLabel,
  pilotCardMarkup,
} from '../../src/modules/menu/pilotSelect.js';

describe('pilots', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
    resolveActiveSlot();
  });
  afterEach(() => {
    restoreDom();
    resolveActiveSlot();
  });

  it("sums up each pilot from its own save, today's (old Hangar) in slot 1", () => {
    localStorage.setItem(
      'roguefield:records:v1',
      JSON.stringify({
        bestLayer: 15,
        sectorsWon: ['prime-gate', 'dense-core'],
      })
    );
    localStorage.setItem(
      'roguefield:hangar:v1',
      JSON.stringify({ salvage: 340 })
    );
    localStorage.setItem(
      'roguefield:achievements:v1',
      JSON.stringify({ unlocked: { survivor: '2026-11-01', gone: 'x' } })
    );
    localStorage.setItem(
      'roguefield:slot3:story-told:v1',
      JSON.stringify(true)
    );

    const [one, two, three] = pilotSummaries();
    expect(one).toMatchObject({
      slot: 1,
      layer: 15,
      sectorsWon: 2,
      medals: 1,
      salvage: 340,
      lastRun: null,
    });
    expect(one.sectors).toBeGreaterThan(2);
    expect(one.medalsTotal).toBeGreaterThan(1);
    expect(two).toBeNull();
    // Anything saved makes a pilot, even before its first run's records.
    expect(three).toMatchObject({ slot: 3, layer: 0, salvage: 0 });
  });

  it('notes the day a pilot last started a run, in its own slot', () => {
    chooseSlot(2);
    resolveActiveSlot();
    updateRecords({ newRun: true });
    const today = localDay(new Date());
    expect(pilotSummaries()[1].lastRun).toBe(today);
    expect(pilotSummaries()[0]).toBeNull();
    expect(lastFlownLabel(today, today)).toBe('Today');
    expect(lastFlownLabel('2026-11-12', today)).toBe('12 Nov');
    expect(lastFlownLabel(null, today)).toBe('—');
  });

  it("shows a pilot's full summary, an empty slot as a new pilot", () => {
    const summary = {
      layer: 4,
      sectorsWon: 1,
      sectors: 10,
      medals: 2,
      medalsTotal: 19,
      salvage: 60,
      lastRun: null,
    };
    const flying = pilotCardMarkup(summary, 1, true);
    expect(flying).toContain('is-active');
    expect(flying).toContain('Continue');
    for (const shown of ['Deepest layer', '1 / 10', '2 / 19', '60']) {
      expect(flying).toContain(shown);
    }
    expect(pilotCardMarkup(summary, 3, false)).toContain('>Fly<');
    const empty = pilotCardMarkup(null, 2, false);
    expect(empty).toContain('New pilot');
    expect(empty).toContain('story is told from the beginning');
  });

  it('offers Delete on a pilot only, and asks with Cancel first', () => {
    const summary = {
      layer: 4,
      sectorsWon: 1,
      sectors: 10,
      medals: 2,
      medalsTotal: 19,
      salvage: 60,
      lastRun: null,
    };
    expect(pilotCardMarkup(summary, 3, false)).toContain(
      'data-pilot-delete="3"'
    );
    expect(pilotCardMarkup(null, 2, false)).not.toContain('data-pilot-delete');
    const box = deleteConfirmMarkup(summary, 3);
    expect(box).toContain('Delete Pilot 3?');
    expect(box).toContain('1 sector won · 2 medals · 60 Salvage');
    expect(box).toContain('cannot be undone');
    expect(box.indexOf('data-confirm="cancel"')).toBeLessThan(
      box.indexOf('data-confirm="delete"')
    );
  });
});
