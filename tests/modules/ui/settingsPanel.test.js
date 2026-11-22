import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomStubs } from '../../__helpers__/headlessGame.js';
import { SettingsPanel } from '../../../src/modules/ui/SettingsPanel.js';
import SETTINGS_SCHEMA from '../../../src/data/settingsSchema.js';
import { settingPreview } from '../../../src/modules/ui/settingsPreview.js';
import SettingsSystem from '../../../src/modules/SettingsSystem.js';
import { EventBus } from '../../../src/core/EventBus.js';
import { SETTINGS_SECTIONS } from '../../../src/modules/ui/settings/settingsGroups.js';

// Just enough DOM for the settings renderer: elements with children,
// dataset, attributes and a class-name querySelector.
function fakeElement(tag) {
  return {
    tagName: tag.toUpperCase(),
    children: [],
    dataset: {},
    attributes: {},
    className: '',
    textContent: '',
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    querySelector(selector) {
      const className = selector.slice(1);
      const visit = (node) => {
        for (const child of node.children ?? []) {
          if (child.className?.split(' ').includes(className)) return child;
          const found = visit(child);
          if (found) return found;
        }
        return null;
      };
      return visit(this);
    },
    querySelectorAll() {
      return [];
    },
    set innerHTML(_value) {
      this.children = [];
    },
  };
}

const SECTION_IDS = SETTINGS_SECTIONS.map((section) => section.id);

// Every settings row of a rendered section, however deep (groups, folds).
function rowsOf(node, rows = []) {
  for (const child of node.children ?? []) {
    if (child.className?.split(' ').includes('settings-field')) {
      rows.push(child);
    }
    rowsOf(child, rows);
  }
  return rows;
}

// `changes`: [category, key, value] set before the section is drawn.
function renderSection(sectionId, callbacks = {}, changes = []) {
  const container = fakeElement('div');
  const settings = new SettingsSystem({ eventBus: new EventBus() });
  changes.forEach(([category, key, value]) =>
    settings.setSetting(category, key, value)
  );
  const panel = new SettingsPanel({
    refs: { container },
    settings,
    schema: SETTINGS_SCHEMA,
    livePreset: () => null,
    ...callbacks,
  });
  panel.renderSettingsPanel(sectionId);
  const rows = rowsOf(container);
  const row = (key) => rows.find((node) => node.dataset.settingKey === key);
  return { panel, settings, rows, row };
}

const isGreyed = (row) => row.className.split(' ').includes('is-inactive');
const reasonOf = (row) =>
  row.querySelector('.settings-field__description').textContent;

