import React from 'react';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Icon to display */
  icon: React.ReactNode;
  /** Button size variant */
  size?: 'xs' | 'sm' | 'md';
  /** Color variant */
  variant?: 'default' | 'accent' | 'success' | 'error' | 'muted';
  /** Show only on parent hover (requires parent to have 'group' class) */
  showOnHover?: boolean;
}

const sizeClasses = {
  xs: 'p-0.5',
  sm: 'p-1',
  md: 'p-1.5',
};

const variantClasses = {
  default: 'text-copilot-text hover:bg-copilot-surface-hover',
  accent: 'text-copilot-accent hover:brightness-110',
  success: 'text-copilot-success hover:brightness-110',
  error: 'text-copilot-error hover:brightness-110',
  muted: 'text-copilot-text-muted hover:text-copilot-text',
};

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  size = 'sm',
  variant = 'default',
  showOnHover = false,
  className = '',
  ...props
}) => {
  const baseClasses =
    'shrink-0 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const hoverClasses = showOnHover ? 'opacity-0 group-hover:opacity-100 transition-opacity' : '';

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${hoverClasses} ${className}`}
      {...props}
    >
      {icon}
    </button>
  );
};

export default IconButton;
