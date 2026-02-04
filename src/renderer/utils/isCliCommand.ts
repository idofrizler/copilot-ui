/**
 * Utility functions for detecting CLI commands in code blocks
 */

// Language classes that indicate shell/CLI commands
const CLI_LANGUAGE_CLASSES = [
  'language-bash',
  'language-sh',
  'language-shell',
  'language-zsh',
  'language-console',
  'language-terminal',
  'language-powershell',
  'language-cmd',
]

// Common CLI command prefixes
const CLI_PREFIXES = [
  // Package managers
  'npm', 'yarn', 'pnpm', 'bun', 'pip', 'pip3', 'pipx', 'poetry',
  'cargo', 'gem', 'bundle', 'composer', 'nuget', 'dotnet',
  'brew', 'apt', 'apt-get', 'dnf', 'yum', 'pacman', 'apk', 'choco', 'scoop', 'winget',
  
  // Version control
  'git', 'gh', 'svn', 'hg',
  
  // Build tools
  'make', 'cmake', 'gradle', 'mvn', 'ant', 'ninja',
  
  // Runtime commands
  'node', 'npx', 'deno', 'python', 'python3', 'ruby', 'perl', 'php',
  'java', 'javac', 'go', 'rustc', 'gcc', 'g++', 'clang',
  
  // Shell built-ins and common utils
  'cd', 'ls', 'dir', 'cat', 'echo', 'pwd', 'mkdir', 'rm', 'cp', 'mv',
  'touch', 'chmod', 'chown', 'grep', 'find', 'sed', 'awk', 'sort',
  'head', 'tail', 'less', 'more', 'wc', 'diff', 'which', 'whereis',
  'export', 'source', 'alias', 'unalias', 'env', 'set', 'unset',
  
  // Network tools
  'curl', 'wget', 'ssh', 'scp', 'rsync', 'ftp', 'sftp', 'ping', 'telnet', 'nc',
  
  // Container/Cloud tools
  'docker', 'docker-compose', 'podman', 'kubectl', 'helm', 'terraform',
  'aws', 'az', 'gcloud', 'vercel', 'netlify', 'heroku', 'fly', 'railway',
  
  // Testing/linting
  'jest', 'vitest', 'mocha', 'pytest', 'eslint', 'prettier', 'tsc',
  
  // Misc
  'sudo', 'su', 'man', 'clear', 'exit', 'history', 'kill', 'killall',
  'ps', 'top', 'htop', 'df', 'du', 'free', 'uname', 'whoami', 'date', 'time',
]

// Patterns that suggest this is code, not a CLI command
const CODE_PATTERNS = [
  // JavaScript/TypeScript
  /^(const|let|var|function|class|interface|type|enum|import|export|async|await)\s/,
  /^(if|else|for|while|switch|try|catch|finally|return|throw)\s*[({]/,
  /^\s*(public|private|protected|static|readonly)\s/,
  
  // Python
  /^(def|class|from|import|if|elif|else|for|while|try|except|finally|with|return|yield|raise|assert)\s/,
  
  // Generic assignment patterns (but allow export VAR=value which is shell)
  /^[a-zA-Z_][a-zA-Z0-9_]*\s*[+\-*/%]?=\s*[^=]/, // Assignments like x = 5, but not x == 5
  
  // Object/Array literals
  /^\s*[{[]/, 
  
  // Function calls that look like code (with dots or complex expressions)
  /^[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*\s*\(/,
  
  // Comments (code-style)
  /^(\/\/|\/\*|#!|"""|''')/,
  
  // HTML/JSX
  /^<[a-zA-Z]/,
]

/**
 * Check if a code block's language class indicates a CLI command
 */
export function hasCliLanguageClass(className?: string): boolean {
  if (!className) return false
  return CLI_LANGUAGE_CLASSES.some(cls => className.includes(cls))
}

/**
 * Check if text content looks like a CLI command based on heuristics
 * This is used for code blocks without a language class
 */
export function looksLikeCliCommand(text: string): boolean {
  const trimmed = text.trim()
  
  // Empty or very long content is probably not a simple CLI command
  if (!trimmed || trimmed.length > 500) return false
  
  // Multi-line handling: check if ALL non-empty lines look like commands
  const lines = trimmed.split('\n').filter(line => line.trim())
  
  // For multi-line content, all lines should look like commands
  if (lines.length > 1) {
    // If it has more than 10 lines, it's probably not a CLI command
    if (lines.length > 10) return false
    return lines.every(line => isLineCliCommand(line.trim()))
  }
  
  // Single line check
  return isLineCliCommand(trimmed)
}

/**
 * Check if a single line looks like a CLI command
 */
function isLineCliCommand(line: string): boolean {
  // Skip empty lines
  if (!line) return false
  
  // Check for env var assignment followed by command FIRST (e.g., NODE_ENV=production npm start)
  // This must come before CODE_PATTERNS check since it looks like an assignment
  if (/^[A-Z_][A-Z0-9_]*=\S+\s+[a-z]/.test(line)) {
    return true
  }
  
  // Skip lines that look like code
  for (const pattern of CODE_PATTERNS) {
    if (pattern.test(line)) return false
  }
  
  // Check for common CLI prefixes
  const firstWord = line.split(/\s+/)[0].replace(/^[$#>]\s*/, '') // Remove prompt chars
  
  // Handle commands with paths like ./script.sh or /usr/bin/node
  if (firstWord.startsWith('./') || firstWord.startsWith('/') || firstWord.startsWith('\\')) {
    return true
  }
  
  // Check if starts with a known CLI prefix
  const normalizedWord = firstWord.toLowerCase().replace(/\.exe$/i, '')
  if (CLI_PREFIXES.includes(normalizedWord)) {
    return true
  }
  
  // Check for shell operators that indicate CLI (pipes, redirects)
  if (/[|><&]/.test(line)) {
    return true
  }
  
  return false
}

/**
 * Determine if a code block should show the "Run in Terminal" button
 * 
 * @param className - The className from ReactMarkdown (e.g., "language-bash")
 * @param textContent - The text content of the code block
 * @returns true if this appears to be a CLI command
 */
export function isCliCommand(className?: string, textContent?: string): boolean {
  // First check language class
  if (hasCliLanguageClass(className)) {
    return true
  }
  
  // If there's a language class but it's not CLI-related, don't show run button
  if (className?.includes('language-')) {
    return false
  }
  
  // For blocks without language class, use heuristics
  if (textContent) {
    return looksLikeCliCommand(textContent)
  }
  
  return false
}
