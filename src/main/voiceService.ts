/**
 * Voice Service - Native whisper.cpp speech recognition for Electron main process
 */
import { ipcMain, BrowserWindow, app, systemPreferences } from 'electron';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { whisperModelManager } from './whisperModelManager';

// @ts-ignore - ffmpeg-static exports the path directly
import ffmpegPath from 'ffmpeg-static';

const execFileAsync = promisify(execFile);
const DEFAULT_SAMPLE_RATE = 16000;

async function ensureMicrophonePermission(): Promise<boolean> {
  if (process.platform !== 'darwin') return true;
  const status = systemPreferences.getMediaAccessStatus('microphone');
  if (status === 'granted') return true;
  if (status === 'not-determined') {
    return systemPreferences.askForMediaAccess('microphone');
  }
  return false;
}
const MODEL_EXTENSIONS = ['.bin', '.gguf'];

interface VoiceServiceState {
  isModelLoaded: boolean;
  isRecording: boolean;
  error: string | null;
}

class VoiceService {
  private modelPath: string | null = null;
  private tinyModelPath: string | null = null;
  private whisperBinaryPath: string | null = null;
  private mainWindow: BrowserWindow | null = null;
  private audioChunks: Buffer[] = [];
  private audioLength = 0;
  private state: VoiceServiceState = {
    isModelLoaded: false,
    isRecording: false,
    error: null,
  };

  // Continuous listening state
  private continuousListeningEnabled = false;
  private continuousListeningInterval: NodeJS.Timeout | null = null;
  private mediaRecorder: unknown = null; // Managed by renderer

