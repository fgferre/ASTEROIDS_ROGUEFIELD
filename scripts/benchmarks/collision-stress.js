/**
 * Collision Detection Stress Test
 *
 * This script tests the performance of the spatial hash collision detection system
 * with high object counts to validate the 60 FPS target and performance improvements.
 */

import { SpatialHash } from '../../src/core/SpatialHash.js';

// Mock performance API for Node.js if needed
if (typeof performance === 'undefined') {
  global.performance = {
    now: () => Date.now()
  };
}

class CollisionStressTest {
  constructor() {
    this.spatialHash = new SpatialHash(64, {
      maxObjects: 8,
      dynamicResize: true
    });

    this.asteroids = [];
    this.bullets = [];
    this.results = {
      spatialHashResults: {},
      naiveResults: {},
      comparison: {}
    };

    console.log('🚀 Collision Detection Stress Test Initialized');
  }

  /**
   * Creates test objects with realistic game-like distribution
   */
  createTestObjects(asteroidCount = 200, bulletCount = 50) {
    console.log(`\n📦 Creating ${asteroidCount} asteroids and ${bulletCount} bullets...`);

    // Clear existing objects
    this.asteroids = [];
    this.bullets = [];
    this.spatialHash.clear();

    // Create asteroids with varied sizes and realistic distribution
    for (let i = 0; i < asteroidCount; i++) {
      const size = Math.random();
      let radius;

      if (size < 0.6) {
        radius = 8 + Math.random() * 8; // Small asteroids (60%)
      } else if (size < 0.9) {
        radius = 16 + Math.random() * 16; // Medium asteroids (30%)
      } else {
        radius = 32 + Math.random() * 16; // Large asteroids (10%)
      }

      const asteroid = {
        id: `asteroid-${i}`,
        x: Math.random() * 2000,
        y: Math.random() * 2000,
        vx: (Math.random() - 0.5) * 100,
        vy: (Math.random() - 0.5) * 100,
        radius: radius,
        destroyed: false,
        type: 'asteroid'
      };

      this.asteroids.push(asteroid);
      this.spatialHash.insert(asteroid, asteroid.x, asteroid.y, asteroid.radius);
    }

    // Create bullets
    for (let i = 0; i < bulletCount; i++) {
      const bullet = {
        id: `bullet-${i}`,
        x: Math.random() * 2000,
        y: Math.random() * 2000,
        vx: (Math.random() - 0.5) * 200,
        vy: (Math.random() - 0.5) * 200,
        radius: 2,
        hit: false,
        type: 'bullet'
      };

      this.bullets.push(bullet);
    }

    console.log(`✅ Created ${this.asteroids.length} asteroids and ${this.bullets.length} bullets`);
  }

  /**
   * Simulates object movement for realistic collision testing
   */
  updatePositions(deltaTime = 16.67) { // 60 FPS = 16.67ms per frame
    // Update asteroid positions
    for (const asteroid of this.asteroids) {
      if (asteroid.destroyed) continue;

      asteroid.x += asteroid.vx * deltaTime * 0.001;
      asteroid.y += asteroid.vy * deltaTime * 0.001;

      // Wrap around edges
      if (asteroid.x < 0) asteroid.x += 2000;
      if (asteroid.x > 2000) asteroid.x -= 2000;
      if (asteroid.y < 0) asteroid.y += 2000;
      if (asteroid.y > 2000) asteroid.y -= 2000;

      // Update spatial hash
      this.spatialHash.update(asteroid, asteroid.x, asteroid.y, asteroid.radius);
    }

    // Update bullet positions
    for (const bullet of this.bullets) {
      if (bullet.hit) continue;

      bullet.x += bullet.vx * deltaTime * 0.001;
      bullet.y += bullet.vy * deltaTime * 0.001;

      // Remove bullets that go off-screen
      if (bullet.x < -100 || bullet.x > 2100 || bullet.y < -100 || bullet.y > 2100) {
        bullet.hit = true;
      }
    }
  }

