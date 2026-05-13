/**
 * INFRA-01 — In-Browser Performance Profile Harness (Phase 1, Plan 01.02).
 *
 * Activates on the `?profile=<scenario>` URL flag and captures real
 * requestAnimationFrame frame budgets through the existing PerformanceMonitor
 * singleton. Four scenarios are accepted (CONTEXT D-10):
 *
 *   - cold-open   — Wave 1, 0 upgrades, 30s
 *   - mid-game    — Wave 5, 7 upgrades, 60s
 *   - boss-arena  — boss wave, 7 upgrades, up to 90s (or bossKilled exit)
 *   - late-stress — Wave 10, 15 upgrades, 60s
 *
 * On activation the harness mutates `gameState.randomSeed = 0xB45E` and
 * `gameState.randomSeedSource = 'profile-harness'` BEFORE init() runs so
 * the scripted scenario is reproducible (CONTEXT D-09). It then defers a
 * driver via setTimeout so the synchronous DOMContentLoaded chain (mobile
 * guard → devStatsPanel → harness → init) can complete and bootstrap can
 * populate live services first. The deferred driver:
 *
 *   1. enables PerformanceMonitor auto-logging at 1000ms cadence (real-frame
 *      capture per D-09 step 4),
 *   2. dynamically imports the test-only scriptedPlayer helper via
 *      `await import('../../tests/__helpers__/scriptedPlayer.js')` — STATIC
 *      import is FORBIDDEN here because Vite would otherwise statically pull
 *      a test-only helper into the production bundle. The dynamic-only form
 *      is the contract enforced by CONTEXT D-09,
 *   3. polls briefly for live game services (window-exposed in DEV_MODE; in
 *      release-style boots the harness gracefully captures real frames driven
 *      by the developer manually — the auto-log still records the truth),
 *   4. runs the scripted driver for the scenario duration (or boss-killed
 *      exit on boss-arena),
 *   5. calls `performanceMonitor.downloadLogs(\`profile-<scenario>-<ISO>.json\`)`
 *      and paints a one-line on-canvas overlay so the developer knows the
 *      capture is on disk.
 *
 * Per CONTEXT D-08 the existing `scripts/benchmarks/performance-baseline.js`
 * Node bench is NOT replaced — it's a synthetic micro-bench. INFRA-01's
 * baseline IS this in-browser harness output.
 *
 * Per CONTEXT D-46 / D-47: no new npm dependencies; no console.log in
 * production paths (debugLog only, gated to dev).
 *
 * The harness is autonomous-mode-safe (CLAUDE.md "calibration plans need
 * human-in-the-loop" rule does NOT apply): it MEASURES, it does not
 * CALIBRATE. The synthesized doc's PASS/FLAG/FAIL bands are ADVISORY
 * baselines per CONTEXT D-11 — Phase 6b promotes them into gate values.
 */

import { debugLog } from '../core/debugLogging.js';

// CONTEXT D-09: deterministic seed forced across all scenarios.
const PROFILE_HARNESS_SEED = 0xb45e;

// CONTEXT D-10: scenario inventory. `wave: 'boss'` is the sentinel that
// triggers boss-wave force-advance; numeric values name an explicit wave.
const SCENARIOS = Object.freeze({
  'cold-open': { wave: 1, upgrades: 0, durationSec: 30 },
  'mid-game': { wave: 5, upgrades: 7, durationSec: 60 },
  'boss-arena': { wave: 'boss', upgrades: 7, durationSec: 90 },
  'late-stress': { wave: 10, upgrades: 15, durationSec: 60 },
});

const SCENARIO_NAMES = Object.keys(SCENARIOS);

// Cap services-poll attempts so a release-style boot (no DEV_MODE singleton
// exposure on window) doesn't spin forever. At 250ms × 40 = 10s wall-clock,
// which is the realistic upper-bound for first paint + bootstrap completion.
const SERVICES_POLL_INTERVAL_MS = 250;
const SERVICES_POLL_MAX_ATTEMPTS = 40;

// Driver tick cadence. 60Hz aligns with the existing scriptedPlayer helper
// (its FIRE_INTERVAL_TICKS is denominated in 60fps ticks per Phase 0
// FIX-04 calibration in tests/__helpers__/scriptedPlayer.js).
const DRIVER_TICK_DT = 1 / 60;
const DRIVER_TICK_MS = (1000 / 60).toFixed(2); // ~16.67ms

// Reasonable upgrade IDs the harness rotates through when forcing
// progression state. Read from src/data/upgrades/*.js — these are guaranteed
// real IDs at this commit. The Discretion-clause choice (Task 1 step 6):
// fill the appliedUpgrades Map directly rather than introduce a new prod-path
// API on ProgressionSystem per CONTEXT D-49.
const HARNESS_UPGRADE_IDS = Object.freeze([
  'plasma',
  'multishot',
  'targeting_suite',
  'shield',
  'deflector_shield',
  'propulsors',
  'rcs_system',
  'braking_system',
  'magfield',
]);

