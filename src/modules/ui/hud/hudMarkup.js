// src/modules/ui/hud/hudMarkup.js

/**
 * The HUD's markup: the slots the preset's instruments mount in
 * (instruments/registry.js) and the centre-screen moments, in paint order.
 * The on-ship slots cover the whole window; the others sit in a centred
 * 16:9 frame.
 */
export function getHudHtml() {
  return `
            <!-- ON THE SHIP: drawn at the ship's screen point -->
            <div data-slot="hull-ring"></div>
            <div data-slot="recharges"></div>
            <div class="hud-direction" id="ui-direction"></div>

            <div class="hud-frame">
                <div data-slot="run-info"></div>
                <div data-slot="warden"></div>
                <div class="radar-area hud-panel" data-slot="radar"></div>
                <div data-slot="feed"></div>
                <div data-slot="vitals"></div>
                <div data-slot="xp"></div>
                <div data-slot="build"></div>
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

            <div class="cockpit-frame"></div>
        `;
}
