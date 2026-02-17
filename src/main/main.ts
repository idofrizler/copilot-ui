import {
  app,
  BrowserWindow,
  crashReporter,
  ipcMain,
  shell,
  dialog,
  nativeTheme,
  Menu,
  protocol,
  net,
} from 'electron';
import path, { join, dirname } from 'path';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  copyFileSync,
  statSync,
  unlinkSync,
} from 'fs';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { createServer, Server } from 'http';

const execAsync = promisify(exec);

// Get augmented PATH that includes common CLI tool locations
// This is needed because packaged Electron apps don't inherit the user's shell PATH
const getAugmentedEnv = () => {
  const env = { ...process.env };
  if (process.platform === 'win32') {
    const username = process.env.USERNAME || process.env.USER || '';
    const additionalPaths = [
      'C:\\Program Files\\GitHub CLI',
      'C:\\Program Files (x86)\\GitHub CLI',
      `C:\\Users\\${username}\\AppData\\Local\\GitHub CLI`,
      `C:\\Users\\${username}\\scoop\\shims`,
      'C:\\ProgramData\\chocolatey\\bin',
    ].filter((p) => username || !p.includes('Users'));
    const currentPath = env.PATH || env.Path || '';
    env.PATH = [...additionalPaths, currentPath].filter(Boolean).join(';');
  } else {
    const additionalPaths = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
    env.PATH = [...additionalPaths, env.PATH].filter(Boolean).join(':');
  }
  return env;
};

// Helper for git commands that may trigger hooks - passes full environment including PATH
// This ensures npm, node, etc. are available to pre-commit hooks like husky
const execGitWithEnv = (command: string, options: { cwd: string }) => {
  return execAsync(command, {
    cwd: options.cwd,
    env: getAugmentedEnv(),
  });
};

import {
  CopilotClient,
  CopilotSession,
  CustomAgentConfig,
  PermissionRequest,
  PermissionRequestResult,
  Tool,
} from '@github/copilot-sdk';
import Store from 'electron-store';
import log from 'electron-log/main';
import {
  extractExecutables,
  containsDestructiveCommand,
  getDestructiveExecutables,
  extractFilesToDelete,
} from './utils/extractExecutables';
import * as worktree from './worktree';
import * as ptyManager from './pty';
import * as browserManager from './browser';
import { createBrowserTools } from './browserTools';
import { voiceService } from './voiceService';
import { whisperModelManager } from './whisperModelManager';

// MCP Server Configuration types (matching SDK)
interface MCPServerConfigBase {
  tools: string[];
  type?: string;
  timeout?: number;
}

interface MCPLocalServerConfig extends MCPServerConfigBase {
  type?: 'local' | 'stdio';
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
}

interface MCPRemoteServerConfig extends MCPServerConfigBase {
  type: 'http' | 'sse';
  url: string;
  headers?: Record<string, string>;
}

type MCPServerConfig = MCPLocalServerConfig | MCPRemoteServerConfig;

interface MCPConfigFile {
  mcpServers: Record<string, MCPServerConfig>;
}

// XDG Base Directory helpers - respect standard env vars for config/state isolation
// See: https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html

// Get .copilot config base path - respects XDG_CONFIG_HOME
const getCopilotConfigPath = (): string => {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  if (xdgConfigHome) {
    return join(xdgConfigHome, '.copilot');
  }
  return join(app.getPath('home'), '.copilot');
};

// Get .copilot state base path - respects XDG_STATE_HOME
const getCopilotStatePath = (): string => {
  const xdgStateHome = process.env.XDG_STATE_HOME;
  if (xdgStateHome) {
    return join(xdgStateHome, '.copilot');
  }
  return join(app.getPath('home'), '.copilot');
};

// Get worktree sessions directory - respects COPILOT_SESSIONS_HOME
const getWorktreeSessionsPath = (): string => {
  const sessionsHome = process.env.COPILOT_SESSIONS_HOME;
  if (sessionsHome) {
    return sessionsHome;
  }
  return join(app.getPath('home'), '.copilot-sessions');
};

// Path to MCP config file
const getMcpConfigPath = (): string => join(getCopilotConfigPath(), 'mcp-config.json');

// Copilot folders that are safe to read from without permission (Issue #87)
// These contain session state data (plans, configs) and are low-risk for read-only access
const getSafeCopilotReadPaths = (): string[] => {
  const home = app.getPath('home');
  return [
    getWorktreeSessionsPath(), // Worktree sessions directory
    join(getCopilotStatePath(), 'session-state'), // Session state (plan.md files)
    join(getCopilotConfigPath(), 'skills'), // Personal skills directory
    join(home, '.claude', 'skills'), // Personal Claude skills
    join(home, '.claude', 'commands'), // Legacy Claude commands
    join(home, '.agents', 'skills'), // Personal .agents skills
    join(home, '.config', 'agent', 'skills'), // OpenAI agent skills
  ];
};

// Read MCP config from file
async function readMcpConfig(): Promise<MCPConfigFile> {
  const configPath = getMcpConfigPath();
  try {
    if (!existsSync(configPath)) {
      return { mcpServers: {} };
    }
    const content = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content) as MCPConfigFile;

    // Default tools to ["*"] for servers that don't specify it (matches copilot-cli behavior)
    for (const serverName in parsed.mcpServers) {
      const server = parsed.mcpServers[serverName];
      if (!server.tools) {
        server.tools = ['*'];
      }
    }

    return parsed;
  } catch (error) {
    console.error('Failed to read MCP config:', error);
    return { mcpServers: {} };
  }
}

// Write MCP config to file
async function writeMcpConfig(config: MCPConfigFile): Promise<void> {
  const configPath = getMcpConfigPath();
  const configDir = getCopilotConfigPath();

  // Ensure directory exists
  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true });
  }

  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  console.log('Saved MCP config:', Object.keys(config.mcpServers));
}

// Agent Skills - imported from skills module
import { getAllSkills } from './skills';

// Agent discovery - imported from agents module
import { getAllAgents, parseAgentFrontmatter } from './agents';

// Copilot Instructions - imported from instructions module
import { getAllInstructions, getGitRoot } from './instructions';

// Set up file logging only - no IPC to renderer (causes errors)
log.transports.file.level = 'info';
log.transports.console.level = 'info';

// Crash reporter (local-only)
const crashDumpsDir = join(app.getPath('userData'), 'crash-dumps');
if (!existsSync(crashDumpsDir)) {
  mkdirSync(crashDumpsDir, { recursive: true });
}
app.setPath('crashDumps', crashDumpsDir);
crashReporter.start({
  uploadToServer: false,
});

// Handle EIO errors from terminal disconnection - expected for GUI apps
process.on('uncaughtException', (err) => {
  if (err.message === 'write EIO') {
    log.transports.console.level = false;
    return;
  }
  log.error('Uncaught exception:', err);
  throw err;
});

// Replace console with electron-log
Object.assign(console, log.functions);

// Request user attention with platform-specific visual feedback
function requestUserAttention(): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isFocused()) {
    return;
  }

  if (process.platform === 'darwin') {
    app.dock?.bounce('informational');
  } else {
    // Flash taskbar icon on Windows/Linux for accessibility (deaf users, etc.)
    mainWindow.flashFrame(true);
  }
}

interface StoredSession {
  sessionId: string;
  model: string;
  cwd: string;
  name?: string;
  editedFiles?: string[];
  alwaysAllowed?: string[];
  markedForReview?: boolean;
  reviewNote?: string;
  untrackedFiles?: string[];
  fileViewMode?: 'flat' | 'tree';
  yoloMode?: boolean;
  activeAgentName?: string;
  sourceIssue?: { url: string; number: number; owner: string; repo: string };
}

const DEFAULT_ZOOM_FACTOR = 1;
const MIN_ZOOM_FACTOR = 0.5;
const MAX_ZOOM_FACTOR = 3;
const ZOOM_STEP = 0.1;

const clampZoomFactor = (value: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_ZOOM_FACTOR;
  }
  return Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, value));
};

const broadcastZoomFactor = (zoomFactor: number): void => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('window:zoomChanged', { zoomFactor });
  }
};

// Use separate config file in dev mode to avoid overwriting production settings
// COOPER_DEV_MODE is set by scripts/dev-env.js when running `npm run dev`
const store = new Store({
  name: process.env.COOPER_DEV_MODE === 'true' ? 'config-dev' : 'config',
  defaults: {
    model: 'gpt-5.2',
    openSessions: [] as StoredSession[], // Sessions that were open in our app with their models and cwd
    trustedDirectories: [] as string[], // Directories that are always trusted
    theme: 'system' as string, // Theme preference: 'system', 'light', 'dark', or custom theme id
    zoomFactor: DEFAULT_ZOOM_FACTOR, // Window zoom factor (1 = 100%)
    sessionCwds: {} as Record<string, string>, // Persistent map of sessionId -> cwd (survives session close)
    sessionMarks: {} as Record<string, { markedForReview?: boolean; reviewNote?: string }>, // Persistent mark/note state
    globalSafeCommands: [] as string[], // Globally safe commands that are auto-approved for all sessions
    favoriteModels: [] as string[], // Model IDs marked as favorites (shown at top of model selector)
    hasSeenWelcomeWizard: false as boolean, // Whether user has completed the welcome wizard
    wizardVersion: 0 as number, // Version of wizard shown (bump to re-show wizard after updates)
    installationId: '' as string, // Unique ID for this installation (for telemetry user identification)
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
    deniedUrls: [] as string[],
  },
});

// Get or create a stable installation ID for telemetry
function getInstallationId(): string {
  let installationId = store.get('installationId') as string;
  if (!installationId) {
    // Generate a random UUID-like ID (no PII, just a random identifier)
    installationId = `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 15)}`;
    store.set('installationId', installationId);
  }
  return installationId;
}

// Theme directory for external JSON themes
const themesDir = join(app.getPath('userData'), 'themes');

// Ensure themes directory exists
if (!existsSync(themesDir)) {
  mkdirSync(themesDir, { recursive: true });
}

// Theme validation - matches renderer/themes/types.ts structure
const REQUIRED_COLOR_KEYS = [
  'bg',
  'surface',
  'surfaceHover',
  'border',
  'borderHover',
  'accent',
  'accentHover',
  'accentMuted',
  'text',
  'textMuted',
  'textInverse',
  'success',
  'successMuted',
  'warning',
  'warningMuted',
  'error',
  'errorMuted',
  'scrollbarThumb',
  'scrollbarThumbHover',
  'selection',
  'shadow',
  'shadowStrong',
  'terminalBg',
  'terminalText',
  'terminalCursor',
];

interface ExternalTheme {
  id: string;
  name: string;
  type: 'light' | 'dark';
  colors: Record<string, string>;
  author?: string;
  version?: string;
}

function validateTheme(data: unknown): { valid: boolean; theme?: ExternalTheme } {
  if (!data || typeof data !== 'object') return { valid: false };
  const obj = data as Record<string, unknown>;

  if (typeof obj.id !== 'string' || !obj.id.trim()) return { valid: false };
  if (typeof obj.name !== 'string' || !obj.name.trim()) return { valid: false };
  if (obj.type !== 'light' && obj.type !== 'dark') return { valid: false };
  if (!obj.colors || typeof obj.colors !== 'object') return { valid: false };

  const colors = obj.colors as Record<string, unknown>;
  for (const key of REQUIRED_COLOR_KEYS) {
    if (typeof colors[key] !== 'string') return { valid: false };
  }

  return {
    valid: true,
    theme: {
      id: obj.id as string,
      name: obj.name as string,
      type: obj.type as 'light' | 'dark',
      colors: colors as Record<string, string>,
      author: typeof obj.author === 'string' ? obj.author : undefined,
      version: typeof obj.version === 'string' ? obj.version : undefined,
    },
  };
}

function loadExternalThemes(): { themes: ExternalTheme[]; invalidFiles: string[] } {
  const themes: ExternalTheme[] = [];
  const invalidFiles: string[] = [];

  try {
    const files = readdirSync(themesDir).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      try {
        const content = readFileSync(join(themesDir, file), 'utf-8');
        const data = JSON.parse(content);
        const result = validateTheme(data);

        if (result.valid && result.theme) {
          themes.push(result.theme);
        } else {
          invalidFiles.push(file);
        }
      } catch {
        invalidFiles.push(file);
      }
    }
  } catch (err) {
    console.error('Failed to load external themes:', err);
  }

  return { themes, invalidFiles };
}

let mainWindow: BrowserWindow | null = null;

// Map of cwd -> CopilotClient (one client per unique working directory)
const copilotClients = new Map<string, CopilotClient>();
const inFlightCopilotClients = new Map<string, Promise<CopilotClient>>();

// Resolve CLI path for packaged apps
function getCliPath(): string {
  if (!app.isPackaged) {
    // In dev, the SDK's import.meta.resolve doesn't work in bundled code,
    // and passing index.js would spawn it with Electron (process.execPath)
    // which lacks newer Node.js globals. Use the native platform binary instead.
    const platform = process.platform;
    const arch = process.arch;
    const cliName = platform === 'win32' ? 'copilot.exe' : 'copilot';
    return join(
      __dirname,
      '..',
      '..',
      'node_modules',
      '@github',
      `copilot-${platform}-${arch}`,
      cliName
    );
  }

  // When packaged, the copilot binary is in the unpacked asar
  const platform = process.platform;
  const arch = process.arch;
  const platformArch = `${platform}-${arch}`; // e.g., "darwin-arm64"

  const cliName = platform === 'win32' ? 'copilot.exe' : 'copilot';
  const cliPath = join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    '@github',
    `copilot-${platformArch}`,
    cliName
  );

  console.log(`Using packaged CLI path: ${cliPath}`);
  return cliPath;
}

// Get or create a CopilotClient for the given cwd
async function getClientForCwd(cwd: string): Promise<CopilotClient> {
  const existingClient = copilotClients.get(cwd);
  if (existingClient) {
    return existingClient;
  }

  const inFlightClient = inFlightCopilotClients.get(cwd);
  if (inFlightClient) {
    return inFlightClient;
  }

  const clientPromise = (async () => {
    console.log(`Creating new CopilotClient for cwd: ${cwd}`);
    const cliPath = getCliPath();

    // Use augmented PATH so CLI can find gh for authentication
    const env = getAugmentedEnv();
    if (app.isPackaged) {
      log.info('Using augmented PATH for packaged app');
    }

    const client = new CopilotClient({ cwd, cliPath, env });
    await client.start();
    copilotClients.set(cwd, client);
    return client;
  })();

  inFlightCopilotClients.set(cwd, clientPromise);
  try {
    return await clientPromise;
  } finally {
    inFlightCopilotClients.delete(cwd);
  }
}

// Check CLI installation and authentication status
async function checkCliStatus(): Promise<{
  cliInstalled: boolean;
  authenticated: boolean;
  npmAvailable: boolean;
  error?: string;
}> {
  try {
    // Check if CLI binary exists
    const cliPath = getCliPath();
    const cliInstalled = existsSync(cliPath);

    // Check if npm is available (for potential installation)
    let npmAvailable = false;
    try {
      await execAsync('npm --version', { env: getAugmentedEnv() });
      npmAvailable = true;
    } catch {
      npmAvailable = false;
    }

    // If CLI not installed, can't check auth
    if (!cliInstalled) {
      return { cliInstalled: false, authenticated: false, npmAvailable };
    }

    // Check authentication status by looking for copilot CLI config
    let authenticated = false;
    try {
      const configDir = join(process.env.HOME || process.env.USERPROFILE || '', '.copilot');
      const configPath = join(configDir, 'config.json');
      if (existsSync(configPath)) {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));
        // The copilot CLI stores last_logged_in_user after successful login
        authenticated = !!config.last_logged_in_user?.login;
      }
    } catch (error) {
      log.warn('Failed to check copilot auth status:', error);
    }

    return { cliInstalled, authenticated, npmAvailable };
  } catch (error) {
    log.error('Error checking CLI status:', error);
    return {
      cliInstalled: false,
      authenticated: false,
      npmAvailable: false,
      error: String(error),
    };
  }
}

// Repair corrupted session events (duplicate tool_result bug)
// This can happen when a session is resumed while a tool is executing
// The bug inserts a session.resume event between tool.execution_start and tool.execution_complete
async function repairDuplicateToolResults(sessionId: string): Promise<boolean> {
  const eventsPath = join(getCopilotStatePath(), 'session-state', sessionId, 'events.jsonl');

  try {
    if (!existsSync(eventsPath)) {
      log.warn(`[${sessionId}] Cannot repair: events.jsonl not found`);
      return false;
    }

    const content = await readFile(eventsPath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());
    const linesToRemove = new Set<number>();

    // Parse all events
    const events: Array<{ type: string; data?: { toolCallId?: string }; timestamp?: string }> = [];
    for (const line of lines) {
      try {
        events.push(JSON.parse(line));
      } catch {
        events.push({ type: 'parse_error' });
      }
    }

    // Find session.resume events that are out of order (inserted between tool.execution_start and tool.execution_complete)
    for (let i = 1; i < events.length - 1; i++) {
      const event = events[i];
      if (event.type === 'session.resume') {
        const prevEvent = events[i - 1];
        const nextEvent = events[i + 1];

        // Check if this session.resume is between tool.execution_start and tool.execution_complete
        if (
          prevEvent.type === 'tool.execution_start' &&
          nextEvent.type === 'tool.execution_complete' &&
          prevEvent.data?.toolCallId === nextEvent.data?.toolCallId
        ) {
          log.info(
            `[${sessionId}] Found out-of-order session.resume between tool events at line ${i + 1}`
          );
          linesToRemove.add(i);
        }
      }
    }

    // Track all tool.execution_start events
    const startedToolCalls = new Set<string>();
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (event.type === 'tool.execution_start' && event.data?.toolCallId) {
        startedToolCalls.add(event.data.toolCallId);
      }
    }

    // Check for orphaned tool.execution_complete events (no corresponding start - can happen after compaction)
    const completedToolCalls = new Map<string, number>(); // toolCallId -> line index
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (event.type === 'tool.execution_complete' && event.data?.toolCallId) {
        const toolCallId = event.data.toolCallId;

        // Check if this tool_result has no corresponding tool_use (orphaned after compaction)
        if (!startedToolCalls.has(toolCallId)) {
          log.info(
            `[${sessionId}] Found orphaned tool_result for ${toolCallId} (no matching tool_use, likely compaction corruption)`
          );
          linesToRemove.add(i);
          continue; // Don't also check for duplicates
        }

        // Check for duplicate tool_result events
        if (completedToolCalls.has(toolCallId)) {
          // Duplicate! Keep the later one (more likely to have actual result)
          linesToRemove.add(completedToolCalls.get(toolCallId)!);
          log.info(
            `[${sessionId}] Found duplicate tool_result for ${toolCallId}, marking earlier one for removal`
          );
        }
        completedToolCalls.set(toolCallId, i);
      }
    }

    if (linesToRemove.size === 0) {
      log.info(`[${sessionId}] No corrupted events found`);
      return false;
    }

    // Remove corrupted lines
    const repairedLines = lines.filter((_, i) => !linesToRemove.has(i));
    await writeFile(eventsPath, repairedLines.join('\n') + '\n', 'utf-8');
    log.info(`[${sessionId}] Repaired session: removed ${linesToRemove.size} corrupted events`);
    return true;
  } catch (err) {
    log.error(`[${sessionId}] Failed to repair session:`, err);
    return false;
  }
}

// Multi-session support
interface SessionState {
  session: CopilotSession;
  client: CopilotClient; // Reference to the client for this session
  model: string;
  cwd: string; // Current working directory for the session
  alwaysAllowed: Set<string>; // Per-session always-allowed executables
  allowedPaths: Set<string>; // Per-session allowed out-of-scope paths (parent directories)
  isProcessing: boolean; // Whether the session is currently waiting for a response
  yoloMode: boolean; // Auto-approve all permission requests without prompting
}
const sessions = new Map<string, SessionState>();
let activeSessionId: string | null = null;
let sessionCounter = 0;

