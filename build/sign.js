// Custom macOS code signing script for CI.
// Bypasses electron-builder's internal keychain management which hangs on GitHub Actions.
// Calls codesign directly with explicit --keychain to avoid UI prompts.

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * @param {import('electron-builder').CustomMacSign} context
 */
exports.default = async function sign(context) {
  // Log context keys for debugging in CI
  console.log(`  • Custom sign context keys: ${Object.keys(context).join(', ')}`);

  const { appPath, entitlements, keychain, identity } = getSigningParams(context);

  if (!identity) {
    console.log('  • No signing identity found, skipping code signing');
    return;
  }

  console.log(`  • Custom sign: identity=${identity}`);
  console.log(`  • Custom sign: keychain=${keychain || 'default'}`);
  console.log(`  • Custom sign: entitlements=${entitlements}`);

  // Sign inside-out: frameworks and helpers first, then main app
  const frameworksDir = path.join(appPath, 'Contents', 'Frameworks');

  if (fs.existsSync(frameworksDir)) {
    // 1. Sign all .dylib files
    const dylibs = findFiles(frameworksDir, '.dylib');
    for (const dylib of dylibs) {
      codesign(dylib, { identity, keychain });
    }

    // 2. Sign all .so files
    const soFiles = findFiles(frameworksDir, '.so');
    for (const so of soFiles) {
      codesign(so, { identity, keychain });
    }

    // 3. Sign helper apps (inside .app bundles within Frameworks)
    const helperApps = fs
      .readdirSync(frameworksDir)
      .filter((f) => f.endsWith('.app'))
      .map((f) => path.join(frameworksDir, f));

    for (const helperApp of helperApps) {
      codesign(helperApp, { identity, keychain, entitlements, deep: false, options: 'runtime' });
    }

    // 4. Sign framework bundles
    const frameworks = fs
      .readdirSync(frameworksDir)
      .filter((f) => f.endsWith('.framework'))
      .map((f) => path.join(frameworksDir, f));

    for (const framework of frameworks) {
      codesign(framework, { identity, keychain });
    }
  }

  // 5. Sign the main app bundle last
  codesign(appPath, { identity, keychain, entitlements, deep: false, options: 'runtime' });

  console.log('  • Custom sign: complete');
};

function getSigningParams(context) {
  // electron-builder passes: { app, identity, keychain, optionsForFile, ... }
  const appPath = context.app || context.path || context.appPath;
  const entitlements = process.env.CSC_ENTITLEMENTS || null;
  const keychain = context.keychain || process.env.CSC_KEYCHAIN || null;

  // Identity comes as a hash string directly on the opts object
  let identity = null;
  if (typeof context.identity === 'string' && context.identity.length > 0) {
    identity = context.identity;
  } else if (process.env.CSC_NAME) {
    identity = process.env.CSC_NAME;
  }

  return { appPath, entitlements, keychain, identity };
}

function codesign(target, { identity, keychain, entitlements, deep = false, options = null }) {
  const args = ['codesign', '--force', '--sign', identity, '--timestamp'];

  if (keychain) {
    args.push('--keychain', keychain);
  }
  if (entitlements) {
    args.push('--entitlements', entitlements);
  }
  if (options) {
    args.push('--options', options);
  }
  if (deep) {
    args.push('--deep');
  }

  args.push(target);

  const label = path.basename(target);
  console.log(`  • codesign: ${label}`);

  try {
    execSync(args.map((a) => `"${a}"`).join(' '), {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120_000, // 2 minute timeout per binary
    });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : '';
    // "is already signed" is fine
    if (stderr.includes('is already signed')) {
      return;
    }
    console.error(`  ✗ codesign failed for ${label}: ${stderr || err.message}`);
    throw err;
  }
}

function findFiles(dir, ext) {
  const results = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory() && !entry.name.endsWith('.app')) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        results.push(full);
      }
    }
  };
  walk(dir);
  return results;
}
