/**
 * SfxSynthPort — the Option E port/adapter seam that breaks the
 * AudioBatcher ↔ AudioSystem circular dependency (RESEARCH Pitfall 1).
 *
 * Before this seam, AudioBatcher received the WHOLE AudioSystem
 * (`new AudioBatcher(this, ...)`) and reached back into 7+ private members
 * (_playDroneFireDirect, _playHunterBurstDirect, _playMineExplosionDirect,
 * safePlay, connectGainNode, pool, context). That back-reference is the cycle.
 *
 * This factory takes an EXPLICIT functions/resources object — NOT a system
 * object. There is deliberately no parameter through which the whole system
 * could pass, so the coupling cannot be smuggled back in inside a closure
 * (the failure mode `createSfxSynthPort(system)` would have allowed).
 *
 * The returned port is frozen and exposes ONLY:
 *   - the 5 batched-synth call-through functions
 *     (playDroneFireDirect / playHunterBurstDirect / playMineExplosionDirect /
 *     safePlay / connectGainNode),
 *   - `executeImmediate(soundType, args)` — the non-batched / size-1 flush path.
 *     AudioBatcher._playImmediate previously reached the system directly via
 *     `this.audioSystem._executeBatchedSound(...)` / `this.audioSystem[soundType](...)`;
 *     those are the only batcher→system calls NOT in the original interfaces
 *     block, so the port forwards them through ONE explicit bound function
 *     rather than handing back the whole system (Rule 3 — the immediate path
 *     would otherwise be unreachable once the back-ref is removed), and
 *   - `pool` / `context` getters that LATE-BIND to getPool()/getContext()
 *     (pool & context are assigned during AudioSystem.init, so the port must
 *     reflect their current value, not a snapshot taken at construction).
 *
 * This file is a NEW manager-namespace file under src/modules/audio/. No
 * existing file is moved or renamed (AGENTS.md:7) — AudioBatcher.js stays at
 * src/modules/AudioBatcher.js and is refactored in place to consume the port.
 */

const REQUIRED_FUNCTIONS = Object.freeze([
  'playDroneFireDirect',
  'playHunterBurstDirect',
  'playMineExplosionDirect',
  'safePlay',
  'connectGainNode',
  'executeImmediate',
  'getPool',
  'getContext',
]);

/**
 * Build the frozen SFX synth port from an explicit functions object.
 *
 * @param {{
 *   playDroneFireDirect: (params?: object) => void,
 *   playHunterBurstDirect: (params?: object) => void,
 *   playMineExplosionDirect: (params?: object) => void,
 *   safePlay: (fn: () => void) => void,
 *   connectGainNode: (node: AudioNode) => void,
 *   executeImmediate: (soundType: string, args: any[]) => void,
 *   getPool: () => object,
 *   getContext: () => AudioContext,
 * }} fns - Explicit named callbacks/resources. Passing a whole system object
 *   is impossible: every required key is validated as a function and there is
 *   no `system` parameter.
 * @returns {Readonly<object>} A frozen port exposing the 5 functions plus
 *   late-bound `pool`/`context` getters and nothing else.
 * @throws {Error} If `fns` is not an object or any required key is missing /
 *   not a function (fail-fast — the FIX-05 lesson applied to ports).
 */
export function createSfxSynthPort(fns) {
  if (!fns || typeof fns !== 'object') {
    throw new Error(
      'createSfxSynthPort requires an explicit functions object ' +
        `({ ${REQUIRED_FUNCTIONS.join(', ')} }), received: ${typeof fns}`
    );
  }

  const {
    playDroneFireDirect,
    playHunterBurstDirect,
    playMineExplosionDirect,
    safePlay,
    connectGainNode,
    executeImmediate,
    getPool,
    getContext,
  } = fns;

  for (const key of REQUIRED_FUNCTIONS) {
    if (typeof fns[key] !== 'function') {
      throw new Error(
        `createSfxSynthPort: missing or non-function key "${key}". ` +
          'Every port member must be supplied as an explicit named function — ' +
          'the system is never passed through.'
      );
    }
  }

  return Object.freeze({
    playDroneFireDirect,
    playHunterBurstDirect,
    playMineExplosionDirect,
    safePlay,
    connectGainNode,
    executeImmediate,
    // Late-bound: pool/context are assigned during AudioSystem.init, so the
    // port must reflect their CURRENT value rather than a construction-time
    // snapshot.
    get pool() {
      return getPool();
    },
    get context() {
      return getContext();
    },
  });
}

export default createSfxSynthPort;
