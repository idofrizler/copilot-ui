import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { SessionHistory } from '../../src/renderer/components/SessionHistory/SessionHistory'
import { PreviousSession } from '../../src/renderer/types'

// Helper to create mock sessions with specific dates
const createMockSession = (
  id: string,
  name: string,
  daysAgo: number,
  cwd?: string
): PreviousSession => {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  // For "today" sessions, keep current time; for others, set to noon to avoid date boundary issues
  if (daysAgo > 0) {
    date.setHours(12, 0, 0, 0)
  }
  return {
    sessionId: id,
    name,
    modifiedTime: date.toISOString(),
    cwd,
  }
}

// Create a fixed set of mock sessions for deterministic testing
const createMockSessions = (): PreviousSession[] => [
  // Today (0 days ago)
  createMockSession('session-today-1', 'Fix login bug', 0, '/Users/dev/project-a'),
  createMockSession('session-today-2', 'Add user authentication', 0, '/Users/dev/project-b'),
  
  // Yesterday (1 day ago)
  createMockSession('session-yesterday-1', 'Refactor database layer', 1, '/Users/dev/project-a'),
  createMockSession('session-yesterday-2', 'Update API endpoints', 1, '/Users/dev/project-c'),
  
  // Last 7 days (3-6 days ago)
  createMockSession('session-week-1', 'Feature: Session History', 3, '/Users/dev/copilot-ui'),
  createMockSession('session-week-2', 'Write unit tests', 5, '/Users/dev/project-a'),
  
  // Last 30 days (10-25 days ago)
  createMockSession('session-month-1', 'Initial project setup', 15, '/Users/dev/new-project'),
  createMockSession('session-month-2', 'Documentation updates', 20, '/Users/dev/docs'),
  
  // Older (45+ days ago)
  createMockSession('session-old-1', 'Legacy migration', 45, '/Users/dev/legacy'),
  createMockSession('session-old-2', 'Archive cleanup', 60, '/Users/dev/archive'),
]

