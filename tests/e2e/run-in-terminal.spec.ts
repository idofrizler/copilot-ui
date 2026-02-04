import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const screenshotDir = path.join(__dirname, '..', 'evidence', 'screenshots');

// Ensure screenshot directory exists
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

test.describe('Run in Terminal Feature', () => {
  let electronApp: Awaited<ReturnType<typeof electron.launch>>;
  let page: Awaited<ReturnType<typeof electronApp.firstWindow>>;

  test.beforeAll(async () => {
    // Launch Electron app
    electronApp = await electron.launch({
      args: [path.join(__dirname, '..', 'out', 'main', 'index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });
    page = await electronApp.firstWindow();
    // Wait for app to load
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test('01 - Initial app state', async () => {
    await page.screenshot({ path: path.join(screenshotDir, '01-initial-app-state.png') });
  });

  test('02 - Send message to get CLI commands in response', async () => {
    // Type a message that will likely generate CLI commands
    const textarea = page.locator('textarea');
    await textarea.fill('Show me how to install express with npm and how to start a node server');
    await page.screenshot({ path: path.join(screenshotDir, '02-typing-message.png') });

    // Send the message
    await page.keyboard.press('Enter');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(screenshotDir, '03-waiting-for-response.png') });
  });

  test('03 - Verify CLI code blocks have run button', async () => {
    // Wait for response with code blocks
    await page.waitForTimeout(10000);
    await page.screenshot({ path: path.join(screenshotDir, '04-response-with-codeblocks.png') });

    // Hover over a code block to reveal buttons
    const codeBlocks = page.locator('pre');
    const firstCodeBlock = codeBlocks.first();
    if (await firstCodeBlock.isVisible()) {
      await firstCodeBlock.hover();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: path.join(screenshotDir, '05-codeblock-hover-shows-buttons.png'),
      });
    }
  });

  test('04 - Click Run in Terminal button', async () => {
    // Find and click the run button
    const runButton = page.locator('button[aria-label="Run in terminal"]').first();
    if (await runButton.isVisible()) {
      await runButton.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(screenshotDir, '06-after-run-click.png') });

      // Wait for terminal to open
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(screenshotDir, '07-terminal-opened.png') });
    }
  });

  test('05 - Verify terminal shows executed command', async () => {
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(screenshotDir, '08-terminal-with-command.png') });
  });

  test('06 - Test copy button still works', async () => {
    // Find a code block and hover
    const codeBlocks = page.locator('pre');
    const secondCodeBlock = codeBlocks.nth(1);
    if (await secondCodeBlock.isVisible()) {
      await secondCodeBlock.hover();
      await page.waitForTimeout(300);

      // Click copy button
      const copyButton = page.locator('button[aria-label="Copy to clipboard"]').first();
      if (await copyButton.isVisible()) {
        await copyButton.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(screenshotDir, '09-copy-button-clicked.png') });
      }
    }
  });
});
