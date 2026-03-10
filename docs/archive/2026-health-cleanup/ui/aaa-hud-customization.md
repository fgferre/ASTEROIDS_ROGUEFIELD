# AAA HUD Customization Guide

This guide explains how to customize colors, sizes, and components of the AAA Tactical HUD.

---

## CSS Variables

All colors are defined in `:root` within `src/modules/ui/AAAHudLayout.js` (lines 475-482):

```css
:root {
  --primary-cyan: #00f0ff; /* Accent color (borders, labels) */
  --secondary-blue: #00aaff; /* Stat block borders, shields */
  --danger-red: #ff003c; /* Boss bar, critical warnings */
  --health-green: #00ff66; /* Hull integrity bar */
  --xp-purple: #aa00ff; /* XP bar fill */
  --hud-bg: rgba(12, 20, 31, 0.65); /* Panel backgrounds */
}
```

To customize, modify these values in `_getCSS()` method.

---

## Component Sizing

### Radar

```css
.radar-structure {
  width: 200px;
  height: 200px;
}
```

### Health Bars

```css
.health-bar-row {
  height: 20px; /* Hull bar height */
  min-width: 180px;
}
.health-bar-row.shield {
  height: 15px; /* Shield bar height */
}
```

### Wave Indicator

```css
.wave-indicator {
  width: 70px;
  height: 70px;
}
```

---

## Animation Speeds

Modify keyframe durations in `_getCSS()`:

| Animation        | Default | Location          |
| ---------------- | ------- | ----------------- |
| Radar sweep      | 4s      | `.radar-sweep`    |
| Wave rotation    | 4s      | `.wave-indicator` |
| Combo pulse      | 2s      | `.combo-box`      |
| Boss skull pulse | 2s      | `.boss-skull`     |
| Warning blink    | 0.5s    | `.warning-light`  |

---

## Adding New Components

1. Add HTML in `_getHTML()` method (~line 255)
2. Add CSS in `_getCSS()` method (~line 467)
3. Cache element in `_cacheElements()` (~line 59)
4. Create update method (e.g., `updateMyComponent()`)
5. Bind data in `UISystem.updateAAATacticalHudFromServices()`

### Example: Adding Ammo Counter

```javascript
// In _getHTML()
<div class="ammo-display" id="ui-ammo">∞</div>

// In _cacheElements()
ammo: query('#ui-ammo'),

// Create update method
updateAmmo(current, max) {
  if (!this.els?.ammo) return;
  this.els.ammo.innerText = `${current}/${max}`;
}
```

---

## Segment Count

Health/Shield bars use 20 segments by default. To change:

```javascript
// In _initializeBars() (line 90)
this.createSegments(this.els.shieldRow, 20); // Change 20
this.createSegments(this.els.hullRow, 20); // Change 20
```

---

## Responsive Breakpoints

Mobile layout activates at 900px width (line 1133):

```css
@media (max-width: 900px) {
  /* Panels reposition absolutely */
  /* Scale transforms applied */
}
```

Adjust breakpoint or scale values as needed.

---

## Accessibility

The HUD respects these settings in `UISystem.applyVisualPreferences()`:

| Setting                   | Effect                           |
| ------------------------- | -------------------------------- |
| `reducedMotion: true`     | Disables animations              |
| `highContrastHud: true`   | Increases color saturation       |
| `colorBlindPalette: true` | Applies alternative color scheme |

To add reduced motion support, wrap animations with:

```css
@media (prefers-reduced-motion: reduce) {
  .animated-element {
    animation: none;
  }
}
```
