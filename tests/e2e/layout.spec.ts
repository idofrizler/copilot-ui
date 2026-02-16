import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';

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

  // Set desktop viewport size (tests should run in desktop mode, not mobile)
  await window.setViewportSize({ width: 1280, height: 800 });
  await window.waitForLoadState('domcontentloaded');

  // Create a session by sending a message (required for top bar to appear)
  await window.waitForTimeout(2000);
  const chatInput = window.locator('textarea[placeholder*="Ask Cooper"]');
  await chatInput.fill('test');
  await chatInput.press('Enter');
  await window.waitForTimeout(2000); // Wait for session and top bar to render
});

test.afterAll(async () => {
  await electronApp?.close();
});

test.describe('Window Layout', () => {
  test('should have platform-appropriate title bar layout', async () => {
    await window.waitForTimeout(2000);

    const platform = process.platform;

    if (platform === 'win32') {
      // On Windows, the spacer for native title bar overlay controls should be present
      const windowsSpacer = window.locator('[data-testid="windows-controls-spacer"]');
      await expect(windowsSpacer).toHaveCount(1);
      const hasWidthClass = await windowsSpacer.evaluate((el) =>
        el.classList.contains('w-[138px]')
      );
      expect(hasWidthClass).toBe(true);

      // WindowControls (traffic lights) should NOT be present on Windows
      const trafficLights = window.locator('[aria-label="Close window"]');
      await expect(trafficLights).toHaveCount(0);
    } else {
      // On macOS/Linux, WindowControls should be present
      const closeButton = window.locator('[aria-label="Close window"]');
      await expect(closeButton).toHaveCount(1);

      // Windows spacer should NOT be present
      const windowsSpacer = window.locator('[data-testid="windows-controls-spacer"]');
      await expect(windowsSpacer).toHaveCount(0);
    }
  });

  test('should have model selector visible and not obscured', async () => {
    await window.waitForTimeout(1000);

    const modelSelector = window.locator('[data-tour="model-selector"]');
    await expect(modelSelector).toBeVisible({ timeout: 10000 });
  });

  test('should have title bar visible', async () => {
    await window.waitForTimeout(1000);

    const titleBar = window.locator('.drag-region').first();
    await expect(titleBar).toBeVisible({ timeout: 5000 });
  });
});
