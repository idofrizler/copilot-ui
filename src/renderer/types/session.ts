export type Status = "connecting" | "connected" | "disconnected";

export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "error";
  content: string;
  isStreaming?: boolean;
  toolName?: string;
  toolCallId?: string;
  timestamp?: number; // Unix timestamp in milliseconds for when the message was finalized
  imageAttachments?: ImageAttachment[]; // Images attached to this message
  fileAttachments?: FileAttachment[]; // Files attached to this message
}

export interface ActiveTool {
  toolCallId: string;
  toolName: string;
  status: "running" | "done";
  input?: Record<string, unknown>; // Tool input (path, old_str, new_str, etc.)
  output?: unknown; // Tool output
}

export interface ModelCapabilities {
  supportsVision: boolean;
  visionLimits?: {
    supportedMediaTypes: string[];
    maxPromptImages: number;
    maxPromptImageSize: number;
  };
}

export interface ModelInfo {
  id: string;
  name: string;
  multiplier: number;
  capabilities?: ModelCapabilities;
}

// Image attachment for messages
export interface ImageAttachment {
  id: string;
  path: string; // File path for SDK
  previewUrl: string; // Data URL for preview
  name: string;
  size: number;
  mimeType: string;
}

// File attachment for messages (non-image files)
export interface FileAttachment {
  id: string;
  path: string; // File path for SDK
  name: string;
  size: number;
  mimeType: string;
}

export interface PendingConfirmation {
  requestId: string;
  sessionId: string;
  kind: string;
  executable?: string;
  toolCallId?: string;
  fullCommandText?: string;
  intention?: string;
  path?: string;
  url?: string;
  serverName?: string;
  toolName?: string;
  toolTitle?: string;
  isOutOfScope?: boolean; // True if reading outside session's cwd
  content?: string; // File content for write/create operations
  [key: string]: unknown;
}

// Previous session type (from history, not yet opened)
export interface PreviousSession {
  sessionId: string;
  name?: string;
  modifiedTime: string;
  cwd?: string; // Original working directory for this session
}

// Ralph Wiggum loop configuration
// See: https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum
export const RALPH_COMPLETION_SIGNAL = "<promise>COMPLETE</promise>";
export interface RalphConfig {
  originalPrompt: string;
  maxIterations: number;
  currentIteration: number;
  active: boolean;
  requireScreenshot?: boolean; // When true, agent must take screenshot of delivered feature
}

// Context usage information from the SDK
export interface ContextUsage {
  tokenLimit: number;
  currentTokens: number;
  messagesLength: number;
}

// Compaction status
export type CompactionStatus = "idle" | "compacting" | "completed";

// Detected choice option for user selection
export interface DetectedChoice {
  id: string;
  label: string;
  description?: string;
}

// Tab/Session state
export interface TabState {
  id: string;
  name: string;
  messages: Message[];
  model: string;
  cwd: string; // Current working directory for this session
  isProcessing: boolean;
  activeTools: ActiveTool[];
  hasUnreadCompletion: boolean;
  pendingConfirmations: PendingConfirmation[]; // Queue of pending permission requests
  needsTitle: boolean; // True if we should generate AI title on next idle
  alwaysAllowed: string[]; // Executables that are always allowed for this session
  editedFiles: string[]; // Files edited/created in this session
  currentIntent: string | null; // Current agent intent from report_intent tool
  currentIntentTimestamp: number | null; // When the current intent was set
  gitBranchRefresh: number; // Bumps to refresh GitBranchWidget
  isRenaming?: boolean;
  renameDraft?: string;
  ralphConfig?: RalphConfig; // Ralph Wiggum loop configuration
  contextUsage?: ContextUsage; // Current context window usage
  compactionStatus?: CompactionStatus; // Status of context compaction
  detectedChoices?: DetectedChoice[]; // Choices detected in last assistant message
}
