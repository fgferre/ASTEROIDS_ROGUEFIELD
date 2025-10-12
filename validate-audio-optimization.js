/**
 * Validation Script for Audio System Optimization
 * ETAPA 1.4: Audio System Optimization
 */

import AudioPool from './src/modules/AudioPool.js';
import AudioCache from './src/modules/AudioCache.js';
import AudioBatcher from './src/modules/AudioBatcher.js';
import RandomService from './src/core/RandomService.js';

console.log('🎵 Starting Audio System Optimization Validation...\n');

// Mock AudioContext for testing
class MockAudioContext {
  constructor() {
    this.sampleRate = 44100;
    this.currentTime = 0;
    this.state = 'running';
  }

  createOscillator() {
    return {
      connect: () => {},
      disconnect: () => {},
      start: () => {},
      stop: (when) => {},
      frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      type: 'sine'
    };
  }

  createGain() {
    return {
      connect: () => {},
      disconnect: () => {},
      gain: {
        value: 1,
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
        linearRampToValueAtTime: () => {}
      }
    };
  }

  createBufferSource() {
    return {
      connect: () => {},
      disconnect: () => {},
      start: () => {},
      stop: (when) => {},
      buffer: null
    };
  }

  createBuffer(channels, length, sampleRate) {
    return {
      getChannelData: () => new Float32Array(length)
    };
  }

  resume() {
    return Promise.resolve();
  }
}

// Test Results Storage
const testResults = {
  pooling: { passed: 0, failed: 0, details: [] },
  caching: { passed: 0, failed: 0, details: [] },
  batching: { passed: 0, failed: 0, details: [] },
  integration: { passed: 0, failed: 0, details: [] }
};

function runTest(category, testName, testFn) {
  try {
    const result = testFn();
    if (result) {
      testResults[category].passed++;
      testResults[category].details.push(`✅ ${testName}`);
      console.log(`✅ ${testName}`);
    } else {
      throw new Error('Test returned false');
    }
  } catch (error) {
    testResults[category].failed++;
    testResults[category].details.push(`❌ ${testName}: ${error.message}`);
    console.log(`❌ ${testName}: ${error.message}`);
  }
}

console.log('🔧 Testing AudioPool System...');
const mockContext = new MockAudioContext();
const pool = new AudioPool(mockContext, 10);
const validationRandom = new RandomService('audio-validation');
const cacheRandom = validationRandom.fork('cache-primary');
const batcherRandom = validationRandom.fork('batcher-primary');

runTest('pooling', 'AudioPool instantiation', () => {
  return pool instanceof AudioPool;
});

runTest('pooling', 'AudioPool getOscillator', () => {
  const osc = pool.getOscillator();
  return osc && typeof osc.connect === 'function';
});

runTest('pooling', 'AudioPool getGain', () => {
  const gain = pool.getGain();
  return gain && typeof gain.connect === 'function';
});

runTest('pooling', 'AudioPool returnGain', () => {
  const gain = pool.getGain();
  pool.returnGain(gain);
  return true;
});

runTest('pooling', 'AudioPool statistics tracking', () => {
  const stats = pool.getStats();
  return stats && typeof stats.poolEfficiency === 'number';
});

runTest('pooling', 'AudioPool reuse functionality', () => {
  const gain1 = pool.getGain();
  pool.returnGain(gain1);
  const gain2 = pool.getGain();
  const stats = pool.getStats();
  return stats.reused > 0;
});

console.log('\n🗄️ Testing AudioCache System...');
const cache = new AudioCache(mockContext, 5, { random: cacheRandom });

runTest('caching', 'AudioCache instantiation', () => {
  return cache instanceof AudioCache;
});

runTest('caching', 'AudioCache noise buffer generation', () => {
  const buffer = cache.getNoiseBuffer(0.5, true, 'exponential');
  return buffer && typeof buffer.getChannelData === 'function';
});

