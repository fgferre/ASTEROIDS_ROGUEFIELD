// src/modules/ui/upgradeCard.js
//
// An upgrade card's face, the same on the level-up screen and in a chest's
// reveal (the owner's mock-ups of 20/10). Rarity reads three ways: the top
// edge's colour, one to three slanted marks, and the frame (an epic one
// glows). The family reads by colour and by shape. Under the effect of the
// rank the card brings, its build line says what it does to the run: it
// completes the weapon's evolution or Apex, ranks a card up, replaces the
// weapon, or shows where its family leads. A weapon card stands apart: gold,
// cut corners and a drawing of its shot pattern.

import {
  FAMILY_APEX_THRESHOLD,
  FAMILY_SYNERGY_THRESHOLD,
  UPGRADE_FAMILIES,
} from '../../data/upgrades/families.js';
import { textForWeapon } from '../../data/upgrades/index.js';
import { trailOrderFromUrl } from '../player/newFlight.js';
import { WEAPON_APEX, WEAPON_EVOLUTIONS, WEAPONS } from '../../data/weapons.js';

// Each family's shape, 12 × 12: thermal a drop, kinetic a disc, arc a bolt,
// field a hexagon, salvage a diamond, maneuver a chevron.
export const FAMILY_GLYPHS = Object.freeze({
  thermal: 'M6 .8C8.6 4 10 6 10 7.9A4 4 0 0 1 2 7.9C2 6 3.4 4 6 .8Z',
  kinetic: 'M6 1.6A4.4 4.4 0 1 1 5.99 1.6Z',
  arc: 'M7.6 .4L2.4 6.9H5.9L4.4 11.6L9.6 5.1H6.1Z',
  field: 'M6 .8L10.5 3.4V8.6L6 11.2L1.5 8.6V3.4Z',
  salvage: 'M6 .8L11.2 6L6 11.2L.8 6Z',
  maneuver: 'M1.6 1.4L7.4 6L1.6 10.6H5L10.8 6L5 1.4Z',
});

// Monoline card drawings (40 × 40) of the cards the mock-ups drew; any other
// card wears its family's shape.
const CARD_ICONS = Object.freeze({
  afterburn_lance:
    '<path d="M20 4C26 12 30 17 30 23.5A10 10 0 0 1 10 23.5C10 18.5 12.5 15.5 15 11.5C16 15.5 18 17.5 20.5 17.5C19.2 12.5 19 8.5 20 4Z"/><path d="M20 35V28"/>',
  propulsors:
    '<path d="M13 6H27L31 19H9Z"/><path d="M14 25L20 30L26 25"/><path d="M16 31L20 35L24 31"/>',
  heat_sink: '<path d="M8 33H32"/><path d="M11 33V9M17 33V7M23 33V7M29 33V9"/>',
  plasma:
    '<circle cx="20" cy="20" r="6"/><ellipse cx="20" cy="20" rx="15" ry="6.5" transform="rotate(-25 20 20)"/>',
  multishot:
    '<path d="M7 20L33 9M7 20H33M7 20L33 31"/><circle cx="7" cy="20" r="2"/>',
  magfield:
    '<path d="M11 7V21A9 9 0 0 0 29 21V7"/><path d="M11 7H16V20.5A4 4 0 0 0 24 20.5V7H29"/>',
  ram_plating: '<path d="M6 10L34 20L6 30Z"/><path d="M14 16L24 20L14 24"/>',
  momentum_rounds:
    '<circle cx="30" cy="20" r="5"/><path d="M5 13H21M9 20H20M5 27H21"/>',
  close_quarters:
    '<path d="M7 14V7H14M26 7H33V14M33 26V33H26M14 33H7V26"/><circle cx="20" cy="20" r="4"/>',
});
const CURSED_ICON =
  '<path d="M20 5L35 33H5Z"/><path d="M20 15V24M20 28.5V29"/>';

const RARITY_MARKS = { common: 1, rare: 2, epic: 3 };

/** A family's accent: its style.css token, which Colorblind Mode swaps. */
export const familyAccent = (family) => `var(--family-${family})`;

