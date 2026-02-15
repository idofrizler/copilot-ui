import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

// Regex to split paths on both Unix (/) and Windows (\) separators
const PATH_SEP_REGEX = /[\\/]/;

const MIN_HEIGHT = 100;
const MAX_HEIGHT = 600;
const DEFAULT_HEIGHT = 192; // h-48 equivalent

interface TerminalPanelProps {
  sessionId: string;
  cwd: string;
  isOpen: boolean;
  onClose: () => void;
  onSendToAgent: (output: string, lineCount: number, lastCommandStart?: number) => void;
  fontFamily?: string;
  fontSize?: number;
}

export const TerminalPanel: React.FC<TerminalPanelProps> = ({
  sessionId,
  cwd,
  isOpen,
  onClose,
  onSendToAgent,
  fontFamily = 'Menlo, Monaco, Consolas, "Courier New", monospace',
  fontSize = 13,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [bufferLineCount, setBufferLineCount] = useState(0);
  const [terminalHeight, setTerminalHeight] = useState(DEFAULT_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);
  const sessionIdRef = useRef(sessionId);

  // Track the line number where the last command started (when user pressed Enter)
  const lastCommandLineRef = useRef<number>(0);

  // Keep sessionId ref in sync
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Initialize terminal
  useEffect(() => {
    if (!isOpen || !terminalRef.current || isInitialized) return;

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize,
      fontFamily,
      theme: {
        background: 'var(--copilot-terminal-bg, #1e1e1e)',
        foreground: 'var(--copilot-terminal-text, #d4d4d4)',
        cursor: 'var(--copilot-terminal-cursor, #aeafad)',
        cursorAccent: 'var(--copilot-terminal-bg, #1e1e1e)',
        selectionBackground: 'var(--copilot-selection, rgba(255, 255, 255, 0.3))',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);

    xterm.open(terminalRef.current);
    fitAddon.fit();

    // Handle special key combinations for the terminal
    // Return true = xterm handles it, false = browser/Electron handles it
    xterm.attachCustomKeyEventHandler((event) => {
      // Only handle keydown events
      if (event.type !== 'keydown') return true;

      const isMac = navigator.platform.includes('Mac');
      const isCtrlOrCmd = isMac ? event.metaKey : event.ctrlKey;

      // Handle Ctrl/Cmd+C - copy if text is selected, otherwise send SIGINT
      if (isCtrlOrCmd && event.key === 'c') {
        if (xterm.hasSelection()) {
          // Copy selected text to clipboard, then clear selection
          navigator.clipboard.writeText(xterm.getSelection()).catch(() => {});
          xterm.clearSelection();
        } else {
          // No selection — send SIGINT (ETX / 0x03) to interrupt running processes
          window.electronAPI.pty.write(sessionIdRef.current, '\x03');
        }
        event.preventDefault();
        event.stopPropagation();
        return false;
      }

      // Handle Ctrl/Cmd+V - paste
      if (isCtrlOrCmd && event.key === 'v') {
        event.preventDefault();
        event.stopPropagation();
        // Read from clipboard and send to terminal
        navigator.clipboard
          .readText()
          .then((text) => {
            if (text) {
              window.electronAPI.pty.write(sessionIdRef.current, text);
            }
          })
          .catch(() => {
            // Clipboard access denied - ignore
          });
        return false;
      }

      // Handle Ctrl+Arrow keys for word navigation in terminal
      // On macOS, also handle Option+Arrow as that's more common for word navigation
      // Send ESC b (word-left) and ESC f (word-right) which work in bash/zsh
      const isWordNavModifier = isMac
        ? event.altKey && !event.ctrlKey && !event.metaKey // Option+Arrow on macOS
        : event.ctrlKey && !event.metaKey && !event.altKey; // Ctrl+Arrow on Linux/Windows

      if (isWordNavModifier && !event.shiftKey) {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          event.stopPropagation();
          // Send ESC b (word backward) - works in bash/zsh
          window.electronAPI.pty.write(sessionIdRef.current, '\x1bb');
          return false;
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          event.stopPropagation();
          // Send ESC f (word forward) - works in bash/zsh
          window.electronAPI.pty.write(sessionIdRef.current, '\x1bf');
          return false;
        }
      }

      // Let xterm handle all other key events
      return true;
    });

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;
    setIsInitialized(true);

    // Handle user input - track when commands are executed (Enter pressed)
    xterm.onData((data) => {
      // If user pressed Enter (carriage return or newline), record the current line as command start
      if (data === '\r' || data === '\n' || data === '\r\n') {
        const buffer = xterm.buffer.active;
        // The command line is the current line (before Enter moves to next line)
        // baseY is scrollback, cursorY is position in viewport
        lastCommandLineRef.current = buffer.baseY + buffer.cursorY;
      }
      window.electronAPI.pty.write(sessionIdRef.current, data);
    });

    // Create PTY
    window.electronAPI.pty.create(sessionId, cwd).then((result) => {
      if (result.success) {
        setIsConnected(true);
        setBufferLineCount(0);
        // Resize PTY to match terminal
        const dims = fitAddon.proposeDimensions();
        if (dims) {
          window.electronAPI.pty.resize(sessionId, dims.cols, dims.rows);
        }
      } else {
        xterm.writeln(`\x1b[31mFailed to create terminal: ${result.error}\x1b[0m`);
      }
    });

    return () => {
      // Cleanup will be done when component unmounts or panel closes
    };
  }, [isOpen, sessionId, cwd, isInitialized]);

  // Handle PTY data
  useEffect(() => {
    if (!isInitialized) return;

    const unsubscribeData = window.electronAPI.pty.onData((data) => {
      if (data.sessionId === sessionIdRef.current && xtermRef.current) {
        xtermRef.current.write(data.data);
        // Count newlines for line count estimate
        const newLines = (data.data.match(/\n/g) || []).length;
        setBufferLineCount((prev) => prev + newLines);
      }
    });

    const unsubscribeExit = window.electronAPI.pty.onExit((data) => {
      if (data.sessionId === sessionIdRef.current) {
        setIsConnected(false);
        if (xtermRef.current) {
          xtermRef.current.writeln(`\x1b[33m\r\nProcess exited with code ${data.exitCode}\x1b[0m`);
        }
      }
    });

    return () => {
      unsubscribeData();
      unsubscribeExit();
    };
  }, [isInitialized]);

  // Handle resize
  useEffect(() => {
    if (!isOpen || !fitAddonRef.current) return;

    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
        const dims = fitAddonRef.current.proposeDimensions();
        if (dims && isConnected) {
          window.electronAPI.pty.resize(sessionIdRef.current, dims.cols, dims.rows);
        }
      }
    };

    // Fit on open
    setTimeout(handleResize, 100);

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen, isConnected]);

  // Cleanup on close - only cleanup when component unmounts (tab closed), not when hidden
  useEffect(() => {
    // Return cleanup function that runs on unmount
    return () => {
      // Use refs which are always current, not stale closure values
      window.electronAPI.pty.close(sessionIdRef.current);
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }
      fitAddonRef.current = null;
    };
  }, []); // Empty deps - only run cleanup on unmount

  const handleSendToAgent = useCallback(async () => {
    if (!xtermRef.current) return;

    // Read directly from xterm's buffer - this gives us the rendered content
    // without escape sequences or terminal artifacts
    const buffer = xtermRef.current.buffer.active;
    const lines: string[] = [];

    // Read all lines from the buffer
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) {
        // translateToString(true) should trim right, but we'll also trim manually to be safe
        const text = line.translateToString(true).trimEnd();
        lines.push(text);
      }
    }

    // Remove trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    const output = lines.join('\n');
    const lineCount = lines.length;

    if (output.trim()) {
      // Pass the last command start line so the modal can extract just that command's output
      onSendToAgent(output, lineCount, lastCommandLineRef.current);
    }
  }, [onSendToAgent]);

  const handleClearBuffer = useCallback(async () => {
    const result = await window.electronAPI.pty.clearBuffer(sessionIdRef.current);
    if (result.success) {
      setBufferLineCount(0);
      // Also clear the terminal display
      if (xtermRef.current) {
        xtermRef.current.clear();
      }
    }
  }, []);

  const handleRestart = useCallback(async () => {
    setIsConnected(false);
    // Close existing PTY and wait
    await window.electronAPI.pty.close(sessionIdRef.current);
    // Small delay to ensure cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Clear terminal display
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
    // Create new PTY
    const result = await window.electronAPI.pty.create(sessionIdRef.current, cwd);
    if (result.success) {
      setIsConnected(true);
      setBufferLineCount(0);
      if (fitAddonRef.current) {
        const dims = fitAddonRef.current.proposeDimensions();
        if (dims) {
          window.electronAPI.pty.resize(sessionIdRef.current, dims.cols, dims.rows);
        }
      }
    } else if (xtermRef.current) {
      xtermRef.current.writeln(`\x1b[31mFailed to restart: ${result.error}\x1b[0m`);
    }
  }, [cwd]);

  // Handle resize drag
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      const startY = e.clientY;
      const startHeight = terminalHeight;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaY = moveEvent.clientY - startY;
        const newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeight + deltaY));
        setTerminalHeight(newHeight);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        // Refit terminal after resize
        if (fitAddonRef.current) {
          fitAddonRef.current.fit();
          const dims = fitAddonRef.current.proposeDimensions();
          if (dims && isConnected) {
            window.electronAPI.pty.resize(sessionIdRef.current, dims.cols, dims.rows);
          }
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [terminalHeight, isConnected]
  );

  // Refit terminal when height changes during drag
  useEffect(() => {
    if (isResizing && fitAddonRef.current) {
      fitAddonRef.current.fit();
    }
  }, [terminalHeight, isResizing]);

  // Update terminal font when settings change
  useEffect(() => {
    const xterm = xtermRef.current;
    if (!xterm) return;
    xterm.options.fontFamily = fontFamily;
    xterm.options.fontSize = fontSize;
    fitAddonRef.current?.fit();
  }, [fontFamily, fontSize]);

  return (
    <div
      className={`flex flex-col bg-copilot-terminal-bg ${!isOpen ? 'hidden' : ''}`}
      data-tour="terminal-panel"
    >
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-copilot-surface border-b border-copilot-border">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? 'bg-copilot-success' : 'bg-copilot-error'}`}
          />
          <span className="text-[10px] text-copilot-text-muted font-mono truncate" title={cwd}>
            {cwd.split(PATH_SEP_REGEX).slice(-2).join('/')}
          </span>
          {bufferLineCount > 0 && (
            <span className="text-[10px] text-copilot-accent shrink-0">
              ({bufferLineCount} lines)
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleClearBuffer}
            className="px-2 py-0.5 text-[10px] text-copilot-text-muted hover:text-copilot-text transition-colors"
            title="Clear output buffer"
          >
            Clear
          </button>
          <button
            onClick={handleSendToAgent}
            disabled={bufferLineCount === 0}
            className="px-2 py-0.5 text-[10px] bg-copilot-success text-copilot-text-inverse rounded hover:opacity-90 disabled:opacity-50 transition-colors"
            title="Add terminal output to message"
          >
            Add to Message
          </button>
          <button
            onClick={handleRestart}
            className="px-2 py-0.5 text-[10px] text-copilot-text-muted hover:text-copilot-text transition-colors"
            title="Restart terminal"
          >
            ↻
          </button>
          <button
            onClick={onClose}
            className="px-2 py-0.5 text-[10px] text-copilot-text-muted hover:text-copilot-text transition-colors"
            title="Close terminal"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Terminal Container */}
      <div
        ref={terminalRef}
        className="overflow-hidden"
        style={{ height: `${terminalHeight}px`, backgroundColor: '#000' }}
      />

      {/* Resize Handle */}
      <div onMouseDown={handleResizeStart} className="h-0 cursor-ns-resize shrink-0 relative z-10">
        <div className="absolute inset-x-0 -bottom-1 h-2 hover:bg-copilot-accent/50 transition-colors" />
      </div>
    </div>
  );
};

export default TerminalPanel;
