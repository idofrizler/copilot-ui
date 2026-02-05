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
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { MicrophoneIcon } from '../Icons/Icons'
import { useVoiceServer } from '../../hooks/useVoiceServer'
import { useAlwaysListening } from '../../hooks/useAlwaysListening'
import './MicButton.css'

interface MicButtonProps {
  onTranscript: (text: string) => void
  disabled?: boolean
  className?: string
  pushToTalk?: boolean // If true, hold to record. If false (default), click to toggle.
  alwaysListening?: boolean // If true, listen for wake words to auto-start recording.
  onAlwaysListeningError?: (error: string | null) => void
  onAbortDetected?: () => void // Called when "abort" is detected during always-listening
}

interface DownloadProgress {
  progress: number
  downloaded: number
  total: number
  status: string
  step?: string
}

export const MicButton: React.FC<MicButtonProps> = ({ 
  onTranscript, 
  disabled = false,
  className = '',
  pushToTalk = false,
  alwaysListening = false,
  onAlwaysListeningError,
  onAbortDetected
}) => {
  const [showTooltip, setShowTooltip] = useState(false)
  const [isSettingUp, setIsSettingUp] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [setupError, setSetupError] = useState<string | null>(null)
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isHoldingRef = useRef(false)

  const {
    isRecording,
    isProcessing,
    isReady,
    loadModel,
    startRecording,
    stopRecording,
  } = useVoiceServer({
    onTranscript,
    onError: (error) => {
      console.error('[MicButton] Error:', error)
      setSetupError(error)
      setIsSettingUp(false)
    },
  })

  // Always Listening - wake word detection
  const handleWakeWord = useCallback(async () => {
    console.log('[MicButton] Wake word detected, starting recording')
    if (isRecording || isProcessing || isSettingUp) return
    
    // Auto-start recording when wake word detected
    isHoldingRef.current = true
    if (isReady) {
      await startRecording()
    } else {
      // Need to load model first - this handles the full setup
      setIsSettingUp(true)
      setShowTooltip(true)
      const result = await loadModel()
      if (result.success) {
        setIsSettingUp(false)
        setDownloadProgress(null)
        await startRecording()
      } else {
        setSetupError(result.error || 'Failed to setup voice')
        setIsSettingUp(false)
      }
    }
    isHoldingRef.current = false
  }, [isRecording, isProcessing, isSettingUp, isReady, startRecording, loadModel])

  const handleStopWord = useCallback(() => {
    console.log('[MicButton] Stop word detected, stopping recording')
    if (isRecording) {
      stopRecording()
    }
  }, [isRecording, stopRecording])

  const handleAbortWord = useCallback(() => {
    console.log('[MicButton] Abort word detected, canceling')
    // Cancel any pending auto-send
    onAbortDetected?.()
    // For abort, we stop without transcribing (if possible)
    if (isRecording) {
      stopRecording()
    }
  }, [isRecording, stopRecording, onAbortDetected])

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
  })

  // Notify parent of always listening errors
  useEffect(() => {
    onAlwaysListeningError?.(alwaysListeningError)
  }, [alwaysListeningError, onAlwaysListeningError])

  // Listen for download progress updates
  useEffect(() => {
    const cleanup = window.electronAPI.voiceServer.onDownloadProgress((data) => {
      setDownloadProgress(data)
    })
    return cleanup
  }, [])

  const handleSetupAndRecord = useCallback(async () => {
    console.log('[MicButton] handleSetupAndRecord - disabled:', disabled, 'isProcessing:', isProcessing, 'isSettingUp:', isSettingUp, 'isReady:', isReady)
    if (disabled || isProcessing || isSettingUp) return

    // If already ready, just start recording
    if (isReady) {
      console.log('[MicButton] Already ready, starting recording directly')
      const result = await startRecording()
      console.log('[MicButton] startRecording result:', result)
      return
    }

    // Start setup process
    console.log('[MicButton] Starting setup process')
    setIsSettingUp(true)
    setSetupError(null)
    setShowTooltip(true) // Keep tooltip visible during setup

    try {
      // Load model (this will download if needed)
      console.log('[MicButton] Calling loadModel...')
      const result = await loadModel()
      console.log('[MicButton] loadModel result:', result)
      if (!result.success) {
        setSetupError(result.error || 'Failed to setup voice')
        setIsSettingUp(false)
        return
      }

      setIsSettingUp(false)
      setDownloadProgress(null)

      // Auto-start recording after successful setup if still holding
      console.log('[MicButton] Setup complete, isHolding:', isHoldingRef.current)
      if (isHoldingRef.current) {
        console.log('[MicButton] Still holding, starting recording')
        await startRecording()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[MicButton] Setup error:', message)
      setSetupError(message)
      setIsSettingUp(false)
    }
  }, [disabled, isProcessing, isSettingUp, isReady, loadModel, startRecording])

  // Click handler for toggle mode (PTT disabled)
  const handleClick = useCallback(async () => {
    if (disabled || isProcessing || pushToTalk) return
    
    if (isRecording) {
      // Currently recording - stop it
      console.log('[MicButton] Toggle mode: stopping recording')
      stopRecording()
    } else {
      // Not recording - start it
      console.log('[MicButton] Toggle mode: starting recording')
      isHoldingRef.current = true // Reuse flag for setup flow
      await handleSetupAndRecord()
      isHoldingRef.current = false
    }
  }, [disabled, isProcessing, pushToTalk, isRecording, stopRecording, handleSetupAndRecord])

  // Mouse down for PTT mode (hold to record)
  const handleMouseDown = useCallback(async () => {
    if (disabled || isProcessing || !pushToTalk) return
    
    isHoldingRef.current = true
    await handleSetupAndRecord()
  }, [disabled, isProcessing, pushToTalk, handleSetupAndRecord])

  const handleMouseUp = useCallback(() => {
    if (!pushToTalk) return // In toggle mode, ignore mouse up
    
    isHoldingRef.current = false
    
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }

    if (isRecording) {
      stopRecording()
    }
  }, [pushToTalk, isRecording, stopRecording])

  const handleMouseLeave = useCallback(() => {
    if (!isSettingUp) {
      setShowTooltip(false)
    }
    // In PTT mode, stop if mouse leaves while recording
    if (pushToTalk && isRecording) {
      handleMouseUp()
    }
  }, [pushToTalk, isRecording, isSettingUp, handleMouseUp])

  const getStatusText = (): string => {
    if (isProcessing) return 'Transcribing...'
    if (isRecording) {
      if (alwaysListening) {
        return '🟢 Recording... Say "stop" or "done"'
      }
      return pushToTalk 
        ? '🟢 Listening... Release to stop' 
        : '🟢 Listening... Click to stop'
    }
    if (setupError) return setupError.length > 50 ? setupError.slice(0, 50) + '...' : setupError
    
    if (isSettingUp) {
      if (downloadProgress) {
        return downloadProgress.status
      }
      return 'Setting up voice...'
    }
    
    if (alwaysListening) {
      if (isAlwaysListeningLoading) {
        return '⏳ Downloading wake word model (~39MB)...'
      }
      if (isAlwaysListeningActive) {
        return '🟣 Listening for "Hey Copilot"...'
      }
      if (isTinyModelLoaded) {
        return '🟣 Say "Hey Copilot" to start'
      }
      return 'Click to setup wake words'
    }
    
    const actionText = pushToTalk ? 'Hold' : 'Click'
    if (isReady) return `${actionText} to record`
    return `${actionText} to record (first time setup ~250MB)`
  }

  const getButtonClass = (): string => {
    const classes = ['mic-button', className]
    if (isRecording) classes.push('listening')
    if (isProcessing) classes.push('processing')
    if (isSettingUp) classes.push('setting-up')
    if (setupError) classes.push('error')
    if (disabled) classes.push('disabled')
    // Show purple standby when always listening is enabled but not actively recording
    if (alwaysListening && !isRecording && !isProcessing && !isSettingUp) classes.push('always-on')
    return classes.filter(Boolean).join(' ')
  }

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
        onMouseEnter={() => setShowTooltip(true)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => !isSettingUp && !isProcessing && setShowTooltip(false)}
        disabled={disabled || isSettingUp}
        aria-label={getStatusText()}
        data-testid="mic-button"
      >
        {isRecording ? (
          <div className="mic-recording-indicator">
            <MicrophoneIcon size={20} />
            <span className="pulse-ring pulse-ring-green" />
          </div>
        ) : isSettingUp || isProcessing ? (
          <div className="mic-setup-indicator">
            <MicrophoneIcon size={20} />
            <span className="setup-spinner" />
          </div>
        ) : (
          <MicrophoneIcon size={20} />
        )}
      </button>
      
      {(showTooltip || isProcessing) && !isRecording && (
        <div className={`mic-tooltip ${isSettingUp && downloadProgress ? 'mic-tooltip-wide' : ''}`}>
          {getStatusText()}
          {isSettingUp && downloadProgress && downloadProgress.progress > 0 && downloadProgress.progress < 100 && (
            <div className="mic-progress-bar">
              <div 
                className="mic-progress-fill" 
                style={{ width: `${downloadProgress.progress}%` }}
              />
            </div>
          )}
        </div>
      )}
      
      {isRecording && (
        <div className="mic-recording-status mic-listening-status">
          🟢 Listening...
        </div>
      )}
    </div>
  )
}

export default MicButton