// Registers event forwarding from a CopilotSession to the renderer via IPC.
// Used after createSession and resumeSession to wire up the session.
function registerSessionEventForwarding(sessionId: string, session: CopilotSession): void {
  session.on((event) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    log.debug(`[${sessionId}] Event: ${event.type}`);

    if (event.type === 'assistant.message_delta') {
      mainWindow.webContents.send('copilot:delta', { sessionId, content: event.data.deltaContent });
    } else if (event.type === 'assistant.message') {
      mainWindow.webContents.send('copilot:message', { sessionId, content: event.data.content });
    } else if (event.type === 'session.idle') {
      const currentSessionState = sessions.get(sessionId);
      if (currentSessionState) {
        currentSessionState.isProcessing = false;
        log.info(`[${sessionId}] Turn complete (model=${currentSessionState.model})`);
      }
      mainWindow.webContents.send('copilot:idle', { sessionId });
      requestUserAttention();
    } else if (event.type === 'tool.execution_start') {
      log.debug(`[${sessionId}] Tool start: ${event.data.toolName} (${event.data.toolCallId})`);
      mainWindow.webContents.send('copilot:tool-start', {
        sessionId,
        toolCallId: event.data.toolCallId,
        toolName: event.data.toolName,
        input: event.data.arguments || (event.data as Record<string, unknown>),
      });
    } else if (event.type === 'tool.execution_complete') {
      log.debug(`[${sessionId}] Tool end: ${event.data.toolCallId}`);
      const completeData = event.data as Record<string, unknown>;
      mainWindow.webContents.send('copilot:tool-end', {
        sessionId,
        toolCallId: event.data.toolCallId,
        toolName: completeData.toolName,
        input: completeData.arguments || completeData,
        output: event.data.result?.content || completeData.output,
      });
    } else if (event.type === 'session.error') {
      console.log(`[${sessionId}] Session error:`, event.data);
      const errorMessage = event.data?.message || JSON.stringify(event.data);

      // Auto-repair tool_result errors (duplicate or orphaned after compaction)
      if (
        errorMessage.includes('multiple `tool_result` blocks') ||
        errorMessage.includes('each tool_use must have a single result') ||
        errorMessage.includes('unexpected `tool_use_id`') ||
        errorMessage.includes('Each `tool_result` block must have a corresponding `tool_use`')
      ) {
        log.info(`[${sessionId}] Detected tool_result corruption error, attempting auto-repair...`);
        repairDuplicateToolResults(sessionId).then((repaired) => {
          if (repaired) {
            mainWindow?.webContents.send('copilot:error', {
              sessionId,
              message: 'Session repaired. Please resend your last message.',
              isRepaired: true,
            });
          } else {
            mainWindow?.webContents.send('copilot:error', { sessionId, message: errorMessage });
          }
        });
        return;
      }

      mainWindow.webContents.send('copilot:error', { sessionId, message: errorMessage });
    } else if (event.type === 'session.usage_info') {
      mainWindow.webContents.send('copilot:usageInfo', {
        sessionId,
        tokenLimit: event.data.tokenLimit,
        currentTokens: event.data.currentTokens,
        messagesLength: event.data.messagesLength,
      });
    } else if (event.type === 'subagent.selected') {
      mainWindow.webContents.send('copilot:agentSelected', {
        sessionId,
        agentName: event.data.agentName,
        agentDisplayName: event.data.agentDisplayName,
      });
    } else if (event.type === 'subagent.started') {
      console.log(
        `[${sessionId}] 🤖 Subagent started: ${event.data.agentDisplayName} (${event.data.toolCallId})`
      );
      mainWindow.webContents.send('copilot:subagent-started', {
        sessionId,
        toolCallId: event.data.toolCallId,
        agentName: event.data.agentName,
        agentDisplayName: event.data.agentDisplayName,
        agentDescription: event.data.agentDescription,
      });
    } else if (event.type === 'subagent.completed') {
      console.log(
        `[${sessionId}] ✓ Subagent completed: ${event.data.agentName} (${event.data.toolCallId})`
      );
      mainWindow.webContents.send('copilot:subagent-completed', {
        sessionId,
        toolCallId: event.data.toolCallId,
        agentName: event.data.agentName,
      });
    } else if (event.type === 'subagent.failed') {
      console.log(
        `✗ [${sessionId}] Subagent failed: ${event.data.agentName} (${event.data.toolCallId}): ${event.data.error}`
      );
      mainWindow.webContents.send('copilot:subagent-failed', {
        sessionId,
        toolCallId: event.data.toolCallId,
        agentName: event.data.agentName,
        error: event.data.error,
      });
    } else if (event.type === 'session.compaction_start') {
      console.log(`[${sessionId}] Compaction started`);
      mainWindow.webContents.send('copilot:compactionStart', { sessionId });
    } else if (event.type === 'session.compaction_complete') {
      console.log(`[${sessionId}] Compaction complete:`, event.data);
      mainWindow.webContents.send('copilot:compactionComplete', {
        sessionId,
        success: event.data.success,
        preCompactionTokens: event.data.preCompactionTokens,
        postCompactionTokens: event.data.postCompactionTokens,
        tokensRemoved: event.data.tokensRemoved,
        summaryContent: event.data.summaryContent,
        error: event.data.error,
      });
    }
  });
}

// Keep-alive interval (5 minutes) to prevent session timeout
const SESSION_KEEPALIVE_INTERVAL = 5 * 60 * 1000;
let keepAliveTimer: NodeJS.Timeout | null = null;

// Start keep-alive timer for active sessions
function startKeepAlive(): void {
  if (keepAliveTimer) return;

  keepAliveTimer = setInterval(async () => {
    for (const [sessionId, sessionState] of sessions.entries()) {
      // Only ping sessions that are actively processing to avoid noise
      if (!sessionState.isProcessing) continue;

      try {
        // Ping the session by getting messages (lightweight operation)
        await sessionState.session.getMessages();
        log.info(`[${sessionId}] Keep-alive ping successful`);
      } catch (error) {
        log.warn(`[${sessionId}] Keep-alive ping failed:`, error);
        // Session may have timed out on the backend - send idle event to frontend
        // to ensure the UI doesn't stay stuck in "processing" state
        if (mainWindow && !mainWindow.isDestroyed()) {
          log.info(`[${sessionId}] Sending fallback idle event due to session timeout`);
          mainWindow.webContents.send('copilot:idle', { sessionId });
          sessionState.isProcessing = false;
        }
      }
    }
  }, SESSION_KEEPALIVE_INTERVAL);

  log.info('Started session keep-alive timer');
}

// Stop keep-alive timer
function stopKeepAlive(): void {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
    log.info('Stopped session keep-alive timer');
  }
}

// Resume a session that has been disconnected
async function resumeDisconnectedSession(
  sessionId: string,
  sessionState: SessionState
): Promise<CopilotSession> {
  log.info(`[${sessionId}] Attempting to resume disconnected session...`);

  const client = await getClientForCwd(sessionState.cwd);
  const mcpConfig = await readMcpConfig();

  // Create browser tools for resumed session
  const browserTools = createBrowserTools(sessionId);
  log.info(
    `[${sessionId}] Resuming with ${browserTools.length} tools:`,
    browserTools.map((t) => t.name).join(', ')
  );

  const resumedSession = await client.resumeSession(sessionId, {
    mcpServers: mcpConfig.mcpServers,
    tools: browserTools,
    onPermissionRequest: (request, invocation) =>
      handlePermissionRequest(request, invocation, sessionId),
  });

  registerSessionEventForwarding(sessionId, resumedSession);

  // Update session state with new session object
  sessionState.session = resumedSession;
  sessionState.client = client;

  log.info(`[${sessionId}] Session resumed successfully`);
  return resumedSession;
}

// Pending permission requests waiting for user response
const pendingPermissions = new Map<
  string,
  {
    resolve: (result: PermissionRequestResult) => void;
    request: PermissionRequest;
    executable: string;
    sessionId: string;
    outOfScopePath?: string; // Store path for out-of-scope reads to remember parent dir
  }
>();

// Track in-flight permission requests by session+executable to deduplicate parallel requests
const inFlightPermissions = new Map<string, Promise<PermissionRequestResult>>();

let defaultClient: CopilotClient | null = null;

// Early client initialization promise - starts before window load completes
// This saves ~500ms by running client.start() in parallel with window rendering
let earlyClientPromise: Promise<CopilotClient> | null = null;

// Early session resumption - starts resuming stored sessions in parallel with window loading
// This can save several seconds since session resumption involves network calls
interface EarlyResumedSession {
  sessionId: string;
  model: string;
  cwd: string;
  name?: string;
  editedFiles?: string[];
  alwaysAllowed?: string[];
  untrackedFiles?: string[];
  fileViewMode?: 'flat' | 'tree';
  yoloMode?: boolean;
  messages?: { role: 'user' | 'assistant'; content: string }[]; // Pre-loaded messages
  sourceIssue?: { url: string; number: number; owner: string; repo: string };
}
let earlyResumedSessions: EarlyResumedSession[] = [];
let earlyResumptionComplete = false;
let earlyResumptionPromise: Promise<void> | null = null;

function startEarlyClientInit(): void {
  const defaultCwd = app.isPackaged ? app.getPath('home') : process.cwd();
  earlyClientPromise = getClientForCwd(defaultCwd);
  earlyClientPromise.catch((err) => {
    console.error('Early client init failed:', err);
  });
}

// Start resuming stored sessions early - runs in parallel with window loading
async function startEarlySessionResumption(): Promise<void> {
  const openSessions = (store.get('openSessions') as StoredSession[]) || [];
  if (openSessions.length === 0) {
    earlyResumptionComplete = true;
    return;
  }

  try {
    // Wait for client to be ready
    if (!earlyClientPromise) {
      return;
    }
    const client = await earlyClientPromise;

    // Load MCP config
    const mcpConfig = await readMcpConfig();

    // Resume sessions in parallel
    const resumePromises = openSessions.map(async (storedSession) => {
      const {
        sessionId,
        model,
        cwd,
        name,
        editedFiles,
        alwaysAllowed,
        untrackedFiles,
        fileViewMode,
        yoloMode,
        sourceIssue,
      } = storedSession;
      const sessionCwd = cwd || (app.isPackaged ? app.getPath('home') : process.cwd());
      const sessionModel = model || (store.get('model') as string) || 'gpt-5.2';
      const storedAlwaysAllowed = alwaysAllowed || [];

      try {
        // Get or create client for this session's cwd
        const sessionClient = await getClientForCwd(sessionCwd);

        const agentResult = await getAllAgents(undefined, sessionCwd);
        const customAgents: CustomAgentConfig[] = [];
        for (const agent of agentResult.agents) {
          try {
            const content = await readFile(agent.path, 'utf-8');
            const metadata = parseAgentFrontmatter(content);
            customAgents.push({
              name: metadata.name || agent.name,
              displayName: agent.name,
              description: metadata.description,
              tools: null,
              prompt: content,
            });
          } catch (error) {
            log.warn('Failed to load agent prompt:', agent.path, error);
          }
        }
        const session = await sessionClient.resumeSession(sessionId, {
          mcpServers: mcpConfig.mcpServers,
          tools: createBrowserTools(sessionId),
          customAgents,
          onPermissionRequest: (request, invocation) =>
            handlePermissionRequest(request, invocation, sessionId),
        });

        // Set up event handler
        session.on((event) => {
          if (!mainWindow || mainWindow.isDestroyed()) return;

          log.debug(`[${sessionId}] Event: ${event.type}`);

          if (event.type === 'assistant.message_delta') {
            mainWindow.webContents.send('copilot:delta', {
              sessionId,
              content: event.data.deltaContent,
            });
          } else if (event.type === 'assistant.message') {
            mainWindow.webContents.send('copilot:message', {
              sessionId,
              content: event.data.content,
            });
          } else if (event.type === 'session.idle') {
            const currentSessionState = sessions.get(sessionId);
            if (currentSessionState) currentSessionState.isProcessing = false;
            mainWindow.webContents.send('copilot:idle', { sessionId });
            requestUserAttention();
          } else if (event.type === 'tool.execution_start') {
            log.debug(
              `[${sessionId}] Tool start: ${event.data.toolName} (${event.data.toolCallId})`
            );
            mainWindow.webContents.send('copilot:tool-start', {
              sessionId,
              toolCallId: event.data.toolCallId,
              toolName: event.data.toolName,
              input: event.data.arguments || (event.data as Record<string, unknown>),
            });
          } else if (event.type === 'tool.execution_complete') {
            log.debug(`[${sessionId}] Tool end: ${event.data.toolCallId}`);
            const completeData = event.data as Record<string, unknown>;
            mainWindow.webContents.send('copilot:tool-end', {
              sessionId,
              toolCallId: event.data.toolCallId,
              toolName: completeData.toolName,
              input: completeData.arguments || completeData,
              output: event.data.result?.content || completeData.output,
            });
          } else if (event.type === 'subagent.selected') {
            mainWindow.webContents.send('copilot:agentSelected', {
              sessionId,
              agentName: event.data.agentName,
              agentDisplayName: event.data.agentDisplayName,
            });
          } else if (event.type === 'subagent.started') {
            console.log(
              `[${sessionId}] 🤖 Subagent started: ${event.data.agentDisplayName} (${event.data.toolCallId})`
            );
            mainWindow.webContents.send('copilot:subagent-started', {
              sessionId,
              toolCallId: event.data.toolCallId,
              agentName: event.data.agentName,
              agentDisplayName: event.data.agentDisplayName,
              agentDescription: event.data.agentDescription,
            });
          } else if (event.type === 'subagent.completed') {
            console.log(
              `[${sessionId}] ✓ Subagent completed: ${event.data.agentName} (${event.data.toolCallId})`
            );
            mainWindow.webContents.send('copilot:subagent-completed', {
              sessionId,
              toolCallId: event.data.toolCallId,
              agentName: event.data.agentName,
            });
          } else if (event.type === 'subagent.failed') {
            console.log(
              `✗ [${sessionId}] Subagent failed: ${event.data.agentName} (${event.data.toolCallId}): ${event.data.error}`
            );
            mainWindow.webContents.send('copilot:subagent-failed', {
              sessionId,
              toolCallId: event.data.toolCallId,
              agentName: event.data.agentName,
              error: event.data.error,
            });
          }
        });

        // Store in sessions map
        const alwaysAllowedSet = new Set(storedAlwaysAllowed.map(normalizeAlwaysAllowed));
        sessions.set(sessionId, {
          session,
          client: sessionClient,
          model: sessionModel,
          cwd: sessionCwd,
          alwaysAllowed: alwaysAllowedSet,
          allowedPaths: new Set(),
          isProcessing: false,
          yoloMode: yoloMode || false,
        });

        console.log(`Early resumed session ${sessionId}`);

        // Pre-load messages while we're at it (saves another network round-trip later)
        let messages: { role: 'user' | 'assistant'; content: string }[] = [];
        try {
          const events = await session.getMessages();
          for (const event of events) {
            if (event.type === 'user.message') {
              messages.push({ role: 'user', content: event.data.content });
            } else if (event.type === 'assistant.message') {
              messages.push({ role: 'assistant', content: event.data.content });
            }
          }
          console.log(`Pre-loaded ${messages.length} messages for session ${sessionId}`);
        } catch (msgError) {
          console.error(`Failed to pre-load messages for ${sessionId}:`, msgError);
        }

        const resumed: EarlyResumedSession = {
          sessionId,
          model: sessionModel,
          cwd: sessionCwd,
          name,
          editedFiles: editedFiles || [],
          alwaysAllowed: storedAlwaysAllowed,
          untrackedFiles: untrackedFiles || [],
          fileViewMode: fileViewMode || 'flat',
          yoloMode: yoloMode || false,
          messages,
          sourceIssue,
        };
        earlyResumedSessions.push(resumed);

        // If window is ready, notify it immediately
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('copilot:sessionResumed', { session: resumed });
        }

        return resumed;
      } catch (error) {
        // Session doesn't exist anymore - remove it from stored openSessions
        const currentOpenSessions = (store.get('openSessions') as StoredSession[]) || [];
        const filteredSessions = currentOpenSessions.filter((s) => s.sessionId !== sessionId);
        if (filteredSessions.length !== currentOpenSessions.length) {
          store.set('openSessions', filteredSessions);
          console.log(`Removed stale session ${sessionId} from openSessions`);
        }
        return null;
      }
    });

    await Promise.all(resumePromises);
  } catch (error) {
    console.error('Early session resumption failed:', error);
  } finally {
    earlyResumptionComplete = true;
  }
}

// Model info with multipliers
interface ModelInfo {
  id: string;
  name: string;
  multiplier: number;
  source?: 'api' | 'fallback'; // 'api' = from listModels(), 'fallback' = hardcoded (not in API yet)
}

