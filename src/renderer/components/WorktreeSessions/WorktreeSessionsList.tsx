import React, { useState, useEffect } from 'react'
import { Modal } from '../Modal'
import { Button } from '../Button'
import { Spinner } from '../Spinner'

interface WorktreeSession {
  id: string
  repoPath: string
  branch: string
  worktreePath: string
  createdAt: string
  lastAccessedAt: string
  status: 'active' | 'idle' | 'orphaned'
  diskUsage?: string
}

interface WorktreeSessionsListProps {
  isOpen: boolean
  onClose: () => void
  onOpenSession: (session: WorktreeSession) => void
}

export const WorktreeSessionsList: React.FC<WorktreeSessionsListProps> = ({
  isOpen,
  onClose,
  onOpenSession
}) => {
  const [sessions, setSessions] = useState<(WorktreeSession & { diskUsage: string })[]>([])
  const [totalDiskUsage, setTotalDiskUsage] = useState('0 B')
  const [isLoading, setIsLoading] = useState(false)
  const [isPruning, setIsPruning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSessions = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.worktree.listSessions()
      setSessions(result.sessions)
      setTotalDiskUsage(result.totalDiskUsage)
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadSessions()
    }
  }, [isOpen])

  const handlePrune = async () => {
    setIsPruning(true)
    try {
      const result = await window.electronAPI.worktree.pruneSessions()
      if (result.pruned.length > 0) {
        await loadSessions()
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsPruning(false)
    }
  }

  const handleRemove = async (sessionId: string) => {
    try {
      const result = await window.electronAPI.worktree.removeSession({ sessionId, force: true })
      if (result.success) {
        await loadSessions()
      } else {
        setError(result.error || 'Failed to remove session')
      }
    } catch (err) {
      setError(String(err))
    }
  }

  const formatDate = (isoDate: string) => {
    const date = new Date(isoDate)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins} min ago`
    if (diffHours < 24) return `${diffHours} hours ago`
    if (diffDays < 7) return `${diffDays} days ago`
    return date.toLocaleDateString()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-copilot-success'
      case 'idle': return 'text-copilot-text-muted'
      case 'orphaned': return 'text-copilot-warning'
      default: return 'text-copilot-text-muted'
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Worktree Sessions" width="650px">
      <Modal.Body className="max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : error ? (
          <div className="text-copilot-error text-sm py-4">{error}</div>
        ) : sessions.length === 0 ? (
          <div className="text-copilot-text-muted text-sm py-4 text-center">
            No worktree sessions found.<br />
            Create a new session from a branch to work in isolation.
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map(session => (
              <div
                key={session.id}
                className="flex items-center justify-between p-3 bg-copilot-bg rounded border border-copilot-border hover:border-copilot-border-hover transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-copilot-accent truncate">
                      {session.branch}
                    </span>
                    <span className={`text-xs ${getStatusColor(session.status)}`}>
                      {session.status}
                    </span>
                  </div>
                  <div className="text-xs text-copilot-text-muted mt-1 truncate">
                    {session.repoPath}
                  </div>
                  <div className="flex gap-4 text-xs text-copilot-text-muted mt-1">
                    <span>Created: {formatDate(session.createdAt)}</span>
                    <span>{session.diskUsage}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onOpenSession(session)}
                    disabled={session.status === 'orphaned'}
                  >
                    Open
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleRemove(session.id)}
                    className="text-copilot-error hover:text-copilot-error"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal.Body>
      <Modal.Body className="pt-0">
        <div className="flex items-center justify-between text-xs text-copilot-text-muted border-t border-copilot-border pt-3">
          <span>Total: {sessions.length} sessions, {totalDiskUsage}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={handlePrune}
            disabled={isPruning || sessions.length === 0}
          >
            {isPruning ? 'Pruning...' : 'Prune Stale'}
          </Button>
        </div>
      </Modal.Body>
    </Modal>
  )
}

export default WorktreeSessionsList
