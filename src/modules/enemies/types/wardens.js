import { BossEnemy } from './BossEnemy.js';
import { SentinelFoundryMother } from './SentinelFoundryMother.js';
import { SentinelGatekeeper } from './SentinelGatekeeper.js';
import { SentinelInterdictor } from './SentinelInterdictor.js';
import { SentinelKilnEngine } from './SentinelKilnEngine.js';
import { SentinelPrismCrown } from './SentinelPrismCrown.js';
import { SentinelQuarryMaw } from './SentinelQuarryMaw.js';
import { Sovereign } from './Sovereign.js';
import { WardenChoir } from './WardenChoir.js';
import { WardenNull } from './WardenNull.js';

// Boss class per `bossKind` (src/data/enemies/boss.js BOSS_KINDS: the Wardens,
// the Sentinels and Sovereign) and the factory key EnemySystem registers it
// under.
// Every one keeps type 'boss'.
export const WARDEN_CLASSES = Object.freeze({
  prime: BossEnemy,
  choir: WardenChoir,
  null: WardenNull,
  'quarry-maw': SentinelQuarryMaw,
  gatekeeper: SentinelGatekeeper,
  'kiln-engine': SentinelKilnEngine,
  'prism-crown': SentinelPrismCrown,
  'foundry-mother': SentinelFoundryMother,
  interdictor: SentinelInterdictor,
  sovereign: Sovereign,
});

export function wardenFactoryKey(kind) {
  return kind && kind !== 'prime' && WARDEN_CLASSES[kind]
    ? `boss-${kind}`
    : 'boss';
}
