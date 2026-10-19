/**
 * Its lens lights over the last `telegraph` s before its weapon component
 * fires, and stays lit through a burst (`telegraphRatio` 0..1, read by the
 * view).
 */
export default {
  params: { telegraph: 'number' },
  getters: {
    telegraphRatio(enemy, { telegraph }) {
      const state = enemy.weaponState;
      if (!state) return 0;
      if (state.burstRemaining > 0) return 1;
      return Math.max(0, Math.min(1, 1 - (state.cooldown ?? 0) / telegraph));
    },
  },
};
