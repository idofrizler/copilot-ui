/**
 * Git Worktree Session Manager
 * 
 * Provides isolated working directories for parallel Copilot sessions.
 * Each session gets its own worktree tied to a specific branch.
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync, readdirSync } from 'fs'
import { join, basename } from 'path'
import { app } from 'electron'
import { net } from 'electron'

const execAsync = promisify(exec)

// GitHub issue types
interface GitHubIssue {
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  html_url: string
}

// Session registry types
interface WorktreeSession {
  id: string                    // Format: <repo-name>--<branch-name>
  repoPath: string              // Original repository path
  branch: string                // Branch name
  worktreePath: string          // Full path to worktree directory
  createdAt: string             // ISO timestamp
  lastAccessedAt: string        // ISO timestamp
  status: 'active' | 'idle' | 'orphaned'
  pid?: number                  // Process ID if active
}

interface SessionRegistry {
  version: number
  sessions: WorktreeSession[]
}

// Configuration
interface WorktreeConfig {
  directory: string             // Where to create worktrees
  pruneAfterDays: number        // Auto-prune sessions older than this
  warnDiskThresholdMB: number   // Warn if disk space below this
}

const DEFAULT_CONFIG: WorktreeConfig = {
  directory: join(app.getPath('home'), '.copilot-sessions'),
  pruneAfterDays: 30,
  warnDiskThresholdMB: 1024
}

// Get config path
function getConfigPath(): string {
  return join(app.getPath('home'), '.copilot', 'config.json')
}

// Get sessions directory
function getSessionsDir(config?: WorktreeConfig): string {
  const cfg = config || loadConfig()
  return cfg.directory
}

// Get registry path
function getRegistryPath(): string {
  return join(getSessionsDir(), 'sessions.json')
}

// Load configuration
export function loadConfig(): WorktreeConfig {
  const configPath = getConfigPath()
  try {
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, 'utf-8')
      const config = JSON.parse(content)
      return { ...DEFAULT_CONFIG, ...config.sessions }
    }
  } catch (error) {
    console.error('Failed to load worktree config:', error)
  }
  return DEFAULT_CONFIG
}

// Save configuration
export function saveConfig(config: Partial<WorktreeConfig>): void {
  const configPath = getConfigPath()
  const configDir = join(app.getPath('home'), '.copilot')
  
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }
  
  let existingConfig: Record<string, unknown> = {}
  try {
    if (existsSync(configPath)) {
      existingConfig = JSON.parse(readFileSync(configPath, 'utf-8'))
    }
  } catch {
    // Ignore parse errors
  }
  
  existingConfig.sessions = { ...DEFAULT_CONFIG, ...(existingConfig.sessions as object || {}), ...config }
  writeFileSync(configPath, JSON.stringify(existingConfig, null, 2), 'utf-8')
}

// Load session registry
function loadRegistry(): SessionRegistry {
  const registryPath = getRegistryPath()
  try {
    if (existsSync(registryPath)) {
      const content = readFileSync(registryPath, 'utf-8')
      return JSON.parse(content)
    }
  } catch (error) {
    console.error('Failed to load session registry:', error)
  }
  return { version: 1, sessions: [] }
}

// Save session registry
function saveRegistry(registry: SessionRegistry): void {
  const sessionsDir = getSessionsDir()
  if (!existsSync(sessionsDir)) {
    mkdirSync(sessionsDir, { recursive: true })
  }
  writeFileSync(getRegistryPath(), JSON.stringify(registry, null, 2), 'utf-8')
}

// Generate session ID from repo and branch
function generateSessionId(repoPath: string, branch: string): string {
  const repoName = basename(repoPath)
  return `${repoName}--${branch.replace(/\//g, '-')}`
}

// Check git version
export async function checkGitVersion(): Promise<{ supported: boolean; version: string }> {
  try {
    const { stdout } = await execAsync('git --version')
    const match = stdout.match(/git version (\d+)\.(\d+)/)
    if (match) {
      const major = parseInt(match[1], 10)
      const minor = parseInt(match[2], 10)
      const version = `${major}.${minor}`
      // Require git 2.20+
      const supported = major > 2 || (major === 2 && minor >= 20)
      return { supported, version }
    }
    return { supported: false, version: 'unknown' }
  } catch {
    return { supported: false, version: 'not found' }
  }
}

// Check if path is a git repository
async function isGitRepo(path: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --git-dir', { cwd: path })
    return true
  } catch {
    return false
  }
}

// Get current branch
async function getCurrentBranch(repoPath: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git branch --show-current', { cwd: repoPath })
    return stdout.trim() || null
  } catch {
    return null
  }
}

// Check if branch exists
async function branchExists(repoPath: string, branch: string): Promise<boolean> {
  try {
    await execAsync(`git show-ref --verify --quiet refs/heads/${branch}`, { cwd: repoPath })
    return true
  } catch {
    return false
  }
}

// List existing worktrees
async function listWorktrees(repoPath: string): Promise<{ path: string; branch: string }[]> {
  try {
    const { stdout } = await execAsync('git worktree list --porcelain', { cwd: repoPath })
    const worktrees: { path: string; branch: string }[] = []
    
    let currentPath = ''
    for (const line of stdout.split('\n')) {
      if (line.startsWith('worktree ')) {
        currentPath = line.substring(9)
      } else if (line.startsWith('branch refs/heads/')) {
        worktrees.push({
          path: currentPath,
          branch: line.substring(18)
        })
      }
    }
    
    return worktrees
  } catch {
    return []
  }
}

// Check if branch is already checked out in a worktree
async function isBranchInWorktree(repoPath: string, branch: string): Promise<string | null> {
  const worktrees = await listWorktrees(repoPath)
  const existing = worktrees.find(w => w.branch === branch)
  return existing ? existing.path : null
}

// Get disk usage for a directory
function getDiskUsage(path: string): number {
  if (!existsSync(path)) return 0
  
  let totalSize = 0
  
  function walkDir(dir: string): void {
    try {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        try {
          if (entry.isDirectory()) {
            walkDir(fullPath)
          } else {
            totalSize += statSync(fullPath).size
          }
        } catch {
          // Skip inaccessible files
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }
  
  walkDir(path)
  return totalSize
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/**
 * Create a new worktree session
 */
