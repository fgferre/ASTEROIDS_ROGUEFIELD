import { IS_DEV } from '../../core/env.js';

// Development only: the last lines in memory, a ring that drops the oldest,
// saved to a file on request (GameDebugLogger.download() in the console).
// Until 26/11/2026 every line was also written to localStorage each second.
const MAX_LOG_ENTRIES = 50000;
const OLD_STORAGE_KEY = 'game-debug-log';

const safeStringify = (value) => {
  if (value === undefined) {
    return '';
  }

  try {
    if (typeof value === 'string') {
      return value;
    }

    return JSON.stringify(value);
  } catch (error) {
    return `[unserializable: ${error?.message || 'unknown error'}]`;
  }
};

export class GameDebugLogger {
  static isEnabled = false;
  static entries = [];
  static next = 0;
  static sessionStart = null;

  static init() {
    if (this.isEnabled) {
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    if (!IS_DEV) {
      return;
    }

    this.isEnabled = true;
    this.entries = [];
    this.next = 0;
    this.sessionStart = Date.now();
    window.GameDebugLogger = this;

    // The copy an older build left in this browser (it filled the origin's
    // quota with up to 50,000 lines).
    try {
      window.localStorage?.removeItem(OLD_STORAGE_KEY);
    } catch {
      // Site data blocked: nothing was written there either.
    }

    this.log('INIT', 'GameDebugLogger initialized');
  }

  static getTimestamp() {
    if (!this.sessionStart) {
      return '00:00.000';
    }

    const elapsed = Date.now() - this.sessionStart;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    const milliseconds = elapsed % 1000;

    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    const ms = String(milliseconds).padStart(3, '0');

    return `${mm}:${ss}.${ms}`;
  }

  static log(category, message, data = undefined) {
    if (!this.isEnabled) {
      return;
    }

    const timestamp = this.getTimestamp();
    const normalizedCategory = category || 'LOG';
    const safeMessage =
      typeof message === 'string' ? message : safeStringify(message);
    const hasData =
      data !== undefined &&
      data !== null &&
      (typeof data !== 'object' || Object.keys(data).length > 0);
    const serializedData = hasData ? ` - ${safeStringify(data)}` : '';
    const entry = `[${timestamp}] [${normalizedCategory}] ${safeMessage}${serializedData}`;

    if (this.entries.length < MAX_LOG_ENTRIES) {
      this.entries.push(entry);
    } else {
      this.entries[this.next] = entry;
    }
    this.next = (this.next + 1) % MAX_LOG_ENTRIES;
  }

  static getLogContent() {
    if (!this.isEnabled) {
      return '';
    }

    // Oldest first: once the ring is full it starts at the next slot.
    return [
      ...this.entries.slice(this.next),
      ...this.entries.slice(0, this.next),
    ].join('\n');
  }

  static download() {
    if (!this.isEnabled) {
      console.warn('[GameDebugLogger] download() called while logger disabled');
      return;
    }

    const content = this.getLogContent();
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'game-debug.log';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();

    setTimeout(() => {
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    }, 0);
  }

  static clear() {
    if (!this.isEnabled) {
      return;
    }

    this.entries = [];
    this.next = 0;
    this.sessionStart = Date.now();
    this.log('STATE', 'Debug log cleared');
  }
}
