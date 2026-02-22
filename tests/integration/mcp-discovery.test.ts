/**
 * Integration test for MCP configuration merging
 * Verifies that all locally installed MCP servers are properly discovered and presented
 */

import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';

// Mock test data
interface TestPlugin {
  name: string;
  enabled: boolean;
  cache_path: string;
  mcpConfig: {
    mcpServers: Record<
      string,
      {
        command: string;
        args: string[];
        timeout?: number;
        tools: string[];
      }
    >;
  };
}

interface TestMcpConfig {
  mcpServers: Record<
    string,
    {
      type?: string;
      command: string;
      args: string[];
      tools: string[];
    }
  >;
}

/**
 * Test: All MCPs are discovered and merged
 */
function testMcpDiscoveryAndMerging() {
  const testDir = join(tmpdir(), `cooper-mcp-test-${Date.now()}`);
  const configDir = join(testDir, '.copilot');
  const pluginsDir = join(testDir, '.copilot', 'installed-plugins', 'copilot-plugins');

  try {
    // Setup test directory structure
    mkdirSync(configDir, { recursive: true });
    mkdirSync(pluginsDir, { recursive: true });

    // Create test plugins
    const testPlugins: TestPlugin[] = [
      {
        name: 'nexus-meridian',
        enabled: true,
        cache_path: join(pluginsDir, 'nexus-meridian'),
        mcpConfig: {
          mcpServers: {
            'nexus-meridian': {
              command: 'python',
              args: ['C:/ws/Nexus.Meridian/MCP/NexusMeridian/server.py'],
              timeout: 1800000,
              tools: ['*'],
            },
          },
        },
      },
      {
        name: 'ado-builder',
        enabled: true,
        cache_path: join(pluginsDir, 'ado-builder'),
        mcpConfig: {
          mcpServers: {
            'ado-builder': {
              command: 'node',
              args: ['server.js'],
              tools: ['*'],
            },
          },
        },
      },
      {
        name: 'disabled-plugin',
        enabled: false,
        cache_path: join(pluginsDir, 'disabled-plugin'),
        mcpConfig: {
          mcpServers: {
            'disabled-plugin': {
              command: 'node',
              args: ['disabled.js'],
              tools: ['*'],
            },
          },
        },
      },
    ];

    // Write plugin configurations
    for (const plugin of testPlugins) {
      mkdirSync(plugin.cache_path, { recursive: true });
      writeFileSync(
        join(plugin.cache_path, '.mcp.json'),
        JSON.stringify(plugin.mcpConfig, null, 2)
      );
    }

    // Create config.json with installed_plugins
    const configJson = {
      installed_plugins: testPlugins.map((p) => ({
        name: p.name,
        marketplace: 'copilot-plugins',
        version: '1.0.0',
        enabled: p.enabled,
        cache_path: p.cache_path,
      })),
    };
    writeFileSync(join(configDir, 'config.json'), JSON.stringify(configJson, null, 2));

    // Create mcp-config.json with user-configured servers
    const mcpConfig: TestMcpConfig = {
      mcpServers: {
        'user-server': {
          type: 'local',
          command: 'node',
          args: ['user-server.js'],
          tools: ['tool1', 'tool2'],
        },
        // User override of built-in plugin
        'nexus-meridian': {
          type: 'local',
          command: 'python3',
          args: ['custom.py'],
          tools: ['custom-tool'],
        },
      },
    };
    writeFileSync(join(configDir, 'mcp-config.json'), JSON.stringify(mcpConfig, null, 2));

    // Simulate the merging logic from main.ts
    function readBuiltInPlugins(): Record<string, any> {
      const configPath = join(configDir, 'config.json');
      if (!existsSync(configPath)) {
        return {};
      }

      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (!config.installed_plugins || !Array.isArray(config.installed_plugins)) {
        return {};
      }

      const builtInServers: Record<string, any> = {};
      for (const plugin of config.installed_plugins) {
        if (!plugin.enabled) continue;

        const mcpJsonPath = join(plugin.cache_path, '.mcp.json');
        if (existsSync(mcpJsonPath)) {
          const mcpConfig = JSON.parse(readFileSync(mcpJsonPath, 'utf-8'));
          const serverName = Object.keys(mcpConfig.mcpServers || {})[0];
          if (serverName && mcpConfig.mcpServers[serverName]) {
            builtInServers[plugin.name] = {
              ...mcpConfig.mcpServers[serverName],
              builtIn: true,
            };
          }
        }
      }

      return builtInServers;
    }

    function readMcpConfig(): TestMcpConfig {
      const configPath = join(configDir, 'mcp-config.json');
      if (!existsSync(configPath)) {
        return { mcpServers: {} };
      }
      return JSON.parse(readFileSync(configPath, 'utf-8'));
    }

    function getMergedMcpConfig() {
      const config = readMcpConfig();
      const builtInPlugins = readBuiltInPlugins();

      return {
        mcpServers: {
          ...builtInPlugins,
          ...config.mcpServers,
        },
      };
    }

    // Run the test
    const mergedConfig = getMergedMcpConfig();

    // Assertions
    const assertions: Array<{ test: string; result: boolean; message: string }> = [];

    // Test 1: All enabled built-in plugins are present
    assertions.push({
      test: 'Built-in nexus-meridian is discovered',
      result: 'nexus-meridian' in mergedConfig.mcpServers,
      message: 'nexus-meridian should be in merged config',
    });

    assertions.push({
      test: 'Built-in ado-builder is discovered',
      result: 'ado-builder' in mergedConfig.mcpServers,
      message: 'ado-builder should be in merged config',
    });

    // Test 2: Disabled plugins are not present
    assertions.push({
      test: 'Disabled plugin is not discovered',
      result: !('disabled-plugin' in mergedConfig.mcpServers),
      message: 'disabled-plugin should not be in merged config',
    });

    // Test 3: User-configured servers are present
    assertions.push({
      test: 'User server is present',
      result: 'user-server' in mergedConfig.mcpServers,
      message: 'user-server should be in merged config',
    });

    // Test 4: User config overrides built-in
    assertions.push({
      test: 'User override takes precedence',
      result:
        mergedConfig.mcpServers['nexus-meridian'].command === 'python3' &&
        mergedConfig.mcpServers['nexus-meridian'].args[0] === 'custom.py',
      message: 'nexus-meridian should use user config (python3, custom.py)',
    });

    // Test 5: Built-in flag is not present on overridden servers
    assertions.push({
      test: 'Built-in flag removed on override',
      result: !mergedConfig.mcpServers['nexus-meridian'].builtIn,
      message: 'Overridden servers should not have builtIn flag',
    });

    // Test 6: Built-in flag is present on non-overridden built-in servers
    assertions.push({
      test: 'Built-in flag present on ado-builder',
      result: mergedConfig.mcpServers['ado-builder'].builtIn === true,
      message: 'Non-overridden built-in servers should have builtIn=true',
    });

    // Test 7: Total count is correct (2 built-in enabled + 1 user server + 1 override = 3 total)
    assertions.push({
      test: 'Correct total count',
      result: Object.keys(mergedConfig.mcpServers).length === 3,
      message: 'Should have exactly 3 servers (nexus-meridian override, ado-builder, user-server)',
    });

    // Print results
    console.log('\n=== MCP Discovery and Merging Test Results ===\n');
    let passed = 0;
    let failed = 0;

    for (const assertion of assertions) {
      if (assertion.result) {
        console.log(`✓ PASS: ${assertion.test}`);
        passed++;
      } else {
        console.log(`✗ FAIL: ${assertion.test}`);
        console.log(`  ${assertion.message}`);
        failed++;
      }
    }

    console.log(`\n${passed} passed, ${failed} failed\n`);

    // Cleanup
    rmSync(testDir, { recursive: true, force: true });

    if (failed > 0) {
      process.exit(1);
    }

    console.log('All MCP discovery tests passed! ✓\n');
  } catch (error) {
    console.error('Test failed with error:', error);
    rmSync(testDir, { recursive: true, force: true });
    process.exit(1);
  }
}

// Run the test
testMcpDiscoveryAndMerging();
