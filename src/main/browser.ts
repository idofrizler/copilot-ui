/**
 * Browser Automation Module
 * 
 * Provides Playwright-based browser automation with persistent sessions.
 * Sessions persist cookies, localStorage, and other browser state between runs
 * so users don't need to re-login each time.
 * 
 * Playwright is lazy-loaded on first use to improve app startup time.
 */

import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import log from 'electron-log/main'

// Lazy-loaded Playwright types (import type is free - doesn't load the module)
import type { Browser, BrowserContext, Page } from 'playwright'

// Playwright module - lazy loaded on first use
let playwrightModule: typeof import('playwright') | null = null

// Load Playwright lazily to improve startup time
async function getPlaywright(): Promise<typeof import('playwright')> {
  if (!playwrightModule) {
    log.info('[Browser] Loading Playwright module (lazy load)...')
    playwrightModule = await import('playwright')
    log.info('[Browser] Playwright module loaded')
  }
  return playwrightModule
}

// Browser session manager - singleton
let browserInstance: Browser | null = null
let browserContext: BrowserContext | null = null

// Map of sessionId -> Page for each Copilot session
const sessionPages = new Map<string, Page>()

// Path to store persistent browser data (cookies, localStorage, etc.)
const getBrowserDataPath = (): string => {
  const dataPath = join(app.getPath('userData'), 'browser-data')
  if (!existsSync(dataPath)) {
    mkdirSync(dataPath, { recursive: true })
  }
  return dataPath
}

/**
 * Get or create the shared browser instance
 */
async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.isConnected()) {
    log.info('[Browser] Reusing existing browser instance')
    return browserInstance
  }

  log.info('[Browser] Launching new browser instance...')
  const playwright = await getPlaywright()
  browserInstance = await playwright.chromium.launch({
    headless: true, // Using headless to avoid Chromium cleanup windows flashing on close
    args: [
      '--disable-blink-features=AutomationControlled', // Avoid detection
    ]
  })
  log.info('[Browser] Browser instance launched')

  browserInstance.on('disconnected', () => {
    log.info('[Browser] Browser disconnected event fired')
    browserInstance = null
    browserContext = null
    sessionPages.clear()
  })

  return browserInstance
}

/**
 * Get or create the persistent browser context
 * This context stores cookies, localStorage, etc. and persists between sessions
 */
async function getBrowserContext(): Promise<BrowserContext> {
  if (browserContext) {
    log.info('[Browser] Reusing existing browser context')
    return browserContext
  }

  const browser = await getBrowser()
  const userDataPath = getBrowserDataPath()
  const storageStatePath = join(userDataPath, 'storage-state.json')
  const hasStorageState = existsSync(storageStatePath)

  log.info(`[Browser] Creating new browser context, storageState exists: ${hasStorageState}`)

  // Debug: check storage state content
  if (hasStorageState) {
    try {
      const stateContent = JSON.parse(readFileSync(storageStatePath, 'utf-8'))
      const cookieCount = stateContent.cookies?.length || 0
      const originCount = stateContent.origins?.length || 0
      const uniqueDomains = new Set(stateContent.cookies?.map((c: { domain: string }) => c.domain) || [])
      log.info(`[Browser] StorageState has ${cookieCount} cookies from ${uniqueDomains.size} unique domains, ${originCount} origins`)
    } catch (e) {
      log.info(`[Browser] Could not parse storageState: ${e}`)
    }
  }

  log.info('[Browser] About to call browser.newContext()...')
  log.info(`[Browser] Using storageState: ${hasStorageState}`)
  
  browserContext = await browser.newContext({
    // Keep UA platform-neutral to avoid Windows-specific detection issues.
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    storageState: hasStorageState ? storageStatePath : undefined
  })
  log.info('[Browser] browser.newContext() completed')

  // Log when pages are created in this context
  browserContext.on('page', (page) => {
    log.info(`[Browser] New page created in context, URL: ${page.url()}`)
    page.on('close', () => {
      log.info(`[Browser] Page closed, URL was: ${page.url()}`)
    })
  })

  // Save storage state periodically
  browserContext.on('close', async () => {
    log.info('[Browser] Browser context closed event fired')
    browserContext = null
  })

  return browserContext
}

/**
 * Save the current browser session state (cookies, localStorage, etc.)
 */
