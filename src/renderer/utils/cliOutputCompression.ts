/**
 * Utilities for compressing CLI output before sending to agent
 */

/** Threshold for considering output as "long" and showing shrink options */
export const LONG_OUTPUT_LINE_THRESHOLD = 100;

/** Default number of lines to keep when truncating */
export const DEFAULT_LAST_LINES_COUNT = 50;

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
  let result = output;

  // Apply smart compression first (before truncation) to preserve context
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
