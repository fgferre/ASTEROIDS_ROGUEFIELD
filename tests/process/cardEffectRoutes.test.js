// A card's effect is routed from the card itself (src/modules/cardEffectRoutes.js,
// 26/11): its `to` names the owning service, its `lands` where a stored effect
// goes, and any other effect is a function in the table the owner hands
// routeCardEffects, keyed by the event's name. So creating or tuning a card
// touches the card and the file where the effect happens, nothing else. The
// hand-written listener per effect must not come back: an effect's event is
// heard only through the router, except by the listeners excused below. The
// effects' events are the ones the cards declare, not a prefix:
// 'card-salvage' is one, 'upgrade-applied' is not. Comment lines are not read.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { declaredCardEffects } from '../../src/modules/cardEffectRoutes.js';

const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(dir, entry.name))
      : entry.name.endsWith('.js')
        ? [join(dir, entry.name)]
        : []
  );

// An effect's event heard outside the router, by file, with the reason.
const EXCUSED = [
  {
    file: 'src/modules/ui/FlightBriefing.js',
    event: 'upgrade-modern-flight',
    reason:
      "the Flight Computer's effect is an announcement (`to: []`): the briefing waits for it",
  },
  {
    file: 'src/bootstrap/botPilotAdapter.js',
    event: 'upgrade-modern-flight',
    reason:
      'the bot pilot hears the same announcement and answers the briefing',
  },
  {
    file: 'src/modules/EnemySystem.js',
    event: 'upgrade-no-heart-drops',
    owner: 'enemies',
    reason:
      "EnemySystem belongs to another conversation (26/11): Blood Ledger's card routes to 'enemies', whose own listener stays until that file calls the router",
  },
];

const sources = files('src')
  .map((f) => f.replaceAll('\\', '/'))
  .filter((f) => !f.startsWith('src/exported-assets/'))
  .filter((f) => !f.startsWith('src/public/libs/'))
  .map((f) => ({ f, text: readFileSync(f, 'utf8') }));

const effects = declaredCardEffects();
const events = new Set(effects.map(({ effect }) => effect.event));
const ownersOf = (effect) => [effect.to ?? []].flat();

// Every match of `pattern` (with the name in its first group) outside comment
// lines, as { f, line, name, text }.
const matches = (pattern) =>
  sources.flatMap(({ f, text }) => {
    const lines = text.split('\n');
    return [...text.matchAll(pattern)]
      .map((match) => {
        const line = text.slice(0, match.index).split('\n').length;
        return { f, line, name: match[1], text: lines[line - 1].trim() };
      })
      .filter(({ text: code }) => !/^(\/\/|\/\*|\*)/.test(code));
  });

// The quoted keys at the top of the object literal that is the 4th argument of
// the routeCardEffects( call at `from`: the table handed to the router, not
// every 'name': in the file. Strings and comments are skipped while scanning.
function tableKeys(text, from) {
  const keys = [];
  const stack = [];
  let arg = 0;
  let i = text.indexOf('(', text.indexOf('routeCardEffects', from));
  for (; i < text.length; i++) {
    const ch = text[i];
    if (text.startsWith('//', i)) i = text.indexOf('\n', i);
    else if (text.startsWith('/*', i)) i = text.indexOf('*/', i) + 1;
    else if (ch === "'" || ch === '"' || ch === '`') {
      const start = i;
      for (i++; text[i] !== ch; i++) if (text[i] === '\\') i++;
      const inTable = arg === 3 && stack.length === 2 && stack[1] === '{';
      const key = /^\s*:/.test(text.slice(i + 1, i + 8));
      if (inTable && key) keys.push(text.slice(start + 1, i));
    } else if ('({['.includes(ch)) stack.push(ch);
    else if (')}]'.includes(ch)) {
      stack.pop();
      if (!stack.length) break;
    } else if (ch === ',' && stack.length === 1) arg++;
  }
  return keys;
}

