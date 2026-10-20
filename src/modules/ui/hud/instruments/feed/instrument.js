// src/modules/ui/hud/instruments/feed/instrument.js
//
// The kill feed in the mock-ups' finish (HUD.md, on demand): the classic
// feed's rows and counting, as fine right-aligned type with a small diamond
// in the row's colour instead of a plate. Rows stay 6 s; the feed wakes to
// full strength on each new row and fades to 35 % 4 s after the last.

import { FEED_MAX_ROWS, ON_DEMAND_MS } from '../../hudCommon.js';
import classic from './classic.js';

// Its min-height holds the rows, so edge arrows keep clear of them.
const CSS = `
            .ins-feed { width: calc(240px * var(--hud-u)); min-height: calc(${FEED_MAX_ROWS} * (var(--text-sm) * 1.2 + 3px) * var(--hud-u)); display: flex; flex-direction: column; align-items: flex-end; gap: calc(3px * var(--hud-u)); }
            .ins-feed .feed-row { position: relative; display: flex; align-items: baseline; gap: calc(var(--space-2) * var(--hud-u)); padding-right: calc(12px * var(--hud-u)); font-weight: 600; font-size: calc(var(--text-sm) * var(--hud-u)); letter-spacing: 0.06em; line-height: 1.2; color: var(--text); white-space: nowrap; }
            .ins-feed .feed-row::after { content: ''; position: absolute; right: calc(2px * var(--hud-u)); top: 50%; width: calc(4px * var(--hud-u)); height: calc(4px * var(--hud-u)); background: currentColor; transform: translateY(-50%) rotate(45deg); opacity: 0.85; }
            .ins-feed .feed-row--kill::after { background: var(--text-dim); }
            .ins-feed .feed-value { font-family: var(--font-display); font-weight: 500; font-size: calc(var(--text-xs) * var(--hud-u)); color: var(--text-dim); }
            .ins-feed .feed-row--xp { color: var(--xp); }
            .ins-feed .feed-row--combo { color: var(--status); }
            .ins-feed .feed-row--combo[data-tier='xp'] { color: var(--xp); }
            .ins-feed .feed-row--combo[data-tier='boss'] { color: var(--boss-light); }
            .ins-feed .feed-row--combo .feed-value { color: inherit; }
            .ins-feed .feed-row--achievement { color: var(--xp); }
            .ins-feed .feed-row.is-leaving { opacity: 0; }
            @media (prefers-reduced-motion: no-preference) {
                .ins-feed .feed-row { animation: feed-in var(--motion-base) var(--ease-out); transition: opacity var(--motion-base) ease-in; }
            }`;

export default {
  ...classic,
  id: 'instrument',
  name: 'Instrument',
  life: 6000,

  mount(container) {
    this.container = container;
    container.innerHTML = `<style>${CSS}</style><div class="ins ins-demand ins-feed"></div>`;
    this.list = container.querySelector('.ins-feed');
    this.rows = [];
    this.timers = new Set();
    this.sleep = null;
  },

  push(key, tone, render) {
    const row = classic.push.call(this, key, tone, render);
    this.list.classList.add('is-awake');
    if (this.sleep) this.cancel(this.sleep);
    this.sleep = this.later(() => {
      this.sleep = null;
      this.list.classList.remove('is-awake');
    }, ON_DEMAND_MS);
    return row;
  },
};
