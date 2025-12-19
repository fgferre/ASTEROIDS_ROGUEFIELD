/* global gameServices */

/**
 * CommandQueueService stores input/command envelopes tagged by frame.
 *
 * Multiple producers can enqueue commands, and consumers can deterministically
 * drain them frame-by-frame. Optional hooks allow instrumentation without
 * coupling to specific metrics collectors.
 */
export default class CommandQueueService {
  constructor(options = {}) {
    const {
      capacity = 512,
      initialFrame = 0,
      frameSource = null,
      clock = null,
      hooks = null,
    } = options || {};

    this.capacity =
      Number.isFinite(capacity) && capacity > 0 ? Math.floor(capacity) : null;
    this.frameSource = typeof frameSource === 'function' ? frameSource : null;
    this.clock = typeof clock === 'function' ? clock : this.defaultClock;
    this.hooks = {
      onEnqueue:
        typeof hooks?.onEnqueue === 'function' ? hooks.onEnqueue : null,
      onConsume:
        typeof hooks?.onConsume === 'function' ? hooks.onConsume : null,
      onClear: typeof hooks?.onClear === 'function' ? hooks.onClear : null,
    };

    this.frameCounter = Number.isFinite(initialFrame) ? initialFrame : 0;
    this.lastConsumedFrame = this.frameCounter - 1;
    this.queue = [];
    this.nextId = 1;
    this.stats = {
      enqueued: 0,
      consumed: 0,
      cleared: 0,
      dropped: 0,
      lastFrameTagged: this.frameCounter,
    };
    this.nextDefaultFrame = this.frameCounter;

    if (
      typeof gameServices !== 'undefined' &&
      typeof gameServices.register === 'function'
    ) {
      gameServices.register('command-queue', this);
    }
  }

  defaultClock() {
    if (
      typeof performance !== 'undefined' &&
      typeof performance.now === 'function'
    ) {
      return performance.now();
    }

    return Date.now();
  }

  normalizeFrame(frameOverride) {
    if (Number.isFinite(frameOverride)) {
      this.frameCounter = Math.max(this.frameCounter, frameOverride);
      this.nextDefaultFrame = Math.max(this.nextDefaultFrame, frameOverride);
      return frameOverride;
    }

    if (this.frameSource) {
      try {
        const suppliedFrame = this.frameSource();
        if (Number.isFinite(suppliedFrame)) {
          this.frameCounter = Math.max(this.frameCounter, suppliedFrame);
          this.nextDefaultFrame = Math.max(
            this.nextDefaultFrame,
            suppliedFrame
          );
          return suppliedFrame;
        }
      } catch (error) {
        console.warn(
          '[CommandQueueService] frameSource threw an error:',
          error
        );
      }
    }

    const frame = this.nextDefaultFrame;
    this.frameCounter = Math.max(this.frameCounter, frame);
    return frame;
  }

  resolveConsumeFrame(frameOverride) {
    if (Number.isFinite(frameOverride)) {
      this.frameCounter = Math.max(this.frameCounter, frameOverride);
      this.nextDefaultFrame = Math.max(this.nextDefaultFrame, frameOverride);
      return frameOverride;
    }

    if (this.frameSource) {
      try {
        const suppliedFrame = this.frameSource();
        if (Number.isFinite(suppliedFrame)) {
          const normalized = Math.max(
            suppliedFrame,
            this.lastConsumedFrame + 1
          );
          this.frameCounter = Math.max(this.frameCounter, normalized);
          this.nextDefaultFrame = Math.max(this.nextDefaultFrame, normalized);
          return normalized;
        }
      } catch (error) {
        console.warn(
          '[CommandQueueService] frameSource threw an error during consume:',
          error
        );
      }
    }

    const nextFrame = this.lastConsumedFrame + 1;
    this.frameCounter = Math.max(this.frameCounter, nextFrame);
    this.nextDefaultFrame = Math.max(this.nextDefaultFrame, nextFrame);
    return nextFrame;
  }

