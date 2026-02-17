/**
 * Simple test to capture Ralph/Lisa mode toggles
 */
import { test, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import { scrollIntoViewAndClick } from './helpers/viewport';

let electronApp: ElectronApplication;
let page: Page;

test.describe('Ralph/Lisa Mode Screenshots', () => {
  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.js')],
    });
    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
  });

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('Capture Ralph and Lisa mode toggles', async () => {
    // Click the expand chevron near input to show mode options
    const chevron = page.locator('button svg').first().locator('..');
    await scrollIntoViewAndClick(chevron, { timeout: 15000 });
    await page.waitForTimeout(1000);

    // Screenshot showing expanded input area with Ralph/Lisa
    await page.screenshot({
      path: 'evidence/screenshots/08-ralph-lisa-modes.png',
    });

    // Try clicking Ralph button
    const ralphButton = page.locator('button').filter({ hasText: 'Ralph' }).first();
    if (await ralphButton.isVisible({ timeout: 5000 })) {
      await scrollIntoViewAndClick(ralphButton);
      await page.waitForTimeout(500);
      await page.screenshot({
        path: 'evidence/screenshots/09-ralph-mode-enabled.png',
      });
    }

    // Try clicking Lisa button
    const lisaButton = page.locator('button').filter({ hasText: 'Lisa' }).first();
    if (await lisaButton.isVisible({ timeout: 5000 })) {
      await scrollIntoViewAndClick(lisaButton);
      await page.waitForTimeout(500);
      await page.screenshot({
        path: 'evidence/screenshots/10-lisa-mode-enabled.png',
      });
    }

    // Final overview
    await page.screenshot({
      path: 'evidence/screenshots/11-final-state.png',
    });
  });
});
