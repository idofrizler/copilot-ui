import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';

interface WorktreeSession {
  id: string;
  repoPath: string;
  branch: string;
  worktreePath: string;
  createdAt: string;
  lastAccessedAt: string;
  status: 'active' | 'idle' | 'orphaned';
}

interface WorktreeSessionsListProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSession: (session: WorktreeSession) => void;
  onRemoveSession?: (worktreePath: string) => void;
}

export const WorktreeSessionsList: React.FC<WorktreeSessionsListProps> = ({
  isOpen,
  onClose,
  onOpenSession,
  onRemoveSession,
}) => {
  const [sessions, setSessions] = useState<WorktreeSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPruning, setIsPruning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{
    sessionId: string;
    worktreePath: string;
    hasUncommitted: boolean;
    hasUnpushed: boolean;
  } | null>(null);

  const loadSessions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.worktree.listSessions();
      setSessions(result.sessions);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSessions();
      setSuccessMessage(null);
      setConfirmRemove(null);
    }
  }, [isOpen]);

  const handlePrune = async () => {
    setIsPruning(true);
    try {
      const result = await window.electronAPI.worktree.pruneSessions();
      if (result.pruned.length > 0) {
        await loadSessions();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsPruning(false);
    }
  };

  const handleRemove = async (sessionId: string, worktreePath: string) => {
    setActionInProgress(`remove-${sessionId}`);
    setError(null);
    try {
      // Check for uncommitted/unpushed changes first
      const status = await window.electronAPI.git.getWorkingStatus(worktreePath);
      if (status.hasUncommittedChanges || status.hasUnpushedCommits) {
        setConfirmRemove({
          sessionId,
          worktreePath,
          hasUncommitted: status.hasUncommittedChanges,
          hasUnpushed: status.hasUnpushedCommits,
        });
        setActionInProgress(null);
        return;
      }
      // No uncommitted changes, proceed with removal
      await doRemove(sessionId, worktreePath);
    } catch (err) {
      setError(String(err));
      setActionInProgress(null);
    }
  };

  const doRemove = async (sessionId: string, worktreePath: string) => {
    setActionInProgress(`remove-${sessionId}`);
    try {
      const result = await window.electronAPI.worktree.removeSession({ sessionId, force: true });
      if (result.success) {
        // Close the session tab if open
        onRemoveSession?.(worktreePath);
        await loadSessions();
        setSuccessMessage('Worktree removed successfully');
      } else {
        setError(result.error || 'Failed to remove session');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setActionInProgress(null);
      setConfirmRemove(null);
    }
  };

  const formatDate = (isoDate: string) => {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-copilot-success';
      case 'idle':
        return 'text-copilot-text-muted';
      case 'orphaned':
        return 'text-copilot-warning';
      default:
        return 'text-copilot-text-muted';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Worktree Sessions" width="750px">
      <Modal.Body className="max-h-[400px] overflow-y-auto">
        {successMessage && (
          <div className="text-copilot-success text-sm mb-3 p-2 bg-copilot-success/10 rounded">
            {successMessage}
          </div>
        )}
        {error && (
          <div className="text-copilot-error text-sm mb-3 p-2 bg-copilot-error/10 rounded">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 text-copilot-text-muted hover:text-copilot-text"
            >
              ✕
            </button>
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-copilot-text-muted text-sm py-4 text-center">
            No worktree sessions found.
            <br />
            Create a new session from a branch to work in isolation.
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="p-3 bg-copilot-bg rounded border border-copilot-border hover:border-copilot-border-hover transition-colors"
              >
                <div className="flex items-center justify-between">
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
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-copilot-border">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onOpenSession(session)}
                    disabled={session.status === 'orphaned' || !!actionInProgress}
                  >
                    Open
                  </Button>
                  <div className="flex-1" />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleRemove(session.id, session.worktreePath)}
                    disabled={!!actionInProgress}
                    className="text-copilot-error hover:text-copilot-error"
                  >
                    {actionInProgress === `remove-${session.id}` ? 'Removing...' : 'Remove'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal.Body>
      <Modal.Body className="pt-0">
        <div className="flex items-center justify-between text-xs text-copilot-text-muted border-t border-copilot-border pt-3">
          <span>Total: {sessions.length} sessions</span>
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

      {/* Confirmation dialog for uncommitted/unpushed changes */}
      {confirmRemove && (
        <Modal
          isOpen={true}
          onClose={() => setConfirmRemove(null)}
          title="Confirm Removal"
          width="400px"
        >
          <Modal.Body>
            <div className="text-sm text-copilot-text mb-4">
              This worktree has:
              <ul className="list-disc list-inside mt-2 text-copilot-warning">
                {confirmRemove.hasUncommitted && <li>Uncommitted changes</li>}
                {confirmRemove.hasUnpushed && <li>Unpushed commits</li>}
              </ul>
            </div>
            <p className="text-sm text-copilot-text-muted">
              Are you sure you want to remove it? All changes will be lost.
            </p>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="ghost" onClick={() => setConfirmRemove(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => doRemove(confirmRemove.sessionId, confirmRemove.worktreePath)}
              className="bg-copilot-error hover:bg-copilot-error/80"
            >
              Remove Anyway
            </Button>
          </Modal.Footer>
        </Modal>
      )}
    </Modal>
  );
};

export default WorktreeSessionsList;
