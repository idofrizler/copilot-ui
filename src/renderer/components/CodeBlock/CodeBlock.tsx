import React, { useState, useCallback } from 'react';
import { CopyIcon, CheckIcon, PlayIcon } from '../Icons';
import { useTerminal } from '../../context/TerminalContext';

export interface CodeBlockWithCopyProps {
  /** The code content to display */
  children: React.ReactNode;
  /** Whether this is an ASCII diagram (affects styling) */
  isDiagram?: boolean;
  /** The text content to copy (extracted from children) */
  textContent: string;
  /** Whether this code block appears to be a CLI command (shows run button) */
  isCliCommand?: boolean;
}

/**
 * A code block component with a copy-to-clipboard button.
 * The copy button appears on hover in the top-right corner.
 * For CLI commands, a "Run in Terminal" button also appears.
 */
export const CodeBlockWithCopy: React.FC<CodeBlockWithCopyProps> = ({
  children,
  isDiagram = false,
  textContent,
  isCliCommand = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [executed, setExecuted] = useState(false);
  const terminal = useTerminal();

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(textContent);
      setCopied(true);
      // Reset the copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  }, [textContent]);

  const handleRunInTerminal = useCallback(() => {
    if (!terminal) {
      console.error('Terminal context not available');
      return;
    }
    terminal.runCommand(textContent);
    setExecuted(true);
    // Reset the executed state after 2 seconds
    setTimeout(() => setExecuted(false), 2000);
  }, [terminal, textContent]);

  const showRunButton = isCliCommand && terminal !== null;

  return (
    <div className="relative group">
      <pre
        className={`bg-copilot-bg rounded p-2 my-2 overflow-x-auto text-xs max-w-full ${isDiagram ? 'ascii-diagram' : ''}`}
      >
        <code className="text-copilot-text">{children}</code>
      </pre>
      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-150">
        {showRunButton && (
          <button
            onClick={handleRunInTerminal}
            className="p-1 rounded bg-copilot-surface hover:bg-copilot-surface-hover text-copilot-text-muted hover:text-copilot-text transition-colors"
            title={executed ? 'Running!' : 'Run in terminal'}
            aria-label={executed ? 'Running!' : 'Run in terminal'}
          >
            {executed ? (
              <CheckIcon size={14} className="text-copilot-success" />
            ) : (
              <PlayIcon size={14} />
            )}
          </button>
        )}
        <button
          onClick={handleCopy}
          className="p-1 rounded bg-copilot-surface hover:bg-copilot-surface-hover text-copilot-text-muted hover:text-copilot-text transition-colors"
          title={copied ? 'Copied!' : 'Copy to clipboard'}
          aria-label={copied ? 'Copied!' : 'Copy to clipboard'}
        >
          {copied ? (
            <CheckIcon size={14} className="text-copilot-success" />
          ) : (
            <CopyIcon size={14} />
          )}
        </button>
      </div>
    </div>
  );
};

export default CodeBlockWithCopy;
