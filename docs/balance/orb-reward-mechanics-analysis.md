# Orb & Reward Mechanics Deep Dive Analysis

**Analysis Date**: 2025-10-05
**Purpose**: Compare actual code implementation against baseline-metrics.md definitions
**Scope**: Complete code mechanics analysis (not documentation/commits)

---

## Executive Summary

### ✅ **ALIGNED** Systems
- ORB_VALUE = 5 XP per orb (FIXED)
- Orb tier system (Blue → Green → Yellow → Purple → Red → Crystal)
- Fusion mechanics (10 orbs → 1 higher tier)
- Asteroid size factors (Large: 3x, Medium: 2x, Small: 1x)
- Wave scaling formulas

### ⚠️ **MISALIGNED** Systems
- **Variant multipliers**: Code uses simplified values (1.2-2.0), docs specify detailed formulas (2.53-8.10)
- **Health heart drop rates**: Code values differ from documented targets
- **XP calculation path**: RewardManager uses different formula than XPOrbSystem

---

## 1. Core Orb Economy

### 1.1 Base Orb Value ✅ **ALIGNED**

**Baseline Metrics Definition:**
```
Base Orb Value: 5 XP (tier 1 blue orb) - FIXED
Reward = Number of Orbs × 5 XP
```

**Code Implementation:**
```javascript
// GameConstants.js:656
export const ORB_VALUE = 5;

// XPOrbSystem.js:89
this.baseOrbValue = Number.isFinite(CONSTANTS.XP_ORB_BASE_VALUE)
  ? CONSTANTS.XP_ORB_BASE_VALUE
  : 5;

// RewardManager.js:71
orbValue: CONSTANTS.ORB_VALUE || 5
```

**Status**: ✅ **PERFECTLY ALIGNED**
All systems consistently use 5 XP per orb as the fundamental value.

---

### 1.2 Orb Tier System ✅ **ALIGNED**

**Baseline Metrics Definition:**
```
Orb Tiers: Blue (1) → Green (2) → Yellow (3) → Purple (4) → Red (5) → Crystal (6)
Orb Fusion: 10 orbs of same tier = 1 orb of next tier (automatic clustering)
```

**Code Implementation:**
```javascript
// XPOrbSystem.js:4-11
const ORB_CLASS_ORDER = [
  { name: 'blue', tier: 1 },
  { name: 'green', tier: 2 },
  { name: 'yellow', tier: 3 },
  { name: 'purple', tier: 4 },
  { name: 'red', tier: 5 },
  { name: 'crystal', tier: 6 },
];

// GameConstants.js:1044
export const CLUSTER_FUSION_COUNT = 10;
```

**Status**: ✅ **PERFECTLY ALIGNED**
Tier progression and fusion count (10→1) match exactly.

---

## 2. Asteroid Reward Formulas

### 2.1 Size Factor ✅ **ALIGNED**

**Baseline Metrics Definition:**
```javascript
SizeMultiplier = {
  large: 3.0,   // 3x orbs
  medium: 2.0,  // 2x orbs (baseline)
  small: 1.0    // 1x orbs
}
```

**Code Implementation:**
```javascript
// GameConstants.js:666-670
export const ASTEROID_SIZE_ORB_FACTOR = {
  large: 3.0,   // 3x orbs
  medium: 2.0,  // 2x orbs (baseline)
  small: 1.0,   // 1x orbs
};
```

**Status**: ✅ **PERFECTLY ALIGNED**

---

### 2.2 Variant Multipliers ⚠️ **MISALIGNED**

This is the **BIGGEST DISCREPANCY** in the system.

