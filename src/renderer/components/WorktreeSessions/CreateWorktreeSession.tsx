import React, { useState, useEffect } from 'react'
import { Modal } from '../Modal'
import { Button } from '../Button'
import { Spinner } from '../Spinner'

interface CreateWorktreeSessionProps {
  isOpen: boolean
  onClose: () => void
  repoPath: string
  onSessionCreated: (worktreePath: string, branch: string) => void
}

export const CreateWorktreeSession: React.FC<CreateWorktreeSessionProps> = ({
  isOpen,
  onClose,
  repoPath,
  onSessionCreated
}) => {
  const [branch, setBranch] = useState('')
  const [skipDeps, setSkipDeps] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [gitSupported, setGitSupported] = useState<boolean | null>(null)
  const [gitVersion, setGitVersion] = useState<string>('')

  useEffect(() => {
    if (isOpen) {
      setBranch('')
      setError(null)
      setWarning(null)
      checkGitVersion()
    }
  }, [isOpen])

  const checkGitVersion = async () => {
    try {
      const result = await window.electronAPI.worktree.checkGitVersion()
      setGitSupported(result.supported)
      setGitVersion(result.version)
    } catch {
      setGitSupported(false)
      setGitVersion('unknown')
    }
  }

  const handleCreate = async () => {
    if (!branch.trim()) {
      setError('Branch name is required')
      return
    }

    setIsCreating(true)
    setError(null)
    setWarning(null)

    try {
      const result = await window.electronAPI.worktree.createSession({
        repoPath,
        branch: branch.trim(),
        skipDeps
      })

      if (result.success && result.session) {
        if (result.warning) {
          setWarning(result.warning)
        }
        onSessionCreated(result.session.worktreePath, result.session.branch)
        onClose()
      } else {
        setError(result.error || 'Failed to create worktree session')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsCreating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isCreating && branch.trim()) {
      handleCreate()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Worktree Session" width="450px">
      <Modal.Body>
        {gitSupported === false ? (
          <div className="text-copilot-error text-sm mb-4">
            Git 2.20+ required for worktree support. Found: {gitVersion}
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-xs text-copilot-text-muted mb-1">
                Repository
              </label>
              <div className="text-sm text-copilot-text font-mono truncate bg-copilot-bg px-2 py-1.5 rounded border border-copilot-border">
                {repoPath}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs text-copilot-text-muted mb-1">
                Branch Name
              </label>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="feature/my-feature"
                className="w-full px-3 py-2 bg-copilot-bg border border-copilot-border rounded text-sm text-copilot-text placeholder:text-copilot-text-muted focus:outline-none focus:border-copilot-accent"
                autoFocus
                disabled={isCreating}
              />
              <p className="text-xs text-copilot-text-muted mt-1">
                If branch exists, it will be checked out. Otherwise, a new branch will be created.
              </p>
            </div>

            <div className="mb-4">
              <label className="flex items-center gap-2 text-sm text-copilot-text cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipDeps}
                  onChange={(e) => setSkipDeps(e.target.checked)}
                  className="rounded border-copilot-border"
                  disabled={isCreating}
                />
                Skip dependency installation
              </label>
              <p className="text-xs text-copilot-text-muted mt-1 ml-5">
                Faster but you'll need to run npm/yarn/pnpm install manually.
              </p>
            </div>

            {error && (
              <div className="text-copilot-error text-sm mb-4 p-2 bg-copilot-error-muted rounded">
                {error}
              </div>
            )}

            {warning && (
              <div className="text-copilot-warning text-sm mb-4 p-2 bg-copilot-warning-muted rounded">
                {warning}
              </div>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Body className="pt-0">
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCreate}
            disabled={isCreating || !branch.trim() || gitSupported === false}
          >
            {isCreating ? (
              <>
                <Spinner /> Creating...
              </>
            ) : (
              'Create Session'
            )}
          </Button>
        </Modal.Footer>
      </Modal.Body>
    </Modal>
  )
}

export default CreateWorktreeSession
