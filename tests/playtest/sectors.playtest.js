/**
 * Playtest: the bot (src/bootstrap/botPilot.js) flies sector runs headless
 * with a mortal ship, one life each, and prints a report per sector and a
 * summary table. Not part of `npm test`: run it with `npm run playtest`
 * (scripts/playtest.mjs), optionally `-- <sector-id> [average|good] [seed]`.
 */

import { afterAll, beforeEach, describe, it, vi } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import { SECTORS, chapterSectors, localLayer } from '../../src/data/sectors.js';
import { createBotDriver } from '../../src/bootstrap/botPilotAdapter.js';
import {
  createHeadlessGame,
  installDomStubs,
  STEP_SECONDS,
} from '../__helpers__/headlessGame.js';

const print = (text) => process.stdout.write(`${text}\n`);
const FPS = Math.round(1 / STEP_SECONDS);
const LIMIT_MINUTES = 25;
const PRESET = process.env.PLAYTEST_PRESET || 'average';
const ONLY = process.env.PLAYTEST_SECTOR || '';
// Seeds both the bot's miss rolls and the world (the run's seed).
const SEED = Number(process.env.PLAYTEST_SEED || 1);
// PLAYTEST_CARRY=1: as in the campaign, the bot first wins the chapter's
// earlier sectors and arrives with that build (the victory screen's carry).
const CARRY = process.env.PLAYTEST_CARRY === '1';
// Kept before the fake timers: a long run hands the event loop a turn now
// and then, or the worker cannot answer Vitest ("Timeout calling onTaskUpdate").
const realTimeout = globalThis.setTimeout;
const breathe = () => new Promise((resolve) => realTimeout(resolve, 0));