**Baseline Metrics Definition:**
```
| Variant    | Orb Multiplier | Formula                                    |
|------------|----------------|--------------------------------------------|
| Common     | 1.0            | baseline                                   |
| Iron       | 2.53           | statsFactor (1.1) × rarityBonus (2.3)      |
| DenseCore  | 2.93           | statsFactor (1.17) × rarityBonus (2.5)     |
| Volatile   | 5.46           | statsFactor (2.1) × rarityBonus (2.6)      |
| Parasite   | 8.10           | statsFactor (2.7) × rarityBonus (3.0)      |
| Crystal    | 4.73           | statsFactor (0.91) × rarityBonus (5.2)     |
| Gold       | 4.90           | statsFactor (0.72) × rarityBonus (6.8)     |
```

**Code Implementation (GameConstants.js):**
```javascript
// CORRECT values in GameConstants.js
export const ASTEROID_VARIANTS = {
  common: { orbMultiplier: 1.0, statsFactor: 1.0, rarityBonus: 1.0 },
  iron: { orbMultiplier: 2.53, statsFactor: 1.1, rarityBonus: 2.3 },
  denseCore: { orbMultiplier: 2.93, statsFactor: 1.17, rarityBonus: 2.5 },
  volatile: { orbMultiplier: 5.46, statsFactor: 2.1, rarityBonus: 2.6 },
  parasite: { orbMultiplier: 8.10, statsFactor: 2.7, rarityBonus: 3.0 },
  crystal: { orbMultiplier: 4.73, statsFactor: 0.91, rarityBonus: 5.2 },
  gold: { orbMultiplier: 4.90, statsFactor: 0.72, rarityBonus: 6.8 },
};
```

**Code Implementation (RewardManager.js:86-95) - SIMPLIFIED:**
```javascript
variantMultiplier: (variant) => {
  // Using XPOrbSystem's orbMultiplier values
  const multipliers = {
    common: 1.0,
    iron: 1.2,      // ❌ Should be 2.53
    gold: 2.0,      // ❌ Should be 4.90
    crystal: 1.5,   // ❌ Should be 4.73
    volatile: 1.3,  // ❌ Should be 5.46
    parasite: 1.4,  // ❌ Should be 8.10
    denseCore: 1.2  // ❌ Should be 2.93
  };
  return multipliers[variant] || 1.0;
}
```

**Impact Analysis:**

| Variant   | Expected Orbs (Medium) | Actual Orbs (Medium) | Difference |
|-----------|------------------------|----------------------|------------|
| Iron      | 25 orbs (125 XP)       | 12 orbs (60 XP)      | **-52% XP** |
| DenseCore | 29 orbs (145 XP)       | 12 orbs (60 XP)      | **-59% XP** |
| Volatile  | 55 orbs (275 XP)       | 13 orbs (65 XP)      | **-76% XP** |
| Parasite  | 81 orbs (405 XP)       | 14 orbs (70 XP)      | **-83% XP** |
| Crystal   | 47 orbs (235 XP)       | 15 orbs (75 XP)      | **-68% XP** |
| Gold      | 49 orbs (245 XP)       | 20 orbs (100 XP)     | **-59% XP** |

**Status**: ⚠️ **CRITICAL MISALIGNMENT**
Players are receiving **50-83% LESS XP** than designed for special variants!

---

### 2.3 Wave Scaling ✅ **ALIGNED**

**Baseline Metrics Definition:**
```javascript
Wave Scaling: +1 orb per 5 waves (up to wave 10)
Wave 1-4: +0 orbs
Wave 5-9: +1 orb
Wave 10+: +2 orbs (then +1 per 3 waves)
```

**Code Implementation:**
```javascript
// RewardManager.js:148-151
const waveBonus = wave <= 10
  ? Math.floor(wave / 5)
  : Math.floor((wave - 10) / 3) + 2;

// XPOrbSystem.js:1674-1676 (buildVariantXPDropPlan)
const waveBonus = wave <= 10
  ? Math.floor(wave / 5)
  : Math.floor((wave - 10) / 3) + 2;
```

**Status**: ✅ **PERFECTLY ALIGNED**

---

## 3. Dual System Architecture Issue

### 3.1 Two Different Calculation Paths

The game has **TWO SEPARATE SYSTEMS** calculating orb drops:

