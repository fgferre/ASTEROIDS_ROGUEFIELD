// src/services/CodexService.js

import { CODEX_ENTRIES, codexIdOf } from '../data/codex.js';
import { loadJSON, saveJSON } from '../core/storage.js';

export const CODEX_STORAGE_KEY = 'roguefield:codex:v1';

const KNOWN_IDS = new Set(CODEX_ENTRIES.map((entry) => entry.id));

/**
 * Enemies met across runs: `seen[id] = { firstLayer, kills }`, kept in
 * localStorage. Support enemies emit no spawn event, so they are met when one
 * dies or when one kills the pilot; rocks on 'enemy-spawned', Wardens on
 * 'boss-spawned', Heralds (by kind) on 'herald-spawned'. A first meeting emits 'codex-discovered' { type }.
 */
export default class CodexService {
  constructor({ eventBus } = {}) {
    this.eventBus = eventBus;
    this.layer = 1;
    this.seen = loadJSON(CODEX_STORAGE_KEY)?.seen ?? {};

    eventBus.on('wave-started', (payload = {}) => {
      this.layer = Math.max(1, Math.floor(Number(payload.wave) || 1));
    });
    eventBus.on('enemy-spawned', (payload = {}) => this.record(payload.enemy));
    eventBus.on('boss-spawned', (payload = {}) => this.record(payload.enemy));
    eventBus.on('herald-spawned', (payload = {}) =>
      this.record({ type: 'herald', heraldKind: payload.kind })
    );
    eventBus.on('enemy-destroyed', (payload = {}) =>
      this.record(payload.enemy, { kill: true })
    );
    eventBus.on('player-died', (payload = {}) => {
      this.record(payload.killedBy);
      this.persist();
    });
    eventBus.on('wave-complete', () => this.persist());
  }

  record(entity, { kill = false } = {}) {
    const id = codexIdOf(entity);
    if (!KNOWN_IDS.has(id)) return;
    let entry = this.seen[id];
    if (!entry) {
      entry = { firstLayer: this.layer, kills: 0 };
      this.seen[id] = entry;
      this.persist();
      this.eventBus.emit('codex-discovered', { type: id });
    }
    if (kill) entry.kills += 1;
  }

  persist() {
    saveJSON(CODEX_STORAGE_KEY, { seen: this.seen });
  }

  /** Every codex entry in descent order, with `seen` (null if never met). */
  getEntries() {
    return CODEX_ENTRIES.map((entry) => ({
      ...entry,
      seen: this.seen[entry.id] ?? null,
    }));
  }
}
