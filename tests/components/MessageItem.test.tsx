import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MessageItem } from '../../src/renderer/components/MessageItem';
import type { Message } from '../../src/renderer/types';

describe('MessageItem', () => {
  const openFile = vi.fn().mockResolvedValue({ success: true });
  const existsPath = vi.fn().mockResolvedValue({ exists: true });

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(window.electronAPI, {
      platform: 'darwin',
      homePath: '/Users/idofrizler',
      file: {
        existsPath,
        openFile,
      },
    });
  });

  function renderMessage(content: string): void {
    renderMessageWithRole(content, 'assistant');
  }

  function renderMessageWithRole(content: string, role: Message['role']): void {
    const message: Message = {
      id: 'assistant-1',
      role,
      content,
    };

    render(
      <MessageItem
        message={message}
        index={0}
        lastAssistantIndex={0}
        isVoiceSpeaking={false}
        onStopSpeaking={vi.fn()}
        onImageClick={vi.fn()}
      />
    );
  }

  it('renders POSIX absolute paths as clickable links and opens them through Electron', async () => {
    const user = userEvent.setup();
    renderMessage('Created /Users/idofrizler/project/src/MessageItem.tsx.');

    const link = await screen.findByRole('link', {
      name: '/Users/idofrizler/project/src/MessageItem.tsx',
    });

    expect(link).toHaveAttribute('href', 'file:///Users/idofrizler/project/src/MessageItem.tsx');

    await user.click(link);

    expect(openFile).toHaveBeenCalledWith('/Users/idofrizler/project/src/MessageItem.tsx');
  });

  it('renders inline-code full paths as clickable links', () => {
    renderMessage('Open `/Users/idofrizler/project/src/MessageItem.tsx`.');
    return waitFor(() => {
      const link = screen.getByRole('link', {
        name: '/Users/idofrizler/project/src/MessageItem.tsx',
      });

      expect(link).toHaveClass('bg-copilot-bg');
    });
  });

  it('renders ~/ home-relative paths as clickable links', async () => {
    const user = userEvent.setup();
    renderMessage('Saved ~/temp/folder-contents.docx');

    const link = await screen.findByRole('link', { name: '~/temp/folder-contents.docx' });

    expect(link).toHaveAttribute('href', 'file:///Users/idofrizler/temp/folder-contents.docx');

    await user.click(link);

    expect(openFile).toHaveBeenCalledWith('~/temp/folder-contents.docx');
  });

  it('uses a different link color in user messages', () => {
    renderMessageWithRole('Check ~/temp/folder-contents.docx', 'user');
    return waitFor(() => {
      const link = screen.getByRole('link', { name: '~/temp/folder-contents.docx' });

      expect(link).toHaveClass('text-amber-100');
      expect(link).not.toHaveClass('text-copilot-accent');
    });
  });

  it('keeps non-existent path-like text as plain text instead of a link', async () => {
    existsPath.mockResolvedValueOnce({ exists: false });
    renderMessage('Status is /not-loaded, which renders as a red dot.');

    await waitFor(() => {
      expect(existsPath).toHaveBeenCalledWith('/not-loaded');
      expect(screen.queryByRole('link', { name: '/not-loaded' })).not.toBeInTheDocument();
    });

    expect(
      screen.getByText('Status is /not-loaded, which renders as a red dot.')
    ).toBeInTheDocument();
  });

  it('keeps normal markdown links intact', () => {
    renderMessage('[Cooper](https://github.com/CooperAgent/cooper)');

    const link = screen.getByRole('link', { name: 'Cooper' });

    expect(link).toHaveAttribute('href', 'https://github.com/CooperAgent/cooper');
    expect(openFile).not.toHaveBeenCalled();
  });

  it('does not linkify file paths inside code blocks', () => {
    renderMessage('```text\n/Users/idofrizler/project/src/MessageItem.tsx\n```');

    expect(
      screen.queryByRole('link', { name: '/Users/idofrizler/project/src/MessageItem.tsx' })
    ).not.toBeInTheDocument();
  });
});