export async function saveBrowserState(): Promise<void> {
  if (!browserContext) return

  try {
    const userDataPath = getBrowserDataPath()
    await browserContext.storageState({ path: join(userDataPath, 'storage-state.json') })
    log.info('Browser state saved')
  } catch (error) {
    log.error('Failed to save browser state:', error)
  }
}

/**
 * Get or create a page for a specific Copilot session
 */
export async function getSessionPage(sessionId: string): Promise<Page> {
  log.info(`[Browser] getSessionPage called for session: ${sessionId}`)
  
  if (sessionPages.has(sessionId)) {
    const page = sessionPages.get(sessionId)!
    // Check if page is still valid
    try {
      await page.title() // Simple check if page is still open
      log.info(`[Browser] Reusing existing page for session: ${sessionId}`)
      return page
    } catch {
      // Page was closed, remove from map
      log.info(`[Browser] Existing page was closed, removing from map: ${sessionId}`)
      sessionPages.delete(sessionId)
    }
  }

  log.info(`[Browser] Creating new page for session: ${sessionId}`)
  const context = await getBrowserContext()
  const page = await context.newPage()
  log.info(`[Browser] New page created for session: ${sessionId}, URL: ${page.url()}`)

  page.on('close', () => {
    log.info(`[Browser] Page close event for session: ${sessionId}`)
    sessionPages.delete(sessionId)
  })

  sessionPages.set(sessionId, page)
  log.info(`[Browser] Page registered for session: ${sessionId}`)

  return page
}

/**
 * Close the page for a specific session
 */
export async function closeSessionPage(sessionId: string): Promise<void> {
  log.info(`[Browser] closeSessionPage called for session: ${sessionId}`)
  const page = sessionPages.get(sessionId)
  if (page) {
    await saveBrowserState()
    log.info(`[Browser] Closing page for session: ${sessionId}`)
    await page.close()
    sessionPages.delete(sessionId)
    log.info(`[Browser] Closed browser page for session: ${sessionId}`)
  } else {
    log.info(`[Browser] No page found for session: ${sessionId}`)
  }
}

/**
 * Close all browser resources
 */
export async function closeBrowser(): Promise<void> {
  log.info(`[Browser] closeBrowser called, sessionPages count: ${sessionPages.size}`)
  await saveBrowserState()

  for (const [sessionId, page] of sessionPages) {
    try {
      log.info(`[Browser] Closing page for session: ${sessionId}`)
      await page.close()
    } catch (e) {
      log.info(`[Browser] Error closing page for session ${sessionId}: ${e}`)
    }
    sessionPages.delete(sessionId)
  }

  if (browserContext) {
    try {
      log.info('[Browser] Closing browser context')
      await browserContext.close()
      log.info('[Browser] Browser context closed')
    } catch (e) {
      log.info(`[Browser] Error closing browser context: ${e}`)
    }
    browserContext = null
  }

  if (browserInstance) {
    try {
      log.info('[Browser] Closing browser instance')
      await browserInstance.close()
      log.info('[Browser] Browser instance closed')
    } catch (e) {
      log.info(`[Browser] Error closing browser instance: ${e}`)
    }
    browserInstance = null
  }

  log.info('[Browser] Browser closed completely')
}

/**
 * Check if a browser session is active
 */
export function hasActiveBrowser(): boolean {
  return browserInstance !== null && browserInstance.isConnected()
}

/**
 * Get list of active session IDs with browser pages
 */
export function getActiveBrowserSessions(): string[] {
  return Array.from(sessionPages.keys())
}

// --- Browser Automation Actions ---

export interface BrowserActionResult {
  success: boolean
  message?: string
  data?: unknown
}

/**
 * Navigate to a URL
 */
