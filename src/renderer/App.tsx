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
  [key: string]: unknown
}

// Tab/Session state
interface TabState {
  id: string
  name: string
  messages: Message[]
  model: string
  isProcessing: boolean
  activeTools: ActiveTool[]
  hasUnreadCompletion: boolean
  pendingConfirmation: PendingConfirmation | null
}

let messageIdCounter = 0
const generateId = () => `msg-${++messageIdCounter}-${Date.now()}`

let tabCounter = 0
const generateTabName = () => `Chat ${++tabCounter}`

const App: React.FC = () => {
  const [status, setStatus] = useState<Status>('connecting')
  const [inputValue, setInputValue] = useState('')
  const [tabs, setTabs] = useState<TabState[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([])
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeTabIdRef = useRef<string | null>(null)

  // Keep ref in sync with state
  useEffect(() => {
    activeTabIdRef.current = activeTabId
  }, [activeTabId])

  // Get the active tab
  const activeTab = tabs.find(t => t.id === activeTabId)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [activeTab?.messages])

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
    const unsubscribeReady = window.electronAPI.copilot.onReady((data) => {
      console.log('Copilot ready with sessionId:', data.sessionId, 'model:', data.model)
      setStatus('connected')
      setAvailableModels(data.models)
      
      // Create initial tab with this session
      const initialTab: TabState = {
        id: data.sessionId,
        name: generateTabName(),
        messages: [],
        model: data.model,
        isProcessing: false,
        activeTools: [],
        hasUnreadCompletion: false,
        pendingConfirmation: null
      }
      setTabs([initialTab])
      setActiveTabId(data.sessionId)
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
      setTabs(prev => prev.map(tab => {
        if (tab.id !== sessionId) return tab
        return {
          ...tab,
          isProcessing: false,
          activeTools: [],
          // Mark as unread if this tab is not currently active
          hasUnreadCompletion: tab.id !== activeTabIdRef.current,
          messages: tab.messages
            .filter(msg => msg.content.trim() || msg.role === 'user')
            .map(msg => msg.isStreaming ? { ...msg, isStreaming: false } : msg)
        }
      }))
    })

    const unsubscribeToolStart = window.electronAPI.copilot.onToolStart((data) => {
      const { sessionId, toolCallId, toolName } = data
      const name = toolName || 'unknown'
      const id = toolCallId || generateId()
      
      // Skip internal tools
      if (name === 'report_intent' || name === 'update_todo') return
      
      setTabs(prev => prev.map(tab => {
        if (tab.id !== sessionId) return tab
        return {
          ...tab,
          activeTools: [...tab.activeTools, { toolCallId: id, toolName: name, status: 'running' }]
        }
      }))
    })

    const unsubscribeToolEnd = window.electronAPI.copilot.onToolEnd((data) => {
      const { sessionId, toolCallId, toolName } = data
      const name = toolName || 'unknown'
      
      // Skip internal tools
      if (name === 'report_intent' || name === 'update_todo') return
      
      setTabs(prev => prev.map(tab => {
        if (tab.id !== sessionId) return tab
        return {
          ...tab,
          activeTools: tab.activeTools.map(t => 
            t.toolCallId === toolCallId ? { ...t, status: 'done' as const } : t
          )
        }
      }))
      
      // Remove completed tools after a short delay
      setTimeout(() => {
        setTabs(prev => prev.map(tab => {
          if (tab.id !== sessionId) return tab
          return {
            ...tab,
            activeTools: tab.activeTools.filter(t => t.toolCallId !== toolCallId)
          }
        }))
      }, 2000)
    })

    // Listen for permission requests
    const unsubscribePermission = window.electronAPI.copilot.onPermission((data) => {
      console.log('Permission requested:', data)
      const sessionId = data.sessionId as string
      const confirmation: PendingConfirmation = {
        requestId: data.requestId,
        sessionId,
        kind: data.kind,
        executable: data.executable,
        toolCallId: data.toolCallId as string | undefined,
        fullCommandText: data.fullCommandText,
        intention: data.intention as string | undefined,
        path: data.path as string | undefined,
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
    } catch (error) {
      console.error('Permission response failed:', error)
    }
    updateTab(activeTab.id, { pendingConfirmation: null })
  }

  const handleNewTab = async () => {
    setStatus('connecting')
    try {
      const result = await window.electronAPI.copilot.createSession()
      const newTab: TabState = {
        id: result.sessionId,
        name: generateTabName(),
        messages: [],
        model: result.model,
        isProcessing: false,
        activeTools: [],
        hasUnreadCompletion: false,
        pendingConfirmation: null
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
    
    // Don't close the last tab - just clear it
    if (tabs.length === 1) {
      updateTab(tabId, { messages: [], activeTools: [], hasUnreadCompletion: false, pendingConfirmation: null })
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

  const handleModelChange = async (model: string) => {
    if (!activeTab || model === activeTab.model) {
      setShowModelDropdown(false)
      return
    }
    
    setShowModelDropdown(false)
    setStatus('connecting')
    
    try {
      const result = await window.electronAPI.copilot.setModel(activeTab.id, model)
      // Update the tab with new session ID and model, clear messages
      setTabs(prev => {
        const updated = prev.filter(t => t.id !== activeTab.id)
        return [...updated, {
          id: result.sessionId,
          name: activeTab.name,
          messages: [],
          model: result.model,
          isProcessing: false,
          activeTools: [],
          hasUnreadCompletion: false,
          pendingConfirmation: null
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
            <span className="text-[#e6edf3] text-sm font-medium">GitHub Copilot</span>
            
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
      <div className="flex items-center gap-1 px-2 py-1 bg-[#0d1117] border-b border-[#30363d] shrink-0 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleSwitchTab(tab.id)}
            className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-t text-xs transition-colors ${
              tab.id === activeTabId 
                ? 'bg-[#161b22] text-[#e6edf3] border-t border-x border-[#30363d]' 
                : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d]'
            }`}
          >
            <span className="max-w-[120px] truncate">{tab.name}</span>
            {tab.pendingConfirmation ? (
              <span className="inline-block w-2 h-2 rounded-full bg-[#58a6ff] animate-pulse" />
            ) : tab.isProcessing ? (
              <span className="inline-block w-2 h-2 rounded-full bg-[#d29922] animate-pulse" />
            ) : tab.hasUnreadCompletion ? (
              <span className="inline-block w-2 h-2 rounded-full bg-[#3fb950]" />
            ) : null}
            <button
              onClick={(e) => handleCloseTab(tab.id, e)}
              className="ml-1 p-0.5 rounded hover:bg-[#30363d] opacity-0 group-hover:opacity-100 transition-opacity"
              title="Close tab"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </button>
        ))}
        <button
          onClick={handleNewTab}
          className="p-1.5 rounded hover:bg-[#21262d] text-[#8b949e] hover:text-[#e6edf3] transition-colors"
          title="New Tab"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab?.messages.length === 0 && status === 'connected' && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="text-[#30363d] mb-4">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            <h2 className="text-[#e6edf3] text-lg font-medium mb-1">How can I help you today?</h2>
            <p className="text-[#8b949e] text-sm">Ask me anything about your code or projects.</p>
          </div>
        )}
        
        {(activeTab?.messages || []).filter(m => m.role !== 'system').map((message) => (
          <div 
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div 
              className={`max-w-[80%] rounded-lg px-4 py-2.5 ${
                message.role === 'user' 
                  ? 'bg-[#238636] text-white' 
                  : 'bg-[#21262d] text-[#e6edf3]'
              }`}
            >
              <div className="text-sm break-words">
                {message.role === 'user' ? (
                  <span className="whitespace-pre-wrap">{message.content}</span>
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
                          <pre className="bg-[#161b22] rounded p-2 my-2 overflow-x-auto text-xs">
                            <code className="text-[#e6edf3]">{children}</code>
                          </pre>
                        ) : (
                          <code className="bg-[#161b22] px-1 py-0.5 rounded text-[#f0883e] text-xs">{children}</code>
                        )
                      },
                      pre: ({ children }) => <>{children}</>,
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
                {message.isStreaming && !message.content && (
                  <span className="text-[#8b949e] italic flex items-center gap-2">
                    <span className="flex gap-1">
                      <span className="w-2 h-2 bg-[#58a6ff] rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="w-2 h-2 bg-[#58a6ff] rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="w-2 h-2 bg-[#58a6ff] rounded-full animate-bounce"></span>
                    </span>
                    Thinking...
                  </span>
                )}
                {message.isStreaming && message.content && (
                  <span className="inline-block w-2 h-4 ml-1 bg-[#58a6ff] animate-pulse rounded-sm" />
                )}
              </div>
            </div>
          </div>
        ))}
        
        {/* Active Tools Indicator */}
        {(activeTab?.activeTools?.length || 0) > 0 && (
          <div className="flex justify-start">
            <div className="flex flex-wrap gap-2 px-3 py-2 bg-[#1c2128] rounded-lg border border-[#30363d]">
              {activeTab?.activeTools.map((tool) => (
                <span 
                  key={tool.toolCallId}
                  className={`text-xs flex items-center gap-1.5 ${
                    tool.status === 'done' ? 'text-[#3fb950]' : 'text-[#8b949e]'
                  }`}
                >
                  {tool.status === 'running' ? (
                    <span className="inline-block w-2 h-2 rounded-full bg-[#d29922] animate-pulse" />
                  ) : (
                    <span className="text-[#3fb950]">✓</span>
                  )}
                  {tool.toolName}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {/* Permission Confirmation Dialog */}
        {activeTab?.pendingConfirmation && (
          <div className="flex justify-start">
            <div className="max-w-[90%] bg-[#1c2128] rounded-lg border border-[#d29922] p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[#d29922]">⚠️</span>
                <span className="text-[#e6edf3] text-sm">
                  Allow <strong className="font-bold">{activeTab.pendingConfirmation.executable || activeTab.pendingConfirmation.kind}</strong>?
                </span>
              </div>
              {activeTab.pendingConfirmation.intention && (
                <div className="text-sm text-[#e6edf3] mb-2">{activeTab.pendingConfirmation.intention}</div>
              )}
              {activeTab.pendingConfirmation.fullCommandText && (
                <pre className="bg-[#0d1117] rounded p-2 my-2 overflow-x-auto text-xs text-[#e6edf3] border border-[#30363d]">
                  <code>{activeTab.pendingConfirmation.fullCommandText}</code>
                </pre>
              )}
              {activeTab.pendingConfirmation.path && !activeTab.pendingConfirmation.intention && (
                <div className="text-xs text-[#8b949e] mb-2">Path: {activeTab.pendingConfirmation.path}</div>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => handleConfirmation('approved')}
                  className="px-3 py-1.5 rounded bg-[#238636] hover:bg-[#2ea043] text-white text-xs font-medium transition-colors"
                >
                  Allow Once
                </button>
                <button
                  onClick={() => handleConfirmation('always')}
                  className="px-3 py-1.5 rounded bg-[#21262d] hover:bg-[#30363d] text-[#e6edf3] text-xs font-medium border border-[#30363d] transition-colors"
                  title={`Always allow ${activeTab.pendingConfirmation.executable || activeTab.pendingConfirmation.kind} for this session`}
                >
                  Always Allow
                </button>
                <button
                  onClick={() => handleConfirmation('denied')}
                  className="px-3 py-1.5 rounded bg-[#21262d] hover:bg-[#30363d] text-[#f85149] text-xs font-medium border border-[#30363d] transition-colors"
                >
                  Deny
                </button>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="shrink-0 p-3 bg-[#161b22] border-t border-[#30363d]">
        <div className="flex items-center gap-2 bg-[#0d1117] rounded-lg border border-[#30363d] focus-within:border-[#58a6ff] transition-colors">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Ask Copilot..."
            className="flex-1 bg-transparent py-2.5 px-4 text-[#e6edf3] placeholder-[#484f58] outline-none text-sm"
            disabled={status !== 'connected' || activeTab?.isProcessing}
            autoFocus
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || status !== 'connected' || activeTab?.isProcessing}
            className="mr-2 px-3 py-1.5 rounded bg-[#238636] hover:bg-[#2ea043] disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
          >
            {activeTab?.isProcessing ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
