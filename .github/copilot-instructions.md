# Copilot Instructions for ASTEROIDS_ROGUEFIELD

## Project Overview

ASTEROIDS_ROGUEFIELD is a browser-based roguelike game inspired by the classic Asteroids. The game features wave-based combat, upgrade systems, and physics-based gameplay.

## Key Components

### Game Architecture

- Main game loop in `app.js` using requestAnimationFrame
- HTML5 Canvas-based rendering
- Event-driven input handling
- State management through global `gameState` object
- Wave-based progression system with timers

### Core Systems

1. Physics System

   - Velocity-based movement with damping
   - Collision detection using circular bounds
   - Impulse-based collision response with mass

2. Audio System (`SpaceAudioSystem` class)

   - Web Audio API for sound effects
   - Handles sound loading and playback
   - Fallback behavior when audio unavailable

3. Particle System
   - `SpaceParticle` class for visual effects
   - Different particle types: normal, thruster, debris, spark
   - Performance optimized with particle pooling

### Conventions

1. File Structure:

   - `/exported-assets/` - Contains game assets and main files
   - `app.js` - Core game logic
   - `index.html` - Game UI and canvas
   - `style.css` - Game styling with CSS variables

2. Coding Patterns:
   - Constants use UPPER_SNAKE_CASE
   - Game state modifications through functions
   - Error handling with try-catch blocks
   - Screen management via showScreen() function

### Common Workflows

1. Adding New Upgrades:

```javascript
// Add to SPACE_UPGRADES array in app.js
const SPACE_UPGRADES = [
  {
    id: 'newUpgrade',
    name: 'Display Name',
    description: 'Effect description',
    icon: '🔮',
    color: '#HEX_COLOR'
  }
];

// Implement in applyUpgrade() function
function applyUpgrade(upgradeId) {
  case 'newUpgrade':
    // Apply upgrade effects
    break;
}
```

2. Wave Balancing:

- Modify constants in app.js:
  - ASTEROIDS_PER_WAVE_BASE
  - ASTEROIDS_PER_WAVE_MULTIPLIER
  - WAVE_DURATION
  - MAX_ASTEROIDS_ON_SCREEN

## Key Files

1. `app.js`: Main game logic

   - Game loop and state management
   - Physics and collision systems
   - Upgrade and progression systems

2. `index.html`: Game structure and UI

   - Screen layouts (menu, game, levelup, gameover)
   - UI components and status displays

3. `style.css`: Visual styling
   - CSS variables for theming
   - Responsive layouts
   - Game UI components

## Testing and Debugging

- Use browser dev tools console for game state inspection
- Check browser performance tools for particle system optimization
- Test audio initialization on user interaction
- Verify wave progression and upgrade systems
