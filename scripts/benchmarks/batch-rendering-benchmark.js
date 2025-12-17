/**
 * Batch Rendering Performance Benchmark
 * Tests and validates the performance improvements from batch rendering
 */

// Test configuration
const TEST_CONFIG = {
  CANVAS_WIDTH: 800,
  CANVAS_HEIGHT: 600,
  TEST_DURATION: 10000, // 10 seconds
  FRAME_SAMPLE_SIZE: 1000, // frames to average

  // Test scenarios
  SCENARIOS: {
    light: { bullets: 50, particles: 100, enemies: 20 },
    medium: { bullets: 150, particles: 300, enemies: 50 },
    heavy: { bullets: 300, particles: 600, enemies: 100 },
    stress: { bullets: 500, particles: 1000, enemies: 200 },
  },
};

// Mock objects for testing
function createMockBullet(x, y) {
  return {
    x: x || Math.random() * TEST_CONFIG.CANVAS_WIDTH,
    y: y || Math.random() * TEST_CONFIG.CANVAS_HEIGHT,
    radius: 2 + Math.random() * 3,
    color: '#FFFFFF',
    glow: '#FFFF00',
  };
}

function createMockParticle(x, y) {
  return {
    x: x || Math.random() * TEST_CONFIG.CANVAS_WIDTH,
    y: y || Math.random() * TEST_CONFIG.CANVAS_HEIGHT,
    radius: 1 + Math.random() * 2,
    color: `hsl(${Math.random() * 60 + 20}, 70%, 60%)`,
    alpha: 0.4 + Math.random() * 0.6,
  };
}

function createMockEnemy(x, y) {
  return {
    x: x || Math.random() * TEST_CONFIG.CANVAS_WIDTH,
    y: y || Math.random() * TEST_CONFIG.CANVAS_HEIGHT,
    radius: 8 + Math.random() * 12,
    color: '#FF4444',
    strokeColor: '#FF0000',
  };
}

