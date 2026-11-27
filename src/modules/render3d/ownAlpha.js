// The Ring and the places' surfaces fade by switching `transparent` on and
// off as they go, keeping the program they have (a rebuild would compile
// mid-play). three drops alpha to 1 in a program built while its material
// was opaque, and rebuilds one whenever the scene's lights change (hits and
// veins light and go out all the time): a Ring rebuilt while whole then
// faded as a whole Ring. Their programs write their own alpha however they
// were built; while opaque the blend is off, so nothing else changes.

/** `fragmentShader` with three's opaque ending swapped for one that keeps alpha. */
export function writeOwnAlpha(THREE, fragmentShader) {
  const chunk = THREE.ShaderChunk.opaque_fragment.replace(
    /#ifdef OPAQUE\s*diffuseColor\.a = 1\.0;\s*#endif/,
    ''
  );
  if (chunk === THREE.ShaderChunk.opaque_fragment) {
    throw new Error('three.js: the opaque chunk changed');
  }
  return fragmentShader.replace('#include <opaque_fragment>', chunk);
}
