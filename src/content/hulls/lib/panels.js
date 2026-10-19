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
//
// A visual's `form` shapes the 3D hull (render3d/hullModel.js), in
// SHIP_SIZE units: `body` stations [x, half-width, chine height, deck rise,
// keel drop] from nose to stern, lofted; `deck` and `belly` exponents [m, n]
// of the cross-section, height share (1 − |t|^m)^(1/n) at lateral fraction
// t; `spine` and `keel` the shares of the deck and belly in the light and
// dark tones; `seams` x of dark bands; `prow` where the cyan chine line
// ends; `wing` (fin panels) and `flap` (panels with a `minLevel`) { lift:
// root height, cant: degrees, tc: [root, tip] thickness/chord, belly:
// underside share }; `intake` x of the cheek intakes; `nacelle` fairing
// length ahead of each nozzle; `pods` wingtip pods; `armor` lift of the
// armour slabs; `canopy` height of the glass.
import { SHIP_SIZE } from '../../../data/constants/physics.js';

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
