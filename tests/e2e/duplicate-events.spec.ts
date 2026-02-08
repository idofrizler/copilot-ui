import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';

// Test to verify that session events are not duplicated
// This bug was reported where events would fire twice after model changes

let electronApp: ElectronApplication;
let window: Page;
let mainProcessLogs: string[] = [];

test.setTimeout(60000); // 60 second timeout

test.beforeAll(async () => {
  mainProcessLogs = [];

  // Launch Electron app with Playwright's proper electron support
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../out/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });

  // Capture main process stdout/stderr
  electronApp.process().stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        mainProcessLogs.push(line);
      }
    }
  });

  electronApp.process().stderr?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        mainProcessLogs.push(line);
      }
    }
  });

  // Wait for the first window
  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  // Wait for initial session to be created
  await window.waitForTimeout(5000);
});

test.afterAll(async () => {
  await electronApp?.close();
});

test.describe('Duplicate Events Bug', () => {
  test('should not have duplicate events logged', async () => {
    // Wait for app to fully initialize and process some events
    await window.waitForTimeout(3000);

    // Analyze logs for consecutive duplicate events
    // (same session, same event type logged twice in a row)
    let duplicateCount = 0;
    for (let i = 1; i < mainProcessLogs.length; i++) {
      const curr = mainProcessLogs[i];
      const prev = mainProcessLogs[i - 1];

      const currMatch = curr.match(/\[(session-[^\]]+)\] Event.*: (\S+)/);
      const prevMatch = prev.match(/\[(session-[^\]]+)\] Event.*: (\S+)/);

      if (currMatch && prevMatch) {
        if (currMatch[1] === prevMatch[1] && currMatch[2] === prevMatch[2]) {
          console.log(`DUPLICATE FOUND: ${currMatch[1]} ${currMatch[2]}`);
          duplicateCount++;
        }
      }
    }

    console.log(`Found ${duplicateCount} duplicate events`);
    expect(duplicateCount).toBe(0);
  });
});
