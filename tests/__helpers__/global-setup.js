/**
 * Global test setup for Vitest
 * 
 * This file is automatically loaded before all tests via vite.config.js setupFiles.
 * It provides global cleanup to prevent mock bleed between tests.
 * 
 * Optimization: Eliminates need for afterEach(() => vi.restoreAllMocks()) in 27 test files.
 */
import { afterEach } from 'vitest';
import { vi } from 'vitest';

// Optimization: Global afterEach to restore all mocks after each test
afterEach(() => {
  vi.restoreAllMocks();
});
