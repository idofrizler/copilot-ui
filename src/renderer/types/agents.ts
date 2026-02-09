// Agent discovery types

export interface Agent {
  name: string;
  description?: string;
  path: string;
  type: 'personal' | 'project' | 'system';
  source: 'copilot' | 'claude' | 'opencode' | 'gemini' | 'codex';
}

export interface AgentsResult {
  agents: Agent[];
  errors: string[];
}
