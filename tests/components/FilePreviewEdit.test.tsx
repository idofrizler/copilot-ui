import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilePreviewModal } from '../../src/renderer/components/FilePreviewModal/FilePreviewModal';

// Extend the global electronAPI mock with file methods
beforeEach(() => {
  (window as any).electronAPI = {
    ...((window as any).electronAPI || {}),
    file: {
      readContent: vi.fn().mockResolvedValue({
        success: true,
        content: 'line 1\nline 2\nline 3',
        fileSize: 30,
        fileName: 'test.ts',
      }),
      writeContent: vi.fn().mockResolvedValue({ success: true, filePath: '/cwd/test.ts' }),
      revealInFolder: vi.fn().mockResolvedValue({ success: true }),
    },
    git: {
      getDiff: vi.fn().mockResolvedValue({
        success: true,
        diff: 'diff --git a/test.ts b/test.ts\n--- a/test.ts\n+++ b/test.ts\n@@ -1,3 +1,3 @@\n-old line\n+new line\n context',
      }),
      isGitRepo: vi.fn().mockResolvedValue({ isGitRepo: true }),
      getChangedFiles: vi.fn().mockResolvedValue({ success: true, files: [] }),
      listBranches: vi.fn().mockResolvedValue({ success: true, branches: ['main'] }),
      checkMainAhead: vi.fn().mockResolvedValue({ success: true, isAhead: false, commits: [] }),
      generateCommitMessage: vi.fn().mockResolvedValue('Update files'),
    },
  };
});

afterEach(() => {
  cleanup();
});

describe('FilePreviewModal - Edit Mode', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    filePath: 'test.ts',
    cwd: '/cwd',
    isGitRepo: true,
    editedFiles: ['test.ts'],
    forceFullOverlay: true,
    contentMode: 'diff' as const,
  };

  it('shows Edit button when viewing a file in diff mode', async () => {
    render(<FilePreviewModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTitle('Edit file')).toBeInTheDocument();
    });
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('does not show Edit button in markdown mode', async () => {
    render(<FilePreviewModal {...defaultProps} contentMode="markdown" />);

    await waitFor(() => {
      expect(screen.queryByTitle('Edit file')).not.toBeInTheDocument();
    });
  });

  it('switches to edit mode when Edit button is clicked', async () => {
    render(<FilePreviewModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTitle('Edit file')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Edit file'));

    await waitFor(() => {
      // Should load file content for editing
      expect(window.electronAPI.file.readContent).toHaveBeenCalledWith('/cwd/test.ts');
    });

    // Should show a textarea with the file content
    await waitFor(() => {
      const textarea = screen.getByRole('textbox');
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveValue('line 1\nline 2\nline 3');
    });

    // Edit button should now say "Preview"
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('shows EDITING badge in file info bar during edit mode', async () => {
    render(<FilePreviewModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTitle('Edit file')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Edit file'));

    await waitFor(() => {
      expect(screen.getByText(/EDITING/)).toBeInTheDocument();
    });
  });

  it('shows Save button only when content is modified', async () => {
    const user = userEvent.setup();
    render(<FilePreviewModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTitle('Edit file')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Edit file'));

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    // No save button yet (no changes)
    expect(screen.queryByText('Save')).not.toBeInTheDocument();

    // Type something to modify
    const textarea = screen.getByRole('textbox');
    await user.click(textarea);
    await user.type(textarea, ' modified');

    // Save button should now appear
    await waitFor(() => {
      expect(screen.getByText('Save')).toBeInTheDocument();
    });
  });

  it('saves file and returns to diff view on save', async () => {
    const user = userEvent.setup();
    render(<FilePreviewModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTitle('Edit file')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Edit file'));

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    // Modify content
    const textarea = screen.getByRole('textbox');
    await user.click(textarea);
    await user.type(textarea, ' added');

    // Click save
    await waitFor(() => {
      expect(screen.getByText('Save')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Save'));

    // Should call writeContent
    await waitFor(() => {
      expect(window.electronAPI.file.writeContent).toHaveBeenCalledWith(
        '/cwd/test.ts',
        expect.any(String)
      );
    });

    // Should return to diff view (Edit button visible, not Preview)
    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });
  });

  it('shows error banner when save fails', async () => {
    (window.electronAPI.file.writeContent as any).mockResolvedValueOnce({
      success: false,
      error: 'Permission denied',
    });

    const user = userEvent.setup();
    render(<FilePreviewModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTitle('Edit file')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Edit file'));

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    // Modify and save
    const textarea = screen.getByRole('textbox');
    await user.click(textarea);
    await user.type(textarea, ' x');

    await waitFor(() => {
      expect(screen.getByText('Save')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Save'));

    // Should show error
    await waitFor(() => {
      expect(screen.getByText('Permission denied')).toBeInTheDocument();
    });
  });

  it('prompts before discarding unsaved changes on close', async () => {
    const mockConfirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<FilePreviewModal {...defaultProps} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByTitle('Edit file')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Edit file'));

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    // Modify content
    const textarea = screen.getByRole('textbox');
    await user.click(textarea);
    await user.type(textarea, ' change');

    // Try to close - should prompt
    fireEvent.click(screen.getByLabelText('Close modal'));

    expect(mockConfirm).toHaveBeenCalledWith('Discard unsaved changes?');
    // Declined, so onClose should NOT be called
    expect(onClose).not.toHaveBeenCalled();

    mockConfirm.mockRestore();
  });

  it('closes without prompt when no unsaved changes', async () => {
    const onClose = vi.fn();

    render(<FilePreviewModal {...defaultProps} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByTitle('Edit file')).toBeInTheDocument();
    });

    // Switch to edit mode, don't modify anything
    fireEvent.click(screen.getByTitle('Edit file'));

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    // Switch back to preview (no changes)
    fireEvent.click(screen.getByTitle('Back to diff view'));

    // Should not have prompted
    // Close should work fine
    fireEvent.click(screen.getByLabelText('Close modal'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders line numbers in edit mode', async () => {
    render(<FilePreviewModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTitle('Edit file')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Edit file'));

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    // 3 lines of content -> line numbers 1, 2, 3
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('resets edit mode when switching files', async () => {
    const { rerender } = render(<FilePreviewModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTitle('Edit file')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Edit file'));

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    // Switch to a different file
    rerender(<FilePreviewModal {...defaultProps} filePath="other.ts" />);

    // Should be back in preview mode (no textarea)
    await waitFor(() => {
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });
  });
});
