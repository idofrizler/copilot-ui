import { describe, it, expect } from 'vitest';

// Inline the function to test in isolation
function extractLastRunFromLine(text: string, startLine: number): string {
  const lines = text.split('\n');
  if (startLine >= 0 && startLine < lines.length) {
    let endLine = lines.length;

    // Exclude trailing empty lines
    while (endLine > startLine && lines[endLine - 1].trim() === '') {
      endLine--;
    }

    // Exclude the trailing prompt line (the shell waiting for next command)
    if (endLine > startLine + 1) {
      const commandLine = lines[startLine].trim();
      const lastLine = lines[endLine - 1].trim();

      // Check if the command line starts with the last line (meaning last line is just the prompt)
      if (commandLine.startsWith(lastLine) && lastLine.length < commandLine.length) {
        endLine--;
      }
    }

    return lines.slice(startLine, endLine).join('\n');
  }
  return text;
}

describe('extractLastRunFromLine - trailing prompt removal', () => {
  it('removes trailing prompt line when it matches the command prompt', () => {
    const input = [
      ' idofrizler@Mac  ~/bla  ls -la', // Line 0: command line
      'total 48', // Line 1: output
      'drwxr-xr-x@   5 idofrizler  staff    160 Feb  4 01:15 .',
      '-rw-r--r--@   1 idofrizler  staff   2448 Feb  4 01:11 post-interactive.js',
      ' idofrizler@Mac  ~/bla ', // Line 4: trailing prompt (should be removed)
    ].join('\n');

    const result = extractLastRunFromLine(input, 0);

    // Should NOT include the trailing prompt
    expect(result).not.toContain(' idofrizler@Mac  ~/bla \n');
    // Should include the command and output
    expect(result).toContain('ls -la');
    expect(result).toContain('total 48');
    expect(result).toContain('post-interactive.js');
  });

  it('keeps output when last line is NOT a prompt prefix', () => {
    const input = [
      ' user@host  ~/dir  echo hello',
      'hello',
      'some actual content', // Not a prompt
    ].join('\n');

    const result = extractLastRunFromLine(input, 0);

    expect(result).toContain('echo hello');
    expect(result).toContain('hello');
    expect(result).toContain('some actual content');
  });

  it('handles trailing empty lines before removing prompt', () => {
    const input = [
      ' user@host  ~/dir  ls',
      'file1.txt',
      'file2.txt',
      ' user@host  ~/dir ', // trailing prompt
      '', // empty line
      '', // empty line
    ].join('\n');

    const result = extractLastRunFromLine(input, 0);

    // Should remove both empty lines AND the trailing prompt
    expect(result).not.toContain(' user@host  ~/dir \n');
    expect(result.endsWith('file2.txt')).toBe(true);
  });

  it('handles command with no output', () => {
    const input = [
      ' user@host  ~/dir  true', // command that produces no output
      ' user@host  ~/dir ', // just the trailing prompt
    ].join('\n');

    const result = extractLastRunFromLine(input, 0);

    // Should just have the command line
    expect(result).toBe(' user@host  ~/dir  true');
  });

  it('works with simple prompts', () => {
    const input = ['$ git status', 'On branch main', 'nothing to commit', '$ '].join('\n');

    const result = extractLastRunFromLine(input, 0);

    expect(result).not.toContain('$ \n');
    expect(result).toContain('git status');
    expect(result).toContain('nothing to commit');
  });

  it('preserves output when prompt contains unique text', () => {
    const input = [
      'prompt> command here',
      'output line 1',
      'different text that is not a prompt',
    ].join('\n');

    const result = extractLastRunFromLine(input, 0);

    // All lines should be preserved since last line isn't a prompt prefix
    expect(result.split('\n').length).toBe(3);
  });

  it('returns original text if startLine is invalid', () => {
    const input = 'some text';
    expect(extractLastRunFromLine(input, -1)).toBe(input);
    expect(extractLastRunFromLine(input, 100)).toBe(input);
  });
});
