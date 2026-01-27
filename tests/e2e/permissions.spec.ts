import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'

let electronApp: ElectronApplication
let window: Page

test.describe('Permissions Modal', () => {
  test.beforeAll(async () => {
    // Launch Electron app with FORCE_PERMISSIONS_MODAL to simulate missing permissions
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        FORCE_PERMISSIONS_MODAL: 'true',
      },
    })
    
    // Wait for the first window
    window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async () => {
    await electronApp?.close()
  })

  test('should show permissions modal on first launch', async () => {
    // Wait for modal to appear
    const modal = window.locator('[data-testid="permissions-modal"]')
    await expect(modal).toBeVisible({ timeout: 10000 })
    
    // Take a screenshot for visual verification
    await window.screenshot({ path: 'test-results/permissions-modal-visible.png' })
  })

  test('should display permission setup title', async () => {
    const title = window.locator('[data-testid="permissions-modal"] >> text=Permission Setup')
    await expect(title).toBeVisible()
  })

  test('should show Screen Recording permission section', async () => {
    const screenRecording = window.locator('[data-testid="permissions-modal"] >> text=Screen Recording')
    await expect(screenRecording).toBeVisible()
  })

  test('should show Accessibility permission section', async () => {
    const accessibility = window.locator('[data-testid="permissions-modal"] >> text=Accessibility')
    await expect(accessibility).toBeVisible()
  })

  test('should have Continue button', async () => {
    const continueBtn = window.locator('[data-testid="permissions-continue"]')
    await expect(continueBtn).toBeVisible()
  })

  test('should have Don\'t show again button', async () => {
    const dontShowBtn = window.locator('[data-testid="permissions-dont-show-again"]')
    await expect(dontShowBtn).toBeVisible()
  })

  test('should close modal when Continue is clicked', async () => {
    const continueBtn = window.locator('[data-testid="permissions-continue"]')
    await continueBtn.click()
    
    const modal = window.locator('[data-testid="permissions-modal"]')
    await expect(modal).not.toBeVisible({ timeout: 5000 })
    
    // Take a screenshot showing modal is gone
    await window.screenshot({ path: 'test-results/permissions-modal-closed.png' })
  })
})

test.describe('Permissions Modal - Don\'t Show Again', () => {
  let electronApp2: ElectronApplication
  let window2: Page

  test('should not show modal after "Don\'t show again" is clicked', async () => {
    // First, launch with FORCE_PERMISSIONS_MODAL to show modal
    electronApp2 = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        FORCE_PERMISSIONS_MODAL: 'true',
      },
    })
    
    window2 = await electronApp2.firstWindow()
    await window2.waitForLoadState('domcontentloaded')
    
    // Wait for modal and click "Don't show again"
    const dontShowBtn = window2.locator('[data-testid="permissions-dont-show-again"]')
    await expect(dontShowBtn).toBeVisible({ timeout: 10000 })
    await dontShowBtn.click()
    
    // Modal should close
    const modal = window2.locator('[data-testid="permissions-modal"]')
    await expect(modal).not.toBeVisible({ timeout: 5000 })
    
    await electronApp2.close()
    
    // Now launch again - modal should NOT appear
    electronApp2 = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    })
    
    window2 = await electronApp2.firstWindow()
    await window2.waitForLoadState('domcontentloaded')
    
    // Give it time to potentially show
    await window2.waitForTimeout(2000)
    
    // Modal should NOT be visible
    const modalAfterRestart = window2.locator('[data-testid="permissions-modal"]')
    const isVisible = await modalAfterRestart.isVisible().catch(() => false)
    expect(isVisible).toBe(false)
    
    await electronApp2.close()
  })
})
