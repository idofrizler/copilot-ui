// MCP Server Configuration types
export interface MCPServerConfigBase {
  tools: string[];
  type?: string;
  timeout?: number;
}

export interface MCPLocalServerConfig extends MCPServerConfigBase {
  type?: "local" | "stdio";
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface MCPRemoteServerConfig extends MCPServerConfigBase {
  type: "http" | "sse";
  url: string;
  headers?: Record<string, string>;
}

export type MCPServerConfig = MCPLocalServerConfig | MCPRemoteServerConfig;

export interface MCPConfigFile {
  mcpServers: Record<string, MCPServerConfig>;
}
