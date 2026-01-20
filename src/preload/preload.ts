import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  // Copilot communication
  copilot: {
    send: (prompt: string): Promise<string> => {
      return ipcRenderer.invoke('copilot:send', prompt)
    },
    sendAndWait: (prompt: string): Promise<string> => {
      return ipcRenderer.invoke('copilot:sendAndWait', prompt)
    },
    abort: (): void => {
      ipcRenderer.send('copilot:abort')
    },
    reset: (): Promise<void> => {
      return ipcRenderer.invoke('copilot:reset')
    },
    onReady: (callback: (data: { model: string; models: string[] }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { model: string; models: string[] }): void => callback(data)
      ipcRenderer.on('copilot:ready', handler)
      return () => ipcRenderer.removeListener('copilot:ready', handler)
    },
    setModel: (model: string): Promise<{ model: string }> => {
      return ipcRenderer.invoke('copilot:setModel', model)
    },
    getModels: (): Promise<{ models: string[]; current: string }> => {
      return ipcRenderer.invoke('copilot:getModels')
    },
    onDelta: (callback: (delta: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, delta: string): void => callback(delta)
      ipcRenderer.on('copilot:delta', handler)
      return () => ipcRenderer.removeListener('copilot:delta', handler)
    },
    onMessage: (callback: (content: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, content: string): void => callback(content)
      ipcRenderer.on('copilot:message', handler)
      return () => ipcRenderer.removeListener('copilot:message', handler)
    },
    onIdle: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('copilot:idle', handler)
      return () => ipcRenderer.removeListener('copilot:idle', handler)
    },
    onToolStart: (callback: (data: unknown) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => callback(data)
      ipcRenderer.on('copilot:tool-start', handler)
      return () => ipcRenderer.removeListener('copilot:tool-start', handler)
    },
    onToolEnd: (callback: (data: unknown) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => callback(data)
      ipcRenderer.on('copilot:tool-end', handler)
      return () => ipcRenderer.removeListener('copilot:tool-end', handler)
    },
    onConfirm: (callback: (data: unknown) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => callback(data)
      ipcRenderer.on('copilot:confirm', handler)
      return () => ipcRenderer.removeListener('copilot:confirm', handler)
    },
    onPermission: (callback: (data: { requestId: string; kind: string; [key: string]: unknown }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { requestId: string; kind: string }): void => callback(data)
      ipcRenderer.on('copilot:permission', handler)
      return () => ipcRenderer.removeListener('copilot:permission', handler)
    },
    respondPermission: (data: { requestId: string; decision: 'approved' | 'always' | 'denied' }): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('copilot:permissionResponse', data)
    },
    onError: (callback: (error: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, error: string): void => callback(error)
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
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
