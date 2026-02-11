/**
 * Git Worktree Session Manager
 *
 * Provides isolated working directories for parallel Copilot sessions.
 * Each session gets its own worktree tied to a specific branch.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join, basename } from 'path';
import { app } from 'electron';
import { net } from 'electron';

const execAsync = promisify(exec);

// XDG Base Directory helpers - respect standard env vars for config/state isolation

// Get .copilot config base path - respects XDG_CONFIG_HOME
const getCopilotConfigPath = (): string => {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  if (xdgConfigHome) {
    return join(xdgConfigHome, '.copilot');
  }
  return join(app.getPath('home'), '.copilot');
};

// Get .copilot state base path - respects XDG_STATE_HOME
const getCopilotStatePath = (): string => {
  const xdgStateHome = process.env.XDG_STATE_HOME;
  if (xdgStateHome) {
    return join(xdgStateHome, '.copilot');
  }
  return join(app.getPath('home'), '.copilot');
};

// Get worktree sessions directory - respects COPILOT_SESSIONS_HOME
const getWorktreeSessionsPath = (): string => {
  const sessionsHome = process.env.COPILOT_SESSIONS_HOME;
  if (sessionsHome) {
    return sessionsHome;
  }
  return join(app.getPath('home'), '.copilot-sessions');
};

// GitHub issue types
interface GitHubIssueComment {
  body: string;
  user: {
    login: string;
  };
  created_at: string;
}

interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  html_url: string;
  comments?: GitHubIssueComment[];
}

// Azure DevOps work item types
interface AzureDevOpsWorkItemComment {
  body: string;
  user: {
    login: string;
  };
  created_at: string;
}

interface AzureDevOpsWorkItem {
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  comments?: AzureDevOpsWorkItemComment[];
}

// Session registry types
interface WorktreeSession {
  id: string; // Format: <repo-name>--<branch-name>
  repoPath: string; // Original repository path
  branch: string; // Branch name
  worktreePath: string; // Full path to worktree directory
  createdAt: string; // ISO timestamp
  lastAccessedAt: string; // ISO timestamp
  status: 'active' | 'idle' | 'orphaned';
  pid?: number; // Process ID if active
  copilotSessionIds?: string[]; // Associated Copilot CLI session IDs for cleanup
}

interface SessionRegistry {
  version: number;
  sessions: WorktreeSession[];
}

// Configuration
interface WorktreeConfig {
  directory: string; // Where to create worktrees
  pruneAfterDays: number; // Auto-prune sessions older than this
  warnDiskThresholdMB: number; // Warn if disk space below this
}

const DEFAULT_CONFIG: WorktreeConfig = {
  directory: getWorktreeSessionsPath(),
  pruneAfterDays: 30,
  warnDiskThresholdMB: 1024,
};

// Get config path - respects XDG_CONFIG_HOME
function getConfigPath(): string {
  return join(getCopilotConfigPath(), 'config.json');
}

// Get sessions directory
function getSessionsDir(config?: WorktreeConfig): string {
  const cfg = config || loadConfig();
  return cfg.directory;
}

// Get registry path
function getRegistryPath(): string {
  return join(getSessionsDir(), 'sessions.json');
}

// Load configuration
export function loadConfig(): WorktreeConfig {
  const configPath = getConfigPath();
  try {
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);
      return { ...DEFAULT_CONFIG, ...config.sessions };
    }
  } catch (error) {
    console.error('Failed to load worktree config:', error);
  }
  return DEFAULT_CONFIG;
}

// Save configuration
export function saveConfig(config: Partial<WorktreeConfig>): void {
  const configPath = getConfigPath();
  const configDir = getCopilotConfigPath();

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  let existingConfig: Record<string, unknown> = {};
  try {
    if (existsSync(configPath)) {
      existingConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    }
  } catch {
    // Ignore parse errors
  }

  existingConfig.sessions = {
    ...DEFAULT_CONFIG,
    ...((existingConfig.sessions as object) || {}),
    ...config,
  };
  writeFileSync(configPath, JSON.stringify(existingConfig, null, 2), 'utf-8');
}

// Load session registry
function loadRegistry(): SessionRegistry {
  const registryPath = getRegistryPath();
  try {
    if (existsSync(registryPath)) {
      const content = readFileSync(registryPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Failed to load session registry:', error);
  }
  return { version: 1, sessions: [] };
}

// Save session registry
function saveRegistry(registry: SessionRegistry): void {
  const sessionsDir = getSessionsDir();
  if (!existsSync(sessionsDir)) {
    mkdirSync(sessionsDir, { recursive: true });
  }
  writeFileSync(getRegistryPath(), JSON.stringify(registry, null, 2), 'utf-8');
}

// Sanitize branch name for git compatibility
export function sanitizeBranchName(branch: string): string {
  // Replace backslashes with forward slashes (Windows path separator issue)
  let sanitized = branch.replace(/\\/g, '/');

  // Remove invalid characters according to git-check-ref-format
  // Valid: alphanumeric, -, _, /, .
  // Invalid: spaces, .., @{, ~, ^, :, ?, *, [, \, control characters
  sanitized = sanitized.replace(/[~^:?*[\]@{}\s]+/g, '-');

  // Replace consecutive slashes
  sanitized = sanitized.replace(/\/+/g, '/');

  // Remove leading/trailing slashes, dots, and dashes
  sanitized = sanitized.replace(/^[/.\-]+|[/.\-]+$/g, '');

  // Ensure it doesn't end with .lock
  if (sanitized.endsWith('.lock')) {
    sanitized = sanitized.slice(0, -5);
  }

  return sanitized || 'branch';
}

// Generate session ID from repo and branch
function generateSessionId(repoPath: string, branch: string): string {
  const repoName = basename(repoPath);
  return `${repoName}--${branch.replace(/\//g, '-')}`;
}

// Check git version
export async function checkGitVersion(): Promise<{ supported: boolean; version: string }> {
  try {
    const { stdout } = await execAsync('git --version');
    const match = stdout.match(/git version (\d+)\.(\d+)/);
    if (match) {
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      const version = `${major}.${minor}`;
      // Require git 2.20+
      const supported = major > 2 || (major === 2 && minor >= 20);
      return { supported, version };
    }
    return { supported: false, version: 'unknown' };
  } catch {
    return { supported: false, version: 'not found' };
  }
}

// Check if path is a git repository
async function isGitRepo(path: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --git-dir', { cwd: path });
    return true;
  } catch {
    return false;
  }
}

// Get current branch
async function getCurrentBranch(repoPath: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git branch --show-current', { cwd: repoPath });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

// Check if branch exists
async function branchExists(repoPath: string, branch: string): Promise<boolean> {
  try {
    await execAsync(`git show-ref --verify --quiet refs/heads/${branch}`, { cwd: repoPath });
    return true;
  } catch {
    return false;
  }
}

// List existing worktrees
async function listWorktrees(repoPath: string): Promise<{ path: string; branch: string }[]> {
  try {
    const { stdout } = await execAsync('git worktree list --porcelain', { cwd: repoPath });
    const worktrees: { path: string; branch: string }[] = [];

    let currentPath = '';
    for (const line of stdout.split('\n')) {
      if (line.startsWith('worktree ')) {
        currentPath = line.substring(9);
      } else if (line.startsWith('branch refs/heads/')) {
        worktrees.push({
          path: currentPath,
          branch: line.substring(18),
        });
      }
    }

    return worktrees;
  } catch {
    return [];
  }
}

// Check if branch is already checked out in a worktree
async function isBranchInWorktree(repoPath: string, branch: string): Promise<string | null> {
  const worktrees = await listWorktrees(repoPath);
  const existing = worktrees.find((w) => w.branch === branch);
  return existing ? existing.path : null;
}

/**
 * Create a new worktree session
 */
