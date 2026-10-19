// src/modules/menu/threeUuid.js
//
// Seeded Three.js UUIDs for the menu scene: MathUtils.generateUUID (and its
// old `THREE.Math` alias) answers from the menu's threeUuid fork, patched in
// place when the object allows it, else replaced by a clone; destroy puts
// the original back. MenuBackgroundSystem keeps the state and the fork and
// calls these; the bodies came from it unchanged.

import RandomService from '../../core/RandomService.js';

export const SIMPLEX_DEFAULT_RANDOM = new RandomService(
  'menu-background:simplex-default'
);

/** What the patch remembers between apply and restore (one per system). */
export function createThreeMathUtilsState() {
  return {
    originalMathUtils: null,
    originalMath: undefined,
    originalMathRandom: undefined,
    seededMathRandomDepth: 0,
    deterministicMathUtils: null,
    deterministicUuidGenerator: null,
    generateUuidDescriptors: new Map(),
    patchedMathUtilsTargets: new Set(),
  };
}

/**
 * @param {object} state - from createThreeMathUtilsState()
 * @param {object} three - the THREE namespace
 * @param {() => object} ensureThreeUuidRandom - the system's threeUuid fork,
 *   asked on every UUID (so a fork replaced later is honoured)
 */
export function applyDeterministicThreeUuidGenerator(
  state,
  three,
  ensureThreeUuidRandom
) {
  if (!state || !three || typeof three !== 'object') {
    return;
  }

  const mathUtilsCandidate = three.MathUtils ?? three.Math;
  if (!mathUtilsCandidate || typeof mathUtilsCandidate !== 'object') {
    return;
  }

  const aliasCandidate =
    typeof three.Math === 'object' && three.Math !== null ? three.Math : null;

  if (
    state.deterministicMathUtils &&
    mathUtilsCandidate === state.deterministicMathUtils
  ) {
    if (
      state.deterministicMathUtils &&
      aliasCandidate !== state.deterministicMathUtils &&
      (aliasCandidate !== null ||
        (state.originalMath !== null && state.originalMath !== undefined))
    ) {
      three.Math = state.deterministicMathUtils;
    }
    return;
  }

  state.originalMathUtils = mathUtilsCandidate;

  if (aliasCandidate !== state.deterministicMathUtils) {
    if (aliasCandidate !== null) {
      state.originalMath = aliasCandidate;
    } else if (state.originalMath === undefined) {
      state.originalMath = null;
    }
  }

  if (!state.deterministicUuidGenerator) {
    state.deterministicUuidGenerator = () => {
      const fork = ensureThreeUuidRandom();
      if (fork && typeof fork.uuid === 'function') {
        return fork.uuid('menu-background:three.uuid');
      }
      return SIMPLEX_DEFAULT_RANDOM.uuid('menu-background:three.uuid');
    };
  }

  const patchedOriginal = patchMathUtilsGenerateUuid(
    state,
    mathUtilsCandidate,
    state.deterministicUuidGenerator
  );

  let aliasPatched = false;
  if (aliasCandidate && aliasCandidate !== mathUtilsCandidate) {
    aliasPatched = patchMathUtilsGenerateUuid(
      state,
      aliasCandidate,
      state.deterministicUuidGenerator
    );
  }

  if (patchedOriginal || aliasPatched) {
    state.deterministicMathUtils = mathUtilsCandidate;
    three.MathUtils = mathUtilsCandidate;

    if (
      aliasCandidate !== null ||
      (state.originalMath !== null && state.originalMath !== undefined)
    ) {
      three.Math = aliasCandidate ?? mathUtilsCandidate;
    }

    return;
  }

  const deterministic = cloneMathUtilsWithDeterministicUuid(
    mathUtilsCandidate,
    state.deterministicUuidGenerator
  );

  state.deterministicMathUtils = deterministic;
  three.MathUtils = deterministic;

  if (
    aliasCandidate !== null ||
    (state.originalMath !== null && state.originalMath !== undefined)
  ) {
    three.Math = deterministic;
  }
}

export function restoreOriginalThreeUuidGenerator(state, three) {
  if (!state || !three || typeof three !== 'object') {
    return;
  }

  restorePatchedMathUtilsTargets(state);

  if (
    state.deterministicMathUtils &&
    three.MathUtils === state.deterministicMathUtils
  ) {
    if (state.originalMathUtils) {
      three.MathUtils = state.originalMathUtils;
    }
  }

  if (state.deterministicMathUtils) {
    const aliasCandidate =
      typeof three.Math === 'object' && three.Math !== null ? three.Math : null;

    if (aliasCandidate === state.deterministicMathUtils) {
      if (state.originalMath === null) {
        const descriptor = Object.getOwnPropertyDescriptor(three, 'Math');
        if (descriptor && descriptor.configurable === false) {
          three.Math = undefined;
        } else if (descriptor) {
          delete three.Math;
        } else {
          three.Math = undefined;
        }
      } else if (state.originalMath !== undefined) {
        three.Math = state.originalMath;
      } else if (state.originalMathUtils) {
        three.Math = state.originalMathUtils;
      }
    }
  }

  state.deterministicMathUtils = null;
}

