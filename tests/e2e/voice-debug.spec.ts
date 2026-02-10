import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'

let electronApp: ElectronApplication | undefined
let window: Page
const consoleLogs: { type: string; text: string }[] = []
const consoleErrors: string[] = []

test.afterAll(async () => {
  console.log('\n=== FULL CONSOLE LOG SUMMARY ===')
  console.log(`Total logs: ${consoleLogs.length}`)
  console.log(`Errors: ${consoleErrors.length}`)
  
  if (consoleErrors.length > 0) {
    console.log('\n=== ALL ERRORS ===')
    consoleErrors.forEach((err, i) => console.log(`${i + 1}. ${err}`))
  }
  
  await electronApp?.close()
})

test.describe.skip('Voice Input Debug', () => {
  test('should check speech recognition support and errors', async () => {
    // Check if SpeechRecognition is available
    const speechSupport = await window.evaluate(() => {
      return {
        hasSpeechRecognition: !!(window.SpeechRecognition || (window as any).webkitSpeechRecognition),
        hasSpeechSynthesis: !!window.speechSynthesis,
        userAgent: navigator.userAgent,
        online: navigator.onLine,
      }
    })
    
    console.log('\n=== SPEECH API SUPPORT ===')
    console.log('SpeechRecognition:', speechSupport.hasSpeechRecognition)
    console.log('SpeechSynthesis:', speechSupport.hasSpeechSynthesis)
    console.log('Online:', speechSupport.online)
    console.log('UserAgent:', speechSupport.userAgent)
    
    expect(speechSupport.hasSpeechRecognition || speechSupport.hasSpeechSynthesis).toBeTruthy()
  })

  test('should click mic button and capture any errors', async () => {
    // Find and click the microphone button
    const micButton = window.locator('button[title*="voice" i], button[title*="mic" i], button[aria-label*="voice" i], button[aria-label*="mic" i]').or(
      window.locator('[data-testid="mic-button"]')
    ).or(
      window.locator('button').filter({ has: window.locator('svg[class*="microphone" i]') })
    )
    
    const hasMicButton = await micButton.first().isVisible().catch(() => false)
    console.log('\n=== MIC BUTTON TEST ===')
    console.log('Mic button found:', hasMicButton)
    
    if (hasMicButton) {
      // Clear previous errors
      consoleErrors.length = 0
      
      // Click mic button to start recording
      console.log('Clicking mic button...')
      await micButton.first().click()
      
      // Wait for speech recognition to initialize and potentially error
      await window.waitForTimeout(3000)
      
      // Check for errors in console
      console.log('\n=== ERRORS AFTER MIC CLICK ===')
      if (consoleErrors.length > 0) {
        consoleErrors.forEach((err, i) => console.log(`Error ${i + 1}:`, err))
      } else {
        console.log('No errors captured')
      }
      
      // Check UI for error state
      const errorElement = window.locator('text="Speech error"').or(
        window.locator('text="network"')
      ).or(
        window.locator('[class*="error"]')
      )
      
      const hasErrorUI = await errorElement.first().isVisible().catch(() => false)
      console.log('Error visible in UI:', hasErrorUI)
      
      // Try to get any error text from the voice panel
      const voicePanelError = await window.locator('.text-copilot-error').first().textContent().catch(() => null)
      if (voicePanelError) {
        console.log('Voice panel error text:', voicePanelError)
      }
      
      // Click again to stop recording
      await micButton.first().click()
      await window.waitForTimeout(1000)
    }
  })

  test('should evaluate speech recognition error handling', async () => {
    // Try to manually trigger speech recognition and capture errors
    const result = await window.evaluate(async () => {
      const errors: string[] = []
      const logs: string[] = []
      
      try {
        const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        
        if (!SpeechRecognitionClass) {
          return { errors: ['SpeechRecognition not supported'], logs }
        }
        
        const recognition = new SpeechRecognitionClass()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = 'en-US'
        
        return new Promise<{ errors: string[]; logs: string[] }>((resolve) => {
          const timeout = setTimeout(() => {
            recognition.abort()
            resolve({ errors, logs })
          }, 5000)
          
          recognition.onstart = () => {
            logs.push('Recognition started')
          }
          
          recognition.onerror = (event: any) => {
            errors.push(`Speech error: ${event.error} - ${event.message || 'no message'}`)
            clearTimeout(timeout)
            resolve({ errors, logs })
          }
          
          recognition.onend = () => {
            logs.push('Recognition ended')
          }
          
          try {
            recognition.start()
            logs.push('Called recognition.start()')
          } catch (e: any) {
            errors.push(`Start error: ${e.message}`)
            clearTimeout(timeout)
            resolve({ errors, logs })
          }
        })
      } catch (e: any) {
        errors.push(`Setup error: ${e.message}`)
        return { errors, logs }
      }
    })
    
    console.log('\n=== DIRECT SPEECH RECOGNITION TEST ===')
    console.log('Logs:', result.logs)
    console.log('Errors:', result.errors)
    
    if (result.errors.length > 0) {
      result.errors.forEach((err, i) => {
        console.log(`\nError ${i + 1}:`, err)
        
        // Analyze the error
        if (err.includes('network')) {
          console.log('  → Network error: Speech recognition requires internet connection to Google servers')
          console.log('  → This is expected in Electron if offline or if Google Speech API is blocked')
        } else if (err.includes('not-allowed')) {
          console.log('  → Permission error: Microphone access was denied')
        } else if (err.includes('no-speech')) {
          console.log('  → No speech detected (this is normal if no audio input)')
        } else if (err.includes('audio-capture')) {
          console.log('  → Audio capture error: No microphone available or access issue')
        } else if (err.includes('aborted')) {
          console.log('  → Recognition was aborted (normal during testing)')
        }
      })
    }
  })

  test('should check network requests related to speech', async () => {
    // Get network info
    const networkInfo = await window.evaluate(() => {
      return {
        online: navigator.onLine,
        connection: (navigator as any).connection ? {
          type: (navigator as any).connection.type,
          effectiveType: (navigator as any).connection.effectiveType,
          downlink: (navigator as any).connection.downlink,
        } : 'Not available',
      }
    })
    
    console.log('\n=== NETWORK INFO ===')
    console.log('Online:', networkInfo.online)
    console.log('Connection:', networkInfo.connection)
    
    // Note about Chrome Speech API
    console.log('\n=== IMPORTANT NOTE ===')
    console.log('Chrome/Electron SpeechRecognition uses Google servers.')
    console.log('Network errors occur when:')
    console.log('1. No internet connection')
    console.log('2. Google Speech API is unreachable')
    console.log('3. Corporate firewall blocks the API')
    console.log('4. Running in certain test/CI environments')
  })

  test('should dump all console logs at end', async () => {
    console.log('\n=== ALL CONSOLE LOGS ===')
    consoleLogs.forEach((log, i) => {
      if (log.text.toLowerCase().includes('speech') || 
          log.text.toLowerCase().includes('voice') ||
          log.text.toLowerCase().includes('error') ||
          log.text.toLowerCase().includes('network') ||
          log.text.toLowerCase().includes('microphone') ||
          log.text.toLowerCase().includes('recognition')) {
        console.log(`[${log.type}] ${log.text}`)
      }
    })
    
    console.log('\n=== SPEECH/VOICE RELATED ERRORS ===')
    const speechErrors = consoleErrors.filter(e => 
      e.toLowerCase().includes('speech') || 
      e.toLowerCase().includes('voice') ||
      e.toLowerCase().includes('recognition') ||
      e.toLowerCase().includes('network')
    )
    
    if (speechErrors.length > 0) {
      speechErrors.forEach((err, i) => console.log(`${i + 1}. ${err}`))
    } else {
      console.log('No speech-related errors found')
    }
  })
})
