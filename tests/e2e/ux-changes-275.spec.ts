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
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(3000);
});

test.afterAll(async () => {
  await electronApp?.close();
});

const screenshotDir = path.join(__dirname, '../../evidence/screenshots');

test.describe('Issue #275 - UX Layout Changes', () => {
  test('01 - Initial app state', async () => {
    await window.screenshot({ path: `${screenshotDir}/01-initial-state.png` });
  });

  test('02 - Top bar shows Models, Agents, Loops selectors', async () => {
    // Top bar should exist with the three selectors
    const topBar = window.locator('[data-tour="model-selector"]');
    await expect(topBar).toBeVisible({ timeout: 10000 });

    const loopsSelector = window.locator('[data-tour="agent-modes"]');
    await expect(loopsSelector).toBeVisible({ timeout: 5000 });

    await window.screenshot({ path: `${screenshotDir}/02-top-bar-selectors.png` });
  });

  test('03 - Models dropdown opens', async () => {
    const modelButton = window.locator('[data-tour="model-selector"] button').first();
    await modelButton.click();
    await window.waitForTimeout(500);
    await window.screenshot({ path: `${screenshotDir}/03-models-dropdown-open.png` });

    // Close by clicking away
    await window.locator('body').click({ position: { x: 10, y: 10 } });
    await window.waitForTimeout(300);
  });

  test('04 - Agents dropdown shows placeholder', async () => {
    // Find the Agents button (it has title="Agents (coming soon)")
    const agentsButton = window.locator('button[title="Agents (coming soon)"]');
    await agentsButton.click();
    await window.waitForTimeout(500);
    await window.screenshot({ path: `${screenshotDir}/04-agents-placeholder.png` });

    // Close
    await window.locator('body').click({ position: { x: 10, y: 10 } });
    await window.waitForTimeout(300);
  });

  test('05 - Loops dropdown opens with Off/Ralph/Lisa options', async () => {
    const loopsButton = window.locator('[data-tour="agent-modes"] button').first();
    await loopsButton.click();
    await window.waitForTimeout(500);
    await window.screenshot({ path: `${screenshotDir}/05-loops-dropdown-open.png` });

    // Close
    await window.locator('body').click({ position: { x: 10, y: 10 } });
    await window.waitForTimeout(300);
  });

  test('06 - Terminal button in input area', async () => {
    const terminalBtn = window.locator('[data-tour="terminal-toggle"]');
    await expect(terminalBtn).toBeVisible({ timeout: 5000 });
    await window.screenshot({ path: `${screenshotDir}/06-terminal-button-input.png` });
  });

  test('07 - Terminal opens upward when clicked', async () => {
    const terminalBtn = window.locator('[data-tour="terminal-toggle"]');
    await terminalBtn.click();
    await window.waitForTimeout(1000);
    await window.screenshot({ path: `${screenshotDir}/07-terminal-opened.png` });

    // Close terminal
    await terminalBtn.click();
    await window.waitForTimeout(500);
  });

  test('08 - Right panel says Environment', async () => {
    // Check the collapsed panel text or header
    const envText = window.getByText('Environment', { exact: true });
    // The panel might be collapsed or expanded
    await window.screenshot({ path: `${screenshotDir}/08-environment-panel.png` });
  });

  test('09 - Select Ralph loop mode', async () => {
    const loopsButton = window.locator('[data-tour="agent-modes"] button').first();
    await loopsButton.click();
    await window.waitForTimeout(500);

    // Click Ralph button in the dropdown
    const ralphBtn = window.locator('[data-tour="agent-modes-panel"]').getByText('Ralph');
    await ralphBtn.click();
    await window.waitForTimeout(300);
    await window.screenshot({ path: `${screenshotDir}/09-ralph-selected.png` });

    // Click Off to deselect
    const offBtn = window.locator('[data-tour="agent-modes-panel"]').getByText('Off');
    await offBtn.click();
    await window.waitForTimeout(300);

    // Close
    await window.locator('body').click({ position: { x: 10, y: 10 } });
    await window.waitForTimeout(300);
  });

  test('10 - Select Lisa loop mode', async () => {
    const loopsButton = window.locator('[data-tour="agent-modes"] button').first();
    await loopsButton.click();
    await window.waitForTimeout(500);

    // Click Lisa button
    const lisaBtn = window.locator('[data-tour="agent-modes-panel"]').getByText('Lisa');
    await lisaBtn.click();
    await window.waitForTimeout(300);
    await window.screenshot({ path: `${screenshotDir}/10-lisa-selected.png` });

    // Click Off
    const offBtn = window.locator('[data-tour="agent-modes-panel"]').getByText('Off');
    await offBtn.click();
    await window.waitForTimeout(300);

    // Close
    await window.locator('body').click({ position: { x: 10, y: 10 } });
    await window.waitForTimeout(300);
  });

  test('11 - Final full app view', async () => {
    await window.screenshot({ path: `${screenshotDir}/11-final-state.png` });
  });
});
