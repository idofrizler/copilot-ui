import React, { useState } from 'react';
import { ChevronRightIcon, StarIcon, StarFilledIcon } from '../Icons';

export interface AccordionSelectOption<T = string> {
  /** Unique identifier for the option */
  id: T;
  /** Display label */
  label: string;
  /** Optional left icon */
  icon?: React.ReactNode;
  /** Optional right content (e.g., badge, multiplier) */
  rightContent?: React.ReactNode;
  /** Whether this option is marked as favorite */
  isFavorite?: boolean;
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
  /** Size variant: 'sm' for sidebar (32px), 'md' for mobile drawer (matches other buttons) */
  size?: 'sm' | 'md';
  /** Test ID for automated testing */
  testId?: string;
  /** Indices after which to show dividers */
  dividers?: number[];
  /** Callback when favorite is toggled */
  onToggleFavorite?: (id: T) => void;
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
  size = 'sm',
  testId,
  dividers = [],
  onToggleFavorite,
}: AccordionSelectProps<T>): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredOption, setHoveredOption] = useState<T | null>(null);

  const selectedOption = options.find((opt) => opt.id === value);
  const displayText = displayValue || selectedOption?.label || 'Select...';

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleSelect = (id: T) => {
    onSelect(id);
    setIsOpen(false);
  };

  const sizeClasses = size === 'md' ? 'px-4 py-3 text-sm gap-3' : 'h-[32px] px-3 text-xs gap-2';

  return (
    <div className="w-full" data-testid={testId}>
      {/* Header Row */}
      <button
        onClick={handleToggle}
        className={`w-full flex items-center ${sizeClasses} text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors`}
        data-testid={testId ? `${testId}-trigger` : undefined}
      >
        {icon && <span className="shrink-0">{icon}</span>}
        <span>{label}</span>
        <span className="ml-auto text-copilot-text truncate max-w-[120px] flex items-center gap-1">
          {displayText}
          <ChevronRightIcon
            size={size === 'md' ? 12 : 10}
            className={`shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
          />
        </span>
      </button>

      {/* Expandable Options List */}
      <div
        className={`grid transition-all duration-200 ease-in-out ${
          isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden bg-copilot-surface/50">
          <div className="max-h-[240px] overflow-y-auto">
            {options.map((option, index) => (
              <React.Fragment key={String(option.id)}>
                <div
                  className={`w-full flex items-center gap-2 pl-4 pr-4 py-2.5 text-sm transition-colors hover:bg-copilot-surface ${
                    option.id === value
                      ? 'text-copilot-accent'
                      : 'text-copilot-text-muted hover:text-copilot-text'
                  }`}
                  onMouseEnter={() => setHoveredOption(option.id)}
                  onMouseLeave={() => setHoveredOption(null)}
                  data-testid={testId ? `${testId}-option-${option.id}` : undefined}
                >
                  {/* Favorite star button */}
                  {onToggleFavorite && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(option.id);
                      }}
                      className={`shrink-0 p-0.5 rounded transition-colors hover:text-copilot-warning ${
                        option.isFavorite
                          ? 'text-copilot-warning'
                          : hoveredOption === option.id
                            ? 'text-copilot-text-muted'
                            : 'text-transparent'
                      }`}
                      title={option.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      {option.isFavorite ? <StarFilledIcon size={14} /> : <StarIcon size={14} />}
                    </button>
                  )}
                  {option.icon && <span className="w-4">{option.icon}</span>}
                  <button onClick={() => handleSelect(option.id)} className="flex-1 text-left">
                    {option.id === value && '✓ '}
                    {option.label}
                  </button>
                  {option.rightContent}
                </div>
                {dividers.includes(index) && (
                  <div className="border-t border-copilot-border my-1" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AccordionSelect;
