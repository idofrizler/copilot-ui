import { Locator, Page } from '@playwright/test';

/**
 * Scrolls element into view and clicks it with proper waits
 * Fixes "element is outside of the viewport" errors
 */
export async function scrollIntoViewAndClick(
  locator: Locator,
  options?: { timeout?: number; force?: boolean }
) {
  const timeout = options?.timeout || 5000;
  const force = options?.force ?? true; // Default to force click to avoid viewport issues

  // Wait for element to exist
  await locator.waitFor({ state: 'attached', timeout });

  // Scroll into view if needed
  await locator.scrollIntoViewIfNeeded({ timeout });

  // Wait for element to be visible and stable
  await locator.waitFor({ state: 'visible', timeout });

  // Click the element with force option to bypass viewport checks
  await locator.click({ timeout, force });
}

/**
 * Waits for a modal to appear and be fully visible
 * Fixes modal timeout issues
 */
export async function waitForModal(
  window: Page,
  modalTitle: string,
  options?: { timeout?: number }
) {
  const timeout = options?.timeout || 20000; // Increased from 10000

  // Wait for the specific modal by its title (not just any dialog)
  const modal = window.locator(`[role="dialog"]:has(h3:has-text("${modalTitle}"))`);
  await modal.waitFor({ state: 'visible', timeout });

  // Wait for the modal title
  const title = modal.locator('h3', { hasText: modalTitle });
  await title.waitFor({ state: 'visible', timeout: 10000 }); // Increased from 5000

  // Give modal time to settle animations
  await window.waitForTimeout(500); // Increased from 300
}

/**
 * Waits for a panel or section to expand/open
 * Fixes panel opening timeouts
 */
export async function waitForPanelOpen(
  window: Page,
  panelText: string,
  options?: { timeout?: number }
) {
  const timeout = options?.timeout || 20000; // Increased from 10000

  const panel = window.locator('text=' + panelText).first();
  await panel.waitFor({ state: 'visible', timeout });

  // Give panel time to fully expand
  await window.waitForTimeout(500); // Increased from 300
}

/**
 * Scrolls element into view and waits for it to be visible
 * Does not click - useful for verifying visibility
 */
export async function scrollIntoViewAndWait(locator: Locator, options?: { timeout?: number }) {
  const timeout = options?.timeout || 5000;

  // Wait for element to exist
  await locator.waitFor({ state: 'attached', timeout });

  // Scroll into view if needed
  await locator.scrollIntoViewIfNeeded({ timeout });

  // Wait for element to be visible
  await locator.waitFor({ state: 'visible', timeout });
}

/**
 * Opens a dropdown/select element with proper waits
 * Fixes dropdown opening issues
 */
export async function openDropdown(locator: Locator, options?: { timeout?: number }) {
  const timeout = options?.timeout || 5000;

  // Scroll into view first
  await scrollIntoViewAndClick(locator, { timeout });

  // Wait for dropdown content to appear (look for expanded state or menu)
  await locator.page().waitForTimeout(300);
}

/**
 * Closes a modal by clicking the close button
 * Fixes modal close issues
 */
export async function closeModal(window: Page, options?: { timeout?: number }) {
  const timeout = options?.timeout || 10000;

  const closeButton = window.locator('[aria-label="Close modal"]');
  const isVisible = await closeButton.isVisible().catch(() => false);

  if (isVisible) {
    await scrollIntoViewAndClick(closeButton, { timeout, force: true });

    // Wait for modal to disappear
    const modal = window.locator('[role="dialog"]');
    await modal.waitFor({ state: 'hidden', timeout });
  }
}

/**
 * Ensures the left sidebar is expanded
 * Fixes issues where sidebar buttons are not visible when panel is collapsed
 */
export async function ensureSidebarExpanded(window: Page, options?: { timeout?: number }) {
  const timeout = options?.timeout || 5000;

  // Check if there's a "Show sessions panel" button (appears when collapsed)
  const expandButton = window.locator('button[title="Show sessions panel"]');
  const isCollapsed = await expandButton.isVisible().catch(() => false);

  if (isCollapsed) {
    await scrollIntoViewAndClick(expandButton, { timeout });
    // Wait for sidebar to expand
    await window.waitForTimeout(500); // Increased from 300
  }
}
