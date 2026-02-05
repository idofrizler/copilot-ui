/**
 * Whisper Model Manager - Downloads and manages Whisper GGML models and binaries
 * 
 * Downloads:
 * 1. whisper.cpp binary (for running transcription)
 * 2. whisper model (ggml-small.en.bin ~244MB)
 */
import { ipcMain, BrowserWindow, app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, createWriteStream, readdirSync, statSync, unlinkSync, createReadStream } from 'fs'
import { get as httpsGet } from 'https'
import { pipeline } from 'stream/promises'
import { createGunzip } from 'zlib'
import { Extract } from 'unzipper'

// Whisper model configuration - small model for full transcription
const MODEL_NAME = 'ggml-small.en.bin'
const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin'
const MODEL_SIZE_BYTES = 244_000_000 // ~244MB

// Tiny model for lightweight wake word detection
const TINY_MODEL_NAME = 'ggml-tiny.en.bin'
const TINY_MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin'
const TINY_MODEL_SIZE_BYTES = 39_000_000 // ~39MB

// Whisper binary configuration - using latest stable release
// Windows x64 binary from whisper.cpp releases (repo moved to ggml-org)
const BINARY_VERSION = '1.8.3'
const BINARY_ZIP_URL = `https://github.com/ggml-org/whisper.cpp/releases/download/v${BINARY_VERSION}/whisper-bin-x64.zip`
const BINARY_ZIP_SIZE = 4_000_000 // ~4MB approx

interface ModelManagerState {
  isDownloading: boolean
  downloadProgress: number
  downloadedBytes: number
  totalBytes: number
  currentStep: 'idle' | 'binary' | 'model' | 'tiny-model' | 'extracting' | 'complete'
  error: string | null
  modelPath: string | null
  tinyModelPath: string | null
  binaryPath: string | null
}

class WhisperModelManager {
  private mainWindow: BrowserWindow | null = null
  private state: ModelManagerState = {
    isDownloading: false,
    downloadProgress: 0,
    downloadedBytes: 0,
    totalBytes: MODEL_SIZE_BYTES,
    currentStep: 'idle',
    error: null,
    modelPath: null,
    tinyModelPath: null,
    binaryPath: null,
  }

  constructor() {
    this.setupIpcHandlers()
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window
  }

  /**
   * Get the directory where the whisper model should be stored.
   */
  getModelDir(): string {
    const envModel = process.env.WHISPER_CPP_MODEL
    if (envModel && existsSync(envModel)) {
      const stats = statSync(envModel)
      if (stats.isDirectory()) {
        return envModel
      }
      return join(envModel, '..')
    }

    const isDev = !app.isPackaged
    if (isDev) {
      return join(__dirname, '../../public/whisper-model')
    }

    return join(app.getPath('userData'), 'whisper-model')
  }

  /**
   * Get the directory where the whisper binary should be stored.
   */
  getBinaryDir(): string {
    const envBinary = process.env.WHISPER_CPP_BIN
    if (envBinary && existsSync(envBinary)) {
      return join(envBinary, '..')
    }

    const isDev = !app.isPackaged
    if (isDev) {
      return join(__dirname, '../../public/whisper-cpp')
    }

    return join(app.getPath('userData'), 'whisper-cpp')
  }

  private findExistingModel(dir: string): string | null {
    if (!existsSync(dir)) {
      return null
    }
    
    const files = readdirSync(dir)
    for (const file of files) {
      if (file.endsWith('.bin') || file.endsWith('.gguf')) {
        return join(dir, file)
      }
    }
    return null
  }

  private findExistingBinary(dir: string): string | null {
    if (!existsSync(dir)) {
      return null
    }
    
    const binaryNames = process.platform === 'win32'
      ? ['whisper-cli.exe', 'main.exe', 'whisper.exe']
      : ['whisper-cli', 'main', 'whisper']
    
    // Search recursively (zip may extract to a subdirectory like Release/)
    const searchDir = (searchPath: string): string | null => {
      const entries = readdirSync(searchPath, { withFileTypes: true })
      
      // First check for binaries in current directory
      for (const binaryName of binaryNames) {
        const found = entries.find(e => e.isFile() && e.name === binaryName)
        if (found) {
          return join(searchPath, found.name)
        }
      }
      
      // Then search subdirectories
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const result = searchDir(join(searchPath, entry.name))
          if (result) return result
        }
      }
      
