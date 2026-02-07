/**
 * MicButton - Voice input button with click-to-toggle or hold-to-record functionality
 *
 * Features:
 * - Model download progress in tooltip
 * - Server setup status indication
 * - Green icon when actively listening
 * - Click-to-toggle (default) or Push-to-Talk mode
 * - Always Listening mode with wake word detection
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MicrophoneIcon } from '../Icons/Icons';
import { useVoiceServer } from '../../hooks/useVoiceServer';
import { useAlwaysListening } from '../../hooks/useAlwaysListening';
import './MicButton.css';

interface MicButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
  pushToTalk?: boolean;
  alwaysListening?: boolean;
  onAlwaysListeningError?: (error: string | null) => void;
  onAbortDetected?: () => void;
  onOpenSettings?: () => void;
}

export const MicButton: React.FC<MicButtonProps> = ({
  onTranscript,
  disabled = false,
  className = '',
  pushToTalk = false,
  alwaysListening = false,
  onAlwaysListeningError,
  onAbortDetected,
  onOpenSettings,
}) => {
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoldingRef = useRef(false);

  const { isRecording, isProcessing, isReady, loadModel, startRecording, stopRecording } =
    useVoiceServer({
      onTranscript,
      onError: (error) => {
        console.error('[MicButton] Error:', error);
        setSetupError(error);
        setIsSettingUp(false);
      },
    });

  // Always Listening - wake word detection
  const handleWakeWord = useCallback(async () => {
    console.log('[MicButton] Wake word detected, starting recording');
    if (isRecording || isProcessing || isSettingUp) return;

    // Auto-start recording when wake word detected
    isHoldingRef.current = true;
    if (isReady) {
      await startRecording();
    } else {
      // Need to load model first - this handles the full setup
      setIsSettingUp(true);
      setShowTooltip(true);
      const result = await loadModel();
      if (result.success) {
        setIsSettingUp(false);
        setDownloadProgress(null);
        await startRecording();
      } else {
        setSetupError(result.error || 'Failed to setup voice');
        setIsSettingUp(false);
      }
    }
    isHoldingRef.current = false;
  }, [isRecording, isProcessing, isSettingUp, isReady, startRecording, loadModel]);

  const handleStopWord = useCallback(() => {
    console.log('[MicButton] Stop word detected, stopping recording');
    if (isRecording) {
      stopRecording();
    }
  }, [isRecording, stopRecording]);

  const handleAbortWord = useCallback(() => {
    console.log('[MicButton] Abort word detected, canceling');
    // Cancel any pending auto-send
    onAbortDetected?.();
    // For abort, we stop without transcribing (if possible)
    if (isRecording) {
      stopRecording();
    }
  }, [isRecording, stopRecording, onAbortDetected]);

  // Initialize always listening mode
  const {
    isListening: isAlwaysListeningActive,
    error: alwaysListeningError,
    isLoading: isAlwaysListeningLoading,
    isModelLoaded: isTinyModelLoaded,
  } = useAlwaysListening({
    enabled: alwaysListening && !disabled,
    isRecording,
    onWakeWordDetected: handleWakeWord,
    onStopWordDetected: handleStopWord,
    onAbortWordDetected: handleAbortWord,
  });

  // Notify parent of always listening errors
  useEffect(() => {
    onAlwaysListeningError?.(alwaysListeningError);
  }, [alwaysListeningError, onAlwaysListeningError]);

  const handleSetupAndRecord = useCallback(async () => {
    if (disabled || isProcessing || isSettingUp) return;

    if (isReady) {
      console.log('[MicButton] Already ready, starting recording directly');
      await startRecording();
      return;
    }

    console.log('[MicButton] Starting setup process');
    setIsSettingUp(true);
    setSetupError(null);

    try {
      const result = await loadModel();
      console.log('[MicButton] loadModel result:', result);
      if (!result.success) {
        setSetupError(result.error || 'Failed to setup voice');
        setIsSettingUp(false);
        return;
      }

      setIsSettingUp(false);

      if (isHoldingRef.current) {
        console.log('[MicButton] Still holding, starting recording');
        await startRecording();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[MicButton] Setup error:', message);
      setSetupError(message);
      setIsSettingUp(false);
    }
  }, [disabled, isProcessing, isSettingUp, isReady, loadModel, startRecording]);

  // Click handler for toggle mode (PTT disabled)
  const handleClick = useCallback(async () => {
    if (disabled || isProcessing || pushToTalk) return;

    if (isRecording) {
      console.log('[MicButton] Toggle mode: stopping recording');
      stopRecording();
      return;
    }

    // Fresh check — model may have been loaded since mount
    let ready = isReady;
    if (!ready) {
      try {
        const voiceState = await window.electronAPI.voice.getState();
        if (voiceState.isModelLoaded) {
          ready = true;
          await loadModel();
        }
      } catch {
        /* ignore */
      }
    }

    if (!ready && onOpenSettings) {
      console.log('[MicButton] Not ready, opening settings');
      onOpenSettings();
    } else {
      console.log('[MicButton] Toggle mode: starting recording');
      isHoldingRef.current = true;
      await handleSetupAndRecord();
      isHoldingRef.current = false;
    }
  }, [
    disabled,
    isProcessing,
    pushToTalk,
    isRecording,
    isReady,
    onOpenSettings,
    stopRecording,
    handleSetupAndRecord,
    loadModel,
  ]);

  // Mouse down for PTT mode (hold to record)
  const handleMouseDown = useCallback(async () => {
    if (disabled || isProcessing || !pushToTalk) return;

    isHoldingRef.current = true;
    await handleSetupAndRecord();
  }, [disabled, isProcessing, pushToTalk, handleSetupAndRecord]);

  const handleMouseUp = useCallback(() => {
    if (!pushToTalk) return; // In toggle mode, ignore mouse up

    isHoldingRef.current = false;

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (isRecording) {
      stopRecording();
    }
  }, [pushToTalk, isRecording, stopRecording]);

  const handleMouseLeave = useCallback(() => {
    if (pushToTalk && isRecording) {
      handleMouseUp();
    }
  }, [pushToTalk, isRecording, handleMouseUp]);

  const getButtonClass = (): string => {
    const classes = ['mic-button', className];
    if (isRecording) classes.push('listening');
    if (isProcessing) classes.push('processing');
    if (disabled) classes.push('disabled');
    if (alwaysListening && !isRecording && !isProcessing) classes.push('always-on');
    return classes.filter(Boolean).join(' ');
  };

  const ariaLabel = isRecording
    ? 'Stop recording'
    : isProcessing
      ? 'Transcribing...'
      : isReady
        ? 'Start recording'
        : 'Setup voice';

  return (
    <div className="mic-button-container">
      <button
        type="button"
        className={getButtonClass()}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleMouseDown}
        onTouchEnd={handleMouseUp}
        disabled={disabled}
        aria-label={ariaLabel}
        data-testid="mic-button"
      >
        {isRecording ? (
          <div className="mic-recording-indicator">
            <MicrophoneIcon size={18} />
            <span className="pulse-ring pulse-ring-green" />
          </div>
        ) : isProcessing ? (
          <div className="mic-setup-indicator">
            <MicrophoneIcon size={18} />
            <span className="setup-spinner" />
          </div>
        ) : (
          <MicrophoneIcon size={18} />
        )}
      </button>

      {isRecording && <div className="mic-recording-status mic-listening-status">Listening...</div>}
    </div>
  );
};

export default MicButton;
