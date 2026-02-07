export type AgentMode = 'default' | 'ralph' | 'lisa';

export interface InstructionFile {
  /** Display name for the file */
  name: string;
  /** File content (markdown) */
  content: string;
  /** Whether this is a path-specific instruction file (has applyTo frontmatter) */
  isPathSpecific: boolean;
}

export interface EvaluationContext {
  /** Auto-generated ID */
  id: string;
  /** Display name (auto-generated: "Context 1", "Context 2", etc.) */
  name: string;
  /** Instruction files in this context */
  files: InstructionFile[];
  /** Whether to wipe existing repo instruction files before writing these */
  overrideExisting: boolean;
}

export interface EvaluationConfig {
  models: string[];
  prompt: string;
  repoPath: string;
  branchPrefix: string;
  agentMode: AgentMode;
  ralphMaxIterations: number;
  completeWithoutInput: boolean;
  ensureTestsPass: boolean;
  commitChanges: boolean;
  pushChanges: boolean;
  /** Contexts to evaluate (each context × each model = one worktree) */
  contexts: EvaluationContext[];
  /** Whether the default repo context is included */
  useDefaultContext: boolean;
}

export interface DetectedInstructionFile {
  /** Relative path from repo root */
  path: string;
  /** File type */
  type: 'copilot-instructions' | 'path-specific' | 'agents-md' | 'claude-md' | 'gemini-md';
}
