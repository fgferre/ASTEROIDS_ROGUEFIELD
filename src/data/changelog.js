// src/data/changelog.js
//
// What changed in each published version of the game, newest first, in the
// player's words (what you notice playing, with the names the game shows). The
// in-game changelog reads RELEASES; the version in the menu corner is
// package.json's, and RELEASES[0].version must be that same number.
//
// Numbers while in beta: 0.MIDDLE.LAST. Every publication changes the number.
// MIDDLE goes up (LAST back to 0) when the player gets something new to see or
// do: content, a screen, a mechanic, a new look. Only LAST goes up for fixes and
// tuning. 1.0.0 only when Felipe says so.
//
// NEXT collects the lines for the coming publication; the game never shows it.
// One item per line, a line per change, added when the work is done. A line
// still waiting for Felipe's word ends with `// not confirmed`. A branch that
// changes the game must add something here (tests/process/changelogLine.test.js
// fails otherwise): a line in new, improved or fixed, or, when a player notices
// nothing, a sentence in `unseen` saying what changed and why nobody sees it.
// `unseen` never shows in the game; it goes with the list to Felipe when asking
// to publish. At publication NEXT becomes the new first entry of RELEASES, with
// its number and date (its `unseen` kept there), and NEXT is left empty.

export const NEXT = {
  new: [
    "The campaign's ending now tells you the truth of the Ring before you choose: when Sovereign falls, the Ring and the Wake say what it kept and who it was keeping, one scene at a time; after the choice your ending plays scene by scene before the credits. Hold to skip to the choice or to the credits; a tap goes to the next scene.", // not confirmed
  ],
  improved: [
    'Sovereign, beaten, no longer breaks into pieces: it stays whole for the ending (with reduced motion it burns away where it fell).', // not confirmed
  ],
  fixed: [
    "On a phone held sideways, the ending's choice now fits the screen: both options show every line, with no scrolling.", // not confirmed
    'If the same pilot was changed in another tab, any click in the Hangar (buying, licences, seals, Pressure, the starting card) now closes it and takes the game back to the start screen, instead of changing something that would not be saved.', // not confirmed
    'The key hints in the menu, the Flight Computer briefing and the pause screen show the keys and pad buttons you set in Settings, not the defaults; the first move tip names your movement keys too.', // not confirmed
    'In Settings → Controls, giving an action a key or pad button another flight action already uses now takes it from that action (its slot shows Set, dashed amber), so one key never does two things in flight.', // not confirmed
    'A Retry no longer doubles your rewards: XP, pickups and chests dropped by kills your shots made after the ship blew up are gone with those kills, the rocks come back as they were at your death, and an Overcharge keeps the time it had left then.', // not confirmed
    'A Tether that appears next to the ship no longer goes off at once: every one takes its half second to arm, as the first ones of a run did.', // not confirmed
    'A Tether that blows up later in a run flashes, shakes the screen and gives its brief stop again, like the first ones; some went off without any of it.', // not confirmed
    'Seeker Swarm missiles whose target is destroyed turn to the next enemy again; some flew off toward a corner of the field instead.', // not confirmed
    "The Herald of Silence's shards all turn after the ship at the same rate; now and then one turned twice as sharply and was harder to dodge.", // not confirmed
    'If part of the game fails to start, the loading screen now stays and says so, asking you to reload the page, instead of opening a menu whose Launch does nothing.', // not confirmed
    'With the Shard Halo or the Furnace Corona, the piloting trail no longer offers the Auto Turret, which does nothing for weapons that never aim: it goes in on its own when its turn comes and the same level-up already offers the next step, so the way to the Targeting Matrix and the Flight Computer stays open and takes one pick less.', // not confirmed
    "The turret no longer turns a Scatter Coil or an Arc Caster toward a target past their reach while one they can hit is in front: with the Targeting Matrix, the Afterburn Lance's longer lock could swing the weapon to a volatile rock far away, and the rock right ahead took no damage at all.", // not confirmed
    'With every card slot full and the hull whole, a level-up no longer offers a Hull Patch that would mend nothing: the Salvage Cache comes alone (with a hurt hull, both come, the patch first).', // not confirmed
    'After a Retry, a Leech still holds what it had eaten (killing it gives it all back, with its bonus) and no longer grows a little at each Retry, and a Shade that was hidden stays hidden instead of reappearing at once.', // not confirmed
    "Settings (F10, or View on a pad) no longer open over the level-up cards, a chest's cards or the ending's choice: under Settings, Enter, Space, 1 to 3 or A picked a card, closed the chest or chose and saved an ending without you seeing it, and the run went on with an invisible Settings still open. They open again as soon as the choice is made.", // not confirmed
    "On a tablet, the ending's choice is drawn at a readable size: its smallest letters were about half as tall.", // not confirmed
    'Card texts no longer promise what a weapon cannot get: the Afterburn Lance sells no lock-on range to weapons that never aim or cannot reach that far (the Shard Halo, the Furnace Corona, the Arc Caster and the Scatter Coil), and the Heat Sink, the Overclocked Core, Gyro Servos and the Targeting Matrix tell the Halo what its speed-up really is: the blades may cut the same enemy again sooner.', // not confirmed
    "Launching from the map a sector that begins with a head start (every sector after the first), the scenes before the run (the story, the journey, the descent) no longer sit under a gold tint: the head start's level-up flash stayed lit over them until the run began.", // not confirmed
  ],
  unseen: [
    "The ending's last image is prepared on the loading screen, so nothing stalls when the choice opens or at any cut; it reuses the freighter the opening already builds, so loading takes no longer (about a twentieth of a second).",
    'A `?replay=` link that points at a damaged or hostile recording (wrong shapes, absurd lengths, another site over plain http, a huge file) now ends in the replay notice instead of a frozen page; players cannot make replay links yet, so nobody notices.', // not confirmed
    'The first-visit tips now save through the held-progress path, so demo and profiling runs (?content=, ?profile=) leave the real pilot untouched; players never start those runs.', // not confirmed
    "A reused sound node now drops the fade left over from the sound that used it before, and two pools that could never hold anything are gone; nobody notices because no audible case was found, it only removes a way for a sound to start with the tail of the previous sound's fade.", // not confirmed
    'A shot now reuses the trail list of the bullet it recycles instead of making a new one, so nobody notices: measured at well under a tenth of a millisecond a frame.', // not confirmed
    'A few pieces of dead or duplicated code were removed (an empty boss hook, a repeated crack clean-up, a missing source-map line, two unused settings fallbacks); nothing changes for the player.', // not confirmed
    "The lists of bosses and Heralds (and their Codex pages) are now built from each boss's own file instead of being typed out again in several places, so adding a boss touches fewer files; every boss, its order and its words are exactly as before, so nothing changes in play.", // not confirmed
    "Each card now says in its own file how it is unlocked (from the start, on the piloting track, by a Hangar licence with its price, or by a medal), and the Hangar's lists are built from those files, so a new card can no longer be left out of every list by mistake; the lists, their order and the prices are the same as before, so nobody notices.", // not confirmed
    'The game now registers all its services before creating any, and a service that fails to start stops the load instead of logging an error and being retried; nobody notices because every service is still created in the same order and none fails today.', // not confirmed
    'The physics, enemy and progression systems keep one name for saving and restoring a snapshot instead of several that did the same; the game looks and plays the same.', // not confirmed
    'The run session no longer forwards about twenty calls to its own parts; the tests reach the part directly, so the file stays under its size limit and the game plays the same.', // not confirmed
    'A shield blast, a mine blast or the Reactive Brake no longer nudges a phased Shade when nothing else is in range (it already ignored it when another enemy was near); the Shade is invisible then and steers itself again the next frame, so nobody sees it.', // not confirmed
    'The garbage-collection manager is gone: the pools already trim themselves on the same schedule, so nothing in the game changes.', // not confirmed
    'The 3D engine (three.js) moves from r128, of 2021, to r187, of October 2026, and comes with the game in a file of its own that a returning player keeps until the engine changes again; every kind of scene was compared frame by frame with the old engine and looks the same, a frame costs about 5% more on this Mac and the game is ready a little sooner, so nobody notices.', // not confirmed
    'While a run plays, the menu behind it no longer keeps its full-size picture in the graphics card: about 380 MB freed on a 2560×1600 screen (less on a phone), and the menu is back as before when the run ends; nobody sees it, the game just holds less memory.', // not confirmed
    'Development-only switches in the address (?cadencia, ?bleed, ?freio, ?matriz9) let Felipe play each option of four pending card decisions on the test server; the published game never reads them, and they go once he chooses.', // not confirmed
    "Five error catches that hid real bugs now say why they ignore an error or let it show (a boss blast that fails on one enemy logs it, a thruster sound's volume node goes back to its pool even if already disconnected); nothing changes while nothing breaks.", // not confirmed
    "Three small clean-ups with nothing to notice: the run's session no longer loads the screen code of the link into a run (the game hands it over), the Retries left are a number the session keeps instead of the button's text, and the death snapshot loses fallbacks to methods no system has.", // not confirmed
    "Leaving a run for the menu now clears its pickups, chests and Overcharge, and a run's drops count from its mode's first layer from the start (a sector's head start or a build carried to the next sector kept the old run's layer until its first layer began); nothing could be picked up meanwhile, so nobody notices.", // not confirmed
    'Two object pools the game never took from and a housekeeping that grew and shrank the pools on the wall clock inside every step are gone; it changed no run (measured on 15 recorded scenarios), so nobody notices.', // not confirmed
    "After a Retry the layer goes on with its own draws from where they stood at the death (the next rocks, their variants and fragments, the waves and the rewards), instead of starting again from the run's first draw; nobody can tell one sequence from the other, and the same death still gives the same Retry.", // not confirmed
    "A `?replay=` link now opens only a recording on the game's own site (another site learned who opened it), and a recording's Hangar setup must hold exactly what a run writes, within what owning every item can give (a link flew a ship with a hull of 100,000); players cannot make replay links yet, so nobody notices.", // not confirmed
    'The controls code is split in three files by subject (the bindings, the pad, the rest), so it can be changed again without passing the line limit; it reads keys, pads and touch exactly as before.', // not confirmed
    'The controls hand each step to the ship directly instead of through a command queue that copied every step six times and kept the shield presses forever; nobody notices (it cost a few hundredths of a millisecond a step) and the recorded runs play the same.', // not confirmed
    'A card matrix now runs with every test: every card and every rank must move the number its text promises (or be excused in the test with its reason), every new card needs a probe, and the level-up draw over a hundred seeds never offers a card at its top rank, without its prerequisites, dead for the weapon in hand, or a Hull Patch at full hull; nobody sees it, it stops a broken card from being made.', // not confirmed
    'The interface, the menu background, the reward code and the run session now find the services they use the one way the rest of the game does, instead of through shortcuts and nicknames of their own, and a test keeps those from coming back; each finds the same service as before, so nothing changes in play.', // not confirmed
  ],
};

