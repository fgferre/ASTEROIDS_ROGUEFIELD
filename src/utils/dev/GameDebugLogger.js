const MAX_LOG_ENTRIES = 50000;
const TRIM_BATCH_SIZE = 10000;
const STORAGE_KEY = 'game-debug-log';

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
  static sessionStart = null;

  static init() {
    if (this.isEnabled) {
      return;
    }

    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return;
    }

    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    this.isEnabled = true;
    this.entries = [];
    this.sessionStart = Date.now();

    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('[GameDebugLogger] Failed to clear previous log', error);
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
    const safeMessage = typeof message === 'string' ? message : safeStringify(message);
    const hasData = data !== undefined && data !== null && (typeof data !== 'object' || Object.keys(data).length > 0);
    const serializedData = hasData ? ` - ${safeStringify(data)}` : '';
    const entry = `[${timestamp}] [${normalizedCategory}] ${safeMessage}${serializedData}`;

    this.entries.push(entry);

    if (this.entries.length > MAX_LOG_ENTRIES) {
      const removed = this.entries.splice(0, TRIM_BATCH_SIZE);
      const trimmedEntry = `[${this.getTimestamp()}] [TRIMMED] Removed ${removed.length} oldest entries`;
      this.entries.unshift(trimmedEntry);
    }

    this.persist();
  }

  static persist() {
    if (!this.isEnabled) {
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, this.entries.join('\n'));
    } catch (error) {
      console.warn('[GameDebugLogger] Failed to persist log to localStorage', error);
    }
  }

  static getLogContent() {
    if (!this.isEnabled) {
      return '';
    }

    return this.entries.join('\n');
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
    this.sessionStart = Date.now();

    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('[GameDebugLogger] Failed to clear localStorage log', error);
    }

    this.log('STATE', 'Debug log cleared');
  }
}

