// src/modules/ui/RunEndScreens.js
//
// The two screens that end a run (the owner's mock-ups of 20/10): the
// headline by how far it got, the last transmission, the run as a timeline
// across its layers (ui/runTimeline.js), the build, the best moment, four
// numbers and the salvage, the line that invites the next run and its
// buttons; the death screen ends with the seed and its share link. The
// campaign's last win (ENDING_SECTOR) opens the choice between its endings
// first; the pick plays its ending (ui/runCinematics.js) and the victory
// screen becomes the final card.

import { loadRecords, updateRecords } from '../../services/runRecords.js';
import { ENDING_SECTOR, STORY } from '../../data/story.js';
import { RUN_FINAL_LAYER } from '../../data/constants/gameplay.js';
import { localLayer, nextInChapter, sectorById } from '../../data/sectors.js';
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

const ENDINGS = Object.keys(STORY.ending);

/** The choice's options, side by side: each ending's title and sentence. */
export function endingChoiceMarkup() {
  return ENDINGS.map(
    (
      id,
      i
    ) => `<button type="button" id="ending-${id}-btn" class="ending-option" data-ending="${id}">
        <kbd data-device="keyboard">${i + 1}</kbd>
        <span class="ending-option__title">${STORY.ending[id].title}</span>
        <span class="ending-option__text">${STORY.ending[id].choice}</span>
      </button>`
  ).join('');
}

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
   * `refs`: { gameOver: { body, invite, seed, copySeedBtn, retryBtn, restartBtn }, victory: { body, invite, continueBtn, nextBtn, restartBtn, quitBtn, menuBtn, choiceOptions, field } }.
   * A sector run's screens (`data.sector`, runEnd.js) speak of its chapter.
   * `showScreen(name, options)`: shows the gameover or victory overlay.
   * `progression()`: the progression service (the build), or none.
   * `combat()`: the combat service (the build's weapon).
   * `difficulty()`: the difficulty service (seed label and share link).
   * `hangar()`: the hangar service; its lastAward is the salvage line.
   * `lastTransmission()`: the line shown since the death or the win, or null.
   * `cinematics`: the run's cinematics (playEnding).
   */
  constructor({
    refs,
    showScreen,
    progression,
    combat,
    difficulty,
    hangar,
    lastTransmission,
    cinematics,
  }) {
    this.refs = refs;
    this.showScreen = showScreen;
    this.progression = progression;
    this.combat = combat;
    this.difficulty = difficulty;
    this.hangar = hangar;
    this.lastTransmission = lastTransmission;
    this.cinematics = cinematics;
    this.victoryLockoutTimer = null;
    this.bestAtStart = 0;
    // A `?replay=` run ('game-started'): it never opens the choice.
    this.replay = false;
    // The won run's victory payload while the choice is on screen.
    this.choice = null;
  }

  /** A run starts ('game-started' payload): the best layer it plays against. */
  noteRunStart({ replay = false } = {}) {
    this.bestAtStart = loadRecords().bestLayer;
    this.replay = Boolean(replay);
    this.choice = null;
    this.refs.victory.field?.classList.remove('is-ending', 'is-severed');
  }

  // Headline, quote, timeline, build, best moment, numbers and salvage; a
  // `finalTitle` makes the headline the campaign's final card.
  bodyMarkup(outcome, data, numbers, finalTitle = null) {
    const { layer, time, timeline } = numbers;
    const wardens = timeline.filter(({ kind }) => kind === 'warden').length;
    const sector = sectorById(data.sector?.id);
    const head = runHeadline({
      outcome,
      layer,
      bossRush: data.bossRush ?? null,
      sector,
      firstClear: Boolean(data.sector?.firstClear),
      wardens,
      time,
      // A Boss Rush and a sector run record the time the screen opened at
      // (runEnd.js).
      newBest:
        outcome === 'victory' &&
        (data.bossRush
          ? data.bossRush.bestTime === Math.floor(data.stats?.timeElapsed ?? 0)
          : sector
            ? data.sector.bestTime === data.sector.time
            : this.bestAtStart < RUN_FINAL_LAYER),
    });
    if (finalTitle) {
      head.kicker = 'The end';
      head.title = finalTitle;
    }
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
      // The best layer is a full run's record.
      bestAtStart: sector ? 0 : this.bestAtStart,
      sector,
    });
    const progression = this.progression();
    const build = progression
      ? endBuildMarkup(collectBuild(progression, this.combat()))
      : '';
    const moment = bestMoment(timeline, outcome, sector);
    const momentMarkup = moment
      ? `<p class="end-moment__big is-${moment.tone}">${moment.title}</p><p class="end-moment__where">${moment.where}</p>`
      : `<p class="end-moment__big">Layer ${sector ? localLayer(sector, layer) : layer}</p><p class="end-moment__where">${formatRunTime(time)}</p>`;
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
      sector: sectorById(data.sector?.id),
    });
    refs.seed.textContent = this.difficulty().runLabel();
    refs.copySeedBtn.textContent = 'Copy seed link';
    refs.restartBtn?.focus({ preventScroll: true });
  }

  /**
   * The victory screen; the campaign's last win opens the choice instead
   * (not on a replay), and comes back here as the final card with the
   * `ending` picked (a replay's has none).
   */
  showVictoryScreen(payload, ending = null) {
    const data = payload?.data || {};
    const finale = data.sector?.id === ENDING_SECTOR;
    if (finale && !ending && !this.replay) {
      this.showEndingChoice(payload);
      return;
    }
    this.showScreen('victory', { overlay: true, show: true });

    const refs = this.refs.victory;
    const rush = data.bossRush;
    const sector = sectorById(data.sector?.id);
    const next = sectorById(data.sector?.next);
    refs.body.innerHTML = this.bodyMarkup(
      'victory',
      data,
      runNumbers(data, 'victory'),
      finale ? STORY.ending[ending]?.title ?? 'Sovereign down' : null
    );
    refs.invite.innerHTML = finale
      ? `<span class="end-endings">Endings found <b>${loadRecords().endings.length} / ${ENDINGS.length}</b></span>`
      : inviteLine({
          outcome: 'victory',
          bossRush: rush ?? null,
          sector,
          next,
        });
    // A Boss Rush or a sector run ends here: no Deep Field after it; a
    // sector won opens the next one, and the map is where it goes back to
    // (ui/CampaignMap.js).
    refs.continueBtn?.classList.toggle('hidden', Boolean(rush || sector));
    if (refs.nextBtn) {
      refs.nextBtn.classList.toggle('hidden', !next);
      refs.nextBtn.dataset.sector = next?.id ?? '';
      const label = refs.nextBtn.querySelector?.('.end-btn__label');
      if (label) {
        label.textContent = nextInChapter(sector)
          ? 'Next Sector'
          : 'Next Chapter';
      }
    }
    // The final card: back to the map (first) or the main menu, nothing else.
    refs.restartBtn?.classList.toggle('hidden', finale);
    refs.menuBtn?.classList.toggle('hidden', !finale);
    if (refs.quitBtn) {
      refs.quitBtn.textContent = finale
        ? 'Campaign'
        : sector
          ? 'Campaign map'
          : 'Quit to menu';
      refs.quitBtn.classList.toggle('end-btn--primary', finale);
      refs.quitBtn.classList.toggle('end-btn--quiet', !finale);
    }

    const buttons = [
      refs.continueBtn,
      refs.nextBtn,
      refs.restartBtn,
      refs.quitBtn,
      refs.menuBtn,
    ];
    buttons.forEach((button) => {
      if (button) button.disabled = true;
    });
    clearTimeout(this.victoryLockoutTimer);
    this.victoryLockoutTimer = setTimeout(() => {
      buttons.forEach((button) => {
        if (button) button.disabled = false;
      });
      const primary = finale
        ? refs.quitBtn
        : next
          ? refs.nextBtn
          : rush || sector
            ? refs.restartBtn
            : refs.continueBtn;
      primary?.focus({ preventScroll: true });
    }, SCREEN_INPUT_LOCKOUT_MS);
  }

  /**
   * The choice between the endings, after the campaign's last win: no other
   * way out; its options wake after the screens' lockout, the first focused.
   */
  showEndingChoice(payload) {
    this.choice = payload;
    const options = this.refs.victory.choiceOptions;
    options.innerHTML = endingChoiceMarkup();
    this.showScreen('ending', { overlay: true, show: true });
    const buttons = this.choiceButtons();
    buttons.forEach((button) => {
      button.disabled = true;
    });
    clearTimeout(this.victoryLockoutTimer);
    this.victoryLockoutTimer = setTimeout(() => {
      buttons.forEach((button) => {
        button.disabled = false;
      });
      buttons[0]?.focus({ preventScroll: true });
    }, SCREEN_INPUT_LOCKOUT_MS);
  }

  choiceButtons() {
    return [
      ...this.refs.victory.choiceOptions.querySelectorAll('[data-ending]'),
    ];
  }

  /**
   * An ending picked on the choice: recorded once, the choice leaves, its
   * lines play over the held shot, the HUD down to its transmission, as the
   * Ring answers (Severance also dims the field), then the final card.
   * False when no choice is open.
   */
  chooseEnding(ending) {
    const payload = this.choice;
    if (!payload || !STORY.ending[ending]) return false;
    this.choice = null;
    this.showScreen('ending', { overlay: true, show: false });
    updateRecords({ ending });
    const field = this.refs.victory.field;
    field?.classList.add('is-ending');
    field?.classList.toggle('is-severed', ending === 'severance');
    this.cinematics.playEnding(ending, () =>
      this.showVictoryScreen(payload, ending)
    );
    return true;
  }

  bindControls() {
    this.bindCopySeedLink();
    this.bindEndingChoice();
  }

  // The choice: a click on an option; keys 1 and 2 pick, left and right
  // move between them (Enter presses the focused one); the pad moves the
  // focus as on any screen (gamepadNav.js).
  bindEndingChoice() {
    const options = this.refs.victory.choiceOptions;
    if (!options) return;
    options.addEventListener('click', (event) => {
      const option = event.target.closest?.('[data-ending]');
      if (option && !option.disabled) this.chooseEnding(option.dataset.ending);
    });
    document.addEventListener('keydown', (event) => {
      const buttons = this.choice ? this.choiceButtons() : [];
      if (!buttons.length || buttons[0].disabled || event.repeat) return;
      const picked = buttons[Number(event.key) - 1];
      const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
      if (picked) {
        event.preventDefault();
        this.chooseEnding(picked.dataset.ending);
      } else if (step) {
        event.preventDefault();
        const at = Math.max(0, buttons.indexOf(document.activeElement));
        const to = Math.min(buttons.length - 1, Math.max(0, at + step));
        buttons[to].focus({ preventScroll: true });
      }
    });
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
