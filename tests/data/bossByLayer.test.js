import { describe, expect, it } from 'vitest';

import {
  BOSS_BY_LAYER,
  BOSS_KINDS,
  SENTINEL_KINDS,
  WARDEN_KINDS,
  bossKindForLayer,
  bossTier,
} from '../../src/data/enemies/boss.js';
import { ELITE_EXCLUDED_TYPES } from '../../src/data/enemies/elite.js';
import { BOSS_RUSH_LAYERS } from '../../src/data/layers.js';
import {
  WARDEN_CLASSES,
  wardenFactoryKey,
} from '../../src/modules/enemies/types/wardens.js';

describe('BOSS_BY_LAYER', () => {
  it('puts Prime at 5, Choir at 10 and Null at 15', () => {
    expect(BOSS_BY_LAYER).toEqual({ 5: 'prime', 10: 'choir', 15: 'null' });
    expect([5, 10, 15].map(bossKindForLayer)).toEqual([
      'prime',
      'choir',
      'null',
    ]);
  });

  it('cycles past the table and maps each kind to its factory key', () => {
    expect([20, 25, 30].map(bossKindForLayer)).toEqual([
      'prime',
      'choir',
      'null',
    ]);
    expect(['prime', 'choir', 'null'].map(wardenFactoryKey)).toEqual([
      'boss',
      'boss-choir',
      'boss-null',
    ]);
  });

  it('registers the Sentinels by kind, outside the Warden table and cycle', () => {
    expect(Object.keys(SENTINEL_KINDS)).toEqual([
      'quarry-maw',
      'gatekeeper',
      'kiln-engine',
      'prism-crown',
      'foundry-mother',
      'interdictor',
      'sovereign',
    ]);
    expect(BOSS_KINDS['quarry-maw']).toBe(SENTINEL_KINDS['quarry-maw']);
    expect(WARDEN_KINDS['quarry-maw']).toBeUndefined();
    expect(bossTier('quarry-maw')).toBe('sentinel');
    expect(bossTier('prime')).toBe('warden');
    expect(wardenFactoryKey('quarry-maw')).toBe('boss-quarry-maw');
    expect(WARDEN_CLASSES['quarry-maw'].name).toBe('SentinelQuarryMaw');
    expect(WARDEN_KINDS.gatekeeper).toBeUndefined();
    expect(bossTier('gatekeeper')).toBe('sentinel');
    expect(wardenFactoryKey('gatekeeper')).toBe('boss-gatekeeper');
    expect(WARDEN_CLASSES.gatekeeper.name).toBe('SentinelGatekeeper');
    expect(WARDEN_KINDS['kiln-engine']).toBeUndefined();
    expect(bossTier('kiln-engine')).toBe('sentinel');
    expect(wardenFactoryKey('kiln-engine')).toBe('boss-kiln-engine');
    expect(WARDEN_CLASSES['kiln-engine'].name).toBe('SentinelKilnEngine');
    expect(WARDEN_KINDS['prism-crown']).toBeUndefined();
    expect(bossTier('prism-crown')).toBe('sentinel');
    expect(wardenFactoryKey('prism-crown')).toBe('boss-prism-crown');
    expect(WARDEN_CLASSES['prism-crown'].name).toBe('SentinelPrismCrown');
    expect(WARDEN_KINDS['foundry-mother']).toBeUndefined();
    expect(bossTier('foundry-mother')).toBe('sentinel');
    expect(wardenFactoryKey('foundry-mother')).toBe('boss-foundry-mother');
    expect(WARDEN_CLASSES['foundry-mother'].name).toBe('SentinelFoundryMother');
    expect(WARDEN_KINDS.interdictor).toBeUndefined();
    expect(bossTier('interdictor')).toBe('sentinel');
    expect(wardenFactoryKey('interdictor')).toBe('boss-interdictor');
    expect(WARDEN_CLASSES.interdictor.name).toBe('SentinelInterdictor');
    expect(WARDEN_KINDS.sovereign).toBeUndefined();
    expect(bossTier('sovereign')).toBe('sovereign');
    expect(wardenFactoryKey('sovereign')).toBe('boss-sovereign');
    expect(WARDEN_CLASSES.sovereign.name).toBe('Sovereign');
    expect(ELITE_EXCLUDED_TYPES).toEqual(
      expect.arrayContaining([
        'boss-quarry-maw',
        'boss-gatekeeper',
        'boss-kiln-engine',
        'boss-prism-crown',
        'boss-foundry-mother',
        'boss-interdictor',
        'boss-sovereign',
      ])
    );

    const layers = Array.from({ length: 60 }, (_, i) => i + 1);
    const kinds = new Set(
      [...layers, ...BOSS_RUSH_LAYERS].map(bossKindForLayer)
    );
    expect([...kinds].sort()).toEqual(['choir', 'null', 'prime']);
  });
});
