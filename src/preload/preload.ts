import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  // Copilot communication
  copilot: {
    send: (sessionId: string, prompt: string): Promise<string> => {
      return ipcRenderer.invoke('copilot:send', { sessionId, prompt })
    },
    sendAndWait: (sessionId: string, prompt: string): Promise<string> => {
      return ipcRenderer.invoke('copilot:sendAndWait', { sessionId, prompt })
    },
    generateTitle: (conversation: string): Promise<string> => {
      return ipcRenderer.invoke('copilot:generateTitle', { conversation })
    },
    getMessages: (sessionId: string): Promise<{ role: 'user' | 'assistant'; content: string }[]> => {
      return ipcRenderer.invoke('copilot:getMessages', sessionId)
    },
    abort: (sessionId: string): void => {
      ipcRenderer.send('copilot:abort', sessionId)
    },
    
    // Session management
    createSession: (options?: { cwd?: string }): Promise<{ sessionId: string; model: string; cwd: string }> => {
      return ipcRenderer.invoke('copilot:createSession', options)
    },
    getCwd: (): Promise<string> => {
      return ipcRenderer.invoke('copilot:getCwd')
    },
    pickFolder: (): Promise<{ canceled: boolean; path: string | null }> => {
      return ipcRenderer.invoke('copilot:pickFolder')
    },
    checkDirectoryTrust: (dir: string): Promise<{ trusted: boolean; decision: string }> => {
      return ipcRenderer.invoke('copilot:checkDirectoryTrust', dir)
    },
    closeSession: (sessionId: string): Promise<{ success: boolean; remainingSessions: number }> => {
      return ipcRenderer.invoke('copilot:closeSession', sessionId)
    },
    switchSession: (sessionId: string): Promise<{ sessionId: string; model: string }> => {
      return ipcRenderer.invoke('copilot:switchSession', sessionId)
    },
    saveOpenSessions: (sessions: { sessionId: string; model: string; cwd: string; editedFiles?: string[]; alwaysAllowed?: string[]; name?: string }[]): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('copilot:saveOpenSessions', sessions)
    },
    renameSession: (sessionId: string, name: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('copilot:renameSession', { sessionId, name })
    },
    resumePreviousSession: (sessionId: string, cwd?: string): Promise<{ sessionId: string; model: string; cwd: string; alreadyOpen: boolean; editedFiles?: string[]; alwaysAllowed?: string[] }> => {
      return ipcRenderer.invoke('copilot:resumePreviousSession', sessionId, cwd)
    },
    
    onReady: (callback: (data: { sessions: { sessionId: string; model: string; cwd: string; name?: string; editedFiles?: string[]; alwaysAllowed?: string[] }[]; previousSessions: { sessionId: string; name?: string; modifiedTime: string; cwd?: string }[]; models: { id: string; name: string; multiplier: number }[] }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessions: { sessionId: string; model: string; cwd: string; name?: string; editedFiles?: string[]; alwaysAllowed?: string[] }[]; previousSessions: { sessionId: string; name?: string; modifiedTime: string; cwd?: string }[]; models: { id: string; name: string; multiplier: number }[] }): void => callback(data)
      ipcRenderer.on('copilot:ready', handler)
      return () => ipcRenderer.removeListener('copilot:ready', handler)
    },
    setModel: (sessionId: string, model: string): Promise<{ sessionId: string; model: string; cwd?: string }> => {
      return ipcRenderer.invoke('copilot:setModel', { sessionId, model })
    },
    getModels: (): Promise<{ models: { id: string; name: string; multiplier: number }[]; current: string }> => {
      return ipcRenderer.invoke('copilot:getModels')
    },
    onDelta: (callback: (data: { sessionId: string; content: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; content: string }): void => callback(data)
      ipcRenderer.on('copilot:delta', handler)
      return () => ipcRenderer.removeListener('copilot:delta', handler)
    },
    onMessage: (callback: (data: { sessionId: string; content: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; content: string }): void => callback(data)
      ipcRenderer.on('copilot:message', handler)
      return () => ipcRenderer.removeListener('copilot:message', handler)
    },
    onIdle: (callback: (data: { sessionId: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string }): void => callback(data)
      ipcRenderer.on('copilot:idle', handler)
      return () => ipcRenderer.removeListener('copilot:idle', handler)
    },
    onToolStart: (callback: (data: { sessionId: string; toolCallId: string; toolName: string; input?: Record<string, unknown> }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; toolCallId: string; toolName: string; input?: Record<string, unknown> }): void => callback(data)
      ipcRenderer.on('copilot:tool-start', handler)
      return () => ipcRenderer.removeListener('copilot:tool-start', handler)
    },
    onToolEnd: (callback: (data: { sessionId: string; toolCallId: string; toolName: string; input?: Record<string, unknown>; output?: unknown }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; toolCallId: string; toolName: string; input?: Record<string, unknown>; output?: unknown }): void => callback(data)
      ipcRenderer.on('copilot:tool-end', handler)
      return () => ipcRenderer.removeListener('copilot:tool-end', handler)
    },
    onConfirm: (callback: (data: { sessionId: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string }): void => callback(data)
      ipcRenderer.on('copilot:confirm', handler)
      return () => ipcRenderer.removeListener('copilot:confirm', handler)
    },
    onPermission: (callback: (data: { requestId: string; kind: string; executable?: string; fullCommand?: string; [key: string]: unknown }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { requestId: string; kind: string }): void => callback(data)
      ipcRenderer.on('copilot:permission', handler)
      return () => ipcRenderer.removeListener('copilot:permission', handler)
    },
    respondPermission: (data: { requestId: string; decision: 'approved' | 'always' | 'denied' }): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('copilot:permissionResponse', data)
    },
    getAlwaysAllowed: (sessionId: string): Promise<string[]> => {
      return ipcRenderer.invoke('copilot:getAlwaysAllowed', sessionId)
    },
    removeAlwaysAllowed: (sessionId: string, executable: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('copilot:removeAlwaysAllowed', { sessionId, executable })
    },
    addAlwaysAllowed: (sessionId: string, command: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('copilot:addAlwaysAllowed', { sessionId, command })
    },
    onError: (callback: (data: { sessionId: string; message: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; message: string }): void => callback(data)
      ipcRenderer.on('copilot:error', handler)
      return () => ipcRenderer.removeListener('copilot:error', handler)
    }
  },

  // Window controls
  window: {
    minimize: (): void => {
      ipcRenderer.send('window:minimize')
    },
    maximize: (): void => {
      ipcRenderer.send('window:maximize')
    },
    close: (): void => {
      ipcRenderer.send('window:close')
    },
    quit: (): void => {
      ipcRenderer.send('window:quit')
    }
  },

  // Git operations
  git: {
    getChangedFiles: (cwd: string, files: string[], includeAll?: boolean): Promise<{ success: boolean; files: string[]; error?: string }> => {
      return ipcRenderer.invoke('git:getChangedFiles', { cwd, files, includeAll })
    },
    getDiff: (cwd: string, files: string[]): Promise<{ diff: string; success: boolean; error?: string }> => {
      return ipcRenderer.invoke('git:getDiff', { cwd, files })
    },
    commitAndPush: (cwd: string, files: string[], message: string, mergeToMain?: boolean): Promise<{ success: boolean; error?: string; mergedToMain?: boolean; finalBranch?: string; mainSyncedWithChanges?: boolean; incomingFiles?: string[] }> => {
      return ipcRenderer.invoke('git:commitAndPush', { cwd, files, message, mergeToMain })
    },
    generateCommitMessage: (diff: string): Promise<string> => {
      return ipcRenderer.invoke('git:generateCommitMessage', { diff })
    },
    getBranch: (cwd: string): Promise<{ branch: string | null; success: boolean; error?: string }> => {
      return ipcRenderer.invoke('git:getBranch', cwd)
    },
    checkoutBranch: (cwd: string, branchName: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('git:checkoutBranch', { cwd, branchName })
    },
    mergeToMain: (cwd: string, deleteBranch?: boolean): Promise<{ success: boolean; error?: string; mergedBranch?: string; targetBranch?: string }> => {
      return ipcRenderer.invoke('git:mergeToMain', { cwd, deleteBranch })
    },
    createPullRequest: (cwd: string, title?: string, draft?: boolean): Promise<{ success: boolean; error?: string; prUrl?: string; branch?: string }> => {
      return ipcRenderer.invoke('git:createPullRequest', { cwd, title, draft })
    },
    getWorkingStatus: (cwd: string): Promise<{ success: boolean; hasUncommittedChanges: boolean; hasUnpushedCommits: boolean; error?: string }> => {
      return ipcRenderer.invoke('git:getWorkingStatus', cwd)
    }
  },
  // Theme management
  theme: {
    get: (): Promise<string> => {
      return ipcRenderer.invoke('theme:get')
    },
    set: (themeId: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('theme:set', themeId)
    },
    getSystemTheme: (): Promise<'light' | 'dark'> => {
      return ipcRenderer.invoke('theme:getSystemTheme')
    },
    listExternal: (): Promise<{ themes: { id: string; name: string; type: 'light' | 'dark'; colors: Record<string, string>; author?: string; version?: string }[]; invalidFiles: string[] }> => {
      return ipcRenderer.invoke('theme:listExternal')
    },
    import: (): Promise<{ success: boolean; canceled?: boolean; error?: string; theme?: { id: string; name: string; type: 'light' | 'dark' } }> => {
      return ipcRenderer.invoke('theme:import')
    },
    getThemesDir: (): Promise<string> => {
      return ipcRenderer.invoke('theme:getThemesDir')
    },
    onSystemChange: (callback: (data: { systemTheme: 'light' | 'dark' }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { systemTheme: 'light' | 'dark' }): void => callback(data)
      ipcRenderer.on('theme:systemChanged', handler)
      return () => ipcRenderer.removeListener('theme:systemChanged', handler)
    },
  },
  // MCP Server Management
  mcp: {
    getConfig: (): Promise<{ mcpServers: Record<string, MCPServerConfig> }> => {
      return ipcRenderer.invoke('mcp:getConfig')
    },
    saveConfig: (config: { mcpServers: Record<string, MCPServerConfig> }): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('mcp:saveConfig', config)
    },
    addServer: (name: string, server: MCPServerConfig): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('mcp:addServer', { name, server })
    },
    updateServer: (name: string, server: MCPServerConfig): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('mcp:updateServer', { name, server })
    },
    deleteServer: (name: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('mcp:deleteServer', name)
    }
  },
  // Worktree Session Management
  worktree: {
    fetchGitHubIssue: (issueUrl: string): Promise<{
      success: boolean
      issue?: { number: number; title: string; body: string | null; state: 'open' | 'closed'; html_url: string }
      suggestedBranch?: string
      error?: string
    }> => {
      return ipcRenderer.invoke('worktree:fetchGitHubIssue', issueUrl)
    },
    checkGitVersion: (): Promise<{ supported: boolean; version: string }> => {
      return ipcRenderer.invoke('worktree:checkGitVersion')
    },
    createSession: (data: { repoPath: string; branch: string }): Promise<{
      success: boolean
      session?: WorktreeSession
      error?: string
    }> => {
      return ipcRenderer.invoke('worktree:createSession', data)
    },
    removeSession: (data: { sessionId: string; force?: boolean }): Promise<{
      success: boolean
      error?: string
    }> => {
      return ipcRenderer.invoke('worktree:removeSession', data)
    },
    listSessions: (): Promise<{
      sessions: Array<WorktreeSession & { diskUsage: string }>
      totalDiskUsage: string
    }> => {
      return ipcRenderer.invoke('worktree:listSessions')
    },
    getSession: (sessionId: string): Promise<WorktreeSession | null> => {
      return ipcRenderer.invoke('worktree:getSession', sessionId)
    },
    findSession: (data: { repoPath: string; branch: string }): Promise<WorktreeSession | null> => {
      return ipcRenderer.invoke('worktree:findSession', data)
    },
    switchSession: (sessionId: string): Promise<WorktreeSession | null> => {
      return ipcRenderer.invoke('worktree:switchSession', sessionId)
    },
    pruneSessions: (options?: { dryRun?: boolean; maxAgeDays?: number }): Promise<{
      pruned: string[]
      errors: Array<{ sessionId: string; error: string }>
    }> => {
      return ipcRenderer.invoke('worktree:pruneSessions', options)
    },
    checkOrphaned: (): Promise<WorktreeSession[]> => {
      return ipcRenderer.invoke('worktree:checkOrphaned')
    },
    recoverSession: (sessionId: string): Promise<{
      success: boolean
      session?: WorktreeSession
      error?: string
    }> => {
      return ipcRenderer.invoke('worktree:recoverSession', sessionId)
    },
    getConfig: (): Promise<WorktreeConfig> => {
      return ipcRenderer.invoke('worktree:getConfig')
    },
    updateConfig: (updates: Partial<WorktreeConfig>): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('worktree:updateConfig', updates)
    }
  },
  // PTY (Terminal) management
  pty: {
    create: (sessionId: string, cwd: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('pty:create', { sessionId, cwd })
    },
    write: (sessionId: string, data: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('pty:write', { sessionId, data })
    },
    resize: (sessionId: string, cols: number, rows: number): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('pty:resize', { sessionId, cols, rows })
    },
    getOutput: (sessionId: string): Promise<{ success: boolean; output?: string; error?: string }> => {
      return ipcRenderer.invoke('pty:getOutput', sessionId)
    },
    clearBuffer: (sessionId: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('pty:clearBuffer', sessionId)
    },
    close: (sessionId: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('pty:close', sessionId)
    },
    exists: (sessionId: string): Promise<{ exists: boolean }> => {
      return ipcRenderer.invoke('pty:exists', sessionId)
    },
    onData: (callback: (data: { sessionId: string; data: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; data: string }): void => callback(data)
      ipcRenderer.on('pty:data', handler)
      return () => ipcRenderer.removeListener('pty:data', handler)
    },
    onExit: (callback: (data: { sessionId: string; exitCode: number }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; exitCode: number }): void => callback(data)
      ipcRenderer.on('pty:exit', handler)
      return () => ipcRenderer.removeListener('pty:exit', handler)
    }
  }
}

// MCP Server Configuration types
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

// Worktree Session types
interface WorktreeSession {
  id: string
  repoPath: string
  branch: string
  worktreePath: string
  createdAt: string
  lastAccessedAt: string
  status: 'active' | 'idle' | 'orphaned'
  pid?: number
}

interface WorktreeConfig {
  directory: string
  pruneAfterDays: number
  warnDiskThresholdMB: number
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
