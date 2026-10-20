// src/modules/ui/RunEndScreens.js
//
// The two screens that end a run (the owner's mock-ups of 20/10): the
// headline by how far it got, the last transmission, the run as a timeline
// across its layers (ui/runTimeline.js), the build, the best moment, four
// numbers and the salvage, the line that invites the next run and its
// buttons; the death screen ends with the seed and its share link.

import { loadRecords } from '../../services/runRecords.js';
import { RUN_FINAL_LAYER } from '../../data/constants/gameplay.js';
import { SCREEN_INPUT_LOCKOUT_MS } from './LevelUpScreen.js';
import { collectBuild, endBuildMarkup, formatRunTime } from './runRecap.js';
import { salvageLine } from './hangar.js';
import { glyphMarkup } from './upgradeCard.js';
import {
  bestMoment,
  inviteLine,
  killedByLine,
  runHeadline,
  timelineMarkup,
  timelineModel,
} from './runTimeline.js';

const ensureArray = (value) => (Array.isArray(value) ? value : []);

/**
 * The run end's numbers from the summary the session hands the screen; a won
 * run's time is the last Warden's fall (the screen opens a while later).
 */
function runNumbers(data, outcome) {
  const wave = typeof data.wave === 'number' ? data.wave : data.wave?.current;
  const timeline = ensureArray(data.stats?.timeline);
  const last = timeline[timeline.length - 1];
  const end =
    outcome === 'victory' && last?.kind === 'warden'
      ? last.time
      : data.stats?.timeElapsed;
  return {
    layer: Math.max(1, Math.floor(Number(wave) || 1)),
    time: Math.max(0, Math.floor(Number(end) || 0)),
    kills: data.stats?.totalKills ?? data.stats?.kills ?? 0,
    level: data.player?.level ?? data.level ?? '—',
    timeline,
  };
}

export class RunEndScreens {
  /**
   * `refs`: { gameOver: { body, invite, seed, copySeedBtn, retryBtn, restartBtn }, victory: { body, invite, continueBtn, restartBtn, quitBtn } }.
   * `showScreen(name, options)`: shows the gameover or victory overlay.
   * `progression()`: the progression service (the build), or none.
   * `combat()`: the combat service (the build's weapon).
   * `difficulty()`: the difficulty service (seed label and share link).
   * `hangar()`: the hangar service; its lastAward is the salvage line.
   * `lastTransmission()`: the line shown since the death or the win, or null.
   */
  constructor({
    refs,
    showScreen,
    progression,
    combat,
    difficulty,
    hangar,
    lastTransmission,
  }) {
    this.refs = refs;
    this.showScreen = showScreen;
    this.progression = progression;
    this.combat = combat;
    this.difficulty = difficulty;
    this.hangar = hangar;
    this.lastTransmission = lastTransmission;
    this.victoryLockoutTimer = null;
    this.bestAtStart = 0;
  }

  /** A run starts: the best layer it plays against. */
  noteRunStart() {
    this.bestAtStart = loadRecords().bestLayer;
  }

