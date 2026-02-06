/**
 * Tests that the Electron app can start without module loading errors.
 * This catches issues where dependencies are bundled but their transitive
 * dependencies are not installed (e.g., optional peer dependencies).
 *
 * Exit codes:
 *   0 - App started successfully
 *   1 - App failed to start (module error, crash, etc.)
 */

const { spawn } = require('child_process');
const path = require('path');

const STARTUP_TIMEOUT_MS = 15000;
const SUCCESS_SIGNAL = 'ELECTRON_STARTUP_SUCCESS';

// Find electron executable
const electronPath = require.resolve('electron');
const electronBin = path.join(path.dirname(electronPath), '..', 'dist', 'electron.exe');
const electronBinUnix = path.join(
  path.dirname(electronPath),
  '..',
  'dist',
  process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron'
);
const electron = process.platform === 'win32' ? electronBin : electronBinUnix;

// Use electron CLI module directly for cross-platform compatibility
const electronCli = require('electron');

const mainScript = path.join(__dirname, '..', 'out', 'main', 'index.js');

console.log('Testing Electron startup...');
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

child.stdout.on('data', (data) => {
  const str = data.toString();
  stdout += str;
  process.stdout.write(data);

  // Check for module errors immediately
  if (/Cannot find module|Module not found|Error: Cannot find/i.test(str)) {
    clearTimeout(timeout);
    console.error('\n✗ Module loading error detected');
    child.kill();
    process.exit(1);
  }
});

child.stderr.on('data', (data) => {
  const str = data.toString();
  stderr += str;
  process.stderr.write(data);

  // Check for module errors immediately
  if (/Cannot find module|Module not found|Error: Cannot find/i.test(str)) {
    clearTimeout(timeout);
    console.error('\n✗ Module loading error detected');
    child.kill();
    process.exit(1);
  }
});

const timeout = setTimeout(() => {
  // If we get here without errors, the app started successfully
  console.log('\n✓ Electron app started successfully (no module errors)');
  child.kill();
  process.exit(0);
}, STARTUP_TIMEOUT_MS);

child.on('error', (err) => {
  clearTimeout(timeout);
  console.error('\n✗ Failed to spawn Electron:', err.message);
  process.exit(1);
});

child.on('close', (code) => {
  clearTimeout(timeout);

  // Check for module loading errors in output
  const moduleError = /Cannot find module|Module not found|Error: Cannot find/i;
  if (moduleError.test(stderr) || moduleError.test(stdout)) {
    console.error('\n✗ Module loading error detected');
    process.exit(1);
  }

  // Non-zero exit before timeout typically means a startup error
  if (code !== null && code !== 0) {
    console.error(`\n✗ Electron exited with code ${code}`);
    process.exit(1);
  }

  // App closed cleanly (might have been killed or closed itself)
  console.log('\n✓ Electron startup test passed');
  process.exit(0);
});
