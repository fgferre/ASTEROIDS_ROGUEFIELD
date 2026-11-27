import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HULL_LEFT, openFinalDoor } from '../../src/bootstrap/finalDoor.js';
import { runModeFor } from '../../src/core/runMode.js';

describe('the final door (?final=1)', () => {
  let classes;

  beforeEach(() => {
    vi.useFakeTimers();
    // The test environment is node: the page past the loading, the menu open.
    classes = {
      'loading-screen': new Set(['hidden']),
      'menu-screen': new Set(),
    };
    vi.stubGlobal('document', {
      getElementById: (id) => ({
        classList: { contains: (name) => classes[id].has(name) },
      }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function setup() {
    const listeners = {};
    const active = [];
    const started = [];
    const enemies = {
      waveManager: { currentWave: 15 },
      getActiveEnemies: () => active,
    };
    const services = {
      enemies,
      // the session settles the run's mode as it starts
      'game-session': {
        startNewRun(options) {
          started.push(options);
          this.mode = runModeFor(options);
        },
      },
      'event-bus': { on: (name, fn) => (listeners[name] = fn) },
    };
    // behind its shells the boss takes half of what a hit asks
    const boss = {
      bossKind: 'sovereign',
      health: 1000,
      armor: 4,
      arrival: { progress: 0 },
      invulnerable: false,
      shells: true,
      takeDamage(amount) {
        if (this.invulnerable) return;
        this.health -= (amount - this.armor) * (this.shells ? 0.5 : 1);
      },
    };
    return {
      services,
      enemies,
      active,
      started,
      boss,
      emit: (name, payload) => listeners[name](payload),
    };
  }

  it('waits for the loading, the start gate and the pilots', async () => {
    const { services, started } = setup();
    // boot: the menu sits open under the loading screen
    classes['loading-screen'].delete('hidden');
    void openFinalDoor({ getServices: () => services });
    await vi.advanceTimersByTimeAsync(60000);
    // loaded: the start gate, the menu's panels out of sight
    classes['menu-screen'].add('menu-screen--gated');
    await vi.advanceTimersByTimeAsync(60000);
    // the gate passed: the pilots, over the still-gated menu
    classes['loading-screen'].add('hidden');
    await vi.advanceTimersByTimeAsync(60000);
    expect(started).toEqual([]);

    classes['menu-screen'].delete('menu-screen--gated');
    await vi.advanceTimersByTimeAsync(100);
    expect(started).toHaveLength(1);
  });

  it("starts the last sector's own run, its head start still to pick, the boss's layer next", async () => {
    const { services, enemies, started } = setup();
    await openFinalDoor({ getServices: () => services });

    expect(started).toEqual([{ source: 'final-door', sector: 'the-crucible' }]);
    // the head start's last pick starts the layer after this one: the last
    expect(enemies.waveManager.currentWave).toBe(19);
  });

  it('leaves the boss its entrance, then brings it one hit from down through its own damage, as it lets itself be hurt', async () => {
    const { services, active, boss } = setup();
    await openFinalDoor({ getServices: () => services });

    vi.advanceTimersByTime(500);
    active.push({ bossKind: 'warden', takeDamage: vi.fn() }, boss);
    vi.advanceTimersByTime(500);
    expect(boss.health).toBe(1000); // still arriving
    boss.arrival = null;
    vi.advanceTimersByTime(100);
    expect(boss.health).toBe(500.5); // half of the hit, behind its shells
    boss.invulnerable = true; // it closes up
    vi.advanceTimersByTime(3000);
    expect(boss.health).toBe(500.5);
    boss.invulnerable = false;
    boss.shells = false;
    vi.advanceTimersByTime(100);
    expect(boss.health).toBe(HULL_LEFT);
    expect(active[0].takeDamage).not.toHaveBeenCalled();

    // the rest is the pilot's: the door does not touch it again
    vi.advanceTimersByTime(100);
    boss.health = 1000;
    vi.advanceTimersByTime(1000);
    expect(boss.health).toBe(1000);
  });

  it('lets go when the run ends before the boss came', async () => {
    const { services, active, boss, emit } = setup();
    await openFinalDoor({ getServices: () => services });

    emit('session-state-changed', { state: 'player-died' });
    boss.arrival = null;
    active.push(boss);
    vi.advanceTimersByTime(1000);
    expect(boss.health).toBe(1000);
  });
});
