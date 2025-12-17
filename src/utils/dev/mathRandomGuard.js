const guardState = {
  installed: false,
  activate: null,
  deactivate: null,
  restore: null,
};

function formatStack(stack) {
  if (!stack) {
    return null;
  }

  const lines = String(stack)
    .split('\n')
    .map((line) => line.trim());

  if (lines.length <= 2) {
    return lines.join('\n');
  }

  return lines.slice(2, 7).join('\n');
}

export function installMathRandomGuard({ logger = console } = {}) {
  if (guardState.installed) {
    return {
      activate: guardState.activate,
      deactivate: guardState.deactivate,
      restore: guardState.restore,
    };
  }

  if (typeof Math === 'undefined' || typeof Math.random !== 'function') {
    return {
      activate: () => {},
      deactivate: () => {},
      restore: () => {},
    };
  }

  const originalRandom = Math.random;
  let guardEnabled = false;

  function emitViolation() {
    const stack = formatStack(new Error().stack);
    const context = stack ? `\nStack: ${stack}` : '';
    const message = `[RandomGuard] Math.random() invoked after deterministic bootstrap. Use RandomService forks instead.${context}`;

    if (logger && typeof logger.error === 'function') {
      logger.error(message);
    } else if (logger && typeof logger.warn === 'function') {
      logger.warn(message);
    }
  }

  function patchedRandom(...args) {
    if (guardEnabled) {
      emitViolation();
    }
    return originalRandom.apply(this, args);
  }

  try {
    Object.defineProperty(patchedRandom, 'name', {
      value: 'MathRandomGuarded',
      configurable: true,
    });
  } catch (error) {
    // Ignore errors from defineProperty in older environments
  }

  Math.random = patchedRandom;

  guardState.installed = true;
  guardState.activate = ({ reason } = {}) => {
    guardEnabled = true;
    if (logger && typeof logger.info === 'function') {
      const detail = reason ? ` (${reason})` : '';
      logger.info(`[RandomGuard] Math.random() warnings enabled${detail}.`);
    }
  };
  guardState.deactivate = () => {
    guardEnabled = false;
  };
  guardState.restore = () => {
    Math.random = originalRandom;
    guardState.installed = false;
    guardEnabled = false;
  };

  return {
    activate: guardState.activate,
    deactivate: guardState.deactivate,
    restore: guardState.restore,
  };
}

export function enableMathRandomWarningsAfterBootstrap(options) {
  const guard = installMathRandomGuard(options);
  guard.activate?.({ reason: 'post-bootstrap' });
  return guard;
}
