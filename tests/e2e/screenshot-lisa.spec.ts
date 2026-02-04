import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';

let electronApp: ElectronApplication;
let window: Page;

const screenshotPath = path.join(__dirname, '../../evidence/screenshots/06-lisa-option.png');

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../out/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });

  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(2000);
});

test.afterAll(async () => {
  await electronApp?.close();
});

test('capture Lisa Simpson option in CreateWorktreeSession', async () => {
  const agentModeBtn = window.locator('button[title*="Agent Modes"]').first();
  if (await agentModeBtn.isVisible().catch(() => false)) {
    await agentModeBtn.click();
    await window.waitForTimeout(500);
  }

  await expect(window.locator('text=Lisa Simpson').first()).toBeVisible({ timeout: 10000 });

  await window.screenshot({ path: screenshotPath, fullPage: true });
});