export async function navigateTo(sessionId: string, url: string): Promise<BrowserActionResult> {
  log.info(`[Browser] navigateTo called: session=${sessionId}, url=${url}`)
  try {
    const page = await getSessionPage(sessionId)
    log.info(`[Browser] Navigating to: ${url}`)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    const title = await page.title()
    log.info(`[Browser] Navigation complete: ${title}`)
    return { success: true, message: `Navigated to "${title}" (${url})` }
  } catch (error) {
    log.error(`[Browser] Navigation failed: ${error}`)
    return { success: false, message: `Navigation failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Click an element by selector
 */
export async function clickElement(sessionId: string, selector: string): Promise<BrowserActionResult> {
  try {
    const page = await getSessionPage(sessionId)
    await page.click(selector, { timeout: 10000 })
    return { success: true, message: `Clicked element: ${selector}` }
  } catch (error) {
    return { success: false, message: `Click failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Fill a form input
 */
export async function fillInput(sessionId: string, selector: string, value: string): Promise<BrowserActionResult> {
  try {
    const page = await getSessionPage(sessionId)
    await page.fill(selector, value, { timeout: 10000 })
    return { success: true, message: `Filled "${selector}" with value` }
  } catch (error) {
    return { success: false, message: `Fill failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Type text into an element (simulates keyboard input)
 */
export async function typeText(sessionId: string, selector: string, text: string): Promise<BrowserActionResult> {
  try {
    const page = await getSessionPage(sessionId)
    await page.click(selector, { timeout: 10000 })
    await page.keyboard.type(text, { delay: 50 })
    return { success: true, message: `Typed text into "${selector}"` }
  } catch (error) {
    return { success: false, message: `Type failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Press a keyboard key
 */
export async function pressKey(sessionId: string, key: string): Promise<BrowserActionResult> {
  try {
    const page = await getSessionPage(sessionId)
    await page.keyboard.press(key)
    return { success: true, message: `Pressed key: ${key}` }
  } catch (error) {
    return { success: false, message: `Key press failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Take a screenshot and return as base64
 */
export async function takeScreenshot(sessionId: string, fullPage = false): Promise<BrowserActionResult> {
  try {
    const page = await getSessionPage(sessionId)
    const buffer = await page.screenshot({ fullPage, type: 'png' })
    const base64 = buffer.toString('base64')
    return { 
      success: true, 
      message: 'Screenshot captured',
      data: {
        base64,
        mimeType: 'image/png'
      }
    }
  } catch (error) {
    return { success: false, message: `Screenshot failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Get text content from an element or the whole page
 */
export async function getTextContent(sessionId: string, selector?: string): Promise<BrowserActionResult> {
  try {
    const page = await getSessionPage(sessionId)
    let text: string

    if (selector) {
      const element = await page.$(selector)
      if (!element) {
        return { success: false, message: `Element not found: ${selector}` }
      }
      text = await element.textContent() || ''
    } else {
      text = await page.textContent('body') || ''
    }

    // Truncate if too long
    const maxLength = 5000
    if (text.length > maxLength) {
      text = text.substring(0, maxLength) + '... (truncated)'
    }

    return { success: true, message: 'Text content retrieved', data: text.trim() }
  } catch (error) {
    return { success: false, message: `Get text failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Get the page HTML or element HTML
 */
export async function getPageHtml(sessionId: string, selector?: string): Promise<BrowserActionResult> {
  try {
    const page = await getSessionPage(sessionId)
    let html: string

    if (selector) {
      const element = await page.$(selector)
      if (!element) {
        return { success: false, message: `Element not found: ${selector}` }
      }
      html = await element.innerHTML()
    } else {
      html = await page.content()
    }

    // Truncate if too long
    const maxLength = 10000
    if (html.length > maxLength) {
      html = html.substring(0, maxLength) + '... (truncated)'
    }

    return { success: true, message: 'HTML content retrieved', data: html }
  } catch (error) {
    return { success: false, message: `Get HTML failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Wait for an element to appear
 */
export async function waitForElement(sessionId: string, selector: string, timeout = 10000): Promise<BrowserActionResult> {
  try {
    const page = await getSessionPage(sessionId)
    await page.waitForSelector(selector, { timeout })
    return { success: true, message: `Element found: ${selector}` }
  } catch (error) {
    return { success: false, message: `Wait failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Wait for navigation to complete
 */
export async function waitForNavigation(sessionId: string, timeout = 30000): Promise<BrowserActionResult> {
  try {
    const page = await getSessionPage(sessionId)
    await page.waitForLoadState('domcontentloaded', { timeout })
    const url = page.url()
    const title = await page.title()
    return { success: true, message: `Navigation complete: "${title}" (${url})` }
  } catch (error) {
    return { success: false, message: `Wait for navigation failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Get current page URL and title
 */
export async function getPageInfo(sessionId: string): Promise<BrowserActionResult> {
  try {
    const page = await getSessionPage(sessionId)
    const url = page.url()
    const title = await page.title()
    return { 
      success: true, 
      message: `Current page: "${title}"`,
      data: { url, title }
    }
  } catch (error) {
    return { success: false, message: `Get page info failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Select an option from a dropdown
 */
export async function selectOption(sessionId: string, selector: string, value: string): Promise<BrowserActionResult> {
  try {
    const page = await getSessionPage(sessionId)
    await page.selectOption(selector, value, { timeout: 10000 })
    return { success: true, message: `Selected "${value}" in ${selector}` }
  } catch (error) {
    return { success: false, message: `Select failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Check or uncheck a checkbox
 */
export async function setCheckbox(sessionId: string, selector: string, checked: boolean): Promise<BrowserActionResult> {
  try {
    const page = await getSessionPage(sessionId)
    if (checked) {
      await page.check(selector, { timeout: 10000 })
    } else {
      await page.uncheck(selector, { timeout: 10000 })
    }
    return { success: true, message: `Checkbox ${checked ? 'checked' : 'unchecked'}: ${selector}` }
  } catch (error) {
    return { success: false, message: `Checkbox operation failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Scroll the page or an element
 */
export async function scroll(sessionId: string, direction: 'up' | 'down' | 'top' | 'bottom', selector?: string): Promise<BrowserActionResult> {
  try {
    const page = await getSessionPage(sessionId)
    
    if (selector) {
      const element = await page.$(selector)
      if (!element) {
        return { success: false, message: `Element not found: ${selector}` }
      }
      await element.scrollIntoViewIfNeeded()
      return { success: true, message: `Scrolled to element: ${selector}` }
    }

    switch (direction) {
      case 'up':
        await page.keyboard.press('PageUp')
        break
      case 'down':
        await page.keyboard.press('PageDown')
        break
      case 'top':
        await page.keyboard.press('Home')
        break
      case 'bottom':
        await page.keyboard.press('End')
        break
    }

    return { success: true, message: `Scrolled ${direction}` }
  } catch (error) {
    return { success: false, message: `Scroll failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Go back in browser history
 */
export async function goBack(sessionId: string): Promise<BrowserActionResult> {
  try {
    const page = await getSessionPage(sessionId)
    await page.goBack({ timeout: 30000 })
    const title = await page.title()
    return { success: true, message: `Navigated back to: "${title}"` }
  } catch (error) {
    return { success: false, message: `Go back failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Go forward in browser history
 */
export async function goForward(sessionId: string): Promise<BrowserActionResult> {
  try {
    const page = await getSessionPage(sessionId)
    await page.goForward({ timeout: 30000 })
    const title = await page.title()
    return { success: true, message: `Navigated forward to: "${title}"` }
  } catch (error) {
    return { success: false, message: `Go forward failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Reload the current page
 */
export async function reload(sessionId: string): Promise<BrowserActionResult> {
  try {
    const page = await getSessionPage(sessionId)
    await page.reload({ timeout: 30000 })
    const title = await page.title()
    return { success: true, message: `Reloaded page: "${title}"` }
  } catch (error) {
    return { success: false, message: `Reload failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Get all links on the page
 */
export async function getLinks(sessionId: string): Promise<BrowserActionResult> {
  try {
    const page = await getSessionPage(sessionId)
    const links = await page.$$eval('a[href]', (elements) => 
      elements.slice(0, 50).map(el => ({
        text: el.textContent?.trim().substring(0, 100) || '',
        href: el.getAttribute('href') || ''
      })).filter(l => l.href && !l.href.startsWith('javascript:'))
    )
    return { 
      success: true, 
      message: `Found ${links.length} links`,
      data: links
    }
  } catch (error) {
    return { success: false, message: `Get links failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Get all form inputs on the page
 */
export async function getFormInputs(sessionId: string): Promise<BrowserActionResult> {
  try {
    const page = await getSessionPage(sessionId)
    const inputs = await page.$$eval('input, textarea, select', (elements) =>
      elements.slice(0, 50).map(el => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || 'text',
        name: el.getAttribute('name') || '',
        id: el.getAttribute('id') || '',
        placeholder: el.getAttribute('placeholder') || '',
        value: (el as HTMLInputElement).value || ''
      }))
    )
    return {
      success: true,
      message: `Found ${inputs.length} form inputs`,
      data: inputs
    }
  } catch (error) {
    return { success: false, message: `Get form inputs failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}
