// Camera-facing numbers on the field (damage): one canvas texture per
// distinct value and color, cached, drawn on a fixed pool of sprites. Lives in
// the overlay scene Renderer3D draws after the composer, so text is never
// bloomed or smeared by SMAA.

import { PALETTE } from '../../data/constants/palette.js';
import { HALF_H, HALF_W } from './batches.js';

const FONT_PX = 64;
const PAD = 10;
const MAX_CACHED = 160;

export class TextSprites {
  constructor(THREE, scene, seeded, capacity) {
    this.THREE = THREE;
    this.seeded = seeded;
    // color → (value → texture), so a frame builds no keys
    this.caches = new Map();
    this.cached = 0;
    this.sprites = [];
    this.count = 0;
    for (let i = 0; i < capacity; i += 1) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          transparent: true,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        })
      );
      sprite.visible = false;
      sprite.renderOrder = 10;
      scene.add(sprite);
      this.sprites.push(sprite);
    }
  }

  texture(value, color) {
    let cache = this.caches.get(color);
    if (!cache) {
      cache = new Map();
      this.caches.set(color, cache);
    }
    let entry = cache.get(value);
    if (entry) return entry;
    if (this.cached >= MAX_CACHED) {
      this.caches.forEach((map) => {
        map.forEach((old) => old.texture.dispose());
        map.clear();
      });
      this.cached = 0;
    }
    const text = String(value);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const font = `bold ${FONT_PX}px "Rajdhani", sans-serif`;
    ctx.font = font;
    const width = Math.ceil(ctx.measureText(text).width) + PAD * 2;
    const height = FONT_PX + PAD * 2;
    canvas.width = width;
    canvas.height = height;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 12;
    ctx.strokeStyle = PALETTE.background;
    ctx.strokeText(text, width / 2, height / 2);
    ctx.fillStyle = color;
    ctx.fillText(text, width / 2, height / 2);
    const texture = this.seeded(() => new this.THREE.CanvasTexture(canvas));
    texture.encoding = this.THREE.sRGBEncoding;
    entry = { texture, aspect: width / height };
    cache.set(value, entry);
    this.cached += 1;
    return entry;
  }

  begin() {
    this.count = 0;
  }

  /** `size`: glyph height in logical units at (x, y). */
  push(value, x, y, size, color, alpha) {
    if (this.count >= this.sprites.length || !(alpha > 0.01)) return;
    const { texture, aspect } = this.texture(value, color);
    const sprite = this.sprites[this.count];
    this.count += 1;
    const height = size * ((FONT_PX + PAD * 2) / FONT_PX);
    sprite.visible = true;
    if (!sprite.material.map) sprite.material.needsUpdate = true;
    sprite.material.map = texture;
    sprite.material.opacity = alpha;
    sprite.position.set(x - HALF_W, 10, y - HALF_H);
    sprite.scale.set(height * aspect, height, 1);
  }

  end() {
    for (let i = this.count; i < this.sprites.length; i += 1) {
      this.sprites[i].visible = false;
    }
  }
}
