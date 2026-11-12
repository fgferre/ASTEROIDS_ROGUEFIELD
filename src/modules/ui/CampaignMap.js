// src/modules/ui/CampaignMap.js
//
// The campaign map over the main menu ("THE RING"): an arc of the Ring with
// the sectors along it (src/data/sectors.js) and the chapters still to come,
// each sector cleared, open or locked from the run records; the selected
// one's detail and its Launch (GameSessionService's MenuButtons starts the
// run from the button's data-sector). A sector run that ends back in the
// menu reopens the map.

import { BIOMES } from '../../data/biomes.js';
import { bossKindForLayer, WARDEN_KINDS } from '../../data/enemies/boss.js';
import { SECTORS } from '../../data/sectors.js';
import { isSectorUnlocked, loadRecords } from '../../services/runRecords.js';
import { formatRunTime } from './runRecap.js';

/** Nodes along the arc: the sectors, then chapters with no signal yet. */
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

/** A sector's Warden: the Warden on its last layer. */
export function sectorWardenName(sector) {
  return WARDEN_KINDS[bossKindForLayer(sector.layers[1])].displayName;
}

/**
 * The map's nodes from the records: each sector `cleared` (with its best
 * time), `open` or `locked` (with what unlocks it), then the chapters to come
 * as `nosignal`.
 */
export function campaignNodes(records) {
  const sectors = SECTORS.map((sector, index) => {
    const cleared = records.sectorsWon.includes(sector.id);
    const unlocked = isSectorUnlocked(sector, records);
    const previous = SECTORS[index - 1];
    return {
      id: sector.id,
      numeral: NUMERALS[sector.chapter - 1],
      name: sector.name,
      state: cleared ? 'cleared' : unlocked ? 'open' : 'locked',
      bestTime: Number(records.sectorTimes[sector.id]) || 0,
      lock:
        unlocked || !previous
          ? ''
          : `Defeat ${sectorWardenName(previous)} to unlock`,
    };
  });
  const future = Array.from(
    { length: CAMPAIGN_NODE_COUNT - sectors.length },
    (_, i) => ({
      id: null,
      numeral: NUMERALS[sectors.length + i],
      name: '',
      state: 'nosignal',
      bestTime: 0,
      lock: '',
    })
  );
  return [...sectors, ...future];
}

/** The selection on open: the first sector open, else the last cleared. */
export function defaultSectorId(nodes) {
  const open = nodes.find((node) => node.state === 'open');
  if (open) return open.id;
  const cleared = nodes.filter((node) => node.state === 'cleared');
  return cleared[cleared.length - 1]?.id ?? nodes[0]?.id ?? null;
}

/**
 * The detail panel's lines for a sector node: its chapter title, layers and
 * Warden, the head start, the best clear or the lock, and whether it launches.
 */
export function sectorDetail(node) {
  const sector = SECTORS.find((entry) => entry.id === node.id);
  const biome = BIOMES.find((entry) => entry.id === sector.biome);
  const layers = sector.layers[1] - sector.layers[0] + 1;
  const warden = sectorWardenName(sector).replace(/^Warden /, '');
  return {
    title: biome?.title ?? sector.name,
    facts: `${layers} layers · Warden: ${warden}`,
    headStart: sector.headStart
      ? `Starts with ${sector.headStart} card picks`
      : '',
    status:
      node.state === 'cleared'
        ? `Best clear ${formatRunTime(node.bestTime)}`
        : node.lock,
    launchable: node.state !== 'locked',
  };
}

function stateLine(node) {
  switch (node.state) {
    case 'cleared':
      return `Cleared${node.bestTime ? ` · ${formatRunTime(node.bestTime)}` : ''}`;
    case 'open':
      return 'Open';
    case 'locked':
      return 'Locked';
    default:
      return 'No signal';
  }
}

function arcPath(from, to) {
  const a = arcPoint(from);
  const b = arcPoint(to);
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)}A${ARC.r} ${ARC.r} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

/**
 * The arc and its nodes: sector nodes are buttons (`data-campaign-sector`),
 * the chapters to come are not selectable. CSS: .campaign-* in style.css.
 */
