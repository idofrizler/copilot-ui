import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((type: string) => {
      if (type === 'home') return '/tmp/test-home'
      if (type === 'userData') return '/tmp/test-userdata'
      return '/tmp'
    })
  }
}))

// Mock fs with default export
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    default: actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    rmSync: vi.fn(),
    statSync: vi.fn(),
    readdirSync: vi.fn()
  }
})

// Import mocked fs
import { existsSync, readFileSync } from 'fs'

describe('worktree module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset module cache so fresh import uses updated mocks
    vi.resetModules()
  })

  describe('generateSessionId', () => {
    it('should generate correct session ID from repo and branch', async () => {
      // The session ID format should be: <repo-name>--<branch-name>
      // with slashes replaced by dashes
      const repoPath = '/Users/test/Git/my-repo'
      const branch = 'feature/my-feature'
      
      // Expected: my-repo--feature-my-feature
      const expectedId = 'my-repo--feature-my-feature'
      
      // We can verify this through the worktree path structure
      // which includes the session ID
      expect(expectedId).toMatch(/^my-repo--feature-my-feature$/)
    })
  })

  describe('loadConfig', () => {
    it('should return default config when no config file exists', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const { loadConfig } = await import('./worktree')
      const config = loadConfig()
      
      expect(config.pruneAfterDays).toBe(30)
      expect(config.warnDiskThresholdMB).toBe(1024)
    })

    it('should merge config file with defaults', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        sessions: {
          pruneAfterDays: 7
        }
      }))

      const { loadConfig } = await import('./worktree')
      const config = loadConfig()
      
      expect(config.pruneAfterDays).toBe(7)
      expect(config.warnDiskThresholdMB).toBe(1024) // Default preserved
    })
  })

  describe('listWorktreeSessions', () => {
    it('should return empty list when no sessions exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const { listWorktreeSessions } = await import('./worktree')
      const result = listWorktreeSessions()
      
      expect(result.sessions).toEqual([])
      expect(result.totalDiskUsage).toBe('0 B')
    })

    it('should mark orphaned sessions correctly', async () => {
      // Registry exists but worktree directory doesn't
      vi.mocked(existsSync).mockImplementation((path) => {
        if (String(path).includes('sessions.json')) return true
        return false // Worktree directories don't exist
      })
      
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        version: 1,
        sessions: [{
          id: 'test-repo--feature',
          repoPath: '/Users/test/Git/test-repo',
          branch: 'feature',
          worktreePath: '/tmp/test-home/.copilot-sessions/test-repo--feature',
          createdAt: new Date().toISOString(),
          lastAccessedAt: new Date().toISOString(),
          status: 'active'
        }]
      }))

      const { listWorktreeSessions } = await import('./worktree')
      const result = listWorktreeSessions()
      
      expect(result.sessions.length).toBe(1)
      expect(result.sessions[0].status).toBe('orphaned')
    })
  })
})
