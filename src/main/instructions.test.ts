// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const normalizePath = (p: unknown): string => String(p).replace(/\\/g, '/');

// Create hoisted mock functions using vi.hoisted
const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  stat: vi.fn(),
  execAsync: vi.fn(),
}));

// Mock electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((type: string) => {
      if (type === 'home') return '/tmp/test-home';
      return '/tmp';
    }),
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
      readdirSync: mocks.readdirSync,
    },
    existsSync: mocks.existsSync,
    readdirSync: mocks.readdirSync,
  };
});

// Mock fs/promises
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    default: {
      ...actual,
      stat: mocks.stat,
    },
    stat: mocks.stat,
  };
});

// Mock child_process for getGitRoot
vi.mock('child_process', () => ({
  exec: (
    cmd: string,
    _opts: unknown,
    callback: (err: Error | null, result: { stdout: string; stderr: string }) => void
  ) => {
    if (cmd === 'git rev-parse --show-toplevel') {
      const result = mocks.execAsync();
      if (result instanceof Error) {
        callback(result, { stdout: '', stderr: '' });
      } else {
        callback(null, { stdout: result, stderr: '' });
      }
    }
  },
}));

// Import module under test after mocks are set up
import { getAllInstructions, getGitRoot } from './instructions';

describe('instructions module', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    // Clear XDG env vars to ensure tests use mocked app.getPath('home')
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_STATE_HOME;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getGitRoot', () => {
    it('should return git root when in a git repository', async () => {
      mocks.execAsync.mockReturnValue('/repo/root\n');

      const result = await getGitRoot('/repo/root/subdir');

      expect(result).toBe('/repo/root');
    });

    it('should return null when not in a git repository', async () => {
      mocks.execAsync.mockReturnValue(new Error('not a git repository'));

      const result = await getGitRoot('/not/a/repo');

      expect(result).toBeNull();
    });
  });

  describe('getAllInstructions', () => {
    it('should return empty when no instruction files exist', async () => {
      mocks.existsSync.mockReturnValue(false);

      const result = await getAllInstructions();

      expect(result.instructions).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('should find personal copilot-instructions.md in ~/.copilot/', async () => {
      mocks.existsSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        return p === '/tmp/test-home/.copilot/copilot-instructions.md';
      });
      mocks.stat.mockResolvedValue({ isFile: () => true });

      const result = await getAllInstructions();

      expect(result.instructions.length).toBe(1);
      expect(result.instructions[0].name).toBe('copilot-instructions.md');
      expect(result.instructions[0].type).toBe('personal');
      expect(result.instructions[0].scope).toBe('repository');
      expect(normalizePath(result.instructions[0].path)).toContain(
        '.copilot/copilot-instructions.md'
      );
    });

    it('should find project copilot-instructions.md', async () => {
      mocks.existsSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        return p === '/project/.github/copilot-instructions.md';
      });
      mocks.stat.mockResolvedValue({ isFile: () => true });

      const result = await getAllInstructions('/project');

      expect(result.instructions.length).toBe(1);
      expect(result.instructions[0].name).toBe('copilot-instructions.md');
      expect(result.instructions[0].type).toBe('project');
      expect(result.instructions[0].scope).toBe('repository');
    });

    it('should find path-specific instruction files recursively', async () => {
      mocks.existsSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        return (
          p === '/project/.github/instructions' || p === '/project/.github/instructions/subdir'
        );
      });
      mocks.readdirSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        if (p === '/project/.github/instructions') {
          return [
            { name: 'react.instructions.md', isFile: () => true, isDirectory: () => false },
            { name: 'subdir', isFile: () => false, isDirectory: () => true },
            { name: 'README.md', isFile: () => true, isDirectory: () => false },
          ];
        }
        if (p === '/project/.github/instructions/subdir') {
          return [{ name: 'nested.instructions.md', isFile: () => true, isDirectory: () => false }];
        }
        return [];
      });

      const result = await getAllInstructions('/project');

      expect(result.instructions.length).toBe(2);
      expect(result.instructions.map((i) => normalizePath(i.name)).sort()).toEqual([
        'react.instructions.md',
        'subdir/nested.instructions.md',
      ]);
      expect(result.instructions.every((i) => i.scope === 'path-specific')).toBe(true);
    });

    it('should find AGENTS.md at repo root as primary', async () => {
      mocks.existsSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        return p === '/project/AGENTS.md';
      });
      mocks.stat.mockResolvedValue({ isFile: () => true });

      const result = await getAllInstructions('/project');

      expect(result.instructions.length).toBe(1);
      expect(result.instructions[0].name).toBe('AGENTS.md');
      expect(result.instructions[0].type).toBe('agent');
      expect(result.instructions[0].scope).toBe('agent-primary');
    });

    it('should find CLAUDE.md and GEMINI.md at repo root', async () => {
      mocks.existsSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        return p === '/project/CLAUDE.md' || p === '/project/GEMINI.md';
      });
      mocks.stat.mockResolvedValue({ isFile: () => true });

      const result = await getAllInstructions('/project');

      expect(result.instructions.length).toBe(2);
      expect(result.instructions.map((i) => i.name).sort()).toEqual(['CLAUDE.md', 'GEMINI.md']);
      expect(result.instructions.every((i) => i.type === 'agent')).toBe(true);
      expect(result.instructions.every((i) => i.scope === 'agent-primary')).toBe(true);
    });

    it('should find AGENTS.md in cwd as additional when cwd differs from root', async () => {
      mocks.existsSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        return p === '/project/subdir/AGENTS.md';
      });
      mocks.stat.mockResolvedValue({ isFile: () => true });

      const result = await getAllInstructions('/project', '/project/subdir');

      expect(result.instructions.length).toBe(1);
      expect(result.instructions[0].name).toBe('AGENTS.md');
      expect(result.instructions[0].type).toBe('agent');
      expect(result.instructions[0].scope).toBe('agent-additional');
    });

    it('should find instructions in COPILOT_CUSTOM_INSTRUCTIONS_DIRS', async () => {
      process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS = '/custom/dir1,/custom/dir2';

      mocks.existsSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        return p === '/custom/dir1/AGENTS.md' || p === '/custom/dir2/.github/instructions';
      });
      mocks.stat.mockResolvedValue({ isFile: () => true });
      mocks.readdirSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        if (p === '/custom/dir2/.github/instructions') {
          return [{ name: 'custom.instructions.md', isFile: () => true, isDirectory: () => false }];
        }
        return [];
      });

      const result = await getAllInstructions();

      expect(result.instructions.length).toBe(2);

      const agentInstr = result.instructions.find((i) => i.name === 'AGENTS.md');
      expect(agentInstr?.type).toBe('custom-dir');
      expect(agentInstr?.scope).toBe('agent-additional');

      const pathInstr = result.instructions.find((i) => i.name === 'custom.instructions.md');
      expect(pathInstr?.type).toBe('custom-dir');
      expect(pathInstr?.scope).toBe('path-specific');
    });

    it('should combine all instruction sources', async () => {
      mocks.existsSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        return (
          p === '/tmp/test-home/.copilot/copilot-instructions.md' ||
          p === '/project/.github/copilot-instructions.md' ||
          p === '/project/.github/instructions' ||
          p === '/project/AGENTS.md'
        );
      });
      mocks.stat.mockResolvedValue({ isFile: () => true });
      mocks.readdirSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        if (p === '/project/.github/instructions') {
          return [{ name: 'api.instructions.md', isFile: () => true, isDirectory: () => false }];
        }
        return [];
      });

      const result = await getAllInstructions('/project');

      expect(result.instructions.length).toBe(4);

      const personal = result.instructions.find((i) => i.type === 'personal');
      expect(personal?.name).toBe('copilot-instructions.md');

      const projectWide = result.instructions.find(
        (i) => i.type === 'project' && i.scope === 'repository'
      );
      expect(projectWide?.name).toBe('copilot-instructions.md');

      const pathSpecific = result.instructions.find((i) => i.scope === 'path-specific');
      expect(pathSpecific?.name).toBe('api.instructions.md');

      const agent = result.instructions.find((i) => i.type === 'agent');
      expect(agent?.name).toBe('AGENTS.md');
    });

    it('should deduplicate instructions with same path', async () => {
      // Simulate same file found via multiple mechanisms
      mocks.existsSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        return p === '/project/AGENTS.md';
      });
      mocks.stat.mockResolvedValue({ isFile: () => true });

      // projectRoot and cwd are the same - should not duplicate
      const result = await getAllInstructions('/project', '/project');

      expect(result.instructions.length).toBe(1);
    });

    it('should handle errors gracefully', async () => {
      mocks.existsSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        if (p === '/tmp/test-home/.copilot/copilot-instructions.md') return true;
        return false;
      });
      mocks.stat.mockRejectedValue(new Error('Permission denied'));

      const result = await getAllInstructions();

      expect(result.instructions).toEqual([]);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Permission denied');
    });
  });
});