// Baseline models for initial render before API loads
// These provide immediate UI while waiting for the API response
const BASELINE_MODELS: ModelInfo[] = [
  { id: 'gpt-4.1', name: 'GPT-4.1', multiplier: 0, source: 'api' },
  { id: 'gpt-5-mini', name: 'GPT-5 mini', multiplier: 0, source: 'api' },
  { id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5', multiplier: 0.33, source: 'api' },
  { id: 'gpt-5.1-codex-mini', name: 'GPT-5.1-Codex-Mini', multiplier: 0.33, source: 'api' },
  { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', multiplier: 1, source: 'api' },
  { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', multiplier: 1, source: 'api' },
  { id: 'gpt-5.2-codex', name: 'GPT-5.2-Codex', multiplier: 1, source: 'api' },
  { id: 'gpt-5.1-codex-max', name: 'GPT-5.1-Codex-Max', multiplier: 1, source: 'api' },
  { id: 'gpt-5.1-codex', name: 'GPT-5.1-Codex', multiplier: 1, source: 'api' },
  { id: 'gpt-5.2', name: 'GPT-5.2', multiplier: 1, source: 'api' },
  { id: 'gpt-5.1', name: 'GPT-5.1', multiplier: 1, source: 'api' },
  { id: 'gpt-5', name: 'GPT-5', multiplier: 1, source: 'api' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (Preview)', multiplier: 1, source: 'api' },
  { id: 'claude-opus-4.5', name: 'Claude Opus 4.5', multiplier: 3, source: 'api' },
];

// Fallback models that work but aren't returned by listModels() API yet
// These should be removed once the API returns them
// Note: multiplier is estimated, actual cost may differ
const FALLBACK_MODELS: ModelInfo[] = [
  { id: 'claude-opus-4.6', name: 'Claude Opus 4.6', multiplier: 3, source: 'fallback' },
  { id: 'claude-opus-4.6-fast', name: 'Claude Opus 4.6 (fast)', multiplier: 3, source: 'fallback' },
];

// Cache for verified models (models confirmed available for current user)
interface VerifiedModelsCache {
  models: ModelInfo[];
  timestamp: number;
}
let verifiedModelsCache: VerifiedModelsCache | null = null;
const MODEL_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Returns verified models, using cache if valid
function getVerifiedModels(): ModelInfo[] {
  if (verifiedModelsCache && Date.now() - verifiedModelsCache.timestamp < MODEL_CACHE_TTL) {
    return verifiedModelsCache.models;
  }
  // If no cache, return baseline + fallback models (API models load async)
  return [...BASELINE_MODELS, ...FALLBACK_MODELS];
}

// Fetch models from API and merge with fallback models
// API models are source of truth; fallback models added if not already in API response
async function verifyAvailableModels(client: CopilotClient): Promise<ModelInfo[]> {
  console.log('Fetching models from API...');

  try {
    const apiModels = await client.listModels();

    console.log(`API returned ${apiModels.length} models`);

    // Convert API response to ModelInfo, sorted by multiplier (low to high)
    const models: ModelInfo[] = apiModels
      .map((m) => {
        // Extract billing multiplier with runtime check
        const billing = (m as { billing?: { multiplier?: number } }).billing;
        const multiplier = typeof billing?.multiplier === 'number' ? billing.multiplier : 1;
        return {
          id: m.id,
          name: m.name || m.id,
          multiplier,
          source: 'api' as const,
        };
      })
      .sort((a, b) => a.multiplier - b.multiplier);

    // Add baseline models that aren't in API response
    const apiIds = new Set(models.map((m) => m.id));
    for (const baseline of BASELINE_MODELS) {
      if (!apiIds.has(baseline.id)) {
        console.log(`Adding baseline model: ${baseline.id} (not in API response)`);
        models.push(baseline);
        apiIds.add(baseline.id);
      }
    }

    // Add fallback models that aren't in API response
    for (const fallback of FALLBACK_MODELS) {
      if (!apiIds.has(fallback.id)) {
        console.log(`Adding fallback model: ${fallback.id} (not in API response)`);
        models.push(fallback);
      }
    }

    // Re-sort after adding fallbacks
    models.sort((a, b) => a.multiplier - b.multiplier);

    verifiedModelsCache = { models, timestamp: Date.now() };
    console.log(
      `Model list complete: ${models.length} models (${apiModels.length} from API, ${models.length - apiModels.length} fallback)`
    );
    return models;
  } catch (error) {
    console.error('Failed to fetch models from API:', error);
    // On error, use baseline + fallback models
    const fallbackList = [...BASELINE_MODELS, ...FALLBACK_MODELS];
    verifiedModelsCache = { models: fallbackList, timestamp: Date.now() };
    return fallbackList;
  }
}

// Preferred models for quick, simple AI tasks (in order of preference)
// These are typically free/cheap models optimized for simple text generation
const QUICK_TASKS_MODEL_PREFERENCES = ['gpt-4.1', 'gpt-5-mini', 'claude-haiku-4.5'];

// Get the best available model for quick tasks from the server's available models
// Falls back to the session's configured model if none of the preferred models are available
async function getQuickTasksModel(client: CopilotClient): Promise<string> {
  const sessionModel = store.get('model') as string;

  try {
    const availableModels = await client.listModels();
    const availableIds = new Set(availableModels.map((m) => m.id));

    // Find the first preferred model that's available
    for (const preferred of QUICK_TASKS_MODEL_PREFERENCES) {
      if (availableIds.has(preferred)) {
        return preferred;
      }
    }

    // Fallback: use the session's configured model
    console.warn(`No preferred quick tasks model available, using session model: ${sessionModel}`);
    return sessionModel;
  } catch (error) {
    console.warn('Failed to list models for quick tasks, using session model:', error);
    return sessionModel;
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
]);

// Normalize stored identifiers so UI/behavior stays stable across versions
function normalizeAlwaysAllowed(id: string): string {
  // Older versions stored `write:<path>`; treat all writes as a single global permission.
  if (id.startsWith('write:')) return 'write';
  return id;
}

// Extract executable identifier from permission request (for "always allow" tracking)
function getExecutableIdentifier(request: PermissionRequest): string {
  const req = request as Record<string, unknown>;

  // For shell commands, extract executables
  if (request.kind === 'shell' && req.fullCommandText) {
    const executables = extractExecutables(req.fullCommandText as string);
    return executables.join(', ') || 'shell';
  }

  // For read, use kind + filename
  if (request.kind === 'read' && req.path) {
    const path = req.path as string;
    const filename = path.split(/[/\\]/).pop() || path;
    return `${request.kind}:${filename}`;
  }

  // For write, treat as global (all file changes)
  if (request.kind === 'write') {
    return 'write';
  }

  // For URL, use kind + hostname
  if (request.kind === 'url' && (request as any).url) {
    try {
      const u = new URL(String((request as any).url));
      return `url:${u.host}`;
    } catch {
      return `url:${String((request as any).url)}`;
    }
  }

  // For MCP, use kind + server/tool
  if (request.kind === 'mcp') {
    const r: any = request as any;
    const tool = r.toolName || r.toolTitle || 'tool';
    const server = r.serverName || 'server';
    return `mcp:${server}/${tool}`;
  }

  // Fallback to kind
  return request.kind;
}

// Permission handler that prompts the user
async function handlePermissionRequest(
  request: PermissionRequest,
  _invocation: { sessionId: string },
  ourSessionId: string
): Promise<PermissionRequestResult> {
  const requestId = request.toolCallId || `perm-${Date.now()}`;
  const req = request as Record<string, unknown>;
  const sessionState = sessions.get(ourSessionId);
  const globalSafeCommands = new Set((store.get('globalSafeCommands') as string[]) || []);

  console.log(`[${ourSessionId}] Permission request:`, request.kind);

  // Yolo mode: auto-approve all requests without prompting
  if (sessionState?.yoloMode) {
    console.log(`[${ourSessionId}] Yolo mode: auto-approved ${request.kind}`);
    return { kind: 'approved' };
  }

  // For shell commands, check each executable individually
  if (request.kind === 'shell' && req.fullCommandText) {
    const commandText = req.fullCommandText as string;
    const executables = extractExecutables(commandText);

    // Check for destructive commands - these NEVER get auto-approved (Issue #65)
    const isDestructive = containsDestructiveCommand(commandText);
    const destructiveExecutables = isDestructive ? getDestructiveExecutables(commandText) : [];
    const filesToDelete = isDestructive ? extractFilesToDelete(commandText) : [];

    if (isDestructive) {
      console.log(
        `[${ourSessionId}] DESTRUCTIVE command detected:`,
        destructiveExecutables,
        'Files:',
        filesToDelete
      );

      if (!mainWindow || mainWindow.isDestroyed()) {
        return { kind: 'denied-no-approval-rule-and-could-not-request-from-user' };
      }

      // Always require explicit permission for destructive commands
      return new Promise((resolve) => {
        pendingPermissions.set(requestId, {
          resolve,
          request,
          executable: destructiveExecutables.join(', '),
          sessionId: ourSessionId,
        });
        mainWindow!.webContents.send('copilot:permission', {
          requestId,
          sessionId: ourSessionId,
          executable: destructiveExecutables.join(', '),
          executables: destructiveExecutables,
          allExecutables: executables,
          isOutOfScope: false,
          isDestructive: true, // Flag for UI to show warning
          filesToDelete, // Issue #101: Show which files will be deleted
          ...request,
        });
        requestUserAttention();
      });
    }

    // Filter to only unapproved executables (exclude globally-auto-approved commands and global safe commands)
    const unapproved = executables.filter(
      (exec) =>
        !GLOBAL_AUTO_APPROVED_SHELL_EXECUTABLES.has(exec) &&
        !globalSafeCommands.has(exec) &&
        !sessionState?.alwaysAllowed.has(exec)
    );

    if (unapproved.length === 0) {
      console.log(`[${ourSessionId}] All executables already approved:`, executables);
      return { kind: 'approved' };
    }

    console.log(`[${ourSessionId}] Need approval for:`, unapproved);

    if (!mainWindow || mainWindow.isDestroyed()) {
      return { kind: 'denied-no-approval-rule-and-could-not-request-from-user' };
    }

    // Log all request fields for debugging
    console.log(`[${ourSessionId}] Full permission request:`, JSON.stringify(request, null, 2));

    // Send to renderer and wait for response - include unapproved list
    return new Promise((resolve) => {
      pendingPermissions.set(requestId, {
        resolve,
        request,
        executable: unapproved.join(', '),
        sessionId: ourSessionId,
      });
      mainWindow!.webContents.send('copilot:permission', {
        requestId,
        sessionId: ourSessionId,
        executable: unapproved.join(', '),
        executables: unapproved, // Array of executables needing approval
        allExecutables: executables, // All executables in command
        isOutOfScope: false,
        isDestructive: false,
        ...request,
      });
      requestUserAttention();
    });
  }

  // Non-shell permissions
  const executable = getExecutableIdentifier(request);

  // Auto-approve global low-risk commands (do not persist/show in UI)
  if (request.kind === 'shell' && GLOBAL_AUTO_APPROVED_SHELL_EXECUTABLES.has(executable)) {
    console.log(`[${ourSessionId}] Auto-approved (global allowlist):`, executable);
    return { kind: 'approved' };
  }

  // Check if in global safe commands
  if (globalSafeCommands.has(executable)) {
    console.log(`[${ourSessionId}] Auto-approved (global safe commands):`, executable);
    return { kind: 'approved' };
  }

  // Check if already allowed (per-session "always")
  if (sessionState?.alwaysAllowed.has(executable)) {
    console.log(`[${ourSessionId}] Auto-approved (always allow):`, executable);
    return { kind: 'approved' };
  }

  // For read requests, check if in-scope (auto-approve) or out-of-scope (need permission)
  let isOutOfScope = false;
  let outOfScopePath: string | undefined;
  if (request.kind === 'read' && sessionState) {
    const requestPath = req.path as string | undefined;
    const sessionCwd = sessionState.cwd;

    if (requestPath) {
      // Check if path is outside the session's working directory
      if (
        !requestPath.startsWith(sessionCwd + '/') &&
        !requestPath.startsWith(sessionCwd + '\\') &&
        requestPath !== sessionCwd
      ) {
        // Check if path is under a previously allowed path
        let isAllowedPath = false;
        for (const allowedPath of sessionState.allowedPaths) {
          if (
            requestPath.startsWith(allowedPath + '/') ||
            requestPath.startsWith(allowedPath + '\\') ||
            requestPath === allowedPath
          ) {
            isAllowedPath = true;
            break;
          }
        }

        if (isAllowedPath) {
          console.log(
            `[${ourSessionId}] Auto-approved out-of-scope read (allowed path):`,
            requestPath
          );
          return { kind: 'approved' };
        }

        // Check if path is in safe Copilot directories (Issue #87)
        // These are low-risk paths containing session state and plans
        const safeCopilotPaths = getSafeCopilotReadPaths();
        for (const safePath of safeCopilotPaths) {
          if (
            requestPath.startsWith(safePath + '/') ||
            requestPath.startsWith(safePath + '\\') ||
            requestPath === safePath
          ) {
            console.log(`[${ourSessionId}] Auto-approved read (safe Copilot path):`, requestPath);
            return { kind: 'approved' };
          }
        }

        isOutOfScope = true;
        outOfScopePath = requestPath;
        console.log(
          `[${ourSessionId}] Out-of-scope read detected:`,
          requestPath,
          'not in',
          sessionCwd
        );
      } else {
        // In-scope reads are auto-approved (like CLI behavior)
        console.log(`[${ourSessionId}] Auto-approved in-scope read:`, requestPath);
        return { kind: 'approved' };
      }
    } else {
      // No path specified - auto-approve reads within trusted workspace
      console.log(`[${ourSessionId}] Auto-approved read (no path, trusted workspace)`);
      return { kind: 'approved' };
    }
  }

  // For URL requests (web_fetch), check allowlist/denylist
  if (request.kind === 'url') {
    const requestUrl = req.url as string | undefined;
    if (requestUrl) {
      try {
        const urlObj = new URL(requestUrl);
        const hostname = urlObj.hostname;

        // Get URL allowlist and denylist from store
        const allowedUrls = new Set((store.get('allowedUrls') as string[]) || []);
        const deniedUrls = new Set((store.get('deniedUrls') as string[]) || []);

        // Check denylist first (takes precedence)
        if (deniedUrls.has(hostname)) {
          console.log(`[${ourSessionId}] URL denied (denylist):`, hostname);
          return { kind: 'denied-by-rules' };
        }

        // Check if hostname or parent domain is in allowlist
        const hostParts = hostname.split('.');
        let isAllowed = allowedUrls.has(hostname);
        // Check parent domains (e.g., docs.github.com matches github.com)
        for (let i = 1; i < hostParts.length - 1 && !isAllowed; i++) {
          const parentDomain = hostParts.slice(i).join('.');
          if (allowedUrls.has(parentDomain)) {
            isAllowed = true;
          }
        }

        if (isAllowed) {
          console.log(`[${ourSessionId}] URL auto-approved (allowlist):`, hostname);
          return { kind: 'approved' };
        }

        console.log(`[${ourSessionId}] URL needs approval:`, hostname);
      } catch (e) {
        console.log(`[${ourSessionId}] Invalid URL, needs approval:`, requestUrl);
      }
    }
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    return { kind: 'denied-no-approval-rule-and-could-not-request-from-user' };
  }

  // Log all request fields for debugging
  console.log(`[${ourSessionId}] Full permission request:`, JSON.stringify(request, null, 2));

  // Deduplicate parallel permission requests for the same executable+session
  const inFlightKey = `${ourSessionId}:${executable}`;
  const existingRequest = inFlightPermissions.get(inFlightKey);
  if (existingRequest) {
    console.log(`[${ourSessionId}] Reusing in-flight permission request for:`, executable);
    return existingRequest;
  }

  // Create new permission request and track it
  const permissionPromise = new Promise<PermissionRequestResult>((resolve) => {
    pendingPermissions.set(requestId, {
      resolve,
      request,
      executable,
      sessionId: ourSessionId,
      outOfScopePath,
    });
    mainWindow!.webContents.send('copilot:permission', {
      requestId,
      sessionId: ourSessionId,
      executable,
      isOutOfScope,
      ...request,
    });
    requestUserAttention();
  });

  // Track the in-flight request
  inFlightPermissions.set(inFlightKey, permissionPromise);

  // Clean up after resolution
  permissionPromise.finally(() => {
    inFlightPermissions.delete(inFlightKey);
  });

  return permissionPromise;
}

// Build subagent prompting section to encourage delegation
function buildSubagentPrompt(): string {
  return `## Subagents and Task Delegation

You have access to specialized subagents via the \`task\` tool. **Prefer using subagents** instead of doing work yourself when they're better suited for the task.

**Delegation Mindset**:
* When subagents are available, your role is to manage and coordinate, not to implement everything directly.
* Instruct subagents to complete tasks themselves - don't just ask for advice.
* If a custom agent and built-in agent both fit, prefer the custom agent (specialized knowledge).

**After Delegation**:
* Trust successful results, but spot-check critical changes.
* If a subagent fails, refine your instructions and try again.
* Only do the work yourself if repeated subagent attempts fail.`;
}

// Create a new session and return its ID
async function createNewSession(model?: string, cwd?: string): Promise<string> {
  const sessionModel = model || (store.get('model') as string);
  // In packaged app, process.cwd() can be '/', so default to home directory
  const sessionCwd = cwd || (app.isPackaged ? app.getPath('home') : process.cwd());

  // Get or create a client for this cwd
  const client = await getClientForCwd(sessionCwd);

  // Load MCP servers config
  const mcpConfig = await readMcpConfig();
  const agentResult = await getAllAgents(undefined, sessionCwd);
  const customAgents: CustomAgentConfig[] = [];
  const skippedAgentNames: string[] = [];
  for (const agent of agentResult.agents) {
    try {
      const content = await readFile(agent.path, 'utf-8');
      const metadata = parseAgentFrontmatter(content);
      customAgents.push({
        name: metadata.name || agent.name,
        displayName: agent.name,
        description: metadata.description,
        tools: null,
        prompt: content,
      });
    } catch (error) {
      skippedAgentNames.push(agent.name);
      log.warn('Failed to load agent prompt:', agent.path, error);
    }
  }
  if (skippedAgentNames.length > 0) {
    log.warn(`Skipped ${skippedAgentNames.length} custom agents due to read errors.`);
  }

  // Generate session ID upfront so we can pass it to browser tools
  const generatedSessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Create browser tools for this session
  const browserTools = createBrowserTools(generatedSessionId);
  console.log(
    `[${generatedSessionId}] Registering ${browserTools.length} tools:`,
    browserTools.map((t) => t.name)
  );

  // Build subagent prompting section
  const subagentPrompt = buildSubagentPrompt();

  const newSession = await client.createSession({
    sessionId: generatedSessionId,
    model: sessionModel,
    mcpServers: mcpConfig.mcpServers,
    tools: browserTools,
    customAgents,
    onPermissionRequest: (request, invocation) =>
      handlePermissionRequest(request, invocation, newSession.sessionId),
    systemMessage: {
      mode: 'append',
      content: `
${subagentPrompt}

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

## Electron App Screenshots - CRITICAL

**Your browser tools work with Electron desktop apps, not just websites.**
- Playwright (which powers your browser_* tools) natively supports Electron apps
- If you're editing an Electron app and need screenshots as evidence, USE YOUR BROWSER TOOLS
- Do NOT say "I cannot take screenshots of desktop apps" - you CAN via Playwright
- Use browser_navigate to connect to the running Electron app, then browser_screenshot to capture it
- This is the CORRECT way to capture visual evidence of Electron app features you've built or tested
`,
    },
  });

  const sessionId = newSession.sessionId; // Use SDK's session ID

  registerSessionEventForwarding(sessionId, newSession);

  sessions.set(sessionId, {
    session: newSession,
    client,
    model: sessionModel,
    cwd: sessionCwd,
    alwaysAllowed: new Set(),
    allowedPaths: new Set(),
    isProcessing: false,
    yoloMode: false,
  });
  activeSessionId = sessionId;

  // Persist session cwd so it can be restored when resuming from history
  const sessionCwds = (store.get('sessionCwds') as Record<string, string>) || {};
  sessionCwds[sessionId] = sessionCwd;
  store.set('sessionCwds', sessionCwds);

  // If this session is in a worktree, track the copilot session ID for cleanup
  const worktreeSession = worktree.findWorktreeSessionByPath(sessionCwd);
  if (worktreeSession) {
    worktree.trackCopilotSession(worktreeSession.id, sessionId);
  }

  console.log(`Created session ${sessionId} with model ${sessionModel} in ${sessionCwd}`);
  return sessionId;
}

async function initCopilot(): Promise<void> {
  try {
    // Use early-initialized client if available (saves ~500ms by running parallel with window load)
    if (earlyClientPromise) {
      defaultClient = await earlyClientPromise;
    } else {
      // Fallback to creating client now
      const defaultCwd = app.isPackaged ? app.getPath('home') : process.cwd();
      defaultClient = await getClientForCwd(defaultCwd);
    }

    // Check if we should use mock sessions for testing
    const useMockSessions = process.env.USE_MOCK_SESSIONS === 'true';

    // Get all available sessions and our stored open sessions with models
    let allSessions = await defaultClient.listSessions();
    const openSessions = (store.get('openSessions') as StoredSession[]) || [];
    const openSessionIds = openSessions.map((s) => s.sessionId);
    const openSessionMap = new Map(openSessions.map((s) => [s.sessionId, s]));

    // Mock sessions for E2E testing - deterministic data
    let mockSessionCwds: Record<string, string> = {};
    if (useMockSessions) {
      const now = new Date();
      const createMockDate = (daysAgo: number, hoursAgo = 0) => {
        const d = new Date(now);
        d.setDate(d.getDate() - daysAgo);
        d.setHours(d.getHours() - hoursAgo);
        return d;
      };

      allSessions = [
        // Today
        {
          sessionId: 'mock-today-1',
          summary: 'Fix authentication bug',
          modifiedTime: createMockDate(0, 2),
        },
        {
          sessionId: 'mock-today-2',
          summary: 'Add user dashboard',
          modifiedTime: createMockDate(0, 5),
        },
        // Yesterday
        {
          sessionId: 'mock-yesterday-1',
          summary: 'Refactor API endpoints',
          modifiedTime: createMockDate(1, 3),
        },
        {
          sessionId: 'mock-yesterday-2',
          summary: 'Update unit tests',
          modifiedTime: createMockDate(1, 8),
        },
        // Last 7 days
        {
          sessionId: 'mock-week-1',
          summary: 'Feature: Dark mode support',
          modifiedTime: createMockDate(3),
        },
        {
          sessionId: 'mock-week-2',
          summary: 'Performance optimization',
          modifiedTime: createMockDate(5),
        },
        {
          sessionId: 'mock-week-3',
          summary: 'Database migration script',
          modifiedTime: createMockDate(6),
        },
        // Last 30 days
        {
          sessionId: 'mock-month-1',
          summary: 'Initial project setup',
          modifiedTime: createMockDate(12),
        },
        {
          sessionId: 'mock-month-2',
          summary: 'Documentation updates',
          modifiedTime: createMockDate(20),
        },
        {
          sessionId: 'mock-month-3',
          summary: 'CI/CD pipeline config',
          modifiedTime: createMockDate(25),
        },
        // Older
        {
          sessionId: 'mock-old-1',
          summary: 'Legacy code cleanup',
          modifiedTime: createMockDate(45),
        },
        { sessionId: 'mock-old-2', summary: 'Archive migration', modifiedTime: createMockDate(60) },
      ] as typeof allSessions;

      mockSessionCwds = {
        'mock-today-1': '/Users/dev/projects/webapp',
        'mock-today-2': '/Users/dev/projects/webapp',
        'mock-yesterday-1': '/Users/dev/projects/api-server',
        'mock-yesterday-2': '/Users/dev/projects/webapp',
        'mock-week-1': '/Users/dev/projects/desktop-app',
        'mock-week-2': '/Users/dev/projects/webapp',
        'mock-week-3': '/Users/dev/projects/api-server',
        'mock-month-1': '/Users/dev/projects/new-project',
        'mock-month-2': '/Users/dev/docs',
        'mock-month-3': '/Users/dev/projects/webapp',
        'mock-old-1': '/Users/dev/legacy',
        'mock-old-2': '/Users/dev/archive',
      };
      console.log('Using mock sessions for testing');
    }

    console.log(
      `Found ${allSessions.length} total sessions, ${openSessions.length} were open in our app`
    );
    console.log('Open session IDs:', openSessionIds);
    console.log(
      'Available session IDs:',
      allSessions.map((s) => s.sessionId)
    );

    // Build map for quick lookup
    const sessionMetaMap = new Map(allSessions.map((s) => [s.sessionId, s]));

    // Filter to only sessions that exist and were open in our app
    const sessionsToResume = useMockSessions
      ? []
      : openSessionIds.filter((id) => sessionMetaMap.has(id));
    console.log('Sessions to resume:', sessionsToResume);

    // Get stored session cwds for previous sessions (use mock cwds if in test mode)
    const sessionCwds = useMockSessions
      ? mockSessionCwds
      : (store.get('sessionCwds') as Record<string, string>) || {};
    const sessionMarks =
      (store.get('sessionMarks') as Record<
        string,
        { markedForReview?: boolean; reviewNote?: string }
      >) || {};
    const sessionNames = (store.get('sessionNames') as Record<string, string>) || {};

    // Build list of previous sessions (all sessions not in our open list)
    // Use stored session name first (preserves user renames), then SDK summary as fallback
    const previousSessions = allSessions
      .filter((s) => !openSessionIds.includes(s.sessionId))
      .map((s) => ({
        sessionId: s.sessionId,
        name: sessionNames[s.sessionId] || s.summary || undefined,
        modifiedTime: s.modifiedTime.toISOString(),
        cwd: sessionCwds[s.sessionId],
        markedForReview: sessionMarks[s.sessionId]?.markedForReview,
        reviewNote: sessionMarks[s.sessionId]?.reviewNote,
      }));

    let resumedSessions: {
      sessionId: string;
      model: string;
      cwd: string;
      name?: string;
      editedFiles?: string[];
      alwaysAllowed?: string[];
      untrackedFiles?: string[];
    }[] = [];

    // Check which sessions were already resumed early
    const alreadyResumedIds = new Set(earlyResumedSessions.map((s) => s.sessionId));
    const sessionsNeedingResumption = sessionsToResume.filter((id) => !alreadyResumedIds.has(id));
    console.log('Already resumed early:', [...alreadyResumedIds]);
    console.log('Sessions still needing resumption:', sessionsNeedingResumption);

    // Load MCP servers config once for resumption (only if we need to resume more sessions)
    const mcpConfig =
      sessionsNeedingResumption.length > 0 ? await readMcpConfig() : { mcpServers: {} };

    // Resume only sessions that weren't resumed early
    const resumeSession = async (sessionId: string): Promise<void> => {
      const meta = sessionMetaMap.get(sessionId);
      const storedSession = openSessionMap.get(sessionId);
      const sessionModel = storedSession?.model || (store.get('model') as string) || 'gpt-5.2';
      const sessionCwd = storedSession?.cwd || defaultCwd;
      const storedAlwaysAllowed = storedSession?.alwaysAllowed || [];

      try {
        // Get or create client for this session's cwd
        const client = await getClientForCwd(sessionCwd);

        const agentResult = await getAllAgents(undefined, sessionCwd);
        const customAgents: CustomAgentConfig[] = [];
        for (const agent of agentResult.agents) {
          try {
            const content = await readFile(agent.path, 'utf-8');
            const metadata = parseAgentFrontmatter(content);
            customAgents.push({
              name: metadata.name || agent.name,
              displayName: agent.name,
              description: metadata.description,
              tools: null,
              prompt: content,
            });
          } catch (error) {
            log.warn('Failed to load agent prompt:', agent.path, error);
          }
        }
        const session = await client.resumeSession(sessionId, {
          mcpServers: mcpConfig.mcpServers,
          tools: createBrowserTools(sessionId),
          customAgents,
          onPermissionRequest: (request, invocation) =>
            handlePermissionRequest(request, invocation, sessionId),
        });

        // Set up event handler for resumed session
        session.on((event) => {
          if (!mainWindow || mainWindow.isDestroyed()) return;

          log.debug(`[${sessionId}] Event: ${event.type}`);

          if (event.type === 'assistant.message_delta') {
            mainWindow.webContents.send('copilot:delta', {
              sessionId,
              content: event.data.deltaContent,
            });
          } else if (event.type === 'assistant.message') {
            mainWindow.webContents.send('copilot:message', {
              sessionId,
              content: event.data.content,
            });
          } else if (event.type === 'session.idle') {
            const currentSessionState = sessions.get(sessionId);
            if (currentSessionState) currentSessionState.isProcessing = false;
            mainWindow.webContents.send('copilot:idle', { sessionId });
            requestUserAttention();
          } else if (event.type === 'tool.execution_start') {
            log.debug(
              `[${sessionId}] Tool start: ${event.data.toolName} (${event.data.toolCallId})`
            );
            mainWindow.webContents.send('copilot:tool-start', {
              sessionId,
              toolCallId: event.data.toolCallId,
              toolName: event.data.toolName,
              input: event.data.arguments || (event.data as Record<string, unknown>),
            });
          } else if (event.type === 'tool.execution_complete') {
            log.debug(`[${sessionId}] Tool end: ${event.data.toolCallId}`);
            const completeData = event.data as Record<string, unknown>;
            mainWindow.webContents.send('copilot:tool-end', {
              sessionId,
              toolCallId: event.data.toolCallId,
              toolName: completeData.toolName,
              input: completeData.arguments || completeData,
              output: event.data.result?.content || completeData.output,
            });
          } else if (event.type === 'subagent.selected') {
            mainWindow.webContents.send('copilot:agentSelected', {
              sessionId,
              agentName: event.data.agentName,
              agentDisplayName: event.data.agentDisplayName,
            });
          } else if (event.type === 'subagent.started') {
            console.log(
              `[${sessionId}] 🤖 Subagent started: ${event.data.agentDisplayName} (${event.data.toolCallId})`
            );
            mainWindow.webContents.send('copilot:subagent-started', {
              sessionId,
              toolCallId: event.data.toolCallId,
              agentName: event.data.agentName,
              agentDisplayName: event.data.agentDisplayName,
              agentDescription: event.data.agentDescription,
            });
          } else if (event.type === 'subagent.completed') {
            console.log(
              `[${sessionId}] ✓ Subagent completed: ${event.data.agentName} (${event.data.toolCallId})`
            );
            mainWindow.webContents.send('copilot:subagent-completed', {
              sessionId,
              toolCallId: event.data.toolCallId,
              agentName: event.data.agentName,
            });
          } else if (event.type === 'subagent.failed') {
            console.log(
              `✗ [${sessionId}] Subagent failed: ${event.data.agentName} (${event.data.toolCallId}): ${event.data.error}`
            );
            mainWindow.webContents.send('copilot:subagent-failed', {
              sessionId,
              toolCallId: event.data.toolCallId,
              agentName: event.data.agentName,
              error: event.data.error,
            });
          }
        });

        // Restore alwaysAllowed set from stored data (normalize legacy ids)
        const alwaysAllowedSet = new Set(storedAlwaysAllowed.map(normalizeAlwaysAllowed));
        sessions.set(sessionId, {
          session,
          client,
          model: sessionModel,
          cwd: sessionCwd,
          alwaysAllowed: alwaysAllowedSet,
          allowedPaths: new Set(),
          isProcessing: false,
          yoloMode: storedSession?.yoloMode || false,
        });

        const resumed = {
          sessionId,
          model: sessionModel,
          cwd: sessionCwd,
          name: storedSession?.name || meta?.summary || undefined,
          editedFiles: storedSession?.editedFiles || [],
          alwaysAllowed: storedAlwaysAllowed,
          untrackedFiles: storedSession?.untrackedFiles || [],
          fileViewMode: storedSession?.fileViewMode || 'flat',
          yoloMode: storedSession?.yoloMode || false,
          activeAgentName: storedSession?.activeAgentName,
        };
        resumedSessions.push(resumed);
        console.log(
          `Resumed session ${resumed.sessionId} with model ${resumed.model} in ${resumed.cwd}${meta?.summary ? ` (${meta.summary})` : ''}`
        );

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('copilot:sessionResumed', { session: resumed });
        }
      } catch (error) {
        console.error(`Failed to resume session ${sessionId}:`, error);
      }
    };

    // Only resume sessions that weren't already resumed early
    for (const sessionId of sessionsNeedingResumption) {
      void resumeSession(sessionId);
    }

    // If no sessions were resumed, don't create one automatically
    // The frontend will trigger creation which includes trust check
    if (sessionsToResume.length === 0) {
      // Signal to frontend that it needs to create an initial session
      activeSessionId = null;
    } else {
      activeSessionId = sessionsToResume[0] || null;
    }

    const pendingSessions = sessionsToResume.map((sessionId) => {
      const meta = sessionMetaMap.get(sessionId);
      const storedSession = openSessionMap.get(sessionId);
      const sessionModel = storedSession?.model || (store.get('model') as string) || 'gpt-5.2';
      const sessionCwd = storedSession?.cwd || defaultCwd;
      return {
        sessionId,
        model: sessionModel,
        cwd: sessionCwd,
        name: storedSession?.name || meta?.summary || undefined,
        editedFiles: storedSession?.editedFiles || [],
        alwaysAllowed: storedSession?.alwaysAllowed || [],
        untrackedFiles: storedSession?.untrackedFiles || [],
        fileViewMode: storedSession?.fileViewMode || 'flat',
        activeAgentName: storedSession?.activeAgentName,
      };
    });

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('copilot:ready', {
        sessions: pendingSessions,
        previousSessions,
        models: getVerifiedModels(),
      });

      // Notify about sessions that were already resumed early (window wasn't ready when they completed)
      for (const session of earlyResumedSessions) {
        mainWindow.webContents.send('copilot:sessionResumed', { session });
      }
    }

    // Verify available models in background (non-blocking)
    if (defaultClient) {
      verifyAvailableModels(defaultClient)
        .then((verifiedModels) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('copilot:modelsVerified', { models: verifiedModels });
          }
        })
        .catch((err) => {
          console.error('Model verification failed:', err);
        });
    }

    // Start keep-alive timer to prevent session timeouts
    startKeepAlive();
  } catch (err) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('copilot:error', String(err));
    }
  }
}

