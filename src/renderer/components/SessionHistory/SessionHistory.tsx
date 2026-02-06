import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { Spinner } from '../Spinner';
import { ClockIcon, ZapIcon, GitBranchIcon } from '../Icons';
import { PreviousSession, TabState, WorktreeRemovalStatus } from '../../types';

// Filter options for the session list
type SessionFilter = 'all' | 'worktree';

// Extended session type that includes active flag
interface DisplaySession extends PreviousSession {
  isActive?: boolean;
}

// Full worktree data including lastAccessedAt for time categorization
interface WorktreeData {
  id: string;
  branch: string;
  worktreePath: string;
  status: 'active' | 'idle' | 'orphaned';
  diskUsage?: string;
  lastAccessedAt: string;
}

interface SessionHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: PreviousSession[];
  activeSessions: TabState[];
  activeSessionId: string | null;
  onResumeSession: (session: PreviousSession) => void;
  onSwitchToSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onRemoveWorktreeSession?: (
    worktreeId: string,
    worktreePath: string
  ) => Promise<{ success: boolean; error?: string }>;
  onOpenWorktreeSession?: (session: { worktreePath: string; branch: string }) => void;
  initialFilter?: SessionFilter;
}

// Helper to categorize sessions by time period
const categorizeByTime = (sessions: DisplaySession[]) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);
  const lastMonth = new Date(today);
  lastMonth.setDate(lastMonth.getDate() - 30);

  const categories: { label: string; sessions: DisplaySession[] }[] = [
    { label: 'Today', sessions: [] },
    { label: 'Yesterday', sessions: [] },
    { label: 'Last 7 Days', sessions: [] },
    { label: 'Last 30 Days', sessions: [] },
    { label: 'Older', sessions: [] },
  ];

  for (const session of sessions) {
    const sessionDate = new Date(session.modifiedTime);
    if (sessionDate >= today) {
      categories[0].sessions.push(session);
    } else if (sessionDate >= yesterday) {
      categories[1].sessions.push(session);
    } else if (sessionDate >= lastWeek) {
      categories[2].sessions.push(session);
    } else if (sessionDate >= lastMonth) {
      categories[3].sessions.push(session);
    } else {
      categories[4].sessions.push(session);
    }
  }

  // Newest-first within each timeframe
  for (const category of categories) {
    category.sessions.sort(
      (a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime()
    );
  }

  return categories.filter((c) => c.sessions.length > 0);
};

