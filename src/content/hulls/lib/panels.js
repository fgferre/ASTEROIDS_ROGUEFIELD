// Procedural hull art (docs/NORTE.md §3). Not a hull: it sits in a subfolder so
// the registry's one-level glob (src/content/registry.js) does not list it.
//
// Coordinates are in SHIP_SIZE units, nose toward +x. Each panel is a matte
// facet: `facing` is the direction its bevel looks at (ship-local), so the
// renderer lights it against the fixed world key light. Panels are listed
// for the left side (y < 0) and mirrored. `grow` moves the listed vertices by
// `step` per level of the named visual upgrade (thruster | rcs | braking);
// `minLevel` hides a panel until that upgrade level. An `armor` panel rides
// on the plates under it as two stacked plates trimmed in the accent; a
// visual's `albedo` scales its hull tones.
import { SHIP_SIZE } from '../../../core/GameConstants.js';

const S = SHIP_SIZE;
export const pt = (x, y) => ({ x: x * S, y: y * S });

const mirrorPanel = (panel) => ({
  ...panel,
  points: panel.points.map((p) => ({ x: p.x, y: -p.y })),
  facing: { x: panel.facing.x, y: -panel.facing.y },
  grow: panel.grow
    ? { ...panel.grow, step: { x: panel.grow.step.x, y: -panel.grow.step.y } }
    : undefined,
});

export const panelPair = (panel) => [panel, mirrorPanel(panel)];
