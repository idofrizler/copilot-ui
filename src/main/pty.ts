import { BrowserWindow } from 'electron';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Lazy-loaded node-pty module to improve startup time
// node-pty is a native module that takes time to load
let ptyModule: typeof import('node-pty') | null = null;

function getPtyModule(): typeof import('node-pty') {
  if (!ptyModule) {
    // Use require for CommonJS native module
    ptyModule = require('node-pty');
  }
  return ptyModule;
}

// Import type only (doesn't load the module)
import type * as pty from 'node-pty';

interface PtyInstance {
  pty: pty.IPty;
  outputBuffer: string[];
  maxBufferLines: number;
}

const ptyInstances = new Map<string, PtyInstance>();

interface WindowsTerminalProfile {
  guid?: string;
  name?: string;
  commandline?: string;
  source?: string;
  hidden?: boolean;
}

interface WindowsTerminalSettings {
  defaultProfile?: string;
  profiles?: { list?: WindowsTerminalProfile[] } | WindowsTerminalProfile[];
}

interface DefaultShellConfig {
  shell: string;
  args: string[];
}

let cachedWindowsTerminalShell: DefaultShellConfig | null = null;
let windowsTerminalShellChecked = false;

function stripJsonComments(input: string): string {
  let output = '';
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;
  const length = input.length;
  const isWhitespace = (value: string): boolean =>
    value === ' ' || value === '\t' || value === '\n' || value === '\r';

  const peekNextMeaningfulChar = (startIndex: number): string => {
    let inLine = false;
    let inBlock = false;
    for (let i = startIndex; i < length; i++) {
      const char = input[i];
      const next = i + 1 < length ? input[i + 1] : '';

      if (inLine) {
        if (char === '\n') {
          inLine = false;
        }
        continue;
      }

      if (inBlock) {
        if (char === '*' && next === '/') {
          inBlock = false;
          i++;
        }
        continue;
      }

      if (char === '/' && next === '/') {
        inLine = true;
        i++;
        continue;
      }

      if (char === '/' && next === '*') {
        inBlock = true;
        i++;
        continue;
      }

      if (isWhitespace(char)) {
        continue;
      }

      return char;
    }
    return '';
  };

  for (let i = 0; i < length; i++) {
    const char = input[i];
    const next = i + 1 < input.length ? input[i + 1] : '';

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        output += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '\uFEFF') {
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    if (char === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }

    if (char === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    if (
      char === ',' &&
      (peekNextMeaningfulChar(i + 1) === '}' || peekNextMeaningfulChar(i + 1) === ']')
    ) {
      continue;
    }

    output += char;
  }

  return output;
}

function expandWindowsEnvVars(value: string): string {
  return value.replace(/%([^%]+)%/g, (match, name: string) => {
    const envValue = process.env[name];
    return typeof envValue === 'string' ? envValue : match;
  });
}

function getWindowsTerminalSettingsPaths(): string[] {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    return [];
  }
  return [
    join(
      localAppData,
      'Packages',
      'Microsoft.WindowsTerminal_8wekyb3d8bbwe',
      'LocalState',
      'settings.json'
    ),
    join(
      localAppData,
      'Packages',
      'Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe',
      'LocalState',
      'settings.json'
    ),
    join(localAppData, 'Microsoft', 'Windows Terminal', 'settings.json'),
  ];
}

function loadWindowsTerminalSettings(): { settings: WindowsTerminalSettings; path: string } | null {
  const settingsPaths = getWindowsTerminalSettingsPaths();
  for (const settingsPath of settingsPaths) {
    if (!existsSync(settingsPath)) {
      continue;
    }
    try {
      const content = readFileSync(settingsPath, 'utf-8');
      const parsed = JSON.parse(stripJsonComments(content)) as WindowsTerminalSettings;
      return { settings: parsed, path: settingsPath };
    } catch (error) {
      console.warn(`Failed to parse Windows Terminal settings at ${settingsPath}:`, error);
    }
  }
  return null;
}

function normalizeGuid(value?: string): string | null {
  if (!value) {
    return null;
  }
  return value.toLowerCase().replace(/[{}]/g, '');
}

