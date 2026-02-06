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
import { VOICE_KEYWORDS } from '../../hooks/useVoiceSpeech';

type SettingsSection = 'themes' | 'voice' | 'sounds';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  soundEnabled: boolean;
  onSoundEnabledChange: (enabled: boolean) => void;
  // Voice settings
  voiceSupported?: boolean;
  voiceMuted?: boolean;
  onToggleVoiceMute?: () => void;
  pushToTalk?: boolean;
  onTogglePushToTalk?: (enabled: boolean) => void;
  alwaysListening?: boolean;
  onToggleAlwaysListening?: (enabled: boolean) => void;
  // Voice status (progressive view)
  isRecording?: boolean;
  isSpeaking?: boolean;
  isModelLoading?: boolean;
  modelLoaded?: boolean;
  voiceError?: string | null;
  alwaysListeningError?: string | null;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  soundEnabled,
  onSoundEnabledChange,
  // Voice settings
  voiceSupported = true,
  voiceMuted = false,
  onToggleVoiceMute,
  pushToTalk = false,
  onTogglePushToTalk,
  alwaysListening = false,
  onToggleAlwaysListening,
  // Voice status
  isRecording = false,
  isSpeaking = false,
  isModelLoading = false,
  modelLoaded = false,
  voiceError = null,
  alwaysListeningError = null,
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

  const renderVoiceSection = () => {
    // Helper to get status text
    const getStatusText = () => {
      if (isModelLoading) return 'Loading model...';
      if (isRecording) return 'Recording...';
      if (isSpeaking) return 'Speaking...';
      if (alwaysListening && modelLoaded) return 'Listening for wake words...';
      if (modelLoaded) return 'Ready (Offline)';
      return 'Click mic button to initialize';
    };

    // Helper to get status color
    const getStatusColor = () => {
      if (isModelLoading) return 'bg-copilot-warning animate-pulse';
      if (isRecording) return 'bg-copilot-error animate-pulse';
      if (isSpeaking) return 'bg-copilot-warning animate-pulse';
      if (alwaysListening && modelLoaded) return 'bg-copilot-success animate-pulse';
      if (modelLoaded) return 'bg-copilot-success';
      return 'bg-copilot-text-muted';
    };

    if (!voiceSupported) {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-copilot-text-muted">
            <MicIcon size={24} />
            <div>
              <h4 className="text-sm font-medium text-copilot-text">Voice Settings</h4>
              <p className="text-xs">Voice features are not supported in this environment.</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Speech-to-Text Status indicator */}
        <div className="flex items-center gap-3 px-3 py-2 bg-copilot-surface-hover rounded-md">
          <span className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
          <div className="flex-1">
            <span className="text-sm text-copilot-text">Speech-to-Text Status</span>
            <p className="text-xs text-copilot-text-muted">{getStatusText()}</p>
          </div>
        </div>

        {/* Error display */}
        {voiceError && (
          <div className="text-xs text-copilot-error p-2 bg-copilot-error/10 rounded-md">
            {voiceError}
          </div>
        )}
        {alwaysListening && alwaysListeningError && (
          <div className="text-xs text-copilot-warning p-2 bg-copilot-warning/10 rounded-md">
            ⚠️ {alwaysListeningError}
          </div>
        )}

        {/* Voice Input Settings */}
        <div>
          <h4 className="text-sm font-medium text-copilot-text mb-3">Voice Input</h4>
          <div className="space-y-3">
            {/* Always Listening toggle */}
            <div className="flex items-center justify-between px-3 py-2 bg-copilot-surface-hover rounded-md">
              <div className="flex items-center gap-3">
                <MicIcon size={16} />
                <div>
                  <span className="text-sm text-copilot-text">Always Listening</span>
                  <p className="text-xs text-copilot-text-muted">
                    Listen for wake words like "Hey Cooper" to start recording
                  </p>
                </div>
              </div>
              <button
                onClick={() => onToggleAlwaysListening?.(!alwaysListening)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  alwaysListening ? 'bg-copilot-success' : 'bg-copilot-border'
                }`}
              >
                <span
                  className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                  style={{ transform: alwaysListening ? 'translateX(18px)' : 'translateX(4px)' }}
                />
              </button>
            </div>

            {/* Push to Talk toggle */}
            <div className="flex items-center justify-between px-3 py-2 bg-copilot-surface-hover rounded-md">
              <div className="flex items-center gap-3">
                <MicIcon size={16} />
                <div>
                  <span className="text-sm text-copilot-text">Push to Talk</span>
                  <p className="text-xs text-copilot-text-muted">
                    {alwaysListening
                      ? 'Disabled when Always Listening is on'
                      : 'Hold mic button to record instead of click-to-toggle'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => onTogglePushToTalk?.(!pushToTalk)}
                disabled={alwaysListening}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  alwaysListening
                    ? 'bg-copilot-border/50 cursor-not-allowed'
                    : pushToTalk
                      ? 'bg-copilot-accent'
                      : 'bg-copilot-border'
                }`}
              >
                <span
                  className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                  style={{
                    transform:
                      pushToTalk && !alwaysListening ? 'translateX(18px)' : 'translateX(4px)',
                  }}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Voice Output Settings */}
        <div>
          <h4 className="text-sm font-medium text-copilot-text mb-3">Voice Output</h4>
          <div className="space-y-3">
            {/* TTS toggle */}
            <div className="flex items-center justify-between px-3 py-2 bg-copilot-surface-hover rounded-md">
              <div className="flex items-center gap-3">
                {voiceMuted ? <VolumeMuteIcon size={16} /> : <VolumeIcon size={16} />}
                <div>
                  <span className="text-sm text-copilot-text">Text-to-Speech</span>
                  <p className="text-xs text-copilot-text-muted">Read agent responses aloud</p>
                </div>
              </div>
              <button
                onClick={onToggleVoiceMute}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  !voiceMuted ? 'bg-copilot-accent' : 'bg-copilot-border'
                }`}
              >
                <span
                  className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                  style={{ transform: !voiceMuted ? 'translateX(18px)' : 'translateX(4px)' }}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Voice Keywords Reference */}
        <div className="border-t border-copilot-border pt-4">
          <h4 className="text-sm font-medium text-copilot-text mb-3">Voice Commands</h4>
          <div className="space-y-2 text-xs">
            <div>
              <span className="text-copilot-accent font-medium">🎤 Wake Words: </span>
              <span className="text-copilot-text-muted">
                {VOICE_KEYWORDS.wake.map((kw) => `"${kw}"`).join(', ')}
              </span>
            </div>
            <div>
              <span className="text-copilot-error font-medium">🛑 Stop Recording: </span>
              <span className="text-copilot-text-muted">
                {VOICE_KEYWORDS.stop.map((kw) => `"${kw}"`).join(', ')}
              </span>
            </div>
            <div>
              <span className="text-copilot-warning font-medium">❌ Abort/Cancel: </span>
              <span className="text-copilot-text-muted">
                {VOICE_KEYWORDS.abort.map((kw) => `"${kw}"`).join(', ')}
              </span>
            </div>
            <div>
              <span className="text-copilot-success font-medium">➕ Extend Input: </span>
              <span className="text-copilot-text-muted">
                {VOICE_KEYWORDS.extend.map((kw) => `"${kw}"`).join(', ')}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

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