describe('Settings panel', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
    document.createElement = fakeElement;
    document.createTextNode = (text) => ({ textContent: text });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    restoreDom();
  });

  it('shows every visible schema field exactly once across the six sections', () => {
    const shown = SECTION_IDS.flatMap((id) =>
      renderSection(id).rows.map(
        (row) => `${row.dataset.settingCategory}.${row.dataset.settingKey}`
      )
    );
    const visible = SETTINGS_SCHEMA.flatMap((category) =>
      category.fields
        .filter((field) => !field.hidden)
        .map((field) => `${category.id}.${field.key}`)
    );
    expect(SECTION_IDS).toHaveLength(6);
    expect(visible).toHaveLength(44);
    expect([...shown].sort()).toEqual([...visible].sort());
  });

  it('keeps the hull out of the panel while the setting still defaults and validates', () => {
    const rendered = SECTION_IDS.flatMap((id) =>
      renderSection(id).rows.map((row) => row.dataset.settingKey)
    );
    expect(rendered).not.toContain('selectedHull');

    const settings = new SettingsSystem({ eventBus: new EventBus() });
    expect(settings.getSetting('gameplay', 'selectedHull')).toBe(
      'default-hull'
    );
    settings.setSetting('gameplay', 'selectedHull', 'bastion');
    settings.resetCategory('gameplay');
    settings.resetAll();
    expect(settings.getSetting('gameplay', 'selectedHull')).toBe('bastion');
    settings.setSetting('gameplay', 'selectedHull', 'no-such-hull');
    expect(settings.getSetting('gameplay', 'selectedHull')).toBe(
      'default-hull'
    );
  });

  it('shows quality and camera as segmented choices with a live preview', () => {
    const quality = renderSection('graphics').row('quality');
    const segments = quality.querySelector('.settings-segmented').children;

    expect(segments.map((s) => s.dataset.segmentValue)).toEqual([
      'auto',
      'ultra',
      'high',
      'medium',
      'low',
    ]);
    expect(segments[0].attributes['aria-pressed']).toBe('true');
    expect(quality.querySelector('.settings-preview')).not.toBeNull();
    const camera = renderSection('game').row('cameraMode');
    expect(camera.querySelector('.settings-segmented').children).toHaveLength(
      2
    );
  });

  it("explains each quality preset from qualityPresets.js and Auto's pick", () => {
    const low = settingPreview('quality', 'low').text;
    expect(low).toMatch(/^Low: Bloom 70% · SMAA off · impact flash off/);
    expect(low).toContain('shadows off · 48 debris · 1× resolution');
    expect(
      settingPreview('quality', 'auto', { livePreset: 'medium' }).text
    ).toMatch(/^Auto: Running Medium, one step down below 50 fps\. Bloom 85%/);
    expect(settingPreview('bloom', true)).toMatchObject({ glow: true });
    expect(settingPreview('bloom', false)).toMatchObject({ glow: false });
    expect(settingPreview('masterVolume', 1)).toBeNull();
  });

  it('names the thumb, not keys, under Hull Control by touch', () => {
    expect(settingPreview('hullControl', 'classic').text).toMatch(/A\/D/);
    vi.stubGlobal('document', { body: { dataset: { inputDevice: 'touch' } } });
    expect(settingPreview('hullControl', 'classic').text).toMatch(/thumb/);
    expect(settingPreview('hullControl', 'modern').text).not.toMatch(/WASD/);
    vi.unstubAllGlobals();
  });

  it('resets exactly what the section shows, bindings included', () => {
    const { panel, settings } = renderSection('game');
    settings.setSetting('graphics', 'cameraMode', 'classic');
    settings.setSetting('controls', 'cameraLead', 'hull');
    settings.setSetting('graphics', 'quality', 'low');
    settings.setSetting('controls', 'vibration', false);

    panel.resetActiveSection();

    expect(settings.getSetting('graphics', 'cameraMode')).toBe('dynamic');
    expect(settings.getSetting('controls', 'cameraLead')).toBe('aim');
    expect(settings.getSetting('graphics', 'quality')).toBe('low');
    expect(settings.getSetting('controls', 'vibration')).toBe(false);

    const moved = { keyboard: ['KeyJ'], gamepad: [] };
    settings.setSetting('controls', 'dash', moved);
    panel.settingsState.activeSection = 'controls';
    panel.resetActiveSection();
    expect(settings.getSetting('controls', 'dash')).not.toEqual(moved);
    expect(settings.getSetting('controls', 'vibration')).toBe(true);
    expect(settings.getSetting('graphics', 'quality')).toBe('low');
  });

  it("a Controls change from the game redraws keeping the pad's focus on its choice", () => {
    const { panel } = renderSection('controls');
    panel.settingsState.isOpen = true;
    const keep = vi.spyOn(panel, 'redrawKeepingFocus');
    panel.refreshCategory('controls');
    expect(keep).toHaveBeenCalledOnce();
  });

  it('greys Camera Lead with the Classic camera, with its reason', () => {
    expect(isGreyed(renderSection('game').row('cameraLead'))).toBe(false);

    const { row } = renderSection('game', {}, [
      ['graphics', 'cameraMode', 'classic'],
    ]);
    expect(isGreyed(row('cameraLead'))).toBe(true);
    expect(reasonOf(row('cameraLead'))).toBe('Only with the Dynamic camera.');
  });

  it('greys the four effects when Post-Processing is off', () => {
    const { row } = renderSection('graphics', {}, [
      ['graphics', 'postProcessing', false],
    ]);

    ['bloom', 'bloomIntensity', 'chromaticAberration', 'antialiasing'].forEach(
      (key) => {
        expect(isGreyed(row(key))).toBe(true);
        expect(reasonOf(row(key))).toBe('Needs Post-Processing.');
      }
    );
    expect(isGreyed(row('postProcessing'))).toBe(false);
    expect(isGreyed(row('quality'))).toBe(false);
  });

  it('greys Hull Control in the new flight and shows the flight in use', () => {
    const { row } = renderSection('controls', {}, [
      ['controls', 'hullControl', 'modern'],
    ]);
    const walk = (node) => [node, ...(node.children || []).flatMap(walk)];
    const pressed = walk(row('hullControl')).filter(
      (node) =>
        node.dataset?.segmentValue && node.attributes['aria-pressed'] === 'true'
    );
    expect(isGreyed(row('hullControl'))).toBe(true);
    expect(pressed.map((node) => node.dataset.segmentValue)).toEqual([
      'classic',
    ]);
  });

  it('shows Hit Markers in HUD & text, live, and no Damage Numbers row', () => {
    const { row } = renderSection('hud');
    expect(row('damageNumbers')).toBeUndefined();
    expect(row('hitMarkers')).toBeDefined();
    expect(isGreyed(row('hitMarkers'))).toBe(false);
  });

  it('greys Difficulty while a Pressure rung is on', () => {
    expect(
      isGreyed(
        renderSection('game', {
          getService: () => ({ getPressure: () => 0 }),
        }).row('difficulty')
      )
    ).toBe(false);
    const { row } = renderSection('game', {
      getService: () => ({ getPressure: () => 1 }),
    });
    expect(isGreyed(row('difficulty'))).toBe(true);
    expect(reasonOf(row('difficulty'))).toMatch(/^Pressure I is on/);
  });

  it('closes on Esc from every screen, but not during binding capture', () => {
    const escFor = (state) => {
      const panel = new SettingsPanel({ schema: SETTINGS_SCHEMA });
      Object.assign(panel.settingsState, { isOpen: true, ...state });
      panel.closeSettingsPanel = vi.fn();
      const event = {
        key: 'Escape',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };
      panel.handleSettingsKeyDown(event);
      return panel.closeSettingsPanel.mock.calls.length;
    };
    expect(escFor({ source: 'menu' })).toBe(1);
    expect(escFor({ source: 'pause' })).toBe(1);
    expect(escFor({ source: 'playing' })).toBe(1);
    expect(escFor({ source: 'menu', capture: { device: 'keyboard' } })).toBe(0);
  });

  it('resumes only a run that Settings paused itself when closing', () => {
    vi.stubGlobal('HTMLElement', class {});
    const panel = Object.create(SettingsPanel.prototype);
    const emit = vi.fn();
    Object.assign(panel, {
      settingsState: { isOpen: true, source: 'playing', previousFocus: null },
      refs: {
        overlay: {
          classList: { add: vi.fn() },
          setAttribute: vi.fn(),
        },
      },
      emit,
      announceVisibility: vi.fn(),
      cancelBindingCapture: vi.fn(),
    });

    panel.closeSettingsPanel();
    expect(emit).toHaveBeenCalledWith('toggle-pause');

    emit.mockClear();
    panel.settingsState = {
      isOpen: true,
      source: 'pause',
      previousFocus: null,
    };
    panel.closeSettingsPanel();
    expect(emit).not.toHaveBeenCalled();

    panel.settingsState = {
      isOpen: true,
      source: 'playing',
      previousFocus: null,
    };
    panel.closeSettingsPanel({ resumeRun: false });
    expect(emit).not.toHaveBeenCalled();
  });

  it('closes from the mouse button through the same state-aware path', () => {
    let click;
    const closeButton = {
      addEventListener(type, handler) {
        if (type === 'click') click = handler;
      },
    };
    const panel = new SettingsPanel({
      refs: {
        overlay: {
          addEventListener: vi.fn(),
          classList: { contains: () => false },
        },
        closeButtons: [closeButton],
      },
    });
    panel.settingsState.isOpen = true;
    panel.settingsState.source = 'playing';
    panel.closeSettingsPanel = vi.fn();
    panel.bindSettingsControls();

    click({ preventDefault: vi.fn() });

    expect(panel.closeSettingsPanel).toHaveBeenCalledOnce();
  });
});

