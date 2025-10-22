import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const GRAPH_JSON = path.join(PROJECT_ROOT, 'dependency-graph.json');
const MERMAID_OUTPUT = path.join(
  PROJECT_ROOT,
  'docs',
  'architecture',
  'dependency-graph.mmd'
);
const MARKDOWN_OUTPUT = path.join(
  PROJECT_ROOT,
  'docs',
  'architecture',
  'DEPENDENCY_GRAPH.md'
);

const CATEGORY_LABELS = {
  core: 'Core Infrastructure',
  modules: 'Game Systems',
  services: 'Bootstrap & Services',
  data: 'Data & Configuration',
  utils: 'Utilities',
  misc: 'Miscellaneous',
};

const CATEGORY_STYLES = {
  core: { fill: '#d3f9d8', stroke: '#2f9e44' },
  modules: { fill: '#d0ebff', stroke: '#4263eb' },
  services: { fill: '#e5dbff', stroke: '#7048e8' },
  data: { fill: '#fff3bf', stroke: '#f08c00' },
  utils: { fill: '#e9ecef', stroke: '#495057' },
  misc: { fill: '#ffe3e3', stroke: '#c92a2a' },
};

function normalizePath(p) {
  return p.replace(/\\/g, '/');
}

function parseArgs(argv) {
  const args = {
    limit: 50,
    focus: null,
    hubsOnly: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--hubs-only') {
      args.hubsOnly = true;
    } else if (arg.startsWith('--limit=')) {
      args.limit = Number.parseInt(arg.split('=')[1], 10);
    } else if (arg === '--limit') {
      args.limit = Number.parseInt(argv[i + 1], 10);
      i += 1;
    } else if (arg.startsWith('--focus=')) {
      args.focus = arg.split('=')[1];
    } else if (arg === '--focus') {
      args.focus = argv[i + 1];
      i += 1;
    }
  }

  if (Number.isNaN(args.limit) || args.limit <= 0) {
    args.limit = 50;
  }

  return args;
}

function categorize(filePath) {
  if (filePath.startsWith('src/core/')) {
    return 'core';
  }
  if (filePath.startsWith('src/modules/')) {
    return 'modules';
  }
  if (filePath.startsWith('src/bootstrap/')) {
    return 'services';
  }
  if (filePath.startsWith('src/data/')) {
    return 'data';
  }
  if (filePath.startsWith('src/utils/')) {
    return 'utils';
  }
  return 'misc';
}

function getNodeId(filePath) {
  return normalizePath(filePath).replace(/[^a-zA-Z0-9]/g, '_');
}

function buildNodeLabel(file) {
  const baseName = path.basename(file.path);
  const badges = [];
  if (file.isCritical) {
    badges.push('🔴');
  }
  const displayName = `${badges.join(' ')} ${baseName}`.trim();
  const meta = [];
  if (file.isHub) {
    meta.push(`HUB: ${file.dependents.length} deps`);
  }
  meta.push(`${file.imports.length} imports`);
  meta.push(`${file.dependents.length} dependents`);
  const metaText = meta.join('<br/>');
  return `${displayName}<br/>${metaText}`;
}

function prepareNodes(files, options) {
  let filtered = files;
  if (options.hubsOnly) {
    filtered = filtered.filter((file) => file.isHub);
  }
  if (options.focus) {
    filtered = filtered.filter((file) => file.path.includes(options.focus));
  }

  const scored = filtered
    .map((file) => ({
      file,
      score: file.imports.length + file.dependents.length,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit)
    .map((entry) => entry.file);

  const set = new Set(scored.map((file) => file.path));
  return { nodes: scored, included: set };
}

function extractCycleData(issues) {
  const cycleNodes = new Set();
  const cycleEdges = new Set();

  for (const cycle of issues.cycles || []) {
    const nodes = cycle.split(' -> ');
    nodes.forEach((node) => cycleNodes.add(node));
    for (let i = 0; i < nodes.length; i += 1) {
      const current = nodes[i];
      const next = nodes[(i + 1) % nodes.length];
      cycleEdges.add(`${current}|${next}`);
    }
  }

  return { cycleNodes, cycleEdges };
}

function buildMermaid(nodes, includedPaths, issues) {
  const { cycleNodes, cycleEdges } = extractCycleData(issues);
  const lines = ['flowchart TD'];
  const groups = new Map();

  for (const file of nodes) {
    const category = categorize(file.path);
    if (!groups.has(category)) {
      groups.set(category, []);
    }
    groups.get(category).push(file);
  }

  for (const [category, files] of groups) {
    const subgraphId = `${category}_group`;
    const label = CATEGORY_LABELS[category] || CATEGORY_LABELS.misc;
    lines.push(`  subgraph ${subgraphId}["${label}"]`);
    for (const file of files) {
      const nodeId = getNodeId(file.path);
      const labelContent = buildNodeLabel(file);
      lines.push(`    ${nodeId}["${labelContent}"]`);
    }
    lines.push('  end');
  }

  const styles = [];
  let edgeIndex = 0;
  const edgeStyles = [];

  for (const file of nodes) {
    const nodeId = getNodeId(file.path);
    const category = categorize(file.path);
    const style = CATEGORY_STYLES[category] || CATEGORY_STYLES.misc;
    const strokeWidth = file.isHub ? 4 : cycleNodes.has(file.path) ? 3 : 1.5;
    const strokeColor = cycleNodes.has(file.path) ? '#c92a2a' : style.stroke;
    styles.push(
      `  style ${nodeId} fill:${style.fill},stroke:${strokeColor},stroke-width:${strokeWidth}px`
    );

    for (const dep of file.imports) {
      if (!includedPaths.has(dep)) {
        continue;
      }
      const targetId = getNodeId(dep);
      lines.push(`  ${nodeId} --> ${targetId}`);
      if (cycleEdges.has(`${file.path}|${dep}`)) {
        edgeStyles.push(
          `  linkStyle ${edgeIndex} stroke:#c92a2a,stroke-width:3px,color:#c92a2a`
        );
      }
      edgeIndex += 1;
    }
  }

  return lines.concat(styles).concat(edgeStyles).join('\n');
}

async function generateMermaid(options) {
  const raw = await fs.readFile(GRAPH_JSON, 'utf8');
  const graph = JSON.parse(raw);
  const { nodes, included } = prepareNodes(graph.files, options);
  const mermaid = buildMermaid(nodes, included, graph.issues);
  await fs.writeFile(MERMAID_OUTPUT, `${mermaid}\n`, 'utf8');

  const markdown = `# Dependency Graph\n\n> Generated with \`npm run analyze:deps\`\n\n\`\`\`mermaid\n${mermaid}\n\`\`\`\n`;
  await fs.writeFile(MARKDOWN_OUTPUT, markdown, 'utf8');

  console.log('Mermaid graph generated.');
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    await generateMermaid(args);
  } catch (error) {
    console.error('Failed to generate Mermaid graph:', error);
    process.exit(1);
  }
}

main();
