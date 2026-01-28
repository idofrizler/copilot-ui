import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'

let electronApp: ElectronApplication
let window: Page

// Mock session data that matches what main.ts generates with USE_MOCK_SESSIONS=true
const MOCK_SESSIONS = {
  total: 12,
  today: ['Fix authentication bug', 'Add user dashboard'],
  yesterday: ['Refactor API endpoints', 'Update unit tests'],
  week: ['Feature: Dark mode support', 'Performance optimization', 'Database migration script'],
  month: ['Initial project setup', 'Documentation updates', 'CI/CD pipeline config'],
  older: ['Legacy code cleanup', 'Archive migration'],
}

test.beforeAll(async () => {
  // Launch Electron app with mock sessions enabled
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../out/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      USE_MOCK_SESSIONS: 'true', // Enable mock sessions for deterministic testing
    },
  })
  
  // Wait for the first window
  window = await electronApp.firstWindow()
  
  // Wait for app to be ready
  await window.waitForLoadState('domcontentloaded')
  
  // Give the app time to initialize
  await window.waitForTimeout(3000)
})

test.afterAll(async () => {
  await electronApp?.close()
})

// Helper to open the modal
async function openSessionHistoryModal() {
  const modalTitle = window.locator('h3', { hasText: 'Session History' })
  const isVisible = await modalTitle.isVisible().catch(() => false)
  
  if (!isVisible) {
    const historyButton = window.locator('button', { hasText: 'Session History' })
    await historyButton.click()
    await window.waitForTimeout(500)
  }
}

// Helper to close the modal
async function closeSessionHistoryModal() {
  const closeButton = window.locator('[aria-label="Close modal"]')
  const isVisible = await closeButton.isVisible().catch(() => false)
  if (isVisible) {
    await closeButton.click()
    await window.waitForTimeout(300)
  }
}

// Helper to get session count from footer (works with any data)
async function getSessionCount(): Promise<{ total: number; filtered?: number }> {
  const modal = window.locator('[role="dialog"]')
  const footer = modal.locator('span').filter({ hasText: /sessions/ }).last()
  const text = await footer.textContent() || ''
  
  // Match "X of Y sessions" or "X sessions in history"
  const filteredMatch = text.match(/(\d+) of (\d+) sessions/)
  if (filteredMatch) {
    return { filtered: parseInt(filteredMatch[1]), total: parseInt(filteredMatch[2]) }
  }
  
  const totalMatch = text.match(/(\d+) sessions/)
  if (totalMatch) {
    return { total: parseInt(totalMatch[1]) }
  }
  
  return { total: 0 }
}

test.describe('Session History - Basic UI', () => {
  test('should have Session History button in sidebar', async () => {
    const historyButton = window.locator('button', { hasText: 'Session History' })
    await expect(historyButton).toBeVisible({ timeout: 10000 })
    
    // Take screenshot of sidebar with button
    await window.screenshot({ 
      path: path.join(__dirname, '../../evidence/01-sidebar-history-button.png'),
      fullPage: false 
    })
  })

  test('should open modal when clicking the button', async () => {
    await openSessionHistoryModal()
    
    const modalTitle = window.locator('h3', { hasText: 'Session History' })
    await expect(modalTitle).toBeVisible({ timeout: 5000 })
  })

  test('should have search input with correct placeholder', async () => {
    await openSessionHistoryModal()
    
    const searchInput = window.locator('input[placeholder*="Search sessions"]')
    await expect(searchInput).toBeVisible({ timeout: 5000 })
    await expect(searchInput).toHaveAttribute('placeholder', 'Search sessions...')
  })

  test('should auto-focus search input when modal opens', async () => {
    await closeSessionHistoryModal()
    await openSessionHistoryModal()
    
    const searchInput = window.locator('input[placeholder*="Search"]')
    await window.waitForTimeout(200)
    await expect(searchInput).toBeFocused()
  })

  test('should close modal when clicking X button', async () => {
    await openSessionHistoryModal()
    
    const closeButton = window.locator('[aria-label="Close modal"]')
    await closeButton.click()
    await window.waitForTimeout(300)
    
    const modalTitle = window.locator('h3', { hasText: 'Session History' })
    await expect(modalTitle).not.toBeVisible({ timeout: 2000 })
  })
})

