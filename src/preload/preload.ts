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
    saveOpenSessions: (sessions: { sessionId: string; model: string; cwd: string; editedFiles?: string[]; alwaysAllowed?: string[] }[]): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('copilot:saveOpenSessions', sessions)
    },
    resumePreviousSession: (sessionId: string): Promise<{ sessionId: string; model: string; cwd: string; alreadyOpen: boolean; editedFiles?: string[]; alwaysAllowed?: string[] }> => {
      return ipcRenderer.invoke('copilot:resumePreviousSession', sessionId)
    },
    
    onReady: (callback: (data: { sessions: { sessionId: string; model: string; cwd: string; name?: string; editedFiles?: string[]; alwaysAllowed?: string[] }[]; previousSessions: { sessionId: string; name?: string; modifiedTime: string }[]; models: { id: string; name: string; multiplier: number }[] }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessions: { sessionId: string; model: string; cwd: string; name?: string; editedFiles?: string[]; alwaysAllowed?: string[] }[]; previousSessions: { sessionId: string; name?: string; modifiedTime: string }[]; models: { id: string; name: string; multiplier: number }[] }): void => callback(data)
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
    getDiff: (cwd: string, files: string[]): Promise<{ diff: string; success: boolean; error?: string }> => {
      return ipcRenderer.invoke('git:getDiff', { cwd, files })
    },
    commitAndPush: (cwd: string, files: string[], message: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('git:commitAndPush', { cwd, files, message })
    },
    generateCommitMessage: (diff: string): Promise<string> => {
      return ipcRenderer.invoke('git:generateCommitMessage', { diff })
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
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
