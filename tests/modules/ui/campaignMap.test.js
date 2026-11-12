import { describe, expect, it } from 'vitest';
import {
  CampaignMap,
  campaignNodes,
  defaultSectorId,
  sectorDetail,
} from '../../../src/modules/ui/CampaignMap.js';

const records = (sectorsWon = [], sectorTimes = {}, bestLayer = 0) => ({
  sectorsWon,
  sectorTimes,
  bestLayer,
});

describe('campaign map', () => {
  it('reads each sector cleared, open or locked from the records, then three chapters with no signal', () => {
    const nodes = campaignNodes(records(['outer-ring'], { 'outer-ring': 252 }));
    expect(nodes.map(({ id, state }) => [id, state])).toEqual([
      ['outer-ring', 'cleared'],
      ['dense-core', 'open'],
      ['wardens-reach', 'locked'],
      [null, 'nosignal'],
      [null, 'nosignal'],
      [null, 'nosignal'],
    ]);
    expect(nodes[0].bestTime).toBe(252);
    expect(nodes[2].lock).toBe('Defeat Warden Choir to unlock');
  });

  it('opens on the first open sector, else the last cleared', () => {
    expect(defaultSectorId(campaignNodes(records(['outer-ring'])))).toBe(
      'dense-core'
    );
    const all = ['outer-ring', 'dense-core', 'wardens-reach'];
    expect(defaultSectorId(campaignNodes(records(all)))).toBe('wardens-reach');
  });

  it('details a sector from its data: chapter, layers, Warden, head start, best clear', () => {
    const nodes = campaignNodes(records(['outer-ring'], { 'outer-ring': 252 }));
    expect(sectorDetail(nodes[1])).toEqual({
      title: 'CHAPTER II — THE DENSE CORE',
      facts: '5 layers · Warden: Choir',
      headStart: 'Starts with 4 card picks',
      status: '',
      launchable: true,
    });
    expect(sectorDetail(nodes[0])).toMatchObject({
      headStart: '',
      status: 'Best clear 4:12',
    });
  });

  it('Launch carries the selected sector, and a locked one cannot launch', () => {
    const text = () => ({
      textContent: '',
      hidden: false,
      classList: { toggle() {} },
    });
    const refs = {
      nodes: { querySelectorAll: () => [] },
      detailTitle: text(),
      detailFacts: text(),
      detailHeadStart: text(),
      detailStatus: text(),
      launchBtn: { dataset: {}, disabled: false },
    };
    const map = new CampaignMap({ refs });
    map.nodes = campaignNodes(records(['outer-ring']));

    map.select('dense-core');
    expect(refs.launchBtn).toEqual({
      dataset: { sector: 'dense-core' },
      disabled: false,
    });

    map.select('wardens-reach');
    expect(refs.launchBtn.disabled).toBe(true);
  });
});
