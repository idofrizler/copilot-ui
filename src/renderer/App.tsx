import React, { useState, useCallback, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'

type Status = 'connecting' | 'connected' | 'disconnected'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  isStreaming?: boolean
  toolName?: string
  toolCallId?: string
}

interface ActiveTool {
  toolCallId: string
  toolName: string
  status: 'running' | 'done'
  input?: Record<string, unknown>  // Tool input (path, old_str, new_str, etc.)
  output?: unknown  // Tool output
}

interface ModelInfo {
  id: string
  name: string
  multiplier: number
}

interface PendingConfirmation {
  requestId: string
  sessionId: string
  kind: string
  executable?: string
  toolCallId?: string
  fullCommandText?: string
  intention?: string
  path?: string
  isOutOfScope?: boolean  // True if reading outside session's cwd
  content?: string  // File content for write/create operations
  [key: string]: unknown
}

// Tab/Session state
interface TabState {
  id: string
  name: string
  messages: Message[]
  model: string
  cwd: string  // Current working directory for this session
  isProcessing: boolean
  activeTools: ActiveTool[]
  hasUnreadCompletion: boolean
  pendingConfirmation: PendingConfirmation | null
  needsTitle: boolean  // True if we should generate AI title on next idle
  alwaysAllowed: string[]  // Executables that are always allowed for this session
  editedFiles: string[]  // Files edited/created in this session
  currentIntent: string | null  // Current agent intent from report_intent tool
}

let messageIdCounter = 0
const generateId = () => `msg-${++messageIdCounter}-${Date.now()}`

let tabCounter = 0
const generateTabName = () => `Session ${++tabCounter}`

// Format tool output into a summary string like CLI does
const formatToolOutput = (toolName: string, input: Record<string, unknown>, output: unknown): string => {
  const out = output as Record<string, unknown> | string | undefined
  const path = input.path as string | undefined
  const shortPath = path ? path.split('/').slice(-2).join('/') : ''
  
  if (toolName === 'grep') {
    if (typeof out === 'object' && out?.output) {
      const lines = String(out.output).split('\n').filter(l => l.trim()).length
      return lines > 0 ? `${lines} lines found` : 'No matches found'
    }
    return 'No matches found'
  }
  
  if (toolName === 'glob') {
    if (typeof out === 'object' && out?.output) {
      const files = String(out.output).split('\n').filter(l => l.trim()).length
      return `${files} files found`
    }
    return 'No files found'
  }
  
  if (toolName === 'view') {
    const range = input.view_range as number[] | undefined
    if (range && range.length >= 2) {
      const lineCount = range[1] === -1 ? 'rest of file' : `${range[1] - range[0] + 1} lines`
      return shortPath ? `${shortPath} (${lineCount})` : `${lineCount} read`
    }
    return shortPath ? `${shortPath} read` : 'File read'
  }
  
  if (toolName === 'edit') {
    return shortPath ? `${shortPath} edited` : 'File edited'
  }
  
  if (toolName === 'create') {
    return shortPath ? `${shortPath} created` : 'File created'
  }
  
  if (toolName === 'bash') {
    if (typeof out === 'object' && out?.output) {
      const lines = String(out.output).split('\n').filter(l => l.trim()).length
      return `${lines} lines...`
    }
    return 'Completed'
  }
  
  if (toolName === 'web_fetch') {
    return 'Page fetched'
  }
  
  if (toolName === 'read_bash') {
    return 'Output read'
  }
  
  if (toolName === 'write_bash') {
    return 'Input sent'
  }
  
  return 'Done'
}

// Previous session type (from history, not yet opened)
interface PreviousSession {
  sessionId: string
  name?: string
  modifiedTime: string
}

