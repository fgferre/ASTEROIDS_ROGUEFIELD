import { IS_DEV } from './env.js';

// A pending owner decision made playable: `?<name>=<letter>` in the address,
// development builds only. Returns the letter in upper case, else null.
export function devChoice(name) {
  if (!IS_DEV || typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get(name);
  return value ? value.toUpperCase() : null;
}
