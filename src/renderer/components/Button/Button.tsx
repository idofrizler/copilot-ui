import React from 'react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button variant */
  variant?: 'primary' | 'secondary' | 'ghost'
  /** Button size */
  size?: 'sm' | 'md'
  /** Loading state */
  isLoading?: boolean
  /** Left icon */
  leftIcon?: React.ReactNode
  /** Right icon */
  rightIcon?: React.ReactNode
  /** Full width button */
  fullWidth?: boolean
  /** Test ID for automated testing */
  testId?: string
}

const variantClasses = {
  primary: 'bg-copilot-success hover:brightness-110 text-copilot-text-inverse font-medium',
  secondary: 'bg-copilot-surface hover:bg-copilot-surface-hover text-copilot-text border border-copilot-border',
  ghost: 'text-copilot-text-muted hover:text-copilot-text',
}

const sizeClasses = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'sm',
  isLoading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  disabled,
  className = '',
  children,
  testId,
  ...props
}) => {
  const baseClasses = 'rounded transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed'
  
  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled || isLoading}
      data-testid={testId}
      {...props}
    >
      {isLoading ? (
        <span className="w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
      ) : (
        leftIcon
      )}
      {children}
      {!isLoading && rightIcon}
    </button>
  )
}

export default Button
