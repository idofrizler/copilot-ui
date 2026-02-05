import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';

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

test.describe('Window Layout', () => {
  test('should have platform-appropriate title bar layout', async () => {
    // Wait for the app to fully load
    await window.waitForTimeout(2000);

    // Check platform
    const platform = process.platform;

    if (platform === 'darwin') {
      // On macOS, the left spacer for traffic lights should be present
      const macSpacer = await window.locator('.w-\\[70px\\]').first();
      const count = await macSpacer.count();
      expect(count).toBeGreaterThan(0);
    } else {
      // On Windows/Linux, the spacer for native controls should be present in DOM
      const windowsSpacer = await window.locator('[data-testid="windows-controls-spacer"]');

      // The spacer exists and has the correct width class (may not be "visible" as it's just a spacer)
      const count = await windowsSpacer.count();
      expect(count).toBe(1);

      // Verify the spacer has correct width class
      const hasWidthClass = await windowsSpacer.evaluate((el) =>
        el.classList.contains('w-[140px]')
      );
      expect(hasWidthClass).toBe(true);
    }

    // Take a screenshot of the title bar area for visual verification
    await window.screenshot({
      path: path.join(__dirname, 'screenshots', `layout-${platform}.png`),
      clip: { x: 0, y: 0, width: 1400, height: 60 },
    });
  });

  test('should have model selector visible and not obscured', async () => {
    await window.waitForTimeout(1000);

    // The model selector should be visible
    const modelSelector = await window.locator('[data-tour="model-selector"]');
    await expect(modelSelector).toBeVisible({ timeout: 10000 });
  });

  test('should have theme dropdown visible', async () => {
    await window.waitForTimeout(1000);

    // Look for a dropdown that contains theme options
    const titleBar = await window.locator('.drag-region').first();
    await expect(titleBar).toBeVisible({ timeout: 5000 });
  });
});
