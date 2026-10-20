# HUD.md

The HUD is an instrument, not a frame: fewer instruments, each denser. What matters now is big; the rest fades until it is needed. Every instrument obeys this page; a new one starts as a mock-up the owner approves.

## Slots, models, presets

The HUD is a set of slots (vitals, radar, run-info, xp, build, recharges, hull-ring, warden, feed). Each slot has one or more models, one file each in `src/modules/ui/hud/instruments/<slot>/<model>.js`, collected by `registry.js`; every model of a slot reads the same state. A preset (`src/data/ui/hudPresets.js`: Instrument, Classic, Minimal) picks a model per slot with its anchor, offset, scale, opacity and visibility; players change it in Settings → Interface → HUD Layout or in the HUD editor (`src/modules/ui/hud/editor/`), which also saves their own presets. A new look is a new model, not an edit of another slot's model; keep two or three models per slot.

## Tokens

Reuse `src/style.css` `:root` only: `--accent` #00f2ff (player, systems), `--danger` #ff3131 (threat), `--boss` #8a2be2 (Wardens), `--xp` #ffd700 (XP, rewards), `--status` #bcff00 (active buffs), amber #ffb347 (player shots, Field crystal), `--text` / `--text-dim`, `--surface` / `--line`. Fonts: Orbitron for numbers and labels in caps, Rajdhani 500/700 for words. Type scale, spacing, radius and motion tokens as in `:root`. Every size is `calc(token × --hud-scale-effective)`, so the HUD Scale setting really scales the HUD. Sizes as in the owner's approved first mock-up (fine type, not heavy); the HUD Scale and Text Size settings enlarge it; a dark backing plate where the field is bright; never colour alone — every kind also has its own shape.

## Layout

- A safe margin: no instrument sits on the field's glowing border; where the border passes behind an instrument it fades out under it.
- In windows wider than 16:9 the instruments stay inside a centred 16:9 area, close to the action; taller windows keep the corners.

## Hierarchy

1. **Now** (centre band, large, transient): Warden bar while a Warden lives; layer, surge and event banners; the incoming-layer count; low-hull state.
2. **Glance** (corners, medium, always on): tactical radar top right; shield and hull bottom left as the owner's chosen capsule (20/10): ten separate hull cells inside a rounded capsule, the shield a cyan stroke running round it and filling with the shield's HP; the shield shows what it is in the game — not installed (thin grey outline), ready on its key, active, recharging (amber seconds); XP and level along the bottom edge; weapon with its evolution and Apex progress bottom right.
3. **On demand** (small, fades to 35 % after 4 s without change): layer, elapsed time, kills, combo, pickup timers, kill feed.
4. **On the ship** (sized in screen pixels, so the wide camera does not shrink it): dash, shield and weapon-special recharges as thin arcs under the ship, shown only while recharging and for a 0.5 s pulse when ready; a segmented hull ring round the ship for 2 s after each hit and always below 30 % hull (as Dead Space puts health on the suit). Near death the warning grows: edge darkening, then a short image glitch below 15 % (Returnal).

## Motion

A value that changes pulses once (120 ms, scale 1.06 and brighter). Panels enter and leave in 250 ms ease-out. Nothing loops except the radar sweep and a threat that is about to hit. Reduced motion: fades only, no pulse, no sweep.

## States

- **Calm:** glance instruments at 70 %, on-demand ones faded.
- **Threat** (enemy fire incoming, an Elite or a fast threat in or near view): radar to 100 %, threat chevrons on the screen edge. It enters at once and leaves only after 3 s without a threat, so a crowd does not make the HUD flicker.
- **Warden:** the Warden bar on top with its phases; the corners dim to 55 %; the radar keeps the Warden and the ship.
- **Death and victory:** the HUD fades out in 400 ms; the recap owns the screen.

## Tactical radar

- A circle, 180 px at a 1080 p window (scaled like the rest), centred on the ship, north up (the controls never rotate).
- What is inside the camera's view is dimmed on the radar (the player already sees it); what is outside is bright — that is the radar's job.
- Real scale: range rings at 400 and 800 field units, labelled small; the field's border drawn as a line (the camera can cross it now); the camera's view drawn as a rectangle, so the radar follows the zoom of the near and wide camera states.
- Blips by kind: rock = dim dot sized by the rock; machine = red triangle pointing where it flies; fast threat = triangle with a short speed tail; Elite = gold ring; Herald = violet diamond; Warden = large violet hexagon; pickup = green plus; XP = gold haze where orbs gather (not one dot each); Caster landing point = red ring that closes as the shell falls.
- Beyond the range: a chevron on the rim in the threat's colour, Wardens and Heralds with their distance. One marker per object: a Warden off screen gets the edge marker on the screen, not a second chevron on the radar.
- Crowds: more than 6 blips of a kind in one direction merge into one wedge with a count ("12"), so nothing silently drops off.
- Budget: 80 blips after merging; 8 always kept for pickups and Wardens.
