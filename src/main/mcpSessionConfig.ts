import type { MCPDiscoveryResult, MCPServerConfig } from './mcpDiscovery';
import { mergeMcpServerEnv } from './utils/augmentedEnv';

function normalizeTools(tools: unknown): string[] {
  if (!Array.isArray(tools)) {
    return ['*'];
  }

  const normalizedTools = tools.filter((tool): tool is string => typeof tool === 'string');
  return normalizedTools.length > 0 ? normalizedTools : ['*'];
}

type McpServerConfigInput = {
  tools?: string[];
  timeout?: number;
  type?: 'local' | 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
};

export function normalizeMcpServerConfigForSession(
  serverConfig: McpServerConfigInput
): MCPServerConfig | null {
  const tools = normalizeTools((serverConfig as { tools?: unknown }).tools);
  const timeout = typeof serverConfig.timeout === 'number' ? serverConfig.timeout : undefined;

  if (typeof serverConfig.command === 'string') {
    return {
      command: serverConfig.command,
      args: Array.isArray(serverConfig.args)
        ? serverConfig.args.filter((arg): arg is string => typeof arg === 'string')
        : [],
      type:
        serverConfig.type === 'local' || serverConfig.type === 'stdio'
          ? serverConfig.type
          : 'stdio',
      ...(serverConfig.env ? { env: mergeMcpServerEnv(serverConfig.env) } : {}),
      ...(serverConfig.cwd ? { cwd: serverConfig.cwd } : {}),
      ...(timeout !== undefined ? { timeout } : {}),
      tools,
    };
  }

  if (typeof serverConfig.url === 'string') {
    return {
      type: serverConfig.type === 'sse' ? 'sse' : 'http',
      url: serverConfig.url,
      ...(serverConfig.headers ? { headers: serverConfig.headers } : {}),
      ...(timeout !== undefined ? { timeout } : {}),
      tools,
    };
  }

  return null;
}

export function resolveSessionMcpServers(
  discovery: Pick<MCPDiscoveryResult, 'effectiveServers'>
): Record<string, MCPServerConfig> | undefined {
  if (Object.keys(discovery.effectiveServers).length === 0) {
    return undefined;
  }

  const normalizedServers: Record<string, MCPServerConfig> = {};

  for (const [serverName, serverConfig] of Object.entries(discovery.effectiveServers)) {
    const normalizedConfig = normalizeMcpServerConfigForSession(serverConfig);
    if (normalizedConfig) {
      normalizedServers[serverName] = normalizedConfig;
    }
  }

  return Object.keys(normalizedServers).length > 0 ? normalizedServers : undefined;
}
