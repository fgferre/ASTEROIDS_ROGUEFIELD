/**
 * Coordinates deferred cleanup work (object pool tuning, cache purges, etc)
 * using `requestIdleCallback` when available. Helps keep the main game loop
 * focused on real-time work while cleanup tasks run opportunistically.
 */
export class GarbageCollectionManager {
  constructor(options = {}) {
    this.options = {
      defaultInterval: 4000,
      idleTimeout: 150,
      maxTasksPerFrame: 3,
      ...options
    };

    this.tasks = new Map();
    this.queue = [];
    this.initialized = false;
    this.idleHandle = null;
    this.useIdleCallback = typeof requestIdleCallback === 'function';
    this.performance = typeof performance !== 'undefined' ? performance : { now: () => Date.now() };

    this.tryRegisterService();
  }

  initialize() {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.tryRegisterService();
  }

  tryRegisterService() {
    if (typeof gameServices === 'undefined') {
      return;
    }

    if (
      typeof gameServices.has === 'function' &&
      gameServices.has('garbage-collector')
    ) {
      return;
    }

    if (typeof gameServices.register === 'function') {
      try {
        gameServices.register('garbage-collector', this);
      } catch (error) {
        console.warn('[GarbageCollectionManager] Failed to register in service locator', error);
      }
    }
  }

  /**
   * Registers a periodic cleanup task.
   *
   * @param {string} name - Unique identifier
   * @param {Function} callback - Task callback
   * @param {Object} [options] - Task options
   * @param {number} [options.interval] - Interval in ms between runs
   * @param {number} [options.priority] - Higher priority tasks run first
   * @param {boolean} [options.runImmediately=false] - Queue task right away
   */
  registerPeriodicTask(name, callback, options = {}) {
    if (!name) {
      throw new Error('GarbageCollectionManager.registerPeriodicTask requires a name');
    }
    if (typeof callback !== 'function') {
      throw new Error('GarbageCollectionManager.registerPeriodicTask requires a function');
    }

    const interval = Math.max(0, options.interval ?? this.options.defaultInterval);
    const priority = options.priority ?? 0;

    this.tasks.set(name, {
      callback,
      interval,
      priority,
      lastRun: this.performance.now(),
      pending: false
    });

    if (options.runImmediately) {
      this.queueTask(name);
    }
  }

  /**
   * Enqueues a one-off cleanup task.
   *
   * @param {Function} callback - Task to execute
   * @param {Object} [options]
   * @param {number} [options.priority=0]
   */
  enqueueTask(callback, options = {}) {
    if (typeof callback !== 'function') {
      return;
    }

    const priority = options.priority ?? 0;
    this.queue.push({
      name: null,
      callback,
      priority,
      once: true
    });
    this.sortQueue();
    this.scheduleIdlePass();
  }

  /**
   * Called from the main loop. Queues eligible tasks based on their interval.
   */
  update() {
    if (!this.initialized) {
      return;
    }

    const now = this.performance.now();

    for (const [name, task] of this.tasks.entries()) {
      if (task.pending) {
        continue;
      }

      if (task.interval === 0 || now - task.lastRun >= task.interval) {
        this.queueTask(name);
      }
    }

    if (!this.useIdleCallback && this.queue.length > 0) {
      this.processQueue();
    }
  }

  queueTask(name) {
    const task = this.tasks.get(name);
    if (!task || task.pending) {
      return;
    }

    task.pending = true;
    this.queue.push({
      name,
      callback: task.callback,
      priority: task.priority,
      once: false
    });

    this.sortQueue();
    this.scheduleIdlePass();
  }

  sortQueue() {
    this.queue.sort((a, b) => b.priority - a.priority);
  }

  scheduleIdlePass() {
    if (this.idleHandle !== null || this.queue.length === 0) {
      return;
    }

    if (this.useIdleCallback) {
      this.idleHandle = requestIdleCallback((deadline) => {
        this.idleHandle = null;
        this.processQueue(deadline);
      }, { timeout: this.options.idleTimeout });
    } else {
      this.idleHandle = setTimeout(() => {
        this.idleHandle = null;
        this.processQueue();
      }, this.options.idleTimeout);
    }
  }

  processQueue(deadline) {
    if (this.queue.length === 0) {
      return;
    }

    const maxTasks = this.options.maxTasksPerFrame ?? 0;
    let processed = 0;

    while (this.queue.length > 0) {
      if (deadline && typeof deadline.timeRemaining === 'function') {
        if (deadline.timeRemaining() <= 1) {
          break;
        }
      } else if (maxTasks > 0 && processed >= maxTasks) {
        break;
      }

      const item = this.queue.shift();
      processed += 1;

      if (item.name && this.tasks.has(item.name)) {
        const task = this.tasks.get(item.name);
        task.pending = false;
        task.lastRun = this.performance.now();
        this.safeExecute(task.callback, item.name);
      } else if (item.once) {
        this.safeExecute(item.callback, 'anonymous');
      }
    }

    if (this.queue.length > 0) {
      this.scheduleIdlePass();
    }
  }

  safeExecute(callback, label) {
    try {
      callback({ manager: this });
    } catch (error) {
      console.error(`[GarbageCollectionManager] Error running task "${label}"`, error);
    }
  }

  flush() {
    while (this.queue.length > 0) {
      this.processQueue();
    }
  }

  shutdown() {
    if (this.idleHandle !== null) {
      if (this.useIdleCallback) {
        if (typeof cancelIdleCallback === 'function') {
          cancelIdleCallback(this.idleHandle);
        }
      } else {
        clearTimeout(this.idleHandle);
      }
      this.idleHandle = null;
    }

    this.queue.length = 0;
    this.tasks.clear();
    this.initialized = false;
  }

  getStats() {
    return {
      initialized: this.initialized,
      queuedTasks: this.queue.length,
      registeredTasks: Array.from(this.tasks.entries()).map(([name, task]) => ({
        name,
        interval: task.interval,
        priority: task.priority,
        pending: task.pending
      }))
    };
  }
}

export default GarbageCollectionManager;