/** A family's colour on the screens (Maneuver's violet lightened to read). */
export function familyColor(family) {
  if (!UPGRADE_FAMILIES[family]) return 'var(--text-dim)';
  return family === 'maneuver'
    ? 'var(--family-maneuver-light)'
    : familyAccent(family);
}

/** The family's shape, filled or as an outline. */
export function glyphMarkup(family, filled = true) {
  return `<svg class="glyph${filled ? '' : ' is-off'}" viewBox="0 0 12 12" aria-hidden="true"><path d="${FAMILY_GLYPHS[family]}"/></svg>`;
}

/** The weapon a weapon card swaps in, or null for any other card. */
export function weaponOfCard(cardId) {
  return (
    Object.values(WEAPONS).find((weapon) => weapon.card?.id === cardId) ?? null
  );
}

/**
 * A family's evolution (or Apex) as the held weapon has it: the weapon's own
 * `evolution`/`apex` on its card's family, else the lance's; Maneuver's are
 * the dash's (its bonus and its Apex).
 */
export function familyForm(family, weaponId, apex = false) {
  const weapon = WEAPONS[weaponId];
  const own =
    weapon?.card?.family === family
      ? weapon[apex ? 'apex' : 'evolution']
      : null;
  const lance = (apex ? WEAPON_APEX : WEAPON_EVOLUTIONS)[family];
  const dash = apex
    ? UPGRADE_FAMILIES[family].apex
    : UPGRADE_FAMILIES[family].bonus;
  return own ?? lance ?? dash;
}

// The patterns whose hits carry the lance evolutions (HitResolution's
// `lanceHit`: a projectile, a beam, a flak burst); chain, aura and orbit
// hits do not.
const LANCE_HIT_PATTERNS = new Set(['stream', 'beam', 'fan', 'seeker']);

/**
 * The weapon's own wording of a family's form (its `familyForms.lines`), or
 * null when the weapon does not carry the family.
 */
export function familyLine(family, weaponId, apex = false) {
  return WEAPONS[weaponId]?.familyForms?.lines[family]?.[apex ? 1 : 0] ?? null;
}

/**
 * "not with Shard Halo yet" when the family's lance form does nothing for
 * the weapon: it fires no lance hit, or the form only pierces and its
 * projectile does not; null for the weapon's own forms, the dash, or a form
 * that reaches it (a family the weapon carries too).
 */
export function notWithWeapon(family, weaponId, apex = false) {
  const weapon = WEAPONS[weaponId];
  const lance = (apex ? WEAPON_APEX : WEAPON_EVOLUTIONS)[family];
  if (
    !weapon ||
    !lance ||
    familyForm(family, weaponId, apex) !== lance ||
    familyLine(family, weaponId, apex)
  ) {
    return null;
  }
  const hits = weapon.fire.some(({ pattern }) =>
    LANCE_HIT_PATTERNS.has(pattern)
  );
  const onlyPierce = lance.pierce && !lance.damageMultiplier;
  return !hits || (onlyPierce && !weapon.projectile.pierce)
    ? `not with ${weapon.name} yet`
    : null;
}

/** "Incendiary Lance" → "Incendiary" (the HUD instrument's short form). */
export const shortName = (name) => name.replace(/ Lance$/, '');

/** A content sentence up to its first break: "Hits burn for 1.2 s". */
export function clause(text) {
  return String(text ?? '').split(/[:;,](?:\s|$)|\.(?:\s|$)/)[0];
}

const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);

const BRIEF_WORDS = 6;

/**
 * A form's few words: a first clause longer than BRIEF_WORDS stops before
 * its first "to", "for", "within", "as", "on" or "toward" past the second
 * word ("Burns spread").
 */
export function brief(text) {
  const words = clause(text).split(' ');
  if (words.length <= BRIEF_WORDS) return words.join(' ');
  const cut = words.findIndex(
    (word, i) => i > 1 && /^(to|for|within|as|on|toward)$/.test(word)
  );
  return words.slice(0, cut > 0 ? cut : BRIEF_WORDS).join(' ');
}

