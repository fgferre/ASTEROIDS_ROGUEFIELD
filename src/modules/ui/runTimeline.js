// src/modules/ui/runTimeline.js
//
// The run end's story (the owner's mock-ups of 20/10): the headline by how
// far the run got, the run as a line across its layers in three chapters
// with what happened on it (the moments WorldSystem.recordRunEvent kept),
// the best moment and the line that invites the next run.

import { BIOMES, biomeForLayer } from '../../data/biomes.js';
import { RUN_FINAL_LAYER } from '../../data/constants/gameplay.js';
import { BOSS_RUSH_LAYERS, directorFor } from '../../data/layers.js';
import { formatRunTime, killerName } from './runRecap.js';
import { FAMILY_GLYPHS, familyColor, shortName } from './upgradeCard.js';

const NUMBER_WORDS = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
];

/**
 * The headline: `kicker` over `title` (with `of`), the `line` under it and a
 * `badge` ('New best') or null. `outcome` 'death' | 'victory'; `layer` the
 * layer reached; `bossRush` its { stage } on a Boss Rush; `wardens` killed.
 */
export function runHeadline({
  outcome,
  layer,
  bossRush,
  wardens,
  time,
  newBest,
}) {
  if (outcome === 'victory') {
    return {
      kicker: 'The Ring is quiet',
      title: bossRush ? 'Boss Rush cleared' : 'Field cleared',
      of: '',
      line: bossRush
        ? `${BOSS_RUSH_LAYERS.length} Wardens · ${formatRunTime(time)}`
        : `All ${RUN_FINAL_LAYER} layers · ${wardens} Wardens · ${formatRunTime(time)}`,
      badge: newBest ? 'New best' : null,
    };
  }
  if (bossRush) {
    return {
      kicker: 'Signal lost',
      title: `Warden ${bossRush.stage}`,
      of: `of ${BOSS_RUSH_LAYERS.length}`,
      line: 'Boss Rush',
      badge: null,
    };
  }
  const deep = layer > RUN_FINAL_LAYER;
  return {
    kicker: 'Signal lost',
    title: `Layer ${layer}`,
    of: deep ? 'Deep Field' : `of ${RUN_FINAL_LAYER}`,
    line: deep
      ? `The Deep Field · ${layer - RUN_FINAL_LAYER} past the Ring`
      : biomeForLayer(layer).title,
    badge: null,
  };
}

/** "Killed by an Elite Ram"; a Warden and the Field take no article. */
export function killedByLine(source) {
  const name = killerName(source);
  if (/^(Warden|the) /.test(name)) return { lead: 'Killed by', name };
  return { lead: `Killed by ${/^[AEIOU]/.test(name) ? 'an' : 'a'}`, name };
}

/** The invitation under the run: how far the best is, or the Deep Field. */
export function inviteLine({ outcome, layer, bestAtStart, bossRush }) {
  if (outcome === 'victory') {
    return bossRush
      ? 'The Wardens will be back. <b>Beat the clock.</b>'
      : `The Deep Field goes on past layer ${RUN_FINAL_LAYER}. <b>Same build.</b>`;
  }
  if (bossRush) return 'Three Wardens, back to back. <b>Again.</b>';
  if (bestAtStart > layer) {
    const gap = bestAtStart - layer;
    const words = NUMBER_WORDS[gap] ?? `${gap}`;
    return `Your best is <b>Layer ${bestAtStart}</b>. ${words} ${gap === 1 ? 'layer' : 'layers'} to go.`;
  }
  if (bestAtStart > 0 && bestAtStart === layer) {
    return `You matched your best: <b>Layer ${layer}</b>.`;
  }
  return layer > RUN_FINAL_LAYER
    ? `A new best: <b>Layer ${layer}</b>. The Deep Field goes on.`
    : `A new best: <b>Layer ${layer}</b>. The Ring goes on to ${RUN_FINAL_LAYER}.`;
}

const wardenName = (event, count) => {
  const name = event.name ?? 'Warden';
  return count > 1 ? name.replace(/^Warden /, '') : name;
};

/** The best moment: the last Warden on a win, else the best combo, else a Warden or the latest form. */
export function bestMoment(timeline, outcome) {
  const wardens = timeline.filter(({ kind }) => kind === 'warden');
  const last = wardens[wardens.length - 1];
  const where = (event) =>
    `Layer ${event.layer} · ${formatRunTime(event.time)}`;
  if (outcome === 'victory' && last) {
    return {
      tone: 'warden',
      title: last.fight
        ? `${wardenName(last, 2)} down in ${formatRunTime(last.fight)}`
        : `${wardenName(last, 2)} down`,
      where: `Layer ${last.layer} · the last Warden`,
    };
  }
  const combo = timeline.find(({ kind }) => kind === 'combo');
  if (combo && combo.combo > 1) {
    return {
      tone: 'combo',
      title: `×${combo.combo} combo`,
      where: where(combo),
    };
  }
  if (last) {
    return {
      tone: 'warden',
      title: `${wardenName(last, 2)} down`,
      where: where(last),
    };
  }
  return null;
}

