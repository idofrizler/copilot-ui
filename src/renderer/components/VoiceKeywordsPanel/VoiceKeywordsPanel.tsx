/**
 * Voice Keywords Panel - Shows voice control status in right sidebar
 * Settings and detailed info have been moved to SettingsModal
 * This is now just a minimal status indicator
 */
import React from 'react';
import { MicrophoneIcon } from '../Icons';

interface VoiceKeywordsPanelProps {
  isRecording: boolean;
  isSpeaking: boolean;
  isSupported: boolean;
  isModelLoading?: boolean;
  modelLoaded?: boolean;
  alwaysListening: boolean;
}

export const VoiceKeywordsPanel: React.FC<VoiceKeywordsPanelProps> = ({
  isRecording,
  isSpeaking,
  isSupported,
  isModelLoading = false,
  modelLoaded = false,
  alwaysListening,
}) => {
  if (!isSupported) {
    return null;
  }

  const getStatusText = () => {
    if (isModelLoading) return 'Loading...';
    if (isRecording) return 'Recording';
    if (isSpeaking) return 'Speaking';
    if (alwaysListening && modelLoaded) return 'Listening';
    if (modelLoaded) return 'Ready';
    return 'Mic';
  };

  return (
    <div className="border-t border-copilot-border">
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-copilot-text-muted">
        <MicrophoneIcon size={12} className={isRecording ? 'text-copilot-accent' : ''} />
        <span>{getStatusText()}</span>
        <span
          className={`ml-auto w-1.5 h-1.5 rounded-full ${
            isModelLoading
              ? 'bg-copilot-warning animate-pulse'
              : isRecording
                ? 'bg-copilot-success animate-pulse'
                : isSpeaking
                  ? 'bg-copilot-warning animate-pulse'
                  : alwaysListening && modelLoaded
                    ? 'bg-copilot-accent animate-pulse'
                    : modelLoaded
                      ? 'bg-copilot-success'
                      : 'bg-copilot-text-muted'
          }`}
        />
      </div>
    </div>
  );
};
