// src/modules/MenuHullPreview.js

// The chosen hull on the main menu and in the Hangar: the game's own 3D ship
// (render3d/hullModel.js, laid out as render3d/playerMirror.js draws it, at
// the hull's base upgrade levels) under menu materials: the matte
// vertex-coloured hull and turret and the glass canopy, edge lines, glowing
// throats and a thruster plume in the hull accent (cyan Interceptor, amber
// Solar Slicer and Bastion). The menu's key light circles the hull as the
// camera orbits, so a fixed screen-space studio light (hull and canopy
// shaders only) keeps it readable when the key light is behind it. A locked
// hull is one dark silhouette, without lines, glows or plume. It hangs off
// the menu camera, framed into the #menu-hull-stage box (#hangar-hull-stage
// while the Hangar is open), and turns slowly on its own axis (still with
// reduced motion).

import { getShipModelById } from '../data/shipModels.js';
import { PALETTE } from '../data/constants/palette.js';
import { HullArt } from './player/hullArt.js';
import { colorOf } from './render3d/batches.js';
import {
  NOZZLE_HEIGHT,
  VISUAL_SCALE,
  buildHullModel,
  buildTurret,
  edgeLines,
  hullTones,
  seatTurret,
  throatGeometry,
} from './render3d/hullModel.js';

// The menu shows each hull as it starts a run.
const BASE_LEVELS = Object.freeze({ thruster: 0, rcs: 0, braking: 0 });
// Camera-space placement: distance in front of the camera (close, so few
// passing rocks come between), and the hull tilted back so it is seen from
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
      // Facing the viewer whatever the normal's sign.
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

    // The game's hull tones (scaled per hull by its `albedo` in the model)
    // and its upgrade-applied panels.
    this.tones = hullTones(THREE);
    this.hullArt = new HullArt();
    const studio = (material) => {
      material.onBeforeCompile = patchHull;
      return material;
    };
    this.materials = {
      hull: studio(
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          metalness: 0.2,
          roughness: 0.8,
        })
      ),
      // Dark glass with a dim cyan glow, as in the game.
      canopy: studio(
        new THREE.MeshStandardMaterial({
          color: colorOf(THREE, PALETTE.rockShadow),
          emissive: colorOf(THREE, PALETTE.player).multiplyScalar(0.14),
          metalness: 0.1,
          roughness: 0.3,
        })
      ),
      edge: new THREE.LineBasicMaterial({
        color: colorOf(THREE, PALETTE.player).multiplyScalar(0.7),
      }),
      // The amber lens (no tone mapping here: no overdrive).
      lens: new THREE.MeshBasicMaterial({
        color: colorOf(THREE, PALETTE.shot),
      }),
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
    const { THREE, materials } = this;
    const { visual } = definition;
    const dark = this.silhouette && materials.silhouette;
    const geometry = this.hullArt.getHullGeometry(definition, BASE_LEVELS);
    const model = buildHullModel(THREE, geometry, this.tones);

    // The game's layout: the hull at VISUAL_SCALE, the turret unscaled on
    // its deck; the ship's up turned onto the spin axis (+z).
    const layout = new THREE.Group();
    layout.rotation.x = Math.PI / 2;
    const ship = new THREE.Group();
    ship.scale.setScalar(VISUAL_SCALE);
    const body = new THREE.Mesh(model.hull, dark || materials.hull);
    body.name = 'hull';
    ship.add(body, new THREE.Mesh(model.canopy, dark || materials.canopy));
    const turret = buildTurret(
      THREE,
      dark || materials.hull,
      this.tones,
      dark || materials.lens
    );
    seatTurret(turret, visual, model);
    [turret.housing, turret.housingLow]
      .filter((housing) => !housing.visible)
      .forEach((housing) => {
        turret.group.remove(housing);
        housing.geometry.dispose();
      });
    layout.add(ship, turret.group);
    const hull = new THREE.Group();
    hull.add(layout);
    hull.userData.materials = [];
    this.plumes = [];

    if (!dark) {
      const accent = colorOf(THREE, PALETTE[visual.accent] ?? PALETTE.player);
      const bladeEdge = new THREE.LineBasicMaterial({
        color: accent.clone().multiplyScalar(1.3),
      });
      edgeLines(THREE, model, { edge: materials.edge, bladeEdge }).forEach(
        (line) => ship.add(line)
      );
      // Glowing throats and a plume in the hull accent at every nozzle.
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
      geometry.nozzles.forEach((nozzle) => {
        ship.add(new THREE.Mesh(throatGeometry(THREE, nozzle), glow));
        const plumeLength = nozzle.r * PLUME_LENGTH * 2;
        const plume = new THREE.Mesh(
          new THREE.ConeGeometry(nozzle.r * 1.1, plumeLength, 12, 1, true),
          plumeMaterial
        );
        // Base at the nozzle mouth, tip trailing toward -x.
        plume.geometry.translate(0, plumeLength / 2, 0);
        plume.rotation.z = Math.PI / 2;
        plume.position.set(nozzle.exitX, NOZZLE_HEIGHT, nozzle.y);
        ship.add(plume);
        this.plumes.push(plume);
      });
      hull.userData.materials.push(bladeEdge, glow, plumeMaterial);
    }

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
