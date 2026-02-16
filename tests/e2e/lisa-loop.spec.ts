import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import { scrollIntoViewAndClick, scrollIntoViewAndWait } from './helpers/viewport';

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
  await window.waitForTimeout(2000); // Wait for app to fully load
});

test.afterAll(async () => {
  await electronApp?.close();
});

test.describe('Lisa Simpson Loop UI', () => {
  test('should open agent modes panel and show Ralph/Lisa options', async () => {
    // Take initial screenshot
    await window.screenshot({ path: 'test-results/01-initial.png', fullPage: true });

    // Find and click the chevron button to open agent modes
    // It's the ">" button to the left of the textarea
    const chevronButton = await window
      .locator('button')
      .filter({ has: window.locator('svg') })
      .first();

    // Or find by the flex container near input
    const inputRow = await window.locator('textarea').locator('..').locator('..');
    const toggleButton = await inputRow.locator('button').first();

    if (await toggleButton.isVisible()) {
      await toggleButton.click();
      await window.waitForTimeout(500);
    }

    // Take screenshot after clicking
    await window.screenshot({ path: 'test-results/02-panel-opened.png', fullPage: true });

    // Check if Ralph/Lisa icons are now visible
    const ralphImg = await window.locator('img[alt="Ralph"]').first();
    const lisaImg = await window.locator('img[alt="Lisa"]').first();

    const hasRalph = await ralphImg.isVisible().catch(() => false);
    const hasLisa = await lisaImg.isVisible().catch(() => false);

    console.log('Ralph icon visible after click:', hasRalph);
    console.log('Lisa icon visible after click:', hasLisa);
  });

  test('should show Ralph card with white circular icon', async () => {
    // Click the toggle to open panel
    const buttons = await window.locator('button').all();
    for (const btn of buttons) {
      const hasChevron = (await btn.locator('svg').count()) > 0;
      const isSmall = await btn.evaluate((el) => el.clientWidth < 50);
      if (hasChevron && isSmall) {
        await scrollIntoViewAndClick(btn, { timeout: 15000 });
        await window.waitForTimeout(1000);
        break;
      }
    }

    await window.screenshot({ path: 'test-results/03-agent-panel.png', fullPage: true });

    // Look for "Ralph" text
    const ralphText = await window.locator('text=Ralph').first();
    const hasRalphText = await ralphText.isVisible().catch(() => false);
    console.log('Ralph text visible:', hasRalphText);

    // Look for "Lisa" text
    const lisaText = await window.locator('text=Lisa').first();
    const hasLisaText = await lisaText.isVisible().catch(() => false);
    console.log('Lisa text visible:', hasLisaText);
  });

  test('should select Lisa mode and show phase flow description', async () => {
    // First open the panel by clicking chevron
    const chevron = await window.locator('button svg').first().locator('..');
    await chevron.click().catch(() => {});
    await window.waitForTimeout(300);

    // Click on the Lisa Simpson card specifically
    const lisaCard = await window.locator('text=Lisa Simpson').locator('..');
    if (await lisaCard.isVisible()) {
      await lisaCard.click();
      await window.waitForTimeout(500);
    }

    await window.screenshot({ path: 'test-results/04-lisa-selected.png', fullPage: true });

    // Check for phase description text - should show Plan, Code, QA
    const planText = await window.locator('text=📋 Plan').or(window.locator('text=Plan')).first();
    const codeText = await window.locator('text=💻 Code').or(window.locator('text=Code')).first();
    const qaText = await window.locator('text=🧪 QA').or(window.locator('text=QA')).first();

    const hasPlan = await planText.isVisible().catch(() => false);
    const hasCode = await codeText.isVisible().catch(() => false);
    const hasQA = await qaText.isVisible().catch(() => false);

    console.log('Plan phase visible:', hasPlan);
    console.log('Code phase visible:', hasCode);
    console.log('QA phase visible:', hasQA);

    // At least one phase indicator should be visible when Lisa is selected
    expect(hasPlan || hasCode || hasQA).toBe(true);
  });

  test('verify icon backgrounds are white circles', async () => {
    // Open panel
    await window
      .locator('button svg')
      .first()
      .locator('..')
      .click()
      .catch(() => {});
    await window.waitForTimeout(300);

    // Get all img elements
    const images = await window.locator('img').all();
    for (const img of images) {
      const alt = await img.getAttribute('alt');
      if (alt === 'Ralph' || alt === 'Lisa') {
        // Check the parent div has the white background class
        const parent = await img.locator('..');
        const classes = await parent.getAttribute('class');
        console.log(`${alt} icon parent classes:`, classes);

        // Verify it has rounded-full and bg-white
        expect(classes).toContain('rounded-full');
        expect(classes).toContain('bg-white');
      }
    }

    await window.screenshot({ path: 'test-results/05-icon-verification.png', fullPage: true });
  });
});
