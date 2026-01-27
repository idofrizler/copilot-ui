/**
 * Screen Accessibility Tools
 * 
 * Provides cross-platform tools to interact with screen elements using
 * native accessibility APIs. These tools allow the AI to "see" and interact
 * with any application's UI, not just browsers.
 * 
 * - macOS: Uses AppleScript with System Events (Accessibility API)
 * - Windows: Uses PowerShell with UI Automation API
 */

import { z } from 'zod'
import { defineTool, Tool } from '@github/copilot-sdk'
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import log from 'electron-log/main'

const execAsync = promisify(exec)

// Type for UI element information
interface UIElement {
  role: string
  name: string
  description?: string
  value?: string
  position?: { x: number; y: number }
  size?: { width: number; height: number }
  enabled?: boolean
  focused?: boolean
  children?: UIElement[]
}

// Type for application info
interface AppInfo {
  name: string
  bundleId?: string
  pid?: number
  focused: boolean
  windows?: { title: string; position?: { x: number; y: number }; size?: { width: number; height: number } }[]
}

/**
 * Execute AppleScript (macOS only)
 * Writes script to temp file to avoid shell escaping issues with multi-line scripts
 */
async function runAppleScript(script: string): Promise<string> {
  const tempFile = join(tmpdir(), `applescript-${Date.now()}.scpt`)
  try {
    await writeFile(tempFile, script, 'utf-8')
    const { stdout } = await execAsync(`osascript "${tempFile}"`)
    return stdout.trim()
  } finally {
    try {
      await unlink(tempFile)
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Execute PowerShell script (Windows only)
 */
async function runPowerShell(script: string): Promise<string> {
  const encodedScript = Buffer.from(script, 'utf16le').toString('base64')
  const { stdout } = await execAsync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encodedScript}`)
  return stdout.trim()
}

/**
 * Get information about the currently focused application
 */
async function getFocusedApp(): Promise<AppInfo> {
  if (process.platform === 'darwin') {
    const script = `
      tell application "System Events"
        set frontApp to first application process whose frontmost is true
        set appName to name of frontApp
        set appWindows to {}
        try
          repeat with w in windows of frontApp
            set end of appWindows to {title:(name of w), position:(position of w), size:(size of w)}
          end repeat
        end try
        return {name:appName, windows:appWindows}
      end tell
    `
    try {
      const result = await runAppleScript(script)
      // Parse the AppleScript result
      const nameMatch = result.match(/name:([^,}]+)/)
      const name = nameMatch ? nameMatch[1].trim() : 'Unknown'
      
      return {
        name,
        focused: true
      }
    } catch (error) {
      log.error('[ScreenTools] Failed to get focused app (macOS):', error)
      throw new Error(`Failed to get focused app: ${error instanceof Error ? error.message : String(error)}. Make sure Accessibility permissions are granted.`)
    }
  } else if (process.platform === 'win32') {
    const script = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class Win32 {
          [DllImport("user32.dll")]
          public static extern IntPtr GetForegroundWindow();
          [DllImport("user32.dll")]
          public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
          [DllImport("user32.dll")]
          public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
        }
"@
      $hwnd = [Win32]::GetForegroundWindow()
      $title = New-Object System.Text.StringBuilder 256
      [Win32]::GetWindowText($hwnd, $title, 256) | Out-Null
      $processId = 0
      [Win32]::GetWindowThreadProcessId($hwnd, [ref]$processId) | Out-Null
      $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
      @{
        Name = if ($process) { $process.ProcessName } else { "Unknown" }
        Title = $title.ToString()
        PID = $processId
      } | ConvertTo-Json
    `
    try {
      const result = await runPowerShell(script)
      const parsed = JSON.parse(result)
      return {
        name: parsed.Name,
        pid: parsed.PID,
        focused: true,
        windows: [{ title: parsed.Title }]
      }
    } catch (error) {
      log.error('[ScreenTools] Failed to get focused app (Windows):', error)
      throw new Error(`Failed to get focused app: ${error instanceof Error ? error.message : String(error)}`)
    }
  } else {
    throw new Error(`Unsupported platform: ${process.platform}`)
  }
}

/**
 * Focus/activate an application by name
 */
async function focusApp(appName: string): Promise<void> {
  if (process.platform === 'darwin') {
    const script = `tell application "${appName}" to activate`
    try {
      await runAppleScript(script)
    } catch (error) {
      log.error('[ScreenTools] Failed to focus app (macOS):', error)
      throw new Error(`Failed to focus app "${appName}": ${error instanceof Error ? error.message : String(error)}`)
    }
  } else if (process.platform === 'win32') {
    const script = `
      $app = Get-Process | Where-Object { $_.MainWindowTitle -like "*${appName}*" -or $_.ProcessName -like "*${appName}*" } | Select-Object -First 1
      if ($app) {
        Add-Type @"
          using System;
          using System.Runtime.InteropServices;
          public class Win32Focus {
            [DllImport("user32.dll")]
            public static extern bool SetForegroundWindow(IntPtr hWnd);
          }
"@
        [Win32Focus]::SetForegroundWindow($app.MainWindowHandle)
        "Focused"
      } else {
        throw "App not found: ${appName}"
      }
    `
    try {
      await runPowerShell(script)
    } catch (error) {
      log.error('[ScreenTools] Failed to focus app (Windows):', error)
      throw new Error(`Failed to focus app "${appName}": ${error instanceof Error ? error.message : String(error)}`)
    }
  } else {
    throw new Error(`Unsupported platform: ${process.platform}`)
  }
}

/**
 * Get accessible UI elements from the focused application
 */
async function getUIElements(maxDepth = 3): Promise<UIElement[]> {
  if (process.platform === 'darwin') {
    // Simplified AppleScript to get UI elements (non-recursive for reliability)
    const script = `
tell application "System Events"
  set frontApp to first application process whose frontmost is true
  set elementList to {}
  
  try
    repeat with w in windows of frontApp
      -- Get window info
      try
        set winName to name of w
        set winPos to position of w
        set winSize to size of w
        set end of elementList to "ELEMENT:AXWindow|" & winName & "||" & "|" & (item 1 of winPos) & "," & (item 2 of winPos) & "|" & (item 1 of winSize) & "," & (item 2 of winSize)
      end try
      
      -- Get buttons
      try
        repeat with btn in buttons of w
          try
            set btnName to name of btn
            set btnPos to position of btn
            set btnSize to size of btn
            set end of elementList to "ELEMENT:AXButton|" & btnName & "||" & "|" & (item 1 of btnPos) & "," & (item 2 of btnPos) & "|" & (item 1 of btnSize) & "," & (item 2 of btnSize)
          end try
        end repeat
      end try
      
      -- Get text fields
      try
        repeat with tf in text fields of w
          try
            set tfName to name of tf
            set tfVal to value of tf
            set tfPos to position of tf
            set tfSize to size of tf
            set end of elementList to "ELEMENT:AXTextField|" & tfName & "||" & tfVal & "|" & (item 1 of tfPos) & "," & (item 2 of tfPos) & "|" & (item 1 of tfSize) & "," & (item 2 of tfSize)
          end try
        end repeat
      end try
      
      -- Get static text
      try
        repeat with staticTxt in static texts of w
          try
            set stName to name of staticTxt
            set stVal to value of staticTxt
            set stPos to position of staticTxt
            set stSize to size of staticTxt
            set end of elementList to "ELEMENT:AXStaticText|" & stName & "||" & stVal & "|" & (item 1 of stPos) & "," & (item 2 of stPos) & "|" & (item 1 of stSize) & "," & (item 2 of stSize)
          end try
        end repeat
      end try
      
      -- Get groups and their contents (one level deep)
      try
        repeat with grp in groups of w
          try
            set grpName to name of grp
            set grpPos to position of grp
            set grpSize to size of grp
            set end of elementList to "ELEMENT:AXGroup|" & grpName & "||" & "|" & (item 1 of grpPos) & "," & (item 2 of grpPos) & "|" & (item 1 of grpSize) & "," & (item 2 of grpSize)
          end try
          
          -- Buttons in group
          try
            repeat with btn in buttons of grp
              try
                set btnName to name of btn
                set btnPos to position of btn
                set btnSize to size of btn
                set end of elementList to "ELEMENT:AXButton|" & btnName & "||" & "|" & (item 1 of btnPos) & "," & (item 2 of btnPos) & "|" & (item 1 of btnSize) & "," & (item 2 of btnSize)
              end try
            end repeat
          end try
          
          -- Text fields in group
          try
            repeat with tf in text fields of grp
              try
                set tfName to name of tf
                set tfVal to value of tf
                set tfPos to position of tf
                set tfSize to size of tf
                set end of elementList to "ELEMENT:AXTextField|" & tfName & "||" & tfVal & "|" & (item 1 of tfPos) & "," & (item 2 of tfPos) & "|" & (item 1 of tfSize) & "," & (item 2 of tfSize)
              end try
            end repeat
          end try
        end repeat
      end try
      
      -- Get toolbars and their buttons
      try
        repeat with tb in toolbars of w
          try
            repeat with btn in buttons of tb
              try
                set btnName to name of btn
                set btnDesc to description of btn
                set btnPos to position of btn
                set btnSize to size of btn
                set end of elementList to "ELEMENT:AXButton|" & btnName & "|" & btnDesc & "|" & "|" & (item 1 of btnPos) & "," & (item 2 of btnPos) & "|" & (item 1 of btnSize) & "," & (item 2 of btnSize)
              end try
            end repeat
          end try
        end repeat
      end try
      
    end repeat
  end try
  
  return elementList
end tell
`
    try {
      const result = await runAppleScript(script)
      const elements: UIElement[] = []
      
      // Parse the result - each element is on a line starting with "ELEMENT:"
      const lines = result.split(/,\s*ELEMENT:|ELEMENT:/).filter(l => l.trim())
      for (const line of lines) {
        const parts = line.split('|')
        if (parts.length >= 6) {
          const [role, name, description, value, posStr, sizeStr] = parts
          const [x, y] = posStr.split(',').map(Number)
          const [width, height] = sizeStr.split(',').map(Number)
          
          elements.push({
            role: role.trim(),
            name: name.trim(),
            description: description.trim() || undefined,
            value: value.trim() || undefined,
            position: !isNaN(x) && !isNaN(y) ? { x, y } : undefined,
            size: !isNaN(width) && !isNaN(height) ? { width, height } : undefined
          })
        }
      }
      
      return elements
    } catch (error) {
      log.error('[ScreenTools] Failed to get UI elements (macOS):', error)
      throw new Error(`Failed to get UI elements: ${error instanceof Error ? error.message : String(error)}. Make sure Accessibility permissions are granted in System Settings > Privacy & Security > Accessibility.`)
    }
  } else if (process.platform === 'win32') {
    const script = `
      Add-Type -AssemblyName UIAutomationClient
      Add-Type -AssemblyName UIAutomationTypes
      
      function Get-UIElements {
        param([System.Windows.Automation.AutomationElement]$element, [int]$depth, [int]$maxDepth)
        
        $results = @()
        if ($depth -gt $maxDepth) { return $results }
        
        try {
          $rect = $element.Current.BoundingRectangle
          $results += @{
            Role = $element.Current.ControlType.ProgrammaticName -replace "ControlType.", ""
            Name = $element.Current.Name
            AutomationId = $element.Current.AutomationId
            Value = ""
            X = [int]$rect.X
            Y = [int]$rect.Y
            Width = [int]$rect.Width
            Height = [int]$rect.Height
            Enabled = $element.Current.IsEnabled
          }
          
          if ($depth -lt $maxDepth) {
            $children = $element.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
            foreach ($child in $children) {
              $results += Get-UIElements -element $child -depth ($depth + 1) -maxDepth $maxDepth
            }
          }
        } catch {}
        
        return $results
      }
      
      $root = [System.Windows.Automation.AutomationElement]::FocusedElement
      while ($root.Current.ControlType.ProgrammaticName -ne "ControlType.Window" -and $root.GetRuntimeId().Length -gt 0) {
        $parent = [System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($root)
        if ($null -eq $parent) { break }
        $root = $parent
      }
      
      $elements = Get-UIElements -element $root -depth 1 -maxDepth ${maxDepth}
      $elements | ConvertTo-Json -Depth 10
    `
    try {
      const result = await runPowerShell(script)
      const parsed = JSON.parse(result)
      const elements: UIElement[] = (Array.isArray(parsed) ? parsed : [parsed]).map((e: Record<string, unknown>) => ({
        role: String(e.Role || 'Unknown'),
        name: String(e.Name || ''),
        description: e.AutomationId ? String(e.AutomationId) : undefined,
        value: e.Value ? String(e.Value) : undefined,
        position: { x: Number(e.X) || 0, y: Number(e.Y) || 0 },
        size: { width: Number(e.Width) || 0, height: Number(e.Height) || 0 },
        enabled: Boolean(e.Enabled)
      }))
      return elements
    } catch (error) {
      log.error('[ScreenTools] Failed to get UI elements (Windows):', error)
      throw new Error(`Failed to get UI elements: ${error instanceof Error ? error.message : String(error)}`)
    }
  } else {
    throw new Error(`Unsupported platform: ${process.platform}`)
  }
}

/**
 * Click at screen coordinates
 */
async function clickAtPosition(x: number, y: number, button: 'left' | 'right' = 'left'): Promise<void> {
  if (process.platform === 'darwin') {
    // Use cliclick for mouse clicks on macOS (more reliable than Python/Quartz)
    try {
      const clickCmd = button === 'right' ? 'rc' : 'c'
      await execAsync(`cliclick ${clickCmd}:${x},${y}`)
    } catch (cliclickError) {
      // Fallback to AppleScript if cliclick not available
      try {
        const script = `
tell application "System Events"
  click at {${x}, ${y}}
end tell
`
        await runAppleScript(script)
      } catch (error) {
        log.error('[ScreenTools] Click failed (macOS):', error)
        throw new Error(`Click failed: ${error instanceof Error ? error.message : String(error)}. Install cliclick (brew install cliclick) for reliable clicking.`)
      }
    }
  } else if (process.platform === 'win32') {
    const downFlag = button === 'right' ? '0x0008' : '0x0002'
    const upFlag = button === 'right' ? '0x0010' : '0x0004'
    const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Mouse {
  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
}
"@
[Mouse]::SetCursorPos(${x}, ${y})
Start-Sleep -Milliseconds 50
[Mouse]::mouse_event(${downFlag}, 0, 0, 0, 0)
Start-Sleep -Milliseconds 50
[Mouse]::mouse_event(${upFlag}, 0, 0, 0, 0)
"Clicked at ${x}, ${y}"
`
    try {
      await runPowerShell(script)
    } catch (error) {
      log.error('[ScreenTools] Click failed (Windows):', error)
      throw new Error(`Click failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  } else {
    throw new Error(`Unsupported platform: ${process.platform}`)
  }
}

/**
 * Type text at current cursor position
 */
async function typeText(text: string): Promise<void> {
  if (process.platform === 'darwin') {
    const escapedText = text.replace(/"/g, '\\"').replace(/\\/g, '\\\\')
    const script = `
      tell application "System Events"
        keystroke "${escapedText}"
      end tell
    `
    try {
      await runAppleScript(script)
    } catch (error) {
      log.error('[ScreenTools] Type failed (macOS):', error)
      throw new Error(`Type failed: ${error instanceof Error ? error.message : String(error)}. Make sure Accessibility permissions are granted.`)
    }
  } else if (process.platform === 'win32') {
    const escapedText = text.replace(/"/g, '`"').replace(/'/g, "''")
    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SendKeys]::SendWait('${escapedText}')
      "Typed text"
    `
    try {
      await runPowerShell(script)
    } catch (error) {
      log.error('[ScreenTools] Type failed (Windows):', error)
      throw new Error(`Type failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  } else {
    throw new Error(`Unsupported platform: ${process.platform}`)
  }
}

/**
 * Press a special key or key combination
 */
async function pressKey(key: string, modifiers: string[] = []): Promise<void> {
  if (process.platform === 'darwin') {
    // Map common key names to AppleScript key codes
    const keyCodeMap: Record<string, number> = {
      'return': 36,
      'enter': 36,
      'tab': 48,
      'space': 49,
      'delete': 51,
      'backspace': 51,
      'escape': 53,
      'esc': 53,
      'left': 123,
      'right': 124,
      'down': 125,
      'up': 126,
      'home': 115,
      'end': 119,
      'pageup': 116,
      'pagedown': 121,
      'f1': 122, 'f2': 120, 'f3': 99, 'f4': 118,
      'f5': 96, 'f6': 97, 'f7': 98, 'f8': 100,
      'f9': 101, 'f10': 109, 'f11': 103, 'f12': 111,
    }
    
    const modifierStr = modifiers.map(m => {
      const modMap: Record<string, string> = {
        'cmd': 'command down',
        'command': 'command down',
        'ctrl': 'control down',
        'control': 'control down',
        'alt': 'option down',
        'option': 'option down',
        'shift': 'shift down',
      }
      return modMap[m.toLowerCase()] || ''
    }).filter(m => m).join(', ')
    
    const keyCode = keyCodeMap[key.toLowerCase()]
    
    try {
      let script: string
      if (keyCode !== undefined) {
        // Use key code for special keys
        script = modifierStr
          ? `tell application "System Events" to key code ${keyCode} using {${modifierStr}}`
          : `tell application "System Events" to key code ${keyCode}`
      } else {
        // Use keystroke for regular characters
        script = modifierStr
          ? `tell application "System Events" to keystroke "${key}" using {${modifierStr}}`
          : `tell application "System Events" to keystroke "${key}"`
      }
      await runAppleScript(script)
    } catch (error) {
      log.error('[ScreenTools] Key press failed (macOS):', error)
      throw new Error(`Key press failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  } else if (process.platform === 'win32') {
    // Map to SendKeys format
    const keyMap: Record<string, string> = {
      'enter': '{ENTER}',
      'return': '{ENTER}',
      'tab': '{TAB}',
      'escape': '{ESC}',
      'esc': '{ESC}',
      'space': ' ',
      'backspace': '{BACKSPACE}',
      'delete': '{DELETE}',
      'up': '{UP}',
      'down': '{DOWN}',
      'left': '{LEFT}',
      'right': '{RIGHT}',
      'home': '{HOME}',
      'end': '{END}',
      'pageup': '{PGUP}',
      'pagedown': '{PGDN}',
    }
    
    let sendKey = keyMap[key.toLowerCase()] || key
    
    // Add modifiers
    for (const mod of modifiers) {
      const modMap: Record<string, string> = {
        'ctrl': '^',
        'control': '^',
        'alt': '%',
        'shift': '+',
      }
      const modKey = modMap[mod.toLowerCase()]
      if (modKey) {
        sendKey = modKey + sendKey
      }
    }
    
    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SendKeys]::SendWait('${sendKey}')
      "Pressed ${key}"
    `
    try {
      await runPowerShell(script)
    } catch (error) {
      log.error('[ScreenTools] Key press failed (Windows):', error)
      throw new Error(`Key press failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  } else {
    throw new Error(`Unsupported platform: ${process.platform}`)
  }
}

/**
 * Create screen accessibility tools for a Copilot session
 */
export function createScreenTools(): Tool<unknown>[] {
  return [
    // Focus an application by name
    defineTool('screen_focus_app', {
      description: 'Focus/activate an application by name, bringing it to the foreground. Use this before interacting with an app\'s UI elements.',
      parameters: z.object({
        appName: z.string().describe('The name of the application to focus (e.g., "Microsoft Outlook", "Safari", "Finder")')
      }),
      handler: async (args) => {
        try {
          await focusApp(args.appName)
          // Small delay to let the app come to foreground
          await new Promise(resolve => setTimeout(resolve, 300))
          return {
            success: true,
            message: `Focused application: ${args.appName}`
          }
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error)
          }
        }
      }
    }),

    // Get focused application info
    defineTool('screen_get_focused_app', {
      description: 'Get information about the currently focused application, including its name and window titles. Use this to understand what application the user is working with before interacting with screen elements.',
      parameters: z.object({}),
      handler: async () => {
        try {
          const appInfo = await getFocusedApp()
          return {
            success: true,
            app: appInfo
          }
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error),
            hint: process.platform === 'darwin' 
              ? 'Make sure Accessibility permissions are granted in System Settings > Privacy & Security > Accessibility for this app.'
              : 'This feature requires Windows accessibility APIs to be available.'
          }
        }
      }
    }),

    // Get UI elements from screen
    defineTool('screen_get_elements', {
      description: 'Get accessible UI elements from the currently focused application window. Returns a list of UI elements (buttons, text fields, labels, etc.) with their names, roles, positions, and sizes. Use this to understand what\'s on screen and find elements to interact with. Requires Accessibility permissions on macOS.',
      parameters: z.object({
        maxDepth: z.number().optional().describe('Maximum depth to traverse the UI tree (default: 3, max: 5). Higher values return more elements but take longer.')
      }),
      handler: async (args) => {
        const depth = Math.min(args.maxDepth || 3, 5)
        try {
          const elements = await getUIElements(depth)
          
          // Filter out empty/unnamed elements and limit results
          const filteredElements = elements
            .filter(e => e.name || e.role)
            .slice(0, 100) // Limit to prevent overwhelming the model
          
          return {
            success: true,
            platform: process.platform,
            elementCount: filteredElements.length,
            elements: filteredElements,
            hint: filteredElements.length === 100 ? 'Results limited to 100 elements. Use a lower maxDepth for fewer results.' : undefined
          }
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error),
            hint: process.platform === 'darwin'
              ? 'Make sure Accessibility permissions are granted in System Settings > Privacy & Security > Accessibility for this app.'
              : 'This feature requires Windows UI Automation APIs.'
          }
        }
      }
    }),

    // Click at screen position
    defineTool('screen_click', {
      description: 'Click at specific screen coordinates. Use screen_get_elements first to find element positions, then click at the center of the desired element. Works with any application, not just browsers.',
      parameters: z.object({
        x: z.number().describe('X coordinate (pixels from left edge of screen)'),
        y: z.number().describe('Y coordinate (pixels from top edge of screen)'),
        button: z.enum(['left', 'right']).optional().describe('Mouse button to click (default: left)')
      }),
      handler: async (args) => {
        try {
          await clickAtPosition(args.x, args.y, args.button || 'left')
          return {
            success: true,
            message: `Clicked ${args.button || 'left'} button at (${args.x}, ${args.y})`
          }
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error),
            hint: process.platform === 'darwin'
              ? 'On macOS, you may need to install cliclick (brew install cliclick) or grant Accessibility permissions.'
              : 'Make sure the application is not running with elevated privileges.'
          }
        }
      }
    }),

    // Click on a named element
    defineTool('screen_click_element', {
      description: 'Click on a UI element by its name or label. First searches for the element in the focused application, then clicks its center. More convenient than screen_click when you know the element name.',
      parameters: z.object({
        name: z.string().describe('The name or label of the element to click (e.g., "Save", "OK", "Cancel")'),
        role: z.string().optional().describe('Optional role filter (e.g., "button", "text field", "checkbox")'),
        button: z.enum(['left', 'right']).optional().describe('Mouse button to click (default: left)')
      }),
      handler: async (args) => {
        try {
          const elements = await getUIElements(4)
          
          // Find matching element
          const searchName = args.name.toLowerCase()
          const searchRole = args.role?.toLowerCase()
          
          const match = elements.find(e => {
            const nameMatch = e.name?.toLowerCase().includes(searchName) ||
                            e.description?.toLowerCase().includes(searchName)
            const roleMatch = !searchRole || e.role?.toLowerCase().includes(searchRole)
            return nameMatch && roleMatch && e.position
          })
          
          if (!match || !match.position) {
            return {
              error: `Element "${args.name}" not found`,
              hint: 'Use screen_get_elements to see available elements and their exact names.',
              availableElements: elements
                .filter(e => e.name && e.position)
                .slice(0, 20)
                .map(e => ({ name: e.name, role: e.role }))
            }
          }
          
          // Click center of element
          const x = match.position.x + (match.size?.width || 0) / 2
          const y = match.position.y + (match.size?.height || 0) / 2
          
          await clickAtPosition(x, y, args.button || 'left')
          
          return {
            success: true,
            message: `Clicked "${match.name}" (${match.role}) at (${x}, ${y})`
          }
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error)
          }
        }
      }
    }),

    // Type text
    defineTool('screen_type', {
      description: 'Type text at the current cursor position. The text will be typed character by character as if from a keyboard. Use screen_click or screen_click_element first to focus the desired input field.',
      parameters: z.object({
        text: z.string().describe('The text to type')
      }),
      handler: async (args) => {
        try {
          await typeText(args.text)
          return {
            success: true,
            message: `Typed "${args.text.length > 50 ? args.text.substring(0, 50) + '...' : args.text}"`
          }
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error)
          }
        }
      }
    }),

    // Press special keys
    defineTool('screen_press_key', {
      description: 'Press a keyboard key, optionally with modifiers. Use for special keys like Enter, Tab, Escape, arrow keys, or keyboard shortcuts.',
      parameters: z.object({
        key: z.string().describe('The key to press (e.g., "Enter", "Tab", "Escape", "a", "1", "Up", "Down")'),
        modifiers: z.array(z.enum(['cmd', 'ctrl', 'alt', 'shift'])).optional().describe('Modifier keys to hold (e.g., ["cmd", "shift"] for Cmd+Shift). Use "cmd" on macOS, "ctrl" on Windows.')
      }),
      handler: async (args) => {
        try {
          await pressKey(args.key, args.modifiers || [])
          const modStr = args.modifiers?.length ? args.modifiers.join('+') + '+' : ''
          return {
            success: true,
            message: `Pressed ${modStr}${args.key}`
          }
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error)
          }
        }
      }
    }),

    // Double-click
    defineTool('screen_double_click', {
      description: 'Double-click at specific screen coordinates. Useful for selecting words, opening files, or other double-click actions.',
      parameters: z.object({
        x: z.number().describe('X coordinate (pixels from left edge of screen)'),
        y: z.number().describe('Y coordinate (pixels from top edge of screen)')
      }),
      handler: async (args) => {
        try {
          // Perform two clicks quickly
          await clickAtPosition(args.x, args.y, 'left')
          await new Promise(resolve => setTimeout(resolve, 50))
          await clickAtPosition(args.x, args.y, 'left')
          return {
            success: true,
            message: `Double-clicked at (${args.x}, ${args.y})`
          }
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error)
          }
        }
      }
    })
  ]
}
