import React from 'react';

export interface WindowControlsProps {
  /** Additional CSS classes */
  className?: string;
  /** Callback when close is clicked (optional, defaults to window.electronAPI.window.close) */
  onClose?: () => void;
  /** Callback when minimize is clicked (optional, defaults to window.electronAPI.window.minimize) */
  onMinimize?: () => void;
  /** Callback when maximize is clicked (optional, defaults to window.electronAPI.window.maximize) */
  onMaximize?: () => void;
}

export const WindowControls: React.FC<WindowControlsProps> = ({
  className = '',
  onClose,
  onMinimize,
  onMaximize,
}) => {
  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      window.electronAPI.window.close();
    }
  };

  const handleMinimize = () => {
    if (onMinimize) {
      onMinimize();
    } else {
      window.electronAPI.window.minimize();
    }
  };

  const handleMaximize = () => {
    if (onMaximize) {
      onMaximize();
    } else {
      window.electronAPI.window.maximize();
    }
  };

  return (
    <div className={`flex items-center gap-1.5 no-drag ${className}`}>
      <button
        onClick={handleClose}
        className="w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-90 active:brightness-75 transition-all"
        aria-label="Close window"
      />
      <button
        onClick={handleMinimize}
        className="w-3 h-3 rounded-full bg-[#febc2e] hover:brightness-90 active:brightness-75 transition-all"
        aria-label="Minimize window"
      />
      <button
        onClick={handleMaximize}
        className="w-3 h-3 rounded-full bg-[#28c840] hover:brightness-90 active:brightness-75 transition-all"
        aria-label="Maximize window"
      />
    </div>
  );
};

export default WindowControls;
