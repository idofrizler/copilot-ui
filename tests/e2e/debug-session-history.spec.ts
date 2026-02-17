import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

test.describe('DEBUG: Session History Button Detection', () => {
  let electronApp;
  let window;

  test.beforeAll(async () => {
    const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
    electronApp = await electron.launch({
      args: ['.'],
      cwd: path.dirname(packageJsonPath),
    });
    window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(2000);
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test('count all Session History buttons', async () => {
    const allButtons = window.locator('button:has-text("Session History")');
    const count = await allButtons.count();
    console.log(`Total Session History buttons found: ${count}`);

    for (let i = 0; i < count; i++) {
      const btn = allButtons.nth(i);
      const text = await btn.textContent();
      const isVisible = await btn.isVisible();
      const box = await btn.boundingBox().catch(() => null);
      console.log(`Button ${i}: text="${text}", visible=${isVisible}, box=${JSON.stringify(box)}`);
    }

    expect(count).toBeGreaterThan(0);
  });

  test('check .first() vs .last() behavior', async () => {
    const allButtons = window.locator('button:has-text("Session History")');
    const count = await allButtons.count();

    if (count > 0) {
      const firstBtn = allButtons.first();
      const lastBtn = allButtons.last();

      const firstVisible = await firstBtn.isVisible();
      const lastVisible = await lastBtn.isVisible();

      const firstBox = await firstBtn.boundingBox().catch(() => null);
      const lastBox = await lastBtn.boundingBox().catch(() => null);

      console.log(`FIRST button: visible=${firstVisible}, box=${JSON.stringify(firstBox)}`);
      console.log(`LAST button: visible=${lastVisible}, box=${JSON.stringify(lastBox)}`);

      // Try clicking the last one
      if (lastVisible) {
        await lastBtn.click();
        await window.waitForTimeout(1000);

        const modal = window.locator('[role="dialog"]');
        const modalVisible = await modal.isVisible().catch(() => false);
        console.log(`Modal visible after clicking LAST button: ${modalVisible}`);
      }
    }
  });
});
