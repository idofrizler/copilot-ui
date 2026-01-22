import { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readdirSync, readFileSync, copyFileSync } from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'

const execAsync = promisify(exec)
import { CopilotClient, CopilotSession, PermissionRequest, PermissionRequestResult } from '@github/copilot-sdk'
import Store from 'electron-store'
import log from 'electron-log/main'

// MCP Server Configuration types (matching SDK)
interface MCPServerConfigBase {
  tools: string[]
  type?: string
  timeout?: number
}

interface MCPLocalServerConfig extends MCPServerConfigBase {
  type?: 'local' | 'stdio'
  command: string
  args: string[]
  env?: Record<string, string>
  cwd?: string
}

interface MCPRemoteServerConfig extends MCPServerConfigBase {
  type: 'http' | 'sse'
  url: string
  headers?: Record<string, string>
}

type MCPServerConfig = MCPLocalServerConfig | MCPRemoteServerConfig

interface MCPConfigFile {
  mcpServers: Record<string, MCPServerConfig>
}

// Path to MCP config file
const getMcpConfigPath = (): string => join(app.getPath('home'), '.copilot', 'mcp-config.json')

// Read MCP config from file
async function readMcpConfig(): Promise<MCPConfigFile> {
  const configPath = getMcpConfigPath()
  try {
    if (!existsSync(configPath)) {
      return { mcpServers: {} }
    }
    const content = await readFile(configPath, 'utf-8')
    return JSON.parse(content) as MCPConfigFile
  } catch (error) {
    console.error('Failed to read MCP config:', error)
    return { mcpServers: {} }
  }
}

// Write MCP config to file
async function writeMcpConfig(config: MCPConfigFile): Promise<void> {
  const configPath = getMcpConfigPath()
  const configDir = join(app.getPath('home'), '.copilot')
  
  // Ensure directory exists
  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true })
  }
  
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
  console.log('Saved MCP config:', Object.keys(config.mcpServers))
}

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

// Bounce dock icon to get user attention (macOS only)
function bounceDock(): void {
  if (process.platform === 'darwin' && !mainWindow?.isFocused()) {
    app.dock?.bounce('informational')
  }
}

interface StoredSession {
  sessionId: string
  model: string
  cwd: string
  name?: string
  editedFiles?: string[]
  alwaysAllowed?: string[]
}

const store = new Store({
  defaults: {
    model: 'gpt-5.2',
    openSessions: [] as StoredSession[],  // Sessions that were open in our app with their models and cwd
    trustedDirectories: [] as string[],  // Directories that are always trusted
    theme: 'system' as string  // Theme preference: 'system', 'light', 'dark', or custom theme id
  }
})

// Theme directory for external JSON themes
const themesDir = join(app.getPath('userData'), 'themes')

// Ensure themes directory exists
if (!existsSync(themesDir)) {
  mkdirSync(themesDir, { recursive: true })
}

// Theme validation - matches renderer/themes/types.ts structure
const REQUIRED_COLOR_KEYS = [
  'bg', 'surface', 'surfaceHover', 'border', 'borderHover',
  'accent', 'accentHover', 'accentMuted',
  'text', 'textMuted', 'textInverse',
  'success', 'successMuted', 'warning', 'warningMuted', 'error', 'errorMuted',
  'scrollbarThumb', 'scrollbarThumbHover', 'selection',
  'shadow', 'shadowStrong', 'terminalBg', 'terminalText', 'terminalCursor'
]

interface ExternalTheme {
  id: string
  name: string
  type: 'light' | 'dark'
  colors: Record<string, string>
  author?: string
  version?: string
}

function validateTheme(data: unknown): { valid: boolean; theme?: ExternalTheme } {
  if (!data || typeof data !== 'object') return { valid: false }
  const obj = data as Record<string, unknown>
  
  if (typeof obj.id !== 'string' || !obj.id.trim()) return { valid: false }
  if (typeof obj.name !== 'string' || !obj.name.trim()) return { valid: false }
  if (obj.type !== 'light' && obj.type !== 'dark') return { valid: false }
  if (!obj.colors || typeof obj.colors !== 'object') return { valid: false }
  
  const colors = obj.colors as Record<string, unknown>
  for (const key of REQUIRED_COLOR_KEYS) {
    if (typeof colors[key] !== 'string') return { valid: false }
  }
  
  return {
    valid: true,
    theme: {
      id: obj.id as string,
      name: obj.name as string,
      type: obj.type as 'light' | 'dark',
      colors: colors as Record<string, string>,
      author: typeof obj.author === 'string' ? obj.author : undefined,
      version: typeof obj.version === 'string' ? obj.version : undefined
    }
  }
}

function loadExternalThemes(): { themes: ExternalTheme[]; invalidFiles: string[] } {
  const themes: ExternalTheme[] = []
  const invalidFiles: string[] = []
  
  try {
    const files = readdirSync(themesDir).filter(f => f.endsWith('.json'))
    
    for (const file of files) {
      try {
        const content = readFileSync(join(themesDir, file), 'utf-8')
        const data = JSON.parse(content)
        const result = validateTheme(data)
        
        if (result.valid && result.theme) {
          themes.push(result.theme)
        } else {
          invalidFiles.push(file)
        }
      } catch {
        invalidFiles.push(file)
      }
    }
  } catch (err) {
    console.error('Failed to load external themes:', err)
  }
  
  return { themes, invalidFiles }
}

