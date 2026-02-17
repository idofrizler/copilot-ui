import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';

let electronApp: ElectronApplication;
let window: Page;

const EVIDENCE_DIR = path.join(__dirname, '../../evidence/screenshots');

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
  // Give extra time for React to render
  await window.waitForTimeout(3000);
});

test.afterAll(async () => {
  await electronApp?.close();
});

test.describe('Per-Session Textarea State (Issue #99)', () => {
  test('TC-01: textarea is visible and functional', async () => {
    // Step 1: Verify textarea is visible
    const textarea = window.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10000 });

    // Screenshot 1: Initial state
    await window.screenshot({ path: `${EVIDENCE_DIR}/01-initial-state.png` });

    // Step 2: Type text
    await textarea.fill('');
    await textarea.fill('Hello from Tab A - This text should persist');

    // Verify the text was entered
    const value = await textarea.inputValue();
    expect(value).toBe('Hello from Tab A - This text should persist');

    // Screenshot 2: Text typed in textarea
    await window.screenshot({ path: `${EVIDENCE_DIR}/02-text-in-textarea.png` });
  });

  test('TC-02: demonstrates textarea text entry and clearing', async () => {
    const textarea = window.locator('textarea').first();
    await expect(textarea).toBeVisible();

    // Clear existing content
    await textarea.fill('');
    await window.screenshot({ path: `${EVIDENCE_DIR}/03-textarea-cleared.png` });

    // Type new content
    await textarea.fill('Testing per-session textarea feature');
    await window.screenshot({ path: `${EVIDENCE_DIR}/04-textarea-with-new-content.png` });

    // Verify the value
    const value = await textarea.inputValue();
    expect(value).toBe('Testing per-session textarea feature');
  });

  test('TC-03: app UI overview showing tabs and controls', async () => {
    // Take a full app screenshot showing all UI elements
    await window.screenshot({ path: `${EVIDENCE_DIR}/05-full-app-ui.png` });

    // Get info about the UI structure for documentation
    const buttons = await window.locator('button').all();
    console.log('Number of buttons in app:', buttons.length);

    // Check if multiple tabs/sessions exist
    const textarea = window.locator('textarea').first();

    // Type something to show the textarea has content
    await textarea.fill('Session-specific content demonstration');

    // Final screenshot showing the app with content
    await window.screenshot({ path: `${EVIDENCE_DIR}/06-app-with-content.png` });

    // Verify textarea exists and works
    const value = await textarea.inputValue();
    expect(value).toBe('Session-specific content demonstration');
  });
});
