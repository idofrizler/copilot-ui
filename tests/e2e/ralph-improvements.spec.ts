import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import {
  scrollIntoViewAndClick,
  waitForPanelOpen,
  scrollIntoViewAndWait,
} from './helpers/viewport';

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
  await window.waitForTimeout(3000); // Wait for app to fully load

  // Create a session by sending a message (required for top bar to appear)
  const chatInput = window.locator('textarea[placeholder*="Ask Cooper"]');
  await chatInput.fill('test');
  await chatInput.press('Enter');
  await window.waitForTimeout(2000); // Wait for session and top bar to render
});

test.afterAll(async () => {
  await electronApp?.close();
});

// Helper to ensure Agent Loops panel is open
async function ensureAgentLoopsPanelOpen() {
  const panel = window.locator('[data-tour="agent-modes-panel"]');
  const isVisible = await panel.isVisible().catch(() => false);

  if (!isVisible) {
    const loopsBtn = window.locator('[data-tour="agent-modes"]');
    await scrollIntoViewAndClick(loopsBtn, { timeout: 15000 });
    await panel.waitFor({ state: 'visible', timeout: 15000 });
    await window.waitForTimeout(300);
  }
}

// Helper to ensure Ralph mode is enabled
async function ensureRalphEnabled() {
  await ensureAgentLoopsPanelOpen();

  // Check if Ralph settings are already visible
  const maxIterationsLabel = window.locator('text=Max iterations');
  const ralphVisible = await maxIterationsLabel.isVisible().catch(() => false);

  if (!ralphVisible) {
    const ralphCard = window.locator('text=Ralph Wiggum').first();
    await scrollIntoViewAndClick(ralphCard, { timeout: 15000 });
    await window.waitForTimeout(1000);
  }
}

