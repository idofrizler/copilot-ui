import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';

let electronApp: ElectronApplication;
let window: Page;
let agentModel: string | null = null;

const toModelLabel = (model: string) =>
  model
    .split('-')
    .map((chunk) =>
      chunk
        .split('.')
        .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
        .join('.')
    )
    .join('-')
    .replace('Gpt', 'GPT')
    .replace('Gpt-', 'GPT-')
    .replace('Gpt.', 'GPT.');

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
  agentModel = await window.evaluate(async () => {
    const api = (window as any).electronAPI;
    if (!api?.agents?.getAll || !api?.copilot?.getCwd) return null;
    const cwd = await api.copilot.getCwd();
    const result = await api.agents.getAll(cwd);
    const match = (result?.agents || []).find((agent: any) => agent?.name === 'limerick-composer');
    return match?.model ?? null;
  });
});

test.afterAll(async () => {
  await electronApp?.close();
});

test.describe('Custom Agent Selection', () => {
  test('should select custom agent and auto-switch model', async () => {
    await window.waitForTimeout(2000);

    const modelSelector = window.locator('[data-tour="model-selector"]');
    await expect(modelSelector).toBeVisible({ timeout: 10000 });

    const modelButton = modelSelector.locator('button').first();
    const initialModel = await modelButton.textContent();

    const agentButton = window.locator('button[title="Select agent"]');
    await agentButton.click();

    const agentOption = window
      .locator('div[role="button"]')
      .filter({ hasText: 'limerick-composer' })
      .first();
    await expect(agentOption).toBeVisible({ timeout: 10000 });
    await agentOption.click();

    await expect(agentButton).toContainText('limerick-composer', { timeout: 10000 });
    const expectedModel = agentModel ? toModelLabel(agentModel) : null;
    if (!expectedModel) {
      test.skip(true, 'Agent model not available in test environment.');
    }
    await expect(modelButton).toContainText(expectedModel!, { timeout: 10000 });

    if (initialModel) {
      await modelButton.click();
      const restoreOption = window.getByText(initialModel.trim(), { exact: true });
      await expect(restoreOption).toBeVisible({ timeout: 10000 });
      await restoreOption.click({ force: true });
      await expect(modelButton).toContainText(initialModel.trim(), { timeout: 10000 });
    }
  });
});
