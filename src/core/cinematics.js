// Camera paths of the run's two cinematics (PLAN.md R5.1): the intro descends
// from high over the Ring down to the ship, the victory epilogue pulls back
// while the Ring lights up. Pure functions of t (0..1, clamped) returning a
// pose relative to the follow camera: `distance` multiplies the follow
// distance, `tilt` is in degrees, `offsetX/offsetY` move the look-at point in
// logical units, `wake` (0..1) lights the Ring. Both end where the follow
// camera (or the held victory shot) takes over. The Warden's arrival is no
// path: the camera director frames it (its boss entrance moment). The
// journey between sectors flies its own camera (render3d/travelScene.js)
// and ends on the intro's first pose.

export const INTRO_MS = 3000;
export const EPILOGUE_MS = 4000;

// The Warden's entrance (enemies/boss/arrival.js; its timing and live shot
// are in each Warden's recipe): letterbox bars slide in when it spawns and
// out when it closes up. Seconds. No bars under Reduced Motion.
export const WARDEN_ARRIVAL = Object.freeze({
  travelIn: 0.4, // proposta 19/10: the bars slide in
  travelBack: 0.5, // proposta 19/10: they slide out
  barHeight: 10, // proposta 19/10: each letterbox bar, % of the view
});

// The journey to a sector (ui/runCinematics.js): it lasts as long as its
// lines take to type plus `lineHoldMs` each, after `leadMs` of flight, within
// [minMs, maxMs] — longer when its recorded lines need the time to be
// spoken; over its last `handOffMs` the field and the instruments fade in.
// Milliseconds.
export const TRAVEL = Object.freeze({
  lineHoldMs: 2000, // proposta 12/11
  leadMs: 800, // proposta 12/11
  minMs: 7000, // proposta 12/11
  maxMs: 16000, // proposta 12/11
  handOffMs: 1000, // proposta 12/11
});

// The story before a campaign launch's journey (render3d/storyScene.js):
// its six shots' lengths, ms, in order. proposta 18/11.
export const STORY_SHOT_MS = Object.freeze([
  4500, 4300, 4300, 4300, 4000, 4000,
]);
export const STORY_MS = STORY_SHOT_MS.reduce((sum, ms) => sum + ms, 0);
// Each shot's line (data/story.js STORY.prologue) starts this far into it.
export const STORY_LINE_LEAD_MS = 400; // proposta 18/11

export const FOLLOW_TILT = 18;
const INTRO_DISTANCE = 3.2;
const INTRO_TILT = 32;
// Up the field, toward the far Ring arc beyond its top edge.
const INTRO_OFFSET_Y = -420;
const EPILOGUE_DISTANCE = 2.6;
const EPILOGUE_TILT = 26;
const EPILOGUE_OFFSET_Y = -160;
// The Ring wakes once the pull-back is under way.
const WAKE_START = 0.2;

/**
 * Dev captures: `?cinematic=intro&t=0.4` (or `epilogue`) freezes that
 * cinematic's camera at t while it plays. `?cinematic=travel&t=0.4` makes
 * any run start fly the journey, frozen at t, to `&sector=<id>` (the opening
 * to the first sector without it); without `t` that journey plays on
 * (to film it). `?cinematic=story&t=` does the same with the story before it.
 * `?cinematic=ending&beat=<id>&t=` holds the ending's beat `id` (either act)
 * at t once the ending starts, as `&ending=severance|stewardship` picks
 * (Severance without it). Null without the flag.
 */
export function cinematicFreezeFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const kind = params.get('cinematic');
    const t = Number(params.get('t'));
    if (!['intro', 'epilogue', 'travel', 'story', 'ending'].includes(kind)) {
      return null;
    }
    const plays = ['travel', 'story'].includes(kind) && !params.has('t');
    return {
      kind,
      t: plays ? null : Number.isFinite(t) ? t : 0.5,
      sector: params.get('sector'),
      beat: params.get('beat'),
      ending:
        params.get('ending') === 'stewardship' ? 'stewardship' : 'severance',
    };
  } catch {
    return null;
  }
}

function clamp01(t) {
  return Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
}

