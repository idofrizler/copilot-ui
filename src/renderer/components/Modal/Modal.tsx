import React, { useEffect } from 'react'
import { CloseIcon } from '../Icons'

export interface ModalProps {
  /** Whether modal is visible */
  isOpen: boolean
  /** Close handler */
  onClose: () => void
  /** Modal title */
  title: string
  /** Modal content */
  children: React.ReactNode
  /** Width of modal (default: 500px) */
  width?: string
  /** Show close button in header (default: true) */
  showCloseButton?: boolean
  /** Test ID for automated testing */
  testId?: string
}

export interface ModalHeaderProps {
  /** Modal title */
  title: string
  /** Close handler */
  onClose?: () => void
  /** Show close button (default: true) */
  showCloseButton?: boolean
}

export interface ModalBodyProps {
  /** Body content */
  children: React.ReactNode
  /** Additional CSS classes */
  className?: string
}

export interface ModalFooterProps {
  /** Footer content (typically buttons) */
  children: React.ReactNode
  /** Additional CSS classes */
  className?: string
}

const ModalHeader: React.FC<ModalHeaderProps> = ({ title, onClose, showCloseButton = true }) => (
  <div className="px-4 py-3 border-b border-copilot-border flex items-center justify-between">
    <h3 className="text-sm font-medium text-copilot-text">{title}</h3>
    {showCloseButton && onClose && (
      <button
        onClick={onClose}
        className="text-copilot-text-muted hover:text-copilot-text transition-colors"
        aria-label="Close modal"
      >
        <CloseIcon size={14} />
      </button>
    )}
  </div>
)

const ModalBody: React.FC<ModalBodyProps> = ({ children, className = '' }) => (
  <div className={`p-4 ${className}`}>{children}</div>
)

const ModalFooter: React.FC<ModalFooterProps> = ({ children, className = '' }) => (
  <div className={`flex justify-end gap-2 ${className}`}>{children}</div>
)

export const Modal: React.FC<ModalProps> & {
  Header: typeof ModalHeader
  Body: typeof ModalBody
  Footer: typeof ModalFooter
} = ({ isOpen, onClose, title, children, width = '500px', showCloseButton = true, testId }) => {
  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" data-testid={testId}>
      <div
        className="bg-copilot-surface border border-copilot-border rounded-lg shadow-xl max-w-[90%]"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${testId}-title`}
      >
        <ModalHeader title={title} onClose={onClose} showCloseButton={showCloseButton} />
        {children}
      </div>
    </div>
  )
}

Modal.Header = ModalHeader
Modal.Body = ModalBody
Modal.Footer = ModalFooter

export default Modal
