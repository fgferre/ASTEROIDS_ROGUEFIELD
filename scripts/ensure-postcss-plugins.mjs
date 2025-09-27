import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const pluginVersions = {
  autoprefixer: packageJson.dependencies?.autoprefixer || packageJson.devDependencies?.autoprefixer,
  tailwindcss: packageJson.dependencies?.tailwindcss || packageJson.devDependencies?.tailwindcss,
};

const missingPlugins = Object.entries(pluginVersions)
  .filter(([name]) => {
    try {
      require.resolve(name);
      return false;
    } catch {
      return true;
    }
  })
  .map(([name, version]) => (version ? `${name}@${version}` : name));

if (missingPlugins.length === 0) {
  process.exit(0);
}

console.log(`Installing missing PostCSS plugins: ${missingPlugins.join(', ')}`);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, ['install', '--no-audit', '--no-fund', ...missingPlugins], {
  cwd: projectRoot,
  stdio: 'inherit',
});

if (result.status !== 0) {
  console.error('Failed to install PostCSS plugins required for the Tailwind build pipeline.');
  process.exit(result.status ?? 1);
}

const tailwindBin = path.join(projectRoot, 'node_modules', '.bin', 'tailwindcss');
const tailwindCli = path.join(projectRoot, 'node_modules', 'tailwindcss', 'lib', 'cli.js');

for (const binaryPath of [tailwindBin, tailwindCli]) {
  try {
    if (fs.existsSync(binaryPath)) {
      fs.chmodSync(binaryPath, 0o755);
    }
  } catch (error) {
    console.warn(`Unable to adjust execute permissions for ${binaryPath}:`, error.message);
  }
}
