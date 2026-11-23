// vitest's globalSetup (vite.config.js, so the playtest config too), run once
// in vitest's main process: the tests run only on the Node pinned in .nvmrc,
// the one GitHub runs them on. npm test and the other test scripts start them
// there (scripts/pinned-node.mjs); vitest started any other way stops here.

import { pinnedVersion } from '../../scripts/pinned-node.mjs';

export default function pinnedNodeGuard() {
  const pinned = pinnedVersion();
  if (process.version === pinned) return;
  // A throw here comes out under a stack trace and a "No test files found".
  process.stderr.write(
    `\nOs testes rodam só no Node ${pinned} (.nvmrc), o mesmo do GitHub; este é o ${process.version}.\nRode: npm test -- <arquivos>   (ou npm run test:tocados)\n\n`
  );
  process.exit(1);
}
