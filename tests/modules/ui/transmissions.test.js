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
  runVoiceLines,
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

  it('tells how long a shown line stays up: typed and held', () => {
    const shown = [];
    const line = wardenTransmission(5, 'warning');
    const typingMs = (line.text.length / TRANSMISSION_CHARS_PER_SECOND) * 1000;
    [false, true].forEach((reducedMotion) => {
      const queue = new TransmissionQueue(fakeHud(), (_, onScreenMs) =>
        shown.push(onScreenMs)
      );
      queue.push(line);
      queue.update(0, reducedMotion);
    });
    expect(shown).toEqual([
      typingMs + TRANSMISSION_HOLD_MS,
      TRANSMISSION_HOLD_MS,
    ]);
  });

  it('cuts a line when a banner opens and replays it afterwards', () => {
    const hud = fakeHud();
    const shown = [];
    const cut = [];
    const queue = new TransmissionQueue(
      hud,
      (entry) => shown.push(entry.key),
      () => {},
      (entry) => cut.push(entry.key)
    );
    queue.push(wardenTransmission(10, 'warning'));
    queue.update(0);
    hud.busy = true;
    queue.update(500);
    expect(hud.showing).toBeNull();
    expect(cut).toEqual(['boss:choir:warning']);
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

  it('reports each line still waiting dropped when the queue is cleared', () => {
    const hud = fakeHud();
    const finished = [];
    const dropped = [];
    const queue = new TransmissionQueue(
      hud,
      () => {},
      (entry) => finished.push(entry.key),
      () => {},
      (entry) => dropped.push(entry.key)
    );
    queue.push(wardenTransmission(5, 'warning'));
    queue.push(wardenTransmission(5, 'defeated'));
    queue.push(victoryTransmission());
    queue.update(0);
    // A banner cuts the line on air: it waits again, but is not dropped.
    hud.busy = true;
    queue.update(500);
    queue.clear();
    expect(finished).toEqual(['boss:prime:warning']);
    expect(dropped).toEqual(['boss:prime:defeated', 'victory']);
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

describe('runVoiceLines', () => {
  const keys = (start, layer) =>
    runVoiceLines(start, layer).map((line) => line.key);
  const deaths = STORY.death.map((_, i) => `death:${i}`);

  it("a sector ending on a Sentinel: its stage lines, its Sentinel's, its machines' sightings, every death line", () => {
    const said = keys({ sector: 'quarantine-grid' });
    expect(said).toEqual(
      expect.arrayContaining([
        'chapter:quarantine-grid',
        ...Object.keys(STORY.stage['quarantine-grid']).map(
          (stage) => `stage:quarantine-grid:${stage}`
        ),
        'boss:interdictor:warning',
        'boss:interdictor:last',
        'boss:interdictor:defeated',
        // marksman → Shade, minelayer → Sower, swarmer → Mite
        'sighting:shade',
        'sighting:sower',
        'sighting:mite',
        ...deaths,
      ])
    );
    expect(said.some((key) => key.startsWith('boss:null'))).toBe(false);
    expect(said).not.toContain('victory');
    expect(new Set(said).size).toBe(said.length);
  });

  it("a sector ending on a Warden: the Warden's lines, its Herald's, and the victory on the run's last layer", () => {
    const said = keys({ sector: 'wardens-reach' });
    expect(said).toEqual(
      expect.arrayContaining([
        'boss:null:warning',
        'boss:null:last',
        'boss:null:defeated',
        'herald:silence:spawned',
        'herald:silence:defeated',
        'victory',
      ])
    );
  });

  it('a Descent: the rest of the chapter and one layer on, from the layer it is at', () => {
    const said = keys({ sector: null }, 4);
    expect(said).toEqual(
      expect.arrayContaining([
        'boss:prime:warning',
        'boss:prime:defeated',
        // layer 6 opens the next chapter
        'chapter:dense-core',
        ...deaths,
      ])
    );
    expect(said).not.toContain('chapter:outer-ring');
    expect(said.some((key) => key.startsWith('boss:choir'))).toBe(false);
    expect(keys({}, 1)).toContain('herald:dust:spawned');
    expect(keys({}, 4)).not.toContain('herald:dust:spawned');
  });

  it("a Boss Rush: Prime's opening line and the three Wardens', ending on the victory", () => {
    const said = keys({ bossRush: true });
    expect(said).toEqual(
      expect.arrayContaining([
        'boss-rush',
        ...['prime', 'choir', 'null'].flatMap((kind) =>
          ['warning', 'last', 'defeated'].map((m) => `boss:${kind}:${m}`)
        ),
        'victory',
      ])
    );
    expect(said.some((key) => key.startsWith('stage:'))).toBe(false);
  });
});
