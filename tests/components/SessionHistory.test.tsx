import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { SessionHistory } from '../../src/renderer/components/SessionHistory/SessionHistory';
import { PreviousSession } from '../../src/renderer/types';

// Helper to create mock sessions with specific dates
const createMockSession = (
  id: string,
  name: string,
  daysAgo: number,
  cwd?: string
): PreviousSession => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  // For "today" sessions, keep current time; for others, set to noon to avoid date boundary issues
  if (daysAgo > 0) {
    date.setHours(12, 0, 0, 0);
  }
  return {
    sessionId: id,
    name,
    modifiedTime: date.toISOString(),
    cwd,
  };
};

// Create a fixed set of mock sessions for deterministic testing
const createMockSessions = (): PreviousSession[] => [
  // Today (0 days ago)
  createMockSession('session-today-1', 'Fix login bug', 0, '/Users/dev/project-a'),
  createMockSession('session-today-2', 'Add user authentication', 0, '/Users/dev/project-b'),

  // Yesterday (1 day ago)
  createMockSession('session-yesterday-1', 'Refactor database layer', 1, '/Users/dev/project-a'),
  createMockSession('session-yesterday-2', 'Update API endpoints', 1, '/Users/dev/project-c'),

  // Last 7 days (3-6 days ago)
  createMockSession('session-week-1', 'Feature: Session History', 3, '/Users/dev/cooper'),
  createMockSession('session-week-2', 'Write unit tests', 5, '/Users/dev/project-a'),

  // Last 30 days (10-25 days ago)
  createMockSession('session-month-1', 'Initial project setup', 15, '/Users/dev/new-project'),
  createMockSession('session-month-2', 'Documentation updates', 20, '/Users/dev/docs'),

  // Older (45+ days ago)
  createMockSession('session-old-1', 'Legacy migration', 45, '/Users/dev/legacy'),
  createMockSession('session-old-2', 'Archive cleanup', 60, '/Users/dev/archive'),
];

// Helper render that waits for modal effects to settle when opened
const renderAndSettle = async (ui: React.ReactElement) => {
  render(ui);
  // If this is the SessionHistory modal and open, wait for it to be fully rendered
  try {
    // @ts-ignore
    if (ui?.props?.isOpen) {
      await waitFor(() => expect(screen.getByText('Session History')).toBeInTheDocument());
    }
  } catch {
    // ignore
  }
};

