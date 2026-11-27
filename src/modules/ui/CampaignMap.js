// src/modules/ui/CampaignMap.js
//
// The campaign tab of the main menu ("THE RING"): a row of the Ring's chapters
// and the chapters still to come, each cleared, open or locked from its
// sectors (src/data/sectors.js) and the run records; the selected chapter's
// sectors as rows, and Launch for the selected row (Enter, Space or the pad's
// confirm on that row presses it too; GameSessionService's MenuButtons starts
// the run from the button's data-sector). The panel is drawn each time the
// menu is shown; a sector run that ends back in the menu returns to the tab.
// The campaign's last sector carries a pip per ending (data/story.js), lit
// once the profile has reached it.

import { getContent } from '../../content/registry.js';
import { bossKindForLayer } from '../../data/enemies/boss.js';
import { SECTORS, sectorBossTier } from '../../data/sectors.js';
import { ENDING_SECTOR, STORY } from '../../data/story.js';
import { isSectorUnlocked, loadRecords } from '../../services/runRecords.js';
import { formatRunTime } from './runRecap.js';
import {
  chapterTransmission,
  stageTransmission,
  travelTransmissions,
  wardenTransmission,
} from './transmissions.js';
import { inputLayers } from '../input/inputLayers.js';

/** Chapters along the arc: the real ones, then chapters with no signal yet. */
export const CAMPAIGN_NODE_COUNT = 6;

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI'];

const titleCase = (id) =>
  id.replace(
    /(^|-)(\w)/g,
    (_, dash, c) => `${dash ? ' ' : ''}${c.toUpperCase()}`
  );

/**
 * A sector's end boss without its rank ('Quarry Maw', 'Prime'): its `boss`,
 * else the Warden on its last layer; named from its boss file, else from its
 * kind id.
 */
export function sectorBossName(sector) {
  const kind = sector.boss ?? bossKindForLayer(sector.layers[1]);
  const shown = getContent('bosses', kind)?.displayName ?? titleCase(kind);
  return shown.replace(/^(Warden|Sentinel) /, '');
}

/**
 * Every sector as a row: `cleared` (with its best time), `open` or `locked`
 * (with what unlocks it), its code, name, end boss (its rank, unless the
 * rank is its name) and layer count; the last sector also its `endings`
 * ({ id, title, reached }), else none.
 */
export function sectorRows(records) {
  return SECTORS.map((sector, index) => {
    const cleared = records.sectorsWon.includes(sector.id);
    const unlocked = isSectorUnlocked(sector, records);
    const previous = SECTORS[index - 1];
    const tier = sectorBossTier(sector);
    const boss = sectorBossName(sector);
    return {
      id: sector.id,
      chapter: sector.chapter,
      code: sector.code,
      name: sector.name,
      boss:
        tier.toUpperCase() === boss.toUpperCase() ? boss : `${tier}: ${boss}`,
      layers: sector.layers[1] - sector.layers[0] + 1,
      headStart: sector.headStart,
      state: cleared ? 'cleared' : unlocked ? 'open' : 'locked',
      bestTime: Number(records.sectorTimes[sector.id]) || 0,
      lock:
        unlocked || !previous
          ? ''
          : `Defeat ${sectorBossTier(previous)} ${sectorBossName(previous)} to unlock`,
      endings:
        sector.id === ENDING_SECTOR
          ? Object.entries(STORY.ending).map(([id, { title }]) => ({
              id,
              title,
              reached: records.endings.includes(id),
            }))
          : null,
    };
  });
}

/**
 * The map's chapter nodes from the records: a chapter is `cleared` when all
 * its sectors are won, `open` when any is unlocked, else `locked`; the
 * chapters to come are `nosignal`, with no sectors.
 */
export function campaignChapters(records) {
  const rows = sectorRows(records);
  return NUMERALS.slice(0, CAMPAIGN_NODE_COUNT).map((numeral, i) => {
    const chapter = i + 1;
    const sectors = rows.filter((row) => row.chapter === chapter);
    if (sectors.length === 0) {
      return {
        chapter,
        numeral,
        title: '',
        name: '',
        state: 'nosignal',
        sectors,
      };
    }
    const { biome } = SECTORS.find((s) => s.id === sectors[0].id);
    const title = getContent('biomes', biome)?.title ?? '';
    return {
      chapter,
      numeral,
      title,
      name: title.split(' — ').pop(),
      state: sectors.every((row) => row.state === 'cleared')
        ? 'cleared'
        : sectors.some((row) => row.state !== 'locked')
          ? 'open'
          : 'locked',
      sectors,
    };
  });
}

