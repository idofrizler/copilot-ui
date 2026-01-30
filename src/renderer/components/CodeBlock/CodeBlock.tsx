import React, { useState, useCallback } from 'react'
import { CopyIcon, CheckIcon } from '../Icons'

export interface CodeBlockWithCopyProps {
  /** The code content to display */
  children: React.ReactNode
  /** Whether this is an ASCII diagram (affects styling) */
  isDiagram?: boolean
  /** The text content to copy (extracted from children) */
  textContent: string
}

/**
 * A code block component with a copy-to-clipboard button.
 * The copy button appears on hover in the top-right corner.
 */
export const CodeBlockWithCopy: React.FC<CodeBlockWithCopyProps> = ({
  children,
  isDiagram = false,
  textContent,
}) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(textContent)
      setCopied(true)
      // Reset the copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text:', err)
    }
  }, [textContent])

  return (
    <div className="relative group">
      <pre className={`bg-copilot-bg rounded p-2 my-2 overflow-x-auto text-xs max-w-full ${isDiagram ? 'ascii-diagram' : ''}`}>
        <code className="text-copilot-text">
          {children}
        </code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-1 right-1 p-1 rounded bg-copilot-surface hover:bg-copilot-surface-hover text-copilot-text-muted hover:text-copilot-text opacity-0 group-hover:opacity-100 transition-all duration-150"
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
  )
}

export default CodeBlockWithCopy
