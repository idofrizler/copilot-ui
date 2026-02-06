import { Dropdown, WindowControls, SettingsIcon } from '../';
import logo from '../../assets/logo.png';

export interface ModelOption {
  id: string;
  name: string;
  multiplier: number;
}

export interface TitleBarProps {
  /** Currently selected model ID */
  currentModel: string | null;
  /** Available models for the dropdown */
  availableModels: ModelOption[];
  /** Callback when model selection changes */
  onModelChange: (modelId: string) => void;
  /** Callback when settings button is clicked */
  onOpenSettings: () => void;
  /** Whether the UI is in mobile mode (hides desktop controls) */
  isMobile: boolean;
}

/**
 * TitleBar component - The top bar of the application containing:
 * - Window controls (traffic lights on macOS)
 * - App logo and name
 * - Model selector dropdown
 * - Settings button
 */
export const TitleBar: React.FC<TitleBarProps> = ({
  currentModel,
  availableModels,
  onModelChange,
  onOpenSettings,
  isMobile,
}) => {
  return (
    <div className="drag-region flex items-center justify-between px-4 py-2.5 bg-copilot-surface border-b border-copilot-border shrink-0">
      <div className="flex items-center gap-3">
        <WindowControls />

        <div className="flex items-center gap-2 ml-2">
          <img src={logo} alt="Cooper" className="w-4 h-4 rounded-sm" />
          <span className="text-copilot-text text-sm font-medium">Cooper</span>
        </div>
      </div>

      <div className={`flex items-center gap-2 no-drag ${isMobile ? 'hidden' : ''}`}>
        {/* Model Selector */}
        <div data-tour="model-selector">
          <Dropdown
            value={currentModel}
            options={availableModels.map((model) => ({
              id: model.id,
              label: model.name,
              rightContent: (
                <span
                  className={`ml-2 ${
                    model.multiplier === 0
                      ? 'text-copilot-success'
                      : model.multiplier < 1
                        ? 'text-copilot-success'
                        : model.multiplier > 1
                          ? 'text-copilot-warning'
                          : 'text-copilot-text-muted'
                  }`}
                >
                  {model.multiplier === 0 ? 'free' : `${model.multiplier}×`}
                </span>
              ),
            }))}
            onSelect={onModelChange}
            placeholder="Loading..."
            title="Model"
            minWidth="240px"
          />
        </div>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface-hover rounded transition-colors"
          title="Settings"
          data-testid="settings-button"
        >
          <SettingsIcon size={14} />
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
