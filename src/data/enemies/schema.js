/**
 * Enemy Configuration Schema
 *
 * This file defines the canonical structure and field naming conventions for all enemy configurations.
 * It serves as the single source of truth for what fields are available, their types, and their purposes.
 *
 * BACKWARD COMPATIBILITY:
 * - Legacy field names (speed, fireRate, interval) are still supported via fallback chains in components
 * - MovementComponent.js handles: maxSpeed ?? speed
 * - WeaponComponent.js handles: cooldown ?? interval
 * - New configs SHOULD use the canonical field names defined here
 *
 * @module enemies/schema
 */

import { deepFreeze } from '../../utils/deepFreeze.js';

/**
 * Movement Component Schema
 *
 * Defines how an enemy moves in the game world.
 *
 * @typedef {Object} MovementSchema
 * @property {string} strategy - Movement strategy: 'tracking', 'orbit', 'seeking', 'proximity'
 * @property {number} maxSpeed - Maximum velocity magnitude (canonical field, replaces 'speed')
 * @property {number} acceleration - Acceleration rate per second
 * @property {number} [damping] - Velocity damping factor (0-1), default 1.0 (no damping)
 * @property {number} [targetingRange] - Detection range for player (tracking/orbit strategies)
 * @property {number} [preferredDistance] - Orbit strategy: desired distance from target
 * @property {number} [orbitDirection] - Orbit strategy: 1 for clockwise, -1 for counter-clockwise
 * @property {number} [safeDistance] - Seeking strategy: minimum distance to maintain (boss)
 * @property {number} [jitter] - Seeking strategy: random movement variance multiplier (default 0.1)
 * @property {number} [driftSpeed] - Proximity strategy: slow drift velocity (mines)
 * @property {number} [driftVariance] - Proximity strategy: random drift variance (default 12)
 * @property {number} [lifetime] - Proximity strategy: time until self-destruct (mines)
 *
 * @deprecated {number} speed - Use 'maxSpeed' instead (backward compatible via fallback)
 */
export const MOVEMENT_SCHEMA = deepFreeze({
  strategy: 'tracking',       // Required: movement behavior type
  maxSpeed: 180,              // Required: maximum velocity (NOT 'speed')
  acceleration: 260,          // Required: acceleration rate
  damping: 1.0,               // Optional: velocity damping (0-1)
  targetingRange: 460,        // Optional: player detection range
  preferredDistance: 175,     // Optional: orbit distance
  orbitDirection: 1,          // Optional: orbit clockwise/counter
  safeDistance: 240,          // Optional: seeking minimum distance
  jitter: 0.1,                // Optional: seeking jitter multiplier
  driftSpeed: 0,              // Optional: proximity drift velocity
  driftVariance: 12,          // Optional: proximity drift variance
  lifetime: 30,               // Optional: proximity lifetime
});

/**
 * Weapon Component Schema
 *
 * Defines how an enemy attacks.
 *
 * NOTE: 'speed' in this context refers to PROJECTILE speed, not enemy movement speed.
 *
 * @typedef {Object} WeaponSchema
 * @property {string} pattern - Attack pattern: 'single', 'burst', 'spread', 'volley', 'proximity'
 * @property {number} damage - Damage per projectile
 * @property {number} speed - Projectile velocity (NOT enemy speed)
 * @property {number} lifetime - Projectile lifetime in seconds
 * @property {number} cooldown - Time between attacks (canonical field, replaces 'fireRate'/'interval'/'burstInterval')
 * @property {number} [variance] - Cooldown randomization factor (0-1), default 0
 * @property {number} [spread] - Angular spread in radians (for aiming variance)
 * @property {boolean} [predictive] - Enable predictive targeting (lead shots)
 * @property {number} [fireRange] - Maximum firing range
 * @property {number} [burstCount] - Burst pattern: shots per burst
 * @property {number} [burstDelay] - Burst pattern: delay between burst shots
 * @property {number} [projectileCount] - Spread pattern: projectiles per shot
 * @property {number} [arc] - Spread pattern: total arc in radians
 * @property {number} [explosionRadius] - Proximity pattern: explosion radius
 * @property {number} [proximityRadius] - Proximity pattern: trigger radius
 * @property {number} [armTime] - Proximity pattern: arming delay
 * @property {boolean} [triggerOnProximity] - Proximity pattern: auto-trigger on proximity
 *
 * @deprecated {number} fireRate - Use 'cooldown' instead (backward compatible via fallback)
 * @deprecated {number} interval - Use 'cooldown' instead (backward compatible via fallback)
 * @deprecated {number} burstInterval - Use 'cooldown' instead (backward compatible via fallback)
 */
export const WEAPON_SCHEMA = deepFreeze({
  pattern: 'single',          // Required: attack pattern type
  damage: 14,                 // Required: projectile damage
  speed: 320,                 // Required: projectile velocity
  lifetime: 3.5,              // Required: projectile lifetime
  cooldown: 2.0,              // Required: time between attacks (NOT 'fireRate'/'interval')
  variance: 0.35,             // Optional: cooldown randomization
  spread: 0.06,               // Optional: aiming variance
  predictive: true,           // Optional: lead targeting
  fireRange: 520,             // Optional: maximum range
  burstCount: 3,              // Optional: burst shots
  burstDelay: 0.15,           // Optional: burst shot delay
  projectileCount: 5,         // Optional: spread projectiles
  arc: Math.PI / 4,           // Optional: spread arc
  explosionRadius: 120,       // Optional: proximity explosion
  proximityRadius: 80,        // Optional: proximity trigger
  armTime: 0.5,               // Optional: proximity arm delay
  triggerOnProximity: true,   // Optional: proximity auto-trigger
});

