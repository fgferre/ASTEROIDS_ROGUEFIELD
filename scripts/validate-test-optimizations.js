/**
 * Validation script for test optimization patterns
 * 
 * Usage:
 *   node scripts/validate-test-optimizations.js
 * 
 * Checks for anti-patterns and missing optimizations:
 * - setTimeout without vi.useFakeTimers()
 * - Inline helpers that should use centralized versions
 * - Tests that could be parallelized but aren't
 * - beforeEach that could be beforeAll
 * 
 * Returns exit code 0 if all checks pass, 1 if issues found.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const TEST_DIR = 'tests';
const ISSUES = [];
const WARNINGS = [];

const SET_TIMEOUT_ALLOWLIST = [/^tests\/integration\//];
const PRAGMA_PATTERNS = {
  setTimeout: /validate-ignore:\s*setTimeout/,
  beforeAll: /validate-ignore:\s*beforeAll-cannot-apply/,
  concurrency: /validate-ignore:\s*concurrency-intentional/,
  inlineEventBus: /validate-ignore:\s*inline-eventbus/,
  inlineRandomStub: /validate-ignore:\s*inline-random-stub/,
};

function hasPragma(content, key) {
  const pattern = PRAGMA_PATTERNS[key];
  return pattern ? pattern.test(content) : false;
}

function findTestFiles(dir) {
  const files = [];
  const entries = readdirSync(dir);
  
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory() && !entry.startsWith('__')) {
      files.push(...findTestFiles(fullPath));
    } else if (entry.endsWith('.test.js')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function checkFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  // Check 1: setTimeout without vi.useFakeTimers()
  const ignoreSetTimeout =
    SET_TIMEOUT_ALLOWLIST.some((pattern) => pattern.test(normalizedPath)) ||
    hasPragma(content, 'setTimeout');

  if (
    content.includes('setTimeout') &&
    !content.includes('vi.useFakeTimers()') &&
    !ignoreSetTimeout
  ) {
    ISSUES.push(`${filePath}: Uses setTimeout without vi.useFakeTimers()`);
  } else if (content.includes('setTimeout') && !ignoreSetTimeout) {
    WARNINGS.push(`${filePath}: Detected setTimeout usage - verify fake timers are intentional.`);
  }
  
  // Check 2: Inline EventBus creation
  if (
    content.match(/const\s+\w+\s*=\s*\{\s*emit:\s*vi\.fn\(\)/) &&
    !hasPragma(content, 'inlineEventBus')
  ) {
    ISSUES.push(`${filePath}: Has inline EventBus mock, should use createEventBusMock()`);
  }

  // Check 3: Inline Random stub
  if (
    content.match(/const\s+\w+\s*=\s*\{\s*float:\s*\(\)\s*=>\s*0\.5/) &&
    !hasPragma(content, 'inlineRandomStub')
  ) {
    ISSUES.push(`${filePath}: Has inline Random stub, should use createDeterministicRandom()`);
  }

  // Check 4: beforeEach with immutable setup
  const beforeEachMatches = content.match(/beforeEach\(\(\)\s*=>\s*\{[^}]*new\s+\w+\(/g);
  if (
    beforeEachMatches &&
    beforeEachMatches.length > 0 &&
    !hasPragma(content, 'beforeAll')
  ) {
    // This is a heuristic - may need manual review
    ISSUES.push(`${filePath}: Has beforeEach with 'new' - consider beforeAll if setup is immutable`);
  }
  
  // Check 5: Independent tests without concurrent
  const hasDescribe = content.includes('describe(');
  const hasConcurrent = content.includes('.concurrent');
  const hasGlobalThis = content.includes('globalThis');
  
  if (hasDescribe && !hasConcurrent && !hasGlobalThis && !hasPragma(content, 'concurrency')) {
    // Heuristic: if no globalThis and has describes, might be parallelizable
    ISSUES.push(`${filePath}: Has describes without .concurrent - consider parallelization`);
  }
}

function main() {
  console.log('Validating test optimization patterns...\n');
  
  const testFiles = findTestFiles(TEST_DIR);
  console.log(`Found ${testFiles.length} test files\n`);
  
  for (const file of testFiles) {
    checkFile(file);
  }
  
  if (WARNINGS.length > 0) {
    console.log(`\n⚠️  Found ${WARNINGS.length} warnings:`);
    WARNINGS.forEach((warning) => console.log(`  - ${warning}`));
  }

  if (ISSUES.length === 0) {
    console.log('\n✅ All checks passed! No optimization issues found.');
    process.exit(0);
  }

  console.log(`\n❌ Found ${ISSUES.length} potential issues:\n`);
  ISSUES.forEach((issue) => console.log(`  - ${issue}`));
  console.log('\nNote: Some issues may be false positives. Review manually.');
  process.exit(1);
}

main();
