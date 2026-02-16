import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import { scrollIntoViewAndClick, waitForPanelOpen } from './helpers/viewport';

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

  // Set desktop viewport size (tests should run in desktop mode, not mobile)
  await window.setViewportSize({ width: 1280, height: 800 });
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(3000);
});

test.afterAll(async () => {
  await electronApp?.close();
});

test('capture Lisa Simpson option in CreateWorktreeSession', async () => {
  const agentModeBtn = window.locator('button[title*="Agent Modes"]').first();
  if (await agentModeBtn.isVisible().catch(() => false)) {
    await scrollIntoViewAndClick(agentModeBtn, { timeout: 15000 });
    await waitForPanelOpen(window, 'Agent Modes', { timeout: 20000 });
  }

  await expect(window.locator('text=Lisa Simpson').first()).toBeVisible({ timeout: 15000 });

  await window.screenshot({ path: screenshotPath, fullPage: true });
});
