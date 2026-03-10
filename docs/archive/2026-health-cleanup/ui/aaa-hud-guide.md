# AAA HUD Guide

This guide covers the AAA Tactical HUD layout, a sci-fi inspired interface with neon effects, animated components, and real-time data binding.

## Activating the AAA HUD

The AAA Tactical HUD is now the only HUD and mounts automatically when gameplay
starts (no layout selection required).

---

## Component Overview

### Stats Panel (Top-Left)

- **TIME**: Session duration in `HH:MM:SS` format
- **KILLS**: Total enemies destroyed
- **COMBO**: Current combo multiplier with animated golden gradient

### Boss Bar (Top-Center)

Appears only during boss waves (5, 10, 15...) with:

- Blinking "WARNING" strip
- Skull icon with pulsating red glow
- Animated health bar with diagonal stripes

### Radar (Top-Right)

Hexagonal tactical radar showing:

- **White blip** (center): Player position
- **Red blips**: Nearby enemies within 1500 units
- **Rotating sweep** animation (4-second cycle)

### Vitals Panel (Bottom-Left)

- **SHIELDS**: Blue segmented bar (20 segments)
- **HULL INTEGRITY**: Green segmented bar (20 segments)
- Critical damage triggers red glitch effect on hull text

### Wave & XP (Bottom-Center)

- **Wave indicator**: Rotating circular display with wave number
- **XP bar**: Purple progress bar with current/required XP

### Navigation (Bottom-Right)

- **COORD**: Real-time X/Y position
- **VELOCITY**: Current speed in km/h

---

## Keyboard Shortcuts

| Key   | Action                            |
| ----- | --------------------------------- |
| `Esc` | Open Settings                      |

---

## Troubleshooting

### HUD not appearing

1. Ensure you're in active gameplay (not paused at menu)
2. Check browser console for errors

### Icons not rendering

The HUD uses [Lucide Icons](https://lucide.dev). If icons show as empty boxes:

- Verify internet connection (icons load from CDN)
- Check that `lucide.createIcons()` is running

### Animations stuttering

- Enable hardware acceleration in browser settings
- Reduce screen resolution for lower-end devices
- Check if "Reduce Motion" is enabled in accessibility settings

---

## Technical Reference

| File                             | Purpose                                    |
| -------------------------------- | ------------------------------------------ |
| `src/modules/ui/AAAHudLayout.js` | Layout module with HTML/CSS/update methods |
| `src/data/ui/hudLayout.js`       | Layout definition (`aaa_tactical`)         |
| `src/modules/UISystem.js`        | Integration and data binding               |
