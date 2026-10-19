// src/data/audio/eventCues.js
// Game event → sound. One row per step an event plays, in the order it plays;
// src/modules/audio/eventDispatch.js registers one listener per event and runs
// its rows top to bottom. Enemy cues are rows, never code; an enemy's own cue
// comes from its content file (`cues`, read by a `cueOf` row).
//
// Row fields:
//   on          the EventBus event.
//   cue         the SFXBus method that plays; facade: true → the facade's own
//               boss voice (src/modules/audio/bossVoice.js).
//   run         instead of a cue, a step with logic (state, music, routing),
//               named in src/modules/audio/eventHandlers.js.
//   when        plays only if this payload path is truthy, or if every
//               { path: value } matches; unless: only if the path is falsy.
//   type        plays only for this enemy type (payload.enemyType, else
//               enemy.type, lowercased); among an event's type rows the first
//               match plays. '*' = any type, but the ones in `except`.
//   cueOf       a type row for enemy items (src/content/enemies): plays the
//               cue the enemy's file names under `cues.<cueOf>`, else `cue`
//               (none → the row plays nothing for that enemy).
//   duck        true → the big-moment music duck right after the cue.
//   throttleMs  plays only if more than this many ms passed since it last did.
// Arguments, in this order (none of them → the cue gets no argument):
//   first       a fixed first argument (the explosion's size).
//   arg         one payload value: a path, or [path, fallback] (`||`).
//   payload     true → the payload itself ({} when there is none); with any
//               option below, the payload's fields start the options object.
//   Options object, built in this order:
//     at        'source' → pan + distance mix from payload.position (else
//               payload.enemy); 'payload' → the payload is the position.
//     panX      pan only, from the x at this path.
//     toPanX    toPan, from the x at this path (where the shot lands).
//     fields    { option: path or [path, fallback] } read from the payload.
//     set       fixed option values.