test.describe('Session History - Content Display', () => {
  test('should show mock sessions with time categories', async () => {
    await openSessionHistoryModal()
    
    // Screenshot of modal content
    await window.screenshot({ 
      path: path.join(__dirname, '../../evidence/02-modal-content.png'),
      fullPage: false 
    })
    
    // Verify we have exactly 12 mock sessions
    const { total } = await getSessionCount()
    expect(total).toBe(MOCK_SESSIONS.total)
    
    // Verify all time category headers are present
    const modal = window.locator('[role="dialog"]')
    await expect(modal.locator('text=Today')).toBeVisible()
    await expect(modal.locator('text=Yesterday')).toBeVisible()
    await expect(modal.locator('text=Last 7 Days')).toBeVisible()
    await expect(modal.locator('text=Last 30 Days')).toBeVisible()
    await expect(modal.locator('text=Older')).toBeVisible()
    
    // Verify some specific mock session names are visible
    await expect(modal.locator('text=Fix authentication bug')).toBeVisible()
    await expect(modal.locator('text=Refactor API endpoints')).toBeVisible()
  })

  test('should show session count in footer', async () => {
    await openSessionHistoryModal()
    
    const modal = window.locator('[role="dialog"]')
    const footer = modal.locator('span').filter({ hasText: /sessions/ }).last()
    await expect(footer).toBeVisible({ timeout: 5000 })
    
    // Verify exact count matches our mock data
    const { total } = await getSessionCount()
    expect(total).toBe(MOCK_SESSIONS.total)
  })
})

test.describe('Session History - Search Functionality', () => {
  test('should filter sessions by name', async () => {
    await openSessionHistoryModal()
    
    const searchInput = window.locator('input[placeholder*="Search"]')
    const modal = window.locator('[role="dialog"]')
    
    // Search for "authentication" - should find 1 session
    await searchInput.fill('authentication')
    await window.waitForTimeout(300)
    
    // Take screenshot of filtered results
    await window.screenshot({ 
      path: path.join(__dirname, '../../evidence/03-search-filtered.png'),
      fullPage: false 
    })
    
    // Should show exactly 1 of 12 sessions
    const { filtered, total } = await getSessionCount()
    expect(filtered).toBe(1)
    expect(total).toBe(MOCK_SESSIONS.total)
    
    // The matching session should be visible
    await expect(modal.locator('text=Fix authentication bug')).toBeVisible()
  })

  test('should show "no results" when search matches nothing', async () => {
    await openSessionHistoryModal()
    
    const searchInput = window.locator('input[placeholder*="Search"]')
    
    // Type a search term that definitely won't match anything
    await searchInput.fill('xyznonexistent123')
    await window.waitForTimeout(300)
    
    // Take screenshot
    await window.screenshot({ 
      path: path.join(__dirname, '../../evidence/04-search-no-results.png'),
      fullPage: false 
    })
    
    // Should show "No sessions found" message with search term
    const noResults = window.locator('text=/No sessions found matching/')
    await expect(noResults).toBeVisible({ timeout: 2000 })
    await expect(window.locator('text=xyznonexistent123')).toBeVisible()
  })

  test('should clear search and restore all sessions', async () => {
    await openSessionHistoryModal()
    
    const searchInput = window.locator('input[placeholder*="Search"]')
    
    // Filter first
    await searchInput.fill('database')
    await window.waitForTimeout(200)
    
    const { filtered } = await getSessionCount()
    expect(filtered).toBe(1) // "Database migration script"
    
    // Then clear
    await searchInput.clear()
    await window.waitForTimeout(200)
    
    // Should restore all 12 sessions
    const { total: restoredTotal } = await getSessionCount()
    expect(restoredTotal).toBe(MOCK_SESSIONS.total)
  })

  test('should be case-insensitive search', async () => {
    await openSessionHistoryModal()
    
    const searchInput = window.locator('input[placeholder*="Search"]')
    
    // Search lowercase - "dark mode"
    await searchInput.fill('dark mode')
    await window.waitForTimeout(200)
    const lowerResult = await getSessionCount()
    
    // Search uppercase - "DARK MODE"
    await searchInput.fill('DARK MODE')
    await window.waitForTimeout(200)
    const upperResult = await getSessionCount()
    
    // Both should find the same session
    expect(lowerResult.filtered).toBe(1)
    expect(upperResult.filtered).toBe(1)
  })
})

test.describe('Session History - Session Resumption', () => {
  test('should click session and close modal', async () => {
    await openSessionHistoryModal()
    
    const searchInput = window.locator('input[placeholder*="Search"]')
    await searchInput.clear()
    await window.waitForTimeout(200)
    
    // Find session buttons inside the modal's scrollable area
    const sessionButtons = window.locator('.overflow-y-auto button.w-full')
    
    // Take screenshot before clicking
    await window.screenshot({ 
      path: path.join(__dirname, '../../evidence/05-before-resume.png'),
      fullPage: false 
    })
    
    // Click the first session button ("Fix authentication bug")
    await sessionButtons.first().click({ timeout: 5000 })
    
    // Wait for action to complete
    await window.waitForTimeout(3000)
    
    // Take screenshot after
    await window.screenshot({ 
      path: path.join(__dirname, '../../evidence/06-after-resume.png'),
      fullPage: false 
    })
    
    // Modal should close after clicking a session
    const modalTitle = window.locator('h3', { hasText: 'Session History' })
    await expect(modalTitle).not.toBeVisible({ timeout: 5000 })
  })
})

