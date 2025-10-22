import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');
const TESTS_DIR = path.join(PROJECT_ROOT, 'tests');
const OUTPUT_JSON = path.join(PROJECT_ROOT, 'dependency-graph.json');
const OUTPUT_DOT = path.join(PROJECT_ROOT, 'dependency-graph.dot');
const OUTPUT_ISSUES = path.join(PROJECT_ROOT, 'dependency-issues.json');

const IMPORT_REGEX = /import\s+[^'";]+['"]([^'";]+)['"];?/g;
const EXPORT_REGEX =
  /export\s+(default\s+)?(class|function|const|let|var)\s+(\w+)/g;
const ENTRY_POINTS = new Set([
  normalizePath(
    path.relative(PROJECT_ROOT, path.join(PROJECT_ROOT, 'src', 'app.js'))
  ),
  normalizePath(
    path.relative(
      PROJECT_ROOT,
      path.join(PROJECT_ROOT, 'src', 'bootstrap', 'serviceManifest.js')
    )
  ),
  normalizePath(
    path.relative(
      PROJECT_ROOT,
      path.join(PROJECT_ROOT, 'src', 'core', 'DIContainer.js')
    )
  ),
]);

function normalizePath(p) {
  return p.replace(/\\/g, '/');
}

function parseArgs(argv) {
  const args = {
    validateOnly: false,
    includeTests: false,
    format: 'all',
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--validate-only') {
      args.validateOnly = true;
    } else if (arg === '--include-tests') {
      args.includeTests = true;
    } else if (arg.startsWith('--format=')) {
      args.format = arg.split('=')[1];
    } else if (arg === '--format') {
      args.format = argv[i + 1];
      i += 1;
    }
  }

  return args;
}

async function readFileContent(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    return '';
  }
}

async function collectFiles(baseDir, includeTests) {
  const files = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  }

  await walk(baseDir);

  if (includeTests && (await exists(TESTS_DIR))) {
    await walk(TESTS_DIR);
  }

  return files;
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    return false;
  }
}

function resolveImportPath(filePath, importPath, knownFiles) {
  if (!importPath.startsWith('.')) {
    return null;
  }

  const dir = path.dirname(filePath);
  const resolved = path.resolve(dir, importPath);
  const candidates = [
    `${resolved}.js`,
    `${resolved}.mjs`,
    `${resolved}.cjs`,
    path.join(resolved, 'index.js'),
    path.join(resolved, 'index.mjs'),
    resolved,
  ];

  for (const candidate of candidates) {
    const withExt = path.extname(candidate) ? candidate : `${candidate}.js`;
    if (!withExt.startsWith(PROJECT_ROOT)) {
      continue;
    }
    const relative = normalizePath(path.relative(PROJECT_ROOT, withExt));
    if (knownFiles.has(relative)) {
      return relative;
    }
  }

  return null;
}

function extractImports(content) {
  const imports = [];
  let match;
  while ((match = IMPORT_REGEX.exec(content))) {
    imports.push(match[1]);
  }
  return imports;
}

function extractExports(content) {
  const exports = [];
  let match;
  while ((match = EXPORT_REGEX.exec(content))) {
    exports.push(match[3]);
  }
  return exports;
}

function detectCycles(graph) {
  const visited = new Set();
  const stack = new Set();
  const pathStack = [];
  const cycles = new Set();

  function serializeCycle(cycle) {
    const normalized = [...cycle];
    const minIndex = normalized.reduce((minIdx, node, idx) => {
      return node < normalized[minIdx] ? idx : minIdx;
    }, 0);
    const rotated = normalized
      .slice(minIndex)
      .concat(normalized.slice(0, minIndex));
    return rotated.join(' -> ');
  }

  function dfs(node) {
    visited.add(node);
    stack.add(node);
    pathStack.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (stack.has(neighbor)) {
        const cycle = [];
        for (let i = pathStack.length - 1; i >= 0; i -= 1) {
          cycle.unshift(pathStack[i]);
          if (pathStack[i] === neighbor) {
            break;
          }
        }
        cycles.add(serializeCycle(cycle));
      }
    }

    stack.delete(node);
    pathStack.pop();
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return Array.from(cycles).sort();
}

