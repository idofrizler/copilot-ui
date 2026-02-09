import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FilePreviewModal } from '../../src/renderer/components/FilePreviewModal';

describe('Environment modal (markdown preview)', () => {
  const instructionPath = 'alpha/beta/guidelines.instructions.md';
  const markdownContent = '# Alpha Guide\n\nUse the beta rules.';

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

  it('renders markdown content with environment title and tree path', async () => {
    render(
      <FilePreviewModal
        isOpen={true}
        onClose={vi.fn()}
        filePath={instructionPath}
        cwd="/project"
        isGitRepo={false}
        editedFiles={[instructionPath]}
        untrackedFiles={[]}
        conflictedFiles={[]}
        fileViewMode="tree"
        overlayTitle="Environment"
        contentMode="markdown"
        forceFullOverlay={true}
      />
    );

    expect(screen.getByText('Environment')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Alpha Guide')).toBeInTheDocument());
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
  });
});
