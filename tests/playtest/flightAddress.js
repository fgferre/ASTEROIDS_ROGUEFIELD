// The first setup file of vitest.playtest.config.js: the card catalog reads
// the flight address (`?direcao=antiga`) once, when it loads, so the address
// has to be on the page before anything else is imported. The new flight is
// the default and needs no address.
if (process.env.PLAYTEST_FLIGHT === 'old') {
  globalThis.window = { location: { search: '?direcao=antiga' } };
}
