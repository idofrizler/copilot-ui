import { existsSync, readdirSync } from 'fs';
import { readFile, stat } from 'fs/promises';
import { basename, join, normalize } from 'path';
import { app } from 'electron';
import { load as parseYaml } from 'js-yaml';

export interface Agent {
  name: string;
  description?: string;
  model?: string;
  path: string;
  type: 'personal' | 'project';
  source: 'copilot' | 'claude' | 'opencode' | 'gemini' | 'codex';
}

export interface AgentsResult {
  agents: Agent[];
  errors: string[];
}

export interface AgentMcpServer {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  type?: 'local' | 'stdio' | 'http' | 'sse';
  tools?: string[];
  timeout?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const toStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    return undefined;
  }
  return value;
};

const toStringMap = (value: unknown): Record<string, string> | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const entries = Object.entries(value);
  if (!entries.every(([, entryValue]) => typeof entryValue === 'string')) {
    return undefined;
  }
  return Object.fromEntries(entries) as Record<string, string>;
};

const parseMcpServers = (value: unknown): Record<string, AgentMcpServer> | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const mcpServers: Record<string, AgentMcpServer> = {};
  for (const [serverName, serverValue] of Object.entries(value)) {
    if (!isRecord(serverValue)) {
      continue;
    }

    const typeValue = serverValue.type;
    const type =
      typeValue === 'local' || typeValue === 'stdio' || typeValue === 'http' || typeValue === 'sse'
        ? typeValue
        : undefined;

    const server: AgentMcpServer = {
      command: typeof serverValue.command === 'string' ? serverValue.command : undefined,
      args: toStringArray(serverValue.args),
      env: toStringMap(serverValue.env),
      cwd: typeof serverValue.cwd === 'string' ? serverValue.cwd : undefined,
      url: typeof serverValue.url === 'string' ? serverValue.url : undefined,
      headers: toStringMap(serverValue.headers),
      type,
      tools: toStringArray(serverValue.tools),
      timeout: typeof serverValue.timeout === 'number' ? serverValue.timeout : undefined,
    };

    if (server.command || server.url) {
      mcpServers[serverName] = server;
    }
  }

  return Object.keys(mcpServers).length > 0 ? mcpServers : undefined;
};

export function parseAgentFrontmatter(content: string): {
  name?: string;
  description?: string;
  model?: string;
  mcpServers?: Record<string, AgentMcpServer>;
  hasFrontmatter: boolean;
} {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return { hasFrontmatter: false };
  }

  const result: {
    name?: string;
    description?: string;
    model?: string;
    mcpServers?: Record<string, AgentMcpServer>;
    hasFrontmatter: boolean;
  } = {
    hasFrontmatter: true,
  };

  let parsedFrontmatter: Record<string, unknown> = {};
  try {
    const parsed = parseYaml(frontmatterMatch[1]);
    if (isRecord(parsed)) {
      parsedFrontmatter = parsed;
    }
  } catch {
    return result;
  }

  if (typeof parsedFrontmatter.name === 'string') {
    result.name = parsedFrontmatter.name;
  }
  if (typeof parsedFrontmatter.description === 'string') {
    result.description = parsedFrontmatter.description;
  }
  if (typeof parsedFrontmatter.model === 'string') {
    result.model = parsedFrontmatter.model;
  } else if (typeof parsedFrontmatter.mode === 'string') {
    result.model = parsedFrontmatter.mode;
  }

  result.mcpServers = parseMcpServers(parsedFrontmatter.mcpServers);

  return result;
}

