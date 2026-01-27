import { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme, desktopCapturer } from 'electron'
import { join, dirname } from 'path'
import { existsSync, mkdirSync, readdirSync, readFileSync, copyFileSync, statSync, unlinkSync } from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import { readFile, writeFile, mkdir } from 'fs/promises'

const execAsync = promisify(exec)
import { CopilotClient, CopilotSession, PermissionRequest, PermissionRequestResult, Tool } from '@github/copilot-sdk'
import Store from 'electron-store'
import log from 'electron-log/main'
import { extractExecutables, containsDestructiveCommand, getDestructiveExecutables } from './utils/extractExecutables'
import * as worktree from './worktree'
import * as ptyManager from './pty'
import * as browserManager from './browser'
import { createBrowserTools } from './browserTools'

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

// Screenshot tool - captures the screen or a specific window and saves to the session's cwd
// Uses Electron's desktopCapturer API which runs in the main process with granted permissions
function createScreenshotTool(sessionCwd: string): Tool {
  return {
    name: 'take_screenshot',
    description: 'Takes a screenshot and saves it to a file. Can capture either the entire screen or a specific window by name. Use this to capture visual evidence of a delivered feature or UI state. Returns the path to the saved screenshot file.',
    parameters: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'Optional filename for the screenshot (without extension). If not provided, uses timestamp.'
        },
        window: {
          type: 'string',
          description: 'Optional window name to capture (e.g., "Chrome", "VS Code", "Terminal"). If not provided, captures the entire screen. Use list_windows first to see available windows.'
        },
        list_windows: {
          type: 'boolean',
          description: 'If true, returns a list of available window names instead of taking a screenshot. Useful to discover what windows can be captured.'
        }
      }
    },
    handler: async (args: { filename?: string; window?: string; list_windows?: boolean }) => {
      try {
        // Generate filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const baseFilename = args.filename || `screenshot-${timestamp}`
        const filename = `${baseFilename}.png`
        const filepath = join(sessionCwd, filename)

        // If list_windows is true, get available sources
        if (args.list_windows) {
          log.info('[Screenshot] Listing available windows...')
          const windowSources = await desktopCapturer.getSources({
            types: ['window'],
            thumbnailSize: { width: 1, height: 1 }
          })
          const screenSources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: 1, height: 1 }
          })
          return {
            windows: windowSources.map(s => s.name).filter(n => n),
            screens: screenSources.map(s => s.name),
            hint: 'Use the window parameter with one of these names to capture a specific window, or omit it to capture the entire screen.'
          }
        }

        // Determine what to capture
        const captureType = args.window ? 'window' : 'screen'
        log.info(`[Screenshot] Capturing ${captureType}${args.window ? `: ${args.window}` : ''}...`)
        
        const sources = await desktopCapturer.getSources({
          types: [captureType],
          thumbnailSize: { width: 1920, height: 1080 },
          fetchWindowIcons: false
        })
        
        if (sources.length === 0) {
          return { 
            error: `No ${captureType} sources available`,
            hint: 'Screen recording permission may be required. Go to System Settings → Privacy & Security → Screen Recording and enable Copilot Skins. You may need to restart the app.'
          }
        }
        
        // Find the right source
        let source
        if (args.window) {
          const searchTerm = args.window.toLowerCase()
          source = sources.find(s => s.name.toLowerCase().includes(searchTerm))
          if (!source) {
            return { 
              error: `Window "${args.window}" not found`,
              available_windows: sources.map(s => s.name),
              hint: 'Try one of the available window names listed above.'
            }
          }
        } else {
          source = sources[0]
        }
        
        const thumbnail = source.thumbnail
        
        // Check if we got actual content
        if (thumbnail.isEmpty()) {
          return {
            error: 'Screenshot capture returned empty image',
            hint: 'Screen recording permission is required. Go to System Settings → Privacy & Security → Screen Recording and enable Copilot Skins. Restart the app after granting permission.'
          }
        }
        
        // Convert to PNG and save
        const pngBuffer = thumbnail.toPNG()
        
        if (!pngBuffer || pngBuffer.length === 0) {
          return {
            error: 'Screenshot produced empty file',
            hint: 'Screen recording permission may not be fully granted. Try removing and re-adding Copilot Skins in Screen Recording settings, then restart.'
          }
        }
        
        await writeFile(filepath, pngBuffer)
        
        log.info(`[Screenshot] Saved to: ${filepath} (${pngBuffer.length} bytes)`)
        return {
          success: true,
          path: filepath,
          filename: filename,
          captured: args.window ? `window: ${source.name}` : 'entire screen',
          size: `${pngBuffer.length} bytes`,
          dimensions: `${thumbnail.getSize().width}x${thumbnail.getSize().height}`
        }
        
      } catch (error) {
        log.error('[Screenshot] Failed:', error)
        return {
          error: `Failed to capture screenshot: ${error instanceof Error ? error.message : String(error)}`
        }
      }
    }
  }
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

// Agent Skills - imported from skills module
import { getAllSkills } from './skills'

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
    theme: 'system' as string,  // Theme preference: 'system', 'light', 'dark', or custom theme id
    sessionCwds: {} as Record<string, string>,  // Persistent map of sessionId -> cwd (survives session close)
    globalSafeCommands: [] as string[],  // Globally safe commands that are auto-approved for all sessions
    // URL allowlist - domains that are auto-approved for web_fetch (similar to --allow-url in Copilot CLI)
    allowedUrls: [
      'github.com',
      'docs.github.com',
      'raw.githubusercontent.com',
      'api.github.com',
      'npmjs.com',
      'www.npmjs.com',
      'pypi.org',
      'docs.python.org',
      'developer.mozilla.org',
      'stackoverflow.com',
    ] as string[],
    // URL denylist - domains that are always blocked (similar to --deny-url in Copilot CLI)
    deniedUrls: [] as string[]
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
  
  const cliName = platform === 'win32' ? 'copilot.exe' : 'copilot'
  const cliPath = join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    '@github',
    `copilot-${platformArch}`,
    cliName
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
  
  // In packaged apps, process.env may not have the user's PATH
  // which is needed for the CLI to find `gh` for authentication
  const env = { ...process.env }
  if (app.isPackaged) {
    if (process.platform === 'win32') {
      // Windows: gh CLI is typically in Program Files or user's AppData
      const username = process.env.USERNAME || process.env.USER || ''
      const additionalPaths = [
        'C:\\Program Files\\GitHub CLI',
        'C:\\Program Files (x86)\\GitHub CLI',
        `C:\\Users\\${username}\\AppData\\Local\\GitHub CLI`,
        `C:\\Users\\${username}\\scoop\\shims`,  // Scoop package manager
        'C:\\ProgramData\\chocolatey\\bin',      // Chocolatey
      ].filter(p => username || !p.includes('Users'))
      const pathSep = ';'
      const currentPath = env.PATH || env.Path || ''
      env.PATH = [...additionalPaths, currentPath].filter(Boolean).join(pathSep)
      log.info('Augmented PATH for packaged app (Windows)')
    } else if (!env.PATH?.includes('/opt/homebrew/bin')) {
      // macOS/Linux: Add common paths where gh CLI might be installed
      const additionalPaths = [
        '/opt/homebrew/bin',    // Apple Silicon Homebrew
        '/usr/local/bin',       // Intel Homebrew / manual installs
        '/usr/bin',
        '/bin'
      ]
      env.PATH = [...additionalPaths, env.PATH].filter(Boolean).join(':')
      log.info('Augmented PATH for packaged app (macOS/Linux)')
    }
  }
  
  const client = new CopilotClient({ cwd, cliPath, env })
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
  allowedPaths: Set<string>  // Per-session allowed out-of-scope paths (parent directories)
  isProcessing: boolean  // Whether the session is currently waiting for a response
}
const sessions = new Map<string, SessionState>()
let activeSessionId: string | null = null
let sessionCounter = 0

// Keep-alive interval (5 minutes) to prevent session timeout
const SESSION_KEEPALIVE_INTERVAL = 5 * 60 * 1000
let keepAliveTimer: NodeJS.Timeout | null = null

// Start keep-alive timer for active sessions
function startKeepAlive(): void {
  if (keepAliveTimer) return
  
  keepAliveTimer = setInterval(async () => {
    for (const [sessionId, sessionState] of sessions.entries()) {
      // Only ping sessions that are actively processing to avoid noise
      if (!sessionState.isProcessing) continue
      
      try {
        // Ping the session by getting messages (lightweight operation)
        await sessionState.session.getMessages()
        log.info(`[${sessionId}] Keep-alive ping successful`)
      } catch (error) {
        log.warn(`[${sessionId}] Keep-alive ping failed:`, error)
        // Session may have timed out on the backend - send idle event to frontend
        // to ensure the UI doesn't stay stuck in "processing" state
        if (mainWindow && !mainWindow.isDestroyed()) {
          log.info(`[${sessionId}] Sending fallback idle event due to session timeout`)
          mainWindow.webContents.send('copilot:idle', { sessionId })
          sessionState.isProcessing = false
        }
      }
    }
  }, SESSION_KEEPALIVE_INTERVAL)
  
  log.info('Started session keep-alive timer')
}

// Stop keep-alive timer
function stopKeepAlive(): void {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer)
    keepAliveTimer = null
    log.info('Stopped session keep-alive timer')
  }
}