// Legacy rendering (non-batched)
function renderLegacyBullets(ctx, bullets) {
  for (const bullet of bullets) {
    // Glow
    const gradient = ctx.createRadialGradient(
      bullet.x,
      bullet.y,
      0,
      bullet.x,
      bullet.y,
      bullet.radius * 3
    );
    gradient.addColorStop(0, bullet.glow);
    gradient.addColorStop(1, 'rgba(255, 255, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius * 3, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = bullet.color;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderLegacyParticles(ctx, particles) {
  for (const particle of particles) {
    ctx.globalAlpha = particle.alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function renderLegacyEnemies(ctx, enemies) {
  for (const enemy of enemies) {
    ctx.fillStyle = enemy.color;
    ctx.strokeStyle = enemy.strokeColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

// Performance measurement utilities
class PerformanceMeasurer {
  constructor() {
    this.measurements = [];
    this.running = false;
  }

  start() {
    this.measurements = [];
    this.running = true;
    return performance.now();
  }

  recordFrame(startTime) {
    if (!this.running) return;
    const frameTime = performance.now() - startTime;
    this.measurements.push(frameTime);
  }

  stop() {
    this.running = false;
    return this.getStats();
  }

  getStats() {
    if (this.measurements.length === 0) {
      return { avg: 0, min: 0, max: 0, fps: 0, count: 0 };
    }

    const sorted = [...this.measurements].sort((a, b) => a - b);
    const sum = this.measurements.reduce((a, b) => a + b, 0);

    return {
      avg: sum / this.measurements.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      fps: 1000 / (sum / this.measurements.length),
      count: this.measurements.length,
    };
  }
}

// Benchmark execution
async function runBenchmark() {
  console.log('🚀 Starting Batch Rendering Performance Benchmark');
  console.log('================================================');

  // Setup canvas
  const canvas = document.createElement('canvas');
  canvas.width = TEST_CONFIG.CANVAS_WIDTH;
  canvas.height = TEST_CONFIG.CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');

  // Import optimized rendering system
  let RenderBatch, CanvasStateManager, GradientCache;
  try {
    const renderBatchModule = await import('../../src/core/RenderBatch.js');
    const stateManagerModule = await import(
      '../../src/core/CanvasStateManager.js'
    );
    const gradientCacheModule = await import('../../src/core/GradientCache.js');

    RenderBatch = renderBatchModule.default;
    CanvasStateManager = stateManagerModule.default;
    GradientCache = gradientCacheModule.default;
  } catch (error) {
    console.error('❌ Failed to load optimized rendering modules:', error);
    return;
  }

  // Initialize optimized rendering
  const renderBatch = new RenderBatch();
  const stateManager = new CanvasStateManager();
  const gradientCache = new GradientCache();

  stateManager.initialize(ctx);
  gradientCache.preloadGradients(ctx);

  const results = {};

  // Test each scenario
  for (const [scenarioName, config] of Object.entries(TEST_CONFIG.SCENARIOS)) {
    console.log(`\n📊 Testing scenario: ${scenarioName.toUpperCase()}`);
    console.log(
      `   Bullets: ${config.bullets}, Particles: ${config.particles}, Enemies: ${config.enemies}`
    );

    // Generate test data
    const bullets = Array.from({ length: config.bullets }, () =>
      createMockBullet()
    );
    const particles = Array.from({ length: config.particles }, () =>
      createMockParticle()
    );
    const enemies = Array.from({ length: config.enemies }, () =>
      createMockEnemy()
    );

    // Test legacy rendering
    console.log('   🐌 Testing legacy rendering...');
    const legacyMeasurer = new PerformanceMeasurer();
    legacyMeasurer.start();

    let frameCount = 0;
    const legacyStartTime = performance.now();

    while (
      performance.now() - legacyStartTime < TEST_CONFIG.TEST_DURATION / 2 &&
      frameCount < TEST_CONFIG.FRAME_SAMPLE_SIZE
    ) {
      const frameStart = performance.now();

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      renderLegacyBullets(ctx, bullets);
      renderLegacyParticles(ctx, particles);
      renderLegacyEnemies(ctx, enemies);

      legacyMeasurer.recordFrame(frameStart);
      frameCount++;
    }

    const legacyStats = legacyMeasurer.stop();

    // Test optimized rendering
    console.log('   🚀 Testing optimized rendering...');
    const optimizedMeasurer = new PerformanceMeasurer();
    optimizedMeasurer.start();

    frameCount = 0;
    const optimizedStartTime = performance.now();

    while (
      performance.now() - optimizedStartTime < TEST_CONFIG.TEST_DURATION / 2 &&
      frameCount < TEST_CONFIG.FRAME_SAMPLE_SIZE
    ) {
      const frameStart = performance.now();

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Use batch rendering
      renderBatch.beginBatch('bullets', { fillStyle: '#FFFFFF' });
      for (const bullet of bullets) {
        renderBatch.addCircle(bullet.x, bullet.y, bullet.radius, bullet.color);
      }
      renderBatch.flushBatch(ctx);

      renderBatch.beginBatch('particles', { globalAlpha: 0.8 });
      for (const particle of particles) {
        renderBatch.addCircle(
          particle.x,
          particle.y,
          particle.radius,
          particle.color
        );
      }
      renderBatch.flushBatch(ctx);

      renderBatch.beginBatch('enemies', { lineWidth: 2 });
      for (const enemy of enemies) {
        renderBatch.addCircle(
          enemy.x,
          enemy.y,
          enemy.radius,
          enemy.color,
          enemy.strokeColor
        );
      }
      renderBatch.flushBatch(ctx);

      optimizedMeasurer.recordFrame(frameStart);
      frameCount++;
    }

    const optimizedStats = optimizedMeasurer.stop();

    // Calculate improvements
    const improvement = {
      frameTime: (
        ((legacyStats.avg - optimizedStats.avg) / legacyStats.avg) *
        100
      ).toFixed(1),
      fps: (
        ((optimizedStats.fps - legacyStats.fps) / legacyStats.fps) *
        100
      ).toFixed(1),
      p95: (
        ((legacyStats.p95 - optimizedStats.p95) / legacyStats.p95) *
        100
      ).toFixed(1),
    };

    results[scenarioName] = {
      legacy: legacyStats,
      optimized: optimizedStats,
      improvement,
    };

    console.log(`   📈 Results:`);
    console.log(
      `      Legacy:    ${legacyStats.avg.toFixed(2)}ms avg, ${legacyStats.fps.toFixed(1)} FPS`
    );
    console.log(
      `      Optimized: ${optimizedStats.avg.toFixed(2)}ms avg, ${optimizedStats.fps.toFixed(1)} FPS`
    );
    console.log(
      `      📊 Improvement: ${improvement.frameTime}% faster, ${improvement.fps}% FPS increase`
    );
  }

  // Final summary
  console.log('\n🎯 BENCHMARK SUMMARY');
  console.log('==================');

  let totalImprovement = 0;
  let scenarioCount = 0;

  for (const [scenario, data] of Object.entries(results)) {
    const frameTimeImprovement = parseFloat(data.improvement.frameTime);
    totalImprovement += frameTimeImprovement;
    scenarioCount++;

    console.log(
      `${scenario.toUpperCase()}: ${data.improvement.frameTime}% faster (${data.optimized.fps.toFixed(1)} FPS)`
    );
  }

  const avgImprovement = totalImprovement / scenarioCount;
  console.log(`\n🏆 AVERAGE IMPROVEMENT: ${avgImprovement.toFixed(1)}%`);

  // Check if we met our target
  const targetMet = avgImprovement >= 30;
  console.log(
    `🎯 TARGET (30%+ improvement): ${targetMet ? '✅ ACHIEVED' : '❌ NOT MET'}`
  );

  // Get detailed stats from optimization systems
  console.log('\n📊 OPTIMIZATION SYSTEM STATS');
  console.log('============================');
  const batchStats = renderBatch.getStats();
  const stateStats = stateManager.getStats();
  const gradientStats = gradientCache.getStats();

  console.log(`Batch Efficiency: ${batchStats.efficiency}`);
  console.log(`State Efficiency: ${stateStats.efficiency}`);
  console.log(`Gradient Hit Rate: ${gradientStats.hitRates.gradients}`);
  console.log(`Canvas Hit Rate: ${gradientStats.hitRates.canvases}`);

  return {
    results,
    averageImprovement: avgImprovement,
    targetMet,
    systemStats: {
      batch: batchStats,
      state: stateStats,
      gradient: gradientStats,
    },
  };
}

// Auto-run if in browser environment
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runBenchmark);
  } else {
    runBenchmark();
  }
}

// Export for use in other contexts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    runBenchmark,
    TEST_CONFIG,
    PerformanceMeasurer,
  };
}
