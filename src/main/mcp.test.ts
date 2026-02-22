// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'path';

// Create hoisted mock functions
const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
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
}));

// Mock fs/promises with hoisted mocks
vi.mock('fs/promises', () => ({
  readFile: mocks.readFile,
  writeFile: mocks.writeFile,
  mkdir: mocks.mkdir,
}));

// Mock fs with hoisted mocks
vi.mock('fs', () => ({
  existsSync: mocks.existsSync,
}));

describe('MCP Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('readMcpConfig', () => {
    it('should return empty config when file does not exist', async () => {
      mocks.existsSync.mockReturnValue(false);

      // Import after mocks are set up
      const { readMcpConfig } = await import('./main');
      const config = await readMcpConfig();

      expect(config).toEqual({ mcpServers: {} });
    });

    it('should read and parse mcp-config.json', async () => {
      const mockConfig = {
        mcpServers: {
          'test-server': {
            type: 'local',
            command: 'node',
            args: ['server.js'],
            tools: ['*'],
          },
        },
      };

      mocks.existsSync.mockReturnValue(true);
      mocks.readFile.mockResolvedValue(JSON.stringify(mockConfig));

      const { readMcpConfig } = await import('./main');
      const config = await readMcpConfig();

      expect(config).toEqual(mockConfig);
      expect(mocks.readFile).toHaveBeenCalledWith(
        join('/tmp/test-home', '.copilot', 'mcp-config.json'),
        'utf-8'
      );
    });

    it('should handle JSON parse errors gracefully', async () => {
      mocks.existsSync.mockReturnValue(true);
      mocks.readFile.mockResolvedValue('invalid json');

      const { readMcpConfig } = await import('./main');
      const config = await readMcpConfig();

      expect(config).toEqual({ mcpServers: {} });
    });
  });

  describe('readBuiltInPlugins', () => {
    it('should return empty object when config.json does not exist', async () => {
      mocks.existsSync.mockReturnValue(false);

      const { readBuiltInPlugins } = await import('./main');
      const plugins = await readBuiltInPlugins();

      expect(plugins).toEqual({});
    });

    it('should return empty object when installed_plugins is not present', async () => {
      const mockConfig = {
        last_logged_in_user: { host: 'https://github.com', login: 'test' },
      };

      mocks.existsSync.mockReturnValue(true);
      mocks.readFile.mockResolvedValue(JSON.stringify(mockConfig));

      const { readBuiltInPlugins } = await import('./main');
      const plugins = await readBuiltInPlugins();

      expect(plugins).toEqual({});
    });

    it('should skip disabled plugins', async () => {
      const mockConfig = {
        installed_plugins: [
          {
            name: 'disabled-plugin',
            enabled: false,
            cache_path: '/path/to/disabled',
          },
        ],
      };

      mocks.existsSync.mockReturnValue(true);
      mocks.readFile.mockResolvedValue(JSON.stringify(mockConfig));

      const { readBuiltInPlugins } = await import('./main');
      const plugins = await readBuiltInPlugins();

      expect(plugins).toEqual({});
    });

    it('should load enabled built-in plugins from .mcp.json', async () => {
      const mockConfig = {
        installed_plugins: [
          {
            name: 'nexus-meridian',
            marketplace: 'copilot-plugins',
            version: '1.0.0',
            enabled: true,
            cache_path: '/tmp/test-home/.copilot/installed-plugins/copilot-plugins/nexus-meridian',
          },
        ],
      };

      const mockMcpJson = {
        mcpServers: {
          'nexus-meridian': {
            command: 'python',
            args: ['C:/ws/Nexus.Meridian/MCP/NexusMeridian/server.py'],
            timeout: 1800000,
            tools: ['*'],
          },
        },
      };

      mocks.existsSync.mockImplementation((path: string) => {
        // config.json exists
        if (path === join('/tmp/test-home', '.copilot', 'config.json')) return true;
        // .mcp.json exists
        if (path.endsWith('.mcp.json')) return true;
        return false;
      });

      mocks.readFile.mockImplementation((path: string) => {
        if (path === join('/tmp/test-home', '.copilot', 'config.json')) {
          return Promise.resolve(JSON.stringify(mockConfig));
        }
        if (path.endsWith('.mcp.json')) {
          return Promise.resolve(JSON.stringify(mockMcpJson));
        }
        return Promise.reject(new Error('File not found'));
      });

      const { readBuiltInPlugins } = await import('./main');
      const plugins = await readBuiltInPlugins();

      expect(plugins).toEqual({
        'nexus-meridian': {
          command: 'python',
          args: ['C:/ws/Nexus.Meridian/MCP/NexusMeridian/server.py'],
          timeout: 1800000,
          tools: ['*'],
          builtIn: true,
        },
      });
    });

    it('should handle multiple built-in plugins', async () => {
      const mockConfig = {
        installed_plugins: [
          {
            name: 'plugin-1',
            enabled: true,
            cache_path: '/tmp/plugins/plugin-1',
          },
          {
            name: 'plugin-2',
            enabled: true,
            cache_path: '/tmp/plugins/plugin-2',
          },
          {
            name: 'plugin-3',
            enabled: false,
            cache_path: '/tmp/plugins/plugin-3',
          },
        ],
      };

      const mockMcpJson1 = {
        mcpServers: {
          'server-1': {
            command: 'node',
            args: ['server1.js'],
            tools: ['*'],
          },
        },
      };

      const mockMcpJson2 = {
        mcpServers: {
          'server-2': {
            command: 'python',
            args: ['server2.py'],
            tools: ['*'],
          },
        },
      };

      mocks.existsSync.mockImplementation((path: string) => {
        if (path === join('/tmp/test-home', '.copilot', 'config.json')) return true;
        if (path === join('/tmp/plugins/plugin-1', '.mcp.json')) return true;
        if (path === join('/tmp/plugins/plugin-2', '.mcp.json')) return true;
        return false;
      });

      mocks.readFile.mockImplementation((path: string) => {
        if (path === join('/tmp/test-home', '.copilot', 'config.json')) {
          return Promise.resolve(JSON.stringify(mockConfig));
        }
        if (path === join('/tmp/plugins/plugin-1', '.mcp.json')) {
          return Promise.resolve(JSON.stringify(mockMcpJson1));
        }
        if (path === join('/tmp/plugins/plugin-2', '.mcp.json')) {
          return Promise.resolve(JSON.stringify(mockMcpJson2));
        }
        return Promise.reject(new Error('File not found'));
      });

      const { readBuiltInPlugins } = await import('./main');
      const plugins = await readBuiltInPlugins();

      expect(plugins).toEqual({
        'plugin-1': {
          command: 'node',
          args: ['server1.js'],
          tools: ['*'],
          builtIn: true,
        },
        'plugin-2': {
          command: 'python',
          args: ['server2.py'],
          tools: ['*'],
          builtIn: true,
        },
      });
    });
  });

  describe('MCP Config Merging', () => {
    it('should merge built-in plugins with regular MCP servers', async () => {
      const mockMcpConfig = {
        mcpServers: {
          'user-server': {
            type: 'local',
            command: 'node',
            args: ['user-server.js'],
            tools: ['*'],
          },
        },
      };

      const mockConfig = {
        installed_plugins: [
          {
            name: 'nexus-meridian',
            enabled: true,
            cache_path: '/tmp/plugins/nexus-meridian',
          },
        ],
      };

      const mockMcpJson = {
        mcpServers: {
          'nexus-meridian': {
            command: 'python',
            args: ['server.py'],
            tools: ['*'],
          },
        },
      };

      mocks.existsSync.mockImplementation((path: string) => {
        if (path === join('/tmp/test-home', '.copilot', 'config.json')) return true;
        if (path === join('/tmp/test-home', '.copilot', 'mcp-config.json')) return true;
        if (path === join('/tmp/plugins/nexus-meridian', '.mcp.json')) return true;
        return false;
      });

      mocks.readFile.mockImplementation((path: string) => {
        if (path === join('/tmp/test-home', '.copilot', 'config.json')) {
          return Promise.resolve(JSON.stringify(mockConfig));
        }
        if (path === join('/tmp/test-home', '.copilot', 'mcp-config.json')) {
          return Promise.resolve(JSON.stringify(mockMcpConfig));
        }
        if (path === join('/tmp/plugins/nexus-meridian', '.mcp.json')) {
          return Promise.resolve(JSON.stringify(mockMcpJson));
        }
        return Promise.reject(new Error('File not found'));
      });

      const { getMergedMcpConfig } = await import('./main');
      const config = await getMergedMcpConfig();

      expect(config.mcpServers).toEqual({
        'nexus-meridian': {
          command: 'python',
          args: ['server.py'],
          tools: ['*'],
          builtIn: true,
        },
        'user-server': {
          type: 'local',
          command: 'node',
          args: ['user-server.js'],
          tools: ['*'],
        },
      });
    });

    it('should allow user-configured servers to override built-in plugins', async () => {
      const mockMcpConfig = {
        mcpServers: {
          'nexus-meridian': {
            type: 'local',
            command: 'python3',
            args: ['custom-server.py'],
            tools: ['tool1', 'tool2'],
          },
        },
      };

      const mockConfig = {
        installed_plugins: [
          {
            name: 'nexus-meridian',
            enabled: true,
            cache_path: '/tmp/plugins/nexus-meridian',
          },
        ],
      };

      const mockMcpJson = {
        mcpServers: {
          'nexus-meridian': {
            command: 'python',
            args: ['server.py'],
            tools: ['*'],
          },
        },
      };

      mocks.existsSync.mockImplementation((path: string) => {
        if (path === join('/tmp/test-home', '.copilot', 'config.json')) return true;
        if (path === join('/tmp/test-home', '.copilot', 'mcp-config.json')) return true;
        if (path === join('/tmp/plugins/nexus-meridian', '.mcp.json')) return true;
        return false;
      });

      mocks.readFile.mockImplementation((path: string) => {
        if (path === join('/tmp/test-home', '.copilot', 'config.json')) {
          return Promise.resolve(JSON.stringify(mockConfig));
        }
        if (path === join('/tmp/test-home', '.copilot', 'mcp-config.json')) {
          return Promise.resolve(JSON.stringify(mockMcpConfig));
        }
        if (path === join('/tmp/plugins/nexus-meridian', '.mcp.json')) {
          return Promise.resolve(JSON.stringify(mockMcpJson));
        }
        return Promise.reject(new Error('File not found'));
      });

      const { getMergedMcpConfig } = await import('./main');
      const config = await getMergedMcpConfig();

      // User config should override built-in
      expect(config.mcpServers['nexus-meridian']).toEqual({
        type: 'local',
        command: 'python3',
        args: ['custom-server.py'],
        tools: ['tool1', 'tool2'],
      });
      expect(config.mcpServers['nexus-meridian'].builtIn).toBeUndefined();
    });
  });
});