// Resume a session that has been disconnected
async function resumeDisconnectedSession(sessionId: string, sessionState: SessionState): Promise<CopilotSession> {
  log.info(`[${sessionId}] Attempting to resume disconnected session...`)
  
  const client = await getClientForCwd(sessionState.cwd)
  const mcpConfig = await readMcpConfig()
  
  // Create browser tools and screenshot tool for resumed session
  const browserTools = createBrowserTools(sessionId)
  const screenshotTool = createScreenshotTool(sessionState.cwd)
  log.info(`[${sessionId}] Resuming with ${browserTools.length + 1} tools:`, [...browserTools.map(t => t.name), screenshotTool.name].join(', '))
  
  const resumedSession = await client.resumeSession(sessionId, {
    mcpServers: mcpConfig.mcpServers,
    tools: [...browserTools, screenshotTool],
    onPermissionRequest: (request, invocation) => handlePermissionRequest(request, invocation, sessionId)
  })
  
  // Set up event handler for resumed session
  resumedSession.on((event) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    
    log.info(`[${sessionId}] Event:`, event.type)
    
    if (event.type === 'assistant.message_delta') {
      mainWindow.webContents.send('copilot:delta', { sessionId, content: event.data.deltaContent })
    } else if (event.type === 'assistant.message') {
      mainWindow.webContents.send('copilot:message', { sessionId, content: event.data.content })
    } else if (event.type === 'session.idle') {
      const currentSessionState = sessions.get(sessionId)
      if (currentSessionState) currentSessionState.isProcessing = false
      mainWindow.webContents.send('copilot:idle', { sessionId })
      bounceDock()
    } else if (event.type === 'tool.execution_start') {
      log.info(`[${sessionId}] Tool start FULL:`, JSON.stringify(event.data, null, 2))
      mainWindow.webContents.send('copilot:tool-start', { 
        sessionId, 
        toolCallId: event.data.toolCallId, 
        toolName: event.data.toolName,
        input: event.data.arguments || event.data.input || (event.data as Record<string, unknown>)
      })
    } else if (event.type === 'tool.execution_complete') {
      log.info(`[${sessionId}] Tool end FULL:`, JSON.stringify(event.data, null, 2))
      mainWindow.webContents.send('copilot:tool-end', { 
        sessionId, 
        toolCallId: event.data.toolCallId, 
        toolName: event.data.toolName,
        input: event.data.arguments || event.data.input || (event.data as Record<string, unknown>),
        output: event.data.output
      })
    } else if (event.type === 'tool.confirmation_requested') {
      log.info(`[${sessionId}] Confirmation requested:`, event.data)
      mainWindow.webContents.send('copilot:confirm', { sessionId, ...event.data })
    } else if (event.type === 'session.error') {
      log.info(`[${sessionId}] Session error:`, event.data)
      mainWindow.webContents.send('copilot:error', { sessionId, message: event.data?.message || JSON.stringify(event.data) })
    } else if (event.type === 'session.usage_info') {
      mainWindow.webContents.send('copilot:usageInfo', { 
        sessionId,
        tokenLimit: event.data.tokenLimit,
        currentTokens: event.data.currentTokens,
        messagesLength: event.data.messagesLength
      })
    } else if (event.type === 'session.compaction_start') {
      log.info(`[${sessionId}] Compaction started`)
      mainWindow.webContents.send('copilot:compactionStart', { sessionId })
    } else if (event.type === 'session.compaction_complete') {
      log.info(`[${sessionId}] Compaction complete:`, event.data)
      mainWindow.webContents.send('copilot:compactionComplete', { 
        sessionId,
        success: event.data.success,
        preCompactionTokens: event.data.preCompactionTokens,
        postCompactionTokens: event.data.postCompactionTokens,
        tokensRemoved: event.data.tokensRemoved,
        summaryContent: event.data.summaryContent,
        error: event.data.error
      })
    }
  })
  
  // Update session state with new session object
  sessionState.session = resumedSession
  sessionState.client = client
  
  log.info(`[${sessionId}] Session resumed successfully`)
  return resumedSession
}

