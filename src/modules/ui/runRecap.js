// src/modules/ui/runRecap.js

import { biomeForLayer } from '../../data/biomes.js';
import { CODEX_ENTRIES, codexIdOf } from '../../data/codex.js';
import {
  FAMILY_APEX_THRESHOLD,
  FAMILY_SYNERGY_THRESHOLD,
  UPGRADE_FAMILIES,
} from '../../data/upgrades/families.js';
import { trackFamily } from './hud/instruments/build/instrument.js';
import {
  brief,
  familyColor,
  familyForm,
  glyphMarkup,
  shortName,
  trackMarkup,
} from './upgradeCard.js';

// The run's framing (docs/NORTE.md §7 pillar 5): who killed the pilot, where,
// and the build — the pause panel's block, and the run end's (endBuildMarkup).

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

// The main form of the build: an Apex first, else the evolution of the family
// with the most cards; null before any.
function mainForm(weapon, counts) {
  const byCards = (a, b) => (counts[b.family] ?? 0) - (counts[a.family] ?? 0);
  return (
    [...weapon.evolutions].sort(
      (a, b) => Number(b.apex) - Number(a.apex) || byCards(a, b)
    )[0] ?? null
  );
}

const CARDS_LEFT = ['', 'one card', 'two cards', 'three cards'];

// "Apex 4/5 · one card from Solar Flare", or what the Apex does.
function familyGoal(family, owned, weaponId) {
  if (owned >= FAMILY_APEX_THRESHOLD) {
    const apex = familyForm(family, weaponId, true);
    return `<b>Apex</b> · ${brief(apex.description).toLowerCase()}`;
  }
  const apex = owned >= FAMILY_SYNERGY_THRESHOLD;
  const target = apex ? FAMILY_APEX_THRESHOLD : FAMILY_SYNERGY_THRESHOLD;
  const form = shortName(familyForm(family, weaponId, apex).name);
  const reached = apex
    ? `Apex ${owned}/${FAMILY_APEX_THRESHOLD}`
    : `${owned}/${FAMILY_SYNERGY_THRESHOLD}`;
  return `<b>${reached}</b> · ${CARDS_LEFT[target - owned]} from ${form}`;
}

function endFamilyMarkup(family) {
  const known = family.id in UPGRADE_FAMILIES;
  const glyphs = known
    ? Array.from(
        { length: FAMILY_APEX_THRESHOLD },
        (_, i) =>
          `${i === FAMILY_SYNERGY_THRESHOLD ? '<b class="end-fam__notch"></b>' : ''}${glyphMarkup(family.id, i < family.owned)}`
      ).join('')
    : '';
  const count = known
    ? `${Math.min(family.owned, FAMILY_APEX_THRESHOLD)}/${FAMILY_APEX_THRESHOLD}`
    : '';
  const tag =
    family.active && family.bonusName
      ? `<span class="end-fam__tag">${family.bonusName}</span>`
      : '';
  const cards = family.upgrades
    .map(({ name, level }) => `<b>${name}</b><sup>${level}</sup>`)
    .join(' · ');
  const color = known ? familyColor(family.id) : 'var(--text-dim)';
  return `<li class="end-fam" style="--fam: ${color}"><span class="end-fam__name">${family.name}</span><span class="end-fam__pips">${glyphs}</span><span class="end-fam__count">${count}</span><span class="end-fam__cards">${tag}${cards}</span></li>`;
}

/**
 * The run end's build: the weapon in its highest form with its other forms
 * as chips, the main family's track toward the Apex, then every family with
 * its cards and ranks.
 */
export function endBuildMarkup(build) {
  const { weapon } = build;
  const counts = Object.fromEntries(
    build.families.map(({ id, owned }) => [id, owned])
  );
  const main = mainForm(weapon, counts);
  const chips = [
    main?.apex ? '<span class="end-chip is-apex">Apex</span>' : '',
    ...weapon.evolutions
      .filter((evolution) => evolution !== main)
      .map(
        (evolution) =>
          `<span class="end-chip" style="--fam: ${familyColor(evolution.family)}">${shortName(evolution.name)}</span>`
      ),
  ].join('');
  const trackId = main?.family ?? trackFamily(counts)?.family ?? null;
  const owned = counts[trackId] ?? 0;
  const cells = trackMarkup({
    on: Math.min(owned, FAMILY_APEX_THRESHOLD),
    fresh: 0,
    total: FAMILY_APEX_THRESHOLD,
    notch: FAMILY_SYNERGY_THRESHOLD,
  });
  const track = trackId
    ? `<p class="end-wtrack" style="--fam: ${familyColor(trackId)}"><span class="end-wtrack__fam">${UPGRADE_FAMILIES[trackId].name}</span><span class="track">${cells}</span><span class="end-wtrack__goal">${familyGoal(trackId, owned, weapon.weaponId)}</span></p>`
    : '';
  const families = build.families.length
    ? `<ul class="end-fams">${build.families.map(endFamilyMarkup).join('')}</ul>`
    : '<p class="end-empty">No upgrades this run.</p>';
  const tone = main ? `var(--${main.apex ? 'apex' : 'fam'})` : 'var(--text)';
  const famColor = main ? familyColor(main.family) : 'var(--text)';
  return `<p class="end-lbl">Build</p>
    <p class="end-weapon${main?.apex ? ' is-apex' : ''}" style="--fam: ${famColor}; --tone: ${tone}"><span class="end-weapon__name">${main?.name ?? weapon.name}</span>${chips}</p>
    ${track}${families}`;
}
