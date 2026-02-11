const { homedir } = require('os');
const { join } = require('path');
const { execSync } = require('child_process');

const devHome = join(homedir(), '.cooper-dev');
process.env.XDG_CONFIG_HOME = devHome;
process.env.XDG_STATE_HOME = devHome;
process.env.COPILOT_SESSIONS_HOME = join(devHome, 'sessions');
process.env.COOPER_DEV_MODE = 'true'; // Use isolated electron-store
execSync('electron-vite dev', { stdio: 'inherit', env: process.env });