// Pending permission requests waiting for user response
const pendingPermissions = new Map<string, {
  resolve: (result: PermissionRequestResult) => void
  request: PermissionRequest
  executable: string
  sessionId: string
  outOfScopePath?: string  // Store path for out-of-scope reads to remember parent dir
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
// This serves as the baseline list; actual availability is verified per-user
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

// Cache for verified models (models confirmed available for current user)
interface VerifiedModelsCache {
  models: ModelInfo[]
  timestamp: number
}
let verifiedModelsCache: VerifiedModelsCache | null = null
const MODEL_CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

// Returns verified models, using cache if valid
function getVerifiedModels(): ModelInfo[] {
  if (verifiedModelsCache && Date.now() - verifiedModelsCache.timestamp < MODEL_CACHE_TTL) {
    return verifiedModelsCache.models
  }
  // If no cache, return baseline models (verification happens async)
  return AVAILABLE_MODELS
}

// Verify which models are available for the current user by testing each one
async function verifyAvailableModels(client: CopilotClient): Promise<ModelInfo[]> {
  console.log('Starting model verification...')
  const verified: ModelInfo[] = []
  
  for (const model of AVAILABLE_MODELS) {
    try {
      // Try to create a session with this model
      const session = await client.createSession({ model: model.id })
      // If successful, model is available - clean up immediately
      await session.destroy()
      // Try to delete session file, but don't fail if it doesn't exist
      try {
        await client.deleteSession(session.sessionId)
      } catch {
        // Session may already be deleted by destroy(), ignore
      }
      verified.push(model)
      console.log(`✓ Model verified: ${model.id}`)
    } catch (error) {
      // Model not available for this user
      console.log(`✗ Model unavailable: ${model.id}`, error instanceof Error ? error.message : error)
    }
  }
  
  // Cache the results
  verifiedModelsCache = { models: verified, timestamp: Date.now() }
  console.log(`Model verification complete: ${verified.length}/${AVAILABLE_MODELS.length} models available`)
  
  return verified
}

// Preferred models for quick, simple AI tasks (in order of preference)
// These are typically free/cheap models optimized for simple text generation
const QUICK_TASKS_MODEL_PREFERENCES = ['gpt-4.1', 'gpt-5-mini', 'claude-haiku-4.5']

// Get the best available model for quick tasks from the server's available models
// Falls back to the session's configured model if none of the preferred models are available
async function getQuickTasksModel(client: CopilotClient): Promise<string> {
  const sessionModel = store.get('model') as string
  
  try {
    const availableModels = await client.listModels()
    const availableIds = new Set(availableModels.map(m => m.id))
    
    // Find the first preferred model that's available
    for (const preferred of QUICK_TASKS_MODEL_PREFERENCES) {
      if (availableIds.has(preferred)) {
        return preferred
      }
    }
    
    // Fallback: use the session's configured model
    console.warn(`No preferred quick tasks model available, using session model: ${sessionModel}`)
    return sessionModel
  } catch (error) {
    console.warn('Failed to list models for quick tasks, using session model:', error)
    return sessionModel
  }
}

// Global allowlist of low-risk, read-only shell commands.
// These are auto-approved for all sessions and intentionally NOT persisted/shown in the per-session "Always Allowed" UI.
const GLOBAL_AUTO_APPROVED_SHELL_EXECUTABLES = new Set([
  // Basic shell inspection
  'ls',
  'cd',
  'pwd',
  'whoami',
  'id',
  'date',
  'uname',
  'which',
  'echo',
  'printf',

  // Read-only file/content inspection
  'cat',
  'head',
  'tail',
  'wc',
  'grep',
  'sort',
  'uniq',
  'cut',
  'tr',
  'diff',

  // File metadata / disk info
  'stat',
  'file',
  'du',
  'df',

  // Path helpers
  'basename',
  'dirname',
  'realpath',

  // Hashing (read-only)
  'shasum',
  'md5',
])

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
  const globalSafeCommands = new Set(store.get('globalSafeCommands') as string[] || [])
  
  console.log(`[${ourSessionId}] Permission request:`, request.kind)
  
  // For shell commands, check each executable individually
  if (request.kind === 'shell' && req.fullCommandText) {
    const commandText = req.fullCommandText as string
    const executables = extractExecutables(commandText)
    
    // Check for destructive commands - these NEVER get auto-approved (Issue #65)
    const isDestructive = containsDestructiveCommand(commandText)
    const destructiveExecutables = isDestructive ? getDestructiveExecutables(commandText) : []
    
    if (isDestructive) {
      console.log(`[${ourSessionId}] DESTRUCTIVE command detected:`, destructiveExecutables)
      
      if (!mainWindow || mainWindow.isDestroyed()) {
        return { kind: 'denied-no-approval-rule-and-could-not-request-from-user' }
      }
      
      // Always require explicit permission for destructive commands
      return new Promise((resolve) => {
        pendingPermissions.set(requestId, { resolve, request, executable: destructiveExecutables.join(', '), sessionId: ourSessionId })
        mainWindow!.webContents.send('copilot:permission', {
          requestId,
          sessionId: ourSessionId,
          executable: destructiveExecutables.join(', '),
          executables: destructiveExecutables,
          allExecutables: executables,
          isOutOfScope: false,
          isDestructive: true,  // Flag for UI to show warning
          ...request
        })
        bounceDock()
      })
    }
    
    // Filter to only unapproved executables (exclude globally-auto-approved commands and global safe commands)
    const unapproved = executables.filter(exec =>
      !GLOBAL_AUTO_APPROVED_SHELL_EXECUTABLES.has(exec) &&
      !globalSafeCommands.has(exec) &&
      !sessionState?.alwaysAllowed.has(exec)
    )
    
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
        isDestructive: false,
        ...request
      })
      bounceDock()
    })
  }
  
  // Non-shell permissions
  const executable = getExecutableIdentifier(request)
  
  // Auto-approve global low-risk commands (do not persist/show in UI)
  if (request.kind === 'shell' && GLOBAL_AUTO_APPROVED_SHELL_EXECUTABLES.has(executable)) {
    console.log(`[${ourSessionId}] Auto-approved (global allowlist):`, executable)
    return { kind: 'approved' }
  }

  // Check if in global safe commands
  if (globalSafeCommands.has(executable)) {
    console.log(`[${ourSessionId}] Auto-approved (global safe commands):`, executable)
    return { kind: 'approved' }
  }

  // Check if already allowed (per-session "always")
  if (sessionState?.alwaysAllowed.has(executable)) {
    console.log(`[${ourSessionId}] Auto-approved (always allow):`, executable)
    return { kind: 'approved' }
  }
  
  // For read requests, check if in-scope (auto-approve) or out-of-scope (need permission)
  let isOutOfScope = false
  let outOfScopePath: string | undefined
  if (request.kind === 'read' && sessionState) {
    const requestPath = req.path as string | undefined
    const sessionCwd = sessionState.cwd
    
    if (requestPath) {
      // Check if path is outside the session's working directory
      if (!requestPath.startsWith(sessionCwd + '/') && !requestPath.startsWith(sessionCwd + '\\') && requestPath !== sessionCwd) {
        // Check if path is under a previously allowed path
        let isAllowedPath = false
        for (const allowedPath of sessionState.allowedPaths) {
          if (requestPath.startsWith(allowedPath + '/') || requestPath.startsWith(allowedPath + '\\') || requestPath === allowedPath) {
            isAllowedPath = true
            break
          }
        }
        
        if (isAllowedPath) {
          console.log(`[${ourSessionId}] Auto-approved out-of-scope read (allowed path):`, requestPath)
          return { kind: 'approved' }
        }
        
        isOutOfScope = true
        outOfScopePath = requestPath
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
  
  // For URL requests (web_fetch), check allowlist/denylist
  if (request.kind === 'url') {
    const requestUrl = req.url as string | undefined
    if (requestUrl) {
      try {
        const urlObj = new URL(requestUrl)
        const hostname = urlObj.hostname
        
        // Get URL allowlist and denylist from store
        const allowedUrls = new Set(store.get('allowedUrls') as string[] || [])
        const deniedUrls = new Set(store.get('deniedUrls') as string[] || [])
        
        // Check denylist first (takes precedence)
        if (deniedUrls.has(hostname)) {
          console.log(`[${ourSessionId}] URL denied (denylist):`, hostname)
          return { kind: 'denied-by-rules' }
        }
        
        // Check if hostname or parent domain is in allowlist
        const hostParts = hostname.split('.')
        let isAllowed = allowedUrls.has(hostname)
        // Check parent domains (e.g., docs.github.com matches github.com)
        for (let i = 1; i < hostParts.length - 1 && !isAllowed; i++) {
          const parentDomain = hostParts.slice(i).join('.')
          if (allowedUrls.has(parentDomain)) {
            isAllowed = true
          }
        }
        
        if (isAllowed) {
          console.log(`[${ourSessionId}] URL auto-approved (allowlist):`, hostname)
          return { kind: 'approved' }
        }
        
        console.log(`[${ourSessionId}] URL needs approval:`, hostname)
      } catch (e) {
        console.log(`[${ourSessionId}] Invalid URL, needs approval:`, requestUrl)
      }
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
    pendingPermissions.set(requestId, { resolve, request, executable, sessionId: ourSessionId, outOfScopePath })
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
  
  // Generate session ID upfront so we can pass it to browser tools
  const generatedSessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  
  // Create browser tools and screenshot tool for this session
  const browserTools = createBrowserTools(generatedSessionId)
  const screenshotTool = createScreenshotTool(sessionCwd)
  console.log(`[${generatedSessionId}] Registering ${browserTools.length + 1} tools:`, [...browserTools.map(t => t.name), screenshotTool.name])
  
  const newSession = await client.createSession({
    sessionId: generatedSessionId,
    model: sessionModel,
    mcpServers: mcpConfig.mcpServers,
    tools: [...browserTools, screenshotTool],
    onPermissionRequest: (request, invocation) => handlePermissionRequest(request, invocation, newSession.sessionId),
    systemMessage: {
      mode: 'append',
      content: `
## Web Information Lookup

You have access to the \`web_fetch\` tool. Use it when:
- User explicitly asks you to look something up online
- User provides a specific URL to read
- You need current documentation for a library/API the user is working with
- Information is likely outdated (release notes, changelogs, current versions)

When fetching, prefer official/authoritative sources (official docs, GitHub, npm, PyPI, etc.).
The user will be prompted to approve each new domain you access.

## Browser Automation

You have access to browser automation tools (browser_navigate, browser_click, browser_fill, etc.). Use these when:
- User asks you to interact with a website
- User needs to perform web automation tasks (fill forms, click buttons, etc.)
- User wants to log into a web service
- User needs to extract information from a web page that requires interaction

The browser window will be visible to the user. Login sessions persist between runs, so users won't need to re-login each time.
Browser tools available: browser_navigate, browser_click, browser_fill, browser_type, browser_press_key, browser_screenshot, browser_get_text, browser_get_html, browser_wait_for_element, browser_get_page_info, browser_select_option, browser_checkbox, browser_scroll, browser_go_back, browser_reload, browser_get_links, browser_get_form_inputs, browser_close.

## Screenshot Tool

You have access to the \`take_screenshot\` tool. Use it to capture visual evidence of UI features or application state.
- Call with \`list_windows: true\` to see available windows
- Call with \`window: "Window Name"\` to capture a specific window
- Call with no arguments to capture the entire screen
`
    },
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
      const currentSessionState = sessions.get(sessionId)
      if (currentSessionState) currentSessionState.isProcessing = false
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
    } else if (event.type === 'session.usage_info') {
      mainWindow.webContents.send('copilot:usageInfo', { 
        sessionId,
        tokenLimit: event.data.tokenLimit,
        currentTokens: event.data.currentTokens,
        messagesLength: event.data.messagesLength
      })
    } else if (event.type === 'session.compaction_start') {
      console.log(`[${sessionId}] Compaction started`)
      mainWindow.webContents.send('copilot:compactionStart', { sessionId })
    } else if (event.type === 'session.compaction_complete') {
      console.log(`[${sessionId}] Compaction complete:`, event.data)
      mainWindow.webContents.send('copilot:compactionComplete', { 
        sessionId,
        success: event.data.success,
        preCompactionTokens: event.data.preCompactionTokens,
        postCompactionTokens: event.data.postCompactionTokens,
        tokensRemoved: event.data.tokensRemoved,
        summaryContent: event.data.summaryContent,
        error: event.data.error
      })
    }
  })
  
  sessions.set(sessionId, { session: newSession, client, model: sessionModel, cwd: sessionCwd, alwaysAllowed: new Set(), allowedPaths: new Set(), isProcessing: false })
  activeSessionId = sessionId
  
  // Persist session cwd so it can be restored when resuming from history
  const sessionCwds = store.get('sessionCwds') as Record<string, string> || {}
  sessionCwds[sessionId] = sessionCwd
  store.set('sessionCwds', sessionCwds)
  
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
    
    // Get stored session cwds for previous sessions
    const sessionCwds = store.get('sessionCwds') as Record<string, string> || {}
    
    // Build list of previous sessions (all sessions not in our open list)
    const previousSessions = allSessions
      .filter(s => !openSessionIds.includes(s.sessionId))
      .map(s => ({ sessionId: s.sessionId, name: s.summary || undefined, modifiedTime: s.modifiedTime.toISOString(), cwd: sessionCwds[s.sessionId] }))
    
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
        
        // Create screenshot tool for this session
        const screenshotTool = createScreenshotTool(sessionCwd)
        
        const session = await client.resumeSession(sessionId, {
          mcpServers: mcpConfig.mcpServers,
          tools: [...createBrowserTools(sessionId), screenshotTool],
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
            const currentSessionState = sessions.get(sessionId)
            if (currentSessionState) currentSessionState.isProcessing = false
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
        sessions.set(sessionId, { session, client, model: sessionModel, cwd: sessionCwd, alwaysAllowed: alwaysAllowedSet, allowedPaths: new Set(), isProcessing: false })
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
        models: getVerifiedModels()
      })
    }
    
    // Verify available models in background (non-blocking)
    verifyAvailableModels(defaultClient).then(verifiedModels => {
      // Notify frontend of updated model list after verification
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('copilot:modelsVerified', { models: verifiedModels })
      }
    }).catch(err => {
      console.error('Model verification failed:', err)
    })
    
    // Start keep-alive timer to prevent session timeouts
    startKeepAlive()
  } catch (err) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('copilot:error', String(err))
    }
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 750,
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
ipcMain.handle('copilot:send', async (_event, data: { sessionId: string, prompt: string, attachments?: { type: 'file'; path: string; displayName?: string }[] }) => {
  const sessionState = sessions.get(data.sessionId)
  if (!sessionState) {
    throw new Error(`Session not found: ${data.sessionId}`)
  }
  
  sessionState.isProcessing = true
  
  const messageOptions = {
    prompt: data.prompt,
    attachments: data.attachments
  }
  
  try {
    const messageId = await sessionState.session.send(messageOptions)
    return messageId
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    // Check if session was disconnected/timed out
    if (errorMessage.includes('Session not found') || errorMessage.includes('session.send failed')) {
      log.warn(`[${data.sessionId}] Session appears disconnected, attempting to resume...`)
      
      try {
        // Try to resume the session
        await resumeDisconnectedSession(data.sessionId, sessionState)
        
        // Retry the send
        const messageId = await sessionState.session.send(messageOptions)
        log.info(`[${data.sessionId}] Successfully sent message after session resume`)
        return messageId
      } catch (resumeError) {
        log.error(`[${data.sessionId}] Failed to resume session:`, resumeError)
        sessionState.isProcessing = false
        throw new Error(`Session disconnected and could not be resumed. Please try again.`)
      }
    }
    
    sessionState.isProcessing = false
    throw error
  }
})

