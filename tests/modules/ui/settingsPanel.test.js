import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomStubs } from '../../__helpers__/headlessGame.js';
import { SettingsPanel } from '../../../src/modules/ui/SettingsPanel.js';
import SETTINGS_SCHEMA from '../../../src/data/settingsSchema.js';
import { settingPreview } from '../../../src/modules/ui/settingsPreview.js';

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
    set innerHTML(_value) {
      this.children = [];
    },
  };
}

const defaultsOf = (category) =>
  Object.fromEntries(category.fields.map((f) => [f.key, f.default]));

function renderCategory(category) {
  const container = fakeElement('div');
  const panel = new SettingsPanel({
    refs: { container },
    settings: { getCategoryValues: () => defaultsOf(category) },
    schema: SETTINGS_SCHEMA,
    livePreset: () => null,
  });
  panel.renderSettingsPanel(category.id);
  return container.children;
}

describe('Settings panel', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
    document.createElement = fakeElement;
    document.createTextNode = (text) => ({ textContent: text });
  });
  afterEach(() => restoreDom());

  it('renders every schema key in its section, none lost', () => {
    SETTINGS_SCHEMA.forEach((category) => {
      const rendered = renderCategory(category)
        .filter((node) => node.dataset?.settingKey)
        .map((node) => node.dataset.settingKey);
      expect(rendered).toEqual(category.fields.map((field) => field.key));
    });
  });

  it('shows quality and camera as segmented choices with a live preview', () => {
    const graphics = SETTINGS_SCHEMA.find((c) => c.id === 'graphics');
    const fields = renderCategory(graphics);
    const quality = fields.find((n) => n.dataset?.settingKey === 'quality');
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
    const camera = fields.find((n) => n.dataset?.settingKey === 'cameraMode');
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
    expect(
      settingPreview('bloom', true, { postProcessing: false })
    ).toMatchObject({ glow: false });
    expect(settingPreview('masterVolume', 1)).toBeNull();
  });

  it('closes on Esc when opened from the menu, not over pause or mid-binding', () => {
    const escFor = (state) => {
      const panel = new SettingsPanel({ schema: SETTINGS_SCHEMA });
      Object.assign(panel.settingsState, { isOpen: true, ...state });
      panel.closeSettingsPanel = vi.fn();
      panel.handleSettingsKeyDown({ key: 'Escape', preventDefault() {} });
      return panel.closeSettingsPanel.mock.calls.length;
    };
    expect(escFor({ source: 'menu' })).toBe(1);
    expect(escFor({ source: 'pause' })).toBe(0);
    expect(escFor({ source: 'menu', capture: { device: 'keyboard' } })).toBe(0);
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
