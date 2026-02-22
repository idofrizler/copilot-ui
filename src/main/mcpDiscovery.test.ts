// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MCPServerConfig } from './mcpDiscovery';

const normalizePath = (p: unknown): string => String(p).replace(/\\/g, '/');

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFile: vi.fn(),
  getPath: vi.fn(() => '/tmp/test-home'),
}));

vi.mock('electron', () => ({
  app: {
    getPath: mocks.getPath,
  },
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: mocks.existsSync,
    },
    existsSync: mocks.existsSync,
  };
});

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

import {
  discoverMcpServers,
  getMcpDiscoveryMetadata,
  getMcpUserConfigPath,
  MCPPriority,
} from './mcpDiscovery';

describe('MCP Discovery System (Issue #456)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no files exist
    mocks.existsSync.mockReturnValue(false);
  });

  describe('getMcpUserConfigPath', () => {
    it('returns default path when XDG_CONFIG_HOME is not set', () => {
      delete process.env.XDG_CONFIG_HOME;
      const path = getMcpUserConfigPath();
      expect(normalizePath(path)).toBe('/tmp/test-home/.copilot/mcp-config.json');
    });

    it('respects XDG_CONFIG_HOME environment variable', () => {
      process.env.XDG_CONFIG_HOME = '/custom/config';
      const path = getMcpUserConfigPath();
      expect(normalizePath(path)).toBe('/custom/config/.copilot/mcp-config.json');
      delete process.env.XDG_CONFIG_HOME;
    });
  });

  describe('discoverMcpServers', () => {
    it('returns empty result when no configs exist', async () => {
      const result = await discoverMcpServers({});

      expect(result.effectiveServers).toEqual({});
      expect(result.allMetadata).toEqual([]);
      expect(result.sources).toEqual({});
    });

    it('loads user-level config', async () => {
      const userConfig = {
        mcpServers: {
          'github-mcp': {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            tools: ['*'],
          },
        },
      };

      mocks.existsSync.mockImplementation((path: string) => {
        return normalizePath(path).includes('/.copilot/mcp-config.json');
      });

      mocks.readFile.mockResolvedValue(JSON.stringify(userConfig));

      const result = await discoverMcpServers({});

      expect(result.effectiveServers).toHaveProperty('github-mcp');
      expect(result.allMetadata).toHaveLength(1);
      expect(result.allMetadata[0].priority).toBe(MCPPriority.USER);
      expect(result.allMetadata[0].effective).toBe(true);
      expect(result.allMetadata[0].serverType).toBe('stdio');
      expect(result.allMetadata[0].launchMethod).toBe('command');
    });

    it('session config overrides user config (priority)', async () => {
      const userConfig = {
        mcpServers: {
          'test-server': {
            command: 'user-command',
            args: [],
            tools: ['*'],
          },
        },
      };

      const sessionConfig: Record<string, MCPServerConfig> = {
        'test-server': {
          command: 'session-command',
          args: [],
          tools: ['*'],
        },
      };

      mocks.existsSync.mockReturnValue(true);
      mocks.readFile.mockResolvedValue(JSON.stringify(userConfig));

      const result = await discoverMcpServers({ sessionConfig });

      expect(result.effectiveServers['test-server']).toEqual(sessionConfig['test-server']);
      expect(result.allMetadata).toHaveLength(2);

      const effective = result.allMetadata.find((m) => m.effective);
      const overridden = result.allMetadata.find((m) => !m.effective);

      expect(effective?.priority).toBe(MCPPriority.SESSION);
      expect(effective?.source).toBe('session-override');
      expect(overridden?.priority).toBe(MCPPriority.USER);
      expect(overridden?.overriddenBy).toBe('session-override');
    });

    it('agent config overrides user but not session (priority)', async () => {
      const userConfig = {
        mcpServers: {
          'test-server': {
            command: 'user-command',
            args: [],
            tools: ['*'],
          },
        },
      };

      const agentMcpServers: Record<string, MCPServerConfig> = {
        'test-server': {
          command: 'agent-command',
          args: [],
          tools: ['*'],
        },
      };

      mocks.existsSync.mockReturnValue(true);
      mocks.readFile.mockResolvedValue(JSON.stringify(userConfig));

      const result = await discoverMcpServers({
        agentMcpServers,
        agentSource: 'test-agent.md',
      });

      expect(result.effectiveServers['test-server']).toEqual(agentMcpServers['test-server']);
      expect(result.allMetadata).toHaveLength(2);

      const effective = result.allMetadata.find((m) => m.effective);
      expect(effective?.priority).toBe(MCPPriority.AGENT);
      expect(effective?.source).toBe('test-agent.md');
    });

    it('handles full priority chain: session > agent > user > repo > default', async () => {
      const defaultConfig: Record<string, MCPServerConfig> = {
        'default-server': {
          command: 'default-cmd',
          args: [],
          tools: ['*'],
        },
      };

      const repoConfig = {
        mcpServers: {
          'default-server': {
            command: 'repo-cmd',
            args: [],
            tools: ['*'],
          },
        },
      };

      const userConfig = {
        mcpServers: {
          'default-server': {
            command: 'user-cmd',
            args: [],
            tools: ['*'],
          },
        },
      };

      const agentMcpServers: Record<string, MCPServerConfig> = {
        'default-server': {
          command: 'agent-cmd',
          args: [],
          tools: ['*'],
        },
      };

      const sessionConfig: Record<string, MCPServerConfig> = {
        'default-server': {
          command: 'session-cmd',
          args: [],
          tools: ['*'],
        },
      };

      mocks.existsSync.mockReturnValue(true);
      mocks.readFile.mockImplementation((path: string) => {
        if (normalizePath(path).includes('test-project/.copilot/mcp-config.json')) {
          return Promise.resolve(JSON.stringify(repoConfig));
        }
        return Promise.resolve(JSON.stringify(userConfig));
      });

      const result = await discoverMcpServers({
        sessionConfig,
        agentMcpServers,
        agentSource: 'agent.md',
        projectRoot: '/test-project',
        defaultConfig,
      });

      // Session should win
      expect(result.effectiveServers['default-server'].command).toBe('session-cmd');

      // All 5 variants should exist in metadata
      expect(result.allMetadata).toHaveLength(5);

      const priorities = result.allMetadata.map((m) => ({
        priority: m.priority,
        effective: m.effective,
        command: m.config.command,
      }));

      // Verify priority order exists
      expect(priorities).toContainEqual({
        priority: MCPPriority.SESSION,
        effective: true,
        command: 'session-cmd',
      });
      expect(priorities).toContainEqual({
        priority: MCPPriority.AGENT,
        effective: false,
        command: 'agent-cmd',
      });
      expect(priorities).toContainEqual({
        priority: MCPPriority.USER,
        effective: false,
        command: 'user-cmd',
      });
      expect(priorities).toContainEqual({
        priority: MCPPriority.REPO,
        effective: false,
        command: 'repo-cmd',
      });
      expect(priorities).toContainEqual({
        priority: MCPPriority.DEFAULT,
        effective: false,
        command: 'default-cmd',
      });
    });

    it('correctly identifies server types (local/http/sse)', async () => {
      const config: Record<string, MCPServerConfig> = {
        'local-server': {
          type: 'local',
          command: 'test',
          args: [],
          tools: ['*'],
        },
        'stdio-server': {
          command: 'test',
          args: [],
          tools: ['*'],
        },
        'http-server': {
          type: 'http',
          url: 'http://localhost:8080',
          tools: ['*'],
        },
        'sse-server': {
          type: 'sse',
          url: 'http://localhost:8081',
          tools: ['*'],
        },
      };

      const result = await discoverMcpServers({ sessionConfig: config });

      const local = result.allMetadata.find((m) => m.serverName === 'local-server');
      const stdio = result.allMetadata.find((m) => m.serverName === 'stdio-server');
      const http = result.allMetadata.find((m) => m.serverName === 'http-server');
      const sse = result.allMetadata.find((m) => m.serverName === 'sse-server');

      expect(local?.serverType).toBe('local');
      expect(local?.launchMethod).toBe('command');

      expect(stdio?.serverType).toBe('stdio');
      expect(stdio?.launchMethod).toBe('command');

      expect(http?.serverType).toBe('http');
      expect(http?.launchMethod).toBe('url');

      expect(sse?.serverType).toBe('sse');
      expect(sse?.launchMethod).toBe('url');
    });

    it('defaults tools to ["*"] when not specified', async () => {
      const userConfig = {
        mcpServers: {
          'no-tools-server': {
            command: 'test',
            args: [],
            // No tools specified
          },
        },
      };

      mocks.existsSync.mockReturnValue(true);
      mocks.readFile.mockResolvedValue(JSON.stringify(userConfig));

      const result = await discoverMcpServers({});

      expect(result.effectiveServers['no-tools-server'].tools).toEqual(['*']);
    });

    it('preserves metadata sources correctly', async () => {
      const sessionConfig: Record<string, MCPServerConfig> = {
        'session-server': {
          command: 'test',
          args: [],
          tools: ['*'],
        },
      };

      const result = await discoverMcpServers({
        sessionConfig,
        agentMcpServers: {},
        projectRoot: '/test',
      });

      expect(result.sources).toHaveProperty('session');
      expect(result.sources.session).toBe('session-override');
    });
  });

  describe('getMcpDiscoveryMetadata', () => {
    it('returns same result as discoverMcpServers', async () => {
      const config: Record<string, MCPServerConfig> = {
        'test-server': {
          command: 'test',
          args: [],
          tools: ['*'],
        },
      };

      const discoveryResult = await discoverMcpServers({ sessionConfig: config });
      const metadataResult = await getMcpDiscoveryMetadata({ sessionConfig: config });

      expect(metadataResult).toEqual(discoveryResult);
    });
  });
});
