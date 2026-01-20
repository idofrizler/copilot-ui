import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { CopilotClient, CopilotSession, PermissionRequest, PermissionRequestResult } from '@github/copilot-sdk'
import Store from 'electron-store'
import log from 'electron-log/main'

// Set up file logging only - no IPC to renderer (causes errors)
log.transports.file.level = 'info'
log.transports.console.level = 'info'

// Handle EIO errors from terminal disconnection - expected for GUI apps
process.on('uncaughtException', (err) => {
  if (err.message === 'write EIO') {
    log.transports.console.level = false
    return
  }
  log.error('Uncaught exception:', err)
  throw err
})

// Replace console with electron-log
Object.assign(console, log.functions)

const store = new Store({
  defaults: {
    model: 'gpt-5'
  }
})

let mainWindow: BrowserWindow | null = null
let copilotClient: CopilotClient | null = null
let session: CopilotSession | null = null
let currentModel: string = store.get('model') as string

// Pending permission requests waiting for user response
const pendingPermissions = new Map<string, {
  resolve: (result: PermissionRequestResult) => void
  request: PermissionRequest
  executable: string
}>()

// Track "always allow" permissions by executable (e.g., "ls", "find", "curl")
const alwaysAllowedExecutables = new Set<string>()

const AVAILABLE_MODELS = [
  'gpt-5',
  'claude-sonnet-4.5',
  'claude-sonnet-4',
  'gpt-4.1',
]

// Extract the executable name from a shell command
function extractExecutable(command: string): string {
  // Trim and get the first word (the executable)
  const trimmed = command.trim()
  // Handle common prefixes like sudo, env, etc.
  const prefixes = ['sudo', 'env', 'nohup', 'nice', 'time']
  const parts = trimmed.split(/\s+/)
  
  for (const part of parts) {
    // Skip environment variable assignments (VAR=value)
    if (part.includes('=') && !part.startsWith('-')) continue
    // Skip common prefixes
    if (prefixes.includes(part)) continue
    // This is the executable
    return part
  }
  return parts[0] || 'unknown'
}

// Extract executable from permission request
function getExecutableIdentifier(request: PermissionRequest): string {
  const req = request as Record<string, unknown>
  
  // For shell commands, extract executable from fullCommandText
  if (request.kind === 'shell' && req.fullCommandText) {
    return extractExecutable(req.fullCommandText as string)
  }
  
  // For read/write, use kind + filename
  if ((request.kind === 'read' || request.kind === 'write') && req.path) {
    const path = req.path as string
    const filename = path.split('/').pop() || path
    return `${request.kind}:${filename}`
  }
  
  // Fallback to kind
  return request.kind
}

// Permission handler that prompts the user
async function handlePermissionRequest(
  request: PermissionRequest,
  _invocation: { sessionId: string }
): Promise<PermissionRequestResult> {
  const requestId = request.toolCallId || `perm-${Date.now()}`
  const executable = getExecutableIdentifier(request)
  
  console.log('Permission request:', request.kind, executable)
  
  // Check if this executable is always allowed
  if (alwaysAllowedExecutables.has(executable)) {
    console.log('Auto-approved (always allow):', executable)
    return { kind: 'approved' }
  }
  
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { kind: 'denied-no-approval-rule-and-could-not-request-from-user' }
  }
  
  // Send to renderer and wait for response
  return new Promise((resolve) => {
    pendingPermissions.set(requestId, { resolve, request, executable })
    mainWindow!.webContents.send('copilot:permission', {
      requestId,
      executable,
      ...request
    })
  })
}