export async function createWorktreeSession(
  repoPath: string,
  branch: string
): Promise<{ 
  success: boolean
  session?: WorktreeSession
  error?: string
}> {
  const config = loadConfig()
  
  // Validate git is available and version is sufficient
  const gitCheck = await checkGitVersion()
  if (!gitCheck.supported) {
    return { 
      success: false, 
      error: `Git 2.20+ required for worktree support. Found: ${gitCheck.version}` 
    }
  }
  
  // Validate repo path is a git repository
  if (!await isGitRepo(repoPath)) {
    return { success: false, error: `Not a git repository: ${repoPath}` }
  }
  
  // Check if branch is already in a worktree
  const existingWorktree = await isBranchInWorktree(repoPath, branch)
  if (existingWorktree) {
    return { 
      success: false, 
      error: `Branch '${branch}' is already checked out at: ${existingWorktree}` 
    }
  }
  
  const sessionId = generateSessionId(repoPath, branch)
  const worktreePath = join(getSessionsDir(config), sessionId)
  
  // Check if worktree directory already exists
  if (existsSync(worktreePath)) {
    return { 
      success: false, 
      error: `Worktree directory already exists: ${worktreePath}` 
    }
  }
  
  // Ensure sessions directory exists
  const sessionsDir = getSessionsDir(config)
  if (!existsSync(sessionsDir)) {
    mkdirSync(sessionsDir, { recursive: true })
  }
  
  // Create the worktree
  try {
    const branchExistsLocal = await branchExists(repoPath, branch)
    
    if (branchExistsLocal) {
      // Checkout existing branch
      await execAsync(`git worktree add "${worktreePath}" "${branch}"`, { cwd: repoPath })
    } else {
      // Create new branch
      await execAsync(`git worktree add -b "${branch}" "${worktreePath}"`, { cwd: repoPath })
    }
  } catch (error) {
    return { success: false, error: `Failed to create worktree: ${error}` }
  }
  
  // Create session record
  const session: WorktreeSession = {
    id: sessionId,
    repoPath,
    branch,
    worktreePath,
    createdAt: new Date().toISOString(),
    lastAccessedAt: new Date().toISOString(),
    status: 'active',
    pid: process.pid
  }
  
  // Update registry
  const registry = loadRegistry()
  registry.sessions = registry.sessions.filter(s => s.id !== sessionId)
  registry.sessions.push(session)
  saveRegistry(registry)
  
  return { success: true, session }
}

/**
 * Remove a worktree session
 */
