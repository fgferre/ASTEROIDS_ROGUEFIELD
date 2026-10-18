import { describe, expect, it } from 'vitest';
import RandomService from '../../../src/core/RandomService.js';
import { STORY } from '../../../src/data/story.js';
import {
  TRANSMISSION_CHARS_PER_SECOND,
  TRANSMISSION_HOLD_MS,
  TransmissionQueue,
  deathTransmission,
  heraldTransmission,
  wardenTransmission,
} from '../../../src/modules/ui/transmissions.js';

function fakeHud() {
  return {
    busy: false,
    showing: null,
    text: '',
    isBannerBusy() {
      return this.busy;
    },
    showTransmission(speaker) {
      this.showing = speaker;
      this.text = '';
    },
    typeTransmission(text) {
      this.text = text;
    },
    hideTransmission() {
      this.showing = null;
    },
  };
}

describe('TransmissionQueue', () => {
  it('waits for the banner to clear, then types one line at a time', () => {
    const hud = fakeHud();
    const shown = [];
    const queue = new TransmissionQueue(hud, (entry) => shown.push(entry.key));
    queue.push(wardenTransmission(5, 'warning'));
    queue.push(wardenTransmission(5, 'defeated'));

    hud.busy = true;
    queue.update(0);
    expect(hud.showing).toBeNull();
    expect(shown).toEqual([]);

    hud.busy = false;
    queue.update(1000);
    expect(hud.showing).toBe(STORY.speaker[5]);
    expect(shown).toEqual(['warden:5:warning']);
    queue.update(1000 + 250);
    expect(hud.text).toBe(
      STORY.warden[5].warning.slice(0, TRANSMISSION_CHARS_PER_SECOND / 4)
    );

    const typingMs =
      (STORY.warden[5].warning.length / TRANSMISSION_CHARS_PER_SECOND) * 1000;
    queue.update(1000 + typingMs + TRANSMISSION_HOLD_MS);
    expect(hud.showing).toBeNull();
    queue.update(1000 + typingMs + TRANSMISSION_HOLD_MS + 16);
    expect(shown).toEqual(['warden:5:warning', 'warden:5:defeated']);
  });

  it('cuts a line when a banner opens and replays it afterwards', () => {
    const hud = fakeHud();
    const shown = [];
    const queue = new TransmissionQueue(hud, (entry) => shown.push(entry.key));
    queue.push(wardenTransmission(10, 'warning'));
    queue.update(0);
    hud.busy = true;
    queue.update(500);
    expect(hud.showing).toBeNull();
    hud.busy = false;
    queue.update(2000);
    expect(hud.showing).toBe(STORY.speaker[10]);
    expect(shown).toEqual(['warden:10:warning', 'warden:10:warning']);
  });

  it('shows the whole line at once with reduced motion', () => {
    const hud = fakeHud();
    const queue = new TransmissionQueue(hud, () => {});
    queue.push(wardenTransmission(15, 'warning'));
    queue.update(0, true);
    expect(hud.text).toBe(STORY.warden[15].warning);
  });
});

describe('heraldTransmission', () => {
  it("keys the line by kind and speaks with the Herald's own label", () => {
    expect(heraldTransmission('heat', 'defeated')).toEqual({
      key: 'herald:heat:defeated',
      speaker: 'HERALD OF HEAT',
      text: STORY.herald.heat.defeated,
    });
    expect(heraldTransmission('nobody', 'spawned')).toBeNull();
  });
});

describe('deathTransmission', () => {
  it('picks the same line for the same seed', () => {
    const pick = (seed) => {
      const random = new RandomService(seed);
      return [1, 2, 3, 4, 5].map(() => deathTransmission(random, 7).text);
    };
    expect(pick(1234)).toEqual(pick(1234));
    pick(1234).forEach((text) => expect(STORY.death).toContain(text));
    expect(deathTransmission(new RandomService(1), 7).speaker).toBe(
      STORY.speaker[10]
    );
  });
});
