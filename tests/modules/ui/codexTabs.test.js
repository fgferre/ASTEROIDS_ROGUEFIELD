import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '../../../src/core/EventBus.js';
import { installDomStubs } from '../../__helpers__/headlessGame.js';
import AchievementService, {
  ACHIEVEMENTS_STORAGE_KEY,
} from '../../../src/services/AchievementService.js';
import CodexService from '../../../src/services/CodexService.js';
import {
  adjacentCodexTab,
  codexTabView,
} from '../../../src/modules/ui/codexTabs.js';

describe('Codex tabs', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => restoreDom());

  const entriesOf = () => ({
    enemies: new CodexService({ eventBus: new EventBus() }).getEntries(),
    achievements: new AchievementService({
      eventBus: new EventBus(),
    }).getEntries(),
  });

  it('switches between the two tabs with either arrow', () => {
    expect(adjacentCodexTab('enemies', 1)).toBe('achievements');
    expect(adjacentCodexTab('enemies', -1)).toBe('achievements');
    expect(adjacentCodexTab('achievements', 1)).toBe('enemies');
  });

  it('renders the thirteen achievements, locked ones greyed, with progress or date', () => {
    localStorage.setItem(
      ACHIEVEMENTS_STORAGE_KEY,
      JSON.stringify({
        unlocked: { 'ring-breaker': '2026-10-18T12:00:00.000Z' },
        progress: { 'elite-hunter': 7 },
      })
    );
    const view = codexTabView('achievements', entriesOf());
    const cards = view.markup.match(/<li [^>]*>/g);

    expect(cards).toHaveLength(13);
    expect(cards.filter((card) => card.includes('is-locked'))).toHaveLength(12);
    expect(view.markup).toMatch(
      /is-unlocked" data-achievement="ring-breaker"[\s\S]*?Unlocked 18 Oct 2026/
    );
    expect(view.markup).toContain('7 / 25');
    expect(view.count).toBe('1 / 13 unlocked');
  });

  it('keeps the enemy list on the Enemies tab', () => {
    const entries = entriesOf();
    const view = codexTabView('enemies', entries);
    expect(view.markup.match(/<li /g)).toHaveLength(entries.enemies.length);
    expect(view.markup).not.toContain('achievement-card');
  });
});
