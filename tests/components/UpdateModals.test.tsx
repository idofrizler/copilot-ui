import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UpdateAvailableModal } from '../../src/renderer/components/UpdateAvailableModal'
import { ReleaseNotesModal } from '../../src/renderer/components/ReleaseNotesModal'

describe('UpdateAvailableModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    currentVersion: '1.0.0',
    newVersion: '1.1.0',
    onDownload: vi.fn(),
    onDontRemind: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders when isOpen is true', () => {
    render(<UpdateAvailableModal {...defaultProps} />)
    expect(screen.getByText('Update Available')).toBeInTheDocument()
  })

  it('does not render when isOpen is false', () => {
    render(<UpdateAvailableModal {...defaultProps} isOpen={false} />)
    expect(screen.queryByText('Update Available')).not.toBeInTheDocument()
  })

  it('displays current and new versions', () => {
    render(<UpdateAvailableModal {...defaultProps} />)
    expect(screen.getByText('1.0.0')).toBeInTheDocument()
    expect(screen.getByText('1.1.0')).toBeInTheDocument()
  })

  it('calls onDownload when Download button is clicked', () => {
    render(<UpdateAvailableModal {...defaultProps} />)
    fireEvent.click(screen.getByText('Download'))
    expect(defaultProps.onDownload).toHaveBeenCalled()
  })

  it('calls onClose when Later button is clicked', () => {
    render(<UpdateAvailableModal {...defaultProps} />)
    fireEvent.click(screen.getByText('Later'))
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('calls onDontRemind and onClose when dismiss link is clicked', () => {
    render(<UpdateAvailableModal {...defaultProps} />)
    fireEvent.click(screen.getByText("Don't remind me about this version"))
    expect(defaultProps.onDontRemind).toHaveBeenCalled()
    expect(defaultProps.onClose).toHaveBeenCalled()
  })
})

describe('ReleaseNotesModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    version: '1.1.0',
    releaseNotes: '### Added\n- New feature 1\n- New feature 2',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders when isOpen is true', () => {
    render(<ReleaseNotesModal {...defaultProps} />)
    expect(screen.getByText("What's New in v1.1.0")).toBeInTheDocument()
  })

  it('does not render when isOpen is false', () => {
    render(<ReleaseNotesModal {...defaultProps} isOpen={false} />)
    expect(screen.queryByText("What's New in v1.1.0")).not.toBeInTheDocument()
  })

  it('displays the version number', () => {
    render(<ReleaseNotesModal {...defaultProps} />)
    expect(screen.getByText('Copilot Skins v1.1.0')).toBeInTheDocument()
  })

  it('renders release notes markdown', () => {
    render(<ReleaseNotesModal {...defaultProps} />)
    expect(screen.getByText('Added')).toBeInTheDocument()
  })

  it('calls onClose when Got it! button is clicked', () => {
    render(<ReleaseNotesModal {...defaultProps} />)
    fireEvent.click(screen.getByText('Got it!'))
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('shows fallback text when no release notes provided', () => {
    render(<ReleaseNotesModal {...defaultProps} releaseNotes="" />)
    expect(screen.getByText('No release notes available for this version.')).toBeInTheDocument()
  })
})