export async function removeWorktreeSession(
  sessionId: string,
  options?: { force?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const registry = loadRegistry()
  const session = registry.sessions.find(s => s.id === sessionId)
  
  if (!session) {
    return { success: false, error: `Session not found: ${sessionId}` }
  }
  
  // Remove the worktree
  try {
    const forceFlag = options?.force ? ' --force' : ''
    await execAsync(`git worktree remove "${session.worktreePath}"${forceFlag}`, { 
      cwd: session.repoPath 
    })
  } catch (error) {
    // If worktree doesn't exist anymore, just clean up registry
    if (!existsSync(session.worktreePath)) {
      console.warn('Worktree already removed, cleaning up registry')
    } else {
      return { success: false, error: `Failed to remove worktree: ${error}` }
    }
  }
  
  // Update registry
  registry.sessions = registry.sessions.filter(s => s.id !== sessionId)
  saveRegistry(registry)
  
  return { success: true }
}

/**
 * List all worktree sessions
 */
export function listWorktreeSessions(): {
  sessions: Array<WorktreeSession & { diskUsage: string }>
  totalDiskUsage: string
} {
  const registry = loadRegistry()
  let totalBytes = 0
  
  const sessions = registry.sessions.map(session => {
    // Check if worktree still exists
    const exists = existsSync(session.worktreePath)
    const diskBytes = exists ? getDiskUsage(session.worktreePath) : 0
    totalBytes += diskBytes
    
    return {
      ...session,
      status: exists ? session.status : 'orphaned' as const,
      diskUsage: formatBytes(diskBytes)
    }
  })
  
  return {
    sessions,
    totalDiskUsage: formatBytes(totalBytes)
  }
}

/**
 * Get a specific session by ID
 */
export function getWorktreeSession(sessionId: string): WorktreeSession | null {
  const registry = loadRegistry()
  return registry.sessions.find(s => s.id === sessionId) || null
}

/**
 * Update session last accessed time
 */
export function touchWorktreeSession(sessionId: string): void {
  const registry = loadRegistry()
  const session = registry.sessions.find(s => s.id === sessionId)
  if (session) {
    session.lastAccessedAt = new Date().toISOString()
    saveRegistry(registry)
  }
}

/**
 * Find session by repo and branch
 */
export function findWorktreeSession(repoPath: string, branch: string): WorktreeSession | null {
  const sessionId = generateSessionId(repoPath, branch)
  return getWorktreeSession(sessionId)
}

/**
 * Prune orphaned and stale sessions
 */
export async function pruneWorktreeSessions(options?: { 
  dryRun?: boolean
  maxAgeDays?: number 
}): Promise<{
  pruned: string[]
  errors: Array<{ sessionId: string; error: string }>
}> {
  const config = loadConfig()
  const maxAgeDays = options?.maxAgeDays ?? config.pruneAfterDays
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays)
  
  const registry = loadRegistry()
  const pruned: string[] = []
  const errors: Array<{ sessionId: string; error: string }> = []
  
  for (const session of registry.sessions) {
    const shouldPrune = 
      !existsSync(session.worktreePath) || // Orphaned
      new Date(session.lastAccessedAt) < cutoffDate // Stale
    
    if (shouldPrune) {
      if (options?.dryRun) {
        pruned.push(session.id)
      } else {
        const result = await removeWorktreeSession(session.id, { force: true })
        if (result.success) {
          pruned.push(session.id)
        } else {
          errors.push({ sessionId: session.id, error: result.error || 'Unknown error' })
        }
      }
    }
  }
  
  // Also run git worktree prune to clean up stale references
  if (!options?.dryRun) {
    try {
      // Get all unique repo paths
      const repoPaths = [...new Set(registry.sessions.map(s => s.repoPath))]
      for (const repoPath of repoPaths) {
        if (existsSync(repoPath)) {
          await execAsync('git worktree prune', { cwd: repoPath })
        }
      }
    } catch (error) {
      console.warn('git worktree prune failed:', error)
    }
  }
  
  return { pruned, errors }
}

/**
 * Switch to a worktree session (update its status)
 */
export function switchToWorktreeSession(sessionId: string): WorktreeSession | null {
  const registry = loadRegistry()
  const session = registry.sessions.find(s => s.id === sessionId)
  
  if (!session || !existsSync(session.worktreePath)) {
    return null
  }
  
  session.status = 'active'
  session.lastAccessedAt = new Date().toISOString()
  session.pid = process.pid
  saveRegistry(registry)
  
  return session
}

