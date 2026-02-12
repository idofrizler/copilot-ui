/**
 * Session Management Tools for Copilot SDK
 *
 * Defines custom tools that allow the AI to manage Cooper UI state:
 * - Create/list/close session tabs
 * - Create worktree sessions (git-based parallel development)
 * - Query available models
 *
 * These tools are registered with the Copilot SDK session and can be invoked by the AI.
 */

import { z } from 'zod';
import { defineTool, Tool } from '@github/copilot-sdk';
import Store from 'electron-store';
import * as worktree from './worktree';

// Type for verified models (matches main.ts ModelInfo)
interface ModelInfo {
  id: string;
  name: string;
  version: string;
  vendor: string;
  model_picker_enabled?: boolean;
  preview?: boolean;
  tier?: 'premium' | 'standard' | 'fast_cheap';
  source?: 'api' | 'fallback';
}

// Type for session info returned by list
interface SessionInfo {
  id: string;
  model: string;
  cwd: string;
  isActive: boolean;
}

// Store instance reference
const store = new Store();

// Options for creating session tools
interface SessionToolsOptions {
  /** The current session ID */
  sessionId: string;
  /** Function to get available models */
  getVerifiedModels: () => ModelInfo[];
  /** Function to get active sessions map */
  getSessions: () => Map<string, { model: string; cwd: string }>;
  /** Function to get the currently active session ID */
  getActiveSessionId: () => string | null;
  /** Function to create a new session and open it as a tab */
  createSessionTab: (options: {
    cwd?: string;
    model?: string;
    initialPrompt?: string;
  }) => Promise<{ sessionId: string; model: string; cwd: string }>;
  /** Function to close a session tab */
  closeSessionTab: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Create session management tools for a specific Copilot session
 */
export function createSessionTools(options: SessionToolsOptions): Tool<any>[] {
  const {
    sessionId,
    getVerifiedModels,
    getSessions,
    getActiveSessionId,
    createSessionTab,
    closeSessionTab,
  } = options;

  return [
    // Create a new session tab
    defineTool('cooper_create_session', {
      description:
        'Create a new Copilot session tab in Cooper. The new tab opens in the background (does not switch away from current session). Optionally sends an initial message to start the conversation in the new tab. For git worktree sessions, use cooper_create_worktree_session instead.',
      parameters: z.object({
        cwd: z
          .string()
          .optional()
          .describe(
            'Working directory for the new session. If not specified, uses the same directory as the current session.'
          ),
        model: z
          .string()
          .optional()
          .describe(
            'Model ID to use (e.g., "claude-sonnet-4", "gpt-5.2"). If not specified, uses the same model as the current session.'
          ),
        initialPrompt: z
          .string()
          .optional()
          .describe('Optional message to send immediately after creating the session.'),
      }),
      handler: async (args) => {
        // Default to current session's cwd and model if not specified
        const currentSession = getSessions().get(sessionId);
        const targetCwd = args.cwd || currentSession?.cwd;
        const targetModel = args.model || currentSession?.model;

        try {
          const result = await createSessionTab({
            cwd: targetCwd,
            model: targetModel,
            initialPrompt: args.initialPrompt,
          });
          return JSON.stringify(
            {
              message: 'Session created successfully',
              sessionId: result.sessionId,
              model: result.model,
              cwd: result.cwd,
            },
            null,
            2
          );
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) };
        }
      },
    }),

