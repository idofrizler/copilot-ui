#!/usr/bin/env node

/**
 * Postinstall script that handles platform-specific native module setup.
 * Replaces inline shell commands for better error handling and cross-platform support.
 *
 * Steps:
 * 1. Apply patches via patch-package
 * 2. Rebuild node-pty for Electron (with graceful failure on missing prerequisites)
 * 3. Code-sign Electron binary on macOS
 */

const { execSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');

const isWindows = process.platform === 'win32';
const isMacOS = process.platform === 'darwin';

function run(cmd, options = {}) {
  try {
    execSync(cmd, { stdio: 'inherit', ...options });
    return true;
  } catch (error) {
    if (options.optional) {
      return false;
    }
    throw error;
  }
}

// Step 1: Apply patches
console.log('\n📦 Applying patches...');
run('npx patch-package');

// Step 2: Rebuild node-pty for Electron
console.log('\n🔨 Rebuilding node-pty for Electron...');
const rebuilt = run('npx @electron/rebuild -w node-pty', { optional: true });

if (!rebuilt) {
  console.warn('\n⚠️  node-pty rebuild failed.');
  if (isWindows) {
    console.warn('   On Windows, node-pty requires:');
    console.warn('   • Python 3.x (https://www.python.org/downloads/)');
    console.warn('   • Visual Studio Build Tools with "Desktop development with C++" workload');
    console.warn(
      '   Install prerequisites: npm install --global windows-build-tools (run as Admin)'
    );
    console.warn('   Or install manually: https://github.com/nodejs/node-gyp#on-windows');
  } else {
    console.warn('   Ensure build tools are installed (make, gcc/clang, python3).');
  }
  console.warn('   The terminal feature will not work until node-pty is rebuilt.');
  console.warn('   Run "npm run rebuild-pty" after installing prerequisites.\n');
}

// Step 3: Code-sign Electron on macOS
if (isMacOS) {
  const entitlements = join(__dirname, '..', 'build', 'entitlements.mac.plist');
  const electronApp = join(__dirname, '..', 'node_modules', 'electron', 'dist', 'Electron.app');

  if (existsSync(entitlements) && existsSync(electronApp)) {
    console.log('\n🔏 Code-signing Electron binary...');
    run(`codesign --force --deep --sign - --entitlements ${entitlements} ${electronApp}`, {
      optional: true,
    });
  }
}

console.log('\n✅ Postinstall complete.\n');
