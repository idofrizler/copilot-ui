import { BrowserWindow } from 'electron';

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

// Get the default shell for the current platform
function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe';
  }
  return process.env.SHELL || '/bin/bash';
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
    const shell = getDefaultShell();
    const shellArgs = process.platform === 'win32' ? [] : ['-l'];

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
