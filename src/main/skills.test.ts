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
import { parseSkillFrontmatter, scanSkillsDirectory, getAllSkills } from './skills';

describe('skills module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseSkillFrontmatter', () => {
    it('should parse valid frontmatter with all fields', () => {
      const content = `---
name: my-skill
description: A test skill for testing
license: MIT
---

# My Skill
Some content here.
`;
      const result = parseSkillFrontmatter(content);

      expect(result.name).toBe('my-skill');
      expect(result.description).toBe('A test skill for testing');
      expect(result.license).toBe('MIT');
    });

    it('should parse frontmatter with only required fields', () => {
      const content = `---
name: minimal-skill
description: A minimal skill
---

Content here.
`;
      const result = parseSkillFrontmatter(content);

      expect(result.name).toBe('minimal-skill');
      expect(result.description).toBe('A minimal skill');
      expect(result.license).toBeUndefined();
    });

    it('should return empty object when no frontmatter present', () => {
      const content = `# No Frontmatter
Just regular markdown.
`;
      const result = parseSkillFrontmatter(content);

      expect(result.name).toBeUndefined();
      expect(result.description).toBeUndefined();
    });

    it('should handle malformed frontmatter gracefully', () => {
      const content = `---
name: test
invalid line without colon
description: still works
---
`;
      const result = parseSkillFrontmatter(content);

      expect(result.name).toBe('test');
      expect(result.description).toBe('still works');
    });
  });

  describe('scanSkillsDirectory', () => {
    it('should return empty when directory does not exist', async () => {
      mocks.existsSync.mockReturnValue(false);

      const result = await scanSkillsDirectory('/nonexistent', 'personal', 'copilot');

      expect(result.skills).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('should find valid skills in directory', async () => {
      mocks.existsSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        // Directory and SKILL.md both exist
        return p === '/test/skills' || p === '/test/skills/my-skill/SKILL.md';
      });

      mocks.readdirSync.mockReturnValue([{ name: 'my-skill', isDirectory: () => true }]);

      mocks.readFile.mockResolvedValue(`---
name: my-skill
description: Test skill
---
Content`);

      const result = await scanSkillsDirectory('/test/skills', 'personal', 'copilot');

      expect(result.skills.length).toBe(1);
      expect(result.skills[0].name).toBe('my-skill');
      expect(result.skills[0].description).toBe('Test skill');
      expect(result.skills[0].type).toBe('personal');
      expect(result.skills[0].source).toBe('copilot');
      expect(normalizePath(result.skills[0].path)).toBe('/test/skills/my-skill');
    });

    it('should skip directories without SKILL.md', async () => {
      mocks.existsSync.mockImplementation((path: string) => {
        const p = normalizePath(path);
        // Directory exists but no SKILL.md
        return p === '/test/skills';
      });

      mocks.readdirSync.mockReturnValue([{ name: 'not-a-skill', isDirectory: () => true }]);

      const result = await scanSkillsDirectory('/test/skills', 'personal', 'copilot');

      expect(result.skills).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('should report error for skills missing name or description', async () => {
      mocks.existsSync.mockReturnValue(true);

      mocks.readdirSync.mockReturnValue([{ name: 'bad-skill', isDirectory: () => true }]);

      mocks.readFile.mockResolvedValue(`---
name: bad-skill
---
No description!`);

      const result = await scanSkillsDirectory('/test/skills', 'project', 'claude');

      expect(result.skills).toEqual([]);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('missing required name or description');
    });

    it('should skip non-directory entries', async () => {
      mocks.existsSync.mockReturnValue(true);

      mocks.readdirSync.mockReturnValue([
        { name: 'README.md', isDirectory: () => false },
        { name: '.DS_Store', isDirectory: () => false },
      ]);

      const result = await scanSkillsDirectory('/test/skills', 'personal', 'copilot');

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

      mocks.readdirSync.mockReturnValue([{ name: 'test-skill', isDirectory: () => true }]);

      mocks.readFile.mockResolvedValue(`---
name: project-skill
description: A project skill
---`);

      const result = await getAllSkills('/project');

      expect(result.skills.length).toBe(1);
      expect(result.skills[0].name).toBe('project-skill');
      expect(result.skills[0].type).toBe('project');
      expect(result.skills[0].source).toBe('copilot');
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
        if (p === '/project/.claude/skills') {
          return [{ name: 'project-skill', isDirectory: () => true }];
        }
        return [];
      });

      mocks.readFile.mockImplementation((path: string) => {
        if (path.includes('personal-skill')) {
          return Promise.resolve(`---
name: personal-copilot-skill
description: Personal copilot skill
---`);
        }
        if (path.includes('project-skill')) {
          return Promise.resolve(`---
name: project-claude-skill
description: Project claude skill
---`);
        }
        return Promise.reject(new Error('Not found'));
      });

      const result = await getAllSkills('/project');

      expect(result.skills.length).toBe(2);

      const personalSkill = result.skills.find((s) => s.type === 'personal');
      expect(personalSkill?.name).toBe('personal-copilot-skill');
      expect(personalSkill?.source).toBe('copilot');

      const projectSkill = result.skills.find((s) => s.type === 'project');
      expect(projectSkill?.name).toBe('project-claude-skill');
      expect(projectSkill?.source).toBe('claude');
    });
  });
});
