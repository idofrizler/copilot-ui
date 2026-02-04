import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';

let electronApp: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  // Launch Electron app
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../out/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });
  
  // Wait for the first window
  window = await electronApp.firstWindow();
  
  // Wait for app to be ready
  await window.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await electronApp?.close();
});

test.describe('Window Controls Layout', () => {
  test('should reserve space for native window controls on Windows', async () => {
    // Wait for the app to load
    await window.waitForSelector('.drag-region');

    // Screenshot the top right area to verify layout
    // We expect to see space on the right of the Settings dropdown
    await window.screenshot({ path: 'evidence/screenshots/01-window-controls-layout.png' });

    // Verify the spacer exists using JavaScript evaluation since it's conditional
    // The spacer has class w-[140px]
    const spacerExists = await window.evaluate(() => {
      const spacers = document.querySelectorAll('.w-\\[140px\\]');
      return spacers.length > 0;
    });

    // In this test environment (Windows), the spacer SHOULD exist
    expect(spacerExists).toBe(true);

    // Verify the Model Selector is visible
    // The dropdown wrapper has data-tour="model-selector"
    const modelDropdown = window.locator('[data-tour="model-selector"]');
    await expect(modelDropdown).toBeVisible();
    await modelDropdown.screenshot({ path: 'evidence/screenshots/02-model-selector.png' });
    
    // Verify Settings button (Theme dropdown trigger) is visible
    // It's inside a div with class "flex items-center gap-2 no-drag"
    const rightControls = window.locator('.flex.items-center.gap-2.no-drag');
    await expect(rightControls).toBeVisible();
    await rightControls.screenshot({ path: 'evidence/screenshots/03-right-controls.png' });
  });
});