/** The row to select: the first open (unlocked, not won), else the last won. */
export function defaultSectorRow(rows) {
  return (
    rows.find((row) => row.state === 'open') ??
    rows.filter((row) => row.state === 'cleared').pop() ??
    rows[0] ??
    null
  );
}

const shownName = (sector) =>
  sector.name.replace(/\b(\w)(\w*)/g, (_, a, b) => a + b.toLowerCase());
const sectorLabel = (sector, index) => `${index + 1} · ${shownName(sector)}`;

/**
 * The Wake's log: its prologue, then an entry per sector won (in campaign
 * order, titled with its place in the campaign), and `next`, the first
 * sector not won yet (null when all are).
 */
export function wakeLogEntries(records) {
  const entries = [{ title: 'Before launch', text: STORY.log.prologue }];
  let next = null;
  SECTORS.forEach((sector, index) => {
    const title = sectorLabel(sector, index);
    if (records.sectorsWon.includes(sector.id)) {
      entries.push({ title, text: STORY.log[sector.id] });
    } else if (!next) {
      next = { title };
    }
  });
  return { entries, next };
}

/**
 * Every line said in the sectors won, in order: the journey, the arrival,
 * the stages, then the end boss's warning, last and defeated lines.
 */
export function wakeTranscript(records) {
  return SECTORS.flatMap((sector) => {
    if (!records.sectorsWon.includes(sector.id)) return [];
    const kind = sector.boss ?? bossKindForLayer(sector.layers[1]);
    const stages = Array.from(
      { length: sector.layers[1] - sector.layers[0] + 1 },
      (_, i) => stageTransmission(sector.id, i + 1)
    );
    const lines = [
      ...travelTransmissions(sector.id),
      chapterTransmission(null, sector.id),
      ...stages,
      ...['warning', 'last', 'defeated'].map((moment) =>
        wardenTransmission(sector.layers[1], moment, kind)
      ),
    ]
      .filter((entry) => entry?.text)
      .map((entry) => ({
        speaker: entry.label ?? entry.speaker,
        text: entry.text,
      }));
    return [{ sector: shownName(sector), lines }];
  });
}

function stateLine(node) {
  switch (node.state) {
    case 'cleared':
      return 'Cleared';
    case 'open':
      return 'Open';
    case 'locked':
      return 'Locked';
    default:
      return 'No signal';
  }
}

function rowState(row) {
  if (row.state === 'cleared') {
    return `Cleared${row.bestTime ? ` ${formatRunTime(row.bestTime)}` : ''}`;
  }
  if (row.state === 'open') return 'Open';
  return `Locked${row.lock ? `<span class="campaign-sector__why">${row.lock}</span>` : ''}`;
}

// The endings under the last sector's row: a pip and a name each.
function endingsMarkup(endings) {
  if (!endings) return '';
  const pips = endings
    .map(
      ({ id, title, reached }) =>
        `<span class="campaign-ending${reached ? ' is-reached' : ''}" data-ending="${id}"><span class="campaign-ending__pip" aria-hidden="true"></span>${title}</span>`
    )
    .join('');
  return `<span class="campaign-sector__endings"><span class="campaign-sector__why">Endings</span>${pips}</span>`;
}

/** A chapter's sectors as selectable rows (`data-campaign-row`). */
export function sectorRowsMarkup(rows) {
  return rows
    .map(
      (
        row
      ) => `<button type="button" id="campaign-sector-${row.id}" class="campaign-sector is-${row.state}" data-campaign-row="${row.id}" aria-pressed="false">
        <span class="campaign-sector__code">${row.code}</span>
        <span class="campaign-sector__name">${row.name}</span>
        <span class="campaign-sector__boss">${row.boss}</span>
        <span class="campaign-sector__layers">${row.layers} layers</span>
        <span class="campaign-sector__state">${rowState(row)}</span>${endingsMarkup(row.endings)}
      </button>`
    )
    .join('');
}

/**
 * The chapter nodes in a row: real chapters are buttons
 * (`data-campaign-chapter`), the chapters to come are not selectable. The
 * first open chapter is the one that calls (`is-next`); a profile from
 * before the campaign can have several open at once. CSS: .campaign-* in
 * style.css.
 */
export function campaignMarkup(chapters) {
  const next = chapters.findIndex((node) => node.state === 'open');
  return chapters
    .map((node, i) => {
      const inner = `<span class="campaign-node__dot" aria-hidden="true"></span>
        <span class="campaign-node__numeral">${node.numeral}</span>
        <span class="campaign-node__name">${node.name || '—'}</span>
        <span class="campaign-node__state">${stateLine(node)}</span>`;
      if (!node.sectors.length) {
        return `<div class="campaign-node is-nosignal">${inner}</div>`;
      }
      return `<button type="button" id="campaign-chapter-${node.chapter}" class="campaign-node is-${node.state}${i === next ? ' is-next' : ''}" data-campaign-chapter="${node.chapter}" aria-pressed="false">${inner}</button>`;
    })
    .join('');
}