/**
 * "5th card in the hangar": the hangar's contract leaves a family fewer than
 * five cards this run (open and not sealed, or already held; the trail and
 * the fallback cards are outside the families), so its Apex opens there.
 */
export const FIFTH_IN_HANGAR = '5th card in the hangar';

export function fifthInHangar(progression, family) {
  if (progression.openCards === null && progression.sealedCards.size === 0) {
    return false;
  }
  let reachable = 0;
  progression.upgradeLookup.forEach((definition, id) => {
    if (
      definition.family !== family ||
      definition.fallback ||
      progression.pilotCardIds.includes(id)
    ) {
      return;
    }
    if (
      progression.getUpgradeCount(id) > 0 ||
      !progression.isOutOfContract(definition)
    ) {
      reachable += 1;
    }
  });
  return reachable < FAMILY_APEX_THRESHOLD;
}

/**
 * Where a card stands before it is applied: `rank` the rank it brings,
 * `owned` the family's distinct cards without it. `granted`: it was just
 * applied (a chest's card).
 */
export function cardState(progression, id, { granted = false } = {}) {
  const definition = progression.upgradeLookup.get(id);
  const count = progression.getUpgradeCount(id);
  const rank = granted ? count : count + 1;
  const { family } = definition;
  const familyCards = progression.getFamilyCounts()[family] ?? 0;
  const owned = granted && rank === 1 ? familyCards - 1 : familyCards;
  const piloting = progression.pilotCardIds.includes(id);
  // A step of the trail toward the Flight Computer: which one it is.
  let trail = null;
  if (piloting && rank <= (progression.trailSteps.get(id) ?? 0)) {
    const { done, total } = trailProgress(progression);
    trail = { step: done + (granted ? 0 : 1), total };
  }
  const fifthShort =
    !piloting &&
    family in UPGRADE_FAMILIES &&
    fifthInHangar(progression, family);
  return { definition, rank, owned, piloting, trail, fifthShort };
}

/**
 * What the card does to the build, as the screens draw it:
 * `kind` 'weapon' (from → to), 'completes' (title), 'rank', 'path' (steps)
 * or 'plain'; `label`, `note`, and a `track` ({ on, fresh, total, notch })
 * with its `end` text. `weapon`: the held one ({ weaponId, chip }).
 */