/**
 * Parses the `?profile=<scenario>` URL flag. Returns the scenario name when
 * it matches the whitelist, null otherwise. Mirrors the URL-flag detection
 * shape in `src/core/debugLogging.js` (CONTEXT pattern).
 */
function getScenarioFromURL() {
  if (typeof window === 'undefined' || !window.location) {
    return null;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('profile')) {
      return null;
    }

    const value = params.get('profile');
    if (SCENARIO_NAMES.includes(value)) {
      return value;
    }

    debugLog(
      `[profileHarness] Unknown scenario "${value}"; ignoring (valid: ${SCENARIO_NAMES.join(', ')})`
    );
    return null;
  } catch (error) {
    console.warn('[profileHarness] Failed to parse ?profile flag:', error);
    return null;
  }
}

/**
 * Returns the YYYY-MM-DD slice of today's ISO timestamp.
 */
function isoDate() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Force-injects `targetCount` upgrade entries into a live ProgressionSystem.
 * Stacks ranks on the first IDs when targetCount exceeds the helper pool.
 * Per CONTEXT D-49 this mutates `progressionService.appliedUpgrades` (a Map)
 * directly rather than adding a new prod-path helper.
 */
function forceProgressionUpgrades(progressionService, targetCount) {
  if (!progressionService || targetCount <= 0) return;
  const applied =
    progressionService.appliedUpgrades instanceof Map
      ? progressionService.appliedUpgrades
      : null;
  if (!applied) {
    debugLog(
      '[profileHarness] progression.appliedUpgrades is not a Map — skipping upgrade force'
    );
    return;
  }
  for (let i = 0; i < targetCount; i++) {
    const id = HARNESS_UPGRADE_IDS[i % HARNESS_UPGRADE_IDS.length];
    const currentRank = applied.get(id) || 0;
    applied.set(id, currentRank + 1);
  }
  debugLog(
    `[profileHarness] Forced ${targetCount} upgrade entries on progression (${applied.size} unique IDs)`
  );
}

/**
 * Force-advances the wave counter on a WaveManager-shaped service. The exact
 * field is `currentWave`; `wave: 'boss'` advances to the next multiple of
 * `WAVE_BOSS_INTERVAL` (5 per `src/data/constants/gameplay.js:248`). Failures
 * are debug-logged, not thrown — the harness still measures real frames.
 */
function forceWaveNumber(enemiesService, requestedWave) {
  if (!enemiesService) return;
  const waveManager = enemiesService.waveManager;
  if (!waveManager) {
    debugLog('[profileHarness] enemies.waveManager unavailable — skipping wave force');
    return;
  }
  const numericWave =
    requestedWave === 'boss' ? 5 : Number.isFinite(requestedWave) ? requestedWave : 1;
  try {
    // Mutate the field directly. If a future refactor adds a setter, the
    // field assignment still works because Object property writes call the
    // setter transparently.
    waveManager.currentWave = numericWave;
    debugLog(`[profileHarness] Forced wave currentWave=${numericWave}`);
  } catch (error) {
    debugLog('[profileHarness] Failed to force wave number:', error);
  }
}

/**
 * Paints a single-line completion overlay on the game canvas. Best-effort —
 * silently no-ops if Canvas2D is unavailable.
 */
function paintCompletionOverlay(scenario, filename) {
  if (typeof document === 'undefined') return;
  try {
    const canvas = document.getElementById('game-canvas');
    if (!canvas || typeof canvas.getContext !== 'function') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const text = `scenario complete — ${filename}`;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width || 800, 28);
    ctx.fillStyle = '#0f0';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, (canvas.width || 800) / 2, 14);
  } catch (error) {
    debugLog('[profileHarness] Could not paint completion overlay:', error);
  }
}

/**
 * Polls `window` for the live game-services map exposed by DEV_MODE bootstrap.
 * Returns the services object or null after `SERVICES_POLL_MAX_ATTEMPTS`.
 * The scripted-player driver runs only when services are accessible; the
 * auto-log capture runs regardless (real-frame data is still gathered when
 * the developer drives the game manually).
 */
function pollForGameServices() {
  return new Promise((resolve) => {
    let attempts = 0;
    const tick = () => {
      attempts += 1;
      const candidate =
        (typeof window !== 'undefined' &&
          (window.__gameSystemServices || window.gameSystemServices)) ||
        null;
      if (candidate) {
        resolve(candidate);
        return;
      }
      if (attempts >= SERVICES_POLL_MAX_ATTEMPTS) {
        resolve(null);
        return;
      }
      setTimeout(tick, SERVICES_POLL_INTERVAL_MS);
    };
    setTimeout(tick, SERVICES_POLL_INTERVAL_MS);
  });
}

