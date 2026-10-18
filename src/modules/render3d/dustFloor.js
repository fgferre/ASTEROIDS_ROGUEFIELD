// What is left of the old dust floor (replaced by spaceField.js, PLAN.md
// R5.10): the tileable noise the baked surface maps still use.

// Tileable fbm: four shifted samples cross-faded, so the edges wrap.
export function tileNoise(noise, u, v, scale) {
  const a = noise.fbm(u * scale, v * scale, 0.5, 4);
  const b = noise.fbm((u - 1) * scale, v * scale, 0.5, 4);
  const c = noise.fbm(u * scale, (v - 1) * scale, 0.5, 4);
  const d = noise.fbm((u - 1) * scale, (v - 1) * scale, 0.5, 4);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
