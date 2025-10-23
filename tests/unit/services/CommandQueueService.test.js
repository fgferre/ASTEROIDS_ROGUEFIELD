import { describe, expect, it, vi } from 'vitest';
import CommandQueueService from '../../../src/services/CommandQueueService.js';

describe('CommandQueueService', () => {
  // Note: vi.restoreAllMocks() handled by global setup (tests/__helpers__/setup.js)
  // Optimization: it.concurrent (tests are independent)

  it.concurrent('enqueues commands with sequential frame tags and consumes them in order', () => {
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

  it.concurrent('respects explicit frame overrides and filtering during consumption', () => {
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

  it.concurrent('invokes instrumentation hooks on enqueue, consume and clear', () => {
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

  it.concurrent('retrieves the most recent matching entry via peekLast', () => {
    const queue = new CommandQueueService();

    const first = queue.enqueue({ type: 'move', axes: { x: 0, y: 1 } });
    const middle = queue.enqueue({ type: 'firePrimary', phase: 'pressed' });
    const last = queue.enqueue({ type: 'move', axes: { x: 1, y: 0 } });

    const latestMove = queue.peekLast({ type: 'move' });
    expect(latestMove.payload.axes).toStrictEqual({ x: 1, y: 0 });
    expect(latestMove).not.toBe(last);

    const latestFire = queue.peekLast({ types: ['firePrimary'] });
    expect(latestFire.payload.phase).toBe('pressed');
    expect(latestFire).not.toBe(middle);

    const matchingPredicate = queue.peekLast({
      predicate: (entry) => entry.payload?.axes?.x === first.payload.axes.x,
    });
    expect(matchingPredicate.payload.axes).toStrictEqual({ x: 0, y: 1 });
    expect(matchingPredicate).not.toBe(first);
  });

  it.concurrent('clears queued commands and reports queue size', () => {
    const queue = new CommandQueueService();
    queue.enqueue({ type: 'move', axes: { x: 0, y: 1 } });
    queue.enqueue({ type: 'firePrimary', phase: 'pressed' });

    expect(queue.size()).toBe(2);
    const clearedCount = queue.clear({ reason: 'test-clear' });
    expect(clearedCount).toBe(2);
    expect(queue.size()).toBe(0);
    expect(queue.consume()).toHaveLength(0);
  });

  it.concurrent('creates deep snapshots of payloads and metadata to avoid mutation bleed', () => {
    const queue = new CommandQueueService({ initialFrame: 10 });
    const sharedAxes = { x: 1, y: 2 };
    const metadataEnvelope = { metadata: { origin: { id: 'player-1' } } };

    const enqueued = queue.enqueue({ type: 'move', axes: sharedAxes }, metadataEnvelope);
    sharedAxes.x = 42;
    metadataEnvelope.metadata.origin.id = 'mutated';
    enqueued.payload.axes.y = 99;

    const peeked = queue.peek()[0];
    peeked.payload.axes.x = -100;
    peeked.metadata.origin.id = 'peek-mutated';

    const consumed = queue.consume();
    expect(consumed).toHaveLength(1);
    expect(consumed[0].payload.axes).toStrictEqual({ x: 1, y: 2 });
    expect(consumed[0].metadata).toStrictEqual({ origin: { id: 'player-1' } });
  });
});
