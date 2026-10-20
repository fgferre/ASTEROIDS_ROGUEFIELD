import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AAAHudLayout } from '../../../src/modules/ui/AAAHudLayout.js';
import { shieldStatus } from '../../../src/modules/ui/TacticalHud.js';
import { getInstrument } from '../../../src/modules/ui/hud/instruments/registry.js';
import { runClock } from '../../../src/modules/ui/hud/instruments/run-info/instrument.js';
import { fakeDocument, fakeElement } from '../../__helpers__/fakeHudDom.js';

// A fresh instance of a model, mounted in a fake container.
function mount(slot, id) {
  const container = fakeElement();
  const screen = fakeElement();
  const model = Object.create(getInstrument(slot, id));
  model.mount(container, screen);
  const part = (selector) => container.querySelector(selector);
  const has = (selector, name) => part(selector).classList.contains(name);
  return { model, container, screen, part, has };
}

const SHIP = { x: 400, y: 300 };

describe('HUD instrument models', () => {
  beforeEach(() => {
    vi.stubGlobal('document', fakeDocument());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('run-info: wakes on a change, fades 4 s later; the clock ticking alone does not wake it', () => {
    const { model, part, has } = mount('run-info', 'instrument');
    const at = (now, kills, more = {}) =>
      model.update({
        now,
        clock: '',
        seconds: now / 1000,
        layer: 3,
        kills,
        combo: 0,
        multiplier: 1,
        ...more,
      });

    at(0, 10);
    expect(has('.ri', 'is-awake')).toBe(true);
    at(3900, 10);
    expect(has('.ri', 'is-awake')).toBe(true);
    at(4100, 10);
    expect(has('.ri', 'is-awake')).toBe(false);
    at(5000, 11);
    expect(has('.ri', 'is-awake')).toBe(true);
    expect(part('.ri-kills').textContent).toBe(11);

    at(9100, 11, { combo: 12, multiplier: 2 });
    expect(has('.ri-combo', 'is-hidden')).toBe(false);
    expect(part('.ri-combo').dataset.tier).toBe('boss');
    expect(part('.ri-combo-num').textContent).toBe('x12');
    expect(part('.ri-layer').textContent).toBe('LAYER 3');
    expect([runClock(582), runClock(3725)]).toEqual(['09:42', '1:02:05']);
  });

  it('xp: "LV n" and the gold line filled to the XP toward the next level', () => {
    const { model, part } = mount('xp', 'instrument');
    model.update({ level: 14, current: 600, required: 1000, layer: 7 });
    expect(part('.xpl-lv b').textContent).toBe(14);
    expect(part('.xpl-bar i').style.transform).toBe('scaleX(0.600)');
  });

  it('build: the family track fills from the run, notches the evolution at 3 and ends at the Apex', () => {
    const { model, part, container } = mount('build', 'instrument');
    const cells = container.querySelectorAll('.bd-cell');
    const at = (families, evolutions = [], weaponId = 'lance') =>
      model.update({
        now: 0,
        weapon: {
          weaponId,
          name: 'Lance',
          chip: 'LANCE',
          evolutions,
        },
        families,
        spreadMode: 'concentrated',
        aimMode: 'auto',
        buffs: [],
        beams: 0,
      });

    at({});
    expect(part('.bd-name').textContent).toBe('LANCE');
    expect(part('.bd-track').classList.contains('is-hidden')).toBe(true);

    at({ thermal: 2, kinetic: 1, maneuver: 4 });
    expect(part('.bd-track').classList.contains('is-hidden')).toBe(false);
    expect(part('.bd-family').textContent).toBe('THERMAL');
    expect(cells.slice(0, 3).map((c) => c.classList.contains('is-on'))).toEqual(
      [true, true, false]
    );
    expect(cells[2].classList.contains('is-next')).toBe(true);
    expect(part('.bd-evo').textContent).toBe('Incendiary at 3');
    expect(part('.bd-apex').textContent).toBe('Apex 2/5');

    at({ thermal: 3 }, [{ family: 'thermal', id: 'incendiary', apex: false }]);
    expect(part('.bd-evo').textContent).toBe('Incendiary');
    expect(part('.bd-evo').classList.contains('is-on')).toBe(true);

    at({ thermal: 5 }, [{ family: 'thermal', id: 'solar-flare', apex: true }]);
    expect(part('.bd-evo').textContent).toBe('Solar Flare');
    expect(part('.bd-apex').textContent).toBe('Apex 5/5');
    expect(part('.bd-track').classList.contains('is-apex')).toBe(true);
    expect(part('.bd-modes').textContent).toBe('AIM AUTO · SPREAD CONC');

    // A weapon with its own forms names them on its card's family.
    at({ arc: 2 }, [], 'arc-caster');
    expect(part('.bd-evo').textContent).toBe('Forked Arc at 3');
    at(
      { arc: 5 },
      [{ family: 'arc', id: 'storm-crown', apex: true }],
      'arc-caster'
    );
    expect(part('.bd-evo').textContent).toBe('Storm Crown');
  });

  it('recharges: the dash arc shows while it recharges and pulses 0.5 s once ready', () => {
    const { model, part, has } = mount('recharges', 'instrument');
    const at = (now, dash, ship = SHIP) =>
      model.update({ now, ship, dash, shield: 0 });

    at(0, 0);
    expect(has('.rc-dash', 'is-on')).toBe(false);
    at(10, 0.5);
    expect(has('.rc-dash', 'is-on')).toBe(true);
    expect(part('.rc-fill').attributes['stroke-dasharray']).toBe('0.5 1');
    at(100, 0);
    expect(has('.rc-dash', 'is-ready')).toBe(true);
    expect(part('.rc-fill').attributes['stroke-dasharray']).toBe('1 1');
    at(590, 0);
    expect(has('.rc-dash', 'is-on')).toBe(true);
    at(610, 0);
    expect(has('.rc-dash', 'is-on')).toBe(false);
    expect(has('.rc-dash', 'is-ready')).toBe(false);
    // Sized in screen pixels at the ship's screen point; no ship, no arcs.
    expect(part('.rc').style.left).toBe('50.00%');
    at(700, 0, null);
    expect(has('.rc', 'is-hidden')).toBe(true);
  });

  it('hull ring: round the ship 2 s after a hit (the hit in red), always below 30 %, a glitch below 15 %', () => {
    const { model, container, has } = mount('hull-ring', 'instrument');
    const lost = container.querySelectorAll('.hr-lost');
    const at = (now, hull) =>
      model.update({ now, ship: SHIP, hull, maxHull: 100 });

    at(0, 80);
    expect(has('.hr', 'is-ring')).toBe(false);
    at(100, 70);
    expect(has('.hr', 'is-ring')).toBe(true);
    // The eighth segment (70–80 %) is what the hit took.
    expect(lost[7].attributes['stroke-dasharray']).toBe('0 0.000 1.000 1');
    expect(lost[6].attributes['stroke-dasharray']).toBe('0 1');
    at(2050, 70);
    expect(has('.hr', 'is-ring')).toBe(true);
    at(2200, 70);
    expect(has('.hr', 'is-ring')).toBe(false);
    expect(lost[7].attributes['stroke-dasharray']).toBe('0 1');

    at(3000, 25);
    at(9000, 25);
    expect(has('.hr', 'is-ring')).toBe(true);
    expect(has('.hr', 'is-low')).toBe(true);
    expect(has('.hr', 'is-glitching')).toBe(false);
    at(9100, 12);
    expect(has('.hr', 'is-glitching')).toBe(true);
    at(9600, 12);
    expect(has('.hr', 'is-glitching')).toBe(false);
    at(9700, 0);
    expect(has('.hr', 'is-ring')).toBe(false);
    expect(has('.hr', 'is-low')).toBe(false);
  });

  it('on the ship: each drawn frame moves the hull ring and the recharges onto the ship as drawn, their state kept', () => {
    const hud = new AAAHudLayout();
    const ring = mount('hull-ring', 'instrument');
    const recharges = mount('recharges', 'instrument');
    hud._instruments = new Map([
      ['hull-ring', ring.model],
      ['recharges', recharges.model],
    ]);
    const ship = (hull) =>
      hud.updateShip({ hull, maxHull: 100, ship: SHIP, dash: 0.5 });

    ship(100);
    ship(70);
    hud.placeOnShip({ x: 200, y: 450 });
    expect(ring.part('.hr-ring').style.left).toBe('25.00%');
    expect(ring.part('.hr-ring').style.top).toBe('75.00%');
    expect(recharges.part('.rc').style.left).toBe('25.00%');
    expect(recharges.part('.rc').style.top).toBe('75.00%');
    expect(ring.has('.hr', 'is-ring')).toBe(true);
    expect(recharges.has('.rc-dash', 'is-on')).toBe(true);
    // no ship drawn: no ring, no arcs
    hud.placeOnShip(null);
    expect(ring.has('.hr', 'is-ring')).toBe(false);
    expect(recharges.has('.rc', 'is-hidden')).toBe(true);
  });

  it('warden: one bar split at its phases, draining right to left, "PHASE n/m", hits flash', () => {
    const { model, part, has } = mount('warden', 'instrument');
    const at = (now, percent, more = {}) =>
      model.update({
        now,
        active: true,
        shown: true,
        name: 'Warden Prime',
        percent,
        phase: 1,
        phaseCount: 3,
        phaseColors: [],
        invulnerable: false,
        herald: false,
        marker: null,
        ...more,
      });

    at(0, 50);
    const segs = part('.wd-segs');
    expect(segs.style.gridTemplateColumns).toBe('33fr 33fr 34fr');
    const widths = () =>
      segs.children.map((seg) => seg.children[0].style.width);
    expect(widths()).toEqual(['100%', '51.52%', '0%']);
    expect(part('.wd-phase').textContent).toBe('PHASE 2/3');
    expect(has('.wd', 'is-on')).toBe(true);

    at(10, 45);
    expect(has('.wd', 'is-hit')).toBe(true);
    at(200, 45);
    expect(has('.wd', 'is-hit')).toBe(false);

    at(300, 45, { shown: false });
    expect(has('.wd', 'is-on')).toBe(false);

    at(400, 80, { herald: true, phase: 0, phaseCount: 1 });
    expect(has('.wd', 'is-herald')).toBe(true);
    expect(part('.wd-phase').textContent).toBe('');
    expect(segs.children).toHaveLength(1);
  });

  it('warden: the Warden off screen gets its edge marker with the distance, not an edge arrow', () => {
    const hud = new AAAHudLayout();
    hud.els = { direction: fakeElement() };
    hud._createDirectionPools();
    const { model, screen } = mount('warden', 'instrument');
    hud._instruments = new Map([['warden', model]]);

    hud.updateEdgeArrows([
      { kind: 'warden', x: 1400, y: 300, distance: 783 },
      { kind: 'pickup', x: -60, y: 320, color: '#bcff00' },
    ]);
    const arrows = hud._arrowPool.filter(
      ({ el }) => el.style.display !== 'none'
    );
    expect(arrows.map(({ el }) => el.dataset.kind)).toEqual(['pickup']);

    hud.updateBoss(true, 'Warden Prime', 60, { phase: 0, phaseCount: 3 });
    const [marker] = screen.children;
    expect(marker.classList.contains('is-on')).toBe(true);
    expect(marker.dataset.edge).toBe('right');
    expect(marker.querySelector('.wd-dist').textContent).toBe('780 m');

    // A drawn frame moves it at once (TacticalHud.placeOnField), paused too.
    hud.updateEdgeArrows([{ kind: 'warden', x: 400, y: 300, distance: 200 }]);
    expect(marker.classList.contains('is-on')).toBe(false);
  });

  it('vitals: locked, ready (with the bound key and the install light), active and cooldown from the shield', () => {
    const { model, part, has } = mount('vitals', 'instrument');
    const state = (now, shieldMode, more = {}) =>
      model.update({
        now,
        shield: 0,
        maxShield: 50,
        hull: 72,
        maxHull: 100,
        shieldMode,
        shieldSeconds: 0,
        shieldCooldown: 0,
        shieldKey: '',
        ...more,
      });

    state(0, 'locked');
    expect(part('.vt').dataset.state).toBe('locked');
    expect(part('.vt-shield-value b').textContent).toBe('');
    expect(part('.vt-hull-value b').textContent).toBe('72');
    expect(part('.vt-hull-clip').attributes.width).toBe('256.32');

    // The shield card is taken: the outline lights once and E ACTIVATE shows.
    state(100, 'ready', { shield: 50, shieldKey: 'Q' });
    expect(part('.vt').dataset.state).toBe('ready');
    expect(has('.vt', 'is-installing')).toBe(true);
    expect(part('.vt-activation kbd').textContent).toBe('Q');
    expect(part('.vt-shield-value b').textContent).toBe('READY');
    state(800, 'ready', { shield: 50, shieldKey: 'Q' });
    expect(has('.vt', 'is-installing')).toBe(false);

    state(900, 'active', { shield: 30 });
    expect(part('.vt').dataset.state).toBe('active');
    expect(part('.vt-shield-value b').textContent).toBe('60');
    expect(part('.vt-shield-value .vt-unit').textContent).toBe('%');
    expect(part('.vt-shield-clip').attributes.width).toBe('240');

    state(1000, 'cooldown', { shieldSeconds: 9.43, shieldCooldown: 0.6 });
    expect(part('.vt').dataset.state).toBe('cooldown');
    expect(part('.vt-shield-value b').textContent).toBe('9.4');
    expect(part('.vt-shield-value .vt-unit').textContent).toBe('s');
    expect(part('.vt-cooling-fill').style.width).toBe('40%');
    expect(has('.vt', 'is-installing')).toBe(false);

    state(1100, 'cooldown', { hull: 25, shieldSeconds: 9.3 });
    expect(has('.vt', 'is-critical')).toBe(true);
  });

  it('vitals: a hull hit leaves a white chip that holds, then drains into the cells', () => {
    const { model, part } = mount('vitals', 'instrument');
    const at = (now, hull) =>
      model.update({
        now,
        shield: 0,
        maxShield: 1,
        hull,
        maxHull: 100,
        shieldMode: 'locked',
        shieldSeconds: 0,
        shieldCooldown: 0,
        shieldKey: '',
      });
    const chip = () => Number(part('.vt-chip-clip').attributes.width);

    at(0, 80);
    expect(chip()).toBeCloseTo(284.8);
    at(100, 60);
    expect(chip()).toBeCloseTo(284.8);
    at(350, 60);
    expect(chip()).toBeCloseTo(284.8);
    at(500, 60);
    expect(chip()).toBeLessThan(284.8);
    expect(chip()).toBeGreaterThan(213.6);
    at(2000, 60);
    expect(chip()).toBeCloseTo(213.6);
  });

  it("vitals: the shield's state is read from the deflector as it runs", () => {
    expect(shieldStatus(undefined).mode).toBe('locked');
    expect(shieldStatus({ shieldUpgradeLevel: 0 }).mode).toBe('locked');
    const deflector = {
      shieldUpgradeLevel: 1,
      isShieldActive: false,
      shieldCooldownTimer: 0,
    };
    expect(shieldStatus(deflector).mode).toBe('ready');
    expect(shieldStatus({ ...deflector, isShieldActive: true }).mode).toBe(
      'active'
    );
    expect(shieldStatus({ ...deflector, shieldCooldownTimer: 7.5 })).toEqual({
      mode: 'cooldown',
      seconds: 7.5,
    });
  });
});

describe('HUD feed models', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('document', fakeDocument());
    vi.stubGlobal('window', {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (id) => clearTimeout(id),
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const kill = (row) => {
    row.count += 1;
    row.label.textContent = 'Drone';
  };

  it('instrument feed: full on a new row, 35 % 4 s after the last one, rows gone after 6 s', () => {
    const { model, part } = mount('feed', 'instrument');
    const list = part('.ins-feed');
    model.push('kill:Drone', 'kill', kill);
    expect(list.classList.contains('is-awake')).toBe(true);
    vi.advanceTimersByTime(3900);
    model.push('kill:Drone', 'kill', kill);
    vi.advanceTimersByTime(3900);
    expect(list.classList.contains('is-awake')).toBe(true);
    vi.advanceTimersByTime(200);
    expect(list.classList.contains('is-awake')).toBe(false);
    expect(list.children).toHaveLength(1);
    expect(model.rows[0].count).toBe(2);
    vi.advanceTimersByTime(2000);
    expect(list.children).toHaveLength(0);
  });

  it('classic feed: a row leaves after 1.6 s', () => {
    const { model, part } = mount('feed', 'classic');
    model.push('kill:Drone', 'kill', kill);
    expect(part('.hud-feed').children).toHaveLength(1);
    vi.advanceTimersByTime(1650);
    expect(part('.hud-feed').children).toHaveLength(0);
  });
});
