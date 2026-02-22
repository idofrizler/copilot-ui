// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseAgentFrontmatter } from './agents';

describe('Agent Frontmatter Parser with MCP Support (Issue #456)', () => {
  describe('Basic frontmatter parsing (existing functionality)', () => {
    it('parses name, description, and model', () => {
      const content = `---
name: test-agent
description: A test agent
model: gpt-5.2
---

Agent prompt content here.`;

      const result = parseAgentFrontmatter(content);

      expect(result.hasFrontmatter).toBe(true);
      expect(result.name).toBe('test-agent');
      expect(result.description).toBe('A test agent');
      expect(result.model).toBe('gpt-5.2');
    });

    it('returns hasFrontmatter false when no frontmatter', () => {
      const content = 'Just some content without frontmatter';
      const result = parseAgentFrontmatter(content);

      expect(result.hasFrontmatter).toBe(false);
      expect(result.name).toBeUndefined();
    });

    it('handles mode as fallback for model', () => {
      const content = `---
name: test
mode: claude-sonnet-4
---`;

      const result = parseAgentFrontmatter(content);

      expect(result.model).toBe('claude-sonnet-4');
    });

    it('prefers model over mode', () => {
      const content = `---
name: test
model: gpt-5.2
mode: claude-sonnet-4
---`;

      const result = parseAgentFrontmatter(content);

      expect(result.model).toBe('gpt-5.2');
    });
  });

  describe('MCP servers parsing (new functionality)', () => {
    it('parses a simple MCP server definition', () => {
      const content = `---
name: test-agent
description: Agent with MCP servers
mcpServers:
  github-mcp:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
    tools: ["*"]
---

Agent content`;

      const result = parseAgentFrontmatter(content);

      expect(result.hasFrontmatter).toBe(true);
      expect(result.mcpServers).toBeDefined();
      expect(result.mcpServers).toHaveProperty('github-mcp');
      expect(result.mcpServers!['github-mcp'].command).toBe('npx');
      expect(result.mcpServers!['github-mcp'].args).toEqual([
        '-y',
        '@modelcontextprotocol/server-github',
      ]);
      expect(result.mcpServers!['github-mcp'].tools).toEqual(['*']);
    });

    it('parses multiple MCP servers', () => {
      const content = `---
name: multi-mcp-agent
mcpServers:
  server1:
    command: cmd1
    args: []
  server2:
    command: cmd2
    args: ["--verbose"]
---`;

      const result = parseAgentFrontmatter(content);

      expect(result.mcpServers).toHaveProperty('server1');
      expect(result.mcpServers).toHaveProperty('server2');
      expect(result.mcpServers!['server1'].command).toBe('cmd1');
      expect(result.mcpServers!['server2'].command).toBe('cmd2');
      expect(result.mcpServers!['server2'].args).toEqual(['--verbose']);
    });

    it('parses HTTP/SSE servers with URLs', () => {
      const content = `---
name: http-agent
mcpServers:
  http-server:
    type: http
    url: http://localhost:8080
    tools: ["search", "fetch"]
  sse-server:
    type: sse
    url: http://localhost:8081/events
    headers: {"Authorization": "Bearer token"}
---`;

      const result = parseAgentFrontmatter(content);

      expect(result.mcpServers!['http-server'].type).toBe('http');
      expect(result.mcpServers!['http-server'].url).toBe('http://localhost:8080');
      expect(result.mcpServers!['http-server'].tools).toEqual(['search', 'fetch']);

      expect(result.mcpServers!['sse-server'].type).toBe('sse');
      expect(result.mcpServers!['sse-server'].url).toBe('http://localhost:8081/events');
      expect(result.mcpServers!['sse-server'].headers).toEqual({ Authorization: 'Bearer token' });
    });

    it('parses server with environment variables', () => {
      const content = `---
name: env-agent
mcpServers:
  env-server:
    command: node
    args: ["server.js"]
    env: {"API_KEY": "secret123", "DEBUG": "true"}
    cwd: /path/to/server
---`;

      const result = parseAgentFrontmatter(content);

      expect(result.mcpServers!['env-server'].env).toEqual({
        API_KEY: 'secret123',
        DEBUG: 'true',
      });
      expect(result.mcpServers!['env-server'].cwd).toBe('/path/to/server');
    });

    it('parses server with timeout and type', () => {
      const content = `---
name: timeout-agent
mcpServers:
  local-server:
    type: local
    command: ./server
    args: []
    timeout: 5000
    tools: ["tool1"]
---`;

      const result = parseAgentFrontmatter(content);

      expect(result.mcpServers!['local-server'].type).toBe('local');
      expect(result.mcpServers!['local-server'].timeout).toBe(5000);
    });

    it('handles agent without MCP servers', () => {
      const content = `---
name: simple-agent
description: No MCP servers here
---`;

      const result = parseAgentFrontmatter(content);

      expect(result.hasFrontmatter).toBe(true);
      expect(result.name).toBe('simple-agent');
      expect(result.mcpServers).toBeUndefined();
    });

    it('handles empty MCP servers section', () => {
      const content = `---
name: empty-mcp-agent
mcpServers:
---`;

      const result = parseAgentFrontmatter(content);

      expect(result.hasFrontmatter).toBe(true);
      expect(result.mcpServers).toBeUndefined();
    });

    it('handles server names with hyphens', () => {
      const content = `---
name: hyphen-agent
mcpServers:
  my-cool-server:
    command: test
    args: []
---`;

      const result = parseAgentFrontmatter(content);

      expect(result.mcpServers).toHaveProperty('my-cool-server');
      expect(result.mcpServers!['my-cool-server'].command).toBe('test');
    });

    it('parses complex real-world example', () => {
      const content = `---
name: github-specialist
description: Expert in GitHub operations with MCP tools
model: gpt-5.2
mcpServers:
  github-mcp:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
    tools: ["*"]
    env: {"GITHUB_TOKEN": "ghp_xxx"}
  filesystem-mcp:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
    tools: ["read_file", "write_file", "list_directory"]
    timeout: 3000
---

You are a GitHub specialist agent with access to GitHub MCP tools.
Use the GitHub API to help users with repository management.`;

      const result = parseAgentFrontmatter(content);

      expect(result.name).toBe('github-specialist');
      expect(result.description).toBe('Expert in GitHub operations with MCP tools');
      expect(result.model).toBe('gpt-5.2');
      expect(result.mcpServers).toHaveProperty('github-mcp');
      expect(result.mcpServers).toHaveProperty('filesystem-mcp');
      expect(result.mcpServers!['github-mcp'].env).toEqual({ GITHUB_TOKEN: 'ghp_xxx' });
      expect(result.mcpServers!['filesystem-mcp'].timeout).toBe(3000);
      expect(result.mcpServers!['filesystem-mcp'].tools).toEqual([
        'read_file',
        'write_file',
        'list_directory',
      ]);
    });

    it('returns no MCP servers for invalid frontmatter', () => {
      const content = `---
name: malformed-agent
mcpServers:
  test-server:
    command: test
    args: [not valid json
---`;

      const result = parseAgentFrontmatter(content);

      expect(result.mcpServers).toBeUndefined();
    });
  });

  describe('Mixed content parsing', () => {
    it('parses frontmatter followed by agent content', () => {
      const content = `---
name: mixed-agent
model: gpt-5.2
mcpServers:
  test-server:
    command: test
    args: []
---

# Agent Instructions

You are a specialized agent for testing.

Use the MCP server to access external tools.`;

      const result = parseAgentFrontmatter(content);

      expect(result.hasFrontmatter).toBe(true);
      expect(result.name).toBe('mixed-agent');
      expect(result.model).toBe('gpt-5.2');
      expect(result.mcpServers).toHaveProperty('test-server');
    });

    it('handles frontmatter at the end of section correctly', () => {
      const content = `---
name: end-test
description: Testing end boundary
mcpServers:
  server:
    command: cmd
    args: []
---
Content after frontmatter`;

      const result = parseAgentFrontmatter(content);

      expect(result.hasFrontmatter).toBe(true);
      expect(result.mcpServers).toHaveProperty('server');
    });
  });
});
