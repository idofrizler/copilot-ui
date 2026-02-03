// Commands that should include their subcommand for granular permission control
const SUBCOMMAND_EXECUTABLES = ['git', 'npm', 'yarn', 'pnpm', 'docker', 'kubectl', 'gh']

// Shell builtins that are not real executables and should be skipped
// These are commonly used in patterns like `|| true` or `&& false` and don't need permission
const SHELL_BUILTINS_TO_SKIP = ['true', 'false']

// Shell keywords that are part of control flow syntax, not executables
const SHELL_KEYWORDS_TO_SKIP = ['for', 'in', 'do', 'done', 'while', 'until', 'if', 'then', 'else', 'elif', 'fi', 'case', 'esac', 'select']

// Common flags that take an argument value (the value should not be treated as a command)
// Format: both short and long forms where applicable
const FLAGS_WITH_ARGUMENTS = new Set([
  // HTTP/curl flags
  '-X', '--request',     // HTTP method (GET, POST, PUT, etc.)
  '-H', '--header',      // HTTP header
  '-d', '--data',        // POST data
  '-o', '--output',      // Output file/format
  '-u', '--user',        // Username
  '-T', '--upload-file', // Upload file
  '-A', '--user-agent',  // User agent
  '-e', '--referer',     // Referer
  '-b', '--cookie',      // Cookie
  '-c', '--cookie-jar',  // Cookie jar file
  '-F', '--form',        // Form data
  // Azure CLI flags
  '--name',
  '--resource-group', '-g',
  '--subscription', '-s',
  '--location', '-l',
  '--query',
  '--sku',
  '--image',
  '--size',
  // Docker flags
  '--network',
  '--volume', '-v',
  '--env', '-e',
  '--publish', '-p',
  '--workdir', '-w',
  '--entrypoint',
  // Git flags
  '-m', '--message',
  '-b', '--branch',
  '-C',                  // Change directory
  // kubectl flags
  '-n', '--namespace',
  '-f', '--filename',
  '--context',
  // General flags
  '-t', '--tag',
  '-i', '--input',
  '--type',
  '--format',
  '--filter',
])

// Destructive executables that should NEVER be auto-approved.
// These commands can delete files/data and require explicit user permission every time.
// Issue #65: Protect against accidental deletions
const DESTRUCTIVE_EXECUTABLES = new Set([
  // File deletion commands
  'rm',
  'rmdir',
  'unlink',
  'shred',
  // find with -delete action
  'find -delete',
  // Dangerous disk/partition commands
  'dd',
  'mkfs',
  'fdisk',
  'parted',
  // Git destructive commands (force push, reset, clean)
  'git reset',
  'git clean',
  'git push --force',
  'git push -f',
])

/**
 * Extract all executables from a shell command.
 * Handles heredocs, string literals, redirections, and common shell patterns.
 */