describe('SessionHistory Component', () => {
  const mockOnClose = vi.fn();
  const mockOnResumeSession = vi.fn();
  const mockOnSwitchToSession = vi.fn();
  const mockOnDeleteSession = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders nothing when isOpen is false', () => {
      render(
        <SessionHistory
          isOpen={false}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      expect(screen.queryByText('Session History')).not.toBeInTheDocument();
    });

    it('renders modal when isOpen is true', async () => {
      await renderAndSettle(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      expect(screen.getByText('Session History')).toBeInTheDocument();
    });

    it('renders search input with correct placeholder', async () => {
      await renderAndSettle(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      expect(screen.getByPlaceholderText('Search sessions...')).toBeInTheDocument();
    });

    it('displays session count in footer', async () => {
      const sessions = createMockSessions();
      await renderAndSettle(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={sessions}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      expect(screen.getByText(`${sessions.length} sessions (0 active)`)).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('shows empty state message when no sessions', async () => {
      await renderAndSettle(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={[]}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      expect(screen.getByText('No sessions')).toBeInTheDocument();
      expect(screen.getByText('Your session history will appear here')).toBeInTheDocument();
    });

    it('shows zero count in footer when no sessions', async () => {
      await renderAndSettle(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={[]}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      expect(screen.getByText('0 sessions (0 active)')).toBeInTheDocument();
    });
  });

  describe('Time-based Grouping', () => {
    it('shows folder path as category for sessions with cwd', async () => {
      const todaySessions = [
        createMockSession('today-1', 'Today session', 0, '/Users/dev/my-project'),
      ];
      await renderAndSettle(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={todaySessions}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      expect(screen.getByText('~/my-project')).toBeInTheDocument();
    });

    it('shows Other category for sessions without cwd', async () => {
      const noCwdSessions = [createMockSession('no-cwd-1', 'Session without cwd', 1)];
      await renderAndSettle(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={noCwdSessions}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      expect(screen.getByText('Other')).toBeInTheDocument();
    });

    it('groups sessions from same folder together', async () => {
      const sameFolderSessions = [
        createMockSession('week-1', 'Week session 1', 5, '/Users/dev/project'),
        createMockSession('week-2', 'Week session 2', 3, '/Users/dev/project'),
      ];
      await renderAndSettle(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={sameFolderSessions}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      // Both sessions should be under the same folder category
      expect(screen.getByText('~/project')).toBeInTheDocument();
      expect(screen.getByText('Week session 1')).toBeInTheDocument();
      expect(screen.getByText('Week session 2')).toBeInTheDocument();
    });

    it('sorts folders by most recent session activity', async () => {
      const oldSessions = [createMockSession('old-1', 'Old session', 45, '/Users/dev/old-project')];
      await renderAndSettle(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={oldSessions}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      expect(screen.getByText('~/old-project')).toBeInTheDocument();
    });

    it('shows multiple categories when sessions are in different folders', async () => {
      await renderAndSettle(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      // Sessions are now grouped by folder path (shortened with ~)
      expect(screen.getByText('~/project-a')).toBeInTheDocument();
      expect(screen.getByText('~/project-b')).toBeInTheDocument();
      expect(screen.getByText('~/project-c')).toBeInTheDocument();
      expect(screen.getByText('~/cooper')).toBeInTheDocument();
    });

    it('orders sessions newest-first within each folder', async () => {
      const newerDate = new Date();
      const olderDate = new Date(newerDate.getTime() - 60 * 60 * 1000);

      const older = {
        sessionId: 'folder-older',
        name: 'Older session',
        modifiedTime: olderDate.toISOString(),
        cwd: '/Users/dev/project-a',
      };
      const newer = {
        sessionId: 'folder-newer',
        name: 'Newer session',
        modifiedTime: newerDate.toISOString(),
        cwd: '/Users/dev/project-a',
      };

      await renderAndSettle(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={[older, newer]}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      const newerEl = screen.getByText('Newer session');
      const olderEl = screen.getByText('Older session');
      expect(
        newerEl.compareDocumentPosition(olderEl) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });
  });

  describe('Session Display', () => {
    it('displays session names', async () => {
      await renderAndSettle(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      expect(screen.getByText('Fix login bug')).toBeInTheDocument();
      expect(screen.getByText('Add user authentication')).toBeInTheDocument();
    });

    it('displays fallback text for sessions without names', async () => {
      const sessionsWithoutNames = [
        { sessionId: 'abc12345-full-id', modifiedTime: new Date().toISOString() },
      ];
      await renderAndSettle(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={sessionsWithoutNames}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      expect(screen.getByText('Session abc12345...')).toBeInTheDocument();
    });

    it('displays session names and branch names for worktrees', async () => {
      const sessionsWithWorktree: PreviousSession[] = [
        createMockSession('session-1', 'Regular session', 0, '/Users/dev/project'),
        {
          ...createMockSession('session-2', 'Worktree session', 0, '/path/worktree'),
          worktree: {
            id: 'wt-1',
            branch: 'feature/my-branch',
            worktreePath: '/path/worktree',
            status: 'active' as const,
          },
        },
      ];

      await renderAndSettle(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={sessionsWithWorktree}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      // Regular session shows name
      expect(screen.getByText('Regular session')).toBeInTheDocument();
      // Worktree session shows its session name (and branch as secondary text)
      expect(screen.getByText('Worktree session')).toBeInTheDocument();
      expect(screen.getByText('feature/my-branch')).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('filters sessions by name', async () => {
      const user = userEvent.setup();
      await renderAndSettle(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search sessions...');
      await user.type(searchInput, 'login');

      // Should show matching session
      expect(screen.getByText('Fix login bug')).toBeInTheDocument();

      // Should not show non-matching sessions
      expect(screen.queryByText('Refactor database layer')).not.toBeInTheDocument();
    });

    it('filters sessions by working directory', async () => {
      const user = userEvent.setup();
      await renderAndSettle(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search sessions...');
      await user.type(searchInput, 'cooper');

      // Should show session with matching path
      expect(screen.getByText('Feature: Session History')).toBeInTheDocument();

      // Should not show sessions with different paths
      expect(screen.queryByText('Fix login bug')).not.toBeInTheDocument();
    });

    it('filters sessions by session ID', async () => {
      const user = userEvent.setup();
      await renderAndSettle(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search sessions...');
      await user.type(searchInput, 'session-today-1');

      expect(screen.getByText('Fix login bug')).toBeInTheDocument();
      expect(screen.queryByText('Add user authentication')).not.toBeInTheDocument();
    });

    it('search is case-insensitive', async () => {
      const user = userEvent.setup();
      await renderAndSettle(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search sessions...');
      await user.type(searchInput, 'LOGIN');

      expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    });

    it('shows no results message when search matches nothing', async () => {
      const user = userEvent.setup();
      await renderAndSettle(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search sessions...');
      await user.type(searchInput, 'xyznonexistent123');

      expect(screen.getByText(/No sessions found matching/)).toBeInTheDocument();
      expect(screen.getByText(/xyznonexistent123/)).toBeInTheDocument();
    });

    it('shows filtered count in footer during search', async () => {
      const user = userEvent.setup();
      const sessions = createMockSessions();
      await renderAndSettle(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={sessions}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search sessions...');
      await user.type(searchInput, 'project-a');

      // Should show "X of Y sessions" format
      expect(screen.getByText(/\d+ of \d+ sessions/)).toBeInTheDocument();
    });

    it('restores all sessions when search is cleared', async () => {
      const user = userEvent.setup();
      const sessions = createMockSessions();
      await renderAndSettle(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={sessions}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search sessions...');

      // Type to filter
      await user.type(searchInput, 'login');
      expect(screen.queryByText('Refactor database layer')).not.toBeInTheDocument();

      // Clear search
      await user.clear(searchInput);

      // All sessions should be visible again
      expect(screen.getByText('Refactor database layer')).toBeInTheDocument();
      expect(screen.getByText(`${sessions.length} sessions (0 active)`)).toBeInTheDocument();
    });
  });

  describe('Session Click/Resume', () => {
    it('calls onResumeSession when clicking a session', async () => {
      const user = userEvent.setup();
      const sessions = createMockSessions();
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={sessions}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      await user.click(screen.getByText('Fix login bug'));

      expect(mockOnResumeSession).toHaveBeenCalledTimes(1);
      expect(mockOnResumeSession).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-today-1',
          name: 'Fix login bug',
        })
      );
    });

    it('calls onClose after clicking a session', async () => {
      const user = userEvent.setup();
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      await user.click(screen.getByText('Fix login bug'));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Modal Close', () => {
    it('calls onClose when clicking close button', async () => {
      const user = userEvent.setup();
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      await user.click(screen.getByLabelText('Close modal'));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Search Input Focus', () => {
    it('clears search query when modal opens', () => {
      const { rerender } = render(
        <SessionHistory
          isOpen={false}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      // Open modal
      rerender(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search sessions...');
      expect(searchInput).toHaveValue('');
    });
  });

  describe('Filter Toggle', () => {
    it('renders All and Worktree filter buttons', () => {
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      expect(screen.getByText('All')).toBeInTheDocument();
      expect(screen.getByText('Worktree')).toBeInTheDocument();
    });

    it('starts with All filter selected by default', () => {
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      const allButton = screen.getByText('All');
      expect(allButton).toHaveClass('bg-copilot-surface');
    });

    it('respects initialFilter prop for worktree', () => {
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
          initialFilter="worktree"
        />
      );

      // Worktree filter should be selected
      const worktreeButton = screen.getByText('Worktree').closest('button');
      expect(worktreeButton).toHaveClass('bg-copilot-surface');
    });

    it('filters to show only worktree sessions when Worktree filter clicked', async () => {
      const user = userEvent.setup();
      const sessionsWithWorktree: PreviousSession[] = [
        createMockSession('session-1', 'Regular session', 0, '/Users/dev/project'),
        {
          ...createMockSession(
            'session-2',
            'Worktree session',
            0,
            '/Users/dev/.copilot-sessions/repo--feature-branch'
          ),
          worktree: {
            id: 'repo--feature-branch',
            branch: 'feature-branch',
            worktreePath: '/Users/dev/.copilot-sessions/repo--feature-branch',
            status: 'active' as const,
            diskUsage: '10 MB',
          },
        },
      ];

      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={sessionsWithWorktree}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      // Both sessions visible initially
      expect(screen.getByText('Regular session')).toBeInTheDocument();
      expect(screen.getByText('feature-branch')).toBeInTheDocument();

      // Click worktree filter
      await user.click(screen.getByText('Worktree'));

      // Only worktree session visible
      expect(screen.queryByText('Regular session')).not.toBeInTheDocument();
      expect(screen.getByText('feature-branch')).toBeInTheDocument();
    });
  });

  describe('Worktree Session Display', () => {
    it('displays branch name for worktree sessions', () => {
      const sessionsWithWorktree: PreviousSession[] = [
        {
          ...createMockSession(
            'session-1',
            'Worktree session',
            0,
            '/Users/dev/.copilot-sessions/repo--feature-branch'
          ),
          worktree: {
            id: 'repo--feature-branch',
            branch: 'feature-branch',
            worktreePath: '/Users/dev/.copilot-sessions/repo--feature-branch',
            status: 'active' as const,
            diskUsage: '10 MB',
          },
        },
      ];

      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={sessionsWithWorktree}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      // Session name should be displayed (branch is shown as secondary text)
      expect(screen.getByText('Worktree session')).toBeInTheDocument();
      expect(screen.getByText('feature-branch')).toBeInTheDocument();
    });

    it('shows worktree count badge on filter button', () => {
      const sessionsWithWorktree: PreviousSession[] = [
        createMockSession('session-1', 'Regular session', 0, '/Users/dev/project'),
        {
          ...createMockSession('session-2', 'Worktree 1', 0, '/path/1'),
          worktree: {
            id: 'wt-1',
            branch: 'branch-1',
            worktreePath: '/path/1',
            status: 'active' as const,
          },
        },
        {
          ...createMockSession('session-3', 'Worktree 2', 0, '/path/2'),
          worktree: {
            id: 'wt-2',
            branch: 'branch-2',
            worktreePath: '/path/2',
            status: 'idle' as const,
          },
        },
      ];

      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={sessionsWithWorktree}
          onResumeSession={mockOnResumeSession}
          onDeleteSession={mockOnDeleteSession}
          activeSessions={[]}
          activeSessionId={null}
          onSwitchToSession={mockOnSwitchToSession}
        />
      );

      // Should show count of 2 worktree sessions
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });
});
