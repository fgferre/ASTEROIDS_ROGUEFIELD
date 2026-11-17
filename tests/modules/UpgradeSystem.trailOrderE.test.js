import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { setupGlobalMocks, cleanupGlobalState } from '../__helpers__/setup.js';

// The card catalog reads the address when it loads: each case loads it fresh.
async function load(search) {
  vi.resetModules();
  vi.stubGlobal('window', { location: { search } });
  const { default: ProgressionSystem } = await import(
    '../../src/modules/ProgressionSystem.js'
  );
  const { default: RandomService } = await import(
    '../../src/core/RandomService.js'
  );
  const ui = await import('../../src/modules/ui/upgradeCard.js');
  const progression = new ProgressionSystem({
    random: new RandomService(7),
    eventBus: createEventBusMock(),
    player: {},
    ui: {},
    effects: {},
    'xp-orbs': { attachProgression: () => {} },
  });
  return { progression, ui };
}

const trailIds = (progression, level) => {
  progression.level = level;
  return progression
    .prepareUpgradeOptions(3, { level })
    .options.map((option) => option.id)
    .filter((id) => progression.pilotCardIds.includes(id));
};

describe('?trilha=e, the Auto Turret alone in the trail slot from level 6', () => {
  beforeEach(() => setupGlobalMocks());
  afterEach(() => {
    cleanupGlobalState();
    vi.unstubAllGlobals();
  });

  it('level 2 offers the engine, and the turret is not eligible before level 6', async () => {
    const { progression } = await load('?trilha=e');
    expect(trailIds(progression, 2)).toEqual(['propulsors']);
    progression.applyUpgrade('propulsors');
    progression.level = 4;
    const turret = progression.upgradeLookup.get('auto_aim');
    expect(progression.isUpgradeSelectable(turret)).toBe(false);
    expect(trailIds(progression, 4)).not.toContain('auto_aim');
  });

  it('from level 6 the slot offers only the turret until it is held', async () => {
    const { progression } = await load('?trilha=e');
    progression.applyUpgrade('propulsors');
    for (const level of [6, 8, 10]) {
      expect(trailIds(progression, level)).toEqual(['auto_aim']);
    }
    progression.applyUpgrade('auto_aim');
    expect(trailIds(progression, 12)).not.toContain('auto_aim');
  });

  it('the trail cards show no rarity, other cards and other orders keep it', async () => {
    const face = (ui, progression, id) => {
      const state = ui.cardState(progression, id);
      return ui.cardMarkup(state.definition, state, {
        weapon: { weaponId: 'lance', chip: 'LANCE' },
      });
    };
    const e = await load('?trilha=e');
    expect(face(e.ui, e.progression, 'propulsors')).not.toContain('card__rar');
    expect(face(e.ui, e.progression, 'propulsors')).toContain('Trail · step');
    expect(face(e.ui, e.progression, 'plasma')).toContain('card__rar-name');
    const a = await load('');
    expect(face(a.ui, a.progression, 'propulsors')).toContain('card__rar-name');
  });

  it('the default order keeps the turret from level 1 data, not alone in the slot', async () => {
    const { progression } = await load('');
    progression.level = 6;
    expect(progression.trailSlotIds()).toEqual(
      expect.arrayContaining(['propulsors'])
    );
    expect(progression.trailOrder).toBe('a');
  });
});
