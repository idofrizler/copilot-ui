import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { EnvironmentModal } from '../../src/renderer/components/EnvironmentModal';

describe('Environment modal (markdown preview)', () => {
  const agentPath = 'C:/agents/helper.agent.md';
  const markdownContent = `---
name: Helper
description: Assist with tasks.
---

# Helper Agent

Use the helper rules.`;

  beforeEach(() => {
    // @ts-expect-error - mocking electron API
    window.electronAPI = {
      file: {
        readContent: vi.fn().mockResolvedValue({
          success: true,
          content: markdownContent,
        }),
        revealInFolder: vi.fn(),
      },
    };
  });

  it('renders agent markdown with frontmatter', async () => {
    render(
      <EnvironmentModal
        isOpen={true}
        onClose={vi.fn()}
        instructions={[]}
        skills={[]}
        agents={[{ name: 'Helper', path: agentPath, type: 'personal', source: 'copilot' }]}
        cwd="/project"
        initialTab="agents"
        initialAgentPath={agentPath}
        fileViewMode="tree"
      />
    );

    expect(screen.getByText('Environment')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Helper Agent')).toBeInTheDocument());
    expect(screen.getByText('Frontmatter')).toBeInTheDocument();
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('Helper')).toBeInTheDocument();
  });
});