ipcMain.handle('copilot:sendAndWait', async (_event, data: { sessionId: string, prompt: string, attachments?: { type: 'file'; path: string; displayName?: string }[] }) => {
  const sessionState = sessions.get(data.sessionId)
  if (!sessionState) {
    throw new Error(`Session not found: ${data.sessionId}`)
  }
  
  sessionState.isProcessing = true
  
  const messageOptions = {
    prompt: data.prompt,
    attachments: data.attachments
  }
  
  try {
    const response = await sessionState.session.sendAndWait(messageOptions)
    sessionState.isProcessing = false
    return response?.data?.content || ''
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    // Check if session was disconnected/timed out
    if (errorMessage.includes('Session not found') || errorMessage.includes('session.send failed')) {
      log.warn(`[${data.sessionId}] Session appears disconnected, attempting to resume...`)
      
      try {
        await resumeDisconnectedSession(data.sessionId, sessionState)
        const response = await sessionState.session.sendAndWait(messageOptions)
        sessionState.isProcessing = false
        return response?.data?.content || ''
      } catch (resumeError) {
        log.error(`[${data.sessionId}] Failed to resume session:`, resumeError)
        sessionState.isProcessing = false
        throw new Error(`Session disconnected and could not be resumed. Please try again.`)
      }
    }
    
    sessionState.isProcessing = false
    throw error
  }
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
  
  try {
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    // Check if session was disconnected/timed out
    if (errorMessage.includes('Session not found') || errorMessage.includes('failed')) {
      log.warn(`[${sessionId}] Session appears disconnected, attempting to resume for getMessages...`)
      
      try {
        await resumeDisconnectedSession(sessionId, sessionState)
        const events = await sessionState.session.getMessages()
        
        const messages: { role: 'user' | 'assistant'; content: string }[] = []
        for (const event of events) {
          if (event.type === 'user.message') {
            messages.push({ role: 'user', content: event.data.content })
          } else if (event.type === 'assistant.message') {
            messages.push({ role: 'assistant', content: event.data.content })
          }
        }
        return messages
      } catch (resumeError) {
        log.error(`[${sessionId}] Failed to resume session for getMessages:`, resumeError)
        // Return empty array instead of throwing - messages may not be recoverable
        return []
      }
    }
    
    throw error
  }
})

