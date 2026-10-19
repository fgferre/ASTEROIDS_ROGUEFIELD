import { describe, expect, it, vi } from 'vitest';

import { getContent } from '../../../src/content/registry.js';
import { CASTER_SHELL_RADIUS } from '../../../src/content/enemies/caster.js';
import { TYPE_CLASSES } from '../../../src/modules/enemies/base/enemyTypeRegistry.js';
import { EnemyDamageSystem } from '../../../src/modules/enemies/systems/EnemyDamageSystem.js';

const Caster = TYPE_CLASSES.caster;
const {
  interval: CASTER_FIRE_INTERVAL,
  lead: CASTER_LEAD_SECONDS,
  damage: CASTER_SHELL_DAMAGE,
  flight: CASTER_SHELL_FLIGHT,
  telegraph: CASTER_TELEGRAPH_SECONDS,
} = getContent('enemies', 'caster').behaviors['lob-shell'];

const setup = (playerAt) => {
  const player = {
    position: { ...playerAt },
    velocity: { vx: 0, vy: 0 },
    getVelocity: () => player.velocity,
    takeDamage: vi.fn(() => 80),
  };
  const eventBus = { emit: vi.fn() };
  const damage = new EnemyDamageSystem({
    facade: {
      eventBus,
      getCachedPlayer: () => player,
      getPlayerPositionSnapshot: (p) => p.position,
    },
  });
  const caster = new Caster(
    {
      eventBus,
      getCachedPlayer: () => player,
      applyDirectDamageToPlayer: (amount, context) =>
        damage.applyDirectDamageToPlayer(amount, context),
    },
    { id: 'caster-1', x: 100, y: 300 }
  );
  return { player, eventBus, caster };
};

describe('Caster', () => {
  it('holds its range: closes in from afar, backs off when crowded', () => {
    const { player, caster } = setup({ x: 700, y: 300 });
    caster.onUpdate(1 / 60);
    expect(caster.vx).toBeGreaterThan(0);
    player.position.x = 250;
    caster.onUpdate(1 / 60);
    expect(caster.vx).toBeLessThan(0);
    player.position.x = 430;
    caster.onUpdate(1 / 60);
    expect(caster.vx).toBe(0);
  });

  it('lobs a shell ahead of the ship that lands after its flight and hurts the ship inside the blast only', () => {
    const lob = (landingOffset) => {
      const { player, eventBus, caster } = setup({ x: 430, y: 300 });
      player.velocity = { vx: 100, vy: 0 };
      caster.onUpdate(CASTER_FIRE_INTERVAL - 0.01);
      expect(caster.telegraphRatio).toBeGreaterThan(0.9);
      caster.onUpdate(0.02);
      const landing = 430 + 100 * CASTER_LEAD_SECONDS;
      expect(caster.shell).toMatchObject({ x: landing, y: 300 });

      player.velocity = { vx: 0, vy: 0 };
      player.position.x = landing + landingOffset;
      caster.onUpdate(CASTER_SHELL_FLIGHT - 0.05);
      expect(player.takeDamage).not.toHaveBeenCalled();
      caster.onUpdate(0.1);
      expect(caster.shell).toBeNull();
      expect(caster.scorch).toBeUndefined(); // nothing left on the field
      expect(eventBus.emit).toHaveBeenCalledWith(
        'caster-shell-landed',
        expect.objectContaining({
          enemyId: 'caster-1',
          position: { x: landing, y: 300 },
          radius: CASTER_SHELL_RADIUS,
          damage: CASTER_SHELL_DAMAGE,
        })
      );
      expect(eventBus.emit).not.toHaveBeenCalledWith(
        'asteroid-volatile-exploded',
        expect.anything()
      );
      return player.takeDamage;
    };

    expect(lob(CASTER_SHELL_RADIUS - 20)).toHaveBeenCalledWith(
      CASTER_SHELL_DAMAGE,
      expect.any(Caster)
    );
    expect(lob(CASTER_SHELL_RADIUS + 20)).not.toHaveBeenCalled();
  });

  it('announces its telegraph once as it starts, then the shell it fires at the aim', () => {
    const { eventBus, caster } = setup({ x: 430, y: 300 });
    const sent = (name) =>
      eventBus.emit.mock.calls.filter(([event]) => event === name);

    caster.onUpdate(CASTER_FIRE_INTERVAL - CASTER_TELEGRAPH_SECONDS - 0.01);
    expect(sent('caster-telegraphed')).toHaveLength(0);
    caster.onUpdate(0.02);
    caster.onUpdate(0.2);
    expect(sent('caster-telegraphed')).toHaveLength(1);
    expect(sent('caster-telegraphed')[0][1]).toMatchObject({
      enemyId: 'caster-1',
      position: { x: 100, y: 300 },
      target: { x: 430, y: 300 },
    });
    expect(sent('caster-shell-fired')).toHaveLength(0);

    caster.onUpdate(CASTER_TELEGRAPH_SECONDS);
    expect(sent('caster-shell-fired')).toHaveLength(1);
    expect(sent('caster-shell-fired')[0][1]).toMatchObject({
      position: { x: 100, y: 300 },
      target: { x: 430, y: 300 },
    });
  });
});