#### **Path 1: RewardManager (ACTIVE)**
```javascript
// RewardManager.js:126-165
dropRewards(enemy) {
  const baseOrbs = config.baseOrbs(enemy.size);           // Always 1
  const sizeFactor = config.sizeFactor(enemy.size);       // 1.0, 2.0, or 3.0
  const variantMultiplier = config.variantMultiplier(...); // SIMPLIFIED VALUES (1.2-2.0)
  const waveBonus = Math.floor(wave / 5);

  const orbCount = Math.max(1, Math.round(
    baseOrbs * sizeFactor * variantMultiplier + waveBonus
  ));

  this.createXPOrbs(enemy, orbCount, orbValue);
}
```

#### **Path 2: XPOrbSystem.buildVariantXPDropPlan (UNUSED?)**
```javascript
// XPOrbSystem.js:1651-1707
buildVariantXPDropPlan(data) {
  const orbValue = CONSTANTS.ORB_VALUE || 5;
  const baseOrbs = CONSTANTS.ASTEROID_BASE_ORBS?.[size] ?? 1;
  const sizeFactor = CONSTANTS.ASTEROID_SIZE_ORB_FACTOR?.[size] ?? 1.0;

  const variantConfig = this.getVariantConfig(variantKey);
  const orbMultiplier = variantConfig?.orbMultiplier ?? 1.0;  // CORRECT VALUES

  const waveBonus = wave <= 10 ? Math.floor(wave / 5) : ...;

  const numOrbs = Math.max(1, Math.round(
    baseOrbs * sizeFactor * orbMultiplier + waveBonus
  ));

  // Returns drop plan, but WHO CALLS THIS?
  return drops;
}
```

**Status**: ⚠️ **ARCHITECTURAL CONCERN**
The system with CORRECT multipliers (`buildVariantXPDropPlan`) appears to be **UNUSED**.

---

## 4. Health Heart Drops

### 4.1 Drop Rates ⚠️ **MISALIGNED**

**Baseline Metrics Definition:**
> "RARE drop rates (truly rare as requested by user)"

The baseline metrics **do not specify exact numbers**, but comments in code suggest user requested "truly rare" drops.

**Code Implementation:**
```javascript
// RewardManager.js:379-395
tryDropHealthHeart(enemy) {
  let dropChance = 0;

  if (enemy.size === 'large') {
    dropChance = 0.05; // 5%
  } else if (enemy.size === 'medium') {
    dropChance = 0.02; // 2%
  }

  // Bonus for special variants
  if (['gold', 'crystal', 'volatile', 'parasite'].includes(enemy.variant)) {
    dropChance += 0.03; // +3% bonus
  }
}
```

**Effective Drop Rates:**
| Enemy Type           | Drop Chance |
|---------------------|-------------|
| Small (any variant) | 0% (never)  |
| Medium Common       | 2%          |
| Medium Special      | 5%          |
| Large Common        | 5%          |
| Large Special       | 8%          |

**Analysis:**
- Code comment says "RARE drop rates (truly rare as requested by user)" ✅
- Large asteroids: 5-8% seems reasonable for "rare"
- Medium asteroids: 2-5% is "very rare"
- **Issue**: Only from Medium/Large, documented as "from tough enemies"

**Status**: ⚠️ **NEEDS CLARIFICATION**
Are these rates aligned with "truly rare" intention? Baseline metrics don't specify exact values.

---

## 5. Specific Variant Analysis

### 5.1 Gold Variant 💰

**Baseline Metrics:**
```
Spawn Rate: 0.4-0.5% (Medium: 0.5%, Small: 0.3%)
HP Multiplier: 0.4x (ULTRA-fragile)
Speed Multiplier: 1.8x (ULTRA-fast)
Orb Multiplier: 4.90
Expected Drops (Medium): 49 orbs (245 XP)
```

