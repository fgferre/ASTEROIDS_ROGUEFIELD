/**
 * Benchmark script for test performance validation
 *
 * Usage:
 *   node scripts/benchmark-tests.js
 *
 * Runs tests multiple times and calculates performance metrics:
 * - Mean execution time
 * - Median execution time
 * - Standard deviation
 * - Min/Max times
 *
 * Use this to validate that optimizations actually improve performance.
 */
import { execSync } from 'child_process';
import { performance } from 'perf_hooks';

const RUNS = 5;
const TEST_COMMAND = 'npm test -- --run';

function runBenchmark() {
  console.log(`Running benchmark with ${RUNS} iterations...\n`);

  const times = [];

  for (let i = 0; i < RUNS; i++) {
    console.log(`Run ${i + 1}/${RUNS}...`);
    const start = performance.now();

    try {
      execSync(TEST_COMMAND, { stdio: 'pipe' });
    } catch (error) {
      console.error(`Test run ${i + 1} failed:`, error.message);
      process.exit(1);
    }

    const end = performance.now();
    const duration = end - start;
    times.push(duration);
    console.log(`  Duration: ${(duration / 1000).toFixed(2)}s`);
  }

  // Calculate statistics
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const sorted = [...times].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = Math.min(...times);
  const max = Math.max(...times);
  const variance =
    times.reduce((sum, time) => sum + Math.pow(time - mean, 2), 0) /
    times.length;
  const stdDev = Math.sqrt(variance);

  console.log('\n=== Benchmark Results ===');
  console.log(`Mean:   ${(mean / 1000).toFixed(2)}s`);
  console.log(`Median: ${(median / 1000).toFixed(2)}s`);
  console.log(`Min:    ${(min / 1000).toFixed(2)}s`);
  console.log(`Max:    ${(max / 1000).toFixed(2)}s`);
  console.log(`StdDev: ${(stdDev / 1000).toFixed(2)}s`);
  console.log(
    `\nRun this before and after optimizations to measure improvement.`
  );
}

runBenchmark();
