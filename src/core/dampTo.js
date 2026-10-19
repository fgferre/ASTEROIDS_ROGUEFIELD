/**
 * Critically damped step of `d` ({ value, velocity }) toward `target`
 * (Game Programming Gems 4, 1.10): no overshoot, frame-rate independent.
 */
export function dampTo(d, target, smoothTime, dt) {
  const step = Math.max(0, dt);
  const omega = 2 / smoothTime;
  const x = omega * step;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = d.value - target;
  const temp = (d.velocity + omega * change) * step;
  d.velocity = (d.velocity - omega * temp) * decay;
  d.value = target + (change + temp) * decay;
  return d.value;
}
