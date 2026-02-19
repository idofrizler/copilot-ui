/**
 * Additional Playwright E2E screenshots for evidence
 */
import { test, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import { scrollIntoViewAndClick } from './helpers/viewport';

let electronApp: ElectronApplication;
let page: Page;

test.describe('Telemetry Feature Screenshots', () => {
  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.js')],
    });
    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
  });

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('Capture comprehensive feature screenshots', async () => {
    // 02 - Initial state showing version info
    await page.screenshot({
      path: 'evidence/screenshots/02-version-info-visible.png',
    });

    // 03 - Click on input area to show we can interact
    const inputArea = page.locator('input, textarea, [contenteditable]').first();
    if (await inputArea.isVisible()) {
      await inputArea.click();
      await page.waitForTimeout(300);
    }
    await page.screenshot({
      path: 'evidence/screenshots/03-input-area-focused.png',
    });

    // 04 - Expand the mode selection area (click on arrow/chevron near input)
    const expandButton = page
      .locator('button')
      .filter({ has: page.locator('svg') })
      .first();
    if (await expandButton.isVisible()) {
      await scrollIntoViewAndClick(expandButton, { timeout: 15000 });
      await page.waitForTimeout(1000);
    }
    await page.screenshot({
      path: 'evidence/screenshots/04-mode-selection-area.png',
    });

    // 05 - Show sidebar with MCP servers (telemetry tracks MCP_CONNECTED)
    await page.screenshot({
      path: 'evidence/screenshots/05-sidebar-mcp-servers.png',
    });

    // 06 - Click MCP Servers to expand
    const mcpServers = page.locator('text=MCP Servers');
    if (await mcpServers.isVisible()) {
      await mcpServers.click();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: 'evidence/screenshots/06-mcp-servers-expanded.png',
      });
    }

    // 07 - Click on Session History (shows session tracking)
    const sessionHistory = page.locator('text=Session History');
    if (await sessionHistory.isVisible()) {
      await sessionHistory.click();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: 'evidence/screenshots/07-session-history-open.png',
      });

      // Close it
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // 08 - Check terminal button
    const terminalBtn = page.locator('button:has-text("Terminal"), button[title*="Terminal"]');
    if (await terminalBtn.isVisible()) {
      await terminalBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: 'evidence/screenshots/08-terminal-panel.png',
      });
    }

    // 09 - Theme dropdown (top right)
    const themeArea = page.locator('text=System, text=Dark, text=Light').first();
    if (await themeArea.isVisible()) {
      await themeArea.click();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: 'evidence/screenshots/09-theme-dropdown.png',
      });
      await page.keyboard.press('Escape');
    }

    // 10 - Final overview
    await page.waitForTimeout(300);
    await page.screenshot({
      path: 'evidence/screenshots/10-final-overview.png',
    });
  });
});