test.describe('Session History - Edge Cases', () => {
  test('should handle rapid search input without crashing', async () => {
    await openSessionHistoryModal()
    
    const searchInput = window.locator('input[placeholder*="Search"]')
    
    // Rapid typing
    await searchInput.fill('a')
    await searchInput.fill('ab')
    await searchInput.fill('abc')
    await searchInput.fill('abcd')
    await searchInput.fill('abcde')
    await window.waitForTimeout(300)
    
    // Should handle without crashing
    await expect(searchInput).toHaveValue('abcde')
    
    // Modal should still be visible
    const modal = window.locator('[role="dialog"]')
    await expect(modal).toBeVisible()
  })

  test('should handle special characters in search', async () => {
    await openSessionHistoryModal()
    
    const searchInput = window.locator('input[placeholder*="Search"]')
    const modal = window.locator('[role="dialog"]')
    
    // Special characters - should not crash
    await searchInput.fill('test-with-dash')
    await window.waitForTimeout(200)
    await expect(modal).toBeVisible()
    
    await searchInput.fill('test_with_underscore')
    await window.waitForTimeout(200)
    await expect(modal).toBeVisible()
    
    await searchInput.fill('path/with/slashes')
    await window.waitForTimeout(200)
    await expect(modal).toBeVisible()
  })

  test('should handle scroll if content is scrollable', async () => {
    await openSessionHistoryModal()
    
    const searchInput = window.locator('input[placeholder*="Search"]')
    await searchInput.clear()
    await window.waitForTimeout(200)
    
    // Find the scrollable container
    const scrollContainer = window.locator('.overflow-y-auto').first()
    const isScrollable = await scrollContainer.evaluate(el => el.scrollHeight > el.clientHeight)
    
    if (isScrollable) {
      // Scroll down
      await scrollContainer.evaluate(el => el.scrollTop = el.scrollHeight)
      await window.waitForTimeout(300)
      
      // Take screenshot of scrolled view
      await window.screenshot({ 
        path: path.join(__dirname, '../../evidence/07-scrolled-list.png'),
        fullPage: false 
      })
      
      // Scroll back up
      await scrollContainer.evaluate(el => el.scrollTop = 0)
    }
    
    // Modal should still be functional
    const modal = window.locator('[role="dialog"]')
    await expect(modal).toBeVisible()
  })
})

test.describe('Session History - Final Screenshots', () => {
  test('should capture feature demonstration with mock data', async () => {
    // 1. Initial state with button
    await closeSessionHistoryModal()
    await window.screenshot({ 
      path: path.join(__dirname, '../../evidence/final-01-button.png'),
      fullPage: false 
    })
    
    // 2. Modal open showing all mock sessions
    await openSessionHistoryModal()
    await window.waitForTimeout(300)
    const modal = window.locator('[role="dialog"]')
    
    // Verify mock sessions are visible
    await expect(modal.locator('text=Fix authentication bug')).toBeVisible()
    await expect(modal.locator('text=12 sessions in history')).toBeVisible()
    
    await window.screenshot({ 
      path: path.join(__dirname, '../../evidence/final-02-modal-open.png'),
      fullPage: false 
    })
    
    // 3. Search for "project" - should find several mock sessions
    const searchInput = window.locator('input[placeholder*="Search"]')
    await searchInput.fill('project')
    await window.waitForTimeout(300)
    
    // Should find "Initial project setup"
    await expect(modal.locator('text=Initial project setup')).toBeVisible()
    
    await window.screenshot({ 
      path: path.join(__dirname, '../../evidence/final-03-search-active.png'),
      fullPage: false 
    })
    
    // 4. Search for nonexistent term
    await searchInput.fill('zzz_nonexistent_search')
    await window.waitForTimeout(300)
    await expect(modal.locator('text=/No sessions found/')).toBeVisible()
    
    await window.screenshot({ 
      path: path.join(__dirname, '../../evidence/final-04-no-results.png'),
      fullPage: false 
    })
    
    // 5. Clear and show all
    await searchInput.clear()
    await window.waitForTimeout(300)
    await expect(modal.locator('text=12 sessions in history')).toBeVisible()
    
    await window.screenshot({ 
      path: path.join(__dirname, '../../evidence/final-05-all-sessions.png'),
      fullPage: false 
    })
  })
})