      return null
    }
    
    return searchDir(dir)
  }

  checkModel(): { exists: boolean; path?: string; size?: number; binaryExists?: boolean; binaryPath?: string } {
    const modelDir = this.getModelDir()
    const binaryDir = this.getBinaryDir()
    
    const modelPath = this.findExistingModel(modelDir)
    const binaryPath = this.findExistingBinary(binaryDir)
    
    const result: { exists: boolean; path?: string; size?: number; binaryExists?: boolean; binaryPath?: string } = {
      exists: false,
      binaryExists: !!binaryPath,
      binaryPath: binaryPath ?? undefined,
    }
    
    if (modelPath && existsSync(modelPath)) {
      const stats = statSync(modelPath)
      this.state.modelPath = modelPath
      result.exists = true
      result.path = modelPath
      result.size = stats.size
      console.log(`[WhisperModelManager] Found model at ${modelPath}`)
    } else {
      console.log(`[WhisperModelManager] No model found in ${modelDir}`)
    }
    
    if (binaryPath) {
      this.state.binaryPath = binaryPath
      console.log(`[WhisperModelManager] Found binary at ${binaryPath}`)
    } else {
      console.log(`[WhisperModelManager] No binary found in ${binaryDir}`)
    }
    
    return result
  }

  /**
   * Download a file with redirect support
   */
  private downloadFile(url: string, destPath: string, onProgress: (downloaded: number, total: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const downloadWithRedirects = (currentUrl: string, redirectCount = 0): void => {
        if (redirectCount > 10) {
          reject(new Error('Too many redirects'))
          return
        }

        httpsGet(currentUrl, (response) => {
          // Handle redirects
          if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
            const redirectUrl = response.headers.location
            if (redirectUrl) {
              console.log(`[WhisperModelManager] Following redirect to ${redirectUrl}`)
              downloadWithRedirects(redirectUrl, redirectCount + 1)
              return
            }
          }

          if (response.statusCode !== 200) {
            reject(new Error(`HTTP ${response.statusCode}`))
            return
          }

          const totalBytes = parseInt(response.headers['content-length'] || '0', 10)
          let downloadedBytes = 0

          const fileStream = createWriteStream(destPath)
          
          response.on('data', (chunk: Buffer) => {
            downloadedBytes += chunk.length
            onProgress(downloadedBytes, totalBytes)
          })

          pipeline(response, fileStream)
            .then(() => resolve())
            .catch((err) => {
              if (existsSync(destPath)) {
                try { unlinkSync(destPath) } catch { /* ignore */ }
              }
              reject(err)
            })
        }).on('error', reject)
      }

      downloadWithRedirects(url)
    })
  }

  /**
   * Download and extract the whisper binary
   */
  private async downloadBinary(): Promise<{ success: boolean; path?: string; error?: string }> {
    const binaryDir = this.getBinaryDir()
    const existingBinary = this.findExistingBinary(binaryDir)
    
    if (existingBinary) {
      return { success: true, path: existingBinary }
    }

    // Ensure directory exists
    if (!existsSync(binaryDir)) {
      mkdirSync(binaryDir, { recursive: true })
    }

    const zipPath = join(binaryDir, 'whisper-bin.zip')
    
    this.state.currentStep = 'binary'
    this.sendProgressUpdate('Downloading whisper binary...')
    console.log(`[WhisperModelManager] Downloading binary from ${BINARY_ZIP_URL}`)

    try {
      await this.downloadFile(BINARY_ZIP_URL, zipPath, (downloaded, total) => {
        const progress = total > 0 ? Math.round((downloaded / total) * 100) : 0
        this.state.downloadProgress = progress
        this.state.downloadedBytes = downloaded
        this.state.totalBytes = total || BINARY_ZIP_SIZE
        
        if (downloaded % (500 * 1024) < 50000) { // Update every ~500KB
          const mbDownloaded = (downloaded / (1024 * 1024)).toFixed(1)
          this.sendProgressUpdate(`Downloading binary... ${mbDownloaded}MB`)
        }
      })

      // Extract the zip
      this.state.currentStep = 'extracting'
      this.sendProgressUpdate('Extracting binary...')
      console.log(`[WhisperModelManager] Extracting ${zipPath} to ${binaryDir}`)

      await new Promise<void>((resolve, reject) => {
        createReadStream(zipPath)
          .pipe(Extract({ path: binaryDir }))
          .on('close', resolve)
          .on('error', reject)
      })

      // Clean up zip file
      try { unlinkSync(zipPath) } catch { /* ignore */ }

      // Find the extracted binary
      const binaryPath = this.findExistingBinary(binaryDir)
      if (binaryPath) {
        this.state.binaryPath = binaryPath
        console.log(`[WhisperModelManager] Binary ready at ${binaryPath}`)
        return { success: true, path: binaryPath }
      } else {
        return { success: false, error: 'Binary not found after extraction' }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[WhisperModelManager] Binary download failed:`, message)
      // Clean up
      if (existsSync(zipPath)) {
        try { unlinkSync(zipPath) } catch { /* ignore */ }
      }
      return { success: false, error: message }
    }
  }

  /**
   * Download the whisper model
   */
  private async downloadModelFile(): Promise<{ success: boolean; path?: string; error?: string }> {
    const modelDir = this.getModelDir()
    const existingModel = this.findExistingModel(modelDir)
    
    if (existingModel) {
      return { success: true, path: existingModel }
    }

    // Ensure directory exists
    if (!existsSync(modelDir)) {
      mkdirSync(modelDir, { recursive: true })
    }

    const modelPath = join(modelDir, MODEL_NAME)
    
    this.state.currentStep = 'model'
    this.sendProgressUpdate('Downloading speech model...')
    console.log(`[WhisperModelManager] Downloading model from ${MODEL_URL}`)

    try {
      await this.downloadFile(MODEL_URL, modelPath, (downloaded, total) => {
        const actualTotal = total || MODEL_SIZE_BYTES
        const progress = Math.round((downloaded / actualTotal) * 100)
        this.state.downloadProgress = progress
        this.state.downloadedBytes = downloaded
        this.state.totalBytes = actualTotal
        
        if (downloaded % (1024 * 1024) < 50000) { // Update every ~1MB
          const mbDownloaded = (downloaded / (1024 * 1024)).toFixed(1)
          const mbTotal = (actualTotal / (1024 * 1024)).toFixed(1)
          this.sendProgressUpdate(`Downloading model... ${mbDownloaded}MB / ${mbTotal}MB`)
        }
      })

      this.state.modelPath = modelPath
      console.log(`[WhisperModelManager] Model downloaded to ${modelPath}`)
      return { success: true, path: modelPath }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[WhisperModelManager] Model download failed:`, message)
      return { success: false, error: message }
    }
  }

  /**
   * Download both binary and model if needed
   */
  async downloadModel(): Promise<{ success: boolean; path?: string; error?: string }> {
    if (this.state.isDownloading) {
      return { success: false, error: 'Download already in progress' }
    }

    // Check what we already have
    const check = this.checkModel()
    if (check.exists && check.binaryExists) {
      return { success: true, path: check.path }
    }

    this.state.isDownloading = true
    this.state.downloadProgress = 0
    this.state.downloadedBytes = 0
    this.state.error = null

    try {
      // Download binary first (smaller, faster)
      if (!check.binaryExists) {
        const binaryResult = await this.downloadBinary()
        if (!binaryResult.success) {
          this.state.isDownloading = false
          this.state.error = binaryResult.error || 'Binary download failed'
          return { success: false, error: this.state.error }
        }
      }

      // Then download model
      if (!check.exists) {
        const modelResult = await this.downloadModelFile()
        if (!modelResult.success) {
          this.state.isDownloading = false
          this.state.error = modelResult.error || 'Model download failed'
          return { success: false, error: this.state.error }
        }
      }

      this.state.isDownloading = false
      this.state.currentStep = 'complete'
      this.state.downloadProgress = 100
      this.sendProgressUpdate('Setup complete!')
      
      return { success: true, path: this.state.modelPath ?? undefined }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.state.isDownloading = false
      this.state.error = message
      return { success: false, error: message }
    }
  }

  /**
   * Check if tiny model exists
   */
  checkTinyModel(): { exists: boolean; path?: string } {
    const modelDir = this.getModelDir()
    const tinyModelPath = join(modelDir, TINY_MODEL_NAME)
    
    if (existsSync(tinyModelPath)) {
      this.state.tinyModelPath = tinyModelPath
      return { exists: true, path: tinyModelPath }
    }
    
    return { exists: false }
  }

  /**
   * Download tiny model for wake word detection
   */
  async downloadTinyModel(): Promise<{ success: boolean; path?: string; error?: string }> {
    if (this.state.isDownloading) {
      return { success: false, error: 'Download already in progress' }
    }

    // Check if already exists
    const existing = this.checkTinyModel()
    if (existing.exists) {
      return { success: true, path: existing.path }
    }

    try {
      this.state.isDownloading = true
      this.state.currentStep = 'tiny-model'
      this.state.totalBytes = TINY_MODEL_SIZE_BYTES
      this.state.downloadedBytes = 0
      this.state.downloadProgress = 0
      this.state.error = null

      const modelDir = this.getModelDir()
      if (!existsSync(modelDir)) {
        mkdirSync(modelDir, { recursive: true })
      }

      const tinyModelPath = join(modelDir, TINY_MODEL_NAME)
      this.sendProgressUpdate('Downloading wake word model (~39MB)...')

      await this.downloadFile(TINY_MODEL_URL, tinyModelPath, (downloaded, total) => {
        this.state.downloadedBytes = downloaded
        this.state.totalBytes = total || TINY_MODEL_SIZE_BYTES
        this.state.downloadProgress = Math.round((downloaded / (total || TINY_MODEL_SIZE_BYTES)) * 100)
        this.sendProgressUpdate(`Downloading wake word model: ${this.state.downloadProgress}%`)
      })

      this.state.tinyModelPath = tinyModelPath
      this.state.isDownloading = false
      this.state.currentStep = 'complete'
      this.sendProgressUpdate('Wake word model ready')

      return { success: true, path: tinyModelPath }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.state.isDownloading = false
      this.state.error = message
      return { success: false, error: message }
    }
  }

  getTinyModelPath(): string | null {
    const check = this.checkTinyModel()
    return check.exists ? check.path ?? null : null
  }

  private sendProgressUpdate(status: string) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('voiceServer:downloadProgress', {
        progress: this.state.downloadProgress,
        downloaded: this.state.downloadedBytes,
        total: this.state.totalBytes,
        status,
        step: this.state.currentStep,
      })
    }
  }

  private setupIpcHandlers() {
    ipcMain.handle('voiceServer:checkModel', () => {
      return this.checkModel()
    })

    ipcMain.handle('voiceServer:downloadModel', async () => {
      return this.downloadModel()
    })

    ipcMain.handle('voiceServer:checkTinyModel', () => {
      return this.checkTinyModel()
    })

    ipcMain.handle('voiceServer:downloadTinyModel', async () => {
      return this.downloadTinyModel()
    })
  }

  getModelPath(): string | null {
    const check = this.checkModel()
    return check.exists ? check.path ?? null : null
  }

  getBinaryPath(): string | null {
    const check = this.checkModel()
    return check.binaryExists ? check.binaryPath ?? null : null
  }
}

// Singleton instance
export const whisperModelManager = new WhisperModelManager()