const App: React.FC = () => {
  const [status, setStatus] = useState<Status>('connecting')
  const [inputValue, setInputValue] = useState('')
  const [tabs, setTabs] = useState<TabState[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([])
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [previousSessions, setPreviousSessions] = useState<PreviousSession[]>([])
  const [showPreviousSessions, setShowPreviousSessions] = useState(false)
  const [showAlwaysAllowed, setShowAlwaysAllowed] = useState(false)
  const [showEditedFiles, setShowEditedFiles] = useState(true)
  const [showCommitModal, setShowCommitModal] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const activeTabIdRef = useRef<string | null>(null)

  // Keep ref in sync with state
  useEffect(() => {
    activeTabIdRef.current = activeTabId
  }, [activeTabId])

  // Focus input when active tab changes
  useEffect(() => {
    if (activeTabId) {
      inputRef.current?.focus()
    }
  }, [activeTabId])

  // Save open sessions with models and cwd whenever tabs change
  useEffect(() => {
    if (tabs.length > 0) {
      const openSessions = tabs.map(t => ({ 
        sessionId: t.id, 
        model: t.model, 
        cwd: t.cwd,
        editedFiles: t.editedFiles,
        alwaysAllowed: t.alwaysAllowed
      }))
      window.electronAPI.copilot.saveOpenSessions(openSessions)
    }
  }, [tabs])

  // Get the active tab
  const activeTab = tabs.find(t => t.id === activeTabId)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [activeTab?.messages])

  // Reset textarea height when input is cleared
  useEffect(() => {
    if (!inputValue && inputRef.current) {
      inputRef.current.style.height = 'auto'
    }
  }, [inputValue])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setShowModelDropdown(false)
    if (showModelDropdown) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [showModelDropdown])

  // Helper to update a specific tab
  const updateTab = useCallback((tabId: string, updates: Partial<TabState>) => {
    setTabs(prev => prev.map(tab => 
      tab.id === tabId ? { ...tab, ...updates } : tab
    ))
  }, [])

  // Set up IPC listeners
  useEffect(() => {
    const unsubscribeReady = window.electronAPI.copilot.onReady(async (data) => {
      console.log('Copilot ready with sessions:', data.sessions.length, 'previous:', data.previousSessions.length)
      setStatus('connected')
      setAvailableModels(data.models)
      setPreviousSessions(data.previousSessions)
      
      // If no sessions exist, we need to create one (with trust check)
      if (data.sessions.length === 0) {
        // Check trust for current directory
        const cwd = await window.electronAPI.copilot.getCwd()
        const trustResult = await window.electronAPI.copilot.checkDirectoryTrust(cwd)
        if (!trustResult.trusted) {
          // User declined trust and no sessions to show - quit the app
          window.electronAPI.window.quit()
          return
        }
        
        // Create initial session
        try {
          const result = await window.electronAPI.copilot.createSession()
          const newTab: TabState = {
            id: result.sessionId,
            name: generateTabName(),
            messages: [],
            model: result.model,
            cwd: result.cwd,
            isProcessing: false,
            activeTools: [],
            hasUnreadCompletion: false,
            pendingConfirmation: null,
            needsTitle: true,
            alwaysAllowed: [],
            editedFiles: [],
            currentIntent: null
          }
          setTabs([newTab])
          setActiveTabId(result.sessionId)
        } catch (error) {
          console.error('Failed to create initial session:', error)
          setStatus('error')
        }
        return
      }
      
      // Create tabs for all resumed/created sessions
      const initialTabs: TabState[] = data.sessions.map((s, idx) => ({
        id: s.sessionId,
        name: s.name || `Session ${idx + 1}`,
        messages: [],  // Will be loaded below
        model: s.model,
        cwd: s.cwd,
        isProcessing: false,
        activeTools: [],
        hasUnreadCompletion: false,
        pendingConfirmation: null,
        needsTitle: !s.name,  // Only need title if no name provided
        alwaysAllowed: s.alwaysAllowed || [],
        editedFiles: s.editedFiles || [],
        currentIntent: null
      }))
      
      // Update tab counter to avoid duplicate names
      tabCounter = data.sessions.length
      
      setTabs(initialTabs)
      setActiveTabId(data.sessions[0]?.sessionId || null)
      
      // Load message history for each session
      for (const s of data.sessions) {
        window.electronAPI.copilot.getMessages(s.sessionId)
          .then(messages => {
            if (messages.length > 0) {
              setTabs(prev => prev.map(tab => 
                tab.id === s.sessionId 
                  ? { ...tab, messages: messages.map((m, i) => ({ id: `hist-${i}`, ...m, isStreaming: false })), needsTitle: false }
                  : tab
              ))
            }
          })
          .catch(err => console.error(`Failed to load history for ${s.sessionId}:`, err))
      }
    })
    
    // Also fetch models in case ready event was missed
    window.electronAPI.copilot.getModels().then((data) => {
      console.log('Fetched models:', data)
      if (data.models && data.models.length > 0) {
        setAvailableModels(data.models)
        setStatus('connected')
      }
    }).catch(err => console.log('getModels failed (SDK may still be initializing):', err))

    const unsubscribeDelta = window.electronAPI.copilot.onDelta((data) => {
      const { sessionId, content } = data
      setTabs(prev => prev.map(tab => {
        if (tab.id !== sessionId) return tab
        const last = tab.messages[tab.messages.length - 1]
        if (last && last.role === 'assistant' && last.isStreaming) {
          return {
            ...tab,
            messages: [...tab.messages.slice(0, -1), { ...last, content: last.content + content }]
          }
        }
        return tab
      }))
    })

    const unsubscribeMessage = window.electronAPI.copilot.onMessage((data) => {
      const { sessionId, content } = data
      setTabs(prev => prev.map(tab => {
        if (tab.id !== sessionId) return tab
        const last = tab.messages[tab.messages.length - 1]
        if (last && last.role === 'assistant' && last.isStreaming) {
          return {
            ...tab,
            messages: [...tab.messages.slice(0, -1), { ...last, content, isStreaming: false }]
          }
        }
        return {
          ...tab,
          messages: [...tab.messages, { id: generateId(), role: 'assistant', content, isStreaming: false }]
        }
      }))
    })

    const unsubscribeIdle = window.electronAPI.copilot.onIdle((data) => {
      const { sessionId } = data
      
      // First update tab state
      setTabs(prev => {
        const tab = prev.find(t => t.id === sessionId)
        
        // If tab needs a title and has messages, trigger title generation
        if (tab?.needsTitle && tab.messages.length > 0) {
          // Build conversation summary for title generation
          const conversation = tab.messages
            .filter(m => m.content.trim())
            .slice(0, 4) // First few messages only
            .map(m => `${m.role}: ${m.content.slice(0, 200)}`)
            .join('\n')
          
          // Generate title async (don't await here)
          window.electronAPI.copilot.generateTitle(conversation)
            .then(title => {
              setTabs(p => p.map(t => t.id === sessionId ? { ...t, name: title, needsTitle: false } : t))
            })
            .catch(err => {
              console.error('Failed to generate title:', err)
              // Fall back to truncated first message
              const firstUserMsg = tab.messages.find(m => m.role === 'user')?.content
              if (firstUserMsg) {
                const fallback = firstUserMsg.slice(0, 30) + (firstUserMsg.length > 30 ? '...' : '')
                setTabs(p => p.map(t => t.id === sessionId ? { ...t, name: fallback, needsTitle: false } : t))
              }
            })
        }
        
        return prev.map(tab => {
          if (tab.id !== sessionId) return tab
          return {
            ...tab,
            isProcessing: false,
            activeTools: [],
            currentIntent: null,
            // Mark as unread if this tab is not currently active
            hasUnreadCompletion: tab.id !== activeTabIdRef.current,
            messages: tab.messages
              .filter(msg => msg.content.trim() || msg.role === 'user')
              .map(msg => msg.isStreaming ? { ...msg, isStreaming: false } : msg)
          }
        })
      })
    })

    const unsubscribeToolStart = window.electronAPI.copilot.onToolStart((data) => {
      const { sessionId, toolCallId, toolName, input } = data
      const name = toolName || 'unknown'
      const id = toolCallId || generateId()
      
      console.log(`[Tool Start] ${name}: toolCallId=${toolCallId}, id=${id}, input=`, input)
      
      // Capture intent from report_intent tool
      if (name === 'report_intent') {
        const intent = input?.intent as string | undefined
        if (intent) {
          setTabs(prev => prev.map(tab => 
            tab.id === sessionId ? { ...tab, currentIntent: intent } : tab
          ))
        }
        return
      }
      
      // Skip other internal tools
      if (name === 'update_todo') return
      
      setTabs(prev => prev.map(tab => {
        if (tab.id !== sessionId) return tab
        
        // Track edited/created files at start time (we have reliable input here)
        const isFileOperation = name === 'edit' || name === 'create'
        let newEditedFiles = tab.editedFiles
        if (isFileOperation && input) {
          const path = input.path as string | undefined
          if (path && !tab.editedFiles.includes(path)) {
            newEditedFiles = [...tab.editedFiles, path]
            console.log(`[Tool Start] Added to editedFiles:`, newEditedFiles)
          }
        }
        
        return {
          ...tab,
          editedFiles: newEditedFiles,
          activeTools: [...tab.activeTools, { toolCallId: id, toolName: name, status: 'running', input }]
        }
      }))
    })

    const unsubscribeToolEnd = window.electronAPI.copilot.onToolEnd((data) => {
      const { sessionId, toolCallId, toolName, input, output } = data
      const name = toolName || 'unknown'
      
      console.log(`[Tool End] ${name}:`, { toolCallId, input, hasInput: !!input })
      
      // Skip internal tools
      if (name === 'report_intent' || name === 'update_todo') return
      
      setTabs(prev => prev.map(tab => {
        if (tab.id !== sessionId) return tab
        
        // Get the tool's input from activeTools (more reliable than event data)
        const activeTool = tab.activeTools.find(t => t.toolCallId === toolCallId)
        const toolInput = input || activeTool?.input
        
        return {
          ...tab,
          activeTools: tab.activeTools.map(t => 
            t.toolCallId === toolCallId 
              ? { ...t, status: 'done' as const, input: toolInput || t.input, output } 
              : t
          )
        }
      }))
    })

    // Listen for permission requests
    const unsubscribePermission = window.electronAPI.copilot.onPermission((data) => {
      console.log('Permission requested (full data):', JSON.stringify(data, null, 2))
      const sessionId = data.sessionId as string
      // Spread all data to preserve any extra fields from SDK
      const confirmation: PendingConfirmation = {
        ...data,
        requestId: data.requestId,
        sessionId,
        kind: data.kind,
        executable: data.executable,
        toolCallId: data.toolCallId as string | undefined,
        fullCommandText: data.fullCommandText,
        intention: data.intention as string | undefined,
        path: data.path as string | undefined,
        isOutOfScope: data.isOutOfScope as boolean | undefined,
        content: data.content as string | undefined,
      }
      setTabs(prev => prev.map(tab => 
        tab.id === sessionId ? { ...tab, pendingConfirmation: confirmation } : tab
      ))
    })

    const unsubscribeError = window.electronAPI.copilot.onError((data) => {
      const { sessionId, message } = data
      console.error('Copilot error:', message)
      
      setTabs(prev => prev.map(tab => {
        if (tab.id !== sessionId) return tab
        const newMessages = !message.includes('invalid_request_body')
          ? [...tab.messages, { id: generateId(), role: 'assistant' as const, content: `⚠️ ${message}` }]
          : tab.messages
        return { ...tab, isProcessing: false, messages: newMessages }
      }))
    })

    return () => {
      unsubscribeReady()
      unsubscribeDelta()
      unsubscribeMessage()
      unsubscribeIdle()
      unsubscribeToolStart()
      unsubscribeToolEnd()
      unsubscribePermission()
      unsubscribeError()
    }
  }, [])

  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() || !activeTab || activeTab.isProcessing) return
    
    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: inputValue.trim()
    }
    
    const tabId = activeTab.id
    
    updateTab(tabId, {
      messages: [...activeTab.messages, userMessage, {
        id: generateId(),
        role: 'assistant',
        content: '',
        isStreaming: true
      }],
      isProcessing: true,
      activeTools: []
    })
    setInputValue('')
    
    try {
      await window.electronAPI.copilot.send(tabId, userMessage.content)
    } catch (error) {
      console.error('Send error:', error)
      updateTab(tabId, { isProcessing: false })
    }
  }, [inputValue, activeTab, updateTab])

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }, [handleSendMessage])

  const handleStop = () => {
    if (!activeTab) return
    window.electronAPI.copilot.abort(activeTab.id)
    updateTab(activeTab.id, { isProcessing: false })
  }

  const handleConfirmation = async (decision: 'approved' | 'always' | 'denied') => {
    const pendingConfirmation = activeTab?.pendingConfirmation
    if (!pendingConfirmation || !activeTab) return
    
    try {
      await window.electronAPI.copilot.respondPermission({
        requestId: pendingConfirmation.requestId,
        decision
      })
      
      // If "always" was selected, update the local alwaysAllowed list
      if (decision === 'always' && pendingConfirmation.executable) {
        // Split comma-separated executables into individual entries
        const newExecutables = pendingConfirmation.executable.split(', ').filter(e => e.trim())
        updateTab(activeTab.id, { 
          pendingConfirmation: null,
          alwaysAllowed: [...activeTab.alwaysAllowed, ...newExecutables]
        })
        return
      }
    } catch (error) {
      console.error('Permission response failed:', error)
    }
    updateTab(activeTab.id, { pendingConfirmation: null })
  }

  const handleRemoveAlwaysAllowed = async (executable: string) => {
    if (!activeTab) return
    try {
      await window.electronAPI.copilot.removeAlwaysAllowed(activeTab.id, executable)
      updateTab(activeTab.id, {
        alwaysAllowed: activeTab.alwaysAllowed.filter(e => e !== executable)
      })
    } catch (error) {
      console.error('Failed to remove always-allowed:', error)
    }
  }

  const refreshAlwaysAllowed = async () => {
    if (!activeTab) return
    try {
      const list = await window.electronAPI.copilot.getAlwaysAllowed(activeTab.id)
      updateTab(activeTab.id, { alwaysAllowed: list })
    } catch (error) {
      console.error('Failed to fetch always-allowed:', error)
    }
  }

  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false)
  
  const handleOpenCommitModal = async () => {
    if (!activeTab || activeTab.editedFiles.length === 0) return
    
    setCommitError(null)
    setIsCommitting(false)
    setShowCommitModal(true)
    
    // Start with placeholder while generating
    setCommitMessage('Generating commit message...')
    setIsGeneratingMessage(true)
    
    try {
      // Get diff for edited files
      const diffResult = await window.electronAPI.git.getDiff(activeTab.cwd, activeTab.editedFiles)
      if (diffResult.success && diffResult.diff) {
        // Generate AI commit message from diff
        const message = await window.electronAPI.git.generateCommitMessage(diffResult.diff)
        setCommitMessage(message)
      } else {
        // Fallback to simple message
        const fileNames = activeTab.editedFiles.map(f => f.split('/').pop()).join(', ')
        setCommitMessage(`Update ${fileNames}`)
      }
    } catch (error) {
      console.error('Failed to generate commit message:', error)
      const fileNames = activeTab.editedFiles.map(f => f.split('/').pop()).join(', ')
      setCommitMessage(`Update ${fileNames}`)
    } finally {
      setIsGeneratingMessage(false)
    }
  }

  const handleCommitAndPush = async () => {
    if (!activeTab || !commitMessage.trim()) return
    
    setIsCommitting(true)
    setCommitError(null)
    
    try {
      const result = await window.electronAPI.git.commitAndPush(
        activeTab.cwd,
        activeTab.editedFiles,
        commitMessage.trim()
      )
      
      if (result.success) {
        // Clear the edited files list
        updateTab(activeTab.id, { editedFiles: [] })
        setShowCommitModal(false)
        setCommitMessage('')
      } else {
        setCommitError(result.error || 'Commit failed')
      }
    } catch (error) {
      setCommitError(String(error))
    } finally {
      setIsCommitting(false)
    }
  }

  const handleNewTab = async () => {
    // Always show folder picker when creating a new session
    try {
      const folderResult = await window.electronAPI.copilot.pickFolder()
      if (folderResult.canceled || !folderResult.path) {
        return // User cancelled folder selection
      }
      
      // Check trust for the selected directory
      const trustResult = await window.electronAPI.copilot.checkDirectoryTrust(folderResult.path)
      if (!trustResult.trusted) {
        return // User declined to trust, don't create session
      }
      
      setStatus('connecting')
      const result = await window.electronAPI.copilot.createSession({ cwd: folderResult.path })
      const newTab: TabState = {
        id: result.sessionId,
        name: generateTabName(),
        messages: [],
        model: result.model,
        cwd: result.cwd,
        isProcessing: false,
        activeTools: [],
        hasUnreadCompletion: false,
        pendingConfirmation: null,
        needsTitle: true,
        alwaysAllowed: [],
        editedFiles: [],
        currentIntent: null
      }
      setTabs(prev => [...prev, newTab])
      setActiveTabId(result.sessionId)
      setStatus('connected')
    } catch (error) {
      console.error('Failed to create new tab:', error)
      setStatus('connected')
    }
  }

  const handleCloseTab = async (tabId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    
    // If closing the last tab, delete it and create a new one
    if (tabs.length === 1) {
      try {
        setStatus('connecting')
        await window.electronAPI.copilot.closeSession(tabId)
        const result = await window.electronAPI.copilot.createSession()
        const newTab: TabState = {
          id: result.sessionId,
          name: generateTabName(),
          messages: [],
          model: result.model,
          cwd: result.cwd,
          isProcessing: false,
          activeTools: [],
          hasUnreadCompletion: false,
          pendingConfirmation: null,
          needsTitle: true,
          alwaysAllowed: [],
          editedFiles: [],
          currentIntent: null
        }
        setTabs([newTab])
        setActiveTabId(result.sessionId)
        setStatus('connected')
      } catch (error) {
        console.error('Failed to replace tab:', error)
        setStatus('connected')
      }
      return
    }
    
    try {
      await window.electronAPI.copilot.closeSession(tabId)
      
      // If closing the active tab, switch to another one
      if (activeTabId === tabId) {
        const currentIndex = tabs.findIndex(t => t.id === tabId)
        const newActiveTab = tabs[currentIndex - 1] || tabs[currentIndex + 1]
        setActiveTabId(newActiveTab?.id || null)
      }
      
      setTabs(prev => prev.filter(t => t.id !== tabId))
    } catch (error) {
      console.error('Failed to close tab:', error)
    }
  }

  const handleSwitchTab = async (tabId: string) => {
    if (tabId === activeTabId) return
    setActiveTabId(tabId)
    // Clear unread indicator when switching to this tab
    updateTab(tabId, { hasUnreadCompletion: false })
    try {
      await window.electronAPI.copilot.switchSession(tabId)
    } catch (error) {
      console.error('Failed to switch session:', error)
    }
  }

  const handleResumePreviousSession = async (prevSession: PreviousSession) => {
    try {
      setStatus('connecting')
      const result = await window.electronAPI.copilot.resumePreviousSession(prevSession.sessionId)
      
      // Create new tab for this session
      const newTab: TabState = {
        id: result.sessionId,
        name: prevSession.name || generateTabName(),
        messages: [],
        model: result.model,
        cwd: result.cwd,
        isProcessing: false,
        activeTools: [],
        hasUnreadCompletion: false,
        pendingConfirmation: null,
        needsTitle: !prevSession.name,
        alwaysAllowed: result.alwaysAllowed || [],
        editedFiles: result.editedFiles || [],
        currentIntent: null
      }
      
      setTabs(prev => [...prev, newTab])
      setActiveTabId(result.sessionId)
      
      // Remove from previous sessions list
      setPreviousSessions(prev => prev.filter(s => s.sessionId !== prevSession.sessionId))
      
      // Load message history
      window.electronAPI.copilot.getMessages(result.sessionId)
        .then(messages => {
          if (messages.length > 0) {
            setTabs(prev => prev.map(tab => 
              tab.id === result.sessionId 
                ? { ...tab, messages: messages.map((m, i) => ({ id: `hist-${i}`, ...m, isStreaming: false })), needsTitle: false }
                : tab
            ))
          }
        })
        .catch(err => console.error(`Failed to load history for ${result.sessionId}:`, err))
      
      setStatus('connected')
    } catch (error) {
      console.error('Failed to resume previous session:', error)
      setStatus('connected')
    }
  }

  const handleModelChange = async (model: string) => {
    if (!activeTab || model === activeTab.model) {
      setShowModelDropdown(false)
      return
    }
    
    setShowModelDropdown(false)
    setStatus('connecting')
    
    try {
      // If current tab has messages, create a new tab with the new model instead of replacing
      if (activeTab.messages.length > 0) {
        const result = await window.electronAPI.copilot.createSession()
        // Now change the model on the new session
        const modelResult = await window.electronAPI.copilot.setModel(result.sessionId, model)
        
        const newTab: TabState = {
          id: modelResult.sessionId,
          name: generateTabName(),
          messages: [],
          model: modelResult.model,
          cwd: modelResult.cwd || result.cwd,
          isProcessing: false,
          activeTools: [],
          hasUnreadCompletion: false,
          pendingConfirmation: null,
          needsTitle: true,
          alwaysAllowed: [],
          editedFiles: [],
          currentIntent: null
        }
        setTabs(prev => [...prev, newTab])
        setActiveTabId(modelResult.sessionId)
        setStatus('connected')
        return
      }
      
      // Empty tab - replace the session with the new model
      const result = await window.electronAPI.copilot.setModel(activeTab.id, model)
      // Update the tab with new session ID and model, clear messages
      setTabs(prev => {
        const updated = prev.filter(t => t.id !== activeTab.id)
        return [...updated, {
          id: result.sessionId,
          name: activeTab.name,
          messages: [],
          model: result.model,
          cwd: result.cwd || activeTab.cwd,
          isProcessing: false,
          activeTools: [],
          hasUnreadCompletion: false,
          pendingConfirmation: null,
          needsTitle: true,
          alwaysAllowed: [],
          editedFiles: [],
          currentIntent: null
        }]
      })
      setActiveTabId(result.sessionId)
      setStatus('connected')
    } catch (error) {
      console.error('Failed to change model:', error)
      setStatus('connected')
    }
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#0d1117] rounded-xl">
      {/* Title Bar */}
      <div className="drag-region flex items-center justify-between px-4 py-2.5 bg-[#161b22] border-b border-[#30363d] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 no-drag">
            <button 
              onClick={() => window.electronAPI.window.close()} 
              className="w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-90 active:brightness-75 transition-all"
            />
            <button 
              onClick={() => window.electronAPI.window.minimize()} 
              className="w-3 h-3 rounded-full bg-[#febc2e] hover:brightness-90 active:brightness-75 transition-all"
            />
            <button 
              onClick={() => window.electronAPI.window.maximize()} 
              className="w-3 h-3 rounded-full bg-[#28c840] hover:brightness-90 active:brightness-75 transition-all"
            />
          </div>
          
          <div className="flex items-center gap-2 ml-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[#58a6ff]">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2"/>
              <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2"/>
              <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2"/>
            </svg>
            <span className="text-[#e6edf3] text-sm font-medium">Copilot Skins</span>
            
            {/* Model Selector */}
            <div className="relative no-drag">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowModelDropdown(!showModelDropdown)
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#21262d] hover:bg-[#30363d] transition-colors text-xs text-[#8b949e] hover:text-[#e6edf3]"
              >
                <span>{availableModels.find(m => m.id === activeTab?.model)?.name || activeTab?.model || 'Loading...'}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>
              
              {showModelDropdown && availableModels.length > 0 && (
                <div 
                  className="absolute top-full left-0 mt-1 py-1 bg-[#21262d] border border-[#30363d] rounded-lg shadow-lg z-50 min-w-[240px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {availableModels.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => handleModelChange(model.id)}
                      className={`w-full px-3 py-1.5 text-left text-xs hover:bg-[#30363d] transition-colors flex justify-between items-center ${
                        model.id === activeTab?.model ? 'text-[#58a6ff]' : 'text-[#e6edf3]'
                      }`}
                    >
                      <span>{model.id === activeTab?.model && '✓ '}{model.name}</span>
                      <span className={`ml-2 ${
                        model.multiplier === 0 ? 'text-[#3fb950]' : 
                        model.multiplier < 1 ? 'text-[#3fb950]' :
                        model.multiplier > 1 ? 'text-[#d29922]' : 'text-[#8b949e]'
                      }`}>
                        {model.multiplier === 0 ? 'free' : `${model.multiplier}×`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 no-drag">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#21262d]">
            <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
              status === 'connected' ? 'bg-[#3fb950]' : 
              status === 'connecting' ? 'bg-[#d29922] animate-pulse' : 'bg-[#f85149]'
            }`}/>
            <span className="text-[10px] text-[#8b949e]">{status}</span>
          </div>
          
          {activeTab?.isProcessing && (
            <button 
              onClick={handleStop}
              className="p-1 rounded hover:bg-[#21262d] transition-colors"
              title="Stop"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#f85149">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Vertical Tabs */}
        <div className="w-48 bg-[#0d1117] border-r border-[#30363d] flex flex-col shrink-0">
          {/* New Tab Button */}
          <button
            onClick={() => handleNewTab()}
            className="flex items-center gap-2 px-3 py-2 text-xs text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors border-b border-[#30363d]"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            New Session
          </button>
          
          {/* Open Tabs */}
          <div className="flex-1 overflow-y-auto">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => handleSwitchTab(tab.id)}
                className={`group w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors text-left cursor-pointer ${
                  tab.id === activeTabId 
                    ? 'bg-[#161b22] text-[#e6edf3] border-l-2 border-l-[#58a6ff]' 
                    : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] border-l-2 border-l-transparent'
                }`}
              >
                {/* Status indicator */}
                {tab.pendingConfirmation ? (
                  <span className="shrink-0 w-2 h-2 rounded-full bg-[#58a6ff] animate-pulse" />
                ) : tab.isProcessing ? (
                  <span className="shrink-0 w-2 h-2 rounded-full bg-[#d29922] animate-pulse" />
                ) : tab.hasUnreadCompletion ? (
                  <span className="shrink-0 w-2 h-2 rounded-full bg-[#3fb950]" />
                ) : (
                  <span className="shrink-0 w-2 h-2 rounded-full bg-transparent" />
                )}
                <span className="flex-1 truncate">{tab.name}</span>
                <button
                  onClick={(e) => handleCloseTab(tab.id, e)}
                  className="shrink-0 p-0.5 rounded hover:bg-[#30363d] opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Close tab"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
          
          {/* Previous Sessions Expander */}
          {previousSessions.length > 0 && (
            <div className="border-t border-[#30363d]">
              <button
                onClick={() => setShowPreviousSessions(!showPreviousSessions)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors"
              >
                <svg 
                  width="10" height="10" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2"
                  className={`transition-transform ${showPreviousSessions ? 'rotate-90' : ''}`}
                >
                  <path d="M9 18l6-6-6-6"/>
                </svg>
                <span>Previous ({previousSessions.length})</span>
              </button>
              
              {showPreviousSessions && (
                <div className="max-h-48 overflow-y-auto">
                  {previousSessions.slice(0, 50).map((prevSession) => (
                    <button
                      key={prevSession.sessionId}
                      onClick={() => handleResumePreviousSession(prevSession)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors text-left border-l-2 border-l-transparent"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 opacity-50">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 6v6l4 2"/>
                      </svg>
                      <span className="flex-1 truncate">{prevSession.name || prevSession.sessionId.slice(0, 12) + '...'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {/* Messages Area - Conversation Only */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {activeTab?.messages.length === 0 && status === 'connected' && (
          <div className="flex flex-col items-center justify-center min-h-full text-center -m-4 p-4">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="text-[#30363d] mb-4">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            <h2 className="text-[#e6edf3] text-lg font-medium mb-1">How can I help you today?</h2>
            <p className="text-[#8b949e] text-sm">Ask me anything about your code or projects.</p>
          </div>
        )}
        
        {(activeTab?.messages || [])
          .filter(m => m.role !== 'system')
          .filter(m => m.role === 'user' || m.content.trim())
          .map((message) => (
          <div 
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div 
              className={`max-w-[85%] rounded-lg px-4 py-2.5 overflow-hidden ${
                message.role === 'user' 
                  ? 'bg-[#238636] text-white' 
                  : 'bg-[#21262d] text-[#e6edf3]'
              }`}
            >
              <div className="text-sm break-words overflow-hidden">
                {message.role === 'user' ? (
                  <span className="whitespace-pre-wrap break-words">{message.content}</span>
                ) : message.content ? (
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold text-[#e6edf3]">{children}</strong>,
                      em: ({ children }) => <em className="italic">{children}</em>,
                      ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                      li: ({ children }) => <li className="ml-2">{children}</li>,
                      code: ({ children, className }) => {
                        const isBlock = className?.includes('language-')
                        return isBlock ? (
                          <pre className="bg-[#161b22] rounded p-2 my-2 overflow-x-auto text-xs max-w-full">
                            <code className="text-[#e6edf3]">{children}</code>
                          </pre>
                        ) : (
                          <code className="bg-[#161b22] px-1 py-0.5 rounded text-[#f0883e] text-xs break-all">{children}</code>
                        )
                      },
                      pre: ({ children }) => <div className="overflow-x-auto max-w-full">{children}</div>,
                      a: ({ href, children }) => (
                        <a href={href} className="text-[#58a6ff] hover:underline" target="_blank" rel="noopener noreferrer">
                          {children}
                        </a>
                      ),
                      h1: ({ children }) => <h1 className="text-lg font-bold mb-2 text-[#e6edf3]">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-base font-bold mb-2 text-[#e6edf3]">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-sm font-bold mb-1 text-[#e6edf3]">{children}</h3>,
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-[#30363d] pl-3 my-2 text-[#8b949e] italic">
                          {children}
                        </blockquote>
                      ),
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                ) : null}
                {message.isStreaming && message.content && (
                  <span className="inline-block w-2 h-4 ml-1 bg-[#58a6ff] animate-pulse rounded-sm" />
                )}
              </div>
            </div>
          </div>
        ))}
        
        {/* Thinking indicator when processing but no streaming content yet */}
        {activeTab?.isProcessing && !activeTab?.messages.some(m => m.isStreaming && m.content) && (
          <div className="flex justify-start">
            <div className="bg-[#21262d] text-[#e6edf3] rounded-lg px-4 py-2.5">
              <div className="flex items-center gap-2 text-sm">
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-[#58a6ff] rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-1.5 h-1.5 bg-[#58a6ff] rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-1.5 h-1.5 bg-[#58a6ff] rounded-full animate-bounce"></span>
                </span>
                <span className="text-[#8b949e]">
                  {activeTab?.currentIntent || 'Thinking...'}
                </span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="shrink-0 p-3 bg-[#161b22] border-t border-[#30363d]">
        <div className="flex items-center bg-[#0d1117] rounded-lg border border-[#30363d] focus-within:border-[#58a6ff] transition-colors">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Ask Copilot... (Shift+Enter for new line)"
            className="flex-1 bg-transparent py-2.5 px-4 text-[#e6edf3] placeholder-[#484f58] outline-none text-sm resize-none min-h-[40px] max-h-[200px]"
            disabled={status !== 'connected' || activeTab?.isProcessing}
            autoFocus
            rows={1}
            style={{ height: 'auto' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement
              target.style.height = 'auto'
              target.style.height = Math.min(target.scrollHeight, 200) + 'px'
            }}
          />
          {activeTab?.isProcessing ? (
            <button
              onClick={handleStop}
              className="shrink-0 px-4 py-2.5 text-[#f85149] hover:text-[#ff7b72] text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
              Stop
            </button>
          ) : (
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || status !== 'connected'}
              className="shrink-0 px-4 py-2.5 text-[#58a6ff] hover:text-[#79c0ff] disabled:opacity-30 disabled:cursor-not-allowed text-xs font-medium transition-colors"
            >
              Send
            </button>
          )}
        </div>
      </div>
        </div>
        
        {/* Right Panel - Activity & Session Info */}
        <div className="w-72 border-l border-[#30363d] flex flex-col shrink-0 bg-[#0d1117]">
          {/* Activity Header with Intent */}
          <div className="px-3 py-2 border-b border-[#30363d] bg-[#161b22]">
            <div className="flex items-center gap-2">
              {activeTab?.isProcessing ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-[#d29922] animate-pulse" />
                  <span className="text-xs font-medium text-[#e6edf3] truncate">
                    {activeTab?.currentIntent || 'Working...'}
                  </span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-[#3fb950]" />
                  <span className="text-xs font-medium text-[#8b949e]">Ready</span>
                </>
              )}
            </div>
          </div>
          
          {/* Tool Activity Log */}
          <div className="flex-1 overflow-y-auto">
            {/* Permission Confirmation - Top Priority */}
            {activeTab?.pendingConfirmation && (
              <div className="p-3 bg-[#1c2128] border-b border-[#d29922]">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[#d29922]">⚠️</span>
                  <span className="text-[#e6edf3] text-xs font-medium">
                    {activeTab.pendingConfirmation.isOutOfScope ? (
                      <>Allow reading outside workspace?</>
                    ) : activeTab.pendingConfirmation.kind === 'write' ? (
                      <>Allow file changes?</>
                    ) : activeTab.pendingConfirmation.kind === 'shell' ? (
                      <>Allow <strong>{activeTab.pendingConfirmation.executable || 'command'}</strong>?</>
                    ) : (
                      <>Allow <strong>{activeTab.pendingConfirmation.kind}</strong>?</>
                    )}
                  </span>
                </div>
                {activeTab.pendingConfirmation.isOutOfScope && (
                  <div className="text-[10px] text-[#8b949e] mb-2">
                    Path is outside trusted workspace
                  </div>
                )}
                {activeTab.pendingConfirmation.path && (
                  <div className="text-[10px] text-[#58a6ff] mb-2 font-mono truncate" title={activeTab.pendingConfirmation.path}>
                    📄 {activeTab.pendingConfirmation.path}
                  </div>
                )}
                {activeTab.pendingConfirmation.fullCommandText && (
                  <pre className="bg-[#0d1117] rounded p-2 my-2 overflow-x-auto text-[10px] text-[#e6edf3] border border-[#30363d] max-h-24">
                    <code>{activeTab.pendingConfirmation.fullCommandText}</code>
                  </pre>
                )}
                <div className="flex gap-2 mt-2">
                  {activeTab.pendingConfirmation.isOutOfScope ? (
                    <>
                      <button
                        onClick={() => handleConfirmation('approved')}
                        className="flex-1 px-2 py-1 rounded bg-[#238636] hover:bg-[#2ea043] text-white text-[10px] font-medium transition-colors"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => handleConfirmation('denied')}
                        className="flex-1 px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] text-[#f85149] text-[10px] font-medium border border-[#30363d] transition-colors"
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleConfirmation('approved')}
                        className="px-2 py-1 rounded bg-[#238636] hover:bg-[#2ea043] text-white text-[10px] font-medium transition-colors"
                      >
                        Once
                      </button>
                      <button
                        onClick={() => handleConfirmation('always')}
                        className="px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] text-[#e6edf3] text-[10px] font-medium border border-[#30363d] transition-colors"
                      >
                        Always
                      </button>
                      <button
                        onClick={() => handleConfirmation('denied')}
                        className="px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] text-[#f85149] text-[10px] font-medium border border-[#30363d] transition-colors"
                      >
                        Deny
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
            
            {/* Tools List */}
            {(activeTab?.activeTools?.length || 0) > 0 && (
              <div className="border-b border-[#21262d]">
                {activeTab?.activeTools.map((tool) => {
                  const input = tool.input || {}
                  const path = input.path as string | undefined
                  const shortPath = path ? path.split('/').slice(-2).join('/') : ''
                  const isEdit = tool.toolName === 'edit'
                  const isGrep = tool.toolName === 'grep'
                  const isGlob = tool.toolName === 'glob'
                  const isView = tool.toolName === 'view'
                  const isBash = tool.toolName === 'bash'
                  const isReadBash = tool.toolName === 'read_bash'
                  const isWriteBash = tool.toolName === 'write_bash'
                  
                  let description = ''
                  if (isGrep) {
                    const pattern = input.pattern as string || ''
                    description = pattern ? `"${pattern}"` : ''
                  } else if (isGlob) {
                    description = (input.pattern as string) || ''
                  } else if (isView) {
                    description = shortPath || path || ''
                  } else if (isEdit || tool.toolName === 'create') {
                    description = shortPath || path || ''
                  } else if (isBash) {
                    const desc = input.description as string || ''
                    const cmd = (input.command as string || '').slice(0, 40)
                    description = desc || (cmd ? `$ ${cmd}...` : '')
                  } else if (isReadBash || isWriteBash) {
                    description = `session`
                  } else if (tool.toolName === 'web_fetch') {
                    description = (input.url as string || '').slice(0, 30)
                  }
                  
                  return (
                    <div key={tool.toolCallId} className="px-3 py-1.5 border-b border-[#161b22] last:border-b-0">
                      <div className="flex items-start gap-2 text-xs">
                        {tool.status === 'running' ? (
                          <span className="text-[#d29922] shrink-0 mt-0.5">○</span>
                        ) : (
                          <span className="text-[#3fb950] shrink-0">✓</span>
                        )}
                        <div className="flex-1 min-w-0">
                          <span className={`font-medium ${tool.status === 'done' ? 'text-[#e6edf3]' : 'text-[#8b949e]'}`}>
                            {tool.toolName.charAt(0).toUpperCase() + tool.toolName.slice(1)}
                          </span>
                          {description && (
                            <span className="text-[#6e7681] font-mono ml-1 text-[10px] truncate block">
                              {description}
                            </span>
                          )}
                          {tool.status === 'done' && (
                            <div className="text-[#6e7681] text-[10px] mt-0.5">
                              {formatToolOutput(tool.toolName, input, tool.output)}
                            </div>
                          )}
                          {isEdit && tool.status === 'done' && input.old_str && (
                            <div className="mt-1 text-[10px] font-mono pl-2 border-l border-[#30363d]">
                              <div className="text-[#f85149] truncate">− {(input.old_str as string).split('\n')[0].slice(0, 35)}</div>
                              {input.new_str !== undefined && (
                                <div className="text-[#3fb950] truncate">+ {(input.new_str as string).split('\n')[0].slice(0, 35)}</div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            
            {/* Processing indicator when no tools visible */}
            {activeTab?.isProcessing && (activeTab?.activeTools?.length || 0) === 0 && (
              <div className="px-3 py-3 flex items-center gap-2 border-b border-[#21262d]">
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-[#58a6ff] rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-1.5 h-1.5 bg-[#58a6ff] rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-1.5 h-1.5 bg-[#58a6ff] rounded-full animate-bounce"></span>
                </span>
                <span className="text-xs text-[#8b949e]">Thinking...</span>
              </div>
            )}
            
            {/* Session Info Section */}
            <div className="border-t border-[#30363d] mt-auto">
              {/* Working Directory */}
              <div className="px-3 py-2 border-b border-[#21262d]">
                <div className="text-[10px] text-[#6e7681] uppercase tracking-wide mb-1">Directory</div>
                <div className="text-xs text-[#8b949e] font-mono truncate" title={activeTab?.cwd}>{activeTab?.cwd || 'Unknown'}</div>
              </div>
              
              {/* Edited Files */}
              <div className="border-b border-[#21262d]">
                <div className="flex items-center">
                  <button
                    onClick={() => setShowEditedFiles(!showEditedFiles)}
                    className="flex-1 flex items-center gap-2 px-3 py-2 text-xs text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors"
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      className={`transition-transform ${showEditedFiles ? 'rotate-90' : ''}`}>
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                    <span>Edited Files</span>
                    {(activeTab?.editedFiles.length || 0) > 0 && (
                      <span className="text-[#3fb950]">({activeTab?.editedFiles.length})</span>
                    )}
                  </button>
                  {(activeTab?.editedFiles.length || 0) > 0 && (
                    <button
                      onClick={handleOpenCommitModal}
                      className="px-2 py-1 mr-1 text-[#58a6ff] hover:text-[#79c0ff] hover:bg-[#21262d] rounded transition-colors"
                      title="Commit and push"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="4"/>
                        <line x1="12" y1="2" x2="12" y2="8"/>
                        <line x1="12" y1="16" x2="12" y2="22"/>
                      </svg>
                    </button>
                  )}
                </div>
                {showEditedFiles && activeTab && (
                  <div className="max-h-32 overflow-y-auto">
                    {activeTab.editedFiles.length === 0 ? (
                      <div className="px-3 py-2 text-[10px] text-[#6e7681]">No files edited</div>
                    ) : (
                      activeTab.editedFiles.map((filePath) => (
                        <div key={filePath} className="flex items-center gap-2 px-3 py-1 text-[10px] text-[#8b949e] hover:bg-[#21262d]" title={filePath}>
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2" className="shrink-0">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          </svg>
                          <span className="truncate font-mono">{filePath.split('/').pop()}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              
              {/* Always Allowed */}
              <div>
                <button
                  onClick={() => { setShowAlwaysAllowed(!showAlwaysAllowed); if (!showAlwaysAllowed) refreshAlwaysAllowed() }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors"
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    className={`transition-transform ${showAlwaysAllowed ? 'rotate-90' : ''}`}>
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                  <span>Always Allowed</span>
                  {(activeTab?.alwaysAllowed.length || 0) > 0 && (
                    <span className="ml-auto text-[#58a6ff]">({activeTab?.alwaysAllowed.length})</span>
                  )}
                </button>
                {showAlwaysAllowed && activeTab && (
                  <div className="max-h-32 overflow-y-auto">
                    {activeTab.alwaysAllowed.length === 0 ? (
                      <div className="px-3 py-2 text-[10px] text-[#6e7681]">No always-allowed</div>
                    ) : (
                      activeTab.alwaysAllowed.map((exe) => (
                        <div key={exe} className="group flex items-center gap-2 px-3 py-1 text-[10px] text-[#8b949e] hover:bg-[#21262d]">
                          <span className="flex-1 truncate font-mono">{exe}</span>
                          <button
                            onClick={() => handleRemoveAlwaysAllowed(exe)}
                            className="shrink-0 opacity-0 group-hover:opacity-100 text-[#f85149] transition-opacity"
                          >
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Commit Modal */}
      {showCommitModal && activeTab && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl w-[500px] max-w-[90%]">
            <div className="px-4 py-3 border-b border-[#30363d] flex items-center justify-between">
              <h3 className="text-sm font-medium text-[#e6edf3]">Commit & Push Changes</h3>
              <button
                onClick={() => setShowCommitModal(false)}
                className="text-[#8b949e] hover:text-[#e6edf3] transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            
            <div className="p-4">
              {/* Files to commit */}
              <div className="mb-3">
                <div className="text-xs text-[#8b949e] mb-2">Files to commit ({activeTab.editedFiles.length}):</div>
                <div className="bg-[#0d1117] rounded border border-[#21262d] max-h-32 overflow-y-auto">
                  {activeTab.editedFiles.map((filePath) => (
                    <div key={filePath} className="px-3 py-1.5 text-xs text-[#3fb950] font-mono truncate" title={filePath}>
                      {filePath}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Commit message */}
              <div className="mb-3 relative">
                <label className="text-xs text-[#8b949e] mb-2 block">Commit message:</label>
                <textarea
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  className={`w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:border-[#58a6ff] outline-none resize-none ${isGeneratingMessage ? 'opacity-50' : ''}`}
                  rows={3}
                  placeholder="Enter commit message..."
                  autoFocus
                  disabled={isGeneratingMessage}
                />
                {isGeneratingMessage && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="w-4 h-4 border-2 border-[#58a6ff]/30 border-t-[#58a6ff] rounded-full animate-spin"></span>
                  </div>
                )}
              </div>
              
              {/* Error message */}
              {commitError && (
                <div className="mb-3 px-3 py-2 bg-[#f8514926] border border-[#f85149] rounded text-xs text-[#f85149]">
                  {commitError}
                </div>
              )}
              
              {/* Actions */}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowCommitModal(false)}
                  className="px-3 py-1.5 text-xs text-[#8b949e] hover:text-[#e6edf3] transition-colors"
                  disabled={isCommitting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCommitAndPush}
                  disabled={!commitMessage.trim() || isCommitting || isGeneratingMessage}
                  className="px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded transition-colors flex items-center gap-2"
                >
                  {isCommitting ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      Pushing...
                    </>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="4"/>
                        <line x1="12" y1="2" x2="12" y2="8"/>
                        <line x1="12" y1="16" x2="12" y2="22"/>
                      </svg>
                      Commit & Push
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
