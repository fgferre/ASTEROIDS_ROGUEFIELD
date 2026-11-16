// The first setup file of vitest.playtest.config.js: the card catalog reads
// `?direcao=nova` once, when it loads, so the address has to be on the page
// before anything else is imported.
if (process.env.PLAYTEST_FLIGHT === 'glide') {
  globalThis.window = { location: { search: '?direcao=nova' } };
}
