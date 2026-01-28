import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Modal } from '../Modal'
import { ClockIcon, FolderIcon } from '../Icons'
import { PreviousSession } from '../../types'

interface SessionHistoryProps {
  isOpen: boolean
  onClose: () => void
  sessions: PreviousSession[]
  onResumeSession: (session: PreviousSession) => void
}

// Helper to categorize sessions by time period
const categorizeByTime = (sessions: PreviousSession[]) => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const lastWeek = new Date(today)
  lastWeek.setDate(lastWeek.getDate() - 7)
  const lastMonth = new Date(today)
  lastMonth.setDate(lastMonth.getDate() - 30)

  const categories: { label: string; sessions: PreviousSession[] }[] = [
    { label: 'Today', sessions: [] },
    { label: 'Yesterday', sessions: [] },
    { label: 'Last 7 Days', sessions: [] },
    { label: 'Last 30 Days', sessions: [] },
    { label: 'Older', sessions: [] },
  ]

  for (const session of sessions) {
    const sessionDate = new Date(session.modifiedTime)
    if (sessionDate >= today) {
      categories[0].sessions.push(session)
    } else if (sessionDate >= yesterday) {
      categories[1].sessions.push(session)
    } else if (sessionDate >= lastWeek) {
      categories[2].sessions.push(session)
    } else if (sessionDate >= lastMonth) {
      categories[3].sessions.push(session)
    } else {
      categories[4].sessions.push(session)
    }
  }

  return categories.filter(c => c.sessions.length > 0)
}

// Format relative time
const formatRelativeTime = (isoDate: string) => {
  const date = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Get shortened path for display
const shortenPath = (path: string | undefined) => {
  if (!path) return ''
  const parts = path.split('/')
  if (parts.length <= 3) return path
  return '.../' + parts.slice(-2).join('/')
}

export const SessionHistory: React.FC<SessionHistoryProps> = ({
  isOpen,
  onClose,
  sessions,
  onResumeSession,
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('')
      // Small delay to ensure modal is rendered
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 100)
    }
  }, [isOpen])

  // Filter sessions based on search query
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions

    const query = searchQuery.toLowerCase()
    return sessions.filter(session => {
      const name = (session.name || '').toLowerCase()
      const sessionId = session.sessionId.toLowerCase()
      const cwd = (session.cwd || '').toLowerCase()
      return name.includes(query) || sessionId.includes(query) || cwd.includes(query)
    })
  }, [sessions, searchQuery])

  // Categorize filtered sessions
  const categorizedSessions = useMemo(() => {
    return categorizeByTime(filteredSessions)
  }, [filteredSessions])

  const handleSessionClick = (session: PreviousSession) => {
    onResumeSession(session)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Session History" width="600px">
      <Modal.Body className="p-0">
        {/* Search Bar */}
        <div className="p-3 border-b border-copilot-border">
          <div className="relative">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 pl-9 text-sm bg-copilot-bg border border-copilot-border rounded-md text-copilot-text placeholder-copilot-text-muted focus:outline-none focus:border-copilot-accent"
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-copilot-text-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>

        {/* Sessions List */}
        <div className="max-h-[400px] overflow-y-auto">
          {filteredSessions.length === 0 ? (
            <div className="p-8 text-center text-copilot-text-muted">
              {searchQuery ? (
                <>
                  <p className="text-sm">No sessions found matching "{searchQuery}"</p>
                  <p className="text-xs mt-1 opacity-70">Try a different search term</p>
                </>
              ) : (
                <>
                  <ClockIcon size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No previous sessions</p>
                  <p className="text-xs mt-1 opacity-70">Your session history will appear here</p>
                </>
              )}
            </div>
          ) : (
            <div className="py-2">
              {categorizedSessions.map((category) => (
                <div key={category.label}>
                  {/* Category Header */}
                  <div className="px-3 py-1.5 text-xs font-medium text-copilot-text-muted bg-copilot-bg/50 sticky top-0">
                    {category.label}
                  </div>
                  
                  {/* Sessions in Category */}
                  {category.sessions.map((session) => (
                    <button
                      key={session.sessionId}
                      onClick={() => handleSessionClick(session)}
                      className="w-full px-3 py-2.5 flex items-start gap-3 hover:bg-copilot-surface transition-colors text-left group"
                    >
                      {/* Clock Icon */}
                      <ClockIcon
                        size={16}
                        className="shrink-0 mt-0.5 text-copilot-text-muted group-hover:text-copilot-accent transition-colors"
                        strokeWidth={1.5}
                      />
                      
                      {/* Session Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-copilot-text truncate font-medium">
                            {session.name || `Session ${session.sessionId.slice(0, 8)}...`}
                          </span>
                          <span className="text-xs text-copilot-text-muted shrink-0">
                            {formatRelativeTime(session.modifiedTime)}
                          </span>
                        </div>
                        
                        {/* Working Directory */}
                        {session.cwd && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <FolderIcon size={12} className="text-copilot-text-muted opacity-60" strokeWidth={1.5} />
                            <span className="text-xs text-copilot-text-muted truncate">
                              {shortenPath(session.cwd)}
                            </span>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with count */}
        <div className="px-3 py-2 border-t border-copilot-border text-xs text-copilot-text-muted">
          {searchQuery ? (
            <span>{filteredSessions.length} of {sessions.length} sessions</span>
          ) : (
            <span>{sessions.length} sessions in history</span>
          )}
        </div>
      </Modal.Body>
    </Modal>
  )
}

export default SessionHistory
