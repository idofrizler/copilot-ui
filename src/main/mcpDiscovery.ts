/**
 * MCP Discovery System (Issue #456)
 *
 * Priority-aware MCP server configuration discovery and merge.
 * Sources are merged with descending priority: session > agent > user > repo > default
 *
 * Metadata preserved:
 * - source: which config file/layer provided this server
 * - priority: the priority level (1=session, 2=agent, 3=user, 4=repo, 5=default)
 * - effective: whether this server is active in the final merge
 * - overriddenBy: if overridden, which higher-priority source did it
 * - serverType: 'local'|'stdio'|'http'|'sse'
 * - launchMethod: 'command'|'url'
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { app } from 'electron';

// Re-export types from main.ts (will be moved to shared types file if needed)
export interface MCPServerConfigBase {
  tools: string[];
  type?: string;
  timeout?: number;
}

export interface MCPLocalServerConfig extends MCPServerConfigBase {
  type?: 'local' | 'stdio';
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface MCPRemoteServerConfig extends MCPServerConfigBase {
  type: 'http' | 'sse';
  url: string;
  headers?: Record<string, string>;
}

export type MCPServerConfig = MCPLocalServerConfig | MCPRemoteServerConfig;

export interface MCPConfigFile {
  mcpServers: Record<string, MCPServerConfig>;
}

// Discovery metadata for each server
export interface MCPServerMetadata {
  serverName: string;
  config: MCPServerConfig;
  source: string; // File path or description like "session-override"
  priority: 1 | 2 | 3 | 4 | 5; // 1=highest (session), 5=lowest (default)
  effective: boolean; // Is this the effective config after merge?
  overriddenBy?: string; // If not effective, which source overrode it
  serverType: 'local' | 'stdio' | 'http' | 'sse';
  launchMethod: 'command' | 'url';
}

// Discovery result with all servers and metadata
export interface MCPDiscoveryResult {
  effectiveServers: Record<string, MCPServerConfig>; // Final merged config
  allMetadata: MCPServerMetadata[]; // All discovered servers with metadata
  sources: {
    session?: string;
    agent?: string;
    user?: string;
    repo?: string;
    default?: string;
  };
}

// Priority levels
export enum MCPPriority {
  SESSION = 1,
  AGENT = 2,
  USER = 3,
  REPO = 4,
  DEFAULT = 5,
}

/**
 * Get the Copilot config path (respects XDG_CONFIG_HOME)
 */
function getCopilotConfigPath(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  if (xdgConfigHome) {
    return join(xdgConfigHome, '.copilot');
  }
  return join(app.getPath('home'), '.copilot');
}

/**
 * Get MCP config path for user-level config
 */
export function getMcpUserConfigPath(): string {
  return join(getCopilotConfigPath(), 'mcp-config.json');
}

/**
 * Read MCP config from a file path
 */
async function readMcpConfigFromFile(filePath: string): Promise<MCPConfigFile | null> {
  try {
    if (!existsSync(filePath)) {
      console.log(`[MCP Discovery] Config not found: ${filePath}`);
      return null;
    }
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as MCPConfigFile;

    // Default tools to ["*"] for servers that don't specify it
    for (const serverName in parsed.mcpServers) {
      const server = parsed.mcpServers[serverName];
      if (!server.tools) {
        server.tools = ['*'];
      }
    }

    console.log(
      `[MCP Discovery] Loaded ${Object.keys(parsed.mcpServers || {}).length} servers from ${filePath}`
    );
    return parsed;
  } catch (error) {
    console.error(`Failed to read MCP config from ${filePath}:`, error);
    return null;
  }
}

/**
 * Extract server metadata from config
 */
function extractServerMetadata(
  serverName: string,
  config: MCPServerConfig,
  source: string,
  priority: MCPPriority
): Omit<MCPServerMetadata, 'effective' | 'overriddenBy'> {
  // Determine server type
  let serverType: MCPServerMetadata['serverType'];
  if ('command' in config) {
    serverType = config.type === 'local' ? 'local' : 'stdio';
  } else {
    serverType = config.type as 'http' | 'sse';
  }

  // Determine launch method
  const launchMethod: MCPServerMetadata['launchMethod'] = 'command' in config ? 'command' : 'url';

  return {
    serverName,
    config,
    source,
    priority,
    serverType,
    launchMethod,
  };
}

/**
 * Discover MCP servers from all sources with priority-aware merge
 *
 * @param options Discovery options
 * @param options.sessionConfig Optional session-level MCP config override
 * @param options.agentMcpServers Optional agent-level MCP servers (from frontmatter)
 * @param options.agentSource Source description for agent config
 * @param options.projectRoot Optional project root for repo-level config
 * @param options.defaultConfig Optional default MCP config
 * @returns Discovery result with effective servers and metadata
 */
