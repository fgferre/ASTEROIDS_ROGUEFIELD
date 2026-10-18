// src/modules/ui/codexTabs.js

// The Codex screen's two tabs, ENEMIES and ACHIEVEMENTS: markup and count
// line for each. CodexScreen wires the tab buttons and the keys.

export const CODEX_TABS = ['enemies', 'achievements'];

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// Wardens and Heralds are met once a run and fall or don't; the rest are
// counted by the swarm.
function codexMetaText(entry) {
  const { firstLayer, kills } = entry.seen;
  if (entry.warden || entry.herald) {
    return `FIRST SEEN · LAYER ${firstLayer} · DEFEATED ×${kills}`;
  }
  return `From layer ${entry.fromLayer} · First contact: layer ${firstLayer} · Destroyed: ${kills}`;
}

// One Codex row; an entry never met shows as a dark silhouette, unnamed.
function codexEntryMarkup(entry) {
  const known = Boolean(entry.seen);
  const classes = `codex-entry${known ? '' : ' is-unknown'}${
    entry.warden ? ' is-warden' : ''
  }${entry.herald ? ' is-herald' : ''}`;
  const glyph = `<svg class="codex-entry__glyph" viewBox="-16 -16 32 32" aria-hidden="true">${entry.glyph}</svg>`;
  if (!known) {
    return `<li class="${classes}">${glyph}
      <div class="codex-entry__text">
        <h3 class="codex-entry__name">Unknown signal</h3>
        <p class="codex-entry__meta">Below layer ${entry.fromLayer}</p>
        <p class="codex-entry__lore">No contact logged. Go deeper.</p>
      </div></li>`;
  }
  return `<li class="${classes}">${glyph}
    <div class="codex-entry__text">
      <h3 class="codex-entry__name">${entry.name}</h3>
      <p class="codex-entry__meta">${codexMetaText(entry)}</p>
      <p class="codex-entry__lore">${entry.lore}</p>
      <p class="codex-entry__hint">${entry.hint}</p>
    </div></li>`;
}

function unlockDateText(iso) {
  const date = new Date(iso);
  return `Unlocked ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** One achievement card: glyph, title, description, then date or progress. */
export function achievementCardMarkup(entry) {
  const unlocked = Boolean(entry.unlockedAt);
  let status = 'Locked';
  let bar = '';
  if (unlocked) {
    status = unlockDateText(entry.unlockedAt);
  } else if (entry.target) {
    status = `${entry.progress} / ${entry.target}`;
    const percent = Math.round((entry.progress / entry.target) * 100);
    bar = `<span class="achievement-card__bar" aria-hidden="true"><span style="width: ${percent}%"></span></span>`;
  }
  return `<li class="achievement-card ${unlocked ? 'is-unlocked' : 'is-locked'}" data-achievement="${entry.id}">
    <span class="achievement-card__glyph" aria-hidden="true">${entry.glyph}</span>
    <div class="achievement-card__text">
      <h3 class="achievement-card__title">${entry.title}</h3>
      <p class="achievement-card__desc">${entry.description}</p>
      <p class="achievement-card__status">${status}</p>${bar}
    </div></li>`;
}

/** List markup, count line and list label for a Codex tab. */
export function codexTabView(tab, { enemies, achievements }) {
  if (tab === 'achievements') {
    const unlocked = achievements.filter((entry) => entry.unlockedAt).length;
    return {
      markup: achievements.map(achievementCardMarkup).join(''),
      count: `${unlocked} / ${achievements.length} unlocked`,
      label: 'Achievements',
    };
  }
  const found = enemies.filter((entry) => entry.seen).length;
  return {
    markup: enemies.map(codexEntryMarkup).join(''),
    count: `${found} / ${enemies.length} signals logged`,
    label: 'Enemies of the Field',
  };
}

/** The tab one step left (-1) or right (+1) of `tab`, wrapping. */
export function adjacentCodexTab(tab, step) {
  const index = CODEX_TABS.indexOf(tab);
  return CODEX_TABS[(index + step + CODEX_TABS.length) % CODEX_TABS.length];
}