let mainWindow: BrowserWindow | null = null

// Map of cwd -> CopilotClient (one client per unique working directory)
const copilotClients = new Map<string, CopilotClient>()

// Resolve CLI path for packaged apps
function getCliPath(): string | undefined {
  if (!app.isPackaged) {
    return undefined  // Use default "copilot" from PATH in dev
  }
  
  // When packaged, the copilot binary is in the unpacked asar
  const platform = process.platform
  const arch = process.arch
  const platformArch = `${platform}-${arch}`  // e.g., "darwin-arm64"
  
  const cliPath = join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    '@github',
    `copilot-${platformArch}`,
    'copilot'
  )
  
  console.log(`Using packaged CLI path: ${cliPath}`)
  return cliPath
}

// Get or create a CopilotClient for the given cwd
async function getClientForCwd(cwd: string): Promise<CopilotClient> {
  if (copilotClients.has(cwd)) {
    return copilotClients.get(cwd)!
  }
  
  console.log(`Creating new CopilotClient for cwd: ${cwd}`)
  const cliPath = getCliPath()
  const client = new CopilotClient({ cwd, cliPath })
  await client.start()
  copilotClients.set(cwd, client)
  return client
}

// Multi-session support
interface SessionState {
  session: CopilotSession
  client: CopilotClient  // Reference to the client for this session
  model: string
  cwd: string  // Current working directory for the session
  alwaysAllowed: Set<string>  // Per-session always-allowed executables
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

// Track in-flight permission requests by session+executable to deduplicate parallel requests
const inFlightPermissions = new Map<string, Promise<PermissionRequestResult>>()

// Model info with multipliers
interface ModelInfo {
  id: string
  name: string
  multiplier: number
}

// Static list of available models with pricing multipliers (sorted by cost low to high)
const AVAILABLE_MODELS: ModelInfo[] = [
  { id: 'gpt-4.1', name: 'GPT-4.1', multiplier: 0 },
  { id: 'gpt-5-mini', name: 'GPT-5 mini', multiplier: 0 },
  { id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5', multiplier: 0.33 },
  { id: 'gpt-5.1-codex-mini', name: 'GPT-5.1-Codex-Mini', multiplier: 0.33 },
  { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', multiplier: 1 },
  { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', multiplier: 1 },
  { id: 'gpt-5.2-codex', name: 'GPT-5.2-Codex', multiplier: 1 },
  { id: 'gpt-5.1-codex-max', name: 'GPT-5.1-Codex-Max', multiplier: 1 },
  { id: 'gpt-5.1-codex', name: 'GPT-5.1-Codex', multiplier: 1 },
  { id: 'gpt-5.2', name: 'GPT-5.2', multiplier: 1 },
  { id: 'gpt-5.1', name: 'GPT-5.1', multiplier: 1 },
  { id: 'gpt-5', name: 'GPT-5', multiplier: 1 },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (Preview)', multiplier: 1 },
  { id: 'claude-opus-4.5', name: 'Claude Opus 4.5', multiplier: 3 },
]

// Commands that should include their subcommand for granular permission control
const SUBCOMMAND_EXECUTABLES = ['git', 'npm', 'yarn', 'pnpm', 'docker', 'kubectl']

// Extract all executables from a shell command
function extractExecutables(command: string): string[] {
  const executables: string[] = []
  
  // Remove heredocs first (<<'MARKER' ... MARKER or <<MARKER ... MARKER)
  let cleaned = command.replace(/<<['"]?(\w+)['"]?[\s\S]*?\n\1(\n|$)/g, '')
  
  // Also handle heredocs that might not have closing marker in view
  cleaned = cleaned.replace(/<<['"]?\w+['"]?[\s\S]*$/g, '')
  
  // Remove string literals to avoid false positives
  cleaned = cleaned
    .replace(/"[^"]*"/g, '""')
    .replace(/'[^']*'/g, "''")
    .replace(/`[^`]*`/g, '``')
  
  // Remove shell redirections like 2>&1, >&2, 2>/dev/null, etc.
  cleaned = cleaned.replace(/\d*>&?\d+/g, '')      // 2>&1, >&1, 1>&2
  cleaned = cleaned.replace(/\d+>>\S+/g, '')       // 2>>/dev/null
  cleaned = cleaned.replace(/\d+>\S+/g, '')        // 2>/dev/null
  
  // Split on shell operators and separators
  const segments = cleaned.split(/[;&|]+/)
  
  for (const segment of segments) {
    const trimmed = segment.trim()
    if (!trimmed) continue
    
    // Skip if it looks like a heredoc marker line
    if (/^[A-Z]+$/.test(trimmed)) continue
    
    // Get first word of segment
    const parts = trimmed.split(/\s+/)
    const prefixes = ['sudo', 'env', 'nohup', 'nice', 'time', 'command']
    
    let foundExec: string | null = null
    let subcommand: string | null = null
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      // Skip environment variable assignments
      if (part.includes('=') && !part.startsWith('-')) continue
      // Skip flags
      if (part.startsWith('-')) continue
      // Skip common prefixes
      if (prefixes.includes(part)) continue
      // Skip empty or punctuation
      if (!part || /^[<>|&;()]+$/.test(part)) continue
      // Skip redirection targets
      if (part.startsWith('>') || part.startsWith('<')) continue
      
      // Found potential executable - remove path prefix
      const exec = part.replace(/^.*\//, '')
      // Validate it looks like a command (alphanumeric, dashes, underscores)
      if (exec && /^[a-zA-Z0-9_-]+$/.test(exec)) {
        if (!foundExec) {
          foundExec = exec
          // Check if this needs subcommand handling
          if (SUBCOMMAND_EXECUTABLES.includes(exec)) {
            // Look for subcommand in next non-flag part
            for (let j = i + 1; j < parts.length; j++) {
              const nextPart = parts[j]
              if (nextPart.startsWith('-')) continue
              if (nextPart.includes('=')) continue
              if (/^[a-zA-Z0-9_-]+$/.test(nextPart)) {
                subcommand = nextPart
                break
              }
              break // Stop if we hit something unexpected
            }
          }
        }
        break
      }
    }
    
    if (foundExec) {
      // Combine executable with subcommand for granular control
      const execId = subcommand ? `${foundExec} ${subcommand}` : foundExec
      if (!executables.includes(execId)) {
        executables.push(execId)
      }
    }
  }
  
  return executables
}

// Normalize stored identifiers so UI/behavior stays stable across versions
function normalizeAlwaysAllowed(id: string): string {
  // Older versions stored `write:<path>`; treat all writes as a single global permission.
  if (id.startsWith('write:')) return 'write'
  return id
}

// Extract executable identifier from permission request (for "always allow" tracking)
function getExecutableIdentifier(request: PermissionRequest): string {
  const req = request as Record<string, unknown>
  
  // For shell commands, extract executables
  if (request.kind === 'shell' && req.fullCommandText) {
    const executables = extractExecutables(req.fullCommandText as string)
    return executables.join(', ') || 'shell'
  }
  
  // For read, use kind + filename
  if (request.kind === 'read' && req.path) {
    const path = req.path as string
    const filename = path.split('/').pop() || path
    return `${request.kind}:${filename}`
  }

  // For write, treat as global (all file changes)
  if (request.kind === 'write') {
    return 'write'
  }

  // For URL, use kind + hostname
  if (request.kind === 'url' && (request as any).url) {
    try {
      const u = new URL(String((request as any).url))
      return `url:${u.host}`
    } catch {
      return `url:${String((request as any).url)}`
    }
  }

  // For MCP, use kind + server/tool
  if (request.kind === 'mcp') {
    const r: any = request as any
    const tool = r.toolName || r.toolTitle || 'tool'
    const server = r.serverName || 'server'
    return `mcp:${server}/${tool}`
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
  const req = request as Record<string, unknown>
  const sessionState = sessions.get(ourSessionId)
  
  console.log(`[${ourSessionId}] Permission request:`, request.kind)
  
  // For shell commands, check each executable individually
  if (request.kind === 'shell' && req.fullCommandText) {
    const executables = extractExecutables(req.fullCommandText as string)
    
    // Filter to only unapproved executables
    const unapproved = executables.filter(exec => !sessionState?.alwaysAllowed.has(exec))
    
    if (unapproved.length === 0) {
      console.log(`[${ourSessionId}] All executables already approved:`, executables)
      return { kind: 'approved' }
    }
    
    console.log(`[${ourSessionId}] Need approval for:`, unapproved)
    
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { kind: 'denied-no-approval-rule-and-could-not-request-from-user' }
    }
    
    // Log all request fields for debugging
    console.log(`[${ourSessionId}] Full permission request:`, JSON.stringify(request, null, 2))
    
    // Send to renderer and wait for response - include unapproved list
    return new Promise((resolve) => {
      pendingPermissions.set(requestId, { resolve, request, executable: unapproved.join(', '), sessionId: ourSessionId })
      mainWindow!.webContents.send('copilot:permission', {
        requestId,
        sessionId: ourSessionId,
        executable: unapproved.join(', '),
        executables: unapproved,  // Array of executables needing approval
        allExecutables: executables,  // All executables in command
        isOutOfScope: false,
        ...request
      })
      bounceDock()
    })
  }
  
  // Non-shell permissions
  const executable = getExecutableIdentifier(request)
  
  // Check if already allowed
  if (sessionState?.alwaysAllowed.has(executable)) {
    console.log(`[${ourSessionId}] Auto-approved (always allow):`, executable)
    return { kind: 'approved' }
  }
  
  // For read requests, check if in-scope (auto-approve) or out-of-scope (need permission)
  let isOutOfScope = false
  if (request.kind === 'read' && sessionState) {
    const requestPath = req.path as string | undefined
    const sessionCwd = sessionState.cwd
    
    if (requestPath) {
      // Check if path is outside the session's working directory
      if (!requestPath.startsWith(sessionCwd + '/') && !requestPath.startsWith(sessionCwd + '\\') && requestPath !== sessionCwd) {
        isOutOfScope = true
        console.log(`[${ourSessionId}] Out-of-scope read detected:`, requestPath, 'not in', sessionCwd)
      } else {
        // In-scope reads are auto-approved (like CLI behavior)
        console.log(`[${ourSessionId}] Auto-approved in-scope read:`, requestPath)
        return { kind: 'approved' }
      }
    } else {
      // No path specified - auto-approve reads within trusted workspace
      console.log(`[${ourSessionId}] Auto-approved read (no path, trusted workspace)`)
      return { kind: 'approved' }
    }
  }
  
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { kind: 'denied-no-approval-rule-and-could-not-request-from-user' }
  }
  
  // Log all request fields for debugging
  console.log(`[${ourSessionId}] Full permission request:`, JSON.stringify(request, null, 2))
  
  // Deduplicate parallel permission requests for the same executable+session
  const inFlightKey = `${ourSessionId}:${executable}`
  const existingRequest = inFlightPermissions.get(inFlightKey)
  if (existingRequest) {
    console.log(`[${ourSessionId}] Reusing in-flight permission request for:`, executable)
    return existingRequest
  }
  
  // Create new permission request and track it
  const permissionPromise = new Promise<PermissionRequestResult>((resolve) => {
    pendingPermissions.set(requestId, { resolve, request, executable, sessionId: ourSessionId })
    mainWindow!.webContents.send('copilot:permission', {
      requestId,
      sessionId: ourSessionId,
      executable,
      isOutOfScope,
      ...request
    })
    bounceDock()
  })
  
  // Track the in-flight request
  inFlightPermissions.set(inFlightKey, permissionPromise)
  
  // Clean up after resolution
  permissionPromise.finally(() => {
    inFlightPermissions.delete(inFlightKey)
  })
  
  return permissionPromise
}

// Create a new session and return its ID
async function createNewSession(model?: string, cwd?: string): Promise<string> {
  const sessionModel = model || store.get('model') as string
  // In packaged app, process.cwd() can be '/', so default to home directory
  const sessionCwd = cwd || (app.isPackaged ? app.getPath('home') : process.cwd())
  
  // Get or create a client for this cwd
  const client = await getClientForCwd(sessionCwd)
  
  // Load MCP servers config
  const mcpConfig = await readMcpConfig()
  
  const newSession = await client.createSession({
    model: sessionModel,
    mcpServers: mcpConfig.mcpServers,
    onPermissionRequest: (request, invocation) => handlePermissionRequest(request, invocation, newSession.sessionId),
  })
  
  const sessionId = newSession.sessionId  // Use SDK's session ID
  
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
      bounceDock()
    } else if (event.type === 'tool.execution_start') {
      console.log(`[${sessionId}] Tool start FULL:`, JSON.stringify(event.data, null, 2))
      mainWindow.webContents.send('copilot:tool-start', { 
        sessionId, 
        toolCallId: event.data.toolCallId,
        toolName: event.data.toolName,
        input: event.data.arguments || event.data.input || (event.data as Record<string, unknown>)
      })
    } else if (event.type === 'tool.execution_complete') {
      console.log(`[${sessionId}] Tool end FULL:`, JSON.stringify(event.data, null, 2))
      mainWindow.webContents.send('copilot:tool-end', { 
        sessionId, 
        toolCallId: event.data.toolCallId,
        toolName: event.data.toolName,
        input: event.data.arguments || event.data.input || (event.data as Record<string, unknown>),
        output: event.data.output
      })
    } else if (event.type === 'tool.confirmation_requested') {
      console.log(`[${sessionId}] Confirmation requested:`, event.data)
      mainWindow.webContents.send('copilot:confirm', { sessionId, ...event.data })
    } else if (event.type === 'session.error') {
      console.log(`[${sessionId}] Session error:`, event.data)
      mainWindow.webContents.send('copilot:error', { sessionId, message: event.data?.message || JSON.stringify(event.data) })
    }
  })
  
  sessions.set(sessionId, { session: newSession, client, model: sessionModel, cwd: sessionCwd, alwaysAllowed: new Set() })
  activeSessionId = sessionId
  
  console.log(`Created session ${sessionId} with model ${sessionModel} in ${sessionCwd}`)
  return sessionId
}

async function initCopilot(): Promise<void> {
  try {
    // Create a default client - use home dir for packaged app since process.cwd() can be '/'
    const defaultCwd = app.isPackaged ? app.getPath('home') : process.cwd()
    const defaultClient = await getClientForCwd(defaultCwd)
    
    // Get all available sessions and our stored open sessions with models
    const allSessions = await defaultClient.listSessions()
    const openSessions = store.get('openSessions') as StoredSession[] || []
    const openSessionIds = openSessions.map(s => s.sessionId)
    const openSessionMap = new Map(openSessions.map(s => [s.sessionId, s]))
    
    console.log(`Found ${allSessions.length} total sessions, ${openSessions.length} were open in our app`)
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
    
    let resumedSessions: { sessionId: string; model: string; cwd: string; name?: string; editedFiles?: string[]; alwaysAllowed?: string[] }[] = []
    
    // Resume only our open sessions with their stored models and cwd
    for (const sessionId of sessionsToResume) {
      const meta = sessionMetaMap.get(sessionId)!
      const storedSession = openSessionMap.get(sessionId)
      try {
        const sessionModel = storedSession?.model || store.get('model') as string || 'gpt-5.2'
        const sessionCwd = storedSession?.cwd || defaultCwd
        const storedAlwaysAllowed = storedSession?.alwaysAllowed || []
        
        // Get or create client for this session's cwd
        const client = await getClientForCwd(sessionCwd)
        
        // Load MCP servers config
        const mcpConfig = await readMcpConfig()
        
        const session = await client.resumeSession(sessionId, {
          mcpServers: mcpConfig.mcpServers,
          onPermissionRequest: (request, invocation) => handlePermissionRequest(request, invocation, sessionId)
        })
        
        // Set up event handler for resumed session
        session.on((event) => {
          if (!mainWindow || mainWindow.isDestroyed()) return
          
          console.log(`[${sessionId}] Event:`, event.type)
          
          if (event.type === 'assistant.message_delta') {
            mainWindow.webContents.send('copilot:delta', { sessionId, content: event.data.deltaContent })
          } else if (event.type === 'assistant.message') {
            mainWindow.webContents.send('copilot:message', { sessionId, content: event.data.content })
          } else if (event.type === 'session.idle') {
            mainWindow.webContents.send('copilot:idle', { sessionId })
            bounceDock()
          } else if (event.type === 'tool.execution_start') {
            console.log(`[${sessionId}] Tool start FULL:`, JSON.stringify(event.data, null, 2))
            mainWindow.webContents.send('copilot:tool-start', { 
              sessionId, 
              toolCallId: event.data.toolCallId, 
              toolName: event.data.toolName,
              input: event.data.arguments || event.data.input || (event.data as Record<string, unknown>)
            })
          } else if (event.type === 'tool.execution_complete') {
            console.log(`[${sessionId}] Tool end FULL:`, JSON.stringify(event.data, null, 2))
            mainWindow.webContents.send('copilot:tool-end', { 
              sessionId, 
              toolCallId: event.data.toolCallId, 
              toolName: event.data.toolName,
              input: event.data.arguments || event.data.input || (event.data as Record<string, unknown>),
              output: event.data.output
            })
          }
        })
        
        // Restore alwaysAllowed set from stored data (normalize legacy ids)
        const alwaysAllowedSet = new Set(storedAlwaysAllowed.map(normalizeAlwaysAllowed))
        sessions.set(sessionId, { session, client, model: sessionModel, cwd: sessionCwd, alwaysAllowed: alwaysAllowedSet })
        resumedSessions.push({ 
          sessionId, 
          model: sessionModel,
          cwd: sessionCwd,
          name: storedSession?.name || meta.summary || undefined,
          editedFiles: storedSession?.editedFiles || [],
          alwaysAllowed: storedAlwaysAllowed
        })
        console.log(`Resumed session ${sessionId} with model ${sessionModel} in ${sessionCwd}${meta.summary ? ` (${meta.summary})` : ''}`)
      } catch (err) {
        console.error(`Failed to resume session ${sessionId}:`, err)
      }
    }
    
    // If no sessions were resumed, don't create one automatically
    // The frontend will trigger creation which includes trust check
    if (resumedSessions.length === 0) {
      // Signal to frontend that it needs to create an initial session
      activeSessionId = null
    } else {
      activeSessionId = resumedSessions[0].sessionId
    }

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
    width: 1200,
    height: 650,
    minWidth: 900,
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
  // Use the default cwd client for title generation
  const defaultClient = await getClientForCwd(process.cwd())
  
  try {
    // Create a temporary session with the cheapest model for title generation
    const tempSession = await defaultClient.createSession({
      model: 'gpt-5-mini',
      systemMessage: {
        mode: 'append',
        content: 'You are a title generator. Respond with ONLY a short title (3-6 words, no quotes, no punctuation at end).'
      }
    })
    
    const sessionId = tempSession.sessionId
    const prompt = `Generate a short descriptive title for this conversation, that makes it easy to identify what this is about:\n\n${data.conversation}\n\nRespond with ONLY the title, nothing else.`
    const response = await tempSession.sendAndWait({ prompt })
    
    // Clean up temp session - destroy and delete to avoid polluting session list
    await tempSession.destroy()
    await defaultClient.deleteSession(sessionId)
    
    // Extract and clean the title
    const title = (response?.data?.content || 'Untitled').trim().replace(/^["']|["']$/g, '').slice(0, 50)
    return title
  } catch (error) {
    console.error('Failed to generate title:', error)
    return 'Untitled'
  }
})

// Generate commit message from diff using AI
ipcMain.handle('git:generateCommitMessage', async (_event, data: { diff: string }) => {
  const defaultClient = await getClientForCwd(process.cwd())
  
  try {
    const tempSession = await defaultClient.createSession({
      model: 'gpt-5-mini',
      systemMessage: {
        mode: 'append',
        content: 'You are a git commit message generator. Write concise, conventional commit messages. Use format: type(scope): description. Types: feat, fix, refactor, style, docs, test, chore. Keep under 72 chars. No quotes around the message.'
      }
    })
    
    const sessionId = tempSession.sessionId
    // Truncate diff if too long
    const truncatedDiff = data.diff.length > 4000 ? data.diff.slice(0, 4000) + '\n... (truncated)' : data.diff
    const prompt = `Generate a commit message for these changes:\n\n${truncatedDiff}\n\nRespond with ONLY the commit message, nothing else.`
    const response = await tempSession.sendAndWait({ prompt })
    
    await tempSession.destroy()
    await defaultClient.deleteSession(sessionId)
    
    const message = (response?.data?.content || 'Update files').trim().replace(/^["']|["']$/g, '').slice(0, 100)
    return message
  } catch (error) {
    console.error('Failed to generate commit message:', error)
    return 'Update files'
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
  
  // Track "always allow" for this specific executable in the session
  if (data.decision === 'always') {
    const sessionState = sessions.get(pending.sessionId)
    if (sessionState) {
      // Add each executable individually (handle comma-separated list)
      const executables = pending.executable.split(', ').filter(e => e.trim())
      for (const exec of executables) {
        sessionState.alwaysAllowed.add(normalizeAlwaysAllowed(exec.trim()))
      }
      console.log(`[${pending.sessionId}] Added to always allow:`, executables.map(normalizeAlwaysAllowed))
    }
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
    
    // Create replacement session with new model (keep same cwd)
    const newSessionId = await createNewSession(data.model, sessionState.cwd)
    const newSessionState = sessions.get(newSessionId)!
    console.log(`Sessions after model change: ${sessions.size} active`)
    return { sessionId: newSessionId, model: data.model, cwd: newSessionState.cwd }
  }
  
  return { model: data.model }
})

ipcMain.handle('copilot:getModels', async () => {
  const currentModel = store.get('model') as string
  return { models: AVAILABLE_MODELS, current: currentModel }
})

// Get current working directory
ipcMain.handle('copilot:getCwd', async () => {
  // Use home dir for packaged app since process.cwd() can be '/'
  return app.isPackaged ? app.getPath('home') : process.cwd()
})

// Create a new session (for new tabs)
ipcMain.handle('copilot:createSession', async (_event, options?: { cwd?: string }) => {
  const sessionId = await createNewSession(undefined, options?.cwd)
  const sessionState = sessions.get(sessionId)!
  return { sessionId, model: sessionState.model, cwd: sessionState.cwd }
})

// Pick a folder dialog
ipcMain.handle('copilot:pickFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: 'Select Working Directory'
  })
  
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, path: null }
  }
  
  return { canceled: false, path: result.filePaths[0] }
})

// Check if a directory is trusted and optionally request trust
ipcMain.handle('copilot:checkDirectoryTrust', async (_event, dir: string) => {
  // Check if already always-trusted (persisted)
  const alwaysTrusted = store.get('trustedDirectories') as string[] || []
  if (alwaysTrusted.includes(dir)) {
    return { trusted: true, decision: 'already-trusted' }
  }
  
  // Check if subdirectory of always-trusted
  for (const trusted of alwaysTrusted) {
    if (dir.startsWith(trusted + '/') || dir.startsWith(trusted + '\\')) {
      return { trusted: true, decision: 'already-trusted' }
    }
  }
  
  // Show trust dialog
  const result = await dialog.showMessageBox(mainWindow!, {
    type: 'question',
    title: 'Trust Folder',
    message: `Do you trust the files in this folder?`,
    detail: `${dir}\n\nCopilot will be able to read, write, and execute files in this directory.`,
    buttons: ['Trust Once', 'Always Trust', 'Don\'t Trust'],
    defaultId: 0,
    cancelId: 2
  })
  
  switch (result.response) {
    case 0: // Trust Once - just return trusted, don't cache (next session will ask again)
      return { trusted: true, decision: 'once' }
    case 1: // Always Trust - persist
      if (!alwaysTrusted.includes(dir)) {
        store.set('trustedDirectories', [...alwaysTrusted, dir])
      }
      return { trusted: true, decision: 'always' }
    default: // Don't Trust
      return { trusted: false, decision: 'denied' }
  }
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

// Get always-allowed executables for a session
ipcMain.handle('copilot:getAlwaysAllowed', async (_event, sessionId: string) => {
  const sessionState = sessions.get(sessionId)
  if (!sessionState) {
    return []
  }
  return Array.from(sessionState.alwaysAllowed)
})

// Remove an executable from always-allowed for a session
ipcMain.handle('copilot:removeAlwaysAllowed', async (_event, data: { sessionId: string; executable: string }) => {
  const sessionState = sessions.get(data.sessionId)
  if (sessionState) {
    sessionState.alwaysAllowed.delete(data.executable)
    console.log(`[${data.sessionId}] Removed from always allow:`, data.executable)
  }
  return { success: true }
})

// Save open session IDs to persist across restarts
ipcMain.handle('copilot:saveOpenSessions', async (_event, openSessions: StoredSession[]) => {
  store.set('openSessions', openSessions)
  console.log(`Saved ${openSessions.length} open sessions with models`)
  return { success: true }
})

ipcMain.handle('copilot:renameSession', async (_event, data: { sessionId: string; name: string }) => {
  const openSessions = store.get('openSessions') as StoredSession[] || []
  const updated = openSessions.map(s =>
    s.sessionId === data.sessionId ? { ...s, name: data.name } : s
  )
  store.set('openSessions', updated)
  console.log(`Renamed session ${data.sessionId} to ${data.name}`)
  return { success: true }
})

// Git operations - get diff for files
ipcMain.handle('git:getDiff', async (_event, data: { cwd: string; files: string[] }) => {
  try {
    // Get the diff for the specified files
    const fileArgs = data.files.map(f => `"${f}"`).join(' ')
    const { stdout } = await execAsync(`git diff HEAD -- ${fileArgs}`, { cwd: data.cwd })
    
    // If no diff (files might be new/untracked), get their status
    if (!stdout.trim()) {
      const { stdout: status } = await execAsync(`git status --porcelain -- ${fileArgs}`, { cwd: data.cwd })
      return { diff: status || 'No changes detected', success: true }
    }
    
    return { diff: stdout, success: true }
  } catch (error) {
    console.error('Git diff failed:', error)
    return { diff: '', success: false, error: String(error) }
  }
})

// Git operations - commit and push
ipcMain.handle('git:commitAndPush', async (_event, data: { cwd: string; files: string[]; message: string }) => {
  try {
    // Get current branch name
    const { stdout: branchOutput } = await execAsync('git branch --show-current', { cwd: data.cwd })
    const currentBranch = branchOutput.trim()
    const isMainBranch = currentBranch === 'main' || currentBranch === 'master'
    
    // Determine the target main branch by checking which exists
    let targetBranch = 'main'
    try {
      await execAsync('git rev-parse --verify main', { cwd: data.cwd })
    } catch {
      // 'main' doesn't exist, try 'master'
      try {
        await execAsync('git rev-parse --verify master', { cwd: data.cwd })
        targetBranch = 'master'
      } catch {
        // Neither exists, default to 'main'
      }
    }
    
    // Stage the files
    for (const file of data.files) {
      await execAsync(`git add "${file}"`, { cwd: data.cwd })
    }
    
    // Commit with the message
    await execAsync(`git commit -m "${data.message.replace(/"/g, '\\"')}"`, { cwd: data.cwd })
    
    // Push - handle upstream branch setting
    try {
      await execAsync('git push', { cwd: data.cwd })
    } catch (pushError) {
      // If push fails due to no upstream branch, set upstream and push
      const errorMsg = String(pushError)
      if (errorMsg.includes('has no upstream branch')) {
        // Set upstream and push
        await execAsync(`git push --set-upstream origin ${currentBranch}`, { cwd: data.cwd })
      } else {
        throw pushError
      }
    }
    
    // If not on main/master, merge to main and push
    if (!isMainBranch && currentBranch) {
      console.log(`Merging ${currentBranch} to ${targetBranch}...`)
      
      // Switch to main/master
      await execAsync(`git checkout ${targetBranch}`, { cwd: data.cwd })
      console.log(`Switched to ${targetBranch}`)
      
      // Merge the feature branch
      await execAsync(`git merge ${currentBranch}`, { cwd: data.cwd })
      console.log(`Merged ${currentBranch} into ${targetBranch}`)
      
      // Push main/master
      await execAsync('git push', { cwd: data.cwd })
      console.log(`Pushed ${targetBranch} to origin`)
      
      return { success: true, mergedToMain: true, finalBranch: targetBranch }
    }
    
    return { success: true, mergedToMain: false, finalBranch: currentBranch }
  } catch (error) {
    console.error('Git commit/push failed:', error)
    return { success: false, error: String(error) }
  }
})

// Git operations - get current branch
ipcMain.handle('git:getBranch', async (_event, cwd: string) => {
  try {
    const { stdout } = await execAsync('git branch --show-current', { cwd })
    return { branch: stdout.trim(), success: true }
  } catch (error) {
    console.error('Git branch failed:', error)
    return { branch: null, success: false, error: String(error) }
  }
})

// Git operations - checkout (create) branch
ipcMain.handle('git:checkoutBranch', async (_event, data: { cwd: string; branchName: string }) => {
  try {
    const branch = (data.branchName || '').trim()
    if (!branch) {
      return { success: false, error: 'Branch name is required' }
    }
    // Prefer `git switch -c` when available
    try {
      await execAsync(`git switch -c "${branch.replace(/"/g, '\\"')}"`, { cwd: data.cwd })
    } catch {
      await execAsync(`git checkout -b "${branch.replace(/"/g, '\\"')}"`, { cwd: data.cwd })
    }
    return { success: true }
  } catch (error) {
    console.error('Git checkout branch failed:', error)
    return { success: false, error: String(error) }
  }
})

// Resume a previous session (from the history list)
ipcMain.handle('copilot:resumePreviousSession', async (_event, sessionId: string) => {
  // Check if already resumed
  if (sessions.has(sessionId)) {
    const sessionState = sessions.get(sessionId)!
    return { sessionId, model: sessionState.model, cwd: sessionState.cwd, alreadyOpen: true }
  }
  
  const sessionModel = store.get('model') as string || 'gpt-5.2'
  // Use home dir for packaged app since process.cwd() can be '/'
  const sessionCwd = app.isPackaged ? app.getPath('home') : process.cwd()
  
  // Get or create client for this cwd
  const client = await getClientForCwd(sessionCwd)
  
  // Load MCP servers config
  const mcpConfig = await readMcpConfig()
  
  const session = await client.resumeSession(sessionId, {
    mcpServers: mcpConfig.mcpServers,
    onPermissionRequest: (request, invocation) => handlePermissionRequest(request, invocation, sessionId)
  })
  
  // Set up event handler
  session.on((event) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    
    console.log(`[${sessionId}] Event:`, event.type)
    
    if (event.type === 'assistant.message_delta') {
      mainWindow.webContents.send('copilot:delta', { sessionId, content: event.data.deltaContent })
    } else if (event.type === 'assistant.message') {
      mainWindow.webContents.send('copilot:message', { sessionId, content: event.data.content })
    } else if (event.type === 'session.idle') {
      mainWindow.webContents.send('copilot:idle', { sessionId })
      bounceDock()
    } else if (event.type === 'tool.execution_start') {
      console.log(`[${sessionId}] Tool start FULL:`, JSON.stringify(event.data, null, 2))
      mainWindow.webContents.send('copilot:tool-start', { 
        sessionId, 
        toolCallId: event.data.toolCallId, 
        toolName: event.data.toolName,
        input: event.data.arguments || event.data.input || (event.data as Record<string, unknown>)
      })
    } else if (event.type === 'tool.execution_complete') {
      console.log(`[${sessionId}] Tool end FULL:`, JSON.stringify(event.data, null, 2))
      mainWindow.webContents.send('copilot:tool-end', { 
        sessionId, 
        toolCallId: event.data.toolCallId, 
        toolName: event.data.toolName,
        input: event.data.arguments || event.data.input || (event.data as Record<string, unknown>),
        output: event.data.output
      })
    }
  })
  
  sessions.set(sessionId, { session, client, model: sessionModel, cwd: sessionCwd, alwaysAllowed: new Set() })
  activeSessionId = sessionId
  
  console.log(`Resumed previous session ${sessionId} in ${sessionCwd}`)
  return { sessionId, model: sessionModel, cwd: sessionCwd, alreadyOpen: false }
})

// MCP Server Management
ipcMain.handle('mcp:getConfig', async () => {
  const config = await readMcpConfig()
  return config
})

ipcMain.handle('mcp:saveConfig', async (_event, config: MCPConfigFile) => {
  await writeMcpConfig(config)
  return { success: true }
})

ipcMain.handle('mcp:addServer', async (_event, data: { name: string; server: MCPServerConfig }) => {
  const config = await readMcpConfig()
  config.mcpServers[data.name] = data.server
  await writeMcpConfig(config)
  return { success: true }
})

ipcMain.handle('mcp:updateServer', async (_event, data: { name: string; server: MCPServerConfig }) => {
  const config = await readMcpConfig()
  if (config.mcpServers[data.name]) {
    config.mcpServers[data.name] = data.server
    await writeMcpConfig(config)
    return { success: true }
  }
  return { success: false, error: 'Server not found' }
})

ipcMain.handle('mcp:deleteServer', async (_event, name: string) => {
  const config = await readMcpConfig()
  if (config.mcpServers[name]) {
    delete config.mcpServers[name]
    await writeMcpConfig(config)
    return { success: true }
  }
  return { success: false, error: 'Server not found' }
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

ipcMain.on('window:quit', () => {
  app.quit()
})

// Theme handlers
ipcMain.handle('theme:get', () => {
  return store.get('theme') as string
})

ipcMain.handle('theme:set', (_event, themeId: string) => {
  store.set('theme', themeId)
  return { success: true }
})

ipcMain.handle('theme:getSystemTheme', () => {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
})

ipcMain.handle('theme:listExternal', () => {
  return loadExternalThemes()
})

ipcMain.handle('theme:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [{ name: 'Theme Files', extensions: ['json'] }],
    title: 'Import Theme'
  })
  
  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, canceled: true }
  }
  
  const sourcePath = result.filePaths[0]
  const fileName = sourcePath.split(/[/\\]/).pop() || 'theme.json'
  
  try {
    const content = readFileSync(sourcePath, 'utf-8')
    const data = JSON.parse(content)
    const validationResult = validateTheme(data)
    
    if (!validationResult.valid) {
      return { success: false, error: 'Theme file is not valid' }
    }
    
    // Copy to themes directory
    const destPath = join(themesDir, fileName)
    copyFileSync(sourcePath, destPath)
    
    return { success: true, theme: validationResult.theme }
  } catch {
    return { success: false, error: 'Theme file is not valid' }
  }
})

ipcMain.handle('theme:getThemesDir', () => {
  return themesDir
})

// Listen to system theme changes and notify renderer
nativeTheme.on('updated', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('theme:systemChanged', {
      systemTheme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    })
  }
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
  
  // Stop all clients
  for (const [cwd, client] of copilotClients) {
    await client.stop()
    console.log(`Stopped client for ${cwd}`)
  }
  copilotClients.clear()
  
  app.quit()
})

app.on('before-quit', async () => {
  // Destroy all sessions
  for (const [id, state] of sessions) {
    await state.session.destroy()
  }
  sessions.clear()
  
  // Stop all clients
  for (const [cwd, client] of copilotClients) {
    await client.stop()
  }
  copilotClients.clear()
})

