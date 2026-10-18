// src/modules/MenuHullPreview.js

// The chosen hull on the main menu: the panels of shipModels.js extruded as
// matte plates (dark base from the outline, fins, raised body and prow),
// glowing nozzles with a thruster plume in the hull accent (cyan
// Interceptor, amber Solar Slicer). The menu's key light circles the hull as
// the camera orbits, so a fixed screen-space studio light (hull shader only)
// keeps it readable when the key light is behind it. It hangs off the menu
// camera, framed into the #menu-hull-stage box, and turns slowly on its
// own axis (still with reduced motion). A stand-in for the game's
// render3d/playerMirror.js hull, which has no standalone factory.

import { getShipModelById } from '../data/shipModels.js';
import { PALETTE } from '../data/constants/palette.js';

// Plate heights in hull units (base from the outline, fins, body and prow).
const BASE_DEPTH = 1.6;
const FIN_DEPTH = 2.4;
const BODY_DEPTH = 3.6;
const BEVEL = 0.4;
// Camera-space placement: distance in front of the camera (close, so few
// passing rocks come between), and the plate tilted back so it is seen from
// above and in front.
const STAGE_DISTANCE = 20;
const TILT = -1.0;
const SPIN_RADIANS_PER_S = 0.35;
const REST_ANGLE = 0.7;
// Share of the stage box the hull may fill at its widest turn (12 % margin).
const FILL = 0.88;
const PLUME_LENGTH = 3.5;
// Studio light: view-space direction (upper left, toward the viewer) and
// strength, added to the hull's own shading only.
const STUDIO_GLSL = 'vec3(-0.45, 0.7, 0.55)';
const STUDIO_STRENGTH = '1.1';
// A locked hull's silhouette: dark slate, a shade above the starfield.
const SILHOUETTE_COLOR = 0x1c2533;

// Plume: white-hot at the nozzle, fading into the accent toward the tip
// (cone uv.y runs 0 at the base to 1 at the tip).
const PLUME_VERTEX = `varying float vT;
void main() {
  vT = uv.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const PLUME_FRAGMENT = `uniform vec3 uColor;
