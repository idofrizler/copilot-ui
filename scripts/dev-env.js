const { homedir, platform } = require('os');
const { join } = require('path');
const { execSync } = require('child_process');
const { existsSync, mkdirSync, symlinkSync, lstatSync } = require('fs');

const devHome = join(homedir(), '.cooper-dev');

// On Unix systems, symlink ~/.config/gh to ~/.cooper-dev/gh so gh CLI auth works
// when XDG_CONFIG_HOME is overridden. Windows ignores XDG_CONFIG_HOME entirely.
if (platform() !== 'win32') {
  const ghConfigSource = join(homedir(), '.config', 'gh');
  const ghConfigDest = join(devHome, 'gh');

  if (existsSync(ghConfigSource) && !existsSync(ghConfigDest)) {
    mkdirSync(devHome, { recursive: true });
    try {
      symlinkSync(ghConfigSource, ghConfigDest);
      console.log(`[dev-env] Symlinked ${ghConfigSource} -> ${ghConfigDest}`);
    } catch (err) {
      console.warn(`[dev-env] Could not symlink gh config: ${err.message}`);
    }
  }
}

process.env.XDG_CONFIG_HOME = devHome;
process.env.XDG_STATE_HOME = devHome;
process.env.COPILOT_SESSIONS_HOME = join(devHome, 'sessions');
process.env.COOPER_DEV_MODE = 'true'; // Use isolated electron-store
execSync('electron-vite dev', { stdio: 'inherit', env: process.env });
