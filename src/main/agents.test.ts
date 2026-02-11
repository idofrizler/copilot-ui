// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const normalizePath = (p: unknown): string => String(p).replace(/\\/g, '/');

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((type: string) => {
      if (type === 'home') return '/tmp/test-home';
      return '/tmp';
    }),
  },
}));

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

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    default: {
      ...actual,
      readFile: mocks.readFile,
      stat: mocks.stat,
    },
    readFile: mocks.readFile,
    stat: mocks.stat,
  };
});

import { getAllAgents } from './agents';

describe('agents module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear XDG env vars to ensure tests use mocked app.getPath('home')
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_STATE_HOME;
  });

  it('should return empty when no agent files exist', async () => {
    mocks.existsSync.mockReturnValue(false);

    const result = await getAllAgents();

    expect(result.agents).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('should find personal agents in ~/.copilot/agents', async () => {
    mocks.existsSync.mockImplementation((path: string) => {
      return normalizePath(path) === '/tmp/test-home/.copilot/agents';
    });
    mocks.readdirSync.mockReturnValue([
      { name: 'alpha.agent.md', isFile: () => true, isDirectory: () => false },
    ]);
    mocks.readFile.mockResolvedValue(`---
name: alpha
description: "Alpha agent"
model: gpt-4.1
---`);

    const result = await getAllAgents();

    expect(result.agents.length).toBe(1);
    expect(result.agents[0].name).toBe('alpha');
    expect(result.agents[0].description).toBe('Alpha agent');
    expect(result.agents[0].model).toBe('gpt-4.1');
    expect(result.agents[0].type).toBe('personal');
    expect(result.agents[0].source).toBe('copilot');
  });

  it('should find project agents in .github/agents', async () => {
    mocks.existsSync.mockImplementation((path: string) => {
      return normalizePath(path) === '/project/.github/agents';
    });
    mocks.readdirSync.mockReturnValue([
      { name: 'beta.md', isFile: () => true, isDirectory: () => false },
    ]);
    mocks.readFile.mockResolvedValue(`---
name: beta
mode: gpt-4.5
---`);

    const result = await getAllAgents('/project');

    expect(result.agents.length).toBe(1);
    expect(result.agents[0].name).toBe('beta');
    expect(result.agents[0].model).toBe('gpt-4.5');
    expect(result.agents[0].type).toBe('project');
    expect(result.agents[0].source).toBe('copilot');
  });

  it('should ignore markdown files without frontmatter in agent directories', async () => {
    mocks.existsSync.mockImplementation((path: string) => {
      return normalizePath(path) === '/project/.github/agents';
    });
    mocks.readdirSync.mockReturnValue([
      { name: 'SKILLS_MAPPING.md', isFile: () => true, isDirectory: () => false },
    ]);
    mocks.readFile.mockResolvedValue('# Agent Skills Mapping');

    const result = await getAllAgents('/project');

    expect(result.agents).toEqual([]);
  });

  it('should find gemini and codex agent files', async () => {
    mocks.existsSync.mockImplementation((path: string) => {
      const normalized = normalizePath(path);
      return (
        normalized === '/tmp/test-home/.gemini/GEMINI.md' ||
        normalized === '/tmp/test-home/.codex/AGENTS.md'
      );
    });
    mocks.stat.mockResolvedValue({ isFile: () => true });
    mocks.readFile.mockImplementation((path: string) => {
      if (normalizePath(path).includes('/.gemini/')) {
        return Promise.resolve(`---
name: gemini-agent
---`);
      }
      return Promise.resolve(`---
name: codex-agent
---`);
    });

    const result = await getAllAgents();

    expect(result.agents.length).toBe(2);
    const sources = result.agents.map((agent) => agent.source).sort();
    expect(sources).toEqual(['codex', 'gemini']);
  });
});