**Code Implementation:**
```javascript
// GameConstants.js:772-813
gold: {
  allowedSizes: ['medium', 'small'],
  hpMultiplier: 0.4,        ✅ CORRECT
  speedMultiplier: 1.8,     ✅ CORRECT
  orbMultiplier: 4.90,      ✅ CORRECT in constants
  // ...
}

// ASTEROID_VARIANT_CHANCES
medium: {
  distribution: {
    gold: 0.02,  // ✅ 0.02 × 0.25 = 0.5% total
  }
},
small: {
  distribution: {
    gold: 0.02,  // ✅ 0.02 × 0.15 = 0.3% total
  }
}
```

**But in RewardManager:**
```javascript
// RewardManager.js:89
gold: 2.0,  // ❌ Should be 4.90
```

**Actual Drops:**
- Medium Gold: `1 × 2.0 × 2.0 = 4 → 20 orbs (100 XP)` ❌
- Expected: `1 × 2.0 × 4.90 = 9.8 → 49 orbs (245 XP)` ✅

**Status**: ⚠️ **GOLD IS GIVING 59% LESS XP THAN DESIGNED**

---

### 5.2 Parasite Variant

**Baseline Metrics:**
```
Spawn Rate: 4.5%
Orb Multiplier: 8.10 (HIGHEST in game!)
Expected Drops (Large): 121 orbs (605 XP) - JACKPOT!
```

**Code Constants:**
```javascript
// GameConstants.js:890-941
parasite: {
  orbMultiplier: 8.10,  ✅ CORRECT
  statsFactor: 2.7,     ✅ CORRECT (0.8 × 1.2 × 2.8)
  rarityBonus: 3.0,     ✅ CORRECT
  behavior: {
    contactDamage: 20,  ✅ CORRECT
    // ...
  }
}
```

**But in RewardManager:**
```javascript
parasite: 1.4,  // ❌ Should be 8.10
```

**Actual Drops:**
- Large Parasite: `1 × 3.0 × 1.4 = 4.2 → 14 orbs (70 XP)` ❌
- Expected: `1 × 3.0 × 8.10 = 24.3 → 121 orbs (605 XP)` ✅

**Status**: ⚠️ **PARASITE IS GIVING 88% LESS XP THAN DESIGNED**
The hardest enemy in the game (pursues + contact damage) gives the LEAST reward improvement!

---

### 5.3 Crystal Variant 💎

**Baseline Metrics:**
```
Speed Multiplier: 1.3x (CHANGED from 0.8x - now agile!)
Orb Multiplier: 4.73
Bonus: +1 orb every 3 waves (scales infinitely)
Expected Drops (Large): 71 orbs (355 XP)
```

**Code Implementation:**
```javascript
// GameConstants.js:943-991
crystal: {
  speedMultiplier: 1.3,     ✅ CORRECT (buffed!)
  orbMultiplier: 4.73,      ✅ CORRECT in constants
  drops: {
    baseSplit: 3,
    extraOrbs: [{
      count: 1,
      waveScaling: true,  // ✅ Wave scaling flag present
    }],
  }
}
```

**But in RewardManager:**
```javascript
crystal: 1.5,  // ❌ Should be 4.73
```

**Wave Scaling Implementation:**
The `extraOrbs` system with `waveScaling: true` is defined in constants, but **WHERE IS IT USED?**

**Search Needed:**
```
Grep for: "extraOrbs", "waveScaling", "baseSplit"
```

**Status**: ⚠️ **CRYSTAL MULTIPLIER WRONG + WAVE SCALING UNCLEAR**

---

### 5.4 Volatile Variant ⚡

**Baseline Metrics:**
```
Orb Multiplier: 5.46 (high reward for explosion danger)
Expected Drops (Large): 82 orbs (410 XP)
```

**Code Implementation:**
```javascript
// GameConstants.js:815-888
volatile: {
  orbMultiplier: 5.46,  ✅ CORRECT in constants
  statsFactor: 2.1,     ✅ CORRECT (danger factor!)
  behavior: {
    fuseTime: 6,        ✅ CORRECT
    explosion: {
      radius: 85,       ✅ CORRECT
      damage: 35,       ✅ CORRECT
    }
  }
}
```

