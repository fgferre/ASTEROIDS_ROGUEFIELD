// Performance baseline measurement script
// Run this before implementing Phase 1 optimizations

class PerformanceBaseline {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      phase: 'baseline',
      metrics: {}
    };
  }

  async measureObjectCreation() {
    console.log('📊 Measuring object creation performance...');

    const iterations = 10000;
    const results = {
      bulletCreation: 0,
      particleCreation: 0,
      asteroidCreation: 0,
      memoryBefore: 0,
      memoryAfter: 0
    };

    // Capture initial memory if available
    if (performance.memory) {
      results.memoryBefore = performance.memory.usedJSHeapSize;
    }

    // Simulate bullet creation (current approach)
    const bullets = [];
    const startBullets = performance.now();

    for (let i = 0; i < iterations; i++) {
      bullets.push({
        x: Math.random() * 800,
        y: Math.random() * 600,
        vx: Math.random() * 200 - 100,
        vy: Math.random() * 200 - 100,
        life: 2000,
        damage: 25
      });
    }

    results.bulletCreation = performance.now() - startBullets;

    // Simulate particle creation
    const particles = [];
    const startParticles = performance.now();

    for (let i = 0; i < iterations; i++) {
      particles.push({
        x: Math.random() * 800,
        y: Math.random() * 600,
        vx: Math.random() * 100 - 50,
        vy: Math.random() * 100 - 50,
        color: '#FFFFFF',
        size: Math.random() * 5,
        life: Math.random() * 1000,
        maxLife: 1000,
        alpha: 1,
        type: 'normal'
      });
    }

    results.particleCreation = performance.now() - startParticles;

    // Simulate asteroid creation
    const asteroids = [];
    const startAsteroids = performance.now();

    for (let i = 0; i < iterations; i++) {
      asteroids.push({
        x: Math.random() * 800,
        y: Math.random() * 600,
        vx: Math.random() * 50 - 25,
        vy: Math.random() * 50 - 25,
        angle: Math.random() * Math.PI * 2,
        angularVelocity: Math.random() * 2 - 1,
        size: ['small', 'medium', 'large'][Math.floor(Math.random() * 3)],
        health: 100,
        variant: 'normal'
      });
    }

    results.asteroidCreation = performance.now() - startAsteroids;

    // Capture final memory
    if (performance.memory) {
      results.memoryAfter = performance.memory.usedJSHeapSize;
    }

    // Force garbage collection if available (dev tools)
    if (window.gc) {
      window.gc();
    }

    this.results.metrics.objectCreation = results;

    console.log(`   Bullets: ${results.bulletCreation.toFixed(2)}ms for ${iterations} objects`);
    console.log(`   Particles: ${results.particleCreation.toFixed(2)}ms for ${iterations} objects`);
    console.log(`   Asteroids: ${results.asteroidCreation.toFixed(2)}ms for ${iterations} objects`);

    if (results.memoryBefore && results.memoryAfter) {
      const memoryUsed = (results.memoryAfter - results.memoryBefore) / 1024 / 1024;
      console.log(`   Memory used: ${memoryUsed.toFixed(2)}MB`);
    }
  }

  async measureCollisionDetection() {
    console.log('🎯 Measuring collision detection performance...');

    const objectCounts = [50, 100, 150, 200];
    const results = {};

    for (const count of objectCounts) {
      // Create test objects
      const objects = [];
      for (let i = 0; i < count; i++) {
        objects.push({
          x: Math.random() * 800,
          y: Math.random() * 600,
          radius: Math.random() * 20 + 10,
          id: i
        });
      }

      // Simulate current O(n²) collision detection
      const collisionPairs = [];
      const startTime = performance.now();

      for (let i = 0; i < objects.length; i++) {
        for (let j = i + 1; j < objects.length; j++) {
          const obj1 = objects[i];
          const obj2 = objects[j];

          const dx = obj1.x - obj2.x;
          const dy = obj1.y - obj2.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < obj1.radius + obj2.radius) {
            collisionPairs.push([i, j]);
          }
        }
      }

      const detectionTime = performance.now() - startTime;
      results[`${count}_objects`] = {
        time: detectionTime,
        collisions: collisionPairs.length,
        comparisons: (count * (count - 1)) / 2
      };

      console.log(`   ${count} objects: ${detectionTime.toFixed(2)}ms, ${collisionPairs.length} collisions`);
    }

    this.results.metrics.collisionDetection = results;
  }

  async measureRenderingPerformance() {
    console.log('🎨 Measuring rendering performance...');

    // Create a test canvas
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');

    const renderCounts = [100, 200, 300, 500];
    const results = {};

    for (const count of renderCounts) {
      // Create test render objects
      const objects = [];
      for (let i = 0; i < count; i++) {
        objects.push({
          x: Math.random() * 800,
          y: Math.random() * 600,
          radius: Math.random() * 20 + 5,
          color: `hsl(${Math.random() * 360}, 70%, 50%)`,
          strokeColor: `hsl(${Math.random() * 360}, 70%, 30%)`
        });
      }

      // Simulate current rendering approach (no batching)
      const startTime = performance.now();

      ctx.clearRect(0, 0, 800, 600);

      for (const obj of objects) {
        // Simulate individual render state changes
        ctx.save();
        ctx.fillStyle = obj.color;
        ctx.strokeStyle = obj.strokeColor;
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.arc(obj.x, obj.y, obj.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
      }

      const renderTime = performance.now() - startTime;
      results[`${count}_objects`] = {
        time: renderTime,
        objectsPerMs: count / renderTime
      };

      console.log(`   ${count} objects: ${renderTime.toFixed(2)}ms (${(count / renderTime).toFixed(1)} obj/ms)`);
    }

    this.results.metrics.rendering = results;
  }

  async measureMemoryUsage() {
    console.log('🧠 Measuring memory usage patterns...');

    if (!performance.memory) {
      console.log('   Memory API not available');
      this.results.metrics.memory = { available: false };
      return;
    }

    const results = {
      initial: performance.memory.usedJSHeapSize,
      afterObjectCreation: 0,
      afterGC: 0,
      measurements: []
    };

    // Create many objects to stress memory
    const objects = [];
    for (let i = 0; i < 50000; i++) {
      objects.push({
        id: i,
        data: new Array(100).fill(Math.random()),
        timestamp: Date.now()
      });
    }

    results.afterObjectCreation = performance.memory.usedJSHeapSize;

    // Force GC if available
    if (window.gc) {
      window.gc();
      results.afterGC = performance.memory.usedJSHeapSize;
    }

    // Take memory measurements over time
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      results.measurements.push({
        time: i * 100,
        memory: performance.memory.usedJSHeapSize
      });
    }

    const memoryIncrease = (results.afterObjectCreation - results.initial) / 1024 / 1024;
    console.log(`   Memory increase: ${memoryIncrease.toFixed(2)}MB`);

    if (results.afterGC) {
      const afterGC = (results.afterGC - results.initial) / 1024 / 1024;
      console.log(`   After GC: ${afterGC.toFixed(2)}MB`);
    }

    this.results.metrics.memory = results;
  }

  async runAllBenchmarks() {
    console.log('🚀 Running Performance Baseline Measurements');
    console.log('============================================\n');

    try {
      await this.measureObjectCreation();
      console.log('');

      await this.measureCollisionDetection();
      console.log('');

      await this.measureRenderingPerformance();
      console.log('');

      await this.measureMemoryUsage();
      console.log('');

      // Calculate summary metrics
      this.calculateSummaryMetrics();

      console.log('✅ Baseline measurements complete!');
      console.log('\nResults saved to: performance-baseline.json');

      return this.results;
    } catch (error) {
      console.error('❌ Error during baseline measurement:', error);
      throw error;
    }
  }

  calculateSummaryMetrics() {
    const summary = {
      totalObjectCreationTime: 0,
      averageCollisionTime: 0,
      averageRenderTime: 0,
      memoryEfficiency: 'unknown'
    };

    // Object creation summary
    if (this.results.metrics.objectCreation) {
      const { bulletCreation, particleCreation, asteroidCreation } = this.results.metrics.objectCreation;
      summary.totalObjectCreationTime = bulletCreation + particleCreation + asteroidCreation;
    }

    // Collision detection average
    if (this.results.metrics.collisionDetection) {
      const times = Object.values(this.results.metrics.collisionDetection).map(r => r.time);
      summary.averageCollisionTime = times.reduce((a, b) => a + b, 0) / times.length;
    }

    // Rendering average
    if (this.results.metrics.rendering) {
      const times = Object.values(this.results.metrics.rendering).map(r => r.time);
      summary.averageRenderTime = times.reduce((a, b) => a + b, 0) / times.length;
    }

    // Memory efficiency
    if (this.results.metrics.memory && this.results.metrics.memory.available !== false) {
      const increase = this.results.metrics.memory.afterObjectCreation - this.results.metrics.memory.initial;
      summary.memoryEfficiency = `${(increase / 1024 / 1024).toFixed(2)}MB for 50k objects`;
    }

    this.results.summary = summary;

    console.log('📊 SUMMARY METRICS:');
    console.log(`   Object Creation: ${summary.totalObjectCreationTime.toFixed(2)}ms total`);
    console.log(`   Collision Detection: ${summary.averageCollisionTime.toFixed(2)}ms average`);
    console.log(`   Rendering: ${summary.averageRenderTime.toFixed(2)}ms average`);
    console.log(`   Memory Efficiency: ${summary.memoryEfficiency}`);
  }

  saveResults() {
    const fs = require('fs');
    const path = require('path');

    try {
      const filePath = path.join(__dirname, 'performance-baseline.json');
      fs.writeFileSync(filePath, JSON.stringify(this.results, null, 2));
      return filePath;
    } catch (error) {
      console.warn('Could not save results to file:', error.message);
      return null;
    }
  }
}

// Export for use in browser or Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PerformanceBaseline;
}

// Auto-run if in browser
if (typeof window !== 'undefined') {
  window.PerformanceBaseline = PerformanceBaseline;

  // Add a global function to run baseline
  window.runPerformanceBaseline = async function() {
    const baseline = new PerformanceBaseline();
    return await baseline.runAllBenchmarks();
  };
}

// Auto-run if called directly in Node.js
if (typeof require !== 'undefined' && require.main === module) {
  (async () => {
    const baseline = new PerformanceBaseline();
    const results = await baseline.runAllBenchmarks();
    baseline.saveResults();

    console.log('\n🎯 PERFORMANCE TARGETS FOR PHASE 1:');
    console.log('   Object Creation: 80% reduction in time');
    console.log('   Collision Detection: 5x speed improvement');
    console.log('   Rendering: 30% faster render times');
    console.log('   Memory: <2MB heap growth per hour gameplay');
  })();
}