export async function createWorktreeSession(
  repoPath: string,
  branch: string
): Promise<{
  success: boolean;
  session?: WorktreeSession;
  error?: string;
}> {
  const config = loadConfig();

  // Sanitize branch name for git compatibility
  const sanitizedBranch = sanitizeBranchName(branch);

  // Validate git is available and version is sufficient
  const gitCheck = await checkGitVersion();
  if (!gitCheck.supported) {
    return {
      success: false,
      error: `Git 2.20+ required for worktree support. Found: ${gitCheck.version}`,
    };
  }

  // Validate repo path is a git repository
  if (!(await isGitRepo(repoPath))) {
    return { success: false, error: `Not a git repository: ${repoPath}` };
  }

  // Check if branch is already in a worktree
  const existingWorktree = await isBranchInWorktree(repoPath, sanitizedBranch);
  if (existingWorktree) {
    return {
      success: false,
      error: `Branch '${sanitizedBranch}' is already checked out at: ${existingWorktree}`,
    };
  }

  const sessionId = generateSessionId(repoPath, sanitizedBranch);
  const worktreePath = join(getSessionsDir(config), sessionId);

  // Check if worktree directory already exists
  if (existsSync(worktreePath)) {
    return {
      success: false,
      error: `Worktree directory already exists: ${worktreePath}`,
    };
  }

  // Ensure sessions directory exists
  const sessionsDir = getSessionsDir(config);
  if (!existsSync(sessionsDir)) {
    mkdirSync(sessionsDir, { recursive: true });
  }

  // Create the worktree
  try {
    const branchExistsLocal = await branchExists(repoPath, sanitizedBranch);

    if (branchExistsLocal) {
      // Checkout existing branch
      await execAsync(`git worktree add "${worktreePath}" "${sanitizedBranch}"`, { cwd: repoPath });
    } else {
      // Create new branch
      await execAsync(`git worktree add -b "${sanitizedBranch}" "${worktreePath}"`, {
        cwd: repoPath,
      });
    }
  } catch (error) {
    return { success: false, error: `Failed to create worktree: ${error}` };
  }

  // Create session record
  const session: WorktreeSession = {
    id: sessionId,
    repoPath,
    branch: sanitizedBranch,
    worktreePath,
    createdAt: new Date().toISOString(),
    lastAccessedAt: new Date().toISOString(),
    status: 'active',
    pid: process.pid,
  };

  // Update registry
  const registry = loadRegistry();
  registry.sessions = registry.sessions.filter((s) => s.id !== sessionId);
  registry.sessions.push(session);
  saveRegistry(registry);

  return { success: true, session };
}

