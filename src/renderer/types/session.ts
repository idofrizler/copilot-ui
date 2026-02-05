export type Status = 'connecting' | 'connected' | 'disconnected';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  isStreaming?: boolean;
  isPendingInjection?: boolean; // True for injected messages until agent acknowledges them
  toolName?: string;
  toolCallId?: string;
  timestamp?: number; // Unix timestamp in milliseconds for when the message was finalized
  imageAttachments?: ImageAttachment[]; // Images attached to this message
  fileAttachments?: FileAttachment[]; // Files attached to this message
  tools?: ActiveTool[]; // Tools executed during this message turn (for assistant messages)
}

export interface ActiveTool {
  toolCallId: string;
  toolName: string;
  status: 'running' | 'done';
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
  isDestructive?: boolean; // True if command is destructive (rm, shred, etc.)
  filesToDelete?: string[]; // Files that will be deleted by destructive commands
  [key: string]: unknown;
}

// Previous session type (from history, not yet opened)
export interface PreviousSession {
  sessionId: string;
  name?: string;
  modifiedTime: string;
  cwd?: string; // Original working directory for this session
  markedForReview?: boolean; // Whether session was marked for follow-up
  reviewNote?: string; // Optional user note
  // Worktree-specific properties (optional, present if session is a worktree)
  worktree?: {
    id: string; // Worktree session ID (e.g., "repo--branch")
    branch: string;
    worktreePath: string;
    status: 'active' | 'idle' | 'orphaned';
    diskUsage?: string;
  };
}

// Worktree session status type for removal confirmation
export interface WorktreeRemovalStatus {
  hasUncommittedChanges: boolean;
  hasUnpushedCommits: boolean;
}

// Ralph Wiggum loop configuration
// See: https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum
// Enhanced based on: https://github.com/gemini-cli-extensions/ralph
// And Anthropic's research: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
export const RALPH_COMPLETION_SIGNAL = '<promise>COMPLETE</promise>';
export const RALPH_STATE_FILENAME = '.copilot/ralph-state.json';
export const RALPH_PROGRESS_FILENAME = 'ralph-progress.md';

export interface RalphConfig {
  originalPrompt: string;
  maxIterations: number;
  currentIteration: number;
  active: boolean;
  requireScreenshot?: boolean; // When true, agent must take screenshot of delivered feature
  clearContextBetweenIterations?: boolean; // When true, clears chat history each iteration (like Gemini Ralph)
  startedAt?: string; // ISO timestamp of when loop started
  progressFilePath?: string; // Path to ralph-progress.md
  stateFilePath?: string; // Path to ralph-state.json for persistence
}

// Lisa Simpson loop configuration - multi-phase analytical workflow
// Phases: Plan → Plan Review → Execute → Code Review → Validate → Final Review → COMPLETE
// The Reviewer engages after each phase, providing feedback and can send back to any previous phase
export type LisaPhase =
  | 'plan'
  | 'plan-review'
  | 'execute'
  | 'code-review'
  | 'validate'
  | 'final-review';
export const LISA_PHASE_COMPLETE_SIGNAL = '<lisa-phase>COMPLETE</lisa-phase>';
export const LISA_REVIEW_APPROVE_SIGNAL = '<lisa-review>APPROVED</lisa-review>';
export const LISA_REVIEW_REJECT_PREFIX = '<lisa-review>REJECT:'; // followed by phase name to return to
export interface LisaConfig {
  originalPrompt: string;
  currentPhase: LisaPhase;
  phaseIterations: Record<LisaPhase, number>; // Visit count per phase (for display only)
  active: boolean;
  planPath?: string; // Path to plan.md once created
  evidenceFolderPath?: string; // Path to evidence folder once created
  phaseHistory: Array<{ phase: LisaPhase; iteration: number; timestamp: number }>; // Track phase transitions
}

// Context usage information from the SDK
export interface ContextUsage {
  tokenLimit: number;
  currentTokens: number;
  messagesLength: number;
}

// Compaction status
export type CompactionStatus = 'idle' | 'compacting' | 'completed';

// Detected choice option for user selection
export interface DetectedChoice {
  id: string;
  label: string;
  description?: string;
}

// Pending injection - a message to be injected into agent's processing queue
export interface PendingInjection {
  content: string;
  imageAttachments?: ImageAttachment[];
  fileAttachments?: FileAttachment[];
  terminalAttachment?: { output: string; lineCount: number };
}

// Draft input state for per-session textarea content
export interface DraftInput {
  text: string;
  imageAttachments: ImageAttachment[];
  fileAttachments: FileAttachment[];
  terminalAttachment: { output: string; lineCount: number } | null;
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
  untrackedFiles: string[]; // Files excluded from commit (user doesn't want to commit these)
  fileViewMode: 'flat' | 'tree'; // How to display edited files list
  currentIntent: string | null; // Current agent intent from report_intent tool
  currentIntentTimestamp: number | null; // When the current intent was set
  gitBranchRefresh: number; // Bumps to refresh GitBranchWidget
  isRenaming?: boolean;
  renameDraft?: string;
  ralphConfig?: RalphConfig; // Ralph Wiggum loop configuration
  lisaConfig?: LisaConfig; // Lisa Simpson loop configuration
  contextUsage?: ContextUsage; // Current context window usage
  compactionStatus?: CompactionStatus; // Status of context compaction
  detectedChoices?: DetectedChoice[]; // Choices detected in last assistant message
  draftInput?: DraftInput; // Per-session textarea draft state
  markedForReview?: boolean; // Whether session is marked for follow-up review
  reviewNote?: string; // Optional user note displayed at bottom of conversation
}
