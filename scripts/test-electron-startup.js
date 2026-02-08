/**
 * Tests that the Electron app can start without module import errors.
 * This catches issues where dependencies are bundled but their transitive
 * dependencies are not installed (e.g., optional peer dependencies).
 *
 * Only fails on module import errors - other runtime errors are ignored
 * since they may be expected in CI environments (no display, no copilot CLI, etc.)
 *
 * Exit codes:
 *   0 - No module import errors detected
 *   1 - Module import error detected
 */

const { spawn } = require('child_process');
const path = require('path');

const STARTUP_TIMEOUT_MS = 15000;

// Pattern to detect module import errors only
const MODULE_ERROR_PATTERN =
  /Cannot find module ['"]([^'"]+)['"]|Error: Cannot find module|MODULE_NOT_FOUND/;

// Use electron CLI module directly for cross-platform compatibility
const electronCli = require('electron');

const mainScript = path.join(__dirname, '..', 'out', 'main', 'index.js');

console.log('Checking for module import errors...');
console.log(`  Main script: ${mainScript}`);

const args = [mainScript, '--test-startup'];

// Add flags for CI compatibility
if (process.platform === 'linux') {
  args.unshift('--no-sandbox');
}

const child = spawn(electronCli, args, {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    ELECTRON_STARTUP_TEST: '1',
  },
});

let stdout = '';
let stderr = '';
let moduleErrorFound = false;

child.stdout.on('data', (data) => {
  const str = data.toString();
  stdout += str;
  process.stdout.write(data);

  // Check for module import errors
  if (MODULE_ERROR_PATTERN.test(str)) {
    moduleErrorFound = true;
  }
});

child.stderr.on('data', (data) => {
  const str = data.toString();
  stderr += str;
  process.stderr.write(data);

  // Check for module import errors
  if (MODULE_ERROR_PATTERN.test(str)) {
    moduleErrorFound = true;
  }
});

const timeout = setTimeout(() => {
  child.kill();
  finishTest();
}, STARTUP_TIMEOUT_MS);

child.on('error', (err) => {
  clearTimeout(timeout);
  console.error('\n✗ Failed to spawn Electron:', err.message);
  process.exit(1);
});

child.on('close', () => {
  clearTimeout(timeout);
  finishTest();
});

function finishTest() {
  // Only check for module import errors - ignore other runtime errors
  if (moduleErrorFound || MODULE_ERROR_PATTERN.test(stderr) || MODULE_ERROR_PATTERN.test(stdout)) {
    console.error('\n✗ Module import error detected');
    process.exit(1);
  }

  console.log('\n✓ No module import errors detected');
  process.exit(0);
}