/**
 * Remove a worktree session
 */
export async function removeWorktreeSession(
  sessionId: string,
  options?: { force?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const registry = loadRegistry();
  const session = registry.sessions.find((s) => s.id === sessionId);

  if (!session) {
    return { success: false, error: `Session not found: ${sessionId}` };
  }

  // Remove the worktree
  try {
    const forceFlag = options?.force ? ' --force' : '';
    await execAsync(`git worktree remove "${session.worktreePath}"${forceFlag}`, {
      cwd: session.repoPath,
    });
  } catch (error) {
    // If worktree doesn't exist or git doesn't recognize it, clean up manually
    if (existsSync(session.worktreePath)) {
      // Check if it's a valid git worktree or an orphaned directory
      const gitPath = join(session.worktreePath, '.git');
      const isOrphanedWorktree = existsSync(gitPath);

      if (isOrphanedWorktree) {
        // The directory exists but git doesn't recognize it as a worktree
        // This can happen when git metadata was deleted but directory remains
        console.warn('Worktree is orphaned (git metadata missing), removing directory manually');
        try {
          rmSync(session.worktreePath, { recursive: true, force: true });
        } catch (rmError) {
          return {
            success: false,
            error: `Failed to remove orphaned worktree directory: ${rmError}`,
          };
        }
      } else {
        // Directory exists and might still be a valid worktree, but git command failed
        return { success: false, error: `Failed to remove worktree: ${error}` };
      }
    } else {
      // Directory doesn't exist, just clean up the registry
      console.warn('Worktree already removed, cleaning up registry');
    }
  }

  // Clean up associated Copilot session-state folders
  if (session.copilotSessionIds && session.copilotSessionIds.length > 0) {
    const sessionStateBase = join(getCopilotStatePath(), 'session-state');
    for (const copilotSessionId of session.copilotSessionIds) {
      const sessionStateDir = join(sessionStateBase, copilotSessionId);
      if (existsSync(sessionStateDir)) {
        try {
          rmSync(sessionStateDir, { recursive: true, force: true });
          console.log(`Deleted session-state folder for ${copilotSessionId}`);
        } catch (err) {
          console.warn(`Failed to delete session-state folder ${copilotSessionId}:`, err);
        }
      }
    }
  }

  // Update registry
  registry.sessions = registry.sessions.filter((s) => s.id !== sessionId);
  saveRegistry(registry);

  return { success: true };
}

/**
 * List all worktree sessions
 */
export function listWorktreeSessions(): {
  sessions: WorktreeSession[];
} {
  const registry = loadRegistry();

  const sessions = registry.sessions.map((session) => {
    const exists = existsSync(session.worktreePath);
    return {
      ...session,
      status: exists ? session.status : ('orphaned' as const),
    };
  });

  return { sessions };
}

/**
 * Get a specific session by ID
 */
export function getWorktreeSession(sessionId: string): WorktreeSession | null {
  const registry = loadRegistry();
  return registry.sessions.find((s) => s.id === sessionId) || null;
}

/**
 * Update session last accessed time
 */
export function touchWorktreeSession(sessionId: string): void {
  const registry = loadRegistry();
  const session = registry.sessions.find((s) => s.id === sessionId);
  if (session) {
    session.lastAccessedAt = new Date().toISOString();
    saveRegistry(registry);
  }
}

/**
 * Find session by repo and branch
 */
export function findWorktreeSession(repoPath: string, branch: string): WorktreeSession | null {
  const sessionId = generateSessionId(repoPath, branch);
  return getWorktreeSession(sessionId);
}

/**
 * Find session by worktree path
 */
export function findWorktreeSessionByPath(worktreePath: string): WorktreeSession | null {
  const registry = loadRegistry();
  return registry.sessions.find((s) => s.worktreePath === worktreePath) || null;
}

/**
 * Track a Copilot CLI session ID with a worktree session
 */
export function trackCopilotSession(worktreeSessionId: string, copilotSessionId: string): void {
  const registry = loadRegistry();
  const session = registry.sessions.find((s) => s.id === worktreeSessionId);
  if (session) {
    if (!session.copilotSessionIds) {
      session.copilotSessionIds = [];
    }
    if (!session.copilotSessionIds.includes(copilotSessionId)) {
      session.copilotSessionIds.push(copilotSessionId);
      saveRegistry(registry);
    }
  }
}

/**
 * Prune orphaned and stale sessions
 */
export async function pruneWorktreeSessions(options?: {
  dryRun?: boolean;
  maxAgeDays?: number;
}): Promise<{
  pruned: string[];
  errors: Array<{ sessionId: string; error: string }>;
}> {
  const config = loadConfig();
  const maxAgeDays = options?.maxAgeDays ?? config.pruneAfterDays;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

  const registry = loadRegistry();
  const pruned: string[] = [];
  const errors: Array<{ sessionId: string; error: string }> = [];

  for (const session of registry.sessions) {
    const shouldPrune =
      !existsSync(session.worktreePath) || // Orphaned
      new Date(session.lastAccessedAt) < cutoffDate; // Stale

    if (shouldPrune) {
      if (options?.dryRun) {
        pruned.push(session.id);
      } else {
        const result = await removeWorktreeSession(session.id, { force: true });
        if (result.success) {
          pruned.push(session.id);
        } else {
          errors.push({ sessionId: session.id, error: result.error || 'Unknown error' });
        }
      }
    }
  }

  // Also run git worktree prune to clean up stale references
  if (!options?.dryRun) {
    try {
      // Get all unique repo paths
      const repoPaths = [...new Set(registry.sessions.map((s) => s.repoPath))];
      for (const repoPath of repoPaths) {
        if (existsSync(repoPath)) {
          await execAsync('git worktree prune', { cwd: repoPath });
        }
      }
    } catch (error) {
      console.warn('git worktree prune failed:', error);
    }
  }

  return { pruned, errors };
}

/**
 * Switch to a worktree session (update its status)
 */
export function switchToWorktreeSession(sessionId: string): WorktreeSession | null {
  const registry = loadRegistry();
  const session = registry.sessions.find((s) => s.id === sessionId);

  if (!session || !existsSync(session.worktreePath)) {
    return null;
  }

  session.status = 'active';
  session.lastAccessedAt = new Date().toISOString();
  session.pid = process.pid;
  saveRegistry(registry);

  return session;
}

/**
 * Check for orphaned sessions (crashed without cleanup)
 */
export function checkOrphanedSessions(): WorktreeSession[] {
  const registry = loadRegistry();
  const orphaned: WorktreeSession[] = [];

  for (const session of registry.sessions) {
    if (!existsSync(session.worktreePath)) {
      orphaned.push({ ...session, status: 'orphaned' });
    }
  }

  return orphaned;
}

/**
 * Recover an orphaned session (if worktree still exists)
 */
export async function recoverWorktreeSession(sessionId: string): Promise<{
  success: boolean;
  session?: WorktreeSession;
  error?: string;
}> {
  const registry = loadRegistry();
  const session = registry.sessions.find((s) => s.id === sessionId);

  if (!session) {
    return { success: false, error: `Session not found: ${sessionId}` };
  }

  if (!existsSync(session.worktreePath)) {
    return { success: false, error: `Worktree no longer exists: ${session.worktreePath}` };
  }

  // Update session to active
  session.status = 'active';
  session.lastAccessedAt = new Date().toISOString();
  session.pid = process.pid;
  saveRegistry(registry);

  return { success: true, session };
}

/**
 * Check if worktree sessions are enabled
 */
export function isWorktreeEnabled(): boolean {
  // Feature is available if git supports it
  return true; // Will check git version on actual operations
}

/**
 * Get worktree config
 */
export function getWorktreeConfig(): WorktreeConfig {
  return loadConfig();
}

/**
 * Update worktree config
 */
export function updateWorktreeConfig(updates: Partial<WorktreeConfig>): void {
  saveConfig(updates);
}

/**
 * Parse a GitHub issue URL and extract owner, repo, and issue number
 */
function parseGitHubIssueUrl(
  url: string
): { owner: string; repo: string; issueNumber: number } | null {
  // Match patterns like:
  // https://github.com/owner/repo/issues/123
  // github.com/owner/repo/issues/123
  const match = url.match(/(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (!match) return null;

  return {
    owner: match[1],
    repo: match[2],
    issueNumber: parseInt(match[3], 10),
  };
}

/**
 * Generate a branch name from issue title
 */
function generateBranchFromTitle(issueNumber: number, title: string): string {
  // Clean and format the title for a branch name
  const cleaned = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, '') // Trim leading/trailing hyphens
    .substring(0, 50); // Limit length

  return `feature/${issueNumber}-${cleaned}`;
}

/**
 * Fetch comments for a GitHub issue via gh CLI
 */
async function fetchGitHubIssueCommentsViaCli(
  owner: string,
  repo: string,
  issueNumber: number
): Promise<GitHubIssueComment[]> {
  try {
    const { stdout } = await execAsync(
      `gh issue view ${issueNumber} --repo "${owner}/${repo}" --json comments`,
      { timeout: 30000 }
    );

    const data = JSON.parse(stdout);
    const comments: GitHubIssueComment[] = (data.comments || []).map(
      (c: { body: string; author?: { login: string }; createdAt?: string }) => ({
        body: c.body,
        user: { login: c.author?.login || 'Unknown' },
        created_at: c.createdAt || '',
      })
    );
    return comments;
  } catch {
    return [];
  }
}

/**
 * Fetch comments for a GitHub issue via public API
 */
function fetchGitHubIssueCommentsViaApi(
  owner: string,
  repo: string,
  issueNumber: number
): Promise<GitHubIssueComment[]> {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`;

  return new Promise((resolve) => {
    const request = net.request({
      method: 'GET',
      url: apiUrl,
    });

    request.setHeader('Accept', 'application/vnd.github.v3+json');
    request.setHeader('User-Agent', 'Copilot-UI');

    let responseBody = '';

    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        // If we can't fetch comments, just return empty array - don't fail the whole request
        resolve([]);
        return;
      }

      response.on('data', (chunk) => {
        responseBody += chunk.toString();
      });

      response.on('end', () => {
        try {
          const comments = JSON.parse(responseBody) as GitHubIssueComment[];
          resolve(comments);
        } catch {
          resolve([]);
        }
      });
    });

    request.on('error', () => {
      resolve([]);
    });

    request.end();
  });
}

/**
 * Fetch GitHub issue details and generate a branch name
 * First tries using gh CLI (for authenticated access to private repos), falls back to public API
 */
export async function fetchGitHubIssue(issueUrl: string): Promise<{
  success: boolean;
  issue?: GitHubIssue;
  suggestedBranch?: string;
  error?: string;
}> {
  const parsed = parseGitHubIssueUrl(issueUrl);
  if (!parsed) {
    return {
      success: false,
      error: 'Invalid GitHub issue URL. Expected format: https://github.com/owner/repo/issues/123',
    };
  }

  const { owner, repo, issueNumber } = parsed;

  // First, try using gh CLI which handles authentication
  try {
    const { stdout } = await execAsync(
      `gh issue view ${issueNumber} --repo "${owner}/${repo}" --json number,title,body,state,url`,
      { timeout: 30000 }
    );

    const data = JSON.parse(stdout);

    const issue: GitHubIssue = {
      number: data.number,
      title: data.title || '',
      body: data.body || null,
      state: data.state?.toLowerCase() === 'open' ? 'open' : 'closed',
      html_url: data.url || issueUrl,
    };

    const suggestedBranch = generateBranchFromTitle(issue.number, issue.title);

    // Fetch comments via CLI
    const comments = await fetchGitHubIssueCommentsViaCli(owner, repo, issueNumber);
    issue.comments = comments;

    return { success: true, issue, suggestedBranch };
  } catch (cliError) {
    const errorMessage = String(cliError);

    // Check if gh CLI is not installed
    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('not recognized') ||
      errorMessage.includes('command not found')
    ) {
      // Fall back to public API
      return fetchGitHubIssueViaApi(issueUrl, owner, repo, issueNumber);
    }

    // Check for auth errors from CLI
    if (
      errorMessage.includes('login') ||
      errorMessage.includes('authenticate') ||
      errorMessage.includes('gh auth')
    ) {
      return {
        success: false,
        error: 'GitHub CLI authentication required. Run "gh auth login" to authenticate.',
      };
    }

    // For other CLI errors, try the public API as fallback
    return fetchGitHubIssueViaApi(issueUrl, owner, repo, issueNumber);
  }
}

/**
 * Fetch GitHub issue via public API (only works for public repositories)
 */
async function fetchGitHubIssueViaApi(
  issueUrl: string,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<{
  success: boolean;
  issue?: GitHubIssue;
  suggestedBranch?: string;
  error?: string;
}> {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`;

  const authInstructions = `To access private GitHub repositories:

1. Install the GitHub CLI: https://cli.github.com

2. Run this command to authenticate:
\`\`\`
gh auth login
\`\`\`
`;

  return new Promise((resolve) => {
    const request = net.request({
      method: 'GET',
      url: apiUrl,
    });

    request.setHeader('Accept', 'application/vnd.github.v3+json');
    request.setHeader('User-Agent', 'Copilot-UI');

    let responseBody = '';

    request.on('response', (response) => {
      if (response.statusCode === 404) {
        resolve({
          success: false,
          error: `Issue not found. This may be a private repository.\n\n${authInstructions}`,
        });
        return;
      }

      if (response.statusCode === 401 || response.statusCode === 403) {
        resolve({
          success: false,
          error: `Access denied. This is a private repository.\n\n${authInstructions}`,
        });
        return;
      }

      if (response.statusCode !== 200) {
        resolve({ success: false, error: `GitHub API error: ${response.statusCode}` });
        return;
      }

      response.on('data', (chunk) => {
        responseBody += chunk.toString();
      });

      response.on('end', async () => {
        try {
          const issue = JSON.parse(responseBody) as GitHubIssue;
          const suggestedBranch = generateBranchFromTitle(issue.number, issue.title);

          // Fetch comments for the issue via API
          const comments = await fetchGitHubIssueCommentsViaApi(owner, repo, issueNumber);
          issue.comments = comments;

          resolve({ success: true, issue, suggestedBranch });
        } catch (err) {
          resolve({ success: false, error: 'Failed to parse GitHub response' });
        }
      });
    });

    request.on('error', (error) => {
      resolve({ success: false, error: `Network error: ${error.message}` });
    });

    request.end();
  });
}

/**
 * Parse an Azure DevOps work item URL and extract organization, project, and work item ID
 */
function parseAzureDevOpsWorkItemUrl(
  url: string
): { organization: string; project: string; workItemId: number } | null {
  // Match patterns like:
  // https://dev.azure.com/organization/project/_workitems/edit/123
  // dev.azure.com/organization/project/_workitems/edit/123
  const devAzureMatch = url.match(
    /(?:https?:\/\/)?dev\.azure\.com\/([^/]+)\/([^/]+)\/_workitems\/edit\/(\d+)/
  );
  if (devAzureMatch) {
    return {
      organization: devAzureMatch[1],
      project: devAzureMatch[2],
      workItemId: parseInt(devAzureMatch[3], 10),
    };
  }

  // Also match visualstudio.com patterns like:
  // https://organization.visualstudio.com/project/_workitems/edit/123
  // organization.visualstudio.com/project/_workitems/edit/123
  const vsMatch = url.match(
    /(?:https?:\/\/)?([^.]+)\.visualstudio\.com\/([^/]+)\/_workitems\/edit\/(\d+)/
  );
  if (vsMatch) {
    return {
      organization: vsMatch[1],
      project: vsMatch[2],
      workItemId: parseInt(vsMatch[3], 10),
    };
  }

  return null;
}

/**
 * Fetch comments for an Azure DevOps work item
 */
function fetchAzureDevOpsWorkItemComments(
  organization: string,
  project: string,
  workItemId: number
): Promise<AzureDevOpsWorkItemComment[]> {
  const apiUrl = `https://dev.azure.com/${organization}/${project}/_apis/wit/workitems/${workItemId}/comments?api-version=7.0-preview.3`;

  return new Promise((resolve) => {
    const request = net.request({
      method: 'GET',
      url: apiUrl,
    });

    request.setHeader('Accept', 'application/json');
    request.setHeader('User-Agent', 'Copilot-UI');

    let responseBody = '';

    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        // If we can't fetch comments, just return empty array - don't fail the whole request
        resolve([]);
        return;
      }

      response.on('data', (chunk) => {
        responseBody += chunk.toString();
      });

      response.on('end', () => {
        try {
          const data = JSON.parse(responseBody);
          // Azure DevOps returns comments in a 'comments' array
          const comments: AzureDevOpsWorkItemComment[] = (data.comments || []).map(
            (comment: {
              text: string;
              createdBy?: { displayName: string };
              createdDate?: string;
            }) => ({
              body: comment.text,
              user: { login: comment.createdBy?.displayName || 'Unknown' },
              created_at: comment.createdDate || '',
            })
          );
          resolve(comments);
        } catch {
          resolve([]);
        }
      });
    });

    request.on('error', () => {
      resolve([]);
    });

    request.end();
  });
}