export function campaignMarkup(nodes) {
  const lastSector = nodes.filter((node) => node.id).length - 1;
  const reach = nodes.reduce(
    (last, node, i) => (node.id && node.state !== 'locked' ? i : last),
    0
  );
  const svg = `<svg class="campaign-arc" viewBox="0 0 1000 260" aria-hidden="true">
    <path class="campaign-arc__ring" d="${arcPath(-ARC.edge, nodeAngle(lastSector))}"/>
    <path class="campaign-arc__ring is-dark" d="${arcPath(nodeAngle(lastSector), ARC.edge)}"/>
    <path class="campaign-arc__reach" d="${arcPath(nodeAngle(0), nodeAngle(reach))}"/>
  </svg>`;
  const items = nodes
    .map((node, i) => {
      const { x, y } = arcPoint(nodeAngle(i));
      const style = `left: ${(x / 10).toFixed(2)}%; top: ${((y / 260) * 100).toFixed(2)}%`;
      const inner = `<span class="campaign-node__dot" aria-hidden="true"></span>
        <span class="campaign-node__numeral">${node.numeral}</span>
        <span class="campaign-node__name">${node.name || '—'}</span>
        <span class="campaign-node__state">${stateLine(node)}</span>`;
      if (!node.id) {
        return `<div class="campaign-node is-nosignal" style="${style}">${inner}</div>`;
      }
      return `<button type="button" id="campaign-node-${node.id}" class="campaign-node is-${node.state}" style="${style}" data-campaign-sector="${node.id}" aria-pressed="false">${inner}</button>`;
    })
    .join('');
  return `${svg}${items}`;
}

export class CampaignMap {
  /**
   * `refs`: the overlay's nodes { overlay, nodes, detailTitle, detailFacts, detailHeadStart, detailStatus, launchBtn, openBtn, backBtn, closeBtn }.
   * `showScreen(name, options)`: shows or hides the overlay.
   * `announceVisibility(isOpen, payload)`: the overlay opened or closed.
   */
  constructor({ refs, showScreen, announceVisibility }) {
    this.refs = refs;
    this.showScreen = showScreen;
    this.announceVisibility = announceVisibility;
    this.mapState = { isOpen: false, trigger: null };
    this.nodes = [];
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
      const node = event.target.closest('[data-campaign-sector]');
      if (node) this.select(node.dataset.campaignSector);
    });
    // The pad's d-pad moves the focus: the focused sector is the selection.
    refs.nodes?.addEventListener('focusin', (event) => {
      const node = event.target.closest?.('[data-campaign-sector]');
      if (node) this.select(node.dataset.campaignSector);
    });
    document.addEventListener('keydown', (event) => {
      if (!this.mapState.isOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeMap();
      } else if (
        (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
        document.activeElement?.closest?.('[data-campaign-sector]')
      ) {
        event.preventDefault();
        this.step(event.key === 'ArrowLeft' ? -1 : 1);
      }
    });
  }

  /** The previous or next sector, focused (and so selected). */
  step(direction) {
    const ids = this.nodes.filter((node) => node.id).map((node) => node.id);
    const index = ids.indexOf(this.selectedId) + direction;
    if (index < 0 || index >= ids.length) return;
    this.refs.nodes
      .querySelector(`[data-campaign-sector="${ids[index]}"]`)
      ?.focus({ preventScroll: true });
  }

  /** A sector node selected: its detail and the Launch for it. */
  select(id) {
    const node = this.nodes.find((entry) => entry.id === id);
    if (!node) return;
    this.selectedId = id;
    const refs = this.refs;
    refs.nodes.querySelectorAll('[data-campaign-sector]').forEach((button) => {
      const active = button.dataset.campaignSector === id;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const detail = sectorDetail(node);
    refs.detailTitle.textContent = detail.title;
    refs.detailFacts.textContent = detail.facts;
    refs.detailHeadStart.textContent = detail.headStart;
    refs.detailHeadStart.hidden = !detail.headStart;
    refs.detailStatus.textContent = detail.status;
    refs.detailStatus.hidden = !detail.status;
    refs.detailStatus.classList.toggle('is-locked', node.state === 'locked');
    refs.launchBtn.dataset.sector = id;
    refs.launchBtn.disabled = !detail.launchable;
  }

  openMap() {
    const refs = this.refs;
    this.nodes = campaignNodes(loadRecords());
    refs.nodes.innerHTML = campaignMarkup(this.nodes);
    this.mapState = { isOpen: true, trigger: document.activeElement };
    this.showScreen('campaign', { overlay: true, show: true });
    refs.overlay.setAttribute('aria-hidden', 'false');
    this.announceVisibility(true, { source: 'menu' });
    const id = defaultSectorId(this.nodes);
    this.select(id);
    refs.nodes
      .querySelector(`[data-campaign-sector="${id}"]`)
      ?.focus({ preventScroll: true });
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
