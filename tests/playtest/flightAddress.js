// The first setup file of vitest.playtest.config.js: the card catalog reads
// the flight address (`?direcao=antiga`) once, when it loads, so the address
// has to be on the page before anything else is imported. The new flight is
// the default and needs no address.
// `PLAYTEST_TRILHA=b|c|d|e` adds the trail-order address (`?trilha=`).
const address = [
  process.env.PLAYTEST_FLIGHT === 'old' && 'direcao=antiga',
  process.env.PLAYTEST_TRILHA && `trilha=${process.env.PLAYTEST_TRILHA}`,
].filter(Boolean);
if (address.length) {
  globalThis.window = { location: { search: `?${address.join('&')}` } };
}