/**
 * Fetch Azure DevOps work item details and generate a branch name
 * First tries az CLI (for authenticated access), falls back to public API
 */
export async function fetchAzureDevOpsWorkItem(workItemUrl: string): Promise<{
  success: boolean;
  workItem?: AzureDevOpsWorkItem;
  suggestedBranch?: string;
  error?: string;
}> {
  const parsed = parseAzureDevOpsWorkItemUrl(workItemUrl);
  if (!parsed) {
    return {
      success: false,
      error:
        'Invalid Azure DevOps work item URL. Expected format: https://dev.azure.com/org/project/_workitems/edit/123',
    };
  }

  const { organization, project, workItemId } = parsed;

  // First, try using az CLI which handles authentication
  try {
    const { stdout } = await execAsync(
      `az boards work-item show --id ${workItemId} --org "https://dev.azure.com/${organization}" --output json`,
      { timeout: 30000 }
    );

    const data = JSON.parse(stdout);
    const fields = data.fields || {};
    const title = fields['System.Title'] || '';
    const description = fields['System.Description'] || null;
    const state = fields['System.State'] || 'Unknown';

    const workItem: AzureDevOpsWorkItem = {
      number: data.id,
      title,
      body: description,
      state,
      html_url: workItemUrl,
    };

    const suggestedBranch = generateBranchFromTitle(workItem.number, workItem.title);

    // Try to fetch comments via CLI
    try {
      const { stdout: commentsOutput } = await execAsync(
        `az boards work-item show --id ${workItemId} --org "https://dev.azure.com/${organization}" --expand comments --output json`,
        { timeout: 30000 }
      );
      const commentsData = JSON.parse(commentsOutput);
      if (commentsData.comments) {
        workItem.comments = commentsData.comments.map(
          (c: { text: string; createdBy?: { displayName: string }; createdDate?: string }) => ({
            body: c.text,
            user: { login: c.createdBy?.displayName || 'Unknown' },
            created_at: c.createdDate || '',
          })
        );
      }
    } catch {
      // Comments fetch failed, continue without them
    }

    return { success: true, workItem, suggestedBranch };
  } catch (cliError) {
    const errorMessage = String(cliError);

    // Check if az CLI is not installed or azure-devops extension is missing
    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('not recognized') ||
      errorMessage.includes('command not found')
    ) {
      // Fall back to public API
      return fetchAzureDevOpsWorkItemViaApi(workItemUrl, organization, project, workItemId);
    }

    // Check if the extension is not installed
    if (errorMessage.includes('az boards') || errorMessage.includes('extension')) {
      return fetchAzureDevOpsWorkItemViaApi(workItemUrl, organization, project, workItemId);
    }

    // Check for auth errors from CLI
    if (
      errorMessage.includes('login') ||
      errorMessage.includes('authenticate') ||
      errorMessage.includes('unauthorized')
    ) {
      return {
        success: false,
        error: 'Azure CLI authentication required. Run "az login" to authenticate.',
      };
    }

    // For other CLI errors, try the public API as fallback
    return fetchAzureDevOpsWorkItemViaApi(workItemUrl, organization, project, workItemId);
  }
}

