import React, { useState } from 'react';
import { ChevronRightIcon } from '../Icons';

export interface AccordionSelectOption<T = string> {
  /** Unique identifier for the option */
  id: T;
  /** Display label */
  label: string;
  /** Optional left icon */
  icon?: React.ReactNode;
  /** Optional right content (e.g., badge, multiplier) */
  rightContent?: React.ReactNode;
}

export interface AccordionSelectProps<T = string> {
  /** Currently selected value */
  value: T | null;
  /** List of options */
  options: AccordionSelectOption<T>[];
  /** Callback when option selected */
  onSelect: (id: T) => void;
  /** Label for the header row */
  label: string;
  /** Icon shown at the start of the header row */
  icon?: React.ReactNode;
  /** Display value shown on the right side of header (overrides auto-detection from options) */
  displayValue?: string;
  /** Test ID for automated testing */
  testId?: string;
}

/**
 * An accordion-style selector for mobile/responsive layouts.
 * Expands inline to show options below the header when clicked.
 */
export function AccordionSelect<T = string>({
  value,
  options,
  onSelect,
  label,
  icon,
  displayValue,
  testId,
}: AccordionSelectProps<T>): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = options.find((opt) => opt.id === value);
  const displayText = displayValue || selectedOption?.label || 'Select...';

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleSelect = (id: T) => {
    onSelect(id);
    setIsOpen(false);
  };

  return (
    <div className="w-full" data-testid={testId}>
      {/* Header Row */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors"
        data-testid={testId ? `${testId}-trigger` : undefined}
      >
        <span className={`transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>
          {icon || <ChevronRightIcon size={14} />}
        </span>
        <span>{label}</span>
        <span className="ml-auto text-copilot-text truncate max-w-[120px]">{displayText}</span>
      </button>

      {/* Expandable Options List */}
      <div
        className={`grid transition-all duration-200 ease-in-out ${
          isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden bg-copilot-surface/50">
          {options.map((option) => (
            <button
              key={String(option.id)}
              onClick={() => handleSelect(option.id)}
              className={`w-full flex items-center gap-2 pl-11 pr-4 py-2.5 text-sm transition-colors hover:bg-copilot-surface ${
                option.id === value
                  ? 'text-copilot-accent'
                  : 'text-copilot-text-muted hover:text-copilot-text'
              }`}
              data-testid={testId ? `${testId}-option-${option.id}` : undefined}
            >
              {option.icon && <span className="w-4">{option.icon}</span>}
              <span className="flex-1 text-left">
                {option.id === value && '✓ '}
                {option.label}
              </span>
              {option.rightContent}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AccordionSelect;
