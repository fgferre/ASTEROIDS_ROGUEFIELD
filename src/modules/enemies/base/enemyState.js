// What a Retry brings back of an enemy (outside audit 8, verdict A8; the fight
// goes on where it stopped): every own field that is plain data, at any
// depth, copied at the death and set again once the enemy is rebuilt the way
// it was born. Plain data is numbers, text, lists, Sets and plain objects; a
// frozen object is shared config and is kept by reference; a random stream is
// kept by where it stands; another enemy by its id, linked again once the
// whole field is back (one already dead at the death, still named in a list,
// stays the object it was). Anything else (a service, a component built at
// birth, the ship) is left as the rebuilt enemy has it.
// tests/integration/retryContinuesTheFight.test.js reads the same way and
// names every field it cannot read.
import RandomService from '../../../core/RandomService.js';
import { BaseEnemy } from './BaseEnemy.js';

const STREAM = Symbol('stream');
const ENEMY = Symbol('enemy');

const isPlain = (value) => {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/** The enemy's own state, copied. */
export function captureState(enemy) {
  const copies = new Map();
  const copy = (value) => {
    if (typeof value === 'function') return undefined;
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
      return value;
    }
    if (copies.has(value)) return copies.get(value);
    let out;
    if (value instanceof RandomService) {
      out = { [STREAM]: value.serialize() };
    } else if (value instanceof BaseEnemy) {
      out = {
        [ENEMY]: {
          id: value.id,
          type: value.type,
          kind: Object.getPrototypeOf(value),
        },
      };
    } else if (Array.isArray(value)) {
      out = [];
      copies.set(value, out);
      for (const item of value) out.push(copy(item));
    } else if (value instanceof Set) {
      out = new Set();
      copies.set(value, out);
      for (const item of value) out.add(copy(item));
    } else if (isPlain(value)) {
      out = {};
      copies.set(value, out);
      for (const key of Object.keys(value)) out[key] = copy(value[key]);
    }
    copies.set(value, out);
    return out;
  };

  const state = {};
  for (const key of Object.keys(enemy)) {
    const copied = copy(enemy[key]);
    if (copied !== undefined || enemy[key] === undefined) state[key] = copied;
  }
  return state;
}

/**
 * Sets `state` (captureState's) back on the rebuilt `enemy`; `findEnemy(id)`
 * gives the rebuilt enemy an id names. An enemy named but no longer in the
 * field at the death comes back as a dead stand-in of its kind (its object
 * went back to the pool). A stream the rebuilt enemy already holds is moved
 * to where it stood; every other value is a fresh copy, so the state kept for
 * the next Retry stays as it was.
 */
export function restoreState(enemy, state, findEnemy) {
  const copies = new Map();
  const back = (value, current) => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
      return value;
    }
    if (copies.has(value)) return copies.get(value);
    let out;
    if (value[STREAM]) {
      out =
        current instanceof RandomService
          ? current
          : new RandomService(value[STREAM].seed);
      out.restore(value[STREAM]);
    } else if (value[ENEMY]) {
      const { id, type, kind } = value[ENEMY];
      out =
        findEnemy(id) ??
        Object.assign(Object.create(kind), {
          id,
          type,
          alive: false,
          destroyed: true,
        });
    } else if (Array.isArray(value)) {
      out = [];
      copies.set(value, out);
      for (const item of value) out.push(back(item));
    } else if (value instanceof Set) {
      out = new Set();
      copies.set(value, out);
      for (const item of value) out.add(back(item));
    } else {
      out = {};
      copies.set(value, out);
      for (const key of Object.keys(value)) out[key] = back(value[key]);
    }
    copies.set(value, out);
    return out;
  };

  for (const key of Object.keys(state)) {
    enemy[key] = back(state[key], enemy[key]);
  }
}