export function buildLine(
  definition,
  { rank, owned, weapon, piloting, fifthShort = false }
) {
  const { family } = definition;
  const isNew = rank === 1;
  const after = owned + (isNew ? 1 : 0);
  const swapped = weaponOfCard(definition.id);
  const familyTrack = {
    on: Math.min(owned, FAMILY_APEX_THRESHOLD),
    fresh: isNew && owned < FAMILY_APEX_THRESHOLD ? 1 : 0,
    total: FAMILY_APEX_THRESHOLD,
    notch: FAMILY_SYNERGY_THRESHOLD,
  };
  const completes =
    isNew &&
    (after === FAMILY_SYNERGY_THRESHOLD || after === FAMILY_APEX_THRESHOLD);

  if (swapped) {
    const apex = after === FAMILY_APEX_THRESHOLD;
    const evolved = completes ? familyForm(family, swapped.id, apex) : null;
    const notYet = evolved && notWithWeapon(family, swapped.id, apex);
    return {
      kind: 'weapon',
      label: 'Replaces',
      from: weapon.chip,
      to: swapped.name.toUpperCase(),
      note: evolved
        ? `Also completes ${evolved.name}${notYet ? ` (${notYet})` : ''}.`
        : 'One weapon card per run.',
    };
  }
  const highlight =
    textForWeapon(definition, weapon.weaponId)?.levels?.[rank - 1]
      ?.highlights?.[0] ?? '';
  // The piloting trail is outside the families: no count to show.
  if (piloting) {
    return { kind: 'plain', label: 'Piloting trail', note: highlight };
  }
  if (!UPGRADE_FAMILIES[family]) {
    return {
      kind: 'plain',
      label: definition.cursed ? 'Cursed · no family' : 'No family',
      note: highlight,
    };
  }
  const familyName = UPGRADE_FAMILIES[family].name;
  if (completes) {
    const apex = after === FAMILY_APEX_THRESHOLD;
    const form = familyForm(family, weapon.weaponId, apex);
    const bonus = UPGRADE_FAMILIES[family].bonus;
    const what =
      notWithWeapon(family, weapon.weaponId, apex) ??
      familyLine(family, weapon.weaponId, apex) ??
      clause(form.description);
    return {
      kind: 'completes',
      label: apex ? 'Completes · Apex' : 'Completes',
      title: form.name,
      note:
        apex || form === bonus
          ? what
          : `${what} · ${bonus.name} ${clause(bonus.description)}`,
      track: familyTrack,
      end: `Apex ${after}/${FAMILY_APEX_THRESHOLD}`,
    };
  }
  if (!isNew) {
    const max = definition.levels.length;
    return {
      kind: 'rank',
      label: `Rank ${rank} of ${max}`,
      note: familyStanding(family, owned, weapon.weaponId),
      track: { on: rank - 1, fresh: 1, total: max, notch: null },
      end: `${rank}/${max}`,
    };
  }
  const steps = [FAMILY_SYNERGY_THRESHOLD, FAMILY_APEX_THRESHOLD]
    .filter((at) => at > after)
    .map((at) => {
      const apex = at === FAMILY_APEX_THRESHOLD;
      const form = familyForm(family, weapon.weaponId, apex);
      const what =
        notWithWeapon(family, weapon.weaponId, apex) ??
        familyLine(family, weapon.weaponId, apex) ??
        lowerFirst(brief(form.description));
      return {
        at,
        name: form.name,
        what: apex && fifthShort ? `${what} · ${FIFTH_IN_HANGAR}` : what,
      };
    });
  return {
    kind: 'path',
    label: `${familyName} path`,
    note: steps.length
      ? ''
      : `Past the Apex: ${familyForm(family, weapon.weaponId, true).name}.`,
    steps,
    track: familyTrack,
    end: `${Math.min(after, FAMILY_APEX_THRESHOLD)}/${FAMILY_APEX_THRESHOLD}`,
  };
}

// A rank-up leaves the family where it is: "Kinetic stays 1/3 · Railshot at 3".
function familyStanding(family, owned, weaponId) {
  const name = UPGRADE_FAMILIES[family].name;
  if (owned < FAMILY_SYNERGY_THRESHOLD) {
    return `${name} stays ${owned}/${FAMILY_SYNERGY_THRESHOLD} · ${shortName(familyForm(family, weaponId).name)} at ${FAMILY_SYNERGY_THRESHOLD}`;
  }
  if (owned < FAMILY_APEX_THRESHOLD) {
    return `${name} stays ${owned}/${FAMILY_APEX_THRESHOLD} · ${shortName(familyForm(family, weaponId, true).name)} at ${FAMILY_APEX_THRESHOLD}`;
  }
  return `${name} at Apex`;
}

/** Cells `on`, then `fresh` lit ones, of `total`; a notch before `notch`. */
export function trackMarkup({ on, fresh, total, notch }) {
  return Array.from({ length: total }, (_, i) => {
    const state = i < on ? ' is-on' : i < on + fresh ? ' is-new' : '';
    return `${i === notch ? '<b class="track-notch"></b>' : ''}<i class="track-cell${state}"></i>`;
  }).join('');
}

// Numbers in an effect line stand out: "Fire rate <b>+11%</b>."
const emphasize = (text) =>
  String(text).replace(/([+-]?\d+(?:\.\d+)?%?)/g, '<b>$1</b>');

function rarityMarkup(definition) {
  const rarity =
    definition.rarity in RARITY_MARKS ? definition.rarity : 'common';
  const marks = Array.from(
    { length: 3 },
    (_, i) => `<i${i < RARITY_MARKS[rarity] ? ' class="is-on"' : ''}></i>`
  ).join('');
  return `<span class="card__rar" aria-hidden="true">${marks}</span><span class="card__rar-name">${
    definition.cursed ? 'Cursed' : rarity
  }</span>`;
}