describe('Accessibility settings on the page', () => {
  const fakeNode = () => {
    const classes = new Set();
    return {
      dataset: {},
      style: {
        setProperty(name, value) {
          this[name] = value;
        },
      },
      classList: {
        toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
        contains: (name) => classes.has(name),
      },
    };
  };
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
    document.body = fakeNode();
    document.documentElement = fakeNode();
  });
  afterEach(() => restoreDom());

  it('sets text scale, contrast, flashing and subtitle hooks, and clears them live', () => {
    const panel = new SettingsPanel({ schema: SETTINGS_SCHEMA });
    const apply = (values) => panel.applyAccessibilitySettings(values);
    const { body, documentElement: root } = document;

    apply({
      textScale: '1.3',
      highContrastHud: true,
      reduceFlashing: true,
      largeSubtitles: true,
    });
    expect(root.style['--text-scale']).toBe('1.3');
    expect(root.dataset.contrast).toBe('high');
    expect(body.classList.contains('hud-high-contrast')).toBe(true);
    expect(body.classList.contains('flashing-reduced')).toBe(true);
    expect(body.classList.contains('subtitles-large')).toBe(true);

    apply({ textScale: '1' });
    expect(root.style['--text-scale']).toBe('1');
    expect(root.dataset.contrast).toBe('normal');
    expect(body.classList.contains('flashing-reduced')).toBe(false);
    expect(body.classList.contains('subtitles-large')).toBe(false);
  });

  it('offers the four text sizes as a segmented choice in Accessibility', () => {
    const accessibility = SETTINGS_SCHEMA.find((c) => c.id === 'accessibility');
    const field = accessibility.fields.find((f) => f.key === 'textScale');
    expect(field.options.map(Number)).toEqual([0.9, 1, 1.15, 1.3]);
    expect(field.options.map((o) => field.optionLabels[o])).toEqual([
      '90%',
      '100%',
      '115%',
      '130%',
    ]);
  });
});

