import { describe, it, expect } from 'vitest';
import {
  truncateToLastLines,
  smartCompress,
  compressOutput,
  countLines,
  extractLastRun,
  stripAnsiCodes,
  LONG_OUTPUT_LINE_THRESHOLD,
  DEFAULT_LAST_LINES_COUNT,
} from '../../src/renderer/utils/cliOutputCompression';

describe('CLI Output Compression Utilities', () => {
  describe('stripAnsiCodes', () => {
    it('should strip OSC sequences (window title, etc)', () => {
      const input = '\x1b]2;Window Title\x07Some text';
      const result = stripAnsiCodes(input);
      expect(result).toBe('Some text');
    });

    it('should strip CSI sequences (colors, cursor)', () => {
      const input = '\x1b[32mGreen text\x1b[0m';
      const result = stripAnsiCodes(input);
      expect(result).toBe('Green text');
    });

    it('should strip DEC private mode sequences', () => {
      const input = 'text[?2004hmore[?2004l';
      const result = stripAnsiCodes(input);
      expect(result).toBe('textmore');
    });

    it('should handle real terminal output with escape sequences', () => {
      const input = `%
]2;user@Mac:~/dir]1;~/dir]7;file://Mac/Users/user/dir\\
 user@Mac  ~/dir  [?1h=[?2004hls -la[?1l>[?2004l
total 8
-rw-r--r--  1 user  staff  100 Jan  1 00:00 file.txt
%`;
      const result = stripAnsiCodes(input);
      expect(result).toContain('ls -la');
      expect(result).toContain('file.txt');
      expect(result).not.toContain('[?2004h');
      expect(result).not.toContain(']2;');
    });

    it('should collapse multiple empty lines', () => {
      const input = 'line1\n\n\n\nline2';
      const result = stripAnsiCodes(input);
      expect(result).toBe('line1\n\nline2');
    });

    it('should preserve normal text', () => {
      const input = 'Normal text\nWith multiple lines';
      const result = stripAnsiCodes(input);
      expect(result).toBe(input);
    });
  });

  describe('countLines', () => {
    it('should count lines correctly', () => {
      expect(countLines('one')).toBe(1);
      expect(countLines('one\ntwo')).toBe(2);
      expect(countLines('one\ntwo\nthree')).toBe(3);
      expect(countLines('')).toBe(1);
    });
  });

  describe('truncateToLastLines', () => {
    it('should return original if under limit', () => {
      const output = 'line1\nline2\nline3';
      expect(truncateToLastLines(output, 10)).toBe(output);
    });

    it('should truncate to last N lines', () => {
      const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`);
      const output = lines.join('\n');
      const result = truncateToLastLines(output, 5);

      // With 20 lines truncated to 5, we get 1 truncation message + 4 content lines = 5 total
      expect(result).toContain('[... 16 lines truncated ...]');
      expect(result).toContain('line17');
      expect(result).toContain('line20');
      expect(result).not.toContain('line16');
      // Verify total line count is exactly 5
      expect(countLines(result)).toBe(5);
    });

    it('should handle exactly the limit', () => {
      const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`);
      const output = lines.join('\n');
      expect(truncateToLastLines(output, 10)).toBe(output);
    });
  });

  describe('smartCompress', () => {
    it('should replace base64-like strings', () => {
      const base64 = 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY3ODkwYWJjZGVmZ2hpamtsbW5vcA==';
      const output = `Some text ${base64} more text`;
      const result = smartCompress(output);

      expect(result).toContain('[BASE64_STRING:');
      expect(result).toContain('chars]');
      expect(result).not.toContain(base64);
    });

    it('should replace long hex strings', () => {
      const hex = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6';
      const output = `Hash: ${hex} is the result`;
      const result = smartCompress(output);

      expect(result).toContain('[HEX:');
      expect(result).toContain('chars]');
    });

    it('should compress very long unbroken strings', () => {
      // Use a long string that won't match base64 or hex patterns
      const longString =
        'file/path/to/some/very/long/directory/structure/that/keeps/going/on/and/on';
      const output = `Path: ${longString} end`;
      const result = smartCompress(output);

      // Long strings may get compressed in different ways
      expect(result.length).toBeLessThanOrEqual(output.length);
    });

    it('should collapse repeated similar lines', () => {
      const lines = [
        'Processing item 1...',
        'Processing item 2...',
        'Processing item 3...',
        'Processing item 4...',
        'Processing item 5...',
        'Done!',
      ];
      const output = lines.join('\n');
      const result = smartCompress(output);

      expect(result).toContain('[... ');
      expect(result).toContain('similar lines omitted ...]');
    });

    it('should not collapse if less than 3 repeats', () => {
      const lines = ['Step 1', 'Step 2', 'Done!'];
      const output = lines.join('\n');
      const result = smartCompress(output);

      expect(result).not.toContain('similar lines omitted');
    });

    it('should preserve normal text', () => {
      const output = 'This is normal output\nWith multiple lines\nAnd no long strings';
      const result = smartCompress(output);

      expect(result).toBe(output);
    });
  });

  describe('compressOutput', () => {
    it('should apply only truncation', () => {
      const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`);
      const output = lines.join('\n');
      const result = compressOutput(output, { truncateLines: 5 });

      expect(result).toContain('[... 16 lines truncated ...]');
    });

    it('should apply only smart compression', () => {
      const hex = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6';
      const output = `Hash: ${hex}`;
      const result = compressOutput(output, { smartCompress: true });

      expect(result).toContain('[HEX:');
    });

    it('should apply both options', () => {
      // Create lines that are completely different to avoid similarity collapse
      const lines = [
        'First line with hex: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
        'Error: something went wrong',
        'Warning: check your inputs',
        'Info: loading data',
        'Debug: value is 42',
        'Success: operation completed',
        'line7: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
        'Goodbye!',
        'The end',
        'Final line with hex: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
      ];
      const output = lines.join('\n');
      const result = compressOutput(output, { truncateLines: 5, smartCompress: true });

      // Should contain truncation notice
      expect(result).toContain('[...');
      expect(result).toContain('lines truncated');
      // Should also have HEX compression
      expect(result).toContain('[HEX:');
    });

    it('should handle null truncateLines', () => {
      const output = 'line1\nline2\nline3';
      const result = compressOutput(output, { truncateLines: null });

      expect(result).toBe(output);
    });
  });

  describe('constants', () => {
    it('should have correct threshold value', () => {
      expect(LONG_OUTPUT_LINE_THRESHOLD).toBe(100);
    });

    it('should have correct default lines count', () => {
      expect(DEFAULT_LAST_LINES_COUNT).toBe(50);
    });
  });

  describe('extractLastRun', () => {
    it('should extract last command with $ prompt', () => {
      const output = [
        'user@host:~$ ls -la',
        'total 8',
        'drwxr-xr-x  2 user user 4096 Jan  1 00:00 .',
        'drwxr-xr-x 10 user user 4096 Jan  1 00:00 ..',
        'user@host:~$ echo hello',
        'hello',
        'user@host:~$',
      ].join('\n');

      const result = extractLastRun(output);
      expect(result).toContain('echo hello');
      expect(result).toContain('hello');
      expect(result).not.toContain('ls -la');
      expect(result).not.toContain('total 8');
    });

    it('should extract last command with % prompt (zsh)', () => {
      const output = ['% cd /tmp', '% npm install', 'added 50 packages', 'done', '%'].join('\n');

      const result = extractLastRun(output);
      expect(result).toContain('npm install');
      expect(result).toContain('added 50 packages');
      expect(result).not.toContain('cd /tmp');
    });

    it('should extract last command with # prompt (root)', () => {
      const output = [
        '# apt update',
        'Hit:1 http://archive.ubuntu.com/ubuntu focal InRelease',
        '# apt install vim',
        'Reading package lists...',
        '#',
      ].join('\n');

      const result = extractLastRun(output);
      expect(result).toContain('apt install vim');
      expect(result).toContain('Reading package lists');
      expect(result).not.toContain('apt update');
    });

    it('should handle PowerShell prompt', () => {
      const output = [
        'PS C:\\Users\\dev> dir',
        'Directory: C:\\Users\\dev',
        'PS C:\\Users\\dev> npm test',
        'All tests passed',
        'PS C:\\Users\\dev>',
      ].join('\n');

      const result = extractLastRun(output);
      expect(result).toContain('npm test');
      expect(result).toContain('All tests passed');
      expect(result).not.toContain('dir');
    });

    it('should return whole output if no prompt found', () => {
      const output = 'line1\nline2\nline3';
      const result = extractLastRun(output);
      expect(result).toBe(output);
    });

    it('should handle output ending with empty line after prompt', () => {
      const output = [
        'user@host:~$ first command',
        'output1',
        'user@host:~$ second command',
        'output2',
        'user@host:~$',
        '',
      ].join('\n');

      const result = extractLastRun(output);
      expect(result).toContain('second command');
      expect(result).toContain('output2');
      expect(result).not.toContain('first command');
    });

    it('should handle simple > prompt', () => {
      const output = [
        '> node index.js',
        'Server started',
        '> npm test',
        'All tests pass',
        '>',
      ].join('\n');

      const result = extractLastRun(output);
      expect(result).toContain('npm test');
      expect(result).toContain('All tests pass');
      expect(result).not.toContain('node index.js');
    });

    it('should handle powerline/oh-my-zsh style prompts (symbol at end)', () => {
      const output = [
        ' user@Mac  ~/project  % first-command',
        'output of first',
        ' user@Mac  ~/project  % ls -la',
        'total 48',
        'drwxr-xr-x   5 user  staff   160 Feb  4 01:15 .',
        ' user@Mac  ~/project  %',
      ].join('\n');

      const result = extractLastRun(output);
      expect(result).toContain('ls -la');
      expect(result).toContain('total 48');
      expect(result).not.toContain('first-command');
      expect(result).not.toContain('output of first');
    });
  });
});