  // Headline, quote, timeline, build, best moment, numbers and salvage.
  bodyMarkup(outcome, data, numbers) {
    const { layer, time, timeline } = numbers;
    const wardens = timeline.filter(({ kind }) => kind === 'warden').length;
    const head = runHeadline({
      outcome,
      layer,
      bossRush: data.bossRush ?? null,
      wardens,
      time,
      // A Boss Rush records the time the screen opened at (runEnd.js).
      newBest:
        outcome === 'victory' &&
        (data.bossRush
          ? data.bossRush.bestTime === Math.floor(data.stats?.timeElapsed ?? 0)
          : this.bestAtStart < RUN_FINAL_LAYER),
    });
    const badge = head.badge
      ? `<span class="end-badge">${head.badge}</span>`
      : '';
    const of = head.of ? `<small>${head.of}</small>` : '';
    const killer =
      outcome === 'death'
        ? (() => {
            const { lead, name } = killedByLine(data.killedBy);
            return `<p class="end-killer">${lead} <span class="end-killer__who">${name}</span><span class="end-sep">·</span>${formatRunTime(time)}</p>`;
          })()
        : '';
    const transmission = this.lastTransmission();
    const quote = transmission
      ? `<p class="end-quote"><span class="end-quote__who">${transmission.speaker}</span>${transmission.text}</p>`
      : '';
    const model = timelineModel({
      timeline,
      outcome,
      layer,
      bestAtStart: this.bestAtStart,
    });
    const progression = this.progression();
    const build = progression
      ? endBuildMarkup(collectBuild(progression, this.combat()))
      : '';
    const moment = bestMoment(timeline, outcome);
    const momentMarkup = moment
      ? `<p class="end-moment__big is-${moment.tone}">${moment.title}</p><p class="end-moment__where">${moment.where}</p>`
      : `<p class="end-moment__big">Layer ${layer}</p><p class="end-moment__where">${formatRunTime(time)}</p>`;
    const fourth =
      outcome === 'victory'
        ? ['Max combo', `×${data.maxCombo ?? 0}`]
        : ['Wardens', `${wardens}/${model.wardenLayers.length}`];
    const stats = [
      ['Time', formatRunTime(time)],
      ['Kills', Number(numbers.kills).toLocaleString('en-US')],
      ['Level', numbers.level],
      fourth,
    ]
      .map(
        ([label, value]) =>
          `<div class="end-stat"><span class="end-stat__v">${value}</span><span class="end-lbl">${label}</span></div>`
      )
      .join('');
    const award = salvageLine(this.hangar().lastAward);
    const salvage = `<p class="end-salvage">${glyphMarkup('salvage')}<span class="end-salvage__v">${award.amount}</span><span>${award.text}</span></p>`;
    return `<header class="end-head">
        <p class="end-kicker">${head.kicker}</p>
        <h1 class="end-title">${head.title}${of}</h1>
        <p class="end-chapter">${head.line}${badge}</p>
        ${killer}${quote}
      </header>
      <section class="end-run"><p class="end-lbl">The run</p>${timelineMarkup(model)}</section>
      <div class="end-cols">
        <section class="end-build"><p class="end-lbl">Build</p>${build}</section>
        <section class="end-moment">
          <p class="end-lbl">Best moment</p>${momentMarkup}
          <div class="end-stats">${stats}</div>
          ${salvage}
        </section>
      </div>`;
  }

  showGameOverScreen(payload) {
    // Show gameover as overlay so game canvas stays visible with asteroids wandering
    this.showScreen('gameover', { overlay: true, show: true });

    const data = payload?.data || {};
    const refs = this.refs.gameOver;
    const numbers = runNumbers(data, 'death');
    refs.body.innerHTML = this.bodyMarkup('death', data, numbers);
    refs.invite.innerHTML = inviteLine({
      outcome: 'death',
      layer: numbers.layer,
      bestAtStart: this.bestAtStart,
      bossRush: data.bossRush ?? null,
    });
    refs.seed.textContent = this.difficulty().runLabel();
    refs.copySeedBtn.textContent = 'Copy seed link';
    refs.restartBtn?.focus({ preventScroll: true });
  }

  showVictoryScreen(payload) {
    this.showScreen('victory', { overlay: true, show: true });

    const data = payload?.data || {};
    const refs = this.refs.victory;
    const rush = data.bossRush;
    refs.body.innerHTML = this.bodyMarkup(
      'victory',
      data,
      runNumbers(data, 'victory')
    );
    refs.invite.innerHTML = inviteLine({
      outcome: 'victory',
      bossRush: rush ?? null,
    });
    // A Boss Rush ends here: no Deep Field after it.
    refs.continueBtn?.classList.toggle('hidden', Boolean(rush));

    const buttons = [refs.continueBtn, refs.restartBtn, refs.quitBtn];
    buttons.forEach((button) => {
      if (button) button.disabled = true;
    });
    clearTimeout(this.victoryLockoutTimer);
    this.victoryLockoutTimer = setTimeout(() => {
      buttons.forEach((button) => {
        if (button) button.disabled = false;
      });
      (rush ? refs.restartBtn : refs.continueBtn)?.focus({
        preventScroll: true,
      });
    }, SCREEN_INPUT_LOCKOUT_MS);
  }

  // The death recap's "Copy seed link": this run's seed and difficulty as a
  // `?seed=&difficulty=` link (clipboard may be missing or refused).
  bindCopySeedLink() {
    const button = this.refs.gameOver.copySeedBtn;
    if (!button) return;
    button.addEventListener('click', () => {
      const link = this.difficulty().shareLink(
        window.location.origin,
        import.meta.env.BASE_URL
      );
      const done = (label) => {
        button.textContent = label;
      };
      if (!navigator.clipboard?.writeText) {
        done('Copy unavailable');
        return;
      }
      navigator.clipboard.writeText(link).then(
        () => done('Link copied'),
        () => done('Copy failed')
      );
    });
  }
}
