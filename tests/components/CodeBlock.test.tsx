import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { CodeBlockWithCopy } from '../../src/renderer/components/CodeBlock/CodeBlock';
import { TerminalProvider } from '../../src/renderer/context/TerminalContext';

// Helper to wrap components with TerminalProvider
const renderWithTerminal = (
  ui: React.ReactElement,
  { isTerminalOpen = false, mockRunCommand = vi.fn() } = {}
) => {
  const mockOpenTerminal = vi.fn();
  const mockInitializeTerminal = vi.fn();

  // Mock the electronAPI.pty.write
  const mockPtyWrite = vi.fn().mockResolvedValue({ success: true });
  (window as { electronAPI?: { pty?: { write?: typeof mockPtyWrite } } }).electronAPI = {
    pty: {
      write: mockPtyWrite,
    },
  };

  return {
    ...render(
      <TerminalProvider
        sessionId="test-session"
        isTerminalOpen={isTerminalOpen}
        onOpenTerminal={mockOpenTerminal}
        onInitializeTerminal={mockInitializeTerminal}
      >
        {ui}
      </TerminalProvider>
    ),
    mockOpenTerminal,
    mockInitializeTerminal,
    mockPtyWrite,
  };
};

describe('CodeBlockWithCopy Component', () => {
  beforeEach(() => {
    // Mock clipboard API for all tests
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders code content', () => {
    render(<CodeBlockWithCopy textContent="const x = 1">const x = 1</CodeBlockWithCopy>);
    expect(screen.getByText('const x = 1')).toBeInTheDocument();
  });

  it('renders inside a pre/code structure', () => {
    render(<CodeBlockWithCopy textContent="npm install">npm install</CodeBlockWithCopy>);
    const codeElement = screen.getByText('npm install');
    expect(codeElement.tagName).toBe('CODE');
    expect(codeElement.parentElement?.tagName).toBe('PRE');
  });

  it('has a copy button', () => {
    render(<CodeBlockWithCopy textContent="git status">git status</CodeBlockWithCopy>);
    const copyButton = screen.getByRole('button', { name: /copy to clipboard/i });
    expect(copyButton).toBeInTheDocument();
  });

  it('calls clipboard.writeText when copy button is clicked', async () => {
    const user = userEvent.setup();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    const textToCopy = 'npm run build';

    render(<CodeBlockWithCopy textContent={textToCopy}>{textToCopy}</CodeBlockWithCopy>);

    const copyButton = screen.getByRole('button', { name: /copy to clipboard/i });
    await user.click(copyButton);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(textToCopy);
    });
  });

  it('shows "Copied!" feedback after clicking', async () => {
    const user = userEvent.setup();

    render(<CodeBlockWithCopy textContent="test">test</CodeBlockWithCopy>);

    const copyButton = screen.getByRole('button', { name: /copy to clipboard/i });
    await user.click(copyButton);

    // After clicking, the button should show "Copied!" state
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument();
    });
  });

  it('applies ascii-diagram class when isDiagram is true', () => {
    render(
      <CodeBlockWithCopy textContent="┌───┐" isDiagram>
        ┌───┐
      </CodeBlockWithCopy>
    );
    const preElement = screen.getByText('┌───┐').parentElement;
    expect(preElement).toHaveClass('ascii-diagram');
  });

  it('does not apply ascii-diagram class when isDiagram is false', () => {
    render(
      <CodeBlockWithCopy textContent="code" isDiagram={false}>
        code
      </CodeBlockWithCopy>
    );
    const preElement = screen.getByText('code').parentElement;
    expect(preElement).not.toHaveClass('ascii-diagram');
  });

  it('handles clipboard API errors gracefully without crashing', async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('Clipboard error')) },
      writable: true,
      configurable: true,
    });

    render(<CodeBlockWithCopy textContent="test">test</CodeBlockWithCopy>);

    const copyButton = screen.getByRole('button', { name: /copy to clipboard/i });

    // Should not throw when clicked - error is handled internally
    await expect(user.click(copyButton)).resolves.not.toThrow();

    consoleError.mockRestore();
  });

  describe('Run in Terminal button', () => {
    it('does not show run button when isCliCommand is false', () => {
      renderWithTerminal(
        <CodeBlockWithCopy textContent="const x = 1" isCliCommand={false}>
          const x = 1
        </CodeBlockWithCopy>
      );
      expect(screen.queryByRole('button', { name: /run in terminal/i })).not.toBeInTheDocument();
    });

    it('does not show run button when isCliCommand is not provided', () => {
      renderWithTerminal(
        <CodeBlockWithCopy textContent="const x = 1">const x = 1</CodeBlockWithCopy>
      );
      expect(screen.queryByRole('button', { name: /run in terminal/i })).not.toBeInTheDocument();
    });

    it('shows run button when isCliCommand is true and terminal context is available', () => {
      renderWithTerminal(
        <CodeBlockWithCopy textContent="npm install" isCliCommand={true}>
          npm install
        </CodeBlockWithCopy>
      );
      expect(screen.getByRole('button', { name: /run in terminal/i })).toBeInTheDocument();
    });

    it('does not show run button without terminal context even when isCliCommand is true', () => {
      // Render without TerminalProvider
      render(
        <CodeBlockWithCopy textContent="npm install" isCliCommand={true}>
          npm install
        </CodeBlockWithCopy>
      );
      expect(screen.queryByRole('button', { name: /run in terminal/i })).not.toBeInTheDocument();
    });

    it('calls terminal runCommand when run button is clicked', async () => {
      const user = userEvent.setup();
      const { mockPtyWrite, mockOpenTerminal, mockInitializeTerminal } = renderWithTerminal(
        <CodeBlockWithCopy textContent="npm install" isCliCommand={true}>
          npm install
        </CodeBlockWithCopy>,
        { isTerminalOpen: true }
      );

      const runButton = screen.getByRole('button', { name: /run in terminal/i });
      await user.click(runButton);

      // Should initialize terminal
      expect(mockInitializeTerminal).toHaveBeenCalled();

      // Should write command with newline
      await waitFor(() => {
        expect(mockPtyWrite).toHaveBeenCalledWith('test-session', 'npm install\n');
      });
    });

    it('opens terminal when running command if terminal is closed', async () => {
      const user = userEvent.setup();
      const { mockOpenTerminal, mockInitializeTerminal } = renderWithTerminal(
        <CodeBlockWithCopy textContent="npm install" isCliCommand={true}>
          npm install
        </CodeBlockWithCopy>,
        { isTerminalOpen: false }
      );

      const runButton = screen.getByRole('button', { name: /run in terminal/i });
      await user.click(runButton);

      expect(mockInitializeTerminal).toHaveBeenCalled();
      expect(mockOpenTerminal).toHaveBeenCalled();
    });

    it('shows "Running!" feedback after clicking run button', async () => {
      const user = userEvent.setup();
      renderWithTerminal(
        <CodeBlockWithCopy textContent="npm install" isCliCommand={true}>
          npm install
        </CodeBlockWithCopy>,
        { isTerminalOpen: true }
      );

      const runButton = screen.getByRole('button', { name: /run in terminal/i });
      await user.click(runButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /running/i })).toBeInTheDocument();
      });
    });

    it('has both copy and run buttons for CLI commands', () => {
      renderWithTerminal(
        <CodeBlockWithCopy textContent="npm install" isCliCommand={true}>
          npm install
        </CodeBlockWithCopy>
      );
      expect(screen.getByRole('button', { name: /copy to clipboard/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /run in terminal/i })).toBeInTheDocument();
    });
  });
});
