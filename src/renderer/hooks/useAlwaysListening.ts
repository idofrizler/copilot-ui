/**
 * useAlwaysListening - Continuous wake word detection using whisper-tiny
 * 
 * Uses whisper-tiny model (~39MB) for offline wake word detection.
 * Records audio in 3-second chunks and processes with whisper to detect wake/stop words.
 * ~5-10% CPU usage during listening.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { VOICE_KEYWORDS } from './useVoiceSpeech'

interface UseAlwaysListeningOptions {
  enabled: boolean
  isRecording: boolean
  onWakeWordDetected: () => void
  onStopWordDetected: () => void
  onAbortWordDetected: () => void
}

export function useAlwaysListening(options: UseAlwaysListeningOptions) {
  const { enabled, isRecording, onWakeWordDetected, onStopWordDetected, onAbortWordDetected } = options
  
  const [isListening, setIsListening] = useState(false)
  const [isModelLoaded, setIsModelLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [lastHeard, setLastHeard] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const processingRef = useRef(false)
  const enabledRef = useRef(enabled)
  const isRecordingRef = useRef(isRecording)
  
  // Keep refs in sync
  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])
  
  useEffect(() => {
    isRecordingRef.current = isRecording
  }, [isRecording])

  // Check if electronAPI is available
  const isSupported = typeof window !== 'undefined' && !!window.electronAPI?.voice

  // Load tiny model on enable
  useEffect(() => {
    if (!enabled || !isSupported || isModelLoaded || isLoading) return

    const loadModel = async () => {
      setIsLoading(true)
      setError(null)
      
      try {
        const result = await window.electronAPI.voice.loadTinyModel()
        if (result.success) {
          setIsModelLoaded(true)
          console.log('[AlwaysListening] Tiny model loaded')
        } else {
          setError(result.error || 'Failed to load wake word model')
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load model')
      } finally {
        setIsLoading(false)
      }
    }

    loadModel()
  }, [enabled, isSupported, isModelLoaded, isLoading])

  // Process audio chunk for wake words
  const processAudioChunk = useCallback(async (audioBlob: Blob) => {
    if (processingRef.current || !enabledRef.current) return
    
    processingRef.current = true
    
    try {
      const arrayBuffer = await audioBlob.arrayBuffer()
      const audioData = new Uint8Array(arrayBuffer)
      
      const result = await window.electronAPI.voice.detectWakeWord(audioData, audioBlob.type)
      
      if (result.success) {
        if (result.text) {
          setLastHeard(result.text)
        }
        
        // Always check for abort (can cancel auto-send even when not recording)
        if (result.abortWordDetected) {
          console.log('[AlwaysListening] Abort word detected:', result.text)
          onAbortWordDetected()
        }
        
        // Check what was detected
        if (isRecordingRef.current) {
          // While main recording is active, check for stop
          if (result.stopWordDetected) {
            console.log('[AlwaysListening] Stop word detected:', result.text)
            onStopWordDetected()
          }
        } else {
          // Not recording, check for wake words
          if (result.wakeWordDetected) {
            console.log('[AlwaysListening] Wake word detected:', result.text)
            onWakeWordDetected()
          }
        }
      }
    } catch (e) {
      // Silent fail for processing errors
    } finally {
      processingRef.current = false
    }
  }, [onWakeWordDetected, onStopWordDetected, onAbortWordDetected])

  // Start/stop continuous listening
  useEffect(() => {
    if (!enabled || !isModelLoaded || !isSupported) {
      // Stop listening
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop()
        mediaRecorderRef.current = null
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
      setIsListening(false)
      return
    }

    // Keep listening even during main recording to detect stop words
    // The main recording uses its own MediaRecorder, this one is separate

    let chunks: Blob[] = []
    let recorder: MediaRecorder | null = null
    let intervalId: NodeJS.Timeout | null = null

    const startListening = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            channelCount: 1,
            sampleRate: 16000,
          } 
        })
        streamRef.current = stream

        // Determine supported mime type
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : 'audio/mp4'

        recorder = new MediaRecorder(stream, { mimeType })
        mediaRecorderRef.current = recorder

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data)
          }
        }

        recorder.onstop = () => {
          if (chunks.length > 0 && enabledRef.current) {
            const blob = new Blob(chunks, { type: mimeType })
            chunks = []
            processAudioChunk(blob)
          }
          chunks = []
        }

        // Record in 2-second chunks
        recorder.start()
        setIsListening(true)

        // Process every 2 seconds
        intervalId = setInterval(() => {
          if (recorder && recorder.state === 'recording' && enabledRef.current) {
            recorder.stop()
            // Restart after a brief pause
            setTimeout(() => {
              if (recorder && enabledRef.current) {
                chunks = []
                try {
                  recorder.start()
                } catch (e) {
                  // Recorder may have been stopped
                }
              }
            }, 100)
          }
        }, 2000)

        // Cleanup function
        return () => {
          if (intervalId) clearInterval(intervalId)
          if (recorder && recorder.state !== 'inactive') {
            recorder.stop()
          }
        }
      } catch (e) {
        console.error('[AlwaysListening] Failed to start:', e)
        setError(e instanceof Error ? e.message : 'Microphone access denied')
        setIsListening(false)
      }
    }

    const cleanupPromise = startListening()

    return () => {
      cleanupPromise?.then(cleanup => cleanup?.())
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
      mediaRecorderRef.current = null
      streamRef.current = null
    }
  }, [enabled, isModelLoaded, isSupported, processAudioChunk]) // Removed isRecording - keep listening for stop words

  return {
    isListening,
    isSupported,
    isLoading,
    isModelLoaded,
    lastHeard,
    error,
  }
}

