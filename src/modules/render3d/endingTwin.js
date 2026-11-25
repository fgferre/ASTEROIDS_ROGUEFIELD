// The ending's last image (render3d/endingScene.js beat `twin`, core/
// cinematics.js ENDING_SHOTS.twin): the slip on its arc of the Crucible
// (places/crucibleSlip.js), the Wake in it lit from below by the star as
// the scene's key light, the field's other lights off, the camera held on
// the cradle and the arc, then pushing in toward the one lit window. It
// goes on from what the ending's `answer` left: Severance's Crucible
// severed and dark, its lamps going out from the farthest, the window
// last, then the black; Stewardship's plated in light, its lamps lighting
// along the arc to the slip, the window lit to the cut. The slip is built
// and its programs compiled on the loading screen (warm). Nothing is
// allocated per frame.

import { ENDING_SHOTS, ENDING_WAKE, easeInOut } from '../../core/cinematics.js';
import { colorOf } from './batches.js';

const CRUCIBLE = 'the-crucible';
// How far from its target the key light is laid (only its direction counts).
const KEY_REACH = 1000;

// 0 before `from`, 1 after `to`, eased between.
function span(u, [from, to]) {
  return easeInOut((u - from) / (to - from));
}

/**
 * The last image at progress `u` of a `durationMs` beat for `ending`: the
 * Ring's `wake`, the slip's lamps lit from index `on` × their count up to
 * `off` × it (in the order the light reaches them), the window's level,
 * the push in (`push`, 0..1), the picture's `exposure` × and whether it is
 * `black`.
 */
export function twinAt(u, ending, durationMs, out = {}) {
  const shot = ENDING_SHOTS.twin;
  const x = Math.min(1, Math.max(0, (u - shot.hold) / (1 - shot.hold)));
  out.push = 1 - (1 - x) ** 3;
  out.wake = ENDING_WAKE[ending] ?? 0;
  if (ending === 'stewardship') {
    const { arrive, cutMs } = shot.stewardship;
    out.on = 0;
    out.off = span(u, arrive);
    out.window = 1;
    out.exposure = 1;
    out.black = u >= 1 - cutMs / durationMs;
    return out;
  }
  const { lamps, window, fadeMs } = shot.severance;
  out.on = span(u, lamps);
  out.off = 1;
  out.window = 1 - span(u, window);
  out.exposure = 1 - span(u, [1 - fadeMs / durationMs, 1]);
  out.black = u >= 1;
  return out;
}

export class LastImage {
  /** `t`: Renderer3D's WebGL kit. */
  constructor(t) {
    const { THREE } = t;
    this.t = t;
    this.slip = null;
    this.state = {};
    this.from = new THREE.Vector3();
    this.at = new THREE.Vector3();
    this.keyColor = colorOf(THREE, ENDING_SHOTS.twin.light.color);
    // The scene's lights as they were before the last image relit them.
    this.saved = [];
    this.savedKey = { color: new THREE.Color(), position: new THREE.Vector3() };
    this.lit = false;
  }

  /**
   * Loading screen: the slip built on its arc and shown while `compile`
   * builds its programs, then hidden (the frame of everything after
   * uploads its buffers).
   */
  warm(compile) {
    const set = this.t.backdrop.places.built.get(CRUCIBLE);
    this.slip = set.slip();
    const shown = set.object.visible;
    set.object.visible = true;
    this.slip.object.visible = true;
    compile();
    this.slip.object.visible = false;
    set.object.visible = shown;
  }

  show(on) {
    if (this.slip) this.slip.object.visible = on;
  }

  /**
   * Progress `u` of a `durationMs` beat for `ending`: the Crucible laid
   * where the slip stands, `eye` and `aim` (world) about the slip, its
   * lamps and window; the state (twinAt).
   */
  frame(u, ending, durationMs, eye, aim) {
    const shot = ENDING_SHOTS.twin;
    const state = twinAt(u, ending, durationMs, this.state);
    const places = this.t.backdrop.places;
    const layer = places.built.get(CRUCIBLE).layers[0];
    places.setFlight(CRUCIBLE, 1, 0, 0);
    layer.holder.position.set(...layer.anchor);
    const { frame, lamps, pane, glow, paneAt } = this.slip;
    frame.updateWorldMatrix(true, false);
    const k = state.push;
    eye
      .set(...shot.eye)
      .lerp(this.at.copy(paneAt).add(this.from.set(...shot.push)), k);
    aim.set(...shot.aim).lerp(paneAt, k);
    frame.localToWorld(eye);
    frame.localToWorld(aim);
    const on = Math.round(state.on * lamps.length);
    const off = Math.round(state.off * lamps.length);
    for (let i = 0; i < lamps.length; i += 1) {
      lamps[i].visible = i >= on && i < off;
    }
    pane.visible = state.window > 0.01;
    pane.material.color.copy(this.slip.paneColor).multiplyScalar(state.window);
    glow.material.color.copy(this.slip.glowColor).multiplyScalar(state.window);
    const { exposure } = shot.light[ending] ?? shot.light.severance;
    state.exposure *= exposure;
    return state;
  }

  /**
   * Just before the draw: the star below as the key light (its direction
   * in the slip's frame), every other light of the scene off.
   */
  light(ending) {
    const t = this.t;
    const { light } = ENDING_SHOTS.twin;
    const { level } = light[ending] ?? light.severance;
    const roots = t.scene.children;
    for (let i = 0; i < roots.length; i += 1) {
      const root = roots[i];
      if (!root.isLight) continue;
      this.saved.push(root, root.intensity);
      root.intensity = 0;
    }
    const { key } = t;
    this.savedKey.color.copy(key.color);
    this.savedKey.position.copy(key.position);
    key.intensity = level;
    key.color.copy(this.keyColor);
    this.from
      .set(...light.from)
      .transformDirection(this.slip.frame.matrixWorld);
    key.position
      .copy(key.target.position)
      .addScaledVector(this.from, KEY_REACH);
    this.lit = true;
  }

  /** After the draw: the scene's lights as they were. */
  unlight() {
    if (!this.lit) return;
    for (let i = 0; i < this.saved.length; i += 2) {
      this.saved[i].intensity = this.saved[i + 1];
    }
    this.saved.length = 0;
    this.t.key.color.copy(this.savedKey.color);
    this.t.key.position.copy(this.savedKey.position);
    this.lit = false;
  }
}