function createWindow(): void {
  const isWindows = process.platform === 'win32';

  const iconPathCandidates = [
    // Dev (repo checkout)
    join(__dirname, '../../build/icon.png'),
    // Packaged (if included as an extra resource)
    join(process.resourcesPath, 'build/icon.png'),
    join(process.resourcesPath, 'icon.png'),
  ];
  const windowIcon = iconPathCandidates.find((p) => existsSync(p));

  mainWindow = new BrowserWindow({
    ...(windowIcon ? { icon: windowIcon } : {}),
    width: 1400,
    height: 750,
    minWidth: 320,
    minHeight: 400,
    frame: false,
    backgroundColor: '#0d1117',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: -100, y: -100 },
    // On Windows, use native title bar overlay for minimize/maximize/close buttons
    ...(isWindows && {
      titleBarOverlay: {
        color: '#2d2d2d',
        symbolColor: '#e6edf3',
        height: 38,
      },
      roundedCorners: false, // Sharp corners on Windows (standard for Windows apps)
    }),
    hasShadow: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  const savedZoomFactor = clampZoomFactor(store.get('zoomFactor') as number);
  mainWindow.webContents.setZoomFactor(savedZoomFactor);
  mainWindow.webContents.on('zoom-changed', () => {
    const current = mainWindow?.webContents.getZoomFactor() ?? DEFAULT_ZOOM_FACTOR;
    const clamped = clampZoomFactor(current);
    if (clamped !== current) {
      mainWindow?.webContents.setZoomFactor(clamped);
    }
    store.set('zoomFactor', clamped);
    broadcastZoomFactor(clamped);
  });
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const modifier = input.control || input.meta;
    if (!modifier) return;
    if (input.key === '+' || input.key === '=' || input.code === 'Equal') {
      event.preventDefault();
      const current = mainWindow?.webContents.getZoomFactor() ?? DEFAULT_ZOOM_FACTOR;
      const next = clampZoomFactor(parseFloat((current + ZOOM_STEP).toFixed(2)));
      mainWindow?.webContents.setZoomFactor(next);
      store.set('zoomFactor', next);
      broadcastZoomFactor(next);
      return;
    }
    if (input.key === '-' || input.code === 'Minus') {
      event.preventDefault();
      const current = mainWindow?.webContents.getZoomFactor() ?? DEFAULT_ZOOM_FACTOR;
      const next = clampZoomFactor(parseFloat((current - ZOOM_STEP).toFixed(2)));
      mainWindow?.webContents.setZoomFactor(next);
      store.set('zoomFactor', next);
      broadcastZoomFactor(next);
      return;
    }
    if (input.key === '0' || input.code === 'Digit0') {
      event.preventDefault();
      const next = DEFAULT_ZOOM_FACTOR;
      mainWindow?.webContents.setZoomFactor(next);
      store.set('zoomFactor', next);
      broadcastZoomFactor(next);
    }
  });

  // Check for TEST_MESSAGE env var
  const testMessage = process.env.TEST_MESSAGE;

  if (process.env.ELECTRON_RENDERER_URL) {
    const url = testMessage
      ? `${process.env.ELECTRON_RENDERER_URL}?test=${encodeURIComponent(testMessage)}`
      : process.env.ELECTRON_RENDERER_URL;
    mainWindow.loadURL(url);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.once('did-finish-load', () => {
    initCopilot();
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log.error('Renderer process gone:', details);
  });

  mainWindow.webContents.on('child-process-gone', (_event, details) => {
    log.error('Renderer child process gone:', details);
  });

  // Set main window for voice service
  voiceService.setMainWindow(mainWindow);
  whisperModelManager.setMainWindow(mainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle(
  'copilot:send',
  async (
    _event,
    data: {
      sessionId: string;
      prompt: string;
      attachments?: { type: 'file'; path: string; displayName?: string }[];
      mode?: 'enqueue' | 'immediate';
    }
  ) => {
    const sessionState = sessions.get(data.sessionId);
    if (!sessionState) {
      throw new Error(`Session not found: ${data.sessionId}`);
    }

    sessionState.isProcessing = true;

    log.info(`[${data.sessionId}] Sending message with model=${sessionState.model}`);

    const messageOptions: {
      prompt: string;
      attachments?: typeof data.attachments;
      mode?: 'enqueue' | 'immediate';
    } = {
      prompt: data.prompt,
      attachments: data.attachments,
    };

    // Add mode if specified (for injected messages during processing)
    if (data.mode) {
      messageOptions.mode = data.mode;
    }

    try {
      const messageId = await sessionState.session.send(messageOptions);
      return messageId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if session was disconnected/timed out
      if (
        errorMessage.includes('Session not found') ||
        errorMessage.includes('session.send failed')
      ) {
        log.warn(`[${data.sessionId}] Session appears disconnected, attempting to resume...`);

        try {
          // Try to resume the session
          await resumeDisconnectedSession(data.sessionId, sessionState);

          // Retry the send
          const messageId = await sessionState.session.send(messageOptions);
          log.info(`[${data.sessionId}] Successfully sent message after session resume`);
          return messageId;
        } catch (resumeError) {
          log.error(`[${data.sessionId}] Failed to resume session:`, resumeError);
          sessionState.isProcessing = false;
          throw new Error(`Session disconnected and could not be resumed. Please try again.`);
        }
      }

      sessionState.isProcessing = false;
      throw error;
    }
  }
);

ipcMain.handle(
  'copilot:sendAndWait',
  async (
    _event,
    data: {
      sessionId: string;
      prompt: string;
      attachments?: { type: 'file'; path: string; displayName?: string }[];
    }
  ) => {
    const sessionState = sessions.get(data.sessionId);
    if (!sessionState) {
      throw new Error(`Session not found: ${data.sessionId}`);
    }

    sessionState.isProcessing = true;

    const messageOptions = {
      prompt: data.prompt,
      attachments: data.attachments,
    };

    try {
      const response = await sessionState.session.sendAndWait(messageOptions);
      sessionState.isProcessing = false;
      return response?.data?.content || '';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if session was disconnected/timed out
      if (
        errorMessage.includes('Session not found') ||
        errorMessage.includes('session.send failed')
      ) {
        log.warn(`[${data.sessionId}] Session appears disconnected, attempting to resume...`);

        try {
          await resumeDisconnectedSession(data.sessionId, sessionState);
          const response = await sessionState.session.sendAndWait(messageOptions);
          sessionState.isProcessing = false;
          return response?.data?.content || '';
        } catch (resumeError) {
          log.error(`[${data.sessionId}] Failed to resume session:`, resumeError);
          sessionState.isProcessing = false;
          throw new Error(`Session disconnected and could not be resumed. Please try again.`);
        }
      }

      sessionState.isProcessing = false;
      throw error;
    }
  }
);

ipcMain.on('copilot:abort', async (_event, sessionId: string) => {
  const sessionState = sessions.get(sessionId);
  if (sessionState) {
    await sessionState.session.abort();
  }
});

// Get message history for a session
ipcMain.handle('copilot:getMessages', async (_event, sessionId: string) => {
  const sessionState = sessions.get(sessionId);
  if (!sessionState) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  try {
    const events = await sessionState.session.getMessages();

    // Convert events to simplified message format
    const messages: { role: 'user' | 'assistant'; content: string }[] = [];

    for (const event of events) {
      if (event.type === 'user.message') {
        messages.push({ role: 'user', content: event.data.content });
      } else if (event.type === 'assistant.message') {
        messages.push({ role: 'assistant', content: event.data.content });
      }
    }

    return messages;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if session was disconnected/timed out
    if (errorMessage.includes('Session not found') || errorMessage.includes('failed')) {
      log.warn(
        `[${sessionId}] Session appears disconnected, attempting to resume for getMessages...`
      );

      try {
        await resumeDisconnectedSession(sessionId, sessionState);
        const events = await sessionState.session.getMessages();

        const messages: { role: 'user' | 'assistant'; content: string }[] = [];
        for (const event of events) {
          if (event.type === 'user.message') {
            messages.push({ role: 'user', content: event.data.content });
          } else if (event.type === 'assistant.message') {
            messages.push({ role: 'assistant', content: event.data.content });
          }
        }
        return messages;
      } catch (resumeError) {
        log.error(`[${sessionId}] Failed to resume session for getMessages:`, resumeError);
        // Return empty array instead of throwing - messages may not be recoverable
        return [];
      }
    }

    throw error;
  }
});

// Generate a short title for a conversation using AI
ipcMain.handle('copilot:generateTitle', async (_event, data: { conversation: string }) => {
  // Use the default cwd client for title generation
  const defaultClient = await getClientForCwd(process.cwd());

  try {
    // Get the best available model for quick tasks
    const quickModel = await getQuickTasksModel(defaultClient);

    // Create a temporary session with the cheapest model for title generation
    const tempSession = await defaultClient.createSession({
      model: quickModel,
      systemMessage: {
        mode: 'append',
        content:
          'You are a title generator. Respond with ONLY a short title (3-6 words, no quotes, no punctuation at end).',
      },
    });

    const sessionId = tempSession.sessionId;
    const prompt = `Generate a short descriptive title for this conversation, that makes it easy to identify what this is about:\n\n${data.conversation}\n\nRespond with ONLY the title, nothing else.`;
    const response = await tempSession.sendAndWait({ prompt });

    // Clean up temp session - destroy and delete to avoid polluting session list
    await tempSession.destroy();
    await defaultClient.deleteSession(sessionId);

    // Extract and clean the title
    const title = (response?.data?.content || 'Untitled')
      .trim()
      .replace(/^["']|["']$/g, '')
      .slice(0, 50);
    return title;
  } catch (error) {
    console.error('Failed to generate title:', error);
    return 'Untitled';
  }
});

// Generate commit message from diff using AI
ipcMain.handle('git:generateCommitMessage', async (_event, data: { diff: string }) => {
  const defaultClient = await getClientForCwd(process.cwd());

  try {
    // Get the best available model for quick tasks
    const quickModel = await getQuickTasksModel(defaultClient);

    const tempSession = await defaultClient.createSession({
      model: quickModel,
      systemMessage: {
        mode: 'append',
        content:
          'You are a git commit message generator. Write concise, conventional commit messages. Use format: type(scope): description. Types: feat, fix, refactor, style, docs, test, chore. Keep under 72 chars. No quotes around the message.',
      },
    });

    const sessionId = tempSession.sessionId;
    // Truncate diff if too long
    const truncatedDiff =
      data.diff.length > 4000 ? data.diff.slice(0, 4000) + '\n... (truncated)' : data.diff;
    const prompt = `Generate a commit message for these changes:\n\n${truncatedDiff}\n\nRespond with ONLY the commit message, nothing else.`;
    const response = await tempSession.sendAndWait({ prompt });

    await tempSession.destroy();
    await defaultClient.deleteSession(sessionId);

    const message = (response?.data?.content || 'Update files')
      .trim()
      .replace(/^["']|["']$/g, '')
      .slice(0, 100);
    return message;
  } catch (error) {
    console.error('Failed to generate commit message:', error);
    return 'Update files';
  }
});

// Detect if a message contains a multi-choice question for the user
// Returns structured options if detected, null otherwise
ipcMain.handle('copilot:detectChoices', async (_event, data: { message: string }) => {
  const defaultClient = await getClientForCwd(process.cwd());

  try {
    const quickModel = await getQuickTasksModel(defaultClient);

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
- Respond with ONLY valid JSON, no markdown, no explanation`,
      },
    });

    const sessionId = tempSession.sessionId;
    // Truncate message if too long
    const truncatedMessage = data.message.length > 2000 ? data.message.slice(-2000) : data.message;
    const prompt = `Analyze this message:\n\n${truncatedMessage}`;
    const response = await tempSession.sendAndWait({ prompt });

    await tempSession.destroy();
    await defaultClient.deleteSession(sessionId);

    // Parse the JSON response
    const content = response?.data?.content || '';
    try {
      // Extract JSON from response (handle potential markdown wrapping)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.isChoice && Array.isArray(parsed.options) && parsed.options.length >= 2) {
          return {
            isChoice: true,
            options: parsed.options
              .slice(0, 5)
              .map((opt: { id?: string; label?: string; description?: string }) => ({
                id: String(opt.id || '').slice(0, 30),
                label: String(opt.label || opt.id || '').slice(0, 50),
                description: opt.description ? String(opt.description).slice(0, 100) : undefined,
              })),
          };
        }
      }
      return { isChoice: false };
    } catch {
      console.warn('Failed to parse choice detection response:', content);
      return { isChoice: false };
    }
  } catch (error) {
    console.error('Failed to detect choices:', error);
    return { isChoice: false };
  }
});

// Handle permission response from renderer
ipcMain.handle(
  'copilot:permissionResponse',
  async (
    _event,
    data: {
      requestId: string;
      decision: 'approved' | 'always' | 'global' | 'denied';
    }
  ) => {
    const pending = pendingPermissions.get(data.requestId);
    if (!pending) {
      console.log('No pending permission for:', data.requestId);
      return { success: false };
    }

    pendingPermissions.delete(data.requestId);

    // Track "global" for adding to persistent global safe commands
    if (data.decision === 'global') {
      // For URL requests, add to global allowed URLs
      if (pending.request.kind === 'url' && pending.executable.startsWith('url:')) {
        const hostname = pending.executable.replace('url:', '');
        const allowedUrls = (store.get('allowedUrls') as string[]) || [];
        if (!allowedUrls.includes(hostname)) {
          allowedUrls.push(hostname);
          store.set('allowedUrls', allowedUrls);
          console.log(`[${pending.sessionId}] Added to allowed URLs:`, hostname);
        }
      } else {
        // For other commands, add to global safe commands
        const executables = pending.executable.split(', ').filter((e) => e.trim());
        const globalSafeCommands = (store.get('globalSafeCommands') as string[]) || [];
        const newCommands = executables.map((exec) => normalizeAlwaysAllowed(exec.trim()));
        const updatedCommands = [...new Set([...globalSafeCommands, ...newCommands])];
        store.set('globalSafeCommands', updatedCommands);
        console.log(`[${pending.sessionId}] Added to global safe commands:`, newCommands);
      }
    }

    // Track "always allow" for this specific executable in the session
    if (data.decision === 'always') {
      // For URL requests, also add to global allowed URLs (URLs should persist across sessions)
      if (pending.request.kind === 'url' && pending.executable.startsWith('url:')) {
        const hostname = pending.executable.replace('url:', '');
        const allowedUrls = (store.get('allowedUrls') as string[]) || [];
        if (!allowedUrls.includes(hostname)) {
          allowedUrls.push(hostname);
          store.set('allowedUrls', allowedUrls);
          console.log(`[${pending.sessionId}] Added to allowed URLs:`, hostname);
        }
      } else {
        // For other commands, add to session's always allowed
        const sessionState = sessions.get(pending.sessionId);
        if (sessionState) {
          // Add each executable individually (handle comma-separated list)
          const executables = pending.executable.split(', ').filter((e) => e.trim());
          for (const exec of executables) {
            sessionState.alwaysAllowed.add(normalizeAlwaysAllowed(exec.trim()));
          }
          console.log(
            `[${pending.sessionId}] Added to always allow:`,
            executables.map(normalizeAlwaysAllowed)
          );
        }
      }
    }

    // For out-of-scope reads that are approved, remember the parent directory
    if (
      (data.decision === 'approved' || data.decision === 'always' || data.decision === 'global') &&
      pending.outOfScopePath
    ) {
      const sessionState = sessions.get(pending.sessionId);
      if (sessionState) {
        const parentDir = dirname(pending.outOfScopePath);
        sessionState.allowedPaths.add(parentDir);
        console.log(`[${pending.sessionId}] Added to allowed paths:`, parentDir);
      }
    }

    const result: PermissionRequestResult = {
      kind: data.decision === 'denied' ? 'denied-interactively-by-user' : 'approved',
    };

    console.log('Permission resolved:', data.requestId, result.kind);
    pending.resolve(result);
    return { success: true };
  }
);

// Handle yolo mode toggle
ipcMain.handle(
  'copilot:setYoloMode',
  async (_event, data: { sessionId: string; enabled: boolean }) => {
    const sessionState = sessions.get(data.sessionId);
    if (sessionState) {
      sessionState.yoloMode = data.enabled;
      console.log(`[${data.sessionId}] Yolo mode ${data.enabled ? 'enabled' : 'disabled'}`);

      // If enabling yolo mode, auto-approve any pending confirmations
      if (data.enabled) {
        const pendingIds = Array.from(pendingPermissions.keys()).filter((id) => {
          const pending = pendingPermissions.get(id);
          return pending?.sessionId === data.sessionId;
        });
        for (const id of pendingIds) {
          const pending = pendingPermissions.get(id);
          if (pending) {
            pendingPermissions.delete(id);
            pending.resolve({ kind: 'approved' });
            console.log(`[${data.sessionId}] Yolo mode: flushed pending permission ${id}`);
          }
        }
        // Notify renderer to clear pending confirmations
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('copilot:yoloModeChanged', {
            sessionId: data.sessionId,
            enabled: true,
            flushedCount: pendingIds.length,
          });
        }
      }

      return { success: true };
    }
    return { success: false };
  }
);

ipcMain.handle(
  'copilot:setModel',
  async (_event, data: { sessionId: string; model: string; hasMessages: boolean }) => {
    store.set('model', data.model); // Persist as default for new sessions

    const sessionState = sessions.get(data.sessionId);
    if (sessionState) {
      if (process.env.NODE_ENV === 'test') {
        sessionState.model = data.model;
        return { sessionId: data.sessionId, model: data.model, cwd: sessionState.cwd };
      }
      const validModels = getVerifiedModels().map((m) => m.id);
      if (!validModels.includes(data.model)) {
        throw new Error(`Invalid model: ${data.model}`);
      }
      const { cwd, client } = sessionState;
      const previousModel = sessionState.model;

      log.info(
        `[${data.sessionId}] Model switch requested: ${previousModel} → ${data.model} (hasMessages=${data.hasMessages})`
      );

      // If session has no messages, just create a new session with the desired model
      // instead of trying to resume (which would fail for empty sessions)
      if (!data.hasMessages) {
        log.info(
          `[${data.sessionId}] Creating new session with model ${data.model} (empty session)`
        );

        // Capture yoloMode before destroying old session
        const preserveYoloMode = sessionState.yoloMode;

        // Destroy the old session
        await sessionState.session.destroy();
        sessions.delete(data.sessionId);

        // Create a brand new session with the desired model
        const newSessionId = await createNewSession(data.model, cwd);
        const newSessionState = sessions.get(newSessionId)!;

        // Preserve yoloMode in the new session
        newSessionState.yoloMode = preserveYoloMode;

        log.info(
          `[${newSessionId}] New session created for model switch: ${previousModel} → ${data.model}`
        );

        return {
          sessionId: newSessionId,
          model: data.model,
          cwd,
          newSession: true,
        };
      }

      // Session has messages - resume to preserve conversation history
      log.info(
        `[${data.sessionId}] Resuming session for model switch: ${previousModel} → ${data.model}`
      );
      await sessionState.session.destroy();
      sessions.delete(data.sessionId);

      const mcpConfig = await readMcpConfig();
      const browserTools = createBrowserTools(data.sessionId);

      // Resume the same session with the new model — preserves conversation context
      const agentResult = await getAllAgents(undefined, cwd);
      const customAgents: CustomAgentConfig[] = [];
      for (const agent of agentResult.agents) {
        try {
          const content = await readFile(agent.path, 'utf-8');
          const metadata = parseAgentFrontmatter(content);
          customAgents.push({
            name: metadata.name || agent.name,
            displayName: agent.name,
            description: metadata.description,
            tools: null,
            prompt: content,
          });
        } catch (error) {
          log.warn('Failed to load agent prompt:', agent.path, error);
        }
      }
      const resumedSession = await client.resumeSession(data.sessionId, {
        model: data.model,
        mcpServers: mcpConfig.mcpServers,
        tools: browserTools,
        customAgents,
        onPermissionRequest: (request, invocation) =>
          handlePermissionRequest(request, invocation, resumedSession.sessionId),
      });

      const resumedSessionId = resumedSession.sessionId;
      registerSessionEventForwarding(resumedSessionId, resumedSession);

      sessions.set(resumedSessionId, {
        session: resumedSession,
        client,
        model: data.model,
        cwd,
        alwaysAllowed: new Set(sessionState.alwaysAllowed),
        allowedPaths: new Set(sessionState.allowedPaths),
        isProcessing: false,
        yoloMode: sessionState.yoloMode,
      });
      activeSessionId = resumedSessionId;

      log.info(
        `[${resumedSessionId}] Model switch complete: ${previousModel} → ${data.model} (resumed session)`
      );
      return { sessionId: resumedSessionId, model: data.model, cwd };
    }

    return { model: data.model };
  }
);

ipcMain.handle(
  'copilot:setActiveAgent',
  async (_event, data: { sessionId: string; agentName?: string; hasMessages: boolean }) => {
    const sessionState = sessions.get(data.sessionId);
    if (!sessionState) {
      throw new Error(`Session not found: ${data.sessionId}`);
    }

    const { cwd, client, model } = sessionState;

    // Try to call the undocumented session.selectAgent RPC method
    // This may not exist in all SDK versions
    try {
      if (data.agentName) {
        // @ts-ignore - accessing internal connection to call undocumented RPC
        await sessionState.session.connection?.sendRequest?.('session.selectAgent', {
          sessionId: data.sessionId,
          agentName: data.agentName,
        });
        console.log(`Selected agent ${data.agentName} via RPC`);
      } else {
        // @ts-ignore - accessing internal connection to call undocumented RPC
        await sessionState.session.connection?.sendRequest?.('session.clearAgent', {
          sessionId: data.sessionId,
        });
        console.log(`Cleared agent selection via RPC`);
      }
      return { sessionId: data.sessionId, model, cwd };
    } catch (rpcError) {
      console.log(`RPC method not available, falling back to destroy+resume: ${rpcError}`);
    }

    // Fallback: destroy+resume approach (preserves history but less efficient)
    // If session has no messages, just create a new session
    if (!data.hasMessages) {
      console.log(`Creating new session with agent ${data.agentName || 'none'} (empty session)`);

      // Capture yoloMode before destroying old session
      const preserveYoloMode = sessionState.yoloMode;

      // Destroy the old session
      await sessionState.session.destroy();
      sessions.delete(data.sessionId);

      // Create a brand new session with the same model
      const newSessionId = await createNewSession(model, cwd);
      const newSessionState = sessions.get(newSessionId)!;

      // Preserve yoloMode in the new session
      newSessionState.yoloMode = preserveYoloMode;

      return {
        sessionId: newSessionId,
        model,
        cwd,
        newSession: true,
      };
    }

    // Session has messages - resume to preserve conversation history
    console.log(`Switching to agent ${data.agentName || 'none'} for session ${data.sessionId}`);
    await sessionState.session.destroy();
    sessions.delete(data.sessionId);

    const mcpConfig = await readMcpConfig();
    const browserTools = createBrowserTools(data.sessionId);

    // Build customAgents list for the session
    const agentResult = await getAllAgents(undefined, cwd);
    const customAgents: CustomAgentConfig[] = [];
    for (const agent of agentResult.agents) {
      try {
        const content = await readFile(agent.path, 'utf-8');
        const metadata = parseAgentFrontmatter(content);
        customAgents.push({
          name: metadata.name || agent.name,
          displayName: agent.name,
          description: metadata.description,
          tools: null,
          prompt: content,
        });
      } catch (error) {
        log.warn('Failed to load agent prompt:', agent.path, error);
      }
    }

    // Resume the same session — preserves conversation context
    const resumedSession = await client.resumeSession(data.sessionId, {
      model,
      mcpServers: mcpConfig.mcpServers,
      tools: browserTools,
      customAgents,
      onPermissionRequest: (request, invocation) =>
        handlePermissionRequest(request, invocation, resumedSession.sessionId),
    });

    const resumedSessionId = resumedSession.sessionId;
    registerSessionEventForwarding(resumedSessionId, resumedSession);

    sessions.set(resumedSessionId, {
      session: resumedSession,
      client,
      model,
      cwd,
      alwaysAllowed: new Set(sessionState.alwaysAllowed),
      allowedPaths: new Set(sessionState.allowedPaths),
      isProcessing: false,
      yoloMode: sessionState.yoloMode,
    });
    activeSessionId = resumedSessionId;

    console.log(`Session ${resumedSessionId} resumed with agent ${data.agentName || 'none'}`);
    return { sessionId: resumedSessionId, model, cwd };
  }
);

ipcMain.handle('copilot:getModels', async () => {
  const currentModel = store.get('model') as string;
  return { models: getVerifiedModels(), current: currentModel };
});

// Get model capabilities including vision support
ipcMain.handle('copilot:getModelCapabilities', async (_event, modelId: string) => {
  try {
    if (!defaultClient) {
      return { supportsVision: false };
    }
    const models = await defaultClient.listModels();
    const model = models.find((m) => m.id === modelId);
    if (model) {
      return {
        supportsVision: model.capabilities?.supports?.vision ?? false,
        visionLimits: model.capabilities?.limits?.vision
          ? {
              supportedMediaTypes: model.capabilities.limits.vision.supported_media_types,
              maxPromptImages: model.capabilities.limits.vision.max_prompt_images,
              maxPromptImageSize: model.capabilities.limits.vision.max_prompt_image_size,
            }
          : undefined,
      };
    }
    return { supportsVision: false };
  } catch (error) {
    log.error('Failed to get model capabilities:', error);
    return { supportsVision: false };
  }
});

// Save image data URL to temp file for SDK attachment
ipcMain.handle(
  'copilot:saveImageToTemp',
  async (_event, data: { dataUrl: string; filename: string }) => {
    try {
      const imageDir = join(getCopilotStatePath(), 'images');
      if (!existsSync(imageDir)) {
        mkdirSync(imageDir, { recursive: true });
      }

      // Parse data URL
      const matches = data.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        return { success: false, error: 'Invalid data URL format' };
      }

      const buffer = Buffer.from(matches[2], 'base64');
      const filePath = join(imageDir, data.filename);

      await writeFile(filePath, buffer);
      return { success: true, path: filePath };
    } catch (error) {
      log.error('Failed to save image to temp:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
);

// Persist a single session's mark/note immediately
ipcMain.handle(
  'copilot:saveSessionMark',
  async (
    _event,
    args: { sessionId: string; mark: { markedForReview?: boolean; reviewNote?: string } }
  ) => {
    try {
      const { sessionId, mark } = args;
      const sessionMarks =
        (store.get('sessionMarks') as Record<
          string,
          { markedForReview?: boolean; reviewNote?: string }
        >) || {};

      // If nothing to save (both undefined or empty), remove existing mark
      const hasMark =
        typeof mark.markedForReview !== 'undefined' ||
        (typeof mark.reviewNote === 'string' && mark.reviewNote !== '');
      if (!hasMark) {
        delete sessionMarks[sessionId];
      } else {
        sessionMarks[sessionId] = {
          ...(sessionMarks[sessionId] || {}),
          markedForReview:
            typeof mark.markedForReview !== 'undefined'
              ? mark.markedForReview
              : sessionMarks[sessionId]?.markedForReview,
          reviewNote:
            typeof mark.reviewNote !== 'undefined'
              ? mark.reviewNote
              : sessionMarks[sessionId]?.reviewNote,
        };
      }

      store.set('sessionMarks', sessionMarks);
      return { success: true };
    } catch (error) {
      console.error('Failed to save session mark:', error);
      return { success: false };
    }
  }
);

// Fetch image from URL and save to temp
ipcMain.handle('copilot:fetchImageFromUrl', async (_event, url: string) => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return { success: false, error: 'URL does not point to an image' };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const extension = contentType.split('/')[1]?.split(';')[0] || 'png';
    const filename = `image-${Date.now()}.${extension}`;

    const imageDir = join(getCopilotStatePath(), 'images');
    if (!existsSync(imageDir)) {
      mkdirSync(imageDir, { recursive: true });
    }

    const filePath = join(imageDir, filename);
    await writeFile(filePath, buffer);

    // Convert to data URL for preview
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;

    return {
      success: true,
      path: filePath,
      dataUrl,
      mimeType: contentType,
      size: buffer.length,
      filename,
    };
  } catch (error) {
    log.error('Failed to fetch image from URL:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Save file data URL to temp file for SDK attachment
ipcMain.handle(
  'copilot:saveFileToTemp',
  async (_event, data: { dataUrl: string; filename: string; mimeType: string }) => {
    try {
      const filesDir = join(getCopilotStatePath(), 'files');
      if (!existsSync(filesDir)) {
        mkdirSync(filesDir, { recursive: true });
      }

      // Parse data URL
      const matches = data.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        return { success: false, error: 'Invalid data URL format' };
      }

      const buffer = Buffer.from(matches[2], 'base64');
      const filePath = join(filesDir, data.filename);

      await writeFile(filePath, buffer);
      return { success: true, path: filePath, size: buffer.length };
    } catch (error) {
      log.error('Failed to save file to temp:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
);

// Get current working directory
ipcMain.handle('copilot:getCwd', async () => {
  // Use home dir for packaged app since process.cwd() can be '/'
  return app.isPackaged ? app.getPath('home') : process.cwd();
});

// Create a new session (for new tabs)
ipcMain.handle('copilot:createSession', async (_event, options?: { cwd?: string }) => {
  const sessionId = await createNewSession(undefined, options?.cwd);
  const sessionState = sessions.get(sessionId)!;
  return { sessionId, model: sessionState.model, cwd: sessionState.cwd };
});

// Pick a folder dialog
ipcMain.handle('copilot:pickFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: 'Select Working Directory',
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, path: null };
  }

  return { canceled: false, path: result.filePaths[0] };
});

// Check if a directory is trusted and optionally request trust
ipcMain.handle('copilot:checkDirectoryTrust', async (_event, dir: string) => {
  // Auto-trust directories under the worktree sessions directory (we created them)
  const sessionsDir = worktree.getWorktreeConfig().directory;
  if (
    dir === sessionsDir ||
    dir.startsWith(sessionsDir + '/') ||
    dir.startsWith(sessionsDir + '\\')
  ) {
    return { trusted: true, decision: 'already-trusted' };
  }

  // Check if already always-trusted (persisted)
  const alwaysTrusted = (store.get('trustedDirectories') as string[]) || [];
  if (alwaysTrusted.includes(dir)) {
    return { trusted: true, decision: 'already-trusted' };
  }

  // Check if subdirectory of always-trusted
  for (const trusted of alwaysTrusted) {
    if (dir.startsWith(trusted + '/') || dir.startsWith(trusted + '\\')) {
      return { trusted: true, decision: 'already-trusted' };
    }
  }

  // Show trust dialog
  const result = await dialog.showMessageBox(mainWindow!, {
    type: 'question',
    title: 'Trust Folder',
    message: `Do you trust the files in this folder?`,
    detail: `${dir}\n\nCopilot will be able to read, write, and execute files in this directory.`,
    buttons: ['Trust Once', 'Always Trust', "Don't Trust"],
    defaultId: 0,
    cancelId: 2,
  });

  switch (result.response) {
    case 0: // Trust Once - just return trusted, don't cache (next session will ask again)
      return { trusted: true, decision: 'once' };
    case 1: // Always Trust - persist
      if (!alwaysTrusted.includes(dir)) {
        store.set('trustedDirectories', [...alwaysTrusted, dir]);
      }
      return { trusted: true, decision: 'always' };
    default: // Don't Trust
      return { trusted: false, decision: 'denied' };
  }
});

// Close a session (when closing a tab)
ipcMain.handle('copilot:closeSession', async (_event, sessionId: string) => {
  const sessionState = sessions.get(sessionId);
  if (sessionState) {
    await sessionState.session.destroy();
    sessions.delete(sessionId);
    console.log(`Closed session ${sessionId}`);
  }

  // Update active session if needed
  if (activeSessionId === sessionId) {
    activeSessionId = sessions.keys().next().value || null;
  }

  return { success: true, remainingSessions: sessions.size };
});

// Delete a session from history (permanently removes session files)
ipcMain.handle('copilot:deleteSessionFromHistory', async (_event, sessionId: string) => {
  try {
    const client = await getClientForCwd(process.cwd());
    await client.deleteSession(sessionId);

    // Also clean up the session-state folder if it exists
    const sessionStateDir = join(getCopilotStatePath(), 'session-state', sessionId);
    if (existsSync(sessionStateDir)) {
      const { rm } = await import('fs/promises');
      await rm(sessionStateDir, { recursive: true, force: true });
      console.log(`Deleted session-state folder for ${sessionId}`);
    }

    // Clean up stored session metadata
    const sessionNames = (store.get('sessionNames') as Record<string, string>) || {};
    delete sessionNames[sessionId];
    store.set('sessionNames', sessionNames);

    const sessionMarks =
      (store.get('sessionMarks') as Record<
        string,
        { markedForReview?: boolean; reviewNote?: string }
      >) || {};
    delete sessionMarks[sessionId];
    store.set('sessionMarks', sessionMarks);

    const sessionCwds = (store.get('sessionCwds') as Record<string, string>) || {};
    delete sessionCwds[sessionId];
    store.set('sessionCwds', sessionCwds);

    console.log(`Deleted session ${sessionId} from history`);
    return { success: true };
  } catch (error) {
    console.error(`Failed to delete session ${sessionId}:`, error);
    return { success: false, error: String(error) };
  }
});

// Switch active session
ipcMain.handle('copilot:switchSession', async (_event, sessionId: string) => {
  if (!sessions.has(sessionId)) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  activeSessionId = sessionId;
  const sessionState = sessions.get(sessionId)!;
  return { sessionId, model: sessionState.model };
});

// Get always-allowed executables for a session
ipcMain.handle('copilot:getAlwaysAllowed', async (_event, sessionId: string) => {
  const sessionState = sessions.get(sessionId);
  if (!sessionState) {
    return [];
  }
  return Array.from(sessionState.alwaysAllowed);
});

// Remove an executable from always-allowed for a session
ipcMain.handle(
  'copilot:removeAlwaysAllowed',
  async (_event, data: { sessionId: string; executable: string }) => {
    const sessionState = sessions.get(data.sessionId);
    if (sessionState) {
      sessionState.alwaysAllowed.delete(data.executable);
      console.log(`[${data.sessionId}] Removed from always allow:`, data.executable);
    }
    return { success: true };
  }
);

// Add a command to always-allowed for a session (manual entry)
ipcMain.handle(
  'copilot:addAlwaysAllowed',
  async (_event, data: { sessionId: string; command: string }) => {
    const sessionState = sessions.get(data.sessionId);
    if (sessionState) {
      const normalized = normalizeAlwaysAllowed(data.command.trim());
      sessionState.alwaysAllowed.add(normalized);
      console.log(`[${data.sessionId}] Manually added to always allow:`, normalized);
    }
    return { success: true };
  }
);

// Get global safe commands
ipcMain.handle('copilot:getGlobalSafeCommands', async () => {
  return (store.get('globalSafeCommands') as string[]) || [];
});

// Add a command to global safe commands
ipcMain.handle('copilot:addGlobalSafeCommand', async (_event, command: string) => {
  const globalSafeCommands = (store.get('globalSafeCommands') as string[]) || [];
  const normalized = normalizeAlwaysAllowed(command.trim());
  if (!globalSafeCommands.includes(normalized)) {
    globalSafeCommands.push(normalized);
    store.set('globalSafeCommands', globalSafeCommands);
    console.log('Added to global safe commands:', normalized);
  }
  return { success: true };
});

// Remove a command from global safe commands
ipcMain.handle('copilot:removeGlobalSafeCommand', async (_event, command: string) => {
  const globalSafeCommands = (store.get('globalSafeCommands') as string[]) || [];
  const updated = globalSafeCommands.filter((c) => c !== command);
  store.set('globalSafeCommands', updated);
  console.log('Removed from global safe commands:', command);
  return { success: true };
});

// Favorite Models Management
ipcMain.handle('copilot:getFavoriteModels', async () => {
  return (store.get('favoriteModels') as string[]) || [];
});

ipcMain.handle('copilot:addFavoriteModel', async (_event, modelId: string) => {
  const favoriteModels = (store.get('favoriteModels') as string[]) || [];
  if (!favoriteModels.includes(modelId)) {
    favoriteModels.push(modelId);
    store.set('favoriteModels', favoriteModels);
  }
  return { success: true };
});

ipcMain.handle('copilot:removeFavoriteModel', async (_event, modelId: string) => {
  const favoriteModels = (store.get('favoriteModels') as string[]) || [];
  const updated = favoriteModels.filter((m) => m !== modelId);
  store.set('favoriteModels', updated);
  return { success: true };
});

// URL Allowlist/Denylist Management
ipcMain.handle('copilot:getAllowedUrls', async () => {
  return (store.get('allowedUrls') as string[]) || [];
});

ipcMain.handle('copilot:addAllowedUrl', async (_event, url: string) => {
  const allowedUrls = (store.get('allowedUrls') as string[]) || [];
  // Extract hostname if full URL provided
  let hostname = url.trim();
  try {
    if (hostname.includes('://')) {
      hostname = new URL(hostname).hostname;
    }
  } catch {
    // Use as-is if not a valid URL
  }
  if (!allowedUrls.includes(hostname)) {
    allowedUrls.push(hostname);
    store.set('allowedUrls', allowedUrls);
    console.log('Added to allowed URLs:', hostname);
  }
  return { success: true, hostname };
});

ipcMain.handle('copilot:removeAllowedUrl', async (_event, url: string) => {
  const allowedUrls = (store.get('allowedUrls') as string[]) || [];
  const updated = allowedUrls.filter((u) => u !== url);
  store.set('allowedUrls', updated);
  console.log('Removed from allowed URLs:', url);
  return { success: true };
});

ipcMain.handle('copilot:getDeniedUrls', async () => {
  return (store.get('deniedUrls') as string[]) || [];
});

ipcMain.handle('copilot:addDeniedUrl', async (_event, url: string) => {
  const deniedUrls = (store.get('deniedUrls') as string[]) || [];
  // Extract hostname if full URL provided
  let hostname = url.trim();
  try {
    if (hostname.includes('://')) {
      hostname = new URL(hostname).hostname;
    }
  } catch {
    // Use as-is if not a valid URL
  }
  if (!deniedUrls.includes(hostname)) {
    deniedUrls.push(hostname);
    store.set('deniedUrls', deniedUrls);
    console.log('Added to denied URLs:', hostname);
  }
  return { success: true, hostname };
});

ipcMain.handle('copilot:removeDeniedUrl', async (_event, url: string) => {
  const deniedUrls = (store.get('deniedUrls') as string[]) || [];
  const updated = deniedUrls.filter((u) => u !== url);
  store.set('deniedUrls', updated);
  console.log('Removed from denied URLs:', url);
  return { success: true };
});

// Save open session IDs to persist across restarts
ipcMain.handle('copilot:saveOpenSessions', async (_event, openSessions: StoredSession[]) => {
  store.set('openSessions', openSessions);

  // Also persist marks to sessionMarks store (for when sessions go to history)
  const sessionMarks =
    (store.get('sessionMarks') as Record<
      string,
      { markedForReview?: boolean; reviewNote?: string }
    >) || {};
  for (const session of openSessions) {
    if (session.markedForReview || session.reviewNote) {
      sessionMarks[session.sessionId] = {
        markedForReview: session.markedForReview,
        reviewNote: session.reviewNote,
      };
    } else {
      // Clean up if no longer marked
      delete sessionMarks[session.sessionId];
    }
  }
  store.set('sessionMarks', sessionMarks);

  // Persist session names so they survive when sessions move to history
  const sessionNames = (store.get('sessionNames') as Record<string, string>) || {};
  for (const session of openSessions) {
    if (session.name) {
      sessionNames[session.sessionId] = session.name;
    }
  }
  store.set('sessionNames', sessionNames);

  console.log(`Saved ${openSessions.length} open sessions with models`);
  return { success: true };
});

ipcMain.handle(
  'copilot:renameSession',
  async (_event, data: { sessionId: string; name: string }) => {
    const openSessions = (store.get('openSessions') as StoredSession[]) || [];
    const updated = openSessions.map((s) =>
      s.sessionId === data.sessionId ? { ...s, name: data.name } : s
    );
    store.set('openSessions', updated);

    // Also persist to sessionNames for when session moves to history
    const sessionNames = (store.get('sessionNames') as Record<string, string>) || {};
    sessionNames[data.sessionId] = data.name;
    store.set('sessionNames', sessionNames);

    console.log(`Renamed session ${data.sessionId} to ${data.name}`);
    return { success: true };
  }
);

// Message attachment types for persistence
interface StoredAttachment {
  messageIndex: number;
  imageAttachments?: Array<{
    id: string;
    path: string;
    previewUrl: string;
    name: string;
    size: number;
    mimeType: string;
  }>;
  fileAttachments?: Array<{
    id: string;
    path: string;
    name: string;
    size: number;
    mimeType: string;
  }>;
}

// Save message attachments for a session
ipcMain.handle(
  'copilot:saveMessageAttachments',
  async (_event, data: { sessionId: string; attachments: StoredAttachment[] }) => {
    const allAttachments =
      (store.get('messageAttachments') as Record<string, StoredAttachment[]>) || {};
    allAttachments[data.sessionId] = data.attachments;
    store.set('messageAttachments', allAttachments);
    console.log(
      `Saved ${data.attachments.length} attachment records for session ${data.sessionId}`
    );
    return { success: true };
  }
);

// Load message attachments for a session
ipcMain.handle('copilot:loadMessageAttachments', async (_event, sessionId: string) => {
  const allAttachments =
    (store.get('messageAttachments') as Record<string, StoredAttachment[]>) || {};
  const result = allAttachments[sessionId] || [];
  console.log(`Loaded ${result.length} attachment records for session ${sessionId}`);
  return { attachments: result };
});

// Git operations - get actual changed files
ipcMain.handle(
  'git:getChangedFiles',
  async (_event, data: { cwd: string; files: string[]; includeAll?: boolean }) => {
    try {
      const changedFiles: string[] = [];

      if (data.includeAll) {
        // Get ALL changed files (staged, unstaged, and untracked)
        const { stdout: status } = await execAsync('git status --porcelain', { cwd: data.cwd });
        for (const line of status.split('\n')) {
          if (line.trim()) {
            // Status format: XY filename (where XY is 2-char status)
            const filename = line.substring(3).trim();
            // Handle renamed files (format: "old -> new")
            const actualFile = filename.includes(' -> ') ? filename.split(' -> ')[1] : filename;
            if (actualFile) {
              changedFiles.push(actualFile);
            }
          }
        }
      } else {
        // Check which of the provided files actually have changes
        for (const file of data.files) {
          // Check if file has staged or unstaged changes
          const { stdout: status } = await execAsync(`git status --porcelain -- "${file}"`, {
            cwd: data.cwd,
          });
          if (status.trim()) {
            changedFiles.push(file);
          }
        }
      }

      return { success: true, files: changedFiles };
    } catch (error) {
      console.error('Git getChangedFiles failed:', error);
      return { success: false, files: [], error: String(error) };
    }
  }
);

// Git operations - get diff for files
ipcMain.handle('git:getDiff', async (_event, data: { cwd: string; files: string[] }) => {
  try {
    // Get the diff for the specified files
    const fileArgs = data.files.map((f) => `"${f}"`).join(' ');
    const { stdout } = await execAsync(`git diff HEAD -- ${fileArgs}`, { cwd: data.cwd });

    // If no diff (files might be new/untracked), get their status
    if (!stdout.trim()) {
      const { stdout: status } = await execAsync(`git status --porcelain -- ${fileArgs}`, {
        cwd: data.cwd,
      });

      // For untracked files, generate a proper diff using --no-index
      const statusLines = status.split('\n').filter(Boolean);
      const untrackedFiles = statusLines
        .filter((line) => line.startsWith('??'))
        .map((line) => line.substring(3).trim());

      if (untrackedFiles.length > 0) {
        let combinedDiff = '';
        for (const file of untrackedFiles) {
          try {
            await execAsync(`git diff --no-index -- /dev/null "${file}"`, { cwd: data.cwd });
          } catch (diffError: unknown) {
            // git diff --no-index exits with code 1 when differences are found
            const err = diffError as { stdout?: string };
            if (err.stdout) {
              combinedDiff += err.stdout + '\n';
            }
          }
        }
        if (combinedDiff.trim()) {
          return { diff: combinedDiff, success: true };
        }
      }

      return { diff: status || 'No changes detected', success: true };
    }

    return { diff: stdout, success: true };
  } catch (error) {
    console.error('Git diff failed:', error);
    return { diff: '', success: false, error: String(error) };
  }
});

// Git operations - commit and push
ipcMain.handle(
  'git:commitAndPush',
  async (_event, data: { cwd: string; files: string[]; message: string }) => {
    try {
      // Get current branch name
      const { stdout: branchOutput } = await execAsync('git branch --show-current', {
        cwd: data.cwd,
      });
      const currentBranch = branchOutput.trim();

      // First, unstage everything to ensure clean slate
      // This prevents accidentally committing previously staged files
      try {
        await execAsync('git reset HEAD', { cwd: data.cwd });
      } catch {
        // Ignore reset errors (might fail if nothing is staged or no HEAD yet)
      }

      // Stage only the specific files we want to commit
      for (const file of data.files) {
        await execAsync(`git add "${file}"`, { cwd: data.cwd });
      }

      // Commit with the message
      await execGitWithEnv(`git commit -m "${data.message.replace(/"/g, '\\"')}"`, {
        cwd: data.cwd,
      });

      // Push - handle upstream branch setting
      try {
        await execAsync('git push', { cwd: data.cwd });
      } catch (pushError) {
        // If push fails due to no upstream branch, set upstream and push
        const errorMsg = String(pushError);
        if (errorMsg.includes('has no upstream branch')) {
          // Set upstream and push
          await execAsync(`git push --set-upstream origin ${currentBranch}`, { cwd: data.cwd });
        } else {
          throw pushError;
        }
      }

      return { success: true, finalBranch: currentBranch };
    } catch (error) {
      console.error('Git commit/push failed:', error);
      return { success: false, error: String(error) };
    }
  }
);

// Git operations - check for uncommitted/unpushed changes
ipcMain.handle('git:getWorkingStatus', async (_event, cwd: string) => {
  try {
    // Check for uncommitted changes
    const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd });
    const hasUncommittedChanges = statusOutput.trim().length > 0;

    // Check for unpushed commits
    let hasUnpushedCommits = false;
    try {
      const { stdout: branch } = await execAsync('git branch --show-current', { cwd });
      const branchName = branch.trim();
      if (branchName) {
        // Check if branch has an upstream
        try {
          const { stdout: unpushed } = await execAsync(
            `git log origin/${branchName}..${branchName} --oneline`,
            { cwd }
          );
          hasUnpushedCommits = unpushed.trim().length > 0;
        } catch {
          // No upstream branch, check if there are any commits at all
          try {
            const { stdout: allCommits } = await execAsync('git log --oneline -1', { cwd });
            hasUnpushedCommits = allCommits.trim().length > 0;
          } catch {
            hasUnpushedCommits = false;
          }
        }
      }
    } catch {
      // Ignore branch errors
    }

    return {
      success: true,
      hasUncommittedChanges,
      hasUnpushedCommits,
    };
  } catch (error) {
    console.error('Git status check failed:', error);
    return {
      success: false,
      hasUncommittedChanges: false,
      hasUnpushedCommits: false,
      error: String(error),
    };
  }
});

