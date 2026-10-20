// Whether `enemy` covers `other`: another living content machine (never a
// rock, a Warden or a Herald) within `radius` px.
const covers = (enemy, other, radius) =>
  other !== enemy &&
  other.alive &&
  Boolean(other.recipe) &&
  Math.hypot(other.x - enemy.x, other.y - enemy.y) <= radius;

/**
 * Wards its neighbours. A shot (a hit with `source.hitPosition`) on another
 * machine within `radius` px drains its ward (`wardHealth`, of `health`)
 * first and sparks off where it lands, until the ward breaks; it comes back
 * whole `recharge` s later. Its own hull is never warded. `wardLinks` (the
 * machines it covers now) and `wardRatio` (0..1) are read by the views; the
 * machines it covers call `guardHit` (RecipeEnemy.takeDamage).
 */
export default {
  params: { radius: 'positive', health: 'positive', recharge: 'positive' },
  getters: {
    wardRatio(enemy, { health }) {
      return Math.max(0, enemy.wardHealth / health);
    },
  },
  methods: {
    /** The damage a hit on `other` keeps after the ward takes its share. */
    guardHit(enemy, { radius, recharge }, other, amount, source) {
      const hit = source?.hitPosition;
      if (!hit || !(enemy.wardHealth > 0) || !covers(enemy, other, radius)) {
        return amount;
      }
      const absorbed = Math.min(enemy.wardHealth, amount);
      enemy.wardHealth -= absorbed;
      if (enemy.wardHealth <= 0) {
        enemy.wardHealth = 0;
        enemy.wardDown = recharge;
        enemy.wardLinks.length = 0;
      }
      const angle = Math.atan2(hit.y - other.y, hit.x - other.x);
      enemy.getEventBus()?.emit?.('shield-deflected', {
        position: { x: hit.x, y: hit.y },
        normal: { x: Math.cos(angle), y: Math.sin(angle) },
        level: 0,
        intensity: enemy.wardHealth > 0 ? 0.6 : 1.6,
      });
      return amount - absorbed;
    },
  },
  reset(enemy, { health }) {
    enemy.wardHealth = health;
    enemy.wardDown = 0;
    enemy.wardLinks = [];
  },
  tick(enemy, { radius, health }, deltaTime, { live }) {
    enemy.wardLinks.length = 0;
    if (!live) return;
    if (enemy.wardDown > 0) {
      enemy.wardDown -= deltaTime;
      if (enemy.wardDown > 0) return;
      enemy.wardHealth = health;
    }
    enemy.system?.forEachActiveEnemy?.((other) => {
      if (covers(enemy, other, radius)) enemy.wardLinks.push(other);
    });
  },
  dying(enemy) {
    enemy.wardLinks.length = 0;
  },
};
