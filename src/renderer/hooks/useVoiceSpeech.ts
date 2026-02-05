/**
 * Voice Speech Hook - Keywords and TTS functionality
 * 
 * NOTE: STT is now handled by whisper.cpp via useVoiceServer hook.
 * This hook provides:
 * - Voice keyword definitions for UI
 * - Text-to-Speech using browser's SpeechSynthesis
 */
import { useState, useCallback, useRef, useEffect } from 'react';

// Keyword definitions (from mobile app)
export const VOICE_KEYWORDS = {
  wake: ['hey copilot', 'hey github'],  // Only with "hey" prefix for intentional activation
  stop: ['stop listening', 'stop recording', 'stop', 'done'],
  abort: ['abort', 'cancel', 'nevermind', 'never mind'],
  extend: ['extend', 'continue', 'add more', 'keep going'],
  mute: ['mute copilot', 'mute voice', 'go silent', 'be quiet', 'silence'],
  unmute: ['unmute copilot', 'unmute voice', 'speak again', 'voice on'],
};

export interface VoiceSpeechState {
  isRecording: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  transcript: string;
  error: string | null;
  isSupported: boolean;
  isModelLoading: boolean;
  modelLoaded: boolean;
}

export interface UseVoiceSpeechReturn extends VoiceSpeechState {
  startRecording: () => void;
  stopRecording: () => void;
  toggleRecording: () => void;
  speak: (text: string) => Promise<void>;
  stopSpeaking: () => void;
  toggleMute: () => void;
  clearTranscript: () => void;
  loadModel: () => Promise<void>;
  keywords: typeof VOICE_KEYWORDS;
}

export function useVoiceSpeech(): UseVoiceSpeechReturn {
  // STT state - now handled by MicButton/useVoiceServer, kept for interface compatibility
  const [isRecording] = useState(false);
  const [isProcessing] = useState(false);
  const [transcript] = useState('');
  const [error] = useState<string | null>(null);
  const [isModelLoading] = useState(false);
  const [modelLoaded] = useState(false);
  
  // TTS state
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Check browser support for TTS
  const isSupported = typeof window !== 'undefined' && !!window.speechSynthesis;

  // Stub functions for STT (now handled by MicButton)
  const startRecording = useCallback(() => {
    console.log('[useVoiceSpeech] STT is now handled by MicButton/useVoiceServer');
  }, []);

  const stopRecording = useCallback(() => {}, []);
  const toggleRecording = useCallback(() => {}, []);
  const clearTranscript = useCallback(() => {}, []);
  const loadModel = useCallback(async () => {}, []);

  // Text-to-Speech (uses browser's SpeechSynthesis - works offline)
  const speak = useCallback(async (text: string): Promise<void> => {
    if (isMuted || !text.trim() || !window.speechSynthesis) return;

    return new Promise((resolve) => {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      // Clean text for TTS (remove markdown, code blocks, etc.)
      let cleanText = text
        .replace(/```[\s\S]*?```/g, '') // Remove code blocks
        .replace(/`([^`]+)`/g, '$1') // Remove inline code markers
        .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
        .replace(/\*([^*]+)\*/g, '$1') // Remove italic
        .replace(/__([^_]+)__/g, '$1') // Remove underline bold
        .replace(/_([^_]+)_/g, '$1') // Remove underline italic
        .replace(/^#+\s*/gm, '') // Remove markdown headers
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links, keep text
        .replace(/^\s*[-•]\s*/gm, '') // Remove bullet points
        .replace(/^\s*\d+\.\s*/gm, '') // Remove numbered lists
        .replace(/\n+/g, '. ') // Convert newlines to periods
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();

      // Limit length for TTS
      if (cleanText.length > 500) {
        const sentences = cleanText.split('. ');
        cleanText = sentences.slice(0, 3).join('. ') + '.';
      }

      if (!cleanText) {
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 0.9;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        resolve();
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }, [isMuted]);

  const stopSpeaking = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      if (!prev) {
        // Muting - stop any current speech
        stopSpeaking();
      }
      return !prev;
    });
  }, [stopSpeaking]);

  return {
    isRecording,
    isProcessing,
    isSpeaking,
    isMuted,
    transcript,
    error,
    isSupported,
    isModelLoading,
    modelLoaded,
    startRecording,
    stopRecording,
    toggleRecording,
    speak,
    stopSpeaking,
    toggleMute,
    clearTranscript,
    loadModel,
    keywords: VOICE_KEYWORDS,
  };
}
