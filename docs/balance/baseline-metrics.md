# Baseline Balance Metrics

**Document Purpose**: Establish performance and balance baseline before Week 1 polish.
**Date**: 2025-10-01
**Phase**: Pre-Consolidation & Polish

---

## Performance Baseline

### Target Performance
- **Target FPS**: 60 FPS stable
- **Acceptable FPS**: 45+ FPS
- **Critical FPS**: 30 FPS (warning threshold)
- **Max Frame Time**: 16.67ms (60 FPS) / 33.33ms (30 FPS)

### Expected Object Counts (Wave 10)
- **Asteroids**: ~15-20 active
- **Bullets**: ~30-50 (with multishot)
- **XP Orbs**: ~40-100 (depending on collection)
- **Particles**: ~200-500 (explosions, trails)

---

## Ship Balance

### Movement Physics
```javascript
SHIP_ACCELERATION = 280      // Units/s²
SHIP_MAX_SPEED = 220          // Units/s
SHIP_LINEAR_DAMPING = 3.1     // s⁻¹ (drift decay)
SHIP_ROTATION_SPEED = 8       // rad/s
SHIP_ANGULAR_DAMPING = 6.2    // s⁻¹ (rotation decay)
SHIP_MASS = 60                // kg
```

**Feel Assessment**:
- [ ] Acceleration feels responsive?
- [ ] Max speed feels appropriate?
- [ ] Drift/inertia feels good?
- [ ] Rotation speed feels smooth?
- [ ] Ship feels heavy enough?

### Combat
```javascript
COMBAT_SHOOT_COOLDOWN = 0.3        // 3.33 shots/sec
BULLET_SPEED = 450                 // Units/s
COMBAT_BULLET_LIFETIME = 1.8       // seconds
COMBAT_TARGETING_RANGE = 400       // Units
COMBAT_MULTISHOT_SPREAD_STEP = 0.3 // radians (~17°)
```

**Balance Questions**:
- [ ] Fire rate feels satisfying?
- [ ] Bullet speed feels fast enough?
- [ ] Multishot spread feels appropriate?
- [ ] Auto-targeting range feels balanced?

---

## Asteroid Balance

### Base Health by Size
```javascript
Large:  90 HP (base)
Medium: 50 HP (base)
Small:  30 HP (base)
```

### Health Scaling
```javascript
ASTEROID_HEALTH_SCALING = {
  perWave: 0.12,          // +12% per wave
  maxMultiplier: 2.2      // Max 220% of base
}
```

**Wave 1**: 90 / 50 / 30 HP
**Wave 5**: 133 / 74 / 44 HP (+48%)
**Wave 10**: 187 / 104 / 62 HP (+107%)
**Wave 15+**: 198 / 110 / 66 HP (capped at 220%)

### Speed by Size
```javascript
Large:  25 Units/s
Medium: 45 Units/s
Small:  70 Units/s
```

### XP Rewards
```javascript
Large:  15 XP (base)
Medium: 8 XP (base)
Small:  5 XP (base)
```

---

## Variant Balance

### Variant Health Multipliers
```javascript
Common:    1.0x HP
DenseCore: 1.8x HP (only medium)
Volatile:  0.6x HP
Parasite:  0.8x HP
Crystal:   0.7x HP
```

### Variant Speed Multipliers
```javascript
Common:    1.0x Speed
DenseCore: 0.65x Speed (slow tank)
Volatile:  1.4x Speed (fast glass cannon)
Parasite:  1.2x Speed (aggressive)
Crystal:   0.8x Speed (slow high-value)
```

### Variant XP Multipliers
```javascript
Common:    1.0x XP
DenseCore: 2.0x XP
Volatile:  1.2x XP
Parasite:  1.5x XP
Crystal:   2.2x XP (highest)
```

### Variant Spawn Chances

**Large Asteroids**:
- 30% chance for variant
  - 45% DenseCore
  - 25% Volatile
  - 20% Parasite
  - 10% Crystal

**Medium Asteroids**:
- 20% chance for variant
  - 30% DenseCore
  - 35% Volatile
  - 25% Parasite
  - 10% Crystal

**Small Asteroids**:
- 12% chance for variant
  - 10% DenseCore
  - 45% Volatile
  - 35% Parasite
  - 10% Crystal

**Wave Bonus**: +2% per wave starting at wave 4, capped at +12%

---

## Special Behaviors