export function extractExecutables(command: string): string[] {
  const executables: string[] = []
  
  // Remove heredocs first (<<'MARKER' ... MARKER or <<MARKER ... MARKER)
  // The regex handles: << 'EOF', <<'EOF', <<"EOF", <<EOF, and trailing spaces after closing marker
  // Uses lookahead (?=\n|$) to preserve newline after marker for proper command separation
  let cleaned = command.replace(/<<\s*['"]?(\w+)['"]?[\s\S]*?\n\1\s*(?=\n|$)/g, '')
  
  // Also handle heredocs that might not have closing marker in view
  cleaned = cleaned.replace(/<<\s*['"]?\w+['"]?[\s\S]*$/g, '')
  
  // Remove string literals to avoid false positives
  cleaned = cleaned
    .replace(/"[^"]*"/g, '""')
    .replace(/'[^']*'/g, "''")
    .replace(/`[^`]*`/g, '``')
  
  // Remove shell comments (# to end of line)
  // This prevents words in comments from being detected as commands
  cleaned = cleaned.replace(/#[^\n]*/g, '')
  
  // Remove shell redirections like 2>&1, >&2, 2>/dev/null, etc.
  cleaned = cleaned.replace(/\d*>&?\d+/g, '')      // 2>&1, >&1, 1>&2
  cleaned = cleaned.replace(/\d+>>\S+/g, '')       // 2>>/dev/null
  cleaned = cleaned.replace(/\d+>\S+/g, '')        // 2>/dev/null
  
  // Split on shell operators, separators, and newlines
  const segments = cleaned.split(/[;&|\n]+/)
  
  for (const segment of segments) {
    const trimmed = segment.trim()
    if (!trimmed) continue
    
    // Skip if it looks like a heredoc marker line
    if (/^[A-Z]+$/.test(trimmed)) continue
    
    // Get first word of segment
    const parts = trimmed.split(/\s+/)
    const prefixes = ['sudo', 'env', 'nohup', 'nice', 'time', 'command']
    
    let foundExec: string | null = null
    let subcommand: string | null = null
    let skipNextAsLoopVar = false
    let inForValueList = false  // Track when we're in the value list after "for VAR in"
    let skipNextAsFlagArg = false  // Track when next token is a flag's argument
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      
      // If we're in a "for VAR in VALUE_LIST" context, skip until we hit 'do' or find the executable
      if (inForValueList) {
        if (part === 'do') {
          inForValueList = false
        }
        continue
      }
      
      // Skip the argument value after a flag that takes arguments (e.g., -X POST, --name value)
      if (skipNextAsFlagArg) {
        skipNextAsFlagArg = false
        continue
      }
      
      // Skip environment variable assignments
      if (part.includes('=') && !part.startsWith('-')) continue
      
      // Check if this flag takes an argument - if so, skip the next token
      if (part.startsWith('-')) {
        if (FLAGS_WITH_ARGUMENTS.has(part)) {
          skipNextAsFlagArg = true
        }
        continue
      }
      
      // Skip common prefixes
      if (prefixes.includes(part)) continue
      // Skip shell builtins like 'true' and 'false' used in || true patterns
      if (SHELL_BUILTINS_TO_SKIP.includes(part)) continue
      // Skip shell keywords like 'for', 'in', 'do', 'done', etc.
      // Also track 'for' to skip the loop variable that follows
      if (SHELL_KEYWORDS_TO_SKIP.includes(part)) {
        if (part === 'for' || part === 'select') {
          skipNextAsLoopVar = true
        } else if (part === 'in' && skipNextAsLoopVar === false) {
          // 'in' after the loop variable means we're entering the value list
          // (skipNextAsLoopVar would have been consumed by the loop variable)
          inForValueList = true
        }
        continue
      }
      // Skip the loop variable after 'for' or 'select' keywords
      if (skipNextAsLoopVar) {
        skipNextAsLoopVar = false
        continue
      }
      // Skip empty or punctuation
      if (!part || /^[<>|&;()]+$/.test(part)) continue
      // Skip redirection targets
      if (part.startsWith('>') || part.startsWith('<')) continue
      
      // Found potential executable - remove path prefix
      const exec = part.replace(/^.*\//, '')
      // Validate it looks like a command (alphanumeric, dashes, underscores)
      if (exec && /^[a-zA-Z0-9_-]+$/.test(exec)) {
        if (!foundExec) {
          foundExec = exec
          // Check if this needs subcommand handling
          if (SUBCOMMAND_EXECUTABLES.includes(exec)) {
            // Look for subcommand in next non-flag part, but respect flags that take arguments
            let skipNext = false
            for (let j = i + 1; j < parts.length; j++) {
              const nextPart = parts[j]
              if (skipNext) {
                skipNext = false
                continue
              }
              if (nextPart.startsWith('-')) {
                if (FLAGS_WITH_ARGUMENTS.has(nextPart)) {
                  skipNext = true
                }
                continue
              }
              if (nextPart.includes('=')) continue
              if (/^[a-zA-Z0-9_-]+$/.test(nextPart)) {
                subcommand = nextPart
                break
              }
              break // Stop if we hit something unexpected
            }
          }
        }
        break
      }
    }
    
    if (foundExec) {
      // Combine executable with subcommand for granular control
      const execId = subcommand ? `${foundExec} ${subcommand}` : foundExec
      if (!executables.includes(execId)) {
        executables.push(execId)
      }
    }
  }
  
  return executables
}

/**
 * Check if an executable identifier is destructive (can delete files/data).
 * Used to prevent auto-approval of dangerous commands.
 */
export function isDestructiveExecutable(executableId: string): boolean {
  // Direct match
  if (DESTRUCTIVE_EXECUTABLES.has(executableId)) {
    return true
  }
  // For 'find', check if it has -delete or -exec rm patterns
  if (executableId === 'find') {
    return false  // 'find' alone is safe, but 'find -delete' is checked separately
  }
  return false
}

/**
 * Check if a shell command contains any destructive operations.
 * Returns true if the command could delete files or destroy data.
 */
export function containsDestructiveCommand(command: string): boolean {
  const executables = extractExecutables(command)
  
  // Check if any executable is destructive
  for (const exec of executables) {
    if (isDestructiveExecutable(exec)) {
      return true
    }
  }
  
  // Special case: 'find' with -delete flag or -exec rm
  // We need to check the raw command since extractExecutables doesn't capture flags
  const commandLower = command.toLowerCase()
  if (commandLower.includes('find ') && 
      (commandLower.includes('-delete') || 
       commandLower.includes('-exec rm') ||
       commandLower.includes('-exec /bin/rm') ||
       commandLower.includes('-exec /usr/bin/rm'))) {
    return true
  }
  
  // Special case: xargs with rm (e.g., "ls | xargs rm")
  if (commandLower.includes('xargs rm') ||
      commandLower.includes('xargs /bin/rm') ||
      commandLower.includes('xargs /usr/bin/rm')) {
    return true
  }
  
  return false
}

/**
 * Get a list of destructive executables found in a command.
 * Used to display warnings to users about which commands are dangerous.
 */
export function getDestructiveExecutables(command: string): string[] {
  const executables = extractExecutables(command)
  const destructive: string[] = []
  
  for (const exec of executables) {
    if (isDestructiveExecutable(exec)) {
      destructive.push(exec)
    }
  }
  
  // Special case: find with -delete/-exec rm
  const commandLower = command.toLowerCase()
  if (commandLower.includes('find ') && 
      (commandLower.includes('-delete') || 
       commandLower.includes('-exec rm') ||
       commandLower.includes('-exec /bin/rm') ||
       commandLower.includes('-exec /usr/bin/rm'))) {
    if (!destructive.includes('find -delete')) {
      destructive.push('find -delete')
    }
  }
  
  // Special case: xargs with rm
  if (commandLower.includes('xargs rm') ||
      commandLower.includes('xargs /bin/rm') ||
      commandLower.includes('xargs /usr/bin/rm')) {
    if (!destructive.includes('xargs rm')) {
      destructive.push('xargs rm')
    }
  }
  
  return destructive
}

/**
 * Extract the file/directory paths that will be deleted by rm commands.
 * Handles rm, rmdir, unlink, and shred commands.
 * Returns an array of file paths that the command targets.
 */
export function extractFilesToDelete(command: string): string[] {
  const files: string[] = []
  
  // Split command by shell operators to handle chained commands
  const segments = command.split(/[;&|\n]+/)
  
  for (const segment of segments) {
    const trimmed = segment.trim()
    if (!trimmed) continue
    
    // Parse rm, rmdir, unlink, shred commands
    // Match patterns like: rm file, rm -rf dir, sudo rm file, etc.
    const rmMatch = trimmed.match(/(?:^|(?:sudo|env|nohup|nice|time|command)\s+)*(rm|rmdir|unlink|shred)(?:\s|$)(.*)/)
    if (!rmMatch) continue
    
    const args = rmMatch[2].trim()
    if (!args) continue
    
    // Parse the arguments, handling quoted strings and flags
    const tokens = tokenizeShellArgs(args)
    
    for (const token of tokens) {
      // Skip flags (anything starting with -)
      if (token.startsWith('-')) continue
      // Skip empty tokens
      if (!token.trim()) continue
      // This is a file/directory path
      files.push(token)
    }
  }
  
  return files
}

/**
 * Tokenize shell arguments, handling quoted strings.
 */
function tokenizeShellArgs(args: string): string[] {
  const tokens: string[] = []
  let current = ''
  let inSingleQuote = false
  let inDoubleQuote = false
  let escaped = false
  
  for (let i = 0; i < args.length; i++) {
    const char = args[i]
    
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    
    if (char === '\\' && !inSingleQuote) {
      escaped = true
      continue
    }
    
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
      continue
    }
    
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      continue
    }
    
    if (char === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    
    current += char
  }
  
  if (current) {
    tokens.push(current)
  }
  
  return tokens
}
