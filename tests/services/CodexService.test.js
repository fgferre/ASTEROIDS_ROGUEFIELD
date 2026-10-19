import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/EventBus.js';
import { installDomStubs } from '../__helpers__/headlessGame.js';
import Mine from '../../src/modules/enemies/types/Mine.js';
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

  it('does not count a Tether that detonates itself as destroyed', () => {
    const eventBus = new EventBus();
    const codex = new CodexService({ eventBus });
    const spawnMine = () =>
      new Mine({ eventBus }, { id: 'mine-1', x: 0, y: 0 });

    const timedOut = spawnMine();
    timedOut.onUpdate(timedOut.lifetime + 1);
    expect(timedOut.alive).toBe(false);

    const sprung = spawnMine();
    sprung.armed = true;
    sprung.system.getCachedPlayer = () => ({ position: { x: 10, y: 0 } });
    sprung.onUpdate(0.016);
    expect(sprung.alive).toBe(false);

    expect(seenOf(codex, 'mine')).toEqual({ firstLayer: 1, kills: 0 });

    spawnMine().takeDamage(1000, { type: 'player', cause: 'damage' });
    expect(seenOf(codex, 'mine')).toEqual({ firstLayer: 1, kills: 1 });
  });

  it('meets a support machine when it arrives, before any kill', () => {
    const eventBus = new EventBus();
    const codex = new CodexService({ eventBus });
    const discovered = [];
    eventBus.on('codex-discovered', (payload) => discovered.push(payload.type));

    eventBus.emit('wave-started', { wave: 6 });
    eventBus.emit('machine-spawned', { enemy: { type: 'caster' } });
    eventBus.emit('machine-spawned', { enemy: { type: 'caster' } });

    expect(seenOf(codex, 'caster')).toEqual({ firstLayer: 6, kills: 0 });
    expect(discovered).toEqual(['caster']);
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

  it('sees each Herald by its kind when it appears and counts its defeats', () => {
    const eventBus = new EventBus();
    const codex = new CodexService({ eventBus });
    eventBus.emit('wave-started', { wave: 8 });
    eventBus.emit('herald-spawned', { kind: 'heat' });
    eventBus.emit('enemy-destroyed', {
      enemy: { type: 'herald', heraldKind: 'heat' },
    });

    expect(seenOf(codex, 'herald-heat')).toEqual({ firstLayer: 8, kills: 1 });
    expect(seenOf(codex, 'herald-dust')).toBeNull();
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
