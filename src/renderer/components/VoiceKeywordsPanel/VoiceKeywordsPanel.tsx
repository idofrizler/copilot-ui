/**
 * Voice Keywords Panel - Shows voice control keywords and status in right sidebar
 */
import React, { useState } from 'react';
import { VOICE_KEYWORDS } from '../../hooks/useVoiceSpeech';
import { MicrophoneIcon, ChevronRightIcon } from '../Icons';

interface VoiceKeywordsPanelProps {
  isRecording: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  isSupported: boolean;
  isModelLoading?: boolean;
  modelLoaded?: boolean;
  error: string | null;
  onToggleMute: () => void;
  pushToTalk: boolean;
  onTogglePushToTalk: (enabled: boolean) => void;
  alwaysListening: boolean;
  onToggleAlwaysListening: (enabled: boolean) => void;
  alwaysListeningError?: string | null;
}

interface KeywordGroupProps {
  label: string;
  keywords: string[];
  color: string;
}

const KeywordGroup: React.FC<KeywordGroupProps> = ({ label, keywords, color }) => (
  <div className="mb-2">
    <div className={`text-[10px] font-medium ${color} mb-0.5`}>{label}</div>
    <div className="flex flex-wrap gap-1">
      {keywords.map((kw, i) => (
        <span
          key={i}
          className="text-[10px] px-1.5 py-0.5 bg-copilot-surface rounded text-copilot-text-muted"
        >
          "{kw}"
        </span>
      ))}
    </div>
  </div>
);

export const VoiceKeywordsPanel: React.FC<VoiceKeywordsPanelProps> = ({
  isRecording,
  isSpeaking,
  isMuted,
  isSupported,
  isModelLoading = false,
  modelLoaded = false,
  error,
  onToggleMute,
  pushToTalk,
  onTogglePushToTalk,
  alwaysListening,
  onToggleAlwaysListening,
  alwaysListeningError,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isSupported) {
    return null;
  }

  return (
    <div className="border-t border-copilot-border">
      {/* Collapsible header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors"
      >
        <ChevronRightIcon
          size={8}
          className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
        />
        <MicrophoneIcon size={12} className={isRecording ? 'text-copilot-accent' : ''} />
        <span>Voice Control</span>
        <span className={`ml-auto w-1.5 h-1.5 rounded-full ${
          isModelLoading
            ? 'bg-copilot-warning animate-pulse'
            : isRecording 
              ? 'bg-copilot-error animate-pulse' 
              : isSpeaking 
                ? 'bg-copilot-warning animate-pulse'
                : modelLoaded
                  ? 'bg-copilot-success'
                  : 'bg-copilot-text-muted'
        }`} />
      </button>

      {isExpanded && (
        <div className="px-3 pb-3">
          {/* Settings */}
          <div className="mb-3 space-y-2">
            {/* Always Listening toggle */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-copilot-text-muted">Always Listening</span>
              <button
                onClick={() => onToggleAlwaysListening(!alwaysListening)}
                className={`relative w-8 h-4 rounded-full transition-colors ${
                  alwaysListening ? 'bg-copilot-success' : 'bg-copilot-surface'
                }`}
                title={alwaysListening ? 'Listening for wake words' : 'Manual activation only'}
              >
                <span
                  className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                    alwaysListening ? 'left-4' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Push to Talk toggle */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-copilot-text-muted">Push to Talk</span>
              <button
                onClick={() => onTogglePushToTalk(!pushToTalk)}
                disabled={alwaysListening}
                className={`relative w-8 h-4 rounded-full transition-colors ${
                  alwaysListening 
                    ? 'bg-copilot-surface/50 cursor-not-allowed' 
                    : pushToTalk ? 'bg-copilot-accent' : 'bg-copilot-surface'
                }`}
                title={alwaysListening ? 'Disabled when Always Listening' : pushToTalk ? 'Hold to record' : 'Click to start/stop'}
              >
                <span
                  className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                    pushToTalk && !alwaysListening ? 'left-4' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            {/* TTS Mute toggle */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-copilot-text-muted">Text-to-Speech</span>
              <button
                onClick={onToggleMute}
                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                  isMuted 
                    ? 'bg-copilot-error/20 text-copilot-error' 
                    : 'bg-copilot-surface text-copilot-text-muted hover:text-copilot-text'
                }`}
                title={isMuted ? 'Unmute TTS' : 'Mute TTS'}
              >
                {isMuted ? '🔇 Off' : '🔊 On'}
              </button>
            </div>
          </div>

          {/* Status indicator */}
          <div className="flex items-center gap-1.5 mb-2 text-[10px]">
            <span className={`w-1.5 h-1.5 rounded-full ${
              isModelLoading
                ? 'bg-copilot-warning animate-pulse'
                : isRecording 
                  ? 'bg-copilot-error animate-pulse' 
                  : isSpeaking 
                    ? 'bg-copilot-warning animate-pulse'
                    : alwaysListening && modelLoaded
                      ? 'bg-copilot-success animate-pulse'
                      : modelLoaded
                        ? 'bg-copilot-success'
                        : 'bg-copilot-text-muted'
            }`} />
            <span className="text-copilot-text-muted">
              {isModelLoading 
                ? 'Loading model...' 
                : isRecording 
                  ? 'Recording...' 
                  : isSpeaking 
                    ? 'Speaking...' 
                    : alwaysListening && modelLoaded
                      ? 'Listening for wake words...'
                      : modelLoaded 
                        ? 'Ready (Offline)' 
                        : 'Initializing...'}
            </span>
          </div>

          {/* Error display */}
          {error && (
            <div className="text-[10px] text-copilot-error mb-2 p-1.5 bg-copilot-error/10 rounded">
              {error}
            </div>
          )}
          
          {/* Always listening error */}
          {alwaysListening && alwaysListeningError && (
            <div className="text-[10px] text-copilot-warning mb-2 p-1.5 bg-copilot-warning/10 rounded">
              ⚠️ {alwaysListeningError}
            </div>
          )}

          {/* Keywords reference */}
          <div className="space-y-1">
            <KeywordGroup 
              label="🎤 Wake Words" 
              keywords={VOICE_KEYWORDS.wake} 
              color="text-copilot-accent"
            />
            <KeywordGroup 
              label="🛑 Stop Recording" 
              keywords={VOICE_KEYWORDS.stop} 
              color="text-copilot-error"
            />
            <KeywordGroup 
              label="❌ Abort/Cancel" 
              keywords={VOICE_KEYWORDS.abort} 
              color="text-copilot-warning"
            />
            <KeywordGroup 
              label="➕ Extend Input" 
              keywords={VOICE_KEYWORDS.extend} 
              color="text-copilot-success"
            />
          </div>

          {/* Usage hint */}
          <div className="mt-2 pt-2 border-t border-copilot-surface text-[9px] text-copilot-text-muted">
            {alwaysListening 
              ? 'Say a wake word to start recording. Say "stop" or "done" to transcribe.'
              : pushToTalk 
                ? 'Hold mic button to record. Release to transcribe.'
                : 'Click mic to start recording. Click again to stop and transcribe.'}
          </div>
        </div>
      )}
    </div>
  );
};
