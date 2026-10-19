// src/modules/ui/hud/hudMarkup.js

import { BEAM_PIPS } from './systemsPanel.js';

/** The HUD's markup: one block per panel, in on-screen order. */
export function getHudHtml() {
  return `
            <div class="lowhp-vignette" id="ui-lowhp-vignette"></div>
            <div class="hud-direction" id="ui-direction"></div>

            <!-- STATS (Top Left) -->
            <div class="stats-area hud-panel">
                <div class="stats-grid">
                    <div class="stat-block">
                        <div class="stat-label"><i data-lucide="clock" size="14"></i> TIME</div>
                        <div class="stat-value" id="ui-timer">00:00</div>
                    </div>
                    <div class="stat-block">
                        <div class="stat-label"><i data-lucide="crosshair" size="14"></i> KILLS</div>
                        <div class="stat-value" id="ui-kills">0</div>
                    </div>
                </div>
                <div class="combo-box is-hidden" id="ui-combo-box">
                    <div class="combo-label">COMBO</div>
                    <div class="combo-val" id="ui-combo">x0</div>
                </div>
            </div>

            <!-- BOSS (Top Center) -->
            <div class="boss-area hud-panel" id="ui-boss-panel">
                <div class="boss-bar-container">
                    <div class="boss-name" id="ui-boss-name">BOSS</div>
                    <div class="boss-skull"><i data-lucide="skull" size="24"></i></div>
                    <div class="boss-fill" id="ui-boss-fill"></div>
                    <div class="boss-segments" id="ui-boss-segments"></div>
                </div>
            </div>

            <!-- RADAR (Top Right - Decagon + Analog Ring) -->
            <div class="radar-area hud-panel">
                <div class="radar-structure" id="ui-radar">
                    <svg class="radar-svg-layer" viewBox="0 0 220 220">
                        <circle class="radar-ring" cx="110" cy="110" r="108" />
                        <circle class="radar-ring-dash" cx="110" cy="110" r="100" />
                        <polygon class="radar-outline" points="110,15 166,33 200,81 200,139 166,187 110,205 54,187 20,139 20,81 54,33" />
                        <line class="radar-axis" x1="110" y1="15" x2="110" y2="205" />
                        <line class="radar-axis" x1="20" y1="139" x2="200" y2="81" />
                        <line class="radar-axis" x1="20" y1="81" x2="200" y2="139" />
                        <line class="radar-axis" x1="166" y1="33" x2="54" y2="187" />
                        <line class="radar-axis" x1="54" y1="33" x2="166" y2="187" />
                        <polygon class="radar-inner" points="110,53 144,64 164,93 164,127 144,156 110,167 76,156 56,127 56,93 76,64" />
                    </svg>

                    <div class="radar-mask">
                        <div class="radar-sweep"></div>
                        <div class="blip-container" id="ui-radar-blips">
                            <div class="blip player"></div>
                        </div>
                    </div>
                    <div class="radar-jam-label">NO SIGNAL</div>
                </div>
            </div>

            <!-- NEXT WAVE (Center) -->
            <div class="next-wave-box" id="el-wave-alert">
                <div class="next-wave-label">INCOMING LAYER</div>
                <div class="next-wave-timer" id="ui-next-wave-timer">10</div>
            </div>

            <!-- LAYER BANNER + BOSS INTRO (Center, upper third) -->
            <div class="layer-banner" id="ui-layer-banner" aria-live="polite">
                <div class="layer-banner__title" id="ui-layer-banner-title">LAYER 1</div>
                <div class="layer-banner__line"></div>
                <div class="layer-banner__sub" id="ui-layer-banner-sub"></div>
            </div>
            <div class="cinematic-hint" id="ui-cinematic-hint">PRESS ANY KEY TO SKIP</div>
            <div class="letterbox" id="ui-letterbox" aria-hidden="true"></div>
            <div class="boss-intro" id="ui-boss-intro" aria-live="polite">
                <div class="boss-intro__line"></div>
                <div class="boss-intro__name" id="ui-boss-intro-name">Warden Prime</div>
                <div class="boss-intro__sub" id="ui-boss-intro-sub">Guardian of the Ring</div>
                <div class="boss-intro__line"></div>
            </div>
            <div class="onboarding-tip" id="ui-onboarding-tip" role="status">
                <div class="onboarding-tip__keys" id="ui-onboarding-keys"></div>
                <div class="onboarding-tip__text" id="ui-onboarding-text"></div>
            </div>
            <div class="transmission" id="ui-transmission" aria-live="polite">
                <div class="transmission__speaker" id="ui-transmission-speaker"></div>
                <div class="transmission__rule"></div>
                <div class="transmission__line" id="ui-transmission-line"></div>
            </div>

            <!-- KILL FEED (Right, under the radar) -->
            <div class="hud-feed" id="ui-feed"></div>

            <!-- VITALS (Bottom Left) -->
            <div class="status-area hud-panel">
                <div class="bars-container">
                    <div class="system-label shield-label">❖ SHIELDS</div>
                    <div class="bar-wrapper">
                        <div class="health-bar-row shield" id="ui-shield-row"></div>
                        <div class="numeric-text shield-text" id="ui-shield-text">100%</div>
                    </div>
                    <div class="bar-wrapper">
                        <div class="health-bar-row" id="ui-hull-row"></div>
                        <div class="numeric-text hull-text" id="ui-hull-text">100%</div>
                    </div>
                    <div class="system-label hull-label">♥ HULL INTEGRITY</div>
                </div>
            </div>

            <!-- PROGRESS (Bottom Center) -->
            <div class="bottom-center hud-panel">
                <div class="wave-indicator">
                    <div class="wave-content">
                        <div class="wave-label">LAYER</div>
                        <div class="wave-num" id="ui-wave-num">1</div>
                    </div>
                </div>
                <div class="xp-bar-container">
                    <div class="xp-label"><i data-lucide="zap" size="12"></i> XP</div>
                    <div class="xp-fill" id="ui-xp-fill"></div>
                </div>
                <div class="xp-details">
                    <div class="xp-values" id="ui-xp-text">0 / 1000</div>
                    <div class="lvl-indicator" id="ui-lvl-text">Lvl 1</div>
                </div>
            </div>

            <!-- MODES (Bottom Right) -->
            <div class="systems-area hud-panel">
                <div class="buff-row" id="ui-buffs"></div>
                <div class="weapon-group">
                    <div class="mode-chip weapon-chip" id="ui-weapon-chip">WEAPON <span class="data-val" id="ui-weapon-name">LANCE</span><span class="beam-pips is-hidden" id="ui-beam-pips">${'<span class="beam-pip"></span>'.repeat(BEAM_PIPS)}</span></div>
                    <div class="evo-row" id="ui-evolutions"></div>
                </div>
                <div class="systems-row">
                    <div class="mode-chip">AIM <span class="data-val" id="ui-aim-mode">AUTO</span></div>
                    <div class="mode-chip">SPREAD <span class="data-val" id="ui-spread-mode">CONC</span></div>
                    <div class="mode-chip dash-chip" id="ui-dash-chip">DASH <span class="dash-meter"><span class="dash-meter__fill" id="ui-dash-fill"></span></span></div>
                </div>
            </div>

            <div class="cockpit-frame"></div>
        `;
}