function getWindowsTerminalProfiles(settings: WindowsTerminalSettings): WindowsTerminalProfile[] {
  if (Array.isArray(settings.profiles)) {
    return settings.profiles;
  }
  if (settings.profiles?.list && Array.isArray(settings.profiles.list)) {
    return settings.profiles.list;
  }
  return [];
}

function escapeWindowsArg(value: string): string {
  return value.replace(/"/g, '\\"');
}

function getWindowsTerminalCommandLine(profile: WindowsTerminalProfile): string | null {
  if (profile.commandline && profile.commandline.trim()) {
    return expandWindowsEnvVars(profile.commandline.trim());
  }

  const source = profile.source?.toLowerCase();
  if (source?.includes('windows.terminal.wsl')) {
    const distroName = profile.name?.trim();
    if (distroName) {
      return `wsl.exe -d "${escapeWindowsArg(distroName)}"`;
    }
    return 'wsl.exe';
  }

  if (source?.includes('windows.terminal.powershellcore')) {
    return 'pwsh.exe';
  }

  if (source?.includes('windows.terminal.powershell')) {
    return 'powershell.exe';
  }

  if (source?.includes('windows.terminal.cmd')) {
    return 'cmd.exe';
  }

  return null;
}

function resolveWindowsTerminalDefaultCommandLine(): string | null {
  const settingsResult = loadWindowsTerminalSettings();
  if (!settingsResult) {
    return null;
  }

  const { settings, path } = settingsResult;
  const defaultProfileId = normalizeGuid(settings.defaultProfile);
  if (!defaultProfileId) {
    console.warn(`Windows Terminal settings missing defaultProfile (${path}).`);
    return null;
  }

  const profiles = getWindowsTerminalProfiles(settings);
  if (!profiles.length) {
    console.warn(`Windows Terminal settings missing profiles list (${path}).`);
    return null;
  }

  const profile = profiles.find((entry) => normalizeGuid(entry.guid) === defaultProfileId);
  if (!profile) {
    console.warn(
      `Windows Terminal default profile ${settings.defaultProfile} not found (${path}).`
    );
    return null;
  }

  const commandLine = getWindowsTerminalCommandLine(profile);
  if (!commandLine) {
    console.warn(
      `Windows Terminal default profile "${
        profile.name || profile.guid || 'unknown'
      }" has no commandline (${path}).`
    );
    return null;
  }

  return commandLine;
}

function splitCommandLine(commandLine: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuotes = false;
  let escaped = false;

  for (let i = 0; i < commandLine.length; i++) {
    const char = commandLine[i];
    const next = i + 1 < commandLine.length ? commandLine[i + 1] : '';

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\' && inQuotes && next === '"') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && /\s/.test(char)) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) {
    args.push(current);
  }

  return args;
}

function resolveWindowsTerminalShell(): DefaultShellConfig | null {
  if (windowsTerminalShellChecked) {
    return cachedWindowsTerminalShell;
  }

  windowsTerminalShellChecked = true;
  const commandLine = resolveWindowsTerminalDefaultCommandLine();
  if (!commandLine) {
    console.warn('Falling back to COMSPEC: Windows Terminal default profile unavailable.');
    return null;
  }

  const parts = splitCommandLine(commandLine);
  if (!parts.length) {
    console.warn('Falling back to COMSPEC: Windows Terminal commandline was empty.');
    return null;
  }

  cachedWindowsTerminalShell = { shell: parts[0], args: parts.slice(1) };
  return cachedWindowsTerminalShell;
}

// Get the default shell for the current platform
function getDefaultShell(): DefaultShellConfig {
  if (process.platform === 'win32') {
    const windowsTerminalShell = resolveWindowsTerminalShell();
    if (windowsTerminalShell) {
      return windowsTerminalShell;
    }
    return { shell: process.env.COMSPEC || 'cmd.exe', args: [] };
  }
  return { shell: process.env.SHELL || '/bin/bash', args: ['-l'] };
}

// Create a new PTY instance for a session
export function createPty(
  sessionId: string,
  cwd: string,
  mainWindow: BrowserWindow | null
): { success: boolean; error?: string } {
  // Close existing PTY for this session if any
  if (ptyInstances.has(sessionId)) {
    closePty(sessionId);
  }

  try {
    const { shell, args: shellArgs } = getDefaultShell();

    // Filter out undefined/null env vars that can cause issues with ConPTY on Windows
    const cleanEnv: { [key: string]: string } = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && value !== null) {
        cleanEnv[key] = value;
      }
    }
    cleanEnv.TERM = 'xterm-256color';
    cleanEnv.COLORTERM = 'truecolor';

    const pty = getPtyModule();
    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: cwd,
      env: cleanEnv,
    });

    const instance: PtyInstance = {
      pty: ptyProcess,
      outputBuffer: [],
      maxBufferLines: 1000,
    };

    // Handle PTY data - only forward if this instance is still the active one
    ptyProcess.onData((data: string) => {
      if (ptyInstances.get(sessionId) !== instance) return;

      // Store in buffer for "send to agent" functionality
      instance.outputBuffer.push(data);
      // Trim buffer if too large
      if (instance.outputBuffer.length > instance.maxBufferLines) {
        instance.outputBuffer = instance.outputBuffer.slice(-instance.maxBufferLines);
      }

      // Send data to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pty:data', { sessionId, data });
      }
    });

    // Handle PTY exit - only act if this instance is still the active one.
    // A replaced PTY's onExit fires asynchronously after a new one is created;
    // without this guard the stale handler would delete the new instance.
    ptyProcess.onExit(({ exitCode }) => {
      if (ptyInstances.get(sessionId) !== instance) return;

      console.log(`PTY for session ${sessionId} exited with code ${exitCode}`);
      ptyInstances.delete(sessionId);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pty:exit', { sessionId, exitCode });
      }
    });

    ptyInstances.set(sessionId, instance);
    return { success: true };
  } catch (error) {
    console.error('Failed to create PTY:', error);
    return { success: false, error: String(error) };
  }
}

