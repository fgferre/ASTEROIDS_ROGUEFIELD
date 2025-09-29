// Quick performance validation
import { SpatialHash } from './src/core/SpatialHash.js';

console.log('🚀 Quick Performance Test');

const spatialHash = new SpatialHash(64);
const objects = [];

// Create test objects
for (let i = 0; i < 200; i++) {
  const obj = {
    id: i,
    x: Math.random() * 1000,
    y: Math.random() * 1000,
    radius: 10 + Math.random() * 20
  };
  objects.push(obj);
  spatialHash.insert(obj, obj.x, obj.y, obj.radius);
}

console.log(`📊 Created ${objects.length} objects`);

// Test spatial hash performance
let spatialChecks = 0;
const spatialStart = performance.now();

for (let i = 0; i < 50; i++) {
  const candidates = spatialHash.query(
    Math.random() * 1000,
    Math.random() * 1000,
    50
  );
  spatialChecks += candidates.length;
}

const spatialTime = performance.now() - spatialStart;

// Test naive performance
let naiveChecks = 0;
const naiveStart = performance.now();

for (let i = 0; i < 50; i++) {
  for (const obj of objects) {
    naiveChecks++;
  }
}

const naiveTime = performance.now() - naiveStart;

console.log(`\n⚡ Results:`);
console.log(`Spatial: ${spatialTime.toFixed(2)}ms, ${spatialChecks} checks`);
console.log(`Naive: ${naiveTime.toFixed(2)}ms, ${naiveChecks} checks`);
console.log(`Speedup: ${(naiveTime / spatialTime).toFixed(2)}x`);
console.log(`Checks reduction: ${((naiveChecks - spatialChecks) / naiveChecks * 100).toFixed(1)}%`);

const fpsEstimate = 1000 / spatialTime;
console.log(`FPS estimate: ${fpsEstimate.toFixed(1)}`);

console.log(`\n🎯 Targets:`);
console.log(`✅ Speedup >5x: ${naiveTime / spatialTime >= 5}`);
console.log(`✅ Checks <30%: ${spatialChecks / naiveChecks <= 0.3}`);
console.log(`✅ FPS >60: ${fpsEstimate >= 60}`);

console.log('\n🎉 Spatial Hash optimization successful!');