async function readAgentFile(
  filePath: string,
  type: Agent['type'],
  source: Agent['source'],
  fallbackName: string
): Promise<{ agent?: Agent; error?: string; hasFrontmatter: boolean }> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const metadata = parseAgentFrontmatter(content);
    return {
      agent: {
        name: metadata.name || fallbackName,
        description: metadata.description,
        model: metadata.model,
        path: filePath,
        type,
        source,
      },
      hasFrontmatter: metadata.hasFrontmatter,
    };
  } catch (err) {
    return {
      error: `Failed to read agent file ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      hasFrontmatter: false,
    };
  }
}

export async function scanAgentsDirectory(
  basePath: string,
  type: Agent['type'],
  source: Agent['source']
): Promise<AgentsResult> {
  const agents: Agent[] = [];
  const errors: string[] = [];

  if (!existsSync(basePath)) {
    return { agents, errors };
  }

  try {
    const entries = readdirSync(basePath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const isAgentFile = entry.name.endsWith('.agent.md');
      const isMarkdown = entry.name.endsWith('.md');
      if (!isMarkdown) continue;

      const filePath = join(basePath, entry.name);
      const fallbackName = entry.name.replace(/\.agent\.md$/, '').replace(/\.md$/, '');
      const { agent, error, hasFrontmatter } = await readAgentFile(
        filePath,
        type,
        source,
        fallbackName
      );
      if (!isAgentFile && !hasFrontmatter) continue;
      if (agent) agents.push(agent);
      if (error) errors.push(error);
    }
  } catch (err) {
    errors.push(
      `Failed to scan agents directory ${basePath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return { agents, errors };
}

async function scanAgentFile(
  filePath: string,
  type: Agent['type'],
  source: Agent['source']
): Promise<{ agents: Agent[]; errors: string[] }> {
  const agents: Agent[] = [];
  const errors: string[] = [];

  if (!existsSync(filePath)) {
    return { agents, errors };
  }

  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      return { agents, errors };
    }
  } catch (err) {
    errors.push(`Failed to check ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    return { agents, errors };
  }

  const fallbackName = basename(filePath, '.md');
  const { agent, error } = await readAgentFile(filePath, type, source, fallbackName);
  if (agent) agents.push(agent);
  if (error) errors.push(error);

  return { agents, errors };
}

export async function getAllAgents(projectRoot?: string, cwd?: string): Promise<AgentsResult> {
  const agents: Agent[] = [];
  const errors: string[] = [];
  const seenPaths = new Set<string>();

  const addAgent = (agent: Agent) => {
    const normalizedPath = normalize(agent.path);
    if (!seenPaths.has(normalizedPath)) {
      seenPaths.add(normalizedPath);
      agents.push(agent);
    }
  };

  const addResults = (result: AgentsResult) => {
    result.agents.forEach(addAgent);
    errors.push(...result.errors);
  };

  const homePath = app.getPath('home');

  // Get .copilot config path - respects XDG_CONFIG_HOME
  const getCopilotConfigPath = (): string => {
    const xdgConfigHome = process.env.XDG_CONFIG_HOME;
    if (xdgConfigHome) {
      return join(xdgConfigHome, '.copilot');
    }
    return join(homePath, '.copilot');
  };

  const personalDirs = [
    { path: join(getCopilotConfigPath(), 'agents'), source: 'copilot' as const },
    { path: join(homePath, '.claude', 'agents'), source: 'claude' as const },
    { path: join(homePath, '.config', 'opencode', 'agents'), source: 'opencode' as const },
  ];

  for (const { path, source } of personalDirs) {
    addResults(await scanAgentsDirectory(path, 'personal', source));
  }

  const personalFiles = [
    { path: join(homePath, '.gemini', 'GEMINI.md'), source: 'gemini' as const },
    { path: join(homePath, '.codex', 'AGENTS.md'), source: 'codex' as const },
  ];

  for (const { path, source } of personalFiles) {
    addResults(await scanAgentFile(path, 'personal', source));
  }

  if (projectRoot) {
    const projectDirs = [
      { path: join(projectRoot, '.github', 'agents'), source: 'copilot' as const },
      { path: join(projectRoot, '.claude', 'agents'), source: 'claude' as const },
      { path: join(projectRoot, '.opencode', 'agents'), source: 'opencode' as const },
    ];

    for (const { path, source } of projectDirs) {
      addResults(await scanAgentsDirectory(path, 'project', source));
    }

    addResults(await scanAgentFile(join(projectRoot, 'AGENTS.md'), 'project', 'codex'));
  }

  if (cwd && cwd !== projectRoot) {
    const cwdDirs = [
      { path: join(cwd, '.github', 'agents'), source: 'copilot' as const },
      { path: join(cwd, '.claude', 'agents'), source: 'claude' as const },
      { path: join(cwd, '.opencode', 'agents'), source: 'opencode' as const },
    ];

    for (const { path, source } of cwdDirs) {
      addResults(await scanAgentsDirectory(path, 'project', source));
    }

    addResults(await scanAgentFile(join(cwd, 'AGENTS.md'), 'project', 'codex'));
  }

  return { agents, errors };
}
