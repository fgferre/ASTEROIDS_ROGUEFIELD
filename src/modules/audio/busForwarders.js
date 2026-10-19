// AudioSystem's public play* methods that only forward to the SFXBus. Other
// systems and tests call them on the `audio` service, and the facade API
// parity suite pins each one on AudioSystem.prototype; game events reach the
// bus directly (src/data/audio/eventCues.js). Each entry lists the facade's
// parameters: undefined = passed as given, OPTIONS = a fresh {} when missing,
// any other value = its default. The bus gets exactly that many arguments.

const OPTIONS = Symbol('options');

const BUS_FORWARDERS = {
  playLaserShot: [OPTIONS],
  playDroneFire: [OPTIONS],
  playHunterBurst: [OPTIONS],
  playMineExplosion: [OPTIONS],
  playTargetLock: [OPTIONS],
  playAsteroidBreak: [undefined],
  playExplosion: [undefined, OPTIONS],
  playEnemyTelegraph: [OPTIONS],
  playRamSpinUp: [OPTIONS],
  playRamCharge: [OPTIONS],
  playHuskRelease: [OPTIONS],
  playWeaverTether: [OPTIONS],
  playBulwarkPlateHit: [OPTIONS],
  playBulwarkPlateBreak: [OPTIONS],
  playCasterCharge: [OPTIONS],
  playCasterLaunch: [OPTIONS],
  playCasterImpact: [OPTIONS],
  playShadePhase: [OPTIONS],
  playHeraldSpawn: [OPTIONS],
  playHeraldAttack: [OPTIONS],
  playFlakBurst: [OPTIONS],
  playLeechAte: [OPTIONS],
  playLeechBurst: [OPTIONS],
  playEliteSpawned: [],
  playSurgeSting: [],
  playDeepFieldEntry: [],
  playSalvageAwarded: [undefined],
  playHangarPurchase: [],
  playTipChime: [],
  playHarmonicBeam: [OPTIONS],
  playWeaponEvolved: [],
  playCardReroll: [],
  playCardBanish: [],
  playCodexDiscovered: [],
  playPickupCollected: [undefined],
  playPickupSpawned: [OPTIONS],
  playChapterStinger: [undefined],
  playWardenStinger: [],
  playTransmission: [],
  playTransmissionVoice: [undefined],
  playXPCollect: [],
  // The determinism and port suites drive the batched synthesis directly.
  _playDroneFireDirect: [OPTIONS],
  _playHunterBurstDirect: [OPTIONS],
  _playMineExplosionDirect: [OPTIONS],
  playLevelUp: [],
  playOrbFusion: [undefined],
  playGoldSpawn: [],
  playGoldJackpot: [],
  playBulletHit: [false],
  playShipHit: [],
  playDash: [OPTIONS],
  playBrake: [OPTIONS],
  playShieldActivate: [],
  playShieldImpact: [],
  playBossShieldDeflect: [],
  playShieldBreak: [],
  playShieldRecharged: [],
  playShieldFail: [],
  playShieldShockwave: [],
  playUpgradeSelect: ['common'],
  playPauseOpen: [],
  playPauseClose: [],
  playMenuTransition: [],
  playLowHealthWarning: [],
  playUIHover: [],
  playUISelect: [],
  playUIStartGame: [],
};

/** Defines the forwarders on the prototype, non-enumerable like class methods. */
export function installBusForwarders(prototype) {
  Object.entries(BUS_FORWARDERS).forEach(([name, params]) => {
    Object.defineProperty(prototype, name, {
      configurable: true,
      writable: true,
      value(...args) {
        this.sfxBus[name](
          ...params.map((fallback, index) => {
            if (args[index] !== undefined) return args[index];
            return fallback === OPTIONS ? {} : fallback;
          })
        );
      },
    });
  });
}