// Git operations - check if directory is a git repository
ipcMain.handle('git:isGitRepo', async (_event, cwd: string) => {
  try {
    const gitDir = join(cwd, '.git');
    const isRepo = existsSync(gitDir);
    return { success: true, isGitRepo: isRepo };
  } catch (error) {
    console.error('Git repo check failed:', error);
    return { success: false, isGitRepo: false, error: String(error) };
  }
});

// Git operations - get current branch
ipcMain.handle('git:getBranch', async (_event, cwd: string) => {
  try {
    const { stdout } = await execAsync('git branch --show-current', { cwd });
    return { branch: stdout.trim(), success: true };
  } catch (error) {
    if (!String(error).includes('not a git repository')) {
      console.error('Git branch failed:', error);
    }
    return { branch: null, success: false, error: String(error) };
  }
});

// Git operations - list all branches (remote and local)
ipcMain.handle('git:listBranches', async (_event, cwd: string) => {
  try {
    // Fetch latest from origin first
    try {
      await execAsync('git fetch origin --prune', { cwd });
    } catch {
      // Ignore fetch errors (e.g., no network)
    }

    // Get remote branches
    const { stdout: remoteBranches } = await execAsync('git branch -r', { cwd });
    const branches = remoteBranches
      .split('\n')
      .map((b) => b.trim())
      .filter((b) => b && !b.includes('->')) // Filter out HEAD -> origin/main entries
      .map((b) => b.replace(/^origin\//, '')) // Strip origin/ prefix
      .filter((b) => b); // Remove empty strings

    // Deduplicate and sort
    const uniqueBranches = [...new Set(branches)].sort((a, b) => {
      // Put main/master first
      if (a === 'main' || a === 'master') return -1;
      if (b === 'main' || b === 'master') return 1;
      return a.localeCompare(b);
    });

    return { success: true, branches: uniqueBranches };
  } catch (error) {
    console.error('Git listBranches failed:', error);
    return { success: false, branches: [], error: String(error) };
  }
});

// Settings - get target branch for a repository
ipcMain.handle('settings:getTargetBranch', async (_event, repoPath: string) => {
  try {
    const targetBranches = (store.get('targetBranches') as Record<string, string>) || {};
    return { success: true, targetBranch: targetBranches[repoPath] || null };
  } catch (error) {
    console.error('Get target branch failed:', error);
    return { success: false, targetBranch: null, error: String(error) };
  }
});

// Settings - set target branch for a repository
ipcMain.handle(
  'settings:setTargetBranch',
  async (_event, data: { repoPath: string; targetBranch: string }) => {
    try {
      const targetBranches = (store.get('targetBranches') as Record<string, string>) || {};
      targetBranches[data.repoPath] = data.targetBranch;
      store.set('targetBranches', targetBranches);
      return { success: true };
    } catch (error) {
      console.error('Set target branch failed:', error);
      return { success: false, error: String(error) };
    }
  }
);

// Git operations - check if origin/targetBranch is ahead of current branch
ipcMain.handle(
  'git:checkMainAhead',
  async (_event, data: { cwd: string; targetBranch: string }) => {
    try {
      const cwd = data.cwd;
      const targetBranch = data.targetBranch;

      if (!targetBranch) {
        return {
          success: false,
          isAhead: false,
          commits: [],
          error: 'Target branch must be specified',
        };
      }

      // Get current branch
      const { stdout: branchOutput } = await execAsync('git branch --show-current', { cwd });
      const currentBranch = branchOutput.trim();

      // Check if current branch is the target branch
      if (currentBranch === targetBranch) {
        return { success: true, isAhead: false, commits: [] };
      }

      // Fetch latest from origin
      try {
        await execAsync('git fetch origin', { cwd });
      } catch {
        // Ignore fetch errors
      }

      // Check if origin/targetBranch has commits not in current branch
      const { stdout: aheadCommits } = await execAsync(
        `git log --oneline HEAD..origin/${targetBranch}`,
        { cwd }
      );
      const commits = aheadCommits
        .trim()
        .split('\n')
        .filter((c) => c);

      return {
        success: true,
        isAhead: commits.length > 0,
        commits,
        targetBranch,
      };
    } catch (error) {
      console.error('Git checkMainAhead failed:', error);
      return { success: false, isAhead: false, commits: [], error: String(error) };
    }
  }
);

// Git operations - merge origin/targetBranch into current branch
ipcMain.handle(
  'git:mergeMainIntoBranch',
  async (_event, data: { cwd: string; targetBranch: string }) => {
    try {
      const cwd = data.cwd;
      const targetBranch = data.targetBranch;

      if (!targetBranch) {
        return { success: false, error: 'Target branch must be specified' };
      }

      // Check for uncommitted changes
      const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd });
      const hasUncommittedChanges = statusOutput.trim().length > 0;

      // Stash changes if needed
      if (hasUncommittedChanges) {
        try {
          await execAsync('git stash push -m "Auto-stash before merging target branch"', { cwd });
        } catch (stashError) {
          return { success: false, error: `Failed to stash changes: ${String(stashError)}` };
        }
      }

      // Fetch latest
      try {
        await execAsync('git fetch origin', { cwd });
      } catch {
        // Ignore fetch errors
      }

      // Merge origin/targetBranch into current branch
      try {
        await execAsync(`git merge origin/${targetBranch}`, { cwd });
      } catch (mergeError) {
        const errorMsg = String(mergeError);
        // Pop stash before returning error
        if (hasUncommittedChanges) {
          try {
            await execAsync('git stash pop', { cwd });
          } catch {
            /* ignore */
          }
        }
        if (errorMsg.includes('CONFLICT')) {
          return {
            success: false,
            error: `Merge conflicts detected. Please resolve them manually.`,
          };
        }
        return { success: false, error: `Failed to merge origin/${targetBranch}: ${errorMsg}` };
      }

      // Pop the stash to restore changes
      if (hasUncommittedChanges) {
        try {
          await execAsync('git stash pop', { cwd });
        } catch (popError) {
          const errorMsg = String(popError);
          if (errorMsg.includes('CONFLICT')) {
            // Get the list of conflicted files
            let conflictedFiles: string[] = [];
            try {
              const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd });
              conflictedFiles = statusOutput
                .split('\n')
                .filter(
                  (line) =>
                    line.startsWith('UU') ||
                    line.startsWith('AA') ||
                    line.startsWith('DD') ||
                    line.startsWith('AU') ||
                    line.startsWith('UA') ||
                    line.startsWith('DU') ||
                    line.startsWith('UD')
                )
                .map((line) => line.slice(3).trim());
            } catch {
              // Ignore status errors
            }
            return {
              success: true,
              targetBranch,
              warning:
                'Merged successfully, but conflicts occurred when restoring your changes. Please resolve them.',
              conflictedFiles,
            };
          }
          // If pop failed for other reasons, try to recover
          return {
            success: true,
            targetBranch,
            warning:
              'Merged successfully, but failed to restore stashed changes. Run "git stash pop" manually.',
          };
        }
      }

      return { success: true, targetBranch };
    } catch (error) {
      console.error('Git mergeMainIntoBranch failed:', error);
      return { success: false, error: String(error) };
    }
  }
);

