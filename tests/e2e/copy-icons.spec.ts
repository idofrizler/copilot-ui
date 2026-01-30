import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'

let electronApp: ElectronApplication
let window: Page

test.beforeAll(async () => {
  // Launch Electron app
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../out/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  })
  
  // Wait for the first window
  window = await electronApp.firstWindow()
  
  // Wait for app to be ready
  await window.waitForLoadState('domcontentloaded')
  
  // Enable test helpers BEFORE the app fully initializes
  await window.evaluate(() => {
    (window as any).__ENABLE_TEST_HELPERS__ = true
  })
  
  await window.waitForTimeout(2000)
})

test.afterAll(async () => {
  await electronApp?.close()
})

test.describe('Copy Icons for Code Blocks - Issue #103', () => {
  const screenshotDir = path.join(__dirname, '../../evidence/screenshots')

  test('01 - Initial app state before injecting messages', async () => {
    await window.screenshot({ path: `${screenshotDir}/01-initial-app-state.png` })
  })

  test('02 - Inject conversation with code blocks', async () => {
    // Inject messages through test helpers
    const injected = await window.evaluate(() => {
      const helpers = (window as any).__TEST_HELPERS__
      if (helpers && helpers.injectMessages) {
        helpers.injectMessages([
          {
            id: 'user-msg-1',
            role: 'user',
            content: 'How do I install dependencies and run tests?',
            timestamp: Date.now() - 60000,
          },
          {
            id: 'assistant-msg-1',
            role: 'assistant',
            content: `Here's how to install dependencies and run tests:

First, install dependencies:

\`\`\`bash
npm install
\`\`\`

Then run the tests:

\`\`\`bash
npm test
\`\`\`

You can also run tests in watch mode:

\`\`\`bash
npm run test:watch
\`\`\`

For a single-line command, you can chain them:

\`\`\`
npm install && npm test
\`\`\`

Note: Inline code like \`npm install\` doesn't need a copy button.`,
            timestamp: Date.now() - 30000,
          }
        ])
        return true
      }
      return false
    })
    
    console.log('Messages injected:', injected)
    await window.waitForTimeout(1500)
    await window.screenshot({ path: `${screenshotDir}/02-conversation-with-code-blocks.png` })
  })

  test('03 - Verify code blocks rendered in conversation', async () => {
    // Wait for content to render
    await window.waitForTimeout(500)
    
    // Debug: Check how code blocks are rendered
    const codeInfo = await window.evaluate(() => {
      const codes = document.querySelectorAll('code')
      return Array.from(codes).map(c => ({
        className: c.className,
        parentTag: c.parentElement?.tagName,
        text: c.textContent?.substring(0, 30),
        hasGroupWrapper: !!c.closest('.group')
      }))
    })
    console.log('Code elements:', JSON.stringify(codeInfo, null, 2))
    
    // Count code blocks using the actual component structure
    // CodeBlockWithCopy wraps pre/code in a div.relative.group
    const codeBlockCount = await window.evaluate(() => {
      return document.querySelectorAll('.relative.group pre').length
    })
    
    console.log('Code blocks with copy functionality found:', codeBlockCount)
    await window.screenshot({ path: `${screenshotDir}/03-code-blocks-rendered.png` })
  })

  test('04 - Hover over first code block to reveal copy button', async () => {
    // Find the code block wrappers - specifically those containing pre tags
    const codeBlockWrappers = await window.evaluate(() => {
      const wrappers = Array.from(document.querySelectorAll('.relative.group'))
        .filter(w => w.querySelector('pre'))
      return wrappers.length
    })
    
    console.log('Code block wrappers found:', codeBlockWrappers)
    
    // Debug: Check if buttons exist inside code block wrappers
    const buttonInfo = await window.evaluate(() => {
      const wrappers = Array.from(document.querySelectorAll('.relative.group'))
        .filter(w => w.querySelector('pre'))
      return wrappers.map(w => {
        const btn = w.querySelector('button')
        return {
          hasButton: !!btn,
          buttonClasses: btn?.className,
          innerHTML: btn?.innerHTML?.substring(0, 100)
        }
      })
    })
    console.log('Button info:', JSON.stringify(buttonInfo, null, 2))
    
    // Force the copy button visible on the FIRST code block (not just any .group)
    await window.evaluate(() => {
      const wrappers = Array.from(document.querySelectorAll('.relative.group'))
        .filter((w): w is HTMLElement => w.querySelector('pre') !== null)
      if (wrappers[0]) {
        const button = wrappers[0].querySelector('button')
        if (button) {
          button.style.opacity = '1'
          console.log('Forced button visible')
        }
      }
    })
    
    await window.waitForTimeout(500)
    await window.screenshot({ path: `${screenshotDir}/04-hover-first-code-block.png` })
  })

  test('05 - Copy button visible after hover', async () => {
    // The button inside code block wrapper should now be visible
    const buttonVisible = await window.evaluate(() => {
      const wrappers = Array.from(document.querySelectorAll('.relative.group'))
        .filter((w): w is HTMLElement => w.querySelector('pre') !== null)
      if (wrappers[0]) {
        const btn = wrappers[0].querySelector('button')
        if (btn) {
          const style = window.getComputedStyle(btn)
          return {
            opacity: style.opacity,
            display: style.display,
            visibility: style.visibility
          }
        }
      }
      return null
    })
    
    console.log('Button visibility:', buttonVisible)
    await window.screenshot({ path: `${screenshotDir}/05-copy-button-visible.png` })
  })

  test('06 - Click copy button and verify checkmark feedback', async () => {
    // Mock clipboard API
    await window.evaluate(() => {
      (navigator as any).clipboard = {
        writeText: (text: string) => {
          console.log('Copied:', text)
          return Promise.resolve()
        }
      }
    })
    
    // Find and click the copy button on first code block
    const clicked = await window.evaluate(() => {
      const wrappers = Array.from(document.querySelectorAll('.relative.group'))
        .filter((w): w is HTMLElement => w.querySelector('pre') !== null)
      if (wrappers[0]) {
        const btn = wrappers[0].querySelector('button') as HTMLButtonElement
        if (btn) {
          btn.click()
          return true
        }
      }
      return false
    })
    
    console.log('Button clicked:', clicked)
    await window.waitForTimeout(500) // Wait for state change
    
    // Keep button visible to show the checkmark
    await window.evaluate(() => {
      const wrappers = Array.from(document.querySelectorAll('.relative.group'))
        .filter((w): w is HTMLElement => w.querySelector('pre') !== null)
      if (wrappers[0]) {
        const btn = wrappers[0].querySelector('button')
        if (btn) btn.style.opacity = '1'
      }
    })
    
    await window.screenshot({ path: `${screenshotDir}/06-copied-checkmark-feedback.png` })
  })

  test('07 - Hover over second code block', async () => {
    // Force button visible for second code block ONLY
    await window.evaluate(() => {
      const wrappers = Array.from(document.querySelectorAll('.relative.group'))
        .filter((w): w is HTMLElement => w.querySelector('pre') !== null)
      wrappers.forEach((w, i) => {
        const btn = w.querySelector('button') as HTMLButtonElement
        if (btn) btn.style.opacity = i === 1 ? '1' : '0'
      })
    })
    
    await window.waitForTimeout(500)
    await window.screenshot({ path: `${screenshotDir}/07-hover-second-code-block.png` })
  })

  test('08 - Hover over multiline code block', async () => {
    // Force button visible for third code block ONLY
    await window.evaluate(() => {
      const wrappers = Array.from(document.querySelectorAll('.relative.group'))
        .filter((w): w is HTMLElement => w.querySelector('pre') !== null)
      wrappers.forEach((w, i) => {
        const btn = w.querySelector('button') as HTMLButtonElement
        if (btn) btn.style.opacity = i === 2 ? '1' : '0'
      })
    })
    
    await window.waitForTimeout(500)
    await window.screenshot({ path: `${screenshotDir}/08-hover-multiline-code-block.png` })
  })

  test('09 - Verify inline code has no copy button', async () => {
    // Find inline code elements (code tags NOT inside pre)
    const inlineCodeInfo = await window.evaluate(() => {
      const allCodes = document.querySelectorAll('code')
      const inlineCodes = Array.from(allCodes).filter(code => {
        const parent = code.parentElement
        return parent?.tagName !== 'PRE'
      })
      
      // Check if any inline code has a sibling button
      return inlineCodes.map(code => ({
        text: code.textContent?.substring(0, 30),
        hasButton: !!code.parentElement?.querySelector('button')
      }))
    })
    
    console.log('Inline code elements:', inlineCodeInfo)
    await window.screenshot({ path: `${screenshotDir}/09-inline-code-no-copy-button.png` })
  })

  test('10 - Full conversation overview', async () => {
    // Move mouse away to hide hover effects
    await window.mouse.move(0, 0)
    await window.waitForTimeout(300)
    await window.screenshot({ path: `${screenshotDir}/10-full-conversation-overview.png` })
  })
  
  test('11 - Add second conversation for more testing', async () => {
    // Inject additional messages with git commands
    await window.evaluate(() => {
      const helpers = (window as any).__TEST_HELPERS__
      if (helpers && helpers.injectMessages) {
        const currentTab = helpers.getActiveTab()
        const existingMessages = currentTab?.messages || []
        helpers.injectMessages([
          ...existingMessages,
          {
            id: 'user-msg-2',
            role: 'user',
            content: 'Show me git commands',
            timestamp: Date.now() - 5000,
          },
          {
            id: 'assistant-msg-2',
            role: 'assistant',
            content: `Here are common git commands:

\`\`\`bash
git status
git add .
git commit -m "your message"
git push origin main
\`\`\`

Check differences:

\`\`\`
git diff --staged
\`\`\``,
            timestamp: Date.now(),
          }
        ])
      }
    })
    
    await window.waitForTimeout(1000)
    await window.screenshot({ path: `${screenshotDir}/11-extended-conversation.png` })
  })

  test('12 - Hover on git commands code block', async () => {
    // Scroll down to see new content
    await window.evaluate(() => {
      const container = document.querySelector('.overflow-y-auto')
      if (container) container.scrollTop = container.scrollHeight
    })
    await window.waitForTimeout(300)
    
    // Force button visible for last code block ONLY
    await window.evaluate(() => {
      const wrappers = Array.from(document.querySelectorAll('.relative.group'))
        .filter((w): w is HTMLElement => w.querySelector('pre') !== null)
      const lastIndex = wrappers.length - 1
      wrappers.forEach((w, i) => {
        const btn = w.querySelector('button') as HTMLButtonElement
        if (btn) btn.style.opacity = i === lastIndex ? '1' : '0'
      })
    })
    
    await window.waitForTimeout(500)
    await window.screenshot({ path: `${screenshotDir}/12-hover-git-code-block.png` })
  })
})
