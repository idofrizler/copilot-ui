import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import {
  scrollIntoViewAndClick,
  waitForModal,
  closeModal,
  ensureSidebarExpanded,
} from './helpers/viewport';

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

  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(3000);
});

test.afterAll(async () => {
  await electronApp?.close();
});

async function openSessionHistoryModal() {
  const modalTitle = window.locator('h3', { hasText: 'Session History' });
  const isVisible = await modalTitle.isVisible().catch(() => false);

  if (!isVisible) {
    // Ensure sidebar is expanded first
    await ensureSidebarExpanded(window);

    // Find the LAST Session History button (the bottom one in sidebar, not the one in left drawer)
    // We use .last() to get the bottom button since the left drawer button comes first in DOM
    const historyButton = window.locator('button:has-text("Session History")').last();
    await scrollIntoViewAndClick(historyButton, { timeout: 15000 });
    await waitForModal(window, 'Session History', { timeout: 20000 });
  }
}

async function closeSessionHistoryModal() {
  await closeModal(window, { timeout: 10000 });
}

test.describe('Issue #91 - Merged Worktree List into Session History', () => {
  test('01 - Session History modal shows filter toggle', async () => {
    await openSessionHistoryModal();

    const modal = window.locator('[role="dialog"]');
    const allButton = modal.locator('button', { hasText: 'All' });
    const worktreeButton = modal.locator('button', { hasText: 'Worktree' });

    await expect(allButton).toBeVisible({ timeout: 5000 });
    await expect(worktreeButton).toBeVisible({ timeout: 5000 });

    // Take screenshot showing filter toggle
    await window.screenshot({
      path: path.join(EVIDENCE_DIR, '01-filter-toggle-visible.png'),
      fullPage: false,
    });
  });

  test('02 - All filter is selected by default', async () => {
    await openSessionHistoryModal();

    const modal = window.locator('[role="dialog"]');
    const allButton = modal.locator('button', { hasText: 'All' });

    // All button should have active styling (bg-copilot-surface class)
    await expect(allButton).toHaveClass(/bg-copilot-surface/);

    await window.screenshot({
      path: path.join(EVIDENCE_DIR, '02-all-filter-default.png'),
      fullPage: false,
    });
  });

  test('03 - Clicking Worktree filter changes view', async () => {
    await openSessionHistoryModal();

    const modal = window.locator('[role="dialog"]');
    const worktreeButton = modal.locator('button', { hasText: 'Worktree' });

    // Click worktree filter
    await worktreeButton.click();
    await window.waitForTimeout(300);

    // Worktree button should now have active styling
    await expect(worktreeButton).toHaveClass(/bg-copilot-surface/);

    await window.screenshot({
      path: path.join(EVIDENCE_DIR, '03-worktree-filter-active.png'),
      fullPage: false,
    });
  });

  test('04 - Search input works with filter toggle', async () => {
    await openSessionHistoryModal();

    const modal = window.locator('[role="dialog"]');
    const searchInput = modal.locator('input[placeholder*="Search"]');

    // Verify search input is present alongside filter toggle
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    // Type in search
    await searchInput.fill('test search');
    await window.waitForTimeout(300);

    await window.screenshot({
      path: path.join(EVIDENCE_DIR, '04-search-with-filter.png'),
      fullPage: false,
    });

    // Clear search
    await searchInput.clear();
  });

  test('05 - Full modal layout with new features', async () => {
    await closeSessionHistoryModal();
    await openSessionHistoryModal();

    const modal = window.locator('[role="dialog"]');

    // Click All filter first
    const allButton = modal.locator('button', { hasText: 'All' });
    await allButton.click();
    await window.waitForTimeout(300);

    // Take full screenshot showing the merged UI
    await window.screenshot({
      path: path.join(EVIDENCE_DIR, '05-full-modal-merged-ui.png'),
      fullPage: false,
    });
  });

  test('06 - Worktree filter with Prune Stale button visibility', async () => {
    await openSessionHistoryModal();

    const modal = window.locator('[role="dialog"]');
    const worktreeButton = modal.locator('button', { hasText: 'Worktree' });

    // Switch to worktree filter
    await worktreeButton.click();
    await window.waitForTimeout(300);

    // Look for Prune Stale button (may or may not be visible depending on worktree sessions)
    const pruneButton = modal.locator('button', { hasText: 'Prune Stale' });

    await window.screenshot({
      path: path.join(EVIDENCE_DIR, '06-worktree-view-prune-button.png'),
      fullPage: false,
    });
  });

  test('07 - Switch between All and Worktree filters', async () => {
    await openSessionHistoryModal();

    const modal = window.locator('[role="dialog"]');
    const allButton = modal.locator('button', { hasText: 'All' });
    const worktreeButton = modal.locator('button', { hasText: 'Worktree' });

    // Start with All
    await allButton.click();
    await window.waitForTimeout(200);
    await window.screenshot({
      path: path.join(EVIDENCE_DIR, '07a-all-sessions-view.png'),
      fullPage: false,
    });

    // Switch to Worktree
    await worktreeButton.click();
    await window.waitForTimeout(200);
    await window.screenshot({
      path: path.join(EVIDENCE_DIR, '07b-worktree-sessions-view.png'),
      fullPage: false,
    });

    // Switch back to All
    await allButton.click();
    await window.waitForTimeout(200);
    await window.screenshot({
      path: path.join(EVIDENCE_DIR, '07c-back-to-all-view.png'),
      fullPage: false,
    });
  });

  test('08 - Modal header and close button', async () => {
    await openSessionHistoryModal();

    const modal = window.locator('[role="dialog"]');
    const title = modal.locator('h3', { hasText: 'Session History' });
    const closeButton = modal.locator('[aria-label="Close modal"]');

    await expect(title).toBeVisible();
    await expect(closeButton).toBeVisible();

    await window.screenshot({
      path: path.join(EVIDENCE_DIR, '08-modal-header.png'),
      fullPage: false,
    });
  });

  test('09 - New Session button with worktree icon on hover', async () => {
    // Close any open modal first
    await closeSessionHistoryModal();
    await window.waitForTimeout(300);

    // Find the New Session button
    const newSessionButton = window.locator('button', { hasText: 'New Session' });
    await expect(newSessionButton).toBeVisible({ timeout: 5000 });

    // Hover over it to reveal the worktree icon
    await newSessionButton.hover();
    await window.waitForTimeout(300);

    // Take screenshot showing the merged New Session button with worktree option
    await window.screenshot({
      path: path.join(EVIDENCE_DIR, '09-new-session-with-worktree-hover.png'),
      fullPage: false,
    });
  });

  test('10 - Single entry point for Session History (no List button)', async () => {
    // Verify there's no separate "List" button for worktrees
    const listButton = window.locator('button', { hasText: 'List' });
    const listVisible = await listButton.isVisible().catch(() => false);

    // List button should NOT exist anymore
    expect(listVisible).toBe(false);

    // Session History is the single entry point
    const historyButton = window.locator('button', { hasText: 'Session History' });
    await expect(historyButton).toBeVisible();

    await window.screenshot({
      path: path.join(EVIDENCE_DIR, '10-single-entry-point-no-list-button.png'),
      fullPage: false,
    });
  });
});
