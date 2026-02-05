/**
 * Utilities for compressing CLI output before sending to agent
 */

/** Threshold for considering output as "long" and showing shrink options */
export const LONG_OUTPUT_LINE_THRESHOLD = 100;

/** Default number of lines to keep when truncating */
export const DEFAULT_LAST_LINES_COUNT = 50;

/**
 * Strip ANSI escape sequences and terminal control codes from output.
 * Removes:
 * - CSI sequences: ESC [ ... (cursor movement, colors, etc.)
 * - OSC sequences: ESC ] ... ST (window title, working directory, etc.)
 * - DEC private modes: ESC [ ? ... h/l
 * - Other escape sequences
 * Also cleans up formatting artifacts from terminal rendering.
 */
export function stripAnsiCodes(output: string): string {
  let result = output;

  // Remove OSC sequences: ESC ] ... (terminated by BEL \x07 or ST \x1b\\)
  // These set window title, icon, working directory, etc.
  result = result.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g, '');
  // Also handle bare ] sequences without ESC (sometimes terminals emit these)
  result = result.replace(/\](?:\d+;[^\x07\n]*\x07?|\d+;[^\n]*)/g, '');

  // Remove CSI sequences: ESC [ ... ending with a letter
  // Includes colors, cursor movement, DEC private modes, etc.
  result = result.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
  // Also handle bare [ sequences (xterm-style without ESC prefix in some contexts)
  result = result.replace(/\[\?[0-9]+[hl](?:=)?/g, '');

  // Remove any remaining ESC sequences
  result = result.replace(/\x1b[^[\]]/g, '');

  // Remove carriage returns (often used with progress bars)
  result = result.replace(/\r(?!\n)/g, '');

  // Process lines for better formatting
  result = result
    .split('\n')
    .map((line) => {
      // Trim trailing whitespace from each line
      line = line.trimEnd();

      // If line is only whitespace now, make it empty
      if (/^\s*$/.test(line)) return '';

      // Only collapse very long runs of spaces (20+) which are cursor positioning artifacts
      // Preserve normal spacing for column alignment (like ls -la output)
      line = line.replace(/ {20,}/g, '  ');

      // Trim leading whitespace if the line starts with excessive spaces (>20)
      // This handles prompts that were positioned with cursor movement
      if (/^ {20,}/.test(line)) {
        line = line.trimStart();
      }

      return line;
    })
    .join('\n');

  // Collapse multiple consecutive empty lines into one
  result = result.replace(/\n{3,}/g, '\n\n');

  // Trim leading/trailing whitespace
  result = result.trim();

  return result;
}

/**
 * Truncates output to keep only the last N lines
 */
export function truncateToLastLines(output: string, lineCount: number): string {
  const lines = output.split('\n');
  if (lines.length <= lineCount) {
    return output;
  }
  // Take lineCount - 1 lines to account for the truncation message line
  const truncatedLines = lines.slice(-(lineCount - 1));
  return `[... ${lines.length - lineCount + 1} lines truncated ...]\n${truncatedLines.join('\n')}`;
}

/**
 * Smart compression: replaces very long strings with placeholders
 * Targets:
 * - Base64 strings (>50 chars of base64 characters)
 * - Long hex strings (>32 chars)
 * - Long unbroken strings without spaces (>100 chars)
 * - UUIDs and similar patterns
 */
export function smartCompress(output: string): string {
  let result = output;

  // Replace base64-like strings (long strings of alphanumeric + /+=)
  // Matches strings that look like base64 (>50 chars, no spaces, base64 charset)
  result = result.replace(/[A-Za-z0-9+/=]{50,}/g, (match) => {
    return `[BASE64_STRING:${match.length}chars]`;
  });

  // Replace long hex strings (32+ chars of hex)
  result = result.replace(/\b[0-9a-fA-F]{32,}\b/g, (match) => {
    return `[HEX:${match.length}chars]`;
  });

  // Replace very long unbroken strings (no whitespace, >80 chars)
  // This catches things like long URLs, paths, or other encoded data
  result = result.replace(/\S{80,}/g, (match) => {
    // Don't double-replace already compressed strings
    if (match.startsWith('[') && match.endsWith(']')) {
      return match;
    }
    // Keep first and last 20 chars for context
    const prefix = match.slice(0, 20);
    const suffix = match.slice(-20);
    return `${prefix}...[${match.length - 40}chars]...${suffix}`;
  });

  // Collapse repeated lines (like progress bars or repeated log patterns)
  const lines = result.split('\n');
  const collapsedLines: string[] = [];
  let lastLine = '';
  let repeatCount = 0;

  for (const line of lines) {
    // Normalize for comparison (trim and remove numbers/timestamps)
    const normalizedLine = line
      .trim()
      .replace(/\d+/g, 'N')
      .replace(/\d{2}:\d{2}:\d{2}/g, 'TIME');
    const normalizedLast = lastLine
      .trim()
      .replace(/\d+/g, 'N')
      .replace(/\d{2}:\d{2}:\d{2}/g, 'TIME');

    if (normalizedLine === normalizedLast && normalizedLine.length > 0) {
      repeatCount++;
    } else {
      if (repeatCount > 2) {
        collapsedLines.push(`[... ${repeatCount} similar lines omitted ...]`);
      } else if (repeatCount > 0) {
        // Add the repeated lines if there are only 1-2
        for (let i = 0; i < repeatCount; i++) {
          collapsedLines.push(lastLine);
        }
      }
      collapsedLines.push(line);
      lastLine = line;
      repeatCount = 0;
    }
  }

  // Handle any trailing repeats
  if (repeatCount > 2) {
    collapsedLines.push(`[... ${repeatCount} similar lines omitted ...]`);
  } else if (repeatCount > 0) {
    for (let i = 0; i < repeatCount; i++) {
      collapsedLines.push(lastLine);
    }
  }

  return collapsedLines.join('\n');
}