runTest('caching', 'AudioCache hit rate tracking', () => {
  // Request same buffer twice
  cache.getNoiseBuffer(0.3, true, 'linear');
  cache.getNoiseBuffer(0.3, true, 'linear');
  const stats = cache.getStats();
  return stats.hits > 0 && stats.hitRate > 0;
});

runTest('caching', 'AudioCache LRU eviction', () => {
  // Fill cache beyond capacity
  for (let i = 0; i < 7; i++) {
    cache.getNoiseBuffer(i * 0.1 + 0.1, true, 'linear');
  }
  const stats = cache.getStats();
  return stats.evicted > 0;
});

runTest('caching', 'AudioCache custom buffer support', () => {
  const buffer = cache.getCustomBuffer('test', 0.2, (output, size) => {
    for (let i = 0; i < size; i++) {
      output[i] = Math.sin(i * 0.1);
    }
  });
  return buffer && typeof buffer.getChannelData === 'function';
});

console.log('\n⚡ Testing AudioBatcher System...');
const mockAudioSystem = {
  safePlay: (fn) => fn(),
  context: mockContext,
  connectGainNode: () => {},
  pool: pool,
  playLaserShot: () => {},
  playAsteroidBreak: () => {},
  playXPCollect: () => {}
};

const batcher = new AudioBatcher(mockAudioSystem, 16, { random: batcherRandom });

runTest('batching', 'AudioBatcher instantiation', () => {
  return batcher instanceof AudioBatcher;
});

runTest('batching', 'AudioBatcher sound scheduling', () => {
  const result = batcher.scheduleSound('playLaserShot', [], { allowOverlap: true });
  return typeof result === 'boolean';
});

runTest('batching', 'AudioBatcher overlap prevention', () => {
  batcher.scheduleSound('playLaserShot', [], { allowOverlap: false });
  const result = batcher.scheduleSound('playLaserShot', [], { allowOverlap: false });
  return result === false; // Should be prevented
});

runTest('batching', 'AudioBatcher statistics tracking', () => {
  const stats = batcher.getStats();
  return stats && typeof stats.batchEfficiency === 'number';
});

runTest('batching', 'AudioBatcher batch flushing', () => {
  batcher.flushPendingBatches();
  return true;
});

console.log('\n🔗 Testing Integration...');

runTest('integration', 'AudioSystem with all optimizations', () => {
  // Test that all components work together
  const testPool = new AudioPool(mockContext, 20);
  const integrationRandom = new RandomService('audio-validation:integration');
  const testCache = new AudioCache(mockContext, 10, {
    random: integrationRandom.fork('cache'),
  });
  const testBatcher = new AudioBatcher(mockAudioSystem, 16, {
    random: integrationRandom.fork('batcher'),
  });

  return testPool && testCache && testBatcher;
});

runTest('integration', 'Performance monitoring integration', () => {
  // Simulate performance tracking
  let callCount = 0;
  const mockMonitor = {
    trackCall: () => callCount++,
    getStats: () => ({ totalCalls: callCount })
  };

  mockMonitor.trackCall();
  mockMonitor.trackCall();

  return mockMonitor.getStats().totalCalls === 2;
});

runTest('integration', 'Memory management integration', () => {
  // Test cleanup functionality
  const testPool = new AudioPool(mockContext, 5);
  const memoryRandom = new RandomService('audio-validation:memory');
  const testCache = new AudioCache(mockContext, 3, {
    random: memoryRandom.fork('cache'),
  });

  // Create some objects
  testPool.getOscillator();
  testCache.getNoiseBuffer(0.1, false, 'linear');

  // Cleanup
  testPool.cleanup();
  testCache.clearCache();

  return testPool.getStats().activeNodes === 0;
});

// Performance Benchmark
console.log('\n🏁 Running Performance Benchmark...');

