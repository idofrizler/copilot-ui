// Simple notification sound using Web Audio API
let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext => {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
};

/**
 * Play a simple notification beep sound
 */
export const playNotificationSound = (): void => {
  try {
    const ctx = getAudioContext();
    
    // Create oscillator for a pleasant notification tone
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    // Pleasant notification frequency (around C6)
    oscillator.frequency.setValueAtTime(1047, ctx.currentTime);
    oscillator.type = "sine";
    
    // Quick fade in and out for a soft "ding"
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.01);
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.15);
  } catch (error) {
    console.warn("Failed to play notification sound:", error);
  }
};
