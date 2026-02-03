import React, { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

// Regex to split paths on both Unix (/) and Windows (\) separators
const PATH_SEP_REGEX = /[\\/]/

const MIN_HEIGHT = 100
const MAX_HEIGHT = 600
const DEFAULT_HEIGHT = 192 // h-48 equivalent

interface TerminalPanelProps {
  sessionId: string
  cwd: string
  isOpen: boolean
  onClose: () => void
  onSendToAgent: (output: string, lineCount: number) => void
}

export const TerminalPanel: React.FC<TerminalPanelProps> = ({
  sessionId,
  cwd,
  isOpen,
  onClose,
  onSendToAgent,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [bufferLineCount, setBufferLineCount] = useState(0)
  const [terminalHeight, setTerminalHeight] = useState(DEFAULT_HEIGHT)
  const [isResizing, setIsResizing] = useState(false)
  const sessionIdRef = useRef(sessionId)

  // Keep sessionId ref in sync
  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  // Initialize terminal
  useEffect(() => {
    if (!isOpen || !terminalRef.current || isInitialized) return

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
      theme: {
        background: 'var(--copilot-terminal-bg, #1e1e1e)',
        foreground: 'var(--copilot-terminal-text, #d4d4d4)',
        cursor: 'var(--copilot-terminal-cursor, #aeafad)',
        cursorAccent: 'var(--copilot-terminal-bg, #1e1e1e)',
        selectionBackground: 'var(--copilot-selection, rgba(255, 255, 255, 0.3))',
      },
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    xterm.loadAddon(fitAddon)

    xterm.open(terminalRef.current)
    fitAddon.fit()

    // Allow Ctrl/Cmd key combinations to pass through to the terminal
    xterm.attachCustomKeyEventHandler((event) => {
      // Allow all key events to be processed by xterm (pass to PTY)
      // Return true to let xterm handle the event, false to prevent it
      if ((event.ctrlKey || event.metaKey) && event.type === 'keydown') {
        // Let xterm handle Ctrl/Cmd key combinations
        return true
      }
      return true
    })

    xtermRef.current = xterm
    fitAddonRef.current = fitAddon
    setIsInitialized(true)

    // Handle user input
    xterm.onData((data) => {
      window.electronAPI.pty.write(sessionIdRef.current, data)
    })

    // Create PTY
    window.electronAPI.pty.create(sessionId, cwd).then((result) => {
      if (result.success) {
        setIsConnected(true)
        setBufferLineCount(0)
        // Resize PTY to match terminal
        const dims = fitAddon.proposeDimensions()
        if (dims) {
          window.electronAPI.pty.resize(sessionId, dims.cols, dims.rows)
        }
      } else {
        xterm.writeln(`\x1b[31mFailed to create terminal: ${result.error}\x1b[0m`)
      }
    })

    return () => {
      // Cleanup will be done when component unmounts or panel closes
    }
  }, [isOpen, sessionId, cwd, isInitialized])

  // Handle PTY data
  useEffect(() => {
    if (!isInitialized) return

    const unsubscribeData = window.electronAPI.pty.onData((data) => {
      if (data.sessionId === sessionIdRef.current && xtermRef.current) {
        xtermRef.current.write(data.data)
        // Count newlines for line count estimate
        const newLines = (data.data.match(/\n/g) || []).length
        setBufferLineCount(prev => prev + newLines)
      }
    })

    const unsubscribeExit = window.electronAPI.pty.onExit((data) => {
      if (data.sessionId === sessionIdRef.current) {
        setIsConnected(false)
        if (xtermRef.current) {
          xtermRef.current.writeln(`\x1b[33m\r\nProcess exited with code ${data.exitCode}\x1b[0m`)
        }
      }
    })

    return () => {
      unsubscribeData()
      unsubscribeExit()
    }
  }, [isInitialized])

  // Handle resize
  useEffect(() => {
    if (!isOpen || !fitAddonRef.current) return

    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit()
        const dims = fitAddonRef.current.proposeDimensions()
        if (dims && isConnected) {
          window.electronAPI.pty.resize(sessionIdRef.current, dims.cols, dims.rows)
        }
      }
    }

    // Fit on open
    setTimeout(handleResize, 100)

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isOpen, isConnected])

  // Cleanup on close - only cleanup when component unmounts (tab closed), not when hidden
  useEffect(() => {
    // Return cleanup function that runs on unmount
    return () => {
      // Use refs which are always current, not stale closure values
      window.electronAPI.pty.close(sessionIdRef.current)
      if (xtermRef.current) {
        xtermRef.current.dispose()
        xtermRef.current = null
      }
      fitAddonRef.current = null
    }
  }, []) // Empty deps - only run cleanup on unmount

  const handleSendToAgent = useCallback(async () => {
    const result = await window.electronAPI.pty.getOutput(sessionIdRef.current)
    if (result.success && result.output) {
      // Strip ANSI codes for cleaner output
      const cleanOutput = result.output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
      const lineCount = (cleanOutput.match(/\n/g) || []).length + 1
      onSendToAgent(cleanOutput, lineCount)
    }
  }, [onSendToAgent])

  const handleClearBuffer = useCallback(async () => {
    const result = await window.electronAPI.pty.clearBuffer(sessionIdRef.current)
    if (result.success) {
      setBufferLineCount(0)
      // Also clear the terminal display
      if (xtermRef.current) {
        xtermRef.current.clear()
      }
    }
  }, [])

  const handleRestart = useCallback(async () => {
    setIsConnected(false)
    // Close existing PTY and wait
    await window.electronAPI.pty.close(sessionIdRef.current)
    // Small delay to ensure cleanup
    await new Promise(resolve => setTimeout(resolve, 100))
    // Clear terminal display
    if (xtermRef.current) {
      xtermRef.current.clear()
    }
    // Create new PTY
    const result = await window.electronAPI.pty.create(sessionIdRef.current, cwd)
    if (result.success) {
      setIsConnected(true)
      setBufferLineCount(0)
      if (fitAddonRef.current) {
        const dims = fitAddonRef.current.proposeDimensions()
        if (dims) {
          window.electronAPI.pty.resize(sessionIdRef.current, dims.cols, dims.rows)
        }
      }
    } else if (xtermRef.current) {
      xtermRef.current.writeln(`\x1b[31mFailed to restart: ${result.error}\x1b[0m`)
    }
  }, [cwd])

  // Handle resize drag
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    const startY = e.clientY
    const startHeight = terminalHeight

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY
      const newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeight + deltaY))
      setTerminalHeight(newHeight)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      // Refit terminal after resize
      if (fitAddonRef.current) {
        fitAddonRef.current.fit()
        const dims = fitAddonRef.current.proposeDimensions()
        if (dims && isConnected) {
          window.electronAPI.pty.resize(sessionIdRef.current, dims.cols, dims.rows)
        }
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [terminalHeight, isConnected])

  // Refit terminal when height changes during drag
  useEffect(() => {
    if (isResizing && fitAddonRef.current) {
      fitAddonRef.current.fit()
    }
  }, [terminalHeight, isResizing])

  return (
    <div 
      className={`flex flex-col border-b border-copilot-border bg-copilot-terminal-bg ${!isOpen ? 'hidden' : ''}`}
      data-tour="terminal-panel"
    >
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-copilot-surface border-b border-copilot-border">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? 'bg-copilot-success' : 'bg-copilot-error'}`} />
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
      <div
        onMouseDown={handleResizeStart}
        className="h-0 cursor-ns-resize shrink-0 relative z-10"
      >
        <div className="absolute inset-x-0 -bottom-1 h-2 hover:bg-copilot-accent/50 transition-colors" />
      </div>
    </div>
  )
}

export default TerminalPanel
