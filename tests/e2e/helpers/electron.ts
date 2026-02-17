import { _electron as electron, ElectronApplication } from '@playwright/test';
import path from 'path';
import os from 'os';
import fs from 'fs';

/**
 * Launches Electron app with a unique user data directory per worker
 * This allows parallel test execution without singleton lock conflicts
 */
export async function launchElectronApp(): Promise<ElectronApplication> {
  // Create unique user data dir for this worker
  const workerId = process.env.TEST_WORKER_INDEX || '0';
  const userDataDir = path.join(os.tmpdir(), `cooper-test-${workerId}-${Date.now()}`);

  // Ensure directory exists
  fs.mkdirSync(userDataDir, { recursive: true });

  const electronApp = await electron.launch({
    args: [path.join(__dirname, '../../out/main/index.js'), `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });

  return electronApp;
}

/**
 * Clean up test user data directory
 */
export async function cleanupUserDataDir(electronApp: ElectronApplication) {
  try {
    await electronApp?.close();
  } catch (e) {
    console.error('Error closing Electron app:', e);
  }
}