**But in RewardManager:**
```javascript
volatile: 1.3,  // ❌ Should be 5.46
```

**Status**: ⚠️ **VOLATILE IS GIVING 76% LESS XP THAN DESIGNED**

---

## 6. System Integration Points

### 6.1 Event Flow

**1. Enemy Destroyed** → **2. RewardManager.dropRewards()** → **3. XPOrbSystem.createXPOrb()**

```javascript
// Architecture documented in XPOrbSystem.js:424-441
// XPOrbSystem is responsible for MANAGING orbs (pooling, fusion, magnetism, rendering)
// RewardManager is responsible for DECIDING what to drop
// ✅ This separation is CORRECT

// But the old 'enemy-destroyed' listener was REMOVED from XPOrbSystem:
// "The old 'enemy-destroyed' listener here was removed because:
// - It caused duplicate orb creation (both systems creating orbs)
// - Drop decisions should be centralized in RewardManager"
```

**Status**: ✅ **ARCHITECTURE IS SOUND**
But RewardManager is using wrong multipliers!

---

### 6.2 XPOrbSystem Old Drop Logic (Commented Out)

```javascript
// XPOrbSystem.js:1622-1643 - getBaseXPValue (DEPRECATED?)
getBaseXPValue(size, wave = 1) {
  const baseLookup = CONSTANTS.ASTEROID_XP_BASE || {
    large: 15,
    medium: 8,   // ❌ Old XP-based system
    small: 5,
  };

  // Wave scaling: matches HP difficulty (+12% per wave)
  const waveMultiplier = 1 + ((effectiveWave - 1) * 0.12);

  // This is the OLD SYSTEM - no longer used?
}
```

**Status**: ℹ️ **OLD SYSTEM STILL PRESENT BUT UNUSED**

---

## 7. Constants Cross-Reference

### 7.1 Defined in GameConstants.js ✅

| Constant | Value | Status |
|----------|-------|--------|
| `ORB_VALUE` | 5 | ✅ Used correctly |
| `ASTEROID_BASE_ORBS` | {large: 1, medium: 1, small: 1} | ✅ Used correctly |
| `ASTEROID_SIZE_ORB_FACTOR` | {large: 3.0, medium: 2.0, small: 1.0} | ✅ Used correctly |
| `ASTEROID_VARIANTS.*.orbMultiplier` | 1.0 to 8.10 | ⚠️ **NOT USED** in RewardManager |
| `CLUSTER_FUSION_COUNT` | 10 | ✅ Used correctly |
| `XP_ORB_FUSION_CHECK_INTERVAL` | 0.3s | ✅ Used correctly |

---

## 8. Critical Findings Summary

### 🔴 **HIGH PRIORITY ISSUES**

1. **RewardManager uses WRONG variant multipliers** (Lines 86-95)
   - Hardcoded simplified values (1.2-2.0)
   - Should use `CONSTANTS.ASTEROID_VARIANTS[variant].orbMultiplier`
   - **Impact**: 50-88% less XP for all special variants

2. **XPOrbSystem.buildVariantXPDropPlan appears UNUSED**
   - Contains CORRECT multiplier logic
   - Complete drop plan generation
   - **Question**: Is this dead code or called elsewhere?

3. **Crystal wave scaling unclear**
   - `extraOrbs` with `waveScaling: true` defined in constants
   - Not visible in RewardManager logic
   - **Question**: Is "+1 orb per 3 waves" implemented?

### 🟡 **MEDIUM PRIORITY ISSUES**

4. **Health heart drop rates lack baseline spec**
   - Code implements 2-8% drop rates
   - Baseline metrics don't specify exact values
   - **Action**: Document intended rates in baseline-metrics.md

5. **Deprecated XP-based systems still present**
   - `ASTEROID_XP_BASE` still defined
   - `getBaseXPValue()` method still exists
   - **Action**: Clean up or clearly mark as deprecated