  enqueue(command, metadata = {}) {
    if (!command || typeof command !== 'object') {
      throw new Error('[CommandQueueService] Cannot enqueue empty command');
    }

    const normalizedType =
      typeof command.type === 'string'
        ? command.type
        : typeof metadata.type === 'string'
          ? metadata.type
          : 'unknown';

    const frameTag = this.normalizeFrame(metadata.frame);
    this.stats.lastFrameTagged = frameTag;

    const entry = {
      id: this.nextId++,
      type: normalizedType,
      frame: frameTag,
      source: metadata.source || command.source || 'unknown',
      enqueuedAt: this.clock(),
      payload: this.deepClone(command),
      metadata: metadata.metadata
        ? this.deepClone(metadata.metadata)
        : undefined,
    };

    this.queue.push(entry);
    this.stats.enqueued += 1;

    if (this.capacity && this.queue.length > this.capacity) {
      const overflow = this.queue.splice(0, this.queue.length - this.capacity);
      this.stats.dropped += overflow.length;
    }

    if (this.hooks.onEnqueue) {
      try {
        this.hooks.onEnqueue({
          entry: this.cloneEntry(entry),
          stats: this.getStats(),
        });
      } catch (error) {
        console.warn('[CommandQueueService] onEnqueue hook failed:', error);
      }
    }

    return this.cloneEntry(entry);
  }

  consume(options = {}) {
    const {
      frame,
      types = null,
      predicate = null,
      consumerId = 'default',
    } = options || {};

    if (this.queue.length === 0) {
      const resolvedFrame = this.resolveConsumeFrame(frame);
      this.lastConsumedFrame = Math.max(this.lastConsumedFrame, resolvedFrame);
      this.nextDefaultFrame = this.lastConsumedFrame + 1;
      return [];
    }

    const targetFrame = this.resolveConsumeFrame(frame);
    const typeFilter =
      Array.isArray(types) && types.length > 0 ? new Set(types) : null;
    const shouldInclude = typeof predicate === 'function' ? predicate : null;

    const consumed = [];
    const remaining = [];

    for (const entry of this.queue) {
      const matchesFrame = entry.frame <= targetFrame;
      const matchesType = !typeFilter || typeFilter.has(entry.type);
      const matchesPredicate = !shouldInclude || shouldInclude(entry);

      if (matchesFrame && matchesType && matchesPredicate) {
        consumed.push(entry);
      } else {
        remaining.push(entry);
      }
    }

    this.queue = remaining;
    this.lastConsumedFrame = Math.max(this.lastConsumedFrame, targetFrame);
    this.nextDefaultFrame = this.lastConsumedFrame + 1;

    if (consumed.length === 0) {
      return [];
    }

    this.stats.consumed += consumed.length;

    const clonedEntries = consumed.map((entry) => this.cloneEntry(entry));

    if (this.hooks.onConsume) {
      try {
        this.hooks.onConsume({
          frame: targetFrame,
          entries: clonedEntries,
          stats: this.getStats(),
          consumerId,
        });
      } catch (error) {
        console.warn('[CommandQueueService] onConsume hook failed:', error);
      }
    }

    return clonedEntries;
  }

  peek() {
    return this.queue.map((entry) => this.cloneEntry(entry));
  }

  peekLast(options = {}) {
    if (this.queue.length === 0) {
      return null;
    }

    const { type = null, types = null, predicate = null } = options || {};
    const matchType = typeof type === 'string' ? type : null;
    const typeSet =
      Array.isArray(types) && types.length > 0 ? new Set(types) : null;
    const shouldInclude = typeof predicate === 'function' ? predicate : null;

    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      const entry = this.queue[index];
      if (matchType && entry.type !== matchType) {
        continue;
      }

      if (typeSet && !typeSet.has(entry.type)) {
        continue;
      }

      if (shouldInclude && !shouldInclude(entry)) {
        continue;
      }

      return this.cloneEntry(entry);
    }

    return null;
  }

  size() {
    return this.queue.length;
  }

  clear({ reason = 'unspecified' } = {}) {
    const cleared = this.queue.length;
    this.queue = [];
    this.stats.cleared += 1;
    this.nextDefaultFrame = this.lastConsumedFrame + 1;

    if (this.hooks.onClear) {
      try {
        this.hooks.onClear({ reason, stats: this.getStats() });
      } catch (error) {
        console.warn('[CommandQueueService] onClear hook failed:', error);
      }
    }

    return cleared;
  }

  getStats() {
    return {
      ...this.stats,
      queueSize: this.queue.length,
      lastConsumedFrame: this.lastConsumedFrame,
    };
  }

  cloneEntry(entry) {
    const cloned = {
      id: entry.id,
      type: entry.type,
      frame: entry.frame,
      source: entry.source,
      enqueuedAt: entry.enqueuedAt,
      payload: this.deepClone(entry.payload),
    };

    if (entry.metadata) {
      cloned.metadata = this.deepClone(entry.metadata);
    }

    return cloned;
  }

  deepClone(value) {
    if (value === null || typeof value !== 'object') {
      return value;
    }

    try {
      return structuredClone(value);
    } catch {
      return JSON.parse(JSON.stringify(value));
    }
  }
}