function cloneMathUtilsWithDeterministicUuid(source, uuidGenerator) {
  const prototype = Object.getPrototypeOf(source) || Object.prototype;
  const clone = Object.create(prototype);
  const keys = Reflect.ownKeys(source);

  keys.forEach((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (!descriptor) {
      clone[key] = source[key];
      return;
    }

    if (key === 'generateUUID') {
      const enumerable = descriptor.enumerable ?? false;
      const configurable = descriptor.configurable ?? true;
      const writable = Object.prototype.hasOwnProperty.call(
        descriptor,
        'writable'
      )
        ? Boolean(descriptor.writable)
        : true;

      Object.defineProperty(clone, key, {
        configurable,
        enumerable,
        writable,
        value: uuidGenerator,
      });
      return;
    }

    Object.defineProperty(clone, key, descriptor);
  });

  if (!keys.includes('generateUUID')) {
    Object.defineProperty(clone, 'generateUUID', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: uuidGenerator,
    });
  }

  const isFrozen = Object.isFrozen(source);
  const isSealed = Object.isSealed(source);
  const isExtensible = Object.isExtensible(source);

  if (isFrozen) {
    Object.freeze(clone);
  } else if (isSealed) {
    Object.seal(clone);
  } else if (!isExtensible) {
    Object.preventExtensions(clone);
  }

  return clone;
}

function copyGenerateUuidDescriptor(target) {
  if (!target || typeof target !== 'object') {
    return null;
  }

  const descriptor = Object.getOwnPropertyDescriptor(target, 'generateUUID');
  if (!descriptor) {
    return null;
  }

  const copy = {
    configurable: descriptor.configurable,
    enumerable: descriptor.enumerable,
  };

  if (Object.prototype.hasOwnProperty.call(descriptor, 'writable')) {
    copy.writable = descriptor.writable;
  }

  if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
    copy.value = descriptor.value;
  }

  if (Object.prototype.hasOwnProperty.call(descriptor, 'get')) {
    copy.get = descriptor.get;
  }

  if (Object.prototype.hasOwnProperty.call(descriptor, 'set')) {
    copy.set = descriptor.set;
  }

  return copy;
}

function overwriteGenerateUuid(target, uuidGenerator) {
  if (!target || typeof target !== 'object') {
    return false;
  }

  const descriptor = Object.getOwnPropertyDescriptor(target, 'generateUUID');

  if (!descriptor) {
    try {
      target.generateUUID = uuidGenerator;
      if (target.generateUUID === uuidGenerator) {
        return true;
      }
    } catch (error) {
      // Ignore assignment errors and fallback to defineProperty
    }

    try {
      Object.defineProperty(target, 'generateUUID', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: uuidGenerator,
      });
      return target.generateUUID === uuidGenerator;
    } catch (error) {
      return false;
    }
  }

  if (descriptor.configurable !== false) {
    const nextDescriptor = {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
    };

    if (Object.prototype.hasOwnProperty.call(descriptor, 'writable')) {
      nextDescriptor.writable = descriptor.writable;
    }

    try {
      Object.defineProperty(target, 'generateUUID', {
        ...nextDescriptor,
        value: uuidGenerator,
      });
      if (target.generateUUID === uuidGenerator) {
        return true;
      }
    } catch (error) {
      // Ignore defineProperty failure and fallback to direct assignment
    }
  }

  if (descriptor.set && typeof descriptor.set === 'function') {
    try {
      descriptor.set.call(target, uuidGenerator);
      if (target.generateUUID === uuidGenerator) {
        return true;
      }
    } catch (error) {
      // Ignore setter errors and continue to fallback attempts
    }
  }

  if (descriptor.writable) {
    try {
      target.generateUUID = uuidGenerator;
      if (target.generateUUID === uuidGenerator) {
        return true;
      }
    } catch (error) {
      return false;
    }
  }

  return false;
}

function patchMathUtilsGenerateUuid(state, target, uuidGenerator) {
  if (
    !target ||
    typeof target !== 'object' ||
    typeof uuidGenerator !== 'function'
  ) {
    return false;
  }

  if (!state) {
    return false;
  }

  if (!state.generateUuidDescriptors) {
    state.generateUuidDescriptors = new Map();
  }

  if (!state.generateUuidDescriptors.has(target)) {
    state.generateUuidDescriptors.set(
      target,
      copyGenerateUuidDescriptor(target)
    );
  }

  const patched = overwriteGenerateUuid(target, uuidGenerator);

  if (patched) {
    if (!state.patchedMathUtilsTargets) {
      state.patchedMathUtilsTargets = new Set();
    }
    state.patchedMathUtilsTargets.add(target);
  } else {
    state.generateUuidDescriptors.delete(target);
  }

  return patched;
}

function restoreMathUtilsGenerateUuid(state, target) {
  if (!target || typeof target !== 'object') {
    return;
  }

  if (!state || !state.generateUuidDescriptors) {
    return;
  }

  const descriptor = state.generateUuidDescriptors.get(target) || null;

  if (!descriptor) {
    if (Object.prototype.hasOwnProperty.call(target, 'generateUUID')) {
      try {
        delete target.generateUUID;
      } catch (error) {
        try {
          target.generateUUID = undefined;
        } catch (innerError) {
          // Swallow errors restoring missing descriptor
        }
      }
    }
    state.generateUuidDescriptors.delete(target);
    return;
  }

  try {
    Object.defineProperty(target, 'generateUUID', descriptor);
  } catch (error) {
    if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      try {
        target.generateUUID = descriptor.value;
      } catch (innerError) {
        // Ignore assignment errors when restoring descriptor value
      }
    }
  }

  state.generateUuidDescriptors.delete(target);
}

function restorePatchedMathUtilsTargets(state) {
  if (!state || !state.patchedMathUtilsTargets) {
    return;
  }

  state.patchedMathUtilsTargets.forEach((target) => {
    restoreMathUtilsGenerateUuid(state, target);
  });

  state.patchedMathUtilsTargets.clear();
}
