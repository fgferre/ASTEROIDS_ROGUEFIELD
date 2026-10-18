import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/EventBus.js';
import { installDomStubs } from '../__helpers__/headlessGame.js';
import CodexService, {
  CODEX_STORAGE_KEY,
} from '../../src/services/CodexService.js';

describe('CodexService', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => restoreDom());

  const seenOf = (codex, id) =>
    codex.getEntries().find((entry) => entry.id === id).seen;

  it('records first contact by layer, counts kills and announces discoveries', () => {
    const eventBus = new EventBus();
    const codex = new CodexService({ eventBus });
    const discovered = [];
    eventBus.on('codex-discovered', (payload) => discovered.push(payload.type));

    eventBus.emit('wave-started', { wave: 8 });
    const ram = { type: 'ram', elite: true };
    eventBus.emit('enemy-destroyed', { enemy: ram });
    eventBus.emit('enemy-destroyed', { enemy: ram });

    expect(seenOf(codex, 'ram')).toEqual({ firstLayer: 8, kills: 2 });
    expect(seenOf(codex, 'weaver')).toBeNull();
    expect(discovered).toEqual(['ram']);
  });

  it('keeps each Warden by its kind', () => {
    const eventBus = new EventBus();
    const codex = new CodexService({ eventBus });
    eventBus.emit('wave-started', { wave: 10 });
    eventBus.emit('boss-spawned', {
      enemy: { type: 'boss', bossKind: 'choir' },
    });

    expect(seenOf(codex, 'warden-choir')).toEqual({ firstLayer: 10, kills: 0 });
    expect(seenOf(codex, 'warden-prime')).toBeNull();
  });

  it('persists through storage into the next session', () => {
    const eventBus = new EventBus();
    new CodexService({ eventBus });
    eventBus.emit('player-died', { killedBy: { type: 'hunter' } });
    expect(JSON.parse(localStorage.getItem(CODEX_STORAGE_KEY)).seen).toEqual({
      hunter: { firstLayer: 1, kills: 0 },
    });

    const next = new CodexService({ eventBus: new EventBus() });
    expect(seenOf(next, 'hunter')).toEqual({ firstLayer: 1, kills: 0 });
  });
});