### Parasite Variant
```javascript
Acceleration: 180 units/s²
Max Speed: 160 units/s
Min Distance: 25 units (repel when too close)
Contact Damage: 20 HP
Cooldown: 1.2 seconds
```

**Balance Questions**:
- [ ] Parasite feels threatening?
- [ ] Contact damage feels fair?
- [ ] Tracking speed feels balanced?
- [ ] Repulsion prevents sticking?

### Volatile Variant
```javascript
Fuse Time: 6 seconds (total)
Arm Time: 1.6 seconds (before armed)
Explosion Radius: 85 units
Explosion Damage: 35 HP
```

**Balance Questions**:
- [ ] Fuse timer feels fair?
- [ ] Explosion radius feels appropriate?
- [ ] Explosion damage feels balanced?
- [ ] Visual warning is clear?

---

## Shield System

### Shield Stats
```javascript
Default Hits: 3
Cooldown: 20 seconds
Shockwave Radius: 300 units
Shockwave Force: 350 units/s
Hit Grace Time: 0.28 seconds (prevent double-hits)
Impact Damage: 10 + (4 × level)
```

**Balance Questions**:
- [ ] 3 hits feels generous enough?
- [ ] 20s cooldown feels fair?
- [ ] Shockwave radius feels impactful?
- [ ] Impact damage feels rewarding?

---

## Wave Progression

### Wave Configuration Examples

**Wave 1-3**: Small asteroids only (4-6 total)
**Wave 4-6**: Mixed medium/small (8-10 total)
**Wave 7-10**: Mixed large/medium/small with variants (12-15 total)
**Wave 11+**: Dynamic generation with scaling

### Dynamic Wave Generation (Wave 11+)
```javascript
Base Count = 5 + (wave / 5) * 2

Distribution:
- 30% Large asteroids
- 40% Medium asteroids
- 30% Small asteroids

Variant chances increase with wave number
```

---

## Progression Balance

### Level Progression
```javascript
Initial XP Requirement: 100 XP
Level Scaling: 1.2x per level

Level 1→2: 100 XP
Level 2→3: 120 XP
Level 3→4: 144 XP
Level 4→5: 173 XP
Level 5→6: 207 XP
```

### Upgrade System
- 3 upgrades offered per level
- Weighted random selection
- Some upgrades rarer than others

---

## Balance Testing Checklist

### Early Game (Waves 1-3)
- [ ] Player can learn controls comfortably
- [ ] Damage dealt feels significant
- [ ] Asteroid health feels appropriate
- [ ] Death feels avoidable

### Mid Game (Waves 4-7)
- [ ] Difficulty increases noticeably
- [ ] Variants add interesting challenge
- [ ] Player has enough tools to handle threats
- [ ] Upgrades feel impactful

### Late Game (Waves 8-10)
- [ ] Challenge feels intense but fair
- [ ] Parasite asteroids feel threatening
- [ ] Volatile asteroids create interesting decisions
- [ ] Shield cooldown feels balanced

### Endgame (Waves 11+)
- [ ] Scaling feels sustainable
- [ ] No performance degradation
- [ ] Health scaling cap prevents bullet sponges
- [ ] Player has mastered controls

---

## Known Issues to Address

### Ship Feel
- [ ] Acceleration might be too high (feels twitchy?)
- [ ] Angular damping might be too aggressive
- [ ] Consider easing functions for smoother acceleration

### Weapon Feel
- [ ] Bullets feel weak without visual/audio feedback
- [ ] No screen shake on fire
- [ ] No muzzle flash or recoil
- [ ] Consider adding weapon "punch"

### Asteroid Feel
- [ ] Common asteroids feel bland
- [ ] No impact feedback on hit
- [ ] Death explosions could be more dramatic
- [ ] Variant visuals need more distinction

### Performance
- [ ] No baseline metrics established yet
- [ ] Unknown performance on lower-end hardware
- [ ] Particle system may need optimization
- [ ] Spatial grid needs stress testing

---

## Next Steps (Week 1: Balance & Feel)

1. **Integrate PerformanceMonitor** into main game loop
2. **Gather baseline metrics** during 5-10 minute playtest
3. **Tune ship controls** based on feel
4. **Add weapon feedback** (screen shake, recoil)
5. **Document changes** and re-test

**Estimated Time**: 2-3 days

---

**Status**: ✅ Baseline documented
**Next**: Integrate PerformanceMonitor and gather metrics