/**
 * Fetch Azure DevOps work item via public API (only works for public projects)
 */
async function fetchAzureDevOpsWorkItemViaApi(
  workItemUrl: string,
  organization: string,
  project: string,
  workItemId: number
): Promise<{
  success: boolean;
  workItem?: AzureDevOpsWorkItem;
  suggestedBranch?: string;
  error?: string;
}> {
  const apiUrl = `https://dev.azure.com/${organization}/${project}/_apis/wit/workitems/${workItemId}?api-version=7.0`;

  const authInstructions = `To access private Azure DevOps projects:

1. Make sure you have the Azure CLI (az cli) installed.

2. Run these commands:
\`\`\`
# Add the Azure DevOps extension
az extension add --name azure-devops

# Login to Azure
az login

# Set your default organization
az devops configure --defaults organization=https://dev.azure.com/${organization}
\`\`\``;

  return new Promise((resolve) => {
    const request = net.request({
      method: 'GET',
      url: apiUrl,
    });

    request.setHeader('Accept', 'application/json');
    request.setHeader('User-Agent', 'Copilot-UI');

    let responseBody = '';

    request.on('response', (response) => {
      if (response.statusCode === 404) {
        resolve({
          success: false,
          error: `Work item not found. Check the URL and ensure the project is public or you have access.\n\n${authInstructions}`,
        });
        return;
      }

      if (response.statusCode === 401 || response.statusCode === 403) {
        resolve({
          success: false,
          error: `Access denied. This project requires authentication.\n\n${authInstructions}`,
        });
        return;
      }

      // Azure DevOps returns 203 with an HTML login page for private projects
      if (response.statusCode === 203 || response.statusCode === 302) {
        resolve({
          success: false,
          error: `Authentication required. This is a private Azure DevOps project.\n\n${authInstructions}`,
        });
        return;
      }

      if (response.statusCode !== 200) {
        resolve({
          success: false,
          error: `Azure DevOps API error: ${response.statusCode}\n\n${authInstructions}`,
        });
        return;
      }

      response.on('data', (chunk) => {
        responseBody += chunk.toString();
      });

      response.on('end', async () => {
        try {
          // Check if we got HTML instead of JSON (sign-in page)
          if (
            responseBody.trim().startsWith('<!DOCTYPE') ||
            responseBody.trim().startsWith('<html')
          ) {
            resolve({
              success: false,
              error: `Authentication required. This is a private Azure DevOps project.\n\n${authInstructions}`,
            });
            return;
          }

          const data = JSON.parse(responseBody);

          // Azure DevOps work items have fields nested under 'fields'
          const fields = data.fields || {};
          const title = fields['System.Title'] || '';
          const description = fields['System.Description'] || null;
          const state = fields['System.State'] || 'Unknown';

          const workItem: AzureDevOpsWorkItem = {
            number: data.id,
            title,
            body: description,
            state,
            html_url: workItemUrl,
          };

          const suggestedBranch = generateBranchFromTitle(workItem.number, workItem.title);

          // Fetch comments for the work item
          const comments = await fetchAzureDevOpsWorkItemComments(
            organization,
            project,
            workItemId
          );
          workItem.comments = comments;

          resolve({ success: true, workItem, suggestedBranch });
        } catch (err) {
          resolve({ success: false, error: 'Failed to parse Azure DevOps response' });
        }
      });
    });

    request.on('error', (error) => {
      resolve({ success: false, error: `Network error: ${error.message}` });
    });

    request.end();
  });
}
