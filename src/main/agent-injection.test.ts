// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { stripFrontmatter, buildAgentInjectionPrompt } from './agent-injection';

describe('stripFrontmatter', () => {
  it('removes YAML frontmatter from content', () => {
    const input = `---
name: test-agent
model: gpt-4
---
Agent instructions here.`;
    expect(stripFrontmatter(input)).toBe('Agent instructions here.');
  });

  it('returns trimmed content when no frontmatter is present', () => {
    expect(stripFrontmatter('  Just plain text  ')).toBe('Just plain text');
  });

  it('handles empty content', () => {
    expect(stripFrontmatter('')).toBe('');
  });

  it('handles content that is only frontmatter', () => {
    const input = `---
name: empty
---`;
    expect(stripFrontmatter(input)).toBe('');
  });

  it('handles frontmatter with no trailing newline', () => {
    const input = `---
name: x
---
Body`;
    expect(stripFrontmatter(input)).toBe('Body');
  });

  it('does not strip non-leading fences', () => {
    const input = `Some text
---
not: frontmatter
---
More text`;
    expect(stripFrontmatter(input)).toBe(input.trim());
  });

  it('preserves special characters in body', () => {
    const input = '---\nname: special\n---\nUse `code`, *bold*, and {{variable}}.';
    expect(stripFrontmatter(input)).toBe('Use `code`, *bold*, and {{variable}}.');
  });
});

describe('buildAgentInjectionPrompt', () => {
  it('produces a prompt containing the agent name and stripped instructions', () => {
    const content = `---
name: my-agent
---
Do great things.`;
    const result = buildAgentInjectionPrompt('my-agent', content);
    expect(result).toContain('"my-agent"');
    expect(result).toContain('Do great things.');
    expect(result).not.toContain('name: my-agent');
  });

  it('wraps output in system context markers', () => {
    const result = buildAgentInjectionPrompt('test', 'Instructions');
    expect(result).toMatch(/^\[SYSTEM CONTEXT/);
    expect(result).toContain('[END SYSTEM CONTEXT]');
    expect(result).toContain('USER MESSAGE FOLLOWS BELOW:');
  });

  it('handles content without frontmatter', () => {
    const result = buildAgentInjectionPrompt('plain', 'Just instructions');
    expect(result).toContain('Just instructions');
    expect(result).toContain('"plain"');
  });

  it('handles agent with multiline instructions', () => {
    const content = `---
name: multi
---
Line one.
Line two.
Line three.`;
    const result = buildAgentInjectionPrompt('multi', content);
    expect(result).toContain('Line one.\nLine two.\nLine three.');
  });
});