### 🟢 **CONFIRMED WORKING**

- ✅ Base orb value (5 XP)
- ✅ Size factors (3.0/2.0/1.0)
- ✅ Wave scaling formula
- ✅ Orb tier progression
- ✅ Fusion count (10→1)
- ✅ Gold spawn rates (0.4-0.5%)
- ✅ Variant HP/speed multipliers
- ✅ Behavioral systems (parasite tracking, volatile explosion)

---

## 9. Recommended Actions

### Immediate Fix (RewardManager.js)

**BEFORE:**
```javascript
variantMultiplier: (variant) => {
  const multipliers = {
    common: 1.0,
    iron: 1.2,
    gold: 2.0,
    crystal: 1.5,
    volatile: 1.3,
    parasite: 1.4,
    denseCore: 1.2
  };
  return multipliers[variant] || 1.0;
}
```

**AFTER:**
```javascript
variantMultiplier: (variant) => {
  const variantConfig = CONSTANTS.ASTEROID_VARIANTS[variant];
  return variantConfig?.orbMultiplier ?? 1.0;
}
```

### Investigation Needed

1. **Search for `buildVariantXPDropPlan` calls**
   - Is it used anywhere?
   - If not, should RewardManager use it instead?

2. **Search for `extraOrbs` and `waveScaling` usage**
   - Is Crystal's wave scaling bonus implemented?
   - Where is `baseSplit` used?

3. **Verify Gold special drop pattern**
   - Constants define `dropPattern: 'explosion'`
   - Is radial explosion pattern implemented?

---

## 10. Gameplay Impact Assessment

### Current State (With Bugs)

**Wave 5, Medium Asteroid Rewards:**
| Variant   | Current XP | Expected XP | Player Impact |
|-----------|-----------|-------------|---------------|
| Common    | 50 XP     | 50 XP       | ✅ Correct |
| Iron      | 60 XP     | 125 XP      | ⚠️ Feels unrewarding |
| Gold      | 100 XP    | 245 XP      | ⚠️ "Why bother chasing?" |
| Volatile  | 65 XP     | 275 XP      | ⚠️ "Risk not worth it!" |
| Parasite  | 70 XP     | 405 XP      | 🔴 "Hardest enemy, worst reward!" |

### After Fix (Expected)

**Wave 5, Medium Asteroid Rewards:**
| Variant   | XP After Fix | Reward Feel |
|-----------|--------------|-------------|
| Common    | 50 XP        | Baseline |
| Iron      | 125 XP       | +150% - Nice bonus! |
| Gold      | 245 XP       | +390% - JACKPOT! Chase it! |
| Volatile  | 275 XP       | +450% - Risk = Reward! |
| Parasite  | 405 XP       | +710% - MASSIVE REWARD for hardest enemy! |

**Player Experience Impact:**
- 🎯 Special variants become WORTH hunting
- 🎯 Risk/reward balance feels FAIR
- 🎯 Gold becomes EXCITING to chase
- 🎯 Parasite becomes HIGH-VALUE TARGET instead of "annoying enemy"

---

## 11. Conclusion

### What's Working ✅
The **core orb economy** is sound:
- Fixed 5 XP per orb
- Tier progression works
- Fusion mechanics work
- Size scaling works
- Wave scaling works

### What's Broken ⚠️
The **variant reward scaling** is completely wrong:
- RewardManager uses hardcoded 1.2-2.0x multipliers
- Should use 1.0-8.10x from GameConstants
- Players get 50-88% less XP for special variants
- Risk/reward balance is BACKWARDS (hardest enemies = worst rewards)

### Fix Complexity
**VERY SIMPLE FIX** - literally 2 lines of code:
```javascript
// Change this in RewardManager.js:
const variantConfig = CONSTANTS.ASTEROID_VARIANTS[variant];
return variantConfig?.orbMultiplier ?? 1.0;
```

This single change would align the entire reward system with the designed balance.

---

**End of Analysis**