  /**
   * Spatial hash-based collision detection
   */
  spatialHashCollisionDetection() {
    const collisions = [];
    let checksPerformed = 0;
    const startTime = performance.now();

    for (const bullet of this.bullets) {
      if (bullet.hit) continue;

      const candidates = this.spatialHash.query(bullet.x, bullet.y, 50, {
        filter: (obj) => obj.type === 'asteroid' && !obj.destroyed
      });

      checksPerformed += candidates.length;

      for (const asteroid of candidates) {
        const dx = bullet.x - asteroid.x;
        const dy = bullet.y - asteroid.y;
        const totalRadius = bullet.radius + asteroid.radius;

        if (dx * dx + dy * dy <= totalRadius * totalRadius) {
          collisions.push({ bullet, asteroid });
          bullet.hit = true;
          break;
        }
      }
    }

    const endTime = performance.now();

    return {
      collisions: collisions.length,
      checksPerformed,
      timeMs: endTime - startTime,
      spatial: this.spatialHash.getStats()
    };
  }

  /**
   * Naive O(n²) collision detection for comparison
   */
  naiveCollisionDetection() {
    const collisions = [];
    let checksPerformed = 0;
    const startTime = performance.now();

    for (const bullet of this.bullets) {
      if (bullet.hit) continue;

      for (const asteroid of this.asteroids) {
        if (asteroid.destroyed) continue;

        checksPerformed++;

        const dx = bullet.x - asteroid.x;
        const dy = bullet.y - asteroid.y;
        const totalRadius = bullet.radius + asteroid.radius;

        if (dx * dx + dy * dy <= totalRadius * totalRadius) {
          collisions.push({ bullet, asteroid });
          bullet.hit = true;
          break;
        }
      }
    }

    const endTime = performance.now();

    return {
      collisions: collisions.length,
      checksPerformed,
      timeMs: endTime - startTime
    };
  }

  /**
   * Runs performance comparison between spatial hash and naive approaches
   */
  async runPerformanceComparison(asteroidCount = 200, bulletCount = 50, frames = 100) {
    console.log(`\n⚡ Running Performance Comparison:`);
    console.log(`   - ${asteroidCount} asteroids`);
    console.log(`   - ${bulletCount} bullets`);
    console.log(`   - ${frames} frames simulation`);

    this.createTestObjects(asteroidCount, bulletCount);

    // Test spatial hash approach
    console.log('\n🎯 Testing Spatial Hash Collision Detection...');
    const spatialResults = {
      totalTime: 0,
      totalCollisions: 0,
      totalChecks: 0,
      maxFrameTime: 0,
      frameResults: []
    };

    for (let frame = 0; frame < frames; frame++) {
      this.updatePositions();

      // Reset bullet hit states for consistent testing
      this.bullets.forEach(b => b.hit = false);

      const result = this.spatialHashCollisionDetection();

      spatialResults.totalTime += result.timeMs;
      spatialResults.totalCollisions += result.collisions;
      spatialResults.totalChecks += result.checksPerformed;
      spatialResults.maxFrameTime = Math.max(spatialResults.maxFrameTime, result.timeMs);
      spatialResults.frameResults.push(result.timeMs);

      if (frame % 20 === 0) {
        process.stdout.write('.');
      }
    }

    // Reset for naive test
    this.createTestObjects(asteroidCount, bulletCount);

    // Test naive approach
    console.log('\n\n🐌 Testing Naive Collision Detection...');
    const naiveResults = {
      totalTime: 0,
      totalCollisions: 0,
      totalChecks: 0,
      maxFrameTime: 0,
      frameResults: []
    };

    for (let frame = 0; frame < frames; frame++) {
      this.updatePositions();

      // Reset bullet hit states for consistent testing
      this.bullets.forEach(b => b.hit = false);

      const result = this.naiveCollisionDetection();

      naiveResults.totalTime += result.timeMs;
      naiveResults.totalCollisions += result.collisions;
      naiveResults.totalChecks += result.checksPerformed;
      naiveResults.maxFrameTime = Math.max(naiveResults.maxFrameTime, result.timeMs);
      naiveResults.frameResults.push(result.timeMs);

      if (frame % 20 === 0) {
        process.stdout.write('.');
      }
    }

    console.log('\n');

    // Calculate comparison metrics
    const comparison = {
      speedup: naiveResults.totalTime / spatialResults.totalTime,
      checksReduction: ((naiveResults.totalChecks - spatialResults.totalChecks) / naiveResults.totalChecks * 100),
      spatialAvgFrameTime: spatialResults.totalTime / frames,
      naiveAvgFrameTime: naiveResults.totalTime / frames,
      spatialFPS: 1000 / (spatialResults.totalTime / frames),
      naiveFPS: 1000 / (naiveResults.totalTime / frames),
      collisionAccuracy: Math.abs(spatialResults.totalCollisions - naiveResults.totalCollisions) / Math.max(spatialResults.totalCollisions, naiveResults.totalCollisions) * 100
    };

    this.results = {
      spatialHashResults: spatialResults,
      naiveResults: naiveResults,
      comparison: comparison,
      testParams: { asteroidCount, bulletCount, frames }
    };

    return this.results;
  }

