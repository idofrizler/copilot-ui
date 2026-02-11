// Custom macOS code signing script for CI.
// Bypasses electron-builder's internal @electron/osx-sign which hangs on GitHub Actions.
// Scans the entire .app bundle for Mach-O binaries and signs them inside-out.
//
// Follows Apple's "Creating Distribution-Signed Code for Mac" best practices:
//   - Libraries (.dylib, .so, .node): --timestamp only
//   - Framework bundles: --timestamp only
//   - Standalone executables: --timestamp --options runtime
//   - App bundles (.app): --timestamp --options runtime --entitlements
//   - Sign inside-out (deepest paths first)
//   - Never use --deep

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * @param {import('electron-builder').CustomMacSign} context
 */
exports.default = async function sign(context) {
  console.log(`  • Custom sign context keys: ${Object.keys(context).join(', ')}`);

  const { appPath, entitlements, keychain, identity } = getSigningParams(context);

  if (!identity) {
    console.log('  • No signing identity found, skipping code signing');
    return;
  }

  console.log(`  • Custom sign: identity=${identity}`);
  console.log(`  • Custom sign: keychain=${keychain || 'default'}`);
  console.log(`  • Custom sign: entitlements=${entitlements}`);
  console.log(`  • Custom sign: scanning ${appPath} for signable binaries...`);

  // Collect everything that needs signing, categorized per Apple docs
  const libraries = []; // .dylib, .so, .node — no hardened runtime needed
  const executables = []; // standalone Mach-O executables — need hardened runtime
  const frameworkBundles = []; // .framework directories — timestamp only
  const appBundles = []; // .app directories (helpers, NOT the main app)

  walkForSignables(appPath, libraries, executables, frameworkBundles, appBundles);

  // Sort by path depth (deepest first) for inside-out signing
  const byDepthDesc = (a, b) => b.split(path.sep).length - a.split(path.sep).length;
  libraries.sort(byDepthDesc);
  executables.sort(byDepthDesc);
  frameworkBundles.sort(byDepthDesc);
  appBundles.sort(byDepthDesc);

  console.log(
    `  • Found: ${libraries.length} libraries, ${executables.length} executables, ${frameworkBundles.length} frameworks, ${appBundles.length} helper apps`
  );

  // 1. Sign libraries (timestamp only, per Apple docs — no hardened runtime on library code)
  for (const lib of libraries) {
    codesign(lib, { identity, keychain });
  }

  // 2. Sign standalone executables (hardened runtime required for notarization)
  for (const exe of executables) {
    codesign(exe, { identity, keychain, options: 'runtime' });
  }

  // 3. Sign framework bundles (timestamp only)
  for (const fw of frameworkBundles) {
    codesign(fw, { identity, keychain });
  }

  // 4. Sign helper .app bundles (hardened runtime + entitlements)
  for (const app of appBundles) {
    codesign(app, { identity, keychain, entitlements, options: 'runtime' });
  }

  // 5. Sign the main app bundle last
  codesign(appPath, { identity, keychain, entitlements, options: 'runtime' });

  console.log('  • Custom sign: complete');
};

/**
 * Recursively walk the .app bundle and collect all signable items.
 * Categorizes into libraries vs executables using the `file` command,
 * per Apple's signing guidelines.
 */
function walkForSignables(appPath, libraries, executables, frameworkBundles, appBundles) {
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isSymbolicLink()) {
        continue; // Never sign symlinks
      }

      if (entry.isDirectory()) {
        if (entry.name.endsWith('.framework')) {
          walk(fullPath);
          frameworkBundles.push(fullPath);
        } else if (entry.name.endsWith('.app') && fullPath !== appPath) {
          walk(fullPath);
          appBundles.push(fullPath);
        } else {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const type = getMachOType(fullPath);
        if (type === 'library') {
          libraries.push(fullPath);
        } else if (type === 'executable') {
          executables.push(fullPath);
        }
      }
    }
  };

  walk(appPath);
}

/**
 * Determine the Mach-O type of a file.
 * Returns 'library', 'executable', or null (not a Mach-O binary).
 *
 * Per Apple docs:
 *   - "Mach-O ... dynamically linked shared library" → library (no runtime needed)
 *   - "Mach-O ... bundle" → library (.node files, no runtime needed)
 *   - "Mach-O ... executable" → executable (needs hardened runtime)
 */
function getMachOType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  // Known library extensions — fast path, skip `file` command
  if (['.dylib', '.so', '.node'].includes(ext)) {
    return 'library';
  }

  // Skip known non-binary extensions
  const skipExts = [
    '.js',
    '.json',
    '.ts',
    '.map',
    '.html',
    '.css',
    '.svg',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.ico',
    '.icns',
    '.plist',
    '.strings',
    '.nib',
    '.lproj',
    '.md',
    '.txt',
    '.yml',
    '.yaml',
    '.xml',
    '.sh',
    '.pak',
    '.dat',
    '.bin',
    '.asar',
    '.license',
    '.cfg',
    '.conf',
    '.ini',
    '.env',
    '.bak',
  ];
  if (skipExts.includes(ext)) {
    return null;
  }

  // For extensionless files or unknown extensions, use `file` to classify
  try {
    const output = execSync(`file -b "${filePath}"`, {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();

    if (!output.includes('Mach-O')) {
      return null;
    }

    // Apple's `file` output distinguishes these Mach-O types:
    //   "Mach-O 64-bit executable"
    //   "Mach-O 64-bit dynamically linked shared library"
    //   "Mach-O 64-bit bundle"
    //   "Mach-O universal binary with ..." (check sub-types)
    if (output.includes('executable')) {
      return 'executable';
    }
    // shared libraries and bundles are library code
    return 'library';
  } catch {
    return null;
  }
}

function getSigningParams(context) {
  const appPath = context.app || context.path || context.appPath;
  const entitlements =
    process.env.CSC_ENTITLEMENTS || context.entitlements || context.entitlementsInherit || null;
  const keychain = context.keychain || process.env.CSC_KEYCHAIN || null;

  let identity = null;
  if (typeof context.identity === 'string' && context.identity.length > 0) {
    identity = context.identity;
  } else if (process.env.CSC_NAME) {
    identity = process.env.CSC_NAME;
  }

  return { appPath, entitlements, keychain, identity };
}

function codesign(target, { identity, keychain, entitlements = null, options = null }) {
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

  args.push(target);

  // Show relative path from the .app for readability
  const label = target.includes('.app/') ? target.split('.app/').pop() : path.basename(target);
  console.log(`  • codesign: ${label}`);

  try {
    execSync(args.map((a) => `"${a}"`).join(' '), {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120_000,
    });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : '';
    if (stderr.includes('is already signed')) {
      return;
    }
    console.error(`  ✗ codesign failed for ${label}: ${stderr || err.message}`);
    throw err;
  }
}
