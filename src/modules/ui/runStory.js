// src/modules/ui/runStory.js
//
// The run's story on the HUD: each layer's banner (its chapter, the
// sector's context) and lines, a Warden's warning, entrance and lines, a
// Herald's banner and lines (Silence jams the radar), the Ring naming a
// machine seen for the first time, and the frame loop that plays the
// queued transmissions (the lines themselves: transmissions.js).

import { bossRushStageTitle, directorFor } from '../../data/layers.js';
import { HERALD_KINDS } from '../../data/enemies/herald.js';
import { biomeForLayer } from '../../data/biomes.js';
import { localLayer, sectorTitle } from '../../data/sectors.js';
import { STORY } from '../../data/story.js';
import { resolveService } from '../../core/serviceUtils.js';
import { FIRST_RUN_MODE } from '../../core/runMode.js';
import {
  bossRushTransmission,
  chapterTransmission,
  heraldTransmission,
  sightingTransmission,
  stageTransmission,
  wardenTransmission,
} from './transmissions.js';

/** The kind of run being played (src/core/runMode.js): the session's. */
export const runModeOf = (ui) =>
  resolveService('game-session', ui.dependencies)?.mode ?? FIRST_RUN_MODE;

export function handleLayerStarted(ui, payload = {}) {
  const hud = ui.tacticalHud.layout;
  if (!hud) {
    return;
  }
  const layer = Math.max(1, Math.floor(Number(payload.wave) || 1));
  ui.transmissionLayer = layer;
  const mode = runModeOf(ui);
  const { sector } = mode;
  ui.cinematics.prepareLayer(layer, mode);
  // The intro's end shows this layer's title card.
  if (ui.cinematics.introActive) return;
  const boss = Boolean(payload.isBossWave) || directorFor(layer).warden;
  const biome = biomeForLayer(layer, sector);
  const firstOfBiome = biome.layers[0] === layer;
  const stage = mode.rushStage(layer);
  const chapter = stage
    ? bossRushStageTitle(stage)
    : firstOfBiome
      ? sectorTitle(sector, biome.title)
      : mode.deepFieldAt(layer)
        ? 'DEEP FIELD'
        : '';
  // A sector run counts its layers from its own first one.
  hud.showLayerBanner(mode.shownLayer(layer), {
    boss,
    sentinel: Boolean(sector?.boss),
    title: mode.layerBannerTitle,
    chapter,
    context: sector && !stage && firstOfBiome ? STORY.context[sector.id] : '',
  });
  if (firstOfBiome) {
    ui.queueTransmission(chapterTransmission(biome.id, sector?.id));
  }
  const said =
    sector && stageTransmission(sector.id, localLayer(sector, layer));
  if (said) ui.queueTransmission(said);
  if (stage === 1) {
    ui.queueTransmission(bossRushTransmission());
  }
}

/** Queues a Warden transmission and keeps the frame loop that plays it. */
export function queueTransmission(ui, entry, { interrupt = false } = {}) {
  const queue = ui.transmissions;
  if (!queue || !entry) return;
  if (interrupt) {
    queue.interrupt(entry);
  } else {
    queue.push(entry);
  }
  ui.eventBus.emit('transmission-queued', entry);
  if (ui.transmissionRaf) {
    return;
  }
  // Wall-clock UI timing like the HUD banners: it keeps playing while the
  // run is paused, dead or won.
  const tick = () => {
    if (ui.transmissions !== queue) {
      ui.transmissionRaf = null;
      return;
    }
    queue.update(performance.now(), ui.prefersReducedMotion());
    ui.transmissionRaf = queue.active
      ? window.requestAnimationFrame(tick)
      : null;
  };
  ui.transmissionRaf = window.requestAnimationFrame(tick);
}

/** The story's bus events; after the HUD's boss listeners (UISystem). */
export function listenForStory(ui) {
  ui.registerEventListener('wave-started', (payload = {}) => {
    ui.handleLayerStarted(payload);
  });

  ui.registerEventListener('boss-warning', (payload = {}) => {
    // Boss Rush: the breather names the next Warden.
    const mode = runModeOf(ui);
    if (mode.warningShowsRushBanner) {
      ui.tacticalHud.layout?.showLayerBanner(payload.nextBossWave, {
        boss: true,
        title: mode.layerBannerTitle,
        chapter: bossRushStageTitle(mode.rushStage(payload.nextBossWave)),
      });
    }
    ui.queueTransmission(
      wardenTransmission(payload.nextBossWave, 'warning', mode.sector?.boss)
    );
  });

  // A Warden's entrance: the letterbox until it closes up.
  ui.registerEventListener('boss-spawned', (payload = {}) => {
    ui.cinematics.startArrival(payload.enemy);
  });
  ui.registerEventListener('boss-arrived', () => {
    ui.cinematics.endArrival();
  });

  // A boss with a line for its final phase speaks it as the phase begins.
  ui.registerEventListener('boss-phase-changed', ({ enemy, phase }) => {
    if (phase !== enemy.phaseCount - 1) return;
    ui.queueTransmission(wardenTransmission(0, 'last', enemy.bossKind));
  });
  ui.registerEventListener('boss-defeated', (payload = {}) => {
    // A Warden whose death won the run: 'run-won' speaks for it.
    if (ui.runWon) return;
    ui.queueTransmission(
      wardenTransmission(payload.wave, 'defeated', payload.enemy?.bossKind)
    );
  });

  // A Herald arrives under a violet banner, then speaks; Silence jams the
  // radar while it lives (a new run clears it).
  ui.registerEventListener('herald-spawned', ({ kind } = {}) => {
    const herald = HERALD_KINDS[kind];
    if (!herald) return;
    ui.tacticalHud.layout?.showHeraldBanner(
      herald.displayName,
      herald.subtitle
    );
    if (herald.jamsRadar) ui.tacticalHud.layout?.setRadarJammed(true);
    ui.queueTransmission(heraldTransmission(kind, 'spawned'));
  });
  ui.registerEventListener('herald-defeated', ({ kind } = {}) => {
    ui.queueTransmission(heraldTransmission(kind, 'defeated'));
    if (HERALD_KINDS[kind]?.jamsRadar) {
      ui.tacticalHud.layout?.setRadarJammed(false);
    }
  });
  // The Ring names a machine the first time it is ever seen; not over the
  // intro or once the run has ended.
  ui.registerEventListener('codex-discovered', ({ type } = {}) => {
    if (ui.cinematics.introActive || ui.runWon || ui.pilotDown) {
      return;
    }
    ui.queueTransmission(sightingTransmission(type));
  });
}