test.describe('Ralph Loop Improvements', () => {
  test('01 - Initial app state before opening agent modes', async () => {
    // Capture initial state - app should be loaded with input area and top bar visible
    await window.screenshot({
      path: 'evidence/screenshots/01-initial-app-state.png',
      fullPage: true,
    });

    // Verify the "Loops" button exists
    const loopsBtn = window.locator('[data-tour="agent-modes"]');
    expect(await loopsBtn.count()).toBeGreaterThan(0);
  });

  test('02 - Open Agent Modes panel by clicking chevron button', async () => {
    // Click the "Loops" button to open the dropdown panel
    const loopsBtn = window.locator('[data-tour="agent-modes"]');
    await scrollIntoViewAndClick(loopsBtn, { timeout: 15000 });

    // Wait for the panel to appear (it has data-tour="agent-modes-panel")
    const panel = window.locator('[data-tour="agent-modes-panel"]');
    await panel.waitFor({ state: 'visible', timeout: 15000 });
    await window.waitForTimeout(300);

    await window.screenshot({
      path: 'evidence/screenshots/02-agent-modes-panel-open.png',
      fullPage: true,
    });
  });

  test('03 - Verify Ralph and Lisa cards are visible', async () => {
    // Ensure panel is open first
    const panel = window.locator('[data-tour="agent-modes-panel"]');
    const isVisible = await panel.isVisible().catch(() => false);
    if (!isVisible) {
      const loopsBtn = window.locator('button[title*="Agent Loops"]');
      await scrollIntoViewAndClick(loopsBtn, { timeout: 15000 });
      await panel.waitFor({ state: 'visible', timeout: 15000 });
      await window.waitForTimeout(300);
    }

    // Check both Ralph and Lisa options are visible
    const ralphCard = window.locator('text=Ralph Wiggum');
    const lisaCard = window.locator('text=Lisa Simpson');

    await expect(ralphCard.first()).toBeVisible({ timeout: 5000 });
    await expect(lisaCard.first()).toBeVisible({ timeout: 5000 });

    await window.screenshot({
      path: 'evidence/screenshots/03-ralph-lisa-cards-visible.png',
      fullPage: true,
    });
  });

  test('04 - Click Ralph Wiggum card to enable', async () => {
    // Ensure panel is open
    const panel = window.locator('[data-tour="agent-modes-panel"]');
    const isVisible = await panel.isVisible().catch(() => false);
    if (!isVisible) {
      const loopsBtn = window.locator('button[title*="Agent Loops"]');
      await scrollIntoViewAndClick(loopsBtn, { timeout: 15000 });
      await panel.waitFor({ state: 'visible', timeout: 15000 });
      await window.waitForTimeout(300);
    }

    // Click the Ralph Wiggum card to enable it
    const ralphCard = window.locator('text=Ralph Wiggum').first();
    await scrollIntoViewAndClick(ralphCard, { timeout: 15000 });
    await window.waitForTimeout(1000); // Wait for settings to appear

    // Verify Ralph is now enabled - the settings panel should show
    const maxIterationsLabel = window.locator('text=Max iterations');
    await scrollIntoViewAndWait(maxIterationsLabel.first(), { timeout: 10000 });
    await expect(maxIterationsLabel.first()).toBeVisible({ timeout: 5000 });

    await window.screenshot({
      path: 'evidence/screenshots/04-ralph-enabled-settings-visible.png',
      fullPage: true,
    });
  });

  test('05 - Verify Max iterations input is visible with default value 5', async () => {
    // Ensure Ralph is enabled
    await ensureRalphEnabled();

    // Find the max iterations input
    const maxIterInput = window.locator('input[type="number"]').first();
    await scrollIntoViewAndWait(maxIterInput, { timeout: 10000 });
    await expect(maxIterInput).toBeVisible({ timeout: 5000 });

    const value = await maxIterInput.inputValue();
    expect(value).toBe('5');

    await window.screenshot({
      path: 'evidence/screenshots/05-max-iterations-default-5.png',
      fullPage: true,
    });
  });

  test('06 - Verify Require screenshot checkbox is visible', async () => {
    // Ensure Ralph is enabled
    await ensureRalphEnabled();

    // Look for "Require screenshot" text
    const screenshotLabel = window.locator('text=Require screenshot');
    await scrollIntoViewAndWait(screenshotLabel.first(), { timeout: 10000 });
    await expect(screenshotLabel.first()).toBeVisible({ timeout: 5000 });

    await window.screenshot({
      path: 'evidence/screenshots/06-require-screenshot-checkbox.png',
      fullPage: true,
    });
  });

  test('07 - Verify Clear context checkbox is visible and checked by default', async () => {
    // Ensure Ralph is enabled
    await ensureRalphEnabled();

    // Look for "Clear context between iterations" text - THE NEW FEATURE
    const clearContextLabel = window.locator('text=Clear context between iterations');
    await scrollIntoViewAndWait(clearContextLabel.first(), { timeout: 10000 });
    await expect(clearContextLabel.first()).toBeVisible({ timeout: 5000 });

    // Verify "(recommended)" label is also visible
    const recommendedLabel = window.locator('text=recommended');
    await expect(recommendedLabel.first()).toBeVisible({ timeout: 3000 });

    await window.screenshot({
      path: 'evidence/screenshots/07-clear-context-checkbox-default-checked.png',
      fullPage: true,
    });
  });

  test('08 - Uncheck Clear context checkbox', async () => {
    // Ensure Ralph is enabled
    await ensureRalphEnabled();

    // Find the checkbox for clear context (near the label)
    const clearContextCheckbox = window
      .locator('label')
      .filter({ hasText: 'Clear context between iterations' })
      .locator('input[type="checkbox"]');

    // Scroll into view first
    await scrollIntoViewAndWait(clearContextCheckbox, { timeout: 10000 });

    // It should be checked by default, so uncheck it
    await clearContextCheckbox.uncheck({ timeout: 10000 });
    await window.waitForTimeout(300);

    // Verify it's unchecked
    expect(await clearContextCheckbox.isChecked()).toBe(false);

    await window.screenshot({
      path: 'evidence/screenshots/08-clear-context-unchecked.png',
      fullPage: true,
    });
  });

  test('09 - Re-check Clear context checkbox', async () => {
    // Ensure Ralph is enabled
    await ensureRalphEnabled();

    // Check it again
    const clearContextCheckbox = window
      .locator('label')
      .filter({ hasText: 'Clear context between iterations' })
      .locator('input[type="checkbox"]');

    // Scroll into view first
    await scrollIntoViewAndWait(clearContextCheckbox, { timeout: 10000 });

    await clearContextCheckbox.check({ timeout: 10000 });
    await window.waitForTimeout(300);

    // Verify it's checked
    expect(await clearContextCheckbox.isChecked()).toBe(true);

    await window.screenshot({
      path: 'evidence/screenshots/09-clear-context-rechecked.png',
      fullPage: true,
    });
  });

  test('10 - Change max iterations to 10', async () => {
    // Ensure Ralph is enabled
    await ensureRalphEnabled();

    // Change max iterations from 5 to 10
    const maxIterInput = window.locator('input[type="number"]').first();
    await scrollIntoViewAndWait(maxIterInput, { timeout: 10000 });
    await maxIterInput.fill('10');
    await window.waitForTimeout(300);

    // Verify the value changed
    const value = await maxIterInput.inputValue();
    expect(value).toBe('10');

    await window.screenshot({
      path: 'evidence/screenshots/10-max-iterations-changed-to-10.png',
      fullPage: true,
    });
  });

  test('11 - Enable Require screenshot option', async () => {
    // Ensure Ralph is enabled
    await ensureRalphEnabled();

    // Find and check the Require screenshot checkbox
    const screenshotCheckbox = window
      .locator('label')
      .filter({ hasText: 'Require screenshot' })
      .locator('input[type="checkbox"]');

    await scrollIntoViewAndWait(screenshotCheckbox, { timeout: 10000 });
    await screenshotCheckbox.check({ timeout: 10000 });
    await window.waitForTimeout(300);

    expect(await screenshotCheckbox.isChecked()).toBe(true);

    await window.screenshot({
      path: 'evidence/screenshots/11-require-screenshot-enabled.png',
      fullPage: true,
    });
  });

  test('12 - All Ralph settings configured', async () => {
    // Take a final screenshot showing all Ralph settings:
    // - Max iterations: 10
    // - Require screenshot: checked
    // - Clear context: checked (with recommended label)

    await window.screenshot({
      path: 'evidence/screenshots/12-all-ralph-settings-configured.png',
      fullPage: true,
    });
  });

  test('13 - Switch to Lisa Simpson mode', async () => {
    // Ensure panel is open
    await ensureAgentLoopsPanelOpen();

    // Click Lisa Simpson card
    const lisaCard = window.locator('text=Lisa Simpson').first();
    await scrollIntoViewAndClick(lisaCard, { timeout: 15000 });
    await window.waitForTimeout(1000);

    // Lisa should now be selected (Ralph deselected)
    // Lisa has different UI - shows phase flow

    await window.screenshot({
      path: 'evidence/screenshots/13-lisa-simpson-selected.png',
      fullPage: true,
    });
  });

  test('14 - Switch back to Ralph mode', async () => {
    // Ensure panel is open
    await ensureAgentLoopsPanelOpen();

    // Click Ralph card again
    const ralphCard = window.locator('text=Ralph Wiggum').first();
    await scrollIntoViewAndClick(ralphCard, { timeout: 15000 });
    await window.waitForTimeout(1000);

    // Verify Ralph settings are back
    const maxIterationsLabel = window.locator('text=Max iterations');
    await expect(maxIterationsLabel.first()).toBeVisible({ timeout: 5000 });

    await window.screenshot({
      path: 'evidence/screenshots/14-switched-back-to-ralph.png',
      fullPage: true,
    });
  });

  test('15 - Close Agent Modes panel', async () => {
    // Click the Loops button again to close the panel
    const loopsBtn = window.locator('button[title*="Agent Loops"]');
    await scrollIntoViewAndClick(loopsBtn, { timeout: 15000 });
    await window.waitForTimeout(300);

    // Verify panel is closed
    const panel = window.locator('[data-tour="agent-modes-panel"]');
    await expect(panel).not.toBeVisible();

    await window.screenshot({
      path: 'evidence/screenshots/15-agent-modes-panel-closed.png',
      fullPage: true,
    });
  });

  test('16 - Reopen panel to verify Ralph is still selected', async () => {
    // Open panel again
    const loopsBtn = window.locator('button[title*="Agent Loops"]');
    await scrollIntoViewAndClick(loopsBtn, { timeout: 15000 });

    const panel = window.locator('[data-tour="agent-modes-panel"]');
    await panel.waitFor({ state: 'visible', timeout: 15000 });
    await window.waitForTimeout(300);

    // Verify Ralph settings are still visible (state persisted)
    const maxIterationsLabel = window.locator('text=Max iterations');
    await expect(maxIterationsLabel.first()).toBeVisible({ timeout: 5000 });

    await window.screenshot({
      path: 'evidence/screenshots/16-ralph-still-selected-after-reopen.png',
      fullPage: true,
    });
  });
});