describe('Fullscreen setting', () => {
  let restoreDom;
  let settings;
  let panel;
  let page;
  let leaveFullscreen;

  // The page as the browser has it: a request (or exit) resolves and fires
  // fullscreenchange; `refuse` makes the request fail like a blocked one.
  const boot = (stored, { refuse = false } = {}) => {
    if (stored !== undefined) {
      localStorage.setItem(
        'astro:settings:v1',
        JSON.stringify({ video: { fullscreen: stored } })
      );
    }
    const listeners = {};
    const documentElement = {
      dataset: {},
      style: { setProperty() {} },
      requestFullscreen: vi.fn(async () => {
        if (refuse) throw new Error('blocked');
        document.fullscreenElement = documentElement;
        listeners.fullscreenchange();
      }),
    };
    page = documentElement;
    Object.assign(document, {
      documentElement,
      body: { classList: { toggle() {} } },
      fullscreenElement: null,
      addEventListener: (type, handler) => {
        listeners[type] = handler;
      },
      exitFullscreen: vi.fn(async () => {
        document.fullscreenElement = null;
        listeners.fullscreenchange();
      }),
    });
    leaveFullscreen = () => document.exitFullscreen();

    const eventBus = new EventBus();
    settings = new SettingsSystem({ eventBus });
    panel = new SettingsPanel({
      refs: {},
      settings,
      schema: SETTINGS_SCHEMA,
      setHudBaseScale() {},
    });
    eventBus.on('settings-changed', (change) =>
      panel.handleSettingsChange(change)
    );
    panel.bindSettingsControls();
    panel.bootstrapSettingsState();
  };
  const shown = () => settings.getSetting('video', 'fullscreen');
  const settle = () => new Promise((resolve) => setTimeout(resolve));

  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => restoreDom());

  it('asks the browser once when the toggle goes on, and stays on', async () => {
    boot();
    settings.setSetting('video', 'fullscreen', true, { source: 'ui' });
    await settle();

    expect(page.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(shown()).toBe(true);
  });

  it('shows off when the player leaves with Esc, without a new request', async () => {
    boot();
    settings.setSetting('video', 'fullscreen', true, { source: 'ui' });
    await settle();

    await leaveFullscreen();

    expect(shown()).toBe(false);
    expect(page.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('never asks at boot, and a saved "on" starts as off', async () => {
    boot(true);
    await settle();

    expect(page.requestFullscreen).not.toHaveBeenCalled();
    expect(shown()).toBe(false);
  });

  it('leaves the toggle off when the browser refuses', async () => {
    boot(undefined, { refuse: true });
    settings.setSetting('video', 'fullscreen', true, { source: 'ui' });
    await settle();

    expect(page.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(shown()).toBe(false);
  });

  it('exits when the toggle goes off, and the key flips it both ways', async () => {
    boot();
    panel.toggleFullscreen();
    await settle();
    expect(document.fullscreenElement).toBe(page);
    expect(shown()).toBe(true);

    panel.toggleFullscreen();
    await settle();
    expect(document.fullscreenElement).toBeNull();
    expect(shown()).toBe(false);
    expect(page.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
  });
});
