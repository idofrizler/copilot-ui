import React, { useState, useRef, useCallback } from 'react'
import { useClickOutside } from '../../hooks/useClickOutside'
import { ChevronDownIcon } from '../Icons'

export interface DropdownOption<T = string> {
  /** Unique identifier for the option */
  id: T
  /** Display label */
  label: string
  /** Optional left icon */
  icon?: React.ReactNode
  /** Optional right content (e.g., badge, multiplier) */
  rightContent?: React.ReactNode
  /** Additional description text below the label */
  description?: string
}

export interface DropdownProps<T = string> {
  /** Currently selected value */
  value: T | null
  /** List of options */
  options: DropdownOption<T>[]
  /** Callback when option selected */
  onSelect: (id: T) => void
  /** Custom trigger content (overrides default) */
  trigger?: React.ReactNode
  /** Placeholder when no value selected */
  placeholder?: string
  /** Show chevron icon (default: true) */
  showChevron?: boolean
  /** Additional class for trigger button */
  className?: string
  /** Minimum width for dropdown menu */
  minWidth?: string
  /** Indices after which to show dividers */
  dividers?: number[]
  /** Additional actions at bottom of dropdown */
  footerActions?: React.ReactNode
  /** Alignment of dropdown menu */
  align?: 'left' | 'right'
  /** Title/tooltip for trigger button */
  title?: string
  /** Disabled state */
  disabled?: boolean
  /** Test ID for automated testing */
  testId?: string
}

export function Dropdown<T = string>({
  value,
  options,
  onSelect,
  trigger,
  placeholder = 'Select...',
  showChevron = true,
  className = '',
  minWidth = '180px',
  dividers = [],
  footerActions,
  align = 'right',
  title,
  disabled = false,
  testId,
}: DropdownProps<T>): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const handleClose = useCallback(() => {
    setIsOpen(false)
  }, [])

  useClickOutside(dropdownRef, handleClose, isOpen)

  const selectedOption = options.find((opt) => opt.id === value)
  const displayLabel = selectedOption?.label || placeholder

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!disabled) {
      setIsOpen(!isOpen)
    }
  }

  const handleSelect = (id: T) => {
    onSelect(id)
    setIsOpen(false)
  }

  return (
    <div className="relative no-drag" ref={dropdownRef} data-testid={testId}>
      <button
        onClick={handleToggle}
        className={`flex items-center gap-1 px-2 py-0.5 rounded bg-copilot-surface hover:bg-copilot-surface-hover transition-colors text-xs text-copilot-text-muted hover:text-copilot-text disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        title={title}
        disabled={disabled}
        data-testid={testId ? `${testId}-trigger` : undefined}
      >
        {trigger || (
          <>
            <span>{displayLabel}</span>
            {showChevron && <ChevronDownIcon size={10} />}
          </>
        )}
      </button>

      {isOpen && (
        <div
          className={`absolute top-full mt-1 py-1 bg-copilot-surface border border-copilot-border rounded-lg shadow-lg z-50 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          style={{ minWidth }}
          onClick={(e) => e.stopPropagation()}
        >
          {options.map((option, index) => (
            <React.Fragment key={String(option.id)}>
              <button
                onClick={() => handleSelect(option.id)}
                className={`w-full px-3 py-1.5 text-left text-xs hover:bg-copilot-surface-hover transition-colors flex items-center gap-2 ${
                  option.id === value ? 'text-copilot-accent' : 'text-copilot-text'
                }`}
              >
                {option.icon}
                <span className="flex-1">
                  {option.id === value && '✓ '}
                  {option.label}
                </span>
                {option.rightContent}
              </button>
              {dividers.includes(index) && (
                <div className="border-t border-copilot-border my-1" />
              )}
            </React.Fragment>
          ))}

          {footerActions && (
            <>
              <div className="border-t border-copilot-border my-1" />
              {footerActions}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default Dropdown
