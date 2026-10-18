import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('stacks the Bastion shoulder armour in two plates on darker steel', () => {
    const preview = new MenuHullPreview(THREE, new THREE.Group());
    preview.setHull('default-hull');
    const plates = preview.hull.children.length;
    const steel = preview.materials.body.color.r;

    preview.setHull('bastion');
    const top = (material) =>
      Math.max(
        ...preview.hull.children
          .filter((mesh) => mesh.material === material)
          .map((mesh) => {
            mesh.geometry.computeBoundingBox();
            return mesh.position.z + mesh.geometry.boundingBox.max.z;
          })
      );
    // the upper armour plate is the highest body-toned plate
    expect(top(preview.materials.body)).toBeGreaterThan(
      top(preview.materials.fin)
    );
    expect(preview.hull.children.length).toBeGreaterThan(plates);
    expect(preview.materials.body.color.r).toBeLessThan(steel);
  });

  // A wide, short box off to the side, like the Hangar's: every vertex of
  // every hull stays inside it at every turn.
  it.each(['default-hull', 'solar-slicer', 'bastion'])(
    'fits %s inside an off-centre stage while it spins',
    (hullId) => {
      vi.stubGlobal('window', { innerWidth: 1600, innerHeight: 900 });
      const stage = { left: 900, top: 520, width: 520, height: 130 };
      const element = { getBoundingClientRect: () => stage };
      const camera = new THREE.PerspectiveCamera(60, 1600 / 900, 0.1, 1000);
      const preview = new MenuHullPreview(THREE, camera);
      preview.setHull(hullId);
      const point = new THREE.Vector3();
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let turn = 0; turn < 48; turn += 1) {
        preview.update((1 / 48 / 0.35) * Math.PI * 2, element, false);
        camera.updateMatrixWorld(true);
        preview.hull.traverse((node) => {
          const position = node.geometry?.attributes.position;
          if (!position) return;
          for (let i = 0; i < position.count; i += 1) {
            point
              .fromBufferAttribute(position, i)
              .applyMatrix4(node.matrixWorld)
              .project(camera);
            const x = ((point.x + 1) / 2) * 1600;
            const y = ((1 - point.y) / 2) * 900;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        });
      }
      expect(minX).toBeGreaterThanOrEqual(stage.left);
      expect(maxX).toBeLessThanOrEqual(stage.left + stage.width);
      expect(minY).toBeGreaterThanOrEqual(stage.top);
      expect(maxY).toBeLessThanOrEqual(stage.top + stage.height);
      // Fitted, not shrunk away: it fills most of the limiting side.
      expect(maxY - minY).toBeGreaterThan(stage.height * 0.6);
    }
  );
});

afterEach(() => vi.unstubAllGlobals());
