import { describe, expect, it, vi } from 'vitest';
import CommandQueueService from '../../src/services/CommandQueueService.js';

describe('CommandQueueService', () => {
  it('enqueues commands with sequential frame tags and consumes them in order', () => {
    const queue = new CommandQueueService({ initialFrame: 0 });

    const first = queue.enqueue({ type: 'move', axes: { x: 1, y: 0 } });
    expect(first.frame).toBe(0);

    const consumedFirst = queue.consume();
    expect(consumedFirst).toHaveLength(1);
    expect(consumedFirst[0].frame).toBe(0);
    expect(consumedFirst[0].payload.axes).toStrictEqual({ x: 1, y: 0 });

    const second = queue.enqueue({ type: 'move', axes: { x: 0, y: 1 } });
    expect(second.frame).toBe(1);

    const consumedSecond = queue.consume();
    expect(consumedSecond).toHaveLength(1);
    expect(consumedSecond[0].frame).toBe(1);
  });

  it('respects explicit frame overrides and filtering during consumption', () => {
    const queue = new CommandQueueService({ initialFrame: 0 });

    queue.enqueue({ type: 'move', axes: { x: 1, y: 1 } }, { frame: 5 });
    queue.enqueue({ type: 'firePrimary', phase: 'pressed' }, { frame: 5 });
    queue.enqueue({ type: 'firePrimary', phase: 'released' }, { frame: 6 });

    const frameFive = queue.consume({ frame: 5, types: ['firePrimary'] });
    expect(frameFive).toHaveLength(1);
    expect(frameFive[0].payload.phase).toBe('pressed');

    const remaining = queue.consume({ frame: 6 });
    expect(remaining).toHaveLength(2);
    expect(remaining.map((entry) => entry.type)).toStrictEqual(['move', 'firePrimary']);
  });

  it('invokes instrumentation hooks on enqueue, consume and clear', () => {
    const onEnqueue = vi.fn();
    const onConsume = vi.fn();
    const onClear = vi.fn();

    const queue = new CommandQueueService({
      hooks: {
        onEnqueue,
        onConsume,
        onClear,
      },
    });

    queue.enqueue({ type: 'move', axes: { x: 0, y: 0 } });
    queue.consume({ consumerId: 'test-consumer' });
    queue.clear({ reason: 'reset' });

    expect(onEnqueue).toHaveBeenCalledTimes(1);
    expect(onEnqueue.mock.calls[0][0].entry.type).toBe('move');

    expect(onConsume).toHaveBeenCalledTimes(1);
    expect(onConsume.mock.calls[0][0].consumerId).toBe('test-consumer');

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onClear.mock.calls[0][0].reason).toBe('reset');
  });

  it('clears queued commands and reports queue size', () => {
    const queue = new CommandQueueService();
    queue.enqueue({ type: 'move', axes: { x: 0, y: 1 } });
    queue.enqueue({ type: 'firePrimary', phase: 'pressed' });

    expect(queue.size()).toBe(2);
    const clearedCount = queue.clear({ reason: 'test-clear' });
    expect(clearedCount).toBe(2);
    expect(queue.size()).toBe(0);
    expect(queue.consume()).toHaveLength(0);
  });
});
