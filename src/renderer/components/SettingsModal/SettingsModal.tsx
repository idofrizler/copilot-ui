import React, { useState } from 'react';
import { Modal } from '../Modal';
import {
  PaletteIcon,
  MicIcon,
  VolumeIcon,
  VolumeMuteIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
  UploadIcon,
} from '../Icons';
import { useTheme } from '../../context/ThemeContext';
import { trackEvent, TelemetryEvents } from '../../utils/telemetry';

type SettingsSection = 'themes' | 'voice' | 'sounds';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  soundEnabled: boolean;
  onSoundEnabledChange: (enabled: boolean) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  soundEnabled,
  onSoundEnabledChange,
}) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('themes');
  const { themePreference, setTheme, availableThemes, activeTheme, importTheme } = useTheme();

  const sections: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
    { id: 'themes', label: 'Themes', icon: <PaletteIcon size={16} /> },
    { id: 'voice', label: 'Voice', icon: <MicIcon size={16} /> },
    { id: 'sounds', label: 'Sounds', icon: <VolumeIcon size={16} /> },
  ];

  const renderThemesSection = () => (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium text-copilot-text mb-3">Theme Preference</h4>
        <div className="space-y-2">
          <button
            onClick={() => {
              setTheme('system');
              trackEvent(TelemetryEvents.FEATURE_THEME_CHANGED);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
              themePreference === 'system'
                ? 'bg-copilot-accent/20 text-copilot-accent border border-copilot-accent/50'
                : 'bg-copilot-surface-hover hover:bg-copilot-border text-copilot-text'
            }`}
          >
            <MonitorIcon size={16} />
            <span>System</span>
            <span className="ml-auto text-xs text-copilot-text-muted">
              Follow system appearance
            </span>
          </button>
          {availableThemes.map((theme) => (
            <button
              key={theme.id}
              onClick={() => {
                setTheme(theme.id);
                trackEvent(TelemetryEvents.FEATURE_THEME_CHANGED);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                themePreference === theme.id
                  ? 'bg-copilot-accent/20 text-copilot-accent border border-copilot-accent/50'
                  : 'bg-copilot-surface-hover hover:bg-copilot-border text-copilot-text'
              }`}
            >
              {theme.id === 'dark' ? (
                <MoonIcon size={16} />
              ) : theme.id === 'light' ? (
                <SunIcon size={16} />
              ) : (
                <PaletteIcon size={16} />
              )}
              <span>{theme.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-copilot-border pt-4">
        <button
          onClick={async () => {
            const result = await importTheme();
            if (result.error) {
              console.error('Failed to import theme:', result.error);
            }
          }}
          className="flex items-center gap-2 px-3 py-2 text-sm text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface-hover rounded-md transition-colors"
        >
          <UploadIcon size={16} />
          <span>Import Custom Theme...</span>
        </button>
      </div>

      <div className="border-t border-copilot-border pt-4">
        <p className="text-xs text-copilot-text-muted">
          Current theme: <span className="text-copilot-text">{activeTheme.name}</span>
        </p>
      </div>
    </div>
  );

  const renderVoiceSection = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-copilot-text-muted">
        <MicIcon size={24} />
        <div>
          <h4 className="text-sm font-medium text-copilot-text">Voice Settings</h4>
          <p className="text-xs">Text-to-Speech and voice control settings will appear here.</p>
        </div>
      </div>
      <div className="bg-copilot-surface-hover rounded-md p-4 text-center">
        <p className="text-sm text-copilot-text-muted">Coming soon...</p>
        <p className="text-xs text-copilot-text-muted mt-1">
          Voice output for agent responses and voice input controls.
        </p>
      </div>
    </div>
  );

  const renderSoundsSection = () => (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium text-copilot-text mb-3">Notification Sounds</h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between px-3 py-2 bg-copilot-surface-hover rounded-md">
            <div className="flex items-center gap-3">
              {soundEnabled ? <VolumeIcon size={16} /> : <VolumeMuteIcon size={16} />}
              <div>
                <span className="text-sm text-copilot-text">Completion sound</span>
                <p className="text-xs text-copilot-text-muted">
                  Play a sound when the agent finishes responding
                </p>
              </div>
            </div>
            <button
              onClick={() => onSoundEnabledChange(!soundEnabled)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                soundEnabled ? 'bg-copilot-accent' : 'bg-copilot-border'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  soundEnabled ? 'translate-x-4.5' : 'translate-x-1'
                }`}
                style={{ transform: soundEnabled ? 'translateX(18px)' : 'translateX(4px)' }}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'themes':
        return renderThemesSection();
      case 'voice':
        return renderVoiceSection();
      case 'sounds':
        return renderSoundsSection();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings" width="600px" testId="settings-modal">
      <div className="flex min-h-[400px]">
        {/* Sidebar */}
        <div className="w-40 border-r border-copilot-border p-2 shrink-0">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                activeSection === section.id
                  ? 'bg-copilot-accent/20 text-copilot-accent'
                  : 'text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface-hover'
              }`}
            >
              {section.icon}
              <span>{section.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 p-4">{renderContent()}</div>
      </div>
    </Modal>
  );
};

export default SettingsModal;