    // Create a worktree session (git-specific)
    defineTool('cooper_create_worktree_session', {
      description:
        'Create a new git worktree and open a Copilot session tab in it. Use this for parallel development on multiple branches. The repo path MUST be a git repository. Creates an isolated working directory with the specified branch, then opens a new tab there. The new tab opens in the background.',
      parameters: z.object({
        repoPath: z
          .string()
          .describe(
            'Full path to the git repository to create a worktree from. Must be an existing git repository.'
          ),
        branch: z
          .string()
          .describe(
            'Branch name to checkout or create in the worktree. Will be sanitized for git compatibility.'
          ),
        model: z
          .string()
          .optional()
          .describe(
            'Model ID to use (e.g., "claude-sonnet-4", "gpt-5.2"). If not specified, uses the same model as the current session.'
          ),
        initialPrompt: z
          .string()
          .optional()
          .describe('Optional message to send immediately after creating the session.'),
      }),
      handler: async (args) => {
        // Create the git worktree
        const worktreeResult = await worktree.createWorktreeSession(args.repoPath, args.branch);
        if (!worktreeResult.success || !worktreeResult.session) {
          return { error: worktreeResult.error || 'Failed to create worktree' };
        }

        // Default model to current session's model if not specified
        const currentSession = getSessions().get(sessionId);
        const targetModel = args.model || currentSession?.model;

        // Create a session tab in the worktree directory
        try {
          const result = await createSessionTab({
            cwd: worktreeResult.session.worktreePath,
            model: targetModel,
            initialPrompt: args.initialPrompt,
          });
          return JSON.stringify(
            {
              message: 'Worktree session created successfully',
              sessionId: result.sessionId,
              model: result.model,
              cwd: result.cwd,
              branch: worktreeResult.session.branch,
              worktreeId: worktreeResult.session.id,
            },
            null,
            2
          );
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) };
        }
      },
    }),

    // List active Copilot sessions (tabs)
    defineTool('cooper_list_sessions', {
      description:
        'List all active Copilot sessions (tabs) in Cooper. Shows session ID, model, working directory, and whether it is the active tab.',
      parameters: z.object({}),
      handler: async () => {
        const sessionsMap = getSessions();
        const activeId = getActiveSessionId();
        const sessionList: SessionInfo[] = [];

        sessionsMap.forEach((session, id) => {
          sessionList.push({
            id,
            model: session.model,
            cwd: session.cwd,
            isActive: id === activeId,
          });
        });

        return JSON.stringify(sessionList, null, 2);
      },
    }),

    // Close a session tab
    defineTool('cooper_close_session', {
      description:
        'Close a Copilot session tab in Cooper. Cannot close the current session (the one running this tool).',
      parameters: z.object({
        sessionId: z
          .string()
          .describe('The session ID to close. Use cooper_list_sessions to find session IDs.'),
      }),
      handler: async (args) => {
        if (args.sessionId === sessionId) {
          return { error: 'Cannot close the current session from within itself.' };
        }
        try {
          const result = await closeSessionTab(args.sessionId);
          if (!result.success) {
            return { error: result.error };
          }
          return `Session ${args.sessionId} closed successfully.`;
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) };
        }
      },
    }),

    // Get available AI models
    defineTool('cooper_get_models', {
      description:
        'List all available AI models that can be used with Copilot. Returns model ID, name, vendor, and tier.',
      parameters: z.object({}),
      handler: async () => {
        const models = getVerifiedModels();
        const modelSummary = models.map((m) => ({
          id: m.id,
          name: m.name,
          vendor: m.vendor,
          tier: m.tier || 'standard',
          preview: m.preview || false,
        }));
        return JSON.stringify(modelSummary, null, 2);
      },
    }),

    // Get current session info
    defineTool('cooper_get_current_session', {
      description:
        'Get information about the current Copilot session, including session ID, model, and working directory.',
      parameters: z.object({}),
      handler: async () => {
        const sessionsMap = getSessions();
        const session = sessionsMap.get(sessionId);
        if (!session) {
          return { error: 'Current session not found' };
        }
        return JSON.stringify(
          {
            sessionId,
            model: session.model,
            cwd: session.cwd,
          },
          null,
          2
        );
      },
    }),

    // Get favorite models
    defineTool('cooper_get_favorite_models', {
      description:
        "List the user's favorite AI models. These are shown at the top of the model selector in Cooper.",
      parameters: z.object({}),
      handler: async () => {
        const favoriteIds = (store.get('favoriteModels') as string[]) || [];
        return JSON.stringify(favoriteIds, null, 2);
      },
    }),
  ];
}
