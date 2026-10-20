// src/modules/ui/hud/instruments/feed/classic.js
//
// The kill feed (until 20/10), right, under the radar: up to four rows on a
// fading plate with an edge in the row's colour — kills (repeats count up
// ×N), XP collected, pickups, combo tiers and achievements. A row lives
// 1.6 s; one with the same key still on screen keeps counting and moves back
// to the top.

import { FADE_OUT_MS, FEED_MAX_ROWS } from '../../hudCommon.js';

const CSS = `
            .hud-feed { width: 200px; min-height: calc(${FEED_MAX_ROWS} * (var(--text-md) * 1.25 + 4px + var(--space-1))); display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-1); pointer-events: none; }
            .feed-row { display: flex; align-items: baseline; gap: var(--space-2); padding: 2px var(--space-2); background: linear-gradient(270deg, var(--surface) 0%, transparent 100%); border-right: 2px solid var(--neutral); font-family: var(--font-ui); font-size: var(--text-md); font-weight: 600; letter-spacing: 1px; color: var(--text); white-space: nowrap; }
            .feed-row.is-leaving { opacity: 0; }
            .feed-value { font-family: var(--font-display); font-size: var(--text-sm); color: var(--text-dim); }
            .feed-row--xp { border-right-color: var(--xp); color: var(--xp); }
            .feed-row--combo { border-right-color: var(--status); color: var(--status); }
            .feed-row--combo[data-tier='xp'] { border-right-color: var(--xp); color: var(--xp); }
            .feed-row--combo[data-tier='boss'] { border-right-color: var(--boss); color: var(--boss); }
            .feed-row--combo .feed-value { color: inherit; }
            .feed-row--achievement { border-right-color: var(--xp); color: var(--xp); background: linear-gradient(270deg, color-mix(in srgb, var(--xp) 22%, var(--surface)) 0%, transparent 100%); text-shadow: 0 0 8px color-mix(in srgb, var(--xp) 60%, transparent); }
            @media (prefers-reduced-motion: no-preference) {
                .feed-row { animation: feed-in var(--motion-base) var(--ease-out); transition: opacity ${FADE_OUT_MS}ms ease-in, transform ${FADE_OUT_MS}ms ease-in; }
                .feed-row.is-leaving { transform: translateX(8px); }
            }`;

export default {
  slot: 'feed',
  id: 'classic',
  name: 'Classic',
  // How long a row stays, its fade-out included.
  life: 1600,

  mount(container) {
    this.container = container;
    container.innerHTML = `<style>${CSS}</style><div class="hud-feed" id="ui-feed"></div>`;
    this.list = container.querySelector('.hud-feed');
    this.rows = [];
    this.timers = new Set();
  },

  // Rows arrive through push(); nothing to draw per frame.
  update() {},

  push(key, tone, render) {
    // A row still on screen keeps counting and moves back to the top.
    let row = this.rows.find((entry) => entry.key === key);
    if (row) {
      this.list.prepend(row.el);
      this.rows = [row, ...this.rows.filter((entry) => entry !== row)];
    } else {
      const el = document.createElement('div');
      el.className = `feed-row feed-row--${tone}`;
      el.innerHTML =
        '<span class="feed-label"></span><span class="feed-value"></span>';
      row = {
        key,
        el,
        count: 0,
        label: el.firstChild,
        value: el.lastChild,
        timer: null,
      };
      this.list.prepend(el);
      this.rows.unshift(row);
      while (this.rows.length > FEED_MAX_ROWS) {
        this.removeRow(this.rows[this.rows.length - 1]);
      }
    }
    render(row);
    row.el.classList.remove('is-leaving');
    if (row.timer) this.cancel(row.timer);
    row.timer = this.later(
      () => {
        row.el.classList.add('is-leaving');
        row.timer = this.later(() => this.removeRow(row), FADE_OUT_MS + 100);
      },
      this.life - FADE_OUT_MS - 100
    );
    return row;
  },

  removeRow(row) {
    if (row.timer) this.cancel(row.timer);
    row.el.remove();
    this.rows = this.rows.filter((entry) => entry !== row);
  },

  later(fn, ms) {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
    return id;
  },

  cancel(id) {
    window.clearTimeout(id);
    this.timers.delete(id);
  },

  destroy() {
    this.timers.forEach((id) => window.clearTimeout(id));
    this.timers.clear();
    this.rows = [];
    this.container.innerHTML = '';
    this.container = null;
  },
};