  /**
   * Tests performance with increasing object counts
   */
  async runScalabilityTest() {
    console.log('\n📈 Running Scalability Test...');

    const testCases = [
      { asteroids: 50, bullets: 10 },
      { asteroids: 100, bullets: 20 },
      { asteroids: 200, bullets: 40 },
      { asteroids: 300, bullets: 60 },
      { asteroids: 400, bullets: 80 },
      { asteroids: 500, bullets: 100 }
    ];

    const scalabilityResults = [];

    for (const testCase of testCases) {
      console.log(`\n🔬 Testing: ${testCase.asteroids} asteroids, ${testCase.bullets} bullets`);

      const result = await this.runPerformanceComparison(
        testCase.asteroids,
        testCase.bullets,
        30 // Fewer frames for scalability test
      );

      scalabilityResults.push({
        ...testCase,
        spatialFPS: result.comparison.spatialFPS,
        naiveFPS: result.comparison.naiveFPS,
        speedup: result.comparison.speedup,
        checksReduction: result.comparison.checksReduction
      });

      console.log(`   Spatial FPS: ${result.comparison.spatialFPS.toFixed(1)}`);
      console.log(`   Naive FPS: ${result.comparison.naiveFPS.toFixed(1)}`);
      console.log(`   Speedup: ${result.comparison.speedup.toFixed(2)}x`);
    }

    return scalabilityResults;
  }

  /**
   * Validates that 60 FPS target is achieved
   */
  validate60FPSTarget(asteroidCount = 200, bulletCount = 50) {
    console.log('\n🎯 Validating 60 FPS Target...');

    this.createTestObjects(asteroidCount, bulletCount);

    const targetFrameTime = 16.67; // 60 FPS = 16.67ms per frame
    const frames = 60; // Test 1 second worth of frames
    const frameResults = [];

    for (let frame = 0; frame < frames; frame++) {
      this.updatePositions();
      this.bullets.forEach(b => b.hit = false);

      const result = this.spatialHashCollisionDetection();
      frameResults.push(result.timeMs);
    }

    const avgFrameTime = frameResults.reduce((a, b) => a + b, 0) / frameResults.length;
    const maxFrameTime = Math.max(...frameResults);
    const framesUnder16ms = frameResults.filter(t => t <= targetFrameTime).length;
    const successRate = (framesUnder16ms / frames) * 100;

    const validation = {
      avgFrameTime,
      maxFrameTime,
      targetFrameTime,
      successRate,
      passed: successRate >= 95, // 95% of frames should be under 16.67ms
      estimatedFPS: 1000 / avgFrameTime
    };

    console.log(`\n📊 60 FPS Validation Results:`);
    console.log(`   Average frame time: ${avgFrameTime.toFixed(2)}ms`);
    console.log(`   Maximum frame time: ${maxFrameTime.toFixed(2)}ms`);
    console.log(`   Target frame time: ${targetFrameTime}ms`);
    console.log(`   Success rate: ${successRate.toFixed(1)}%`);
    console.log(`   Estimated FPS: ${validation.estimatedFPS.toFixed(1)}`);
    console.log(`   Target achieved: ${validation.passed ? '✅ YES' : '❌ NO'}`);

    return validation;
  }