// "CHAPTER II — THE DENSE CORE" → "II · DENSE CORE".
const chapterLabel = (title) =>
  title.replace(/^CHAPTER (\S+) — (THE )?/, '$1 · ');

const W = 1040;
const Y = 70;

/**
 * The line's model: `span` layers across, the layer `reached` (a fraction
 * into it on a death), the Warden layers, the chapters, and each event with
 * where it sits (`at`), its side, its row and its labels (the best layer
 * before the run is one, ahead of a death). An evolution or Apex keeps the
 * name it had when it happened (WorldSystem.recordFamilyForm).
 */
export function timelineModel({ timeline, outcome, layer, bestAtStart = 0 }) {
  const cleared = outcome === 'victory';
  const span = Math.max(RUN_FINAL_LAYER, layer);
  const reached = cleared ? span : Math.min(span, layer + 0.5);
  const wardenLayers = [];
  for (let n = 1; n <= span; n += 1) {
    if (directorFor(n).warden) wardenLayers.push(n);
  }
  const chapters = BIOMES.map((biome, i) => ({
    label: chapterLabel(biome.title),
    from: biome.layers[0],
    to: i === BIOMES.length - 1 ? RUN_FINAL_LAYER : biome.layers[1],
  }));
  if (span > RUN_FINAL_LAYER) {
    chapters.push({ label: 'DEEP FIELD', from: RUN_FINAL_LAYER + 1, to: span });
  }

  const wardens = timeline.filter(({ kind }) => kind === 'warden');
  const deaths = timeline.filter(({ kind }) => kind === 'death');
  const killed = new Set();
  const events = timeline.flatMap((event) => {
    const time = formatRunTime(event.time);
    const mid = Math.min(span, event.layer + 0.5);
    switch (event.kind) {
      case 'evolution':
      case 'apex': {
        const apex = event.kind === 'apex';
        return [
          {
            kind: event.kind,
            family: event.family,
            at: mid,
            up: true,
            title: apex ? `Apex · ${shortName(event.name)}` : event.name,
            sub: time,
            color: apex ? 'var(--apex)' : familyColor(event.family),
          },
        ];
      }
      case 'combo':
        return [
          {
            kind: 'combo',
            at: mid,
            up: true,
            title: `×${event.combo} combo`,
            sub: time,
            color: 'var(--xp)',
          },
        ];
      case 'warden':
        killed.add(event.layer);
        return [
          {
            kind: 'warden',
            at: event.layer,
            up: false,
            title: `${wardenName(event, wardens.length)} down`,
            sub: event.fight
              ? `${time} · fight ${formatRunTime(event.fight)}`
              : time,
            color: 'var(--boss-light)',
          },
        ];
      case 'death': {
        const final = event === deaths[deaths.length - 1] && !cleared;
        return [
          {
            kind: final ? 'death' : 'retry',
            at: final ? reached : mid,
            up: false,
            title: final ? killerName(event.killer) : 'Retry',
            sub: time,
            color: 'var(--danger)',
          },
        ];
      }
      default:
        return [];
    }
  });
  // The best layer before this run, ahead of where it ended.
  if (!cleared && bestAtStart > layer && bestAtStart <= span) {
    events.push({
      kind: 'best',
      at: bestAtStart,
      up: true,
      title: 'Your best',
      sub: `LAYER ${bestAtStart}`,
      color: 'var(--xp)',
    });
  }
  placeLabels(events, span);
  return {
    span,
    reached,
    cleared,
    wardenLayers: wardenLayers.map((n) => ({ layer: n, down: killed.has(n) })),
    chapters,
    events,
  };
}

// Labels a side keeps apart: one that would overlap the last on its row
// moves out a row (two rows a side, the outer one further from the line).
function placeLabels(events, span) {
  const gap = 2.1 * ((span - 1) / (RUN_FINAL_LAYER - 1));
  const last = { true: [-Infinity, -Infinity], false: [-Infinity, -Infinity] };
  [...events]
    .sort((a, b) => a.at - b.at)
    .forEach((event) => {
      const rows = last[event.up];
      event.row = event.at - rows[0] >= gap || event.at - rows[1] < gap ? 0 : 1;
      rows[event.row] = event.at;
    });
}

