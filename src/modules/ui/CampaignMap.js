// src/modules/ui/CampaignMap.js
//
// The campaign map over the main menu ("THE RING"): an arc of the Ring with
// the chapters along it and the chapters still to come, each cleared, open
// or locked from its sectors (src/data/sectors.js) and the run records; the
// selected chapter's sectors as rows under it, and Launch for the selected
// row (GameSessionService's MenuButtons starts the run from the button's
// data-sector). A sector run that ends back in the menu reopens the map.

import { getContent } from '../../content/registry.js';
import { BIOMES } from '../../data/biomes.js';
import { bossKindForLayer } from '../../data/enemies/boss.js';
import { SECTORS, sectorBossTier } from '../../data/sectors.js';
import { isSectorUnlocked, loadRecords } from '../../services/runRecords.js';
import { formatRunTime } from './runRecap.js';

/** Chapters along the arc: the real ones, then chapters with no signal yet. */
export const CAMPAIGN_NODE_COUNT = 6;

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI'];

// The arc: a segment of a circle centred below the view (viewBox 1000×260).
const ARC = { cx: 500, cy: 1400, r: 1300, edge: 0.38, span: 0.33 };

const arcPoint = (angle) => ({
  x: ARC.cx + ARC.r * Math.sin(angle),
  y: ARC.cy - ARC.r * Math.cos(angle),
});

/** The angle of node `index` (0-based) along the arc. */
const nodeAngle = (index) =>
  -ARC.span + (index * 2 * ARC.span) / (CAMPAIGN_NODE_COUNT - 1);

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
 * (with what unlocks it), its code, name, end boss and layer count.
 */
export function sectorRows(records) {
  return SECTORS.map((sector, index) => {
    const cleared = records.sectorsWon.includes(sector.id);
    const unlocked = isSectorUnlocked(sector, records);
    const previous = SECTORS[index - 1];
    return {
      id: sector.id,
      chapter: sector.chapter,
      code: sector.code,
      name: sector.name,
      boss: `${sectorBossTier(sector)}: ${sectorBossName(sector)}`,
      layers: sector.layers[1] - sector.layers[0] + 1,
      headStart: sector.headStart,
      state: cleared ? 'cleared' : unlocked ? 'open' : 'locked',
      bestTime: Number(records.sectorTimes[sector.id]) || 0,
      lock:
        unlocked || !previous
          ? ''
          : `Defeat ${sectorBossTier(previous)} ${sectorBossName(previous)} to unlock`,
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
    const title = BIOMES.find((b) => b.id === biome)?.title ?? '';
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
        <span class="campaign-sector__state">${rowState(row)}</span>
      </button>`
    )
    .join('');
}

function arcPath(from, to) {
  const a = arcPoint(from);
  const b = arcPoint(to);
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)}A${ARC.r} ${ARC.r} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

/**
 * The arc and its chapter nodes: real chapters are buttons
 * (`data-campaign-chapter`), the chapters to come are not selectable. CSS:
 * .campaign-* in style.css.
 */
export function campaignMarkup(chapters) {
  const lastReal = chapters.filter((node) => node.sectors.length).length - 1;
  const reach = chapters.reduce(
    (last, node, i) =>
      node.sectors.length && node.state !== 'locked' ? i : last,
    0
  );
  const svg = `<svg class="campaign-arc" viewBox="0 0 1000 260" aria-hidden="true">
    <path class="campaign-arc__ring" d="${arcPath(-ARC.edge, nodeAngle(lastReal))}"/>
    <path class="campaign-arc__ring is-dark" d="${arcPath(nodeAngle(lastReal), ARC.edge)}"/>
    <path class="campaign-arc__reach" d="${arcPath(nodeAngle(0), nodeAngle(reach))}"/>
  </svg>`;
  const items = chapters
    .map((node, i) => {
      const { x, y } = arcPoint(nodeAngle(i));
      const style = `left: ${(x / 10).toFixed(2)}%; top: ${((y / 260) * 100).toFixed(2)}%`;
      const inner = `<span class="campaign-node__dot" aria-hidden="true"></span>
        <span class="campaign-node__numeral">${node.numeral}</span>
        <span class="campaign-node__name">${node.name || '—'}</span>
        <span class="campaign-node__state">${stateLine(node)}</span>`;
      if (!node.sectors.length) {
        return `<div class="campaign-node is-nosignal" style="${style}">${inner}</div>`;
      }
      return `<button type="button" id="campaign-chapter-${node.chapter}" class="campaign-node is-${node.state}" style="${style}" data-campaign-chapter="${node.chapter}" aria-pressed="false">${inner}</button>`;
    })
    .join('');
  return `${svg}${items}`;
}

export class CampaignMap {
  /**
   * `refs`: the overlay's nodes { overlay, nodes, detailTitle, sectors, detailHeadStart, launchBtn, openBtn, backBtn, closeBtn }.
   * `showScreen(name, options)`: shows or hides the overlay.
   * `announceVisibility(isOpen, payload)`: the overlay opened or closed.
   */
  constructor({ refs, showScreen, announceVisibility }) {
    this.refs = refs;
    this.showScreen = showScreen;
    this.announceVisibility = announceVisibility;
    this.mapState = { isOpen: false, trigger: null };
    this.chapters = [];
    this.chapter = null;
    this.selectedId = null;
    // A sector run is on: the menu it ends in opens the map again.
    this.returnToMap = false;
  }

  bindCampaignControls() {
    const refs = this.refs;
    if (!refs.overlay) return;
    refs.openBtn?.addEventListener('click', () => this.openMap());
    [refs.backBtn, refs.closeBtn].forEach((button) =>
      button?.addEventListener('click', () => this.closeMap())
    );
    refs.overlay.addEventListener('click', (event) => {
      if (event.target === refs.overlay) {
        this.closeMap();
        return;
      }
      this.selectFrom(event.target);
    });
    // The pad's d-pad moves the focus: the focused chapter or row is the
    // selection.
    refs.overlay.addEventListener('focusin', (event) =>
      this.selectFrom(event.target)
    );
    document.addEventListener('keydown', (event) => {
      if (!this.mapState.isOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeMap();
        return;
      }
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
    refs.detailTitle.textContent = node.title;
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
  }

  openMap() {
    const refs = this.refs;
    this.chapters = campaignChapters(loadRecords());
    this.chapter = null;
    refs.nodes.innerHTML = campaignMarkup(this.chapters);
    this.mapState = { isOpen: true, trigger: document.activeElement };
    this.showScreen('campaign', { overlay: true, show: true });
    refs.overlay.setAttribute('aria-hidden', 'false');
    this.announceVisibility(true, { source: 'menu' });
    const row = defaultSectorRow(this.chapters.flatMap((node) => node.sectors));
    this.selectSector(row.id);
    this.focusChapter(row.chapter);
  }

  closeMap() {
    if (!this.mapState.isOpen) return;
    const refs = this.refs;
    this.showScreen('campaign', { overlay: true, show: false });
    refs.overlay.setAttribute('aria-hidden', 'true');
    this.announceVisibility(false, { source: 'menu' });
    this.mapState.trigger?.focus?.({ preventScroll: true });
    this.mapState = { isOpen: false, trigger: null };
  }

  /** 'game-started': only a sector run comes back to the map. */
  noteRunStart(sectorId) {
    this.returnToMap = Boolean(sectorId);
  }

  /** The main menu is shown: after a sector run, the map opens over it. */
  menuShown() {
    if (!this.returnToMap) return;
    this.returnToMap = false;
    this.openMap();
  }
}
