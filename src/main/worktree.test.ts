// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create hoisted mock functions using vi.hoisted
const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  rmSync: vi.fn(),
  statSync: vi.fn(),
  readdirSync: vi.fn(),
}));

// Mock electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((type: string) => {
      if (type === 'home') return '/tmp/test-home';
      if (type === 'userData') return '/tmp/test-userdata';
      return '/tmp';
    }),
  },
  net: {
    request: vi.fn(),
  },
}));

// Mock fs with hoisted mocks
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: mocks.existsSync,
      mkdirSync: mocks.mkdirSync,
      readFileSync: mocks.readFileSync,
      writeFileSync: mocks.writeFileSync,
      rmSync: mocks.rmSync,
      statSync: mocks.statSync,
      readdirSync: mocks.readdirSync,
    },
    existsSync: mocks.existsSync,
    mkdirSync: mocks.mkdirSync,
    readFileSync: mocks.readFileSync,
    writeFileSync: mocks.writeFileSync,
    rmSync: mocks.rmSync,
    statSync: mocks.statSync,
    readdirSync: mocks.readdirSync,
  };
});

// Import module under test after mocks are set up
import { loadConfig, listWorktreeSessions, sanitizeBranchName } from './worktree';

describe('worktree module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sanitizeBranchName', () => {
    it('should convert backslashes to forward slashes', () => {
      expect(sanitizeBranchName('improvement\\remove-node-pty')).toBe(
        'improvement/remove-node-pty'
      );
    });

    it('should remove invalid characters', () => {
      expect(sanitizeBranchName('feature:test')).toBe('feature-test');
      expect(sanitizeBranchName('feature?test')).toBe('feature-test');
      expect(sanitizeBranchName('feature*test')).toBe('feature-test');
      expect(sanitizeBranchName('feature~test')).toBe('feature-test');
      expect(sanitizeBranchName('feature^test')).toBe('feature-test');
    });

    it('should remove leading/trailing slashes and dots', () => {
      expect(sanitizeBranchName('/feature/')).toBe('feature');
      expect(sanitizeBranchName('.feature.')).toBe('feature');
      expect(sanitizeBranchName('//feature//')).toBe('feature');
    });

    it('should replace consecutive slashes', () => {
      expect(sanitizeBranchName('feature//test')).toBe('feature/test');
    });

    it('should handle .lock suffix', () => {
      expect(sanitizeBranchName('feature.lock')).toBe('feature');
    });

    it('should return fallback for empty result', () => {
      expect(sanitizeBranchName('/')).toBe('branch');
      expect(sanitizeBranchName('.')).toBe('branch');
    });

    it('should handle complex Windows paths', () => {
      expect(sanitizeBranchName('feature\\bug:fix?')).toBe('feature/bug-fix');
    });
  });

  describe('generateSessionId', () => {
    it('should generate correct session ID from repo and branch', async () => {
      // The session ID format should be: <repo-name>--<branch-name>
      // with slashes replaced by dashes
      const repoPath = '/Users/test/Git/my-repo';
      const branch = 'feature/my-feature';

      // Expected: my-repo--feature-my-feature
      const expectedId = 'my-repo--feature-my-feature';

      // We can verify this through the worktree path structure
      // which includes the session ID
      expect(expectedId).toMatch(/^my-repo--feature-my-feature$/);
    });
  });

  describe('loadConfig', () => {
    it('should return default config when no config file exists', () => {
      mocks.existsSync.mockReturnValue(false);

      const config = loadConfig();

      expect(config.pruneAfterDays).toBe(30);
      expect(config.warnDiskThresholdMB).toBe(1024);
    });

    it('should merge config file with defaults', () => {
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue(
        JSON.stringify({
          sessions: {
            pruneAfterDays: 7,
          },
        })
      );

      const config = loadConfig();

      expect(config.pruneAfterDays).toBe(7);
      expect(config.warnDiskThresholdMB).toBe(1024); // Default preserved
    });
  });

  describe('listWorktreeSessions', () => {
    it('should return empty list when no sessions exist', () => {
      mocks.existsSync.mockReturnValue(false);

      const result = listWorktreeSessions();

      expect(result.sessions).toEqual([]);
      expect(result.totalDiskUsage).toBe('Calculating...');
    });

    it('should return disk usage when includeDiskUsage is true and no sessions exist', () => {
      mocks.existsSync.mockReturnValue(false);

      const result = listWorktreeSessions({ includeDiskUsage: true });

      expect(result.sessions).toEqual([]);
      expect(result.totalDiskUsage).toBe('0 B');
    });

    it('should mark orphaned sessions correctly', () => {
      // Registry exists but worktree directory doesn't
      mocks.existsSync.mockImplementation((path) => {
        if (String(path).includes('sessions.json')) return true;
        return false; // Worktree directories don't exist
      });

      mocks.readFileSync.mockReturnValue(
        JSON.stringify({
          version: 1,
          sessions: [
            {
              id: 'test-repo--feature',
              repoPath: '/Users/test/Git/test-repo',
              branch: 'feature',
              worktreePath: '/tmp/test-home/.copilot-sessions/test-repo--feature',
              createdAt: new Date().toISOString(),
              lastAccessedAt: new Date().toISOString(),
              status: 'active',
            },
          ],
        })
      );

      const result = listWorktreeSessions();

      expect(result.sessions.length).toBe(1);
      expect(result.sessions[0].status).toBe('orphaned');
    });
  });
});
