import React, { useState, useEffect } from 'react'

interface GitBranchWidgetProps {
  cwd?: string
  refreshKey?: number
}

export const GitBranchWidget: React.FC<GitBranchWidgetProps> = ({ cwd, refreshKey }) => {
  const [branch, setBranch] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isWorktree, setIsWorktree] = useState(false)

  useEffect(() => {
    if (!cwd) {
      setBranch(null)
      setError(null)
      setIsWorktree(false)
      return
    }

    const fetchBranch = async () => {
      setIsLoading(true)
      setError(null)
      
      try {
        const result = await window.electronAPI.git.getBranch(cwd)
        if (result.success && result.branch) {
          setBranch(result.branch)
        } else {
          setBranch(null)
          if (!result.success) {
            setError('Not a git repository')
          }
        }
        
        // Check if this is a worktree session
        const worktreeSession = await window.electronAPI.worktree.findSession({ 
          repoPath: cwd, 
          branch: result.branch || '' 
        })
        // Also check if cwd itself is a worktree path
        const isWorktreePath = cwd.includes('.copilot-sessions')
        setIsWorktree(!!worktreeSession || isWorktreePath)
      } catch (err) {
        console.error('Failed to get git branch:', err)
        setError('Failed to get branch')
        setBranch(null)
        setIsWorktree(false)
      } finally {
        setIsLoading(false)
      }
    }

    fetchBranch()
  }, [cwd, refreshKey])

  if (isLoading) {
    return (
      <div className="flex items-center gap-1 text-xs text-copilot-text-muted min-w-0">
        <svg className="w-3 h-3 animate-spin shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 11-6.219-8.56" />
        </svg>
        <span className="truncate">Loading...</span>
      </div>
    )
  }

  if (error || !branch) {
    return (
      <div className="text-xs text-copilot-text-muted min-w-0 truncate" title={error || 'Not a git repository'}>
        {error || 'Not a git repository'}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 text-xs min-w-0" data-testid="git-branch-widget">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-copilot-accent shrink-0">
        <path d="M6 3v12" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="15" r="3" />
        <path d="M18 9a9 9 0 01-9 9" />
      </svg>
      <span className="text-copilot-text font-mono truncate" title={branch}>{branch}</span>
      {isWorktree && (
        <span 
          className="px-1.5 py-0.5 bg-copilot-accent/20 text-copilot-accent rounded text-[10px] font-medium shrink-0"
          title="This session is running in an isolated worktree"
        >
          worktree
        </span>
      )}
    </div>
  )
}