function iconMarkup(definition) {
  const drawing =
    CARD_ICONS[definition.id] ??
    (UPGRADE_FAMILIES[definition.family]
      ? `<path transform="translate(5 5) scale(2.5)" d="${FAMILY_GLYPHS[definition.family]}"/>`
      : CURSED_ICON);
  return `<svg class="card__icon" viewBox="0 0 40 40" aria-hidden="true">${drawing}</svg>`;
}

function stateLabel(rank, max) {
  if (rank === 1) return 'New';
  return rank === max ? 'Max' : `Rank ${rank}`;
}

function buildLineMarkup(line) {
  const track = line.track
    ? `<span class="card__row"><span class="track">${trackMarkup(line.track)}</span><span class="card__end">${line.end}</span></span>`
    : '';
  const note = line.note ? `<span class="card__why">${line.note}</span>` : '';
  let body;
  if (line.kind === 'weapon') {
    body = `<span class="card__swap"><span class="card__from">${line.from}</span><span class="card__arrow">→</span><span>${line.to}</span></span>${note}`;
  } else if (line.kind === 'completes') {
    body = `<span class="card__what">${line.title}</span>${note}${track}`;
  } else if (line.kind === 'path') {
    const steps = line.steps
      .map(
        ({ at, name, what }) =>
          `<span class="card__step"><span class="card__at">At ${at}</span><b>${name}</b>${what}</span>`
      )
      .join('');
    body = `${track}${steps}${note}`;
  } else {
    body = `${track}${note}`;
  }
  return `<span class="card__build card__build--${line.kind}"><span class="card__lbl">${line.label}</span>${body}</span>`;
}

// The weapon's cut-corner double frame, stretched to the card.
const WEAPON_FRAME = (() => {
  const [w, h, c] = [344, 444, 22];
  const outline = (k) =>
    `M${c + k} ${k}H${w - k}V${h - c - k}L${w - c - k} ${h - k}H${k}V${c + k}Z`;
  return `<svg class="card__frame" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="card__frame-outer" d="${outline(0.5)}"/><path class="card__frame-inner" d="${outline(6)}"/><path class="card__frame-edge" d="M${c + 0.5} 0.5H${w - 0.5}"/></svg>`;
})();

// A small drawing of how the weapon fires, from its first pattern that is not
// the plain stream: a fan of bursting bolts, a beam after three shots, a
// jumping arc, or the stream itself.
function patternMarkup(weapon) {
  const patterns = weapon.fire.map((entry) => entry.pattern);
  const pattern = patterns.find((name) => name !== 'stream') ?? 'stream';
  const entry = weapon.fire.find((fire) => fire.pattern === pattern);
  const at = (angle, radius) => [
    (20 + Math.cos(angle) * radius).toFixed(1),
    (60 + Math.sin(angle) * radius).toFixed(1),
  ];
  let lines = '';
  if (pattern === 'fan') {
    const bolts = Math.min(7, entry.bolts ?? 5);
    for (let i = 0; i < bolts; i += 1) {
      const angle = ((i / (bolts - 1) - 0.5) * 56 * Math.PI) / 180;
      const [x0, y0] = at(angle, 40);
      const [x1, y1] = at(angle, 92);
      const [bx, by] = at(angle, 120).map(Number);
      const sparks = [0, 1, 2, 3, 4, 5]
        .map((k) => {
          const q = (k * Math.PI) / 3;
          const p = (r) =>
            `${(bx + Math.cos(q) * r).toFixed(1)} ${(by + Math.sin(q) * r).toFixed(1)}`;
          return `M${p(5)}L${p(10)}`;
        })
        .join('');
      lines += `<path d="M${x0} ${y0}L${x1} ${y1}" stroke-width="3"/><path d="${sparks}" stroke-width="1.4" opacity=".75"/>`;
    }
  } else if (pattern === 'beam') {
    lines =
      '<path d="M44 60H62M74 60H92M104 60H122" stroke-width="3"/><path d="M44 84H150" stroke-width="7" opacity=".9"/><path d="M44 84H150" stroke-width="2" stroke="#fff"/>';
  } else if (pattern === 'chain') {
    lines =
      '<path d="M40 60L62 46L78 64L102 40L118 70L140 52" stroke-width="2.4"/><circle cx="78" cy="64" r="5"/><circle cx="118" cy="70" r="5"/><circle cx="140" cy="52" r="5"/>';
  } else {
    lines =
      '<path d="M44 52H70M84 52H110M124 52H150M44 68H70M84 68H110M124 68H150" stroke-width="3"/>';
  }
  return `<svg class="card__pattern" viewBox="0 0 160 120" aria-hidden="true" style="--shot: ${weapon.card.themeColor}"><g class="card__shots">${lines}</g><path class="card__muzzle" d="M12 52L24 60L12 68Z"/></svg>`;
}

