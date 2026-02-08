import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';

// Test to verify that session events are not duplicated
// This bug was reported where events would fire twice after model changes

let electronApp: ElectronApplication;
let window: Page;
let mainProcessLogs: string[] = [];

test.setTimeout(90000); // 90 second timeout

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
  // Print relevant logs for debugging
  console.log('\n=== RELEVANT LOGS ===');
  for (const log of mainProcessLogs) {
    if (
      log.includes('Event:') ||
      log.includes('Registering') ||
      log.includes('Unsubscribing') ||
      log.includes('BLOCKED') ||
      log.includes('Changing model')
    ) {
      console.log(log);
    }
  }
  console.log('=== END LOGS ===\n');

  await electronApp?.close();
});

test.describe('Duplicate Events Bug', () => {
  test('should not have duplicate events after model change and message', async () => {
    // Wait for app to fully initialize
    await window.waitForTimeout(3000);

    // Find and click on model dropdown to change model
    const modelButton = window
      .locator('button')
      .filter({ hasText: /gpt-|claude-|gemini/i })
      .first();

    if (await modelButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Found model button, clicking...');
      await modelButton.click();
      await window.waitForTimeout(1000);

      // Look for a different model option (GPT-4.1 is usually available and cheap)
      const modelOption = window
        .locator('[role="menuitem"], [role="option"], button')
        .filter({ hasText: /gpt-4\.1/i })
        .first();

      if (await modelOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('Found GPT-4.1 option, selecting...');
        await modelOption.click();
        await window.waitForTimeout(3000);
      } else {
        // Try pressing Escape to close any open menu
        await window.keyboard.press('Escape');
        console.log('Could not find model option');
      }
    } else {
      console.log('Could not find model button');
    }

    // Now send a message to trigger events
    const textarea = window.locator('textarea').first();
    if (await textarea.isVisible({ timeout: 2000 })) {
      await textarea.fill('hi');
      await window.keyboard.press('Enter');

      // Wait for response
      await window.waitForTimeout(10000);
    }

    // Analyze logs for consecutive duplicate events
    let duplicateCount = 0;
    for (let i = 1; i < mainProcessLogs.length; i++) {
      const curr = mainProcessLogs[i];
      const prev = mainProcessLogs[i - 1];

      const currMatch = curr.match(/\[(session-[^\]]+)\] Event: (\S+)/);
      const prevMatch = prev.match(/\[(session-[^\]]+)\] Event: (\S+)/);

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
