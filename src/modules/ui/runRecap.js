// src/modules/ui/runRecap.js

import { biomeForLayer } from '../../data/biomes.js';
import { CODEX_ENTRIES, codexIdOf } from '../../data/codex.js';
import {
  FAMILY_SYNERGY_THRESHOLD,
  UPGRADE_FAMILIES,
} from '../../data/upgrades/families.js';

// The run's framing (docs/NORTE.md §7 pillar 5): who killed the pilot, where,
// and the build — one markup for the game over recap and the pause panel.

/** "Elite Ram", "Warden Choir"; "the Field" when the last hit had no source. */
export function killerName(source) {
  const id = codexIdOf(source);
  const name =
    source?.displayName || CODEX_ENTRIES.find((entry) => entry.id === id)?.name;
  if (!name) return 'the Field';
  return source.elite && !name.startsWith('Elite ') ? `Elite ${name}` : name;
}

export function formatRunTime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * "Layer 9 · 7:42 · CHAPTER II — THE DENSE CORE · BEST LAYER 12" (time and
 * best layer left out when null).
 */
export function runLocationLine(layer, totalSeconds = null, bestLayer = null) {
  const n = Math.max(1, Math.floor(Number(layer) || 1));
  const parts = [`Layer ${n}`];
  if (totalSeconds !== null) parts.push(formatRunTime(totalSeconds));
  parts.push(biomeForLayer(n).title);
  if (bestLayer !== null) parts.push(`BEST LAYER ${bestLayer}`);
  return parts.join(' · ');
}

/** The run's build from the live services: weapon, evolutions, families. */
export function collectBuild(progression, combat) {
  const { families: counts, synergies } = progression.getSynergySnapshot();
  const active = new Set(synergies.map((entry) => entry.family));
  const groups = new Map();
  progression.getUpgradeProgressSnapshot().forEach(({ id, level, family }) => {
    if (!(level > 0)) return;
    const definition = progression.upgradeLookup?.get(id) || {};
    const key = family in UPGRADE_FAMILIES ? family : 'other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      name: definition.text?.name || definition.name || id,
      level,
      maxLevel: Math.max(level, definition.levels?.length ?? level),
    });
  });

  const families = [...groups.entries()].map(([id, upgrades]) => {
    const family = UPGRADE_FAMILIES[id];
    return {
      id,
      name: family?.name ?? 'Other',
      color: family?.color ?? null,
      bonusName: family?.bonus.name ?? null,
      owned: counts[id] ?? upgrades.length,
      active: active.has(id),
      upgrades,
    };
  });

  return { weapon: combat.getWeaponState(), families };
}

/** Filled/empty dots in the family's colour (level-up cards and the build). */
export function pipsMarkup(filled, total) {
  return Array.from(
    { length: total },
    (_, index) =>
      `<span class="family-pip${index < filled ? ' is-filled' : ''}"></span>`
  ).join('');
}

const familyStyle = (color) =>
  color ? ` style="--family-color: ${color}"` : '';

function familyMarkup(family) {
  const synergy = family.bonusName
    ? `<p class="upgrade-option__family-progress${
        family.active ? ' is-active' : family.owned > 0 ? ' is-building' : ''
      }">
        <span class="family-pips" aria-hidden="true">${pipsMarkup(
          family.owned,
          FAMILY_SYNERGY_THRESHOLD
        )}</span>
        <span>${
          family.active
            ? `${family.name} · ${family.bonusName} online`
            : `${family.name} ${Math.min(family.owned, FAMILY_SYNERGY_THRESHOLD)}/${FAMILY_SYNERGY_THRESHOLD} · ${family.bonusName}`
        }</span>
      </p>`
    : `<p class="upgrade-option__family-progress">${family.name}</p>`;
  const upgrades = family.upgrades
    .map(
      (upgrade) =>
        `<li class="gameover-build__item">${upgrade.name}
          <span class="family-pips" aria-label="Rank ${upgrade.level} of ${
            upgrade.maxLevel
          }">${pipsMarkup(upgrade.level, upgrade.maxLevel)}</span></li>`
    )
    .join('');
  return `<li class="run-build__family${
    family.active ? ' is-active' : ''
  }"${familyStyle(family.color)}>
      ${synergy}
      <ul class="run-build__upgrades">${upgrades}</ul>
    </li>`;
}

/** The build block: weapon and evolution chips, then upgrades by family. */
export function buildBlockMarkup(build) {
  const evolutions = build.weapon.evolutions
    .map(
      (evolution) =>
        `<span class="upgrade-option__family" title="${
          evolution.description || ''
        }"${familyStyle(UPGRADE_FAMILIES[evolution.family]?.color)}>${
          evolution.name
        }</span>`
    )
    .join('');
  const families = build.families.length
    ? `<ul class="run-build__families">${build.families
        .map(familyMarkup)
        .join('')}</ul>`
    : '<p class="run-build__empty">No upgrades yet</p>';
  return `<div class="run-build__weapon">
      <span class="run-build__label">Weapon</span>
      <span class="run-build__weapon-name">${build.weapon.name}</span>
      ${evolutions}
    </div>
    ${families}`;
}

/**
 * The death/victory screen's quote: the last transmission, labelled like its
 * HUD banner; empty when no line was shown.
 */
export function transmissionQuoteMarkup(line) {
  if (!line) return '';
  return `<figcaption class="run-recap__quote-speaker">▌TRANSMISSION — ${line.speaker}</figcaption>
    <blockquote class="run-recap__quote-line">${line.text}</blockquote>`;
}
