// A burn (the thermal family's: the Incendiary Lance, the Arc Caster, the
// Furnace Corona, the Solar Flare) bites what it burns at each tick, instead
// of a glow floating over it (docs/NORTE.md: every hit is physical): a molten
// mark on the side facing the ship, where the shots came from, slow embers
// and drips of slag, and soot rising off the bite while it burns. A rock
// takes the mark of its own material, as a shot's (strikeOf): stone a lava
// patch, iron the hull's molten metal, crystal glints and no scorch. The
// Solar Flare's burns throw more.

import { isBossEnemy } from '../physics/bossTuning.js';
import { strikeOf } from './enemies/rocks.js';
import { hashId } from './enemyMirror.js';
import { SPARK_KIND } from './hitSparks.js';
import { DECAL_KIND } from './scorchDecals.js';

// proposta 17/11 (efeito/impacto, lote 4): how far round from the ship's
// side the ticks bite (rad, the whole spread), how far out (× radius), and
// the soot: puffs, cycle (s), drift and rise (world units over a cycle),
// height, size (start, end), alpha, colour.
const SPREAD = 1.8;
const REACH = 0.6;
const WISPS = 3;
const WISP_TIME = 0.9;
const WISP_DRIFT = 10;
const WISP_RISE = 8;
const WISP_H = 7;
const WISP_SIZE = [4, 11];
const WISP_ALPHA = 0.45;
const SOOT = [0.14, 0.12, 0.11];

export class BurnMarks {
  constructor() {
    this.bites = new WeakMap(); // burn entry → its last bite
    this.clock = 0;
  }

  /**
   * Bites each burn that ticked since the last frame and draws the soot of
   * every burn; `three` the scene's parts (decals, enemy views, smoke).
   */
  update(dt, combat, player, three, hitSparks) {
    const burns = combat?.burns;
    if (!burns?.size || !three) return;
    this.clock += dt;
    const flare = combat.weapons.hasApex('thermal');
    const ship = player?.position;
    burns.forEach((entry, enemy) => {
      const r = enemy.radius || 12;
      let bite = this.bites.get(entry);
      if (bite?.ticks !== entry.ticksLeft) {
        const toShip = ship
          ? Math.atan2(ship.y - enemy.y, ship.x - enemy.x)
          : 0;
        const seed = hashId(enemy.id) % 9973;
        const h = Math.sin(seed * 12.9898 + entry.ticksLeft * 78.233);
        const jitter = h * 43758.5453 - Math.floor(h * 43758.5453) - 0.5;
        const angle = toShip + jitter * SPREAD;
        bite = {
          ticks: entry.ticksLeft,
          nx: Math.cos(angle),
          ny: Math.sin(angle),
          seed,
        };
        this.bites.set(entry, bite);
        this.bite(enemy, bite, flare, three, hitSparks);
      }
      const x = enemy.x + bite.nx * r * REACH;
      const y = enemy.y + bite.ny * r * REACH;
      for (let i = 0; i < WISPS; i += 1) {
        const age = (this.clock / WISP_TIME + i / WISPS + bite.seed * 0.01) % 1;
        three.smoke.push(
          x + bite.nx * age * WISP_DRIFT,
          WISP_H + age * WISP_RISE,
          y + bite.ny * age * WISP_DRIFT,
          SOOT,
          WISP_SIZE[0] + (WISP_SIZE[1] - WISP_SIZE[0]) * age,
          WISP_ALPHA * Math.sin(Math.PI * age)
        );
      }
    });
  }

  bite(enemy, { nx, ny }, flare, three, hitSparks) {
    const r = enemy.radius || 12;
    const strike = enemy.type === 'asteroid' ? strikeOf(enemy) : 'metal';
    const metal = strike === 'metal';
    hitSparks.emit(
      enemy.x + nx * r * REACH,
      enemy.y + ny * r * REACH,
      nx,
      ny,
      0,
      0,
      flare,
      metal ? SPARK_KIND.burn : SPARK_KIND[strike]
    );
    if (isBossEnemy(enemy)) return;
    const view = three.enemies.views.get(enemy.id || enemy);
    if (!view || view.kind.startsWith('herald')) return;
    const mark = metal ? DECAL_KIND.burn : DECAL_KIND[strike];
    if (mark !== undefined) three.decals.hit(view, nx, ny, mark);
  }
}