export class CampaignMap {
  /**
   * `refs`: the menu's nodes { root, nodes, detailTitle, sectors, detailHeadStart, launchBtn, logBody, logToggle, openBtn, mainMenuBtn }.
   * `showTab()`: shows the menu's Campaign tab.
   * `prepareTravel(start)`: readies the journey a Launch would fly.
   */
  constructor({ refs, showTab, prepareTravel }) {
    this.refs = refs;
    this.showTab = showTab;
    this.prepareTravel = prepareTravel;
    this.chapters = [];
    this.chapter = null;
    this.selectedId = null;
    this.records = null;
    this.reading = false;
    // A sector run is on: the menu it ends in returns to the Campaign tab.
    this.returnToMap = false;
  }

  bindCampaignControls() {
    const refs = this.refs;
    if (!refs.root) return;
    refs.logToggle?.addEventListener('click', () => {
      this.reading = !this.reading;
      this.renderLog();
    });
    refs.openBtn?.addEventListener('click', () => this.render());
    refs.mainMenuBtn?.addEventListener('click', () => {
      this.returnToMap = false;
    });
    refs.root.addEventListener('click', (event) => {
      // Enter, Space or the pad's confirm (no pointer: detail 0) on the row
      // already selected launches it, as Launch would.
      const row = event.target.closest?.('[data-campaign-row]');
      if (event.detail === 0 && row?.dataset.campaignRow === this.selectedId) {
        if (!refs.launchBtn.disabled) refs.launchBtn.click();
        return;
      }
      this.selectFrom(event.target);
    });
    // The d-pad moves the focus: the focused chapter or row is the
    // selection. The pad's highlight passes over a locked one (it says
    // Locked) without taking Launch away from the open one; A selects it.
    refs.root.addEventListener('focusin', (event) => {
      const node = event.target.closest?.(
        '[data-campaign-row], [data-campaign-chapter]'
      );
      const padPassing =
        document.body.dataset.inputDevice === 'gamepad' &&
        node?.classList.contains('is-locked');
      if (!padPassing) this.selectFrom(event.target);
    });
    // A menu key (input/inputLayers.js): heard with no screen over the menu,
    // before InputSystem stops ArrowDown at the document.
    inputLayers.addBase((event) => {
      // Only on the Campaign tab, with the menu in view (not over a run).
      if (!this.visible()) return;
      const onChapter = document.activeElement?.closest?.(
        '[data-campaign-chapter]'
      );
      const onRow = document.activeElement?.closest?.('[data-campaign-row]');
      const move = {
        ArrowLeft: onChapter && (() => this.stepChapter(-1)),
        ArrowRight: onChapter && (() => this.stepChapter(1)),
        ArrowDown: onChapter
          ? () => this.focusRow(this.selectedId)
          : onRow && (() => this.stepRow(1)),
        ArrowUp: onRow && (() => this.stepRow(-1)),
      }[event.key];
      if (move) {
        event.preventDefault();
        move();
      }
    });
  }

  /** The panel is in view: the menu is shown, on the Campaign tab. */
  visible() {
    return this.refs.sectors.checkVisibility({ visibilityProperty: true });
  }

  /** A click or focus on a chapter node or a sector row selects it. */
  selectFrom(target) {
    const chapter = target.closest?.('[data-campaign-chapter]');
    if (chapter) this.selectChapter(Number(chapter.dataset.campaignChapter));
    const row = target.closest?.('[data-campaign-row]');
    if (row) this.selectSector(row.dataset.campaignRow);
  }

  focusChapter(chapter) {
    this.refs.nodes
      .querySelector(`[data-campaign-chapter="${chapter}"]`)
      ?.focus({ preventScroll: true });
  }

  focusRow(id) {
    this.refs.sectors
      .querySelector(`[data-campaign-row="${id}"]`)
      ?.focus({ preventScroll: true });
  }

  /** The previous or next chapter, focused (and so selected). */
  stepChapter(direction) {
    const real = this.chapters.filter((node) => node.sectors.length);
    const next =
      real[real.findIndex((n) => n.chapter === this.chapter) + direction];
    if (next) this.focusChapter(next.chapter);
  }

  /** The row above or below; above the first, back to its chapter. */
  stepRow(direction) {
    const rows = this.chapterNode()?.sectors ?? [];
    const index = rows.findIndex((row) => row.id === this.selectedId);
    const next = rows[index + direction];
    if (next) this.focusRow(next.id);
    else if (direction < 0) this.focusChapter(this.chapter);
  }