// Git operations - checkout (create) branch
ipcMain.handle('git:checkoutBranch', async (_event, data: { cwd: string; branchName: string }) => {
  try {
    const branch = (data.branchName || '').trim();
    if (!branch) {
      return { success: false, error: 'Branch name is required' };
    }
    // Prefer `git switch -c` when available
    try {
      await execAsync(`git switch -c "${branch.replace(/"/g, '\\"')}"`, { cwd: data.cwd });
    } catch {
      await execAsync(`git checkout -b "${branch.replace(/"/g, '\\"')}"`, { cwd: data.cwd });
    }
    return { success: true };
  } catch (error) {
    console.error('Git checkout branch failed:', error);
    return { success: false, error: String(error) };
  }
});

// Git operations - merge worktree branch to main/master
ipcMain.handle(
  'git:mergeToMain',
  async (
    _event,
    data: { cwd: string; deleteBranch?: boolean; targetBranch: string; untrackedFiles?: string[] }
  ) => {
    try {
      // Get current branch name
      const { stdout: branchOutput } = await execAsync('git branch --show-current', {
        cwd: data.cwd,
      });
      const currentBranch = branchOutput.trim();

      if (!currentBranch) {
        return { success: false, error: 'Not on a branch (detached HEAD)' };
      }

      // Target branch is required - must be provided by caller
      const targetBranch = data.targetBranch;
      if (!targetBranch) {
        return { success: false, error: 'Target branch must be specified' };
      }

      // Check if already on the target branch
      if (currentBranch === targetBranch) {
        return { success: false, error: `Already on ${targetBranch} branch` };
      }

      // Check if we're in a worktree by comparing git-dir and git-common-dir
      const { stdout: gitDir } = await execAsync('git rev-parse --git-dir', { cwd: data.cwd });
      const { stdout: commonDir } = await execAsync('git rev-parse --git-common-dir', {
        cwd: data.cwd,
      });
      const isWorktree = gitDir.trim() !== commonDir.trim();

      // Get the main repository path (where target branch is checked out)
      let mainRepoPath = data.cwd;
      if (isWorktree) {
        // commonDir points to the .git folder of the main repo
        // The main repo is one level up from the .git folder
        const commonDirPath = commonDir.trim();
        mainRepoPath = dirname(commonDirPath);
      }

      // Check for uncommitted changes (excluding untracked/excluded files)
      const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: data.cwd });
      let didGitStash = false;
      if (statusOutput.trim()) {
        // Parse uncommitted files from git status
        // Format is like: " M file.txt" or "?? newfile.txt" or "A  staged.txt"
        const uncommittedFiles = statusOutput
          .trim()
          .split('\n')
          .map((line) => line.substring(3).trim()) // Remove status prefix (e.g., " M ", "?? ")
          .filter((f) => f);

        const untrackedFiles = data.untrackedFiles || [];

        // Check if each uncommitted file is in our untracked list
        // Use flexible matching: check if paths end with the same filename or match exactly
        const isFileUntracked = (gitPath: string) => {
          return untrackedFiles.some((untracked) => {
            // Exact match
            if (gitPath === untracked) return true;
            // Git path ends with untracked path
            if (gitPath.endsWith('/' + untracked) || gitPath.endsWith('\\' + untracked))
              return true;
            // Untracked path ends with git path
            if (untracked.endsWith('/' + gitPath) || untracked.endsWith('\\' + gitPath))
              return true;
            // Both are just filenames and match
            const gitName = gitPath.split(/[/\\]/).pop();
            const untrackedName = untracked.split(/[/\\]/).pop();
            if (gitName === untrackedName && gitName === gitPath && untrackedName === untracked)
              return true;
            return false;
          });
        };

        const nonUntrackedUncommitted = uncommittedFiles.filter((f) => !isFileUntracked(f));

        if (nonUntrackedUncommitted.length > 0) {
          console.log('Uncommitted files not in untracked list:', nonUntrackedUncommitted);
          console.log('Untracked files list:', untrackedFiles);
          console.log('All uncommitted files:', uncommittedFiles);
          return {
            success: false,
            error: 'Uncommitted changes exist. Please commit or stash them first.',
          };
        }
        // All uncommitted files are untracked (excluded from commit), so git stash them temporarily
        if (uncommittedFiles.length > 0) {
          try {
            // Use -u to include untracked files, -k to keep index
            await execAsync('git stash push -u -m "cooper-temp-stash"', { cwd: data.cwd });
            didGitStash = true;
          } catch (stashError) {
            console.error('Git stash failed:', stashError);
            return {
              success: false,
              error: `Failed to temporarily stash untracked files: ${String(stashError)}`,
            };
          }
        }
      }

      // Push current branch first
      try {
        await execAsync('git push', { cwd: data.cwd });
      } catch (pushError) {
        const errorMsg = String(pushError);
        if (errorMsg.includes('has no upstream branch')) {
          await execAsync(`git push --set-upstream origin ${currentBranch}`, { cwd: data.cwd });
        } else {
          throw pushError;
        }
      }

      // For worktrees, we need to run merge commands from the main repo
      // because main/master is checked out there
      if (isWorktree) {
        // Check if main repo has uncommitted changes or unresolved conflicts
        const { stdout: mainRepoStatus } = await execAsync('git status --porcelain', {
          cwd: mainRepoPath,
        });
        if (mainRepoStatus.trim()) {
          const hasConflicts =
            mainRepoStatus.includes('UU') ||
            mainRepoStatus.includes('AA') ||
            mainRepoStatus.includes('DD');
          if (hasConflicts) {
            return {
              success: false,
              error: `Main repository has unresolved merge conflicts. Please resolve conflicts in ${mainRepoPath} first.`,
            };
          }
          return {
            success: false,
            error: `Main repository has uncommitted changes. Please commit or stash changes in ${mainRepoPath} first.`,
          };
        }

        // Check what branch is currently checked out in main repo
        const { stdout: mainRepoBranch } = await execAsync('git branch --show-current', {
          cwd: mainRepoPath,
        });
        const currentMainRepoBranch = mainRepoBranch.trim();

        // If target branch is different from what's checked out in main repo, switch to it
        if (currentMainRepoBranch !== targetBranch) {
          try {
            await execAsync(`git checkout ${targetBranch}`, { cwd: mainRepoPath });
          } catch (checkoutError) {
            return {
              success: false,
              error: `Failed to checkout ${targetBranch} in main repository: ${String(checkoutError)}`,
            };
          }
        }

        // Pull latest on target branch in the main repo
        try {
          await execAsync('git pull', { cwd: mainRepoPath });
        } catch (pullError) {
          const errorMsg = String(pullError);
          if (errorMsg.includes('CONFLICT')) {
            return {
              success: false,
              error: `Pull resulted in merge conflicts in ${mainRepoPath}. Please resolve manually.`,
            };
          }
          // Ignore other pull errors (might be a new repo)
        }

        // Fetch latest to ensure we have the most recent main
        try {
          await execAsync('git fetch origin', { cwd: data.cwd });
        } catch {
          // Ignore fetch errors
        }

        // Rebase feature branch on top of main to incorporate any changes (like version bumps)
        // This ensures merge to main will be clean/fast-forward
        try {
          await execAsync(`git rebase origin/${targetBranch}`, { cwd: data.cwd });
        } catch (rebaseError) {
          const errorMsg = String(rebaseError);
          if (errorMsg.includes('CONFLICT')) {
            // Abort the rebase and return error
            try {
              await execAsync('git rebase --abort', { cwd: data.cwd });
            } catch {
              // Ignore abort errors
            }
            return {
              success: false,
              error: `Rebase conflicts detected when updating '${currentBranch}' with changes from ${targetBranch}. Please rebase manually.`,
            };
          }
          // If rebase fails for other reasons, continue with merge attempt
          console.warn('Rebase failed, continuing with direct merge:', errorMsg);
        }

        // Force push the rebased branch (since we rebased, history changed)
        try {
          await execAsync(`git push --force-with-lease`, { cwd: data.cwd });
        } catch (pushError) {
          const errorMsg = String(pushError);
          if (errorMsg.includes('has no upstream branch')) {
            await execAsync(`git push --set-upstream origin ${currentBranch}`, { cwd: data.cwd });
          } else {
            // Ignore other push errors, continue with merge
            console.warn('Force push after rebase failed:', errorMsg);
          }
        }

        // Merge the feature branch into main (from the main repo) using squash
        // This combines all commits into a single commit
        try {
          await execAsync(`git merge --squash ${currentBranch}`, { cwd: mainRepoPath });
          // Squash merge doesn't auto-commit, so we need to create the commit
          await execGitWithEnv(`git commit -m "Merge branch '${currentBranch}'"`, {
            cwd: mainRepoPath,
          });
        } catch (mergeError) {
          const errorMsg = String(mergeError);
          if (errorMsg.includes('CONFLICT')) {
            return {
              success: false,
              error: `Merge conflicts detected when merging '${currentBranch}' into ${targetBranch}. Please resolve conflicts in ${mainRepoPath} manually.`,
            };
          }
          return { success: false, error: `Failed to merge '${currentBranch}': ${errorMsg}` };
        }

        // Push main/master from the main repo
        try {
          await execAsync('git push', { cwd: mainRepoPath });
        } catch (pushError) {
          return { success: false, error: `Merge succeeded but push failed: ${String(pushError)}` };
        }
      } else {
        // Standard flow for non-worktree repos
        // Switch to main/master
        try {
          await execAsync(`git checkout ${targetBranch}`, { cwd: data.cwd });
        } catch (checkoutError) {
          return {
            success: false,
            error: `Failed to checkout ${targetBranch}: ${String(checkoutError)}`,
          };
        }

        // Pull latest
        try {
          await execAsync('git pull', { cwd: data.cwd });
        } catch (pullError) {
          const errorMsg = String(pullError);
          if (errorMsg.includes('CONFLICT')) {
            return {
              success: false,
              error: `Pull resulted in merge conflicts. Please resolve manually.`,
            };
          }
          // Ignore other pull errors (might be a new repo)
        }

        // Merge the feature branch using squash
        // This combines all commits into a single commit
        try {
          await execAsync(`git merge --squash ${currentBranch}`, { cwd: data.cwd });
          // Squash merge doesn't auto-commit, so we need to create the commit
          await execGitWithEnv(`git commit -m "Merge branch '${currentBranch}'"`, {
            cwd: data.cwd,
          });
        } catch (mergeError) {
          const errorMsg = String(mergeError);
          if (errorMsg.includes('CONFLICT')) {
            return {
              success: false,
              error: `Merge conflicts detected when merging '${currentBranch}' into ${targetBranch}. Please resolve conflicts manually.`,
            };
          }
          return { success: false, error: `Failed to merge '${currentBranch}': ${errorMsg}` };
        }

        // Push main/master
        try {
          await execAsync('git push', { cwd: data.cwd });
        } catch (pushError) {
          return { success: false, error: `Merge succeeded but push failed: ${String(pushError)}` };
        }
      }

      // Optionally delete the feature branch
      if (data.deleteBranch) {
        try {
          await execAsync(`git branch -d ${currentBranch}`, { cwd: mainRepoPath });
          await execAsync(`git push origin --delete ${currentBranch}`, { cwd: mainRepoPath });
        } catch {
          // Ignore branch deletion errors
        }
      }

      // Restore stashed files if we stashed them and didn't delete the branch
      if (didGitStash && !data.deleteBranch) {
        try {
          await execAsync('git stash pop', { cwd: data.cwd });
        } catch {
          // Ignore stash pop errors - the stash might have been consumed
        }
      }

      return { success: true, mergedBranch: currentBranch, targetBranch };
    } catch (error) {
      console.error('Git merge to main failed:', error);
      // Try to restore stash on error if we stashed
      if (didGitStash) {
        try {
          await execAsync('git stash pop', { cwd: data.cwd });
        } catch {
          // Ignore
        }
      }
      return { success: false, error: String(error) };
    }
  }
);

