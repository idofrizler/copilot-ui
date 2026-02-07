// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const normalizePath = (p: unknown): string => String(p).replace(/\\/g, '/');

// Create hoisted mock functions using vi.hoisted
const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  stat: vi.fn(),
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

// Import module under test after mocks are set up
import { getAllInstructions } from './instructions';

describe('instructions module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllInstructions', () => {
    it('should return empty when no instruction files exist', async () => {
      mocks.existsSync.mockReturnValue(false);

      const result = await getAllInstructions();

      expect(result.instructions).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('should find global copilot-instructions.md', async () => {
      mocks.existsSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        return p === '/tmp/test-home/.github/copilot-instructions.md';
      });
      mocks.stat.mockResolvedValue({ isFile: () => true });

      const result = await getAllInstructions();

      expect(result.instructions.length).toBe(1);
      expect(result.instructions[0].name).toBe('copilot-instructions.md');
      expect(result.instructions[0].type).toBe('personal');
      expect(result.instructions[0].scope).toBe('repository');
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

    it('should find path-specific instruction files', async () => {
      mocks.existsSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        return p === '/project/.github/instructions';
      });
      mocks.readdirSync.mockReturnValue([
        { name: 'react.instructions.md', isFile: () => true },
        { name: 'testing.instructions.md', isFile: () => true },
        { name: 'README.md', isFile: () => true },
      ]);

      const result = await getAllInstructions('/project');

      expect(result.instructions.length).toBe(2);
      expect(result.instructions[0].name).toBe('react.instructions.md');
      expect(result.instructions[0].scope).toBe('path-specific');
      expect(result.instructions[1].name).toBe('testing.instructions.md');
    });

    it('should combine global and project instructions', async () => {
      mocks.existsSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        return (
          p === '/tmp/test-home/.github/copilot-instructions.md' ||
          p === '/project/.github/copilot-instructions.md' ||
          p === '/project/.github/instructions'
        );
      });
      mocks.stat.mockResolvedValue({ isFile: () => true });
      mocks.readdirSync.mockReturnValue([{ name: 'api.instructions.md', isFile: () => true }]);

      const result = await getAllInstructions('/project');

      expect(result.instructions.length).toBe(3);

      const global = result.instructions.find((i) => i.type === 'personal');
      expect(global?.name).toBe('copilot-instructions.md');

      const projectWide = result.instructions.find(
        (i) => i.type === 'project' && i.scope === 'repository'
      );
      expect(projectWide?.name).toBe('copilot-instructions.md');

      const pathSpecific = result.instructions.find((i) => i.scope === 'path-specific');
      expect(pathSpecific?.name).toBe('api.instructions.md');
    });

    it('should handle errors gracefully', async () => {
      mocks.existsSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        if (p === '/tmp/test-home/.github/copilot-instructions.md') return true;
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
