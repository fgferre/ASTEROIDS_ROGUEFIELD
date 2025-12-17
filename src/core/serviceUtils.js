export function normalizeDependencies(dependencies) {
  if (
    !dependencies ||
    typeof dependencies !== 'object' ||
    Array.isArray(dependencies)
  ) {
    return {};
  }

  return { ...dependencies };
}

export function resolveService(name, dependencies = {}) {
  if (dependencies && dependencies[name]) {
    return dependencies[name];
  }

  if (
    typeof gameServices !== 'undefined' &&
    typeof gameServices.has === 'function' &&
    gameServices.has(name)
  ) {
    return gameServices.get(name);
  }

  return null;
}
