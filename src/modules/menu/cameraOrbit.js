// src/modules/menu/cameraOrbit.js
//
// The menu camera's slow orbit around the asteroid field, with a lens float
// on top, eased so it feels heavy. It came from MenuBackgroundSystem.animate
// unchanged.

/**
 * Moves `camera` one frame along the orbit.
 * @returns {number} the orbit angle (the star layers turn with it)
 */
export function orbitCamera(camera, elapsedTime) {
  // More pronounced camera orbit so parallax is readable without mouse input.
  const timer = elapsedTime * 0.06;
  const orbitalRadius = 140;

  // Cinematic Damping & Lens Float
  const driftX = Math.sin(elapsedTime * 0.4) * 6;
  const driftY = Math.cos(elapsedTime * 0.25) * 4;

  const targetPosX = Math.cos(timer) * orbitalRadius + driftX;
  const targetPosZ = Math.sin(timer) * orbitalRadius;
  const targetPosY = Math.sin(timer * 0.7) * 15 + driftY;

  // Smooth lerp for "weighty" camera feel
  const camLerp = 0.04;
  camera.position.x += (targetPosX - camera.position.x) * camLerp;
  camera.position.y += (targetPosY - camera.position.y) * camLerp;
  camera.position.z += (targetPosZ - camera.position.z) * camLerp;

  return timer;
}
