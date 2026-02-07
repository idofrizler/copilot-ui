import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  // Platform information
  platform: process.platform,

  // Copilot communication
  copilot: {
    send: (
      sessionId: string,
      prompt: string,
      attachments?: { type: 'file'; path: string; displayName?: string }[],
      mode?: 'enqueue' | 'immediate'
    ): Promise<string> => {
      return ipcRenderer.invoke('copilot:send', { sessionId, prompt, attachments, mode });
    },
    sendAndWait: (
      sessionId: string,
      prompt: string,
      attachments?: { type: 'file'; path: string; displayName?: string }[]
    ): Promise<string> => {
      return ipcRenderer.invoke('copilot:sendAndWait', { sessionId, prompt, attachments });
    },
    generateTitle: (conversation: string): Promise<string> => {
      return ipcRenderer.invoke('copilot:generateTitle', { conversation });
    },
    getMessages: (
      sessionId: string
    ): Promise<{ role: 'user' | 'assistant'; content: string }[]> => {
      return ipcRenderer.invoke('copilot:getMessages', sessionId);
    },
    abort: (sessionId: string): void => {
      ipcRenderer.send('copilot:abort', sessionId);
    },

    // Session management
    createSession: (options?: {
      cwd?: string;
    }): Promise<{ sessionId: string; model: string; cwd: string }> => {
      return ipcRenderer.invoke('copilot:createSession', options);
    },
    getCwd: (): Promise<string> => {
      return ipcRenderer.invoke('copilot:getCwd');
    },
    pickFolder: (): Promise<{ canceled: boolean; path: string | null }> => {
      return ipcRenderer.invoke('copilot:pickFolder');
    },
    checkDirectoryTrust: (dir: string): Promise<{ trusted: boolean; decision: string }> => {
      return ipcRenderer.invoke('copilot:checkDirectoryTrust', dir);
    },
    closeSession: (sessionId: string): Promise<{ success: boolean; remainingSessions: number }> => {
      return ipcRenderer.invoke('copilot:closeSession', sessionId);
    },
    deleteSessionFromHistory: (
      sessionId: string
    ): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('copilot:deleteSessionFromHistory', sessionId);
    },
    switchSession: (sessionId: string): Promise<{ sessionId: string; model: string }> => {
      return ipcRenderer.invoke('copilot:switchSession', sessionId);
    },
    saveOpenSessions: (
      sessions: {
        sessionId: string;
        model: string;
        cwd: string;
        editedFiles?: string[];
        alwaysAllowed?: string[];
        name?: string;
      }[]
    ): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('copilot:saveOpenSessions', sessions);
    },
    // Persist a single session's mark/note immediately
    saveSessionMark: (
      sessionId: string,
      mark: { markedForReview?: boolean; reviewNote?: string }
    ): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('copilot:saveSessionMark', { sessionId, mark });
    },
    renameSession: (sessionId: string, name: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('copilot:renameSession', { sessionId, name });
    },
    saveMessageAttachments: (
      sessionId: string,
      attachments: Array<{
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
      }>
    ): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('copilot:saveMessageAttachments', { sessionId, attachments });
    },
    loadMessageAttachments: (
      sessionId: string
    ): Promise<{
      attachments: Array<{
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
      }>;
    }> => {
      return ipcRenderer.invoke('copilot:loadMessageAttachments', sessionId);
    },
    resumePreviousSession: (
      sessionId: string,
      cwd?: string
    ): Promise<{
      sessionId: string;
      model: string;
      cwd: string;
      alreadyOpen: boolean;
      editedFiles?: string[];
      alwaysAllowed?: string[];
    }> => {
      return ipcRenderer.invoke('copilot:resumePreviousSession', sessionId, cwd);
    },

    onReady: (
      callback: (data: {
        sessions: {
          sessionId: string;
          model: string;
          cwd: string;
          name?: string;
          editedFiles?: string[];
          alwaysAllowed?: string[];
        }[];
        previousSessions: {
          sessionId: string;
          name?: string;
          modifiedTime: string;
          cwd?: string;
        }[];
        models: { id: string; name: string; multiplier: number }[];
      }) => void
    ): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: {
          sessions: {
            sessionId: string;
            model: string;
            cwd: string;
            name?: string;
            editedFiles?: string[];
            alwaysAllowed?: string[];
          }[];
          previousSessions: {
            sessionId: string;
            name?: string;
            modifiedTime: string;
            cwd?: string;
          }[];
          models: { id: string; name: string; multiplier: number }[];
        }
      ): void => callback(data);
      ipcRenderer.on('copilot:ready', handler);
      return () => ipcRenderer.removeListener('copilot:ready', handler);
    },
    onSessionResumed: (
      callback: (data: {
        session: {
          sessionId: string;
          model: string;
          cwd: string;
          name?: string;
          editedFiles?: string[];
          alwaysAllowed?: string[];
        };
      }) => void
    ): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: {
          session: {
            sessionId: string;
            model: string;
            cwd: string;
            name?: string;
            editedFiles?: string[];
            alwaysAllowed?: string[];
          };
        }
      ): void => callback(data);
      ipcRenderer.on('copilot:sessionResumed', handler);
      return () => ipcRenderer.removeListener('copilot:sessionResumed', handler);
    },
    setModel: (
      sessionId: string,
      model: string
    ): Promise<{ sessionId: string; model: string; cwd?: string }> => {
      return ipcRenderer.invoke('copilot:setModel', { sessionId, model });
    },
    getModels: (): Promise<{
      models: { id: string; name: string; multiplier: number }[];
      current: string;
    }> => {
      return ipcRenderer.invoke('copilot:getModels');
    },
    onDelta: (callback: (data: { sessionId: string; content: string }) => void): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { sessionId: string; content: string }
      ): void => callback(data);
      ipcRenderer.on('copilot:delta', handler);
      return () => ipcRenderer.removeListener('copilot:delta', handler);
    },
    onMessage: (callback: (data: { sessionId: string; content: string }) => void): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { sessionId: string; content: string }
      ): void => callback(data);
      ipcRenderer.on('copilot:message', handler);
      return () => ipcRenderer.removeListener('copilot:message', handler);
    },
    onIdle: (callback: (data: { sessionId: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string }): void =>
        callback(data);
      ipcRenderer.on('copilot:idle', handler);
      return () => ipcRenderer.removeListener('copilot:idle', handler);
    },
    onToolStart: (
      callback: (data: {
        sessionId: string;
        toolCallId: string;
        toolName: string;
        input?: Record<string, unknown>;
      }) => void
    ): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: {
          sessionId: string;
          toolCallId: string;
          toolName: string;
          input?: Record<string, unknown>;
        }
      ): void => callback(data);
      ipcRenderer.on('copilot:tool-start', handler);
      return () => ipcRenderer.removeListener('copilot:tool-start', handler);
    },
    onToolEnd: (
      callback: (data: {
        sessionId: string;
        toolCallId: string;
        toolName: string;
        input?: Record<string, unknown>;
        output?: unknown;
      }) => void
    ): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: {
          sessionId: string;
          toolCallId: string;
          toolName: string;
          input?: Record<string, unknown>;
          output?: unknown;
        }
      ): void => callback(data);
      ipcRenderer.on('copilot:tool-end', handler);
      return () => ipcRenderer.removeListener('copilot:tool-end', handler);
    },
    onConfirm: (callback: (data: { sessionId: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string }): void =>
        callback(data);
      ipcRenderer.on('copilot:confirm', handler);
      return () => ipcRenderer.removeListener('copilot:confirm', handler);
    },
    onPermission: (
      callback: (data: {
        requestId: string;
        kind: string;
        executable?: string;
        fullCommand?: string;
        [key: string]: unknown;
      }) => void
    ): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { requestId: string; kind: string }
      ): void => callback(data);
      ipcRenderer.on('copilot:permission', handler);
      return () => ipcRenderer.removeListener('copilot:permission', handler);
    },
    respondPermission: (data: {
      requestId: string;
      decision: 'approved' | 'always' | 'global' | 'denied';
    }): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('copilot:permissionResponse', data);
    },
    getAlwaysAllowed: (sessionId: string): Promise<string[]> => {
      return ipcRenderer.invoke('copilot:getAlwaysAllowed', sessionId);
    },
    removeAlwaysAllowed: (sessionId: string, executable: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('copilot:removeAlwaysAllowed', { sessionId, executable });
    },
    addAlwaysAllowed: (sessionId: string, command: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('copilot:addAlwaysAllowed', { sessionId, command });
    },
    getGlobalSafeCommands: (): Promise<string[]> => {
      return ipcRenderer.invoke('copilot:getGlobalSafeCommands');
    },
    addGlobalSafeCommand: (command: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('copilot:addGlobalSafeCommand', command);
    },
    removeGlobalSafeCommand: (command: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('copilot:removeGlobalSafeCommand', command);
    },
    // Favorite models management
    getFavoriteModels: (): Promise<string[]> => {
      return ipcRenderer.invoke('copilot:getFavoriteModels');
    },
    addFavoriteModel: (modelId: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('copilot:addFavoriteModel', modelId);
    },
    removeFavoriteModel: (modelId: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('copilot:removeFavoriteModel', modelId);
    },
    // URL allowlist/denylist management
    getAllowedUrls: (): Promise<string[]> => {
      return ipcRenderer.invoke('copilot:getAllowedUrls');
    },
    addAllowedUrl: (url: string): Promise<{ success: boolean; hostname: string }> => {
      return ipcRenderer.invoke('copilot:addAllowedUrl', url);
    },
    removeAllowedUrl: (url: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('copilot:removeAllowedUrl', url);
    },
    getDeniedUrls: (): Promise<string[]> => {
      return ipcRenderer.invoke('copilot:getDeniedUrls');
    },
    addDeniedUrl: (url: string): Promise<{ success: boolean; hostname: string }> => {
      return ipcRenderer.invoke('copilot:addDeniedUrl', url);
    },
    removeDeniedUrl: (url: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('copilot:removeDeniedUrl', url);
    },
    onError: (callback: (data: { sessionId: string; message: string }) => void): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { sessionId: string; message: string }
      ): void => callback(data);
      ipcRenderer.on('copilot:error', handler);
      return () => ipcRenderer.removeListener('copilot:error', handler);
    },
    onModelsVerified: (
      callback: (data: { models: { id: string; name: string; multiplier: number }[] }) => void
    ): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { models: { id: string; name: string; multiplier: number }[] }
      ): void => callback(data);
      ipcRenderer.on('copilot:modelsVerified', handler);
      return () => ipcRenderer.removeListener('copilot:modelsVerified', handler);
    },
    onUsageInfo: (
      callback: (data: {
        sessionId: string;
        tokenLimit: number;
        currentTokens: number;
        messagesLength: number;
      }) => void
    ): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: {
          sessionId: string;
          tokenLimit: number;
          currentTokens: number;
          messagesLength: number;
        }
      ): void => callback(data);
      ipcRenderer.on('copilot:usageInfo', handler);
      return () => ipcRenderer.removeListener('copilot:usageInfo', handler);
    },
    onCompactionStart: (callback: (data: { sessionId: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string }): void =>
        callback(data);
      ipcRenderer.on('copilot:compactionStart', handler);
      return () => ipcRenderer.removeListener('copilot:compactionStart', handler);
    },
    onCompactionComplete: (
      callback: (data: {
        sessionId: string;
        success: boolean;
        preCompactionTokens?: number;
        postCompactionTokens?: number;
        tokensRemoved?: number;
        summaryContent?: string;
        error?: string;
      }) => void
    ): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: {
          sessionId: string;
          success: boolean;
          preCompactionTokens?: number;
          postCompactionTokens?: number;
          tokensRemoved?: number;
          summaryContent?: string;
          error?: string;
        }
      ): void => callback(data);
      ipcRenderer.on('copilot:compactionComplete', handler);
      return () => ipcRenderer.removeListener('copilot:compactionComplete', handler);
    },
    detectChoices: (
      message: string
    ): Promise<{
      isChoice: boolean;
      options?: { id: string; label: string; description?: string }[];
    }> => {
      return ipcRenderer.invoke('copilot:detectChoices', { message });
    },
    getModelCapabilities: (
      modelId: string
    ): Promise<{
      supportsVision: boolean;
      visionLimits?: {
        supportedMediaTypes: string[];
        maxPromptImages: number;
        maxPromptImageSize: number;
      };
    }> => {
      return ipcRenderer.invoke('copilot:getModelCapabilities', modelId);
    },
    saveImageToTemp: (
      dataUrl: string,
      filename: string
    ): Promise<{ success: boolean; path?: string; error?: string }> => {
      return ipcRenderer.invoke('copilot:saveImageToTemp', { dataUrl, filename });
    },
    saveFileToTemp: (
      dataUrl: string,
      filename: string,
      mimeType: string
    ): Promise<{ success: boolean; path?: string; size?: number; error?: string }> => {
      return ipcRenderer.invoke('copilot:saveFileToTemp', { dataUrl, filename, mimeType });
    },
    fetchImageFromUrl: (
      url: string
    ): Promise<{
      success: boolean;
      path?: string;
      dataUrl?: string;
      mimeType?: string;
      size?: number;
      filename?: string;
      error?: string;
    }> => {
      return ipcRenderer.invoke('copilot:fetchImageFromUrl', url);
    },
  },

  // Window controls
  window: {
    minimize: (): void => {
      ipcRenderer.send('window:minimize');
    },
    maximize: (): void => {
      ipcRenderer.send('window:maximize');
    },
    close: (): void => {
      ipcRenderer.send('window:close');
    },
    quit: (): void => {
      ipcRenderer.send('window:quit');
    },
    updateTitleBarOverlay: (options: { color: string; symbolColor: string }): void => {
      ipcRenderer.send('window:updateTitleBarOverlay', options);
    },
  },

  // Git operations
  git: {
    isGitRepo: (cwd: string): Promise<{ success: boolean; isGitRepo: boolean; error?: string }> => {
      return ipcRenderer.invoke('git:isGitRepo', cwd);
    },
    getChangedFiles: (
      cwd: string,
      files: string[],
      includeAll?: boolean
    ): Promise<{ success: boolean; files: string[]; error?: string }> => {
      return ipcRenderer.invoke('git:getChangedFiles', { cwd, files, includeAll });
    },
    getDiff: (
      cwd: string,
      files: string[]
    ): Promise<{ diff: string; success: boolean; error?: string }> => {
      return ipcRenderer.invoke('git:getDiff', { cwd, files });
    },
    commitAndPush: (
      cwd: string,
      files: string[],
      message: string
    ): Promise<{ success: boolean; error?: string; finalBranch?: string }> => {
      return ipcRenderer.invoke('git:commitAndPush', { cwd, files, message });
    },
    generateCommitMessage: (diff: string): Promise<string> => {
      return ipcRenderer.invoke('git:generateCommitMessage', { diff });
    },
    getBranch: (
      cwd: string
    ): Promise<{ branch: string | null; success: boolean; error?: string }> => {
      return ipcRenderer.invoke('git:getBranch', cwd);
    },
    listBranches: (
      cwd: string
    ): Promise<{ success: boolean; branches: string[]; error?: string }> => {
      return ipcRenderer.invoke('git:listBranches', cwd);
    },
    checkMainAhead: (
      cwd: string,
      targetBranch?: string
    ): Promise<{
      success: boolean;
      isAhead: boolean;
      commits: string[];
      targetBranch?: string;
      error?: string;
    }> => {
      return ipcRenderer.invoke('git:checkMainAhead', { cwd, targetBranch });
    },
    mergeMainIntoBranch: (
      cwd: string,
      targetBranch: string
    ): Promise<{
      success: boolean;
      targetBranch?: string;
      error?: string;
      warning?: string;
      conflictedFiles?: string[];
    }> => {
      return ipcRenderer.invoke('git:mergeMainIntoBranch', { cwd, targetBranch });
    },
    checkoutBranch: (
      cwd: string,
      branchName: string
    ): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('git:checkoutBranch', { cwd, branchName });
    },
    mergeToMain: (
      cwd: string,
      deleteBranch: boolean,
      targetBranch: string,
      untrackedFiles?: string[]
    ): Promise<{
      success: boolean;
      error?: string;
      mergedBranch?: string;
      targetBranch?: string;
    }> => {
      return ipcRenderer.invoke('git:mergeToMain', {
        cwd,
        deleteBranch,
        targetBranch,
        untrackedFiles,
      });
    },
    createPullRequest: (
      cwd: string,
      title: string | undefined,
      draft: boolean | undefined,
      targetBranch: string,
      untrackedFiles?: string[]
    ): Promise<{
      success: boolean;
      error?: string;
      prUrl?: string;
      branch?: string;
      targetBranch?: string;
    }> => {
      return ipcRenderer.invoke('git:createPullRequest', {
        cwd,
        title,
        draft,
        targetBranch,
        untrackedFiles,
      });
    },
    getWorkingStatus: (
      cwd: string
    ): Promise<{
      success: boolean;
      hasUncommittedChanges: boolean;
      hasUnpushedCommits: boolean;
      error?: string;
    }> => {
      return ipcRenderer.invoke('git:getWorkingStatus', cwd);
    },
  },

  // Whisper.cpp speech recognition (native)
  voice: {
    loadModel: (): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('voice:loadModel');
    },
    loadTinyModel: (): Promise<{ success: boolean; path?: string; error?: string }> => {
      return ipcRenderer.invoke('voice:loadTinyModel');
    },
    getState: (): Promise<{
      isModelLoaded: boolean;
      isRecording: boolean;
      error: string | null;
    }> => {
      return ipcRenderer.invoke('voice:getState');
    },
    startRecording: (): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('voice:startRecording');
    },
    processAudio: (
      audioData: Uint8Array
    ): Promise<{
      success: boolean;
      isSilence?: boolean;
      text?: string;
      partial?: string;
      error?: string;
    }> => {
      return ipcRenderer.invoke('voice:processAudio', audioData);
    },
    processAndTranscribe: (
      audioData: Uint8Array,
      mimeType: string
    ): Promise<{ success: boolean; text?: string; error?: string }> => {
      return ipcRenderer.invoke('voice:processAndTranscribe', audioData, mimeType);
    },
    detectWakeWord: (
      audioData: Uint8Array,
      mimeType: string
    ): Promise<{
      success: boolean;
      text?: string;
      wakeWordDetected?: boolean;
      stopWordDetected?: boolean;
      abortWordDetected?: boolean;
      error?: string;
    }> => {
      return ipcRenderer.invoke('voice:detectWakeWord', audioData, mimeType);
    },
    stopRecording: (): Promise<{ success: boolean; text?: string; error?: string }> => {
      return ipcRenderer.invoke('voice:stopRecording');
    },
    dispose: (): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('voice:dispose');
    },
    onResult: (callback: (data: { text: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { text: string }) => callback(data);
      ipcRenderer.on('voice:result', handler);
      return () => ipcRenderer.removeListener('voice:result', handler);
    },
    onPartialResult: (callback: (data: { partial: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { partial: string }) =>
        callback(data);
      ipcRenderer.on('voice:partialResult', handler);
      return () => ipcRenderer.removeListener('voice:partialResult', handler);
    },
  },

  // Whisper model management (for native whisper.cpp STT)
  voiceServer: {
    // Whisper model management
    checkModel: (): Promise<{
      exists: boolean;
      path?: string;
      size?: number;
      binaryExists?: boolean;
      binaryPath?: string;
    }> => {
      return ipcRenderer.invoke('voiceServer:checkModel');
    },
    downloadModel: (): Promise<{ success: boolean; path?: string; error?: string }> => {
      return ipcRenderer.invoke('voiceServer:downloadModel');
    },
    onDownloadProgress: (
      callback: (data: {
        progress: number;
        downloaded: number;
        total: number;
        status: string;
      }) => void
    ): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { progress: number; downloaded: number; total: number; status: string }
      ) => callback(data);
      ipcRenderer.on('voiceServer:downloadProgress', handler);
      return () => ipcRenderer.removeListener('voiceServer:downloadProgress', handler);
    },
    // Tiny model for wake word detection
    checkTinyModel: (): Promise<{ exists: boolean; path?: string }> => {
      return ipcRenderer.invoke('voiceServer:checkTinyModel');
    },
    downloadTinyModel: (): Promise<{ success: boolean; path?: string; error?: string }> => {
      return ipcRenderer.invoke('voiceServer:downloadTinyModel');
    },
  },

  // Settings for target branch persistence
  settings: {
    getTargetBranch: (
      repoPath: string
    ): Promise<{ success: boolean; targetBranch: string | null; error?: string }> => {
      return ipcRenderer.invoke('settings:getTargetBranch', repoPath);
    },
    setTargetBranch: (
      repoPath: string,
      targetBranch: string
    ): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('settings:setTargetBranch', { repoPath, targetBranch });
    },
  },
  // Theme management
  theme: {
    get: (): Promise<string> => {
      return ipcRenderer.invoke('theme:get');
    },
    set: (themeId: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('theme:set', themeId);
    },
    getSystemTheme: (): Promise<'light' | 'dark'> => {
      return ipcRenderer.invoke('theme:getSystemTheme');
    },
    listExternal: (): Promise<{
      themes: {
        id: string;
        name: string;
        type: 'light' | 'dark';
        colors: Record<string, string>;
        author?: string;
        version?: string;
      }[];
      invalidFiles: string[];
    }> => {
      return ipcRenderer.invoke('theme:listExternal');
    },
    import: (): Promise<{
      success: boolean;
      canceled?: boolean;
      error?: string;
      theme?: { id: string; name: string; type: 'light' | 'dark' };
    }> => {
      return ipcRenderer.invoke('theme:import');
    },
    getThemesDir: (): Promise<string> => {
      return ipcRenderer.invoke('theme:getThemesDir');
    },
    onSystemChange: (callback: (data: { systemTheme: 'light' | 'dark' }) => void): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { systemTheme: 'light' | 'dark' }
      ): void => callback(data);
      ipcRenderer.on('theme:systemChanged', handler);
      return () => ipcRenderer.removeListener('theme:systemChanged', handler);
    },
  },
  // MCP Server Management
  mcp: {
    getConfig: (): Promise<{ mcpServers: Record<string, MCPServerConfig> }> => {
      return ipcRenderer.invoke('mcp:getConfig');
    },
    saveConfig: (config: {
      mcpServers: Record<string, MCPServerConfig>;
    }): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('mcp:saveConfig', config);
    },
    addServer: (name: string, server: MCPServerConfig): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('mcp:addServer', { name, server });
    },
    updateServer: (
      name: string,
      server: MCPServerConfig
    ): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('mcp:updateServer', { name, server });
    },
    deleteServer: (name: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('mcp:deleteServer', name);
    },
    getConfigPath: (): Promise<{ path: string }> => {
      return ipcRenderer.invoke('mcp:getConfigPath');
    },
  },
  // Agent Skills Management
  skills: {
    getAll: (cwd?: string): Promise<{ skills: Skill[]; errors: string[] }> => {
      return ipcRenderer.invoke('skills:getAll', cwd);
    },
  },
  // Copilot Instructions Management
  instructions: {
    getAll: (cwd?: string): Promise<{ instructions: Instruction[]; errors: string[] }> => {
      return ipcRenderer.invoke('instructions:getAll', cwd);
    },
  },
  // Browser Automation Management
  browser: {
    hasActive: (): Promise<{ active: boolean }> => {
      return ipcRenderer.invoke('browser:hasActive');
    },
    getActiveSessions: (): Promise<{ sessions: string[] }> => {
      return ipcRenderer.invoke('browser:getActiveSessions');
    },
    close: (sessionId?: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('browser:close', sessionId);
    },
    saveState: (): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('browser:saveState');
    },
  },
  // Worktree Session Management
  worktree: {
    fetchGitHubIssue: (
      issueUrl: string
    ): Promise<{
      success: boolean;
      issue?: {
        number: number;
        title: string;
        body: string | null;
        state: 'open' | 'closed';
        html_url: string;
        comments?: Array<{ body: string; user: { login: string }; created_at: string }>;
      };
      suggestedBranch?: string;
      error?: string;
    }> => {
      return ipcRenderer.invoke('worktree:fetchGitHubIssue', issueUrl);
    },
    fetchAzureDevOpsWorkItem: (
      workItemUrl: string
    ): Promise<{
      success: boolean;
      workItem?: {
        number: number;
        title: string;
        body: string | null;
        state: string;
        html_url: string;
        comments?: Array<{ body: string; user: { login: string }; created_at: string }>;
      };
      suggestedBranch?: string;
      error?: string;
    }> => {
      return ipcRenderer.invoke('worktree:fetchAzureDevOpsWorkItem', workItemUrl);
    },
    checkGitVersion: (): Promise<{ supported: boolean; version: string }> => {
      return ipcRenderer.invoke('worktree:checkGitVersion');
    },
    createSession: (data: {
      repoPath: string;
      branch: string;
    }): Promise<{
      success: boolean;
      session?: WorktreeSession;
      error?: string;
    }> => {
      return ipcRenderer.invoke('worktree:createSession', data);
    },
    removeSession: (data: {
      sessionId: string;
      force?: boolean;
    }): Promise<{
      success: boolean;
      error?: string;
    }> => {
      return ipcRenderer.invoke('worktree:removeSession', data);
    },
    listSessions: (): Promise<{
      sessions: Array<WorktreeSession & { diskUsage: string }>;
      totalDiskUsage: string;
    }> => {
      return ipcRenderer.invoke('worktree:listSessions');
    },
    getSession: (sessionId: string): Promise<WorktreeSession | null> => {
      return ipcRenderer.invoke('worktree:getSession', sessionId);
    },
    findSession: (data: { repoPath: string; branch: string }): Promise<WorktreeSession | null> => {
      return ipcRenderer.invoke('worktree:findSession', data);
    },
    switchSession: (sessionId: string): Promise<WorktreeSession | null> => {
      return ipcRenderer.invoke('worktree:switchSession', sessionId);
    },
    pruneSessions: (options?: {
      dryRun?: boolean;
      maxAgeDays?: number;
    }): Promise<{
      pruned: string[];
      errors: Array<{ sessionId: string; error: string }>;
    }> => {
      return ipcRenderer.invoke('worktree:pruneSessions', options);
    },
    checkOrphaned: (): Promise<WorktreeSession[]> => {
      return ipcRenderer.invoke('worktree:checkOrphaned');
    },
    recoverSession: (
      sessionId: string
    ): Promise<{
      success: boolean;
      session?: WorktreeSession;
      error?: string;
    }> => {
      return ipcRenderer.invoke('worktree:recoverSession', sessionId);
    },
    getConfig: (): Promise<WorktreeConfig> => {
      return ipcRenderer.invoke('worktree:getConfig');
    },
    updateConfig: (updates: Partial<WorktreeConfig>): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('worktree:updateConfig', updates);
    },
  },
  // PTY (Terminal) management
  pty: {
    create: (sessionId: string, cwd: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('pty:create', { sessionId, cwd });
    },
    write: (sessionId: string, data: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('pty:write', { sessionId, data });
    },
    resize: (
      sessionId: string,
      cols: number,
      rows: number
    ): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('pty:resize', { sessionId, cols, rows });
    },
    getOutput: (
      sessionId: string
    ): Promise<{ success: boolean; output?: string; error?: string }> => {
      return ipcRenderer.invoke('pty:getOutput', sessionId);
    },
    clearBuffer: (sessionId: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('pty:clearBuffer', sessionId);
    },
    close: (sessionId: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('pty:close', sessionId);
    },
    exists: (sessionId: string): Promise<{ exists: boolean }> => {
      return ipcRenderer.invoke('pty:exists', sessionId);
    },
    onData: (callback: (data: { sessionId: string; data: string }) => void): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { sessionId: string; data: string }
      ): void => callback(data);
      ipcRenderer.on('pty:data', handler);
      return () => ipcRenderer.removeListener('pty:data', handler);
    },
    onExit: (callback: (data: { sessionId: string; exitCode: number }) => void): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { sessionId: string; exitCode: number }
      ): void => callback(data);
      ipcRenderer.on('pty:exit', handler);
      return () => ipcRenderer.removeListener('pty:exit', handler);
    },
  },
  // File operations
  file: {
    readContent: (
      filePath: string
    ): Promise<{
      success: boolean;
      content?: string;
      fileSize?: number;
      fileName?: string;
      error?: string;
      errorType?: 'not_found' | 'too_large' | 'binary' | 'read_error';
    }> => {
      return ipcRenderer.invoke('file:readContent', filePath);
    },
    revealInFolder: (
      filePath: string,
      cwd?: string
    ): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('file:revealInFolder', { filePath, cwd });
    },
    openFile: (filePath: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('file:openFile', filePath);
    },
  },
  // Updates and Release Notes
  updates: {
    checkForUpdate: (): Promise<{
      hasUpdate: boolean;
      currentVersion?: string;
      latestVersion?: string;
      releaseNotes?: string;
      releaseUrl?: string;
      downloadUrl?: string;
      error?: string;
    }> => {
      return ipcRenderer.invoke('updates:checkForUpdate');
    },
    dismissVersion: (version: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('updates:dismissVersion', version);
    },
    getLastSeenVersion: (): Promise<{ version: string }> => {
      return ipcRenderer.invoke('updates:getLastSeenVersion');
    },
    setLastSeenVersion: (version: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('updates:setLastSeenVersion', version);
    },
    openDownloadUrl: (url: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('updates:openDownloadUrl', url);
    },
    canAutoUpdate: (): Promise<{ canAutoUpdate: boolean; repoPath?: string; reason?: string }> => {
      return ipcRenderer.invoke('updates:canAutoUpdate');
    },
    performUpdate: (): Promise<{
      success: boolean;
      message?: string;
      needsRestart?: boolean;
      error?: string;
    }> => {
      return ipcRenderer.invoke('updates:performUpdate');
    },
    restartApp: (): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('updates:restartApp');
    },
  },
  // Welcome wizard
  wizard: {
    hasSeenWelcome: (): Promise<{ hasSeen: boolean }> => {
      return ipcRenderer.invoke('wizard:hasSeenWelcome');
    },
    markWelcomeAsSeen: (): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('wizard:markWelcomeAsSeen');
    },
  },
  // App info
  app: {
    isPackaged: (): Promise<boolean> => {
      return ipcRenderer.invoke('app:isPackaged');
    },
    getInstallationId: (): Promise<string> => {
      return ipcRenderer.invoke('app:getInstallationId');
    },
  },
};

// MCP Server Configuration types
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

// Agent Skill types
interface Skill {
  name: string;
  description: string;
  license?: string;
  path: string;
  type: 'personal' | 'project';
  source: 'copilot' | 'claude';
}

// Copilot Instruction types
interface Instruction {
  name: string;
  path: string;
  type: 'personal' | 'project' | 'organization';
  scope: 'repository' | 'path-specific';
}

// Worktree Session types
interface WorktreeSession {
  id: string;
  repoPath: string;
  branch: string;
  worktreePath: string;
  createdAt: string;
  lastAccessedAt: string;
  status: 'active' | 'idle' | 'orphaned';
  pid?: number;
}

interface WorktreeConfig {
  directory: string;
  pruneAfterDays: number;
  warnDiskThresholdMB: number;
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