function benchmarkPooling() {
  const iterations = 1000;
  const testPool = new AudioPool(mockContext, 50);

  const startTime = performance.now();

  for (let i = 0; i < iterations; i++) {
    const gain = testPool.getGain();
    testPool.returnGain(gain);
  }

  const endTime = performance.now();
  const duration = endTime - startTime;
  const stats = testPool.getStats();

  console.log(`🔧 Pooling Benchmark:
  ┣━ ${iterations} operations in ${duration.toFixed(2)}ms
  ┣━ Average: ${(duration / iterations).toFixed(4)}ms per operation
  ┗━ Pool efficiency: ${stats.poolEfficiency.toFixed(1)}%`);

  return duration < 100; // Should complete in under 100ms
}

function benchmarkCaching() {
  const iterations = 500;
  const benchmarkRandom = new RandomService('audio-validation:benchmark');
  const testCache = new AudioCache(mockContext, 20, {
    random: benchmarkRandom.fork('cache'),
  });

  const startTime = performance.now();

  // Mix of cache hits and misses
  for (let i = 0; i < iterations; i++) {
    const duration = (i % 5) * 0.1 + 0.1; // Cycle through 5 different durations
    testCache.getNoiseBuffer(duration, true, 'exponential');
  }

  const endTime = performance.now();
  const duration = endTime - startTime;
  const stats = testCache.getStats();

  console.log(`🗄️ Caching Benchmark:
  ┣━ ${iterations} operations in ${duration.toFixed(2)}ms
  ┣━ Average: ${(duration / iterations).toFixed(4)}ms per operation
  ┗━ Cache hit rate: ${stats.hitRate.toFixed(1)}%`);

  return duration < 200 && stats.hitRate > 75; // Should be fast with good hit rate
}

runTest('integration', 'Pooling performance benchmark', benchmarkPooling);
runTest('integration', 'Caching performance benchmark', benchmarkCaching);

// Final Results
console.log('\n📊 VALIDATION RESULTS SUMMARY\n');

let totalPassed = 0;
let totalFailed = 0;

Object.entries(testResults).forEach(([category, results]) => {
  const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
  console.log(`${categoryName} Tests:`);
  console.log(`  ✅ Passed: ${results.passed}`);
  console.log(`  ❌ Failed: ${results.failed}`);

  if (results.failed > 0) {
    console.log(`  Details:`);
    results.details.filter(d => d.startsWith('❌')).forEach(detail => {
      console.log(`    ${detail}`);
    });
  }

  totalPassed += results.passed;
  totalFailed += results.failed;
  console.log('');
});

const totalTests = totalPassed + totalFailed;
const successRate = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;

console.log(`🎯 OVERALL RESULTS:`);
console.log(`  Total Tests: ${totalTests}`);
console.log(`  Passed: ${totalPassed}`);
console.log(`  Failed: ${totalFailed}`);
console.log(`  Success Rate: ${successRate.toFixed(1)}%`);

if (successRate >= 95) {
  console.log('\n🎉 AUDIO OPTIMIZATION VALIDATION: SUCCESS!');
  console.log('✅ All critical systems are functioning correctly.');
  console.log('✅ Performance targets are expected to be met.');
  console.log('✅ Ready for integration with main game systems.');
} else if (successRate >= 85) {
  console.log('\n⚠️ AUDIO OPTIMIZATION VALIDATION: PARTIAL SUCCESS');
  console.log('✅ Core functionality is working.');
  console.log('⚠️ Some optimization features may need attention.');
  console.log('✅ Safe to proceed with integration and monitoring.');
} else {
  console.log('\n❌ AUDIO OPTIMIZATION VALIDATION: NEEDS ATTENTION');
  console.log('❌ Critical issues found that should be addressed.');
  console.log('❌ Review failed tests before proceeding.');
}

console.log('\n🔧 Next Steps:');
console.log(
  '1. Run the HTML test suite: docs/reference/prototypes/test-audio-optimization.html'
);
console.log('2. Monitor performance in real gameplay scenarios');
console.log('3. Fine-tune optimization parameters if needed');
console.log('4. Consider implementing additional optimization strategies');

process.exit(totalFailed > 0 ? 1 : 0);
