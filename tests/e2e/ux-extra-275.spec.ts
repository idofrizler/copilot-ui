import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';

let electronApp: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../out/main/index.js')],
    env: { ...process.env, NODE_ENV: 'test' },
  });
  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(3000);
});

test.afterAll(async () => {
  await electronApp?.close();
});

const screenshotDir = path.join(__dirname, '../../evidence/screenshots');

test.describe('Issue #275 - Extra Evidence', () => {
  test('12 - Collapse right panel to show Environment label', async () => {
    // Click the collapse chevron on the right panel
    const collapseBtn = window.locator('button[title="Collapse environment panel"]');
    if (await collapseBtn.isVisible()) {
      await collapseBtn.click();
      await window.waitForTimeout(500);
    }
    await window.screenshot({ path: `${screenshotDir}/12-environment-collapsed.png` });

    // Re-expand the panel
    const expandBtn = window.locator('button[title="Show environment panel"]');
    if (await expandBtn.isVisible()) {
      await expandBtn.click();
      await window.waitForTimeout(500);
    }
  });

  test('13 - Loops selector shows Ralph label when enabled', async () => {
    // Open loops, select Ralph
    const loopsButton = window.locator('[data-tour="agent-modes"] button').first();
    await loopsButton.click();
    await window.waitForTimeout(500);
    const ralphBtn = window.locator('[data-tour="agent-modes-panel"]').getByText('Ralph');
    await ralphBtn.click();
    await window.waitForTimeout(300);
    // Close dropdown
    await window.locator('body').click({ position: { x: 10, y: 10 } });
    await window.waitForTimeout(300);
    // Screenshot shows "Ralph" in top bar
    await window.screenshot({ path: `${screenshotDir}/13-topbar-ralph-active.png` });

    // Disable Ralph
    await loopsButton.click();
    await window.waitForTimeout(500);
    const offBtn = window.locator('[data-tour="agent-modes-panel"]').getByText('Off');
    await offBtn.click();
    await window.waitForTimeout(300);
    await window.locator('body').click({ position: { x: 10, y: 10 } });
    await window.waitForTimeout(300);
  });

  test('14 - Terminal icon does NOT rotate', async () => {
    // Take screenshot with terminal closed - icon should be same orientation
    await window.screenshot({ path: `${screenshotDir}/14-terminal-icon-closed.png` });
    // Open terminal
    const termBtn = window.locator('[data-tour="terminal-toggle"]');
    await termBtn.click();
    await window.waitForTimeout(800);
    // Take screenshot with terminal open - icon should NOT be rotated
    await window.screenshot({ path: `${screenshotDir}/14-terminal-icon-open.png` });
    // Close
    await termBtn.click();
    await window.waitForTimeout(500);
  });

  test('15 - Model selector with favorites toggle', async () => {
    const modelButton = window.locator('[data-tour="model-selector"] button').first();
    await modelButton.click();
    await window.waitForTimeout(500);
    // Click a star to toggle favorite
    const stars = window.locator('[data-tour="model-selector"] .shrink-0.text-copilot-text-muted');
    if (await stars.first().isVisible()) {
      await stars.first().click();
      await window.waitForTimeout(300);
    }
    await window.screenshot({ path: `${screenshotDir}/15-model-favorites.png` });
    // Close
    await window.locator('body').click({ position: { x: 10, y: 10 } });
    await window.waitForTimeout(300);
  });
});