/**
 * Render Component Schema
 *
 * Defines how an enemy is visually rendered.
 *
 * @typedef {Object} RenderSchema
 * @property {string} strategy - Render strategy: 'procedural', 'delegate'
 * @property {string} [shape] - Procedural shape: 'triangle', 'diamond', 'sphere', 'boss'
 * @property {boolean} [showThrust] - Triangle: show exhaust flames
 * @property {boolean} [showTurret] - Diamond: show turret indicator
 * @property {boolean} [showPulse] - Sphere: show pulse animation
 * @property {number} [pulseSpeed] - Sphere: pulse frequency
 * @property {number} [pulseAmount] - Sphere: pulse amplitude
 * @property {boolean} [showAura] - Boss: show aura effect
 * @property {boolean} [showPhaseColor] - Boss: phase-based coloring
 */
export const RENDER_SCHEMA = deepFreeze({
  strategy: 'procedural',     // Required: render approach
  shape: 'triangle',          // Required (procedural): visual shape
  showThrust: true,           // Optional: triangle exhaust
  showTurret: true,           // Optional: diamond turret
  showPulse: true,            // Optional: sphere pulse
  pulseSpeed: 2.0,            // Optional: pulse frequency
  pulseAmount: 0.15,          // Optional: pulse amplitude
  showAura: true,             // Optional: boss aura
  showPhaseColor: true,       // Optional: boss phase colors
});

/**
 * Collision Component Schema
 *
 * Defines collision detection and response.
 *
 * @typedef {Object} CollisionSchema
 * @property {string} shape - Collision shape: 'circle' (only supported shape currently)
 * @property {number} radius - Collision radius
 * @property {string} response - Collision response: 'damage', 'trigger'
 * @property {number} [contactDamage] - Damage dealt on collision
 */
export const COLLISION_SCHEMA = deepFreeze({
  shape: 'circle',            // Required: collision shape
  radius: 20,                 // Required: collision radius
  response: 'damage',         // Required: collision behavior
  contactDamage: 50,          // Optional: collision damage
});

/**
 * Health Component Schema
 *
 * Defines enemy health and damage resistance.
 *
 * @typedef {Object} HealthSchema
 * @property {number} base - Base health value
 * @property {number} [armor] - Damage reduction (0 = no armor, higher = more reduction)
 * @property {number} [scaling] - Wave-based health scaling multiplier
 * @property {number[]} [phaseThresholds] - Boss: HP thresholds for phase transitions (0-1)
 * @property {number} [invulnerabilityDuration] - Boss: phase transition invulnerability time
 */
export const HEALTH_SCHEMA = deepFreeze({
  base: 50,                   // Required: base health
  armor: 0,                   // Optional: damage reduction
  scaling: 1.5,               // Optional: wave scaling
  phaseThresholds: [0.66, 0.33], // Optional: boss phase thresholds
  invulnerabilityDuration: 1.0,  // Optional: boss phase invuln
});

/**
 * Complete Enemy Configuration Schema
 *
 * Combines all component schemas into a complete enemy config structure.
 * This is the recommended structure for all enemy type configurations.
 *
 * @typedef {Object} EnemyConfigSchema
 * @property {MovementSchema} movement - Movement component configuration
 * @property {WeaponSchema} weapon - Weapon component configuration
 * @property {RenderSchema} render - Render component configuration
 * @property {CollisionSchema} collision - Collision component configuration
 * @property {HealthSchema} health - Health component configuration
 *
 * @example
 * // Creating a new enemy config following the schema:
 * export const MY_ENEMY_COMPONENTS = {
 *   movement: {
 *     strategy: 'tracking',
 *     maxSpeed: 200,      // Use maxSpeed, NOT speed
 *     acceleration: 300,
 *   },
 *   weapon: {
 *     pattern: 'single',
 *     cooldown: 1.5,      // Use cooldown, NOT fireRate/interval
 *     damage: 20,
 *     speed: 400,         // This is projectile speed
 *     lifetime: 4.0,
 *   },
 *   render: {
 *     strategy: 'procedural',
 *     shape: 'triangle',
 *   },
 *   collision: {
 *     shape: 'circle',
 *     radius: 18,
 *     response: 'damage',
 *     contactDamage: 30,
 *   },
 *   health: {
 *     base: 60,
 *     armor: 5,
 *     scaling: 1.3,
 *   },
 * };
 */
export const ENEMY_CONFIG_SCHEMA = deepFreeze({
  movement: MOVEMENT_SCHEMA,
  weapon: WEAPON_SCHEMA,
  render: RENDER_SCHEMA,
  collision: COLLISION_SCHEMA,
  health: HEALTH_SCHEMA,
});

/**
 * Validates an enemy config and returns warnings for deprecated field usage.
 *
 * This is non-breaking - it only warns, doesn't error.
 * Components handle backward compatibility via fallback chains.
 *
 * @param {Object} config - Enemy config to validate
 * @returns {string[]} Array of warning messages
 */
export function validateEnemyConfig(config) {
  const warnings = [];

  // Check movement component
  if (config.movement) {
    if ('speed' in config.movement) {
      warnings.push('movement.speed is deprecated, use movement.maxSpeed instead');
    }
  }

  // Check weapon component
  if (config.weapon) {
    if ('fireRate' in config.weapon) {
      warnings.push('weapon.fireRate is deprecated, use weapon.cooldown instead');
    }
    if ('interval' in config.weapon) {
      warnings.push('weapon.interval is deprecated, use weapon.cooldown instead');
    }
    if ('burstInterval' in config.weapon) {
      warnings.push('weapon.burstInterval is deprecated, use weapon.cooldown instead');
    }
  }

  return warnings;
}
