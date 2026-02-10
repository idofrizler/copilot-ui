import { existsSync, readdirSync } from 'fs';
import { readFile, stat } from 'fs/promises';
import { basename, join, normalize } from 'path';
import { app } from 'electron';

export interface Agent {
  name: string;
  description?: string;
  path: string;
  type: 'personal' | 'project';
  source: 'copilot' | 'claude' | 'opencode' | 'gemini' | 'codex';
}

export interface AgentsResult {
  agents: Agent[];
  errors: string[];
}

export function parseAgentFrontmatter(content: string): {
  name?: string;
  description?: string;
} {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return {};
  }

  const frontmatter = frontmatterMatch[1];
  const result: { name?: string; description?: string } = {};

  const lines = frontmatter.split('\n');
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      const trimmedValue = value.trim().replace(/^['"](.+)['"]$/, '$1');
      if (key === 'name') result.name = trimmedValue;
      if (key === 'description') result.description = trimmedValue;
    }
  }

  return result;
}

async function readAgentFile(
  filePath: string,
  type: Agent['type'],
  source: Agent['source'],
  fallbackName: string
): Promise<{ agent?: Agent; error?: string }> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const metadata = parseAgentFrontmatter(content);
    return {
      agent: {
        name: metadata.name || fallbackName,
        description: metadata.description,
        path: filePath,
        type,
        source,
      },
    };
  } catch (err) {
    return {
      error: `Failed to read agent file ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
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
      if (!entry.isFile() || !entry.name.endsWith('.agent.md')) continue;

      const filePath = join(basePath, entry.name);
      const fallbackName = entry.name.replace(/\.agent\.md$/, '');
      const { agent, error } = await readAgentFile(filePath, type, source, fallbackName);
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

  const personalDirs = [
    { path: join(homePath, '.copilot', 'agents'), source: 'copilot' as const },
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
