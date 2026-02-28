import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ChatInput } from '../../src/renderer/components/ChatInput';
import type { ChatInputProps } from '../../src/renderer/components/ChatInput';
import type { ScheduledPrompt } from '../../src/renderer/types';

vi.mock('../../src/renderer/components', () => ({
  FileIcon: () => <span data-testid="file-icon" />,
  CloseIcon: () => <span data-testid="close-icon" />,
  PaperclipIcon: () => <span data-testid="paperclip-icon" />,
  ImageIcon: () => <span data-testid="image-icon" />,
  StopIcon: () => <span data-testid="stop-icon" />,
  TerminalIcon: () => <span data-testid="terminal-icon" />,
  ClockIcon: () => <span data-testid="clock-icon" />,
  MicButton: () => <button type="button">Mic</button>,
}));

describe('ChatInput scheduled prompt behavior', () => {
  const createProps = (
    overrides: Partial<ChatInputProps> = {},
    scheduledPrompt?: ScheduledPrompt
  ): ChatInputProps => ({
    status: 'connected',
    isProcessing: false,
    activeTabModel: 'gpt-5.1',
    modelCapabilities: { 'gpt-5.1': { supportsVision: true } },
    terminalAttachment: null,
    lisaEnabled: false,
    ralphEnabled: false,
    isMobile: false,
    pushToTalk: false,
    alwaysListening: false,
    voiceAutoSendCountdown: null,
    onSendMessage: vi.fn(),
    onStop: vi.fn(),
    onKeyPress: vi.fn(),
    onRemoveTerminalAttachment: vi.fn(),
    onAlwaysListeningError: vi.fn(),
    onAbortDetected: vi.fn(),
    onCancelVoiceAutoSend: vi.fn(),
    onStartVoiceAutoSend: vi.fn(),
    onScheduleMessage: vi.fn(),
    scheduledPrompt,
    onCancelScheduledPrompt: vi.fn(),
    onOpenSettings: vi.fn(),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows enabled clock button and opens schedule menu', async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(<ChatInput {...props} />);

    const scheduleButton = screen.getByTitle('Schedule message');
    expect(scheduleButton).toBeInTheDocument();
    expect(scheduleButton).toBeEnabled();

    await user.click(scheduleButton);

    expect(screen.getByRole('button', { name: 'Send in 10m' })).toBeInTheDocument();
  });

  it('calls onScheduleMessage with 600000 only after clicking send', async () => {
    const user = userEvent.setup();
    const onScheduleMessage = vi.fn();
    const props = createProps({ onScheduleMessage });
    render(<ChatInput {...props} />);

    await user.type(screen.getByRole('textbox'), 'Queue this');
    await user.click(screen.getByTitle('Schedule message'));
    await user.click(screen.getByRole('button', { name: 'Send in 10m' }));
    expect(onScheduleMessage).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Queue (10m)' }));

    expect(onScheduleMessage).toHaveBeenCalledTimes(1);
    expect(onScheduleMessage).toHaveBeenCalledWith(600000);
  });

  it('clears selected delay when clicking active clock button', async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(<ChatInput {...props} />);

    await user.type(screen.getByRole('textbox'), 'Queue this');
    await user.click(screen.getByTitle('Schedule message'));
    await user.click(screen.getByRole('button', { name: 'Send in 10m' }));

    expect(screen.getByRole('button', { name: 'Queue (10m)' })).toBeInTheDocument();

    await user.click(screen.getByTitle('Delay: 10m (click to clear)'));

    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('renders queued pill and cancels scheduled prompt', async () => {
    const user = userEvent.setup();
    const onCancelScheduledPrompt = vi.fn();
    const scheduledPrompt: ScheduledPrompt = {
      id: 'scheduled-1',
      messageId: 'msg-1',
      content: 'Future message',
      dueAt: Date.now() + 10 * 60 * 1000,
    };

    const props = createProps({ onCancelScheduledPrompt }, scheduledPrompt);
    render(<ChatInput {...props} />);

    expect(screen.getByText(/Queued message/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancelScheduledPrompt).toHaveBeenCalledTimes(1);
  });
});