const clock = (frames) => {
  const seconds = Math.floor(frames / FPS);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

const sourceName = (source) =>
  source ? source.bossKind || source.displayName || source.type : null;

/** One sector run, start to victory, death or the time limit. */
async function playSector(sector) {
  const game = createHeadlessGame();
  const { services, eventBus, session } = game;
  const { player, enemies, progression } = services;
  // The run takes its world seed from the difficulty's first beginRun.
  session.resolveServiceInstance('difficulty').runSeed = SEED;
  const driver = createBotDriver({
    services,
    eventBus,
    preset: PRESET,
    seed: SEED,
  });

  // What hurt the ship this step: a boss hazard's cause, an enemy shot, or
  // (neither) a body it touched.
  let cause = null;
  const direct = enemies.applyDirectDamageToPlayer.bind(enemies);
  enemies.applyDirectDamageToPlayer = (amount, context = {}) => {
    cause = `${context.cause || 'blast'} (${sourceName(context.source) || '?'})`;
    return direct(amount, context);
  };
  eventBus.on('player-hit-by-projectile', (payload = {}) => {
    const source = payload.source || {};
    cause = `shot (${source.bossKind || source.type || source.enemyType || '?'})`;
  });
  let bossDown = false;
  eventBus.on('boss-defeated', () => (bossDown = true));

  const earlier = CARRY
    ? chapterSectors(sector.chapter).filter((s) => s.order < sector.order)
    : [];
  for (const [index, before] of earlier.entries()) {
    session.startNewRun({
      source: 'test',
      sector: before.id,
      carry: index > 0,
    });
    for (let frame = 0; frame < LIMIT_MINUTES * 60 * FPS; frame += 1) {
      if (frame % (30 * FPS) === 0) await breathe();
      driver.step();
      game.step();
      if (session.getSessionState() === 'victory') break;
      if (player.isDead) throw new Error(`playtest: died in ${before.id}`);
    }
  }
  bossDown = false;
  session.startNewRun({
    source: 'test',
    sector: sector.id,
    carry: earlier.length > 0,
  });
  const startLevel = progression.getLevel();
  const [, lastLayer] = sector.layers;
  const report = { sector, layers: [], boss: null, outcome: null, frames: 0 };
  let layer = null;
  let lastHit = null;
  for (let frame = 0; frame < LIMIT_MINUTES * 60 * FPS; frame += 1) {
    if (frame % (30 * FPS) === 0) await breathe();
    const wave = enemies.waveManager.currentWave;
    if (wave >= sector.layers[0] && wave !== layer?.number) {
      layer = { number: wave, start: frame, end: frame, hull: 0, hits: 0 };
      report.layers.push(layer);
    }
    const health = player.health;
    cause = null;
    driver.step();
    game.step();
    report.frames = frame + 1;
    if (layer) layer.end = frame + 1;
    if (player.health < health) {
      if (layer) {
        layer.hull += health - player.health;
        layer.hits += 1;
      }
      lastHit =
        cause || `contact (${sourceName(player.lastDamageSource) || '?'})`;
    }
    if (!report.boss && wave === lastLayer) {
      const boss = enemies.getActiveEnemies().find((e) => e.type === 'boss');
      if (boss) {
        report.boss = {
          kind: boss.bossKind,
          start: frame,
          end: null,
          level: progression.getLevel(),
          cards: [...driver.cards],
          ended: null,
        };
      }
    }
    if (report.boss && !report.boss.end && bossDown) {
      report.boss.end = frame;
      report.boss.ended = 'boss destroyed';
    }
    const state = session.getSessionState();
    if (state === 'victory') {
      report.outcome = { kind: 'won' };
      break;
    }
    if (state === 'player-died' || player.isDead) {
      report.outcome = {
        kind: 'died',
        layer: localLayer(sector, layer?.number ?? sector.layers[0]),
        at: frame + 1,
        by: lastHit,
      };
      break;
    }
  }
  report.outcome ??= { kind: 'timeout' };
  if (report.boss && !report.boss.end) {
    report.boss.end = report.frames;
    report.boss.ended =
      report.outcome.kind === 'died' ? 'pilot died' : 'time limit';
  }
  report.cards = [...driver.cards];
  report.level = progression.getLevel();
  report.startLevel = startLevel;
  return report;
}

function outcomeText({ outcome, frames, sector }) {
  const last = sector.layers[1] - sector.layers[0] + 1;
  if (outcome.kind === 'won') return `won in ${clock(frames)}`;
  if (outcome.kind === 'died') {
    return `died on layer ${outcome.layer}/${last} at ${clock(outcome.at)}`;
  }
  return `timed out at ${LIMIT_MINUTES}:00`;
}

function printReport(report) {
  const { sector, boss } = report;
  const lines = [
    `\n=== ${sector.id} (${sector.code}, layers ${sector.layers.join('-')}, boss ${sector.boss || 'warden'}) — bot ${PRESET}`,
    `  outcome: ${outcomeText(report)}; total ${clock(report.frames)}`,
    ...(CARRY
      ? [`  arrived at level ${report.startLevel} (carried build)`]
      : []),
  ];
  for (const layer of report.layers) {
    lines.push(
      `  layer ${localLayer(sector, layer.number)} (L${layer.number}): ${clock(layer.end - layer.start)}, hull -${Math.round(layer.hull)} in ${layer.hits} hits`
    );
  }
  if (boss) {
    lines.push(
      `  boss ${boss.kind}: met at level ${boss.level} with [${boss.cards.join(', ')}]`,
      `  boss fight ${Math.round((boss.end - boss.start) / FPS)} s, ended: ${boss.ended}`
    );
  } else {
    lines.push('  boss: never reached');
  }
  if (report.outcome.kind === 'died') {
    lines.push(`  killed by: ${report.outcome.by || 'unknown'}`);
  }
  print(lines.join('\n'));
}

function printSummary(reports) {
  const rows = reports.map((r) => {
    const hull = r.layers.reduce((sum, l) => sum + l.hull, 0);
    const hits = r.layers.reduce((sum, l) => sum + l.hits, 0);
    return [
      r.sector.id,
      outcomeText(r),
      clock(r.frames),
      String(r.boss?.level ?? r.level),
      r.boss ? `${Math.round((r.boss.end - r.boss.start) / FPS)} s` : '-',
      String(Math.round(hull)),
      String(hits),
    ];
  });
  const head = ['sector', 'outcome', 'time', 'lvl', 'boss', 'hull-', 'hits'];
  const widths = head.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => row[i].length))
  );
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  print(
    [
      `\nSUMMARY — bot ${PRESET}, seed ${SEED}`,
      line(head),
      ...rows.map(line),
    ].join('\n')
  );
}

const chosen = SECTORS.filter((s) => !ONLY || s.id === ONLY);
if (!chosen.length) throw new Error(`playtest: no sector '${ONLY}'`);
const reports = [];

describe(`playtest (${PRESET})`, () => {
  beforeEach(() => {
    const restoreDom = installDomStubs();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
      vi.spyOn(console, method).mockImplementation(() => {});
    }
    // As in the golden trace: a still wall clock plays the same every time.
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.spyOn(Date, 'now').mockReturnValue(0);
    return () => {
      vi.useRealTimers();
      vi.restoreAllMocks();
      GamePools.releaseAll();
      restoreDom();
    };
  });

  afterAll(() => printSummary(reports));

  it.each(chosen.map((sector) => [sector.id, sector]))(
    '%s',
    async (_, sector) => {
      const report = await playSector(sector);
      reports.push(report);
      printReport(report);
    }
  );
});
