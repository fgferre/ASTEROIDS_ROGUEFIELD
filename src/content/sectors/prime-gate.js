// A sector: a stretch of a chapter played on its own (src/data/sectors.js),
// won at its Warden. No `stages`: it plays the global layers.
export default {
  id: 'prime-gate',
  order: 3,
  chapter: 1,
  code: 'C',
  name: 'PRIME GATE',
  biome: 'outer-ring',
  look: { backdrop: 'prime-gate' },
  layers: [1, 5],
  headStart: 0, // proposta 12/11
};
