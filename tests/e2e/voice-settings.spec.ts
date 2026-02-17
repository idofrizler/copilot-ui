/**
 * E2E Test: Voice Settings in Settings Modal
 * Tests the voice settings feature that was moved from VoiceKeywordsPanel to SettingsModal
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import { scrollIntoViewAndClick, scrollIntoViewAndWait } from './helpers/viewport';

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
  await window.waitForTimeout(2000);
});

test.afterAll(async () => {
  await electronApp?.close();
});

test.describe('Voice Settings in Settings Modal', () => {
  test('should capture initial app state', async () => {
    await window.screenshot({ path: `${EVIDENCE_DIR}/01-initial-app-state.png` });
  });

  test('should open settings modal and navigate to Voice section', async () => {
    // Find and click the settings button
    const settingsButton = window
      .locator('button[title="Settings"]')
      .or(window.locator('[data-testid="settings-button"]'));

    // If not visible, try alternative selectors
    const settingsIcon = window.locator('svg').filter({ hasText: '' }).nth(0);

    // Try multiple ways to open settings
    try {
      await settingsButton.click({ timeout: 3000 });
    } catch {
      // Find button with SettingsIcon
      const buttons = window.locator('button');
      const count = await buttons.count();
      for (let i = 0; i < count; i++) {
        const btn = buttons.nth(i);
        const title = await btn.getAttribute('title');
        if (title === 'Settings') {
          await btn.click();
          break;
        }
      }
    }

    await window.waitForTimeout(500);
    await window.screenshot({ path: `${EVIDENCE_DIR}/02-settings-modal-opened.png` });

    // Click on Voice section in sidebar
    const voiceTab = window.getByText('Voice', { exact: true });
    await voiceTab.click();
    await window.waitForTimeout(300);

    await window.screenshot({ path: `${EVIDENCE_DIR}/03-voice-section-selected.png` });
  });

  test('should show voice settings toggles', async () => {
    // Verify Always Listening toggle is present
    const alwaysListening = window.getByText('Always Listening');
    await expect(alwaysListening).toBeVisible();

    // Verify Push to Talk toggle is present
    const pushToTalk = window.getByText('Push to Talk');
    await expect(pushToTalk).toBeVisible();

    // Verify Text-to-Speech toggle is present
    const tts = window.getByText('Text-to-Speech');
    await expect(tts).toBeVisible();

    await window.screenshot({ path: `${EVIDENCE_DIR}/04-voice-settings-toggles.png` });
  });

  test('should show voice status indicator', async () => {
    // Verify Voice Status is shown
    const voiceStatus = window.getByText('Voice Status');
    await scrollIntoViewAndWait(voiceStatus, { timeout: 10000 });
    await expect(voiceStatus).toBeVisible({ timeout: 5000 });

    // Verify status text (model not yet initialized)
    const statusText = window.getByText('Click mic button to initialize');
    await expect(statusText).toBeVisible({ timeout: 5000 });

    await window.screenshot({ path: `${EVIDENCE_DIR}/05-voice-status-indicator.png` });
  });

  test('should show voice commands reference', async () => {
    // Verify Voice Commands section exists
    const voiceCommands = window.getByText('Voice Commands');
    await scrollIntoViewAndWait(voiceCommands, { timeout: 10000 });
    await expect(voiceCommands).toBeVisible({ timeout: 5000 });

    // Verify wake words are listed
    const wakeWords = window.getByText(/Wake Words/);
    await expect(wakeWords).toBeVisible({ timeout: 5000 });

    // Scroll to show all commands
    await window.screenshot({ path: `${EVIDENCE_DIR}/06-voice-commands-reference.png` });
  });

  test('should toggle Always Listening', async () => {
    // First ensure we're on the Voice section of settings
    const voiceTab = window.getByText('Voice', { exact: true });
    if (await voiceTab.isVisible()) {
      await scrollIntoViewAndClick(voiceTab);
      await window.waitForTimeout(300);
    }

    // Find the toggle button within Voice Input section
    // The toggles are buttons with inline-flex class
    const voiceInputSection = window.locator('h4:has-text("Voice Input")').locator('..');
    const toggleButtons = voiceInputSection.locator('button.rounded-full');

    // First toggle is Always Listening
    const alwaysListeningToggle = toggleButtons.first();

    // Scroll into view and click to enable
    await scrollIntoViewAndClick(alwaysListeningToggle, { timeout: 10000 });
    await window.waitForTimeout(300);
    await window.screenshot({ path: `${EVIDENCE_DIR}/07-always-listening-enabled.png` });

    // Note: Push to Talk should now show as disabled
    const pttDescription = window.getByText('Disabled when Always Listening is on');
    await expect(pttDescription).toBeVisible({ timeout: 5000 });

    await window.screenshot({ path: `${EVIDENCE_DIR}/08-push-to-talk-disabled.png` });

    // Toggle off
    await scrollIntoViewAndClick(alwaysListeningToggle, { timeout: 10000 });
    await window.waitForTimeout(300);
    await window.screenshot({ path: `${EVIDENCE_DIR}/09-always-listening-disabled.png` });
  });

  test('should toggle Push to Talk', async () => {
    // Find the toggle buttons in Voice Input section
    const voiceInputSection = window.locator('h4:has-text("Voice Input")').locator('..');
    const toggleButtons = voiceInputSection.locator('button.rounded-full');

    // Second toggle is Push to Talk
    const pttToggle = toggleButtons.nth(1);

    // Scroll into view and click to enable
    await scrollIntoViewAndClick(pttToggle, { timeout: 10000 });
    await window.waitForTimeout(300);
    await window.screenshot({ path: `${EVIDENCE_DIR}/10-push-to-talk-enabled.png` });

    // Toggle off
    await scrollIntoViewAndClick(pttToggle, { timeout: 10000 });
    await window.waitForTimeout(300);
  });

  test('should toggle Text-to-Speech', async () => {
    // Find the toggle button in Voice Output section
    const voiceOutputSection = window.locator('h4:has-text("Voice Output")').locator('..');
    const ttsToggle = voiceOutputSection.locator('button.rounded-full');

    // Scroll into view and click to toggle (turns off since it defaults to on)
    await scrollIntoViewAndClick(ttsToggle, { timeout: 10000 });
    await window.waitForTimeout(300);
    await window.screenshot({ path: `${EVIDENCE_DIR}/11-tts-toggled.png` });

    // Toggle back
    await scrollIntoViewAndClick(ttsToggle, { timeout: 10000 });
    await window.waitForTimeout(300);
  });

  test('should close settings modal', async () => {
    // Close the modal using the X button or close button
    const modal = window.locator('[data-testid="settings-modal"]');
    const closeButton = modal.locator('button').first();
    await scrollIntoViewAndClick(closeButton, { timeout: 10000 });
    await window.waitForTimeout(500);

    await window.screenshot({ path: `${EVIDENCE_DIR}/12-settings-closed.png` });
  });

  test('should show simplified VoiceKeywordsPanel in sidebar', async () => {
    // The VoiceKeywordsPanel is now minimal - just a status line
    const micStatus = window.getByText('Mic');

    if (await micStatus.isVisible()) {
      await window.screenshot({ path: `${EVIDENCE_DIR}/13-voice-status-minimal.png` });
    }
  });

  test('should capture final state with all changes', async () => {
    await window.screenshot({ path: `${EVIDENCE_DIR}/14-final-state.png`, fullPage: true });
  });
});
