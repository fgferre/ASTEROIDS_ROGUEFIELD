import { BossEnemy } from './BossEnemy.js';
import { WardenChoir } from './WardenChoir.js';
import { WardenNull } from './WardenNull.js';

// Warden class per `bossKind` (src/data/enemies/boss.js WARDEN_KINDS) and the
// factory key EnemySystem registers it under. Every one keeps type 'boss'.
export const WARDEN_CLASSES = Object.freeze({
  prime: BossEnemy,
  choir: WardenChoir,
  null: WardenNull,
});

export function wardenFactoryKey(kind) {
  return kind && kind !== 'prime' && WARDEN_CLASSES[kind]
    ? `boss-${kind}`
    : 'boss';
}
