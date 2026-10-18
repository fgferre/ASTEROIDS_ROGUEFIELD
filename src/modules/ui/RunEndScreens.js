// src/modules/ui/RunEndScreens.js
//
// The two screens that end a run: the death recap (stats, killer, where,
// salvage, build, seed and its share link) and the victory screen (stats,
// build, synergies, best, salvage), both quoting the last transmission.

import { BOSS_RUSH_LAYERS } from '../../data/layers.js';
import { SCREEN_INPUT_LOCKOUT_MS } from './LevelUpScreen.js';
import {
  buildBlockMarkup,
  collectBuild,
  formatRunTime,
  killerName,
  runLocationLine,
  transmissionQuoteMarkup,
} from './runRecap.js';
import { salvageLine } from './hangar.js';
import { bossRushBest } from './menuStatus.js';

const ensureArray = (value) => (Array.isArray(value) ? value : []);

export class RunEndScreens {
  /**
   * `refs`: the screens' nodes { gameOver: { time, …, copySeedBtn, retryBtn, restartBtn }, victory: { title, …, continueBtn, restartBtn, quitBtn } }.
   * `showScreen(name, options)`: shows the gameover or victory overlay.
   * `progression()`: the progression service (the death recap's build), or none.
   * `combat()`: the combat service (the build's weapon).
   * `difficulty()`: the difficulty service (seed label and share link).
   * `hangar()`: the hangar service; its lastAward is the Salvage line.
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
  }

  showGameOverScreen(payload) {
    // Show gameover as overlay so game canvas stays visible with asteroids wandering
    this.showScreen('gameover', { overlay: true, show: true });

    const data = payload?.data || {};
    const refs = this.refs.gameOver;
    const setText = (node, value) => {
      if (node) node.textContent = value;
    };

    const totalSeconds = Math.max(
      0,
      Math.floor(Number(data.stats?.timeElapsed) || 0)
    );
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    const wave = typeof data.wave === 'number' ? data.wave : data.wave?.current;
    const level = data.player?.level ?? data.level;

    setText(refs.time, `${minutes}:${seconds}`);
    setText(refs.wave, `${wave ?? '—'}`);
    setText(refs.kills, `${data.stats?.totalKills ?? data.stats?.kills ?? 0}`);
    setText(refs.combo, `x${data.maxCombo ?? 0}`);
    setText(refs.level, `${level ?? '—'}`);
    setText(refs.killer, `Killed by ${killerName(data.killedBy)}`);
    const rush = data.bossRush;
    setText(
      refs.location,
      rush
        ? [
            'Boss Rush',
            `Warden ${rush.stage} of ${BOSS_RUSH_LAYERS.length}`,
            formatRunTime(totalSeconds),
            `BEST ${bossRushBest(rush.bestStage, rush.bestTime).toUpperCase()}`,
          ].join(' · ')
        : runLocationLine(wave, totalSeconds, data.bestLayer ?? null)
    );
    setText(refs.salvage, salvageLine(this.hangar().lastAward));
    setText(refs.seed, this.difficulty().runLabel());
    setText(refs.copySeedBtn, 'Copy seed link');
    if (refs.quote) {
      refs.quote.innerHTML = transmissionQuoteMarkup(this.lastTransmission());
    }

    const progression = this.progression();
    if (refs.build && progression) {
      refs.build.innerHTML = buildBlockMarkup(
        collectBuild(progression, this.combat())
      );
    }

    const focusTarget = refs.retryBtn?.disabled
      ? refs.restartBtn
      : refs.retryBtn || refs.restartBtn;
    focusTarget?.focus({ preventScroll: true });
  }

  showVictoryScreen(payload) {
    this.showScreen('victory', { overlay: true, show: true });

    const data = payload?.data || {};
    const refs = this.refs.victory;
    const setText = (node, value) => {
      if (node) node.textContent = value;
    };

    const totalSeconds = Math.max(
      0,
      Math.floor(Number(data.stats?.timeElapsed) || 0)
    );
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    const wave = typeof data.wave === 'number' ? data.wave : data.wave?.current;
    const level = data.player?.level ?? data.level;

    const rush = data.bossRush;
    setText(refs.title, rush ? 'BOSS RUSH CLEARED' : 'FIELD CLEARED');
    setText(refs.time, `${minutes}:${seconds}`);
    setText(refs.wave, `${wave ?? '—'}`);
    setText(refs.kills, `${data.stats?.totalKills ?? data.stats?.kills ?? 0}`);
    setText(refs.combo, `x${data.maxCombo ?? 0}`);
    setText(refs.level, `${level ?? '—'}`);
    setText(
      refs.best,
      rush
        ? `Cleared in ${formatRunTime(totalSeconds)} · Best ${bossRushBest(rush.bestStage, rush.bestTime)}`
        : `Best layer: ${data.bestLayer ?? wave ?? '—'}`
    );
    // A Boss Rush ends here: no Deep Field after it.
    refs.continueBtn?.classList.toggle('hidden', Boolean(rush));
    setText(refs.salvage, salvageLine(this.hangar().lastAward));
    if (refs.quote) {
      refs.quote.innerHTML = transmissionQuoteMarkup(this.lastTransmission());
    }

    if (refs.build) {
      refs.build.innerHTML = '';
      const upgrades = ensureArray(data.upgrades);
      if (!upgrades.length) {
        const empty = document.createElement('li');
        empty.className = 'gameover-build__empty';
        empty.textContent = 'No upgrades';
        refs.build.appendChild(empty);
      }
      upgrades.forEach(({ name, id, level: rank }) => {
        const item = document.createElement('li');
        item.className = 'gameover-build__item';
        item.append(`${name || id} `);
        const rankNode = document.createElement('span');
        rankNode.className = 'gameover-build__rank';
        rankNode.textContent = `Lv.${rank}`;
        item.appendChild(rankNode);
        refs.build.appendChild(item);
      });
    }

    if (refs.synergies) {
      refs.synergies.innerHTML = '';
      ensureArray(data.synergies).forEach(({ name, family }) => {
        const item = document.createElement('li');
        item.className = 'gameover-build__item';
        item.textContent = name || family;
        refs.synergies.appendChild(item);
      });
    }

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
