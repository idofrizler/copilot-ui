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
    model: 'gpt-5.2',
    openSessionIds: [] as string[]  // Session IDs that were open in our app
  }
})

let mainWindow: BrowserWindow | null = null
let copilotClient: CopilotClient | null = null

// Multi-session support
interface SessionState {
  session: CopilotSession
  model: string
}
const sessions = new Map<string, SessionState>()
let activeSessionId: string | null = null
let sessionCounter = 0

// Pending permission requests waiting for user response
const pendingPermissions = new Map<string, {
  resolve: (result: PermissionRequestResult) => void
  request: PermissionRequest
  executable: string
  sessionId: string
}>()

// Track "always allow" permissions by executable (e.g., "ls", "find", "curl")
const alwaysAllowedExecutables = new Set<string>()

// Model info with multipliers
interface ModelInfo {
  id: string
  name: string
  multiplier: number
}

// Static list of available models with pricing multipliers (sorted by cost low to high)
const AVAILABLE_MODELS: ModelInfo[] = [
  { id: 'gpt-5-mini', name: 'GPT-5 mini', multiplier: 0 },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Preview)', multiplier: 0.33 },
  { id: 'gpt-5.2', name: 'GPT-5.2', multiplier: 1 },
  { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', multiplier: 1 },
  { id: 'claude-opus-4.5', name: 'Claude Opus 4.5', multiplier: 3 },
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
  _invocation: { sessionId: string },
  ourSessionId: string
): Promise<PermissionRequestResult> {
  const requestId = request.toolCallId || `perm-${Date.now()}`
  const executable = getExecutableIdentifier(request)
  
  console.log(`[${ourSessionId}] Permission request:`, request.kind, executable)
  
  // Check if this executable is always allowed
  if (alwaysAllowedExecutables.has(executable)) {
    console.log(`[${ourSessionId}] Auto-approved (always allow):`, executable)
    return { kind: 'approved' }
  }
  
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { kind: 'denied-no-approval-rule-and-could-not-request-from-user' }
  }
  
  // Send to renderer and wait for response
  return new Promise((resolve) => {
    pendingPermissions.set(requestId, { resolve, request, executable, sessionId: ourSessionId })
    mainWindow!.webContents.send('copilot:permission', {
      requestId,
      sessionId: ourSessionId,
      executable,
      ...request
    })
  })
}

// Create a new session and return its ID
async function createNewSession(model?: string): Promise<string> {
  if (!copilotClient) {
    throw new Error('Copilot client not initialized')
  }
  
  const sessionId = `session-${++sessionCounter}`
  const sessionModel = model || store.get('model') as string
  
  const newSession = await copilotClient.createSession({
    model: sessionModel,
    onPermissionRequest: (request, invocation) => handlePermissionRequest(request, invocation, sessionId),
  })
  
  // Set up event handler for this session
  newSession.on((event) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    
    // Always forward events - frontend routes by sessionId
    console.log(`[${sessionId}] Event:`, event.type)
    
    if (event.type === 'assistant.message_delta') {
      mainWindow.webContents.send('copilot:delta', { sessionId, content: event.data.deltaContent })
    } else if (event.type === 'assistant.message') {
      mainWindow.webContents.send('copilot:message', { sessionId, content: event.data.content })
    } else if (event.type === 'session.idle') {
      mainWindow.webContents.send('copilot:idle', { sessionId })
    } else if (event.type === 'tool.execution_start') {
      console.log(`[${sessionId}] Tool start:`, event.data.toolName)
      mainWindow.webContents.send('copilot:tool-start', { sessionId, ...event.data })
    } else if (event.type === 'tool.execution_complete') {
      console.log(`[${sessionId}] Tool end:`, event.data.toolCallId)
      mainWindow.webContents.send('copilot:tool-end', { sessionId, ...event.data })
    } else if (event.type === 'tool.confirmation_requested') {
      console.log(`[${sessionId}] Confirmation requested:`, event.data)
      mainWindow.webContents.send('copilot:confirm', { sessionId, ...event.data })
    } else if (event.type === 'session.error') {
      console.log(`[${sessionId}] Session error:`, event.data)
      mainWindow.webContents.send('copilot:error', { sessionId, message: event.data?.message || JSON.stringify(event.data) })
    }
  })
  
  sessions.set(sessionId, { session: newSession, model: sessionModel })
  activeSessionId = sessionId
  
  console.log(`Created session ${sessionId} with model ${sessionModel}`)
  return sessionId
}