/** The card element's classes: rarity, family and weapon. */
export function cardClasses(definition) {
  const rarity = definition.cursed ? 'cursed' : definition.rarity;
  return [
    'card',
    `card--${rarity}`,
    weaponOfCard(definition.id) ? 'card--weapon' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * The card's inner markup (phrasing content: it sits in a button on the
 * level-up). `key`: the number shown top right, or null (a chest's card).
 * `held`: the card is held for the next level-up's offer.
 */
export function cardMarkup(definition, state, { weapon, key = null, held }) {
  const line = buildLine(definition, { ...state, weapon });
  const kbd = key === null ? '' : `<kbd class="card__key">${key}</kbd>`;
  const heldMark = held ? '<span class="card__held">Held</span>' : '';
  const swapped = weaponOfCard(definition.id);
  if (swapped) {
    return `${WEAPON_FRAME}${heldMark}<span class="card__top">${rarityMarkup(definition)}<span class="card__wtag">Weapon</span>${kbd}</span>
      <span class="card__wname">${swapped.name}</span>
      ${patternMarkup(swapped)}
      <span class="card__fx">${swapped.description}</span>
      ${buildLineMarkup(line)}`;
  }
  const max = definition.levels.length;
  const level =
    textForWeapon(definition, weapon.weaponId)?.levels?.[state.rank - 1] ?? {};
  const family = UPGRADE_FAMILIES[definition.family];
  const tag =
    family && !state.piloting
      ? `${glyphMarkup(definition.family)}${family.name}<span class="card__sep">·</span>`
      : '';
  const note =
    line.kind !== 'plain' && level.highlights?.[0]
      ? `<span class="card__fx2">${level.highlights[0]}</span>`
      : '';
  const trail = state.trail
    ? `<span class="card__trail"><i class="card__trail-mark" aria-hidden="true"></i>Trail · step ${state.trail.step} of ${state.trail.total}</span>`
    : '';
  // Temporary (?trilha=e): the trail's cards show no rarity.
  const rarity =
    state.piloting && trailOrderFromUrl() === 'e'
      ? ''
      : rarityMarkup(definition);
  return `${heldMark}${trail}<span class="card__top">${rarity}${kbd}</span>
    <span class="card__id">${iconMarkup(definition)}<span class="card__names">
      <span class="card__name">${definition.text?.name ?? definition.id}</span>
      <span class="card__tag">${tag}<span class="card__state">${stateLabel(state.rank, max)}</span></span>
    </span></span>
    <span class="card__fx">${emphasize(level.description ?? '')}</span>
    ${note}
    ${buildLineMarkup(line)}`;
}

/** Sets a card element's family colour (`--fam`). */
export function paintCard(element, definition) {
  element.style.setProperty('--fam', familyColor(definition.family));
}

// ---------- The run's card slots and piloting trail ----------
// The level-up's tray under the cards and the pause panel's right column
// (the owner's pick "C" of 16/11). A slot is a card held at rank 1 or more
// outside the piloting trail; the weapon card counts.

// A weapon card's slot: a fan of shots.
const WEAPON_ICON =
  '<path d="M9 20L31 8M9 20L33 14M9 20H34M9 20L33 26M9 20L31 32"/><circle cx="7" cy="20" r="2.5"/>';

/** The held cards in slots, the weapon card first: `{ ids, used, max }`. */
export function cardSlots(progression) {
  const { ids, used, max } = progression.getCardSlots();
  const weaponFirst = (id) => (weaponOfCard(id) ? 0 : 1);
  return {
    ids: [...ids].sort((a, b) => weaponFirst(a) - weaponFirst(b)),
    used,
    max,
  };
}

/** Each trail step's rank held of the rank it needs, and the steps done of all. */
export function trailProgress(progression) {
  const steps = new Map();
  let done = 0;
  let total = 0;
  progression.trailSteps.forEach((need, id) => {
    const have = Math.min(progression.getUpgradeCount(id), need);
    steps.set(id, { have, need });
    done += have;
    total += need;
  });
  return { steps, done, total };
}

function slotMarkup(progression, id, ghost = false) {
  const definition = progression.upgradeLookup.get(id);
  const weapon = Boolean(weaponOfCard(id));
  const drawing = weapon
    ? `<svg class="card__icon" viewBox="0 0 40 40" aria-hidden="true">${WEAPON_ICON}</svg>`
    : iconMarkup(definition);
  const rank = progression.getUpgradeCount(id);
  const classes = `run-slot${weapon ? ' is-weapon' : ''}${ghost ? ' is-ghost' : ''}`;
  const color = weapon ? 'var(--xp)' : familyColor(definition.family);
  const name = definition.text?.name ?? definition.id;
  return `<i class="${classes}" style="--fam: ${color}" title="${name}">${drawing}${
    weapon || ghost ? '' : `<em>${rank}</em>`
  }</i>`;
}

// The trail's map: Thrusters splits into a Brakes lane and an RCS lane, the
// Turret runs its own, and all three meet at the Flight Computer. A node per
// rank a step needs (columns COL apart, lanes LANE apart).
const COL = 34;
const LANE = 26;
const MAP_X = 70;
const MAP_Y = 22;
const at = (col, lane) => [MAP_X + col * COL, MAP_Y + lane * LANE];

function diamond([x, y], r, className) {
  return `<path class="${className}" d="M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z"/>`;
}

function trailMapMarkup({ steps }, offered) {
  const step = (id) => steps.get(id) ?? { have: 0, need: 1 };
  const lanes = ['braking_system', 'rcs_system'];
  const last = Math.max(...lanes.map((id) => step(id).need));
  const start = at(0, 0.5);
  const turret = at(Math.ceil(last / 2), 2);
  const goal = at(last + 1.5, 1);
  const edges = [];
  const nodes = [];
  const edge = (points, done) =>
    edges.push(
      `<path class="trail-map__edge${done ? ' is-done' : ''}" d="M${points.map((p) => p.join(' ')).join('L')}"/>`
    );
  // A node: done (filled), the step an offered card brings, or still open.
  const node = (point, id, index, r = 5) => {
    const { have } = step(id);
    if (index < have) nodes.push(diamond(point, r, 'trail-map__node is-done'));
    else if (index === have && offered.includes(id)) {
      nodes.push(diamond(point, r + 3.5, 'trail-map__ring'));
      nodes.push(diamond(point, r - 1, 'trail-map__node is-offered'));
    } else nodes.push(diamond(point, r, 'trail-map__node'));
  };
  const label = ([x, y], text, id, anchor = 'start') => {
    const { have, need } = step(id);
    const state =
      have >= need
        ? ' is-done'
        : have > 0 || offered.includes(id)
          ? ' is-on'
          : '';
    return `<text class="trail-map__lbl${state}" x="${x}" y="${y}" text-anchor="${anchor}">${text}</text>`;
  };
  const count = (id) =>
    step(id).need > 1 ? ` ${step(id).have}/${step(id).need}` : '';

  lanes.forEach((id, lane) => {
    const { have, need } = step(id);
    edge([start, at(0.5, lane), at(1, lane)], have > 0);
    for (let i = 1; i < need; i += 1) {
      edge([at(i, lane), at(i + 1, lane)], have > i);
    }
    edge([at(need, lane), at(last + 1, lane), goal], have >= need);
    for (let i = 0; i < need; i += 1) node(at(i + 1, lane), id, i);
  });
  const turretDone = step('auto_aim').have >= step('auto_aim').need;
  edge([turret, at(last + 1, 2), goal], turretDone);
  node(start, 'propulsors', 0);
  node(turret, 'auto_aim', 0);
  const goalStep = step('flight_computer');
  nodes.push(
    diamond(
      goal,
      7,
      `trail-map__goal${goalStep.have >= goalStep.need ? ' is-done' : ''}`
    )
  );
  if (goalStep.have < goalStep.need && offered.includes('flight_computer')) {
    nodes.push(diamond(goal, 11, 'trail-map__ring'));
  }
  const labels = [
    label(
      [start[0] - 9, start[1] + 3.5],
      `Thrusters${count('propulsors')}`,
      'propulsors',
      'end'
    ),
    label(
      [at(1, 0)[0] - 6, MAP_Y - 10],
      `Brakes${count('braking_system')}`,
      'braking_system'
    ),
    label(
      [at(1, 1)[0] - 6, MAP_Y + LANE - 8],
      `RCS${count('rcs_system')}`,
      'rcs_system'
    ),
    label(
      [turret[0] - 9, turret[1] + 3.5],
      `Turret${count('auto_aim')}`,
      'auto_aim',
      'end'
    ),
    `<text class="trail-map__lbl is-goal" x="${goal[0] + 11}" y="${goal[1] - 1}"><tspan>Flight</tspan><tspan x="${goal[0] + 11}" dy="12">Computer</tspan></text>`,
  ];
  const width = goal[0] + 66;
  const height = MAP_Y + 2 * LANE + 8;
  return `<svg class="trail-map" viewBox="0 0 ${width} ${height}" aria-hidden="true">${edges.join('')}${nodes.join('')}${labels.join('')}</svg>`;
}

/**
 * The tray's two parts: the card slots ("CARDS 5/8", amber and "Full ·
 * upgrades only" when full) and the trail map. `ghost`: the highlighted
 * offer, shown dashed in the next free slot when it would take one;
 * `offered`: the level-up's cards, whose trail steps ring on the map.
 */
export function runTrayMarkup(
  progression,
  { ghost = null, offered = [] } = {}
) {
  const slots = cardSlots(progression);
  const full = slots.used >= slots.max;
  const takesSlot =
    ghost &&
    !full &&
    progression.getUpgradeCount(ghost) === 0 &&
    !progression.pilotCardIds.includes(ghost) &&
    !progression.upgradeLookup.get(ghost).fallback;
  const boxes = Array.from({ length: slots.max }, (_, i) => {
    if (i < slots.used) return slotMarkup(progression, slots.ids[i]);
    if (i === slots.used && takesSlot)
      return slotMarkup(progression, ghost, true);
    return '<i class="run-slot is-empty"></i>';
  }).join('');
  const trail = trailProgress(progression);
  const tag = full
    ? '<span class="run-tray__full">Full · upgrades only</span>'
    : '';
  return `<div class="run-tray__part run-tray__cards${full ? ' is-full' : ''}">
      <p class="run-tray__head"><span class="run-tray__lbl">Cards</span><b class="run-tray__n">${slots.used}<small>/${slots.max}</small></b>${tag}</p>
      <div class="run-slots">${boxes}</div>
    </div>
    <div class="run-tray__part run-tray__trail">
      <p class="run-tray__head"><span class="run-tray__lbl">Piloting trail</span><b class="run-tray__n">${trail.done}<small>/${trail.total}</small></b><span class="run-tray__note">not a card slot</span></p>
      ${trailMapMarkup(trail, offered)}
    </div>`;
}
