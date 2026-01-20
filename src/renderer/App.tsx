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

interface PendingConfirmation {
  requestId: string
  kind: string
  executable?: string
  toolCallId?: string
  fullCommandText?: string
  intention?: string
  path?: string
  [key: string]: unknown
}

let messageIdCounter = 0
const generateId = () => `msg-${++messageIdCounter}-${Date.now()}`

const App: React.FC = () => {
  const [status, setStatus] = useState<Status>('connecting')
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentModel, setCurrentModel] = useState('gpt-5')
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [activeTools, setActiveTools] = useState<ActiveTool[]>([])
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setShowModelDropdown(false)
    if (showModelDropdown) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [showModelDropdown])

  // Test mode: auto-send message from URL param ?test=message
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const testMessage = params.get('test')
    if (testMessage && status === 'connected' && messages.length === 0) {
      console.log('Test mode: sending message:', testMessage)
      setInputValue(testMessage)
      // Delay to ensure state is ready
      setTimeout(() => {
        setMessages([{ id: generateId(), role: 'user', content: testMessage }])
        setIsProcessing(true)
        setMessages(prev => [...prev, { id: generateId(), role: 'assistant', content: '', isStreaming: true }])
        window.electronAPI.copilot.send(testMessage)
      }, 500)
    }
  }, [status])

  // Set up IPC listeners
  useEffect(() => {
    const unsubscribeReady = window.electronAPI.copilot.onReady((data) => {
      console.log('Copilot ready with model:', data.model, 'models:', data.models)
      setStatus('connected')
      setCurrentModel(data.model)
      setAvailableModels(data.models)
    })
    
    // Also fetch models in case ready event was missed
    window.electronAPI.copilot.getModels().then((data) => {
      console.log('Fetched models:', data)
      if (data.models && data.models.length > 0) {
        setAvailableModels(data.models)
        setCurrentModel(data.current)
        setStatus('connected')
      }
    }).catch(err => console.log('getModels failed (SDK may still be initializing):', err))

    const unsubscribeDelta = window.electronAPI.copilot.onDelta((delta: string) => {
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last && last.role === 'assistant' && last.isStreaming) {
          return [...prev.slice(0, -1), { ...last, content: last.content + delta }]
        }
        return prev
      })
    })

    const unsubscribeMessage = window.electronAPI.copilot.onMessage((content: string) => {
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last && last.role === 'assistant' && last.isStreaming) {
          return [...prev.slice(0, -1), { ...last, content, isStreaming: false }]
        }
        return [...prev, { id: generateId(), role: 'assistant', content, isStreaming: false }]
      })
    })

    const unsubscribeIdle = window.electronAPI.copilot.onIdle(() => {
      setIsProcessing(false)
      setActiveTools([]) // Clear tools when done
      setMessages(prev => {
        // Remove empty streaming messages and finalize
        return prev.filter(msg => msg.content.trim() || msg.role === 'user').map(msg => 
          msg.isStreaming ? { ...msg, isStreaming: false } : msg
        )
      })
    })

    const unsubscribeToolStart = window.electronAPI.copilot.onToolStart((data: unknown) => {
      const toolData = data as { toolCallId?: string; toolName?: string; name?: string }
      const toolName = toolData.toolName || toolData.name || 'unknown'
      const toolCallId = toolData.toolCallId || generateId()
      
      // Skip internal tools like report_intent
      if (toolName === 'report_intent' || toolName === 'update_todo') return
      
      setActiveTools(prev => [...prev, { toolCallId, toolName, status: 'running' }])
    })

    const unsubscribeToolEnd = window.electronAPI.copilot.onToolEnd((data: unknown) => {
      const toolData = data as { toolCallId?: string; toolName?: string; name?: string }
      const toolCallId = toolData.toolCallId
      const toolName = toolData.toolName || toolData.name || 'unknown'
      
      // Skip internal tools
      if (toolName === 'report_intent' || toolName === 'update_todo') return
      
      setActiveTools(prev => 
        prev.map(t => t.toolCallId === toolCallId ? { ...t, status: 'done' as const } : t)
      )
      
      // Remove completed tools after a short delay
      setTimeout(() => {
        setActiveTools(prev => prev.filter(t => t.toolCallId !== toolCallId))
      }, 2000)
    })

    // Listen for permission requests (shell, write, read, etc.)
    const unsubscribePermission = window.electronAPI.copilot.onPermission((data) => {
      console.log('Permission requested:', data)
      setPendingConfirmation({
        requestId: data.requestId,
        kind: data.kind,
        executable: data.executable as string | undefined,
        toolCallId: data.toolCallId as string | undefined,
        fullCommandText: data.fullCommandText as string | undefined,
        intention: data.intention as string | undefined,
        path: data.path as string | undefined,
      })
    })

    const unsubscribeError = window.electronAPI.copilot.onError((error: string) => {
      console.error('Copilot error:', error)
      // Don't disconnect on transient errors - just show the error and allow retry
      setIsProcessing(false)
      // Only add error message if it's meaningful (not the common invalid_request_body)
      if (!error.includes('invalid_request_body')) {
        setMessages(prev => [...prev, { 
          id: generateId(), 
          role: 'assistant', 
          content: `⚠️ ${error}` 
        }])
      }
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
    if (!inputValue.trim() || isProcessing) return
    
    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: inputValue.trim()
    }
    
    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsProcessing(true)
    setActiveTools([]) // Clear any stale tool indicators
    
    // Add placeholder for assistant response
    setMessages(prev => [...prev, {
      id: generateId(),
      role: 'assistant',
      content: '',
      isStreaming: true
    }])
    
    try {
      await window.electronAPI.copilot.send(userMessage.content)
    } catch (error) {
      console.error('Send error:', error)
      setIsProcessing(false)
    }
  }, [inputValue, isProcessing])

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }, [handleSendMessage])

  const handleStop = () => {
    window.electronAPI.copilot.abort()
    setIsProcessing(false)
  }

  const handleConfirmation = async (decision: 'approved' | 'always' | 'denied') => {
    if (!pendingConfirmation) return
    
    try {
      await window.electronAPI.copilot.respondPermission({
        requestId: pendingConfirmation.requestId,
        decision
      })
    } catch (error) {
      console.error('Permission response failed:', error)
    }
    setPendingConfirmation(null)
  }

  const handleReset = async () => {
    setStatus('connecting')
    setMessages([])
    await window.electronAPI.copilot.reset()
    setStatus('connected')
  }

  const handleModelChange = async (model: string) => {
    if (model === currentModel) {
      setShowModelDropdown(false)
      return
    }
    
    setShowModelDropdown(false)
    setStatus('connecting')
    setMessages([])
    
    try {
      const result = await window.electronAPI.copilot.setModel(model)
      setCurrentModel(result.model)
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
                <span>{currentModel}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>
              
              {showModelDropdown && availableModels.length > 0 && (
                <div 
                  className="absolute top-full left-0 mt-1 py-1 bg-[#21262d] border border-[#30363d] rounded-lg shadow-lg z-50 min-w-[160px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {availableModels.map((model) => (
                    <button
                      key={model}
                      onClick={() => handleModelChange(model)}
                      className={`w-full px-3 py-1.5 text-left text-xs hover:bg-[#30363d] transition-colors ${
                        model === currentModel ? 'text-[#58a6ff]' : 'text-[#e6edf3]'
                      }`}
                    >
                      {model === currentModel && '✓ '}{model}
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
          
          {isProcessing && (
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
          
          <button 
            onClick={handleReset}
            className="p-1 rounded hover:bg-[#21262d] transition-colors"
            title="New Chat"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && status === 'connected' && (
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
        
        {messages.filter(m => m.role !== 'system').map((message) => (
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
                  <span className="text-[#8b949e] italic">Thinking...</span>
                )}
                {message.isStreaming && message.content && (
                  <span className="inline-block w-2 h-4 ml-1 bg-[#58a6ff] animate-pulse rounded-sm" />
                )}
              </div>
            </div>
          </div>
        ))}
        
        {/* Active Tools Indicator */}
        {activeTools.length > 0 && (
          <div className="flex justify-start">
            <div className="flex flex-wrap gap-2 px-3 py-2 bg-[#1c2128] rounded-lg border border-[#30363d]">
              {activeTools.map((tool) => (
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
        {pendingConfirmation && (
          <div className="flex justify-start">
            <div className="max-w-[90%] bg-[#1c2128] rounded-lg border border-[#d29922] p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[#d29922]">⚠️</span>
                <span className="text-[#e6edf3] text-sm">
                  Allow <strong className="font-bold">{pendingConfirmation.executable || pendingConfirmation.kind}</strong>?
                </span>
              </div>
              {pendingConfirmation.intention && (
                <div className="text-sm text-[#e6edf3] mb-2">{pendingConfirmation.intention}</div>
              )}
              {pendingConfirmation.fullCommandText && (
                <pre className="bg-[#0d1117] rounded p-2 my-2 overflow-x-auto text-xs text-[#e6edf3] border border-[#30363d]">
                  <code>{pendingConfirmation.fullCommandText}</code>
                </pre>
              )}
              {pendingConfirmation.path && !pendingConfirmation.intention && (
                <div className="text-xs text-[#8b949e] mb-2">Path: {pendingConfirmation.path}</div>
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
                  title={`Always allow ${pendingConfirmation.executable || pendingConfirmation.kind} for this session`}
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
            disabled={status !== 'connected' || isProcessing}
            autoFocus
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || status !== 'connected' || isProcessing}
            className="mr-2 px-3 py-1.5 rounded bg-[#238636] hover:bg-[#2ea043] disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
          >
            {isProcessing ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