export async function discoverMcpServers(options: {
  sessionConfig?: Record<string, MCPServerConfig>;
  agentMcpServers?: Record<string, MCPServerConfig>;
  agentSource?: string;
  projectRoot?: string;
  defaultConfig?: Record<string, MCPServerConfig>;
}): Promise<MCPDiscoveryResult> {
  const allMetadata: MCPServerMetadata[] = [];
  const sources: MCPDiscoveryResult['sources'] = {};
  const serversByPriority = new Map<string, MCPServerMetadata[]>();
  console.log('[MCP Discovery] Starting discovery', {
    projectRoot: options.projectRoot,
    sessionCount: Object.keys(options.sessionConfig || {}).length,
    agentCount: Object.keys(options.agentMcpServers || {}).length,
    defaultCount: Object.keys(options.defaultConfig || {}).length,
  });

  // Helper to add servers from a source
  const addServers = (
    servers: Record<string, MCPServerConfig> | null,
    source: string,
    priority: MCPPriority,
    sourceKey: keyof MCPDiscoveryResult['sources']
  ) => {
    if (!servers) return;
    sources[sourceKey] = source;
    console.log(
      `[MCP Discovery] Applying ${Object.keys(servers).length} servers from ${sourceKey} (${source}) at priority ${priority}`
    );

    for (const [name, config] of Object.entries(servers)) {
      const metadata = {
        ...extractServerMetadata(name, config, source, priority),
        effective: false, // Will be updated in merge step
      };

      if (!serversByPriority.has(name)) {
        serversByPriority.set(name, []);
      }
      serversByPriority.get(name)!.push(metadata);
    }
  };

  // 1. Session-level config (highest priority)
  if (options.sessionConfig) {
    addServers(options.sessionConfig, 'session-override', MCPPriority.SESSION, 'session');
  }

  // 2. Agent-level config (from frontmatter)
  if (options.agentMcpServers) {
    addServers(
      options.agentMcpServers,
      options.agentSource || 'agent-frontmatter',
      MCPPriority.AGENT,
      'agent'
    );
  }

  // 3. User-level config (~/.copilot/mcp-config.json)
  const userConfigPath = getMcpUserConfigPath();
  const userConfig = await readMcpConfigFromFile(userConfigPath);
  if (userConfig) {
    addServers(userConfig.mcpServers, userConfigPath, MCPPriority.USER, 'user');
  }

  // 4. Repo-level config (.copilot/mcp-config.json in project root)
  if (options.projectRoot) {
    const repoConfigPath = join(options.projectRoot, '.copilot', 'mcp-config.json');
    const repoConfig = await readMcpConfigFromFile(repoConfigPath);
    if (repoConfig) {
      addServers(repoConfig.mcpServers, repoConfigPath, MCPPriority.REPO, 'repo');
    }
  }

  // 5. Default config (lowest priority)
  if (options.defaultConfig) {
    addServers(options.defaultConfig, 'built-in-defaults', MCPPriority.DEFAULT, 'default');
  }

  // Merge servers with priority resolution
  const effectiveServers: Record<string, MCPServerConfig> = {};

  for (const [serverName, variants] of serversByPriority.entries()) {
    // Sort by priority (ascending = higher priority first)
    variants.sort((a, b) => a.priority - b.priority);

    // The first variant (highest priority) is effective
    const effective = variants[0];
    effective.effective = true;
    effectiveServers[serverName] = effective.config;
    allMetadata.push(effective);

    // Mark overridden variants
    for (let i = 1; i < variants.length; i++) {
      const overridden = variants[i];
      overridden.effective = false;
      overridden.overriddenBy = effective.source;
      allMetadata.push(overridden);
    }
  }

  const overriddenServers = allMetadata
    .filter((metadata) => !metadata.effective)
    .map((metadata) => `${metadata.serverName}<- ${metadata.overriddenBy}`);
  console.log('[MCP Discovery] Discovery complete', {
    effectiveCount: Object.keys(effectiveServers).length,
    effectiveServers: Object.keys(effectiveServers),
    overriddenCount: overriddenServers.length,
    overriddenServers,
    sources,
  });

  return {
    effectiveServers,
    allMetadata,
    sources,
  };
}

/**
 * Get discovery result for inspection (UI/debugging)
 * Provides complete metadata about all discovered servers
 */
export async function getMcpDiscoveryMetadata(options: {
  sessionConfig?: Record<string, MCPServerConfig>;
  agentMcpServers?: Record<string, MCPServerConfig>;
  agentSource?: string;
  projectRoot?: string;
  defaultConfig?: Record<string, MCPServerConfig>;
}): Promise<MCPDiscoveryResult> {
  return discoverMcpServers(options);
}
