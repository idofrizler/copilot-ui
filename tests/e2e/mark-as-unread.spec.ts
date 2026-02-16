/**
 * E2E Test: Mark Session as Unread Feature
 *
 * This test validates the new right-click context menu feature
 * for marking sessions for review with optional notes.
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import { scrollIntoViewAndClick, waitForModal, scrollIntoViewAndWait } from './helpers/viewport';

let electronApp: ElectronApplication;
let window: Page;
const screenshotDir = path.join(__dirname, '../../evidence/screenshots');

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

  // Wait for app to fully load
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(3000); // Extra time for sessions to load
});

test.afterAll(async () => {
  await electronApp?.close();
});

test.describe('Mark Session as Unread Feature', () => {
  test('01 - Initial state shows sessions in sidebar', async () => {
    // Wait for sidebar to be visible
    await window.waitForTimeout(2000);

    // Capture initial state
    await window.screenshot({ path: `${screenshotDir}/01-initial-state.png` });

    // Verify sessions are visible
    const sidebar = window.locator('[data-tour="sidebar-tabs"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
  });

  test('02 - Right-click opens context menu', async () => {
    // Get first session tab
    const firstTab = window.locator('[data-tour="sidebar-tabs"] > div').first();
    await expect(firstTab).toBeVisible({ timeout: 10000 });

    // Right-click to open context menu
    await firstTab.click({ button: 'right' });
    await window.waitForTimeout(1000); // Give context menu time to appear

    // Capture context menu
    await window.screenshot({ path: `${screenshotDir}/02-context-menu-open.png` });

    // Verify menu options with longer timeout
    await expect(window.locator('text=Mark for Review')).toBeVisible({ timeout: 15000 });
    await expect(window.locator('text=Add Note...')).toBeVisible({ timeout: 5000 });
    await expect(window.locator('text=Rename...')).toBeVisible({ timeout: 5000 });
  });

  test('03 - Mark for Review adds blue indicator', async () => {
    // Get first session tab and right-click
    const firstTab = window.locator('[data-tour="sidebar-tabs"] > div').first();
    await expect(firstTab).toBeVisible({ timeout: 10000 });
    await firstTab.click({ button: 'right' });
    await window.waitForTimeout(1000);

    // Click Mark for Review
    const markButton = window.locator('text=Mark for Review');
    await scrollIntoViewAndClick(markButton, { timeout: 10000 });
    await window.waitForTimeout(500);

    // Capture marked state
    await window.screenshot({ path: `${screenshotDir}/03-session-marked.png` });

    // Verify blue indicator is visible
    const blueIndicator = window.locator('.bg-blue-500').first();
    await expect(blueIndicator).toBeVisible({ timeout: 5000 });
  });

  test('04 - Right-click shows Remove Mark option', async () => {
    // Right-click on marked session
    const firstTab = window.locator('[data-tour="sidebar-tabs"] > div').first();
    await scrollIntoViewAndWait(firstTab, { timeout: 10000 });
    await firstTab.click({ button: 'right' });
    await window.waitForTimeout(1000); // Longer wait for context menu

    // Capture menu showing Remove Mark
    await window.screenshot({ path: `${screenshotDir}/04-remove-mark-option.png` });

    // Verify Remove Mark option with longer timeout
    await expect(window.locator('text=Remove Mark')).toBeVisible({ timeout: 15000 });

    // Close menu by pressing Escape
    await window.keyboard.press('Escape');
    await window.waitForTimeout(300);
  });

  test('05 - Add Note opens modal', async () => {
    // Right-click on session
    const firstTab = window.locator('[data-tour="sidebar-tabs"] > div').first();
    await scrollIntoViewAndWait(firstTab, { timeout: 10000 });
    await firstTab.click({ button: 'right' });
    await window.waitForTimeout(1000); // Longer wait for context menu

    // Click Add Note (it should say Edit Note since we already marked it)
    const noteButton = window.locator('text=/Add Note|Edit Note/');
    await scrollIntoViewAndClick(noteButton, { timeout: 15000 });

    // Wait for modal to appear
    await window.waitForTimeout(1000);

    // Capture modal
    await window.screenshot({ path: `${screenshotDir}/05-note-modal-open.png` });

    // Verify modal elements with longer timeouts
    await expect(window.locator('text=/Add Review Note|Edit Review Note/')).toBeVisible({
      timeout: 15000,
    });
    await expect(window.locator('textarea')).toBeVisible({ timeout: 5000 });
    await expect(window.locator('text=Save Note')).toBeVisible({ timeout: 5000 });
  });

  test('06 - Enter note text', async () => {
    // Type a note
    const textarea = window.locator('textarea').last(); // Modal textarea
    await textarea.fill('Remember to review the API changes before merging!');
    await window.waitForTimeout(300);

    // Capture filled modal
    await window.screenshot({ path: `${screenshotDir}/06-note-entered.png` });
  });

  test('07 - Save note shows banner', async () => {
    // Click Save Note
    const saveButton = window.locator('text=Save Note');
    await scrollIntoViewAndClick(saveButton, { timeout: 15000 });
    await window.waitForTimeout(1000);

    // Capture note banner in conversation pane
    await window.screenshot({ path: `${screenshotDir}/07-note-banner-visible.png` });

    // Verify banner is visible with longer timeout
    await expect(window.locator('text=Review Note')).toBeVisible({ timeout: 15000 });
  });

  test('08 - Session shows blue indicator after adding note', async () => {
    // Focus on sidebar to capture indicator
    await window.screenshot({ path: `${screenshotDir}/08-indicator-with-note.png` });

    // Verify blue indicator
    const blueIndicator = window.locator('[data-tour="sidebar-tabs"] .bg-blue-500').first();
    await expect(blueIndicator).toBeVisible({ timeout: 10000 });
  });

  test('09 - Edit Note option appears in context menu', async () => {
    // Right-click on session with note
    const firstTab = window.locator('[data-tour="sidebar-tabs"] > div').first();
    await scrollIntoViewAndWait(firstTab, { timeout: 10000 });
    await firstTab.click({ button: 'right' });
    await window.waitForTimeout(1000); // Longer wait for context menu

    // Capture showing Edit Note option
    await window.screenshot({ path: `${screenshotDir}/09-edit-note-option.png` });

    // Verify Edit Note option with longer timeout
    await expect(window.locator('text=Edit Note...')).toBeVisible({ timeout: 15000 });

    // Close menu
    await window.keyboard.press('Escape');
    await window.waitForTimeout(300);
  });

  test('10 - Dismiss note banner', async () => {
    // Find and click dismiss button on note banner - look for close icon in blue banner
    const dismissButton = window
      .locator('.bg-blue-500\\/10 button, [class*="bg-blue"] button')
      .first();
    await scrollIntoViewAndClick(dismissButton, { timeout: 15000 });
    await window.waitForTimeout(1000);

    // Capture after dismissing
    await window.screenshot({ path: `${screenshotDir}/10-note-dismissed.png` });

    // Verify note banner is gone
    await expect(window.locator('text=Review Note')).not.toBeVisible({ timeout: 5000 });
  });

  test('11 - Remove mark from session', async () => {
    // Right-click on session
    const firstTab = window.locator('[data-tour="sidebar-tabs"] > div').first();
    await scrollIntoViewAndWait(firstTab, { timeout: 10000 });
    await firstTab.click({ button: 'right' });
    await window.waitForTimeout(1000); // Longer wait for context menu

    // Click Remove Mark with longer timeout
    const removeButton = window.locator('text=Remove Mark');
    await scrollIntoViewAndClick(removeButton, { timeout: 15000 });
    await window.waitForTimeout(1000);

    // Capture unmarked state
    await window.screenshot({ path: `${screenshotDir}/11-mark-removed.png` });
  });

  test('12 - Final state shows no blue indicators on unmarked session', async () => {
    // Capture final clean state
    await window.screenshot({ path: `${screenshotDir}/12-final-state.png` });

    // Verify the first session no longer has blue indicator (it may have other indicators)
    const firstTab = window.locator('[data-tour="sidebar-tabs"] > div').first();
    const blueIndicatorInFirstTab = firstTab.locator('.bg-blue-500');
    await expect(blueIndicatorInFirstTab).not.toBeVisible({ timeout: 3000 });
  });
});
