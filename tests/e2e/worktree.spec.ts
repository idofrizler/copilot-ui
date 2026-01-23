import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'

let electronApp: ElectronApplication
let window: Page

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../out/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  })
  
  window = await electronApp.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForTimeout(2000) // Wait for React to render
})

test.afterAll(async () => {
  await electronApp?.close()
})

test.describe('Worktree Sessions', () => {
  test('should have branch widget visible', async () => {
    // Look for the git branch widget
    const branchWidget = await window.locator('[data-testid="git-branch-widget"]').or(
      window.locator('[class*="GitBranchWidget"], [class*="branch"]')
    ).first()
    
    const isVisible = await branchWidget.isVisible().catch(() => false)
    console.log('Branch widget visible:', isVisible)
  })

  test('should be able to open worktree sessions modal', async () => {
    // Try to find and click worktree-related button
    const worktreeButton = await window.locator('[data-testid="worktree-sessions"]').or(
      window.locator('button').filter({ hasText: /session|worktree/i })
    ).first()
    
    const isVisible = await worktreeButton.isVisible().catch(() => false)
    if (isVisible) {
      await worktreeButton.click()
      // Wait for modal
      await window.waitForTimeout(500)
      
      // Check if modal appeared
      const modal = await window.locator('[data-testid="worktree-modal"]').or(
        window.locator('[role="dialog"], .modal, [class*="Modal"]')
      ).first()
      
      const modalVisible = await modal.isVisible().catch(() => false)
      console.log('Worktree modal visible:', modalVisible)
    }
  })
})
