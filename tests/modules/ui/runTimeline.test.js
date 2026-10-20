import { describe, expect, it } from 'vitest';
import {
  bestMoment,
  inviteLine,
  killedByLine,
  runHeadline,
  timelineModel,
} from '../../../src/modules/ui/runTimeline.js';

describe('run end headline', () => {
  it('a death names the layer reached, of 15, and its chapter', () => {
    expect(runHeadline({ outcome: 'death', layer: 9 })).toEqual({
      kicker: 'Signal lost',
      title: 'Layer 9',
      of: 'of 15',
      line: 'CHAPTER II — THE DENSE CORE',
      badge: null,
    });
  });

  it('past layer 15 it is the Deep Field', () => {
    expect(runHeadline({ outcome: 'death', layer: 17 })).toMatchObject({
      title: 'Layer 17',
      of: 'Deep Field',
      line: 'The Deep Field · 2 past the Ring',
    });
  });

  it('a Boss Rush death counts Wardens', () => {
    expect(
      runHeadline({ outcome: 'death', layer: 10, bossRush: { stage: 2 } })
    ).toMatchObject({ title: 'Warden 2', of: 'of 3', line: 'Boss Rush' });
  });

  it('a win clears the Field, with its numbers and a new best', () => {
    expect(
      runHeadline({
        outcome: 'victory',
        layer: 15,
        wardens: 3,
        time: 1868,
        newBest: true,
      })
    ).toEqual({
      kicker: 'The Ring is quiet',
      title: 'Field cleared',
      of: '',
      line: 'All 15 layers · 3 Wardens · 31:08',
      badge: 'New best',
    });
    expect(
      runHeadline({ outcome: 'victory', bossRush: { stage: 3 }, time: 600 })
    ).toMatchObject({ title: 'Boss Rush cleared', line: '3 Wardens · 10:00' });
  });

  it('names the killer with its article', () => {
    expect(killedByLine({ type: 'ram', elite: true })).toEqual({
      lead: 'Killed by an',
      name: 'Elite Ram',
    });
    expect(killedByLine({ type: 'boss', bossKind: 'choir' }).lead).toBe(
      'Killed by'
    );
    expect(killedByLine(null)).toEqual({
      lead: 'Killed by',
      name: 'the Field',
    });
  });

  it('invites the next run against the best before this one', () => {
    expect(inviteLine({ outcome: 'death', layer: 9, bestAtStart: 12 })).toBe(
      'Your best is <b>Layer 12</b>. Three layers to go.'
    );
    expect(inviteLine({ outcome: 'death', layer: 9, bestAtStart: 4 })).toBe(
      'A new best: <b>Layer 9</b>. The Ring goes on to 15.'
    );
    expect(inviteLine({ outcome: 'death', layer: 18, bestAtStart: 16 })).toBe(
      'A new best: <b>Layer 18</b>. The Deep Field goes on.'
    );
  });
});

describe('run timeline', () => {
  const timeline = [
    {
      kind: 'evolution',
      family: 'thermal',
      name: 'Incendiary Lance',
      time: 250,
      layer: 3,
    },
    { kind: 'warden', name: 'Warden Prime', fight: 48, time: 362, layer: 5 },
    { kind: 'combo', combo: 48, time: 662, layer: 7 },
    {
      kind: 'death',
      killer: { type: 'ram', elite: true },
      time: 872,
      layer: 9,
    },
  ];

  it('places each moment on its layer, with its labels and the best ahead', () => {
    const model = timelineModel({
      timeline,
      outcome: 'death',
      layer: 9,
      bestAtStart: 12,
    });
    expect(model.reached).toBe(9.5);
    expect(model.wardenLayers).toEqual([
      { layer: 5, down: true },
      { layer: 10, down: false },
      { layer: 15, down: false },
    ]);
    expect(model.chapters.map(({ label }) => label)).toEqual([
      'I · OUTER RING',
      'II · DENSE CORE',
      "III · WARDEN'S REACH",
    ]);
    expect(
      model.events.map(({ kind, at, up, title, sub }) => [
        kind,
        at,
        up,
        title,
        sub,
      ])
    ).toEqual([
      ['evolution', 3.5, true, 'Incendiary Lance', '4:10'],
      ['warden', 5, false, 'Warden Prime down', '6:02 · fight 0:48'],
      ['combo', 7.5, true, '×48 combo', '11:02'],
      ['death', 9.5, false, 'Elite Ram', '14:32'],
      ['best', 12, true, 'Your best', 'LAYER 12'],
    ]);
  });

  it('the best moment: the combo on a death, the last Warden on a win', () => {
    expect(bestMoment(timeline, 'death')).toEqual({
      tone: 'combo',
      title: '×48 combo',
      where: 'Layer 7 · 11:02',
    });
    const won = [
      ...timeline.slice(0, 3),
      { kind: 'warden', name: 'Warden Null', fight: 72, time: 1868, layer: 15 },
    ];
    expect(bestMoment(won, 'victory')).toEqual({
      tone: 'warden',
      title: 'Null down in 1:12',
      where: 'Layer 15 · the last Warden',
    });
  });
});
