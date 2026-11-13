import { describe, expect, it } from 'vitest';
import RandomService from '../../../src/core/RandomService.js';
import { STORY } from '../../../src/data/story.js';
import { sectorById } from '../../../src/data/sectors.js';
import {
  TRANSMISSION_CHARS_PER_SECOND,
  TRANSMISSION_HOLD_MS,
  TransmissionQueue,
  bossRushTransmission,
  deathTransmission,
  hangarTransmission,
  heraldTransmission,
  sightingTransmission,
  victoryTransmission,
  wardenTransmission,
  winTransmissions,
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
    expect(hud.showing).toBe(STORY.speaker.prime);
    expect(shown).toEqual(['boss:prime:warning']);
    queue.update(1000 + 250);
    expect(hud.text).toBe(
      STORY.boss.prime.warning.slice(0, TRANSMISSION_CHARS_PER_SECOND / 4)
    );

    const typingMs =
      (STORY.boss.prime.warning.length / TRANSMISSION_CHARS_PER_SECOND) * 1000;
    queue.update(1000 + typingMs + TRANSMISSION_HOLD_MS);
    expect(hud.showing).toBeNull();
    queue.update(1000 + typingMs + TRANSMISSION_HOLD_MS + 16);
    expect(shown).toEqual(['boss:prime:warning', 'boss:prime:defeated']);
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
    expect(hud.showing).toBe(STORY.speaker.choir);
    expect(shown).toEqual(['boss:choir:warning', 'boss:choir:warning']);
  });

  it('reports a line finished after its hold, or when it is dropped', () => {
    const hud = fakeHud();
    const finished = [];
    const queue = new TransmissionQueue(
      hud,
      () => {},
      (entry) => finished.push(entry.key)
    );
    queue.push(wardenTransmission(5, 'warning'));
    queue.update(0, true);
    queue.update(TRANSMISSION_HOLD_MS - 1, true);
    expect(finished).toEqual([]);
    queue.update(TRANSMISSION_HOLD_MS, true);
    expect(finished).toEqual(['boss:prime:warning']);

    queue.push(wardenTransmission(5, 'defeated'));
    queue.update(TRANSMISSION_HOLD_MS + 16, true);
    queue.interrupt(victoryTransmission());
    expect(finished).toEqual(['boss:prime:warning', 'boss:prime:defeated']);
  });

  it('reports a line cut by a banner finished when the queue is cleared', () => {
    const hud = fakeHud();
    const finished = [];
    const queue = new TransmissionQueue(
      hud,
      () => {},
      (entry) => finished.push(entry.key)
    );
    queue.push(wardenTransmission(15, 'defeated'));
    queue.update(0);
    hud.busy = true;
    queue.update(500);
    queue.clear();
    expect(finished).toEqual(['boss:null:defeated']);
  });

  it('shows the whole line at once with reduced motion', () => {
    const hud = fakeHud();
    const queue = new TransmissionQueue(hud, () => {});
    queue.push(wardenTransmission(15, 'warning'));
    queue.update(0, true);
    expect(hud.text).toBe(STORY.boss.null.warning);
  });
});

describe('wardenTransmission', () => {
  it("speaks a Sentinel's own lines by kind, else the layer's Warden", () => {
    const sentinel = wardenTransmission(5, 'warning', 'quarry-maw');
    expect(sentinel).toEqual({
      key: 'boss:quarry-maw:warning',
      speaker: 'QUARRY MAW',
      text: STORY.boss['quarry-maw'].warning,
    });
    expect(wardenTransmission(5, 'defeated', 'quarry-maw').text).toMatch(
      /^Quarry Maw offline\./
    );
    expect(wardenTransmission(5, 'warning', 'prime')).toEqual(
      wardenTransmission(5, 'warning')
    );
    expect(wardenTransmission(5, 'warning').speaker).toBe('WARDEN PRIME');
  });
});

describe('winTransmissions', () => {
  it('wakes the Ring after Warden Null only, not after the Sentinels of its chapter', () => {
    const keys = (lines) => lines.map((line) => line?.key);
    expect(keys(winTransmissions(15))).toEqual([
      'boss:null:defeated',
      'victory',
    ]);
    expect(keys(winTransmissions(15, 'foundry-mother'))).toEqual([
      'boss:foundry-mother:defeated',
    ]);
    expect(keys(winTransmissions(5))).toEqual(['boss:prime:defeated']);
    expect(keys(winTransmissions(20, 'sovereign'))).toEqual([
      'boss:sovereign:defeated',
    ]);
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

describe('sightingTransmission', () => {
  it('lets the Ring name a machine with a line, and nothing else', () => {
    expect(sightingTransmission('caster')).toEqual({
      key: 'sighting:caster',
      speaker: 'THE RING',
      text: STORY.sighting.caster,
    });
    expect(sightingTransmission('drone')).toBeNull();
  });
});

describe('bossRushTransmission', () => {
  it('opens a Boss Rush in Warden Prime’s voice', () => {
    expect(bossRushTransmission()).toEqual({
      key: 'boss-rush',
      speaker: 'WARDEN PRIME',
      text: STORY.bossRush,
    });
  });
});

describe('hangarTransmission', () => {
  it('logs the Bastion hull purchase in the Ring’s voice', () => {
    expect(hangarTransmission('bastion-hull')).toEqual({
      key: 'hangar:bastion-hull',
      speaker: 'THE RING',
      text: STORY.hangar['bastion-hull'],
    });
    expect(hangarTransmission('reinforced-plating')).toBeNull();
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
      STORY.speaker.choir
    );
  });

  it('is spoken by the Ring in the Crucible, past the last Warden', () => {
    const crucible = sectorById('the-crucible');
    expect(deathTransmission(new RandomService(1), 18, crucible).speaker).toBe(
      STORY.speaker.ring
    );
    expect(deathTransmission(new RandomService(1), 18).speaker).toBe(
      STORY.speaker.null
    );
  });
});
