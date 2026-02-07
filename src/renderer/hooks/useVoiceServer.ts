/**
 * useVoiceServer - Hook for native whisper.cpp speech recognition
 *
 * Uses the native whisper.cpp integration for offline speech-to-text.
 * No external Flask server required.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { VOICE_KEYWORDS } from './useVoiceSpeech';

// Strip trailing stop/abort keywords from transcript (e.g. user says "hello world. stop.")
function cleanTranscript(text: string): string {
  let cleaned = text.trim();
  // Build pattern from all stop and abort keywords, longest first to match greedily
  const keywords = [...VOICE_KEYWORDS.stop, ...VOICE_KEYWORDS.abort].sort(
    (a, b) => b.length - a.length
  );

  // Strip trailing keyword (with optional punctuation)
  for (const kw of keywords) {
    const pattern = new RegExp(`[\\s,.!?]*\\b${kw.replace(/\s+/g, '\\s+')}[.!?]*\\s*$`, 'i');
    const before = cleaned;
    cleaned = cleaned.replace(pattern, '').trim();
    if (cleaned !== before) break; // Only strip one trailing keyword
  }
  return cleaned;
}

interface VoiceState {
  isModelLoaded: boolean;
  isRecording: boolean;
  isProcessing: boolean;
  transcript: string;
  error: string | null;
}

interface UseVoiceServerOptions {
  onTranscript?: (text: string) => void;
  onError?: (error: string) => void;
}

export function useVoiceServer(options: UseVoiceServerOptions = {}) {
  const { onTranscript, onError } = options;

  const [state, setState] = useState<VoiceState>({
    isModelLoaded: false,
    isRecording: false,
    isProcessing: false,
    transcript: '',
    error: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>('');
  const isModelLoadedRef = useRef(false);
  const recordingStartTimeRef = useRef<number>(0);
  const isRecordingRef = useRef(false);
  const isProcessingRef = useRef(false);
  const isStartingRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    isModelLoadedRef.current = state.isModelLoaded;
  }, [state.isModelLoaded]);

  // Check if model is already loaded on mount (e.g. loaded by App.tsx early init)
  useEffect(() => {
    if (state.isModelLoaded) return;
    const voice = window.electronAPI?.voice;
    if (!voice) return;
    voice.getState().then((voiceState) => {
      if (voiceState.isModelLoaded) {
        isModelLoadedRef.current = true;
        setState((prev) => ({ ...prev, isModelLoaded: true }));
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    isRecordingRef.current = state.isRecording;
  }, [state.isRecording]);

  useEffect(() => {
    isProcessingRef.current = state.isProcessing;
  }, [state.isProcessing]);

  // Listen for voice results from main process
  useEffect(() => {
    const cleanupResult = window.electronAPI.voice.onResult((data) => {
      if (data.text) {
        setState((prev) => ({ ...prev, transcript: data.text }));
        onTranscript?.(data.text);
      }
    });

    return () => {
      cleanupResult();
    };
  }, [onTranscript]);

  const loadModel = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    console.log('[useVoiceServer] loadModel called');

    // Check if already loaded
    try {
      const voiceState = await window.electronAPI.voice.getState();
      console.log('[useVoiceServer] voice.getState:', voiceState);
      if (voiceState.isModelLoaded) {
        setState((prev) => ({ ...prev, isModelLoaded: true, error: null }));
        return { success: true };
      }
    } catch (e) {
      console.log('[useVoiceServer] voice.getState error (continuing):', e);
    }

    try {
      // Check if model files exist, download if needed
      console.log('[useVoiceServer] Checking model...');
      const modelCheck = await window.electronAPI.voiceServer.checkModel();
      console.log('[useVoiceServer] checkModel result:', modelCheck);

      if (!modelCheck.exists || !modelCheck.binaryExists) {
        // Download model and/or binary
        console.log(
          '[useVoiceServer] Need to download - exists:',
          modelCheck.exists,
          'binaryExists:',
          modelCheck.binaryExists
        );
        const downloadResult = await window.electronAPI.voiceServer.downloadModel();
        console.log('[useVoiceServer] downloadModel result:', downloadResult);
        if (!downloadResult.success) {
          const error = downloadResult.error || 'Failed to download model';
          setState((prev) => ({ ...prev, error }));
          onError?.(error);
          return { success: false, error };
        }
      }

      // Now load the model into memory
      console.log('[useVoiceServer] Loading model into memory...');
      const result = await window.electronAPI.voice.loadModel();
      console.log('[useVoiceServer] voice.loadModel result:', result);
      if (result.success) {
        isModelLoadedRef.current = true; // Update ref immediately for startRecording
        setState((prev) => ({ ...prev, isModelLoaded: true, error: null }));
        return { success: true };
      } else {
        const error = result.error || 'Failed to load model';
        setState((prev) => ({ ...prev, error }));
        onError?.(error);
        return { success: false, error };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[useVoiceServer] loadModel error:', message);
      setState((prev) => ({ ...prev, error: message }));
      onError?.(message);
      return { success: false, error: message };
    }
  }, [onError]);

  const startRecording = useCallback(async () => {
    console.log(
      '[useVoiceServer] startRecording called, isModelLoadedRef:',
      isModelLoadedRef.current
    );
    if (isStartingRef.current || isRecordingRef.current || isProcessingRef.current) {
      console.log('[useVoiceServer] startRecording ignored - already recording or starting');
      return { success: true };
    }

    // Use ref to get latest value (avoids stale closure issue)
    if (!isModelLoadedRef.current) {
      // Double-check with main process - the mount effect may not have resolved yet
      try {
        const voiceState = await window.electronAPI.voice.getState();
        if (voiceState.isModelLoaded) {
          isModelLoadedRef.current = true;
          setState((prev) => ({ ...prev, isModelLoaded: true }));
        }
      } catch {
        /* ignore */
      }
    }
    if (!isModelLoadedRef.current) {
      const error = 'Voice model not loaded';
      console.error('[useVoiceServer] startRecording error:', error);
      onError?.(error);
      return { success: false, error };
    }

    isStartingRef.current = true;
    try {
      // Start recording in main process
      console.log('[useVoiceServer] Calling voice.startRecording...');
      const startResult = await window.electronAPI.voice.startRecording();
      console.log('[useVoiceServer] voice.startRecording result:', startResult);
      if (!startResult.success) {
        const errorMessage = (startResult.error || '').toLowerCase();
        if (errorMessage.includes('already recording')) {
          console.warn('[useVoiceServer] Main process already recording, continuing');
        } else {
          onError?.(startResult.error || 'Failed to start recording');
          return startResult;
        }
      }

      // Request microphone access
      console.log('[useVoiceServer] Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = stream;
      audioChunksRef.current = [];

      // Find a supported mime type
      const mimeTypes = ['audio/webm', 'audio/webm;codecs=opus', 'audio/ogg', 'audio/mp4', ''];
      let selectedMimeType = '';
      for (const mimeType of mimeTypes) {
        if (mimeType === '' || MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      const mediaRecorderOptions: MediaRecorderOptions = {};
      if (selectedMimeType) {
        mediaRecorderOptions.mimeType = selectedMimeType;
      }

      mimeTypeRef.current = selectedMimeType;
      const mediaRecorder = new MediaRecorder(stream, mediaRecorderOptions);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const recordingDuration = (Date.now() - recordingStartTimeRef.current) / 1000;
        console.log(
          '[useVoiceServer] MediaRecorder stopped, chunks:',
          audioChunksRef.current.length,
          'duration:',
          recordingDuration.toFixed(2),
          's'
        );
        setState((prev) => ({ ...prev, isRecording: false, isProcessing: true }));

        try {
          // Safeguard 1: Check if recording is empty
          if (audioChunksRef.current.length === 0) {
            console.warn('[useVoiceServer] No audio chunks recorded');
            // Reset main process state
            await window.electronAPI.voice.stopRecording();
            onError?.('Recording was empty - no audio captured');
            setState((prev) => ({ ...prev, isProcessing: false }));
            return;
          }

          // Safeguard 2: Ignore recordings less than 1 second
          if (recordingDuration < 1.0) {
            console.log('[useVoiceServer] Recording too short, ignoring');
            // Reset main process state
            await window.electronAPI.voice.stopRecording();
            setState((prev) => ({ ...prev, isProcessing: false }));
            return;
          }

          const blobType = mimeTypeRef.current || 'audio/webm';
          const audioBlob = new Blob(audioChunksRef.current, { type: blobType });
          console.log(
            '[useVoiceServer] Audio blob created, size:',
            audioBlob.size,
            'type:',
            blobType
          );

          // Safeguard: Check blob size - very small blobs indicate mic permission issues
          if (audioBlob.size === 0) {
            console.warn('[useVoiceServer] Empty audio blob');
            await window.electronAPI.voice.stopRecording();
            onError?.('Recording was empty');
            setState((prev) => ({ ...prev, isProcessing: false }));
            return;
          }
          if (audioBlob.size < 1500 && recordingDuration > 1) {
            console.warn(
              '[useVoiceServer] Audio blob suspiciously small for duration:',
              recordingDuration,
              's, size:',
              audioBlob.size
            );
            await window.electronAPI.voice.stopRecording();
            onError?.(
              'Microphone may not be working. Check System Settings > Privacy & Security > Microphone and allow this app.'
            );
            setState((prev) => ({ ...prev, isProcessing: false }));
            return;
          }

          // Convert blob to array buffer and send to main
          const arrayBuffer = await audioBlob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          console.log('[useVoiceServer] Sending raw audio to main, size:', uint8Array.length);

          // Send raw audio to main process for processing (main will handle conversion)
          const result = await window.electronAPI.voice.processAndTranscribe(uint8Array, blobType);
          console.log('[useVoiceServer] processAndTranscribe result:', result);

          if (result.success && result.text) {
            const cleaned = cleanTranscript(result.text);
            if (cleaned) {
              setState((prev) => ({ ...prev, transcript: cleaned }));
              onTranscript?.(cleaned);
            }
          } else if (result.error) {
            onError?.(result.error);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error('[useVoiceServer] onstop error:', message, err);
          onError?.(message);
        } finally {
          setState((prev) => ({ ...prev, isProcessing: false }));
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // Collect data every 100ms
      recordingStartTimeRef.current = Date.now();

      console.log('[useVoiceServer] Recording started, setting isRecording: true');
      isRecordingRef.current = true;
      setState((prev) => ({ ...prev, isRecording: true, transcript: '' }));
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[useVoiceServer] startRecording error:', message);
      onError?.(message);
      return { success: false, error: message };
    } finally {
      isStartingRef.current = false;
    }
  }, [onTranscript, onError]); // Removed state.isModelLoaded - using ref instead

  const stopRecording = useCallback(() => {
    console.log('[useVoiceServer] stopRecording called');
    isStartingRef.current = false;
    isRecordingRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    mediaRecorderRef.current = null;
    // Ensure state is reset
    setState((prev) => ({ ...prev, isRecording: false }));
  }, []);

  const stopServer = useCallback(async () => {
    stopRecording();
    await window.electronAPI.voice.dispose();
    setState((prev) => ({ ...prev, isModelLoaded: false }));
    return { success: true };
  }, [stopRecording]);

  return {
    // State
    error: state.error,
    isRecording: state.isRecording,
    isProcessing: state.isProcessing,
    transcript: state.transcript,
    isReady: state.isModelLoaded,

    // Actions
    loadModel,
    stopServer,
    startRecording,
    stopRecording,
  };
}

/**
 * Convert audio blob to PCM buffer (16-bit, 16kHz, mono)
 */
async function convertToPcm(audioBlob: Blob): Promise<Uint8Array> {
  console.log('[convertToPcm] Converting blob, size:', audioBlob.size, 'type:', audioBlob.type);

  if (audioBlob.size === 0) {
    console.warn('[convertToPcm] Empty audio blob');
    return new Uint8Array(0);
  }

  const arrayBuffer = await audioBlob.arrayBuffer();
  console.log('[convertToPcm] ArrayBuffer size:', arrayBuffer.byteLength);

  const audioContext = new AudioContext({ sampleRate: 16000 });

  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    console.log(
      '[convertToPcm] Decoded audio - duration:',
      audioBuffer.duration,
      'channels:',
      audioBuffer.numberOfChannels,
      'sampleRate:',
      audioBuffer.sampleRate
    );
    const pcmData = encodePcm(audioBuffer);
    console.log('[convertToPcm] PCM data size:', pcmData.byteLength);
    return new Uint8Array(pcmData);
  } catch (decodeError) {
    console.error('[convertToPcm] Failed to decode audio:', decodeError);
    throw decodeError;
  } finally {
    await audioContext.close();
  }
}

/**
 * Encode AudioBuffer to raw PCM (16-bit signed integers)
 */
function encodePcm(audioBuffer: AudioBuffer): ArrayBuffer {
  const sampleRate = 16000;

  // Get mono channel
  const samples =
    audioBuffer.numberOfChannels > 1 ? mixToMono(audioBuffer) : audioBuffer.getChannelData(0);

  // Resample to 16kHz if needed
  const resampledSamples =
    audioBuffer.sampleRate !== sampleRate
      ? resample(samples, audioBuffer.sampleRate, sampleRate)
      : samples;

  // Convert to 16-bit PCM
  const buffer = new ArrayBuffer(resampledSamples.length * 2);
  const view = new DataView(buffer);

  for (let i = 0; i < resampledSamples.length; i++) {
    const sample = Math.max(-1, Math.min(1, resampledSamples[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return buffer;
}

function mixToMono(audioBuffer: AudioBuffer): Float32Array {
  const length = audioBuffer.length;
  const result = new Float32Array(length);
  const channels = audioBuffer.numberOfChannels;

  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let ch = 0; ch < channels; ch++) {
      sum += audioBuffer.getChannelData(ch)[i];
    }
    result[i] = sum / channels;
  }

  return result;
}

function resample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  const ratio = fromRate / toRate;
  const newLength = Math.round(samples.length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, samples.length - 1);
    const t = srcIndex - srcIndexFloor;

    result[i] = samples[srcIndexFloor] * (1 - t) + samples[srcIndexCeil] * t;
  }

  return result;
}
