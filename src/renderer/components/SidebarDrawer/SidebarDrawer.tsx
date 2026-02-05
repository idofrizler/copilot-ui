import React, { useEffect, useRef, useCallback } from 'react';
import { useClickOutside } from '../../hooks';

export interface SidebarDrawerProps {
  /** Whether the drawer is open */
  isOpen: boolean;
  /** Callback when drawer should close */
  onClose: () => void;
  /** Side from which the drawer slides in */
  side: 'left' | 'right';
  /** Width of the drawer (default: 280px) */
  width?: number;
  /** Children to render inside the drawer */
  children: React.ReactNode;
  /** Additional class names for the drawer panel */
  className?: string;
  /** Z-index for the drawer (default: 50) */
  zIndex?: number;
}

/**
 * A slide-in drawer component for mobile/tablet responsive layouts.
 * Slides in from left or right with a semi-transparent backdrop.
 * Closes on backdrop click, Escape key, or programmatic onClose call.
 */
export function SidebarDrawer({
  isOpen,
  onClose,
  side,
  width = 280,
  children,
  className = '',
  zIndex = 50,
}: SidebarDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    },
    [isOpen, onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Close on click outside the drawer panel
  useClickOutside(drawerRef, onClose, isOpen);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const translateClass =
    side === 'left'
      ? isOpen
        ? 'translate-x-0'
        : '-translate-x-full'
      : isOpen
        ? 'translate-x-0'
        : 'translate-x-full';

  const positionClass = side === 'left' ? 'left-0' : 'right-0';

  return (
    <>
      {/* Backdrop */}
      <div
        className={`
          fixed inset-0 bg-black/50 backdrop-blur-sm
          transition-opacity duration-300 ease-in-out
          ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
        style={{ zIndex, ...(isOpen ? { WebkitAppRegion: 'no-drag' } : {}) } as React.CSSProperties}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div
        ref={drawerRef}
        className={`
          fixed top-0 ${positionClass} h-full
          bg-copilot-bg border-copilot-border
          ${side === 'left' ? 'border-r' : 'border-l'}
          transform transition-transform duration-300 ease-in-out
          ${translateClass}
          overflow-y-auto overflow-x-hidden
          ${className}
        `}
        style={
          {
            width: `${width}px`,
            maxWidth: '85vw',
            zIndex: zIndex + 1,
            ...(isOpen ? { WebkitAppRegion: 'no-drag' } : {}),
          } as React.CSSProperties
        }
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </>
  );
}

export default SidebarDrawer;