// Git operations - create pull request via gh CLI
ipcMain.handle(
  'git:createPullRequest',
  async (
    _event,
    data: {
      cwd: string;
      title?: string;
      draft?: boolean;
      targetBranch: string;
      untrackedFiles?: string[];
      sourceIssue?: { url: string; number: number; owner: string; repo: string };
    }
  ) => {
    try {
      // Check if gh CLI is available (use augmented PATH for packaged apps)
      try {
        await execGitWithEnv('gh --version', { cwd: data.cwd });
      } catch {
        return {
          success: false,
          error: 'GitHub CLI (gh) is not installed. Install it from https://cli.github.com/',
        };
      }

      // Get current branch name
      const { stdout: branchOutput } = await execGitWithEnv('git branch --show-current', {
        cwd: data.cwd,
      });
      const currentBranch = branchOutput.trim();

      if (!currentBranch) {
        return { success: false, error: 'Not on a branch (detached HEAD)' };
      }

      // Target branch is required - must be provided by caller
      const targetBranch = data.targetBranch;
      if (!targetBranch) {
        return { success: false, error: 'Target branch must be specified' };
      }

      // Check if trying to create PR from target branch to itself
      if (currentBranch === targetBranch) {
        return { success: false, error: `Cannot create PR from ${targetBranch} to itself` };
      }

      // Check for uncommitted changes (excluding untracked/excluded files)
      const { stdout: statusOutput } = await execGitWithEnv('git status --porcelain', {
        cwd: data.cwd,
      });
      if (statusOutput.trim()) {
        // Parse uncommitted files from git status
        const uncommittedFiles = statusOutput
          .trim()
          .split('\n')
          .map((line) => line.substring(3).trim())
          .filter((f) => f);

        const untrackedFiles = data.untrackedFiles || [];

        // Check if each uncommitted file is in our untracked list (flexible matching)
        const isFileUntracked = (gitPath: string) => {
          return untrackedFiles.some((untracked) => {
            if (gitPath === untracked) return true;
            if (gitPath.endsWith('/' + untracked) || gitPath.endsWith('\\' + untracked))
              return true;
            if (untracked.endsWith('/' + gitPath) || untracked.endsWith('\\' + gitPath))
              return true;
            const gitName = gitPath.split(/[/\\]/).pop();
            const untrackedName = untracked.split(/[/\\]/).pop();
            if (gitName === untrackedName && gitName === gitPath && untrackedName === untracked)
              return true;
            return false;
          });
        };

        const nonUntrackedUncommitted = uncommittedFiles.filter((f) => !isFileUntracked(f));

        if (nonUntrackedUncommitted.length > 0) {
          return { success: false, error: 'Uncommitted changes exist. Please commit them first.' };
        }
        // All uncommitted files are untracked, this is fine for PR - they won't be in the PR
      }

      // Push current branch
      try {
        await execGitWithEnv('git push', { cwd: data.cwd });
      } catch (pushError) {
        const errorMsg = String(pushError);
        if (errorMsg.includes('has no upstream branch')) {
          await execGitWithEnv(`git push --set-upstream origin ${currentBranch}`, {
            cwd: data.cwd,
          });
        } else {
          throw pushError;
        }
      }

      // Get remote URL to construct PR URL
      const { stdout: remoteUrl } = await execGitWithEnv('git remote get-url origin', {
        cwd: data.cwd,
      });
      const remote = remoteUrl.trim();

      // Parse GitHub URL from remote (handles both HTTPS and SSH formats)
      let repoPath = '';
      if (remote.startsWith('git@github.com:')) {
        repoPath = remote.replace('git@github.com:', '').replace(/\.git$/, '');
      } else if (remote.includes('github.com')) {
        const match = remote.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/);
        repoPath = match ? match[1] : '';
      }

      if (!repoPath) {
        return { success: false, error: 'Could not parse GitHub repository from remote URL' };
      }

      // Construct PR creation URL - GitHub will auto-fill the form
      const title = data.title || currentBranch.replace(/[-_]/g, ' ');
      const encodedTitle = encodeURIComponent(title);

      // Build PR URL with optional body that links to source issue
      let prUrl = `https://github.com/${repoPath}/compare/${targetBranch}...${currentBranch}?quick_pull=1&title=${encodedTitle}`;

      // If this session was created from a GitHub issue, add body to link PR to issue
      if (data.sourceIssue) {
        // Use "Closes" keyword to auto-close the issue when PR is merged
        // Check if PR is in the same repo as the issue
        const [prOwner, prRepo] = repoPath.split('/');
        const isSameRepo =
          prOwner.toLowerCase() === data.sourceIssue.owner.toLowerCase() &&
          prRepo.toLowerCase() === data.sourceIssue.repo.toLowerCase();

        const issueRef = isSameRepo
          ? `#${data.sourceIssue.number}` // Same repo: use short reference
          : `${data.sourceIssue.owner}/${data.sourceIssue.repo}#${data.sourceIssue.number}`; // Different repo: use full reference

        const body = `Closes ${issueRef}`;
        prUrl += `&body=${encodeURIComponent(body)}`;
      }

      return { success: true, prUrl, branch: currentBranch, targetBranch };
    } catch (error) {
      console.error('Create PR failed:', error);
      return { success: false, error: String(error) };
    }
  }
);

// Resume a previous session (from the history list)
ipcMain.handle('copilot:resumePreviousSession', async (_event, sessionId: string, cwd?: string) => {
  // Check if already resumed
  if (sessions.has(sessionId)) {
    const sessionState = sessions.get(sessionId)!;
    return { sessionId, model: sessionState.model, cwd: sessionState.cwd, alreadyOpen: true };
  }

  const sessionModel = (store.get('model') as string) || 'gpt-5.2';
  // Use provided cwd, or look up stored cwd, or fall back to default
  const sessionCwds = (store.get('sessionCwds') as Record<string, string>) || {};
  const defaultCwd = app.isPackaged ? app.getPath('home') : process.cwd();
  const sessionCwd = cwd || sessionCwds[sessionId] || defaultCwd;

  // Get or create client for this cwd
  const client = await getClientForCwd(sessionCwd);

  // Load MCP servers config
  const mcpConfig = await readMcpConfig();

  const session = await client.resumeSession(sessionId, {
    mcpServers: mcpConfig.mcpServers,
    tools: createBrowserTools(sessionId),
    onPermissionRequest: (request, invocation) =>
      handlePermissionRequest(request, invocation, sessionId),
  });

  // Set up event handler
  session.on((event) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    log.debug(`[${sessionId}] Event: ${event.type}`);

    if (event.type === 'assistant.message_delta') {
      mainWindow.webContents.send('copilot:delta', { sessionId, content: event.data.deltaContent });
    } else if (event.type === 'assistant.message') {
      mainWindow.webContents.send('copilot:message', { sessionId, content: event.data.content });
    } else if (event.type === 'session.idle') {
      const currentSessionState = sessions.get(sessionId);
      if (currentSessionState) currentSessionState.isProcessing = false;
      mainWindow.webContents.send('copilot:idle', { sessionId });
      requestUserAttention();
    } else if (event.type === 'tool.execution_start') {
      log.debug(`[${sessionId}] Tool start: ${event.data.toolName} (${event.data.toolCallId})`);
      mainWindow.webContents.send('copilot:tool-start', {
        sessionId,
        toolCallId: event.data.toolCallId,
        toolName: event.data.toolName,
        input: event.data.arguments || (event.data as Record<string, unknown>),
      });
    } else if (event.type === 'tool.execution_complete') {
      log.debug(`[${sessionId}] Tool end: ${event.data.toolCallId}`);
      const completeData = event.data as Record<string, unknown>;
      mainWindow.webContents.send('copilot:tool-end', {
        sessionId,
        toolCallId: event.data.toolCallId,
        toolName: completeData.toolName,
        input: completeData.arguments || completeData,
        output: event.data.result?.content || completeData.output,
      });
    } else if (event.type === 'session.error') {
      console.log(`[${sessionId}] Session error:`, event.data);
      const errorMessage = event.data?.message || JSON.stringify(event.data);

      // Auto-repair tool_result errors (duplicate or orphaned after compaction)
      if (
        errorMessage.includes('multiple `tool_result` blocks') ||
        errorMessage.includes('each tool_use must have a single result') ||
        errorMessage.includes('unexpected `tool_use_id`') ||
        errorMessage.includes('Each `tool_result` block must have a corresponding `tool_use`')
      ) {
        log.info(`[${sessionId}] Detected tool_result corruption error, attempting auto-repair...`);
        repairDuplicateToolResults(sessionId).then((repaired) => {
          if (repaired) {
            mainWindow?.webContents.send('copilot:error', {
              sessionId,
              message: 'Session repaired. Please resend your last message.',
              isRepaired: true,
            });
          } else {
            mainWindow?.webContents.send('copilot:error', { sessionId, message: errorMessage });
          }
        });
        return;
      }

      mainWindow.webContents.send('copilot:error', { sessionId, message: errorMessage });
    } else if (event.type === 'session.usage_info') {
      mainWindow.webContents.send('copilot:usageInfo', {
        sessionId,
        tokenLimit: event.data.tokenLimit,
        currentTokens: event.data.currentTokens,
        messagesLength: event.data.messagesLength,
      });
    } else if (event.type === 'subagent.selected') {
      mainWindow.webContents.send('copilot:agentSelected', {
        sessionId,
        agentName: event.data.agentName,
        agentDisplayName: event.data.agentDisplayName,
      });
    } else if (event.type === 'subagent.started') {
      console.log(
        `[${sessionId}] 🤖 Subagent started: ${event.data.agentDisplayName} (${event.data.toolCallId})`
      );
      mainWindow.webContents.send('copilot:subagent-started', {
        sessionId,
        toolCallId: event.data.toolCallId,
        agentName: event.data.agentName,
        agentDisplayName: event.data.agentDisplayName,
        agentDescription: event.data.agentDescription,
      });
    } else if (event.type === 'subagent.completed') {
      console.log(
        `[${sessionId}] ✓ Subagent completed: ${event.data.agentName} (${event.data.toolCallId})`
      );
      mainWindow.webContents.send('copilot:subagent-completed', {
        sessionId,
        toolCallId: event.data.toolCallId,
        agentName: event.data.agentName,
      });
    } else if (event.type === 'subagent.failed') {
      console.log(
        `✗ [${sessionId}] Subagent failed: ${event.data.agentName} (${event.data.toolCallId}): ${event.data.error}`
      );
      mainWindow.webContents.send('copilot:subagent-failed', {
        sessionId,
        toolCallId: event.data.toolCallId,
        agentName: event.data.agentName,
        error: event.data.error,
      });
    } else if (event.type === 'session.compaction_start') {
      console.log(`[${sessionId}] Compaction started`);
      mainWindow.webContents.send('copilot:compactionStart', { sessionId });
    } else if (event.type === 'session.compaction_complete') {
      console.log(`[${sessionId}] Compaction complete:`, event.data);
      mainWindow.webContents.send('copilot:compactionComplete', {
        sessionId,
        success: event.data.success,
        preCompactionTokens: event.data.preCompactionTokens,
        postCompactionTokens: event.data.postCompactionTokens,
        tokensRemoved: event.data.tokensRemoved,
        summaryContent: event.data.summaryContent,
        error: event.data.error,
      });
    }
  });

  sessions.set(sessionId, {
    session,
    client,
    model: sessionModel,
    cwd: sessionCwd,
    alwaysAllowed: new Set(),
    allowedPaths: new Set(),
    isProcessing: false,
    yoloMode: false,
  });
  activeSessionId = sessionId;

  console.log(`Resumed previous session ${sessionId} in ${sessionCwd}`);
  return { sessionId, model: sessionModel, cwd: sessionCwd, alreadyOpen: false };
});

// CLI Setup & Authentication
ipcMain.handle('copilot:checkCliStatus', async () => {
  return await checkCliStatus();
});

ipcMain.handle('copilot:installCli', async () => {
  try {
    // Check if npm is available
    const { npmAvailable } = await checkCliStatus();
    if (!npmAvailable) {
      return { success: false, error: 'npm is not available' };
    }

    // Return success - caller will run the command in terminal
    // (We don't actually run it here, the UI will use the terminal)
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

let authLoginInProgress = false;

ipcMain.handle('copilot:authLogin', async () => {
  if (authLoginInProgress) {
    return { success: false, error: 'Authentication already in progress' };
  }

  authLoginInProgress = true;
  try {
    const cliPath = getCliPath();
    if (!existsSync(cliPath)) {
      return { success: false, error: 'Copilot CLI not found' };
    }

    return new Promise<{ success: boolean; error?: string; url?: string; code?: string }>(
      (resolve) => {
        const child = spawn(cliPath, ['login'], {
          env: getAugmentedEnv(),
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        let deviceUrl = '';
        let deviceCode = '';
        let deviceFlowSent = false;

        const parseDeviceFlow = (data: string) => {
          // Parse: "visit https://github.com/login/device and enter code XXXX-XXXX"
          const urlMatch = data.match(/(https:\/\/github\.com\/login\/device)/);
          const codeMatch = data.match(/enter code\s+([A-Z0-9]{4}-[A-Z0-9]{4})/);
          if (urlMatch) deviceUrl = urlMatch[1];
          if (codeMatch) deviceCode = codeMatch[1];

          // Send device flow info to renderer once
          if (deviceUrl && deviceCode && mainWindow && !deviceFlowSent) {
            deviceFlowSent = true;
            mainWindow.webContents.send('copilot:authDeviceFlow', {
              url: deviceUrl,
              code: deviceCode,
            });
          }
        };

        child.stdout?.on('data', (data: Buffer) => {
          const text = data.toString();
          stdout += text;
          parseDeviceFlow(stdout);
        });

        child.stderr?.on('data', (data: Buffer) => {
          const text = data.toString();
          stderr += text;
          parseDeviceFlow(stderr);
        });

        child.on('close', (exitCode) => {
          authLoginInProgress = false;
          if (exitCode === 0) {
            resolve({ success: true, url: deviceUrl, code: deviceCode });
          } else {
            resolve({
              success: false,
              error: stderr || stdout || `Login failed with exit code ${exitCode}`,
            });
          }
        });

        child.on('error', (err) => {
          authLoginInProgress = false;
          child.kill();
          resolve({ success: false, error: String(err) });
        });
      }
    );
  } catch (error) {
    authLoginInProgress = false;
    return { success: false, error: String(error) };
  }
});

// MCP Server Management
ipcMain.handle('mcp:getConfig', async () => {
  const config = await readMcpConfig();
  return config;
});

ipcMain.handle('mcp:saveConfig', async (_event, config: MCPConfigFile) => {
  await writeMcpConfig(config);
  return { success: true };
});

ipcMain.handle('mcp:addServer', async (_event, data: { name: string; server: MCPServerConfig }) => {
  const config = await readMcpConfig();
  config.mcpServers[data.name] = data.server;
  await writeMcpConfig(config);
  return { success: true };
});

ipcMain.handle(
  'mcp:updateServer',
  async (_event, data: { name: string; server: MCPServerConfig }) => {
    const config = await readMcpConfig();
    if (config.mcpServers[data.name]) {
      config.mcpServers[data.name] = data.server;
      await writeMcpConfig(config);
      return { success: true };
    }
    return { success: false, error: 'Server not found' };
  }
);

ipcMain.handle('mcp:deleteServer', async (_event, name: string) => {
  const config = await readMcpConfig();
  if (config.mcpServers[name]) {
    delete config.mcpServers[name];
    await writeMcpConfig(config);
    return { success: true };
  }
  return { success: false, error: 'Server not found' };
});

ipcMain.handle('mcp:getConfigPath', async () => {
  return { path: getMcpConfigPath() };
});

// Agent Skills handlers
ipcMain.handle('skills:getAll', async (_event, cwd?: string) => {
  // Use provided cwd or try to get from active session
  let workingDir = cwd;
  if (!workingDir && sessions.size > 0) {
    // Get cwd from first active session
    const firstSession = sessions.values().next().value;
    if (firstSession) {
      workingDir = firstSession.cwd;
    }
  }

  const gitRoot = workingDir ? await getGitRoot(workingDir) : null;
  const projectRoot = gitRoot || workingDir;
  const result = await getAllSkills(projectRoot);
  console.log(`Found ${result.skills.length} skills (${result.errors.length} errors)`);
  return result;
});

// Agent discovery handlers
ipcMain.handle('agents:getAll', async (_event, cwd?: string) => {
  let workingDir = cwd;
  if (!workingDir && sessions.size > 0) {
    const firstSession = sessions.values().next().value;
    if (firstSession) {
      workingDir = firstSession.cwd;
    }
  }

  const gitRoot = workingDir ? await getGitRoot(workingDir) : null;
  const projectRoot = gitRoot || workingDir;

  const result = await getAllAgents(projectRoot, workingDir);
  return result;
});

// Copilot Instructions handlers
ipcMain.handle('instructions:getAll', async (_event, cwd?: string) => {
  let workingDir = cwd;
  if (!workingDir && sessions.size > 0) {
    const firstSession = sessions.values().next().value;
    if (firstSession) {
      workingDir = firstSession.cwd;
    }
  }

  // Detect git root for proper instruction discovery
  const gitRoot = workingDir ? await getGitRoot(workingDir) : null;
  const projectRoot = gitRoot || workingDir;

  const result = await getAllInstructions(projectRoot, workingDir);
  console.log(`Found ${result.instructions.length} instructions (${result.errors.length} errors)`);
  return result;
});

// Browser session management handlers
ipcMain.handle('browser:hasActive', async () => {
  return { active: browserManager.hasActiveBrowser() };
});

ipcMain.handle('browser:getActiveSessions', async () => {
  return { sessions: browserManager.getActiveBrowserSessions() };
});

ipcMain.handle('browser:close', async (_event, sessionId?: string) => {
  if (sessionId) {
    await browserManager.closeSessionPage(sessionId);
  } else {
    await browserManager.closeBrowser();
  }
  return { success: true };
});

ipcMain.handle('browser:saveState', async () => {
  await browserManager.saveBrowserState();
  return { success: true };
});

// Window control handlers
ipcMain.on('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('window:close', () => {
  mainWindow?.close();
});

ipcMain.on('window:quit', () => {
  app.quit();
});

ipcMain.on(
  'window:updateTitleBarOverlay',
  (_event, options: { color: string; symbolColor: string }) => {
    if (process.platform === 'win32' && mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.setTitleBarOverlay({
          color: options.color,
          symbolColor: options.symbolColor,
          height: 38,
        });
      } catch {
        // setTitleBarOverlay may not be available on older Electron versions
      }
    }
  }
);

ipcMain.handle('window:getZoomFactor', () => {
  const storedZoom = clampZoomFactor(store.get('zoomFactor') as number);
  const currentZoom = mainWindow?.webContents.getZoomFactor() ?? storedZoom;
  return { zoomFactor: clampZoomFactor(currentZoom) };
});

ipcMain.handle('window:setZoomFactor', (_event, zoomFactor: number) => {
  const clamped = clampZoomFactor(zoomFactor);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.setZoomFactor(clamped);
  }
  store.set('zoomFactor', clamped);
  broadcastZoomFactor(clamped);
  return { zoomFactor: clamped };
});

ipcMain.handle('window:zoomIn', () => {
  const current = mainWindow?.webContents.getZoomFactor() ?? DEFAULT_ZOOM_FACTOR;
  const next = clampZoomFactor(parseFloat((current + ZOOM_STEP).toFixed(2)));
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.setZoomFactor(next);
  }
  store.set('zoomFactor', next);
  broadcastZoomFactor(next);
  return { zoomFactor: next };
});

ipcMain.handle('window:zoomOut', () => {
  const current = mainWindow?.webContents.getZoomFactor() ?? DEFAULT_ZOOM_FACTOR;
  const next = clampZoomFactor(parseFloat((current - ZOOM_STEP).toFixed(2)));
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.setZoomFactor(next);
  }
  store.set('zoomFactor', next);
  broadcastZoomFactor(next);
  return { zoomFactor: next };
});

