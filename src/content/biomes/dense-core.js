// A biome: three per run, five layers each (field meanings in src/data/biomes.js).
export default {
  id: 'dense-core',
  order: 2,
  title: 'CHAPTER II — THE DENSE CORE',
  layers: [6, 10],
  sky: ['#0b0a09', '#030303'],
  hazeColor: '#8a4e30', // proposta 12/11: rust, lit by the veins
  hazeDensity: 0.9, // proposta 12/11
  veinColor: '#d9701c',
  veinDensity: 0.55, // proposta 12/11
  dustColor: '#ffb35c',
  keyColor: '#ffe2bc',
  keyIntensity: 1.45,
  fillColor: '#a8643c', // proposta 12/11
  fillIntensity: 0.3, // proposta 12/11: machines read against the dark
  bloomScale: 1.2,
  debris: 1,
  structures: 0,
  musicTheme: 'dense-core',
  tint: 'rgba(255, 140, 50, 0.08)',
};
