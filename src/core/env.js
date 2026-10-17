// The one dev-mode switch for src/. Vite sets import.meta.env.DEV (true under
// `npm run dev` and Vitest, false in production builds, where branches gated
// on IS_DEV are dead-code-eliminated).
export const IS_DEV = import.meta.env?.DEV === true;