// Generate a short title for a conversation using AI
ipcMain.handle('copilot:generateTitle', async (_event, data: { conversation: string }) => {
  // Use the default cwd client for title generation
  const defaultClient = await getClientForCwd(process.cwd())
  
  try {
    // Get the best available model for quick tasks
    const quickModel = await getQuickTasksModel(defaultClient)
    
    // Create a temporary session with the cheapest model for title generation
    const tempSession = await defaultClient.createSession({
      model: quickModel,
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
    // Get the best available model for quick tasks
    const quickModel = await getQuickTasksModel(defaultClient)
    
    const tempSession = await defaultClient.createSession({
      model: quickModel,
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

// Detect if a message contains a multi-choice question for the user
// Returns structured options if detected, null otherwise
ipcMain.handle('copilot:detectChoices', async (_event, data: { message: string }) => {
  const defaultClient = await getClientForCwd(process.cwd())
  
  try {
    const quickModel = await getQuickTasksModel(defaultClient)
    
    const tempSession = await defaultClient.createSession({
      model: quickModel,
      systemMessage: {
        mode: 'replace',
        content: `You analyze messages to detect if they ask the user to choose between options.

If the message asks the user to pick from multiple choices, respond with JSON:
{"isChoice":true,"options":[{"id":"short_id","label":"Short Label","description":"Brief description"},...]}

If the message does NOT ask the user to choose, respond with:
{"isChoice":false}

Rules:
- Only detect clear choice questions (e.g., "Which would you prefer?", "Please choose:", "Would you like option A or B?")
- Extract 2-5 options maximum
- Use short, lowercase snake_case ids (e.g., "rebase", "merge", "cancel")
- Labels should be concise (1-3 words)
- Descriptions are optional, keep under 10 words
- Respond with ONLY valid JSON, no markdown, no explanation`
      }
    })
    
    const sessionId = tempSession.sessionId
    // Truncate message if too long
    const truncatedMessage = data.message.length > 2000 ? data.message.slice(-2000) : data.message
    const prompt = `Analyze this message:\n\n${truncatedMessage}`
    const response = await tempSession.sendAndWait({ prompt })
    
    await tempSession.destroy()
    await defaultClient.deleteSession(sessionId)
    
    // Parse the JSON response
    const content = response?.data?.content || ''
    try {
      // Extract JSON from response (handle potential markdown wrapping)
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.isChoice && Array.isArray(parsed.options) && parsed.options.length >= 2) {
          return {
            isChoice: true,
            options: parsed.options.slice(0, 5).map((opt: { id?: string; label?: string; description?: string }) => ({
              id: String(opt.id || '').slice(0, 30),
              label: String(opt.label || opt.id || '').slice(0, 50),
              description: opt.description ? String(opt.description).slice(0, 100) : undefined
            }))
          }
        }
      }
      return { isChoice: false }
    } catch {
      console.warn('Failed to parse choice detection response:', content)
      return { isChoice: false }
    }
  } catch (error) {
    console.error('Failed to detect choices:', error)
    return { isChoice: false }
  }
})

// Handle permission response from renderer
ipcMain.handle('copilot:permissionResponse', async (_event, data: { 
  requestId: string
  decision: 'approved' | 'always' | 'global' | 'denied' 
}) => {
  const pending = pendingPermissions.get(data.requestId)
  if (!pending) {
    console.log('No pending permission for:', data.requestId)
    return { success: false }
  }
  
  pendingPermissions.delete(data.requestId)
  
  // Track "global" for adding to persistent global safe commands
  if (data.decision === 'global') {
    // For URL requests, add to global allowed URLs
    if (pending.request.kind === 'url' && pending.executable.startsWith('url:')) {
      const hostname = pending.executable.replace('url:', '')
      const allowedUrls = store.get('allowedUrls') as string[] || []
      if (!allowedUrls.includes(hostname)) {
        allowedUrls.push(hostname)
        store.set('allowedUrls', allowedUrls)
        console.log(`[${pending.sessionId}] Added to allowed URLs:`, hostname)
      }
    } else {
      // For other commands, add to global safe commands
      const executables = pending.executable.split(', ').filter(e => e.trim())
      const globalSafeCommands = store.get('globalSafeCommands') as string[] || []
      const newCommands = executables.map(exec => normalizeAlwaysAllowed(exec.trim()))
      const updatedCommands = [...new Set([...globalSafeCommands, ...newCommands])]
      store.set('globalSafeCommands', updatedCommands)
      console.log(`[${pending.sessionId}] Added to global safe commands:`, newCommands)
    }
  }
  
  // Track "always allow" for this specific executable in the session
  if (data.decision === 'always') {
    // For URL requests, also add to global allowed URLs (URLs should persist across sessions)
    if (pending.request.kind === 'url' && pending.executable.startsWith('url:')) {
      const hostname = pending.executable.replace('url:', '')
      const allowedUrls = store.get('allowedUrls') as string[] || []
      if (!allowedUrls.includes(hostname)) {
        allowedUrls.push(hostname)
        store.set('allowedUrls', allowedUrls)
        console.log(`[${pending.sessionId}] Added to allowed URLs:`, hostname)
      }
    } else {
      // For other commands, add to session's always allowed
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
  }
  
  // For out-of-scope reads that are approved, remember the parent directory
  if ((data.decision === 'approved' || data.decision === 'always' || data.decision === 'global') && pending.outOfScopePath) {
    const sessionState = sessions.get(pending.sessionId)
    if (sessionState) {
      const parentDir = dirname(pending.outOfScopePath)
      sessionState.allowedPaths.add(parentDir)
      console.log(`[${pending.sessionId}] Added to allowed paths:`, parentDir)
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
  const validModels = getVerifiedModels().map(m => m.id)
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
  return { models: getVerifiedModels(), current: currentModel }
})

// Get model capabilities including vision support
ipcMain.handle('copilot:getModelCapabilities', async (_event, modelId: string) => {
  try {
    if (!defaultClient) {
      return { supportsVision: false }
    }
    const models = await defaultClient.listModels()
    const model = models.find(m => m.id === modelId)
    if (model) {
      return {
        supportsVision: model.capabilities?.supports?.vision ?? false,
        visionLimits: model.capabilities?.limits?.vision ? {
          supportedMediaTypes: model.capabilities.limits.vision.supported_media_types,
          maxPromptImages: model.capabilities.limits.vision.max_prompt_images,
          maxPromptImageSize: model.capabilities.limits.vision.max_prompt_image_size
        } : undefined
      }
    }
    return { supportsVision: false }
  } catch (error) {
    log.error('Failed to get model capabilities:', error)
    return { supportsVision: false }
  }
})

// Save image data URL to temp file for SDK attachment
ipcMain.handle('copilot:saveImageToTemp', async (_event, data: { dataUrl: string, filename: string }) => {
  try {
    const imageDir = join(app.getPath('home'), '.copilot', 'images')
    if (!existsSync(imageDir)) {
      mkdirSync(imageDir, { recursive: true })
    }
    
    // Parse data URL
    const matches = data.dataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (!matches) {
      return { success: false, error: 'Invalid data URL format' }
    }
    
    const buffer = Buffer.from(matches[2], 'base64')
    const filePath = join(imageDir, data.filename)
    
    await writeFile(filePath, buffer)
    return { success: true, path: filePath }
  } catch (error) {
    log.error('Failed to save image to temp:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Fetch image from URL and save to temp
ipcMain.handle('copilot:fetchImageFromUrl', async (_event, url: string) => {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` }
    }
    
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) {
      return { success: false, error: 'URL does not point to an image' }
    }
    
    const buffer = Buffer.from(await response.arrayBuffer())
    const extension = contentType.split('/')[1]?.split(';')[0] || 'png'
    const filename = `image-${Date.now()}.${extension}`
    
    const imageDir = join(app.getPath('home'), '.copilot', 'images')
    if (!existsSync(imageDir)) {
      mkdirSync(imageDir, { recursive: true })
    }
    
    const filePath = join(imageDir, filename)
    await writeFile(filePath, buffer)
    
    // Convert to data URL for preview
    const base64 = buffer.toString('base64')
    const dataUrl = `data:${contentType};base64,${base64}`
    
    return { 
      success: true, 
      path: filePath, 
      dataUrl,
      mimeType: contentType,
      size: buffer.length,
      filename
    }
  } catch (error) {
    log.error('Failed to fetch image from URL:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
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

// Add a command to always-allowed for a session (manual entry)
ipcMain.handle('copilot:addAlwaysAllowed', async (_event, data: { sessionId: string; command: string }) => {
  const sessionState = sessions.get(data.sessionId)
  if (sessionState) {
    const normalized = normalizeAlwaysAllowed(data.command.trim())
    sessionState.alwaysAllowed.add(normalized)
    console.log(`[${data.sessionId}] Manually added to always allow:`, normalized)
  }
  return { success: true }
})

// Get global safe commands
ipcMain.handle('copilot:getGlobalSafeCommands', async () => {
  return store.get('globalSafeCommands') as string[] || []
})

// Add a command to global safe commands
ipcMain.handle('copilot:addGlobalSafeCommand', async (_event, command: string) => {
  const globalSafeCommands = store.get('globalSafeCommands') as string[] || []
  const normalized = normalizeAlwaysAllowed(command.trim())
  if (!globalSafeCommands.includes(normalized)) {
    globalSafeCommands.push(normalized)
    store.set('globalSafeCommands', globalSafeCommands)
    console.log('Added to global safe commands:', normalized)
  }
  return { success: true }
})

// Remove a command from global safe commands
ipcMain.handle('copilot:removeGlobalSafeCommand', async (_event, command: string) => {
  const globalSafeCommands = store.get('globalSafeCommands') as string[] || []
  const updated = globalSafeCommands.filter(c => c !== command)
  store.set('globalSafeCommands', updated)
  console.log('Removed from global safe commands:', command)
  return { success: true }
})

// URL Allowlist/Denylist Management
ipcMain.handle('copilot:getAllowedUrls', async () => {
  return store.get('allowedUrls') as string[] || []
})

ipcMain.handle('copilot:addAllowedUrl', async (_event, url: string) => {
  const allowedUrls = store.get('allowedUrls') as string[] || []
  // Extract hostname if full URL provided
  let hostname = url.trim()
  try {
    if (hostname.includes('://')) {
      hostname = new URL(hostname).hostname
    }
  } catch {
    // Use as-is if not a valid URL
  }
  if (!allowedUrls.includes(hostname)) {
    allowedUrls.push(hostname)
    store.set('allowedUrls', allowedUrls)
    console.log('Added to allowed URLs:', hostname)
  }
  return { success: true, hostname }
})

ipcMain.handle('copilot:removeAllowedUrl', async (_event, url: string) => {
  const allowedUrls = store.get('allowedUrls') as string[] || []
  const updated = allowedUrls.filter(u => u !== url)
  store.set('allowedUrls', updated)
  console.log('Removed from allowed URLs:', url)
  return { success: true }
})

ipcMain.handle('copilot:getDeniedUrls', async () => {
  return store.get('deniedUrls') as string[] || []
})

ipcMain.handle('copilot:addDeniedUrl', async (_event, url: string) => {
  const deniedUrls = store.get('deniedUrls') as string[] || []
  // Extract hostname if full URL provided
  let hostname = url.trim()
  try {
    if (hostname.includes('://')) {
      hostname = new URL(hostname).hostname
    }
  } catch {
    // Use as-is if not a valid URL
  }
  if (!deniedUrls.includes(hostname)) {
    deniedUrls.push(hostname)
    store.set('deniedUrls', deniedUrls)
    console.log('Added to denied URLs:', hostname)
  }
  return { success: true, hostname }
})

ipcMain.handle('copilot:removeDeniedUrl', async (_event, url: string) => {
  const deniedUrls = store.get('deniedUrls') as string[] || []
  const updated = deniedUrls.filter(u => u !== url)
  store.set('deniedUrls', updated)
  console.log('Removed from denied URLs:', url)
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

// Git operations - get actual changed files
ipcMain.handle('git:getChangedFiles', async (_event, data: { cwd: string; files: string[]; includeAll?: boolean }) => {
  try {
    const changedFiles: string[] = []
    
    if (data.includeAll) {
      // Get ALL changed files (staged, unstaged, and untracked)
      const { stdout: status } = await execAsync('git status --porcelain', { cwd: data.cwd })
      for (const line of status.split('\n')) {
        if (line.trim()) {
          // Status format: XY filename (where XY is 2-char status)
          const filename = line.substring(3).trim()
          // Handle renamed files (format: "old -> new")
          const actualFile = filename.includes(' -> ') ? filename.split(' -> ')[1] : filename
          if (actualFile) {
            changedFiles.push(actualFile)
          }
        }
      }
    } else {
      // Check which of the provided files actually have changes
      for (const file of data.files) {
        // Check if file has staged or unstaged changes
        const { stdout: status } = await execAsync(`git status --porcelain -- "${file}"`, { cwd: data.cwd })
        if (status.trim()) {
          changedFiles.push(file)
        }
      }
    }
    
    return { success: true, files: changedFiles }
  } catch (error) {
    console.error('Git getChangedFiles failed:', error)
    return { success: false, files: [], error: String(error) }
  }
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
ipcMain.handle('git:commitAndPush', async (_event, data: { cwd: string; files: string[]; message: string; mergeToMain?: boolean }) => {
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
    
    // If mergeToMain is requested and not already on main/master
    if (data.mergeToMain && !isMainBranch && currentBranch) {
      console.log(`Merging ${currentBranch} to ${targetBranch}...`)
      
      // Check if we're in a worktree by comparing git-dir and git-common-dir
      const { stdout: gitDir } = await execAsync('git rev-parse --git-dir', { cwd: data.cwd })
      const { stdout: commonDir } = await execAsync('git rev-parse --git-common-dir', { cwd: data.cwd })
      const isWorktree = gitDir.trim() !== commonDir.trim()
      
      // Get the main repository path (where main/master is checked out)
      let mainRepoPath = data.cwd
      if (isWorktree) {
        // commonDir points to the .git folder of the main repo
        // The main repo is one level up from the .git folder
        const commonDirPath = commonDir.trim()
        mainRepoPath = dirname(commonDirPath)
      }
      
      if (isWorktree) {
        // For worktrees, run merge commands from the main repo
        // Pull latest on main in the main repo
        try {
          await execAsync('git pull', { cwd: mainRepoPath })
        } catch {
          // Ignore pull errors
        }
        
        // Fetch latest to ensure we have origin's main
        try {
          await execAsync('git fetch origin', { cwd: data.cwd })
        } catch {
          // Ignore fetch errors
        }
        
        // Get HEAD before merge to detect if sync brought in changes
        const { stdout: headBefore } = await execAsync('git rev-parse HEAD', { cwd: data.cwd })
        
        // Merge main into the feature branch first (in the worktree) to ensure it's up-to-date
        // This prevents losing changes when the feature branch was based on an older main
        try {
          await execAsync(`git merge origin/${targetBranch}`, { cwd: data.cwd })
          console.log(`Merged ${targetBranch} into ${currentBranch} to sync`)
        } catch (mergeError) {
          const errorMsg = String(mergeError)
          if (errorMsg.includes('CONFLICT')) {
            throw new Error(`Merge conflicts detected when syncing '${targetBranch}' into '${currentBranch}'. Please resolve conflicts first.`)
          }
          // Continue if no conflicts - branch might already be up to date
        }
        
        // Get HEAD after merge to check if changes were brought in
        const { stdout: headAfter } = await execAsync('git rev-parse HEAD', { cwd: data.cwd })
        const syncBroughtChanges = headBefore.trim() !== headAfter.trim()
        
        // Push the updated feature branch
        try {
          await execAsync('git push', { cwd: data.cwd })
        } catch {
          // Ignore - might already be up to date
        }
        
        // If sync brought in changes, return early so user can test before merging
        if (syncBroughtChanges) {
          // Get list of files that were changed by the merge
          let incomingFiles: string[] = []
          try {
            const { stdout: diffFiles } = await execAsync(`git diff --name-only ${headBefore.trim()} ${headAfter.trim()}`, { cwd: data.cwd })
            incomingFiles = diffFiles.trim().split('\n').filter(f => f)
          } catch {
            // Ignore errors
          }
          
          return { 
            success: true, 
            mergedToMain: false, 
            finalBranch: currentBranch,
            mainSyncedWithChanges: true,
            incomingFiles
          }
        }
        
        // Merge the feature branch into main (from the main repo)
        await execAsync(`git merge ${currentBranch}`, { cwd: mainRepoPath })
        console.log(`Merged ${currentBranch} into ${targetBranch}`)
        
        // Push main/master from the main repo
        await execAsync('git push', { cwd: mainRepoPath })
        console.log(`Pushed ${targetBranch} to origin`)
      } else {
        // Standard flow for non-worktree repos
        // Switch to main/master
        await execAsync(`git checkout ${targetBranch}`, { cwd: data.cwd })
        console.log(`Switched to ${targetBranch}`)
        
        // Pull latest
        try {
          await execAsync('git pull', { cwd: data.cwd })
        } catch {
          // Ignore pull errors
        }
        
        // Merge the feature branch
        await execAsync(`git merge ${currentBranch}`, { cwd: data.cwd })
        console.log(`Merged ${currentBranch} into ${targetBranch}`)
        
        // Push main/master
        await execAsync('git push', { cwd: data.cwd })
        console.log(`Pushed ${targetBranch} to origin`)
      }
      
      return { success: true, mergedToMain: true, finalBranch: targetBranch }
    }
    
    return { success: true, mergedToMain: false, finalBranch: currentBranch }
  } catch (error) {
    console.error('Git commit/push failed:', error)
    return { success: false, error: String(error) }
  }
})

// Git operations - check for uncommitted/unpushed changes
ipcMain.handle('git:getWorkingStatus', async (_event, cwd: string) => {
  try {
    // Check for uncommitted changes
    const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd })
    const hasUncommittedChanges = statusOutput.trim().length > 0
    
    // Check for unpushed commits
    let hasUnpushedCommits = false
    try {
      const { stdout: branch } = await execAsync('git branch --show-current', { cwd })
      const branchName = branch.trim()
      if (branchName) {
        // Check if branch has an upstream
        try {
          const { stdout: unpushed } = await execAsync(`git log origin/${branchName}..${branchName} --oneline`, { cwd })
          hasUnpushedCommits = unpushed.trim().length > 0
        } catch {
          // No upstream branch, check if there are any commits at all
          try {
            const { stdout: allCommits } = await execAsync('git log --oneline -1', { cwd })
            hasUnpushedCommits = allCommits.trim().length > 0
          } catch {
            hasUnpushedCommits = false
          }
        }
      }
    } catch {
      // Ignore branch errors
    }
    
    return { 
      success: true, 
      hasUncommittedChanges, 
      hasUnpushedCommits 
    }
  } catch (error) {
    console.error('Git status check failed:', error)
    return { success: false, hasUncommittedChanges: false, hasUnpushedCommits: false, error: String(error) }
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

// Git operations - check if origin/main is ahead of current branch
ipcMain.handle('git:checkMainAhead', async (_event, cwd: string) => {
  try {
    // Get current branch
    const { stdout: branchOutput } = await execAsync('git branch --show-current', { cwd })
    const currentBranch = branchOutput.trim()
    
    // If already on main/master, no need to check
    if (currentBranch === 'main' || currentBranch === 'master') {
      return { success: true, isAhead: false, commits: [] }
    }
    
    // Determine target main branch
    let targetBranch = 'main'
    try {
      await execAsync('git rev-parse --verify origin/main', { cwd })
    } catch {
      try {
        await execAsync('git rev-parse --verify origin/master', { cwd })
        targetBranch = 'master'
      } catch {
        return { success: true, isAhead: false, commits: [] }
      }
    }
    
    // Fetch latest from origin
    try {
      await execAsync('git fetch origin', { cwd })
    } catch {
      // Ignore fetch errors
    }
    
    // Check if origin/main has commits not in current branch
    const { stdout: aheadCommits } = await execAsync(`git log --oneline HEAD..origin/${targetBranch}`, { cwd })
    const commits = aheadCommits.trim().split('\n').filter(c => c)
    
    return { 
      success: true, 
      isAhead: commits.length > 0, 
      commits,
      targetBranch
    }
  } catch (error) {
    console.error('Git checkMainAhead failed:', error)
    return { success: false, isAhead: false, commits: [], error: String(error) }
  }
})

// Git operations - merge origin/main into current branch
ipcMain.handle('git:mergeMainIntoBranch', async (_event, cwd: string) => {
  try {
    // Check for uncommitted changes
    const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd })
    const hasUncommittedChanges = statusOutput.trim().length > 0

    // Stash changes if needed
    if (hasUncommittedChanges) {
      try {
        await execAsync('git stash push -m "Auto-stash before merging main"', { cwd })
      } catch (stashError) {
        return { success: false, error: `Failed to stash changes: ${String(stashError)}` }
      }
    }

    // Determine target branch (main or master)
    let targetBranch = 'main'
    try {
      await execAsync('git rev-parse --verify origin/main', { cwd })
    } catch {
      try {
        await execAsync('git rev-parse --verify origin/master', { cwd })
        targetBranch = 'master'
      } catch {
        // Pop stash before returning error
        if (hasUncommittedChanges) {
          try { await execAsync('git stash pop', { cwd }) } catch { /* ignore */ }
        }
        return { success: false, error: 'Neither origin/main nor origin/master exists' }
      }
    }

    // Fetch latest
    try {
      await execAsync('git fetch origin', { cwd })
    } catch {
      // Ignore fetch errors
    }

    // Merge origin/main into current branch
    try {
      await execAsync(`git merge origin/${targetBranch}`, { cwd })
    } catch (mergeError) {
      const errorMsg = String(mergeError)
      // Pop stash before returning error
      if (hasUncommittedChanges) {
        try { await execAsync('git stash pop', { cwd }) } catch { /* ignore */ }
      }
      if (errorMsg.includes('CONFLICT')) {
        return { success: false, error: `Merge conflicts detected. Please resolve them manually.` }
      }
      return { success: false, error: `Failed to merge origin/${targetBranch}: ${errorMsg}` }
    }

    // Pop the stash to restore changes
    if (hasUncommittedChanges) {
      try {
        await execAsync('git stash pop', { cwd })
      } catch (popError) {
        const errorMsg = String(popError)
        if (errorMsg.includes('CONFLICT')) {
          // Get the list of conflicted files
          let conflictedFiles: string[] = []
          try {
            const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd })
            conflictedFiles = statusOutput
              .split('\n')
              .filter(line => line.startsWith('UU') || line.startsWith('AA') || line.startsWith('DD') || line.startsWith('AU') || line.startsWith('UA') || line.startsWith('DU') || line.startsWith('UD'))
              .map(line => line.slice(3).trim())
          } catch {
            // Ignore status errors
          }
          return { success: true, targetBranch, warning: 'Merged successfully, but conflicts occurred when restoring your changes. Please resolve them.', conflictedFiles }
        }
        // If pop failed for other reasons, try to recover
        return { success: true, targetBranch, warning: 'Merged successfully, but failed to restore stashed changes. Run "git stash pop" manually.' }
      }
    }

    return { success: true, targetBranch }
  } catch (error) {
    console.error('Git mergeMainIntoBranch failed:', error)
    return { success: false, error: String(error) }
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

// Git operations - merge worktree branch to main/master
ipcMain.handle('git:mergeToMain', async (_event, data: { cwd: string; deleteBranch?: boolean }) => {
  try {
    // Get current branch name
    const { stdout: branchOutput } = await execAsync('git branch --show-current', { cwd: data.cwd })
    const currentBranch = branchOutput.trim()
    
    if (!currentBranch) {
      return { success: false, error: 'Not on a branch (detached HEAD)' }
    }
    
    const isMainBranch = currentBranch === 'main' || currentBranch === 'master'
    if (isMainBranch) {
      return { success: false, error: 'Already on main/master branch' }
    }
    
    // Check if we're in a worktree by comparing git-dir and git-common-dir
    const { stdout: gitDir } = await execAsync('git rev-parse --git-dir', { cwd: data.cwd })
    const { stdout: commonDir } = await execAsync('git rev-parse --git-common-dir', { cwd: data.cwd })
    const isWorktree = gitDir.trim() !== commonDir.trim()
    
    // Get the main repository path (where main/master is checked out)
    let mainRepoPath = data.cwd
    if (isWorktree) {
      // commonDir points to the .git folder of the main repo
      // The main repo is one level up from the .git folder
      const commonDirPath = commonDir.trim()
      mainRepoPath = dirname(commonDirPath)
    }
    
    // Determine the target main branch
    let targetBranch = 'main'
    try {
      await execAsync('git rev-parse --verify main', { cwd: data.cwd })
    } catch {
      try {
        await execAsync('git rev-parse --verify master', { cwd: data.cwd })
        targetBranch = 'master'
      } catch {
        return { success: false, error: 'Neither main nor master branch exists' }
      }
    }
    
    // Check for uncommitted changes
    const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: data.cwd })
    if (statusOutput.trim()) {
      return { success: false, error: 'Uncommitted changes exist. Please commit or stash them first.' }
    }
    
    // Push current branch first
    try {
      await execAsync('git push', { cwd: data.cwd })
    } catch (pushError) {
      const errorMsg = String(pushError)
      if (errorMsg.includes('has no upstream branch')) {
        await execAsync(`git push --set-upstream origin ${currentBranch}`, { cwd: data.cwd })
      } else {
        throw pushError
      }
    }
    
    // For worktrees, we need to run merge commands from the main repo
    // because main/master is checked out there
    if (isWorktree) {
      // Check if main repo has uncommitted changes or unresolved conflicts
      const { stdout: mainRepoStatus } = await execAsync('git status --porcelain', { cwd: mainRepoPath })
      if (mainRepoStatus.trim()) {
        const hasConflicts = mainRepoStatus.includes('UU') || mainRepoStatus.includes('AA') || mainRepoStatus.includes('DD')
        if (hasConflicts) {
          return { success: false, error: `Main repository has unresolved merge conflicts. Please resolve conflicts in ${mainRepoPath} first.` }
        }
        return { success: false, error: `Main repository has uncommitted changes. Please commit or stash changes in ${mainRepoPath} first.` }
      }
      
      // Pull latest on main in the main repo
      try {
        await execAsync('git pull', { cwd: mainRepoPath })
      } catch (pullError) {
        const errorMsg = String(pullError)
        if (errorMsg.includes('CONFLICT')) {
          return { success: false, error: `Pull resulted in merge conflicts in ${mainRepoPath}. Please resolve manually.` }
        }
        // Ignore other pull errors (might be a new repo)
      }
      
      // Fetch latest to ensure we have the most recent main
      try {
        await execAsync('git fetch origin', { cwd: data.cwd })
      } catch {
        // Ignore fetch errors
      }
      
      // Rebase feature branch on top of main to incorporate any changes (like version bumps)
      // This ensures merge to main will be clean/fast-forward
      try {
        await execAsync(`git rebase origin/${targetBranch}`, { cwd: data.cwd })
      } catch (rebaseError) {
        const errorMsg = String(rebaseError)
        if (errorMsg.includes('CONFLICT')) {
          // Abort the rebase and return error
          try {
            await execAsync('git rebase --abort', { cwd: data.cwd })
          } catch {
            // Ignore abort errors
          }
          return { success: false, error: `Rebase conflicts detected when updating '${currentBranch}' with changes from ${targetBranch}. Please rebase manually.` }
        }
        // If rebase fails for other reasons, continue with merge attempt
        console.warn('Rebase failed, continuing with direct merge:', errorMsg)
      }
      
      // Force push the rebased branch (since we rebased, history changed)
      try {
        await execAsync(`git push --force-with-lease`, { cwd: data.cwd })
      } catch (pushError) {
        const errorMsg = String(pushError)
        if (errorMsg.includes('has no upstream branch')) {
          await execAsync(`git push --set-upstream origin ${currentBranch}`, { cwd: data.cwd })
        } else {
          // Ignore other push errors, continue with merge
          console.warn('Force push after rebase failed:', errorMsg)
        }
      }
      
      // Merge the feature branch into main (from the main repo) using squash
      // This combines all commits into a single commit
      try {
        await execAsync(`git merge --squash ${currentBranch}`, { cwd: mainRepoPath })
        // Squash merge doesn't auto-commit, so we need to create the commit
        await execAsync(`git commit -m "Merge branch '${currentBranch}'"`, { cwd: mainRepoPath })
      } catch (mergeError) {
        const errorMsg = String(mergeError)
        if (errorMsg.includes('CONFLICT')) {
          return { success: false, error: `Merge conflicts detected when merging '${currentBranch}' into ${targetBranch}. Please resolve conflicts in ${mainRepoPath} manually.` }
        }
        return { success: false, error: `Failed to merge '${currentBranch}': ${errorMsg}` }
      }
      
      // Push main/master from the main repo
      try {
        await execAsync('git push', { cwd: mainRepoPath })
      } catch (pushError) {
        return { success: false, error: `Merge succeeded but push failed: ${String(pushError)}` }
      }
    } else {
      // Standard flow for non-worktree repos
      // Switch to main/master
      try {
        await execAsync(`git checkout ${targetBranch}`, { cwd: data.cwd })
      } catch (checkoutError) {
        return { success: false, error: `Failed to checkout ${targetBranch}: ${String(checkoutError)}` }
      }
      
      // Pull latest
      try {
        await execAsync('git pull', { cwd: data.cwd })
      } catch (pullError) {
        const errorMsg = String(pullError)
        if (errorMsg.includes('CONFLICT')) {
          return { success: false, error: `Pull resulted in merge conflicts. Please resolve manually.` }
        }
        // Ignore other pull errors (might be a new repo)
      }
      
      // Merge the feature branch using squash
      // This combines all commits into a single commit
      try {
        await execAsync(`git merge --squash ${currentBranch}`, { cwd: data.cwd })
        // Squash merge doesn't auto-commit, so we need to create the commit
        await execAsync(`git commit -m "Merge branch '${currentBranch}'"`, { cwd: data.cwd })
      } catch (mergeError) {
        const errorMsg = String(mergeError)
        if (errorMsg.includes('CONFLICT')) {
          return { success: false, error: `Merge conflicts detected when merging '${currentBranch}' into ${targetBranch}. Please resolve conflicts manually.` }
        }
        return { success: false, error: `Failed to merge '${currentBranch}': ${errorMsg}` }
      }
      
      // Push main/master
      try {
        await execAsync('git push', { cwd: data.cwd })
      } catch (pushError) {
        return { success: false, error: `Merge succeeded but push failed: ${String(pushError)}` }
      }
    }
    
    // Optionally delete the feature branch
    if (data.deleteBranch) {
      try {
        await execAsync(`git branch -d ${currentBranch}`, { cwd: mainRepoPath })
        await execAsync(`git push origin --delete ${currentBranch}`, { cwd: mainRepoPath })
      } catch {
        // Ignore branch deletion errors
      }
    }
    
    return { success: true, mergedBranch: currentBranch, targetBranch }
  } catch (error) {
    console.error('Git merge to main failed:', error)
    return { success: false, error: String(error) }
  }
})

// Git operations - create pull request via gh CLI
ipcMain.handle('git:createPullRequest', async (_event, data: { cwd: string; title?: string; draft?: boolean }) => {
  try {
    // Check if gh CLI is available
    try {
      await execAsync('gh --version', { cwd: data.cwd })
    } catch {
      return { success: false, error: 'GitHub CLI (gh) is not installed. Install it from https://cli.github.com/' }
    }
    
    // Get current branch name
    const { stdout: branchOutput } = await execAsync('git branch --show-current', { cwd: data.cwd })
    const currentBranch = branchOutput.trim()
    
    if (!currentBranch) {
      return { success: false, error: 'Not on a branch (detached HEAD)' }
    }
    
    const isMainBranch = currentBranch === 'main' || currentBranch === 'master'
    if (isMainBranch) {
      return { success: false, error: 'Cannot create PR from main/master branch' }
    }
    
    // Check for uncommitted changes
    const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: data.cwd })
    if (statusOutput.trim()) {
      return { success: false, error: 'Uncommitted changes exist. Please commit them first.' }
    }
    
    // Push current branch
    try {
      await execAsync('git push', { cwd: data.cwd })
    } catch (pushError) {
      const errorMsg = String(pushError)
      if (errorMsg.includes('has no upstream branch')) {
        await execAsync(`git push --set-upstream origin ${currentBranch}`, { cwd: data.cwd })
      } else {
        throw pushError
      }
    }
    
    // Get remote URL to construct PR URL
    const { stdout: remoteUrl } = await execAsync('git remote get-url origin', { cwd: data.cwd })
    const remote = remoteUrl.trim()
    
    // Parse GitHub URL from remote (handles both HTTPS and SSH formats)
    let repoPath = ''
    if (remote.startsWith('git@github.com:')) {
      repoPath = remote.replace('git@github.com:', '').replace(/\.git$/, '')
    } else if (remote.includes('github.com')) {
      const match = remote.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/)
      repoPath = match ? match[1] : ''
    }
    
    if (!repoPath) {
      return { success: false, error: 'Could not parse GitHub repository from remote URL' }
    }
    
    // Construct PR creation URL - GitHub will auto-fill the form
    const title = data.title || currentBranch.replace(/[-_]/g, ' ')
    const encodedTitle = encodeURIComponent(title)
    const prUrl = `https://github.com/${repoPath}/compare/main...${currentBranch}?quick_pull=1&title=${encodedTitle}`
    
    return { success: true, prUrl, branch: currentBranch }
  } catch (error) {
    console.error('Create PR failed:', error)
    return { success: false, error: String(error) }
  }
})

// Resume a previous session (from the history list)
ipcMain.handle('copilot:resumePreviousSession', async (_event, sessionId: string, cwd?: string) => {
  // Check if already resumed
  if (sessions.has(sessionId)) {
    const sessionState = sessions.get(sessionId)!
    return { sessionId, model: sessionState.model, cwd: sessionState.cwd, alreadyOpen: true }
  }
  
  const sessionModel = store.get('model') as string || 'gpt-5.2'
  // Use provided cwd, or look up stored cwd, or fall back to default
  const sessionCwds = store.get('sessionCwds') as Record<string, string> || {}
  const defaultCwd = app.isPackaged ? app.getPath('home') : process.cwd()
  const sessionCwd = cwd || sessionCwds[sessionId] || defaultCwd
  
  // Get or create client for this cwd
  const client = await getClientForCwd(sessionCwd)
  
  // Load MCP servers config
  const mcpConfig = await readMcpConfig()
  
  // Create screenshot tool for this session
  const screenshotTool = createScreenshotTool(sessionCwd)
  
  const session = await client.resumeSession(sessionId, {
    mcpServers: mcpConfig.mcpServers,
    tools: [...createBrowserTools(sessionId), screenshotTool],
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
      const currentSessionState = sessions.get(sessionId)
      if (currentSessionState) currentSessionState.isProcessing = false
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
    } else if (event.type === 'session.usage_info') {
      mainWindow.webContents.send('copilot:usageInfo', { 
        sessionId,
        tokenLimit: event.data.tokenLimit,
        currentTokens: event.data.currentTokens,
        messagesLength: event.data.messagesLength
      })
    } else if (event.type === 'session.compaction_start') {
      console.log(`[${sessionId}] Compaction started`)
      mainWindow.webContents.send('copilot:compactionStart', { sessionId })
    } else if (event.type === 'session.compaction_complete') {
      console.log(`[${sessionId}] Compaction complete:`, event.data)
      mainWindow.webContents.send('copilot:compactionComplete', { 
        sessionId,
        success: event.data.success,
        preCompactionTokens: event.data.preCompactionTokens,
        postCompactionTokens: event.data.postCompactionTokens,
        tokensRemoved: event.data.tokensRemoved,
        summaryContent: event.data.summaryContent,
        error: event.data.error
      })
    }
  })
  
  sessions.set(sessionId, { session, client, model: sessionModel, cwd: sessionCwd, alwaysAllowed: new Set(), allowedPaths: new Set(), isProcessing: false })
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

// Agent Skills handlers
ipcMain.handle('skills:getAll', async (_event, cwd?: string) => {
  // Use provided cwd or try to get from active session
  let projectCwd = cwd
  if (!projectCwd && sessions.size > 0) {
    // Get cwd from first active session
    const firstSession = sessions.values().next().value
    if (firstSession) {
      projectCwd = firstSession.cwd
    }
  }
  const result = await getAllSkills(projectCwd)
  console.log(`Found ${result.skills.length} skills (${result.errors.length} errors)`)
  return result
})

// Browser session management handlers
ipcMain.handle('browser:hasActive', async () => {
  return { active: browserManager.hasActiveBrowser() }
})

ipcMain.handle('browser:getActiveSessions', async () => {
  return { sessions: browserManager.getActiveBrowserSessions() }
})

ipcMain.handle('browser:close', async (_event, sessionId?: string) => {
  if (sessionId) {
    await browserManager.closeSessionPage(sessionId)
  } else {
    await browserManager.closeBrowser()
  }
  return { success: true }
})

ipcMain.handle('browser:saveState', async () => {
  await browserManager.saveBrowserState()
  return { success: true }
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

// App lifecycle - enforce single instance (skip in dev mode to allow dev and production to run together)
const isDev = !!process.env.ELECTRON_RENDERER_URL
const gotTheLock = isDev ? true : app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  if (!isDev) {
    app.on('second-instance', () => {
      // Focus existing window if someone tries to open a second instance
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
      }
    })
  }

  app.whenReady().then(() => {
    console.log('Baseline models:', AVAILABLE_MODELS.map(m => `${m.name} (${m.multiplier}×)`).join(', '))
    
    // Clean up old cached images (older than 24 hours)
    const imageDir = join(app.getPath('home'), '.copilot', 'images')
    if (existsSync(imageDir)) {
      const now = Date.now()
      const maxAge = 24 * 60 * 60 * 1000 // 24 hours
      try {
        const files = readdirSync(imageDir)
        for (const file of files) {
          const filePath = join(imageDir, file)
          const stats = statSync(filePath)
          if (now - stats.mtimeMs > maxAge) {
            unlinkSync(filePath)
            log.info(`Cleaned up old image: ${file}`)
          }
        }
      } catch (err) {
        log.error('Failed to clean up old images:', err)
      }
    }
    
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
}

app.on('window-all-closed', async () => {
  // Stop keep-alive timer
  stopKeepAlive()
  
  // Close browser and save state
  await browserManager.closeBrowser()
  
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
  // Close all PTY instances
  ptyManager.closeAllPtys()
  
  // Close browser and save state
  await browserManager.closeBrowser()
  
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

// ============================================================================
// Worktree Session Management IPC Handlers
// ============================================================================

// Fetch GitHub issue and generate branch name
ipcMain.handle('worktree:fetchGitHubIssue', async (_event, issueUrl: string) => {
  return worktree.fetchGitHubIssue(issueUrl)
})

// Check git version for worktree support
ipcMain.handle('worktree:checkGitVersion', async () => {
  return worktree.checkGitVersion()
})

// Create a new worktree session
ipcMain.handle('worktree:createSession', async (_event, data: { 
  repoPath: string
  branch: string
}) => {
  return worktree.createWorktreeSession(data.repoPath, data.branch)
})

// Remove a worktree session
ipcMain.handle('worktree:removeSession', async (_event, data: { 
  sessionId: string
  force?: boolean 
}) => {
  return worktree.removeWorktreeSession(data.sessionId, { force: data.force })
})

// List all worktree sessions
ipcMain.handle('worktree:listSessions', async () => {
  return worktree.listWorktreeSessions()
})

// Get a specific session
ipcMain.handle('worktree:getSession', async (_event, sessionId: string) => {
  return worktree.getWorktreeSession(sessionId)
})

// Find session by repo and branch
ipcMain.handle('worktree:findSession', async (_event, data: { repoPath: string; branch: string }) => {
  return worktree.findWorktreeSession(data.repoPath, data.branch)
})

// Switch to a worktree session
ipcMain.handle('worktree:switchSession', async (_event, sessionId: string) => {
  return worktree.switchToWorktreeSession(sessionId)
})

// Prune orphaned and stale sessions
ipcMain.handle('worktree:pruneSessions', async (_event, options?: { 
  dryRun?: boolean
  maxAgeDays?: number 
}) => {
  return worktree.pruneWorktreeSessions(options)
})

// Check for orphaned sessions
ipcMain.handle('worktree:checkOrphaned', async () => {
  return worktree.checkOrphanedSessions()
})

// Recover an orphaned session
ipcMain.handle('worktree:recoverSession', async (_event, sessionId: string) => {
  return worktree.recoverWorktreeSession(sessionId)
})

// Get worktree config
ipcMain.handle('worktree:getConfig', async () => {
  return worktree.getWorktreeConfig()
})

// Update worktree config
ipcMain.handle('worktree:updateConfig', async (_event, updates: Partial<{
  directory: string
  pruneAfterDays: number
  warnDiskThresholdMB: number
}>) => {
  worktree.updateWorktreeConfig(updates)
  return { success: true }
})

// PTY (Terminal) handlers
ipcMain.handle('pty:create', async (_event, data: { sessionId: string; cwd: string }) => {
  return ptyManager.createPty(data.sessionId, data.cwd, mainWindow)
})

ipcMain.handle('pty:write', async (_event, data: { sessionId: string; data: string }) => {
  return ptyManager.writePty(data.sessionId, data.data)
})

ipcMain.handle('pty:resize', async (_event, data: { sessionId: string; cols: number; rows: number }) => {
  return ptyManager.resizePty(data.sessionId, data.cols, data.rows)
})

ipcMain.handle('pty:getOutput', async (_event, sessionId: string) => {
  return ptyManager.getPtyOutput(sessionId)
})

ipcMain.handle('pty:clearBuffer', async (_event, sessionId: string) => {
  return ptyManager.clearPtyBuffer(sessionId)
})

ipcMain.handle('pty:close', async (_event, sessionId: string) => {
  return ptyManager.closePty(sessionId)
})

ipcMain.handle('pty:exists', async (_event, sessionId: string) => {
  return { exists: ptyManager.hasPty(sessionId) }
})