/** Cubic ease-in-out: slow off the mark and into the landing. */
export function easeInOut(t) {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

function lerp(a, b, k) {
  return a + (b - a) * k;
}

export function introPath(t) {
  const k = easeInOut(t);
  return {
    distance: lerp(INTRO_DISTANCE, 1, k),
    tilt: lerp(INTRO_TILT, FOLLOW_TILT, k),
    offsetX: 0,
    offsetY: lerp(INTRO_OFFSET_Y, 0, k),
    wake: 0,
  };
}

export function epiloguePath(t) {
  const k = easeInOut(t);
  return {
    distance: lerp(1, EPILOGUE_DISTANCE, k),
    tilt: lerp(FOLLOW_TILT, EPILOGUE_TILT, k),
    offsetX: 0,
    offsetY: lerp(0, EPILOGUE_OFFSET_Y, k),
    wake: wakeAt(t),
  };
}

/** The Ring's wake t of the way through a pull-back that wakes it. */
export function wakeAt(t) {
  return easeInOut((clamp01(t) - WAKE_START) / (1 - WAKE_START));
}

// The wake the Ring's answer goes to over act 2's `answer`, from 1, by the
// ending picked (render3d/endingScene.js).
export const ENDING_WAKE = Object.freeze({
  severance: 0, // the Ring's light goes out along its arc
  stewardship: 1.25, // proposta 12/11: it stays lit, a little brighter
});

// The campaign's ending in beats (PLAN.md; ui/runCinematics.js plays them,
// Renderer3D.playEndingBeat draws each). `line`: the index of the beat's
// line in its act's lines (ui/transmissions.js revelationTransmissions,
// endingTransmissions), spoken as it starts, or null; a beat lasts as long
// as its line needs, never less than `minMs`. Act 1, before the choice:
// Sovereign opens, then the truth.
export const REVELATION_BEATS = Object.freeze([
  { id: 'opens', line: 0, minMs: 5000 }, // PLAN.md 24/11
  { id: 'count', line: 1, minMs: 5000 },
  { id: 'recoil', line: 2, minMs: 5000 },
  { id: 'rupture', line: 3, minMs: 5000 },
  { id: 'fences', line: 4, minMs: 5000 },
  { id: 'lock', line: 5, minMs: 5000 },
  { id: 'known', line: 6, minMs: 5000 },
]);

// Act 1's pictures (render3d/endingScene.js), posed on the rough cut the
// owner approved (24/11, card final-do-jogo-4). World units, y up. `hero`:
// the close three-quarter view, eye and aim about Sovereign, the Crucible's
// star held behind it along the view; `opens` sees it turned `orbit` rad
// about Sovereign and `pull` × as far, `count` turns it home; `ship`: where
// the interceptor stands about Sovereign, facing it. The shells hold sealed
// for `sealed` of `opens`, then open to `open` (the fight's widest is 1).
// `recoil`: the pull-back's last pose, `range` out at `tilt`° from straight
// down over a point `ahead` down the field of Sovereign, in the play lens.
// The cuts: `sector` (whose place and look show), eye and aim about the
// field's middle, the eye moving by `drift` over the beat, `exposure` ×.
// `known`: the hero view from `pull` × as far, closing in.
export const REVELATION_SHOTS = Object.freeze({
  hero: { eye: [-360, 430, 210], aim: [-80, 0, -40], fov: 40 },
  ship: [-200, 0, -110],
  open: 1.4,
  opens: { orbit: -Math.PI / 2, pull: [1.18, 1.08], sealed: 0.3 },
  count: { pull: [1.08, 1] },
  recoil: { range: 3400, tilt: 26, ahead: 40, fov: 20 },
  rupture: {
    sector: 'wardens-reach',
    eye: [-1196, -350, -763],
    aim: [-576, -720, 57],
    drift: [160, 40, -90],
    fov: 45,
    exposure: 1.3,
  },
  fences: {
    sector: 'quarantine-grid',
    eye: [140, 1189, 1073],
    aim: [12, 345, 552],
    drift: [-30, -45, -45],
    fov: 42,
    exposure: 1.6,
  },
  lock: {
    sector: 'the-crucible',
    eye: [2800, -1200, 1800],
    aim: [250, -4500, -920],
    drift: [-220, 0, 205],
    fov: 50,
    exposure: 1,
  },
  known: { pull: [1.12, 1] },
});

// Act 2's pictures at the Crucible (render3d/endingScene.js), proposta
// 24/11. `answer` rises from act 1's last picture as its pull-back does, to
// `range` out at `tilt`° from straight down over a point `ahead` down the
// field of Sovereign, in a lens `fov`, while the Ring's wake goes from 1 to
// ENDING_WAKE. `twin`, the last image, goes on from what its `answer` left
// (the Ring's wake at the ending's own, never relit): eye and aim in the
// slip's own frame (render3d/places/crucibleSlip.js: x along the arc, y
// up, z out from the star) held for `hold` of the beat, then pushing in
// toward the lit window, the eye ending at `push` from it; lens `fov`.
// The star below is the key light (`light`: its direction toward the
// light in the slip's frame, colour, and level and exposure × by ending;
// the other lights are off). Severance: the slip's lamps go out from the
// farthest over `lamps` (shares of the beat), the window over `window`,
// then the picture fades to black over the last `fadeMs`. Stewardship:
// the lamps light from the farthest along the arc to the slip over
// `arrive`, the window stays, and the picture is black for the last
// `cutMs`.
export const ENDING_SHOTS = Object.freeze({
  answer: { range: 3400, tilt: 34, ahead: 40, fov: 34 },
  twin: {
    eye: [-470, 190, 760],
    aim: [-30, 30, 0],
    hold: 0.3,
    push: [-60, 40, 260],
    fov: 32,
    light: {
      from: [0, -1, 0.3],
      color: '#ff9a4a',
      severance: { level: 0.65, exposure: 1 },
      stewardship: { level: 0.85, exposure: 1 },
    },
    severance: {
      lamps: [0.2, 0.7],
      window: [0.84, 0.9],
      fadeMs: 1500,
    },
    stewardship: { arrive: [0.3, 0.8], cutMs: 300 },
  },
});

// Act 2 at home (render3d/endingHome.js), in the opening's scene
// (render3d/storyScene.js: world units about the Wake, +x her bow, y up,
// −z port), proposta 24/11 on the rough cut the owner approved. `home` and
// `steady` play the opening's own shot `story` (its camera), every engine
// steady. `return` is the opening's last two shots played backwards: its
// launch over the first `cut` of the beat (the interceptor in from `from`
// of the launch's path, nose on a point `nose` × the hangar's depth
// inside, pitch held within `pitch` rad, its thrust `thrust[0]` to
// `thrust[1]`), then its hangar shot as the interceptor goes in over
// `enter` (shares of that shot); the hangar's light rises to `bay[0]` over
// `lamp` and to `bay[1]` as it goes in. `depart`: the approved wide view,
// the eye drifting `eye[0]` to `eye[1]` and the aim panning `aim[0]` to
// `aim[1]` toward the dark Ring; the Wake turns to port `yaw` rad over
// `turn`, slow off the mark and still turning at the end, and gets under
// way, `travel` world units along her heading over `go` (gathering way),
// her engines to `engines`. `watch`: the same view, still, the lens
// closing `fov[0]` to `fov[1]`; the interceptor at `ship` (world) between
// the eye and the Wake, nose to the horizon under the aim, engines idle at
// `thrust`. The horizon Ring (`ring`: its wake and its idle lights ×): in
// Severance lit at home, dying over `return` to `dying`, dark by `darkBy`
// of `depart`; in Stewardship lit a little brighter throughout.
export const HOME_SHOTS = Object.freeze({
  home: { story: 'wake' },
  steady: { story: 'reactors' },
  return: {
    cut: 0.45,
    from: 0.85,
    nose: 4,
    pitch: 0.3,
    thrust: [0.35, 0.12],
    enter: [0.1, 0.8],
    bay: [1.4, 2.2],
    lamp: [0.2, 0.45],
  },
  depart: {
    eye: [
      [-5000, 1000, -1950],
      [-4800, 980, -1880],
    ],
    aim: [
      [30000, -2600, 9500],
      [30000, -2600, 14500],
    ],
    fov: [38, 38],
    yaw: 1.9,
    turn: [0.12, 1],
    travel: 2600,
    go: [0.3, 1],
    engines: 1.4,
  },
  watch: {
    eye: [
      [-5000, 900, -1950],
      [-4960, 895, -1935],
    ],
    aim: [
      [30000, -2600, 9500],
      [30000, -2600, 9500],
    ],
    fov: [38, 35],
    ship: [-4367, 795, -1804],
    thrust: 0.15,
  },
  ring: {
    severance: { wake: 1, idle: 1, dying: 0.45, darkBy: 0.5 },
    stewardship: { wake: 1.25, idle: 1.6 },
  },
});

// Act 2, after the choice: the answer, home, then each ending's own shots
// and the last image (the rough cut the owner approved, 24/11).
const ENDING_OPENING_BEATS = [
  { id: 'answer', line: 0, minMs: 6000 },
  { id: 'home', line: null, minMs: 4000 },
  { id: 'steady', line: 1, minMs: 5000 },
];
const ENDING_OWN_BEATS = {
  severance: [
    { id: 'return', line: null, minMs: 6000 },
    { id: 'depart', line: null, minMs: 6000 },
  ],
  stewardship: [{ id: 'watch', line: null, minMs: 9000 }],
};
const TWIN_BEAT = { id: 'twin', line: null, minMs: 7000 };

/** Act 2's beats for `ending` ('severance' or 'stewardship'), in order. */
export function endingBeats(ending) {
  return [...ENDING_OPENING_BEATS, ...ENDING_OWN_BEATS[ending], TWIN_BEAT];
}

/** The follow camera's own pose: what a cinematic hands back to. */
export function followPose() {
  return { distance: 1, tilt: FOLLOW_TILT, offsetX: 0, offsetY: 0, wake: 0 };
}

/** `from` → `to` by `k` (0..1), field by field, into `out`. */
export function blendPose(from, to, k, out = {}) {
  const x = easeInOut(k);
  out.distance = lerp(from.distance, to.distance, x);
  out.tilt = lerp(from.tilt, to.tilt, x);
  out.offsetX = lerp(from.offsetX, to.offsetX, x);
  out.offsetY = lerp(from.offsetY, to.offsetY, x);
  out.wake = lerp(from.wake, to.wake, x);
  return out;
}
