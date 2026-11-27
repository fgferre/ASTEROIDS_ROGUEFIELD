// The loading screen's warm-up (app.js, through Renderer3D.warmUp): the
// renderer's scene built and every program a run can draw with compiled
// before the menu shows, split from Renderer3D.js by subject. `r` is the
// renderer.

import { QUALITY_PRESETS } from '../../core/qualityPresets.js';
import { VIEW_KINDS, markShadowCasters } from './enemyMirror.js';
import { SHIP_MIN_CASTER } from './playerMirror.js';

/**
 * Loading screen (app.js): builds the scene (maps baked) and compiles every
 * program a run can draw with — each enemy view kind in all its looks and
 * burning, both hulls, the bosses' danger looks, then one frame of everything through the composer
 * (post passes, texture and buffer uploads). One chunk per task, so the
 * bar repaints; `onProgress(done)` after each, 0..1.
 */
export async function warmUp(r, onProgress) {
  const compile = () => compileScene(r);
  const steps = [
    () => r.ready(),
    () => r.three.player.warm(r.cachedPlayer, compile),
    ...VIEW_KINDS.map((kind) => () => r.three.enemies.warm(kind, compile)),
    () => r.three.enemies.kit.warmLooks(compile),
    () => drawEverything(r),
    // The story's freighter (seconds): every campaign launch tells it.
    () => r.warmStory(),
    // The ending's last image, on the story's Wake (seeded: three names
    // programs with Math.random).
    () => r.seeded(() => r.ending.warm(compile, r.graphics.postProcessing)),
    // The ending's beats at home, in the story's scene.
    () => r.seeded(() => r.ending.warmHome(r.three.camera)),
  ];
  for (let i = 0; i < steps.length; i += 1) {
    if (!r.failed) steps[i]();
    onProgress((i + 1) / steps.length);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

// Programs for the scene's materials (pooled views included) as the
// frame draws them: into the composer's target, or the screen without it.
// Once per program variant the presets use (shadows on/off, surface maps
// on/off), the current preset's last: a quality step in a fight then finds
// its programs built (compiling them there froze a frame 150 ms, seconds
// on a cold shader cache). Programs keep the uniforms of their last build.
export function compileScene(r) {
  const q = r.quality.settings;
  const variants = new Map();
  Object.values(QUALITY_PRESETS).forEach((p) =>
    variants.set(`${p.shadows > 0}/${p.surfaceMaps}`, p)
  );
  variants.delete(`${q.shadows > 0}/${q.surfaceMaps}`);
  [...variants.values(), q].forEach((p) => {
    compileVariant(r, p.shadows > 0, p.surfaceMaps);
  });
}

function compileVariant(r, shadows, surfaceMaps) {
  const t = r.three;
  t.renderer.shadowMap.enabled = shadows;
  t.key.castShadow = shadows;
  t.enemies.setSurfaceMaps(surfaceMaps);
  t.player.setSurfaceMaps(surfaceMaps);
  markShadowCasters(t.player.group, SHIP_MIN_CASTER);
  t.renderer.setRenderTarget(
    r.graphics.postProcessing ? t.composer.readBuffer : null
  );
  t.renderer.compile(t.scene, t.camera);
  t.renderer.setRenderTarget(null);
  t.renderer.compile(t.overlay, t.camera);
}

// One frame with every object shown and unculled (lights as they are, so
// the light count programs are keyed on stays the run's) and every pass on.
function drawEverything(r) {
  const t = r.three;
  const saved = [];
  t.scene.traverse((object) => {
    if (object.isLight) return;
    saved.push(object, object.visible, object.frustumCulled);
    object.visible = true;
    object.frustumCulled = false;
  });
  t.bloomPass.enabled = true;
  t.smaaPass.enabled = true;
  t.impactPass.enabled = true;
  // Seeded: the shadow pass names its depth material with a Math.random
  // UUID the first time it draws.
  r.seeded(() => t.composer.render(0));
  t.renderer.render(t.overlay, t.camera);
  for (let i = 0; i < saved.length; i += 3) {
    saved[i].visible = saved[i + 1];
    saved[i].frustumCulled = saved[i + 2];
  }
  t.impactPass.enabled = false;
  r.syncPasses();
}