// Format relative time
const formatRelativeTime = (isoDate: string) => {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

// Get shortened path for display - replaces home directory with ~
const shortenPath = (path: string | undefined) => {
  if (!path) return '';
  // Replace home directory with ~
  const homeDir = '/Users/';
  if (path.startsWith(homeDir)) {
    const afterUsers = path.slice(homeDir.length);
    const slashIndex = afterUsers.indexOf('/');
    if (slashIndex !== -1) {
      return '~' + afterUsers.slice(slashIndex);
    }
  }
  return path;
};

export const SessionHistory: React.FC<SessionHistoryProps> = ({
  isOpen,
  onClose,
  sessions,
  activeSessions,
  activeSessionId,
  onResumeSession,
  onSwitchToSession,
  onDeleteSession,
  onRemoveWorktreeSession,
  onOpenWorktreeSession,
  initialFilter = 'all',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<SessionFilter>(initialFilter);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{
    sessionId: string;
    worktreeId: string;
    worktreePath: string;
    hasUncommitted: boolean;
    hasUnpushed: boolean;
  } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Worktree data fetched directly (for detecting active worktrees and adding standalone worktrees)
  const [worktreeMap, setWorktreeMap] = useState<Map<string, WorktreeData>>(new Map());

  // Fetch worktree list when modal opens to properly detect active worktrees
  useEffect(() => {
    if (isOpen) {
      const fetchWorktrees = async () => {
        try {
          if (!window.electronAPI?.worktree?.listSessions) return;
          const result = await window.electronAPI.worktree.listSessions();
          if (result?.sessions) {
            const map = new Map<string, WorktreeData>();
            result.sessions.forEach(
              (wt: {
                id: string;
                branch: string;
                worktreePath: string;
                status: 'active' | 'idle' | 'orphaned';
                diskUsage?: string;
                lastAccessedAt?: string;
                createdAt?: string;
              }) => {
                map.set(wt.worktreePath, {
                  id: wt.id,
                  branch: wt.branch,
                  worktreePath: wt.worktreePath,
                  status: wt.status,
                  diskUsage: wt.diskUsage,
                  lastAccessedAt: wt.lastAccessedAt || wt.createdAt || new Date().toISOString(),
                });
              }
            );
            setWorktreeMap(map);
          }
        } catch (err) {
          console.error('Failed to fetch worktree list:', err);
        }
      };
      fetchWorktrees();
    }
  }, [isOpen]);

  // Reset filter to initialFilter when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setFilter(initialFilter);
      setError(null);
      setSuccessMessage(null);
      setConfirmRemove(null);
      // Small delay to ensure modal is rendered
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, initialFilter]);

  // Combine active sessions, previous sessions, and standalone worktree sessions
  const allSessions: DisplaySession[] = useMemo(() => {
    // Convert active tabs to DisplaySession format, enriching with worktree data from live worktreeMap
    const activeDisplaySessions: DisplaySession[] = activeSessions.map((tab) => {
      // Match tab.cwd to worktreePath to find worktree data (from live worktree list)
      const worktreeData = tab.cwd ? worktreeMap.get(tab.cwd) : undefined;
      // Convert WorktreeData to PreviousSession['worktree'] format (exclude lastAccessedAt)
      const worktree = worktreeData
        ? {
            id: worktreeData.id,
            branch: worktreeData.branch,
            worktreePath: worktreeData.worktreePath,
            status: worktreeData.status,
            diskUsage: worktreeData.diskUsage,
          }
        : undefined;
      return {
        sessionId: tab.id,
        name: tab.name,
        modifiedTime: new Date().toISOString(), // Active sessions are "now"
        cwd: tab.cwd,
        isActive: true,
        worktree,
      };
    });

    // Filter out any previous sessions that are now active (shouldn't happen but just in case)
    const activeIds = new Set(activeSessions.map((t) => t.id));
    const filteredPrevious: DisplaySession[] = sessions
      .filter((s) => !activeIds.has(s.sessionId))
      .map((s) => ({ ...s, isActive: false }));

    // Collect worktree paths that are already represented
    const coveredWorktreePaths = new Set<string>();
    for (const session of activeDisplaySessions) {
      if (session.worktree?.worktreePath) {
        coveredWorktreePaths.add(session.worktree.worktreePath);
      }
    }
    for (const session of filteredPrevious) {
      if (session.worktree?.worktreePath) {
        coveredWorktreePaths.add(session.worktree.worktreePath);
      }
    }

    // Add standalone worktree sessions (worktrees without a matching Copilot session)
    const standaloneWorktrees: DisplaySession[] = [];
    for (const [worktreePath, worktreeData] of worktreeMap) {
      if (!coveredWorktreePaths.has(worktreePath)) {
        standaloneWorktrees.push({
          sessionId: `worktree-${worktreeData.id}`,
          name: worktreeData.branch,
          modifiedTime: worktreeData.lastAccessedAt,
          cwd: worktreePath,
          isActive: false,
          worktree: {
            id: worktreeData.id,
            branch: worktreeData.branch,
            worktreePath: worktreeData.worktreePath,
            status: worktreeData.status,
            diskUsage: worktreeData.diskUsage,
          },
        });
      }
    }

    // Combine: active sessions first (they're "today"), then previous, then standalone worktrees
    return [...activeDisplaySessions, ...filteredPrevious, ...standaloneWorktrees];
  }, [activeSessions, sessions, worktreeMap]);

  // Filter sessions based on search query AND filter type
  const filteredSessions = useMemo(() => {
    let result = allSessions;

    // Apply filter type
    if (filter === 'worktree') {
      result = result.filter((session) => session.worktree);
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((session) => {
        const name = (session.name || '').toLowerCase();
        const sessionId = session.sessionId.toLowerCase();
        const cwd = (session.cwd || '').toLowerCase();
        const branch = (session.worktree?.branch || '').toLowerCase();
        return (
          name.includes(query) ||
          sessionId.includes(query) ||
          cwd.includes(query) ||
          branch.includes(query)
        );
      });
    }

    return result;
  }, [allSessions, searchQuery, filter]);

  // Count worktree sessions for filter badge
  const worktreeCount = useMemo(() => {
    return allSessions.filter((s) => s.worktree).length;
  }, [allSessions]);

  // Categorize filtered sessions
  const categorizedSessions = useMemo(() => {
    return categorizeByTime(filteredSessions);
  }, [filteredSessions]);

  const handleSessionClick = (session: DisplaySession) => {
    if (session.worktree && onOpenWorktreeSession) {
      // Open worktree session
      onOpenWorktreeSession({
        worktreePath: session.worktree.worktreePath,
        branch: session.worktree.branch,
      });
      onClose();
    } else if (session.isActive) {
      // Switch to the active session
      onSwitchToSession(session.sessionId);
      onClose();
    } else {
      // Resume a previous session
      onResumeSession(session);
      onClose();
    }
  };

  const handleDeleteClick = async (e: React.MouseEvent, session: DisplaySession) => {
    e.stopPropagation(); // Prevent triggering session click
    if (session.isActive) return;

    // For worktree sessions, check for uncommitted/unpushed changes first
    if (session.worktree && onRemoveWorktreeSession) {
      setActionInProgress(`remove-${session.sessionId}`);
      setError(null);
      try {
        const status = await window.electronAPI.git.getWorkingStatus(session.worktree.worktreePath);
        if (status.hasUncommittedChanges || status.hasUnpushedCommits) {
          setConfirmRemove({
            sessionId: session.sessionId,
            worktreeId: session.worktree.id,
            worktreePath: session.worktree.worktreePath,
            hasUncommitted: status.hasUncommittedChanges,
            hasUnpushed: status.hasUnpushedCommits,
          });
          setActionInProgress(null);
          return;
        }
        // No uncommitted changes, proceed with removal
        await doWorktreeRemove(
          session.sessionId,
          session.worktree.id,
          session.worktree.worktreePath
        );
      } catch (err) {
        setError(String(err));
        setActionInProgress(null);
      }
    } else {
      // Regular session deletion
      onDeleteSession(session.sessionId);
    }
  };

  const doWorktreeRemove = async (sessionId: string, worktreeId: string, worktreePath: string) => {
    if (!onRemoveWorktreeSession) return;
    setActionInProgress(`remove-${sessionId}`);
    try {
      const result = await onRemoveWorktreeSession(worktreeId, worktreePath);
      if (result.success) {
        setSuccessMessage('Worktree removed successfully');
        setTimeout(() => setSuccessMessage(null), 3000);
        // Refresh worktree list to remove the deleted session
        if (window.electronAPI?.worktree?.listSessions) {
          const refreshResult = await window.electronAPI.worktree.listSessions();
          if (refreshResult?.sessions) {
            const map = new Map<string, WorktreeData>();
            refreshResult.sessions.forEach(
              (wt: {
                id: string;
                branch: string;
                worktreePath: string;
                status: 'active' | 'idle' | 'orphaned';
                diskUsage?: string;
                lastAccessedAt?: string;
                createdAt?: string;
              }) => {
                map.set(wt.worktreePath, {
                  id: wt.id,
                  branch: wt.branch,
                  worktreePath: wt.worktreePath,
                  status: wt.status,
                  diskUsage: wt.diskUsage,
                  lastAccessedAt: wt.lastAccessedAt || wt.createdAt || new Date().toISOString(),
                });
              }
            );
            setWorktreeMap(map);
          }
        }
      } else {
        setError(result.error || 'Failed to remove worktree');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setActionInProgress(null);
      setConfirmRemove(null);
    }
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
    <Modal isOpen={isOpen} onClose={onClose} title="Session History" width="650px">
      <Modal.Body className="p-0" data-clarity-mask="true">
        {/* Success/Error Messages */}
        {successMessage && (
          <div className="text-copilot-success text-sm p-2 m-3 mb-0 bg-copilot-success/10 rounded">
            {successMessage}
          </div>
        )}
        {error && (
          <div className="text-copilot-error text-sm p-2 m-3 mb-0 bg-copilot-error/10 rounded flex items-center">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-auto text-copilot-text-muted hover:text-copilot-text"
            >
              ✕
            </button>
          </div>
        )}

        {/* Search Bar and Filter Toggle */}
        <div className="p-3 border-b border-copilot-border">
          <div className="flex gap-2">
            <div className="relative flex-1">
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
            {/* Filter Toggle */}
            <div className="flex rounded-md border border-copilot-border overflow-hidden">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-2 text-xs transition-colors ${
                  filter === 'all'
                    ? 'bg-copilot-surface text-copilot-text'
                    : 'text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface/50'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('worktree')}
                className={`px-3 py-2 text-xs transition-colors border-l border-copilot-border flex items-center gap-1 ${
                  filter === 'worktree'
                    ? 'bg-copilot-surface text-copilot-text'
                    : 'text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface/50'
                }`}
              >
                <GitBranchIcon size={12} />
                Worktree
                {worktreeCount > 0 && (
                  <span className="text-[10px] bg-copilot-bg px-1 rounded">{worktreeCount}</span>
                )}
              </button>
            </div>
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
                  <p className="text-sm">No sessions</p>
                  <p className="text-xs mt-1 opacity-70">Your session history will appear here</p>
                </>
              )}
            </div>
          ) : (
            <div className="py-2">
              {categorizedSessions.map((category) => (
                <div key={category.label}>
                  {/* Category Header */}
                  <div className="px-3 py-1.5 text-xs font-medium text-copilot-text-muted bg-copilot-surface sticky top-0 z-10">
                    {category.label}
                  </div>

                  {/* Sessions in Category */}
                  {category.sessions.map((session) => {
                    const isCurrentSession = session.sessionId === activeSessionId;
                    const isRemoving = actionInProgress === `remove-${session.sessionId}`;
                    return (
                      <div
                        key={session.sessionId}
                        onClick={() => !isRemoving && handleSessionClick(session)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) =>
                          e.key === 'Enter' && !isRemoving && handleSessionClick(session)
                        }
                        className={`w-full px-3 py-2 flex items-center gap-3 hover:bg-copilot-surface transition-colors text-left group cursor-pointer ${isCurrentSession ? 'bg-copilot-surface/50' : ''} ${isRemoving ? 'opacity-50' : ''}`}
                      >
                        {/* Status Icon - consistent for all sessions */}
                        {session.isActive ? (
                          <ZapIcon
                            size={14}
                            className="shrink-0 text-copilot-text-muted group-hover:text-copilot-accent"
                            strokeWidth={1.5}
                          />
                        ) : (
                          <ClockIcon
                            size={14}
                            className="shrink-0 text-copilot-text-muted group-hover:text-copilot-accent"
                            strokeWidth={1.5}
                          />
                        )}

                        {/* Session Name */}
                        <span className="flex-1 min-w-0 text-sm text-copilot-text truncate flex items-center gap-1.5">
                          <span className="min-w-0 truncate">
                            {session.name || `Session ${session.sessionId.slice(0, 8)}...`}
                          </span>
                          {session.worktree?.branch && session.worktree.branch !== session.name && (
                            <span className="min-w-0 truncate text-xs text-copilot-text-muted">
                              {session.worktree.branch}
                            </span>
                          )}
                          {session.worktree && (
                            <GitBranchIcon
                              size={12}
                              className="shrink-0 text-copilot-text-muted"
                              strokeWidth={1.5}
                            />
                          )}
                        </span>

                        {/* Right side: badge/time - fixed widths for alignment */}
                        <div className="flex items-center shrink-0">
                          {/* Time/badge column - fixed width, flex to align right */}
                          <div className="w-20 flex justify-end items-center">
                            {session.isActive ? (
                              <span
                                className={`text-xs ${isCurrentSession ? 'text-copilot-accent' : 'text-copilot-success'}`}
                              >
                                {isCurrentSession ? 'current' : 'active'}
                              </span>
                            ) : (
                              <>
                                <span className="text-xs text-copilot-text-muted group-hover:hidden">
                                  {formatRelativeTime(session.modifiedTime)}
                                </span>
                                <button
                                  onClick={(e) => handleDeleteClick(e, session)}
                                  disabled={isRemoving}
                                  className="hidden group-hover:flex items-center justify-center text-copilot-text-muted hover:text-copilot-error transition-colors"
                                  title={session.worktree ? 'Remove worktree' : 'Delete session'}
                                >
                                  {isRemoving ? (
                                    <Spinner />
                                  ) : (
                                    <svg
                                      className="w-4 h-4"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={1.5}
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                      />
                                    </svg>
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with count */}
        <div className="px-3 py-2 border-t border-copilot-border text-xs text-copilot-text-muted">
          <span>
            {searchQuery || filter === 'worktree' ? (
              <>
                {filteredSessions.length} of {allSessions.length} sessions
              </>
            ) : (
              <>
                {allSessions.length} sessions ({activeSessions.length} active)
              </>
            )}
          </span>
        </div>
      </Modal.Body>

      {/* Confirmation dialog for worktree removal with uncommitted/unpushed changes */}
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
              onClick={() =>
                doWorktreeRemove(
                  confirmRemove.sessionId,
                  confirmRemove.worktreeId,
                  confirmRemove.worktreePath
                )
              }
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

export default SessionHistory;
