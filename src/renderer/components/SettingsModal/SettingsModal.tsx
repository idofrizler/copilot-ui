import React, { useState, useEffect } from 'react';
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
  GlobeIcon,
  CloseIcon,
  PlusIcon,
  MinusIcon,
} from '../Icons';
import { useTheme } from '../../context/ThemeContext';
import { trackEvent, TelemetryEvents } from '../../utils/telemetry';
import { VOICE_KEYWORDS } from '../../hooks/useVoiceSpeech';

type SettingsSection = 'themes' | 'voice' | 'sounds' | 'commands' | 'accessibility';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  soundEnabled: boolean;
  onSoundEnabledChange: (enabled: boolean) => void;
  defaultSection?: SettingsSection;
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
  voiceDownloadProgress?: { progress: number; status: string } | null;
  onInitVoice?: () => Promise<void>;
  // Voice selection
  availableVoices?: SpeechSynthesisVoice[];
  selectedVoiceURI?: string | null;
  onVoiceChange?: (uri: string | null) => void;
  // Global commands
  globalSafeCommands?: string[];
  onAddGlobalSafeCommand?: (cmd: string) => Promise<void>;
  onRemoveGlobalSafeCommand?: (cmd: string) => Promise<void>;
  // Zoom controls
  zoomFactor?: number;
  onZoomIn?: () => Promise<void> | void;
  onZoomOut?: () => Promise<void> | void;
  onResetZoom?: () => Promise<void> | void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  soundEnabled,
  onSoundEnabledChange,
  defaultSection,
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
  voiceDownloadProgress = null,
  onInitVoice,
  availableVoices = [],
  selectedVoiceURI = null,
  onVoiceChange,
  // Global commands
  globalSafeCommands = [],
  onAddGlobalSafeCommand,
  onRemoveGlobalSafeCommand,
  // Zoom controls
  zoomFactor = 1,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('themes');
  const [newCommandValue, setNewCommandValue] = useState('');
  const { themePreference, setTheme, availableThemes, activeTheme, importTheme } = useTheme();

  // Switch to requested section when modal opens
  useEffect(() => {
    if (isOpen && defaultSection) {
      setActiveSection(defaultSection);
    }
  }, [isOpen, defaultSection]);

  const sections: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
    { id: 'themes', label: 'Themes', icon: <PaletteIcon size={16} /> },
    { id: 'accessibility', label: 'Accessibility', icon: <MonitorIcon size={16} /> },
    { id: 'commands', label: 'Commands', icon: <GlobeIcon size={16} /> },
    { id: 'voice', label: 'Voice', icon: <MicIcon size={16} /> },
    { id: 'sounds', label: 'Sounds', icon: <VolumeIcon size={16} /> },
  ];

  const renderThemesSection = () => (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-copilot-text-muted mb-1">
        Theme Preference
      </h4>
      <p className="text-xs text-copilot-text-muted mb-3">Current theme: {activeTheme.name}</p>
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => {
            setTheme('system');
            trackEvent(TelemetryEvents.FEATURE_THEME_CHANGED);
          }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
            themePreference === 'system'
              ? 'bg-copilot-accent/20 text-copilot-accent border border-copilot-accent/50'
              : 'hover:bg-copilot-surface-hover text-copilot-text border border-copilot-border'
          }`}
        >
          <MonitorIcon size={14} />
          <span>System</span>
        </button>
        {availableThemes.map((theme) => (
          <button
            key={theme.id}
            onClick={() => {
              setTheme(theme.id);
              trackEvent(TelemetryEvents.FEATURE_THEME_CHANGED);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
              themePreference === theme.id
                ? 'bg-copilot-accent/20 text-copilot-accent border border-copilot-accent/50'
                : 'hover:bg-copilot-surface-hover text-copilot-text border border-copilot-border'
            }`}
          >
            {theme.id === 'dark' ? (
              <MoonIcon size={14} />
            ) : theme.id === 'light' ? (
              <SunIcon size={14} />
            ) : (
              <PaletteIcon size={14} />
            )}
            <span>{theme.name}</span>
          </button>
        ))}
      </div>

      <div className="border-t border-copilot-border pt-3">
        <button
          onClick={async () => {
            const result = await importTheme();
            if (result.error) {
              console.error('Failed to import theme:', result.error);
            }
          }}
          className="flex items-center gap-2 text-sm text-copilot-text-muted hover:text-copilot-text transition-colors"
        >
          <UploadIcon size={16} />
          <span>Import Custom Theme...</span>
        </button>
      </div>
    </div>
  );

  const renderVoiceSection = () => {
    // Helper to get status text
    const getStatusText = () => {
      if (isModelLoading && voiceDownloadProgress) return voiceDownloadProgress.status;
      if (isModelLoading) return 'Setting up voice...';
      if (isRecording) return 'Recording...';
      if (isSpeaking) return 'Speaking...';
      if (alwaysListening && modelLoaded) return 'Listening for wake words...';
      if (modelLoaded) return 'Ready — use mic button in chat to record';
      return 'Click to download and initialize';
    };

    const getStatusColor = () => {
      if (isModelLoading) return 'bg-copilot-warning animate-pulse';
      if (isRecording) return 'bg-copilot-accent animate-pulse';
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
      <div>
        {/* Error display */}
        {voiceError && (
          <div className="text-xs text-copilot-error p-2 bg-copilot-error/10 rounded-md mb-3">
            {voiceError}
          </div>
        )}
        {alwaysListening && alwaysListeningError && (
          <div className="text-xs text-copilot-warning p-2 bg-copilot-warning/10 rounded-md mb-3">
            ⚠️ {alwaysListeningError}
          </div>
        )}

        {/* Voice Input Settings */}
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-copilot-text-muted mb-1">
          Voice Input
        </h4>

        {/* Speech-to-Text init / status */}
        <div
          className={`flex items-center justify-between py-2.5 ${
            !modelLoaded && !isModelLoading && onInitVoice ? 'cursor-pointer' : ''
          }`}
          onClick={() => {
            if (!modelLoaded && !isModelLoading && onInitVoice) {
              onInitVoice();
            }
          }}
        >
          <div>
            <span className="text-sm text-copilot-text">Speech-to-Text</span>
            <p className="text-xs text-copilot-text-muted flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor()}`} />
              {getStatusText()}
              {!modelLoaded && !isModelLoading && onInitVoice && (
                <span className="text-copilot-accent ml-1">— Click to initialize</span>
              )}
            </p>
          </div>
        </div>
        {isModelLoading &&
          voiceDownloadProgress &&
          voiceDownloadProgress.progress > 0 &&
          voiceDownloadProgress.progress < 100 && (
            <div className="mb-1">
              <div className="w-full bg-copilot-border rounded-full h-1.5">
                <div
                  className="bg-copilot-accent h-1.5 rounded-full transition-all"
                  style={{ width: `${voiceDownloadProgress.progress}%` }}
                />
              </div>
            </div>
          )}

        <div className="border-t border-copilot-border opacity-30" />

        {/* Always Listening toggle */}
        <div
          className={`flex items-center justify-between py-2.5 ${!modelLoaded ? 'opacity-50' : ''}`}
        >
          <div>
            <span className="text-sm text-copilot-text">Always Listening</span>
            <p className="text-xs text-copilot-text-muted">
              Listen for wake words like &quot;Hey Cooper&quot;
            </p>
          </div>
          <button
            onClick={() => onToggleAlwaysListening?.(!alwaysListening)}
            disabled={!modelLoaded}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
              !modelLoaded
                ? 'bg-copilot-border/50 cursor-not-allowed'
                : alwaysListening
                  ? 'bg-copilot-accent'
                  : 'bg-copilot-border'
            }`}
          >
            <span
              className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
              style={{
                transform: alwaysListening && modelLoaded ? 'translateX(18px)' : 'translateX(4px)',
              }}
            />
          </button>
        </div>

        <div className="border-t border-copilot-border opacity-30" />

        {/* Push to Talk toggle */}
        <div
          className={`flex items-center justify-between py-2.5 ${!modelLoaded ? 'opacity-50' : ''}`}
        >
          <div>
            <span className="text-sm text-copilot-text">Push to Talk</span>
            <p className="text-xs text-copilot-text-muted">
              {alwaysListening
                ? 'Disabled when Always Listening is on'
                : 'Hold mic button to record instead of click-to-toggle'}
            </p>
          </div>
          <button
            onClick={() => onTogglePushToTalk?.(!pushToTalk)}
            disabled={!modelLoaded || alwaysListening}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
              !modelLoaded || alwaysListening
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
                  pushToTalk && !alwaysListening && modelLoaded
                    ? 'translateX(18px)'
                    : 'translateX(4px)',
              }}
            />
          </button>
        </div>

        {/* Voice Commands (inline) */}
        {modelLoaded && (
          <>
            <div className="border-t border-copilot-border opacity-30" />
            <div className="py-2.5">
              <span className="text-xs font-medium text-copilot-text">Voice Commands</span>
              <div className="mt-1 space-y-0.5 text-xs text-copilot-text-muted">
                <div>
                  <span className="text-copilot-text">Wake:</span>{' '}
                  {VOICE_KEYWORDS.wake.map((kw) => `"${kw}"`).join(', ')}
                </div>
                <div>
                  <span className="text-copilot-text">Stop:</span>{' '}
                  {VOICE_KEYWORDS.stop.map((kw) => `"${kw}"`).join(', ')}
                </div>
                <div>
                  <span className="text-copilot-text">Cancel:</span>{' '}
                  {VOICE_KEYWORDS.abort.map((kw) => `"${kw}"`).join(', ')}
                </div>
                <div>
                  <span className="text-copilot-text">Extend:</span>{' '}
                  {VOICE_KEYWORDS.extend.map((kw) => `"${kw}"`).join(', ')}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Voice Output Settings */}
        <div className="border-t border-copilot-border mt-1 pt-4">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-copilot-text-muted mb-1">
            Voice Output
          </h4>

          {/* TTS toggle */}
          <div className="flex items-center justify-between py-2.5">
            <div>
              <span className="text-sm text-copilot-text">Text-to-Speech</span>
              <p className="text-xs text-copilot-text-muted">Read agent responses aloud</p>
            </div>
            <button
              onClick={onToggleVoiceMute}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                !voiceMuted ? 'bg-copilot-accent' : 'bg-copilot-border'
              }`}
            >
              <span
                className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                style={{ transform: !voiceMuted ? 'translateX(18px)' : 'translateX(4px)' }}
              />
            </button>
          </div>

          {/* Voice selector */}
          {!voiceMuted && availableVoices.length > 0 && (
            <>
              <div className="border-t border-copilot-border opacity-30" />
              <div className="py-2.5">
                <span className="text-sm text-copilot-text">Voice</span>
                <div className="flex items-center gap-2 mt-1.5">
                  <select
                    value={selectedVoiceURI || ''}
                    onChange={(e) => onVoiceChange?.(e.target.value || null)}
                    className="flex-1 text-xs bg-copilot-surface border border-copilot-border rounded px-2 py-1.5 text-copilot-text focus:outline-none focus:border-copilot-accent"
                  >
                    <option value="">System Default</option>
                    {availableVoices.map((voice) => (
                      <option key={voice.voiceURI} value={voice.voiceURI}>
                        {voice.name}
                        {voice.lang ? ` (${voice.lang})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      if (window.speechSynthesis) {
                        window.speechSynthesis.cancel();
                        const utterance = new SpeechSynthesisUtterance('This is how I sound.');
                        if (selectedVoiceURI) {
                          const voice = availableVoices.find(
                            (v) => v.voiceURI === selectedVoiceURI
                          );
                          if (voice) utterance.voice = voice;
                        }
                        utterance.rate = 1.0;
                        utterance.pitch = 1.0;
                        utterance.volume = 0.9;
                        window.speechSynthesis.speak(utterance);
                      }
                    }}
                    className="text-xs text-copilot-accent hover:text-copilot-text transition-colors shrink-0"
                  >
                    ▶ Preview
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderSoundsSection = () => (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-copilot-text-muted mb-1">
        Notification Sounds
      </h4>
      <div className="flex items-center justify-between py-2.5">
        <div>
          <span className="text-sm text-copilot-text">Completion sound</span>
          <p className="text-xs text-copilot-text-muted">
            Play a sound when the agent finishes responding
          </p>
        </div>
        <button
          onClick={() => onSoundEnabledChange(!soundEnabled)}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
            soundEnabled ? 'bg-copilot-accent' : 'bg-copilot-border'
          }`}
        >
          <span
            className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
            style={{ transform: soundEnabled ? 'translateX(18px)' : 'translateX(4px)' }}
          />
        </button>
      </div>
    </div>
  );

  const renderCommandsSection = () => {
    const handleAdd = async () => {
      if (!newCommandValue.trim() || !onAddGlobalSafeCommand) return;
      if (newCommandValue.trim().toLowerCase().startsWith('write')) return;
      await onAddGlobalSafeCommand(newCommandValue.trim());
      setNewCommandValue('');
    };

    return (
      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-copilot-text-muted mb-1">
          Global Allowed Commands
        </h4>
        <p className="text-xs text-copilot-text-muted mb-3">
          Commands allowed across all sessions. Session-specific commands can be managed from the
          activity panel.
        </p>

        {/* Add command input */}
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            value={newCommandValue}
            onChange={(e) => setNewCommandValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
            }}
            placeholder="e.g., npm, git, python"
            className="flex-1 px-2 py-1.5 text-xs bg-copilot-surface border border-copilot-border rounded text-copilot-text placeholder:text-copilot-text-muted focus:outline-none focus:border-copilot-accent"
          />
          <button
            onClick={handleAdd}
            disabled={
              !newCommandValue.trim() || newCommandValue.trim().toLowerCase().startsWith('write')
            }
            className="flex items-center gap-1 px-2 py-1.5 text-xs bg-copilot-accent text-copilot-text rounded hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PlusIcon size={12} />
            Add
          </button>
        </div>

        {/* Commands list */}
        <div className="space-y-1">
          {globalSafeCommands.length === 0 ? (
            <div className="text-xs text-copilot-text-muted py-2">
              No global commands configured.
            </div>
          ) : (
            globalSafeCommands.map((cmd) => (
              <div
                key={cmd}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-copilot-surface-hover transition-colors"
              >
                <GlobeIcon size={12} className="shrink-0 text-copilot-accent" />
                <span className="flex-1 truncate font-mono text-xs text-copilot-text-muted">
                  {cmd}
                </span>
                <button
                  onClick={() => onRemoveGlobalSafeCommand?.(cmd)}
                  className="shrink-0 p-1 text-copilot-error hover:bg-copilot-surface rounded transition-colors"
                  title="Remove"
                >
                  <CloseIcon size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const renderAccessibilitySection = () => {
    const percent = Math.round(zoomFactor * 100);
    return (
      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-copilot-text-muted mb-1">
          Zoom &amp; Font Size
        </h4>
        <p className="text-xs text-copilot-text-muted mb-3">
          Adjust the overall UI and terminal font size.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onZoomOut?.()}
            className="flex items-center justify-center w-8 h-8 rounded border border-copilot-border text-copilot-text hover:bg-copilot-surface-hover"
            title="Zoom out (Ctrl/Cmd -)"
            aria-label="Zoom out"
          >
            <MinusIcon size={14} />
          </button>
          <div className="min-w-[70px] text-center text-sm text-copilot-text">
            {percent}%
          </div>
          <button
            onClick={() => onZoomIn?.()}
            className="flex items-center justify-center w-8 h-8 rounded border border-copilot-border text-copilot-text hover:bg-copilot-surface-hover"
            title="Zoom in (Ctrl/Cmd +)"
            aria-label="Zoom in"
          >
            <PlusIcon size={14} />
          </button>
          <button
            onClick={() => onResetZoom?.()}
            className="px-2.5 py-1.5 text-xs bg-copilot-surface border border-copilot-border rounded text-copilot-text hover:bg-copilot-surface-hover"
            title="Reset zoom (Ctrl/Cmd 0)"
            aria-label="Reset zoom (Ctrl/Cmd 0)"
          >
            Reset
          </button>
        </div>
        <div className="mt-3 text-xs text-copilot-text-muted space-y-1">
          <div>
            Shortcuts:{' '}
            <kbd className="px-1 py-0.5 rounded border border-copilot-border bg-copilot-surface">
              Ctrl/Cmd
            </kbd>{' '}
            +{' '}
            <kbd className="px-1 py-0.5 rounded border border-copilot-border bg-copilot-surface">
              +
            </kbd>
            ,{' '}
            <kbd className="px-1 py-0.5 rounded border border-copilot-border bg-copilot-surface">
              Ctrl/Cmd
            </kbd>{' '}
            +{' '}
            <kbd className="px-1 py-0.5 rounded border border-copilot-border bg-copilot-surface">
              -
            </kbd>{' '}
            ,{' '}
            <kbd className="px-1 py-0.5 rounded border border-copilot-border bg-copilot-surface">
              Ctrl/Cmd
            </kbd>{' '}
            +{' '}
            <kbd className="px-1 py-0.5 rounded border border-copilot-border bg-copilot-surface">
              0
            </kbd>
          </div>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'themes':
        return renderThemesSection();
      case 'accessibility':
        return renderAccessibilitySection();
      case 'commands':
        return renderCommandsSection();
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
