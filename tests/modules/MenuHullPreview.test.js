import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MenuHullPreview } from '../../src/modules/MenuHullPreview.js';

const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

describe('MenuHullPreview', () => {
  it('shows a locked hull as a dark silhouette without plumes', () => {
    const preview = new MenuHullPreview(THREE, new THREE.Group());
    const materialsOf = () => {
      const found = new Set();
      preview.hull.traverse(
        (node) => node.material && found.add(node.material)
      );
      return found;
    };

    preview.setHull('solar-slicer');
    expect(preview.plumes.length).toBeGreaterThan(0);
    expect(materialsOf().has(preview.materials.silhouette)).toBe(false);

    preview.setHull('solar-slicer', true);
    expect(preview.plumes).toHaveLength(0);
    expect([...materialsOf()]).toEqual([preview.materials.silhouette]);
  });
});