// The owners: who calls routeCardEffects, as which service, and the events of
// the functions in its file (the table's keys).
const owners = new Map(
  matches(/routeCardEffects\(\s*this,\s*'([\w-]+)'/g).map((call) => {
    const { text } = sources.find(({ f }) => f === call.f);
    const from = text
      .split('\n')
      .slice(0, call.line - 1)
      .join('\n').length;
    const keys = tableKeys(text, from + 1);
    return [call.name, { ...call, functions: new Set(keys) }];
  })
);
const excusedOwners = new Set(EXCUSED.map(({ owner }) => owner));

// An effect's event subscribed by hand: registerEventListener('x', ...),
// bus.on('x', ...), bus.once('x', ...), or a listener table's { on: 'x' }.
const listeners = matches(
  /(?:registerEventListener|\.on|\.once)\(\s*['"`]([\w:-]+)['"`]/g
)
  .concat(matches(/\bon:\s*['"`]([\w:-]+)['"`]/g))
  .filter(({ name }) => events.has(name));

// An effect's event named anywhere else in the code, whatever holds it (a
// constant, a table): the literal itself is the signal. The declarations and
// the router are where the names belong; the rest is named below.
const NAMED_OK = [
  {
    file: 'src/modules/collectibles/PickupSystem.js',
    event: 'upgrade-weapon-tuning',
    reason: "PickupSystem emits the weapon tuning's announcement itself",
  },
];
const nameHome = (f) =>
  f.startsWith('src/content/cards/') ||
  f.startsWith('src/data/upgrades/') ||
  f === 'src/modules/cardEffectRoutes.js';
// Looked up per event name, not by pairing quotes, so an apostrophe in a
// comment cannot hide a literal further down the file.
const namings = [...events].flatMap((event) =>
  matches(new RegExp(`['"\`](${event})['"\`]`, 'g'))
);
// The owner's own table is where its functions are named, by key.
const isTableKey = ({ f, name, text }) =>
  owners
    .get([...owners.keys()].find((o) => owners.get(o).f === f))
    ?.functions.has(name) && /^['"][\w:-]+['"]\s*:/.test(text);
const isExcused = ({ f, name }) =>
  EXCUSED.some(({ file, event }) => file === f && event === name);

describe('card effects routed from the card', () => {
  it('every event effect names its owner in `to`', () => {
    const offenders = effects
      .filter(({ effect }) => !('to' in effect))
      .map(
        ({ source, effect }) => `${source}: '${effect.event}' has no \`to\``
      );
    expect([...new Set(offenders)]).toEqual([]);
  });

  it('`to` names a service that routes its effects', () => {
    const offenders = effects.flatMap(({ source, effect }) =>
      ownersOf(effect)
        .filter((owner) => !owners.has(owner) && !excusedOwners.has(owner))
        .map(
          (owner) =>
            `${source}: '${effect.event}' goes to '${owner}', which does not call routeCardEffects`
        )
    );
    expect([...new Set(offenders)]).toEqual([]);
  });

  it('every declaration of one event agrees on `to` and `lands`', () => {
    const first = new Map();
    const offenders = effects.flatMap(({ source, effect }) => {
      const route = JSON.stringify({ to: effect.to, lands: effect.lands });
      if (!first.has(effect.event)) first.set(effect.event, { source, route });
      const seen = first.get(effect.event);
      return seen.route === route
        ? []
        : [
            `'${effect.event}': ${seen.source} says ${seen.route}, ${source} says ${route}`,
          ];
    });
    expect([...new Set(offenders)]).toEqual([]);
  });

  it('an owner has a function for each effect it does not store', () => {
    const offenders = effects
      .filter(({ effect }) => !effect.lands)
      .flatMap(({ source, effect }) =>
        ownersOf(effect)
          .map((owner) => owners.get(owner))
          .filter((owner) => owner && !owner.functions.has(effect.event))
          .map(
            ({ f, line, name }) =>
              `${f}:${line}: '${name}' has no function for '${effect.event}' (${source}, no \`lands\`)`
          )
      );
    expect([...new Set(offenders)]).toEqual([]);
  });

  it('no effect is heard outside the router, but the excused listeners', () => {
    const offenders = listeners
      .filter((listener) => !isExcused(listener))
      .map(({ f, line, text }) => `${f}:${line}: ${text}`);
    expect(offenders).toEqual([]);
  });

  it('no effect event is named outside its card, the router and the named exceptions', () => {
    const offenders = namings
      .filter(({ f }) => !nameHome(f))
      .filter((naming) => !isExcused(naming) && !isTableKey(naming))
      .filter(
        ({ f, name }) =>
          !NAMED_OK.some(({ file, event }) => file === f && event === name)
      )
      .map(({ f, line, name, text }) => `${f}:${line}: '${name}' in ${text}`);
    expect(offenders).toEqual([]);
  });

  it('every excused listener is still there, and every announcement is heard', () => {
    const stale = EXCUSED.filter(
      ({ file, event }) =>
        !listeners.some(({ f, name }) => f === file && name === event)
    ).map(({ file, event }) => `${file}: no longer hears '${event}'`);
    const namedGone = NAMED_OK.filter(
      ({ file, event }) =>
        !namings.some(({ f, name }) => f === file && name === event)
    ).map(({ file, event }) => `${file}: no longer names '${event}'`);
    const unheard = effects
      .filter(({ effect }) => 'to' in effect && !ownersOf(effect).length)
      .filter(
        ({ effect }) => !listeners.some(({ name }) => name === effect.event)
      )
      .map(({ source, effect }) => `${source}: nobody hears '${effect.event}'`);
    expect([...stale, ...namedGone, ...new Set(unheard)]).toEqual([]);
  });
});
