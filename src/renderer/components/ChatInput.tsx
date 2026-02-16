import React, { useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  FileIcon,
  CloseIcon,
  PaperclipIcon,
  ImageIcon,
  StopIcon,
  MicButton,
  TerminalIcon,
} from './';
import { Status, ImageAttachment, FileAttachment } from '../types';

export interface ChatInputProps {
  status: Status;
  isProcessing: boolean;
  activeTabModel: string;
  modelCapabilities: Record<string, { supportsVision: boolean }>;
  terminalAttachment: { output: string; lineCount: number } | null;
  lisaEnabled: boolean;
  ralphEnabled: boolean;
  isMobile: boolean;
  pushToTalk: boolean;
  alwaysListening: boolean;
  voiceAutoSendCountdown: number | null;
  onSendMessage: () => void;
  onStop: () => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  onRemoveTerminalAttachment: () => void;
  onAlwaysListeningError: (error: string | null) => void;
  onAbortDetected: () => void;
  onCancelVoiceAutoSend: () => void;
  onStartVoiceAutoSend: () => void;
  onOpenSettings: () => void;
  children?: React.ReactNode; // For selectors
}

export interface ChatInputHandle {
  getValue: () => string;
  setValue: (value: string) => void;
  getImageAttachments: () => ImageAttachment[];
  setImageAttachments: (attachments: ImageAttachment[]) => void;
  getFileAttachments: () => FileAttachment[];
  setFileAttachments: (attachments: FileAttachment[]) => void;
  addImageAttachment: (attachment: ImageAttachment) => void;
  addFileAttachment: (attachment: FileAttachment) => void;
  removeImageAttachment: (id: string) => void;
  removeFileAttachment: (id: string) => void;
  focus: () => void;
  clearAll: () => void;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>((props, ref) => {
  const {
    status,
    isProcessing,
    activeTabModel,
    modelCapabilities,
    terminalAttachment,
    lisaEnabled,
    ralphEnabled,
    isMobile,
    pushToTalk,
    alwaysListening,
    voiceAutoSendCountdown,
    onSendMessage,
    onStop,
    onKeyPress,
    onRemoveTerminalAttachment,
    onAlwaysListeningError,
    onAbortDetected,
    onCancelVoiceAutoSend,
    onStartVoiceAutoSend,
    onOpenSettings,
    children,
  } = props;

  // Local state - isolated from parent
  const [inputValue, setInputValue] = useState('');
  const [imageAttachments, setImageAttachments] = useState<ImageAttachment[]>([]);
  const [fileAttachments, setFileAttachments] = useState<FileAttachment[]>([]);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Expose methods to parent via ref
  useImperativeHandle(
    ref,
    () => ({
      getValue: () => inputValue,
      setValue: (value: string) => setInputValue(value),
      getImageAttachments: () => imageAttachments,
      setImageAttachments,
      getFileAttachments: () => fileAttachments,
      setFileAttachments,
      addImageAttachment: (attachment: ImageAttachment) =>
        setImageAttachments((prev) => [...prev, attachment]),
      addFileAttachment: (attachment: FileAttachment) =>
        setFileAttachments((prev) => [...prev, attachment]),
      removeImageAttachment: (id: string) =>
        setImageAttachments((prev) => prev.filter((img) => img.id !== id)),
      removeFileAttachment: (id: string) =>
        setFileAttachments((prev) => prev.filter((file) => file.id !== id)),
      focus: () => inputRef.current?.focus(),
      clearAll: () => {
        setInputValue('');
        setImageAttachments([]);
        setFileAttachments([]);
        // Reset textarea height
        if (inputRef.current) {
          inputRef.current.style.height = 'auto';
        }
      },
    }),
    [inputValue, imageAttachments, fileAttachments]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInputValue(e.target.value);
      // Cancel auto-send if user starts typing
      if (voiceAutoSendCountdown !== null) {
        onCancelVoiceAutoSend();
      }
    },
    [voiceAutoSendCountdown, onCancelVoiceAutoSend]
  );

  const handleTranscript = useCallback(
    (text: string) => {
      if (text.trim()) {
        setInputValue((prev) => (prev ? prev + ' ' + text : text));
        // Start auto-send countdown if always listening is enabled
        if (alwaysListening) {
          onStartVoiceAutoSend();
        }
      }
    },
    [alwaysListening, onStartVoiceAutoSend]
  );

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageFiles: File[] = [];
    const otherFiles: File[] = [];

    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          if (file.type.startsWith('image/')) {
            imageFiles.push(file);
          } else {
            otherFiles.push(file);
          }
        }
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      // Process images - need to save to temp file for SDK
      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const reader = new FileReader();
        reader.onload = async (e) => {
          const dataUrl = e.target?.result as string;
          if (dataUrl) {
            // Save to temp file for SDK
            const filename = `image-${Date.now()}-${i}${file.name.substring(file.name.lastIndexOf('.'))}`;
            const result = await window.electronAPI.copilot.saveImageToTemp(dataUrl, filename);

            if (result.success && result.path) {
              setImageAttachments((prev) => [
                ...prev,
                {
                  id: `img-${Date.now()}-${i}-${Math.random()}`,
                  path: result.path,
                  previewUrl: dataUrl,
                  name: file.name,
                  size: file.size,
                  mimeType: file.type,
                },
              ]);
            }
          }
        };
        reader.readAsDataURL(file);
      }
    } else if (otherFiles.length > 0) {
      e.preventDefault();
      // Process files - need to save to temp file for SDK
      for (let i = 0; i < otherFiles.length; i++) {
        const file = otherFiles[i];
        const reader = new FileReader();
        reader.onload = async (e) => {
          const dataUrl = e.target?.result as string;
          if (dataUrl) {
            // Save to temp file for SDK
            const ext = file.name.substring(file.name.lastIndexOf('.'));
            const filename = `file-${Date.now()}-${i}${ext}`;
            const mimeType = file.type || 'application/octet-stream';
            const result = await window.electronAPI.copilot.saveFileToTemp(
              dataUrl,
              filename,
              mimeType
            );

            if (result.success && result.path) {
              setFileAttachments((prev) => [
                ...prev,
                {
                  id: `file-${Date.now()}-${i}-${Math.random()}`,
                  path: result.path,
                  name: file.name,
                  size: file.size,
                  mimeType: mimeType,
                },
              ]);
            }
          }
        };
        reader.readAsDataURL(file);
      }
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const items = Array.from(e.dataTransfer.items);
    const hasImages = items.some((item) => item.kind === 'file' && item.type.startsWith('image/'));
    const hasFiles = items.some((item) => item.kind === 'file' && !item.type.startsWith('image/'));
    setIsDraggingImage(hasImages);
    setIsDraggingFile(hasFiles && !hasImages);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x <= rect.left || x >= rect.right || y <= rect.top || y >= rect.bottom) {
      setIsDraggingImage(false);
      setIsDraggingFile(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingImage(false);
    setIsDraggingFile(false);

    const items = Array.from(e.dataTransfer.items);
    const imageFiles: File[] = [];
    const otherFiles: File[] = [];

    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          if (file.type.startsWith('image/')) {
            imageFiles.push(file);
          } else {
            otherFiles.push(file);
          }
        }
      }
    }

    // Process image files - save to temp for SDK
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) {
          // Save to temp file for SDK
          const filename = `image-${Date.now()}-${i}${file.name.substring(file.name.lastIndexOf('.'))}`;
          const result = await window.electronAPI.copilot.saveImageToTemp(dataUrl, filename);

          if (result.success && result.path) {
            setImageAttachments((prev) => [
              ...prev,
              {
                id: `img-${Date.now()}-${i}-${Math.random()}`,
                path: result.path,
                previewUrl: dataUrl,
                name: file.name,
                size: file.size,
                mimeType: file.type,
              },
            ]);
          }
        }
      };
      reader.readAsDataURL(file);
    }

    // Process other files - save to temp for SDK
    for (let i = 0; i < otherFiles.length; i++) {
      const file = otherFiles[i];
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) {
          // Save to temp file for SDK
          const ext = file.name.substring(file.name.lastIndexOf('.'));
          const filename = `file-${Date.now()}-${i}${ext}`;
          const mimeType = file.type || 'application/octet-stream';
          const result = await window.electronAPI.copilot.saveFileToTemp(
            dataUrl,
            filename,
            mimeType
          );

          if (result.success && result.path) {
            setFileAttachments((prev) => [
              ...prev,
              {
                id: `file-${Date.now()}-${i}-${Math.random()}`,
                path: result.path,
                name: file.name,
                size: file.size,
                mimeType: mimeType,
              },
            ]);
          }
        }
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) {
          // Save to temp file for SDK
          const filename = `image-${Date.now()}-${i}${file.name.substring(file.name.lastIndexOf('.'))}`;
          const result = await window.electronAPI.copilot.saveImageToTemp(dataUrl, filename);

          if (result.success && result.path) {
            setImageAttachments((prev) => [
              ...prev,
              {
                id: `img-${Date.now()}-${i}-${Math.random()}`,
                path: result.path,
                previewUrl: dataUrl,
                name: file.name,
                size: file.size,
                mimeType: file.type,
              },
            ]);
          }
        }
      };
      reader.readAsDataURL(file);
    }
    // Reset input
    e.target.value = '';
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) {
          // Save to temp file for SDK
          const ext = file.name.substring(file.name.lastIndexOf('.'));
          const filename = `file-${Date.now()}-${i}${ext}`;
          const mimeType = file.type || 'application/octet-stream';
          const result = await window.electronAPI.copilot.saveFileToTemp(
            dataUrl,
            filename,
            mimeType
          );

          if (result.success && result.path) {
            setFileAttachments((prev) => [
              ...prev,
              {
                id: `file-${Date.now()}-${i}-${Math.random()}`,
                path: result.path,
                name: file.name,
                size: file.size,
                mimeType: mimeType,
              },
            ]);
          }
        }
      };
      reader.readAsDataURL(file);
    }
    // Reset input
    e.target.value = '';
  }, []);

  const placeholder =
    isDraggingImage || isDraggingFile
      ? 'Drop files here...'
      : isProcessing
        ? isMobile
          ? 'Inject message...'
          : 'Type to inject message to agent...'
        : lisaEnabled
          ? isMobile
            ? 'Describe task...'
            : 'Describe task for multi-phase analysis (Plan → Execute → Validate → Review)...'
          : ralphEnabled
            ? isMobile
              ? 'Describe task...'
              : 'Describe task with clear completion criteria...'
            : isMobile
              ? 'Ask Cooper...'
              : 'Ask Cooper... (Shift+Enter for new line)';

  const hasContent =
    inputValue.trim() ||
    terminalAttachment ||
    imageAttachments.length > 0 ||
    fileAttachments.length > 0;

  return (
    <>
      {/* Terminal Attachment Indicator */}
      {terminalAttachment && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-copilot-surface border border-b-0 border-copilot-border rounded-t-lg">
          <TerminalIcon size={12} className="text-copilot-accent shrink-0" />
          <span className="text-xs text-copilot-text">
            Terminal output: {terminalAttachment.lineCount} lines
          </span>
          <button
            onClick={onRemoveTerminalAttachment}
            className="ml-auto text-copilot-text-muted hover:text-copilot-text text-xs"
            title="Remove terminal output"
          >
            ✕
          </button>
        </div>
      )}

      {/* Image Attachments Preview */}
      {imageAttachments.length > 0 && (
        <div
          className={`flex flex-wrap gap-2 p-2 bg-copilot-surface border border-b-0 border-copilot-border ${terminalAttachment ? '' : 'rounded-t-lg'}`}
        >
          {imageAttachments.map((img) => (
            <div key={img.id} className="relative group">
              <img
                src={img.previewUrl}
                alt={img.name}
                className="h-16 w-auto rounded border border-copilot-border object-cover"
              />
              <button
                onClick={() => setImageAttachments((prev) => prev.filter((i) => i.id !== img.id))}
                className="absolute -top-1.5 -right-1.5 bg-copilot-error text-white rounded-full w-4 h-4 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove image"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* File Attachments Preview */}
      {fileAttachments.length > 0 && (
        <div
          className={`flex flex-wrap gap-2 p-2 bg-copilot-surface border border-b-0 border-copilot-border ${terminalAttachment || imageAttachments.length > 0 ? '' : 'rounded-t-lg'}`}
        >
          {fileAttachments.map((file) => (
            <div
              key={file.id}
              className="relative group flex items-center gap-2 px-2 py-1.5 bg-copilot-bg rounded border border-copilot-border"
            >
              <FileIcon size={16} className="text-copilot-text-muted shrink-0" />
              <div className="flex flex-col min-w-0">
                <span
                  className="text-xs text-copilot-text truncate max-w-[120px]"
                  title={file.name}
                >
                  {file.name}
                </span>
                <span className="text-[10px] text-copilot-text-muted">
                  {(file.size / 1024).toFixed(1)} KB
                </span>
              </div>
              <button
                onClick={() => setFileAttachments((prev) => prev.filter((f) => f.id !== file.id))}
                className="shrink-0 text-copilot-text-muted hover:text-copilot-error transition-colors"
                title="Remove file"
              >
                <CloseIcon size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Vision Warning */}
      {imageAttachments.length > 0 &&
        activeTabModel &&
        modelCapabilities[activeTabModel] &&
        !modelCapabilities[activeTabModel].supportsVision && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-copilot-warning/10 border border-b-0 border-copilot-warning/30 text-copilot-warning text-xs">
            <span>⚠️</span>
            <span>
              The current model ({activeTabModel}) may not support image processing. If images
              aren't recognized, try switching models.
            </span>
          </div>
        )}

      <div
        className={`relative flex flex-col bg-copilot-bg border border-copilot-border focus-within:border-copilot-accent transition-colors ${terminalAttachment || imageAttachments.length > 0 || fileAttachments.length > 0 || (imageAttachments.length > 0 && activeTabModel && modelCapabilities[activeTabModel] && !modelCapabilities[activeTabModel].supportsVision) ? 'rounded-b-lg' : 'rounded-lg'} ${isDraggingImage || isDraggingFile ? 'border-copilot-accent border-dashed bg-copilot-accent/5' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex items-center">
          {/* Hidden file inputs */}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageSelect}
            className="hidden"
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={onKeyPress}
            onPaste={handlePaste}
            placeholder={placeholder}
            className="flex-1 bg-transparent py-2.5 pl-3 pr-2 text-copilot-text placeholder-copilot-text-muted outline-none text-sm resize-none min-h-[40px] max-h-[200px]"
            disabled={status !== 'connected'}
            autoFocus
            rows={1}
            style={{ height: 'auto' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 200) + 'px';
            }}
          />
          {/* Audio Input (Mic) Button */}
          {!isProcessing && (
            <MicButton
              onTranscript={handleTranscript}
              className="shrink-0"
              pushToTalk={pushToTalk}
              alwaysListening={alwaysListening}
              onAlwaysListeningError={onAlwaysListeningError}
              onAbortDetected={onAbortDetected}
              onOpenSettings={onOpenSettings}
            />
          )}
          {/* File Attach Button */}
          {!isProcessing && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`shrink-0 p-1.5 transition-colors ${
                fileAttachments.length > 0
                  ? 'text-copilot-accent'
                  : 'text-copilot-text-muted hover:text-copilot-text'
              }`}
              title="Attach file (or drag & drop, or paste)"
            >
              <PaperclipIcon size={18} />
            </button>
          )}
          {/* Image Attach Button */}
          {!isProcessing && (
            <button
              onClick={() => imageInputRef.current?.click()}
              className={`shrink-0 p-1.5 transition-colors ${
                imageAttachments.length > 0
                  ? 'text-copilot-accent'
                  : 'text-copilot-text-muted hover:text-copilot-text'
              }`}
              title="Attach image (or drag & drop, or paste)"
            >
              <ImageIcon size={18} />
            </button>
          )}
          {isProcessing ? (
            <>
              {/* Send button while processing - queues message */}
              {hasContent && (
                <button
                  onClick={onSendMessage}
                  disabled={status !== 'connected'}
                  className="shrink-0 px-3 py-2.5 text-copilot-warning hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-medium transition-colors"
                  title="Send message (will be queued until agent finishes)"
                >
                  Send
                </button>
              )}
              {/* Stop button */}
              <button
                onClick={onStop}
                className="shrink-0 px-4 py-2.5 text-copilot-error hover:brightness-110 text-xs font-medium transition-colors flex items-center gap-1.5"
                title={lisaEnabled ? 'Stop Lisa Loop' : ralphEnabled ? 'Stop Ralph Loop' : 'Stop'}
              >
                <StopIcon size={10} />
                {ralphEnabled || lisaEnabled ? 'Stop Loop' : 'Stop'}
              </button>
            </>
          ) : (
            <div className="relative">
              <button
                onClick={() => {
                  onCancelVoiceAutoSend();
                  onSendMessage();
                }}
                disabled={!hasContent || status !== 'connected'}
                className={`shrink-0 px-4 py-2.5 hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-medium transition-colors ${
                  voiceAutoSendCountdown !== null ? 'text-copilot-success' : 'text-copilot-accent'
                }`}
              >
                {lisaEnabled ? 'Start Lisa Loop' : ralphEnabled ? 'Start Loop' : 'Send'}
              </button>
              {/* Auto-send countdown tooltip */}
              {voiceAutoSendCountdown !== null && (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-copilot-success text-white rounded-lg shadow-lg cursor-pointer animate-pulse text-center"
                  onClick={onCancelVoiceAutoSend}
                  title="Click to cancel auto-send"
                >
                  <div className="text-xs font-bold whitespace-nowrap">
                    Sending in {voiceAutoSendCountdown}s
                  </div>
                  <div className="text-[10px] opacity-80 mt-0.5">Say "abort" to cancel</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Selectors area (passed as children from parent) */}
        {children}
      </div>
    </>
  );
});

ChatInput.displayName = 'ChatInput';