  constructor() {
    this.setupIpcHandlers();
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  private resolveModelFromPath(pathValue: string): string {
    if (!existsSync(pathValue)) {
      throw new Error(`Whisper model path not found: ${pathValue}`);
    }
    const stats = statSync(pathValue);
    if (stats.isFile()) {
      return pathValue;
    }
    if (stats.isDirectory()) {
      const modelFile = this.findModelInDir(pathValue);
      if (modelFile) {
        return modelFile;
      }
    }
    throw new Error(`Whisper model not found in: ${pathValue}`);
  }

  private findModelInDir(dirPath: string): string | null {
    if (!existsSync(dirPath)) {
      return null;
    }
    const files = readdirSync(dirPath);
    for (const file of files) {
      if (MODEL_EXTENSIONS.some((ext) => file.toLowerCase().endsWith(ext))) {
        return join(dirPath, file);
      }
    }
    return null;
  }

  private getModelPath(): string {
    const envModel = process.env.WHISPER_CPP_MODEL;
    if (envModel) {
      return this.resolveModelFromPath(envModel);
    }

    // Check if model manager has found a model (includes userData path)
    const modelManagerPath = whisperModelManager.getModelPath();
    if (modelManagerPath) {
      return modelManagerPath;
    }

    // Search paths for the model
    const searchPaths: string[] = [];

    // Dev paths
    if (!app.isPackaged) {
      searchPaths.push(join(__dirname, '../../public/whisper-model'));
    }

    // Production paths - userData is primary (writable)
    searchPaths.push(join(app.getPath('userData'), 'whisper-model'));

    // Also check resources folder (for bundled models)
    if (process.resourcesPath) {
      searchPaths.push(join(process.resourcesPath, 'whisper-model'));
      searchPaths.push(join(process.resourcesPath, 'public/whisper-model'));
    }

    for (const searchPath of searchPaths) {
      const modelPath = this.findModelInDir(searchPath);
      if (modelPath) {
        return modelPath;
      }
    }

    throw new Error(
      `Whisper model not found. Checked: ${searchPaths.join(', ')}. Click mic button to download.`
    );
  }

  private getWhisperBinaryPath(): string {
    const envBinary = process.env.WHISPER_CPP_BIN;
    if (envBinary) {
      if (!existsSync(envBinary)) {
        throw new Error(`Whisper binary not found: ${envBinary}`);
      }
      return envBinary;
    }

    // Check if model manager has found a binary
    const modelManagerBinary = whisperModelManager.getBinaryPath();
    if (modelManagerBinary) {
      return modelManagerBinary;
    }

    const binaryNames =
      process.platform === 'win32'
        ? ['whisper-cli.exe', 'main.exe', 'whisper.exe']
        : ['whisper-cli', 'main', 'whisper'];

    const searchPaths: string[] = [];

    // Dev paths
    if (!app.isPackaged) {
      searchPaths.push(join(__dirname, '../../public/whisper-cpp'));
      searchPaths.push(join(__dirname, '../../public/whisper-cpp/Release'));
      searchPaths.push(join(__dirname, '../../public/whisper'));
    }

    // Production paths - userData first (for downloaded binaries)
    searchPaths.push(join(app.getPath('userData'), 'whisper-cpp'));
    searchPaths.push(join(app.getPath('userData'), 'whisper-cpp/Release'));
    searchPaths.push(join(app.getPath('userData'), 'whisper'));

    // Resources folder (for bundled binaries)
    if (process.resourcesPath) {
      searchPaths.push(join(process.resourcesPath, 'whisper-cpp'));
      searchPaths.push(join(process.resourcesPath, 'whisper-cpp/Release'));
      searchPaths.push(join(process.resourcesPath, 'whisper'));
      searchPaths.push(join(process.resourcesPath, 'public/whisper-cpp'));
      searchPaths.push(join(process.resourcesPath, 'public/whisper-cpp/Release'));
      searchPaths.push(join(process.resourcesPath, 'public/whisper'));
    }

    for (const basePath of searchPaths) {
      for (const binaryName of binaryNames) {
        const candidate = join(basePath, binaryName);
        if (existsSync(candidate)) {
          return candidate;
        }
      }
    }

    // Check system PATH (e.g. Homebrew-installed binary)
    const pathDirs = (process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':');
    if (process.platform === 'darwin') {
      pathDirs.push('/opt/homebrew/bin', '/usr/local/bin');
    }
    for (const dir of pathDirs) {
      if (!dir) continue;
      for (const binaryName of binaryNames) {
        const candidate = join(dir, binaryName);
        if (existsSync(candidate)) {
          return candidate;
        }
      }
    }

    throw new Error(`Whisper binary not found. Checked: ${searchPaths.join(', ')}`);
  }

  private findFfmpeg(): string | null {
    // First check ffmpeg-static (bundled)
    if (ffmpegPath && existsSync(ffmpegPath)) {
      return ffmpegPath;
    }

    // Fallback to system ffmpeg
    const ffmpegNames = process.platform === 'win32' ? ['ffmpeg.exe'] : ['ffmpeg'];
    const searchPaths = [
      // System PATH
      ...(process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':'),
      // Common Windows locations
      'C:\\ffmpeg\\bin',
      'C:\\Program Files\\ffmpeg\\bin',
      join(app.getPath('userData'), 'ffmpeg'),
    ];

    for (const basePath of searchPaths) {
      for (const ffmpegName of ffmpegNames) {
        const candidate = join(basePath, ffmpegName);
        if (existsSync(candidate)) {
          return candidate;
        }
      }
    }
    return null;
  }

  private appendAudio(audioData: Buffer) {
    if (!audioData.length) {
      return;
    }
    this.audioChunks.push(audioData);
    this.audioLength += audioData.length;
  }

  private resetAudioBuffer() {
    this.audioChunks = [];
    this.audioLength = 0;
  }

  private buildWavBuffer(pcmBuffer: Buffer): Buffer {
    const header = Buffer.alloc(44);
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = DEFAULT_SAMPLE_RATE * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcmBuffer.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(DEFAULT_SAMPLE_RATE, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcmBuffer.length, 40);

    return Buffer.concat([header, pcmBuffer]);
  }

  private normalizeTranscript(text: string): string {
    const result = text
      .split('\n')
      .map((line) => line.replace(/^\s*\[[0-9:.]+\s*-->\s*[0-9:.]+\]\s*/g, '').trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Whisper outputs [BLANK_AUDIO] when no speech is detected
    if (/^\[.*BLANK.*\]$/i.test(result)) return '';
    return result;
  }

  private async runTranscription(pcmBuffer: Buffer): Promise<string> {
    if (!this.modelPath) {
      this.modelPath = this.getModelPath();
    }
    if (!this.whisperBinaryPath) {
      this.whisperBinaryPath = this.getWhisperBinaryPath();
    }

    const tempDir = mkdtempSync(join(tmpdir(), 'whisper-'));
    const wavPath = join(tempDir, 'input.wav');
    const outputBase = join(tempDir, 'output');
    const outputTextPath = `${outputBase}.txt`;

    console.log('[VoiceService] Running transcription, pcmBuffer size:', pcmBuffer.length);

    try {
      const wavBuffer = this.buildWavBuffer(pcmBuffer);
      writeFileSync(wavPath, wavBuffer);
      console.log('[VoiceService] WAV file written:', wavPath, 'size:', wavBuffer.length);

      const args = ['-m', this.modelPath, '-f', wavPath, '-otxt', '-of', outputBase];

      console.log('[VoiceService] Running whisper:', this.whisperBinaryPath, args.join(' '));

      try {
        await execFileAsync(this.whisperBinaryPath, args, {
          windowsHide: true,
          timeout: 60000, // 60 second timeout
        });
      } catch (execError: any) {
        console.error('[VoiceService] Whisper exec error:', execError.message);
        if (execError.stderr) {
          console.error('[VoiceService] Whisper stderr:', execError.stderr);
        }
        throw execError;
      }

      if (!existsSync(outputTextPath)) {
        console.log('[VoiceService] No output file generated');
        return '';
      }
      const rawText = readFileSync(outputTextPath, 'utf-8');
      console.log('[VoiceService] Transcription result:', rawText.substring(0, 100));
      return this.normalizeTranscript(rawText);
    } finally {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn('[VoiceService] Failed to cleanup temp dir:', cleanupErr);
      }
    }
  }

  private sendToRenderer(channel: string, data: any) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  private setupIpcHandlers() {
    // Load the model
    ipcMain.handle('voice:loadModel', async () => {
      if (this.modelPath && this.whisperBinaryPath) {
        return { success: true, message: 'Model already loaded' };
      }

      try {
        this.modelPath = this.getModelPath();
        this.whisperBinaryPath = this.getWhisperBinaryPath();
        console.log(`[VoiceService] Whisper model: ${this.modelPath}`);
        console.log(`[VoiceService] Whisper binary: ${this.whisperBinaryPath}`);
        this.state.isModelLoaded = true;
        this.state.error = null;

        console.log('[VoiceService] Whisper model ready');
        return { success: true };
      } catch (e: any) {
        console.error('[VoiceService] Failed to load Whisper model:', e);
        this.state.error = e.message;
        return { success: false, error: e.message };
      }
    });

    // Get current state
    ipcMain.handle('voice:getState', () => {
      return this.state;
    });

    // Start recording - creates recognizer
    ipcMain.handle('voice:startRecording', async () => {
      if (!this.modelPath || !this.whisperBinaryPath) {
        return { success: false, error: 'Model not loaded' };
      }

      // Request microphone permission on macOS (triggers OS dialog if needed)
      const micGranted = await ensureMicrophonePermission();
      if (!micGranted) {
        return {
          success: false,
          error:
            'Microphone permission denied. Please enable in System Settings > Privacy & Security > Microphone',
        };
      }

      // If already recording, force reset (handles stuck state)
      if (this.state.isRecording) {
        console.log('[VoiceService] Force resetting stuck recording state');
        this.state.isRecording = false;
        this.resetAudioBuffer();
      }

      try {
        this.resetAudioBuffer();
        this.state.isRecording = true;

        console.log('[VoiceService] Recording started (Whisper)');
        return { success: true };
      } catch (e: any) {
        console.error('[VoiceService] Failed to start recording:', e);
        return { success: false, error: e.message };
      }
    });

    // Process audio data from renderer
    ipcMain.handle('voice:processAudio', async (_event, audioData: Uint8Array) => {
      if (!this.state.isRecording) {
        return { success: false, error: 'Not recording' };
      }

      try {
        // Convert Uint8Array to Buffer for internal use
        const buffer = Buffer.from(audioData);
        this.appendAudio(buffer);
        return { success: true };
      } catch (e: any) {
        console.error('[VoiceService] Error processing audio:', e);
        return { success: false, error: e.message };
      }
    });

    // Stop recording
    ipcMain.handle('voice:stopRecording', async () => {
      if (!this.state.isRecording) {
        return { success: true, text: '' };
      }

      try {
        this.state.isRecording = false;

        if (!this.audioLength) {
          this.resetAudioBuffer();
          return { success: true, text: '' };
        }

        const pcmBuffer = Buffer.concat(this.audioChunks, this.audioLength);
        this.resetAudioBuffer();

        const text = await this.runTranscription(pcmBuffer);
        if (text) {
          this.sendToRenderer('voice:result', { text });
        }

        console.log('[VoiceService] Recording stopped, final text:', text);
        return { success: true, text };
      } catch (e: any) {
        console.error('[VoiceService] Error stopping recording:', e);
        this.state.isRecording = false;
        this.resetAudioBuffer();
        return { success: false, error: e.message };
      }
    });

    // Process and transcribe raw audio data (WebM/Opus from browser)
    ipcMain.handle(
      'voice:processAndTranscribe',
      async (_event, audioData: Uint8Array, mimeType: string) => {
        console.log(
          '[VoiceService] processAndTranscribe called, size:',
          audioData.length,
          'mimeType:',
          mimeType
        );

        // Reset recording state since we're processing
        this.state.isRecording = false;

        if (!this.modelPath || !this.whisperBinaryPath) {
          try {
            this.modelPath = this.getModelPath();
            this.whisperBinaryPath = this.getWhisperBinaryPath();
          } catch (e: any) {
            return { success: false, error: e.message };
          }
        }

        const tempDir = mkdtempSync(join(tmpdir(), 'whisper-'));
        const extension = mimeType.includes('webm')
          ? '.webm'
          : mimeType.includes('ogg')
            ? '.ogg'
            : '.mp4';
        const inputPath = join(tempDir, `input${extension}`);
        const wavPath = join(tempDir, 'input.wav');
        const outputBase = join(tempDir, 'output');
        const outputTextPath = `${outputBase}.txt`;

        try {
          // Write the raw audio data
          writeFileSync(inputPath, Buffer.from(audioData));
          console.log('[VoiceService] Raw audio written:', inputPath);

          // Use ffmpeg to convert to WAV (16kHz, mono, 16-bit)
          // ffmpeg is typically available on Windows or can be bundled
          const ffmpegPath = this.findFfmpeg();
          if (ffmpegPath) {
            console.log('[VoiceService] Using ffmpeg for conversion:', ffmpegPath);
            await execFileAsync(
              ffmpegPath,
              ['-i', inputPath, '-ar', '16000', '-ac', '1', '-sample_fmt', 's16', '-y', wavPath],
              { windowsHide: true }
            );
          } else {
            // Fallback: whisper-cli might support the format directly
            console.log('[VoiceService] No ffmpeg found, trying whisper directly');
            // Copy input as-is and hope whisper can handle it
            writeFileSync(wavPath, Buffer.from(audioData));
          }

          console.log('[VoiceService] Running whisper on:', wavPath);
          const args = ['-m', this.modelPath!, '-f', wavPath, '-otxt', '-of', outputBase];

          await execFileAsync(this.whisperBinaryPath!, args, {
            windowsHide: true,
            timeout: 60000,
          });

          if (!existsSync(outputTextPath)) {
            console.log('[VoiceService] No output file generated');
            return { success: true, text: '' };
          }

          const rawText = readFileSync(outputTextPath, 'utf-8');
          const text = this.normalizeTranscript(rawText);
          console.log('[VoiceService] Transcription result:', text);

          // Don't send via event - the result is returned directly
          return { success: true, text };
        } catch (e: any) {
          console.error('[VoiceService] processAndTranscribe error:', e);
          return { success: false, error: e.message };
        } finally {
          try {
            rmSync(tempDir, { recursive: true, force: true });
          } catch {
            /* ignore */
          }
        }
      }
    );

    // Clean up
    ipcMain.handle('voice:dispose', () => {
      this.modelPath = null;
      this.whisperBinaryPath = null;
      this.resetAudioBuffer();
      this.state.isModelLoaded = false;
      this.state.isRecording = false;
      return { success: true };
    });

    // Load tiny model for wake word detection
    ipcMain.handle('voice:loadTinyModel', async () => {
      try {
        // Check if tiny model exists, download if needed
        const tinyCheck = whisperModelManager.checkTinyModel();
        if (!tinyCheck.exists) {
          const downloadResult = await whisperModelManager.downloadTinyModel();
          if (!downloadResult.success) {
            return { success: false, error: downloadResult.error };
          }
          this.tinyModelPath = downloadResult.path!;
        } else {
          this.tinyModelPath = tinyCheck.path!;
        }

        // Also ensure binary is available
        if (!this.whisperBinaryPath) {
          this.whisperBinaryPath = this.getWhisperBinaryPath();
        }

        console.log('[VoiceService] Tiny model ready:', this.tinyModelPath);
        return { success: true, path: this.tinyModelPath };
      } catch (e: any) {
        console.error('[VoiceService] Failed to load tiny model:', e);
        return { success: false, error: e.message };
      }
    });

    // Process audio for wake word detection (uses tiny model for speed)
    ipcMain.handle(
      'voice:detectWakeWord',
      async (_event, audioData: Uint8Array, mimeType: string) => {
        if (!this.tinyModelPath || !this.whisperBinaryPath) {
          return { success: false, error: 'Tiny model not loaded' };
        }

        const tempDir = mkdtempSync(join(tmpdir(), 'whisper-wake-'));
        const extension = mimeType.includes('webm') ? '.webm' : '.mp4';
        const inputPath = join(tempDir, `input${extension}`);
        const wavPath = join(tempDir, 'input.wav');
        const outputBase = join(tempDir, 'output');
        const outputTextPath = `${outputBase}.txt`;

        try {
          writeFileSync(inputPath, Buffer.from(audioData));

          const ffmpegBin = this.findFfmpeg();
          if (ffmpegBin) {
            await execFileAsync(
              ffmpegBin,
              ['-i', inputPath, '-ar', '16000', '-ac', '1', '-sample_fmt', 's16', '-y', wavPath],
              { windowsHide: true, timeout: 10000 }
            );
          } else {
            writeFileSync(wavPath, Buffer.from(audioData));
          }

          // Run whisper-tiny (should be fast ~0.3-0.5s)
          const args = ['-m', this.tinyModelPath, '-f', wavPath, '-otxt', '-of', outputBase];

          await execFileAsync(this.whisperBinaryPath, args, {
            windowsHide: true,
            timeout: 10000, // 10 second timeout for tiny model
          });

          if (!existsSync(outputTextPath)) {
            return { success: true, text: '', detected: false };
          }

          const rawText = readFileSync(outputTextPath, 'utf-8');
          const text = this.normalizeTranscript(rawText);

          // Normalize for keyword detection - remove punctuation, extra spaces
          const normalizedText = text
            .toLowerCase()
            .replace(/[.,!?;:'"]/g, '') // Remove punctuation
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();

          // Log what we heard for debugging
          if (text.trim()) {
            console.log(
              '[VoiceService] Wake word detection heard:',
              text,
              '| normalized:',
              normalizedText
            );
          }

          // Check for wake words (only with "hey" prefix for intentional activation)
          const wakeWordDetected =
            normalizedText.includes('hey cooper') ||
            (normalizedText.includes('hey') && normalizedText.includes('cooper'));

          // Check for stop words
          const stopWordDetected =
            normalizedText.includes('stop listening') ||
            normalizedText.includes('stop recording') ||
            normalizedText.includes('stop') ||
            normalizedText.includes('done');

          // Check for abort words
          const abortWordDetected =
            normalizedText.includes('abort') ||
            normalizedText.includes('cancel') ||
            normalizedText.includes('nevermind') ||
            normalizedText.includes('never mind');

          if (wakeWordDetected || stopWordDetected || abortWordDetected) {
            console.log(
              '[VoiceService] Keyword detected! wake:',
              wakeWordDetected,
              'stop:',
              stopWordDetected,
              'abort:',
              abortWordDetected
            );
          }

          return {
            success: true,
            text,
            wakeWordDetected,
            stopWordDetected,
            abortWordDetected,
          };
        } catch (e: any) {
          // Timeout or other error - just return empty
          return {
            success: true,
            text: '',
            wakeWordDetected: false,
            stopWordDetected: false,
            abortWordDetected: false,
          };
        } finally {
          try {
            rmSync(tempDir, { recursive: true, force: true });
          } catch {
            /* ignore */
          }
        }
      }
    );
  }

  dispose() {
    this.modelPath = null;
    this.whisperBinaryPath = null;
    this.resetAudioBuffer();
  }
}

// Singleton instance
export const voiceService = new VoiceService();