async function initCopilot(): Promise<void> {
  try {
    copilotClient = new CopilotClient()
    await copilotClient.start()
    
    // Get all available sessions and our stored open session IDs
    const allSessions = await copilotClient.listSessions()
    const openSessionIds = store.get('openSessionIds') as string[] || []
    
    console.log(`Found ${allSessions.length} total sessions, ${openSessionIds.length} were open in our app`)
    console.log('Open session IDs:', openSessionIds)
    console.log('Available session IDs:', allSessions.map(s => s.sessionId))
    
    // Build map for quick lookup
    const sessionMetaMap = new Map(allSessions.map(s => [s.sessionId, s]))
    
    // Filter to only sessions that exist and were open in our app
    const sessionsToResume = openSessionIds.filter(id => sessionMetaMap.has(id))
    console.log('Sessions to resume:', sessionsToResume)
    
    // Build list of previous sessions (all sessions not in our open list)
    const previousSessions = allSessions
      .filter(s => !openSessionIds.includes(s.sessionId))
      .map(s => ({ sessionId: s.sessionId, name: s.summary || undefined, modifiedTime: s.modifiedTime.toISOString() }))
    
    let resumedSessions: { sessionId: string; model: string; name?: string }[] = []
    
    // Resume only our open sessions
    for (const sessionId of sessionsToResume) {
      const meta = sessionMetaMap.get(sessionId)!
      try {
        const sessionModel = store.get('model') as string || 'gpt-5.2'
        const session = await copilotClient.resumeSession(sessionId, {
          permissionHandler: (request, invocation) => handlePermissionRequest(request, invocation, sessionId)
        })
        
        // Set up event handler for resumed session
        session.on((event) => {
          if (!mainWindow || mainWindow.isDestroyed()) return
          
          console.log(`[${sessionId}] Event:`, event.type)
          
          if (event.type === 'assistant.delta') {
            mainWindow.webContents.send('copilot:delta', { sessionId, content: event.data.deltaContent })
          } else if (event.type === 'assistant.message') {
            mainWindow.webContents.send('copilot:message', { sessionId, content: event.data.content })
          } else if (event.type === 'session.idle') {
            mainWindow.webContents.send('copilot:idle', { sessionId })
          } else if (event.type === 'tool.execution_start') {
            console.log(`[${sessionId}] Tool start:`, event.data.toolName)
            mainWindow.webContents.send('copilot:tool-start', { 
              sessionId, 
              toolCallId: event.data.toolCallId, 
              toolName: event.data.toolName 
            })
          } else if (event.type === 'tool.execution_end') {
            console.log(`[${sessionId}] Tool end:`, event.data.toolName)
            mainWindow.webContents.send('copilot:tool-end', { 
              sessionId, 
              toolCallId: event.data.toolCallId, 
              toolName: event.data.toolName 
            })
          }
        })
        
        sessions.set(sessionId, { session, model: sessionModel })
        resumedSessions.push({ 
          sessionId, 
          model: sessionModel,
          name: meta.summary || undefined
        })
        console.log(`Resumed session ${sessionId}${meta.summary ? ` (${meta.summary})` : ''}`)
      } catch (err) {
        console.error(`Failed to resume session ${sessionId}:`, err)
      }
    }
    
    // If no sessions were resumed, create a new one
    if (resumedSessions.length === 0) {
      const sessionId = await createNewSession()
      const sessionState = sessions.get(sessionId)!
      resumedSessions.push({ sessionId, model: sessionState.model })
      // Save this new session as open
      store.set('openSessionIds', [sessionId])
    }
    
    activeSessionId = resumedSessions[0].sessionId

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('copilot:ready', { 
        sessions: resumedSessions,
        previousSessions,
        models: AVAILABLE_MODELS 
      })
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
ipcMain.handle('copilot:send', async (_event, data: { sessionId: string, prompt: string }) => {
  const sessionState = sessions.get(data.sessionId)
  if (!sessionState) {
    throw new Error(`Session not found: ${data.sessionId}`)
  }
  
  const messageId = await sessionState.session.send({ prompt: data.prompt })
  return messageId
})

ipcMain.handle('copilot:sendAndWait', async (_event, data: { sessionId: string, prompt: string }) => {
  const sessionState = sessions.get(data.sessionId)
  if (!sessionState) {
    throw new Error(`Session not found: ${data.sessionId}`)
  }
  
  const response = await sessionState.session.sendAndWait({ prompt: data.prompt })
  return response?.data?.content || ''
})

ipcMain.on('copilot:abort', async (_event, sessionId: string) => {
  const sessionState = sessions.get(sessionId)
  if (sessionState) {
    await sessionState.session.abort()
  }
})

// Get message history for a session
ipcMain.handle('copilot:getMessages', async (_event, sessionId: string) => {
  const sessionState = sessions.get(sessionId)
  if (!sessionState) {
    throw new Error(`Session not found: ${sessionId}`)
  }
  
  const events = await sessionState.session.getMessages()
  
  // Convert events to simplified message format
  const messages: { role: 'user' | 'assistant'; content: string }[] = []
  
  for (const event of events) {
    if (event.type === 'user.message') {
      messages.push({ role: 'user', content: event.data.content })
    } else if (event.type === 'assistant.message') {
      messages.push({ role: 'assistant', content: event.data.content })
    }
  }
  
  return messages
})

// Generate a short title for a conversation using AI
ipcMain.handle('copilot:generateTitle', async (_event, data: { conversation: string }) => {
  if (!copilotClient) {
    throw new Error('Copilot client not initialized')
  }
  
  try {
    // Create a temporary session with the cheapest model for title generation
    const tempSession = await copilotClient.createSession({
      model: 'gpt-5-mini',
      config: {
        intent: 'conversation',
        instructions: 'You are a title generator. Respond with ONLY a short title (3-6 words, no quotes, no punctuation at end).'
      }
    })
    
    const sessionId = tempSession.sessionId
    const prompt = `Generate a short descriptive title for this conversation, that makes it easy to identify what this is about:\n\n${data.conversation}\n\nRespond with ONLY the title, nothing else.`
    const response = await tempSession.sendAndWait({ prompt })
    
    // Clean up temp session - destroy and delete to avoid polluting session list
    await tempSession.destroy()
    await copilotClient.deleteSession(sessionId)
    
    // Extract and clean the title
    const title = (response?.data?.content || 'Untitled').trim().replace(/^["']|["']$/g, '').slice(0, 50)
    return title
  } catch (error) {
    console.error('Failed to generate title:', error)
    return 'Untitled'
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

ipcMain.handle('copilot:setModel', async (_event, data: { sessionId: string, model: string }) => {
  const validModels = AVAILABLE_MODELS.map(m => m.id)
  if (!validModels.includes(data.model)) {
    throw new Error(`Invalid model: ${data.model}`)
  }
  
  store.set('model', data.model) // Persist as default for new sessions
  
  const sessionState = sessions.get(data.sessionId)
  if (sessionState) {
    // Destroy old session before creating new one
    console.log(`Destroying session ${data.sessionId} before model change to ${data.model}`)
    await sessionState.session.destroy()
    sessions.delete(data.sessionId)
    
    // Create replacement session with new model
    const newSessionId = await createNewSession(data.model)
    console.log(`Sessions after model change: ${sessions.size} active`)
    return { sessionId: newSessionId, model: data.model }
  }
  
  return { model: data.model }
})

ipcMain.handle('copilot:getModels', async () => {
  const currentModel = store.get('model') as string
  return { models: AVAILABLE_MODELS, current: currentModel }
})

// Create a new session (for new tabs)
ipcMain.handle('copilot:createSession', async () => {
  const sessionId = await createNewSession()
  const sessionState = sessions.get(sessionId)!
  return { sessionId, model: sessionState.model }
})

// Close a session (when closing a tab)
ipcMain.handle('copilot:closeSession', async (_event, sessionId: string) => {
  const sessionState = sessions.get(sessionId)
  if (sessionState) {
    await sessionState.session.destroy()
    sessions.delete(sessionId)
    console.log(`Closed session ${sessionId}`)
  }
  
  // Update active session if needed
  if (activeSessionId === sessionId) {
    activeSessionId = sessions.keys().next().value || null
  }
  
  return { success: true, remainingSessions: sessions.size }
})

// Switch active session
ipcMain.handle('copilot:switchSession', async (_event, sessionId: string) => {
  if (!sessions.has(sessionId)) {
    throw new Error(`Session not found: ${sessionId}`)
  }
  activeSessionId = sessionId
  const sessionState = sessions.get(sessionId)!
  return { sessionId, model: sessionState.model }
})

// Save open session IDs to persist across restarts
ipcMain.handle('copilot:saveOpenSessions', async (_event, sessionIds: string[]) => {
  store.set('openSessionIds', sessionIds)
  console.log(`Saved ${sessionIds.length} open session IDs`)
  return { success: true }
})

// Resume a previous session (from the history list)
ipcMain.handle('copilot:resumePreviousSession', async (_event, sessionId: string) => {
  if (!copilotClient) {
    throw new Error('Copilot client not initialized')
  }
  
  // Check if already resumed
  if (sessions.has(sessionId)) {
    const sessionState = sessions.get(sessionId)!
    return { sessionId, model: sessionState.model, alreadyOpen: true }
  }
  
  const sessionModel = store.get('model') as string || 'gpt-5.2'
  const session = await copilotClient.resumeSession(sessionId, {
    permissionHandler: (request, invocation) => handlePermissionRequest(request, invocation, sessionId)
  })
  
  // Set up event handler
  session.on((event) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    
    console.log(`[${sessionId}] Event:`, event.type)
    
    if (event.type === 'assistant.delta') {
      mainWindow.webContents.send('copilot:delta', { sessionId, content: event.data.deltaContent })
    } else if (event.type === 'assistant.message') {
      mainWindow.webContents.send('copilot:message', { sessionId, content: event.data.content })
    } else if (event.type === 'session.idle') {
      mainWindow.webContents.send('copilot:idle', { sessionId })
    } else if (event.type === 'tool.execution_start') {
      mainWindow.webContents.send('copilot:tool-start', { 
        sessionId, 
        toolCallId: event.data.toolCallId, 
        toolName: event.data.toolName 
      })
    } else if (event.type === 'tool.execution_end') {
      mainWindow.webContents.send('copilot:tool-end', { 
        sessionId, 
        toolCallId: event.data.toolCallId, 
        toolName: event.data.toolName 
      })
    }
  })
  
  sessions.set(sessionId, { session, model: sessionModel })
  activeSessionId = sessionId
  
  console.log(`Resumed previous session ${sessionId}`)
  return { sessionId, model: sessionModel, alreadyOpen: false }
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
    console.log('Available models:', AVAILABLE_MODELS.map(m => `${m.name} (${m.multiplier}×)`).join(', '))
    
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
}

app.on('window-all-closed', async () => {
  // Destroy all sessions
  for (const [id, state] of sessions) {
    await state.session.destroy()
    console.log(`Destroyed session ${id}`)
  }
  sessions.clear()
  
  if (copilotClient) {
    await copilotClient.stop()
    copilotClient = null
  }
  app.quit()
})

app.on('before-quit', async () => {
  // Destroy all sessions
  for (const [id, state] of sessions) {
    await state.session.destroy()
  }
  sessions.clear()
  
  if (copilotClient) {
    await copilotClient.stop()
    copilotClient = null
  }
})