export const AUDIO_EVENT_CUES = Object.freeze([
  { on: 'settings-audio-changed', run: 'volume' },
  { on: 'weapon-fired', run: 'listener' },
  { on: 'weapon-fired', cue: 'playLaserShot', payload: true },
  {
    on: 'combat-target-lock',
    cue: 'playTargetLock',
    unless: 'lost',
    payload: true,
  },

  { on: 'enemy-destroyed', cue: 'playGoldJackpot', when: { variant: 'gold' } },
  {
    on: 'enemy-destroyed',
    cue: 'playAsteroidBreak',
    when: 'size',
    arg: 'size',
  },
  { on: 'enemy-destroyed', run: 'explosion' },
  // An enemy's own death cue (the Husk's release), over the explosion.
  { on: 'enemy-destroyed', cueOf: 'destroyed', at: 'source' },
  { on: 'enemy-destroyed', run: 'enemyDestroyed' },
  {
    on: 'asteroid-volatile-exploded',
    cue: 'playExplosion',
    first: 'large',
    at: 'source',
    duck: true,
  },

  { on: 'player-leveled-up', cue: 'playLevelUp', duck: true },
  // All orbs play the same sound (all are tier 1 blue).
  { on: 'xp-collected', cue: 'playXPCollect' },
  { on: 'xp-orb-fused', cue: 'playOrbFusion', arg: 'toClass' },
  {
    on: 'enemy-spawned',
    cue: 'playGoldSpawn',
    when: { 'enemy.variant': 'gold' },
  },
  { on: 'enemy-spawned', run: 'enemySpawned' },
  { on: 'enemy-telegraph', cue: 'playEnemyTelegraph', at: 'source' },
  { on: 'elite-spawned', cue: 'playEliteSpawned' },
  // Known bug, kept: the event sends `position`, the pan reads `x` (centred).
  { on: 'weapon-beam-fired', cue: 'playHarmonicBeam', panX: 'x' },
  { on: 'weapon-evolved', cue: 'playWeaponEvolved', duck: true },
  { on: 'upgrade-rerolled', cue: 'playCardReroll' },
  { on: 'upgrade-banished', cue: 'playCardBanish' },
  { on: 'codex-discovered', cue: 'playCodexDiscovered' },
  { on: 'surge-started', cue: 'playSurgeSting' },
  { on: 'run-continued', cue: 'playDeepFieldEntry' },
  { on: 'salvage-awarded', cue: 'playSalvageAwarded', arg: 'amount' },
  { on: 'hangar-purchased', cue: 'playHangarPurchase' },
  { on: 'onboarding-step', cue: 'playTipChime' },

  // An enemy may bring its own windup (the Ram's spin-up); other non-bosses
  // get the enemy cue (the boss keeps EffectsSystem's roar).
  { on: 'boss-telegraph', cueOf: 'telegraph', at: 'source' },
  {
    on: 'boss-telegraph',
    type: '*',
    except: ['boss'],
    cue: 'playEnemyTelegraph',
    at: 'source',
  },
  // Support machines' own cues, at the machine's position.
  { on: 'ram-charged', cue: 'playRamCharge', at: 'source' },
  { on: 'weaver-tether-laid', cue: 'playWeaverTether', at: 'source' },
  { on: 'bulwark-plate-hit', cue: 'playBulwarkPlateHit', at: 'source' },
  { on: 'bulwark-plate-broken', cue: 'playBulwarkPlateBreak', at: 'source' },
  { on: 'caster-telegraphed', cue: 'playCasterCharge', at: 'source' },
  // The launch pans from the Caster toward where the shell will land.
  {
    on: 'caster-shell-fired',
    cue: 'playCasterLaunch',
    at: 'source',
    toPanX: 'target.x',
  },
  // Its own impact, not an explosion: 2-4 Casters land every few seconds, so
  // no music duck either.
  { on: 'caster-shell-landed', cue: 'playCasterImpact', at: 'source' },
  {
    on: 'shade-phased-out',
    cue: 'playShadePhase',
    at: 'source',
    set: { out: true },
  },
  {
    on: 'shade-phased-in',
    cue: 'playShadePhase',
    at: 'source',
    set: { out: false },
  },
  // Each Herald kind arrives with its own cue (its attacks: enemy-fired).
  {
    on: 'herald-spawned',
    cue: 'playHeraldSpawn',
    at: 'payload',
    fields: { kind: 'kind' },
  },
  { on: 'flak-burst', cue: 'playFlakBurst', at: 'source' },
  { on: 'leech-ate', cue: 'playLeechAte', at: 'source' },
  { on: 'leech-burst', cue: 'playLeechBurst', at: 'source' },
  { on: 'pickup-collected', cue: 'playPickupCollected', arg: 'kind' },
  { on: 'transmission-shown', cue: 'playTransmission' },
  { on: 'transmission-shown', cue: 'playTransmissionVoice', arg: 'speaker' },
  { on: 'pickup-spawned', cue: 'playPickupSpawned', panX: 'x' },

  // Enemy shots, by the firing machine (the batcher reads the shot's fields):
  // its own shot cue, else the Mote's plain shot.
  {
    on: 'enemy-fired',
    cueOf: 'fired',
    cue: 'playDroneFire',
    payload: true,
    at: 'source',
  },
  // Heat's ignite spread flares; Silence's shard leaves with a vacuum.
  {
    on: 'enemy-fired',
    type: 'herald',
    cue: 'playHeraldAttack',
    at: 'source',
    fields: { kind: 'enemy.heraldKind' },
  },
  {
    on: 'mine-exploded',
    cue: 'playMineExplosion',
    payload: true,
    at: 'source',
  },

  // The run-following music: wave progress, the layer's theme, the chapter
  // stinger on a biome's first layer; the boss arc overrides it upwards.
  { on: 'wave-started', run: 'waveStarted' },
  { on: 'boss-warning', cue: 'playWardenStinger' },
  { on: 'boss-warning', run: 'bossArc' },
  { on: 'boss-spawned', cue: 'playBossRoar', facade: true, payload: true },
  { on: 'boss-spawned', run: 'bossArc' },
  {
    on: 'boss-phase-changed',
    cue: 'playBossPhaseChange',
    facade: true,
    payload: true,
  },
  { on: 'boss-phase-changed', run: 'bossArc' },
  { on: 'boss-defeated', cue: 'playBossDefeated', facade: true, payload: true },
  { on: 'boss-defeated', run: 'bossArc' },
  { on: 'boss-defeated', run: 'biomeTheme' },

  { on: 'bullet-hit', run: 'bulletHit' },
  { on: 'player-took-damage', cue: 'playShipHit' },
  // The ship's own moves: centred on it; the dash whoosh sweeps toward where
  // it goes.
  {
    on: 'player-dashed',
    cue: 'playDash',
    panX: 'position.x',
    fields: { directionX: ['direction.x', 0] },
  },
  { on: 'player-braked', cue: 'playBrake', panX: 'position.x' },
  { on: 'shield-activated', cue: 'playShieldActivate' },
  { on: 'shield-hit', cue: 'playShieldImpact' },
  { on: 'shield-broken', cue: 'playShieldBreak' },
  { on: 'shield-recharged', cue: 'playShieldRecharged' },
  { on: 'shield-activation-failed', cue: 'playShieldFail' },
  { on: 'player-health-changed', run: 'playerHealth' },
  { on: 'thruster-effect', run: 'listener' },
  { on: 'thruster-effect', run: 'thruster' },

  // Interface.
  {
    on: 'upgrade-applied',
    cue: 'playUpgradeSelect',
    arg: ['rarity', 'common'],
  },
  { on: 'pause-state-changed', run: 'pauseMusic' },
  { on: 'pause-state-changed', cue: 'playPauseOpen', when: 'isPaused' },
  { on: 'pause-state-changed', cue: 'playPauseClose', unless: 'isPaused' },
  { on: 'screen-changed', run: 'screen' },
  { on: 'ui-overlay-visibility-changed', run: 'overlay' },
  { on: 'input-confirmed', cue: 'playUISelect' },
  { on: 'ui-hover', cue: 'playUIHover', throttleMs: 80 },
  { on: 'game-started', cue: 'playUIStartGame' },
]);
