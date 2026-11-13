// A biome only its sector flies to (`sectorOnly`, src/data/biomes.js): the
// Ring's bright core, past the run's layers. Pale gold light, warm haze,
// strong veins over a near-black sky; the music stays the Reach's.
export default {
  id: 'crucible',
  order: 4,
  title: 'FINALE — THE CRUCIBLE',
  sectorOnly: true,
  layers: [16, 20],
  sky: ['#0a0906', '#020202'], // proposta 12/11: near-black, barely warm
  hazeColor: '#8c6a34', // proposta 12/11: warm gold haze
  hazeDensity: 0.6, // proposta 12/11: 1.0 turned the field mustard
  veinColor: '#ffd27a', // proposta 12/11: the core's light in the veins
  veinDensity: 1.1, // proposta 12/11: strong
  dustColor: '#f2e4c4',
  keyColor: '#fff3d6', // proposta 12/11: pale gold-white key light
  keyIntensity: 1.8, // proposta 12/11
  fillColor: '#6a5232',
  fillIntensity: 0.3, // proposta 12/11
  bloomScale: 1.25, // proposta 12/11
  debris: 0.5, // proposta 12/11
  structures: 1,
  musicTheme: 'wardens-reach',
  tint: 'rgba(255, 214, 150, 0.07)',
};