async function analyze({ includeTests }) {
  const files = await collectFiles(SRC_DIR, includeTests);
  const knownFiles = new Set(
    files.map((absolutePath) =>
      normalizePath(path.relative(PROJECT_ROOT, absolutePath))
    )
  );
  const fileData = new Map();
  const dependencyGraph = new Map();

  for (const absolutePath of files) {
    const relativePath = normalizePath(
      path.relative(PROJECT_ROOT, absolutePath)
    );
    const content = await readFileContent(absolutePath);
    const imports = extractImports(content);
    const exports = extractExports(content);

    const resolvedImports = [];
    for (const importPath of imports) {
      const resolved = resolveImportPath(absolutePath, importPath, knownFiles);
      if (resolved) {
        resolvedImports.push(resolved);
      }
    }

    fileData.set(relativePath, {
      path: relativePath,
      imports: resolvedImports,
      exports,
      dependents: new Set(),
      isHub: false,
      isCritical: false,
    });
    dependencyGraph.set(relativePath, resolvedImports);
  }

  for (const [filePath, data] of fileData) {
    for (const dep of data.imports) {
      const dependent = fileData.get(dep);
      if (dependent) {
        dependent.dependents.add(filePath);
      }
    }
  }

  const cycles = detectCycles(dependencyGraph);
  const hubFiles = [];
  const orphanFiles = [];

  for (const [filePath, data] of fileData) {
    const dependents = Array.from(data.dependents);
    data.dependents = dependents;
    if (dependents.length > 10) {
      data.isHub = true;
      data.isCritical = true;
      hubFiles.push(filePath);
    }
    if (cycles.some((cycle) => cycle.includes(filePath))) {
      data.isCritical = true;
    }
    if (dependents.length === 0 && !ENTRY_POINTS.has(filePath)) {
      orphanFiles.push(filePath);
    }
    if (ENTRY_POINTS.has(filePath)) {
      data.isCritical = true;
    }
  }

  const metrics = {
    totalFiles: fileData.size,
    totalDependencies: Array.from(fileData.values()).reduce(
      (total, item) => total + item.imports.length,
      0
    ),
    circularDependencies: cycles.length,
    hubFiles: hubFiles.length,
    orphanFiles: orphanFiles.length,
  };

  const issues = {
    cycles,
    hubs: hubFiles,
    orphans: orphanFiles,
  };

  const result = {
    files: Array.from(fileData.values()).map((data) => ({
      ...data,
      dependents: data.dependents,
    })),
    metrics,
    issues,
  };

  return { result, issues, metrics };
}

function toDot(graphData) {
  const lines = ['digraph Dependencies {', '  rankdir=LR;'];
  for (const file of graphData.files) {
    const nodeName = `"${file.path}"`;
    const attributes = [];
    if (file.isHub) {
      attributes.push('color=red');
      attributes.push('penwidth=2');
    }
    if (file.isCritical && !file.isHub) {
      attributes.push('color=orange');
    }
    lines.push(`  ${nodeName} [${attributes.join(', ')}];`);
  }

  for (const file of graphData.files) {
    for (const dep of file.imports) {
      lines.push(`  "${file.path}" -> "${dep}";`);
    }
  }

  lines.push('}');
  return lines.join('\n');
}

async function writeOutputs({ result, issues }, { validateOnly, format }) {
  if (validateOnly) {
    if (
      issues.cycles.length > 0 ||
      issues.hubs.length > 0 ||
      issues.orphans.length > 0
    ) {
      console.error(
        'Dependency issues detected:',
        JSON.stringify(issues, null, 2)
      );
      process.exitCode = 1;
    } else {
      console.log('No dependency issues detected.');
    }
    return;
  }

  const tasks = [];
  if (format === 'all' || format === 'json') {
    tasks.push(
      fs.writeFile(OUTPUT_JSON, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    );
    tasks.push(
      fs.writeFile(
        OUTPUT_ISSUES,
        `${JSON.stringify(issues, null, 2)}\n`,
        'utf8'
      )
    );
  }
  if (format === 'all' || format === 'dot') {
    tasks.push(fs.writeFile(OUTPUT_DOT, `${toDot(result)}\n`, 'utf8'));
  }

  await Promise.all(tasks);
  console.log('Dependency analysis completed.');
}

async function main() {
  const args = parseArgs(process.argv);
  const analysis = await analyze(args);
  await writeOutputs(analysis, args);
}

main().catch((error) => {
  console.error('Failed to analyze dependencies:', error);
  process.exit(1);
});
