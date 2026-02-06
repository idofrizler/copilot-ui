import { WindowControls } from '../';
import logo from '../../assets/logo.png';

export interface TitleBarProps {
  /** Whether the UI is in mobile mode (hides desktop controls) */
  isMobile?: boolean;
}

/**
 * TitleBar component - The top bar of the application containing:
 * - Window controls (traffic lights on macOS)
 * - App logo and name
 */
export const TitleBar: React.FC<TitleBarProps> = () => {
  return (
    <div className="drag-region flex items-center justify-between px-4 py-2.5 bg-copilot-surface border-b border-copilot-border shrink-0">
      <div className="flex items-center gap-3">
        <WindowControls />

        <div className="flex items-center gap-2 ml-2">
          <img src={logo} alt="Cooper" className="w-4 h-4 rounded-sm" />
          <span className="text-copilot-text text-sm font-medium">Cooper</span>
        </div>
      </div>
    </div>
  );
};

export default TitleBar;