/**
 * Apply selected compression options to output
 */
export function compressOutput(
  output: string,
  options: {
    truncateLines?: number | null;
    smartCompress?: boolean;
  }
): string {
  // Always strip ANSI escape codes first
  let result = stripAnsiCodes(output);

  // Apply smart compression (before truncation) to preserve context
  if (options.smartCompress) {
    result = smartCompress(result);
  }

  // Then truncate if requested
  if (options.truncateLines && options.truncateLines > 0) {
    result = truncateToLastLines(result, options.truncateLines);
  }

  return result;
}

/**
 * Count the number of lines in a string
 */
export function countLines(output: string): number {
  return (output.match(/\n/g) || []).length + 1;
}

/**
 * Extract only the last command run from terminal output.
 * Detects shell prompts to find command boundaries.
 * Supports various prompt styles including powerline/oh-my-zsh.
 */
export function extractLastRun(output: string): string {
  // Strip ANSI codes first for cleaner prompt detection
  const cleanOutput = stripAnsiCodes(output);
  const lines = cleanOutput.split('\n');

  // Common shell prompt patterns - detect lines that are prompts
  const promptPatterns = [
    // Traditional prompts with symbol at start
    /^[$%#>]\s/,
    /^[$%#>]\s*$/,
    // Symbol at end of prompt (powerline style)
    /[$%#>]\s*$/,
    /[$%#>]\s+\S/,
    // PowerShell
    /PS [A-Z]:\\[^>]*>/,
    // user@host pattern (common in zsh/bash prompts) - matches "user@host ~/path" or "user@host:/path"
    /^\s*\S+@\S+\s+[~\/]/,
    /^\s*\S+@\S+:[~\/]/,
  ];

  const isPromptLine = (line: string): boolean => {
    return promptPatterns.some((pattern) => pattern.test(line));
  };

  // Find the last prompt line (which indicates start of last command)
  let lastPromptIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (isPromptLine(line)) {
      // Found a prompt - but we need to make sure there's content after it
      // If this is the very last line, it's just waiting for input, find previous prompt
      if (
        i === lines.length - 1 ||
        (i === lines.length - 2 && lines[lines.length - 1].trim() === '')
      ) {
        continue;
      }
      lastPromptIndex = i;
      break;
    }
  }

  // If no prompt found, return the whole output
  if (lastPromptIndex === -1) {
    return output;
  }

  // Extract from the prompt line to the end (but exclude trailing prompt-only lines)
  let endIndex = lines.length;
  // Check if the last lines are just prompts (no command after them)
  for (let i = lines.length - 1; i > lastPromptIndex; i--) {
    const line = lines[i];
    const trimmedLine = line.trim();
    // Skip empty lines and prompt-only lines (prompts without a command following on the same line)
    // A prompt-only line is one that matches prompt pattern but doesn't have much text after the user@host part
    if (trimmedLine === '') {
      endIndex = i;
    } else if (isPromptLine(line)) {
      // Check if this is just a prompt waiting for input (no command typed)
      // Prompt lines with commands have more content after the path
      // e.g., " idofrizler@Mac  ~/bla " is prompt-only, " idofrizler@Mac  ~/bla  ls -la" has command
      const parts = trimmedLine.split(/\s{2,}/); // Split on 2+ spaces
      // Prompt-only: " user@host  ~/path " splits into ["user@host", "~/path"]
      // With command: " user@host  ~/path  ls -la" splits into ["user@host", "~/path", "ls -la"]
      if (parts.length <= 2) {
        endIndex = i;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  const lastRunLines = lines.slice(lastPromptIndex, endIndex);
  return lastRunLines.join('\n').trim();
}
