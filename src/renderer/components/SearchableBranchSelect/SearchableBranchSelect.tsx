import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useClickOutside } from '../../hooks/useClickOutside';
import { ChevronDownIcon, GitBranchIcon } from '../Icons';

export interface SearchableBranchSelectProps {
  /** Currently selected branch */
  value: string | null;
  /** List of available branches */
  branches: string[];
  /** Callback when branch is selected */
  onSelect: (branch: string) => void;
  /** Loading state while fetching branches */
  isLoading?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Additional class name */
  className?: string;
  /** Label text */
  label?: string;
}

export const SearchableBranchSelect: React.FC<SearchableBranchSelectProps> = ({
  value,
  branches,
  onSelect,
  isLoading = false,
  placeholder = 'Select target branch...',
  disabled = false,
  className = '',
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [openDirection, setOpenDirection] = useState<'up' | 'down'>('down');
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearchTerm('');
  }, []);

  useClickOutside(dropdownRef, handleClose, isOpen);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !dropdownRef.current) {
      return;
    }

    const updateDropdownDirection = () => {
      if (!dropdownRef.current) return;

      const rect = dropdownRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const estimatedDropdownHeight = 250;

      setOpenDirection(
        spaceBelow < estimatedDropdownHeight && spaceAbove > spaceBelow ? 'up' : 'down'
      );
    };

    updateDropdownDirection();
    window.addEventListener('resize', updateDropdownDirection);
    window.addEventListener('scroll', updateDropdownDirection, true);

    return () => {
      window.removeEventListener('resize', updateDropdownDirection);
      window.removeEventListener('scroll', updateDropdownDirection, true);
    };
  }, [isOpen]);

  const filteredBranches = branches.filter((branch) =>
    branch.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled && !isLoading) {
      setIsOpen(!isOpen);
    }
  };

  const handleSelect = (branch: string) => {
    onSelect(branch);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    } else if (e.key === 'Enter' && filteredBranches.length > 0) {
      handleSelect(filteredBranches[0]);
    }
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {label && <label className="text-xs text-copilot-text-muted mb-1 block">{label}</label>}
      <button
        onClick={handleToggle}
        disabled={disabled || isLoading}
        className="w-full flex items-center gap-2 px-3 py-1.5 bg-copilot-bg border border-copilot-border rounded text-left text-xs hover:border-copilot-accent/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        type="button"
      >
        {isLoading ? (
          <span className="w-3 h-3 border border-copilot-text-muted/30 border-t-copilot-text-muted rounded-full animate-spin shrink-0" />
        ) : (
          <GitBranchIcon size={12} className="text-copilot-text-muted shrink-0" />
        )}
        <span
          className={`flex-1 truncate ${value ? 'text-copilot-text' : 'text-copilot-text-muted'}`}
        >
          {isLoading ? 'Loading...' : value || placeholder}
        </span>
        <ChevronDownIcon size={10} className="text-copilot-text-muted shrink-0" />
      </button>

      {isOpen && (
        <div
          data-testid="searchable-branch-select-menu"
          className={`absolute left-0 right-0 bg-copilot-surface border border-copilot-border rounded-lg shadow-lg z-50 overflow-hidden ${
            openDirection === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search input */}
          <div className="p-2 border-b border-copilot-border">
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search branches..."
              className="w-full bg-copilot-bg border border-copilot-border rounded px-2 py-1 text-xs text-copilot-text placeholder-copilot-text-muted focus:border-copilot-accent outline-none"
            />
          </div>

          {/* Branch list */}
          <div className="max-h-48 overflow-y-auto">
            {filteredBranches.length === 0 ? (
              <div className="px-3 py-2 text-xs text-copilot-text-muted text-center">
                {searchTerm ? 'No branches match your search' : 'No branches available'}
              </div>
            ) : (
              filteredBranches.map((branch) => (
                <button
                  key={branch}
                  onClick={() => handleSelect(branch)}
                  className={`w-full px-3 py-1.5 text-left text-xs hover:bg-copilot-surface-hover transition-colors flex items-center gap-2 ${
                    branch === value
                      ? 'text-copilot-accent bg-copilot-accent/10'
                      : 'text-copilot-text'
                  }`}
                >
                  <GitBranchIcon size={10} className="shrink-0" />
                  <span className="truncate flex-1">
                    {branch === value && '✓ '}
                    {branch}
                  </span>
                  {(branch === 'main' || branch === 'master') && (
                    <span className="text-[9px] px-1 py-0.5 bg-copilot-accent/20 text-copilot-accent rounded">
                      default
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableBranchSelect;
