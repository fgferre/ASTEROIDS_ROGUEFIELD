// Which renderer draws the gameplay (docs/NORTE.md §4b): Three.js by default,
// `?renderer=2d` keeps the Canvas 2D path. Without a browser or without the
// THREE global (Node tests, a failed vendor script) it is always 2D.
export function getRendererMode() {
  if (typeof window === 'undefined' || !window.THREE) return '2d';
  try {
    const value = new URLSearchParams(window.location.search).get('renderer');
    return value === '2d' ? '2d' : '3d';
  } catch {
    return '2d';
  }
}