export const RELEASES = [
  {
    version: '0.8.1',
    date: '2026-11-24',
    new: [
      'A pad now drives a pointer on every menu and overlay, as a mouse: the left stick moves the round reticle (slower over anything you can click), A clicks and drags, the right stick scrolls what is under it; the d-pad still steps item by item, B goes back and LB/RB switch tabs.',
      "The menu explains itself on a first visit, one line at a time in the flight tips' look: how to set up a run on Mission Control, where Salvage comes from in the Hangar, and a pointer to the Hangar once your Salvage first buys something. Campaign, the difficulty and the Hangar's Ship and Medals tabs gain a line of their own; Show Onboarding Tips brings the first-visit lines back.",
      'The ship can strafe from the start: Z and C, or A and D while you hold Space, or the left stick sideways (with the Flight Computer, hold LB; by touch, hold STRAFE). The side jets slide the whole hull without turning the nose, and the RCS System makes them push harder. The shield moves to LT on a controller.',
    ],
    improved: [
      'The death screen and the run\'s timeline name a special rock\'s kind, its blast included: "Killed by a Volatile Ring Fragment", "an Armored Ring Fragment"; a plain rock is still a Ring Fragment.',
      'The dark, flat stones in the menu’s background are now real rocks, small and far off by the Ring.',
      'Every shot now pushes the ship back a little, in every flight, and a slower gun kicks harder per shot: with no cards you correct it on the thrusters; the Braking System and the Flight Computer hold the ship in place.',
      'The Braking System waits until you let go of every key, a beat longer: a turn or a quick tap of thrust no longer bleeds your speed.',
      'Firing no longer shakes the whole ship: the barrels kick back and spring home, and the hull gives a little against the shot and settles. The hull also leans into turns and side pushes, and lifts its nose under the engine and dips it under the retro (none of it with Reduce Motion on).',
      'The camera has a narrower lens: the ship no longer seems to lean as it nears the sides of the screen (about half the lean it had there, and phones had the most), with the same part of the field in view.',
      'On a phone the camera comes closer, so the ship and the enemies look about as big as on a tablet, and it follows the ship sideways; red arrows at the screen edge point to enemy ships out of view and to any rock or shot that will hit you within two seconds. The wide view still opens when it did.',
      'The story aboard the Wake now plays at every campaign launch from Mission Control, not only the first; skip it if you have seen it. Next Sector after a win still flies straight to the journey.',
      'Skipping a scene is now deliberate: hold Space, Start (Options on a PlayStation pad) or the SKIP button on screen for 1.5 s, its outline filling as you hold, and it skips that scene for the next; a quick tap jumps to the next line. Any other key just shows how.',
    ],
    fixed: [
      'A layer no longer stalls after a Retry when the ship died in the blast of a Volatile rock or a Tether: clearing the field ends the layer again.',
      'Choose your pilot is no longer a dead end: Esc on the keyboard or B on the pad goes back to PRESS START (with the delete box open, they only close the box).',
      "The Flight Computer's briefing lines its keys up with their text again when you play on the keyboard or by touch.",
      'B on the pad or Esc pressed right after Launch, while the Wake’s link comes up, no longer brings PRESS START back over the run that is starting.',
    ],
    unseen: [
      "The playtest bot's model of the start's flight brakes the way the Braking System now does (only once every key is let go, a beat later); the game plays the same.",
    ],
  },
  {
    version: '0.8.0',
    date: '2026-11-23',
    new: [
      'The ship now flies on its own thrusters: at the start nothing slows it, so it glides until you fire the retro (S) or turn and burn, and a spin keeps turning a while after you let go.',
      "The Flight Computer's flight is faster than the start, with a turbo that builds on a straight run, and the nose swings onto your keys with weight.",
      'Harmonic Plasma Lance has its own Thermal forms: Searing Beam (3 cards) leaves the beam’s line burning for 1 s and sets alight anything that crosses it; Sunspear (5 cards) makes the beam 50% longer, stays 0.5 s, and its line burns for 2 s.',
      'Three Arc cards make the Harmonic’s beam arc from its far end to the 2 nearest enemies; with five, every enemy the beam crosses starts a lightning chain of 3 jumps.',
      'Three Salvage cards make the orbs from Harmonic beam kills fly straight back to your ship; with five, the beam also sends every orb it crosses to you.',
      'Three Kinetic cards make the Harmonic’s beam throw the machines it hits back along its line and fling the fragments of rocks it kills outward; with five, rocks it kills also burst into shards that fly on along the beam and hit what is behind.',
      'Three Field cards make the Harmonic’s beam tug enemies near its line onto it and hold them for 0.5 s; with five, the beam leaves a gravity trench on its line for 1.2 s that drags nearby enemies onto it.',
      'Scatter Coil has its own Kinetic forms: Grapeshot (3 cards) makes a bolt that hits glance off into the next enemy ahead and burst again; Hailstorm (5 cards) hits 25% harder and glances twice.',
      'Three Thermal cards make a rock hit 3 times by one Scatter Coil volley catch fire inside and die into burning pieces; with five, machines catch fire too and each one set alight passes it to a neighbour.',
      'Three Arc cards make each Scatter Coil burst discharge into the 2 nearest enemies outside it, up to 4 bolts a volley; with five, into 3, each bolt jumping on once more and hitting much harder.',
      'Three Field cards make each Scatter Coil burst pull enemies within 60 px into its centre, then explode on the clump; with five, it pulls from 90 px and holds them 0.5 s.',
      'Three Salvage cards make a Scatter Coil kill throw a scrap shard that fires itself at the nearest enemy (orbs as before); with five, two shards.',
      'Seeker Swarm has its own Thermal form, Thermite: three cards make a missile lodge in what it hits, burn inside it for 1 s, then burst 60% bigger; with five, that burst throws thermite at 3 neighbours that sticks and burns.',
      'Seeker Swarm has its own Arc form, Storm Warhead: three cards make each missile burst throw a heavy bolt that leaps across 3 enemies; with five, across 5.',
      'Seeker Swarm has its own Field form, Gravity Warhead: three cards make each missile burst leave a gravity well for 0.6 s that pulls nearby enemies into it; with five, the well is bigger and the salvo’s other missiles home on it.',
    ],
    improved: [
      'Braking System now brakes your travel with the thrusters when you let go of the keys; RCS System steadies a spin, firmer at each level.',
      'The main flame bursts off the line, then holds a steady third while you keep the key down.',
      'Settings → Controls: Hull Control is gone; your cards choose the flight.',
      'The key hints and the first tip say S brakes; the piloting cards and the Flight Computer briefing describe the new flight.',
      'The engine sound follows how near you fly to your top speed, with no jump when you reach it.',
      'Overcharge Coil has its own version for three weapons: Seeker Swarm missiles fly faster and turn tighter, Scatter Coil flak bolts fly faster and further before they burst, and the Harmonic fires its beam every 3rd shot instead of every 4th.',
      'Thermal Lens has its own version for two weapons: it focuses the Scatter Coil’s fan (bolts closer together, +15% damage), and Seeker Swarm missiles find targets further away and hit harder on a direct hit.',
      'Chain Capacitor has its own version for three weapons: 1 Scatter Coil volley in 10 fires twice, 1 Seeker Swarm missile in 10 splits in two when it locks on, and 1 Harmonic beam in 5 fires twice along the same line.',
      'Recoil Dampers make Scatter Coil and Seeker Swarm bursts reach 25 px further (was 10 px).',
      'Three Kinetic cards make Seeker Swarm bursts 80% wider (was 50%); five, 120%.',
    ],
    fixed: [],
    unseen: [
      'The test address that starts a run with one item (?content=) can now give the ship several cards at chosen levels (&cards=), so Felipe can fly each flight with its upgrades; normal runs are the same.',
      'Replays recorded before this version no longer play (the flight changed); progress, pilots and the Hangar are untouched.',
      'Moved a helper only the tests use out of the game code and into the tests; the game looks and plays the same.',
      'Split the list of game services in two files, the game itself and what shows, sounds and draws it, so the tests stop loading the screens; the game looks and plays the same.',
    ],
  },
  {
    version: '0.7.0',
    date: '2026-11-22',
    new: [
      'Stick Sensitivity in Settings → Controls: Low, Medium or High, for how hard a half-tilted stick pushes.',
      'Shots now push and spin the rock they hit.',
      'Every shot lights what it hits in its own color. The burn mark starts white-hot in that color and cools to lava, and glowing veins light the rocks around them.',
      'The Quarantine Grid’s planet is now a whole cracked world hanging in the distance, its night side dotted with dead cities.',
      'The version number sits in the menu’s corner: open it to see What’s new in each version.',
      'Every hull shows its years of service: worn leading edges, grime, scorched engines, hull codes and warning stripes, and rust on the old Bastion.',
      'Navigation lights: red and green at the wingtips and a white strobe on the antenna.',
    ],
    improved: [
      'The Crucible’s star now boils, with sunspots and a fiery rim, and is a little darker so the fight reads on top of it.',
      'On a controller, the engine flame, its sound and the side jets follow how far you push the stick.',
      'The menu music arrives sooner on a weak connection.',
      'Screen Shake Intensity and Hit Markers now take effect at once, even mid-run.',
      'Damage Numbers and Reduced Particles left Settings: they never did anything.',
      'With a controller, the story scene says PRESS Ⓐ TO SKIP.',
      'The Interceptor, Solar Slicer and Bastion have new hulls: curved bodies, a blue glass dome over the sensor, satin paint and brass trim.',
      'Paint, metal and glass catch the light as your ship turns.',
    ],
    fixed: [
      'iPhone: the game added to the Home Screen and opened sideways no longer plays in a small square.',
      'On a phone, the robot’s opening scene now waits for the install screen to close.',
      'iPhone: the “o” of the opening no longer goes blank after the robot hops out.',
      'Choosing an option in Settings → Controls with a controller no longer loses the highlight.',
      'Gold and crystal rocks break into gold and crystal pieces, not plain stone.',
      'A Warden’s death shakes the screen once, not seven times, and follows Screen Shake Intensity and Reduce Motion.',
      'The light of a hit now dims with Reduce Flashing.',
      'During the automatic brake, the jets that really slow the ship light up (nose, tail or sides) until it stops, not always the nose ones.',
    ],
  },
  {
    version: '0.6.1',
    date: '2026-11-21',
    new: [],
    improved: [],
    fixed: [
      'The same pilot open in two tabs no longer overwrites itself: a tab whose pilot changed elsewhere goes back to the title.',
      'Deleting a pilot from an old tab only deletes the pilot it asked about.',
      'Retry after dying in a replay keeps the recorded upgrades.',
      'Replays recorded before this version can no longer be played; the game tells you so.',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-11-21',
    new: [],
    improved: [
      'The Crystal Choir’s crystals have a new look: fans of deep cyan shards, darker under the arena so the fight reads on top. The sector also loads lighter.',
    ],
    fixed: [
      'Controller, Classic flight: pulling the left stick back dashes backward and brakes, like S.',
      'Controller, Modern flight: the D-pad keeps full thrust while the right stick aims.',
      'Holding Escape to close Settings no longer throws you back to the title.',
      'A quick press on the controller restarts the two-minute wait on the menu.',
      'A pilot deleted in one tab no longer comes back from another tab.',
      'A replay recorded with another pilot’s ship plays with that ship.',
      'An Elite’s broken front shield no longer comes back whole on Retry.',
      'Picking two sectors quickly on the map no longer keeps the first one’s music.',
      'With Touch Controls on Auto, a finger still on the screen no longer steers after you press a key.',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-11-21',
    new: [
      'Xbox controller in the menus: everything is reachable with a console highlight. LB and RB switch tabs, B goes back.',
      'Tap or click the game’s name on the menu to go back to the title and switch pilot.',
    ],
    improved: [
      'Xbox controller in flight: the sticks now push as hard as you lean them, with dash and shield on the shoulders.',
      'Music arrives sooner on a weak connection.',
      'The count marks on the Debris Wake’s wreck plates are now part of the plates, lighting up as the Quarry Maw counts.',
    ],
    fixed: [
      'iPhone: the opening’s robot no longer freezes mid-hop.',
      'Safari: the opening mark no longer shows upside down.',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-11-20',
    new: [
      'Install the game as an app: an Install button on Android and on computers, and the two steps drawn for you on iPhone and iPad.',
      'A new icon, a gold-cracked rock, with the full name Asteroid Roguefield under it.',
      'Touch Controls in Settings → Controls on touch-screen computers: Auto or Always.',
    ],
    improved: [],
    fixed: [
      'Touch now works on screens that say they are a computer, like a Tesla’s or a touch laptop.',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-11-20',
    new: [
      'Three pilots, each with their own progress. Choose your pilot after PRESS START; if you already played, you are Pilot 1 with everything kept.',
      'Delete a pilot, through a box that starts on Cancel.',
      'Escape on the menu, or two minutes without a touch, goes back to the title screen.',
    ],
    improved: [],
    fixed: [
      'If the browser refuses to save a pilot, the game says so instead of playing the wrong one.',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-11-20',
    new: [
      'Play by touch on iPhone and iPad held sideways: a thumb stick where your thumb lands, and DASH, SHIELD and pause buttons.',
      'Every screen works by finger, and the HUD has its own layout on phones and tablets.',
      'Add the game to your Home Screen and play it full screen.',
      'A new Pipo Studio Labs opening: the little robot hops over the letters before the title appears.',
      'Loading lines that say what is loading, with a few jokes in between.',
      'The freighter scene has its own music and engine sounds.',
    ],
    improved: [
      'Upgrade cards fit a phone held sideways, no scrolling.',
      'Pressing the shield before you have it now answers with a small shake and a beep.',
      'The Amber Lance goes straight on to the next enemy.',
      'No more dark bands behind the texts over the scene.',
    ],
    fixed: [
      'Every new mission really is different, and the Daily Field is the same for everyone.',
      'The game no longer gets stuck loading when the browser blocks site data or a font fails.',
      'Music no longer stops for good after a death and Retry.',
      'Boss Rush shows New best again, and a tie no longer counts as one.',
      'Sector and Boss Rush times stop when the Warden dies.',
      'Dash or shield pressed during the pause no longer fire on resume.',
      'Replays play with the recorded Hangar setup, not yours.',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-11-18',
    new: [
      'First beta shared with friends.',
      'Ten campaign sectors, from the Debris Wake to The Crucible, each guarded by a Warden.',
      'Four ways to play: Campaign, Descent, Daily Field and Boss Rush.',
      'Three ships (Interceptor, Solar Slicer, Bastion) and seven weapons.',
      'Upgrade cards every second level, ten per run, with piloting cards that take you from a simple glide to full flight.',
      'The Hangar: medals that pay Salvage, licenses, and the Pressure ladder above Warden.',
      'A story scene aboard the Wake on your first campaign launch.',
      'Recorded music for every sector and boss.',
      'Every hit is physical: rocks break along their own cracks and machines come apart piece by piece.',
    ],
    improved: [],
    fixed: [],
  },
];
