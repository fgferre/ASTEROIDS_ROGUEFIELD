import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlayerSystem from '../../src/modules/PlayerSystem.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { cleanupGlobalState, setupGlobalMocks } from '../__helpers__/setup.js';
import { SHIP_LINEAR_DAMPING } from '../../src/data/constants/physics.js';

// FIX-02 regression suite. Locks the velocity-envelope contract from CONTEXT D-10:
// (1) max-rank braking_system + continuous thrust => peak velocity within +/-2% of baseline.
// (2) thrust release => upgraded ship decays faster than baseline.
// (3) per-rank brakingDamping is monotonically increasing (sanity check on cumulative semantics).
//
// Concern 9 + D-23: surface determinism skips so they don't pass silently. For Phase 0 the
// velocity-envelope surface does NOT touch Math.random (the auto-damping branch is purely
// arithmetic on vx/vy projection), so MATH_RANDOM_LEAK_DETECTED is `false` and no skips
// are emitted. The gated console.warn is scaffolding for downstream Phase 5a re-enablement
// (INFRA-05) — if a future code path begins leaking Math.random into PlayerSystem.updateMovement,
// flip the flag and the warn surfaces the skip at file-load time (NOT inside an it.skip body
// because .skip bodies don't execute).
const MATH_RANDOM_LEAK_DETECTED = false;
if (MATH_RANDOM_LEAK_DETECTED) {
  // eslint-disable-next-line no-console
  console.warn(
    '[WARN] Determinism test skipped due to Math.random leak — see INFRA-05'
  );
}

const DELTA_TIME = 1 / 60;
const BURN_TICKS = 60;
const DECAY_TICKS = 60;
const BRAKING_RANKS = [1.3, 1.231, 1.25]; // cumulative => 1.30 * 1.231 * 1.25 ≈ 2.00

describe('PlayerSystem brake upgrade (FIX-02)', () => {
  beforeEach(() => {
    setupGlobalMocks();
  });

  afterEach(() => {
    cleanupGlobalState();
  });

  function makePlayer() {
    const eventBus = createEventBusMock();
    const input = {
      getMovementInput: vi.fn(() => ({
        up: false,
        down: false,
        left: false,
        right: false,
      })),
    };
    const player = new PlayerSystem({
      eventBus,
      input,
      'command-queue': null,
    });
    // Reset to a clean starting state — PlayerSystem constructor sets defaults
    // but other test cases below mutate position/velocity directly, so we
    // normalize here for clarity.
    player.position = { x: 400, y: 300 };
    player.velocity = { vx: 0, vy: 0 };
    player.angle = 0;
    player.angularVelocity = 0;
    player.driftFactor = 0;
    return { player, eventBus };
  }

  function applyBrakingRanks(eventBus, multipliers) {
    multipliers.forEach((m) => {
      eventBus.emit('upgrade-linear-damping', { multiplier: m });
    });
  }

  function runBurn(player, ticks, input) {
    let peak = 0;
    for (let i = 0; i < ticks; i += 1) {
      player.updateMovement(DELTA_TIME, input);
      player.updatePosition(DELTA_TIME);
      const speed = Math.hypot(player.velocity.vx, player.velocity.vy);
      if (speed > peak) peak = speed;
    }
    return peak;
  }

  function runDecay(player, ticks) {
    const idleInput = {
      up: false,
      down: false,
      left: false,
      right: false,
    };
    for (let i = 0; i < ticks; i += 1) {
      player.updateMovement(DELTA_TIME, idleInput);
      player.updatePosition(DELTA_TIME);
    }
    return Math.hypot(player.velocity.vx, player.velocity.vy);
  }

  it('max-rank braking_system keeps peak thrust velocity within +/-2% of baseline', () => {
    const thrustInput = {
      up: true,
      down: false,
      left: false,
      right: false,
    };

    const { player: baseline } = makePlayer();
    const baselineMax = runBurn(baseline, BURN_TICKS, thrustInput);

    const { player: upgraded, eventBus: upgradedBus } = makePlayer();
    applyBrakingRanks(upgradedBus, BRAKING_RANKS);
    const upgradedMax = runBurn(upgraded, BURN_TICKS, thrustInput);

    expect(baselineMax).toBeGreaterThan(0);
    expect(upgradedMax).toBeGreaterThan(0);
    const relativeDelta = Math.abs(upgradedMax - baselineMax) / baselineMax;
    expect(relativeDelta).toBeLessThanOrEqual(0.02);
  });

  it('max-rank braking_system decays faster than baseline after thrust release', () => {
    const thrustInput = {
      up: true,
      down: false,
      left: false,
      right: false,
    };

    const { player: baseline } = makePlayer();
    runBurn(baseline, BURN_TICKS, thrustInput);
    const baselineFinalSpeed = runDecay(baseline, DECAY_TICKS);

    const { player: upgraded, eventBus: upgradedBus } = makePlayer();
    applyBrakingRanks(upgradedBus, BRAKING_RANKS);
    runBurn(upgraded, BURN_TICKS, thrustInput);
    const upgradedFinalSpeed = runDecay(upgraded, DECAY_TICKS);

    expect(upgradedFinalSpeed).toBeLessThan(baselineFinalSpeed);
  });

  it('braking damping increases monotonically across ranks 1, 2, 3', () => {
    const { player: r1Player, eventBus: r1Bus } = makePlayer();
    applyBrakingRanks(r1Bus, BRAKING_RANKS.slice(0, 1));
    const r1 = r1Player.brakingDamping;

    const { player: r2Player, eventBus: r2Bus } = makePlayer();
    applyBrakingRanks(r2Bus, BRAKING_RANKS.slice(0, 2));
    const r2 = r2Player.brakingDamping;

    const { player: r3Player, eventBus: r3Bus } = makePlayer();
    applyBrakingRanks(r3Bus, BRAKING_RANKS.slice(0, 3));
    const r3 = r3Player.brakingDamping;

    expect(r1).toBeGreaterThan(0);
    expect(r2).toBeGreaterThan(r1);
    expect(r3).toBeGreaterThan(r2);

    // Sanity: cumulative total at rank 3 matches the catalog's stated 2.00x effective
    // damping during stops. brakingDamping is the additive component above the base.
    const expectedTotalR3 = SHIP_LINEAR_DAMPING * 1.3 * 1.231 * 1.25;
    const actualTotalR3 = SHIP_LINEAR_DAMPING + r3;
    expect(actualTotalR3).toBeCloseTo(expectedTotalR3, 6);
  });
});
