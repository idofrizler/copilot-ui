import { test, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'

let electronApp: ElectronApplication
let window: Page

test('Voice initialization timing and errors', async () => {
  const logs: { time: number; type: string; text: string }[] = []
  const startTime = Date.now()

  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../out/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  })
  
  window = await electronApp.firstWindow()
  
  // Capture ALL console messages with timestamps
  window.on('console', (msg) => {
    const elapsed = Date.now() - startTime
    logs.push({ time: elapsed, type: msg.type(), text: msg.text() })
    
    // Only log voice/vosk related or errors
    const text = msg.text().toLowerCase()
    if (text.includes('vosk') || text.includes('voice') || text.includes('model') || 
        text.includes('speech') || text.includes('load') || msg.type() === 'error') {
      console.log(`[${elapsed}ms] [${msg.type().toUpperCase()}] ${msg.text().substring(0, 200)}`)
    }
  })
  
  window.on('pageerror', (error) => {
    const elapsed = Date.now() - startTime
    console.log(`[${elapsed}ms] [PAGE ERROR] ${error.message}`)
  })

  await window.waitForLoadState('domcontentloaded')
  console.log(`\n[${Date.now() - startTime}ms] DOM loaded`)
  
  // Wait and observe voice initialization
  console.log('\n=== Waiting for voice initialization (30s max) ===\n')
  
  for (let i = 0; i < 30; i++) {
    await window.waitForTimeout(1000)
    
    // Check voice panel status
    const status = await window.evaluate(() => {
      const panel = document.querySelector('[class*="Voice"]')
      const statusText = document.body.innerText
      const hasLoading = statusText.includes('Loading model')
      const hasReady = statusText.includes('Ready (Offline)')
      const hasError = document.querySelector('[class*="error"]')?.textContent
      return { hasLoading, hasReady, hasError: hasError || null }
    })
    
    if (status.hasReady) {
      console.log(`\n[${Date.now() - startTime}ms] ✅ Voice ready (offline)!`)
      break
    }
    if (status.hasError) {
      console.log(`\n[${Date.now() - startTime}ms] ❌ Error: ${status.hasError}`)
      break
    }
    if (i % 5 === 0) {
      console.log(`[${Date.now() - startTime}ms] Still loading... (hasLoading: ${status.hasLoading})`)
    }
  }

  // Final summary
  console.log('\n=== TIMING SUMMARY ===')
  const voskLogs = logs.filter(l => l.text.toLowerCase().includes('vosk') || l.text.toLowerCase().includes('model'))
  voskLogs.forEach(l => console.log(`[${l.time}ms] ${l.text.substring(0, 150)}`))
  
  console.log('\n=== ERRORS ===')
  const errors = logs.filter(l => l.type === 'error')
  if (errors.length === 0) {
    console.log('No errors')
  } else {
    errors.forEach(l => console.log(`[${l.time}ms] ${l.text}`))
  }

  await electronApp.close()
})