const x = (model, at) => ((at - 1) / (model.span - 1)) * W;

function hexPoints(cx, cy, r) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
  }).join(' ');
}

function markMarkup(event, cx) {
  switch (event.kind) {
    case 'evolution':
      return `<path class="rl-mark" transform="translate(${cx - 7.2} ${Y - 7.2}) scale(1.2)" d="${FAMILY_GLYPHS[event.family]}" style="fill: ${event.color}"/>`;
    case 'apex':
      return `<path class="rl-mark rl-apex" d="M${cx} ${Y - 10}L${cx + 4} ${Y - 3}L${cx + 11} ${Y}L${cx + 4} ${Y + 3}L${cx} ${Y + 10}L${cx - 4} ${Y + 3}L${cx - 11} ${Y}L${cx - 4} ${Y - 3}Z"/>`;
    case 'combo':
      return `<path class="rl-mark rl-combo" d="M${cx} ${Y - 7}L${cx + 7} ${Y}L${cx} ${Y + 7}L${cx - 7} ${Y}Z"/>`;
    case 'best':
      return `<path class="rl-best-pole" d="M${cx} ${Y - 16}V${Y + 6}"/><path class="rl-best-flag" d="M${cx} ${Y - 16}h9l-3 3.5 3 3.5h-9z"/>`;
    case 'death':
    case 'retry': {
      const r = event.kind === 'death' ? 8 : 5;
      return `<path class="rl-mark rl-x${event.kind === 'retry' ? ' is-small' : ''}" d="M${cx - r} ${Y - r}L${cx + r} ${Y + r}M${cx + r} ${Y - r}L${cx - r} ${Y + r}"/>`;
    }
    default:
      return '';
  }
}

function labelMarkup(event, cx) {
  const anchor = cx > W - 70 ? 'end' : cx < 70 ? 'start' : 'middle';
  const out = event.row * 38;
  const titleY = event.up ? Y - 46 - out : Y + 32 + out;
  const lead = event.up
    ? `<path class="rl-lead" d="M${cx} ${Y - 14}V${Y - 22 - out}"/>`
    : out
      ? `<path class="rl-lead" d="M${cx} ${Y + 14}V${Y + 16 + out}"/>`
      : '';
  return `${lead}<text class="rl-title" x="${cx}" y="${titleY}" text-anchor="${anchor}" style="fill: ${event.color}">${event.title}</text><text class="rl-sub" x="${cx}" y="${titleY + 17}" text-anchor="${anchor}">${event.sub}</text>`;
}

/** The run line as SVG (CSS: .runline in runEndScreens.css). */
export function timelineMarkup(model) {
  const end = x(model, model.reached);
  const ticks = Array.from({ length: model.span }, (_, i) => i + 1)
    .filter((n) => !model.wardenLayers.some(({ layer }) => layer === n))
    .map((n) => {
      const cx = x(model, n);
      return `<path class="rl-tick${n <= model.reached ? ' is-done' : ''}" d="M${cx} ${Y - 4}V${Y + 4}"/>`;
    })
    .join('');
  const chapters = model.chapters
    .map(({ label, from, to }, i) => {
      const x1 = (i === 0 ? x(model, from) : x(model, from - 0.5)) + 6;
      const x2 = x(model, to) - 6;
      return `<path class="rl-bracket" d="M${x1} ${Y + 74}V${Y + 78}H${x2}V${Y + 74}"/><text class="rl-chapter" x="${(x1 + x2) / 2}" y="${Y + 96}" text-anchor="middle">${label}</text>`;
    })
    .join('');
  const wardens = model.wardenLayers
    .map(
      ({ layer, down }) =>
        `<polygon class="rl-warden${down ? ' is-down' : ''}" points="${hexPoints(x(model, layer), Y, 8)}"/>`
    )
    .join('');
  const clear = model.cleared
    ? `<circle class="rl-clear" cx="${x(model, model.span)}" cy="${Y}" r="14"/>`
    : '';
  const events = model.events
    .map((event) => {
      const cx = x(model, event.at);
      return `${markMarkup(event, cx)}${labelMarkup(event, cx)}`;
    })
    .join('');
  return `<svg class="runline${model.cleared ? ' is-cleared' : ''}" viewBox="-20 -40 ${W + 40} 220" aria-hidden="true">
    <path class="rl-ahead" d="M0 ${Y}H${W}"/>
    <path class="rl-done" d="M0 ${Y}H${end}"/>
    ${ticks}${wardens}${chapters}${clear}${events}
  </svg>`;
}