// Write data to PTY
export function writePty(sessionId: string, data: string): { success: boolean; error?: string } {
  const instance = ptyInstances.get(sessionId);
  if (!instance) {
    return { success: false, error: 'PTY not found for session' };
  }

  try {
    instance.pty.write(data);
    return { success: true };
  } catch (error) {
    console.error('Failed to write to PTY:', error);
    return { success: false, error: String(error) };
  }
}

// Resize PTY
export function resizePty(
  sessionId: string,
  cols: number,
  rows: number
): { success: boolean; error?: string } {
  const instance = ptyInstances.get(sessionId);
  if (!instance) {
    return { success: false, error: 'PTY not found for session' };
  }

  try {
    instance.pty.resize(cols, rows);
    return { success: true };
  } catch (error) {
    console.error('Failed to resize PTY:', error);
    return { success: false, error: String(error) };
  }
}

// Get terminal output buffer for sending to agent
export function getPtyOutput(sessionId: string): {
  success: boolean;
  output?: string;
  error?: string;
} {
  const instance = ptyInstances.get(sessionId);
  if (!instance) {
    return { success: false, error: 'PTY not found for session' };
  }

  // Join buffer and return
  const output = instance.outputBuffer.join('');
  return { success: true, output };
}

// Clear output buffer
export function clearPtyBuffer(sessionId: string): { success: boolean; error?: string } {
  const instance = ptyInstances.get(sessionId);
  if (!instance) {
    return { success: false, error: 'PTY not found for session' };
  }

  instance.outputBuffer = [];
  return { success: true };
}

// Close PTY
export function closePty(sessionId: string): { success: boolean; error?: string } {
  const instance = ptyInstances.get(sessionId);
  if (!instance) {
    return { success: true }; // Already closed
  }

  try {
    instance.pty.kill();
    ptyInstances.delete(sessionId);
    return { success: true };
  } catch (error) {
    console.error('Failed to close PTY:', error);
    ptyInstances.delete(sessionId);
    return { success: false, error: String(error) };
  }
}

// Check if PTY exists for session
export function hasPty(sessionId: string): boolean {
  return ptyInstances.has(sessionId);
}

// Close all PTY instances
export function closeAllPtys(): void {
  for (const sessionId of ptyInstances.keys()) {
    closePty(sessionId);
  }
}
