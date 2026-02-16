import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import type { Page, ElectronApplication } from '@playwright/test';

test.describe('Debug Ralph Panel', () => {
  let electronApp: ElectronApplication;
  let window: Page;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });

    window = await electronApp.firstWindow();

    // Set desktop viewport
    await window.setViewportSize({ width: 1280, height: 800 });
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(2000);
  });

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('Debug Agent Loops button', async () => {
    // Send a message to create a tab
    const chatInput = window.locator('textarea[placeholder*="Ask Cooper"]');
    await chatInput.fill('Hello');
    await chatInput.press('Enter');

    // Wait for tab to be created
    await window.waitForTimeout(2000);

    // Check tab structure
    const tabElements = window.locator('[role="tab"]');
    const tabCount = await tabElements.count();
    console.log(`\n=== Tab count after sending message: ${tabCount} ===`);

    // Check model selector
    const modelSelector = window.locator('[data-tour="model-selector"]');
    const modelCount = await modelSelector.count();
    console.log(`Model selector: ${modelCount} elements`);

    // Try to find the loops button with data-tour
    const loopsBtnData = window.locator('[data-tour="agent-modes"]');
    const dataCount = await loopsBtnData.count();
    console.log(`Loops button (data-tour): ${dataCount} elements`);

    if (dataCount > 0) {
      console.log('SUCCESS! Top bar is now visible!');
    } else {
      console.log('FAILED: Top bar still not visible after creating tab');
    }

    // Take screenshot to see what the UI looks like
    await window.screenshot({
      path: 'evidence/debug-ralph-withtab.png',
      fullPage: true,
    });
  });
});
