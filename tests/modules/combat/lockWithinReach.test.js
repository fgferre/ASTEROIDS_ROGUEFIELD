import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createScene, quietWorld, SHIP } from '../../__helpers__/cardScene.js';

// With the Targeting Matrix, the lock prefers a volatile rock; the Afterburn
// Lance's longer lock range reached one 430 px out, past where the Scatter
// Coil bursts and the Arc Caster jumps, and the turret turned the weapon to
// it: the rock 150 px ahead took no damage at all (the card matrix's check,
// 25/11). A target the weapon reaches now comes before one it does not.
describe('the lock and the weapon in hand', () => {
  let restore;
  beforeEach(() => (restore = quietWorld()));
  afterEach(() => restore());

  it.each(['scatter', 'arc-caster'])(
    'keeps the %s on the rock it reaches, not a volatile one beyond it',
    (weapon) => {
      const scene = createScene({
        weapon,
        cards: [
          ['auto_aim', 1],
          ['targeting_suite', 1],
          ['afterburn_lance', 1],
        ],
      });
      const angle = Math.PI / 3;
      const place = () => [
        [near, SHIP.x + 150, SHIP.y],
        [far, SHIP.x + Math.cos(angle) * 430, SHIP.y + Math.sin(angle) * 430],
      ];
      const near = scene.spawn('asteroid', { x: SHIP.x + 150, y: SHIP.y });
      const far = scene.spawn('asteroid', {
        x: SHIP.x + Math.cos(angle) * 430,
        y: SHIP.y + Math.sin(angle) * 430,
        variant: 'volatile',
      });
      let onNear = 0;
      scene.run(3, (sc) => {
        sc.park();
        place().forEach(([rock, x, y]) => {
          rock.x = x;
          rock.y = y;
          rock.vx = 0;
          rock.vy = 0;
        });
        if (sc.combat.targeting.currentTarget === near) onNear += 1;
      });
      expect(onNear).toBeGreaterThan(170);
      expect(scene.damageTo(near)).toBeGreaterThan(0);
    }
  );
});