  chapterNode(chapter = this.chapter) {
    return this.chapters.find((node) => node.chapter === chapter) ?? null;
  }

  /**
   * A chapter selected: its title and its sectors as rows, the default one
   * selected (the current selection when it is in this chapter).
   */
  selectChapter(chapter) {
    const node = this.chapterNode(chapter);
    if (!node?.sectors.length || chapter === this.chapter) return;
    this.chapter = chapter;
    const refs = this.refs;
    refs.nodes.querySelectorAll('[data-campaign-chapter]').forEach((button) => {
      const active = Number(button.dataset.campaignChapter) === chapter;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
    refs.detailTitle.textContent = node.title.replace(' — ', ' / ');
    refs.sectors.innerHTML = sectorRowsMarkup(node.sectors);
    const keep = node.sectors.some((row) => row.id === this.selectedId);
    this.selectSector(
      keep ? this.selectedId : defaultSectorRow(node.sectors).id
    );
  }

  /** A sector row selected (its chapter too): its head start and Launch. */
  selectSector(id) {
    const row = this.chapters
      .flatMap((node) => node.sectors)
      .find((entry) => entry.id === id);
    if (!row) return;
    this.selectChapter(row.chapter);
    this.selectedId = id;
    const refs = this.refs;
    refs.sectors.querySelectorAll('[data-campaign-row]').forEach((button) => {
      const active = button.dataset.campaignRow === id;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
    refs.detailHeadStart.textContent = row.headStart
      ? `Starts with ${row.headStart} card picks`
      : '';
    refs.detailHeadStart.hidden = !row.headStart;
    refs.launchBtn.dataset.sector = id;
    refs.launchBtn.disabled = row.state === 'locked';
    this.prepareTravel({ sector: id, source: 'campaign-launch-btn' });
  }

  /** The log panel: the Wake's log, or (`reading`) every line said so far. */
  renderLog() {
    const { logBody, logToggle } = this.refs;
    if (!logBody) return;
    const add = (parent, tag, className, text) => {
      const node = document.createElement(tag);
      node.className = className;
      node.textContent = text;
      parent.append(node);
      return node;
    };
    const transcript = wakeTranscript(this.records);
    const count = transcript.reduce((n, { lines }) => n + lines.length, 0);
    logBody.replaceChildren();
    if (this.reading) {
      transcript.forEach(({ sector, lines }) => {
        const group = add(logBody, 'div', 'campaign-log__entry', '');
        add(group, 'div', 'campaign-log__title', sector);
        lines.forEach(({ speaker, text }) => {
          const row = add(group, 'p', 'campaign-log__line', ` — ${text}`);
          const who = document.createElement('span');
          who.className = 'campaign-log__speaker';
          who.textContent = speaker;
          row.prepend(who);
        });
      });
      logToggle.textContent = 'Back to log';
      logToggle.hidden = false;
      logBody.scrollTop = 0;
      return;
    }
    const { entries, next } = wakeLogEntries(this.records);
    entries.forEach(({ title, text }) => {
      const entry = add(logBody, 'div', 'campaign-log__entry', '');
      add(entry, 'div', 'campaign-log__title', title);
      add(entry, 'p', 'campaign-log__text', text);
    });
    if (next) {
      add(logBody, 'p', 'campaign-log__next', `${next.title} — not flown yet`);
    }
    logToggle.textContent = `Transmissions logged: ${count} · Read again`;
    logToggle.hidden = count === 0;
    logBody.scrollTop = logBody.scrollHeight;
  }

  /** The panel drawn from the records: the ring, the Wake log, the default sector. */
  render() {
    const refs = this.refs;
    this.records = loadRecords();
    this.reading = false;
    this.renderLog();
    this.chapters = campaignChapters(this.records);
    this.chapter = null;
    refs.nodes.innerHTML = campaignMarkup(this.chapters);
    const row = defaultSectorRow(this.chapters.flatMap((node) => node.sectors));
    this.selectSector(row.id);
  }

  /** 'game-started': only a sector run comes back to the Campaign tab. */
  noteRunStart(sectorId) {
    this.returnToMap = Boolean(sectorId);
  }

  /** The main menu is shown: draw the panel; after a sector run, show it. */
  menuShown() {
    this.render();
    if (!this.returnToMap) return;
    // Once the menu has settled: leaving a run shows it twice (the session,
    // then its 'screen-changed'), and each showing draws the panel anew.
    queueMicrotask(() => {
      if (!this.returnToMap) return;
      this.returnToMap = false;
      this.showTab();
      this.render();
      this.focusRow(this.selectedId);
    });
  }
}
