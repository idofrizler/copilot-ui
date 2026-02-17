import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import path from 'path';

test.describe('Debug Mic Button Crash', () => {
  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test', // Use test mode to avoid DevTools
      },
    });

    // Get all windows and find the main one (not DevTools)
    const windows = electronApp.windows();
    console.log(`Found ${windows.length} windows`);

    // Wait for the main window
    page = await electronApp.firstWindow();

    // If we got devtools, wait for another window
    const title = await page.title();
    console.log(`First window title: ${title}`);

    if (title.includes('DevTools') || title === '') {
      // Wait for another window
      page = await electronApp.waitForEvent('window', { timeout: 10000 });
      console.log(`Second window title: ${await page.title()}`);
    }

    await page.waitForLoadState('domcontentloaded');

    // Capture console messages
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`[Browser ${msg.type()}]: ${msg.text()}`);
      }
    });

    // Capture page errors
    page.on('pageerror', (error) => {
      console.error(`[Page Error]: ${error.message}`);
    });

    // Wait for app to fully load
    await page.waitForTimeout(5000);
  });

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('debug mic button click', async () => {
    // Take screenshot before clicking
    await page.screenshot({ path: 'test-results/before-mic-click.png' });

    // First check if electronAPI exists
    const hasElectronAPI = await page.evaluate(() => {
      return typeof (window as any).electronAPI !== 'undefined';
    });
    console.log(`electronAPI exists: ${hasElectronAPI}`);

    if (!hasElectronAPI) {
      console.log('electronAPI not found - checking window properties...');
      const windowKeys = await page.evaluate(() => Object.keys(window).slice(0, 20));
      console.log('Window keys:', windowKeys);
      return;
    }

    // Check if voiceServer exists
    const hasVoiceServer = await page.evaluate(() => {
      return typeof (window as any).electronAPI?.voiceServer !== 'undefined';
    });
    console.log(`voiceServer exists: ${hasVoiceServer}`);

    // Check if mic button exists
    const micButton = page.locator('[data-testid="mic-button"]');
    const exists = await micButton.count();
    console.log(`Mic button count: ${exists}`);

    if (exists === 0) {
      // Try to find the textarea first to confirm we're on the right page
      const textarea = page.locator('textarea');
      const textareaCount = await textarea.count();
      console.log(`Textarea count: ${textareaCount}`);

      // Look for mic-button class
      const micButtonByClass = page.locator('.mic-button');
      const micByClassCount = await micButtonByClass.count();
      console.log(`Mic button by class count: ${micByClassCount}`);

      await page.screenshot({ path: 'test-results/no-mic-button.png' });
      return;
    }

    // Check voiceServer status before click
    const statusBefore = await page.evaluate(async () => {
      try {
        return await (window as any).electronAPI.voiceServer.getStatus();
      } catch (e) {
        return { error: String(e) };
      }
    });
    console.log('Voice server status before click:', statusBefore);

    // Try clicking with error handling
    try {
      console.log('About to click mic button...');
      await micButton.click({ timeout: 5000 });
      console.log('Mic button clicked successfully');

      // Wait and check status
      await page.waitForTimeout(2000);

      const statusAfter = await page.evaluate(async () => {
        try {
          return await (window as any).electronAPI.voiceServer.getStatus();
        } catch (e) {
          return { error: String(e) };
        }
      });
      console.log('Voice server status after click:', statusAfter);

      // Take screenshot after clicking
      await page.screenshot({ path: 'test-results/after-mic-click.png' });
    } catch (error) {
      console.error('Error during mic button click:', error);
      await page.screenshot({ path: 'test-results/mic-click-error.png' });
      throw error;
    }
  });

  test('test voice server IPC directly', async () => {
    // First check electronAPI
    const hasElectronAPI = await page.evaluate(() => {
      return typeof (window as any).electronAPI !== 'undefined';
    });

    if (!hasElectronAPI) {
      console.log('Skipping IPC test - electronAPI not available');
      return;
    }

    // Test getStatus
    const status = await page.evaluate(async () => {
      try {
        return await (window as any).electronAPI.voiceServer.getStatus();
      } catch (e) {
        return { error: String(e) };
      }
    });
    console.log('getStatus result:', status);

    // Test getUrl
    const url = await page.evaluate(async () => {
      try {
        return await (window as any).electronAPI.voiceServer.getUrl();
      } catch (e) {
        return { error: String(e) };
      }
    });
    console.log('getUrl result:', url);

    // Test start (this might cause the crash)
    console.log('About to call voiceServer.start()...');
    const startResult = await page.evaluate(async () => {
      try {
        return await (window as any).electronAPI.voiceServer.start();
      } catch (e) {
        return { error: String(e) };
      }
    });
    console.log('start result:', startResult);

    // Wait a bit
    await page.waitForTimeout(3000);

    // Check status again
    const statusAfterStart = await page.evaluate(async () => {
      try {
        return await (window as any).electronAPI.voiceServer.getStatus();
      } catch (e) {
        return { error: String(e) };
      }
    });
    console.log('Status after start:', statusAfterStart);
  });
});