async function initCopilot(): Promise<void> {
  try {
    copilotClient = new CopilotClient()
    await copilotClient.start()

    session = await copilotClient.createSession({
      model: currentModel,
      onPermissionRequest: handlePermissionRequest,
    })

    // Set up event handler for streaming responses
    session.on((event) => {
      if (!mainWindow || mainWindow.isDestroyed()) return

      console.log('Event:', event.type)

      if (event.type === 'assistant.message_delta') {
        mainWindow.webContents.send('copilot:delta', event.data.deltaContent)
      } else if (event.type === 'assistant.message') {
        mainWindow.webContents.send('copilot:message', event.data.content)
      } else if (event.type === 'session.idle') {
        mainWindow.webContents.send('copilot:idle')
      } else if (event.type === 'tool.execution_start') {
        console.log('Tool start:', event.data.toolName)
        mainWindow.webContents.send('copilot:tool-start', event.data)
      } else if (event.type === 'tool.execution_complete') {
        console.log('Tool end:', event.data.toolCallId)
        mainWindow.webContents.send('copilot:tool-end', event.data)
      } else if (event.type === 'tool.confirmation_requested') {
        console.log('Confirmation requested:', event.data)
        mainWindow.webContents.send('copilot:confirm', event.data)
      } else if (event.type === 'session.error') {
        console.log('Session error:', event.data)
        mainWindow.webContents.send('copilot:error', event.data?.message || JSON.stringify(event.data))
      }
    })

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('copilot:ready', { model: currentModel, models: AVAILABLE_MODELS })
    }
  } catch (err) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('copilot:error', String(err))
    }
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    frame: false,
    backgroundColor: '#0d1117',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: -100, y: -100 },
    hasShadow: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  })

  // Check for TEST_MESSAGE env var
  const testMessage = process.env.TEST_MESSAGE
  
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = testMessage 
      ? `${process.env.ELECTRON_RENDERER_URL}?test=${encodeURIComponent(testMessage)}`
      : process.env.ELECTRON_RENDERER_URL
    mainWindow.loadURL(url)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.once('did-finish-load', () => {
    initCopilot()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// IPC Handlers
ipcMain.handle('copilot:send', async (_event, prompt: string) => {
  if (!session) {
    throw new Error('Copilot session not initialized')
  }
  
  const messageId = await session.send({ prompt })
  return messageId
})

ipcMain.handle('copilot:sendAndWait', async (_event, prompt: string) => {
  if (!session) {
    throw new Error('Copilot session not initialized')
  }
  
  const response = await session.sendAndWait({ prompt })
  return response?.data?.content || ''
})

ipcMain.on('copilot:abort', async () => {
  if (session) {
    await session.abort()
  }
})

// Handle permission response from renderer
ipcMain.handle('copilot:permissionResponse', async (_event, data: { 
  requestId: string
  decision: 'approved' | 'always' | 'denied' 
}) => {
  const pending = pendingPermissions.get(data.requestId)
  if (!pending) {
    console.log('No pending permission for:', data.requestId)
    return { success: false }
  }
  
  pendingPermissions.delete(data.requestId)
  
  // Track "always allow" for this specific executable
  if (data.decision === 'always') {
    alwaysAllowedExecutables.add(pending.executable)
    console.log('Added to always allow:', pending.executable)
  }
  
  const result: PermissionRequestResult = {
    kind: data.decision === 'denied' ? 'denied-interactively-by-user' : 'approved'
  }
  
  console.log('Permission resolved:', data.requestId, result.kind)
  pending.resolve(result)
  return { success: true }
})

ipcMain.handle('copilot:setModel', async (_event, model: string) => {
  if (!AVAILABLE_MODELS.includes(model)) {
    throw new Error(`Invalid model: ${model}`)
  }
  
  
  currentModel = model
  store.set('model', model) // Persist selection
  
  // Recreate session with new model
  if (session) {
    await session.destroy()
  }
  
  if (copilotClient) {
    session = await copilotClient.createSession({
      model: currentModel,
      onPermissionRequest: handlePermissionRequest,
    })
    
    session.on((event) => {
      if (!mainWindow || mainWindow.isDestroyed()) return

      

      if (event.type === 'assistant.message_delta') {
        mainWindow.webContents.send('copilot:delta', event.data.deltaContent)
      } else if (event.type === 'assistant.message') {
        
        mainWindow.webContents.send('copilot:message', event.data.content)
      } else if (event.type === 'session.idle') {
        
        mainWindow.webContents.send('copilot:idle')
      } else if (event.type === 'tool.execution_start') {
        
        mainWindow.webContents.send('copilot:tool-start', event.data)
      } else if (event.type === 'tool.execution_end') {
        
        mainWindow.webContents.send('copilot:tool-end', event.data)
      } else if (event.type === 'session.error') {
        
      }
    })
  }
  
  return { model: currentModel }
})

ipcMain.handle('copilot:getModels', async () => {
  return { models: AVAILABLE_MODELS, current: currentModel }
})

ipcMain.handle('copilot:reset', async () => {
  if (session) {
    await session.destroy()
  }
  if (copilotClient) {
    session = await copilotClient.createSession({
      model: 'gpt-5',
    })
    
    session.on((event) => {
      if (!mainWindow || mainWindow.isDestroyed()) return

      if (event.type === 'assistant.message_delta') {
        mainWindow.webContents.send('copilot:delta', event.data.deltaContent)
      } else if (event.type === 'assistant.message') {
        mainWindow.webContents.send('copilot:message', event.data.content)
      } else if (event.type === 'session.idle') {
        mainWindow.webContents.send('copilot:idle')
      }
    })
  }
})

// Window control handlers
ipcMain.on('window:minimize', () => {
  mainWindow?.minimize()
})

ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

ipcMain.on('window:close', () => {
  mainWindow?.close()
})

// App lifecycle - enforce single instance
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // Focus existing window if someone tries to open a second instance
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
}

app.on('window-all-closed', async () => {
  if (session) {
    await session.destroy()
    session = null
  }
  if (copilotClient) {
    await copilotClient.stop()
    copilotClient = null
  }
  app.quit()
})

app.on('before-quit', async () => {
  if (session) {
    await session.destroy()
    session = null
  }
  if (copilotClient) {
    await copilotClient.stop()
    copilotClient = null
  }
})

