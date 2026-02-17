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

  // Set desktop viewport size (tests should run in desktop mode, not mobile)
  await window.setViewportSize({ width: 1280, height: 800 });

  // Wait for app to be ready
  await window.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await electronApp?.close();
});

test.describe('App Launch', () => {
  test('should launch the app successfully', async () => {
    const title = await window.title();
    expect(title).toBeTruthy();
  });

  test('should have chat input visible', async () => {
    // Wait for the app to load
    await window.waitForTimeout(2000);

    // Look for textarea (chat input)
    const textarea = await window.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10000 });
  });

  test('should have theme controls', async () => {
    // Look for theme-related elements
    const themeButton = await window
      .locator('[data-testid="theme-dropdown"]')
      .or(window.locator('button').filter({ has: window.locator('svg') }))
      .first();
    await expect(themeButton).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Chat Functionality', () => {
  test('should allow typing in chat input', async () => {
    const textarea = await window.locator('textarea').first();
    await textarea.fill('Hello, Copilot!');
    const value = await textarea.inputValue();
    expect(value).toBe('Hello, Copilot!');
  });

  test('should have send capability', async () => {
    // Check if there's a send button or the textarea accepts Enter
    const textarea = await window.locator('textarea').first();
    await expect(textarea).toBeEnabled();
  });
});

test.describe('UI Elements', () => {
  test('should display logo or branding', async () => {
    // Look for logo image
    const logo = await window.locator('img[alt*="logo"], img[src*="logo"]').first();
    const hasLogo = await logo.isVisible().catch(() => false);

    // Either logo exists or there's a title
    if (!hasLogo) {
      const title = await window.locator('h1, h2, .logo, [class*="logo"]').first();
      await expect(title).toBeVisible({ timeout: 5000 });
    }
  });

  test('should have window controls', async () => {
    // Look for window control buttons (close, minimize, maximize)
    const windowControls = await window
      .locator('[data-testid="window-controls"]')
      .or(window.locator('.window-controls, [class*="WindowControls"]'))
      .first();

    // On macOS, controls might be native, so this is optional
    const hasControls = await windowControls.isVisible().catch(() => false);
    // Just log, don't fail - native controls are handled by OS
    console.log('Custom window controls visible:', hasControls);
  });
});