/**
 * Check for orphaned sessions (crashed without cleanup)
 */
export function checkOrphanedSessions(): WorktreeSession[] {
  const registry = loadRegistry()
  const orphaned: WorktreeSession[] = []
  
  for (const session of registry.sessions) {
    if (!existsSync(session.worktreePath)) {
      orphaned.push({ ...session, status: 'orphaned' })
    }
  }
  
  return orphaned
}

/**
 * Recover an orphaned session (if worktree still exists)
 */
export async function recoverWorktreeSession(sessionId: string): Promise<{
  success: boolean
  session?: WorktreeSession
  error?: string
}> {
  const registry = loadRegistry()
  const session = registry.sessions.find(s => s.id === sessionId)
  
  if (!session) {
    return { success: false, error: `Session not found: ${sessionId}` }
  }
  
  if (!existsSync(session.worktreePath)) {
    return { success: false, error: `Worktree no longer exists: ${session.worktreePath}` }
  }
  
  // Update session to active
  session.status = 'active'
  session.lastAccessedAt = new Date().toISOString()
  session.pid = process.pid
  saveRegistry(registry)
  
  return { success: true, session }
}

/**
 * Check if worktree sessions are enabled
 */
export function isWorktreeEnabled(): boolean {
  // Feature is available if git supports it
  return true  // Will check git version on actual operations
}

/**
 * Get worktree config
 */
export function getWorktreeConfig(): WorktreeConfig {
  return loadConfig()
}

/**
 * Update worktree config
 */
export function updateWorktreeConfig(updates: Partial<WorktreeConfig>): void {
  saveConfig(updates)
}

/**
 * Parse a GitHub issue URL and extract owner, repo, and issue number
 */
function parseGitHubIssueUrl(url: string): { owner: string; repo: string; issueNumber: number } | null {
  // Match patterns like:
  // https://github.com/owner/repo/issues/123
  // github.com/owner/repo/issues/123
  const match = url.match(/(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/)
  if (!match) return null
  
  return {
    owner: match[1],
    repo: match[2],
    issueNumber: parseInt(match[3], 10)
  }
}

/**
 * Generate a branch name from issue title
 */
function generateBranchFromTitle(issueNumber: number, title: string): string {
  // Clean and format the title for a branch name
  const cleaned = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')  // Remove special chars
    .replace(/\s+/g, '-')          // Replace spaces with hyphens
    .replace(/-+/g, '-')           // Collapse multiple hyphens
    .replace(/^-|-$/g, '')         // Trim leading/trailing hyphens
    .substring(0, 50)              // Limit length
  
  return `feature/${issueNumber}-${cleaned}`
}

/**
 * Fetch GitHub issue details and generate a branch name
 */
export async function fetchGitHubIssue(issueUrl: string): Promise<{
  success: boolean
  issue?: GitHubIssue
  suggestedBranch?: string
  error?: string
}> {
  const parsed = parseGitHubIssueUrl(issueUrl)
  if (!parsed) {
    return { success: false, error: 'Invalid GitHub issue URL. Expected format: https://github.com/owner/repo/issues/123' }
  }
  
  const { owner, repo, issueNumber } = parsed
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`
  
  return new Promise((resolve) => {
    const request = net.request({
      method: 'GET',
      url: apiUrl
    })
    
    request.setHeader('Accept', 'application/vnd.github.v3+json')
    request.setHeader('User-Agent', 'Copilot-UI')
    
    let responseBody = ''
    
    request.on('response', (response) => {
      if (response.statusCode === 404) {
        resolve({ success: false, error: 'Issue not found. Check the URL and ensure the repository is public.' })
        return
      }
      
      if (response.statusCode !== 200) {
        resolve({ success: false, error: `GitHub API error: ${response.statusCode}` })
        return
      }
      
      response.on('data', (chunk) => {
        responseBody += chunk.toString()
      })
      
      response.on('end', () => {
        try {
          const issue = JSON.parse(responseBody) as GitHubIssue
          const suggestedBranch = generateBranchFromTitle(issue.number, issue.title)
          resolve({ success: true, issue, suggestedBranch })
        } catch (err) {
          resolve({ success: false, error: 'Failed to parse GitHub response' })
        }
      })
    })
    
    request.on('error', (error) => {
      resolve({ success: false, error: `Network error: ${error.message}` })
    })
    
    request.end()
  })
}