ipcMain.handle('window:resetZoom', () => {
  const next = DEFAULT_ZOOM_FACTOR;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.setZoomFactor(next);
  }
  store.set('zoomFactor', next);
  broadcastZoomFactor(next);
  return { zoomFactor: next };
});

// Theme handlers
ipcMain.handle('theme:get', () => {
  return store.get('theme') as string;
});

ipcMain.handle('theme:set', (_event, themeId: string) => {
  store.set('theme', themeId);
  return { success: true };
});

ipcMain.handle('theme:getSystemTheme', () => {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
});

ipcMain.handle('theme:listExternal', () => {
  return loadExternalThemes();
});

ipcMain.handle('theme:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [{ name: 'Theme Files', extensions: ['json'] }],
    title: 'Import Theme',
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, canceled: true };
  }

  const sourcePath = result.filePaths[0];
  const fileName = sourcePath.split(/[/\\]/).pop() || 'theme.json';

  try {
    const content = readFileSync(sourcePath, 'utf-8');
    const data = JSON.parse(content);
    const validationResult = validateTheme(data);

    if (!validationResult.valid) {
      return { success: false, error: 'Theme file is not valid' };
    }

    // Copy to themes directory
    const destPath = join(themesDir, fileName);
    copyFileSync(sourcePath, destPath);

    return { success: true, theme: validationResult.theme };
  } catch {
    return { success: false, error: 'Theme file is not valid' };
  }
});

ipcMain.handle('theme:getThemesDir', () => {
  return themesDir;
});

// Listen to system theme changes and notify renderer
nativeTheme.on('updated', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('theme:systemChanged', {
      systemTheme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
    });
  }
});

// App lifecycle - enforce single instance (skip in dev/test mode)
const isDev = !!process.env.ELECTRON_RENDERER_URL;
const isTest = process.env.NODE_ENV === 'test';
const gotTheLock = isDev || isTest ? true : app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  if (!isDev && !isTest) {
    app.on('second-instance', () => {
      // Focus existing window if someone tries to open a second instance
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  }

  app.whenReady().then(() => {
    // Start CopilotClient initialization early - runs in parallel with window load
    // This saves ~500ms by not waiting for the renderer to finish loading first
    startEarlyClientInit();

    // Start session resumption early - runs in parallel with window load
    // This saves several seconds since session resumption involves network calls
    earlyResumptionPromise = startEarlySessionResumption();

    console.log(
      `Initial models: ${BASELINE_MODELS.length} baseline + ${FALLBACK_MODELS.length} fallback`
    );

    // Set up custom application menu
    // We remove accelerators for Ctrl/Cmd+C,V,X to allow the terminal to handle them directly
    // The terminal handles copy/paste via xterm's own mechanisms
    const isMac = process.platform === 'darwin';
    const template: Electron.MenuItemConstructorOptions[] = [
      // App menu (macOS only)
      ...(isMac
        ? [
            {
              label: app.name,
              submenu: [
                { role: 'about' as const },
                { type: 'separator' as const },
                { role: 'services' as const },
                { type: 'separator' as const },
                { role: 'hide' as const },
                { role: 'hideOthers' as const },
                { role: 'unhide' as const },
                { type: 'separator' as const },
                { role: 'quit' as const },
              ],
            },
          ]
        : []),
      // Edit menu - explicitly without accelerators for copy/paste/cut so terminal can handle them
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' as const },
          { role: 'redo' as const },
          { type: 'separator' as const },
          // No accelerators for cut/copy/paste - let the focused element handle them
          { label: 'Cut', role: 'cut' as const, accelerator: undefined },
          { label: 'Copy', role: 'copy' as const, accelerator: undefined },
          { label: 'Paste', role: 'paste' as const, accelerator: undefined },
          { type: 'separator' as const },
          { role: 'selectAll' as const },
        ],
      },
      // View menu
      {
        label: 'View',
        submenu: [
          { role: 'reload' as const },
          { role: 'forceReload' as const },
          { role: 'toggleDevTools' as const },
          { type: 'separator' as const },
          { role: 'resetZoom' as const },
          { role: 'zoomIn' as const },
          { role: 'zoomOut' as const },
          { type: 'separator' as const },
          { role: 'togglefullscreen' as const },
        ],
      },
      // Window menu
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' as const },
          { role: 'zoom' as const },
          ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : []),
        ],
      },
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    // Clean up old cached images async (non-blocking to improve startup time)
    const imageDir = join(getCopilotStatePath(), 'images');
    setImmediate(() => {
      if (existsSync(imageDir)) {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        try {
          const files = readdirSync(imageDir);
          for (const file of files) {
            const filePath = join(imageDir, file);
            const stats = statSync(filePath);
            if (now - stats.mtimeMs > maxAge) {
              unlinkSync(filePath);
              log.info(`Cleaned up old image: ${file}`);
            }
          }
        } catch (err) {
          log.error('Failed to clean up old images:', err);
        }
      }
    });

    createWindow();

    app.on('child-process-gone', (_event, details) => {
      log.error('Child process gone:', details);
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', async () => {
  // Stop keep-alive timer
  stopKeepAlive();

  // Close browser and save state
  await browserManager.closeBrowser();

  // Destroy all sessions
  for (const [id, state] of sessions) {
    await state.session.destroy();
    console.log(`Destroyed session ${id}`);
  }
  sessions.clear();

  // Stop all clients
  for (const [cwd, client] of copilotClients) {
    await client.stop();
    console.log(`Stopped client for ${cwd}`);
  }
  copilotClients.clear();

  app.quit();
});

app.on('before-quit', async () => {
  // Close all PTY instances
  ptyManager.closeAllPtys();

  // Close browser and save state
  await browserManager.closeBrowser();

  // Destroy all sessions
  for (const [id, state] of sessions) {
    await state.session.destroy();
  }
  sessions.clear();

  // Stop all clients
  for (const [cwd, client] of copilotClients) {
    await client.stop();
  }
  copilotClients.clear();
});

// ============================================================================
// Worktree Session Management IPC Handlers
// ============================================================================

// Fetch GitHub issue and generate branch name
ipcMain.handle('worktree:fetchGitHubIssue', async (_event, issueUrl: string) => {
  return worktree.fetchGitHubIssue(issueUrl);
});

// Fetch Azure DevOps work item and generate branch name
ipcMain.handle('worktree:fetchAzureDevOpsWorkItem', async (_event, workItemUrl: string) => {
  return worktree.fetchAzureDevOpsWorkItem(workItemUrl);
});

// Check git version for worktree support
ipcMain.handle('worktree:checkGitVersion', async () => {
  return worktree.checkGitVersion();
});

// Create a new worktree session
ipcMain.handle(
  'worktree:createSession',
  async (
    _event,
    data: {
      repoPath: string;
      branch: string;
    }
  ) => {
    return worktree.createWorktreeSession(data.repoPath, data.branch);
  }
);

// Remove a worktree session
ipcMain.handle(
  'worktree:removeSession',
  async (
    _event,
    data: {
      sessionId: string;
      force?: boolean;
    }
  ) => {
    return worktree.removeWorktreeSession(data.sessionId, { force: data.force });
  }
);

// List all worktree sessions
ipcMain.handle(
  'worktree:listSessions',
  async (_event, options?: { includeDiskUsage?: boolean }) => {
    return worktree.listWorktreeSessions(options);
  }
);

// Get a specific session
ipcMain.handle('worktree:getSession', async (_event, sessionId: string) => {
  return worktree.getWorktreeSession(sessionId);
});

// Find session by repo and branch
ipcMain.handle(
  'worktree:findSession',
  async (_event, data: { repoPath: string; branch: string }) => {
    return worktree.findWorktreeSession(data.repoPath, data.branch);
  }
);

// Switch to a worktree session
ipcMain.handle('worktree:switchSession', async (_event, sessionId: string) => {
  return worktree.switchToWorktreeSession(sessionId);
});

// Prune orphaned and stale sessions
ipcMain.handle(
  'worktree:pruneSessions',
  async (
    _event,
    options?: {
      dryRun?: boolean;
      maxAgeDays?: number;
    }
  ) => {
    return worktree.pruneWorktreeSessions(options);
  }
);

// Check for orphaned sessions
ipcMain.handle('worktree:checkOrphaned', async () => {
  return worktree.checkOrphanedSessions();
});

// Recover an orphaned session
ipcMain.handle('worktree:recoverSession', async (_event, sessionId: string) => {
  return worktree.recoverWorktreeSession(sessionId);
});

// Get worktree config
ipcMain.handle('worktree:getConfig', async () => {
  return worktree.getWorktreeConfig();
});

// Update worktree config
ipcMain.handle(
  'worktree:updateConfig',
  async (
    _event,
    updates: Partial<{
      directory: string;
      pruneAfterDays: number;
      warnDiskThresholdMB: number;
    }>
  ) => {
    worktree.updateWorktreeConfig(updates);
    return { success: true };
  }
);

// PTY (Terminal) handlers
ipcMain.handle('pty:create', async (_event, data: { sessionId: string; cwd: string }) => {
  return ptyManager.createPty(data.sessionId, data.cwd, mainWindow);
});

ipcMain.handle('pty:write', async (_event, data: { sessionId: string; data: string }) => {
  return ptyManager.writePty(data.sessionId, data.data);
});

ipcMain.handle(
  'pty:resize',
  async (_event, data: { sessionId: string; cols: number; rows: number }) => {
    return ptyManager.resizePty(data.sessionId, data.cols, data.rows);
  }
);

ipcMain.handle('pty:getOutput', async (_event, sessionId: string) => {
  return ptyManager.getPtyOutput(sessionId);
});

ipcMain.handle('pty:clearBuffer', async (_event, sessionId: string) => {
  return ptyManager.clearPtyBuffer(sessionId);
});

ipcMain.handle('pty:close', async (_event, sessionId: string) => {
  return ptyManager.closePty(sessionId);
});

ipcMain.handle('pty:exists', async (_event, sessionId: string) => {
  return { exists: ptyManager.hasPty(sessionId) };
});

// File operations - read file content for preview
const MAX_FILE_SIZE = 1024 * 1024; // 1MB limit for preview
const BINARY_CHECK_SIZE = 8000; // Check first 8KB for binary content

function isBinaryContent(buffer: Buffer): boolean {
  // Check for null bytes which indicate binary content
  for (let i = 0; i < Math.min(buffer.length, BINARY_CHECK_SIZE); i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

ipcMain.handle('file:readContent', async (_event, filePath: string) => {
  try {
    // Check if file exists
    if (!existsSync(filePath)) {
      return { success: false, error: 'File not found', errorType: 'not_found' };
    }

    // Get file stats
    const stats = statSync(filePath);
    const fileSize = stats.size;

    // Check file size
    if (fileSize > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `File is too large to preview (${(fileSize / 1024 / 1024).toFixed(2)} MB). Maximum size is 1 MB.`,
        errorType: 'too_large',
        fileSize,
      };
    }

    // Read file content
    const buffer = readFileSync(filePath);

    // Check if binary
    if (isBinaryContent(buffer)) {
      return {
        success: false,
        error: 'This file appears to be binary and cannot be displayed as text.',
        errorType: 'binary',
        fileSize,
      };
    }

    // Return content as string
    const content = buffer.toString('utf-8');
    return {
      success: true,
      content,
      fileSize,
      fileName: filePath.split(/[/\\]/).pop() || filePath,
    };
  } catch (error) {
    console.error('Failed to read file:', error);
    return {
      success: false,
      error: `Failed to read file: ${String(error)}`,
      errorType: 'read_error',
    };
  }
});

// File operations - reveal file in system file explorer
ipcMain.handle(
  'file:revealInFolder',
  async (_event, { filePath, cwd }: { filePath: string; cwd?: string }) => {
    try {
      // Resolve to absolute path if cwd is provided and filePath is relative
      const absolutePath = cwd && !path.isAbsolute(filePath) ? path.join(cwd, filePath) : filePath;
      if (!existsSync(absolutePath)) {
        return { success: false, error: 'File not found' };
      }
      shell.showItemInFolder(absolutePath);
      return { success: true };
    } catch (error) {
      console.error('Failed to reveal file:', error);
      return { success: false, error: String(error) };
    }
  }
);

ipcMain.handle('file:openFile', async (_event, filePath: string) => {
  try {
    if (!existsSync(filePath)) {
      return { success: false, error: 'File not found' };
    }
    const result = await shell.openPath(filePath);
    if (result) {
      return { success: false, error: result };
    }
    return { success: true };
  } catch (error) {
    console.error('Failed to open file:', error);
    return { success: false, error: String(error) };
  }
});

// Crash diagnostics
ipcMain.handle('diagnostics:getPaths', async () => {
  const logFilePath = log.transports.file.getFile().path;
  const crashDumpsPath = app.getPath('crashDumps');
  return { logFilePath, crashDumpsPath };
});

// ============================================================================
// Update and Release Notes Handlers
// ============================================================================

// GitHub repository for checking updates
const GITHUB_REPO_OWNER = 'CooperAgent';
const GITHUB_REPO_NAME = 'cooper';

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  prerelease: boolean;
  assets: Array<{ name: string; browser_download_url: string }>;
}

// Check for updates from GitHub releases
ipcMain.handle('updates:checkForUpdate', async () => {
  try {
    // Fetch release list so we can skip non-semver tags (e.g. the "assets" release)
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases?per_page=10`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Cooper',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return { hasUpdate: false, error: 'No releases found' };
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const releases = (await response.json()) as GitHubRelease[];
    // Find the first non-prerelease release with a semver tag
    const semverRegex = /^v?\d+\.\d+\.\d+$/;
    const release = releases.find((r) => !r.prerelease && semverRegex.test(r.tag_name));

    if (!release) {
      return { hasUpdate: false, error: 'No semver releases found' };
    }

    const latestVersion = release.tag_name.replace(/^v/, '');

    // Get current version from package.json
    const pkgPath = join(__dirname, '..', '..', 'package.json');
    let currentVersion = '1.0.0';
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      currentVersion = pkg.version.split('+')[0].split('-')[0];
    } catch {
      // Fallback to hardcoded version if package.json not accessible
    }

    // If the app version was reset (e.g. back to 1.0.0), clear stale update state.
    const lastSeenVersion = store.get('lastSeenVersion', '') as string;
    if (lastSeenVersion && compareVersions(lastSeenVersion, currentVersion) > 0) {
      store.set('lastSeenVersion', currentVersion);
    }

    const dismissedVersion = store.get('dismissedUpdateVersion', '') as string;
    if (dismissedVersion && compareVersions(dismissedVersion, currentVersion) > 0) {
      store.set('dismissedUpdateVersion', '');
    }

    // Compare versions (simple comparison, assumes semver)
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

    // Pick a platform-appropriate download asset
    const isWindows = process.platform === 'win32';
    const installerAsset = release.assets.find((a) =>
      isWindows ? a.name.endsWith('.exe') : a.name.endsWith('.dmg')
    );

    return {
      hasUpdate: hasUpdate && latestVersion !== (store.get('dismissedUpdateVersion', '') as string),
      currentVersion,
      latestVersion,
      releaseNotes: release.body || '',
      releaseUrl: release.html_url,
      downloadUrl: installerAsset?.browser_download_url || release.html_url,
    };
  } catch (error) {
    console.error('Failed to check for updates:', error);
    return { hasUpdate: false, error: String(error) };
  }
});

// Dismiss update notification for a specific version
ipcMain.handle('updates:dismissVersion', async (_event, version: string) => {
  store.set('dismissedUpdateVersion', version);
  return { success: true };
});

// Get the last seen version (for showing release notes on first run)
ipcMain.handle('updates:getLastSeenVersion', async () => {
  // If the app version was reset (e.g. back to 1.0.0), clear/update persisted version state
  // so users don't see stale release notes/update dismissals from a higher previous version.
  const pkgPath = join(__dirname, '..', '..', 'package.json');
  let currentVersion = '1.0.0';
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    currentVersion = pkg.version.split('+')[0].split('-')[0];
  } catch {
    // Fallback to hardcoded version if package.json not accessible
  }

  const lastSeenVersion = store.get('lastSeenVersion', '') as string;
  if (lastSeenVersion && compareVersions(lastSeenVersion, currentVersion) > 0) {
    store.set('lastSeenVersion', currentVersion);
  }

  const dismissedVersion = store.get('dismissedUpdateVersion', '') as string;
  if (dismissedVersion && compareVersions(dismissedVersion, currentVersion) > 0) {
    store.set('dismissedUpdateVersion', '');
  }

  return { version: store.get('lastSeenVersion', '') as string };
});

// Set the last seen version
ipcMain.handle('updates:setLastSeenVersion', async (_event, version: string) => {
  store.set('lastSeenVersion', version);
  return { success: true };
});

// Open the download URL in the default browser (fallback)
ipcMain.handle('updates:openDownloadUrl', async (_event, url: string) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// Check if we're running from a git repository (can auto-update)
ipcMain.handle('updates:canAutoUpdate', async () => {
  try {
    // Check if we're in a git repo by looking for .git folder
    const repoRoot = join(__dirname, '..', '..');
    const gitDir = join(repoRoot, '.git');
    const isGitRepo = existsSync(gitDir);

    // Also check if git is available
    if (isGitRepo) {
      await execAsync('git --version');
      return { canAutoUpdate: true, repoPath: repoRoot };
    }
    return { canAutoUpdate: false, reason: 'Not running from git repository' };
  } catch (error) {
    return { canAutoUpdate: false, reason: 'Git not available' };
  }
});

// Perform the auto-update: git pull, npm install, and prepare for restart
ipcMain.handle('updates:performUpdate', async (_event, onProgress?: (stage: string) => void) => {
  try {
    const repoRoot = join(__dirname, '..', '..');

    // Stage 1: Git fetch and pull
    console.log('Update: Fetching latest changes...');
    await execAsync('git fetch origin main', { cwd: repoRoot });

    // Check if there are changes to pull
    const { stdout: behindCount } = await execAsync('git rev-list HEAD..origin/main --count', {
      cwd: repoRoot,
    });
    if (parseInt(behindCount.trim()) === 0) {
      return { success: true, message: 'Already up to date', needsRestart: false };
    }

    // Pull the changes
    console.log('Update: Pulling latest changes...');
    await execAsync('git pull origin main', { cwd: repoRoot });

    // Stage 2: Install dependencies
    console.log('Update: Installing dependencies...');
    await execAsync('npm install', { cwd: repoRoot });

    // Stage 3: Build the app
    console.log('Update: Building application...');
    await execAsync('npm run build', { cwd: repoRoot });

    console.log('Update: Complete! Ready to restart.');
    return { success: true, message: 'Update complete', needsRestart: true };
  } catch (error) {
    console.error('Update failed:', error);
    return { success: false, error: String(error) };
  }
});

// Restart the application
ipcMain.handle('updates:restartApp', async () => {
  // Relaunch the app and quit the current instance
  app.relaunch();
  app.quit();
  return { success: true };
});

// Welcome wizard handlers
const CURRENT_WIZARD_VERSION = 1; // Bump this to re-show wizard to all users

ipcMain.handle('wizard:hasSeenWelcome', async () => {
  const seenVersion = store.get('wizardVersion', 0) as number;
  // Show wizard if user hasn't seen current version
  return { hasSeen: seenVersion >= CURRENT_WIZARD_VERSION };
});

ipcMain.handle('wizard:markWelcomeAsSeen', async () => {
  store.set('hasSeenWelcomeWizard', true);
  store.set('wizardVersion', CURRENT_WIZARD_VERSION);
  return { success: true };
});

// App info handlers
ipcMain.handle('app:isPackaged', () => {
  return app.isPackaged;
});

ipcMain.handle('app:getInstallationId', () => {
  return getInstallationId();
});

// Simple semver comparison: returns 1 if a > b, -1 if a < b, 0 if equal
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const partA = partsA[i] || 0;
    const partB = partsB[i] || 0;
    if (partA > partB) return 1;
    if (partA < partB) return -1;
  }
  return 0;
}
