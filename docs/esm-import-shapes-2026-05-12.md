# ESM Import Shapes — Phase 0 Modules (2026-05-12)

Probe captured before any Phase 0 test code referenced the modules. Plans 02,
03, 04 read this file to choose `import X from` vs `import { X } from` and
skip re-probing. Re-run the probe if any module's last `export` line changes.

## Probe command

```
node -e "Promise.all([import('./src/modules/PlayerSystem.js'), import('./src/modules/CombatSystem.js'), import('./src/modules/ProgressionSystem.js'), import('./src/modules/enemies/types/BossEnemy.js')]).then(mods => { const labels = ['PlayerSystem', 'CombatSystem', 'ProgressionSystem', 'BossEnemy']; mods.forEach((m, i) => { const keys = Object.keys(m); const hasDefault = 'default' in m; const named = keys.filter(k => k !== 'default'); console.log(labels[i] + ': default=' + hasDefault + ', named=[' + named.join(',') + ']'); }); })"
```

Also probed individually (one module per invocation) — same outcome below.

## Captured output (verbatim from node -e stdout)

The dynamic `import()` probe under bare Node fails at module-load time for all four
modules because the transitive import graph reaches an SVG asset
(`assets/inpirational mockups/solar slicer.svg`, `assets/inpirational mockups/retro saucer.svg`),
and Node's ESM loader does not have a built-in `.svg` handler — only Vite does
(via its asset plugin). See **Probe failures** subsection at the bottom for the
verbatim error strings. The probe blockage is a Node-runtime limitation, **not**
an ESM export-shape issue. Static export-shape was confirmed by reading the
trailing `export` line of each source file:

```
PlayerSystem:    `export default PlayerSystem;`     → default=true, named=[]
CombatSystem:    `export default CombatSystem;`     → default=true, named=[]
ProgressionSystem: `export default ProgressionSystem;` → default=true, named=[]
BossEnemy:       `export default BossEnemy;`        → default=true, named=[]
```

The Vitest test runner uses the Vite resolver and therefore handles the SVG asset
imports without error, so `import PlayerSystem from '../../src/modules/PlayerSystem.js'`
works in test files identically to the existing `tests/modules/PlayerSystem.commandQueue.test.js`
pattern (which has been passing in CI since M1 shipped — independent confirmation
of the default-export form).

## Recommended import form per module

| Module | Default export? | Named exports | Recommended form for test files |
|---|---|---|---|
| PlayerSystem      | Y | (none) | `import PlayerSystem from '../../src/modules/PlayerSystem.js';` |
| CombatSystem      | Y | (none) | `import CombatSystem from '../../src/modules/CombatSystem.js';` |
| ProgressionSystem | Y | (none) | `import ProgressionSystem from '../../src/modules/ProgressionSystem.js';` |
| BossEnemy         | Y | (none) | `import BossEnemy from '../../src/modules/enemies/types/BossEnemy.js';` |

Plans 02/03/04 use these forms verbatim.

## Probe failures

The dynamic `node -e "import(...)"` probe blocked for all four modules at the Node
ESM loader because the transitive import graph eventually pulls an SVG asset and
Node has no built-in SVG loader. Verbatim error strings (one per module, captured
during the Plan 00.01 Task 0 probe run):

```
PROBE_FAIL_PlayerSystem: Unknown file extension ".svg" for C:\Users\...\assets\inpirational mockups\solar slicer.svg
PROBE_FAIL_CombatSystem: Unknown file extension ".svg" for C:\Users\...\assets\inpirational mockups\retro saucer.svg
PROBE_FAIL_ProgressionSystem: Unknown file extension ".svg" for C:\Users\...\assets\inpirational mockups\retro saucer.svg
PROBE_FAIL_BossEnemy: Unknown file extension ".svg" for C:\Users\...\assets\inpirational mockups\retro saucer.svg
```

**Disposition:** Recommended-form column was filled via static source inspection
(trailing `export default <ClassName>;` on the last non-blank line of each file).
This is a stronger signal than a runtime probe anyway — the static export line is
the contract, the dynamic probe is its observable. Test files in `tests/modules/`
already use the default-export form and pass; this doc ratifies that pattern for
downstream Plans 02/03/04.

If a future plan re-probes and the export line changes to a named export, update
this doc; otherwise the table above is the authoritative reference.