/**
 * Runs the scripted-player driver for `durationSec` simulated seconds, or
 * until `driver.bossKilled === true` for boss-arena. Uses setInterval at
 * 60Hz cadence. Resolves when the timer or kill condition trips.
 */
function runScenarioDriver(driver, scenario, durationSec) {
  return new Promise((resolve) => {
    let simulatedSeconds = 0;
    const intervalId = setInterval(() => {
      try {
        driver.update(DRIVER_TICK_DT);
      } catch (error) {
        debugLog('[profileHarness] driver.update threw:', error);
      }
      simulatedSeconds += DRIVER_TICK_DT;
      const bossExit = scenario === 'boss-arena' && driver.bossKilled;
      if (simulatedSeconds >= durationSec || bossExit) {
        clearInterval(intervalId);
        resolve();
      }
    }, Number(DRIVER_TICK_MS));
  });
}

/**
 * Public entry point. Called from src/app.js after initializeDevStatsPanel()
 * and BEFORE init(). Mutates `gameState.randomSeed` synchronously when
 * activated so the downstream GameSessionService.deriveInitialSeed() picks
 * up the harness seed (CONTEXT D-09 integration point).
 *
 * @param {{ gameState: object, performanceMonitor: object }} deps
 * @returns {{ active: boolean, scenario?: string }}
 */
export function activateProfileHarness({ gameState, performanceMonitor } = {}) {
  const scenario = getScenarioFromURL();
  if (!scenario) {
    return { active: false };
  }
  if (!gameState || !performanceMonitor) {
    debugLog(
      '[profileHarness] Missing gameState or performanceMonitor — refusing to activate'
    );
    return { active: false };
  }

  gameState.randomSeed = PROFILE_HARNESS_SEED;
  gameState.randomSeedSource = 'profile-harness';
  debugLog(
    `[profileHarness] Activating scenario "${scenario}"; seed=0x${PROFILE_HARNESS_SEED.toString(16).toUpperCase()}`
  );

  const config = SCENARIOS[scenario];

  // Defer the scenario driver past the synchronous return so init() can
  // run first and populate bootstrapped services. setTimeout(..., 0) yields
  // the current macrotask before scheduling the deferred work.
  setTimeout(() => {
    void runDeferredScenario({
      scenario,
      config,
      performanceMonitor,
    });
  }, 0);

  return { active: true, scenario };
}

/**
 * Deferred scenario orchestration. Separated from `activateProfileHarness`
 * so its async path doesn't affect the synchronous return shape (which
 * src/app.js wiring depends on).
 */
async function runDeferredScenario({ scenario, config, performanceMonitor }) {
  try {
    performanceMonitor.enableAutoLog(1000);
    debugLog(
      `[profileHarness] Auto-log enabled at 1000ms cadence; awaiting scenario "${scenario}"`
    );

    const services = await pollForGameServices();
    let driver = null;

    if (services) {
      try {
        // DYNAMIC import per CONTEXT D-09 — Vite's production tree-shaker
        // will not statically pull this path into release bundles.
        const { createScriptedPlayer } = await import(
          '../../tests/__helpers__/scriptedPlayer.js'
        );

        const player =
          services['player'] || services.player || null;
        const combat =
          services['combat'] || services.combat || null;
        const enemies =
          services['enemies'] || services.enemies || null;
        const progression =
          services['progression'] || services.progression || null;

        forceProgressionUpgrades(progression, config.upgrades);
        forceWaveNumber(enemies, config.wave);

        if (player && combat) {
          driver = createScriptedPlayer({ player, combat, enemies });
          debugLog(
            `[profileHarness] Scripted driver constructed for "${scenario}"`
          );
        } else {
          debugLog(
            '[profileHarness] player/combat unavailable — auto-log will capture developer-driven frames only'
          );
        }
      } catch (error) {
        debugLog(
          '[profileHarness] scriptedPlayer dynamic import / driver construction failed:',
          error
        );
      }
    } else {
      debugLog(
        '[profileHarness] No services exposed on window — auto-log will capture developer-driven frames only'
      );
    }

    if (driver) {
      await runScenarioDriver(driver, scenario, config.durationSec);
    } else {
      // No driver: still hold for the scenario duration so the auto-log
      // captures the full target window. The developer can play manually
      // during this period; the PerformanceMonitor records real frames.
      await new Promise((resolve) =>
        setTimeout(resolve, config.durationSec * 1000)
      );
    }

    const filename = `profile-${scenario}-${isoDate()}.json`;
    try {
      performanceMonitor.downloadLogs(filename);
      debugLog(`[profileHarness] Downloaded ${filename}`);
    } catch (error) {
      debugLog('[profileHarness] downloadLogs failed:', error);
    }
    paintCompletionOverlay(scenario, filename);
  } catch (error) {
    console.warn('[profileHarness] Deferred scenario failed:', error);
  }
}
