const { homedir } = require('os');
const { join } = require('path');
const { execSync } = require('child_process');

process.env.XDG_STATE_HOME = join(homedir(), '.cooper-dev');
execSync('electron-vite dev', { stdio: 'inherit', env: process.env });