describe('SessionHistory Component', () => {
  const mockOnClose = vi.fn()
  const mockOnResumeSession = vi.fn()
  
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic Rendering', () => {
    it('renders nothing when isOpen is false', () => {
      render(
        <SessionHistory
          isOpen={false}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      expect(screen.queryByText('Session History')).not.toBeInTheDocument()
    })

    it('renders modal when isOpen is true', () => {
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      expect(screen.getByText('Session History')).toBeInTheDocument()
    })

    it('renders search input with correct placeholder', () => {
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      expect(screen.getByPlaceholderText('Search sessions...')).toBeInTheDocument()
    })

    it('displays session count in footer', () => {
      const sessions = createMockSessions()
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={sessions}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      expect(screen.getByText(`${sessions.length} sessions in history`)).toBeInTheDocument()
    })
  })

  describe('Empty State', () => {
    it('shows empty state message when no sessions', () => {
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={[]}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      expect(screen.getByText('No previous sessions')).toBeInTheDocument()
      expect(screen.getByText('Your session history will appear here')).toBeInTheDocument()
    })

    it('shows zero count in footer when no sessions', () => {
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={[]}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      expect(screen.getByText('0 sessions in history')).toBeInTheDocument()
    })
  })

  describe('Time-based Grouping', () => {
    it('shows Today category for sessions from today', () => {
      const todaySessions = [createMockSession('today-1', 'Today session', 0)]
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={todaySessions}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      expect(screen.getByText('Today')).toBeInTheDocument()
    })

    it('shows Yesterday category for sessions from yesterday', () => {
      const yesterdaySessions = [createMockSession('yesterday-1', 'Yesterday session', 1)]
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={yesterdaySessions}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      expect(screen.getByText('Yesterday')).toBeInTheDocument()
    })

    it('shows Last 7 Days category for sessions 2-7 days old', () => {
      const weekSessions = [createMockSession('week-1', 'Week session', 5)]
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={weekSessions}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      expect(screen.getByText('Last 7 Days')).toBeInTheDocument()
    })

    it('shows Last 30 Days category for sessions 8-30 days old', () => {
      const monthSessions = [createMockSession('month-1', 'Month session', 15)]
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={monthSessions}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      expect(screen.getByText('Last 30 Days')).toBeInTheDocument()
    })

    it('shows Older category for sessions more than 30 days old', () => {
      const oldSessions = [createMockSession('old-1', 'Old session', 45)]
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={oldSessions}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      expect(screen.getByText('Older')).toBeInTheDocument()
    })

    it('shows multiple categories when sessions span different time periods', () => {
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      expect(screen.getByText('Today')).toBeInTheDocument()
      expect(screen.getByText('Yesterday')).toBeInTheDocument()
      expect(screen.getByText('Last 7 Days')).toBeInTheDocument()
      expect(screen.getByText('Last 30 Days')).toBeInTheDocument()
      expect(screen.getByText('Older')).toBeInTheDocument()
    })
  })

  describe('Session Display', () => {
    it('displays session names', () => {
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      expect(screen.getByText('Fix login bug')).toBeInTheDocument()
      expect(screen.getByText('Add user authentication')).toBeInTheDocument()
    })

    it('displays fallback text for sessions without names', () => {
      const sessionsWithoutNames = [
        { sessionId: 'abc12345-full-id', modifiedTime: new Date().toISOString() },
      ]
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={sessionsWithoutNames}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      expect(screen.getByText('Session abc12345...')).toBeInTheDocument()
    })

    it('displays shortened working directory paths', () => {
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      // Should show shortened paths like ".../dev/project-a" (multiple sessions have same path)
      const pathElements = screen.getAllByText('.../dev/project-a')
      expect(pathElements.length).toBeGreaterThan(0)
    })
  })

  describe('Search Functionality', () => {
    it('filters sessions by name', async () => {
      const user = userEvent.setup()
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      const searchInput = screen.getByPlaceholderText('Search sessions...')
      await user.type(searchInput, 'login')
      
      // Should show matching session
      expect(screen.getByText('Fix login bug')).toBeInTheDocument()
      
      // Should not show non-matching sessions
      expect(screen.queryByText('Refactor database layer')).not.toBeInTheDocument()
    })

    it('filters sessions by working directory', async () => {
      const user = userEvent.setup()
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      const searchInput = screen.getByPlaceholderText('Search sessions...')
      await user.type(searchInput, 'copilot-ui')
      
      // Should show session with matching path
      expect(screen.getByText('Feature: Session History')).toBeInTheDocument()
      
      // Should not show sessions with different paths
      expect(screen.queryByText('Fix login bug')).not.toBeInTheDocument()
    })

    it('filters sessions by session ID', async () => {
      const user = userEvent.setup()
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      const searchInput = screen.getByPlaceholderText('Search sessions...')
      await user.type(searchInput, 'session-today-1')
      
      expect(screen.getByText('Fix login bug')).toBeInTheDocument()
      expect(screen.queryByText('Add user authentication')).not.toBeInTheDocument()
    })

    it('search is case-insensitive', async () => {
      const user = userEvent.setup()
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      const searchInput = screen.getByPlaceholderText('Search sessions...')
      await user.type(searchInput, 'LOGIN')
      
      expect(screen.getByText('Fix login bug')).toBeInTheDocument()
    })

    it('shows no results message when search matches nothing', async () => {
      const user = userEvent.setup()
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      const searchInput = screen.getByPlaceholderText('Search sessions...')
      await user.type(searchInput, 'xyznonexistent123')
      
      expect(screen.getByText(/No sessions found matching/)).toBeInTheDocument()
      expect(screen.getByText(/xyznonexistent123/)).toBeInTheDocument()
    })

    it('shows filtered count in footer during search', async () => {
      const user = userEvent.setup()
      const sessions = createMockSessions()
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={sessions}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      const searchInput = screen.getByPlaceholderText('Search sessions...')
      await user.type(searchInput, 'project-a')
      
      // Should show "X of Y sessions" format
      expect(screen.getByText(/\d+ of \d+ sessions/)).toBeInTheDocument()
    })

    it('restores all sessions when search is cleared', async () => {
      const user = userEvent.setup()
      const sessions = createMockSessions()
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={sessions}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      const searchInput = screen.getByPlaceholderText('Search sessions...')
      
      // Type to filter
      await user.type(searchInput, 'login')
      expect(screen.queryByText('Refactor database layer')).not.toBeInTheDocument()
      
      // Clear search
      await user.clear(searchInput)
      
      // All sessions should be visible again
      expect(screen.getByText('Refactor database layer')).toBeInTheDocument()
      expect(screen.getByText(`${sessions.length} sessions in history`)).toBeInTheDocument()
    })
  })

  describe('Session Click/Resume', () => {
    it('calls onResumeSession when clicking a session', async () => {
      const user = userEvent.setup()
      const sessions = createMockSessions()
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={sessions}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      await user.click(screen.getByText('Fix login bug'))
      
      expect(mockOnResumeSession).toHaveBeenCalledTimes(1)
      expect(mockOnResumeSession).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-today-1',
          name: 'Fix login bug',
        })
      )
    })

    it('calls onClose after clicking a session', async () => {
      const user = userEvent.setup()
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      await user.click(screen.getByText('Fix login bug'))
      
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Modal Close', () => {
    it('calls onClose when clicking close button', async () => {
      const user = userEvent.setup()
      render(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      await user.click(screen.getByLabelText('Close modal'))
      
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Search Input Focus', () => {
    it('clears search query when modal opens', () => {
      const { rerender } = render(
        <SessionHistory
          isOpen={false}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      // Open modal
      rerender(
        <SessionHistory
          isOpen={true}
          onClose={mockOnClose}
          sessions={createMockSessions()}
          onResumeSession={mockOnResumeSession}
        />
      )
      
      const searchInput = screen.getByPlaceholderText('Search sessions...')
      expect(searchInput).toHaveValue('')
    })
  })
})
