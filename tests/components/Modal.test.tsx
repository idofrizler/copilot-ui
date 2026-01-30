import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Modal } from '../../src/renderer/components/Modal/Modal'

describe('Modal Component', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    mockOnClose.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  describe('Escape Key Handler', () => {
    it('calls onClose when Escape key is pressed and modal is open', () => {
      render(
        <Modal isOpen={true} onClose={mockOnClose} title="Test Modal">
          <Modal.Body>Test content</Modal.Body>
        </Modal>
      )

      // Verify modal is rendered
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      // Press Escape key
      fireEvent.keyDown(window, { key: 'Escape' })

      // Verify onClose was called
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('does not attach listener when modal is closed', () => {
      render(
        <Modal isOpen={false} onClose={mockOnClose} title="Test Modal">
          <Modal.Body>Test content</Modal.Body>
        </Modal>
      )

      // Verify modal is not rendered
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      // Press Escape key
      fireEvent.keyDown(window, { key: 'Escape' })

      // Verify onClose was NOT called
      expect(mockOnClose).not.toHaveBeenCalled()
    })

    it('does not call onClose for other keys', () => {
      render(
        <Modal isOpen={true} onClose={mockOnClose} title="Test Modal">
          <Modal.Body>Test content</Modal.Body>
        </Modal>
      )

      // Press other keys
      fireEvent.keyDown(window, { key: 'Enter' })
      fireEvent.keyDown(window, { key: 'Tab' })
      fireEvent.keyDown(window, { key: 'a' })

      // Verify onClose was NOT called
      expect(mockOnClose).not.toHaveBeenCalled()
    })

    it('removes event listener when modal closes', () => {
      const { rerender } = render(
        <Modal isOpen={true} onClose={mockOnClose} title="Test Modal">
          <Modal.Body>Test content</Modal.Body>
        </Modal>
      )

      // Close the modal
      rerender(
        <Modal isOpen={false} onClose={mockOnClose} title="Test Modal">
          <Modal.Body>Test content</Modal.Body>
        </Modal>
      )

      // Press Escape
      fireEvent.keyDown(window, { key: 'Escape' })

      // Verify onClose was NOT called (listener should be removed)
      expect(mockOnClose).not.toHaveBeenCalled()
    })
  })

  describe('Basic Rendering', () => {
    it('renders modal when isOpen is true', () => {
      render(
        <Modal isOpen={true} onClose={mockOnClose} title="Test Title">
          <Modal.Body>Test content</Modal.Body>
        </Modal>
      )

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Test Title')).toBeInTheDocument()
      expect(screen.getByText('Test content')).toBeInTheDocument()
    })

    it('does not render modal when isOpen is false', () => {
      render(
        <Modal isOpen={false} onClose={mockOnClose} title="Test Title">
          <Modal.Body>Test content</Modal.Body>
        </Modal>
      )

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('calls onClose when close button is clicked', () => {
      render(
        <Modal isOpen={true} onClose={mockOnClose} title="Test Title">
          <Modal.Body>Test content</Modal.Body>
        </Modal>
      )

      const closeButton = screen.getByLabelText('Close modal')
      fireEvent.click(closeButton)

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })
})