varying float vT;
void main() {
  float a = pow(1.0 - vT, 1.6) * 0.8;
  gl_FragColor = vec4(mix(vec3(1.0), uColor, 0.4 + 0.6 * vT) * a, a);
}`;

function patchHull(shader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    `#include <emissivemap_fragment>
      // Facing the viewer whatever the derivative sign (flat shading).
      vec3 facing = faceforward(normal, -vViewPosition, normal);
      float studio = max(dot(facing, normalize(${STUDIO_GLSL})), 0.0);
      totalEmissiveRadiance += diffuseColor.rgb * ${STUDIO_STRENGTH} * studio;`
  );
}

export class MenuHullPreview {
  constructor(THREE, camera) {
    this.THREE = THREE;
    this.camera = camera;
    this.root = new THREE.Group();
    this.tilt = new THREE.Group();
    this.tilt.rotation.x = TILT;
    this.spin = new THREE.Group();
    this.spin.rotation.z = REST_ANGLE;
    this.root.add(this.tilt);
    this.tilt.add(this.spin);
    this.root.visible = false;
    camera.add(this.root);

    // The game hull's three tones (render3d/playerMirror.js).
    const tone = (from, to, t) =>
      new THREE.Color(from).lerp(new THREE.Color(to), t).convertSRGBToLinear();
    const matte = (color, roughness) => {
      const material = new THREE.MeshStandardMaterial({
        color,
        metalness: 0.2,
        roughness,
        flatShading: true,
      });
      material.onBeforeCompile = patchHull;
      return material;
    };
    this.materials = {
      base: matte(tone(PALETTE.hull, PALETTE.hullLit, 0.2), 0.85),
      fin: matte(tone(PALETTE.hullLit, PALETTE.neutral, 0.15), 0.8),
      body: matte(tone(PALETTE.hullLit, PALETTE.neutral, 0.6), 0.72),
      // A locked hull: one flat dark tone, no glow or plume.
      silhouette: new THREE.MeshBasicMaterial({ color: SILHOUETTE_COLOR }),
    };
    this.hullId = null;
    this.silhouette = false;
    this.hull = null;
    this.plumes = [];
    // Hull extent around the spin axis: `radius` in the plate's plane,
    // `depth` along the axis (hull units, plumes included).
    this.radius = 1;
    this.depth = 0;
    this.time = 0;
  }

  /**
   * Builds the hull for `hullId` (shipModels.js), as a dark silhouette when
   * `silhouette` (a locked hull); no-op when unchanged.
   */
  setHull(hullId, silhouette = false) {
    if (hullId === this.hullId && silhouette === this.silhouette) return;
    this.hullId = hullId;
    this.silhouette = silhouette;
    if (this.hull) {
      this.spin.remove(this.hull);
      this.hull.traverse((node) => node.geometry?.dispose());
      this.hull.userData.materials.forEach((material) => material.dispose());
    }
    this.hull = this.build(getShipModelById(hullId));
    this.spin.add(this.hull);
  }

  build(definition) {
    const { THREE } = this;
    const visual = definition.visual;
    const hull = new THREE.Group();
    const plate = (points, depth, material, z = 0) => {
      const shape = new THREE.Shape(
        points.map((p) => new THREE.Vector2(p.x, p.y))
      );
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelThickness: BEVEL,
        bevelSize: BEVEL,
        bevelSegments: 1,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.z = z;
      hull.add(mesh);
    };

    const dark = this.silhouette && this.materials.silhouette;
    plate(definition.outline, BASE_DEPTH, dark || this.materials.base);
    visual.panels
      .filter((panel) => !panel.minLevel)
      .forEach((panel) => {
        const fin = panel.rcsPort !== undefined;
        plate(
          panel.points,
          fin ? FIN_DEPTH : BODY_DEPTH,
          dark || (fin ? this.materials.fin : this.materials.body),
          BASE_DEPTH * 0.5
        );
      });

    // Dark nozzle bells with a hot core and a plume in the hull accent.
    const accent = new THREE.Color(PALETTE[visual.accent] ?? PALETTE.player);
    const glow = new THREE.MeshBasicMaterial({
      color: accent.clone().lerp(new THREE.Color(0xffffff), 0.35),
    });
    const plumeMaterial = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: accent } },
      vertexShader: PLUME_VERTEX,
      fragmentShader: PLUME_FRAGMENT,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.plumes = [];
    const nozzleZ = BASE_DEPTH * 0.5 + FIN_DEPTH * 0.5;
    visual.nozzles
      .filter((nozzle) => !nozzle.minLevel)
      .forEach((nozzle) => {
        const length = visual.nozzleLength;
        const bell = new THREE.Mesh(
          new THREE.CylinderGeometry(nozzle.r * 1.25, nozzle.r, length, 12),
          dark || this.materials.base
        );
        bell.rotation.z = Math.PI / 2;
        bell.position.set(nozzle.x - length / 2, nozzle.y, nozzleZ);
        hull.add(bell);
        if (dark) return;
        const core = new THREE.Mesh(
          new THREE.CircleGeometry(nozzle.r, 16),
          glow
        );
        core.rotation.y = -Math.PI / 2;
        core.position.set(nozzle.x - length - 0.05, nozzle.y, nozzleZ);
        hull.add(core);

        const plumeLength = nozzle.r * PLUME_LENGTH * 2;
        const plume = new THREE.Mesh(
          new THREE.ConeGeometry(nozzle.r * 1.1, plumeLength, 12, 1, true),
          plumeMaterial
        );
        // Base at the nozzle mouth, tip trailing toward -x.
        plume.geometry.translate(0, plumeLength / 2, 0);
        plume.rotation.z = Math.PI / 2;
        plume.position.set(nozzle.x - length, nozzle.y, nozzleZ);
        hull.add(plume);
        this.plumes.push(plume);
      });
    hull.userData.materials = [glow, plumeMaterial];

    // Centre the hull on the spin axis; its farthest point from the axis and
    // its thickness set the framing.
    const box = new THREE.Box3().setFromObject(hull);
    const center = box.getCenter(new THREE.Vector3());
    hull.children.forEach((child) => child.position.sub(center));
    hull.updateMatrixWorld(true);
    const point = new THREE.Vector3();
    this.radius = 0;
    this.depth = 0;
    hull.traverse((node) => {
      const position = node.geometry?.attributes.position;
      if (!position) return;
      for (let i = 0; i < position.count; i += 1) {
        point.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld);
        this.radius = Math.max(this.radius, Math.hypot(point.x, point.y));
        this.depth = Math.max(this.depth, Math.abs(point.z));
      }
    });
    return hull;
  }

  /**
   * Frames the hull into the `stageElement` box and turns it; hidden while
   * the box has no size (menu not on screen).
   */
  update(dt, stageElement, reducedMotion) {
    const { THREE, camera } = this;
    const stage = stageElement?.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    if (!this.hull || !stage?.width) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    const halfH =
      STAGE_DISTANCE * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const halfW = halfH * camera.aspect;
    const cx = ((stage.left + stage.width / 2) / viewport.width) * 2 - 1;
    const cy = 1 - ((stage.top + stage.height / 2) / viewport.height) * 2;
    this.root.position.set(cx * halfW, cy * halfH, -STAGE_DISTANCE);

    // Spinning on the tilted plate, the hull reaches `radius` sideways,
    // radius·cos(tilt) + depth·sin(tilt) up and down, and comes
    // radius·sin(tilt) + depth·cos(tilt) toward the camera, where perspective
    // enlarges it and pushes it away from the screen centre. Scale s keeps
    // every point inside the stage half-size T around its centre c:
    // s·h·D + |c|·s·d ≤ T·(D − s·d).
    const { radius, depth } = this;
    const sinT = Math.abs(Math.sin(TILT));
    const cosT = Math.abs(Math.cos(TILT));
    const toward = radius * sinT + depth * cosT;
    const fit = (half, centre, reach) =>
      (half * STAGE_DISTANCE) /
      (reach * STAGE_DISTANCE + (Math.abs(centre) + half) * toward);
    const scale = Math.min(
      fit(
        (stage.width / viewport.width) * halfW * FILL,
        this.root.position.x,
        radius
      ),
      fit(
        (stage.height / viewport.height) * halfH * FILL,
        this.root.position.y,
        radius * cosT + depth * sinT
      )
    );
    this.root.scale.setScalar(scale);

    if (reducedMotion) return;
    this.time += dt;
    this.spin.rotation.z += SPIN_RADIANS_PER_S * dt;
    const flicker = 1 + Math.sin(this.time * 31) * 0.06;
    this.plumes.forEach((plume) => plume.scale.set(1, flicker, 1));
  }
}
