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
  await window.setViewportSize({ width: 1280, height: 800 });
  await window.waitForLoadState('domcontentloaded');

  await window.evaluate(() => {
    (window as any).__ENABLE_TEST_HELPERS__ = true;
  });
  await window.waitForFunction(() => typeof (window as any).__TEST_HELPERS__ !== 'undefined');
});

test.afterAll(async () => {
  await electronApp?.close();
});

const getHighlightedMessageId = async (window: Page) =>
  window.evaluate(() => {
    const highlighted = document.querySelector('div.ring-2.ring-copilot-accent');
    const container = highlighted?.closest('[id^="message-"]') as HTMLElement | null;
    return container?.id ?? null;
  });

test('find in chat navigates newest to oldest', async () => {
  const injected = await window.evaluate(() => {
    const helpers = (window as any).__TEST_HELPERS__;
    if (!helpers?.injectMessages) return false;

    const baseTime = Date.now() - 60000;
    helpers.injectMessages([
      {
        id: 'find-oldest',
        role: 'assistant',
        content: 'needle in oldest message',
        timestamp: baseTime,
      },
      {
        id: 'find-middle',
        role: 'assistant',
        content: 'needle in middle message',
        timestamp: baseTime + 1000,
      },
      {
        id: 'find-newest',
        role: 'assistant',
        content: 'needle in newest message',
        timestamp: baseTime + 2000,
      },
    ]);
    return true;
  });

  expect(injected).toBe(true);
  await window.waitForTimeout(500);

  await window.keyboard.press(process.platform === 'darwin' ? 'Meta+F' : 'Control+F');
  const findInput = window.locator('input[placeholder="Find in chat..."]');
  await expect(findInput).toBeVisible();
  await findInput.fill('needle');

  await expect.poll(() => getHighlightedMessageId(window)).toBe('message-find-newest');

  await findInput.press('Enter');
  await expect.poll(() => getHighlightedMessageId(window)).toBe('message-find-middle');

  await findInput.press('Shift+Enter');
  await expect.poll(() => getHighlightedMessageId(window)).toBe('message-find-newest');
});
