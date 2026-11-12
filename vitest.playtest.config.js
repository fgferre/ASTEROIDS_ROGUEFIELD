// The playtest (tests/playtest/): the main config with its own files, long
// tests and the reports printed. Run by scripts/playtest.mjs (`npm run playtest`),
// never by `npm test`.
import viteConfig from './vite.config.js';

const config = viteConfig({ mode: 'test', command: 'serve' });

export default {
  ...config,
  test: {
    ...config.test,
    include: ['tests/playtest/**/*.playtest.js'],
    testTimeout: 0,
  },
};