  /**
   * Prints comprehensive results
   */
  printResults() {
    if (!this.results.comparison) {
      console.log('❌ No results to display. Run a test first.');
      return;
    }

    const { spatialHashResults, naiveResults, comparison, testParams } = this.results;

    console.log('\n' + '='.repeat(60));
    console.log('📊 COLLISION DETECTION STRESS TEST RESULTS');
    console.log('='.repeat(60));

    console.log(`\n🔧 Test Parameters:`);
    console.log(`   Asteroids: ${testParams.asteroidCount}`);
    console.log(`   Bullets: ${testParams.bulletCount}`);
    console.log(`   Frames: ${testParams.frames}`);

    console.log(`\n⚡ Spatial Hash Performance:`);
    console.log(`   Total time: ${spatialHashResults.totalTime.toFixed(2)}ms`);
    console.log(`   Average frame time: ${comparison.spatialAvgFrameTime.toFixed(2)}ms`);
    console.log(`   Maximum frame time: ${spatialHashResults.maxFrameTime.toFixed(2)}ms`);
    console.log(`   Estimated FPS: ${comparison.spatialFPS.toFixed(1)}`);
    console.log(`   Total collision checks: ${spatialHashResults.totalChecks.toLocaleString()}`);
    console.log(`   Collisions detected: ${spatialHashResults.totalCollisions}`);

    console.log(`\n🐌 Naive Approach Performance:`);
    console.log(`   Total time: ${naiveResults.totalTime.toFixed(2)}ms`);
    console.log(`   Average frame time: ${comparison.naiveAvgFrameTime.toFixed(2)}ms`);
    console.log(`   Maximum frame time: ${naiveResults.maxFrameTime.toFixed(2)}ms`);
    console.log(`   Estimated FPS: ${comparison.naiveFPS.toFixed(1)}`);
    console.log(`   Total collision checks: ${naiveResults.totalChecks.toLocaleString()}`);
    console.log(`   Collisions detected: ${naiveResults.totalCollisions}`);

    console.log(`\n🚀 Performance Improvement:`);
    console.log(`   Speed improvement: ${comparison.speedup.toFixed(2)}x faster`);
    console.log(`   Collision checks reduction: ${comparison.checksReduction.toFixed(1)}%`);
    console.log(`   Collision accuracy: ${(100 - comparison.collisionAccuracy).toFixed(1)}%`);

    console.log(`\n🎯 60 FPS Target:`);
    const fpsTarget = comparison.spatialFPS >= 60;
    console.log(`   Target FPS (60): ${fpsTarget ? '✅ ACHIEVED' : '❌ NOT ACHIEVED'}`);
    console.log(`   Frame budget (16.67ms): ${comparison.spatialAvgFrameTime <= 16.67 ? '✅ WITHIN BUDGET' : '❌ OVER BUDGET'}`);

    if (comparison.speedup >= 3 && comparison.checksReduction >= 70 && fpsTarget) {
      console.log(`\n🎉 ALL PERFORMANCE TARGETS ACHIEVED! 🎉`);
    } else {
      console.log(`\n⚠️  Some performance targets not met:`);
      if (comparison.speedup < 3) console.log(`   - Need 3x speedup (got ${comparison.speedup.toFixed(2)}x)`);
      if (comparison.checksReduction < 70) console.log(`   - Need 70% checks reduction (got ${comparison.checksReduction.toFixed(1)}%)`);
      if (!fpsTarget) console.log(`   - Need 60+ FPS (got ${comparison.spatialFPS.toFixed(1)} FPS)`);
    }

    console.log('\n' + '='.repeat(60));
  }
}

// Main execution function
async function runStressTest() {
  const test = new CollisionStressTest();

  try {
    console.log('🚀 Starting Collision Detection Stress Test...\n');

    // Run main performance comparison
    console.log('1️⃣ Running main performance test...');
    await test.runPerformanceComparison(200, 50, 100);
    test.printResults();

    // Validate 60 FPS target
    console.log('\n2️⃣ Validating 60 FPS target...');
    const fpsValidation = test.validate60FPSTarget(200, 50);

    // Run scalability test
    console.log('\n3️⃣ Running scalability test...');
    const scalabilityResults = await test.runScalabilityTest();

    console.log('\n📈 Scalability Results:');
    scalabilityResults.forEach(result => {
      console.log(`   ${result.asteroids} objects: ${result.spatialFPS.toFixed(1)} FPS (${result.speedup.toFixed(2)}x speedup)`);
    });

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('🏁 STRESS TEST COMPLETE');
    console.log('='.repeat(60));

    const mainResult = test.results.comparison;
    const allTargetsMet = (
      mainResult.speedup >= 3 &&
      mainResult.checksReduction >= 70 &&
      mainResult.spatialFPS >= 60 &&
      fpsValidation.passed
    );

    if (allTargetsMet) {
      console.log('🎉 ALL TARGETS ACHIEVED - SPATIAL HASH OPTIMIZATION SUCCESSFUL! 🎉');
      process.exit(0);
    } else {
      console.log('⚠️  Some targets not met - optimization may need further work');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Stress test failed:', error);
    process.exit(1);
  }
}

// Export for testing
export { CollisionStressTest };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runStressTest();
}