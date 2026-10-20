// The dependency map (`npm run validate:deps`, scripts/analyze-dependencies.js)
// reads the registry's import.meta.glob: content it loads is not an orphan, a
// file nothing imports still is. Run on a small tree laid out like src/.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(
  new URL('../../scripts/analyze-dependencies.js', import.meta.url)
);
const TREE = {
  'src/app.js': "import './content/registry.js';\n",
  'src/content/registry.js':
    "const modules = import.meta.glob('./*/*.js', { eager: true });\nexport default modules;\n",
  'src/content/enemies/drone.js': "export default { id: 'drone' };\n",
  'src/content/cards/phase_dash.js': "export default { id: 'phase_dash' };\n",
  'src/utils/stray.js': 'export const stray = 1;\n',
};

describe('dependency map', () => {
  let root;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'deps-'));
    for (const [file, source] of Object.entries(TREE)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), source);
    }
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('calls a file nothing imports an orphan, and the content the registry loads live', () => {
    const run = spawnSync(
      process.execPath,
      [SCRIPT, '--validate-only', '--root', root],
      { encoding: 'utf8' }
    );
    expect(run.status).toBe(1);
    const issues = JSON.parse(run.stderr.slice(run.stderr.indexOf('{')));
    expect(issues).toEqual({ cycles: [], orphans: ['src/utils/stray.js'] });
  });
});
