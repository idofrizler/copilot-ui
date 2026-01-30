import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { CodeBlockWithCopy } from '../../src/renderer/components/CodeBlock/CodeBlock'

describe('CodeBlockWithCopy Component', () => {
  beforeEach(() => {
    // Mock clipboard API for all tests
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders code content', () => {
    render(
      <CodeBlockWithCopy textContent="const x = 1">
        const x = 1
      </CodeBlockWithCopy>
    )
    expect(screen.getByText('const x = 1')).toBeInTheDocument()
  })

  it('renders inside a pre/code structure', () => {
    render(
      <CodeBlockWithCopy textContent="npm install">
        npm install
      </CodeBlockWithCopy>
    )
    const codeElement = screen.getByText('npm install')
    expect(codeElement.tagName).toBe('CODE')
    expect(codeElement.parentElement?.tagName).toBe('PRE')
  })

  it('has a copy button', () => {
    render(
      <CodeBlockWithCopy textContent="git status">
        git status
      </CodeBlockWithCopy>
    )
    const copyButton = screen.getByRole('button', { name: /copy to clipboard/i })
    expect(copyButton).toBeInTheDocument()
  })

  it('calls clipboard.writeText when copy button is clicked', async () => {
    const user = userEvent.setup()
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    })
    
    const textToCopy = 'npm run build'
    
    render(
      <CodeBlockWithCopy textContent={textToCopy}>
        {textToCopy}
      </CodeBlockWithCopy>
    )
    
    const copyButton = screen.getByRole('button', { name: /copy to clipboard/i })
    await user.click(copyButton)
    
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(textToCopy)
    })
  })

  it('shows "Copied!" feedback after clicking', async () => {
    const user = userEvent.setup()
    
    render(
      <CodeBlockWithCopy textContent="test">
        test
      </CodeBlockWithCopy>
    )
    
    const copyButton = screen.getByRole('button', { name: /copy to clipboard/i })
    await user.click(copyButton)
    
    // After clicking, the button should show "Copied!" state
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument()
    })
  })

  it('applies ascii-diagram class when isDiagram is true', () => {
    render(
      <CodeBlockWithCopy textContent="┌───┐" isDiagram>
        ┌───┐
      </CodeBlockWithCopy>
    )
    const preElement = screen.getByText('┌───┐').parentElement
    expect(preElement).toHaveClass('ascii-diagram')
  })

  it('does not apply ascii-diagram class when isDiagram is false', () => {
    render(
      <CodeBlockWithCopy textContent="code" isDiagram={false}>
        code
      </CodeBlockWithCopy>
    )
    const preElement = screen.getByText('code').parentElement
    expect(preElement).not.toHaveClass('ascii-diagram')
  })

  it('handles clipboard API errors gracefully without crashing', async () => {
    const user = userEvent.setup()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('Clipboard error')) },
      writable: true,
      configurable: true,
    })
    
    render(
      <CodeBlockWithCopy textContent="test">
        test
      </CodeBlockWithCopy>
    )
    
    const copyButton = screen.getByRole('button', { name: /copy to clipboard/i })
    
    // Should not throw when clicked - error is handled internally
    await expect(user.click(copyButton)).resolves.not.toThrow()
    
    consoleError.mockRestore()
  })
})
