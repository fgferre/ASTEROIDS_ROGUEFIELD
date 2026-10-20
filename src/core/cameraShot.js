// The 3D gameplay shot as plain math (no THREE), posed exactly like
// render3d/cameraRig.js poses the perspective camera: it hangs `distance`
// from its target on the field plane, tilted toward the bottom of the screen
// by `tilt`, turned about the vertical by `yaw` and rolled about its own axis
// by `roll` (radians). Field units, x right and y down; `lens` is the vertical
// half-angle's tangent (`tanV`) and the screen's width ÷ height (`aspect`).
// The camera director (cameraDirector.js) frames with it.

const basis = {
  ex: 0, // eye
  eh: 0,
  ey: 0,
  rx: 0, // screen right
  rh: 0,
  ry: 0,
  ux: 0, // screen up
  uh: 0,
  uy: 0,
  bx: 0, // back (toward the eye)
  bh: 0,
  by: 0,
};

// The angles the axes below were last worked out for: the framing calls
// this many times a frame at one set of angles and many distances.
const last = { tilt: NaN, yaw: NaN, roll: NaN };

// The eye and the screen axes for `pose` with its target at the origin,
// three.js-style (lookAt with the field's top as up, then rotateZ(roll)), in
// world axes (x, height, field y).
function poseBasis(pose) {
  const { distance, tilt, yaw = 0, roll = 0 } = pose;
  if (tilt !== last.tilt || yaw !== last.yaw || roll !== last.roll) {
    last.tilt = tilt;
    last.yaw = yaw;
    last.roll = roll;
    axesFor(tilt, yaw, roll);
  }
  basis.ex = basis.bx * distance;
  basis.eh = basis.bh * distance;
  basis.ey = basis.by * distance;
  return basis;
}

function axesFor(tilt, yaw, roll) {
  const sinT = Math.sin(tilt);
  const cosT = Math.cos(tilt);
  const sinY = Math.sin(yaw);
  const cosY = Math.cos(yaw);
  // back = normalize(eye - target): the eye hangs along it.
  const bx = -sinT * sinY;
  const bh = cosT;
  const by = sinT * cosY;
  // right = normalize(up × back), up = the field's top turned by the yaw.
  const upx = sinY;
  const upy = -cosY;
  let rx = -upy * bh;
  let rh = upy * bx - upx * by;
  let ry = upx * bh;
  const rl = Math.hypot(rx, rh, ry);
  rx /= rl;
  rh /= rl;
  ry /= rl;
  // screen up = back × right
  let ux = bh * ry - by * rh;
  let uh = by * rx - bx * ry;
  let uy = bx * rh - bh * rx;
  if (roll) {
    const c = Math.cos(roll);
    const s = Math.sin(roll);
    const nrx = rx * c + ux * s;
    const nrh = rh * c + uh * s;
    const nry = ry * c + uy * s;
    ux = ux * c - rx * s;
    uh = uh * c - rh * s;
    uy = uy * c - ry * s;
    rx = nrx;
    rh = nrh;
    ry = nry;
  }
  basis.rx = rx;
  basis.rh = rh;
  basis.ry = ry;
  basis.ux = ux;
  basis.uh = uh;
  basis.uy = uy;
  basis.bx = bx;
  basis.bh = bh;
  basis.by = by;
}

/**
 * Where field point (px, py) lands on screen for `pose` (target pose.x,
 * pose.y): out.x / out.y from -1 to 1 across the screen (y up), `out.front`
 * false behind the eye.
 */
export function projectToScreen(pose, lens, px, py, out = {}) {
  const b = poseBasis(pose);
  const vx = px - pose.x - b.ex;
  const vh = -b.eh;
  const vy = py - pose.y - b.ey;
  const depth = -(vx * b.bx + vh * b.bh + vy * b.by);
  out.front = depth > 1e-9;
  const d = out.front ? depth : 1e-9;
  out.x = (vx * b.rx + vh * b.rh + vy * b.ry) / (d * lens.tanV * lens.aspect);
  out.y = (vx * b.ux + vh * b.uh + vy * b.uy) / (d * lens.tanV);
  return out;
}

const SCREEN_CORNERS = [
  [-1, 1],
  [1, 1],
  [1, -1],
  [-1, -1],
];

/**
 * The shot's four corners on the field plane, relative to its target
 * (top-left, top-right, bottom-right, bottom-left of the screen): out.xs and
 * out.ys. Rays that miss the plane land far away, so such a pose never fits.
 */
export function shotCorners(
  pose,
  lens,
  out = { xs: [0, 0, 0, 0], ys: [0, 0, 0, 0] }
) {
  const b = poseBasis(pose);
  for (let i = 0; i < 4; i += 1) {
    const sx = SCREEN_CORNERS[i][0] * lens.tanV * lens.aspect;
    const sy = SCREEN_CORNERS[i][1] * lens.tanV;
    const dx = -b.bx + b.rx * sx + b.ux * sy;
    const dh = -b.bh + b.rh * sx + b.uh * sy;
    const dy = -b.by + b.ry * sx + b.uy * sy;
    const t = dh < -1e-9 ? -b.eh / dh : 1e9;
    out.xs[i] = b.ex + dx * t;
    out.ys[i] = b.ey + dy * t;
  }
  return out;
}

const unitCorners = { xs: [0, 0, 0, 0], ys: [0, 0, 0, 0] };
const unitPose = { x: 0, y: 0, distance: 1, tilt: 0, yaw: 0, roll: 0 };

/**
 * How far the shot reaches from its target at these angles, at `distance`:
 * the corners' extent left, right, up (toward the top) and down. Every part
 * grows in proportion to the distance.
 */
export function shotExtent(distance, angles, lens, out = {}) {
  unitPose.tilt = angles.tilt;
  unitPose.yaw = angles.yaw || 0;
  unitPose.roll = angles.roll || 0;
  shotCorners(unitPose, lens, unitCorners);
  const { xs, ys } = unitCorners;
  out.left = -Math.min(xs[0], xs[1], xs[2], xs[3]) * distance;
  out.right = Math.max(xs[0], xs[1], xs[2], xs[3]) * distance;
  out.up = -Math.min(ys[0], ys[1], ys[2], ys[3]) * distance;
  out.down = Math.max(ys[0], ys[1], ys[2], ys[3]) * distance;
  return out;
}

const fitExtent = {};

/**
 * The farthest the shot can hang at these angles with all of it inside a
 * `width` × `height` field: "zoom 1" of the camera director.
 */
export function fieldFitDistance(angles, lens, width, height) {
  const e = shotExtent(1, angles, lens, fitExtent);
  return Math.min(width / (e.left + e.right), height / (e.up + e.down));
}
