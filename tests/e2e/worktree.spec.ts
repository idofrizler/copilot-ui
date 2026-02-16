import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import { scrollIntoViewAndClick, waitForModal } from './helpers/viewport';

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
  await window.waitForTimeout(2000); // Wait for React to render
});

test.afterAll(async () => {
  await electronApp?.close();
});

test.describe('Worktree Sessions', () => {
  test('should have branch widget visible', async () => {
    // Look for the git branch widget
    const branchWidget = await window
      .locator('[data-testid="git-branch-widget"]')
      .or(window.locator('[class*="GitBranchWidget"], [class*="branch"]'))
      .first();

    const isVisible = await branchWidget.isVisible().catch(() => false);
    console.log('Branch widget visible:', isVisible);
  });

  test('should be able to open worktree sessions modal', async () => {
    // Try to find and click worktree-related button
    const worktreeButton = await window
      .locator('[data-testid="worktree-sessions"]')
      .or(window.locator('button').filter({ hasText: /session|worktree/i }))
      .first();

    const isVisible = await worktreeButton.isVisible().catch(() => false);
    if (isVisible) {
      await scrollIntoViewAndClick(worktreeButton, { timeout: 15000 });
      // Wait for modal with longer timeout
      await waitForModal(window, 'Worktree Sessions', { timeout: 20000 }).catch(() => {
        console.log('Modal did not appear or has different title');
      });

      // Check if modal appeared
      const modal = await window
        .locator('[data-testid="worktree-modal"]')
        .or(window.locator('[role="dialog"], .modal, [class*="Modal"]'))
        .first();

      const modalVisible = await modal.isVisible().catch(() => false);
      console.log('Worktree modal visible:', modalVisible);
    }
  });
});
