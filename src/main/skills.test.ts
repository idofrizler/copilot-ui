// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const normalizePath = (p: unknown): string => String(p).replace(/\\/g, '/');

// Create hoisted mock functions using vi.hoisted
const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFile: vi.fn(),
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
      readFile: mocks.readFile,
    },
    readFile: mocks.readFile,
  };
});

// Import module under test after mocks are set up
import { scanSkillsDirectory, getAllSkills } from './skills';

describe('skills module', () => {
  beforeEach(() => {
    mocks.existsSync.mockReset();
    mocks.readdirSync.mockReset();
    mocks.readFile.mockReset();
  });

  describe('scanSkillsDirectory', () => {
    it('should return empty when directory does not exist', async () => {
      mocks.existsSync.mockReturnValue(false);

      const result = await scanSkillsDirectory(
        '/nonexistent',
        'personal',
        'copilot',
        '~/.copilot/skills'
      );

      expect(result.skills).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('should find valid skills in directory', async () => {
      mocks.existsSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        // Directory and SKILL.md both exist
        return p === '/test/skills' || p === '/test/skills/my-skill/SKILL.md';
      });

      mocks.readdirSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        if (p === '/test/skills') {
          return [{ name: 'my-skill', isDirectory: () => true }];
        }
        if (p === '/test/skills/my-skill') {
          return [{ name: 'SKILL.md', isDirectory: () => false }];
        }
        return [];
      });

      const result = await scanSkillsDirectory(
        '/test/skills',
        'personal',
        'copilot',
        '~/.copilot/skills'
      );

      expect(result.skills.length).toBe(1);
      expect(result.skills[0].name).toBe('my-skill');
      expect(result.skills[0].description).toBe('');
      expect(result.skills[0].type).toBe('personal');
      expect(result.skills[0].source).toBe('copilot');
      expect(result.skills[0].locationLabel).toBe('~/.copilot/skills');
      expect(normalizePath(result.skills[0].path)).toBe('/test/skills/my-skill');
    });

    it('should skip directories without SKILL.md', async () => {
      mocks.existsSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        // Directory exists but no SKILL.md
        return p === '/test/skills';
      });

      mocks.readdirSync.mockReturnValue([{ name: 'not-a-skill', isDirectory: () => true }]);

      const result = await scanSkillsDirectory(
        '/test/skills',
        'personal',
        'copilot',
        '~/.copilot/skills'
      );

      expect(result.skills).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('should include skills without frontmatter', async () => {
      mocks.existsSync.mockReturnValue(true);

      mocks.readdirSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        if (p === '/test/skills') {
          return [{ name: 'plain-skill', isDirectory: () => true }];
        }
        if (p === '/test/skills/plain-skill') {
          return [{ name: 'SKILL.md', isDirectory: () => false }];
        }
        return [];
      });

      const result = await scanSkillsDirectory(
        '/test/skills',
        'project',
        'claude',
        './.claude/skills'
      );

      expect(result.skills.length).toBe(1);
      expect(result.errors).toEqual([]);
    });

    it('should skip non-directory entries', async () => {
      mocks.existsSync.mockReturnValue(true);

      mocks.readdirSync.mockReturnValue([
        { name: 'README.md', isDirectory: () => false },
        { name: '.DS_Store', isDirectory: () => false },
      ]);

      const result = await scanSkillsDirectory(
        '/test/skills',
        'personal',
        'copilot',
        '~/.copilot/skills'
      );

      expect(result.skills).toEqual([]);
    });
  });

  describe('getAllSkills', () => {
    it('should scan all personal skill directories', async () => {
      // Only personal dirs exist, no skills in them
      mocks.existsSync.mockReturnValue(false);

      const result = await getAllSkills();

      expect(result.skills).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('should scan project directories when cwd provided', async () => {
      mocks.existsSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        // Only .github/skills exists with a valid skill
        return (
          p === '/project/.github/skills' || p === '/project/.github/skills/test-skill/SKILL.md'
        );
      });

      mocks.readdirSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        if (p === '/project/.github/skills') {
          return [{ name: 'test-skill', isDirectory: () => true }];
        }
        if (p === '/project/.github/skills/test-skill') {
          return [{ name: 'SKILL.md', isDirectory: () => false }];
        }
        return [];
      });

      const result = await getAllSkills('/project');

      expect(result.skills.length).toBe(1);
      expect(result.skills[0].name).toBe('test-skill');
      expect(result.skills[0].description).toBe('');
      expect(result.skills[0].type).toBe('project');
      expect(result.skills[0].source).toBe('copilot');
      expect(result.skills[0].locationLabel).toBe('./.github/skills');
    });

    it('should combine skills from multiple directories', async () => {
      mocks.existsSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        // Personal copilot and project claude skills exist
        return (
          p === '/tmp/test-home/.copilot/skills' ||
          p === '/tmp/test-home/.copilot/skills/personal-skill/SKILL.md' ||
          p === '/project/.claude/skills' ||
          p === '/project/.claude/skills/project-skill/SKILL.md'
        );
      });

      mocks.readdirSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        if (p === '/tmp/test-home/.copilot/skills') {
          return [{ name: 'personal-skill', isDirectory: () => true }];
        }
        if (p === '/tmp/test-home/.copilot/skills/personal-skill') {
          return [{ name: 'SKILL.md', isDirectory: () => false }];
        }
        if (p === '/project/.claude/skills') {
          return [{ name: 'project-skill', isDirectory: () => true }];
        }
        if (p === '/project/.claude/skills/project-skill') {
          return [{ name: 'SKILL.md', isDirectory: () => false }];
        }
        return [];
      });

      const result = await getAllSkills('/project');

      expect(result.skills.length).toBe(2);

      const personalSkill = result.skills.find((s) => s.type === 'personal');
      expect(personalSkill?.name).toBe('personal-skill');
      expect(personalSkill?.source).toBe('copilot');
      expect(personalSkill?.locationLabel).toBe('~/.copilot/skills');

      const projectSkill = result.skills.find((s) => s.type === 'project');
      expect(projectSkill?.name).toBe('project-skill');
      expect(projectSkill?.source).toBe('claude');
      expect(projectSkill?.locationLabel).toBe('./.claude/skills');
    });

    it('should detect .agents and .claude/commands locations', async () => {
      mocks.existsSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        return (
          p === '/project/.agents/skills' ||
          p === '/project/.agents/skills/agents-skill/SKILL.md' ||
          p === '/project/.claude/commands' ||
          p === '/project/.claude/commands/legacy-skill/SKILL.md'
        );
      });

      mocks.readdirSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        if (p === '/project/.agents/skills') {
          return [{ name: 'agents-skill', isDirectory: () => true }];
        }
        if (p === '/project/.agents/skills/agents-skill') {
          return [{ name: 'SKILL.md', isDirectory: () => false }];
        }
        if (p === '/project/.claude/commands') {
          return [{ name: 'legacy-skill', isDirectory: () => true }];
        }
        if (p === '/project/.claude/commands/legacy-skill') {
          return [{ name: 'SKILL.md', isDirectory: () => false }];
        }
        return [];
      });

      const result = await getAllSkills('/project');

      const agentsSkill = result.skills.find((skill) => skill.name === 'agents-skill');
      expect(agentsSkill?.source).toBe('agents');
      expect(agentsSkill?.locationLabel).toBe('./.agents/skills');

      const commandsSkill = result.skills.find((skill) => skill.name === 'legacy-skill');
      expect(commandsSkill?.source).toBe('claude');
      expect(commandsSkill?.locationLabel).toBe('./.claude/commands');
    });

    it('should discover nested .claude skills directories', async () => {
      mocks.existsSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        return (
          p === '/project/packages/app/.claude/skills' ||
          p === '/project/packages/app/.claude/skills/nested-skill/SKILL.md'
        );
      });

      mocks.readdirSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        if (p === '/project') {
          return [{ name: 'packages', isDirectory: () => true }];
        }
        if (p === '/project/packages') {
          return [{ name: 'app', isDirectory: () => true }];
        }
        if (p === '/project/packages/app') {
          return [{ name: '.claude', isDirectory: () => true }];
        }
        if (p === '/project/packages/app/.claude/skills') {
          return [{ name: 'nested-skill', isDirectory: () => true }];
        }
        if (p === '/project/packages/app/.claude/skills/nested-skill') {
          return [{ name: 'SKILL.md', isDirectory: () => false }];
        }
        return [];
      });

      const result = await getAllSkills('/project');

      const nestedSkill = result.skills.find((skill) => skill.name === 'nested-skill');
      expect(nestedSkill?.source).toBe('claude');
      expect(nestedSkill?.locationLabel).toBe('./packages/app/.claude/skills');
    });

    it('should include custom locations from environment', async () => {
      process.env.COPILOT_AGENT_SKILLS_LOCATIONS = '/custom/skills';

      mocks.existsSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        return p === '/custom/skills' || p === '/custom/skills/custom-skill/SKILL.md';
      });

      mocks.readdirSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        if (p === '/custom/skills') {
          return [{ name: 'custom-skill', isDirectory: () => true }];
        }
        if (p === '/custom/skills/custom-skill') {
          return [{ name: 'SKILL.md', isDirectory: () => false }];
        }
        return [];
      });

      const result = await getAllSkills();

      const customSkill = result.skills.find((skill) => skill.name === 'custom-skill');
      expect(customSkill?.source).toBe('custom');
      expect(customSkill?.locationLabel).toBe('/custom/skills');
      delete process.env.COPILOT_AGENT_SKILLS_LOCATIONS;
    });
  });
});
