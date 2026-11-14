// src/modules/enemies/boss/rockPull.js
//
// A boss dragging rocks in (the Quarry Maw's mouth, Sovereign's REBUILD
// half): rocks where `inside(rock, rock radius)` holds are accelerated toward
// `centre`, up to a top speed; a rock within `reach` px of it (plus half its
// own radius) is absorbed — gone without 'enemy-destroyed', so no orbs, no
// kill, no combo, but the layer still counts it as gone and can close — and
// `onAbsorb(rock)` runs. `pull` is { reach, acceleration, maxSpeed }.

export function pullRocks(boss, centre, deltaTime, pull, inside, onAbsorb) {
  const { reach, acceleration, maxSpeed } = pull;
  const rocks = [];
  boss.system?.forEachActiveEnemy?.((enemy) => {
    if (enemy.type === 'asteroid' && !enemy.destroyed) rocks.push(enemy);
  });
  for (const rock of rocks) {
    const dx = centre.x - rock.x;
    const dy = centre.y - rock.y;
    const d = Math.hypot(dx, dy);
    if (d <= reach + (rock.radius || 0) * 0.5) {
      rock.destroyed = true;
      boss.system?.invalidateActiveEnemyCache?.();
      boss.system?.waveManager?.onEnemyDestroyed?.({
        enemy: rock,
        swallowedBy: boss.id,
      });
      onAbsorb(rock);
      continue;
    }
    if (!inside(rock, rock.radius || 0)) continue;
    rock.vx += (dx / d) * acceleration * deltaTime;
    rock.vy += (dy / d) * acceleration * deltaTime;
    const speed = Math.hypot(rock.vx, rock.vy);
    if (speed > maxSpeed) {
      rock.vx *= maxSpeed / speed;
      rock.vy *= maxSpeed / speed;
    }
  }
}
